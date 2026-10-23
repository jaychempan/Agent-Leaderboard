/* Run with PLAYWRIGHT_MODULE pointing to playwright-core and Chrome installed.
 * Default: deterministic static Pages checks. --live: real CORS/UV/day-bucket check.
 * --deployed: check the published site instead of serving worktree files.
 */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const live = process.argv.includes('--live');
const deployed = process.argv.includes('--deployed');
const api = 'https://busuanzi.9420.ltd/api';
const canonical = 'https://agentskills.media/';

(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true});
  try {
    const context = await browser.newContext({viewport: {width: 1280, height: 900}});
    if (!deployed) {
      await context.route(/^https:\/\/(agentskills\.media|jaychempan\.github\.io)\//, async route => {
        const url = new URL(route.request().url());
        let pathname = decodeURIComponent(url.pathname).replace(/^\/Agent-Leaderboard(?=\/|$)/, '');
        if (!pathname || pathname.endsWith('/')) pathname += 'index.html';
        const file = path.resolve(root, '.' + pathname);
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({status: 404, body: 'Not found'});
        await route.fulfill({path: file});
      });
    }
    const page = await context.newPage();
    const errors = []; const requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {if (request.url() === api && request.method() === 'POST') requests.push(request);});
    await page.addInitScript(() => localStorage.setItem('st_lang', 'zh'));
    if (!live) await page.route(api, route => route.fulfill({
      json: {success: true, data: {page_pv: 12, site_uv: 3, site_pv: 999}},
      headers: {'Set-Bsz-Identity': 'signed-browser-test', 'Access-Control-Expose-Headers': 'Set-Bsz-Identity'},
    }));
    async function ready(url) {
      await page.goto(url, {waitUntil: 'domcontentloaded'});
      await page.locator('#pageLoader').waitFor({state: 'detached'});
      await page.waitForFunction(() => typeof visitState !== 'undefined' && ['ready', 'error'].includes(visitState.status));
      const state = await page.evaluate(() => visitState);
      assert.equal(state.status, 'ready', await page.locator('#visitBadge').innerText());
      assert.equal(typeof state.today, 'number'); assert.equal(typeof state.visitors, 'number');
      assert.ok(state.today > 0 && state.visitors > 0);
      await page.locator('#visitBadge').scrollIntoViewIfNeeded();
      assert.equal(await page.locator('#visitBadge').isVisible(), true);
      assert.match(await page.locator('#visitBadge').innerText(), /今日访问量.*累计访客人数/);
      return state;
    }
    const first = await ready(canonical);
    assert.equal(requests.length, 1);
    assert.match(requests[0].headers()['x-bsz-referer'], /^https:\/\/agentskills\.media\/__visits\/\d{4}-\d{2}-\d{2}$/);
    const identity = await page.evaluate(() => localStorage.getItem('st_visit_identity_v1'));
    assert.ok(identity, 'server identity is available through CORS and stored');
    await page.evaluate(() => {location.hash = '#mcp';});
    await page.waitForFunction(() => app.pageConfig.page === 'mcp');
    await page.evaluate(() => {app.lang = 'en'; renderAll();});
    assert.match(await page.locator('#visitBadge').innerText(), /Visits today.*Total visitors/);
    assert.equal(requests.length, 1, 'SPA navigation does not recount');
    const second = await ready(canonical);
    assert.equal(requests.length, 2);
    assert.equal(requests[1].headers().authorization, `Bearer ${identity}`);
    if (live) {
      assert.equal(second.today, first.today + 1, 'reloading adds one daily PV');
      assert.equal(second.visitors, first.visitors, 'reloading does not add another visitor');
      const tomorrow = await page.evaluate(async api => {
        const day = visitDay(new Date(Date.now() + 86400000));
        const response = await fetch(api, {headers: {
          'x-bsz-referer': `https://agentskills.media/__visits/${day}`,
          Authorization: `Bearer ${localStorage.getItem('st_visit_identity_v1')}`,
        }, credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(10000)});
        return response.json();
      }, api);
      assert.equal(tomorrow.success, true);
      assert.equal(tomorrow.data.page_pv, 0, 'new date starts at zero without resetting cumulative UV');
      assert.equal(tomorrow.data.site_uv, second.visitors);
    }
    await page.setViewportSize({width: 390, height: 844});
    await page.locator('#visitBadge').scrollIntoViewIfNeeded();
    const box = await page.locator('#visitBadge').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 391, 'counter fits on mobile');
    fs.mkdirSync(path.join(root, 'artifacts'), {recursive: true});
    await page.screenshot({path: path.join(root, 'artifacts/visit-counter-mobile.png')});
    if (!live && !deployed) {
      await ready('https://jaychempan.github.io/Agent-Leaderboard/');
      assert.equal(requests.length, 3, 'project Pages deployment is enabled');
      await page.route(api, route => route.abort());
      await page.goto(canonical);
      await page.waitForFunction(() => visitState.status === 'error');
      assert.equal(await page.locator('#visitBadge').innerText(), '访问统计暂不可用');
    }
    assert.deepEqual(errors, [], 'no script redeclaration or other page errors');
    console.log(JSON.stringify({live, deployed, first, second, requests: requests.length, errors}));
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exit(1);});
