/* Public same-origin API path. No credentials belong in browser configuration.
 * The Cloudflare Worker handles GitHub OAuth and HttpOnly session cookies.
 * Without a deployed API, favorites continue to work locally.
 */
window.FAVORITES_CONFIG = Object.freeze({
  apiBase: '/api',
});
