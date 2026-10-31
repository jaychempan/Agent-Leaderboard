/* GitHub account favorites, backed by the official Supabase SDK. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FavoritesSync = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const KEYS = Object.freeze({meta: 'st_favorites_sync_v1', anonymous: 'st_favorites_anonymous_v1',
    legacy: 'st_favorites', backup: 'st_favorites_backup_v1', account: 'st_favorites_account_v1:', auth: 'st_supabase_auth_v1'});
  const SOURCES = new Set(['skills', 'mcp', 'research', 'prompts', 'frameworks']);
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const text = (value, limit) => typeof value === 'string' ? value.slice(0, limit) : '';
  const idOf = value => {
    const id = typeof value === 'string' && /^[1-9]\d{0,15}$/.test(value) ? Number(value) : value;
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  };
  const strings = (value, limit = 32) => Array.isArray(value)
    ? [...new Set(value.filter(item => typeof item === 'string').map(item => item.slice(0, 100)))].slice(0, limit) : [];
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
      } catch (_) { /* Untrusted URLs do not become clickable links. */ }
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

  function validConfiguration(config) {
    if (!config || typeof config.url !== 'string' || typeof config.publishableKey !== 'string') return false;
    try {
      const url = new URL(config.url);
      if (url.username || url.password || url.search || url.hash
          || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) return false;
      const key = config.publishableKey;
      if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
      if (/^sb_secret_/.test(key)) return false;
      const parts = key.split('.');
      if (parts.length !== 3) return false;
      const encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const decoded = typeof atob === 'function' ? atob(encoded) : Buffer.from(encoded, 'base64').toString('utf8');
      return JSON.parse(decoded).role === 'anon';
    } catch (_) { return false; }
  }

  function createFavoritesStore(options = {}) {
    const storage = options.storage;
    const eventTarget = options.eventTarget || (typeof window !== 'undefined' ? window : null);
    const location = options.location || (typeof window !== 'undefined' ? window.location : null);
    const catalog = typeof options.catalog === 'function' ? options.catalog : () => [];
    const onChange = typeof options.onChange === 'function' ? options.onChange : () => {};
    let storageFailed = false, error = null, status = 'local', user = null, client = null;
    let epoch = 0, activeTask = null, timer = null, initialized = null, subscription = null, destroyed = false, clock = 0;
    const configured = validConfiguration(options.config) && typeof options.createClient === 'function';
    if (options.config?.url && !configured) error = 'configuration_invalid';
    const device = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const listeners = [];
    const memoryCaches = new Map();
    let catalogReference = null, catalogIndex = new Map();

    function read(key) {
      try { return storage?.getItem(key) ?? null; }
      catch (_) { storageFailed = true; return null; }
    }
    function write(key, value) {
      try {
        if (!storage || typeof storage.setItem !== 'function') throw new Error('storage');
        storage.setItem(key, value); storageFailed = false; return true;
      } catch (_) { storageFailed = true; error = 'storage_unavailable'; return false; }
    }
    function json(key) { try { return JSON.parse(read(key)); } catch (_) { return null; } }
    const emptyCache = () => ({entries: {}, pending: {}, acks: [], acknowledged: {}});
    function readCache(key) {
      const data = json(key);
      if (!data || typeof data !== 'object' || !data.entries || typeof data.entries !== 'object') return null;
      const result = emptyCache();
      result.acks = strings(data.acks, 1000);
      for (const [key, acknowledgement] of Object.entries(data.acknowledged || {})) {
        const id = idOf(key);
        if (id && typeof acknowledgement?.revision === 'string' && acknowledgement.revision.length <= 100
            && Number.isSafeInteger(acknowledgement.changedAt)) {
          result.acknowledged[id] = {revision: acknowledgement.revision, changedAt: acknowledgement.changedAt};
        }
      }
      for (const [key, entry] of Object.entries(data.entries)) {
        const id = idOf(key), repository = sanitizeRepository(entry?.repository, id);
        if (id && repository && typeof entry.deleted === 'boolean') result.entries[id] = {repository, deleted: entry.deleted};
      }
      for (const [key, operation] of Object.entries(data.pending || {})) {
        const id = idOf(key), repository = sanitizeRepository(operation?.repository, id);
        if (id && repository && typeof operation.deleted === 'boolean' && typeof operation.revision === 'string'
            && operation.revision.length <= 100 && Number.isSafeInteger(operation.changedAt)) {
          result.pending[id] = {repository, deleted: operation.deleted, revision: operation.revision, changedAt: operation.changedAt};
        }
      }
      return result;
    }
    function readMeta() {
      const value = json(KEYS.meta);
      return {migratedLegacy: value?.migratedLegacy === true,
        claimedBy: typeof value?.claimedBy === 'string' ? value.claimedBy : null};
    }
    let meta = readMeta(), anonymousRecovery = null;
    let cache = readCache(KEYS.anonymous) || emptyCache();

    function repositoryFor(input, source, existing) {
      const id = idOf(typeof input === 'object' && input ? input.id : input);
      if (!id) return null;
      let candidates = [];
      try {
        const list = catalog();
        if (Array.isArray(list) && list !== catalogReference) {
          catalogReference = list; catalogIndex = new Map();
          for (const repo of list) {
            const key = idOf(repo?.id);
            if (key) { if (!catalogIndex.has(key)) catalogIndex.set(key, []); catalogIndex.get(key).push(repo); }
          }
        }
        candidates = catalogIndex.get(id) || [];
      } catch (_) { /* A loading catalog is optional. */ }
      const given = typeof input === 'object' && input ? input : null;
      const record = sanitizeRepository({...existing, ...candidates[0], ...given, id}, id);
      record.sources = [...new Set([...strings(existing?.sources), ...candidates.flatMap(repo => strings(repo.sources)),
        ...strings(given?.sources), source].filter(item => SOURCES.has(item)))];
      return record;
    }
    if (!meta.migratedLegacy) {
      const legacyRaw = read(KEYS.legacy);
      if (legacyRaw !== null && read(KEYS.backup) === null) write(KEYS.backup, legacyRaw);
      let legacy = [];
      try { const parsed = JSON.parse(legacyRaw); if (Array.isArray(parsed)) legacy = parsed; } catch (_) { /* Preserve the backup and start safely. */ }
      for (const value of legacy) {
        const repository = repositoryFor(value);
        if (repository) cache.entries[repository.id] = {repository, deleted: false};
      }
      if (write(KEYS.anonymous, JSON.stringify(cache))) {
        meta.migratedLegacy = true;
        write(KEYS.meta, JSON.stringify(meta));
      } else { anonymousRecovery = cache; memoryCaches.set(KEYS.anonymous, cache); }
    }
    function cacheKey() { return user ? KEYS.account + user.id : KEYS.anonymous; }
    function newer(a, b) { return !a || b.changedAt > a.changedAt || (b.changedAt === a.changedAt && b.revision > a.revision); }
    function acknowledgementsFor(...caches) {
      const byId = {}, legacy = new Set();
      for (const item of caches) {
        for (const revision of item.acks) legacy.add(revision);
        for (const [id, acknowledgement] of Object.entries(item.acknowledged)) {
          if (newer(byId[id], acknowledgement)) byId[id] = acknowledgement;
        }
      }
      return {byId, legacy};
    }
    function acknowledge(target, id, operation) {
      if (newer(target.acknowledged[id], operation)) target.acknowledged[id] = {revision: operation.revision, changedAt: operation.changedAt};
    }
    function mergePending(target, input, acknowledgements) {
      for (const [id, operation] of Object.entries(input)) {
        const known = acknowledgements.byId[id];
        if (acknowledgements.legacy.has(operation.revision) || (known && !newer(known, operation))) continue;
        if (newer(target[id], operation)) target[id] = operation;
      }
    }
    function loadCache(key) {
      const disk = readCache(key) || emptyCache(), memory = memoryCaches.get(key);
      if (!memory) return disk;
      const acknowledgements = acknowledgementsFor(disk, memory), pending = {};
      mergePending(pending, disk.pending, acknowledgements);
      mergePending(pending, memory.pending, acknowledgements);
      const entries = {...disk.entries, ...memory.entries};
      for (const [id, acknowledgement] of Object.entries(disk.acknowledged)) {
        if (newer(memory.acknowledged[id], acknowledgement) && disk.entries[id]) entries[id] = disk.entries[id];
      }
      for (const [id, operation] of Object.entries(pending)) entries[id] = {repository: operation.repository, deleted: operation.deleted};
      return {entries, pending, acks: [...acknowledgements.legacy].slice(-1000), acknowledged: acknowledgements.byId};
    }
    function mergeDisk(useDiskEntries) {
      const disk = readCache(cacheKey());
      if (!disk) return;
      const acknowledgements = acknowledgementsFor(disk, cache);
      const pending = {};
      mergePending(pending, disk.pending, acknowledgements);
      mergePending(pending, cache.pending, acknowledgements);
      if (useDiskEntries) cache.entries = disk.entries;
      else for (const [id, acknowledgement] of Object.entries(disk.acknowledged)) {
        if (newer(cache.acknowledged[id], acknowledgement) && disk.entries[id]) cache.entries[id] = disk.entries[id];
      }
      cache.pending = pending;
      cache.acks = [...acknowledgements.legacy].slice(-1000);
      cache.acknowledged = acknowledgements.byId;
      for (const [id, operation] of Object.entries(pending)) cache.entries[id] = {repository: operation.repository, deleted: operation.deleted};
    }
    function persist() {
      mergeDisk(false);
      const key = cacheKey(), saved = write(key, JSON.stringify(cache));
      if (saved) memoryCaches.delete(key); else memoryCaches.set(key, cache);
      return saved;
    }
    function getSnapshot() {
      const records = {};
      for (const [id, entry] of Object.entries(cache.entries)) {
        if (!entry.deleted) records[id] = repositoryFor(entry.repository, null, entry.repository);
      }
      return {ids: Object.keys(records).map(Number).sort((a, b) => a - b), records,
        user: user ? {...user} : null, configured, status, error: error || (storageFailed ? 'storage_unavailable' : null),
        pendingCount: user ? Object.keys(cache.pending).length : 0};
    }
    function emit() { if (!destroyed) { try { onChange(getSnapshot()); } catch (_) { /* UI errors must not discard queued data. */ } } }
    function operationFor(repository, deleted) {
      clock = Math.max(Date.now(), clock + 1);
      return {repository, deleted, changedAt: clock, revision: `${clock}:${device}`};
    }
    function scheduleSync() {
      if (timer !== null || !user || !client || destroyed) return;
      timer = setTimeout(() => { timer = null; void sync(); }, 0);
    }
    function safeUser(value) {
      if (!value || typeof value.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value.id)) return null;
      const metadata = value.user_metadata || {};
      let avatar = '';
      try { const url = new URL(metadata.avatar_url); if (url.protocol === 'https:') avatar = url.href.slice(0, 1000); } catch (_) { /* optional */ }
      return {id: value.id, login: text(metadata.user_name || metadata.preferred_username || value.email?.split('@')[0], 100), avatar_url: avatar};
    }
    function applySession(session) {
      if (destroyed) return;
      const next = safeUser(session?.user);
      if (next?.id === user?.id) { user = next; if (!user) status = 'local'; emit(); if (user) scheduleSync(); return; }
      if (Object.keys(cache.pending).length || storageFailed) memoryCaches.set(cacheKey(), cache);
      epoch += 1;
      user = next; activeTask = null;
      cache = loadCache(cacheKey());
      status = user ? 'initializing' : 'local'; error = null;
      if (user) {
        meta = readMeta();
        if (!meta.claimedBy || meta.claimedBy === user.id) {
          meta.claimedBy = user.id;
          write(KEYS.meta, JSON.stringify(meta));
          const anonymous = loadCache(KEYS.anonymous);
          if (anonymousRecovery) {
            anonymous.entries = {...anonymous.entries, ...anonymousRecovery.entries};
            const acknowledgements = acknowledgementsFor(anonymous, anonymousRecovery);
            mergePending(anonymous.pending, anonymousRecovery.pending, acknowledgements);
            anonymous.acks = [...acknowledgements.legacy].slice(-1000);
            anonymous.acknowledged = acknowledgements.byId;
            for (const [id, operation] of Object.entries(anonymous.pending)) anonymous.entries[id] = {repository: operation.repository, deleted: operation.deleted};
          }
          for (const [id, entry] of Object.entries(anonymous.entries)) {
            if (entry.deleted || (own(cache.entries, id) && (!cache.entries[id].deleted || !anonymous.pending[id]))) continue;
            const operation = operationFor(repositoryFor(entry.repository), false);
            cache.entries[id] = {repository: operation.repository, deleted: false}; cache.pending[id] = operation;
          }
          if (persist()) {
            meta.migratedLegacy = true;
            write(KEYS.meta, JSON.stringify(meta));
            anonymousRecovery = null;
            memoryCaches.delete(KEYS.anonymous);
            const cleared = {...emptyCache(), acks: anonymous.acks, acknowledged: {...anonymous.acknowledged}};
            for (const [id, operation] of Object.entries(anonymous.pending)) acknowledge(cleared, id, operation);
            write(KEYS.anonymous, JSON.stringify(cleared));
          }
        }
      }
      emit(); scheduleSync();
    }
    function withoutAuthFragment(url) {
      const fragment = new URLSearchParams(url.hash.slice(1));
      if (['error', 'error_description', 'error_code', 'access_token', 'refresh_token', 'provider_token',
        'provider_refresh_token', 'token_type', 'expires_in', 'expires_at'].some(key => fragment.has(key))) url.hash = '';
      return url;
    }
    function cleanAuthURL() {
      if (!location?.href) return;
      try {
        const url = withoutAuthFragment(new URL(location.href));
        for (const key of ['code', 'error', 'error_description', 'error_code']) url.searchParams.delete(key);
        const history = options.history || (typeof window !== 'undefined' ? window.history : null);
        if (url.href !== location.href) history?.replaceState(null, '', url.href);
      } catch (_) { /* URL cleanup cannot prevent favorites from loading. */ }
    }
    function listen(type, callback) { if (eventTarget?.addEventListener) { eventTarget.addEventListener(type, callback); listeners.push([type, callback]); } }
    async function init() {
      if (initialized) return initialized;
      initialized = (async () => {
        listen('storage', event => {
          if (event.key !== cacheKey() && event.key !== KEYS.meta && event.key !== null) return;
          mergeDisk(true); emit(); scheduleSync();
        });
        listen('online', () => { void sync(); });
        listen('focus', () => { void sync(); });
        if (!configured) { emit(); return getSnapshot(); }
        status = 'initializing'; emit();
        try {
          client = options.createClient(options.config.url, options.config.publishableKey, {auth: {
            flowType: 'pkce', storageKey: KEYS.auth, storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true}});
          let authEvents = 0;
          const response = client.auth.onAuthStateChange((_event, session) => { authEvents += 1; applySession(session); });
          subscription = response?.data?.subscription;
          const before = authEvents;
          const result = await client.auth.getSession();
          if (result.error) throw result.error;
          if (before === authEvents) applySession(result.data?.session || null);
          if (user) await sync(); else { status = 'local'; emit(); }
        } catch (_) { status = 'error'; error = 'auth_failed'; emit(); }
        finally { cleanAuthURL(); }
        return getSnapshot();
      })();
      return initialized;
    }
    function toggle(input, source) {
      mergeDisk(true);
      const id = idOf(typeof input === 'object' && input ? input.id : input);
      const repository = repositoryFor(input, source, id && cache.entries[id]?.repository);
      if (!repository) return getSnapshot();
      const deleted = Boolean(cache.entries[id] && !cache.entries[id].deleted);
      cache.entries[id] = {repository, deleted};
      cache.pending[id] = operationFor(repository, deleted);
      status = user ? 'syncing' : 'local'; error = null;
      persist(); emit(); scheduleSync(); return getSnapshot();
    }
    function current(task) { return !destroyed && epoch === task.epoch && user?.id === task.userId; }
    async function sync() {
      if (!user || !client || destroyed) return getSnapshot();
      if (activeTask && current(activeTask)) { activeTask.again = true; return activeTask.promise; }
      const task = {epoch, userId: user.id, again: false, promise: null};
      activeTask = task;
      task.promise = (async () => {
        try {
          do {
            task.again = false;
            mergeDisk(true); status = 'syncing'; error = null; emit();
            const operations = Object.entries(cache.pending);
            for (let offset = 0; offset < operations.length; offset += 100) {
              const batch = operations.slice(offset, offset + 100);
              const result = await client.from('favorites').upsert(batch.map(([id, operation]) => ({
                user_id: task.userId, repo_id: Number(id), repository: operation.deleted ? {} : operation.repository, deleted: operation.deleted
              })), {onConflict: 'user_id,repo_id'});
              if (!current(task)) return getSnapshot();
              if (result.error) throw result.error;
              mergeDisk(true);
              for (const [id, operation] of batch) {
                acknowledge(cache, id, operation);
                if (cache.pending[id]?.revision === operation.revision) delete cache.pending[id];
              }
              persist();
            }
            const remote = {};
            for (let offset = 0; ; offset += 500) {
              const result = await client.from('favorites').select('repo_id,repository,deleted,updated_at')
                .eq('user_id', task.userId).order('repo_id', {ascending: true}).range(offset, offset + 499);
              if (!current(task)) return getSnapshot();
              if (result.error) throw result.error;
              if (!Array.isArray(result.data)) throw new Error('Invalid favorites response');
              for (const row of result.data) {
                const id = idOf(row?.repo_id), repository = sanitizeRepository(row?.repository, id);
                if (id && repository && typeof row.deleted === 'boolean') remote[id] = {repository, deleted: row.deleted};
              }
              if (result.data.length < 500) break;
              if (offset >= 100000) throw new Error('Favorites response too large');
            }
            mergeDisk(true);
            cache.entries = remote;
            for (const [id, operation] of Object.entries(cache.pending)) cache.entries[id] = {repository: operation.repository, deleted: operation.deleted};
            persist();
            if (Object.keys(cache.pending).length) task.again = true;
          } while (task.again && current(task));
          if (current(task)) {
            if (!meta.migratedLegacy && meta.claimedBy === task.userId && !Object.keys(cache.pending).length) {
              meta.migratedLegacy = true; write(KEYS.meta, JSON.stringify(meta)); anonymousRecovery = null;
            }
            status = 'synced'; error = null; emit();
          }
        } catch (failure) {
          if (current(task)) {
            status = /offline|network|fetch|connection/i.test(String(failure?.message || failure)) ? 'offline' : 'error';
            error = 'sync_failed'; persist(); emit();
          }
        } finally { if (activeTask === task) activeTask = null; }
        return getSnapshot();
      })();
      return task.promise;
    }
    async function signIn() {
      await init();
      if (!client) throw new Error('configuration_invalid');
      let redirectTo;
      try {
        const url = withoutAuthFragment(new URL(location.href));
        if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('Invalid origin');
        url.search = ''; redirectTo = url.href;
      }
      catch (_) { throw new Error('configuration_invalid'); }
      const response = await client.auth.signInWithOAuth({provider: 'github', options: {redirectTo}});
      if (response.error) { status = 'error'; error = 'auth_failed'; emit(); throw new Error('auth_failed'); }
      return response.data;
    }
    async function signOut() {
      if (!client) { applySession(null); return getSnapshot(); }
      const response = await client.auth.signOut({scope: 'local'});
      if (response.error) { status = 'error'; error = 'auth_failed'; emit(); throw new Error('auth_failed'); }
      applySession(null); return getSnapshot();
    }
    function destroy() {
      destroyed = true; epoch += 1;
      if (timer !== null) clearTimeout(timer);
      subscription?.unsubscribe();
      for (const [type, callback] of listeners) eventTarget?.removeEventListener(type, callback);
    }
    return {init, getSnapshot, toggle, sync, signIn, signOut, destroy};
  }

  return {createFavoritesStore, sanitizeRepository, validConfiguration, STORAGE_KEYS: KEYS};
});
