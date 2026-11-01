/* The website owns its sign-in. This channel shares only public identity and one-time proofs. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WebsiteFavoritesBridge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const EXTENSION_ID = 'medjijlfgmfeldlelkidiickdcnbicaf';
  const PORT_NAME = 'favorites:website';
  const OPAQUE = /^[A-Za-z0-9_-]{43}$/;
  function start(options = {}) {
    const store = options.store, browser = options.chrome || globalThis.chrome;
    const target = options.eventTarget || (typeof window !== 'undefined' ? window : null);
    const documentTarget = options.document || (typeof document !== 'undefined' ? document : null);
    const page = options.location || (typeof location !== 'undefined' ? location : null);
    const later = options.setTimeout || setTimeout, cancel = options.clearTimeout || clearTimeout;
    const repeat = options.setInterval || setInterval, stop = options.clearInterval || clearInterval;
    let port = null, heartbeat = null, retry = null, attempts = 0, destroyed = false, paused = false, lastHandoff = null;
    const listeners = [], inFlight = new Set();
    let allowed = false;
    try {
      const url = new URL(typeof page === 'string' ? page : page?.href);
      allowed = url.origin === 'https://agentskills.media' && ['/', '/index.html', '/extension/connect/'].includes(url.pathname)
        && !url.username && !url.password && !url.port;
    } catch { /* Other origins never register. */ }
    function user() {
      try {
        if (!store?.hasActiveSession()) return null;
        const value = store.getSnapshot().user;
        if (!value || !/^[1-9]\d{0,15}$/.test(String(value.id)) || !Number.isSafeInteger(Number(value.id))
            || typeof value.login !== 'string' || !/^[A-Za-z0-9-]{1,39}$/.test(value.login)) return null;
        return {id: String(value.id), login: value.login};
      } catch { return null; }
    }
    function clearHeartbeat() { if (heartbeat !== null) stop(heartbeat); heartbeat = null; }
    function schedule() {
      if (destroyed || paused || retry !== null || !user()) return;
      const delay = [250, 1000, 3000, 10000, 30000][Math.min(attempts++, 4)];
      retry = later(() => { retry = null; connect(); }, delay);
    }
    function send(channel, value) {
      if (destroyed || paused || port !== channel) return false;
      try { channel.postMessage(value); return true; }
      catch { disconnected(channel); return false; }
    }
    function announce() {
      const identity = user();
      if (lastHandoff && identity?.id !== lastHandoff.userId) lastHandoff = null;
      if (port) send(port, {type: 'favorites:ready', user: identity});
      if (identity && port && heartbeat === null) heartbeat = repeat(announce, 25000);
      else if (!identity || !port) clearHeartbeat();
    }
    function disconnected(channel) {
      if (port !== channel) return;
      port = null; lastHandoff = null; clearHeartbeat(); inFlight.clear(); schedule();
    }
    async function message(channel, input) {
      if (!destroyed && !paused && port === channel && input?.type === 'favorites:connected') {
        if (input.connected === true && typeof input.state === 'string' && input.state === lastHandoff?.state
            && user()?.id === lastHandoff.userId) {
          lastHandoff = null;
          try { options.onConnected?.(); } catch { /* UI delivery does not affect authentication. */ }
        }
        return;
      }
      if (destroyed || port !== channel || input?.type !== 'favorites:challenge'
          || typeof input.client_challenge !== 'string' || !OPAQUE.test(input.client_challenge)
          || typeof input.client_state !== 'string' || !OPAQUE.test(input.client_state)
          || typeof input.expected_user_id !== 'string' || !/^[1-9]\d{0,15}$/.test(input.expected_user_id)
          || inFlight.size) return;
      const identity = user(), state = input.client_state;
      lastHandoff = null;
      attempts = 0;
      if (!identity || identity.id !== input.expected_user_id) {
        send(channel, {type: 'favorites:unavailable', state, reason: 'not_signed_in'}); announce(); return;
      }
      inFlight.add(state);
      try {
        const result = await store.connectExtension({extension_id: EXTENSION_ID,
          client_challenge: input.client_challenge, client_state: state});
        if (destroyed || port !== channel) return;
        if (user()?.id !== identity.id) {
          send(channel, {type: 'favorites:unavailable', state, reason: 'not_signed_in'}); announce(); return;
        }
        if (typeof result?.code !== 'string' || !OPAQUE.test(result.code) || result.state !== state) throw new Error('invalid_handoff');
        lastHandoff = {state, userId: identity.id};
        send(channel, {type: 'favorites:connect', code: result.code, state});
      } catch {
        const sameUser = user()?.id === identity.id;
        send(channel, {type: 'favorites:unavailable', state, reason: sameUser ? 'unavailable' : 'not_signed_in'});
        if (!sameUser) announce();
      } finally { inFlight.delete(state); }
    }
    function connect() {
      if (destroyed || paused || !allowed || port || typeof browser?.runtime?.connect !== 'function') return;
      if (retry !== null) cancel(retry); retry = null;
      try {
        const channel = browser.runtime.connect(EXTENSION_ID, {name: PORT_NAME});
        port = channel;
        channel.onMessage.addListener(value => { void message(channel, value); });
        channel.onDisconnect.addListener(() => { void browser.runtime.lastError; disconnected(channel); });
        announce();
      } catch { port = null; schedule(); }
    }
    function update() {
      if (!user() && retry !== null) { cancel(retry); retry = null; }
      if (!port) connect(); else announce();
    }
    function listen(type, callback, surface = target) {
      if (surface?.addEventListener) { surface.addEventListener(type, callback); listeners.push([surface, type, callback]); }
    }
    function wake() { paused = false; attempts = 0; if (!port) connect(); else announce(); }
    function pause() {
      paused = true; clearHeartbeat(); if (retry !== null) cancel(retry); retry = null;
      const channel = port; port = null; lastHandoff = null; inFlight.clear();
      try { channel?.disconnect(); } catch { /* Already disconnected. */ }
    }
    function destroy() {
      if (destroyed) return;
      destroyed = true; clearHeartbeat(); if (retry !== null) cancel(retry); retry = null;
      for (const [surface, type, callback] of listeners) surface.removeEventListener(type, callback);
      const channel = port; port = null; lastHandoff = null; inFlight.clear();
      try { channel?.disconnect(); } catch { /* Already disconnected. */ }
    }
    listen('focus', wake); listen('pageshow', wake); listen('pagehide', pause);
    listen('visibilitychange', () => { if (documentTarget.visibilityState !== 'hidden') wake(); }, documentTarget);
    connect();
    return {update, destroy};
  }
  return {start, EXTENSION_ID, PORT_NAME};
});
