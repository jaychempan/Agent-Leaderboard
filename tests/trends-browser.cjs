/* Dedicated trending page: real data, category analysis, navigation and layout. */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.SITE_BASE_URL || 'http://127.0.0.1:8767/';
const files = {skills:'data',mcp:'mcp_data',prompts:'prompts_data',frameworks:'frameworks_data',research:'auto_research_data'};
const data = Object.fromEntries(Object.entries(files).map(([key,file]) => [key, JSON.parse(fs.readFileSync(`data/${file}.json`))]));
const trends = JSON.parse(fs.readFileSync('data/trends.json'));
function expected(source, days, sort) {
  const deltas = trends.sources[source].windows[days].deltas;
  const comparable = data[source].repos
    .filter(repo => Number.isFinite(deltas[repo.id])).map(repo => ({id:repo.id, stars:repo.stars, delta:deltas[repo.id], rate:repo.stars > deltas[repo.id] ? deltas[repo.id]/(repo.stars-deltas[repo.id])*100 : null}));
  return {net: comparable.reduce((sum,item)=>sum+item.delta,0), rising: comparable.filter(item=>item.delta>0).length,
    ranked:comparable.filter(item=>item.delta>0 && (sort!=='rate'||item.rate!==null)).sort((a,b)=>(sort==='rate'?b.rate-a.rate:b.delta-a.delta)||b.delta-a.delta||b.stars-a.stars||a.id-b.id).map(item=>item.id)};
}
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{localStorage.setItem('st_lang','zh');localStorage.setItem('st_theme','light');});
    await page.route('https://api.counterapi.dev/**',route=>route.fulfill({json:{count:1}}));
    await page.goto(base);
    await page.locator('#pageLoader').waitFor({state:'detached'});
    assert.equal(await page.locator('.hero .trend-entry').count(),0,'Removed the circled hero link');
    assert.equal(await page.locator('#trend-panel').isVisible(),false,'Hidden by default');
    await page.locator('#searchInput').fill('skill');
    const original = {url:page.url(), first:await page.locator('#grid .card').first().getAttribute('href')};
    async function openPanel() {
      if(!await page.locator('.nav-trending').isVisible())await page.locator('.nav-hamburger').click();
      await page.locator('.nav-trending').click();
      await page.locator('#trend-panel').waitFor({state:'visible'});
    }
    async function closePanel() {
      await page.locator('#trend-close').click();
      await page.locator('#trend-panel').waitFor({state:'hidden'});
    }
    await openPanel();
    assert.equal(page.url(),original.url,'Opening never navigates');
    for(const source of Object.keys(files)) {
      await page.locator(`[data-source="${source}"]`).click();
      for(const days of [1,7,30]) {
        await page.locator(`[data-days="${days}"]`).click();
        for(const sort of ['delta','rate']) {
          await page.locator('#trend-sort').selectOption(sort);
          const wanted=expected(source,days,sort);
          const ids=await page.locator('#trend-ranking li').evaluateAll(rows=>rows.map(row=>Number(row.dataset.id)));
          assert.deepEqual(ids,wanted.ranked.slice(0,20),`${source} ${days} ${sort}`);
          const overview=await page.locator('#trend-overview').innerText();
          assert.ok(overview.includes(wanted.rising.toLocaleString('zh-CN')));
          assert.ok((await page.locator('#trend-overview').getAttribute('title')).includes(wanted.net.toLocaleString('zh-CN')));
        }
      }
    }
    assert.equal(page.url(),original.url,'Switching trends does not change home route');
    await page.locator('[data-source="mcp"]').click();
    await page.locator('[data-days="30"]').click();
    await page.locator('#trend-sort').selectOption('rate');
    await page.locator('#trend-body').evaluate(el=>el.scrollTop=350);
    const panelScroll=await page.locator('#trend-body').evaluate(el=>el.scrollTop);
    await page.locator('#trend-collapse').click();
    await page.locator('#trend-dock').waitFor({state:'visible'});
    assert.equal(await page.locator('#trend-panel').isVisible(),false);
    assert.equal(await page.locator('#searchInput').inputValue(),'skill');
    assert.equal(await page.locator('#grid .card').first().getAttribute('href'),original.first);
    await page.locator('#trend-expand').click();
    assert.equal(await page.locator('[data-source="mcp"]').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('[data-days="30"]').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#trend-sort').inputValue(),'rate');
    assert.equal(await page.locator('#trend-body').evaluate(el=>el.scrollTop),panelScroll);
    // Native dialog keeps keyboard focus inside and Escape returns to the page.
    await page.locator('#trend-close').focus();
    for(let i=0;i<12;i++) {
      await page.keyboard.press('Tab');
      assert.ok(await page.evaluate(()=>document.querySelector('#trend-panel').contains(document.activeElement)));
    }
    await page.keyboard.press('Escape');
    await page.locator('#trend-panel').waitFor({state:'hidden'});
    assert.equal(await page.locator('#trend-dock').isVisible(),false);
    assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
    await page.evaluate(()=>scrollTo(0,600));
    const homeScroll=await page.evaluate(()=>scrollY);
    await openPanel();
    await closePanel();
    assert.equal(await page.evaluate(()=>scrollY),homeScroll,'Home scroll preserved');
    await openPanel();
    await page.mouse.click(1,1);
    await page.locator('#trend-panel').waitFor({state:'hidden'});
    fs.mkdirSync('artifacts/trends',{recursive:true});
    for(const lang of ['zh','en']) {
      if(lang==='en')await page.locator('#langBtn').click();
      for(const theme of ['light','dark']) {
        if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('#themeBtn').click();
        for(const width of [320,390,768,1440]) {
          await page.setViewportSize({width,height:1000});
          await openPanel();
          await page.locator('[data-source="skills"]').click();
          await page.locator('[data-days="7"]').click();
          await page.locator('#trend-sort').selectOption('delta');
          assert.ok(await page.locator('#trend-panel').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}));
          assert.ok(await page.locator('#trend-body').evaluate(el=>el.scrollWidth<=el.clientWidth),`${lang} ${theme} ${width} fits`);
          assert.equal(await page.locator('#trend-ranking li').count(),20);
          if([390,1440].includes(width))await page.screenshot({path:`artifacts/trends/overlay-${lang}-${theme}-${width}.png`,animations:'disabled'});
          await closePanel();
        }
      }
    }
    await openPanel();
    await page.locator('#trend-collapse').click();
    await page.locator('#trend-dock').waitFor({state:'visible'});
    await page.screenshot({path:'artifacts/trends/collapsed-preview.png',animations:'disabled'});
    await page.locator('#trend-dismiss').click();
    assert.equal(await page.locator('#trend-dock').isVisible(),false);
    // Old standalone bookmarks open the overlay on the matching homepage.
    await page.goto(new URL('trending/#mcp',base).href);
    await page.locator('#trend-panel').waitFor({state:'visible'});
    assert.equal(new URL(page.url()).pathname,new URL(base).pathname);
    assert.equal(new URL(page.url()).hash,'#mcp');
    assert.equal(await page.locator('[data-source="mcp"]').getAttribute('aria-pressed'),'true');
    await closePanel();
    await page.route('**/data/trends.js?*',route=>route.fulfill({contentType:'application/javascript',body:'window.TRENDS_DATA={sources:{}};'}));
    await page.reload();
    await page.locator('#pageLoader').waitFor({state:'detached'});
    await openPanel();
    assert.equal(await page.locator('#trend-ranking li').count(),0);
    assert.match(await page.locator('#trend-empty').innerText(),/历史数据还不足/);
    assert.deepEqual(errors,[]);
    console.log('PASS: overlay, minimize/restore/close, Escape/backdrop/focus, preserved home filters/scroll/URL, 5 sources × 3 windows × 2 sorts, Top 20, themes/locales/320–1440px, legacy URL and stale data.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
