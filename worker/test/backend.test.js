import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createWorker, sanitizeRepository} from '../src/index.js';

const origin = 'https://agentskills.media';
const apiOrigin = 'https://agent-leaderboard-api.example.workers.dev';
const extensionId = 'medjijlfgmfeldlelkidiickdcnbicaf';
const extensionOrigin = `chrome-extension://${extensionId}`;
const extensionCallback = `https://${extensionId}.chromiumapp.org/github`;
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
function fixture(t, extras = {}, behavior = {}) {
  const DB = d1(); t.after(() => DB.sqlite.close());
  let time = Date.parse('2026-10-31T12:00:00Z');
  let identity = {id: 1, login: 'alice', avatar_url: 'https://avatars.githubusercontent.com/u/1'};
  const calls = [];
  const worker = createWorker({now: () => time, fetch: async (url, options) => {
    calls.push({url, options});
    assert.equal(options.redirect, 'manual');
    if (behavior.fetch) {
      const response = await behavior.fetch(url, options);
      if (response !== undefined) return response;
    }
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
  async function begin(returnTo = '/', client) {
    const verifier = random(), state = random(), challenge = await hash(verifier);
    const response = await handle('/api/auth/github?' + new URLSearchParams({return_to: returnTo, client_challenge: challenge, client_state: state,
      ...(client ? {client} : {})}));
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

test('OAuth trims configured client credentials before authorization and token exchange', async t => {
  const f = fixture(t, {GITHUB_CLIENT_ID: '  public-client-id\n', GITHUB_CLIENT_SECRET: '\tgithub-server-secret  '});
  const attempt = await f.begin();
  assert.equal(attempt.url.searchParams.get('client_id'), 'public-client-id');
  const response = await f.complete(attempt);
  assert.ok(new URL(response.headers.get('Location')).searchParams.has('login_code'));
  const body = new URLSearchParams(f.calls[0].options.body);
  assert.equal(body.get('client_id'), 'public-client-id');
  assert.equal(body.get('client_secret'), 'github-server-secret');
});

test('OAuth token error responses expose fixed categories only and consume state once', async t => {
  const categories = [
    ['incorrect_client_credentials', 'oauth_client_configuration'],
    ['redirect_uri_mismatch', 'oauth_redirect_configuration'],
    ['bad_verification_code', 'oauth_code_rejected'],
    ['unverified_user_email', 'oauth_email_unverified'],
    ['unknown_error_containing_sensitive_details', 'oauth_token_unavailable']
  ];
  for (const [error, expected] of categories) {
    const f = fixture(t, {}, {fetch: async () => Response.json({error,
      access_token: 'upstream-access-token-must-not-leak', error_description: 'github-server-secret and sensitive callback code',
      error_uri: 'https://upstream.example/?token=upstream-access-token-must-not-leak'})});
    const attempt = await f.begin('/?view=saved#skills'), response = await f.complete(attempt);
    const location = response.headers.get('Location'), destination = new URL(location);
    assert.equal(destination.origin, origin); assert.equal(destination.hash, '#skills');
    assert.equal(destination.searchParams.get('view'), 'saved');
    assert.equal(destination.searchParams.get('auth_error'), expected);
    assert.deepEqual([...destination.searchParams.keys()].sort(), ['auth_error', 'view']);
    assert.doesNotMatch(location, /github-server-secret|upstream-access-token|sensitive|upstream\.example|error_description|unknown_error/);
    assert.match(response.headers.get('Set-Cookie'), /Max-Age=0/);
    assert.equal(f.env.DB.sqlite.prepare('SELECT count(*) AS n FROM users').get().n, 0);
    assert.equal(f.env.DB.sqlite.prepare('SELECT count(*) AS n FROM sessions').get().n, 0);
    const replay = await f.complete(attempt);
    assert.equal(new URL(replay.headers.get('Location')).searchParams.get('auth_error'), 'invalid_state');
    assert.equal(f.calls.length, 1, 'replayed state never repeats token exchange');
  }
});

test('OAuth upstream HTTP failures and aborts return safe token or identity categories', async t => {
  const failures = [
    () => Response.json({error: 'unknown_error', error_description: 'sensitive-upstream-detail'}, {status: 401}),
    () => { throw new DOMException('sensitive-upstream-detail', 'AbortError'); },
    () => new Response('sensitive-upstream-detail', {status: 200}),
    () => Response.json(null)
  ];
  for (const stage of ['token', 'identity']) {
    for (const fail of failures) {
      const f = fixture(t, {}, {fetch: async url => url === 'https://github.com/login/oauth/access_token' && stage === 'identity'
        ? Response.json({access_token: 'upstream-access-token-must-not-leak'}) : fail()});
      const attempt = await f.begin(), response = await f.complete(attempt), location = response.headers.get('Location');
      // A valid JSON null from /user is a validation error, not a network error.
      const expected = stage === 'identity' && fail === failures[3] ? 'oauth_identity_invalid' : `oauth_${stage}_unavailable`;
      assert.equal(new URL(location).searchParams.get('auth_error'), expected);
      assert.doesNotMatch(location, /sensitive-upstream-detail|upstream-access-token|github-server-secret|error_description/);
      assert.equal(f.env.DB.sqlite.prepare('SELECT count(*) AS n FROM users').get().n, 0);
      assert.equal(f.env.DB.sqlite.prepare('SELECT count(*) AS n FROM login_exchanges').get().n, 0);
      assert.equal((await f.complete(attempt)).headers.get('Location'), origin + '/?auth_error=invalid_state');
    }
  }
});

test('OAuth token HTTP 400/401 responses recognize only known JSON errors without leaking response details', async t => {
  for (const status of [400, 401]) {
    const f = fixture(t, {}, {fetch: async () => Response.json({error: 'incorrect_client_credentials',
      error_description: 'github-server-secret and sensitive-upstream-detail',
      access_token: 'upstream-access-token-must-not-leak', error_uri: 'https://upstream.example/private'}, {status})});
    const attempt = await f.begin(), response = await f.complete(attempt), location = response.headers.get('Location');
    assert.equal(new URL(location).searchParams.get('auth_error'), 'oauth_client_configuration');
    assert.doesNotMatch(location, /github-server-secret|sensitive-upstream-detail|upstream-access-token|upstream\.example|error_description/);
    assert.equal(f.env.DB.sqlite.prepare('SELECT count(*) AS n FROM oauth_states').get().n, 0);
    assert.equal(f.env.DB.sqlite.prepare('SELECT count(*) AS n FROM users').get().n, 0);
    assert.equal(new URL((await f.complete(attempt)).headers.get('Location')).searchParams.get('auth_error'), 'invalid_state');
    assert.equal(f.calls.length, 1);
  }
});

test('OAuth fetches use manual redirects and reject 3xx without reading bodies or forwarding credentials', async t => {
  let cancelled = 0, read = 0;
  const f = fixture(t, {}, {fetch: async () => ({status: 302, ok: false,
    headers: new Headers({Location: 'https://untrusted.example/?token=upstream-access-token-must-not-leak'}),
    body: {async cancel() { cancelled++; }}, async json() { read++; throw new Error('sensitive-upstream-detail'); }})});
  const attempt = await f.begin(), response = await f.complete(attempt), location = response.headers.get('Location');
  assert.equal(new URL(location).searchParams.get('auth_error'), 'oauth_token_unavailable');
  assert.equal(cancelled, 1); assert.equal(read, 0, 'redirect response bodies are never parsed');
  assert.equal(f.calls.length, 1, 'redirect is not followed and identity is not requested');
  assert.equal(f.calls[0].url, 'https://github.com/login/oauth/access_token');
  assert.doesNotMatch(location, /untrusted\.example|upstream-access-token|sensitive-upstream-detail|github-server-secret/);
  assert.equal(f.env.DB.sqlite.prepare('SELECT count(*) AS n FROM login_exchanges').get().n, 0);
  assert.equal(new URL((await f.complete(attempt)).headers.get('Location')).searchParams.get('auth_error'), 'invalid_state');
  assert.equal(f.calls.length, 1);
});

test('OAuth identity validation and storage failures have separate fixed categories', async t => {
  for (const identity of [{id: 0, login: 'alice'}, {id: 1, login: 'invalid login'}, {id: 1, login: 'alice', unexpected: true}]) {
    const storage = identity.unexpected === true;
    const f = fixture(t, {}, {fetch: async url => Response.json(url === 'https://github.com/login/oauth/access_token'
      ? {access_token: 'upstream-access-token-must-not-leak'} : identity)});
    const attempt = await f.begin();
    if (storage) f.env.DB.sqlite.exec('DROP TABLE login_exchanges');
    const response = await f.complete(attempt), location = response.headers.get('Location');
    assert.equal(new URL(location).searchParams.get('auth_error'), storage ? 'oauth_storage_unavailable' : 'oauth_identity_invalid');
    assert.doesNotMatch(location, /upstream-access-token|github-server-secret|no.such.table|login_exchanges|sqlite/i);
    assert.equal(f.env.DB.sqlite.prepare('SELECT count(*) AS n FROM users').get().n, 0, 'failed handoff transaction rolls back identity upsert');
    assert.equal(f.env.DB.sqlite.prepare('SELECT count(*) AS n FROM oauth_states').get().n, 0);
  }
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
  assert.equal(allowed.headers.get('Access-Control-Allow-Headers'), 'Authorization, Content-Type, X-Favorites-User, X-Favorites-Extension');
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

test('extension OAuth keeps the GitHub callback and PKCE while sharing account favorites with the website', async t => {
  const f = fixture(t), attempt = await f.begin(extensionCallback, 'extension');
  assert.equal(attempt.url.searchParams.get('redirect_uri'), apiOrigin + '/api/auth/github/callback');
  assert.equal(f.env.DB.sqlite.prepare('SELECT return_to FROM oauth_states').get().return_to, extensionCallback);
  const stolen = await f.handle('/api/auth/github/callback?' + new URLSearchParams({state: attempt.url.searchParams.get('state'), code: 'valid-code'}));
  assert.equal(new URL(stolen.headers.get('Location')).origin, origin, 'unverified state never selects an extension redirect');
  const callback = await f.complete(attempt), target = new URL(callback.headers.get('Location'));
  assert.equal(target.origin + target.pathname, extensionCallback);
  assert.equal(target.searchParams.get('login_state'), attempt.state);
  assert.equal(f.env.DB.sqlite.prepare('SELECT count(*) AS n FROM sessions').get().n, 0);
  const exchange = verifier => f.handle('/api/auth/exchange', {method: 'POST', headers: {
    'X-Favorites-Extension': extensionId, 'Content-Type': 'application/json'},
    body: JSON.stringify({code: target.searchParams.get('login_code'), verifier, state: attempt.state})});
  assert.equal((await exchange(random())).status, 400, 'native-client hint never bypasses the PKCE proof');
  const response = await exchange(attempt.verifier), session = await response.json();
  assert.equal(response.status, 200); assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  const account = {id: session.user.id, token: session.token};
  const headers = {Authorization: `Bearer ${account.token}`, 'X-Favorites-User': account.id, 'X-Favorites-Extension': extensionId};
  const saved = await f.handle('/api/favorites/101', {method: 'PUT', headers: {...headers, 'Content-Type': 'application/json'}, body: JSON.stringify({repository: repo()})});
  assert.equal(saved.status, 200);
  assert.deepEqual((await f.bootstrap(account)).data.favorites.map(item => item.repo_id), [101]);
  await f.write('/api/favorites/202', account, 'PUT', {repository: repo(202)});
  const extensionView = await f.handle('/api/bootstrap', {headers: {Origin: extensionOrigin, Authorization: `Bearer ${account.token}`}});
  assert.equal(extensionView.headers.get('Access-Control-Allow-Origin'), extensionOrigin);
  assert.deepEqual((await extensionView.json()).favorites.map(item => item.repo_id), [101, 202]);
  assert.equal((await exchange(attempt.verifier)).status, 400, 'extension handoff is single use');
  assert.ok(!callback.headers.get('Location').includes(account.token));
  assert.equal((await f.handle('/api/auth/logout', {method: 'POST', headers})).status, 200);
  assert.equal((await f.bootstrap(account)).data.user, null);
});

test('extension return destinations must match the exact production callback and are revalidated from D1', async t => {
  const f = fixture(t), invalid = [
    'https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.chromiumapp.org/github',
    extensionCallback + '/extra', extensionCallback + '?x=1', extensionCallback + '#state',
    extensionCallback.replace('https:', 'http:'), extensionCallback.replace('.org/', '.org:443/'),
    extensionCallback.replace('.org/', '.org:8443/'), extensionCallback.replace('https://', 'https://user@'),
    extensionCallback.replace('chromiumapp.org', 'chromiumapp.org.evil.example'),
    extensionCallback.replace('/github', '/%67ithub'), '/#skills', '//evil.example/'
  ];
  for (const returnTo of invalid) {
    const response = await f.handle('/api/auth/github?' + new URLSearchParams({client: 'extension', return_to: returnTo,
      client_challenge: random(), client_state: random()}));
    assert.equal(response.status, 400); assert.equal(response.headers.get('Location'), null);
  }
  assert.equal(f.env.DB.sqlite.prepare('SELECT count(*) AS n FROM oauth_states').get().n, 0);
  const attempt = await f.begin(extensionCallback, 'extension');
  f.env.DB.sqlite.prepare('UPDATE oauth_states SET return_to=?').run(invalid[0]);
  const response = await f.complete(attempt);
  assert.equal(response.headers.get('Location'), origin + '/?auth_error=invalid_state');
  assert.equal(f.calls.length, 0, 'an invalid stored return destination never reaches GitHub');
  const ordinary = await f.begin(extensionCallback), ordinaryResponse = await f.complete(ordinary);
  assert.equal(new URL(ordinaryResponse.headers.get('Location')).origin, origin, 'website flow cannot select an absolute redirect');
});

test('extension request hints never authorize writes or override an untrusted explicit Origin', async t => {
  const f = fixture(t), alice = await f.login(), bob = await f.login(2, 'bob');
  const base = {Authorization: `Bearer ${alice.token}`, 'X-Favorites-User': alice.id, 'X-Favorites-Extension': extensionId};
  const remove = headers => f.handle('/api/favorites/101', {method: 'DELETE', headers: {...base, ...headers}});
  assert.equal((await remove({})).status, 200);
  assert.equal((await remove({Authorization: ''})).status, 401);
  assert.equal((await remove({'X-Favorites-User': ''})).status, 400);
  assert.equal((await remove({'X-Favorites-User': bob.id})).status, 409);
  for (const headers of [{Origin: 'null'}, {Origin: 'https://evil.example'},
    {Origin: 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'}, {'X-Favorites-Extension': 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'},
    {Origin: origin, 'X-Favorites-Extension': 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'}]) {
    assert.equal((await remove(headers)).status, 403);
  }
  const missing = new Headers(base); missing.delete('X-Favorites-Extension');
  assert.equal((await f.handle('/api/favorites/101', {method: 'DELETE', headers: missing})).status, 403);
  const preflight = await f.handle('/api/favorites/resolve', {method: 'OPTIONS', headers: {Origin: extensionOrigin,
    'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization, content-type, x-favorites-user, x-favorites-extension'}});
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), extensionOrigin);
  assert.equal(preflight.headers.get('Access-Control-Allow-Credentials'), null);
  assert.equal((await f.handle('/api/favorites/resolve', {method: 'OPTIONS', headers: {'X-Favorites-Extension': extensionId,
    'Access-Control-Request-Method': 'POST'}})).status, 403, 'preflight still requires a trusted explicit Origin');
});

test('website session mints only a 90-second PKCE handoff that creates a separate extension session once', async t => {
  const f = fixture(t), alice = await f.login(), verifier = random(), state = random(), challenge = await hash(verifier);
  f.env.DB.sqlite.prepare('INSERT INTO login_exchanges VALUES (?,?,?,?,?,?)').run('expired-code-hash', 1, challenge, state, 1, 0);
  const minted = await f.write('/api/auth/extension', alice, 'POST', {extension_id: extensionId, client_challenge: challenge, client_state: state});
  assert.equal(minted.status, 200); assert.equal(minted.headers.get('Location'), null); assert.equal(minted.headers.get('Set-Cookie'), null);
  assert.equal(minted.headers.get('Cache-Control'), 'no-store');
  const handoff = await minted.json();
  assert.deepEqual(Object.keys(handoff).sort(), ['code', 'expiresAt', 'state']);
  assert.match(handoff.code, /^[A-Za-z0-9_-]{43}$/); assert.equal(handoff.state, state);
  assert.equal(handoff.expiresAt, '2026-10-31T12:01:30.000Z');
  assert.ok(!JSON.stringify(handoff).includes(alice.token));
  const row = f.env.DB.sqlite.prepare('SELECT * FROM login_exchanges').get();
  assert.equal(row.code_hash, await hash(handoff.code)); assert.equal(row.github_id, 1);
  assert.equal(row.client_challenge, challenge); assert.equal(row.client_state, state);
  assert.equal(row.expires_at - row.created_at, 90);
  assert.equal(f.env.DB.sqlite.prepare('SELECT count(*) AS n FROM login_exchanges').get().n, 1, 'expired handoffs are cleaned');
  const exchange = extra => f.handle('/api/auth/exchange', {method: 'POST', headers: {'X-Favorites-Extension': extensionId, 'Content-Type': 'application/json'},
    body: JSON.stringify({code: handoff.code, state, verifier, ...extra})});
  assert.equal((await exchange({state: random()})).status, 400);
  assert.equal((await exchange({verifier: random()})).status, 400);
  const exchanged = await exchange({}), extension = await exchanged.json();
  assert.equal(exchanged.status, 200); assert.equal(extension.user.id, alice.id);
  assert.notEqual(extension.token, alice.token);
  assert.equal((await exchange({})).status, 400);
  await f.write('/api/favorites/101', alice, 'PUT', {repository: repo()});
  assert.deepEqual((await f.bootstrap({token: extension.token})).data.favorites.map(value => value.repo_id), [101]);
  assert.equal((await f.bootstrap(alice)).data.user.id, alice.id, 'website session remains independent');
});

test('extension handoff minting requires the exact website Origin, bearer, and current expected account', async t => {
  const f = fixture(t), alice = await f.login(), body = {extension_id: extensionId, client_challenge: random(), client_state: random()};
  for (const Origin of [extensionOrigin, 'null', 'https://evil.example', '']) {
    assert.equal((await f.write('/api/auth/extension', alice, 'POST', body, {Origin, 'X-Favorites-Extension': extensionId})).status, 403);
  }
  const native = await f.handle('/api/auth/extension', {method: 'POST', headers: {Authorization: `Bearer ${alice.token}`,
    'X-Favorites-User': alice.id, 'X-Favorites-Extension': extensionId, 'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  assert.equal(native.status, 403, 'native-client Origin omission cannot mint a website approval');
  assert.equal((await f.write('/api/auth/extension', alice, 'POST', body, {Authorization: ''})).status, 401);
  assert.equal((await f.write('/api/auth/extension', alice, 'POST', body, {'X-Favorites-User': '2'})).status, 409);
  assert.equal((await f.write('/api/auth/extension', alice, 'POST', body, {'X-Favorites-User': ''})).status, 400);
  for (const Origin of [origin, extensionOrigin]) {
    const preflight = await f.handle('/api/auth/extension', {method: 'OPTIONS', headers: {Origin,
      'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type,x-favorites-user'}});
    assert.equal(preflight.status, Origin === origin ? 204 : 403);
  }
  assert.equal(f.env.DB.sqlite.prepare('SELECT count(*) AS n FROM login_exchanges').get().n, 0);
  f.advance(8 * 3600 + 1);
  assert.equal((await f.write('/api/auth/extension', alice, 'POST', body)).status, 401);
});

test('website extension handoffs reject invalid or oversized proofs before storage and expire independently', async t => {
  const f = fixture(t), alice = await f.login(), verifier = random(), body = {extension_id: extensionId, client_challenge: await hash(verifier), client_state: random()};
  for (const extra of [{extension_id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'}, {extension_id: [extensionId]},
    {client_challenge: 'short'}, {client_challenge: [body.client_challenge]}, {client_state: ''}, {client_state: null}]) {
    const response = await f.write('/api/auth/extension', alice, 'POST', {...body, ...extra});
    assert.equal(response.status, 400); assert.deepEqual(await response.json(), {error: 'invalid_login_request'});
  }
  assert.equal((await f.write('/api/auth/extension', alice, 'POST', {...body, extra: 'x'.repeat(4096)})).status, 413);
  assert.equal(f.env.DB.sqlite.prepare('SELECT count(*) AS n FROM login_exchanges').get().n, 0);
  const handoff = await (await f.write('/api/auth/extension', alice, 'POST', body)).json();
  f.advance(91);
  const expired = await f.handle('/api/auth/exchange', {method: 'POST', headers: {'X-Favorites-Extension': extensionId, 'Content-Type': 'application/json'},
    body: JSON.stringify({code: handoff.code, state: handoff.state, verifier})});
  assert.equal(expired.status, 400); assert.equal((await f.bootstrap(alice)).data.user.id, alice.id);
});

test('repository resolver requires the current account and returns only public numeric identity without credentials upstream', async t => {
  const f = fixture(t, {}, {fetch: async url => url.startsWith('https://api.github.com/repos/')
    ? Response.json({id: 555, full_name: 'new-owner/canonical', private: false, token: 'private-upstream-metadata'}) : undefined});
  const alice = await f.login(), bob = await f.login(2, 'bob'), before = f.calls.length;
  const forbidden = await f.write('/api/favorites/resolve', alice, 'POST', {full_name: 'owner/tool'}, {'X-Favorites-User': bob.id});
  assert.equal(forbidden.status, 409); assert.equal(f.calls.length, before);
  assert.equal((await f.write('/api/favorites/resolve', alice, 'POST', {full_name: 'owner/tool'}, {Authorization: ''})).status, 401);
  assert.equal(f.calls.length, before);
  const response = await f.write('/api/favorites/resolve', alice, 'POST', {full_name: 'owner/tool'});
  assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), {repo_id: 555, full_name: 'new-owner/canonical'});
  const upstream = f.calls.at(-1);
  assert.equal(upstream.url, 'https://api.github.com/repos/owner/tool');
  assert.equal(upstream.options.method, 'GET'); assert.equal(upstream.options.redirect, 'manual');
  assert.equal(upstream.options.headers['User-Agent'], 'Agent-Leaderboard');
  assert.equal(upstream.options.headers.Authorization, undefined); assert.equal(upstream.options.headers.Cookie, undefined);
  assert.doesNotMatch(JSON.stringify(upstream), /github-server-secret|github-access-token-never-persist/);
  assert.equal(f.env.DB.sqlite.prepare('SELECT count(*) AS n FROM favorites').get().n, 0, 'resolution does not save or import a favorite');
  f.advance(8 * 3600 + 1);
  assert.equal((await f.write('/api/favorites/resolve', alice, 'POST', {full_name: 'owner/tool'})).status, 401);
  assert.equal(f.calls.length, before + 1);
});

test('repository resolver rejects URL injection, invalid names, and bodies larger than 4 KiB before fetching', async t => {
  const f = fixture(t), alice = await f.login(), before = f.calls.length;
  for (const full_name of ['https://evil.example/x', '//evil.example/x', 'owner/../secret', 'owner/%2e%2e',
    'owner/repo?token=secret', 'owner/repo#secret', 'owner/repo\\extra', 'owner/.', 'owner/..', 'owner/repo\n',
    'user@evil/repo', 'owner:443/repo', null, {}, ['owner/repo']]) {
    assert.equal((await f.write('/api/favorites/resolve', alice, 'POST', {full_name})).status, 400);
  }
  assert.equal((await f.write('/api/favorites/resolve', alice, 'POST', {full_name: 'owner/tool', extra: 'x'.repeat(4096)})).status, 413);
  assert.equal(f.calls.length, before);
});

test('repository resolver follows at most one allowlisted public GitHub repository redirect', async t => {
  for (const location of ['https://api.github.com/repositories/555', '/repos/new-owner/canonical']) {
    let cancelled = 0;
    const f = fixture(t, {}, {fetch: async url => url === 'https://api.github.com/repos/owner/tool'
      ? {status: 301, headers: new Headers({Location: location}), body: {async cancel() { cancelled++; }}}
      : url === new URL(location, 'https://api.github.com').href ? Response.json({id: 555, full_name: 'new-owner/canonical', private: false}) : undefined});
    const alice = await f.login(), before = f.calls.length;
    const response = await f.write('/api/favorites/resolve', alice, 'POST', {full_name: 'owner/tool'});
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), {repo_id: 555, full_name: 'new-owner/canonical'});
    assert.equal(cancelled, 1); assert.equal(f.calls.length, before + 2);
    for (const upstream of f.calls.slice(before)) {
      assert.equal(upstream.options.redirect, 'manual'); assert.equal(upstream.options.headers.Authorization, undefined);
    }
  }
});

test('repository resolver blocks arbitrary hosts, credentials, paths, and redirect chains without exposing upstream details', async t => {
  for (const location of ['https://evil.example/repositories/555', 'https://api.github.com.evil.example/repositories/555',
    'http://api.github.com/repositories/555', 'https://secret@api.github.com/repositories/555',
    'https://api.github.com:8443/repositories/555', '/user', '/repositories/0', '/repositories/9007199254740992',
    '/repositories/555?access_token=secret', '/repositories/555#secret', '/repos/owner/%2e%2e', '/repos/owner/repo/extra']) {
    const f = fixture(t, {}, {fetch: async url => url.startsWith('https://api.github.com/repos/')
      ? new Response('sensitive-upstream-detail', {status: 302, headers: {Location: location}}) : undefined});
    const alice = await f.login(), before = f.calls.length;
    const response = await f.write('/api/favorites/resolve', alice, 'POST', {full_name: 'owner/tool'});
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), {error: 'repository_unavailable'});
    assert.equal(f.calls.length, before + 1, 'unsafe redirects are never requested');
  }
  const f = fixture(t, {}, {fetch: async url => /^https:\/\/api\.github\.com\/(repos|repositories)\//.test(url)
    ? new Response('sensitive-upstream-detail', {status: 301, headers: {Location: '/repositories/555'}}) : undefined});
  const alice = await f.login(), before = f.calls.length;
  const response = await f.write('/api/favorites/resolve', alice, 'POST', {full_name: 'owner/tool'});
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), {error: 'repository_unavailable'});
  assert.equal(f.calls.length, before + 2, 'a second redirect is rejected');
});

test('repository resolver uses fixed not-found/unavailable errors and does not retry rate limits or aborts', async t => {
  const responses = [
    [() => new Response('sensitive-upstream-detail', {status: 404}), 404, 'repository_not_found'],
    [() => new Response('sensitive-upstream-detail', {status: 403}), 503, 'repository_unavailable'],
    [() => new Response('sensitive-upstream-detail', {status: 429, headers: {'Retry-After': '60'}}), 503, 'repository_unavailable'],
    [() => new Response('sensitive-upstream-detail', {status: 500}), 503, 'repository_unavailable'],
    [() => new Response('sensitive-upstream-detail'), 503, 'repository_unavailable'],
    [() => Response.json({id: 0, full_name: 'owner/tool'}), 503, 'repository_unavailable'],
    [() => Response.json({id: 555, full_name: 'https://evil.example'}), 503, 'repository_unavailable'],
    [() => Response.json({id: 555, full_name: 'owner/tool', private: true}), 404, 'repository_not_found'],
    [() => { throw new DOMException('sensitive-upstream-detail', 'AbortError'); }, 503, 'repository_unavailable']
  ];
  for (const [result, status, code] of responses) {
    const f = fixture(t, {}, {fetch: async url => url.startsWith('https://api.github.com/repos/') ? result() : undefined});
    const alice = await f.login(), before = f.calls.length;
    const response = await f.write('/api/favorites/resolve', alice, 'POST', {full_name: 'owner/tool'});
    assert.equal(response.status, status); assert.deepEqual(await response.json(), {error: code});
    assert.equal(f.calls.length, before + 1);
  }
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
