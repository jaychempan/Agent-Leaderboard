/* Validate the product page and its connection to the live extension package. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=process.env.SITE_BASE_URL||'http://127.0.0.1:8765/';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:850},colorScheme:'light'});
  context.setDefaultTimeout(process.env.SITE_BASE_URL ? 30000 : 10000);
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Page error:',e.message);});
  await page.addInitScript(()=>{navigator.clipboard.writeText=async text=>{window.copiedText=text;};});
  await page.goto(new URL('extension/',base).href);
  await page.locator('#prompt-text').filter({hasText:'Please help me'}).waitFor({state:'attached'});
  assert.equal(await page.title(),'Chrome extension · Agent Leaderboard');
  assert.equal(await page.locator('.related-tools a').count(),2);
  assert.equal(await page.locator('.related-tools a').first().getAttribute('aria-label'),'CCF DDL Tracker');
  const manifest=await (await context.request.get(new URL('chrome/manifest.json',base).href)).json();
  await page.waitForFunction(version=>[...document.querySelectorAll('.version')].every(n=>n.textContent===`v${version}`),manifest.version);
  for(const locale of ['en','zh']){
   if(locale==='zh')await page.locator('#language').click();
   for(const theme of ['light','dark']){
    if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('#theme').click();
    for(const width of [320,390,768,1024,1440]){
     await page.setViewportSize({width,height:850});
     await page.waitForFunction(()=>[...document.images].every(image=>image.complete && image.naturalWidth>0));
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow: ${locale} ${theme} ${width}`);
     assert.ok(await page.locator('#preview-image').evaluate(image=>image.naturalWidth>=image.clientWidth*3),'high-density preview');
     assert.equal(await page.locator('#preview-full').getAttribute('href'),await page.locator('#preview-image').evaluate(image=>image.src));
   assert.equal(await page.locator('.related-tools-bar').count(),0);
   assert.ok(await page.locator('.related-tools a').evaluateAll(nodes=>nodes.every(node=>{const r=node.getBoundingClientRect();return r.width>0 && r.left>=0 && r.right<=innerWidth;})),'visible related tools');
     assert.equal(await page.locator('.site-header').evaluate(node=>node.getBoundingClientRect().height<=74),true,'single-row showcase header');
     const links=await page.locator('.site-header a,.site-header button').evaluateAll(nodes=>nodes.map(n=>({left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right})));
     assert.ok(links.every(r=>r.left>=0 && r.right<=width),`header fits: ${locale} ${width}`);
     if(!process.env.SITE_BASE_URL && [390,1440].includes(width)){
      fs.mkdirSync('artifacts/extension',{recursive:true});
      await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';scrollTo(0,0);});
      await page.screenshot({path:`artifacts/extension/showcase-${locale}-${theme}-${width}.png`});
      if(width===1440){await page.locator('#install').scrollIntoViewIfNeeded();await page.screenshot({path:`artifacts/extension/showcase-install-${locale}-${theme}.png`});}
     }
    }
   }
   await page.locator('#copy-prompt').click();
   const copied=await page.evaluate(()=>window.copiedText);
   assert.ok(copied.includes('https://github.com/microsoft/playwright-mcp#readme'));
   assert.ok(copied.startsWith(locale==='zh'?'请帮我':'Please help me'));
   await page.locator('#copy-address').click();
   assert.equal(await page.evaluate(()=>window.copiedText),'chrome://extensions');
   await page.locator('.faq-list summary').first().click();
   assert.equal(await page.locator('.faq-list details').first().getAttribute('open'),'');
   await page.locator('.faq-list summary').first().click();
  }
  await page.reload();
  await page.waitForFunction(()=>document.documentElement.lang==='zh-CN');
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  const zip=await context.request.get(new URL(await page.locator('.download').getAttribute('href'),page.url()).href);
  assert.equal(zip.status(),200,'download URL works');
  const zipBytes=await zip.body();assert.equal(zipBytes.subarray(0,4).toString('hex'),'504b0304');assert.ok(zipBytes.length>1000000);
  // All local navigation and source/image links resolve, including a project-path deployment.
  const localLinks=await page.locator('a[href]').evaluateAll(nodes=>[...new Set(nodes.map(n=>n.href).filter(h=>new URL(h).origin===location.origin&&!new URL(h).hash))]);
  for(const url of localLinks){const response=await context.request.get(url);assert.equal(response.status(),200,url);}
  await page.goto(base);
  await page.locator('.nav-extension').waitFor();
  await page.locator('#pageLoader').waitFor({state:'detached'});
  assert.equal(await page.locator('.nav-extension').textContent(),'Chrome 插件');
  for(const width of [320,390,768,1024,1100,1200,1280,1440,1920]){
   await page.setViewportSize({width,height:900});
   assert.equal(await page.locator('.navbar').evaluate(node=>node.scrollWidth<=innerWidth),true,`homepage navigation overflow ${width}`);
   assert.equal(await page.locator('.navbar').evaluate(node=>node.getBoundingClientRect().height),54,'single-row homepage header');
   assert.ok(await page.locator('.related-tools a').evaluateAll(nodes=>nodes.length===2&&nodes.every(node=>{const r=node.getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth;})),'homepage related tools visible');
  }
  if(!process.env.SITE_BASE_URL){await page.setViewportSize({width:1440,height:850});await page.screenshot({path:'artifacts/extension/home-navigation-one-row.png'});}
  await page.locator('#langBtn').click();
  assert.equal(await page.locator('.nav-extension').textContent(),'Chrome extension');
  for(const width of [320,390,768,1024,1100,1200,1280,1440,1920]){
   await page.setViewportSize({width,height:850});
   assert.equal(await page.locator('.navbar').evaluate(node=>node.scrollWidth<=innerWidth),true,`English homepage navigation overflow ${width}`);
  }
  await page.locator('#langBtn').click();
  await page.setViewportSize({width:390,height:850});
  await page.locator('.nav-hamburger').click();
  await page.locator('.nav-extension').click();
  await page.waitForURL('**/extension/');
  assert.equal(await page.locator('html').getAttribute('lang'),'zh-CN');
  await page.locator('#mobile-menu').click();
  assert.equal(await page.locator('#mobile-menu').getAttribute('aria-expanded'),'true');
  assert.equal(await page.locator('#page-navigation').isVisible(),true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#mobile-menu').getAttribute('aria-expanded'),'false');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'passed',base,version:manifest.version,downloadBytes:zipBytes.length,checks:['bilingual content','theme and preference persistence','real preview images','320–1440px responsive layouts','install prompt and address copy','FAQ','download ZIP','local links','homepage entry']}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
