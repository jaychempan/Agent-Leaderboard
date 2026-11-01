import {compactCatalog, prepareCatalog} from './core.mjs';
import {createFavoritesSync} from './favorites-sync.mjs';

let catalogTask;
async function catalog() {
  if (!catalogTask) catalogTask = (async () => {
    const [local, response] = await Promise.all([
      chrome.storage.local.get('catalogCache'), fetch(chrome.runtime.getURL('data/catalog.json')),
    ]);
    if (!response.ok) throw new Error('catalog_unavailable');
    const bundled = compactCatalog(await response.json());
    let cached;
    try { if (local.catalogCache?.schema === 3) cached = compactCatalog(local.catalogCache); } catch { /* use bundled data */ }
    return prepareCatalog(cached && Date.parse(cached.meta.updated_at) >= Date.parse(bundled.meta.updated_at) ? cached : bundled);
  })().catch(error => { catalogTask = null; throw error; });
  return catalogTask;
}

const methods = new Set(['snapshot', 'init', 'signIn', 'signOut', 'sync', 'toggle']);

export function registerFavoritesMessages(chrome, favorites) {
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
  const favorites = createFavoritesSync({
    chrome, fetch: (...args) => fetch(...args), catalog,
    onChange(snapshot) {
      chrome.runtime.sendMessage({type: 'favorites:changed', snapshot}).catch(() => {});
    },
  });
  registerFavoritesMessages(chrome, favorites);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.catalogCache) catalogTask = null;
});
}
