import {compactCatalog, prepareCatalog} from './core.mjs';
import {createFavoritesSync, isWebsiteConnectSender, isWebsiteSender} from './favorites-sync.mjs';

let catalogTask;
async function catalog() {
  if (!catalogTask) catalogTask = (async () => {
    const [local, response] = await Promise.all([
      chrome.storage.local.get('catalogCache'), fetch(chrome.runtime.getURL('data/catalog.json')),
    ]);
    if (!response.ok) throw new Error('catalog_unavailable');
    const bundled = compactCatalog(await response.json());
    let cached;
    try { if (local.catalogCache?.schema === 4) cached = compactCatalog(local.catalogCache); } catch { /* use bundled data */ }
    return prepareCatalog(cached && Date.parse(cached.meta.updated_at) >= Date.parse(bundled.meta.updated_at) ? cached : bundled);
  })().catch(error => { catalogTask = null; throw error; });
  return catalogTask;
}

export function createWebsiteRegistry({onReady = () => {}, timeoutMs = 10000} = {}) {
  const entries = new Map(); let sequence = 0;
  const publicUser = value => value && typeof value.id === 'string' && /^[1-9]\d{0,15}$/.test(value.id)
    && typeof value.login === 'string' && /^[A-Za-z0-9-]{1,39}$/.test(value.login) ? {id: value.id, login: value.login} : null;
  function rejectPending(entry, code) { for (const request of entry.requests.values()) { clearTimeout(request.timer); request.reject(Object.assign(Error(code), {code})); } entry.requests.clear(); }
  return {
    register(port) {
      if (port?.name !== 'favorites:website' || !isWebsiteSender(port.sender)) { try { port.disconnect(); } catch {} return false; }
      const key = `website-port-${++sequence}`, entry = {key, sender: port.sender, port, user: null, ready: false, requests: new Map()}; entries.set(key, entry);
      port.onDisconnect.addListener(() => { entries.delete(key); rejectPending(entry, 'website_connection_lost'); });
      port.onMessage.addListener(message => {
        if (message?.type === 'favorites:ready') {
          const user = message.user === null ? null : publicUser(message.user); if (message.user !== null && !user) return;
          const changed = !entry.ready || JSON.stringify(user) !== JSON.stringify(entry.user); entry.ready = true; entry.user = user;
          for (const request of [...entry.requests.values()]) if (!user || user.id !== request.expected) rejectPending(entry, 'website_account_changed');
          if (changed) onReady(); return;
        }
        const request = entry.requests.get(message?.state); if (!request) return;
        if (message.type === 'favorites:unavailable') {
          if (message.reason === 'not_signed_in') { entry.user = null; entry.ready = true; onReady(); }
          entry.requests.delete(message.state); clearTimeout(request.timer);
          request.reject(Object.assign(Error('website_not_signed_in'), {code: message.reason === 'not_signed_in' ? 'website_not_signed_in' : 'website_connection_lost'})); return;
        }
        if (message.type !== 'favorites:connect' || typeof message.code !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(message.code)) return;
        entry.requests.delete(message.state); clearTimeout(request.timer);
        request.resolve({message: {type: 'favorites:connect', code: message.code, state: message.state}, sender: entry.sender, portId: key});
      });
      return true;
    },
    list() { return [...entries.values()].map(entry => ({portId: entry.key, tabId: entry.sender.tab.id, documentId: entry.sender.documentId || '', ready: entry.ready, user: entry.user ? {...entry.user} : null})); },
    request(candidate, challenge) {
      const entry = entries.get(candidate.portId);
      if (!entry || entry.user?.id !== challenge.expected_user_id) return Promise.reject(Object.assign(Error('website_connection_lost'), {code: 'website_connection_lost'}));
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { entry.requests.delete(challenge.client_state); reject(Object.assign(Error('website_connection_timeout'), {code: 'website_connection_timeout'})); }, timeoutMs);
        entry.requests.set(challenge.client_state, {resolve, reject, timer, expected: challenge.expected_user_id});
        try { entry.port.postMessage({type: 'favorites:challenge', ...challenge}); }
        catch { clearTimeout(timer); entry.requests.delete(challenge.client_state); reject(Object.assign(Error('website_connection_lost'), {code: 'website_connection_lost'})); }
      });
    },
    acknowledge(candidate, state, connected) { try { entries.get(candidate.portId)?.port.postMessage({type: 'favorites:connected', state, connected}); } catch {} },
  };
}

const methods = new Set(['snapshot', 'init', 'signIn', 'signOut', 'sync', 'toggle']);

export function registerFavoritesMessages(chrome, favorites, website) {
if (website) chrome.runtime.onConnectExternal.addListener(port => website.register(port));
chrome.runtime.onMessageExternal.addListener((message, sender, respond) => {
  if (!isWebsiteConnectSender(sender) || message?.type !== 'favorites:connect'
      || typeof message.code !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(message.code)
      || typeof message.state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(message.state)) return false;
  (async () => {
    try {
      const result = await favorites.completeWebsiteSignIn(message, sender);
      if (!result?.connected) { respond({ok: false, connected: false}); return; }
      const user = result.user;
      respond({ok: true, connected: true, ...(user && typeof user.id === 'string' && typeof user.login === 'string'
        ? {user: {id: user.id, login: user.login, avatar_url: typeof user.avatar_url === 'string' ? user.avatar_url : ''}} : {})});
    } catch { respond({ok: false, connected: false}); }
  })();
  return true;
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!message || typeof message.type !== 'string' || !message.type.startsWith('favorites:')) return false;
  const method = message.type.slice('favorites:'.length);
  if (!methods.has(method) || sender.id !== chrome.runtime.id) return false;
  try {
    const url = new URL(sender.url);
    if (url.protocol !== 'chrome-extension:' || url.hostname !== chrome.runtime.id || url.pathname !== '/panel.html'
        || url.username || url.password || url.port) return false;
  } catch { return false; }
  (async () => {
    try {
      if (method === 'snapshot') await favorites.init();
      else if (method === 'toggle') await favorites.toggle(message.repository);
      else await favorites[method]();
      respond({ok: true, snapshot: await favorites.getSnapshot()});
    } catch {
      // Only the controller's fixed public state crosses extension contexts.
      respond({ok: false, snapshot: await favorites.getSnapshot()});
    }
  })().catch(() => respond({ok: false, error: 'favorites_unavailable'}));
  return true;
});
}

if (globalThis.chrome?.runtime?.onMessage) {
  const website = createWebsiteRegistry({onReady() { chrome.runtime.sendMessage({type: 'favorites:website-ready'}).catch(() => {}); }});
  const favorites = createFavoritesSync({
    website,
    chrome, fetch: (...args) => fetch(...args), catalog,
    onChange(snapshot) {
      chrome.runtime.sendMessage({type: 'favorites:changed', snapshot}).catch(() => {});
    },
  });
  registerFavoritesMessages(chrome, favorites, website);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.catalogCache) catalogTask = null;
});
}
