/* Website sign-in stays on the website. Only a PKCE-bound one-time code reaches the extension. */
(() => {
  'use strict';
  const EXTENSION_ID = 'medjijlfgmfeldlelkidiickdcnbicaf';
  const OPAQUE = /^[A-Za-z0-9_-]{43}$/;
  const $ = id => document.getElementById('connect-' + id);
  const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
  let language = read('st_lang') === 'en' ? 'en' : 'zh';
  let store, snapshot, initialized = false, busy = false, connected = false, problem = '', attempted = false, websiteBridge = null;
  const params = new URLSearchParams(location.hash.slice(1));
  const valid = ['extension_id', 'client_challenge', 'client_state'].every(key => params.getAll(key).length === 1)
    && params.get('extension_id') === EXTENSION_ID && OPAQUE.test(params.get('client_challenge') || '') && OPAQUE.test(params.get('client_state') || '');
  const request = valid ? Object.fromEntries(['extension_id', 'client_challenge', 'client_state'].map(key => [key, params.get(key)])) : null;
  const text = (zh, en) => language === 'en' ? en : zh;
  const available = () => typeof globalThis.chrome?.runtime?.sendMessage === 'function';
  const errors = {
    invalid_request: ['请从插件“收藏”页点击“同步网页版收藏”重新打开此页。', 'Open this page from “Sync website favorites” in the extension’s Favorites tab.'],
    extension_unavailable: ['未找到新版插件。请加载 v1.7.2，在扩展管理页重新加载，再从插件发起同步。', 'The updated extension is unavailable. Load v1.7.2, reload it in Chrome’s extension settings, and start again from the extension.'],
    connection_failed: ['同步未完成或已过期。请返回插件重新点击“同步网页版收藏”。', 'Sync was not completed or expired. Start again from “Sync website favorites” in the extension.'],
    connection_timeout: ['连接响应超时。可先返回插件查看状态；尚未连接时，请从插件重新发起。', 'The connection response timed out. Check the extension first; if it is not connected, start again there.'],
    authentication_required: ['官网登录已过期，请重新登录后连接。', 'Website sign-in expired. Sign in again before connecting.'],
    account_changed: ['账号已变化，请确认当前官网账号后重试。', 'The account changed. Confirm the current website account and retry.'],
    storage_unavailable: ['浏览器暂时无法保存登录，请允许本站存储后重试。', 'Browser storage is unavailable. Allow storage for this website and try again.'],
    auth_failed: ['GitHub 登录未完成，请重试。', 'GitHub sign-in was not completed. Try again.'],
    unavailable: ['暂时无法连接账号服务，请稍后重试。', 'The account service is temporarily unavailable. Try again later.'],
  };
  function render() {
    document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
    document.documentElement.dataset.theme = read('st_theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.title = text('连接插件收藏 · Agent Leaderboard', 'Connect extension favorites · Agent Leaderboard');
    $('language').textContent = language === 'en' ? '中' : 'EN';
    $('language').setAttribute('aria-label', language === 'en' ? '切换为中文' : 'Switch to English');
    $('label').textContent = text('官网与插件，共用一份收藏', 'One collection for website and extension');
    $('title').textContent = text(connected ? '收藏已同步到插件。' : '登录后，自动同步收藏。', connected ? 'Your favorites are synced.' : 'Sign in. Favorites sync automatically.');
    $('intro').textContent = text('使用官网的 GitHub 账号，把已保存的收藏同步到当前 Chrome 插件。', 'Use your website GitHub account to sync saved favorites with this Chrome extension.');
    const user = snapshot?.user;
    $('account').textContent = user ? user.login : text('官网 GitHub 账号', 'Website GitHub account');
    $('status').textContent = connected ? text('已连接。返回插件“收藏”页即可查看，两端可继续同步。', 'Connected. Return to Favorites in the extension to view and sync your saved repositories.')
      : !valid ? text('请从插件发起连接。', 'Start the connection from the extension.')
      : busy ? text('正在处理，请稍候…', 'Working…') : !initialized ? text('正在读取官网账号…', 'Reading your website account…')
      : user ? text(`官网账号有 ${snapshot.ids.length} 个收藏，正在自动同步。`, `This website account has ${snapshot.ids.length} favorites. Syncing automatically.`)
      : text('在官网完成 GitHub 登录后，将自动同步到插件。', 'Sign in with GitHub here. Favorites will sync to the extension automatically.');
    $('sign-in').textContent = text('在官网登录 GitHub', 'Sign in with GitHub');
    $('retry').textContent = text('重试同步', 'Retry sync');
    $('switch').textContent = text('切换账号', 'Switch account');
    $('sign-in').hidden = !initialized || Boolean(user) || connected || !valid;
    $('retry').hidden = !initialized || !user || connected || !valid || !problem;
    $('switch').hidden = !initialized || !user || connected || !valid;
    for (const id of ['sign-in', 'retry', 'switch']) $(id).disabled = busy;
    $('note').textContent = text('连接后，两端使用同一份云收藏；原有插件本地收藏会合并。退出插件不会退出官网或删除收藏。', 'Both use the same cloud favorites. Existing local extension favorites merge on connection. Signing out of the extension keeps website sign-in and saved favorites.');
    $('open-site').textContent = text('返回官网', 'Return to website');
    $('download').textContent = text('下载 v1.7.2 插件', 'Download extension v1.7.2');
    const key = problem || (!valid ? 'invalid_request' : initialized && !available() && !connected ? 'extension_unavailable' : snapshot?.error ? 'auth_failed' : '');
    $('error').hidden = !key; $('error').textContent = key ? (errors[key] || errors.unavailable)[language === 'en' ? 1 : 0] : '';
  }
  function deliver(code, state) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Object.assign(new Error(), {code: 'connection_timeout'})), 30000);
      try {
        chrome.runtime.sendMessage(EXTENSION_ID, {type: 'favorites:connect', code, state}, response => {
          clearTimeout(timeout);
          if (chrome.runtime.lastError || !response?.ok || response.connected !== true) reject(Object.assign(new Error(), {code: 'connection_failed'}));
          else resolve(response);
        });
      } catch { clearTimeout(timeout); reject(Object.assign(new Error(), {code: 'extension_unavailable'})); }
    });
  }
  async function action(work) {
    if (busy || !store || !valid) return;
    busy = true; problem = ''; render();
    try { await work(); }
    catch (error) { problem = Object.hasOwn(errors, error?.code) ? error.code : 'unavailable'; }
    finally { busy = false; snapshot = store.getSnapshot(); render(); }
  }
  $('language').addEventListener('click', () => { language = language === 'en' ? 'zh' : 'en'; try { localStorage.setItem('st_lang', language); } catch { /* Optional preference. */ } render(); });
  $('sign-in').addEventListener('click', () => void action(() => store.signIn()));
  $('switch').addEventListener('click', () => void action(() => store.signOut()));
  async function syncExtension() {
    if (!available()) throw Object.assign(new Error(), {code: 'extension_unavailable'});
    const handoff = await store.connectExtension(request);
    if (typeof handoff?.code !== 'string' || !OPAQUE.test(handoff.code) || handoff.state !== request.client_state) throw Object.assign(new Error(), {code: 'connection_failed'});
    await deliver(handoff.code, handoff.state); connected = true;
    websiteBridge = WebsiteFavoritesBridge.start({store, eventTarget: window, location, chrome: globalThis.chrome});
  }
  function autoSync() {
    if (!initialized || !snapshot?.user || !store?.hasActiveSession() || connected || busy || attempted || !valid) return;
    attempted = true; void action(syncExtension);
  }
  $('retry').addEventListener('click', () => void action(syncExtension));
  render();
  (async () => {
    if (!valid) return;
    try {
      store = FavoritesSync.createFavoritesStore({storage: localStorage, sessionStorage,
        config: window.FAVORITES_CONFIG, fetch: fetch.bind(window), location, history, eventTarget: window,
        onChange(value) { snapshot = value; websiteBridge?.update(value); render(); autoSync(); }});
      snapshot = await store.init(); initialized = true;
    } catch { initialized = true; problem = 'storage_unavailable'; }
    render(); autoSync();
  })();
})();
