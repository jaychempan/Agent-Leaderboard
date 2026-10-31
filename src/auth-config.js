/* Public API address. No credentials belong in browser configuration.
 * The Worker handles GitHub OAuth; the page keeps a short site session in sessionStorage.
 * Without a deployed API, favorites continue to work locally.
 */
window.FAVORITES_CONFIG = Object.freeze({
  apiBase: 'https://agent-leaderboard-api.jaychempan.workers.dev/api',
});
