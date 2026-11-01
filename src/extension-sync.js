/* Explicit extension sign-in uses the website's existing Favorites account. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WebsiteExtensionSync = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const EXTENSION_ID = 'medjijlfgmfeldlelkidiickdcnbicaf';
  const OPAQUE = /^[A-Za-z0-9_-]{43}$/;
  const FIELDS = ['extension_id', 'client_challenge', 'client_state'];
  function pageURL(location) {
    try { return new URL(typeof location === 'string' ? location : location?.href); } catch { return null; }
  }
  function readRequest(location) {
    const url = pageURL(location);
    const active = Boolean(url && url.origin === 'https://agentskills.media' && !url.username && !url.password && !url.port
      && ['/', '/index.html'].includes(url.pathname) && url.searchParams.getAll('extension_sync').length === 1
      && url.searchParams.get('extension_sync') === '1');
    if (!active) return {active: false, request: null};
    const fragment = new URLSearchParams(url.hash.slice(1));
    const valid = FIELDS.every(key => fragment.getAll(key).length === 1) && fragment.get('extension_id') === EXTENSION_ID
      && OPAQUE.test(fragment.get('client_challenge') || '') && OPAQUE.test(fragment.get('client_state') || '');
    return {active: true, request: valid ? Object.fromEntries(FIELDS.map(key => [key, fragment.get(key)])) : null};
  }
  function legacyDestination(location) {
    const input = pageURL(location);
    if (!input || input.origin !== 'https://agentskills.media' || input.pathname !== '/extension/connect/'
        || input.username || input.password || input.port) return null;
    const url = new URL('/?extension_sync=1', input.origin);
    for (const key of ['login_code', 'login_state', 'auth_error', 'error', 'error_code']) {
      for (const value of input.searchParams.getAll(key)) url.searchParams.append(key, value);
    }
    const fragment = new URLSearchParams(input.hash.slice(1));
    if (['access_token', 'refresh_token', 'provider_token', 'provider_refresh_token', 'token_type', 'error_description'].some(key => fragment.has(key))) {
      url.hash = FIELDS.flatMap(key => fragment.getAll(key).map(value => [key, value])).length
        ? new URLSearchParams(FIELDS.flatMap(key => fragment.getAll(key).map(value => [key, value]))).toString() : '';
    } else url.hash = input.hash;
    return url.href;
  }
  function start(options = {}) {
    const store = options.store, browser = options.chrome || globalThis.chrome;
    const location = options.location || globalThis.location, history = options.history || globalThis.history;
    const later = options.setTimeout || setTimeout, cancel = options.clearTimeout || clearTimeout;
    const route = readRequest(location);
    let initialized = false, attempted = false, busy = false, connected = false, destroyed = false;
    let connectedUser = null, status = route.request ? 'sign_in' : 'invalid_request', cancelDelivery = null;
    function userId() {
      try { return store?.hasActiveSession() ? String(store.getSnapshot()?.user?.id || '') : ''; } catch { return ''; }
    }
    function getSnapshot() { return {active: route.active, status, busy}; }
    function publish() { try { options.onChange?.(getSnapshot()); } catch { /* Rendering cannot change the handoff. */ } }
    function cleanURL() {
      try {
        const url = pageURL(location);
        if (!url || !readRequest(url.href).active) return;
        // Keep the explicit marker until the native callback has verified sender.url.
        url.searchParams.delete('extension_sync');
        if (!['skills', 'mcp', 'research', 'prompts', 'frameworks'].includes(url.hash.slice(1))) url.hash = '';
        history?.replaceState(null, '', url.href);
      } catch { /* URL cleanup is optional. */ }
    }
    function connectedNow() {
      if (destroyed || !route.active || !userId()) return;
      connected = true; connectedUser = userId(); status = 'connected'; busy = false;
      cancelDelivery?.(); cleanURL(); publish();
    }
    function deliver(code, state) {
      return new Promise((resolve, reject) => {
        let complete = false;
        const finish = (error) => {
          if (complete) return; complete = true; cancel(timeout); cancelDelivery = null;
          if (error) reject(error); else resolve();
        };
        const timeout = later(() => finish(new Error('connection_failed')), 30000);
        cancelDelivery = () => finish(new Error('connection_failed'));
        try {
          browser.runtime.sendMessage(EXTENSION_ID, {type: 'favorites:connect', code, state}, response => {
            if (browser.runtime.lastError || response?.ok !== true || response.connected !== true) finish(new Error('connection_failed'));
            else finish();
          });
        } catch { finish(new Error('extension_unavailable')); }
      });
    }
    async function sync() {
      if (destroyed || !initialized || !route.active || !route.request || busy || attempted || connected) return;
      const id = userId(); if (!id) { status = 'sign_in'; publish(); return; }
      attempted = true; busy = true; status = 'connecting'; publish();
      try {
        if (typeof browser?.runtime?.sendMessage !== 'function') throw new Error('extension_unavailable');
        const result = await store.connectExtension(route.request);
        if (destroyed || connected) return;
        if (userId() !== id) throw new Error('account_changed');
        if (typeof result?.code !== 'string' || !OPAQUE.test(result.code) || result.state !== route.request.client_state) throw new Error('connection_failed');
        await deliver(result.code, result.state);
        if (destroyed || connected) return;
        if (userId() !== id) throw new Error('account_changed');
        connectedNow();
      } catch (error) {
        if (!destroyed && !connected) {
          status = userId() !== id ? 'account_changed' : error?.message === 'extension_unavailable' ? 'extension_unavailable' : 'connection_failed';
        }
      } finally { busy = false; if (!destroyed) publish(); }
    }
    function update() {
      if (destroyed || !route.active) return;
      if (connected && userId() !== connectedUser) { connected = false; connectedUser = null; status = 'sign_in'; }
      if (!userId() && route.request && !busy) status = 'sign_in';
      if (initialized) { publish(); void sync(); }
    }
    function ready() { if (destroyed) return; initialized = true; update(); }
    function retry() { if (destroyed || connected) return; attempted = false; update(); }
    function prepareSignIn() {
      if (destroyed || !route.active || !route.request || connected) return;
      const url = pageURL(location); if (!url || !readRequest(url.href).active) return;
      url.hash = new URLSearchParams(route.request).toString();
      history?.replaceState(null, '', url.href);
    }
    function destroy() { destroyed = true; cancelDelivery?.(); }
    return {getSnapshot, ready, update, retry, prepareSignIn, connected: connectedNow, destroy};
  }
  return {start, readRequest, legacyDestination, EXTENSION_ID};
});
