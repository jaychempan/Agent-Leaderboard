/* Validate the product page and its connection to the live extension package. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=process.env.SITE_BASE_URL||'http://127.0.0.1:8765/';
const widths=[320,390,420,421,480,599,600,601,760,761,768,1024,1025,1100,1200,1201,1280,1360,1361,1366,1440,1450,1451,1536,1600,1601,1920];
async function assertHeaderFits(page,selector,label){
 const layout=await page.locator(selector).evaluate(header=>{
  const controls=[...header.querySelectorAll('a,button,summary')].map(node=>{
   const rect=node.getBoundingClientRect(),style=getComputedStyle(node);
   return {label:node.getAttribute('aria-label')||node.textContent.trim(),left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,width:rect.width,height:rect.height,visible:style.visibility!=='hidden'&&style.display!=='none'};
  }).filter(rect=>rect.visible&&rect.width>0&&rect.height>0);
  const overlaps=[];
  for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){
   const a=controls[i],b=controls[j];
   if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)overlaps.push([a.label,b.label]);
  }
  return {width:innerWidth,scrollWidth:header.scrollWidth,controls,overlaps};
 });
 assert.ok(layout.scrollWidth<=layout.width,`${label}: header scroll width ${layout.scrollWidth}`);
 assert.ok(layout.controls.every(rect=>rect.left>=-0.5&&rect.right<=layout.width+0.5),`${label}: controls fit ${JSON.stringify(layout.controls)}`);
 assert.deepEqual(layout.overlaps,[],`${label}: controls do not overlap`);
}
async function checkRelatedMenu(page,header,label){
 const details=page.locator(`${header} details.related-tools`),summary=details.locator('summary');
 assert.equal(await details.evaluate(node=>node.open),false,`${label}: recommendations start collapsed`);
 assert.equal(await details.locator('a').first().isVisible(),false,`${label}: hidden recommendations`);
 await assertHeaderFits(page,header,`${label} collapsed`);
 await summary.click();
 assert.equal(await details.evaluate(node=>node.open),true,`${label}: recommendations open`);
 assert.deepEqual(await details.locator('a').allInnerTexts(),['CCF DDL Tracker','Citation Tracker'],`${label}: full recommendation names`);
 for(const link of await details.locator('a').all())assert.equal(await link.isVisible(),true);
 await assertHeaderFits(page,header,`${label} expanded`);
 await page.keyboard.press('Escape');
 assert.equal(await details.evaluate(node=>node.open),false,`${label}: Escape closes recommendations`);
 assert.equal(await summary.evaluate(node=>document.activeElement===node),true,`${label}: Escape restores focus`);
 await page.keyboard.press('Tab');
 assert.equal(await details.evaluate(node=>[...node.querySelectorAll('a')].includes(document.activeElement)),false,`${label}: closed links are skipped by Tab`);
}
async function checkMenuInteractions(page,header,buttonSelector,navSelector){
 const details=page.locator(`${header} details.related-tools`),summary=details.locator('summary');
 const button=page.locator(buttonSelector),navigation=page.locator(navSelector);
 await summary.focus();await page.keyboard.press('Space');
 assert.equal(await details.evaluate(node=>node.open),true,'keyboard opens recommendations');
 await page.mouse.click(4,300);
 assert.equal(await details.evaluate(node=>node.open),false,'outside click closes recommendations');
 await button.click();
 assert.equal(await button.getAttribute('aria-expanded'),'true');
 assert.equal(await navigation.isVisible(),true);
 await assertHeaderFits(page,header,'expanded mobile navigation');
 await summary.click();
 assert.equal(await details.evaluate(node=>node.open),true);
 assert.equal(await button.getAttribute('aria-expanded'),'false','recommendations close mobile navigation');
 assert.equal(await navigation.isVisible(),false);
 await button.click();
 assert.equal(await details.evaluate(node=>node.open),false,'mobile navigation closes recommendations');
 assert.equal(await button.getAttribute('aria-expanded'),'true');
 await page.keyboard.press('Escape');
 assert.equal(await button.getAttribute('aria-expanded'),'false');
 await summary.click();
 await details.locator('a').first().evaluate(node=>node.addEventListener('click',event=>event.preventDefault(),{once:true}));
 await details.locator('a').first().click();
 assert.equal(await details.evaluate(node=>node.open),false,'choosing a recommendation closes it');
}
async function checkMenuResize(page,header,buttonSelector,navSelector,breakpoint){
 const details=page.locator(`${header} details.related-tools`),summary=details.locator('summary');
 const button=page.locator(buttonSelector),navigation=page.locator(navSelector);
 await page.setViewportSize({width:breakpoint,height:850});
 await summary.click();
 assert.equal(await details.evaluate(node=>node.open),true);
 await page.setViewportSize({width:breakpoint+1,height:850});
 await page.waitForFunction(selector=>!document.querySelector(selector).open,`${header} details.related-tools`);
 assert.equal(await button.getAttribute('aria-expanded'),'false',`${header}: resizing recommendations resets navigation state`);
 await summary.click();
 await page.setViewportSize({width:breakpoint,height:850});
 await page.waitForFunction(selector=>!document.querySelector(selector).open,`${header} details.related-tools`);
 assert.equal(await button.getAttribute('aria-expanded'),'false',`${header}: return to mobile keeps navigation closed`);
 assert.equal(await navigation.isVisible(),false);
 await button.click();
 assert.equal(await button.getAttribute('aria-expanded'),'true');
 await page.setViewportSize({width:breakpoint+1,height:850});
 await page.waitForFunction(selector=>document.querySelector(selector).getAttribute('aria-expanded')==='false',buttonSelector);
 assert.equal(await details.evaluate(node=>node.open),false,`${header}: resizing mobile navigation keeps recommendations closed`);
 await page.setViewportSize({width:breakpoint,height:850});
 assert.equal(await navigation.isVisible(),false,`${header}: mobile navigation stays closed after resizing back`);
 assert.equal(await button.getAttribute('aria-expanded'),'false');
}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:850},colorScheme:'light',reducedMotion:'reduce'});
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
    for(const width of widths){
     await page.setViewportSize({width,height:850});
     await page.waitForFunction(()=>[...document.images].every(image=>image.complete && image.naturalWidth>0));
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow: ${locale} ${theme} ${width}`);
     assert.ok(await page.locator('#preview-image').evaluate(image=>image.naturalWidth>=image.clientWidth*3),'high-density preview');
     assert.equal(await page.locator('#preview-full').getAttribute('href'),await page.locator('#preview-image').evaluate(image=>image.src));
     assert.equal(await page.locator('.related-tools-bar').count(),0);
     await checkRelatedMenu(page,'.site-header',`showcase ${locale} ${theme} ${width}`);
     assert.equal(await page.locator('.site-header').evaluate(node=>node.getBoundingClientRect().height<=74),true,'single-row showcase header');
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
   await page.locator('.manual-install summary').click();
   await page.locator('#copy-address').click();
   assert.equal(await page.evaluate(()=>window.copiedText),'chrome://extensions');
   await page.locator('.manual-install summary').click();
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
  assert.equal(await page.locator('.nav-extension').getAttribute('aria-label'),'安装 Chrome 插件');
  assert.equal(await page.locator('.nav-links .nav-extension').count(),0);
  assert.equal(await page.locator('.nav-actions .nav-extension').count(),1);
  for(const locale of ['zh','en']){
   if(locale==='en')await page.locator('#langBtn').click();
   // A long saved list must not squeeze the primary actions out of the header.
   await page.locator('#favBtn .fav-count').evaluate(node=>{node.textContent='999';node.classList.add('visible');});
   for(const width of widths){
    await page.setViewportSize({width,height:900});
    await checkRelatedMenu(page,'.navbar',`homepage ${locale} ${width}`);
    assert.equal(await page.locator('.nav-extension').isVisible(),true,'install action always visible');
    assert.equal(await page.locator('.navbar').evaluate(node=>node.getBoundingClientRect().height),54,'single-row homepage header');
    assert.equal(await page.locator('.nav-hamburger').isVisible(),width<=1200,`responsive main menu ${width}`);
    assert.equal(await page.locator('.nav-hamburger').getAttribute('aria-controls'),'nav-links');
    assert.equal(await page.locator('.nav-hamburger').getAttribute('aria-expanded'),'false');
   }
   await page.setViewportSize({width:390,height:850});
   await checkMenuInteractions(page,'.navbar','.nav-hamburger','#nav-links');
   await checkMenuResize(page,'.navbar','.nav-hamburger','#nav-links',1200);
   await page.locator('.nav-hamburger').click();
   await page.locator('#nav-links a[href="#mcp"]').click();
   assert.equal(await page.locator('.nav-hamburger').getAttribute('aria-expanded'),'false','category selection closes navigation');
  }
  if(!process.env.SITE_BASE_URL){await page.setViewportSize({width:1440,height:850});await page.screenshot({path:'artifacts/extension/home-navigation-one-row.png'});}
  assert.equal(await page.locator('.nav-extension').getAttribute('aria-label'),'Get extension');
  await page.locator('#langBtn').click();
  await page.setViewportSize({width:390,height:850});
  const storeURL='https://chromewebstore.google.com/detail/agent-leaderboard/medjijlfgmfeldlelkidiickdcnbicaf';
  assert.equal(await page.locator('.nav-extension').getAttribute('href'),storeURL);
  assert.equal(await page.locator('.nav-extension').getAttribute('target'),'_blank');
  await page.locator('#siteAnnouncement a').click();
  await page.waitForURL('**/extension/');
  assert.equal(await page.locator('html').getAttribute('lang'),'zh-CN');
  for(const locale of ['zh','en']){
   if(locale==='en')await page.locator('#language').click();
   for(const selector of ['.hero-actions .primary','.store-install']){
    assert.equal(await page.locator(selector).getAttribute('href'),storeURL);
    assert.equal(await page.locator(selector).getAttribute('target'),'_blank');
    assert.equal(await page.locator(selector).innerText(),locale==='zh'?'添加至 Chrome':'Add to Chrome');
   }
   assert.equal(await page.locator('.store-steps li').count(),3);
   assert.equal(await page.locator('body').innerText().then(text=>/not yet listed|尚未上架/.test(text)),false);
  }
  await checkMenuInteractions(page,'.site-header','#mobile-menu','#page-navigation');
  await checkMenuResize(page,'.site-header','#mobile-menu','#page-navigation',760);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'passed',base,version:manifest.version,downloadBytes:zipBytes.length,checks:['bilingual content','theme and preference persistence','real preview images','320–1920px responsive layouts','collapsible recommendations and keyboard controls','non-overlapping navigation with three-digit favorites','install prompt and address copy','FAQ','download ZIP','local links','homepage entry']}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
