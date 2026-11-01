import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, webcrypto} from 'node:crypto';
import {createFavoritesSync, API_BASE, EXTENSION_ID, STORAGE_KEYS as K,
  sanitizeExtensionRepository, extensionToCloud, cloudToExtension} from '../../chrome/favorites-sync.mjs';

const ALICE = {id: '101', login: 'alice', avatar_url: 'https://avatars.githubusercontent.com/u/101'};
const BOB = {id: '202', login: 'bob', avatar_url: 'https://avatars.githubusercontent.com/u/202'};
const copy = value => JSON.parse(JSON.stringify(value));
const repo = (id, extra = {}) => ({key: `team/repo-${id}`, full_name: `team/repo-${id}`, source_id: id,
  source_type: 'skill', sources: ['skill'], description: `Repository ${id}`, stars: id, topics: [], platforms: [],
  use_cases: ['AI 代理'], categories: ['other'], updated_at: '2026-10-31T00:00:00Z', ...extra});
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; };
const settle = () => new Promise(resolve => setImmediate(resolve));

function backend() {
  let sequence = 0;
  const server = {user: ALICE, rows: new Map(), sessions: new Map(), exchanges: new Map(), receipts: new Set(), requests: [],
    offline: false, failWrites: false, loseImportResponse: false, pageSize: 500, beforeRead: null, beforeWrite: null,
    beforeExchange: null, resolvable: new Map(), redirect: null, cancelled: false};
  const random = () => (++sequence).toString(36).padEnd(43, '_');
  server.put = (user, id, value = extensionToCloud(repo(id))) => server.rows.set(`${user.id}:${id}`, {repo_id: id, repository: copy(value)});
  server.remove = (user, id) => server.rows.delete(`${user.id}:${id}`);
  server.list = user => [...server.rows.entries()].filter(([key]) => key.startsWith(user.id + ':')).map(([, row]) => copy(row)).sort((a, b) => a.repo_id - b.repo_id);
  server.issue = user => { const token = random(); server.sessions.set(token, copy(user)); return {api: API_BASE, token,
    expiresAt: new Date(Date.now() + 8 * 3600000).toISOString(), user: copy(user)}; };
  server.launch = async ({url, interactive}) => {
    assert.equal(interactive, true); if (server.cancelled) throw Error('cancelled');
    const address = new URL(url); assert.equal(address.origin + address.pathname, API_BASE + '/auth/github');
    assert.equal(address.searchParams.get('client'), 'extension');
    assert.equal(address.searchParams.get('return_to'), `https://${EXTENSION_ID}.chromiumapp.org/github`);
    const code = random(), state = address.searchParams.get('client_state');
    assert.match(state, /^[A-Za-z0-9_-]{43}$/);
    server.exchanges.set(code, {challenge: address.searchParams.get('client_challenge'), state, user: copy(server.user)});
    return server.redirect || `${address.searchParams.get('return_to')}?login_code=${code}&login_state=${state}`;
  };
  server.fetch = async (address, options = {}) => {
    const url = new URL(address), method = options.method || 'GET', body = options.body ? JSON.parse(options.body) : null;
    const headers = options.headers || {}, extension = headers['X-Favorites-Extension'];
    assert.equal(url.origin + '/api', API_BASE); assert.equal(options.credentials, 'omit');
    assert.ok(extension === EXTENSION_ID || headers.Origin === 'https://agentskills.media');
    const token = headers.Authorization?.replace(/^Bearer /, ''), user = server.sessions.get(token);
    const request = {path: url.pathname, query: url.search, method, body, headers: {...headers}}; server.requests.push(request);
    const respond = (status, value) => new Response(JSON.stringify(value), {status, headers: {'Content-Type': 'application/json'}});
    if (server.offline) throw new TypeError('Offline');
    if (url.pathname === '/api/auth/exchange') {
      assert.equal(headers.Authorization, undefined);
      if (server.beforeExchange) await server.beforeExchange(request);
      const exchange = server.exchanges.get(body.code);
      if (!exchange || body.state !== exchange.state || createHash('sha256').update(body.verifier).digest('base64url') !== exchange.challenge) return respond(400, {error: 'invalid_login_exchange'});
      server.exchanges.delete(body.code); return respond(200, server.issue(exchange.user));
    }
    if (url.pathname === '/api/bootstrap') {
      const after = Number(url.searchParams.get('after') || 0);
      if (after && (!user || headers['X-Favorites-User'] !== user.id)) return respond(409, {error: 'account_changed'});
      const available = user ? server.list(user).filter(row => row.repo_id > after) : [];
      const favorites = available.slice(0, server.pageSize), payload = {authConfigured: true, user: user || null,
        favorites, nextCursor: available.length > server.pageSize ? favorites.at(-1).repo_id : null};
      if (server.beforeRead) await server.beforeRead({after, payload});
      return respond(200, payload);
    }
    if (!user) return respond(401, {error: 'authentication_required'});
    if (headers['X-Favorites-User'] !== user.id) return respond(409, {error: 'account_changed'});
    if (server.beforeWrite) await server.beforeWrite(request);
    if (server.failWrites) return respond(503, {error: 'unavailable'});
    if (url.pathname === '/api/auth/logout') { server.sessions.delete(token); return respond(200, {ok: true}); }
    if (url.pathname === '/api/favorites/resolve') {
      const value = server.resolvable.get(body.full_name.toLowerCase());
      return value ? respond(200, value) : respond(404, {error: 'repository_not_found'});
    }
    if (url.pathname === '/api/favorites/import') {
      const receipt = `${user.id}:${body.migration_id}:${body.batch_id}`;
      if (!server.receipts.has(receipt)) {
        for (const row of body.favorites) if (!server.rows.has(`${user.id}:${row.repo_id}`)) server.put(user, row.repo_id, row.repository);
        server.receipts.add(receipt);
      }
      if (server.loseImportResponse) { server.loseImportResponse = false; throw new TypeError('Committed response lost'); }
      return respond(200, {ok: true});
    }
    const match = /^\/api\/favorites\/(\d+)$/.exec(url.pathname);
    if (match && method === 'PUT') { server.put(user, Number(match[1]), body.repository); return respond(200, {ok: true}); }
    if (match && method === 'DELETE') { server.remove(user, Number(match[1])); return respond(200, {ok: true}); }
    return respond(404, {error: 'not_found'});
  };
  server.web = async (user, path, method = 'GET', body) => {
    const auth = server.issue(user);
    return server.fetch(API_BASE + path, {method, credentials: 'omit', headers: {Origin: 'https://agentskills.media',
      Authorization: 'Bearer ' + auth.token, 'X-Favorites-User': user.id}, ...(body ? {body: JSON.stringify(body)} : {})});
  };
  return server;
}

function chromeMock(server, initial = {}) {
  const values = {local: copy(initial.local || {}), session: copy(initial.session || {})}, calls = [];
  const mock = {values, calls, fail: null, beforeSet: null};
  const area = name => ({
    async get(keys) {
      calls.push(['get', name, keys]); if (mock.fail?.('get', name, keys)) throw Error('storage');
      return copy(keys === null ? values[name] : Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(key => own(values[name], key)).map(key => [key, values[name][key]])));
    },
    async set(items) {
      calls.push(['set', name, copy(items)]); if (mock.beforeSet) await mock.beforeSet(name, items);
      if (mock.fail?.('set', name, items)) throw Error('storage'); Object.assign(values[name], copy(items));
    },
    async remove(keys) {
      calls.push(['remove', name, keys]); if (mock.fail?.('remove', name, keys)) throw Error('storage');
      for (const key of Array.isArray(keys) ? keys : [keys]) delete values[name][key];
    },
  });
  mock.chrome = {runtime: {id: EXTENSION_ID}, storage: {local: area('local'), session: area('session')},
    identity: {getRedirectURL: path => `https://${EXTENSION_ID}.chromiumapp.org/${path}`, launchWebAuthFlow: server.launch}};
  return mock;
}
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
function fixture(settings = {}) {
  const server = settings.server || backend(), mock = settings.mock || chromeMock(server, settings.initial);
  const changes = [], store = createFavoritesSync({chrome: mock.chrome, fetch: server.fetch, crypto: webcrypto,
    catalog: settings.catalog || (async () => [repo(1), repo(2), repo(3)]), onChange: value => changes.push(value)});
  return {server, mock, store, changes};
}

test('record conversion preserves numeric IDs, source families and extension search fields', () => {
  const input = repo(7, {sources: ['skill', 'mcp', 'prompt', 'framework', 'auto_research', 'unknown'], platforms: ['claude'],
    description: '<img src=x onerror=alert(1)>', key: 'attacker/key', secret: 'never copied'});
  const cloud = extensionToCloud(input), restored = cloudToExtension(cloud);
  assert.equal(cloud.id, 7); assert.deepEqual(cloud.sources, ['skills', 'mcp', 'prompts', 'frameworks', 'research']);
  assert.equal(restored.source_id, 7); assert.equal(restored.key, 'team/repo-7'); assert.deepEqual(restored.platforms, ['claude']);
  assert.deepEqual(restored.sources, input.sources.slice(0, 5)); assert.equal(restored.secret, undefined);
  for (const source of restored.sources) assert.ok(restored.facets[source].categories.includes('other'));
  assert.equal(sanitizeExtensionRepository(repo(1, {full_name: '../wrong'})), null);
  assert.equal(extensionToCloud(repo(1, {source_id: undefined})), null);
});

test('anonymous favorites remain local and snapshot reads do not initiate network requests', async () => {
  const f = fixture(); await f.store.init(); await f.store.toggle(repo(1));
  assert.equal(f.mock.values.local['favorite:team/repo-1'].source_id, 1);
  const before = f.server.requests.length; const value = await f.store.getSnapshot(); await f.store.getSnapshot();
  assert.equal(f.server.requests.length, before); assert.equal(value.user, null); assert.equal(value.localOnlyCount, 1);
  assert.ok(value.favorites['team/repo-1']); await f.store.toggle(repo(1)); assert.equal((await f.store.getSnapshot()).localOnlyCount, 0);
  f.mock.fail = (operation, area) => operation === 'set' && area === 'local';
  const failed = await f.store.toggle(repo(2)); assert.equal(failed.error, 'storage_unavailable'); assert.deepEqual(failed.favorites, {});
});

test('first login imports catalog IDs and resolves rare legacy names while deleted repositories remain local', async () => {
  const f = fixture({initial: {local: {'favorite:team/repo-1': repo(1, {source_id: undefined}),
    'favorite:old/renamed': repo(9, {full_name: 'old/renamed', source_id: undefined}),
    'favorite:deleted/repo': repo(10, {full_name: 'deleted/repo', source_id: undefined})}}});
  f.server.resolvable.set('old/renamed', {repo_id: 9, full_name: 'new/renamed'});
  f.server.beforeWrite = request => {
    if (request.path === '/api/favorites/import') {
      const metadata = f.mock.values.local[K.migration], plan = metadata.plans[ALICE.id]; assert.equal(metadata.owners['team/repo-1'], ALICE.id);
      assert.equal(plan.id, request.body.migration_id); assert.deepEqual(plan.batches[request.body.batch_id].rows, request.body.favorites);
    }
  };
  await f.store.init(); const result = await f.store.signIn();
  assert.equal(result.user.id, ALICE.id); assert.equal(result.status, 'local'); assert.equal(result.localOnlyCount, 1);
  assert.ok(result.favorites['team/repo-1']); assert.ok(result.favorites['new/renamed']); assert.ok(result.favorites['deleted/repo']);
  assert.equal(f.mock.values.local['favorite:team/repo-1'], undefined); assert.equal(f.mock.values.local['favorite:old/renamed'], undefined);
  assert.ok(f.mock.values.local['favorite:deleted/repo']); assert.equal(result.pendingImportCount, 0);
  assert.equal(f.server.requests.filter(value => value.path === '/api/favorites/resolve').length, 2);
});

test('website and extension read and write the same account favorites and restore every cursor page', async () => {
  const server = backend(); server.pageSize = 2;
  for (let id = 1; id <= 5; id += 1) await server.web(ALICE, '/favorites/' + id, 'PUT', {repository: extensionToCloud(repo(id))});
  const f = fixture({server}); await f.store.init(); let result = await f.store.signIn();
  assert.equal(result.status, 'synced'); assert.equal(Object.keys(result.favorites).length, 5);
  assert.ok(server.requests.some(value => value.query === '?after=4' && value.headers['X-Favorites-User'] === ALICE.id));
  await f.store.toggle(repo(6));
  const response = await server.web(ALICE, '/bootstrap'); assert.ok((await response.json()).favorites.some(row => row.repo_id === 1));
  assert.equal(server.rows.has('101:6'), true);
  await server.web(ALICE, '/favorites/2', 'DELETE'); result = await f.store.sync(); assert.equal(result.favorites['team/repo-2'], undefined);
});

test('lost import replies reuse durable receipt batches after worker restart without resurrecting web deletions', async () => {
  const f = fixture({initial: {local: {'favorite:team/repo-1': repo(1)}}});
  f.server.loseImportResponse = true; await f.store.init(); const failed = await f.store.signIn();
  assert.equal(failed.error, 'local_import_failed'); assert.equal(failed.pendingImportCount, 1);
  const first = f.server.requests.find(value => value.path === '/api/favorites/import'); assert.ok(f.mock.values.local['favorite:team/repo-1']);
  await f.server.web(ALICE, '/favorites/1', 'DELETE');
  const restarted = fixture({server: f.server, mock: f.mock}); const result = await restarted.store.init();
  const retry = f.server.requests.filter(value => value.path === '/api/favorites/import').at(-1);
  assert.equal(retry.body.migration_id, first.body.migration_id); assert.equal(retry.body.batch_id, first.body.batch_id);
  assert.equal(f.server.rows.has('101:1'), false); assert.equal(result.favorites['team/repo-1'], undefined);
  assert.equal(f.mock.values.local['favorite:team/repo-1'], undefined);
});

test('first account owns unresolved legacy favorites and another account cannot import or display them', async () => {
  const f = fixture({initial: {local: {'favorite:deleted/repo': repo(8, {full_name: 'deleted/repo', source_id: undefined})}}});
  await f.store.init(); await f.store.signIn(); await f.store.toggle(repo(2)); await f.store.signOut();
  assert.equal(f.mock.values.session[K.session], undefined); assert.equal(f.mock.values.session[K.cache], undefined);
  assert.ok(f.server.rows.has('101:2')); f.server.user = BOB;
  const bob = await f.store.signIn(); assert.equal(bob.user.id, BOB.id); assert.deepEqual(bob.favorites, {}); assert.equal(bob.localOnlyCount, 0);
  assert.equal(f.server.list(BOB).length, 0); assert.ok(f.mock.values.local['favorite:deleted/repo']);
  await f.store.signOut(); f.server.user = ALICE; const alice = await f.store.signIn(); assert.ok(alice.favorites['deleted/repo']); assert.ok(alice.favorites['team/repo-2']);
});

test('ordinary writes roll back on failure, serialize rapid toggles, and never queue offline uploads', async () => {
  const f = fixture(); await f.store.init(); await f.store.signIn(); await f.store.toggle(repo(1));
  f.server.failWrites = true; let failed = await f.store.toggle(repo(2)); assert.equal(failed.error, 'save_failed'); assert.equal(failed.favorites['team/repo-2'], undefined);
  f.server.failWrites = false; f.server.offline = true; failed = await f.store.toggle(repo(3)); assert.equal(failed.status, 'offline'); assert.equal(failed.favorites['team/repo-3'], undefined);
  const writes = f.server.requests.filter(value => value.method === 'PUT').length; f.server.offline = false; await f.store.sync();
  assert.equal(f.server.requests.filter(value => value.method === 'PUT').length, writes);
  await Promise.all([f.store.toggle(repo(2)), f.store.toggle(repo(2))]); assert.equal(f.server.rows.has('101:2'), false);
  assert.deepEqual(f.server.requests.filter(value => value.path === '/api/favorites/2').slice(-2).map(value => value.method), ['PUT', 'DELETE']);
});

test('cancelled or forged identity redirects clear pending secrets without exchanging a code', async () => {
  for (const settings of [{cancelled: true}, {redirect: 'https://evil.example/github?login_code=private'},
    {redirect: `https://${EXTENSION_ID}.chromiumapp.org/other?login_code=private`},
    {redirect: `https://${EXTENSION_ID}.chromiumapp.org/github?login_code=${'c'.repeat(43)}&login_state=wrong`}]) {
    const f = fixture(); Object.assign(f.server, settings); await f.store.init(); const result = await f.store.signIn();
    assert.equal(result.user, null); assert.equal(result.error, settings.cancelled ? 'auth_cancelled' : 'auth_failed');
    assert.equal(f.mock.values.session[K.pending], undefined); assert.equal(f.mock.values.session[K.session], undefined);
    assert.equal(f.server.requests.some(value => value.path === '/api/auth/exchange'), false);
  }
});

test('tokens and PKCE never reach local storage, public snapshots or onChange broadcasts', async () => {
  const f = fixture(); await f.store.init(); const result = await f.store.signIn(); await f.store.toggle(repo(2));
  const secret = f.mock.values.session[K.session].token; assert.match(secret, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(JSON.stringify(f.mock.values.local).includes(secret), false);
  for (const value of [result, ...f.changes, await f.store.getSnapshot()]) {
    assert.equal(JSON.stringify(value).includes(secret), false); assert.equal(own(value, 'token'), false);
  }
  assert.equal(f.mock.values.session[K.pending], undefined);
  const restored = fixture({server: f.server, mock: f.mock}); assert.ok((await restored.store.getSnapshot()).favorites['team/repo-2']);
  const requests = f.server.requests.length; await restored.store.getSnapshot(); assert.equal(f.server.requests.length, requests);
});

test('a migration metadata write failure retains local data and prevents import requests', async () => {
  const f = fixture({initial: {local: {'favorite:team/repo-1': repo(1)}}}); await f.store.init();
  f.mock.fail = (operation, area, items) => operation === 'set' && area === 'local' && own(items, K.migration);
  const result = await f.store.signIn(); assert.equal(result.error, 'storage_unavailable'); assert.ok(f.mock.values.local['favorite:team/repo-1']);
  assert.equal(f.server.requests.some(value => value.path === '/api/favorites/import'), false); assert.equal(f.server.rows.size, 0);
});

test('expired or revoked authentication clears account data and cannot write to another user', async () => {
  const f = fixture(); await f.store.init(); await f.store.signIn(); await f.store.toggle(repo(1));
  f.server.sessions.clear(); f.server.user = BOB;
  const result = await f.store.toggle(repo(2)); assert.equal(result.user, null); assert.equal(result.error, 'auth_failed');
  assert.deepEqual(result.favorites, {}); assert.equal(f.mock.values.session[K.session], undefined); assert.equal(f.mock.values.session[K.cache], undefined);
  assert.equal(f.server.rows.has('202:2'), false); assert.equal(f.server.rows.has('101:1'), true);
});

test('logout discards a late account read and cache from an earlier service worker operation', {timeout: 5000}, async () => {
  const f = fixture(); await f.store.init(); await f.store.signIn(); await f.store.toggle(repo(1));
  const held = deferred(), entered = deferred(); f.server.beforeRead = async () => { entered.resolve(); await held.promise; };
  const syncing = f.store.sync(); await entered.promise; const result = await f.store.signOut();
  assert.equal(result.user, null); held.resolve(); await syncing;
  assert.equal((await f.store.getSnapshot()).user, null); assert.deepEqual((await f.store.getSnapshot()).favorites, {});
  assert.equal(f.mock.values.session[K.cache], undefined); assert.equal(f.mock.values.session[K.session], undefined);
});

test('new authenticated favorites with missing IDs resolve online and unresolved writes stay unsaved', async () => {
  const f = fixture(); await f.store.init(); await f.store.signIn();
  f.server.resolvable.set('custom/repo', {repo_id: 77, full_name: 'custom/repo'});
  const added = await f.store.toggle(repo(77, {source_id: undefined, full_name: 'custom/repo'})); assert.ok(added.favorites['custom/repo']);
  const failed = await f.store.toggle(repo(78, {source_id: undefined, full_name: 'missing/repo'}));
  assert.equal(failed.error, 'repository_not_found'); assert.equal(failed.favorites['missing/repo'], undefined);
  assert.equal(f.mock.values.local['favorite:missing/repo'], undefined);
});

test('repeated sign-in calls share one identity window and a consumed handoff cannot be replayed', {timeout: 5000}, async () => {
  const f = fixture(); await f.store.init();
  const held = deferred(), entered = deferred(); let calls = 0, returned;
  f.mock.chrome.identity.launchWebAuthFlow = async value => { calls += 1; entered.resolve(); await held.promise; returned = await f.server.launch(value); return returned; };
  const first = f.store.signIn(), second = f.store.signIn();
  try { assert.equal(first, second); await entered.promise; assert.equal(calls, 1); } finally { held.resolve(); }
  const signedIn = await first; assert.equal(signedIn.user.id, ALICE.id);
  await f.store.signOut(); f.mock.chrome.identity.launchWebAuthFlow = async () => returned;
  const replayed = await f.store.signIn(); assert.equal(replayed.user, null); assert.equal(replayed.error, 'auth_failed');
  assert.equal(f.mock.values.session[K.pending], undefined); assert.equal(f.mock.values.session[K.session], undefined);
});

test('fresh anonymous intent after a completed migration uses a new receipt instead of an old import', async () => {
  const f = fixture({initial: {local: {'favorite:team/repo-1': repo(1)}}}); await f.store.init(); await f.store.signIn();
  await f.server.web(ALICE, '/favorites/1', 'DELETE'); await f.store.signOut(); await f.store.toggle(repo(1));
  const result = await f.store.signIn(); assert.ok(result.favorites['team/repo-1']); assert.equal(f.server.rows.has('101:1'), true);
  const batches = f.server.requests.filter(value => value.path === '/api/favorites/import');
  assert.equal(batches.length, 2); assert.equal(batches[0].body.migration_id, batches[1].body.migration_id);
  assert.notEqual(batches[0].body.batch_id, batches[1].body.batch_id);
});

test('a local cleanup failure retries the confirmed receipt without reviving a later deletion', async () => {
  const f = fixture({initial: {local: {'favorite:team/repo-1': repo(1)}}}); await f.store.init();
  f.mock.fail = (operation, area) => operation === 'remove' && area === 'local';
  const failed = await f.store.signIn(); assert.equal(failed.error, 'storage_unavailable'); assert.ok(f.mock.values.local['favorite:team/repo-1']);
  assert.equal(f.mock.values.local[K.migration].plans[ALICE.id].batches[0].confirmed, true);
  await f.server.web(ALICE, '/favorites/1', 'DELETE'); f.mock.fail = null;
  const result = await f.store.sync(); assert.equal(result.favorites['team/repo-1'], undefined); assert.equal(f.server.rows.has('101:1'), false);
  assert.equal(f.server.requests.filter(value => value.path === '/api/favorites/import').length, 1);
});

test('logout during authentication storage cannot leave a token or old account cache behind', {timeout: 5000}, async () => {
  const f = fixture(); await f.store.init(); const held = deferred(), entered = deferred();
  f.mock.beforeSet = async (area, value) => { if (area === 'session' && value[K.session]) { entered.resolve(); await held.promise; } };
  const signingIn = f.store.signIn(); let signingOut;
  try {
    await entered.promise;
    signingOut = f.store.signOut(); await settle();
  } finally { held.resolve(); }
  await Promise.all([signingIn, signingOut]);
  assert.equal((await f.store.getSnapshot()).user, null); assert.equal(f.mock.values.session[K.session], undefined);
  assert.equal(f.mock.values.session[K.cache], undefined); assert.equal(f.mock.values.session[K.pending], undefined);
});

test('cache from a different account is ignored before any network request', async () => {
  const server = backend(), session = server.issue(BOB);
  const f = fixture({server, initial: {session: {[K.session]: session,
    [K.cache]: {api: API_BASE, owner: ALICE.id, records: [sanitizeExtensionRepository(repo(1))]}}}});
  const result = await f.store.getSnapshot(); assert.equal(result.user.id, BOB.id); assert.deepEqual(result.favorites, {});
  assert.equal(server.requests.length, 0);
});

test('cloud cache quota failure keeps confirmed favorites and authentication in memory', async () => {
  const f = fixture(); await f.store.init(); await f.store.signIn();
  const token = f.mock.values.session[K.session].token;
  f.mock.fail = (operation, area, items) => operation === 'set' && area === 'session' && own(items, K.cache);
  const added = await f.store.toggle(repo(2)); assert.ok(added.favorites['team/repo-2']);
  assert.equal(added.error, 'storage_unavailable'); assert.equal(f.server.rows.has('101:2'), true);
  assert.equal(f.mock.values.session[K.session].token, token);
  const synced = await f.store.sync(); assert.ok(synced.favorites['team/repo-2']); assert.equal(synced.user.id, ALICE.id);
  assert.equal(synced.error, 'storage_unavailable'); assert.equal(synced.status, 'error');
  f.mock.fail = null; const recovered = await f.store.sync(); assert.equal(recovered.error, null); assert.equal(recovered.status, 'synced');
});

test('large imports persist frozen batches before sending any batch and keep each request bounded', async () => {
  const favorites = Object.fromEntries(Array.from({length: 205}, (_, index) => [`favorite:team/repo-${index + 1}`, repo(index + 1)]));
  const f = fixture({initial: {local: favorites}}); await f.store.init();
  f.server.beforeWrite = request => {
    if (request.path === '/api/favorites/import') {
      const plan = f.mock.values.local[K.migration].plans[ALICE.id]; assert.equal(plan.batches.length, 3);
      assert.deepEqual(plan.batches[request.body.batch_id].rows, request.body.favorites);
    }
  };
  const result = await f.store.signIn(); const imports = f.server.requests.filter(value => value.path === '/api/favorites/import');
  assert.deepEqual(imports.map(value => value.body.favorites.length), [100, 100, 5]); assert.equal(result.pendingImportCount, 0);
  assert.equal(Object.keys(result.favorites).length, 205); assert.equal(Object.keys(f.mock.values.local).filter(key => key.startsWith('favorite:')).length, 0);
});

test('old identity cancellation and old logout failures cannot overwrite a newer account state', {timeout: 5000}, async () => {
  const f = fixture(); await f.store.init(); const authHeld = deferred(), authEntered = deferred();
  f.mock.chrome.identity.launchWebAuthFlow = async () => { authEntered.resolve(); await authHeld.promise; throw Error('cancelled'); };
  const oldLogin = f.store.signIn();
  try { await authEntered.promise; await f.store.signOut(); } finally { authHeld.resolve(); }
  await oldLogin;
  assert.equal((await f.store.getSnapshot()).error,null); assert.equal((await f.store.getSnapshot()).user,null);
  f.mock.chrome.identity.launchWebAuthFlow = f.server.launch; await f.store.signIn();
  const logoutHeld = deferred(), logoutEntered = deferred();
  f.server.beforeWrite = async request => { if(request.path==='/api/auth/logout'){logoutEntered.resolve();await logoutHeld.promise;throw TypeError('Offline');} };
  const oldLogout = f.store.signOut();
  try {
    await logoutEntered.promise;
    f.server.user=BOB; const bob=await f.store.signIn(); assert.equal(bob.user.id,BOB.id);
  } finally { logoutHeld.resolve(); }
  await oldLogout; const current=await f.store.getSnapshot();
  assert.equal(current.user.id,BOB.id); assert.equal(current.error,null); assert.equal(current.status,'synced');
});

test('identity callback errors preserve only fixed safe error codes', async () => {
  for(const [received,expected] of [['oauth_client_configuration','oauth_client_configuration'],['invalid_state','invalid_state'],['private-upstream-detail','auth_failed']]){
    const f=fixture();f.server.redirect=`https://${EXTENSION_ID}.chromiumapp.org/github?auth_error=${received}`;
    await f.store.init();const result=await f.store.signIn();assert.equal(result.error,expected);assert.equal(result.user,null);
    assert.equal(f.mock.values.session[K.pending],undefined);assert.equal(f.mock.values.session[K.session],undefined);
    assert.equal(f.server.requests.some(request=>request.path==='/api/auth/exchange'),false);
  }
});

test('large repository metadata splits imports below the API byte limit', async () => {
  const tags=Array.from({length:32},(_,index)=>String(index).padEnd(100,'x'));
  const favorites=Object.fromEntries(Array.from({length:65},(_,index)=>[`favorite:team/repo-${index+1}`,
    repo(index+1,{description:'x'.repeat(4000),categories:tags,topics:tags,use_cases:tags,platforms:tags})]));
  const f=fixture({initial:{local:favorites}});await f.store.init();const result=await f.store.signIn();
  const imports=f.server.requests.filter(request=>request.path==='/api/favorites/import');assert.ok(imports.length>1);
  for(const request of imports)assert.ok(new TextEncoder().encode(JSON.stringify(request.body)).byteLength<1024*1024);
  assert.equal(Object.keys(result.favorites).length,65);assert.equal(result.error,null);
});

test('a fresh anonymous favorite after Alice logs out belongs to the next signed-in account', async () => {
  const f=fixture({initial:{local:{'favorite:team/repo-1':repo(1)}}});await f.store.init();await f.store.signIn();
  await f.store.signOut();await f.store.toggle(repo(2));
  assert.equal(f.mock.values.local[K.migration].owners['team/repo-2'],undefined);
  f.server.user=BOB;const bob=await f.store.signIn();assert.ok(bob.favorites['team/repo-2']);assert.equal(bob.localOnlyCount,0);
  assert.equal(f.server.rows.has('202:2'),true);assert.equal(f.server.rows.has('101:2'),false);
  await f.store.signOut();f.server.user=ALICE;const alice=await f.store.signIn();
  assert.ok(alice.favorites['team/repo-1']);assert.equal(alice.favorites['team/repo-2'],undefined);
  assert.equal(f.server.rows.has('101:2'),false);
});

test('unresolved Alice legacy stays isolated while new anonymous Bob favorites can sync', async () => {
  const missing=repo(9,{full_name:'deleted/repo',source_id:undefined});
  const f=fixture({initial:{local:{'favorite:deleted/repo':missing}}});await f.store.init();await f.store.signIn();
  assert.equal(f.mock.values.local[K.migration].owners['deleted/repo'],ALICE.id);
  await f.store.signOut();await f.store.toggle(repo(2));f.server.user=BOB;const bob=await f.store.signIn();
  assert.ok(bob.favorites['team/repo-2']);assert.equal(bob.favorites['deleted/repo'],undefined);assert.equal(bob.localOnlyCount,0);
  assert.equal(f.mock.values.local[K.migration].owners['deleted/repo'],ALICE.id);
  await f.store.signOut();f.server.user=ALICE;const alice=await f.store.signIn();
  assert.ok(alice.favorites['deleted/repo']);assert.equal(alice.localOnlyCount,1);assert.equal(alice.favorites['team/repo-2'],undefined);
});

test('switching accounts preserves each frozen receipt and never imports failed Alice batches into Bob', async () => {
  const f=fixture({initial:{local:{'favorite:team/repo-1':repo(1)}}});f.server.loseImportResponse=true;
  await f.store.init();await f.store.signIn();const first=f.server.requests.find(request=>request.path==='/api/favorites/import');
  await f.store.signOut();await f.store.toggle(repo(2));f.server.user=BOB;const bob=await f.store.signIn();
  assert.ok(bob.favorites['team/repo-2']);assert.equal(bob.favorites['team/repo-1'],undefined);
  assert.ok(f.mock.values.local['favorite:team/repo-1']);assert.equal(f.server.rows.has('202:1'),false);
  await f.server.web(ALICE,'/favorites/1','DELETE');await f.store.signOut();f.server.user=ALICE;
  const restarted=fixture({server:f.server,mock:f.mock}),alice=await restarted.store.signIn();
  const retry=f.server.requests.filter(request=>request.path==='/api/favorites/import'&&request.headers['X-Favorites-User']===ALICE.id).at(-1);
  assert.equal(retry.body.migration_id,first.body.migration_id);assert.equal(retry.body.batch_id,first.body.batch_id);
  assert.equal(alice.favorites['team/repo-1'],undefined);assert.equal(alice.favorites['team/repo-2'],undefined);
  assert.equal(f.server.rows.has('101:1'),false);assert.equal(f.server.rows.has('101:2'),false);assert.equal(f.server.rows.has('202:2'),true);
});

test('old metadata upgrades without resetting frozen account receipts', async () => {
  const server=backend(),auth=server.issue(ALICE),row={repo_id:1,repository:extensionToCloud(repo(1))};
  const old={owner:ALICE.id,id:'original-migration-identity',batches:[{id:0,rows:[row],keys:['team/repo-1'],confirmed:false,cleaned:false}]};
  const f=fixture({server,initial:{local:{[K.migration]:old,'favorite:team/repo-1':repo(1)},session:{[K.session]:auth}}});
  await f.store.init();const imported=server.requests.find(request=>request.path==='/api/favorites/import');
  assert.equal(imported.body.migration_id,old.id);assert.equal(imported.body.batch_id,0);assert.equal(f.mock.values.local[K.migration].version,2);
  await f.store.signOut();await f.store.toggle(repo(2));server.user=BOB;const bob=await f.store.signIn();
  assert.ok(bob.favorites['team/repo-2']);assert.equal(server.rows.has('101:2'),false);
});

test('ID-only cloud favorites retain a stable placeholder and can be removed by numeric ID', async () => {
  const placeholder=cloudToExtension({id:77,full_name:'',sources:[],description:''});
  assert.equal(placeholder.key,'repo-id:77');assert.equal(placeholder.placeholder,true);assert.equal(placeholder.full_name,'');
  assert.equal(placeholder.source_type,'');assert.deepEqual(placeholder.sources,[]);assert.deepEqual(placeholder.facets,{});
  assert.equal(extensionToCloud(placeholder).url,'');assert.equal(extensionToCloud(placeholder).full_name,'');
  assert.equal(cloudToExtension({id:77,full_name:'../invalid',sources:[]}),null);
  const f=fixture();f.server.put(ALICE,77,{id:77,full_name:'',sources:[],description:''});f.server.put(ALICE,1);
  await f.store.init();const result=await f.store.signIn();assert.equal(Object.keys(result.favorites).length,2);
  assert.ok(result.favorites['repo-id:77']);assert.equal(result.favorites['repo-id:77'].source_id,77);
  const restarted=fixture({server:f.server,mock:f.mock});assert.ok((await restarted.store.getSnapshot()).favorites['repo-id:77']);
  const removed=await restarted.store.toggle({source_id:77});assert.equal(removed.favorites['repo-id:77'],undefined);
  assert.equal(f.server.rows.has('101:77'),false);assert.ok(removed.favorites['team/repo-1']);
  assert.equal(f.server.requests.at(-1).path,'/api/favorites/77');assert.equal(f.server.requests.at(-1).method,'DELETE');
});

test('renamed cloud favorites hydrate by stable ID without automatic cloud writes or duplicate names', async () => {
  const current=repo(123,{full_name:'new-owner/new-name',description:'Current catalog metadata',sources:['skill'],updated_at:'2026-11-01T00:00:00Z'});
  const f=fixture({catalog:async()=>[current]});
  f.server.put(ALICE,123,extensionToCloud(repo(123,{full_name:'old-owner/old-name',description:'Old cloud metadata',sources:['mcp']})));
  await f.store.init();const result=await f.store.signIn();
  assert.deepEqual(Object.keys(result.favorites),['new-owner/new-name']);
  assert.equal(result.favorites['new-owner/new-name'].source_id,123);
  assert.equal(result.favorites['new-owner/new-name'].description,'Current catalog metadata');
  assert.deepEqual(result.favorites['new-owner/new-name'].sources,['skill','mcp']);
  assert.ok(result.favorites['new-owner/new-name'].facets.mcp);
  assert.equal(f.server.rows.get('101:123').repository.full_name,'old-owner/old-name');
  assert.equal(f.server.requests.some(request=>request.method==='PUT'||request.method==='DELETE'),false);
  const restarted=fixture({server:f.server,mock:f.mock,catalog:async()=>[current]});
  assert.deepEqual(Object.keys((await restarted.store.getSnapshot()).favorites),['new-owner/new-name']);
  const removed=await restarted.store.toggle(current);assert.deepEqual(removed.favorites,{});
  assert.equal(f.server.requests.at(-1).path,'/api/favorites/123');assert.equal(f.server.requests.at(-1).method,'DELETE');
});

test('catalog IDs hydrate matching placeholders while unknown IDs remain removable placeholders', async () => {
  const f=fixture({catalog:async()=>[repo(123,{full_name:'known/repository'})]});
  f.server.put(ALICE,123,{id:123,full_name:'',sources:[]});f.server.put(ALICE,456,{id:456,full_name:'',sources:[]});
  await f.store.init();const result=await f.store.signIn();
  assert.deepEqual(Object.keys(result.favorites).sort(),['known/repository','repo-id:456']);
  assert.equal(result.favorites['known/repository'].placeholder,undefined);
  assert.equal(result.favorites['repo-id:456'].placeholder,true);
  await f.store.toggle(result.favorites['known/repository']);assert.equal(f.server.rows.has('101:123'),false);
  assert.ok((await f.store.getSnapshot()).favorites['repo-id:456']);
});
