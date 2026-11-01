const {test} = require('node:test');
const assert = require('node:assert/strict');
const {start} = require('../src/extension-favorites.js');
const ExtensionSync = require('../src/extension-sync.js');

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
  const timers = clock(), events = new Map(), ports = [], connections = [], requests = [], acknowledgements = [];
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
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, setInterval: timers.setInterval, clearInterval: timers.clearInterval,
    onConnected: (...values) => acknowledgements.push(structuredClone(values))});
  return {bridge, store, chrome, timers, events, target, ports, connections, requests, acknowledgements,
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

test('connection acknowledgement requires a delivered handoff and a strict successful matching state', async t => {
  const f = fixture(); t.after(() => f.bridge.destroy());
  const port = f.ports[0], acknowledged = {type: 'favorites:connected', state: challenge.client_state, connected: true};
  port.onMessage.emit(acknowledged); await settle();
  assert.equal(f.acknowledgements.length, 0, 'an unsolicited acknowledgement cannot report success');
  port.onMessage.emit(challenge); await settle();
  assert.equal(port.messages.at(-1).type, 'favorites:connect');
  for (const input of [null, {...acknowledged, type: 'favorites:other'}, {...acknowledged, state: 'x'.repeat(43)},
    {...acknowledged, state: [challenge.client_state]}, {...acknowledged, connected: false},
    {...acknowledged, connected: 'true'}, {...acknowledged, connected: 1}, {type: 'favorites:connected', state: challenge.client_state}]) {
    port.onMessage.emit(input); await settle();
    assert.equal(f.acknowledgements.length, 0, 'unknown, malformed, and failed acknowledgements cannot report success');
  }
  port.onMessage.emit(acknowledged); await settle();
  assert.equal(f.acknowledgements.length, 1);
  port.onMessage.emit(acknowledged); await settle();
  assert.equal(f.acknowledgements.length, 1, 'the same handoff is acknowledged only once');
  assert.doesNotMatch(JSON.stringify(f.acknowledgements), /private-|token|verifier|records/);
});

test('only the most recently delivered handoff state can acknowledge a connection', async t => {
  const f = fixture(); t.after(() => f.bridge.destroy());
  const port = f.ports[0], newer = {...challenge, client_state: 't'.repeat(43)};
  port.onMessage.emit(challenge); await settle();
  port.onMessage.emit(newer); await settle();
  assert.deepEqual(f.requests.map(value => value.client_state), [challenge.client_state, newer.client_state]);
  port.onMessage.emit({type: 'favorites:connected', state: challenge.client_state, connected: true}); await settle();
  assert.equal(f.acknowledgements.length, 0, 'a superseded handoff cannot set the page success state');
  port.onMessage.emit({type: 'favorites:connected', state: newer.client_state, connected: true}); await settle();
  assert.equal(f.acknowledgements.length, 1);
});

test('a failed handoff cannot later be reported as a successful connection', async t => {
  const f = fixture({connectExtension: async () => { throw new Error('private-provider-details'); }});
  t.after(() => f.bridge.destroy());
  f.ports[0].onMessage.emit(challenge); await settle();
  assert.equal(f.ports[0].messages.at(-1).type, 'favorites:unavailable');
  f.ports[0].onMessage.emit({type: 'favorites:connected', state: challenge.client_state, connected: true}); await settle();
  assert.equal(f.acknowledgements.length, 0);
});

test('a handoff acknowledgement cannot succeed after its website account changes or session expires', async t => {
  for (const change of [f => f.setUser(BOB), f => f.setActive(false)]) {
    const f = fixture(); t.after(() => f.bridge.destroy());
    f.ports[0].onMessage.emit(challenge); await settle();
    assert.equal(f.ports[0].messages.at(-1).type, 'favorites:connect');
    change(f);
    f.ports[0].onMessage.emit({type: 'favorites:connected', state: challenge.client_state, connected: true}); await settle();
    assert.equal(f.acknowledgements.length, 0, 'the current active identity must still own the delivered handoff');
  }
});

test('acknowledgements are bound to the current port and are discarded on disconnect or destroy', async t => {
  const f = fixture(); t.after(() => f.bridge.destroy());
  const old = f.ports[0]; old.onMessage.emit(challenge); await settle();
  old.disconnect(); await f.timers.advance(250);
  const current = f.ports[1], oldAck = {type: 'favorites:connected', state: challenge.client_state, connected: true};
  old.onMessage.emit(oldAck); current.onMessage.emit(oldAck); await settle();
  assert.equal(f.acknowledgements.length, 0, 'a disconnected handoff is not transferable to a replacement port');
  const newer = {...challenge, client_state: 't'.repeat(43)};
  current.onMessage.emit(newer); await settle();
  const newAck = {type: 'favorites:connected', state: newer.client_state, connected: true};
  old.onMessage.emit(newAck); await settle();
  assert.equal(f.acknowledgements.length, 0, 'a stale port cannot acknowledge a current handoff');
  current.onMessage.emit(newAck); await settle();
  assert.equal(f.acknowledgements.length, 1);
  const final = {...challenge, client_state: 'u'.repeat(43)};
  current.onMessage.emit(final); await settle(); f.bridge.destroy();
  current.onMessage.emit({type: 'favorites:connected', state: final.client_state, connected: true}); await settle();
  assert.equal(f.acknowledgements.length, 1, 'destroy drops a late acknowledgement');
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

const proofFragment = new URLSearchParams({extension_id: EXTENSION_ID,
  client_challenge: challenge.client_challenge, client_state: challenge.client_state}).toString();
const syncURL = 'https://agentskills.media/?extension_sync=1#' + proofFragment;
function mainSyncFixture(settings = {}) {
  const timers = clock(), messages = [], requests = [], changes = [];
  let active = settings.active !== false, current = {user: ALICE};
  const location = {href: settings.href || syncURL};
  const history = {replaceState(_state, _title, value) { location.href = value; }};
  let callback;
  const chrome = {runtime: {sendMessage(id, message, done) {
    messages.push({id, message: structuredClone(message), senderURL: location.href}); callback = done;
    if (settings.sendMessage) settings.sendMessage(done);
  }}};
  const store = {hasActiveSession: () => active, getSnapshot: () => current,
    async connectExtension(input) {
      requests.push(structuredClone(input));
      return settings.connectExtension ? settings.connectExtension(input)
        : {code: 'h'.repeat(43), state: input.client_state, token: 'private-site-token', verifier: 'private-verifier'};
    }};
  const sync = ExtensionSync.start({store, chrome, location, history,
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, onChange: value => changes.push(value)});
  return {sync, store, chrome, location, history, timers, messages, requests, changes,
    respond(value) { callback?.(value); }, setActive(value) { active = value; }, setUser(value) { current = {user: value}; }};
}

test('main-site extension entry requires its exact marker, origin, and one valid public proof', () => {
  assert.deepEqual(ExtensionSync.readRequest(syncURL), {active: true, request: {
    extension_id: EXTENSION_ID, client_challenge: challenge.client_challenge, client_state: challenge.client_state}});
  assert.equal(ExtensionSync.readRequest(syncURL.replace('/?', '/index.html?')).active, true);
  for (const href of [syncURL.replace('https:', 'http:'), syncURL.replace('agentskills.media', 'evil.example'),
    syncURL.replace('/?', '/extension/?'), syncURL.replace('extension_sync=1', 'extension_sync=1&extension_sync=1'),
    syncURL.replace('extension_sync=1', 'extension_sync=0'), syncURL.replace('?extension_sync=1', '')]) {
    assert.equal(ExtensionSync.readRequest(href).active, false);
  }
  for (const fragment of ['staleproof', proofFragment + '&client_state=' + challenge.client_state,
    proofFragment.replace(EXTENSION_ID, 'a'.repeat(32)), proofFragment.replace(challenge.client_challenge, 'short')]) {
    assert.deepEqual(ExtensionSync.readRequest('https://agentskills.media/?extension_sync=1#' + fragment), {active: true, request: null});
  }
});

test('legacy connect redirects in the same tab, preserving OAuth return and public proof without credentials', () => {
  const code = 'o'.repeat(43), state = 'p'.repeat(43);
  const legacy = `https://agentskills.media/extension/connect/?login_code=${code}&login_state=${state}&auth_error=access_denied#${proofFragment}`;
  const destination = new URL(ExtensionSync.legacyDestination(legacy));
  assert.equal(destination.origin, 'https://agentskills.media'); assert.equal(destination.pathname, '/');
  assert.equal(destination.searchParams.get('extension_sync'), '1');
  assert.equal(destination.searchParams.get('login_code'), code); assert.equal(destination.searchParams.get('login_state'), state);
  assert.equal(destination.searchParams.get('auth_error'), 'access_denied'); assert.equal(destination.hash, '#' + proofFragment);
  const {runInNewContext} = require('node:vm'), {readFileSync} = require('node:fs');
  const replacements = [];
  runInNewContext(readFileSync(require.resolve('../extension/connect/connect.js'), 'utf8'), {
    WebsiteExtensionSync: ExtensionSync, location: {href: legacy, replace: value => replacements.push(value)}});
  assert.deepEqual(replacements, [destination.href]);
  assert.equal(ExtensionSync.legacyDestination(legacy.replace('agentskills.media', 'evil.example')), null);
  assert.equal(ExtensionSync.legacyDestination(legacy.replace('/extension/connect/', '/')), null);
  assert.equal(new URL(ExtensionSync.legacyDestination('https://agentskills.media/extension/connect/#staleproof')).search, '?extension_sync=1');
  const safe = ExtensionSync.legacyDestination(legacy.replace('?login_code=', '?access_token=private-token&login_code=') + '&access_token=private-fragment');
  assert.doesNotMatch(safe, /private-token|private-fragment|access_token/);
  assert.equal(new URL(safe).searchParams.get('login_code'), code);
});

test('main Favorites entry waits for store initialization and sign-in, then sends only opaque handoff data', async t => {
  const f = mainSyncFixture({active: false}); t.after(() => f.sync.destroy());
  f.sync.update(); await settle(); assert.equal(f.requests.length, 0);
  f.sync.ready(); await settle(); assert.equal(f.sync.getSnapshot().status, 'sign_in'); assert.equal(f.requests.length, 0);
  f.setActive(true); f.sync.update(); await settle();
  assert.equal(f.sync.getSnapshot().status, 'connecting'); assert.equal(f.messages.length, 1);
  assert.deepEqual(f.requests, [{extension_id: EXTENSION_ID, client_challenge: challenge.client_challenge, client_state: challenge.client_state}]);
  assert.deepEqual(f.messages[0], {id: EXTENSION_ID, message: {type: 'favorites:connect', code: 'h'.repeat(43), state: challenge.client_state}, senderURL: syncURL});
  assert.equal(new URL(f.location.href).searchParams.get('extension_sync'), '1', 'native sender validation still sees the explicit marker');
  f.respond({ok: true, connected: true}); await settle();
  assert.deepEqual(f.sync.getSnapshot(), {active: true, status: 'connected', busy: false});
  assert.equal(f.location.href, 'https://agentskills.media/'); assert.equal(f.timers.jobs.size, 0);
  assert.doesNotMatch(JSON.stringify({messages: f.messages, changes: f.changes}), /private-|token|verifier/);
  f.sync.update(); f.sync.retry(); await settle(); assert.equal(f.requests.length, 1);
});

test('main entry restores its public proof before OAuth and preserves a later real board route after success', async t => {
  const f = mainSyncFixture({active: false}); t.after(() => f.sync.destroy());
  f.location.href = 'https://agentskills.media/?extension_sync=1#mcp'; f.sync.prepareSignIn();
  assert.equal(f.location.href, syncURL);
  f.setActive(true); f.sync.ready(); await settle();
  f.location.href = 'https://agentskills.media/?extension_sync=1#mcp';
  f.respond({ok: true, connected: true}); await settle();
  assert.equal(f.location.href, 'https://agentskills.media/#mcp');
});

test('invalid main proofs never mint a grant, but an authenticated passive bridge can complete the entry', async t => {
  const f = mainSyncFixture({href: 'https://agentskills.media/?extension_sync=1#staleproof'}); t.after(() => f.sync.destroy());
  f.sync.ready(); await settle(); assert.equal(f.sync.getSnapshot().status, 'invalid_request');
  assert.equal(f.requests.length, 0); f.sync.connected();
  assert.deepEqual(f.sync.getSnapshot(), {active: true, status: 'connected', busy: false});
  assert.equal(f.location.href, 'https://agentskills.media/');
});

test('passive connection success cancels a pending one-shot wait and wins over its late failure', async t => {
  const f = mainSyncFixture(); t.after(() => f.sync.destroy());
  f.sync.ready(); await settle(); assert.equal(f.messages.length, 1);
  f.sync.connected(); assert.deepEqual(f.sync.getSnapshot(), {active: true, status: 'connected', busy: false});
  assert.equal(f.timers.jobs.size, 0, 'successful passive sync immediately releases the old callback timeout');
  f.respond({ok: false, connected: false}); await settle();
  assert.deepEqual(f.sync.getSnapshot(), {active: true, status: 'connected', busy: false});
  assert.equal(f.location.href, 'https://agentskills.media/');
});

test('main entry never delivers late account grants, reports fixed failures, and cancels delivery on destroy', async t => {
  const held = deferred(), changed = mainSyncFixture({connectExtension: () => held.promise});
  t.after(() => changed.sync.destroy()); changed.sync.ready(); await settle(); changed.setUser(BOB);
  held.resolve({code: 'h'.repeat(43), state: challenge.client_state}); await settle();
  assert.equal(changed.messages.length, 0); assert.equal(changed.sync.getSnapshot().status, 'account_changed');
  const failing = mainSyncFixture({connectExtension: async () => { throw new Error('private-token-provider-detail'); }});
  t.after(() => failing.sync.destroy()); failing.sync.ready(); await settle();
  assert.equal(failing.sync.getSnapshot().status, 'connection_failed');
  assert.doesNotMatch(JSON.stringify(failing.changes), /private-|token|provider/);
  const destroyed = mainSyncFixture(); destroyed.sync.ready(); await settle();
  assert.equal(destroyed.timers.jobs.size, 1); destroyed.sync.destroy(); await settle();
  assert.equal(destroyed.timers.jobs.size, 0); destroyed.respond({ok: true, connected: true}); await settle();
  assert.equal(destroyed.location.href, syncURL, 'destroyed work cannot report connection success or clean the current URL');
});

test('main entry rejects non-boolean acknowledgements and times out with a retryable fixed state', async t => {
  const f = mainSyncFixture(); t.after(() => f.sync.destroy());
  f.sync.ready(); await settle(); f.respond({ok: true, connected: 'true'}); await settle();
  assert.equal(f.sync.getSnapshot().status, 'connection_failed'); assert.equal(f.location.href, syncURL);
  f.sync.retry(); await settle(); assert.equal(f.messages.length, 2);
  await f.timers.advance(30000);
  assert.deepEqual(f.sync.getSnapshot(), {active: true, status: 'connection_failed', busy: false});
});

test('real website OAuth retains same-tab PKCE and extension proof before automatically handing off', async t => {
  const FavoritesSync = require('../src/favorites.js'), {webcrypto, createHash} = require('node:crypto');
  class MemoryStorage { constructor() { this.values = new Map(); } getItem(key) { return this.values.get(key) ?? null; }
    setItem(key, value) { this.values.set(key, String(value)); } removeItem(key) { this.values.delete(key); } }
  const storage = new MemoryStorage(), sessionStorage = new MemoryStorage(), calls = [], external = [];
  const location = {href: syncURL, assign(value) { this.destination = value; }};
  const history = {replaceState(_state, _title, value) { location.href = value; }};
  const user = {id: ALICE.id, login: ALICE.login, avatar_url: 'https://avatars.githubusercontent.com/u/101'};
  let signedIn = false, extensionReply;
  const fetch = async (address, options) => {
    const url = new URL(address), body = options.body ? JSON.parse(options.body) : null;
    calls.push({path: url.pathname, body});
    if (url.pathname === '/api/auth/exchange') { signedIn = true; return Response.json({token: 'z'.repeat(43), expiresAt: new Date(Date.now() + 8 * 3600000).toISOString(), user}); }
    if (url.pathname === '/api/auth/extension') return Response.json({code: 'h'.repeat(43), state: body.client_state, expiresAt: new Date(Date.now() + 90000).toISOString()});
    if (url.pathname === '/api/bootstrap') return Response.json({authConfigured: true, user: signedIn ? user : null, favorites: [], nextCursor: null});
    assert.fail('Unexpected API path: ' + url.pathname);
  };
  const createStore = () => FavoritesSync.createFavoritesStore({storage, sessionStorage, config: {apiBase: 'https://favorites-api.test/api'},
    location, history, fetch, crypto: webcrypto, catalog: () => []});
  let store = createStore(); await store.init();
  const initial = ExtensionSync.start({store, location, history}); t.after(() => initial.destroy());
  initial.ready(); initial.prepareSignIn(); await store.signIn();
  const github = new URL(location.destination), pending = JSON.parse(sessionStorage.getItem(FavoritesSync.SESSION_KEYS.login));
  assert.equal(github.searchParams.get('return_to'), '/?extension_sync=1#' + proofFragment);
  assert.equal(github.searchParams.get('client_challenge'), createHash('sha256').update(pending.verifier).digest('base64url'));
  store.destroy(); initial.destroy();
  location.href = `https://agentskills.media/?extension_sync=1&login_code=${'o'.repeat(43)}&login_state=${pending.state}#${proofFragment}`;
  store = createStore(); t.after(() => store.destroy());
  const completed = ExtensionSync.start({store, location, history, chrome: {runtime: {sendMessage(id, message, callback) {
    external.push({id, message, senderURL: location.href}); extensionReply = callback;
  }}}}); t.after(() => completed.destroy());
  assert.equal(calls.filter(call => call.path === '/api/auth/extension').length, 0);
  await store.init(); assert.equal(new URL(location.href).searchParams.has('login_code'), false);
  assert.equal(calls.filter(call => call.path === '/api/auth/extension').length, 0, 'website auth is consumed before the handoff begins');
  completed.ready(); await settle();
  assert.equal(external.length, 1); assert.equal(new URL(external[0].senderURL).searchParams.get('extension_sync'), '1');
  assert.deepEqual(calls.find(call => call.path === '/api/auth/exchange').body, {code: 'o'.repeat(43), state: pending.state, verifier: pending.verifier});
  assert.doesNotMatch(JSON.stringify(external), new RegExp(pending.verifier + '|' + 'z'.repeat(43)));
  extensionReply({ok: true, connected: true}); await settle();
  assert.equal(completed.getSnapshot().status, 'connected'); assert.equal(location.href, 'https://agentskills.media/');
});
