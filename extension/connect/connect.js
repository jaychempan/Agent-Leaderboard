/* Keep old links and OAuth returns in the same tab, using the main Favorites dialog. */
(() => {
  'use strict';
  const destination = WebsiteExtensionSync.legacyDestination(location);
  if (destination) location.replace(destination);
})();
