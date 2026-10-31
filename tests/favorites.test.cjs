const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createFavoritesStore, sanitizeRepository, validConfiguration, STORAGE_KEYS: K} = require('../src/favorites.js');

const CONFIG = {url: 'https://project.supabase.co', publishableKey: 'sb_publishable_test_public_key'};
const ALICE = {id: '11111111-1111-4111-8111-111111111111', user_metadata: {user_name: 'alice', avatar_url: 'https://avatars.githubusercontent.com/u/1'}};
const BOB = {id: '22222222-2222-4222-8222-222222222222', user_metadata: {user_name: 'bob'}};
const repo = (id, extra = {}) => ({id, full_name: `team/repo-${id}`, url: `https://github.com/team/repo-${id}`,
  description: `Repository ${id}`, stars: id, sources: ['skills'], ...extra});
const clone = value => JSON.parse(JSON.stringify(value));
class MemoryStorage {
  constructor(initial = {}) { this.values = new Map(Object.entries(initial)); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; }
function fakeBackend() {
  const server = {rows: new Map(), offline: false, writes: [], reads: [], beforeWrite: null, beforeRead: null};
  server.put = (user, id, record = repo(id), deleted = false) => {
    server.rows.set(`${user.id}:${id}`, {user_id: user.id, repo_id: id, repository: clone(record), deleted, updated_at: new Date().toISOString()});
  };
  server.client = initialUser => {
    let session = initialUser ? {user: initialUser} : null, authCallback;
    const client = {options: null, loginRequest: null, unsubscribed: false};
    client.emit = nextUser => { session = nextUser ? {user: nextUser} : null; authCallback?.(nextUser ? 'SIGNED_IN' : 'SIGNED_OUT', session); };
    client.auth = {
      onAuthStateChange(callback) { authCallback = callback; return {data: {subscription: {unsubscribe() { client.unsubscribed = true; }}}}; },
      async getSession() { return {data: {session}, error: null}; },
      async signInWithOAuth(request) { client.loginRequest = request; return {data: {url: 'https://github.com/login/oauth/authorize'}, error: null}; },
      async signOut(options) { client.signOutOptions = options; client.emit(null); return {error: null}; },
    };
    client.from = table => {
      assert.equal(table, 'favorites');
      return {
        async upsert(input, options) {
          const batch = clone(input);
          assert.deepEqual(options, {onConflict: 'user_id,repo_id'});
          if (server.beforeWrite) await server.beforeWrite(batch);
          if (server.offline) throw new TypeError('Failed to fetch: offline');
          server.writes.push(batch);
          for (const row of batch) server.rows.set(`${row.user_id}:${row.repo_id}`, {...row, updated_at: new Date().toISOString()});
          return {data: null, error: null};
        },
        select(columns) {
          assert.equal(columns, 'repo_id,repository,deleted,updated_at');
          let userId;
          const query = {
            eq(column, value) { assert.equal(column, 'user_id'); userId = value; return query; },
            order(column, options) { assert.equal(column, 'repo_id'); assert.deepEqual(options, {ascending: true}); return query; },
            async range(start, end) {
              assert.ok(end - start < 500, 'bounded page size');
              if (server.beforeRead) await server.beforeRead({userId, start, end});
              if (server.offline) throw new TypeError('Failed to fetch: offline');
              server.reads.push({userId, start, end});
              const rows = [...server.rows.values()].filter(row => row.user_id === userId).sort((a, b) => a.repo_id - b.repo_id);
              return {data: clone(rows.slice(start, end + 1)), error: null};
            },
          };
          return query;
        },
      };
    };
    return client;
  };
  return server;
}
function fixture(t, settings = {}) {
  const server = settings.server || fakeBackend(), client = settings.client || server.client(settings.user);
  const storage = settings.storage || new MemoryStorage();
  const eventTarget = settings.eventTarget || new EventTarget();
  const changes = [];
  const store = createFavoritesStore({storage, config: settings.config === undefined ? CONFIG : settings.config,
    createClient: (url, key, options) => { assert.equal(url, CONFIG.url); assert.equal(key, CONFIG.publishableKey); client.options = options; return client; },
    catalog: settings.catalog || (() => [repo(1), repo(2), repo(3)]), eventTarget,
    location: settings.location || {href: 'https://agentskills.media/#mcp'}, history: settings.history,
    onChange: snapshot => changes.push(snapshot)});
  t.after(() => store.destroy());
  return {store, storage, server, client, changes, eventTarget};
}
function storageEvent(target, key) { const event = new Event('storage'); Object.defineProperty(event, 'key', {value: key}); target.dispatchEvent(event); }

test('legacy numeric favorites migrate once, keep a backup, deduplicate and retain unknown IDs', async t => {
  const storage = new MemoryStorage({[K.legacy]: '[1,1,2,999,"3",null,-1]'});
  const {store} = fixture(t, {storage, config: {}});
  await store.init();
  assert.deepEqual(store.getSnapshot().ids, [1, 2, 3, 999]);
  assert.equal(storage.getItem(K.backup), '[1,1,2,999,"3",null,-1]');
  assert.equal(store.getSnapshot().records[999].url, '');
  store.toggle(1);
  const next = fixture(t, {storage, config: {}}).store;
  await next.init();
  assert.deepEqual(next.getSnapshot().ids, [2, 3, 999], 'old legacy IDs do not resurrect on reload');
});

test('malformed storage, primitive metadata and unavailable storage never crash initialization', async t => {
  for (const meta of ['true', '1', '"oops"', '[1,2]', '{']) {
    const {store} = fixture(t, {storage: new MemoryStorage({[K.meta]: meta, [K.legacy]: '{'}), config: {}});
    await store.init(); assert.deepEqual(store.getSnapshot().ids, []); store.toggle(repo(1)); assert.deepEqual(store.getSnapshot().ids, [1]);
  }
  const {store} = fixture(t, {storage: {getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }}, config: {}});
  await store.init(); store.toggle(repo(2));
  assert.deepEqual(store.getSnapshot().ids, [2]);
  assert.equal(store.getSnapshot().error, 'storage_unavailable');
});

test('partial quota failures never mark an unwritten legacy migration complete and keep its in-memory data for login', async t => {
  class PartialStorage extends MemoryStorage {
    constructor() { super({[K.legacy]: '[1]'}); this.failAnonymous = true; }
    setItem(key, value) { if (this.failAnonymous && key === K.anonymous) throw new Error('quota exceeded'); super.setItem(key, value); }
  }
  const storage = new PartialStorage(), local = fixture(t, {storage, config: {}});
  await local.store.init();
  assert.deepEqual(local.store.getSnapshot().ids, [1]);
  assert.notEqual(JSON.parse(storage.getItem(K.meta))?.migratedLegacy, true);
  assert.equal(storage.getItem(K.backup), '[1]');
  storage.failAnonymous = false;
  const reloaded = fixture(t, {storage, config: {}}); await reloaded.store.init();
  assert.deepEqual(reloaded.store.getSnapshot().ids, [1]);
  const loginStorage = new PartialStorage(), signedIn = fixture(t, {storage: loginStorage, user: ALICE});
  await signedIn.store.init();
  assert.deepEqual(signedIn.store.getSnapshot().ids, [1]);
  assert.equal(signedIn.server.rows.get(`${ALICE.id}:1`).deleted, false, 'failed anonymous write does not erase migration before authentication');
});

test('only public browser keys and HTTPS or localhost configurations are accepted', () => {
  const jwt = role => `header.${Buffer.from(JSON.stringify({role})).toString('base64url')}.signature`;
  assert.equal(validConfiguration(CONFIG), true);
  assert.equal(validConfiguration({...CONFIG, url: 'http://localhost:54321'}), true);
  for (const config of [{...CONFIG, url: 'http://evil.example'}, {...CONFIG, url: 'https://user:password@example.com'},
    {...CONFIG, publishableKey: 'sb_secret_hidden'}, {...CONFIG, publishableKey: jwt('service_role')}, {...CONFIG, publishableKey: 'random'}]) assert.equal(validConfiguration(config), false);
  assert.equal(validConfiguration({...CONFIG, publishableKey: jwt('anon')}), true);
});

test('configured signed-out initialization emits local state and uses official SDK PKCE without repository scopes', async t => {
  let replaced;
  const {store, client, changes} = fixture(t, {location: {href: 'https://agentskills.media/?code=consumed&error_description=private#mcp'},
    history: {replaceState(_state, _title, value) { replaced = value; }}});
  await store.init();
  assert.equal(changes.at(-1).status, 'local');
  assert.equal(changes.at(-1).user, null);
  assert.equal(client.options.auth.flowType, 'pkce');
  assert.equal(client.options.auth.storageKey, K.auth);
  assert.equal(replaced, 'https://agentskills.media/#mcp');
  await store.signIn();
  assert.deepEqual(client.loginRequest, {provider: 'github', options: {redirectTo: 'https://agentskills.media/#mcp'}});
});

test('failed authentication cleans consumed query parameters and OAuth error or token fragments before retry', async t => {
  for (const [href, cleaned] of [
    ['https://agentskills.media/?code=single-use&error=failed#frameworks', 'https://agentskills.media/#frameworks'],
    ['https://agentskills.media/?error_code=bad#error=access_denied&error_description=private', 'https://agentskills.media/'],
    ['https://agentskills.media/#access_token=private&refresh_token=private&token_type=bearer', 'https://agentskills.media/'],
  ]) {
    let replaced;
    const server = fakeBackend(), client = server.client();
    client.auth.getSession = async () => ({data: {session: null}, error: {message: 'PKCE exchange failed'}});
    const {store} = fixture(t, {server, client, location: {href}, history: {replaceState(_state, _title, url) { replaced = url; }}});
    await store.init();
    assert.equal(store.getSnapshot().status, 'error'); assert.equal(replaced, cleaned);
    await store.signIn();
    assert.equal(client.loginRequest.options.redirectTo, cleaned, 'OAuth retry does not forward stale errors or tokens');
  }
});

test('first GitHub login merges local and cloud favorites, another device restores them and logout preserves cloud data', async t => {
  const server = fakeBackend(); server.put(ALICE, 2);
  const first = fixture(t, {server, user: ALICE, storage: new MemoryStorage({[K.legacy]: '[1]'})});
  await first.store.init();
  assert.deepEqual(first.store.getSnapshot().ids, [1, 2]);
  const second = fixture(t, {server, user: ALICE}); await second.store.init();
  assert.deepEqual(second.store.getSnapshot().ids, [1, 2]);
  await first.store.signOut();
  assert.equal(first.store.getSnapshot().user, null);
  assert.deepEqual(first.store.getSnapshot().ids, []);
  assert.deepEqual(first.client.signOutOptions, {scope: 'local'});
  assert.equal(server.rows.size, 2);
});

test('account switching isolates cached data and pending changes, without importing another account favorites', async t => {
  const server = fakeBackend();
  const {store, client, storage} = fixture(t, {server, user: ALICE, storage: new MemoryStorage({[K.legacy]: '[1]'})});
  await store.init();
  server.offline = true; store.toggle(repo(2)); await store.sync();
  assert.equal(store.getSnapshot().pendingCount, 1);
  client.emit(BOB); await store.sync();
  assert.deepEqual(store.getSnapshot().ids, []); assert.equal(store.getSnapshot().user.login, 'bob');
  server.offline = false; store.toggle(repo(3)); await store.sync();
  assert.deepEqual(store.getSnapshot().ids, [3]);
  client.emit(ALICE); await store.sync();
  assert.deepEqual(store.getSnapshot().ids, [1, 2]);
  assert.equal(JSON.parse(storage.getItem(K.meta)).claimedBy, ALICE.id);
  assert.equal(server.rows.has(`${BOB.id}:1`), false);
  assert.equal(server.rows.has(`${BOB.id}:2`), false);
});

test('offline additions and deletions persist across reload and retry as per-record tombstones', async t => {
  const server = fakeBackend(); server.put(ALICE, 1); server.put(ALICE, 2);
  const first = fixture(t, {server, user: ALICE}); await first.store.init();
  server.offline = true; first.store.toggle(1); first.store.toggle(repo(3)); await first.store.sync();
  assert.deepEqual(first.store.getSnapshot().ids, [2, 3]);
  assert.equal(first.store.getSnapshot().status, 'offline');
  assert.equal(first.store.getSnapshot().pendingCount, 2);
  first.store.destroy();
  const second = fixture(t, {server, user: ALICE, storage: first.storage}); await second.store.init();
  assert.deepEqual(second.store.getSnapshot().ids, [2, 3]);
  server.offline = false; await second.store.sync();
  assert.equal(second.store.getSnapshot().pendingCount, 0);
  assert.equal(server.rows.get(`${ALICE.id}:1`).deleted, true);
  assert.deepEqual(server.rows.get(`${ALICE.id}:1`).repository, {}, 'cloud deletion removes public metadata');
  assert.equal(server.rows.get(`${ALICE.id}:2`).deleted, false, 'unrelated cloud favorites remain untouched');
  assert.equal(server.rows.get(`${ALICE.id}:3`).deleted, false);
});

test('quota-blocked unsynced changes remain isolated in memory through logout and account switching', async t => {
  class PartialStorage extends MemoryStorage {
    setItem(key, value) { if (this.failAccounts && key.startsWith(K.account)) throw new Error('quota exceeded'); super.setItem(key, value); }
  }
  const storage = new PartialStorage(), {store, server, client} = fixture(t, {storage, user: ALICE});
  await store.init(); storage.failAccounts = true; server.offline = true;
  store.toggle(repo(2)); await store.sync();
  assert.deepEqual(store.getSnapshot().ids, [2]); assert.equal(store.getSnapshot().pendingCount, 1);
  await store.signOut(); client.emit(BOB); await store.sync();
  assert.deepEqual(store.getSnapshot().ids, []); store.toggle(repo(3)); await store.sync();
  client.emit(ALICE); await store.sync();
  assert.deepEqual(store.getSnapshot().ids, [2]); assert.equal(store.getSnapshot().pendingCount, 1);
  storage.failAccounts = false; server.offline = false; await store.sync();
  assert.equal(store.getSnapshot().pendingCount, 0); assert.equal(server.rows.get(`${ALICE.id}:2`).deleted, false);
  client.emit(BOB); await store.sync();
  assert.deepEqual(store.getSnapshot().ids, [3]); assert.equal(server.rows.get(`${BOB.id}:3`).deleted, false);
});

test('a toggle during an in-flight write is not acknowledged by an older operation', async t => {
  const {store, server} = fixture(t, {user: ALICE}); await store.init();
  const started = deferred(), release = deferred(); let blocked = false;
  server.beforeWrite = async () => { if (!blocked) { blocked = true; started.resolve(); await release.promise; } };
  store.toggle(repo(1)); const syncing = store.sync(); await started.promise;
  store.toggle(1); store.toggle(repo(1)); store.toggle(1);
  release.resolve(); await syncing;
  assert.deepEqual(store.getSnapshot().ids, []);
  assert.equal(store.getSnapshot().pendingCount, 0);
  assert.equal(server.rows.get(`${ALICE.id}:1`).deleted, true);
  assert.equal(server.writes.at(-1)[0].deleted, true);
});

test('an old account response cannot replace the newly signed-in account cache', async t => {
  const server = fakeBackend(); server.put(ALICE, 1); server.put(BOB, 2);
  const {store, client} = fixture(t, {server, user: ALICE}); await store.init();
  const started = deferred(), release = deferred(); let blocked = false;
  server.beforeRead = async ({userId}) => { if (userId === ALICE.id && !blocked) { blocked = true; started.resolve(); await release.promise; } };
  const oldSync = store.sync(); await started.promise;
  client.emit(BOB); await store.sync();
  assert.deepEqual(store.getSnapshot().ids, [2]);
  release.resolve(); await oldSync;
  assert.equal(store.getSnapshot().user.id, BOB.id);
  assert.deepEqual(store.getSnapshot().ids, [2]);
});

test('a write finishing after account switch does not acknowledge or populate the other account', async t => {
  const server = fakeBackend(); server.put(BOB, 2);
  const {store, client} = fixture(t, {server, user: ALICE}); await store.init();
  const started = deferred(), release = deferred(); let blocked = false;
  server.beforeWrite = async batch => { if (batch[0].user_id === ALICE.id && !blocked) { blocked = true; started.resolve(); await release.promise; } };
  store.toggle(repo(1)); const oldSync = store.sync(); await started.promise;
  client.emit(BOB); await store.sync();
  release.resolve(); await oldSync;
  assert.equal(store.getSnapshot().user.id, BOB.id); assert.deepEqual(store.getSnapshot().ids, [2]);
  client.emit(ALICE); await store.sync();
  assert.deepEqual(store.getSnapshot().ids, [1]); assert.equal(store.getSnapshot().pendingCount, 0);
});

test('all cloud favorites are paginated and writes are bounded rather than replacing a table', async t => {
  const server = fakeBackend();
  for (let id = 1; id <= 1001; id += 1) server.put(ALICE, id);
  const {store} = fixture(t, {server, user: ALICE, catalog: () => []}); await store.init();
  assert.equal(store.getSnapshot().ids.length, 1001);
  assert.deepEqual(server.reads.slice(0, 3).map(read => read.start), [0, 500, 1000]);
  for (let id = 1002; id <= 1120; id += 1) store.toggle(repo(id));
  await store.sync();
  assert.equal(store.getSnapshot().ids.length, 1120);
  assert.ok(server.writes.every(batch => batch.length <= 100));
  assert.equal(server.rows.size, 1120);
});

test('untrusted cloud fields are whitelisted and malformed IDs cannot create links or overwrite another identity', async t => {
  const server = fakeBackend();
  server.put(ALICE, 100, {id: 999, full_name: '<img/onerror=evil>', url: 'javascript:alert(1)', description: 'x'.repeat(9000), sources: ['skills', 'evil'], private: 'secret'});
  server.put(ALICE, -1, repo(1));
  server.put(ALICE, Number.MAX_SAFE_INTEGER + 1, repo(1));
  const {store} = fixture(t, {server, user: ALICE, catalog: () => []}); await store.init();
  const snapshot = store.getSnapshot(); assert.deepEqual(snapshot.ids, [100]);
  assert.equal(snapshot.records[100].id, 100); assert.equal(snapshot.records[100].url, '');
  assert.equal(snapshot.records[100].description.length, 4000);
  assert.deepEqual(snapshot.records[100].sources, ['skills']);
  assert.equal(snapshot.records[100].private, undefined);
  snapshot.records[100].description = 'changed';
  assert.notEqual(store.getSnapshot().records[100].description, 'changed', 'snapshots cannot mutate the cache');
  assert.equal(sanitizeRepository({id: 1, url: 'https://evil.example/team/repo'}).url, '');
  assert.equal(sanitizeRepository({id: 1, full_name: '../repository'}).url, '', 'dot segments cannot escape the GitHub repository path');
  assert.equal(sanitizeRepository({id: 1, full_name: 'team/..'}).url, '');
});

test('favorite snapshots survive catalog removal and cross-board sources are combined by repository ID', async t => {
  let catalog = [repo(1), repo(1, {sources: ['mcp']})];
  const {store} = fixture(t, {user: ALICE, catalog: () => catalog}); await store.init(); store.toggle(1, 'research'); await store.sync();
  assert.deepEqual(store.getSnapshot().records[1].sources.sort(), ['mcp', 'research', 'skills']);
  catalog = [];
  assert.equal(store.getSnapshot().records[1].full_name, 'team/repo-1');
});

test('storage events merge anonymous additions and tombstones across tabs without resurrecting removed favorites', async t => {
  const storage = new MemoryStorage(), first = fixture(t, {storage, config: {}}), second = fixture(t, {storage, config: {}});
  await first.store.init(); await second.store.init();
  first.store.toggle(repo(1)); second.store.toggle(repo(2));
  storageEvent(first.eventTarget, K.anonymous);
  assert.deepEqual(first.store.getSnapshot().ids, [1, 2]);
  first.store.toggle(1); storageEvent(second.eventTarget, K.anonymous);
  assert.deepEqual(second.store.getSnapshot().ids, [2]);
  second.store.toggle(repo(3)); storageEvent(first.eventTarget, K.anonymous);
  assert.deepEqual(first.store.getSnapshot().ids, [2, 3]);
});

test('two signed-in tabs merge pending changes and share acknowledgements before later deletions', async t => {
  const storage = new MemoryStorage(), server = fakeBackend(); server.put(ALICE, 1);
  const first = fixture(t, {storage, server, user: ALICE}), second = fixture(t, {storage, server, user: ALICE});
  await first.store.init(); await second.store.init(); server.offline = true;
  first.store.toggle(repo(2)); second.store.toggle(repo(3)); await first.store.sync(); await second.store.sync();
  storageEvent(first.eventTarget, K.account + ALICE.id);
  assert.deepEqual(first.store.getSnapshot().ids, [1, 2, 3]);
  server.offline = false; await first.store.sync();
  storageEvent(second.eventTarget, K.account + ALICE.id); await second.store.sync();
  assert.equal(second.store.getSnapshot().pendingCount, 0);
  second.store.toggle(2); await second.store.sync();
  storageEvent(first.eventTarget, K.account + ALICE.id); await first.store.sync();
  assert.deepEqual(first.store.getSnapshot().ids, [1, 3]);
  assert.equal(server.rows.get(`${ALICE.id}:2`).deleted, true);
});

test('per-repository acknowledgements prevent an idle tab resurrecting deletion after over 1000 other changes', async t => {
  const storage = new MemoryStorage(), server = fakeBackend();
  const idle = fixture(t, {storage, server, user: ALICE}), active = fixture(t, {storage, server, user: ALICE});
  await idle.store.init(); await active.store.init();
  server.offline = true; idle.store.toggle(repo(1)); await idle.store.sync();
  server.offline = false; await active.store.sync();
  active.store.toggle(1); await active.store.sync();
  for (let change = 0; change < 1001; change += 1) { active.store.toggle(repo(2)); await active.store.sync(); }
  await idle.store.sync();
  assert.equal(idle.store.getSnapshot().ids.includes(1), false);
  assert.equal(server.rows.get(`${ALICE.id}:1`).deleted, true);
  const saved = JSON.parse(storage.getItem(K.account + ALICE.id));
  assert.equal(Object.keys(saved.acknowledged).length, 2, 'acknowledgement size grows with repositories, not number of clicks');
});

test('online and focus events retry pending changes; destroy removes listeners and auth subscription', async t => {
  const {store, server, eventTarget, client} = fixture(t, {user: ALICE}); await store.init();
  server.offline = true; store.toggle(repo(1)); await store.sync();
  server.offline = false; eventTarget.dispatchEvent(new Event('online')); await store.sync();
  assert.equal(store.getSnapshot().pendingCount, 0);
  server.put(ALICE, 2); eventTarget.dispatchEvent(new Event('focus')); await store.sync();
  assert.deepEqual(store.getSnapshot().ids, [1, 2]);
  store.destroy(); assert.equal(client.unsubscribed, true);
});
