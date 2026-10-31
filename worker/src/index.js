/* Small same-origin API: GitHub identifies the visitor; D1 owns their favorites. */
const SESSION_TTL = 30 * 86400;
const OAUTH_TTL = 600;
const FAVORITES_PAGE_SIZE = 500;
const SOURCE_NAMES = new Set(['skills', 'mcp', 'research', 'prompts', 'frameworks']);
const encoder = new TextEncoder();
const text = (value, limit) => typeof value === 'string' ? value.slice(0, limit) : '';
const idOf = value => {
  const number = typeof value === 'string' && /^[1-9]\d{0,15}$/.test(value) ? Number(value) : value;
  return Number.isSafeInteger(number) && number > 0 ? number : null;
};
const strings = value => Array.isArray(value)
  ? [...new Set(value.filter(item => typeof item === 'string').map(item => item.slice(0, 100)))].slice(0, 24) : [];
const isoDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : '';

export function sanitizeRepository(value, forcedId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'invalid_repository');
  const id = idOf(forcedId ?? value.id);
  if (!id) throw new ApiError(400, 'invalid_repository');
  let name = text(value.full_name, 160);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(name) || name.split('/').some(part => part === '.' || part === '..')) name = '';
  // Derive links from the validated public repository name; never echo a URL.
  const record = {id, full_name: name, url: name ? `https://github.com/${name}` : '',
    description: text(value.description, 4000), language: text(value.language, 100),
    stars: Number.isSafeInteger(value.stars) && value.stars >= 0 ? value.stars : 0,
    forks: Number.isSafeInteger(value.forks) && value.forks >= 0 ? value.forks : 0,
    sources: strings(value.sources).filter(source => SOURCE_NAMES.has(source)),
    category: text(value.category, 100), categories: strings(value.categories),
    topics: strings(value.topics), use_cases: strings(value.use_cases), agentTags: strings(value.agentTags),
    created_at: isoDate(value.created_at), updated_at: isoDate(value.updated_at)};
  if (encoder.encode(JSON.stringify(record)).byteLength > 32768) throw new ApiError(400, 'invalid_repository');
  return record;
}

class ApiError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
function publicOrigin(env) {
  try {
    const url = new URL(env.PUBLIC_ORIGIN);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password
        || url.pathname !== '/' || url.search || url.hash) throw new Error();
    return url.origin;
  } catch { throw new ApiError(503, 'invalid_configuration'); }
}
function configured(env) {
  return Boolean(env.DB?.prepare && env.DB?.batch && typeof env.GITHUB_CLIENT_ID === 'string' && env.GITHUB_CLIENT_ID.trim()
    && typeof env.GITHUB_CLIENT_SECRET === 'string' && env.GITHUB_CLIENT_SECRET.trim()
    && typeof env.SESSION_SECRET === 'string' && encoder.encode(env.SESSION_SECRET).length >= 32);
}
function headers(extra = {}) {
  return new Headers({'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", ...extra});
}
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {status, headers: headers({'Content-Type': 'application/json; charset=utf-8', ...extra})});
}
function redirect(location, cookies = []) {
  const result = new Response(null, {status: 302, headers: headers({Location: location})});
  for (const cookie of cookies) result.headers.append('Set-Cookie', cookie);
  return result;
}
function cookieNames(origin) {
  const prefix = origin.startsWith('https:') ? '__Host-' : '';
  return {session: `${prefix}agent_session`, oauth: `${prefix}agent_oauth`};
}
function cookie(name, value, ttl, origin) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ttl}${origin.startsWith('https:') ? '; Secure' : ''}`;
}
function readCookie(request, name) {
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const index = part.indexOf('=');
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return '';
}
function safeReturnPath(value, origin) {
  if (typeof value !== 'string' || value.length > 1000 || !value.startsWith('/') || value.startsWith('//')
      || /[\\\u0000-\u0020\u007f]/.test(value)) return '/';
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || url.pathname.startsWith('/api/')) return '/';
    // Authentication callback artifacts never belong in a return destination.
    for (const key of ['code', 'state', 'auth_error']) url.searchParams.delete(key);
    return url.pathname + url.search + url.hash;
  } catch { return '/'; }
}
function assertSameOrigin(request, origin) {
  if (request.headers.get('Origin') !== origin) throw new ApiError(403, 'origin_rejected');
  if (['cross-site', 'same-site'].includes(request.headers.get('Sec-Fetch-Site'))) throw new ApiError(403, 'origin_rejected');
}
async function readJSON(request, limit) {
  if (!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) throw new ApiError(415, 'json_required');
  const length = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(length) && length > limit) throw new ApiError(413, 'body_too_large');
  if (!request.body) throw new ApiError(400, 'invalid_json');
  const reader = request.body.getReader();
  let received = 0;
  const chunks = [];
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > limit) { await reader.cancel(); throw new ApiError(413, 'body_too_large'); }
      chunks.push(value);
    }
    const buffer = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
    const parsed = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(buffer));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(400, 'invalid_json'); }
}
function base64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function randomToken(bytes = 32) { return base64url(crypto.getRandomValues(new Uint8Array(bytes))); }
async function sha256(value) { return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))); }
async function sign(secret, value) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
}
function equal(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

export function createWorker(options = {}) {
  const upstreamFetch = options.fetch || ((...args) => fetch(...args));
  const now = () => Math.floor((options.now ? options.now() : Date.now()) / 1000);
  async function githubJSON(url, init) {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await upstreamFetch(url, {...init, redirect: 'error', signal: controller.signal});
      if (!response.ok) throw new Error('upstream');
      return await response.json();
    } finally { clearTimeout(timeout); }
  }
  async function session(request, env, origin) {
    const token = readCookie(request, cookieNames(origin).session);
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const hash = await sha256(token);
    const row = await env.DB.prepare(`SELECT u.github_id, u.login, u.avatar_url, s.expires_at
      FROM sessions s JOIN users u ON u.github_id = s.github_id
      WHERE s.token_hash = ?1 AND s.expires_at > ?2`).bind(hash, now()).first();
    if (!row) return null;
    return {hash, token, expires: row.expires_at, user: {id: String(row.github_id), login: row.login, avatar_url: row.avatar_url}};
  }
  async function requireSession(request, env, origin) {
    const found = await session(request, env, origin);
    if (!found) throw new ApiError(401, 'authentication_required');
    const expected = request.headers.get('X-Favorites-User');
    if (!expected) throw new ApiError(400, 'expected_user_required');
    if (expected !== found.user.id) throw new ApiError(409, 'account_changed');
    return found;
  }
  async function startLogin(request, env, origin) {
    const nonce = randomToken(), binding = randomToken(), verifier = randomToken(48), expires = now() + OAUTH_TTL;
    const nonceHash = await sha256(nonce);
    const returnTo = safeReturnPath(new URL(request.url).searchParams.get('return_to') || '/', origin);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM oauth_states WHERE expires_at <= ?1').bind(now()),
      env.DB.prepare('INSERT INTO oauth_states (nonce_hash,browser_hash,verifier,return_to,expires_at) VALUES (?1,?2,?3,?4,?5)')
        .bind(nonceHash, await sha256(binding), verifier, returnTo, expires)
    ]);
    const unsigned = `${nonce}.${expires}`, state = `${unsigned}.${await sign(env.SESSION_SECRET, `oauth:${unsigned}`)}`;
    const target = new URL('https://github.com/login/oauth/authorize');
    target.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
    target.searchParams.set('redirect_uri', `${origin}/api/auth/github/callback`);
    target.searchParams.set('state', state);
    target.searchParams.set('code_challenge', await sha256(verifier));
    target.searchParams.set('code_challenge_method', 'S256');
    return redirect(target.href, [cookie(cookieNames(origin).oauth, binding, OAUTH_TTL, origin)]);
  }
  async function callback(request, env, origin) {
    const names = cookieNames(origin), clear = cookie(names.oauth, '', 0, origin);
    let returnTo = '/', consumed = false;
    try {
      const url = new URL(request.url), state = url.searchParams.get('state') || '';
      const match = /^([A-Za-z0-9_-]{43})\.(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(state);
      const binding = readCookie(request, names.oauth);
      if (!match || !/^[A-Za-z0-9_-]{43}$/.test(binding) || Number(match[2]) <= now() || Number(match[2]) > now() + OAUTH_TTL
          || !equal(match[3], await sign(env.SESSION_SECRET, `oauth:${match[1]}.${match[2]}`))) throw new ApiError(400, 'invalid_state');
      // DELETE ... RETURNING atomically consumes the attempt before any token exchange.
      const attempt = await env.DB.prepare(`DELETE FROM oauth_states WHERE nonce_hash = ?1 AND browser_hash = ?2
        AND expires_at > ?3 RETURNING verifier,return_to`).bind(await sha256(match[1]), await sha256(binding), now()).first();
      if (!attempt) throw new ApiError(400, 'invalid_state');
      consumed = true;
      returnTo = safeReturnPath(attempt.return_to, origin);
      if (url.searchParams.has('error')) throw new ApiError(400, 'access_denied');
      const code = url.searchParams.get('code');
      if (!code || code.length > 500 || /[\u0000-\u0020\u007f]/.test(code)) throw new ApiError(400, 'oauth_failed');
      const tokenResponse = await githubJSON('https://github.com/login/oauth/access_token', {
        method: 'POST', headers: {Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded'},
        body: new URLSearchParams({client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET,
          code, redirect_uri: `${origin}/api/auth/github/callback`, code_verifier: attempt.verifier}).toString()
      });
      if (typeof tokenResponse.access_token !== 'string' || !tokenResponse.access_token || tokenResponse.error) throw new Error('token');
      const identity = await githubJSON('https://api.github.com/user', {headers: {
        Accept: 'application/vnd.github+json', Authorization: `Bearer ${tokenResponse.access_token}`,
        'User-Agent': 'Agent-Leaderboard', 'X-GitHub-Api-Version': '2022-11-28'
      }});
      const githubId = idOf(identity.id), login = text(identity.login, 39);
      if (!githubId || !/^[A-Za-z0-9-]{1,39}$/.test(login)) throw new Error('identity');
      let avatar = '';
      try { const value = new URL(identity.avatar_url); if (value.protocol === 'https:' && value.hostname === 'avatars.githubusercontent.com') avatar = value.href.slice(0, 1000); } catch { /* optional public image */ }
      const token = randomToken(), hash = await sha256(token), time = now();
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO users (github_id,login,avatar_url,created_at,updated_at) VALUES (?1,?2,?3,?4,?4)
          ON CONFLICT(github_id) DO UPDATE SET login=excluded.login,avatar_url=excluded.avatar_url,updated_at=excluded.updated_at`).bind(githubId, login, avatar, time),
        env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?1').bind(time),
        env.DB.prepare(`DELETE FROM sessions WHERE github_id = ?1 AND token_hash NOT IN
          (SELECT token_hash FROM sessions WHERE github_id = ?1 ORDER BY created_at DESC,token_hash DESC LIMIT 19)`).bind(githubId),
        env.DB.prepare('INSERT INTO sessions (token_hash,github_id,expires_at,created_at) VALUES (?1,?2,?3,?4)').bind(hash, githubId, time + SESSION_TTL, time)
      ]);
      return redirect(new URL(returnTo, origin).href, [clear, cookie(names.session, token, SESSION_TTL, origin)]);
    } catch (error) {
      const target = new URL(returnTo, origin);
      target.searchParams.set('auth_error', error instanceof ApiError ? error.code : 'oauth_failed');
      return redirect(target.href, consumed ? [clear] : []);
    }
  }
  async function bootstrap(request, env, origin) {
    const found = await session(request, env, origin);
    const expected = request.headers.get('X-Favorites-User');
    if (expected && expected !== found?.user.id) throw new ApiError(409, 'account_changed');
    if (!found) return json({authConfigured: true, user: null, favorites: [], nextCursor: null});
    const cursor = new URL(request.url).searchParams.get('after');
    const after = cursor === null ? 0 : idOf(cursor);
    if (after === null) throw new ApiError(400, 'invalid_cursor');
    // Stable keyset pagination keeps large saved lists readable and never mixes
    // another signed-in account into a multi-page refresh.
    const rows = await env.DB.prepare(`SELECT repo_id,repository FROM favorites
      WHERE github_id = ?1 AND repo_id > ?2 ORDER BY repo_id LIMIT ?3`)
      .bind(Number(found.user.id), after, FAVORITES_PAGE_SIZE + 1).all();
    const page = rows.results.slice(0, FAVORITES_PAGE_SIZE);
    const favorites = page.map(row => ({repo_id: row.repo_id, repository: sanitizeRepository(JSON.parse(row.repository), row.repo_id)}));
    const nextCursor = rows.results.length > FAVORITES_PAGE_SIZE ? page[page.length - 1].repo_id : null;
    const response = json({authConfigured: true, user: found.user, favorites, nextCursor});
    if (found.expires < now() + SESSION_TTL - 86400) {
      await env.DB.prepare('UPDATE sessions SET expires_at = ?1 WHERE token_hash = ?2').bind(now() + SESSION_TTL, found.hash).run();
      response.headers.append('Set-Cookie', cookie(cookieNames(origin).session, found.token, SESSION_TTL, origin));
    }
    return response;
  }
  async function importFavorites(request, env, found) {
    const body = await readJSON(request, 1024 * 1024);
    if (!Array.isArray(body.favorites) || body.favorites.length > 100) throw new ApiError(400, 'invalid_import');
    const records = new Map();
    for (const input of body.favorites) {
      const id = idOf(input?.repo_id);
      if (!id) throw new ApiError(400, 'invalid_repository');
      records.set(id, sanitizeRepository(input.repository, id));
    }
    let batchKey;
    if (body.migration_id !== undefined) {
      if (typeof body.migration_id !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(body.migration_id)
          || !Number.isSafeInteger(body.batch_id) || body.batch_id < 0 || body.batch_id > 1000) throw new ApiError(400, 'invalid_import');
      batchKey = `${body.migration_id}:${body.batch_id}`;
    } else batchKey = `legacy:${await sha256(JSON.stringify([...records.keys()].sort((a, b) => a - b)))}`;
    const githubId = Number(found.user.id), time = now();
    const existing = await env.DB.prepare('SELECT batch_key FROM favorite_imports WHERE github_id = ?1 AND batch_key = ?2').bind(githubId, batchKey).first();
    if (existing) return json({ok: true, replayed: true});
    const statements = [...records].map(([id, repository]) => env.DB.prepare(`INSERT INTO favorites (github_id,repo_id,repository,created_at,updated_at)
      SELECT ?1,?2,?3,?4,?4 WHERE NOT EXISTS (SELECT 1 FROM favorite_imports WHERE github_id=?1 AND batch_key=?5)
      ON CONFLICT(github_id,repo_id) DO NOTHING`).bind(githubId, id, JSON.stringify(repository), time, batchKey));
    statements.push(env.DB.prepare('INSERT INTO favorite_imports (github_id,batch_key,created_at) VALUES (?1,?2,?3) ON CONFLICT DO NOTHING').bind(githubId, batchKey, time));
    await env.DB.batch(statements);
    return json({ok: true});
  }
  return {
    async fetch(request, env) {
      try {
        const url = new URL(request.url), origin = publicOrigin(env), authConfigured = configured(env);
        if (url.origin !== origin) throw new ApiError(403, 'origin_rejected');
        if (url.pathname === '/api/health' && request.method === 'GET') {
          if (authConfigured) await env.DB.prepare('SELECT repo_id FROM favorites LIMIT 1').first();
          return json({ok: true, authConfigured});
        }
        if (url.pathname === '/api/bootstrap' && request.method === 'GET') {
          if (!authConfigured) return json({authConfigured: false, user: null, favorites: [], nextCursor: null});
          return await bootstrap(request, env, origin);
        }
        if (!authConfigured) throw new ApiError(503, 'auth_not_configured');
        if (url.pathname === '/api/auth/github' && request.method === 'GET') return await startLogin(request, env, origin);
        if (url.pathname === '/api/auth/github/callback' && request.method === 'GET') return await callback(request, env, origin);
        const favoriteMatch = /^\/api\/favorites\/([1-9]\d{0,15})$/.exec(url.pathname);
        const importRoute = url.pathname === '/api/favorites/import' && request.method === 'POST';
        const logoutRoute = url.pathname === '/api/auth/logout' && request.method === 'POST';
        if (!importRoute && !logoutRoute && !(favoriteMatch && ['PUT', 'DELETE'].includes(request.method))) throw new ApiError(404, 'not_found');
        assertSameOrigin(request, origin);
        const found = await requireSession(request, env, origin);
        if (logoutRoute) {
          await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(found.hash).run();
          const response = json({ok: true});
          response.headers.append('Set-Cookie', cookie(cookieNames(origin).session, '', 0, origin));
          return response;
        }
        if (importRoute) return await importFavorites(request, env, found);
        const id = idOf(favoriteMatch[1]);
        if (!id) throw new ApiError(400, 'invalid_repository');
        if (request.method === 'DELETE') {
          await env.DB.prepare('DELETE FROM favorites WHERE github_id = ?1 AND repo_id = ?2').bind(Number(found.user.id), id).run();
          return json({ok: true});
        }
        const body = await readJSON(request, 32768), repository = sanitizeRepository(body.repository, id), time = now();
        await env.DB.prepare(`INSERT INTO favorites (github_id,repo_id,repository,created_at,updated_at) VALUES (?1,?2,?3,?4,?4)
          ON CONFLICT(github_id,repo_id) DO UPDATE SET repository=excluded.repository,updated_at=excluded.updated_at`)
          .bind(Number(found.user.id), id, JSON.stringify(repository), time).run();
        return json({ok: true});
      } catch (error) {
        return json({error: error instanceof ApiError ? error.code : 'service_unavailable'}, error instanceof ApiError ? error.status : 503);
      }
    }
  };
}

export default createWorker();
