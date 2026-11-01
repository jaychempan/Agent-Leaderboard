/* Real MV3 account integration in an isolated Chrome profile. Authentication and
 * API responses are fixtures inside its service worker; GitHub and production
 * are never contacted. Run with PLAYWRIGHT_MODULE=/path/to/playwright-core.
 */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

const root = path.resolve(__dirname, '../..');
const expectedId = 'medjijlfgmfeldlelkidiickdcnbicaf';
const api = 'https://agent-leaderboard-api.jaychempan.workers.dev/api';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-favorites-browser-'));
const artifacts = path.join(root, 'artifacts/extension');
let stage = 'launch', context;

(async () => {
  context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, colorScheme: 'dark', viewport: {width: 390, height: 850},
    ignoreDefaultArgs: ['--disable-extensions'], args: ['--enable-unsafe-extension-debugging'],
  });
  context.setDefaultTimeout(10000);
  try {
    fs.mkdirSync(artifacts, {recursive: true});
    // Page requests are blocked independently of the worker fixture, so a
    // missing interception cannot accidentally reach production or GitHub.
    await context.route('https://**/*', route => route.abort('blockedbyclient'));
    const cdp = await context.browser().newBrowserCDPSession();
    const {id} = await cdp.send('Extensions.loadUnpacked', {path: process.env.EXTENSION_PATH || path.join(root, 'chrome')});
    assert.equal(id, expectedId, 'the checked-in public key must preserve the Web Store extension ID');
    const worker = context.serviceWorkers().find(value => value.url().startsWith(`chrome-extension://${id}/`))
      || await context.waitForEvent('serviceworker', {predicate: value => value.url().startsWith(`chrome-extension://${id}/`)});
    stage = 'worker fixtures';
    const core = await import(pathToFileURL(path.join(root, 'chrome/core.mjs')).href);
    const catalog = JSON.parse(fs.readFileSync(path.join(root, 'chrome/data/catalog.json'), 'utf8'));
    const chosen = [], ids = new Set();
    for (const value of core.prepareCatalog(core.compactCatalog(catalog))) {
      if (!Number.isSafeInteger(value.source_id) || value.source_id <= 0 || ids.has(value.source_id)) continue;
      ids.add(value.source_id); chosen.push(core.favoriteRecord(value));
      if (chosen.length === 3) break;
    }
    assert.equal(chosen.length, 3, 'the packaged catalog needs three numeric repository IDs');
    const fixture = await worker.evaluate(async ({api, id, chosen}) => {
      const nativeRedirect = chrome.identity.getRedirectURL('github');
      if (chrome.runtime.id !== id || nativeRedirect !== `https://${id}.chromiumapp.org/github`) throw new Error('native_identity_mismatch');
      const originalFetch = globalThis.fetch.bind(globalThis);
      const bundled = await (await originalFetch(chrome.runtime.getURL('data/catalog.json'))).json();
      const bundledTrends = await (await originalFetch(chrome.runtime.getURL('data/trends.json'))).json();
      const user = {id: '701', login: 'browser-fixture-user', avatar_url: ''};
      const backend = globalThis.__favoritesBrowserBackend = {user, rows: new Map(), sessions: new Map(), exchanges: new Map(),
        receipts: new Set(), authWindows: 0, pkceExchanges: 0, imports: 0, importRows: 0, writes: 0, failedWrites: 0,
        failNextWrite: false, requests: [], catalog: chosen};
      const random = () => {
        let bytes = ''; for (const value of crypto.getRandomValues(new Uint8Array(32))) bytes += String.fromCharCode(value);
        return btoa(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      };
      const hash = async value => {
        let bytes = ''; for (const byte of new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))) bytes += String.fromCharCode(byte);
        return btoa(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      };
      const response = (status, data) => Response.json(data, {status});
      globalThis.fetch = async (input, options = {}) => {
        const url = new URL(typeof input === 'string' ? input : input.url);
        if (url.href === 'https://agentskills.media/data/discovery_index.json') return Response.json(bundled);
        if (url.href === 'https://agentskills.media/data/trends.json') return Response.json(bundledTrends);
        if (url.protocol === 'chrome-extension:') return originalFetch(input, options);
        if (url.origin + '/api' !== api) throw new Error('external_network_blocked');
        const headers = new Headers(options.headers), method = options.method || 'GET';
        if (headers.get('X-Favorites-Extension') !== id || options.credentials !== 'omit') throw new Error('invalid_extension_transport');
        const body = options.body ? JSON.parse(options.body) : null;
        backend.requests.push({path: url.pathname, method});
        if (url.pathname === '/api/auth/exchange') {
          if (headers.has('Authorization')) throw new Error('exchange_has_old_bearer');
          const exchange = backend.exchanges.get(body?.code);
          if (!exchange || body.state !== exchange.state || await hash(body.verifier) !== exchange.challenge) return response(400, {error: 'invalid_login_exchange'});
          backend.exchanges.delete(body.code); backend.pkceExchanges++;
          const token = random(), expiresAt = new Date(Date.now() + 8 * 3600000).toISOString();
          backend.sessions.set(token, user);
          return response(200, {token, expiresAt, user});
        }
        const token = (headers.get('Authorization') || '').replace(/^Bearer /, ''), owner = backend.sessions.get(token);
        if (url.pathname === '/api/bootstrap') {
          const after = Number(url.searchParams.get('after') || 0);
          if (after && (!owner || headers.get('X-Favorites-User') !== owner.id)) return response(409, {error: 'account_changed'});
          const rows = owner ? [...backend.rows].filter(([key]) => key.startsWith(owner.id + ':')).map(([, value]) => value)
            .filter(value => value.repo_id > after).sort((a, b) => a.repo_id - b.repo_id) : [];
          return response(200, {authConfigured: true, user: owner || null, favorites: rows.slice(0, 500), nextCursor: rows.length > 500 ? rows[499].repo_id : null});
        }
        if (!owner) return response(401, {error: 'authentication_required'});
        if (headers.get('X-Favorites-User') !== owner.id) return response(409, {error: 'account_changed'});
        if (url.pathname === '/api/auth/logout') { backend.sessions.delete(token); return response(200, {ok: true}); }
        if (url.pathname === '/api/favorites/resolve') return response(404, {error: 'repository_not_found'});
        if (url.pathname === '/api/favorites/import') {
          const receipt = `${owner.id}:${body.migration_id}:${body.batch_id}`;
          if (!backend.receipts.has(receipt)) {
            for (const value of body.favorites) {
              const key = `${owner.id}:${value.repo_id}`;
              if (!backend.rows.has(key)) backend.rows.set(key, value);
            }
            backend.receipts.add(receipt); backend.imports++; backend.importRows += body.favorites.length;
          }
          return response(200, {ok: true});
        }
        const match = /^\/api\/favorites\/([1-9]\d*)$/.exec(url.pathname);
        if (!match || !['PUT', 'DELETE'].includes(method)) return response(404, {error: 'not_found'});
        if (backend.failNextWrite) { backend.failNextWrite = false; backend.failedWrites++; return response(503, {error: 'unavailable'}); }
        const repoId = Number(match[1]), key = `${owner.id}:${repoId}`;
        if (method === 'PUT') backend.rows.set(key, {repo_id: repoId, repository: body.repository});
        else backend.rows.delete(key);
        backend.writes++;
        return response(200, {ok: true});
      };
      chrome.identity.launchWebAuthFlow = async ({url, interactive}) => {
        const address = new URL(url), returnTo = address.searchParams.get('return_to');
        if (!interactive || address.origin + address.pathname !== api + '/auth/github' || address.searchParams.get('client') !== 'extension'
            || returnTo !== nativeRedirect || !/^[A-Za-z0-9_-]{43}$/.test(address.searchParams.get('client_state') || '')
            || !/^[A-Za-z0-9_-]{43}$/.test(address.searchParams.get('client_challenge') || '')) throw new Error('invalid_identity_request');
        const code = random(), state = address.searchParams.get('client_state');
        backend.exchanges.set(code, {state, challenge: address.searchParams.get('client_challenge')}); backend.authWindows++;
        return returnTo + '?' + new URLSearchParams({login_code: code, login_state: state});
      };
      await chrome.storage.local.set({[`favorite:${chosen[0].key}`]: chosen[0], checkedAt: Date.now(), uiLocale: 'zh-CN', themeMode: 'light'});
      return {id: chrome.runtime.id, nativeRedirect, user: user.login,
        records: chosen.map(({key, full_name, source_id}) => ({key, full_name, id: source_id}))};
    }, {api, id, chosen});
    assert.equal(fixture.nativeRedirect, `https://${expectedId}.chromiumapp.org/github`);
    const panelURL = `chrome-extension://${id}/panel.html`;
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.name));
    const row = (page, key) => page.locator(`.repo[data-repo=${JSON.stringify(key)}]`);
    const backendHas = repoId => worker.evaluate(repoId => {
      const backend = globalThis.__favoritesBrowserBackend; return backend.rows.has(`${backend.user.id}:${repoId}`);
    }, repoId);
    const waitBackendHas = async (repoId, expected) => {
      for (let turn = 0; turn < 80; turn++) {
        if (await backendHas(repoId) === expected) return;
        await page.waitForTimeout(50);
      }
      assert.fail('fixture backend favorite did not reach the expected state');
    };
    const waitCount = (page, value) => page.waitForFunction(value => document.getElementById('favorite-count').textContent === String(value), value);
    const waitSynced = async page => {
      await page.waitForFunction(() => ['synced', 'error', 'offline'].includes(document.getElementById('favorites-account').dataset.state)
        && !document.getElementById('account-sync').disabled);
      assert.equal(await page.locator('#favorites-account').getAttribute('data-state'), 'synced',
        'account sync failed: ' + await page.locator('#account-message').textContent());
    };
    stage = 'anonymous favorite';
    await page.goto(panelURL); await page.locator('.repo').first().waitFor();
    await page.locator('#favorites').click(); await waitCount(page, 1);
    assert.equal(await page.locator('#account-sign-in').isVisible(), true);
    assert.equal(await row(page, fixture.records[0].key).count(), 1);
    stage = 'sign in and migrate';
    await page.locator('#account-sign-in').click(); await waitSynced(page);
    assert.equal(await page.locator('#account-user').textContent(), fixture.user);
    const snapshot = await page.evaluate(() => chrome.runtime.sendMessage({type: 'favorites:snapshot'}));
    const secure = await worker.evaluate(async snapshot => {
      const values = await chrome.storage.session.get(null), local = await chrome.storage.local.get(null);
      const value = values.agentFavoritesSessionV1, token = value?.token;
      return {authWindows: globalThis.__favoritesBrowserBackend.authWindows, pkce: globalThis.__favoritesBrowserBackend.pkceExchanges,
        imports: globalThis.__favoritesBrowserBackend.imports, importRows: globalThis.__favoritesBrowserBackend.importRows,
        tokenValid: /^[A-Za-z0-9_-]{43}$/.test(token || ''), eightHours: Math.abs(Date.parse(value?.expiresAt) - Date.now() - 8 * 3600000) < 15000,
        tokenAbsentFromLocal: Boolean(token) && !JSON.stringify(local).includes(token), tokenAbsentFromSnapshot: Boolean(token) && !JSON.stringify(snapshot).includes(token),
        pendingCleared: !values.agentFavoritesLoginV1, oldKeysRemoved: !Object.keys(local).some(key => key.startsWith('favorite:'))};
    }, snapshot);
    assert.deepEqual(secure, {authWindows: 1, pkce: 1, imports: 1, importRows: 1, tokenValid: true, eightHours: true,
      tokenAbsentFromLocal: true, tokenAbsentFromSnapshot: true, pendingCleared: true, oldKeysRemoved: true});
    stage = 'reload and second panel';
    await page.reload(); await page.locator('.repo').first().waitFor(); await page.locator('#favorites').click(); await waitSynced(page);
    assert.equal(await page.locator('#account-user').textContent(), fixture.user); await waitCount(page, 1);
    const second = await context.newPage(); second.on('pageerror', error => errors.push(error.name));
    await second.goto(panelURL); await second.locator('.repo').first().waitFor(); await second.locator('#favorites').click(); await waitCount(second, 1);
    stage = 'two panel additions and deletions';
    await page.locator('#all').click(); await page.locator('#query').fill(fixture.records[1].full_name);
    await row(page, fixture.records[1].key).locator('.save').click();
    await waitBackendHas(fixture.records[1].id, true); await waitCount(second, 2);
    await row(second, fixture.records[0].key).locator('.save').click();
    await waitBackendHas(fixture.records[0].id, false); await waitCount(page, 1); await waitCount(second, 1);
    stage = 'website favorite and missing repository details';
    await page.locator('#query').fill(''); await page.locator('#favorites').click(); await waitSynced(page);
    const websiteId = 910000991, unknownId = 910000992;
    await worker.evaluate(({websiteId, unknownId}) => {
      const backend = globalThis.__favoritesBrowserBackend;
      backend.rows.set(`${backend.user.id}:${websiteId}`, {repo_id: websiteId, repository: {id: websiteId, full_name: 'browser-fixture/shared-site-repository',
        description: 'Saved on the website fixture', sources: ['skills'], stars: 1}});
      backend.rows.set(`${backend.user.id}:${unknownId}`, {repo_id: unknownId, repository: {id: unknownId, full_name: '', description: '', sources: []}});
    }, {websiteId, unknownId});
    await page.locator('#account-sync').click(); await waitSynced(page); await waitCount(page, 3); await waitCount(second, 3);
    assert.equal(await row(page, 'browser-fixture/shared-site-repository').count(), 1);
    const unknown = row(page, `repo-id:${unknownId}`);
    assert.ok((await unknown.textContent()).includes('#' + unknownId));
    assert.equal(await unknown.locator('a[href^="https://github.com/"]').count(), 0, 'unknown IDs must not invent a repository link');
    await unknown.locator('.save').click(); await waitBackendHas(unknownId, false); await waitCount(page, 2); await waitCount(second, 2);
    stage = 'failed write rollback';
    await page.locator('#all').click(); await page.locator('#query').fill(fixture.records[2].full_name);
    await worker.evaluate(() => { globalThis.__favoritesBrowserBackend.failNextWrite = true; });
    await row(page, fixture.records[2].key).locator('.save').click();
    await page.waitForFunction(() => !document.querySelector('.repo .save')?.disabled && document.querySelector('.repo .save')?.getAttribute('aria-pressed') === 'false');
    assert.equal(await backendHas(fixture.records[2].id), false);
    assert.equal(await worker.evaluate(() => globalThis.__favoritesBrowserBackend.failedWrites), 1);
    await waitCount(page, 2); await waitCount(second, 2);
    await page.locator('#query').fill(''); await page.locator('#favorites').click(); await waitSynced(page);
    stage = 'narrow bilingual account layouts';
    const screenshots = [];
    for (const width of [320, 390]) for (const locale of ['zh-CN', 'en']) for (const theme of ['light', 'dark']) {
      await page.setViewportSize({width, height: 850});
      if (await page.locator('html').getAttribute('lang') !== locale) await page.locator('#locale-toggle').click();
      await page.waitForFunction(locale => document.documentElement.lang === locale, locale);
      for (let turn = 0; await page.locator('#theme').getAttribute('data-mode') !== theme && turn < 3; turn++) await page.locator('#theme').click();
      assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth), true,
        `account layout overflows at ${width}/${locale}/${theme}`);
      assert.equal(await page.locator('#favorites-account button').evaluateAll(buttons => buttons.filter(button => !button.hidden).every(button => {
        const rect = button.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth;
      })), true, 'all account actions fit');
      const name = `favorites-${width}-${locale}-${theme}.png`;
      await page.screenshot({path: path.join(artifacts, name)}); screenshots.push(name);
    }
    stage = 'logout retains cloud favorites';
    const cloudBefore = await worker.evaluate(() => globalThis.__favoritesBrowserBackend.rows.size);
    await page.locator('#account-sign-out').click(); await page.locator('#account-sign-in').waitFor();
    await waitCount(page, 0); await waitCount(second, 0);
    const loggedOut = await worker.evaluate(async () => {
      const values = await chrome.storage.session.get(null), backend = globalThis.__favoritesBrowserBackend;
      return {sessionGone: !values.agentFavoritesSessionV1, cacheGone: !values.agentFavoritesCloudV1, pendingGone: !values.agentFavoritesLoginV1,
        activeSessions: backend.sessions.size, rows: backend.rows.size};
    });
    assert.deepEqual(loggedOut, {sessionGone: true, cacheGone: true, pendingGone: true, activeSessions: 0, rows: cloudBefore});
    assert.equal(cloudBefore, 2); assert.deepEqual(errors, []);
    console.log(JSON.stringify({status: 'passed', runtime: 'real unpacked Chrome MV3', extensionId: id, accountIntegration: 'fixture API + identity completion',
      pkce: 'S256 verified', panels: 2, screenshots, productionNetwork: 'blocked', userProfile: 'not accessed', credentialsPrinted: false}));
  } finally { await context.close(); }
})().catch(error => {
  console.error(JSON.stringify({status: 'failed', stage, error: error.name, message: error.message})); process.exitCode = 1;
}).finally(() => { try { fs.rmSync(profile, {recursive: true, force: true}); } catch { /* Chrome may briefly retain a profile file. */ } });
