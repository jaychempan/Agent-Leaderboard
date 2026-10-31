/* Public browser configuration. Never put a GitHub secret or Supabase secret/service-role key here.
 * Configure GitHub OAuth and the favorites table first; see docs/github-favorites-setup.md.
 * Empty values keep existing local favorites working while cloud sign-in is not configured.
 */
window.FAVORITES_CONFIG = Object.freeze({
  url: '',
  publishableKey: '',
});
