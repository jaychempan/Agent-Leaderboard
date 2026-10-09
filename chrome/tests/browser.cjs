/* Real unpacked-extension smoke test. Requires Chrome and playwright-core.
 * PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core node chrome/tests/browser.cjs
 * Uses an isolated temporary profile and never touches the user's browser profile.
 */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');

(async () => {
  const context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'agent-extension-test-')), {
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, colorScheme: 'dark', viewport: {width: 390, height: 850}, ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
  });
  context.setDefaultTimeout(10000);
  try {
    fs.mkdirSync(path.join(root, 'chrome/dist'), {recursive: true});
    const cdp = await context.browser().newBrowserCDPSession();
    const {id} = await cdp.send('Extensions.loadUnpacked', {path: path.join(root, 'chrome')});
    let mode = 'offline';
    const remote = JSON.parse(fs.readFileSync(path.join(root, 'data/discovery_index.json')));
    await context.route('https://agentskills.media/data/discovery_index.json', async route => {
      if (mode === 'offline') return route.abort('internetdisconnected');
      return route.fulfill({contentType: 'application/json', body: JSON.stringify(mode === 'invalid' ? {items: []} : remote)});
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      const write = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = async text => {
        if (window.failClipboard) throw new Error('Clipboard unavailable');
        await write(text);
        window.lastCopiedText = text;
      };
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const url = `chrome-extension://${id}/panel.html`;
    await page.goto(url);
    assert.equal(await page.locator('header').count(), 0, 'no duplicate brand header inside the Chrome side panel');
    const iconPixels = await page.evaluate(async () => {
      const manifest = chrome.runtime.getManifest();
      const path = manifest.icons['32'];
      if (manifest.action.default_icon['32'] !== path) throw new Error('Toolbar and extension icons must match');
      const img = new Image(); img.src = chrome.runtime.getURL(path); await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
      const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
      return {corner: ctx.getImageData(0, 0, 1, 1).data[3], background: [...ctx.getImageData(3, 3, 1, 1).data]};
    });
    assert.deepEqual(iconPixels, {corner: 0, background: [0, 0, 0, 0]});
    await page.locator('.repo').first().waitFor();
    await page.waitForFunction(() => document.getElementById('data-status').textContent.includes('更新失败'));
    assert.equal(await page.locator('#expand').count(), 0);
    assert.equal(await page.locator('.header-actions #locale-toggle').count(), 1);
    assert.equal(await page.locator('#locale-toggle').count(), 1);
    assert.equal(await page.locator('#theme').getAttribute('data-mode'), 'auto');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.emulateMedia({colorScheme: 'light'});
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await page.emulateMedia({colorScheme: 'dark'});
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    assert.equal(await page.locator('.repo').count(), 30);
    const firstPageNames = await page.locator('.repo').evaluateAll(nodes => nodes.map(node => node.dataset.repo));
    const totalResults = Number((await page.locator('#result-count').textContent()).split(' ')[0].replaceAll(',', ''));
    const lastPage = Math.ceil(totalResults / 30);
    assert.equal(await page.locator('#previous-page').isDisabled(), true);
    await page.locator('#results-scroll').evaluate(node => { node.scrollTop = 600; });
    await page.locator('#next-page').click();
    assert.equal(await page.locator('.repo').count(), 30);
    assert.equal(await page.locator('#page-number').inputValue(), '2');
    assert.ok((await page.locator('.repo').evaluateAll(nodes => nodes.map(node => node.dataset.repo))).every(name => !firstPageNames.includes(name)));
    assert.equal(await page.locator('#results-scroll').evaluate(node => node.scrollTop), 0);
    await page.locator('#previous-page').click();
    assert.deepEqual(await page.locator('.repo').evaluateAll(nodes => nodes.map(node => node.dataset.repo)), firstPageNames);
    await page.locator('#page-number').fill(String(lastPage));
    await page.locator('#page-number').press('Enter');
    assert.equal(await page.locator('#next-page').isDisabled(), true);
    assert.equal(await page.locator('.repo').count(), totalResults % 30 || 30);
    await page.locator('#page-number').fill('');
    await page.locator('#page-number').press('Tab');
    assert.equal(await page.locator('#page-number').inputValue(), String(lastPage));
    assert.ok(await page.locator('#query').evaluate(node => node.getBoundingClientRect().top >= 0));
    assert.ok(await page.locator('footer').evaluate(node => node.getBoundingClientRect().bottom <= innerHeight));
    await page.locator('#query').fill('playwright');
    assert.equal(await page.locator('#page-number').inputValue(), '1');
    assert.ok(await page.locator('.repo').count() > 0);
    const name = await page.locator('.repo').first().getAttribute('data-repo');
    await page.locator('.save').first().click();
    await page.waitForFunction(() => document.getElementById('favorite-count').textContent === '1');
    await page.locator('#favorites').click();
    assert.equal(await page.locator('.repo').count(), 1);
    assert.equal(await page.locator('#previous-page').isDisabled(), true);
    assert.equal(await page.locator('#next-page').isDisabled(), true);
    await page.reload();
    await page.locator('.repo').first().waitFor();
    assert.equal(await page.locator('#favorite-count').textContent(), '1');
    await page.locator('#favorites').click();
    assert.equal(await page.locator('.repo').first().getAttribute('data-repo'), name);
    await page.locator('summary').first().click();
    assert.ok((await page.locator('.links a').first().getAttribute('href')).endsWith('#readme'));
    await page.bringToFront();
    await page.locator('.links button').first().click();
    await page.waitForFunction(() => document.getElementById('toast').textContent === '仓库链接已复制');
    const installURL = await page.locator('.repo-link').first().getAttribute('href');
    await page.locator('.copy-install').first().click();
    await page.waitForFunction(() => document.getElementById('toast').textContent === '安装提示已复制，粘贴到 AI 编程工具中使用');
    const zhPrompt = await page.evaluate(() => window.lastCopiedText);
    assert.ok(zhPrompt.includes(installURL + '#readme'));
    assert.ok(zhPrompt.startsWith('请帮我'));
    await page.locator('.copy-install-text').first().click();
    assert.equal(await page.evaluate(() => window.lastCopiedText), zhPrompt);
    await page.evaluate(() => { window.failClipboard = true; });
    await page.locator('.copy-install').first().click();
    await page.waitForFunction(() => document.getElementById('toast').textContent === '安装提示复制失败，请重试');
    await page.evaluate(() => { window.failClipboard = false; });
    await page.locator('#theme').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    assert.equal(await page.locator('#theme').getAttribute('data-mode'), 'light');
    await page.emulateMedia({colorScheme: 'light'});
    await page.emulateMedia({colorScheme: 'dark'});
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light', 'manual mode overrides system');
    await page.locator('#all').click();
    await page.locator('#query').fill('');
    await page.locator('[data-source="mcp"]').click();
    assert.ok((await page.locator('.source-tag').allTextContents()).includes('MCP 服务器'));
    assert.ok((await page.locator('.repo-mark .mark-label').allTextContents()).every(label => label === 'MCP'));
    assert.equal(await page.locator('[data-source="mcp"] svg').count(), 1);
    assert.ok((await page.locator('#category option').allTextContents()).some(text => text.startsWith('数据库')));
    await page.locator('#category').selectOption('mcp:database');
    const mcp = JSON.parse(fs.readFileSync(path.join(root, 'data/mcp_data.json'))).repos;
    const dbNames = new Set(mcp.filter(r => (r.categories || [r.category]).includes('database')).map(r => r.full_name.toLowerCase()));
    assert.ok((await page.locator('.repo').evaluateAll(nodes => nodes.map(n => n.dataset.repo))).every(name => dbNames.has(name)));
    await page.locator('#toggle-uses').click();
    const useButtons = page.locator('#use-cases button');
    const useA = await useButtons.nth(0).getAttribute('data-use');
    const useB = await useButtons.nth(1).getAttribute('data-use');
    await page.locator('#use-cases button').filter({hasText: useA}).first().click();
    await page.locator('#use-cases button').filter({hasText: useB}).first().click();
    const both = new Set(mcp.filter(r => (r.categories || [r.category]).includes('database') && [useA, useB].every(uc => r.use_cases.includes(uc))).map(r => r.full_name.toLowerCase()));
    assert.equal(await page.locator('#use-cases button[aria-pressed="true"]').count(), 2);
    assert.equal(await page.locator('#use-label').textContent(), '已选 2 项用途');
    assert.ok((await page.locator('.repo').evaluateAll(nodes => nodes.map(n => n.dataset.repo))).every(name => both.has(name)));
    assert.ok((await page.locator('#result-count').textContent()).startsWith(`${both.size} `));
    assert.equal(await page.locator('#website').getAttribute('href'), 'https://agentskills.media/#mcp');
    await page.getByRole('button', {name: '移除筛选：' + useA, exact: true}).click();
    assert.equal(await page.locator('#use-cases button[aria-pressed="true"]').count(), 1);
    await page.locator('[data-source="framework"]').click();
    assert.equal(await page.locator('#category').inputValue(), '');
    assert.equal(await page.locator('#use-cases button[aria-pressed="true"]').count(), 0);
    assert.ok((await page.locator('#category option').allTextContents()).some(text => text.startsWith('流程编排')));
    await page.locator('[data-source="mcp"]').click();
    await page.locator('#filter-toggle').click();
    await page.locator('#max-days').selectOption('30');
    assert.ok((await page.locator('#active-filters').textContent()).includes('近 1 月'));
    await page.locator('#max-days').selectOption('0');
    await page.locator('#platform').selectOption('codex');
    await page.locator('#language').selectOption('TypeScript');
    await page.locator('#min-stars').selectOption('1000');
    const rows = await page.locator('.repo').allTextContents();
    assert.ok(rows.length > 0);
    assert.ok(rows.every(row => row.includes('MCP') && row.includes('TypeScript')));
    await page.locator('#reset').click();
    await page.locator('#filter-toggle').click();
    await page.locator('#query').fill('not-a-real-repository-zzzzzz');
    assert.equal(await page.locator('#empty').isVisible(), true);
    assert.equal(await page.locator('#pagination').isVisible(), false);
    await page.locator('#clear-search').click();
    assert.equal(await page.locator('.repo').count(), 30);
    await page.locator('#query').fill('browser');
    await page.locator('#toast').waitFor({state: 'hidden'});
    await page.emulateMedia({reducedMotion: 'reduce'});
    await page.setViewportSize({width: 320, height: 850});
    assert.equal(await page.locator('#sources button').count(), 6);
    assert.equal(await page.locator('.strip-arrow').count(), 0);
    await page.locator('#toggle-uses').click();
    assert.equal(await page.locator('#use-picker').isVisible(), true);
    await page.locator('#use-search').fill('网页');
    assert.ok(await useButtons.count() > 0);
    assert.ok((await useButtons.allTextContents()).every(text => text.includes('网页')));
    await page.locator('#use-search').fill('不存在的用途-zzzz');
    assert.equal(await page.locator('#no-uses').isVisible(), true);
    await page.locator('#use-search').fill('');
    await useButtons.first().click();
    assert.equal(await page.locator('#use-cases button[aria-pressed="true"]').count(), 1);
    await page.locator('#clear-uses').click();
    assert.equal(await page.locator('#use-label').textContent(), '全部用途');
    await page.setViewportSize({width: 390, height: 850});
    await page.screenshot({path: path.join(root, 'chrome/dist/extension-use-picker-390-light.png')});
    await page.locator('#use-search').press('Escape');
    assert.equal(await page.locator('#use-picker').isVisible(), false);
    assert.equal(await page.locator('#toggle-uses').getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator('#query').inputValue(), 'browser');
    const density = [];
    for (const width of [320, 390, 960]) {
      await page.setViewportSize({width, height: 850});
      await page.evaluate(() => scrollTo(0, 0));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}`);
      assert.ok(await page.locator('#pagination').evaluate(node => node.getBoundingClientRect().bottom <= innerHeight));
      assert.ok(await page.locator('#sources').evaluate(row => row.scrollWidth <= row.clientWidth), `all boards fit at ${width}`);
      assert.ok(await page.locator('#sources button').evaluateAll(buttons => buttons.every(button => {
        const rect = button.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= innerWidth;
      })), `all six board buttons visible at ${width}`);
      const measure = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('.repo')].map(row => row.getBoundingClientRect());
        const viewport = document.getElementById('results-scroll').getBoundingClientRect();
        return {width: innerWidth, height: innerHeight, firstResultY: rows[0].top,
          firstRowHeight: rows[0].height, fullyVisibleResults: rows.filter(r => r.top >= viewport.top && r.bottom <= viewport.bottom).length};
      });
      assert.ok(measure.fullyVisibleResults >= (width < 650 ? 6 : 12), `compact result density at ${width}: ${JSON.stringify(measure)}`);
      density.push(measure);
      await page.screenshot({path: path.join(root, `chrome/dist/extension-${width}-light.png`), fullPage: false});
    }
    fs.writeFileSync(path.join(root, 'chrome/dist/density.json'), JSON.stringify(density, null, 2));
    await page.setViewportSize({width: 390, height: 850});
    // Locale switching preserves result membership, page and stable filter IDs.
    await page.locator('#next-page').click();
    const beforeLocale = await page.locator('.repo').evaluateAll(nodes => nodes.map(n => n.dataset.repo));
    await page.locator('#locale-toggle').click();
    await page.waitForFunction(() => document.documentElement.lang === 'en');
    assert.equal(await page.locator('#page-number').inputValue(), '2');
    assert.deepEqual(await page.locator('.repo').evaluateAll(nodes => nodes.map(n => n.dataset.repo)), beforeLocale);
    assert.equal(await page.locator('#all').textContent(), 'Discover');
    assert.ok((await page.locator('#result-count').textContent()).includes('matching repositories'));
    assert.ok((await page.locator('#data-status').textContent()).startsWith('Update failed'));
    assert.equal(await page.locator('#help').getAttribute('href'), 'help-en.html');
    await page.locator('.copy-install').first().click();
    await page.waitForFunction(() => document.getElementById('toast').textContent.startsWith('Install prompt copied.'));
    const enPrompt = await page.evaluate(() => window.lastCopiedText);
    assert.ok(enPrompt.startsWith('Please help me'));
    assert.ok(enPrompt.includes(await page.locator('.repo-link').first().getAttribute('href')));
    assert.doesNotMatch(enPrompt, /\p{Script=Han}/u);
    await page.locator('#toast').waitFor({state: 'hidden'});
    for (const width of [320, 390, 960]) {
      await page.setViewportSize({width, height: 850});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `English overflow at ${width}`);
      assert.ok(await page.locator('#sources').evaluate(node => node.scrollWidth <= node.clientWidth));
      await page.screenshot({path: path.join(root, `chrome/dist/extension-${width}-en.png`)});
    }
    await page.locator('#query').fill('');
    await page.locator('[data-source="mcp"]').click();
    await page.locator('#category').selectOption('mcp:database');
    assert.ok((await page.locator('#category option:checked').textContent()).startsWith('Database'));
    await page.locator('#toggle-uses').click();
    await page.locator('#use-search').fill('Database');
    await page.locator('[data-use="数据库连接"]').click();
    const englishMatches = await page.locator('.repo').evaluateAll(nodes => nodes.map(n => n.dataset.repo));
    assert.equal(await page.locator('#use-label').textContent(), 'Database');
    await page.locator('#use-search').fill('');
    await page.locator('#toggle-uses').click();
    await page.evaluate(() => new Promise(resolve => {
      const check = viewState => {
        if (viewState?.category === 'mcp:database' && viewState.useCases.includes('数据库连接')) {
          chrome.storage.onChanged.removeListener(onChange); resolve();
        }
      };
      const onChange = (changes, area) => { if (area === 'session') check(changes.viewState?.newValue); };
      chrome.storage.onChanged.addListener(onChange);
      chrome.storage.session.get('viewState').then(({viewState}) => check(viewState));
    }));
    await page.reload();
    await page.locator('.repo').first().waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'), 'en', 'saved preference survives reload');
    assert.equal(await page.locator('#category').inputValue(), 'mcp:database');
    assert.deepEqual(await page.locator('.repo').evaluateAll(nodes => nodes.map(n => n.dataset.repo)), englishMatches);
    const languageMirror = await context.newPage();
    await languageMirror.goto(`${url}?q=browser`);
    await languageMirror.locator('.repo').first().waitFor();
    assert.equal(await languageMirror.locator('html').getAttribute('lang'), 'en');
    assert.equal(await languageMirror.locator('#theme').getAttribute('data-mode'), 'light');
    assert.equal(await languageMirror.locator('html').getAttribute('data-theme'), 'light');
    await page.locator('#locale-toggle').click();
    await languageMirror.waitForFunction(() => document.documentElement.lang === 'zh-CN');
    assert.equal(await page.locator('#use-label').textContent(), '数据库连接');
    assert.equal(await page.locator('#category').inputValue(), 'mcp:database');
    assert.deepEqual(await page.locator('.repo').evaluateAll(nodes => nodes.map(n => n.dataset.repo)), englishMatches);
    await languageMirror.close();
    await page.locator('#filter-toggle').click();
    await page.locator('#reset').click();
    await page.locator('#filter-toggle').click();
    await page.locator('#query').fill('browser');
    await page.setViewportSize({width: 390, height: 850});
    await page.locator('#theme').click();
    await page.screenshot({path: path.join(root, 'chrome/dist/extension-390-dark.png')});
    await page.setViewportSize({width: 390, height: 600});
    await page.locator('#filter-toggle').click();
    await page.locator('#language').selectOption('Python');
    assert.ok(await page.locator('#results-scroll').evaluate(node => node.clientHeight >= 120));
    assert.ok(await page.locator('footer').evaluate(node => node.getBoundingClientRect().bottom <= innerHeight));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({path: path.join(root, 'chrome/dist/extension-filters-390-dark.png')});
    await page.locator('#language').selectOption('');
    await page.locator('#filter-toggle').click();
    await page.locator('.repo summary').first().click();
    assert.ok(await page.locator('.detail-body').first().isVisible());
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator('.repo summary').first().click();
    await page.setViewportSize({width: 390, height: 850});
    mode = 'online';
    await page.locator('#refresh').click();
    await page.waitForFunction(() => document.getElementById('data-status').textContent.startsWith('已更新'));
    assert.equal(await page.evaluate(() => chrome.storage.local.get('catalogCache').then(v => v.catalogCache.items.length)), remote.items.length);
    mode = 'invalid';
    await page.locator('#refresh').click();
    await page.waitForFunction(() => document.getElementById('data-status').textContent.includes('更新失败'));
    assert.ok(await page.locator('.repo').count() > 0);
    mode = 'offline';
    await page.reload();
    await page.locator('.repo').first().waitFor();
    assert.ok((await page.locator('#data-status').textContent()).includes('本地缓存'));
    const second = await context.newPage();
    await second.goto(`${url}?q=superpowers`);
    await second.locator('.repo').first().waitFor();
    assert.equal(await second.locator('#query').inputValue(), 'superpowers');
    assert.ok((await second.locator('.repo h2').first().textContent()).includes('superpowers'));
    await second.locator('.save').first().click();
    await page.waitForFunction(() => document.getElementById('favorite-count').textContent === '2');
    // The service worker's context-menu handler persists this request for a panel in the same window.
    await page.evaluate(async () => {
      const {id} = await chrome.windows.getCurrent();
      await chrome.storage.session.set({[`request:${id}`]: {query: 'langchain', nonce: 'browser-test'}});
    });
    await page.waitForFunction(() => document.getElementById('query').value === 'langchain');
    assert.equal(await second.locator('#query').inputValue(), 'superpowers', 'standalone searches stay independent');
    assert.equal(await page.evaluate(() => chrome.sidePanel.getPanelBehavior().then(v => v.openPanelOnActionClick)), true);
    // Confirm remote strings render as text and cannot inject executable markup.
    remote.items[0].description = '<img src=x onerror="window.injected=true"> unique-security-probe';
    mode = 'online';
    await page.locator('#refresh').click();
    await page.waitForFunction(() => document.getElementById('data-status').textContent.startsWith('已更新'));
    await page.locator('#query').fill('unique-security-probe');
    assert.equal(await page.locator('.repo img').count(), 0);
    assert.ok((await page.locator('.description').first().textContent()).includes('<img'));
    assert.equal(await page.evaluate(() => window.injected), undefined);
    // Upgrade from v1.0: an old cache lacks classification data and must not override the new snapshot.
    await page.evaluate(async () => {
      const {catalogCache} = await chrome.storage.local.get('catalogCache');
      delete catalogCache.schema;
      for (const item of catalogCache.items) {delete item.categories; delete item.category;}
      await chrome.storage.local.set({catalogCache, checkedAt: Date.now()});
    });
    await page.goto(`${url}?q=`);
    await page.locator('.repo').first().waitFor();
    assert.ok((await page.locator('#data-status').textContent()).includes('内置快照'));
    await page.locator('#category').selectOption('mcp:database');
    assert.ok(await page.locator('.repo').count() > 0);
    if (process.env.TEST_LIVE_INDEX === '1') {
      await context.unroute('https://agentskills.media/data/discovery_index.json');
      await page.locator('#refresh').click();
      await page.waitForFunction(() => !document.getElementById('refresh').disabled);
      assert.ok((await page.locator('#data-status').textContent()).startsWith('已更新'), 'live catalog fetch succeeds');
    }
    await page.locator('#theme').click(); // dark -> system
    await page.waitForFunction(() => document.getElementById('theme').dataset.mode === 'auto');
    await second.waitForFunction(() => document.getElementById('theme').dataset.mode === 'auto');
    await page.emulateMedia({colorScheme: 'light'});
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await page.emulateMedia({colorScheme: 'dark'});
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({status: 'passed', extensionId: id, records: remote.items.length, density,
      checks: ['unpacked MV3 load', 'offline snapshot', 'pagination', 'search', 'filters', 'favorites persistence',
        'cross-panel favorites', 'details links', 'themes', '320/390/960px layout', 'online update',
        'invalid update fallback', 'cached reopen', 'query entry', 'selection request routing', 'side panel behavior',
        'clipboard write', 'Chinese and English install prompts, details action and clipboard failure', 'remote HTML rendered as text', 'website categories', 'AND use cases', 'filter removal',
        'board switching', 'time filter', 'system theme changes, manual override, and restoration', 'theme persistence and cross-panel sync', 'v1.0 cache upgrade',
        'all six boards visible without horizontal scrolling', 'type icons with text labels', 'English layout and language persistence', 'cross-panel language synchronization', 'language switch preserves pages and filters',
        'use picker search, multiselect, clear, and Escape',
        'independent result scrolling', 'search and footer remain visible', ...(process.env.TEST_LIVE_INDEX === '1' ? ['live catalog fetch'] : [])]}));
  } finally { await context.close(); }
})().catch(error => {console.error(error); process.exitCode = 1;});
