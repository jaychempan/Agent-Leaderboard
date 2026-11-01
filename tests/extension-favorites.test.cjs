const {test} = require('node:test');
const assert = require('node:assert/strict');
const {start} = require('../src/extension-favorites.js');

const EXTENSION_ID = 'medjijlfgmfeldlelkidiickdcnbicaf';
const ALICE = {id: '101', login: 'alice', token: 'private-site-token', avatar_url: 'private-avatar-field'};
const BOB = {id: '202', login: 'bob'};
const challenge = {type: 'favorites:challenge', client_challenge: 'c'.repeat(43), client_state: 's'.repeat(43), expected_user_id: ALICE.id};
const settle = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return {promise, resolve, reject}; };
function event() {
  const listeners = new Set();
  return {listeners, addListener: value => listeners.add(value), removeListener: value => listeners.delete(value),
    emit: (...values) => { for (const listener of [...listeners]) listener(...values); }};
}
function clock() {
  let now = 0, next = 1;
  const jobs = new Map();
  const add = (fn, delay, interval = false) => { const id = next++; jobs.set(id, {fn, delay, at: now + delay, interval}); return id; };
  return {jobs, setTimeout: (fn, delay) => add(fn, delay), clearTimeout: id => jobs.delete(id),
    setInterval: (fn, delay) => add(fn, delay, true), clearInterval: id => jobs.delete(id),
    async advance(delay) {
      const target = now + delay;
      for (let count = 0; count < 1000; count++) {
        const pending = [...jobs].filter(([, value]) => value.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0]);
        if (!pending.length) break;
        const [id, value] = pending[0]; now = value.at;
        if (value.interval) value.at += value.delay; else jobs.delete(id);
        value.fn(); await settle();
      }
      now = target; await settle();
    }};
}
function fixture(settings = {}) {
  const timers = clock(), events = new Map(), ports = [], connections = [], requests = [];
  let active = settings.active !== false, current = {user: settings.user || ALICE, configured: true, status: 'synced',
    token: 'private-site-token', verifier: 'private-verifier', records: {secret: 'private-favorite'}};
  const target = {document: {visibilityState: 'visible'}, addEventListener(name, listener) {
    if (!events.has(name)) events.set(name, new Set()); events.get(name).add(listener);
  }, removeEventListener(name, listener) { events.get(name)?.delete(listener); },
  emit(name) { for (const listener of [...(events.get(name) || [])]) listener(); }};
  target.document.addEventListener = target.addEventListener.bind(target);
  target.document.removeEventListener = target.removeEventListener.bind(target);
  const chrome = {runtime: {connect(id, options) {
    connections.push({id, options});
    if (settings.failConnect) throw new Error('private-connect-details');
    const port = {name: options.name, onMessage: event(), onDisconnect: event(), messages: [], disconnected: false,
      postMessage(message) { if (port.disconnected) throw new Error('closed'); port.messages.push(structuredClone(message)); },
      disconnect() { if (port.disconnected) return; port.disconnected = true; port.onDisconnect.emit(); }};
    ports.push(port); return port;
  }}};
  const store = {getSnapshot: () => current, hasActiveSession: () => active,
    async connectExtension(input) {
      requests.push(structuredClone(input));
      if (settings.connectExtension) return settings.connectExtension(input);
      return {code: 'h'.repeat(43), state: input.client_state, expiresAt: new Date(Date.now() + 90000).toISOString(),
        token: 'private-site-token', verifier: 'private-verifier', arbitrary: 'private-upstream-details'};
    }};
  const bridge = start({store, chrome, eventTarget: target, document: target.document, location: {href: settings.href || 'https://agentskills.media/#skills'},
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, setInterval: timers.setInterval, clearInterval: timers.clearInterval});
  return {bridge, store, chrome, timers, events, target, ports, connections, requests,
    setActive(value) { active = value; }, setUser(value) { current = {...current, user: value}; },
    update() { bridge.update(current); }, current: () => current};
}

test('website bridge advertises only public identity and heartbeats only while authenticated', async t => {
  const f = fixture(); t.after(() => f.bridge.destroy());
  assert.deepEqual(f.connections, [{id: EXTENSION_ID, options: {name: 'favorites:website'}}]);
  assert.deepEqual(f.ports[0].messages[0], {type: 'favorites:ready', user: {id: ALICE.id, login: ALICE.login}});
  const before = f.ports[0].messages.length; await f.timers.advance(25000);
  assert.ok(f.ports[0].messages.length > before);
  f.setActive(false); f.update();
  assert.deepEqual(f.ports[0].messages.at(-1), {type: 'favorites:ready', user: null});
  const loggedOut = f.ports[0].messages.length; await f.timers.advance(50000);
  assert.equal(f.ports[0].messages.length, loggedOut);
  assert.doesNotMatch(JSON.stringify(f.ports[0].messages), /private-|token|verifier|records/);
});

test('website bridge exchanges only a matching PKCE request and never forwards a bearer or upstream fields', async t => {
  const f = fixture(); t.after(() => f.bridge.destroy());
  f.ports[0].onMessage.emit({...challenge, token: 'attacker-token', extension_id: 'another-extension'}); await settle();
  assert.deepEqual(f.requests, [{extension_id: EXTENSION_ID, client_challenge: challenge.client_challenge, client_state: challenge.client_state}]);
  assert.deepEqual(f.ports[0].messages.at(-1), {type: 'favorites:connect', code: 'h'.repeat(43), state: challenge.client_state});
  assert.doesNotMatch(JSON.stringify(f.ports[0].messages), /private-|attacker-token|expiresAt|verifier/);
});

test('wrong account, malformed proofs, and inactive authentication cannot request a handoff', async t => {
  const f = fixture(); t.after(() => f.bridge.destroy());
  for (const message of [{...challenge, expected_user_id: BOB.id}, {...challenge, client_challenge: 'short'},
    {...challenge, client_state: ['s'.repeat(43)]}, {...challenge, expected_user_id: 101}, {...challenge, type: 'favorites:arbitrary'}, null]) {
    f.ports[0].onMessage.emit(message); await settle();
  }
  assert.equal(f.requests.length, 0);
  f.setActive(false); f.ports[0].onMessage.emit(challenge); await settle();
  assert.equal(f.requests.length, 0);
  assert.ok(!f.ports[0].messages.some(value => value.type === 'favorites:connect'));
});

test('late grants after account changes or destroy never reach the extension', async t => {
  const held = deferred(), f = fixture({connectExtension: () => held.promise}); t.after(() => f.bridge.destroy());
  f.ports[0].onMessage.emit(challenge); await settle(); assert.equal(f.requests.length, 1);
  f.setUser(BOB); f.update(); held.resolve({code: 'h'.repeat(43), state: challenge.client_state}); await settle();
  assert.ok(!f.ports[0].messages.some(value => value.type === 'favorites:connect'));
  const late = deferred(), destroyed = fixture({connectExtension: () => late.promise});
  destroyed.ports[0].onMessage.emit(challenge); await settle(); destroyed.bridge.destroy();
  late.resolve({code: 'h'.repeat(43), state: challenge.client_state}); await settle();
  assert.ok(!destroyed.ports[0].messages.some(value => value.type === 'favorites:connect'));
});

test('duplicate challenges are coalesced and a disconnected port cannot deliver a late handoff', async t => {
  const held = deferred(), f = fixture({connectExtension: () => held.promise}); t.after(() => f.bridge.destroy());
  const original = f.ports[0]; original.onMessage.emit(challenge); original.onMessage.emit(challenge); await settle();
  assert.equal(f.requests.length, 1);
  original.disconnect(); await f.timers.advance(250); assert.equal(f.ports.length, 2);
  held.resolve({code: 'h'.repeat(43), state: challenge.client_state}); await settle();
  assert.ok(f.ports.every(port => !port.messages.some(value => value.type === 'favorites:connect')));
});

test('invalid or mismatched grant responses are not forwarded', async t => {
  for (const reply of [{code: ['h'.repeat(43)], state: challenge.client_state}, {code: 'h'.repeat(43), state: 'wrong'}]) {
    const f = fixture({connectExtension: async () => reply}); t.after(() => f.bridge.destroy());
    f.ports[0].onMessage.emit(challenge); await settle();
    assert.ok(!f.ports[0].messages.some(value => value.type === 'favorites:connect'));
    assert.equal(f.ports[0].messages.at(-1).type, 'favorites:unavailable');
  }
});

test('provider errors are fixed messages and do not expose exception text', async t => {
  const f = fixture({connectExtension: async () => { throw Object.assign(new Error('private-error-detail-with-token'), {code: 'private-provider-code'}); }});
  t.after(() => f.bridge.destroy());
  f.ports[0].onMessage.emit(challenge); await settle();
  assert.ok(f.ports[0].messages.some(value => value.type === 'favorites:unavailable'));
  assert.doesNotMatch(JSON.stringify(f.ports[0].messages), /private-|token|verifier/);
});

test('an authentication failure during a grant withdraws ready state and stops its heartbeat', async t => {
  const f = fixture({connectExtension: async () => {
    f.setActive(false); throw Object.assign(new Error('private-expired-token'), {code: 'authentication_required'});
  }}); t.after(() => f.bridge.destroy());
  f.ports[0].onMessage.emit(challenge); await settle();
  assert.ok(f.ports[0].messages.some(value => value.type === 'favorites:unavailable' && value.reason === 'not_signed_in'));
  assert.deepEqual(f.ports[0].messages.at(-1), {type: 'favorites:ready', user: null});
  assert.ok(![...f.timers.jobs.values()].some(value => value.interval));
});

test('port loss retries with bounded backoff and destroy removes timers and listeners', async () => {
  const f = fixture();
  f.ports[0].disconnect(); await f.timers.advance(249); assert.equal(f.connections.length, 1);
  await f.timers.advance(1); assert.equal(f.connections.length, 2);
  f.ports[1].disconnect();
  const retry = [...f.timers.jobs.values()].find(value => !value.interval);
  assert.ok(retry.delay > 250 && retry.delay <= 30000, 'repeated losses back off within the maximum');
  await f.timers.advance(retry.delay - 1); assert.equal(f.connections.length, 2);
  await f.timers.advance(1); assert.equal(f.connections.length, 3);
  f.bridge.destroy();
  assert.equal(f.timers.jobs.size, 0); assert.ok([...f.events.values()].every(value => value.size === 0));
  const before = f.connections.length; f.target.emit('focus'); f.target.emit('pageshow'); f.target.emit('visibilitychange'); await f.timers.advance(120000);
  assert.equal(f.connections.length, before); assert.ok(f.ports.at(-1).disconnected);
});

test('persistent connection failures cap retry delay at 30 seconds', async t => {
  const f = fixture({failConnect: true}); t.after(() => f.bridge.destroy());
  let previous = 0;
  for (let turn = 0; turn < 7; turn++) {
    const retry = [...f.timers.jobs.values()].find(value => !value.interval);
    assert.ok(retry); assert.ok(retry.delay >= previous && retry.delay <= 30000);
    if (!turn) assert.equal(retry.delay, 250);
    const before = f.connections.length; await f.timers.advance(retry.delay - 1); assert.equal(f.connections.length, before);
    await f.timers.advance(1); assert.equal(f.connections.length, before + 1); previous = retry.delay;
  }
  assert.equal(previous, 30000);
});

test('focus and pageshow recover the connection immediately without duplicate retries', async t => {
  const f = fixture(); t.after(() => f.bridge.destroy());
  f.ports[0].disconnect(); f.target.emit('focus'); assert.equal(f.ports.length, 2);
  await f.timers.advance(250); assert.equal(f.ports.length, 2);
  f.ports[1].disconnect(); f.target.emit('pageshow'); assert.equal(f.ports.length, 3);
});

test('returning to a visible website tab recovers a disconnected port', async t => {
  const f = fixture(); t.after(() => f.bridge.destroy());
  f.ports[0].disconnect(); f.target.document.visibilityState = 'hidden'; f.target.emit('visibilitychange'); assert.equal(f.ports.length, 1);
  f.target.document.visibilityState = 'visible'; f.target.emit('visibilitychange'); assert.equal(f.ports.length, 2);
  await f.timers.advance(1000); assert.equal(f.ports.length, 2, 'visibility recovery cancels the old retry');
});

test('pagehide pauses the bridge while pageshow restores a cached page', async t => {
  const f = fixture(); t.after(() => f.bridge.destroy());
  f.target.emit('pagehide'); assert.equal(f.ports[0].disconnected, true);
  assert.equal(f.timers.jobs.size, 0);
  const before = f.connections.length; await f.timers.advance(60000); assert.equal(f.connections.length, before);
  f.target.emit('pageshow'); assert.equal(f.connections.length, before + 1);
  assert.deepEqual(f.ports.at(-1).messages[0], {type: 'favorites:ready', user: {id: ALICE.id, login: ALICE.login}});
});

test('untrusted website origins never open an extension connection', () => {
  const f = fixture({href: 'https://evil.example/'});
  assert.equal(f.connections.length, 0); f.bridge.destroy(); assert.equal(f.timers.jobs.size, 0);
});

test('the website remains usable without Chrome extension messaging', () => {
  const timers = clock();
  const bridge = start({store: {hasActiveSession: () => true, getSnapshot: () => ({user: ALICE})}, chrome: {},
    location: 'https://agentskills.media/', setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
    setInterval: timers.setInterval, clearInterval: timers.clearInterval});
  assert.doesNotThrow(() => bridge.update({user: ALICE})); bridge.destroy(); assert.equal(timers.jobs.size, 0);
});
