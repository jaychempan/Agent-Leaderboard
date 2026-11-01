// The service worker owns authentication. Only public snapshots may reach panels.
export const API_BASE = 'https://agent-leaderboard-api.jaychempan.workers.dev/api';
export const EXTENSION_ID = 'medjijlfgmfeldlelkidiickdcnbicaf';
export const STORAGE_KEYS = Object.freeze({session: 'agentFavoritesSessionV1', pending: 'agentFavoritesLoginV1',
  cache: 'agentFavoritesCloudV1', migration: 'agentFavoritesMigrationV1'});
const SOURCES = Object.freeze({skill: 'skills', mcp: 'mcp', prompt: 'prompts', framework: 'frameworks', auto_research: 'research'});
const REVERSE_SOURCES = Object.fromEntries(Object.entries(SOURCES).map(([key, value]) => [value, key]));
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const AUTH_ERRORS = new Set(['invalid_state', 'access_denied', 'oauth_client_configuration', 'oauth_redirect_configuration',
  'oauth_code_rejected', 'oauth_email_unverified', 'oauth_token_unavailable', 'oauth_identity_unavailable',
  'oauth_identity_invalid', 'oauth_storage_unavailable']);
const API_ERRORS = new Set([...AUTH_ERRORS, 'authentication_required', 'account_changed', 'invalid_login_exchange',
  'auth_not_configured', 'repository_not_found', 'repository_unavailable', 'invalid_repository', 'origin_rejected']);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const clone = value => JSON.parse(JSON.stringify(value));
const string = (value, limit = 4000) => typeof value === 'string' ? value.slice(0, limit) : '';
const list = value => Array.isArray(value) ? [...new Set(value.filter(item => typeof item === 'string').map(item => item.slice(0, 100)))].slice(0, 32) : [];
const idOf = value => Number.isSafeInteger(value) && value > 0 ? value : null;
const nameOf = value => typeof value === 'string' && /^[\w.-]+\/[\w.-]+$/.test(value)
  && !value.split('/').some(part => part === '.' || part === '..') ? value : '';
const validRecordKey = value => Boolean(nameOf(value) || (typeof value === 'string' && /^repo-id:[1-9]\d{0,15}$/.test(value) && idOf(Number(value.slice(8)))));
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : '';
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const failure = (code, status) => Object.assign(new Error(code), {code, status});
const publicUser = value => value && typeof value.login === 'string' && /^[1-9]\d{0,15}$/.test(String(value.id)) && Number.isSafeInteger(Number(value.id))
  && /^[A-Za-z0-9-]{1,39}$/.test(value.login || '') ? {id: String(value.id), login: value.login,
    avatar_url: /^https:\/\/avatars\.githubusercontent\.com\//.test(value.avatar_url || '') ? value.avatar_url.slice(0, 1000) : ''} : null;

export function sanitizeExtensionRepository(value, forcedId) {
  if (!value || typeof value !== 'object') return null;
  const id = idOf(forcedId ?? value.source_id), name = nameOf(value.full_name);
  const placeholder = !name && id && (value.full_name === '' || value.full_name === undefined || value.full_name === null);
  if (!name && !placeholder) return null;
  const sources = list(value.sources?.length ? value.sources : [value.source_type]).filter(source => own(SOURCES, source));
  const categories = list(value.categories?.length ? value.categories : value.category ? [value.category] : []);
  const record = {key: name ? name.toLowerCase() : `repo-id:${id}`, full_name: name, source_type: sources[0] || '', sources,
    ...(placeholder ? {placeholder: true} : {}),
    description: string(value.description), stars: count(value.stars), forks: count(value.forks), language: string(value.language, 100),
    updated_at: date(value.updated_at), created_at: date(value.created_at), category: string(value.category, 100), categories,
    topics: list(value.topics), platforms: list(value.platforms), use_cases: list(value.use_cases), facets: {}};
  if (id) record.source_id = id;
  for (const source of sources) {
    const facet = value.facets?.[source] || record;
    record.facets[source] = {categories: list(facet.categories?.length ? facet.categories : categories),
      use_cases: list(facet.use_cases), stars: count(facet.stars), language: string(facet.language, 100),
      updated_at: date(facet.updated_at), platforms: list(facet.platforms)};
  }
  return record;
}

export function extensionToCloud(value, forcedId) {
  const record = sanitizeExtensionRepository(value, forcedId);
  if (!record?.source_id) return null;
  return {id: record.source_id, full_name: record.full_name, url: record.full_name ? `https://github.com/${record.full_name}` : '',
    description: record.description, stars: record.stars, forks: record.forks, language: record.language,
    category: record.category, categories: record.categories, topics: record.topics, use_cases: record.use_cases,
    sources: record.sources.map(source => SOURCES[source]), agentTags: record.platforms,
    created_at: record.created_at, updated_at: record.updated_at};
}

export function cloudToExtension(value, forcedId) {
  if (!value || typeof value !== 'object') return null;
  return sanitizeExtensionRepository({...value, platforms: list(value.agentTags),
    sources: list(value.sources).map(source => REVERSE_SOURCES[source]).filter(Boolean)}, forcedId ?? value.id);
}

export function createFavoritesSync(options = {}) {
  const chrome = options.chrome || globalThis.chrome;
  const fetcher = options.fetch || globalThis.fetch?.bind(globalThis);
  const catalog = options.catalog || (async () => []);
  const crypto = options.crypto || globalThis.crypto;
  const now = options.now || Date.now;
  const onChange = typeof options.onChange === 'function' ? options.onChange : () => {};
  let loaded, initializing, syncTask, signInTask, tail = Promise.resolve(), sessionTail = Promise.resolve();
  let session = null, cloud = {}, local = {}, migration = null, catalogByName = new Map(), catalogById = new Map();
  let status = 'local', error = null, cacheFailed = false, epoch = 0, pendingKeys = new Set(), unresolvedKeys = new Set();
  const controllers = new Set();

  function visibleLocal() {
    if (!session) return local;
    return Object.fromEntries(Object.entries(local).filter(([key]) => !migration?.owners[key] || migration.owners[key] === session.user.id));
  }
  function cloudView(record) {
    const current = catalogById.get(record.source_id);
    return current ? sanitizeExtensionRepository({...record, ...current,
      sources: [...new Set([...current.sources, ...record.sources])],
      facets: {...record.facets, ...current.facets}}, record.source_id) : record;
  }
  function snapshot() {
    const favorites = {}, cloudKeys = new Set();
    for (const record of Object.values(cloud)) {
      const visible = cloudView(record); favorites[visible.key] = clone(visible); cloudKeys.add(record.key);
    }
    for (const [key, record] of Object.entries(visibleLocal())) {
      const id = record.source_id || catalogByName.get(key)?.source_id;
      if (!cloudKeys.has(key) && !(id && cloud[id])) favorites[key] ||= clone(record);
    }
    const visible = new Set(Object.keys(visibleLocal()));
    return {user: session ? {...session.user} : null, favorites, status, error: error || (cacheFailed ? 'storage_unavailable' : null),
      pendingImportCount: session ? [...pendingKeys].filter(key => visible.has(key)).length : 0,
      localOnlyCount: session ? [...unresolvedKeys].filter(key => visible.has(key)).length : visible.size};
  }
  function emit() { const value = snapshot(); try { Promise.resolve(onChange(value)).catch(() => {}); } catch { /* UI delivery does not change saved data. */ } return value; }
  function enqueue(work) { const promise = tail.then(work); tail = promise.catch(() => {}); return promise; }
  async function storageGet(area, key) {
    try { return await chrome.storage[area].get(key); } catch { throw failure('storage_unavailable'); }
  }
  function sessionWrite(work) {
    const promise = sessionTail.then(work); sessionTail = promise.catch(() => {}); return promise;
  }
  function storageSet(area, value) {
    const work = async () => { try { await chrome.storage[area].set(value); } catch { throw failure('storage_unavailable'); } };
    return area === 'session' ? sessionWrite(work) : work();
  }
  function storageRemove(area, key) {
    const work = async () => { try { await chrome.storage[area].remove(key); } catch { throw failure('storage_unavailable'); } };
    return area === 'session' ? sessionWrite(work) : work();
  }
  function readLocal(values) {
    const result = {};
    for (const [key, value] of Object.entries(values)) if (key.startsWith('favorite:')) {
      const record = sanitizeExtensionRepository(value);
      if (record && key === `favorite:${record.key}`) result[record.key] = record;
    }
    return result;
  }
  function readMigration(value, records) {
    if (!value) return null;
    function readPlan(plan) {
      if (!plan || !/^[A-Za-z0-9_-]{16,100}$/.test(plan.id) || !Array.isArray(plan.batches)) throw failure('storage_unavailable');
      const batches = plan.batches.map((batch, index) => {
        if (batch.id !== index || !Array.isArray(batch.rows) || !batch.rows.length || batch.rows.length > 100
            || !Array.isArray(batch.keys) || batch.keys.some(key => !validRecordKey(key))) throw failure('storage_unavailable');
        const rows = batch.rows.map(row => {
          const record = cloudToExtension(row.repository, row.repo_id);
          if (!record?.source_id) throw failure('storage_unavailable');
          return {repo_id: record.source_id, repository: extensionToCloud(record)};
        });
        return {id: index, rows, keys: [...new Set(batch.keys)], confirmed: batch.confirmed === true, cleaned: batch.cleaned === true};
      });
      return {id: plan.id, batches};
    }
    if (value.version === 2) {
      if (!value.owners || typeof value.owners !== 'object' || Array.isArray(value.owners)
          || !value.plans || typeof value.plans !== 'object' || Array.isArray(value.plans)) throw failure('storage_unavailable');
      const owners = {}, plans = {};
      for (const [key, owner] of Object.entries(value.owners)) {
        if (!validRecordKey(key) || !publicUser({id: owner, login: 'owner'})) throw failure('storage_unavailable');
        owners[key] = String(owner);
      }
      for (const [owner, plan] of Object.entries(value.plans)) {
        if (!publicUser({id: owner, login: 'owner'})) throw failure('storage_unavailable');
        plans[owner] = readPlan(plan);
      }
      return {version: 2, owners, plans};
    }
    // Existing frozen receipts keep their original identity during the metadata upgrade.
    if (!publicUser({id: value.owner, login: 'owner'})) throw failure('storage_unavailable');
    const owner = String(value.owner), plan = readPlan(value), owners = {};
    for (const key of Object.keys(records)) owners[key] = owner;
    for (const batch of plan.batches) if (!batch.cleaned) for (const key of batch.keys) owners[key] = owner;
    return {version: 2, owners, plans: {[owner]: plan}};
  }
  async function refreshLocal() {
    const values = await storageGet('local', null);
    const records = readLocal(values), nextMigration = readMigration(values[STORAGE_KEYS.migration], records);
    local = records; migration = nextMigration;
  }
  async function refreshCatalog() {
    try {
      const values = await catalog();
      if (!Array.isArray(values)) return;
      const records = values.map(value => sanitizeExtensionRepository(value)).filter(Boolean);
      catalogByName = new Map(records.map(value => [value.key, value])); catalogById = new Map();
      for (const record of records) if (record.source_id) {
        const previous = catalogById.get(record.source_id);
        if (!previous || (Date.parse(record.updated_at) || 0) >= (Date.parse(previous.updated_at) || 0)) catalogById.set(record.source_id, record);
      }
    } catch { /* Out-of-catalog records can still be resolved by the API. */ }
  }
  async function load() {
    if (loaded) return loaded;
    loaded = (async () => {
      try {
        await refreshLocal(); await refreshCatalog();
        const values = await storageGet('session', [STORAGE_KEYS.session, STORAGE_KEYS.cache]);
        const value = values[STORAGE_KEYS.session], owner = publicUser(value?.user);
        if (value?.api === API_BASE && TOKEN.test(value.token || '') && owner && date(value.expiresAt) && Date.parse(value.expiresAt) > now()) {
          session = {api: API_BASE, token: value.token, expiresAt: value.expiresAt, user: owner};
          const cache = values[STORAGE_KEYS.cache];
          if (cache?.owner === owner.id && cache.api === API_BASE && Array.isArray(cache.records)) {
            for (const value of cache.records) { const record = sanitizeExtensionRepository(value); if (record?.source_id) cloud[record.source_id] = record; }
          }
        } else if (value || values[STORAGE_KEYS.cache]) await storageRemove('session', [STORAGE_KEYS.session, STORAGE_KEYS.cache]);
        unresolvedKeys = new Set(Object.keys(visibleLocal()));
      } catch { error = 'storage_unavailable'; status = 'error'; }
      return emit();
    })();
    return loaded;
  }
  async function persistCloud(context = epoch) {
    if (!session || context !== epoch) return;
    try {
      await storageSet('session', {[STORAGE_KEYS.cache]: {api: API_BASE, owner: session.user.id, records: Object.values(cloud)}});
      if (context === epoch) cacheFailed = false;
    } catch { if (context === epoch) cacheFailed = true; }
  }
  function invalidateMemory() {
    epoch += 1; session = null; cloud = {}; cacheFailed = false; pendingKeys.clear(); unresolvedKeys = new Set(Object.keys(local));
    for (const controller of controllers) controller.abort();
  }
  async function clearAuthentication() {
    invalidateMemory();
    await storageRemove('session', [STORAGE_KEYS.session, STORAGE_KEYS.pending, STORAGE_KEYS.cache]);
  }
  async function request(path, {method = 'GET', body, userId, authentication = session} = {}) {
    if (!fetcher) throw failure('network_failed');
    if (userId && (!authentication || Date.parse(authentication.expiresAt) <= now())) throw failure('authentication_required', 401);
    const headers = {'X-Favorites-Extension': EXTENSION_ID};
    if (authentication) headers.Authorization = 'Bearer ' + authentication.token;
    if (userId) headers['X-Favorites-User'] = userId;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const controller = new AbortController(); controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetcher(API_BASE + path, {method, headers, credentials: 'omit', cache: 'no-store', signal: controller.signal,
        ...(body === undefined ? {} : {body: JSON.stringify(body)})});
      let payload; try { payload = await response.json(); } catch { throw failure('invalid_response'); }
      if (!response.ok) throw failure(API_ERRORS.has(payload?.error) ? payload.error : 'request_failed', response.status);
      return payload;
    } catch (exception) { if (exception?.code) throw exception; throw failure('network_failed'); }
    finally { clearTimeout(timeout); controllers.delete(controller); }
  }
  function current(context) { return context.epoch === epoch && context.id === session?.user.id; }
  async function bootstrap(context) {
    const first = await request('/bootstrap');
    if (!current(context)) throw failure('stale_request');
    if (typeof first?.authConfigured !== 'boolean' || !Array.isArray(first.favorites)) throw failure('invalid_response');
    const owner = publicUser(first.user);
    if (!session) {
      if (owner) throw failure('account_changed', 409);
      return {};
    }
    if (!owner) throw failure('authentication_required', 401);
    if (owner.id !== session.user.id) throw failure('account_changed', 409);
    const rows = [...first.favorites]; let cursor = first.nextCursor, after = 0;
    while (cursor !== null && cursor !== undefined) {
      if (!idOf(cursor) || cursor <= after || !rows.length || rows.at(-1)?.repo_id !== cursor) throw failure('invalid_response');
      after = cursor;
      const page = await request('/bootstrap?after=' + after, {userId: owner.id});
      if (!current(context)) throw failure('stale_request');
      if (publicUser(page?.user)?.id !== owner.id) throw failure('account_changed', 409);
      if (!Array.isArray(page.favorites) || page.favorites.some(row => !idOf(row?.repo_id) || row.repo_id <= after)) throw failure('invalid_response');
      rows.push(...page.favorites); cursor = page.nextCursor;
    }
    const result = {};
    for (const row of rows) { const record = cloudToExtension(row?.repository, row?.repo_id); if (record?.source_id) result[record.source_id] = record; }
    return result;
  }
  async function resolve(record, context) {
    const known = idOf(record.source_id) || idOf(catalogByName.get(record.key)?.source_id)
      || Object.values(cloud).find(value => value.key === record.key)?.source_id;
    if (known) return sanitizeExtensionRepository({...catalogByName.get(record.key), ...record}, known);
    const result = await request('/favorites/resolve', {method: 'POST', userId: context.id, body: {full_name: record.full_name}});
    if (!current(context)) throw failure('stale_request');
    if (!idOf(result?.repo_id) || !nameOf(result.full_name)) throw failure('invalid_response');
    return sanitizeExtensionRepository({...record, full_name: result.full_name}, result.repo_id);
  }
  async function saveMigration(value) {
    await storageSet('local', {[STORAGE_KEYS.migration]: value}); migration = value;
  }
  async function importLegacy(context) {
    await refreshLocal(); await refreshCatalog();
    if (!current(context)) throw failure('stale_request');
    pendingKeys.clear(); unresolvedKeys.clear();
    const claimed = clone(migration || {version: 2, owners: {}, plans: {}});
    for (const key of Object.keys(local)) if (!claimed.owners[key]) claimed.owners[key] = context.id;
    if (!claimed.plans[context.id]) claimed.plans[context.id] = {id: crypto.randomUUID(), batches: []};
    await saveMigration(claimed); // Bind only existing anonymous keys before resolving or writing them.
    const plan = migration.plans[context.id];
    const plannedKeys = new Set(plan.batches.filter(batch => !batch.cleaned).flatMap(batch => batch.keys));
    const additions = [];
    for (const [key, record] of Object.entries(local)) {
      if (migration.owners[key] !== context.id) continue;
      if (plannedKeys.has(key)) { pendingKeys.add(key); continue; }
      try { additions.push({key, record: await resolve(record, context)}); pendingKeys.add(key); }
      catch (exception) {
        if (['repository_not_found', 'repository_unavailable', 'network_failed'].includes(exception.code)) { unresolvedKeys.add(key); continue; }
        throw exception;
      }
    }
    if (!current(context)) throw failure('stale_request');
    if (additions.length) {
      const value = clone(migration), target = value.plans[context.id];
      let batch = [], bytes = 0;
      function appendBatch() {
        const rows = new Map();
        for (const {record} of batch) rows.set(record.source_id, {repo_id: record.source_id, repository: extensionToCloud(record)});
        target.batches.push({id: target.batches.length, keys: batch.map(item => item.key), rows: [...rows.values()], confirmed: false, cleaned: false});
        batch = []; bytes = 0;
      }
      for (const item of additions) {
        const size = new TextEncoder().encode(JSON.stringify({repo_id: item.record.source_id, repository: extensionToCloud(item.record)})).byteLength;
        if (batch.length && (batch.length >= 100 || bytes + size > 900000)) appendBatch();
        batch.push(item); bytes += size + 1;
      }
      if (batch.length) appendBatch();
      await saveMigration(value); // The exact receipt identity and rows must survive a worker restart.
    }
    emit();
    let changed = false;
    for (let index = 0; index < migration.plans[context.id].batches.length; index += 1) {
      const batch = migration.plans[context.id].batches[index];
      if (batch.cleaned) continue;
      if (!batch.confirmed) {
        changed = true;
        await request('/favorites/import', {method: 'POST', userId: context.id,
          body: {migration_id: migration.plans[context.id].id, batch_id: batch.id, favorites: batch.rows}});
        if (!current(context)) throw failure('stale_request');
        const value = clone(migration); value.plans[context.id].batches[index].confirmed = true; await saveMigration(value);
      }
      if (!current(context)) throw failure('stale_request');
      const remaining = batch.keys.filter(key => own(local, key) && migration.owners[key] === context.id);
      if (remaining.length) await storageRemove('local', remaining.map(key => `favorite:${key}`));
      for (const key of remaining) { delete local[key]; pendingKeys.delete(key); }
      const value = clone(migration); value.plans[context.id].batches[index].cleaned = true;
      for (const key of batch.keys) if (value.owners[key] === context.id && !own(local, key)) delete value.owners[key];
      await saveMigration(value);
    }
    return changed;
  }
  async function refresh(context) {
    if (context.epoch !== epoch) return snapshot();
    status = 'initializing'; error = null; emit();
    try {
      await refreshLocal();
      if (!current(context)) return snapshot();
      cloud = await bootstrap(context);
      if (!current(context)) return snapshot();
      if (session) {
        await persistCloud(context.epoch);
        status = 'syncing'; emit();
        const imported = await importLegacy(context);
        if (!current(context)) return snapshot();
        if (imported) cloud = await bootstrap(context);
        if (!current(context)) return snapshot();
        await persistCloud(context.epoch);
      }
      status = cacheFailed ? 'error' : session && !Object.keys(visibleLocal()).length ? 'synced' : 'local'; error = cacheFailed ? 'storage_unavailable' : null;
    } catch (exception) {
      if (context.epoch !== epoch || exception.code === 'stale_request') return snapshot();
      if (exception.status === 401 || exception.code === 'account_changed') {
        try { await clearAuthentication(); } catch { error = 'storage_unavailable'; }
        error ||= exception.code === 'account_changed' ? 'account_changed' : 'auth_failed'; status = 'error';
      } else {
        error = exception.code === 'storage_unavailable' ? 'storage_unavailable' : pendingKeys.size ? 'local_import_failed' : 'sync_failed';
        status = exception.code === 'network_failed' ? 'offline' : 'error';
      }
    }
    return emit();
  }
  async function getSnapshot() {
    await load();
    if (session && Date.parse(session.expiresAt) <= now()) {
      try { await clearAuthentication(); error = 'auth_failed'; } catch { error = 'storage_unavailable'; }
      status = 'local'; emit();
    }
    return snapshot();
  }
  function sync() {
    if (syncTask) return syncTask;
    syncTask = (async () => { await load(); const context = {epoch, id: session?.user.id}; return enqueue(() => refresh(context)); })()
      .finally(() => { syncTask = null; });
    return syncTask;
  }
  function init() { return initializing ||= sync(); }
  function base64url(bytes) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function random() { return base64url(crypto.getRandomValues(new Uint8Array(32))); }
  function signIn() {
    if (signInTask) return signInTask;
    let attemptEpoch;
    signInTask = (async () => {
      await load();
      const startEpoch = epoch; attemptEpoch = startEpoch;
      const verifier = random(), state = random(), returnTo = chrome.identity.getRedirectURL('github');
      if (chrome.runtime.id !== EXTENSION_ID || returnTo !== `https://${EXTENSION_ID}.chromiumapp.org/github`) throw failure('auth_failed');
      const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
      await storageSet('session', {[STORAGE_KEYS.pending]: {api: API_BASE, verifier, state, createdAt: now()}});
      status = 'syncing'; error = null; emit();
      const address = API_BASE + '/auth/github?' + new URLSearchParams({client: 'extension', return_to: returnTo, client_challenge: challenge, client_state: state});
      let returned;
      try { returned = await chrome.identity.launchWebAuthFlow({url: address, interactive: true}); }
      catch { throw failure('auth_cancelled'); }
      if (epoch !== startEpoch) throw failure('stale_request');
      const values = await storageGet('session', STORAGE_KEYS.pending), pending = values[STORAGE_KEYS.pending];
      await storageRemove('session', STORAGE_KEYS.pending);
      let url; try { url = new URL(returned); } catch { throw failure('auth_failed'); }
      if (url.origin !== new URL(returnTo).origin || url.pathname !== new URL(returnTo).pathname || url.hash || url.username || url.password) throw failure('auth_failed');
      if (url.searchParams.has('auth_error')) throw failure(AUTH_ERRORS.has(url.searchParams.get('auth_error')) ? url.searchParams.get('auth_error') : 'auth_failed');
      const code = url.searchParams.get('login_code');
      if (!TOKEN.test(code || '') || url.searchParams.get('login_state') !== state || pending?.state !== state
          || pending.verifier !== verifier || pending.api !== API_BASE || !Number.isFinite(pending.createdAt)
          || now() - pending.createdAt < 0 || now() - pending.createdAt > 600000) throw failure('auth_failed');
      const payload = await request('/auth/exchange', {method: 'POST', authentication: null, body: {code, verifier, state}});
      if (epoch !== startEpoch) throw failure('stale_request');
      const user = publicUser(payload?.user);
      if (!user || !TOKEN.test(payload?.token || '') || !date(payload.expiresAt) || Date.parse(payload.expiresAt) <= now()) throw failure('auth_failed');
      const value = {api: API_BASE, token: payload.token, expiresAt: payload.expiresAt, user};
      await storageSet('session', {[STORAGE_KEYS.session]: value, [STORAGE_KEYS.cache]: {api: API_BASE, owner: user.id, records: []}});
      if (epoch !== startEpoch) throw failure('stale_request');
      epoch += 1; session = value; cloud = {}; cacheFailed = false; pendingKeys.clear(); unresolvedKeys.clear();
      for (const controller of controllers) controller.abort();
      const context = {epoch, id: user.id};
      return enqueue(() => refresh(context));
    })().catch(async exception => {
      if (attemptEpoch !== undefined && attemptEpoch !== epoch) return snapshot();
      try { await storageRemove('session', STORAGE_KEYS.pending); } catch { /* Report the storage failure below when it caused this attempt. */ }
      if (exception.code !== 'stale_request') {
        error = AUTH_ERRORS.has(exception.code) || ['storage_unavailable', 'auth_cancelled'].includes(exception.code) ? exception.code : 'auth_failed';
        status = exception.code === 'auth_cancelled' ? (session ? 'synced' : 'local') : 'error'; emit();
      }
      return snapshot();
    }).finally(() => { signInTask = null; });
    return signInTask;
  }
  async function signOut() {
    await load(); const previous = session, logoutEpoch = epoch + 1;
    try { await clearAuthentication(); status = 'local'; error = null; emit(); }
    catch { status = 'error'; error = 'storage_unavailable'; emit(); return snapshot(); }
    if (previous) {
      try { await request('/auth/logout', {method: 'POST', userId: previous.user.id, authentication: previous}); }
      catch (exception) { if (epoch === logoutEpoch && exception.status !== 401) { error = 'auth_failed'; status = exception.code === 'network_failed' ? 'offline' : 'error'; } }
    }
    return emit();
  }
  async function toggle(input) {
    await load();
    const record = sanitizeExtensionRepository(input);
    if (!record) { error = 'save_failed'; status = 'error'; return emit(); }
    const context = {epoch, id: session?.user.id};
    return enqueue(async () => {
      if (!current(context)) return snapshot();
      try {
        await refreshLocal();
        if (!session) {
          if (own(local, record.key)) {
            await storageRemove('local', `favorite:${record.key}`); delete local[record.key];
            if (migration?.owners[record.key]) { const value = clone(migration); delete value.owners[record.key]; await saveMigration(value); }
          } else {
            const value = migration ? clone(migration) : null;
            if (value) delete value.owners[record.key];
            await storageSet('local', {[`favorite:${record.key}`]: record, ...(value ? {[STORAGE_KEYS.migration]: value} : {})});
            local[record.key] = record; if (value) migration = value;
          }
          unresolvedKeys = new Set(Object.keys(local)); status = 'local'; error = null; return emit();
        }
        if (pendingKeys.has(record.key)) throw failure('local_import_failed');
        const localRecord = visibleLocal()[record.key];
        const saved = Object.values(cloud).find(value => value.key === record.key || (record.source_id && value.source_id === record.source_id));
        if (localRecord && !saved) {
          await storageRemove('local', `favorite:${record.key}`); delete local[record.key]; unresolvedKeys.delete(record.key);
          if (migration?.owners[record.key]) { const value = clone(migration); delete value.owners[record.key]; await saveMigration(value); }
          status = Object.keys(visibleLocal()).length ? 'local' : 'synced'; error = null; return emit();
        }
        await refreshCatalog();
        const resolved = saved || await resolve(record, context);
        if (!current(context)) return snapshot();
        const previous = cloud; cloud = {...cloud};
        if (saved) delete cloud[resolved.source_id]; else cloud[resolved.source_id] = resolved;
        status = 'syncing'; error = null; emit();
        try {
          await request('/favorites/' + resolved.source_id, {method: saved ? 'DELETE' : 'PUT', userId: context.id,
            ...(saved ? {} : {body: {repository: extensionToCloud(resolved)}})});
          if (!current(context)) return snapshot();
          await persistCloud(context.epoch);
          status = cacheFailed ? 'error' : Object.keys(visibleLocal()).length ? 'local' : 'synced';
        } catch (exception) { if (current(context)) cloud = previous; throw exception; }
        error = cacheFailed ? 'storage_unavailable' : null;
      } catch (exception) {
        if (!current(context) || exception.code === 'stale_request') return snapshot();
        if (exception.status === 401 || exception.code === 'account_changed') {
          try { await clearAuthentication(); } catch { error = 'storage_unavailable'; }
          error ||= exception.code === 'account_changed' ? 'account_changed' : 'auth_failed'; status = 'error';
        } else {
          error = ['storage_unavailable', 'repository_not_found', 'repository_unavailable', 'local_import_failed'].includes(exception.code) ? exception.code : 'save_failed';
          status = exception.code === 'network_failed' ? 'offline' : 'error';
        }
      }
      return emit();
    });
  }
  return {init, getSnapshot, signIn, signOut, sync, toggle};
}
