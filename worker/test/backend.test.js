import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createWorker, sanitizeRepository} from '../src/index.js';

const origin = 'https://agentskills.media';
const migration = readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8');

function d1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(migration);
  function statement(sql, bindings = []) {
    return {
      bind: (...values) => statement(sql, values),
      async first() { return sqlite.prepare(sql).get(...bindings) || null; },
      async all() { return {success: true, results: sqlite.prepare(sql).all(...bindings)}; },
      async run() { const result = sqlite.prepare(sql).run(...bindings); return {success: true, meta: {changes: result.changes}}; }
    };
  }
  return {sqlite, prepare: sql => statement(sql), async batch(statements) {
    sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const item of statements) results.push(await item.run());
      sqlite.exec('COMMIT'); return results;
    } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  }};
}
function fixture(t, extras = {}) {
  const DB = d1(); t.after(() => DB.sqlite.close());
  let time = Date.parse('2026-10-31T12:00:00Z');
  let identity = {id: 1, login: 'alice', avatar_url: 'https://avatars.githubusercontent.com/u/1'};
  const calls = [];
  const worker = createWorker({now: () => time, fetch: async (url, options) => {
    calls.push({url, options});
    if (url === 'https://github.com/login/oauth/access_token') {
      const body = new URLSearchParams(options.body);
      assert.equal(body.get('client_secret'), 'github-server-secret');
      assert.ok(body.get('code_verifier'));
      return Response.json({access_token: 'github-access-token-never-persist'});
    }
    assert.equal(url, 'https://api.github.com/user');
    assert.equal(options.headers.Authorization, 'Bearer github-access-token-never-persist');
    return Response.json(identity);
  }});
  const env = {DB, PUBLIC_ORIGIN: origin, GITHUB_CLIENT_ID: 'public-client-id',
    GITHUB_CLIENT_SECRET: 'github-server-secret', SESSION_SECRET: 'a-test-session-secret-of-at-least-32-bytes', ...extras};
  const handle = (path, options) => worker.fetch(new Request(origin + path, options), env);
  async function begin(returnTo = '/') {
    const response = await handle('/api/auth/github?return_to=' + encodeURIComponent(returnTo));
    assert.equal(response.status, 302);
    const url = new URL(response.headers.get('Location'));
    const binding = response.headers.getSetCookie().find(value => value.startsWith('__Host-agent_oauth='));
    assert.ok(binding.includes('HttpOnly') && binding.includes('Secure') && binding.includes('SameSite=Lax'));
    return {response, url, cookie: binding.split(';')[0]};
  }
  async function complete(attempt, override = {}) {
    const query = new URLSearchParams({state: attempt.url.searchParams.get('state'), code: 'valid-code', ...override});
    return handle('/api/auth/github/callback?' + query, {headers: {Cookie: attempt.cookie}});
  }
  async function login(id = 1, login = 'alice') {
    identity = {id, login, avatar_url: `https://avatars.githubusercontent.com/u/${id}`};
    const attempt = await begin('/#skills');
    const response = await complete(attempt);
    assert.equal(new URL(response.headers.get('Location')).hash, '#skills');
    const cookie = response.headers.getSetCookie().find(value => value.startsWith('__Host-agent_session='));
    assert.ok(cookie, response.headers.get('Location'));
    return {id: String(id), cookie: cookie.split(';')[0], response};
  }
  function write(path, account, method = 'PUT', body, extraHeaders = {}) {
    return handle(path, {method, headers: {Origin: origin, 'Sec-Fetch-Site': 'same-origin',
      Cookie: account.cookie, 'X-Favorites-User': account.id, ...(body === undefined ? {} : {'Content-Type': 'application/json'}), ...extraHeaders},
      ...(body === undefined ? {} : {body: JSON.stringify(body)})});
  }
  async function bootstrap(account) {
    const response = await handle('/api/bootstrap', {headers: {Cookie: account?.cookie || ''}});
    return {response, data: await response.json()};
  }
  return {env, worker, handle, begin, complete, login, write, bootstrap, calls, advance: seconds => {time += seconds * 1000;}};
}
const repo = (id = 101, extra = {}) => ({id, full_name: 'owner/tool', url: 'https://github.com/owner/tool',
  description: 'A public repository', sources: ['skills'], stars: 123, ...extra});

test('unconfigured backend keeps health/bootstrap honest and rejects login', async t => {
  const f = fixture(t, {GITHUB_CLIENT_SECRET: ''});
  assert.deepEqual(await (await f.handle('/api/health')).json(), {ok: true, authConfigured: false});
  assert.deepEqual((await f.bootstrap()).data, {authConfigured: false, user: null, favorites: [], nextCursor: null});
  assert.equal((await f.handle('/api/auth/github')).status, 503);
});

test('OAuth uses PKCE, binds state to this browser, creates only an HttpOnly site session', async t => {
  const f = fixture(t), attempt = await f.begin('/#mcp');
  assert.equal(attempt.url.origin, 'https://github.com');
  assert.equal(attempt.url.searchParams.get('scope'), null);
  assert.equal(attempt.url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(attempt.url.searchParams.get('redirect_uri'), origin + '/api/auth/github/callback');
  const stolen = await f.handle('/api/auth/github/callback?' + new URLSearchParams({state: attempt.url.searchParams.get('state'), code: 'x'}));
  assert.equal(stolen.status, 302);
  assert.equal(stolen.headers.get('Set-Cookie'), null, 'invalid callbacks cannot erase a real browser’s pending login');
  assert.equal(f.calls.length, 0, 'a stolen signed state alone is insufficient');
  const response = await f.complete(attempt);
  assert.equal(response.headers.get('Location'), origin + '/#mcp');
  const tokenCall = f.calls[0];
  const verifier = new URLSearchParams(tokenCall.options.body).get('code_verifier');
  const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))).toString('base64url');
  assert.equal(challenge, attempt.url.searchParams.get('code_challenge'));
  const cookies = response.headers.getSetCookie().join('\n');
  assert.match(cookies, /__Host-agent_session=.+HttpOnly; SameSite=Lax; Max-Age=2592000; Secure/);
  assert.doesNotMatch(cookies, /github-access-token|github-server-secret/);
  for (const table of ['users', 'sessions', 'oauth_states']) {
    assert.doesNotMatch(JSON.stringify(f.env.DB.sqlite.prepare(`SELECT * FROM ${table}`).all()), /github-access-token-never-persist/);
  }
  assert.equal(f.env.DB.sqlite.prepare('SELECT count(*) AS n FROM oauth_states').get().n, 0);
  const replay = await f.complete(attempt);
  assert.equal(new URL(replay.headers.get('Location')).searchParams.get('auth_error'), 'invalid_state');
  assert.equal(f.calls.length, 2, 'replay never reaches GitHub');
});

test('OAuth rejects modified, expired and other-browser state before calling GitHub', async t => {
  const f = fixture(t), first = await f.begin(), second = await f.begin();
  const wrongBrowser = await f.complete({...first, cookie: second.cookie});
  assert.match(wrongBrowser.headers.get('Location'), /auth_error=invalid_state/);
  const modified = await f.complete(first, {state: first.url.searchParams.get('state').slice(0, -1) + '!'});
  assert.match(modified.headers.get('Location'), /auth_error=invalid_state/);
  f.advance(601);
  const expired = await f.complete(first);
  assert.match(expired.headers.get('Location'), /auth_error=invalid_state/);
  assert.equal(f.calls.length, 0);
});

test('return destinations are local paths and denial returns a safe error', async t => {
  const f = fixture(t);
  for (const target of ['//evil.example/', '/\\evil.example/', 'https://evil.example', '/api/auth/github', '/\nevil']) {
    const attempt = await f.begin(target), response = await f.complete(attempt, {error: 'access_denied'});
    const url = new URL(response.headers.get('Location'));
    assert.equal(url.origin, origin); assert.equal(url.pathname, '/');
    assert.equal(url.searchParams.get('auth_error'), 'access_denied');
  }
  assert.equal(f.calls.length, 0);
});

test('favorites are private to the cookie user and writes require the expected account', async t => {
  const f = fixture(t), alice = await f.login(), bob = await f.login(2, 'bob');
  assert.equal((await f.write('/api/favorites/101', alice, 'PUT', {repository: repo()})).status, 200);
  assert.deepEqual((await f.bootstrap(alice)).data.favorites.map(row => row.repo_id), [101]);
  assert.deepEqual((await f.bootstrap(bob)).data.favorites, []);
  assert.equal((await f.write('/api/favorites/101', bob, 'DELETE')).status, 200);
  assert.equal((await f.bootstrap(alice)).data.favorites.length, 1, 'Bob cannot remove Alice favorites');
  const mismatch = await f.write('/api/favorites/202', bob, 'PUT', {repository: repo(202)}, {'X-Favorites-User': '1'});
  assert.equal(mismatch.status, 409); assert.equal((await mismatch.json()).error, 'account_changed');
  const missing = await f.write('/api/favorites/202', bob, 'PUT', {repository: repo(202)}, {'X-Favorites-User': ''});
  assert.equal(missing.status, 400);
});

test('cross-origin and cross-site mutations are rejected even with a valid session', async t => {
  const f = fixture(t), alice = await f.login();
  for (const extra of [{Origin: 'https://evil.example'}, {Origin: ''}, {'Sec-Fetch-Site': 'cross-site'}, {'Sec-Fetch-Site': 'same-site'}]) {
    assert.equal((await f.write('/api/favorites/101', alice, 'PUT', {repository: repo()}, extra)).status, 403);
  }
  assert.equal((await f.bootstrap(alice)).data.favorites.length, 0);
  const anonymous = await f.handle('/api/favorites/101', {method: 'DELETE', headers: {Origin: origin}});
  assert.equal(anonymous.status, 401);
  assert.equal((await f.handle('/api/favorites/101', {method: 'OPTIONS'})).headers.get('Access-Control-Allow-Origin'), null);
});

test('logout revokes the current session immediately, without deleting favorites', async t => {
  const f = fixture(t), alice = await f.login();
  await f.write('/api/favorites/101', alice, 'PUT', {repository: repo()});
  const response = await f.write('/api/auth/logout', alice, 'POST');
  assert.match(response.headers.get('Set-Cookie'), /Max-Age=0/);
  assert.equal((await f.bootstrap(alice)).data.user, null);
  assert.equal((await f.write('/api/favorites/101', alice, 'DELETE')).status, 401);
  const again = await f.login();
  assert.equal((await f.bootstrap(again)).data.favorites.length, 1);
});

test('expired sessions stop authorizing writes and bootstrap does not leak identity', async t => {
  const f = fixture(t), alice = await f.login(); f.advance(30 * 86400 + 1);
  assert.equal((await f.bootstrap(alice)).data.user, null);
  assert.equal((await f.write('/api/favorites/101', alice, 'DELETE')).status, 401);
});

test('local imports preserve existing cloud values and receipts prevent retry resurrection', async t => {
  const f = fixture(t), alice = await f.login();
  await f.write('/api/favorites/101', alice, 'PUT', {repository: repo(101, {description: 'cloud value'})});
  const body = {migration_id: 'a-stable-browser-migration', batch_id: 0,
    favorites: [{repo_id: 101, repository: repo(101, {description: 'old local'})}, {repo_id: 202, repository: repo(202)}]};
  assert.equal((await f.write('/api/favorites/import', alice, 'POST', body)).status, 200);
  let favorites = (await f.bootstrap(alice)).data.favorites;
  assert.equal(favorites.length, 2); assert.equal(favorites[0].repository.description, 'cloud value');
  await f.write('/api/favorites/202', alice, 'DELETE');
  const retry = await f.write('/api/favorites/import', alice, 'POST', body);
  assert.deepEqual(await retry.json(), {ok: true, replayed: true});
  favorites = (await f.bootstrap(alice)).data.favorites;
  assert.deepEqual(favorites.map(item => item.repo_id), [101]);
});

test('invalid identifiers, wrong body types, oversized streams and invalid import batches fail', async t => {
  const f = fixture(t), alice = await f.login();
  for (const id of ['0', '-1', '9007199254740992', '1e2', '1 OR 1=1']) {
    assert.ok((await f.write('/api/favorites/' + encodeURIComponent(id), alice, 'PUT', {repository: repo()})).status >= 400);
  }
  assert.equal((await f.write('/api/favorites/101', alice, 'PUT', {repository: null})).status, 400);
  assert.equal((await f.write('/api/favorites/101', alice, 'PUT', {repository: repo(101, {description: 'x'.repeat(33000)})})).status, 413);
  assert.equal((await f.write('/api/favorites/import', alice, 'POST', {favorites: Array(101).fill({repo_id: 1, repository: repo(1)})})).status, 400);
  assert.equal((await f.bootstrap(alice)).data.favorites.length, 0);
});

test('untrusted links and metadata are sanitized; unknown legacy repository IDs remain representable', () => {
  const clean = sanitizeRepository(repo(5, {url: 'javascript:alert(1)', description: '<img onerror=bad>', private_token: 'secret', sources: ['skills', '__proto__', 'other']}));
  assert.equal(clean.url, 'https://github.com/owner/tool'); assert.equal(clean.private_token, undefined);
  assert.equal(clean.description, '<img onerror=bad>'); assert.deepEqual(clean.sources, ['skills']);
  assert.equal(sanitizeRepository({id: 5, full_name: '../bad'}).url, '');
  assert.equal(sanitizeRepository({id: 5}).url, '');
});

test('health checks the configured database schema instead of claiming an uninitialized service is ready', async t => {
  const f = fixture(t);
  assert.deepEqual(await (await f.handle('/api/health')).json(), {ok: true, authConfigured: true});
  f.env.DB.sqlite.exec('DROP TABLE favorites');
  assert.equal((await f.handle('/api/health')).status, 503);
});

test('keyset pages restore more than 5000 favorites without truncation or cross-account pages', async t => {
  const f = fixture(t), alice = await f.login(), bob = await f.login(2, 'bob');
  const insert = f.env.DB.sqlite.prepare('INSERT INTO favorites (github_id,repo_id,repository,created_at,updated_at) VALUES (?,?,?,?,?)');
  f.env.DB.sqlite.exec('BEGIN');
  for (let id = 1; id <= 5017; id++) insert.run(1, id, JSON.stringify(repo(id)), 1, 1);
  insert.run(2, 99, JSON.stringify(repo(99)), 1, 1);
  f.env.DB.sqlite.exec('COMMIT');
  const ids = [];
  let cursor = null, pageCount = 0;
  do {
    const response = await f.handle('/api/bootstrap' + (cursor === null ? '' : `?after=${cursor}`), {
      headers: {Cookie: alice.cookie, ...(pageCount ? {'X-Favorites-User': alice.id} : {})}
    });
    assert.equal(response.status, 200);
    const page = await response.json();
    assert.equal(page.user.id, alice.id);
    assert.ok(page.favorites.length <= 500);
    ids.push(...page.favorites.map(item => item.repo_id));
    if (page.nextCursor !== null) assert.ok(page.nextCursor > (cursor || 0));
    cursor = page.nextCursor; pageCount++;
  } while (cursor !== null);
  assert.equal(pageCount, 11);
  assert.deepEqual(ids, Array.from({length: 5017}, (_, index) => index + 1));
  const changed = await f.handle('/api/bootstrap?after=500', {headers: {Cookie: bob.cookie, 'X-Favorites-User': alice.id}});
  assert.equal(changed.status, 409); assert.equal((await changed.json()).error, 'account_changed');
  for (const value of ['0', 'abc', '-1', '9007199254740992', '']) {
    assert.equal((await f.handle(`/api/bootstrap?after=${value}`, {headers: {Cookie: alice.cookie}})).status, 400);
  }
  f.advance(30 * 86400 + 1);
  const expired = await f.handle('/api/bootstrap?after=500', {headers: {Cookie: alice.cookie, 'X-Favorites-User': alice.id}});
  assert.equal(expired.status, 409);
});
