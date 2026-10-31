/* GitHub favorites use the site's same-origin Worker API and HttpOnly session. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FavoritesSync = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const KEYS = Object.freeze({legacy: 'st_favorites', backup: 'st_favorites_backup_v1',
    anonymous: 'st_favorites_anonymous_v1', meta: 'st_favorites_sync_v1',
    cloud: 'st_favorites_cloud_v2'});
  const SOURCES = new Set(['skills', 'mcp', 'research', 'prompts', 'frameworks']);
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const text = (value, limit) => typeof value === 'string' ? value.slice(0, limit) : '';
  const idOf = value => {
    const id = typeof value === 'string' && /^[1-9]\d{0,15}$/.test(value) ? Number(value) : value;
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  };
  const strings = value => Array.isArray(value) ? [...new Set(value.filter(item => typeof item === 'string')
    .map(item => item.slice(0, 100)))].slice(0, 32) : [];
  const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : '';
  function sanitizeRepository(value, forcedId) {
    const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const id = idOf(forcedId === undefined ? input.id : forcedId);
    if (!id) return null;
    let name = text(input.full_name, 160);
    if (!/^[\w.-]+\/[\w.-]+$/.test(name) || name.split('/').some(part => part === '.' || part === '..')) name = '';
    if (!name && typeof input.url === 'string') {
      try {
        const url = new URL(input.url);
        if (url.protocol === 'https:' && url.hostname === 'github.com' && !url.username && !url.password
            && !url.port && !url.search && !url.hash && /^\/[\w.-]+\/[\w.-]+\/?$/.test(url.pathname)) name = url.pathname.replace(/^\/|\/$/g, '');
      } catch (_) { /* An invalid URL stays non-clickable. */ }
    }
    return {id, full_name: name, url: name ? `https://github.com/${name}` : '',
      description: text(input.description, 4000), language: text(input.language, 100),
      stars: Number.isSafeInteger(input.stars) && input.stars >= 0 ? input.stars : 0,
      forks: Number.isSafeInteger(input.forks) && input.forks >= 0 ? input.forks : 0,
      category: text(input.category, 100), categories: strings(input.categories), topics: strings(input.topics),
      use_cases: strings(input.use_cases), agentTags: strings(input.agentTags),
      sources: strings(input.sources).filter(source => SOURCES.has(source)),
      created_at: date(input.created_at), updated_at: date(input.updated_at)};
  }
  function apiConfiguration(config, location) {
    try {
      if (!config || typeof config.apiBase !== 'string' || !config.apiBase) return null;
      if (/[\\\s%]/.test(config.apiBase) || /(?:^|\/)\.\.?(?:\/|$)/.test(config.apiBase)) return null;
      const page = new URL(typeof location === 'string' ? location : location?.href || 'https://agentskills.media/');
      const api = new URL(config.apiBase, page);
      if ((page.protocol !== 'https:' && !(page.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(page.hostname)))
          || api.origin !== page.origin || api.username || api.password || api.search || api.hash
          || !/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\/?$/.test(api.pathname)) return null;
      return api.href.replace(/\/$/, '');
    } catch (_) { return null; }
  }
  const validConfiguration = (config, location) => Boolean(apiConfiguration(config, location));
  function safeUser(value) {
    if (!value || !idOf(value.id) || typeof value.login !== 'string' || !/^[A-Za-z0-9-]{1,39}$/.test(value.login)) return null;
    let avatar = '';
    try { const url = new URL(value.avatar_url); if (url.protocol === 'https:') avatar = url.href.slice(0, 1000); } catch (_) { /* optional */ }
    return {id: String(value.id), login: value.login, avatar_url: avatar};
  }
  function createFavoritesStore(options = {}) {
    const storage = options.storage;
    const target = options.eventTarget || (typeof window !== 'undefined' ? window : null);
    const location = options.location || (typeof window !== 'undefined' ? window.location : null);
    const history = options.history || (typeof window !== 'undefined' ? window.history : null);
    const fetcher = options.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    const api = apiConfiguration(options.config, location);
    const catalog = typeof options.catalog === 'function' ? options.catalog : () => [];
    const onChange = typeof options.onChange === 'function' ? options.onChange : () => {};
    let user = null, configured = false, status = 'local', error = null, storageFailed = false;
    let epoch = 0, destroyed = false, initialized = null, syncTask = null, tail = Promise.resolve();
    let confirmed = {}, records = {}, anonymous = {}, migration = null, importBlocked = false, anonymousUnsaved = false;
    let catalogReference = null, catalogIndex = new Map();
    const operations = [], listeners = [], controllers = new Set();
    function read(key) { try { return storage?.getItem(key) ?? null; } catch (_) { storageFailed = true; return null; } }
    function write(key, value) {
      try {
        if (!storage?.setItem) throw new Error('storage');
        storage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        storageFailed = false; return true;
      } catch (_) { storageFailed = true; error = 'storage_unavailable'; return false; }
    }
    function json(key) { try { return JSON.parse(read(key)); } catch (_) { return null; } }
    function localRecords(value) {
      const result = {};
      if (!value || typeof value !== 'object') return result;
      const entries = value.entries && typeof value.entries === 'object' ? value.entries : {};
      for (const [key, entry] of Object.entries(entries)) {
        const record = sanitizeRepository(entry?.repository, idOf(key));
        if (record && entry.deleted !== true) result[record.id] = record;
      }
      return result;
    }
    function repositoryFor(input, source, existing) {
      const id = idOf(input && typeof input === 'object' ? input.id : input);
      if (!id) return null;
      try {
        const list = catalog();
        if (Array.isArray(list) && list !== catalogReference) {
          catalogReference = list; catalogIndex = new Map();
          for (const candidate of list) {
            const key = idOf(candidate?.id); if (!key) continue;
            const previous = catalogIndex.get(key);
            catalogIndex.set(key, {...candidate, sources: [...new Set([...strings(previous?.sources), ...strings(candidate.sources)])]});
          }
        }
      } catch (_) { /* A catalog that has not loaded cannot discard a saved ID. */ }
      const current = catalogIndex.get(id);
      const given = input && typeof input === 'object' ? input : null;
      const record = sanitizeRepository({...existing, ...current, ...given, id}, id);
      record.sources = [...new Set([...strings(existing?.sources), ...strings(current?.sources),
        ...strings(given?.sources), source].filter(value => SOURCES.has(value)))];
      return record;
    }
    function saveAnonymous() {
      const saved = write(KEYS.anonymous, {entries: Object.fromEntries(Object.entries(anonymous).map(([id, repository]) => [id, {repository, deleted: false}]))});
      anonymousUnsaved = !saved; return saved;
    }
    anonymous = localRecords(json(KEYS.anonymous));
    const legacyMeta = json(KEYS.meta);
    if (legacyMeta?.migratedLegacy !== true) {
      const raw = read(KEYS.legacy);
      if (raw !== null && read(KEYS.backup) === null) write(KEYS.backup, raw);
      let ids = []; try { const value = JSON.parse(raw); if (Array.isArray(value)) ids = value; } catch (_) { /* Keep malformed legacy data in the backup. */ }
      for (const id of ids) { const record = repositoryFor(id); if (record) anonymous[record.id] = record; }
      if (saveAnonymous()) write(KEYS.meta, {migratedLegacy: true});
    }
    records = {...anonymous};
    function readMigration() {
      const value = json(KEYS.cloud);
      if (!value || !idOf(value.owner) || typeof value.id !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(value.id)) return null;
      return {owner: String(value.owner), id: value.id, ids: Array.isArray(value.ids) ? [...new Set(value.ids.map(idOf).filter(Boolean))].sort((a,b)=>a-b) : [],
        completed: Array.isArray(value.completed) ? value.completed.filter(index => Number.isSafeInteger(index) && index >= 0) : [], done: value.done === true};
    }
    function migrationID() {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
      return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
    }
    function visibleRecords() {
      records = user ? {...confirmed} : {...anonymous};
      if (user && importBlocked) for (const [id, record] of Object.entries(anonymous)) records[id] ||= record;
      for (const operation of operations) if (operation.epoch === epoch && operation.userId === user?.id) {
        if (operation.remove) delete records[operation.id]; else records[operation.id] = operation.repository;
      }
    }
    function getSnapshot() {
      const snapshotRecords = {};
      for (const [id, value] of Object.entries(records)) snapshotRecords[id] = repositoryFor(value, null, value);
      return {ids: Object.keys(snapshotRecords).map(Number).sort((a,b)=>a-b), records: snapshotRecords,
        user: user ? {...user} : null, configured, status, error: error || (storageFailed ? 'storage_unavailable' : null), pendingCount: 0};
    }
    function emit() { if (!destroyed) { try { onChange(getSnapshot()); } catch (_) { /* A renderer cannot undo a saved favorite. */ } } }
    function enqueue(work) { const task = tail.then(() => destroyed ? getSnapshot() : work()); tail = task.catch(() => {}); return task; }
    function failure(code, statusCode) { const exception = new Error(code); exception.code = code; exception.status = statusCode; return exception; }
    async function request(path, {method = 'GET', body, userId} = {}) {
      if (!api || !fetcher) throw failure('api_unavailable');
      const controller = new AbortController(); controllers.add(controller);
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        const headers = {};
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        if (userId) headers['X-Favorites-User'] = userId;
        const response = await fetcher(api + path, {method, credentials: 'same-origin', cache: 'no-store', headers,
          ...(body === undefined ? {} : {body: JSON.stringify(body)}), signal: controller.signal});
        let data = null; try { data = await response.json(); } catch (_) { /* An empty successful response is valid. */ }
        if (!response.ok) throw failure(typeof data?.error === 'string' ? data.error : 'request_failed', response.status);
        return data;
      } catch (exception) {
        if (exception?.status) throw exception;
        throw failure('network_failed');
      } finally { clearTimeout(timer); controllers.delete(controller); }
    }
    async function bootstrap() {
      const contextEpoch = epoch;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const first = await request('/bootstrap');
          if (destroyed || contextEpoch !== epoch) throw failure('stale_request');
          if (!first || typeof first.authConfigured !== 'boolean' || !Array.isArray(first.favorites)) throw failure('invalid_response');
          const owner = safeUser(first.user);
          if (first.user && !owner) throw failure('invalid_response');
          const favorites = [...first.favorites];
          let cursor = first.nextCursor;
          let after = 0;
          while (cursor !== undefined && cursor !== null) {
            const next = idOf(cursor);
            if (!first.authConfigured || !owner || !next || next <= after || !favorites.length
                || next !== idOf(favorites[favorites.length - 1]?.repo_id)) throw failure('invalid_response');
            after = next;
            const page = await request('/bootstrap?after=' + after, {userId: owner.id});
            if (destroyed || contextEpoch !== epoch) throw failure('stale_request');
            if (page?.authConfigured !== true || safeUser(page.user)?.id !== owner.id) throw failure('account_changed', 409);
            if (!Array.isArray(page.favorites) || (!page.favorites.length && page.nextCursor !== undefined && page.nextCursor !== null)
                || page.favorites.some(row => !idOf(row?.repo_id) || idOf(row.repo_id) <= after)) throw failure('invalid_response');
            favorites.push(...page.favorites);
            cursor = page.nextCursor;
          }
          return {...first, favorites, nextCursor: null};
        } catch (exception) {
          // A cookie can change in another tab between pages. Never combine identities.
          if (exception.code !== 'account_changed' || attempt !== 0) throw exception;
        }
      }
      throw failure('account_changed', 409);
    }
    function remoteRecords(rows) {
      if (!Array.isArray(rows)) throw failure('invalid_response');
      const result = {};
      for (const row of rows) { const record = sanitizeRepository(row?.repository, idOf(row?.repo_id)); if (record) result[record.id] = record; }
      return result;
    }
    function adopt(payload) {
      const next = safeUser(payload?.user);
      if (payload?.user && !next) throw failure('invalid_response');
      if (next?.id !== user?.id) { epoch += 1; user = next; operations.length = 0; importBlocked = false; }
      confirmed = next ? remoteRecords(payload.favorites) : {};
      visibleRecords();
    }
    async function importAnonymous() {
      if (!user) return false;
      migration = readMigration() || migration;
      if (migration && migration.owner !== user.id) return false;
      if (!migration || (migration.done && Object.keys(anonymous).length)) {
        migration = {owner: user.id, id: migrationID(), ids: Object.keys(anonymous).map(Number).sort((a,b)=>a-b), completed: [], done: false};
        if (!write(KEYS.cloud, migration)) throw failure('storage_unavailable');
      }
      if (migration.done) return false;
      // The stable batch identity must exist on disk before any server mutation.
      if (!write(KEYS.cloud, migration)) throw failure('storage_unavailable');
      const context = {epoch, userId: user.id};
      let requested = false;
      importBlocked = migration.ids.some(id => own(anonymous, id)); visibleRecords(); emit();
      for (let offset = 0; offset < migration.ids.length; offset += 100) {
        const batch = offset / 100;
        if (migration.completed.includes(batch)) continue;
        const favorites = migration.ids.slice(offset, offset + 100).filter(id => own(anonymous, id)).map(id => ({repo_id: id, repository: repositoryFor(anonymous[id])}));
        if (favorites.length) {
          await request('/favorites/import', {method: 'POST', userId: context.userId, body: {migration_id: migration.id, batch_id: batch, favorites}});
          requested = true;
        }
        if (context.epoch !== epoch || user?.id !== context.userId) return false;
        migration.completed.push(batch);
        if (!write(KEYS.cloud, migration)) throw failure('storage_unavailable');
      }
      const previous = anonymous;
      anonymous = Object.fromEntries(Object.entries(anonymous).filter(([id]) => !migration.ids.includes(Number(id))));
      if (!saveAnonymous()) { anonymous = previous; throw failure('storage_unavailable'); }
      migration.done = true;
      if (!write(KEYS.cloud, migration)) { migration.done = false; throw failure('storage_unavailable'); }
      importBlocked = false;
      return requested;
    }
    async function refresh(allowImport = true) {
      if (!api || !fetcher) { configured = false; status = 'local'; error = null; emit(); return getSnapshot(); }
      const startEpoch = epoch;
      status = 'initializing'; error = null; emit();
      try {
        let payload = await bootstrap();
        if (destroyed || epoch !== startEpoch) return getSnapshot();
        if (!payload || typeof payload.authConfigured !== 'boolean') throw failure('invalid_response');
        configured = payload.authConfigured;
        if (!configured) { if (user) { epoch += 1; user = null; operations.length = 0; confirmed = {}; } status = 'local'; error = null; visibleRecords(); emit(); return getSnapshot(); }
        adopt(payload);
        if (user && allowImport) {
          const context = {epoch, id: user.id};
          let imported = false;
          try { imported = await importAnonymous(); }
          catch (exception) { importBlocked = Object.keys(anonymous).length > 0; throw exception; }
          if (context.epoch !== epoch || user?.id !== context.id) return getSnapshot();
          if (imported) {
            payload = await bootstrap();
            if (context.epoch !== epoch) return getSnapshot();
            adopt(payload);
          }
        }
        status = user ? (operations.length ? 'syncing' : 'synced') : 'local'; error = null; visibleRecords(); emit();
      } catch (exception) {
        if (destroyed || epoch !== startEpoch && !user) return getSnapshot();
        if ((!user && [404, 503].includes(exception.status)) || exception.code === 'auth_not_configured') {
          configured = false; status = 'local'; error = null;
        } else {
          status = exception.code === 'network_failed' ? 'offline' : 'error';
          error = exception.code === 'storage_unavailable' ? 'storage_unavailable' : exception.code === 'account_changed' ? 'account_changed' : importBlocked ? 'local_import_failed' : 'sync_failed';
        }
        visibleRecords(); emit();
      }
      return getSnapshot();
    }
    function sync() {
      if (syncTask) return syncTask;
      syncTask = enqueue(() => refresh()).finally(() => { syncTask = null; });
      return syncTask;
    }
    function cleanAuthURL() {
      try {
        const url = new URL(location.href), fragment = new URLSearchParams(url.hash.slice(1));
        const authError = url.searchParams.has('auth_error') || url.searchParams.has('error') || fragment.has('error');
        for (const key of ['auth_error', 'code', 'error', 'error_description', 'error_code']) url.searchParams.delete(key);
        if (['error','error_description','error_code','access_token','refresh_token','provider_token','provider_refresh_token','token_type'].some(key => fragment.has(key))) url.hash = '';
        if (url.href !== location.href) history?.replaceState(null, '', url.href);
        return {url, authError};
      } catch (_) { return {url: null, authError: false}; }
    }
    function listen(type, callback) { if (target?.addEventListener) { target.addEventListener(type, callback); listeners.push([type, callback]); } }
    function init() {
      if (initialized) return initialized;
      listen('online', () => { void sync(); });
      listen('focus', () => { void sync(); });
      listen('storage', event => {
        if (!user && !anonymousUnsaved && (event.key === KEYS.anonymous || event.key === null)) { anonymous = localRecords(json(KEYS.anonymous)); visibleRecords(); emit(); }
      });
      const auth = cleanAuthURL();
      initialized = sync().then(snapshot => {
        if (auth.authError) { error = 'auth_failed'; status = 'error'; emit(); return getSnapshot(); }
        return snapshot;
      });
      return initialized;
    }
    function toggle(input, source) {
      const id = idOf(input && typeof input === 'object' ? input.id : input);
      const repository = repositoryFor(input, source, id && records[id]);
      if (!repository) return Promise.resolve(getSnapshot());
      if (!user) {
        const latest = !anonymousUnsaved && json(KEYS.anonymous); if (latest?.entries) anonymous = localRecords(latest);
        if (own(anonymous, id)) delete anonymous[id]; else anonymous[id] = repository;
        error = null; status = 'local'; saveAnonymous(); visibleRecords(); emit(); return Promise.resolve(getSnapshot());
      }
      if (importBlocked) { error = 'local_import_failed'; status = 'error'; emit(); return Promise.resolve(getSnapshot()); }
      const operation = {id, repository, remove: own(records, id), epoch, userId: user.id};
      operations.push(operation); status = 'syncing'; error = null; visibleRecords(); emit();
      return enqueue(async () => {
        if (destroyed || operation.epoch !== epoch || user?.id !== operation.userId) return getSnapshot();
        try {
          await request('/favorites/' + id, {method: operation.remove ? 'DELETE' : 'PUT', userId: operation.userId,
            ...(operation.remove ? {} : {body: {repository}})});
          if (operation.epoch !== epoch || user?.id !== operation.userId) return getSnapshot();
          if (operation.remove) delete confirmed[id]; else confirmed[id] = repository;
          error = null;
        } catch (exception) {
          if (operation.epoch !== epoch || user?.id !== operation.userId) return getSnapshot();
          error = exception.code === 'account_changed' ? 'account_changed' : exception.status === 401 ? 'auth_failed' : 'save_failed';
          status = exception.code === 'network_failed' ? 'offline' : 'error';
          if (error === 'auth_failed' || error === 'account_changed') {
            const reason = error;
            operations.splice(operations.indexOf(operation), 1);
            await refresh(false); error = reason; status = 'error'; visibleRecords(); emit();
          }
        } finally {
          const index = operations.indexOf(operation); if (index >= 0) operations.splice(index, 1);
          if (operation.epoch === epoch) {
            if (!error) status = operations.length ? 'syncing' : 'synced';
            visibleRecords(); emit();
          }
        }
        return getSnapshot();
      });
    }
    async function signIn() {
      await init();
      if (!configured || !api) throw failure('api_unavailable');
      const {url} = cleanAuthURL(); if (!url) throw failure('configuration_invalid');
      url.search = '';
      const destination = api + '/auth/github?return_to=' + encodeURIComponent(url.pathname + url.hash);
      if (typeof location.assign === 'function') location.assign(destination); else location.href = destination;
      return {url: destination};
    }
    function signOut() {
      return enqueue(async () => {
        if (!user) return getSnapshot();
        const context = {epoch, id: user.id};
        try {
          await request('/auth/logout', {method: 'POST', userId: context.id});
          if (epoch !== context.epoch) return getSnapshot();
          epoch += 1; user = null; confirmed = {}; operations.length = 0; importBlocked = false;
          anonymous = localRecords(json(KEYS.anonymous)); status = 'local'; error = null; visibleRecords(); emit();
        } catch (exception) {
          error = exception.code === 'account_changed' ? 'account_changed' : 'auth_failed'; status = 'error'; emit();
          if (exception.status === 401 || exception.code === 'account_changed') await refresh(false);
          if (exception.code === 'account_changed') { error = 'account_changed'; status = 'error'; emit(); }
        }
        return getSnapshot();
      });
    }
    function destroy() {
      destroyed = true; epoch += 1;
      for (const controller of controllers) controller.abort();
      for (const [type, callback] of listeners) target?.removeEventListener(type, callback);
    }
    return {init, getSnapshot, toggle, sync, signIn, signOut, destroy};
  }
  return {createFavoritesStore, sanitizeRepository, validConfiguration, STORAGE_KEYS: KEYS};
});
