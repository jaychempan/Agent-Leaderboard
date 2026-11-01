/* Real MV3 trending UI in an isolated Chrome profile. Catalog/trend HTTP responses
 * are fixtures; no GitHub, account sign-in, or production API is contacted.
 * Expected rankings independently follow the public website's getData algorithm.
 */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const extensionPath = process.env.EXTENSION_PATH || path.join(root, 'chrome');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-trends-browser-'));
const artifacts = path.join(root, 'artifacts/extension');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const remoteCatalog = read('data/discovery_index.json'), remoteTrends = read('data/trends.json');
const boards = {skill: ['skills','data.json'], mcp: ['mcp','mcp_data.json'], prompt: ['prompts','prompts_data.json'],
  framework: ['frameworks','frameworks_data.json'], auto_research: ['research','auto_research_data.json']};
const sourceBoards = Object.fromEntries(Object.entries(boards).map(([source, [,file]]) => [source, read('data/'+file)]));
let context, page, stage='launch';

// Do not import chrome/trends.mjs to produce expected values: a regression in
// that implementation must fail against the website's source records and math.
function websiteRanking(source, days, sort, query='') {
  const board=sourceBoards[source], trendSource=remoteTrends.sources[boards[source][0]];
  const window=trendSource.updated_at===board.meta.updated_at ? trendSource.windows[days] : null;
  const tokens=query.normalize('NFKC').toLowerCase().trim().split(/\s+/u).filter(Boolean);
  return board.repos.flatMap(repo=>{
    const delta=window?.deltas?.[repo.id];
    if(!Number.isFinite(delta)||delta<=0)return [];
    const baseline=repo.stars-delta, rate=baseline>0?delta/baseline*100:null;
    if(sort==='rate'&&rate===null)return [];
    // Browser search checks below use full names, which are part of both search models.
    if(!tokens.every(token=>repo.full_name.normalize('NFKC').toLowerCase().includes(token)))return [];
    return [{repo,delta,rate}];
  }).sort((a,b)=>(sort==='rate'?b.rate-a.rate:b.delta-a.delta)||b.delta-a.delta||b.repo.stars-a.repo.stars||a.repo.id-b.repo.id).slice(0,20);
}
const rankingNames=rows=>rows.map(row=>row.repo.full_name.toLowerCase());
async function waitReady(page) {
  await page.locator('#trending').waitFor();
  await page.waitForFunction(()=>document.getElementById('results').getAttribute('aria-busy')==='false');
}
async function uiRows(page) {
  return page.locator('#results .trend-repo').evaluateAll(nodes=>nodes.map(node=>({name:node.dataset.repo,
    delta:Number(node.dataset.trendDelta),rate:node.dataset.trendRate===''?null:Number(node.dataset.trendRate),
    primary:node.querySelector('.trend-primary')?.textContent||'',secondary:node.querySelector('.trend-secondary')?.textContent||''})));
}
async function assertRanking(page,source,days,sort,query='') {
  const expected=websiteRanking(source,days,sort,query), actual=await uiRows(page);
  assert.deepEqual(actual.map(row=>row.name),rankingNames(expected),`${source}/${days}/${sort}/${query} matches website top 20`);
  for(let i=0;i<actual.length;i++) {
    assert.equal(actual[i].delta,expected[i].delta,`${source}/${days}/${sort} stars gained at rank ${i+1}`);
    if(expected[i].rate===null)assert.equal(actual[i].rate,null);
    else assert.ok(Math.abs(actual[i].rate-expected[i].rate)<1e-10,`${source}/${days}/${sort} growth rate at rank ${i+1}`);
    assert.ok(actual[i].primary&&actual[i].secondary,'both ranking metrics are visible');
    assert.ok((sort==='rate'?actual[i].primary:actual[i].secondary).includes('%')||expected[i].rate===null,'percentage accompanies growth metric');
  }
  assert.equal(await page.locator('#pagination').isVisible(),false,'trending top 20 has no discovery pagination');
  return expected;
}
async function choose(page,source,days,sort) {
  await page.locator(`#sources [data-source="${source}"]`).click();
  await page.locator(`#trend-periods [data-days="${days}"]`).click();
  await page.locator('#trend-sort').selectOption(sort);
}
async function refresh(page) {
  await page.locator('#refresh').click();
  await page.waitForFunction(()=>!document.getElementById('refresh').disabled);
}

(async()=>{
 context=await chromium.launchPersistentContext(profile,{
  executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,
  colorScheme:'light',viewport:{width:390,height:850},ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging'],
 });
 context.setDefaultTimeout(10000);
 try {
  fs.mkdirSync(artifacts,{recursive:true});
  let mode='offline',catalogRequests=0,trendRequests=0;
  const newerCatalog=structuredClone(remoteCatalog),newerTrends=structuredClone(remoteTrends);
  newerCatalog.meta.updated_at='2030-01-02T00:00:00.000Z';
  for(const [source,[websiteSource]]of Object.entries(boards)) {
    newerCatalog.sources[source].meta.updated_at='2030-01-02T00:00:00.000Z';
    newerTrends.sources[websiteSource].updated_at='2030-01-02T00:00:00.000Z';
  }
  await context.route('https://**/*',route=>route.abort('blockedbyclient'));
  await context.route('https://agentskills.media/data/discovery_index.json',route=>{
    catalogRequests++;
    if(mode==='offline'||mode==='catalog-failed')return route.abort('internetdisconnected');
    return route.fulfill({json:mode==='trends-failed'||mode==='mismatched'?newerCatalog:remoteCatalog});
  });
  await context.route('https://agentskills.media/data/trends.json',route=>{
    trendRequests++;
    if(mode==='offline'||mode==='trends-failed')return route.abort('internetdisconnected');
    return route.fulfill({json:mode==='catalog-failed'?newerTrends:remoteTrends});
  });
  const cdp=await context.browser().newBrowserCDPSession();
  const {id}=await cdp.send('Extensions.loadUnpacked',{path:extensionPath});
  const worker=context.serviceWorkers().find(value=>value.url().startsWith(`chrome-extension://${id}/`))
    ||await context.waitForEvent('serviceworker',{predicate:value=>value.url().startsWith(`chrome-extension://${id}/`)});
  await worker.evaluate(()=>{
    const originalFetch=globalThis.fetch.bind(globalThis);
    globalThis.fetch=(input,options)=>{
      const url=new URL(typeof input==='string'?input:input.url);
      if(url.protocol==='chrome-extension:')return originalFetch(input,options);
      if(url.origin==='https://agent-leaderboard-api.jaychempan.workers.dev'&&url.pathname==='/api/bootstrap')return Promise.resolve(Response.json({authConfigured:false,user:null,favorites:[],nextCursor:null}));
      return Promise.reject(new Error('external_network_blocked'));
    };
  });
  page=await context.newPage();const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const url=`chrome-extension://${id}/panel.html`;
  stage='offline bundled data';await page.goto(url);await waitReady(page);
  await page.waitForFunction(()=>!document.getElementById('refresh').disabled);
  assert.ok(catalogRequests>0&&trendRequests>0,'initial refresh requests the pair while offline');
  assert.match(await page.locator('#data-status').textContent(),/更新失败|Update failed/);
  await page.locator('#trending').click();
  assert.equal(await page.locator('#trend-controls').isVisible(),true);
  assert.equal(await page.locator('#favorites-account').isVisible(),false);
  assert.equal(await page.locator('#sources [data-source=""]').isVisible(),false,'all-source discovery button is hidden in trends');

  stage='all website rankings';let rankingChecks=0;
  for(const source of Object.keys(boards))for(const days of[1,7,30])for(const sort of['rate','delta']) {
    await choose(page,source,days,sort);await assertRanking(page,source,days,sort);rankingChecks++;
  }
  stage='search and favorites';
  await choose(page,'skill',1,'rate');
  const first=websiteRanking('skill',1,'rate')[0];assert.ok(first,'real daily data has a rising skill');
  await page.locator('#query').fill(first.repo.full_name);
  await assertRanking(page,'skill',1,'rate',first.repo.full_name);
  await page.locator('#results .trend-repo .save').first().click();
  await page.waitForFunction(()=>document.getElementById('favorite-count').textContent==='1');
  await page.locator('#favorites').click();
  assert.equal(await page.locator('#results .repo').first().getAttribute('data-repo'),first.repo.full_name.toLowerCase(),'a trend favorite appears in ordinary favorites');
  await page.locator('#trending').click();
  await page.locator('#query').fill('');
  await choose(page,'mcp',7,'delta');await assertRanking(page,'mcp',7,'delta');
  await page.evaluate(()=>new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{chrome.storage.onChanged.removeListener(onChange);reject(new Error('trend view persistence timed out'));},10000);
    const check=viewState=>{
      if(viewState?.trendsOnly===true&&viewState.source==='mcp'&&viewState.trendDays===7&&viewState.trendSort==='delta'){
        clearTimeout(timeout);chrome.storage.onChanged.removeListener(onChange);resolve();
      }
    };
    const onChange=(changes,area)=>{if(area==='session')check(changes.viewState?.newValue);};
    chrome.storage.onChanged.addListener(onChange);
    chrome.storage.session.get('viewState').then(({viewState})=>check(viewState));
  }));
  const savedBeforeReload=await worker.evaluate(async()=>(await chrome.storage.session.get('viewState')).viewState);
  assert.equal(savedBeforeReload?.trendsOnly,true,'trend state is saved in the shared extension session before reload');
  stage='state restoration';await page.reload();await waitReady(page);
  assert.equal(await page.locator('#trending').getAttribute('aria-pressed'),'true','restored trending view');
  assert.equal(await page.locator('#sources [data-source="mcp"]').getAttribute('aria-pressed'),'true','restored source');
  assert.equal(await page.locator('#trend-periods [data-days="7"]').getAttribute('aria-pressed'),'true','restored period');
  assert.equal(await page.locator('#trend-sort').inputValue(),'delta');
  await assertRanking(page,'mcp',7,'delta');
  assert.equal(await page.locator('#favorite-count').textContent(),'1');

  stage='paired refresh and rollback';mode='online';await refresh(page);
  assert.match(await page.locator('#data-status').textContent(),/已更新|Updated/);
  const cacheBefore=await page.evaluate(()=>chrome.storage.local.get(['catalogCache','trendsCache']));
  assert.ok(cacheBefore.catalogCache&&cacheBefore.trendsCache,'catalog and trend caches both saved');
  for(const failedMode of['trends-failed','catalog-failed','mismatched']) {
    mode=failedMode;await refresh(page);
    assert.match(await page.locator('#data-status').textContent(),/更新失败|Update failed/,failedMode+' rejects incomplete or mismatched pair');
    const cacheAfter=await page.evaluate(()=>chrome.storage.local.get(['catalogCache','trendsCache']));
    assert.deepEqual(cacheAfter,cacheBefore,failedMode+' leaves previous paired cache untouched');
    await assertRanking(page,'mcp',7,'delta');
  }
  mode='offline';await page.reload();await waitReady(page);await assertRanking(page,'mcp',7,'delta');
  assert.match(await page.locator('#data-status').textContent(),/本地缓存|Cached/);

  stage='bilingual responsive layout';const screenshots=[];
  for(const locale of['zh-CN','en']) {
    if(await page.locator('html').getAttribute('lang')!==locale)await page.locator('#locale-toggle').click();
    for(const theme of['light','dark']) {
      for(let turn=0;await page.locator('html').getAttribute('data-theme')!==theme&&turn<3;turn++)await page.locator('#theme').click();
      assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
      for(const width of[320,390]) {
        await page.setViewportSize({width,height:850});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.body.scrollWidth<=innerWidth),true,`${width}/${locale}/${theme} page fits`);
        const layout=await page.evaluate(()=>({resultsHeight:document.getElementById('results-scroll').clientHeight,
          controls:[...document.querySelectorAll('#trending,#trend-controls button,#trend-controls select,#sources button:not([hidden])')].filter(node=>node.getClientRects().length).map(node=>node.getBoundingClientRect().toJSON())}));
        assert.ok(layout.resultsHeight>=120,`results usable at ${width}/${locale}/${theme}`);
        assert.ok(layout.controls.every(rect=>rect.left>=-0.5&&rect.right<=width+0.5),`trend controls fit at ${width}/${locale}/${theme}`);
        const file=`trends-${width}-${locale}-${theme}.png`;await page.screenshot({path:path.join(artifacts,file)});screenshots.push(file);
      }
    }
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'passed',runtime:'real unpacked MV3',extensionId:id,rankingChecks,
    checks:['offline bundled pair','five sources daily/weekly/monthly rate and stars gained match website','metric values','top20 cap','search','favorites','state restoration','paired remote cache refresh','partial and mismatched refresh rollback','offline cache restore','320/390px bilingual light/dark layouts'],screenshots,productionNetwork:'blocked',userProfile:'not accessed'}));
 }catch(error){
  if(page&&!page.isClosed())error.message+='\nUI: '+JSON.stringify(await page.evaluate(async()=>({url:location.href,status:document.getElementById('data-status')?.textContent,result:document.getElementById('result-count')?.textContent,view:(await chrome.storage.session.get('viewState')).viewState})).catch(()=>({unavailable:true})));
  throw error;
 }finally{await context.close();}
})().catch(error=>{console.error(JSON.stringify({status:'failed',stage,error:error.name,message:error.message,location:error.stack?.split('\n').find(line=>line.includes(__filename))}));process.exitCode=1;})
.finally(()=>{try{fs.rmSync(profile,{recursive:true,force:true});}catch{/* Chrome may briefly retain a file. */}});
