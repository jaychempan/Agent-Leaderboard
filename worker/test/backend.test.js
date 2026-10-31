import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createWorker, sanitizeRepository} from '../src/index.js';

const origin = 'https://agentskills.media';
const apiOrigin = 'https://agent-leaderboard-api.example.workers.dev';
const migrations = ['0001_initial.sql', '0002_cross_origin_login.sql'].map(name => readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8'));
const random = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
const hash = async value => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))).toString('base64url');

function d1() {
  const sqlite = new DatabaseSync(':memory:');
  for (const migration of migrations) sqlite.exec(migration);
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
  const env = {DB, PUBLIC_ORIGIN: origin, API_ORIGIN: apiOrigin, GITHUB_CLIENT_ID: 'public-client-id',
    GITHUB_CLIENT_SECRET: 'github-server-secret', SESSION_SECRET: 'a-test-session-secret-of-at-least-32-bytes', ...extras};
  const handle = (path, options) => worker.fetch(new Request(apiOrigin + path, options), env);
  async function begin(returnTo = '/') {
    const verifier = random(), state = random(), challenge = await hash(verifier);
    const response = await handle('/api/auth/github?' + new URLSearchParams({return_to: returnTo, client_challenge: challenge, client_state: state}));
    assert.equal(response.status, 302);
    const url = new URL(response.headers.get('Location'));
    const binding = response.headers.getSetCookie().find(value => value.startsWith('__Host-agent_oauth='));
    assert.ok(binding.includes('HttpOnly') && binding.includes('Secure') && binding.includes('SameSite=Lax'));
    return {response, url, cookie: binding.split(';')[0], verifier, state, challenge};
  }
  async function complete(attempt, override = {}) {
    const query = new URLSearchParams({state: attempt.url.searchParams.get('state'), code: 'valid-code', ...override});
    return handle('/api/auth/github/callback?' + query, {headers: {Cookie: attempt.cookie}});
  }
  async function exchange(attempt, response, overrides = {}, extraHeaders = {}) {
    const url = new URL(response.headers.get('Location'));
    return handle('/api/auth/exchange', {method: 'POST', headers: {Origin: origin, 'Content-Type': 'application/json', ...extraHeaders},
      body: JSON.stringify({code: url.searchParams.get('login_code'), verifier: attempt.verifier, state: attempt.state, ...overrides})});
  }
  async function login(id = 1, login = 'alice') {
    identity = {id, login, avatar_url: `https://avatars.githubusercontent.com/u/${id}`};
    const attempt = await begin('/#skills');
    const response = await complete(attempt);
    assert.equal(new URL(response.headers.get('Location')).hash, '#skills');
    const exchanged = await exchange(attempt, response);
    assert.equal(exchanged.status, 200);
    const session = await exchanged.json();
    assert.match(session.token, /^[A-Za-z0-9_-]{43}$/);
    return {id: String(id), token: session.token, response, exchanged, session};
  }
  function write(path, account, method = 'PUT', body, extraHeaders = {}) {
    return handle(path, {method, headers: {Origin: origin, 'Sec-Fetch-Site': 'cross-site',
      Authorization: `Bearer ${account.token}`, 'X-Favorites-User': account.id, ...(body === undefined ? {} : {'Content-Type': 'application/json'}), ...extraHeaders},
      ...(body === undefined ? {} : {body: JSON.stringify(body)})});
  }
  async function bootstrap(account) {
    const response = await handle('/api/bootstrap', {headers: {Origin: origin, ...(account ? {Authorization: `Bearer ${account.token}`} : {})}});
    return {response, data: await response.json()};
  }
  return {env, worker, handle, begin, complete, exchange, login, write, bootstrap, calls, advance: seconds => {time += seconds * 1000;}};
}
const repo = (id = 101, extra = {}) => ({id, full_name: 'owner/tool', url: 'https://github.com/owner/tool',
  description: 'A public repository', sources: ['skills'], stars: 123, ...extra});

test('0002 upgrades the deployed schema without changing existing data', t => {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(migrations[0]);
  sqlite.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(1, 'alice', '', 1, 1);
  sqlite.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run('existing-session-hash', 1, 100, 1);
  sqlite.prepare('INSERT INTO oauth_states VALUES (?,?,?,?,?)').run('nonce-hash', 'browser-hash', 'backend-verifier', '/#saved', 100);
  sqlite.prepare('INSERT INTO favorites VALUES (?,?,?,?,?)').run(1, 101, JSON.stringify(repo()), 1, 1);
  sqlite.prepare('INSERT INTO favorite_imports VALUES (?,?,?)').run(1, 'stable-import:0', 1);
  sqlite.exec(migrations[1]);
  assert.equal(sqlite.prepare('SELECT login FROM users').get().login, 'alice');
  assert.equal(sqlite.prepare('SELECT token_hash FROM sessions').get().token_hash, 'existing-session-hash');
  assert.equal(sqlite.prepare('SELECT repo_id FROM favorites').get().repo_id, 101);
  assert.equal(sqlite.prepare('SELECT batch_key FROM favorite_imports').get().batch_key, 'stable-import:0');
  assert.equal(sqlite.prepare('SELECT client_challenge FROM oauth_states').get().client_challenge, null);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM login_exchanges').get().n, 0);
});

test('unconfigured backend keeps health/bootstrap honest and rejects login', async t => {
  const f = fixture(t, {GITHUB_CLIENT_SECRET: ''});
  assert.deepEqual(await (await f.handle('/api/health')).json(), {ok: true, authConfigured: false});
  assert.deepEqual((await f.bootstrap()).data, {authConfigured: false, user: null, favorites: [], nextCursor: null});
  assert.equal((await f.handle('/api/auth/github')).status, 503);
});

test('OAuth uses backend PKCE and browser binding; handoff requires the website tab PKCE before creating a bearer session', async t => {
  const f = fixture(t), attempt = await f.begin('/#mcp');
  assert.equal(attempt.url.origin, 'https://github.com');
  assert.equal(attempt.url.searchParams.get('scope'), null);
  assert.equal(attempt.url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(attempt.url.searchParams.get('redirect_uri'), apiOrigin + '/api/auth/github/callback');
  const stolen = await f.handle('/api/auth/github/callback?' + new URLSearchParams({state: attempt.url.searchParams.get('state'), code: 'x'}));
  assert.equal(stolen.status, 302);
  assert.equal(stolen.headers.get('Set-Cookie'), null, 'invalid callbacks cannot erase a real browser’s pending login');
  assert.equal(f.calls.length, 0, 'a stolen signed state alone is insufficient');
  const response = await f.complete(attempt);
  const destination = new URL(response.headers.get('Location'));
  assert.equal(destination.origin, origin); assert.equal(destination.hash, '#mcp');
  assert.equal(destination.searchParams.get('login_state'), attempt.state);
  const code = destination.searchParams.get('login_code');
  assert.match(code, /^[A-Za-z0-9_-]{43}$/);
  const tokenCall = f.calls[0];
  const verifier = new URLSearchParams(tokenCall.options.body).get('code_verifier');
  assert.equal(await hash(verifier), attempt.url.searchParams.get('code_challenge'));
  const cookies = response.headers.getSetCookie().join('\n');
  assert.match(cookies, /__Host-agent_oauth=; Path=\/; HttpOnly; SameSite=Lax; Max-Age=0; Secure/);
  assert.doesNotMatch(cookies, /agent_session/);
  assert.doesNotMatch(cookies, /github-access-token|github-server-secret/);
  assert.equal(f.env.DB.sqlite.prepare('SELECT count(*) AS n FROM sessions').get().n, 0, 'callback alone never creates a site session');
  const handoff = f.env.DB.sqlite.prepare('SELECT * FROM login_exchanges').get();
  assert.equal(handoff.code_hash, await hash(code));
  assert.equal(handoff.client_challenge, attempt.challenge);
  assert.equal(handoff.expires_at - handoff.created_at, 90);
  const exchanged = await f.exchange(attempt, response);
  assert.equal(exchanged.status, 200);
  const site = await exchanged.json();
  assert.equal(site.expiresAt, '2026-10-31T20:00:00.000Z');
  assert.deepEqual(site.user, {id: '1', login: 'alice', avatar_url: 'https://avatars.githubusercontent.com/u/1'});
  assert.equal(exchanged.headers.get('Set-Cookie'), null);
  assert.equal(f.env.DB.sqlite.prepare('SELECT token_hash FROM sessions').get().token_hash, await hash(site.token));
  assert.equal(f.env.DB.sqlite.prepare('SELECT count(*) AS n FROM login_exchanges').get().n, 0);
  for (const table of ['users', 'sessions', 'oauth_states', 'login_exchanges']) {
    assert.doesNotMatch(JSON.stringify(f.env.DB.sqlite.prepare(`SELECT * FROM ${table}`).all()), /github-access-token-never-persist/);
    assert.ok(!JSON.stringify(f.env.DB.sqlite.prepare(`SELECT * FROM ${table}`).all()).includes(site.token));
  }
  for (const location of [attempt.response.headers.get('Location'), response.headers.get('Location')]) {
    assert.doesNotMatch(location, /github-access-token|github-server-secret|session-secret/);
    assert.ok(!location.includes(site.token)); assert.ok(!location.includes(attempt.verifier));
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

test('login handoff resists wrong proof, state, code theft, replay and expiry without cookies', async t => {
  const f = fixture(t), attempt = await f.begin('/favorites?filter=skills#saved'), response = await f.complete(attempt);
  assert.equal(new URL(response.headers.get('Location')).searchParams.get('filter'), 'skills');
  for (const wrong of [{code: random()}, {verifier: random()}, {state: random()}, {code: ['x'.repeat(43)]}, {verifier: 'short'}]) {
    assert.equal((await f.exchange(attempt, response, wrong)).status, 400);
  }
  for (const Origin of ['', 'null', 'https://evil.example']) assert.equal((await f.exchange(attempt, response, {}, {Origin})).status, 403);
  assert.equal(f.env.DB.sqlite.prepare('SELECT count(*) AS n FROM sessions').get().n, 0);
  const results = await Promise.all([f.exchange(attempt, response), f.exchange(attempt, response)]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 400], 'atomic consume permits one exchange only');
  assert.equal(f.env.DB.sqlite.prepare('SELECT count(*) AS n FROM sessions').get().n, 1);
  assert.equal((await f.exchange(attempt, response)).status, 400);
  const expired = await f.begin(), expiredResponse = await f.complete(expired);
  f.advance(91);
  assert.equal((await f.exchange(expired, expiredResponse)).status, 400);
  assert.equal(f.env.DB.sqlite.prepare('SELECT count(*) AS n FROM sessions').get().n, 1);
});

test('login requires a frontend proof; legacy session cookies cannot authorize the API', async t => {
  const f = fixture(t);
  for (const query of ['', '?client_challenge=short&client_state=' + random(), '?client_challenge=' + random()]) {
    assert.equal((await f.handle('/api/auth/github' + query)).status, 400);
  }
  const alice = await f.login();
  const response = await f.handle('/api/bootstrap', {headers: {Origin: origin, Cookie: `__Host-agent_session=${alice.token}`}});
  assert.equal((await response.json()).user, null);
  assert.equal((await f.write('/api/favorites/101', alice, 'PUT', {repository: repo()}, {Authorization: ''})).status, 401);
});

test('return destinations are local paths and denial returns a safe error', async t => {
  const f = fixture(t);
  for (const target of ['//evil.example/', '/\\evil.example/', 'https://evil.example', '/api', '/api/auth/github', '/\nevil']) {
    const attempt = await f.begin(target), response = await f.complete(attempt, {error: 'access_denied'});
    const url = new URL(response.headers.get('Location'));
    assert.equal(url.origin, origin); assert.equal(url.pathname, '/');
    assert.equal(url.searchParams.get('auth_error'), 'access_denied');
  }
  assert.equal(f.calls.length, 0);
  const clean = await f.begin('/?login_code=stale&login_state=stale&code=old&state=old#skills');
  const location = new URL((await f.complete(clean)).headers.get('Location'));
  assert.notEqual(location.searchParams.get('login_code'), 'stale');
  assert.notEqual(location.searchParams.get('login_state'), 'stale');
  assert.equal(location.searchParams.has('code'), false); assert.equal(location.searchParams.has('state'), false);
});

test('favorites are private to the bearer user and writes require the expected account', async t => {
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

test('only the exact website Origin may make cross-site API calls; preflight is restricted', async t => {
  const f = fixture(t), alice = await f.login();
  for (const extra of [{Origin: 'https://evil.example'}, {Origin: ''}, {Origin: 'null'}, {Origin: 'https://agentskills.media.evil.example'}]) {
    const response = await f.write('/api/favorites/101', alice, 'PUT', {repository: repo()}, extra);
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  }
  assert.equal((await f.bootstrap(alice)).data.favorites.length, 0);
  const accepted = await f.write('/api/favorites/101', alice, 'PUT', {repository: repo()});
  assert.equal(accepted.status, 200); assert.equal(accepted.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(accepted.headers.get('Access-Control-Allow-Credentials'), null);
  const anonymous = await f.handle('/api/favorites/101', {method: 'DELETE', headers: {Origin: origin}});
  assert.equal(anonymous.status, 401);
  assert.equal((await f.handle('/api/favorites/101', {method: 'OPTIONS'})).headers.get('Access-Control-Allow-Origin'), null);
  const check = headers => f.handle('/api/favorites/101', {method: 'OPTIONS', headers: {Origin: origin,
    'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'authorization, content-type, x-favorites-user', ...headers}});
  const allowed = await check({}); assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(allowed.headers.get('Access-Control-Allow-Credentials'), null);
  assert.equal(allowed.headers.get('Access-Control-Allow-Headers'), 'Authorization, Content-Type, X-Favorites-User');
  for (const headers of [{Origin: 'https://evil.example'}, {'Access-Control-Request-Method': 'POST'}, {'Access-Control-Request-Headers': 'cookie'}, {'Access-Control-Request-Private-Network': 'true'}]) {
    assert.equal((await check(headers)).status, 403);
  }
  const badHost = await f.worker.fetch(new Request(origin + '/api/health'), f.env);
  assert.equal(badHost.status, 403);
  const forbiddenRead = await f.handle('/api/bootstrap', {headers: {Origin: 'https://evil.example', Authorization: `Bearer ${alice.token}`}});
  assert.equal(forbiddenRead.status, 403);
});

test('same-origin local browser bootstrap may omit Origin; cross-origin and production requests may not', async t => {
  const f = fixture(t), alice = await f.login(), local = 'http://127.0.0.1:8792';
  const env = {...f.env, PUBLIC_ORIGIN: local, API_ORIGIN: local};
  const read = (extra = {}, selectedEnv = env) => f.worker.fetch(new Request(selectedEnv.API_ORIGIN + '/api/bootstrap',
    {headers: {Authorization: `Bearer ${alice.token}`, ...extra}}), selectedEnv);
  for (const headers of [{'Sec-Fetch-Site': 'same-origin'}, {Referer: local + '/?view=skills#saved'}, {Origin: local}]) {
    const response = await read(headers);
    assert.equal(response.status, 200); assert.equal((await response.json()).user.id, alice.id);
  }
  for (const headers of [{}, {Origin: ''}, {Origin: 'null'}, {Origin: 'https://evil.example'},
    {'Sec-Fetch-Site': 'cross-site', Referer: local + '/'}, {Referer: 'http://localhost:8792/'}]) {
    assert.equal((await read(headers)).status, 403);
  }
  assert.equal((await read({'Sec-Fetch-Site': 'same-origin'}, f.env)).status, 403, 'cross-origin production still requires Origin');
  assert.equal((await read({'Sec-Fetch-Site': 'same-origin'}, {...f.env, API_ORIGIN: origin})).status, 403, 'HTTPS production gets no local exception');
  assert.equal((await f.worker.fetch(new Request(local + '/api/auth/logout', {method: 'POST', headers: {
    Authorization: `Bearer ${alice.token}`, 'X-Favorites-User': alice.id, 'Sec-Fetch-Site': 'same-origin'}}), env)).status, 403, 'write checks remain unchanged');
});

test('logout revokes the current session immediately, without deleting favorites', async t => {
  const f = fixture(t), alice = await f.login();
  const otherSession = await f.login();
  await f.write('/api/favorites/101', alice, 'PUT', {repository: repo()});
  const response = await f.write('/api/auth/logout', alice, 'POST');
  assert.equal(response.headers.get('Set-Cookie'), null);
  assert.equal((await f.bootstrap(alice)).data.user, null);
  assert.equal((await f.write('/api/favorites/101', alice, 'DELETE')).status, 401);
  assert.equal((await f.bootstrap(otherSession)).data.user.id, alice.id, 'logout revokes only the current token');
  const again = await f.login();
  assert.equal((await f.bootstrap(again)).data.favorites.length, 1);
});

test('expired sessions stop authorizing writes and bootstrap does not leak identity', async t => {
  const f = fixture(t), alice = await f.login(); f.advance(7 * 3600);
  assert.equal((await f.bootstrap(alice)).data.user.id, '1');
  f.advance(3601);
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
  assert.equal((await f.write('/api/favorites/101', alice, 'PUT', {repository: repo()}, {'Content-Type': 'application/json-not-real'})).status, 415);
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
  f.env.DB.sqlite.exec('DROP TABLE login_exchanges');
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
      headers: {Origin: origin, Authorization: `Bearer ${alice.token}`, ...(pageCount ? {'X-Favorites-User': alice.id} : {})}
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
  const changed = await f.handle('/api/bootstrap?after=500', {headers: {Origin: origin, Authorization: `Bearer ${bob.token}`, 'X-Favorites-User': alice.id}});
  assert.equal(changed.status, 409); assert.equal((await changed.json()).error, 'account_changed');
  for (const value of ['0', 'abc', '-1', '9007199254740992', '']) {
    assert.equal((await f.handle(`/api/bootstrap?after=${value}`, {headers: {Origin: origin, Authorization: `Bearer ${alice.token}`, 'X-Favorites-User': alice.id}})).status, 400);
  }
  assert.equal((await f.handle('/api/bootstrap?after=500', {headers: {Origin: origin, Authorization: `Bearer ${alice.token}`}})).status, 400);
  f.advance(8 * 3600 + 1);
  const expired = await f.handle('/api/bootstrap?after=500', {headers: {Origin: origin, Authorization: `Bearer ${alice.token}`, 'X-Favorites-User': alice.id}});
  assert.equal(expired.status, 409);
});
