/* Capture the actual extension, with a local catalog fixture, for the website. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const context=await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(),'agent-showcase-')),{
  executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,deviceScaleFactor:3,viewport:{width:390,height:660},ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});
 try {
  const cdp=await context.browser().newBrowserCDPSession();
  const {id}=await cdp.send('Extensions.loadUnpacked',{path:path.join(root,'chrome')});
  await context.route('https://agentskills.media/data/discovery_index.json',route=>route.fulfill({contentType:'application/json',body:fs.readFileSync(path.join(root,'data/discovery_index.json'),'utf8')}));
  const page=await context.newPage();
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForFunction(()=>document.getElementById('data-status').textContent.startsWith('已更新'));
  await page.locator('#query').fill('browser');
  for(const locale of ['zh','en']){
   await page.evaluate(locale=>chrome.storage.local.set({uiLocale:locale==='zh'?'zh-CN':'en'}),locale);
   await page.waitForFunction(locale=>document.documentElement.lang===(locale==='zh'?'zh-CN':'en'),locale);
   for(const theme of ['light','dark']){
    await page.evaluate(theme=>chrome.storage.local.set({themeMode:theme}),theme);
    await page.waitForFunction(theme=>document.documentElement.dataset.theme===theme,theme);
    await page.locator('#query').evaluate(node=>node.blur());
    await page.screenshot({path:path.join(root,`extension/assets/panel-${locale}-${theme}.png`)});
   }
  }
  console.log('Captured four real extension screenshots for the website.');
 }finally{await context.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
