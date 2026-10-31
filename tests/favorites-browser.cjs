/* Frontend account-favorites integration. A same-origin HTTP fixture exercises
 * the browser contract; live GitHub OAuth, Worker security and D1 are separate checks. */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || '/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.SITE_BASE_URL || 'http://127.0.0.1:8765/';
const baseURL = new URL(base);
const writeArtifacts = ['localhost','127.0.0.1','[::1]'].includes(baseURL.hostname);
const firstRepos = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/data.json'), 'utf8')).repos.slice(0, 3);
const [first, second, third] = firstRepos;
const alice = {id:'111111',login:'alice',avatar_url:'https://avatars.githubusercontent.com/u/111111'};
const bob = {id:'222222',login:'bob',avatar_url:'https://avatars.githubusercontent.com/u/222222'};
const fixtureCookie = 'favorites_fixture_session';
const publicRepo = (repo,sources=['skills']) => ({...repo,sources});

async function eventually(predicate,message,timeout=10000) {
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline) {if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,60));}
  assert.fail(message);
}
async function state(page) {return page.evaluate(()=>favoritesStore.getSnapshot());}
async function waitState(page,predicate,label) {
  let latest;
  try {await eventually(async()=>predicate(latest=await state(page)),label);}
  catch(error) {error.message+=`\nLast favorites state: ${JSON.stringify(latest)}`;throw error;}
}
async function ready(page) {
  await page.locator('#pageLoader').waitFor({state:'detached'});
  await page.waitForFunction(()=>typeof favoritesStore!=='undefined');
  await waitState(page,s=>s.status!=='initializing','favorites initialization settles');
}
async function openFavorites(page) {
  if(!await page.locator('#favModal').isVisible())await page.locator('#favBtn').click();
  await page.locator('#favoritesAccount').waitFor({state:'visible'});
}
async function closeFavorites(page) {
  if(await page.locator('#favModal').isVisible()) {await page.keyboard.press('Escape');await page.locator('#favModal').waitFor({state:'hidden'});}
}
async function clickGridFavorite(page,id) {
  await closeFavorites(page);
  await page.locator(`#grid .fav-btn[data-id="${id}"]`).click();
}

function backendFixture() {
  const rows = new Map([[alice.id,new Map()],[bob.id,new Map()]]);
  const receipts = new Map();
  const requests=[];
  let loginUser=alice,failWrites=false,disconnected=false;
  const userFor=request=>{
    const cookie=(request.headers().cookie||'').split(';').map(item=>item.trim()).find(item=>item.startsWith(fixtureCookie+'='));
    return cookie?[alice,bob].find(user=>user.id===decodeURIComponent(cookie.slice(fixtureCookie.length+1))):null;
  };
  async function intercept(route,{configured=true}={}) {
    const request=route.request(),url=new URL(request.url()),method=request.method();
    requests.push({method,path:url.pathname,url:url.href,body:request.postData(),headers:request.headers()});
    if(disconnected)return route.abort('internetdisconnected');
    const respond=(status,json,headers={})=>route.fulfill({status,headers,...(json===undefined?{}:{json})});
    if(url.pathname==='/api/health')return respond(200,{ok:true,authConfigured:configured});
    if(url.pathname==='/api/auth/github') {
      assert.equal(method,'GET');
      const returnTo=url.searchParams.get('return_to')||'/';
      assert.ok(returnTo.startsWith('/')&&!returnTo.startsWith('//'),'login return is a same-origin path');
      const target=new URL(returnTo,baseURL.origin);
      assert.equal(target.origin,baseURL.origin);
      return respond(302,undefined,{location:target.href,'set-cookie':`${fixtureCookie}=${loginUser.id}; HttpOnly; Path=/; SameSite=Lax`});
    }
    const user=userFor(request);
    if(url.pathname==='/api/bootstrap') {
      const after=Number(url.searchParams.get('after')||0);
      if(after&&(!user||request.headers()['x-favorites-user']!==user.id))return respond(409,{error:'account_changed'});
      const values=configured&&user?[...rows.get(user.id).values()].sort((a,b)=>a.repo_id-b.repo_id).filter(row=>row.repo_id>after):[];
      const favorites=values.slice(0,500);
      return respond(200,{authConfigured:configured,user:configured?user:null,favorites,
        nextCursor:values.length>500?favorites[favorites.length-1].repo_id:null});
    }
    if(method==='POST'||method==='PUT'||method==='DELETE') {
      assert.equal(request.headers().origin,baseURL.origin,'writes carry the browser same-origin header');
      if(!user)return respond(401,{error:'auth_required'});
      const requestedUser=request.headers()['x-favorites-user'];
      if(requestedUser&&requestedUser!==user.id)return respond(409,{error:'account_changed'});
      if(failWrites)return respond(503,{error:'temporarily_unavailable'});
    }
    if(url.pathname==='/api/auth/logout')return respond(200,{ok:true},{'set-cookie':`${fixtureCookie}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`});
    if(url.pathname==='/api/favorites/import') {
      const body=request.postDataJSON(),favorites=body.favorites;
      assert.ok(Array.isArray(favorites)&&favorites.length<=100,'imports use bounded batches');
      assert.equal(typeof body.migration_id,'string');assert.ok(body.migration_id.length>=16);
      assert.ok(Number.isInteger(body.batch_id)&&body.batch_id>=0);
      const receipt=`${user.id}:${body.migration_id}:${body.batch_id}`;
      if(!receipts.has(receipt)) {
        for(const row of favorites)if(!rows.get(user.id).has(Number(row.repo_id)))rows.get(user.id).set(Number(row.repo_id),{repo_id:Number(row.repo_id),repository:row.repository});
        receipts.set(receipt,true);
      }
      return respond(200,{ok:true});
    }
    const match=url.pathname.match(/^\/api\/favorites\/([1-9]\d*)$/);
    if(!match)return respond(404,{error:'not_found'});
    const id=Number(match[1]);
    if(method==='PUT') {const body=request.postDataJSON();rows.get(user.id).set(id,{repo_id:id,repository:body.repository});return respond(200,{ok:true});}
    if(method==='DELETE') {rows.get(user.id).delete(id);return respond(200,{ok:true});}
    return respond(405,{error:'method_not_allowed'});
  }
  return {rows,receipts,requests,intercept,setLoginUser:user=>{loginUser=user;},setFailWrites:value=>{failWrites=value;},setDisconnected:value=>{disconnected=value;}};
}

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const contexts=[],errors=[],backend=backendFixture();
 async function device({cloud=true,user=null,legacy=[],language='en',broken=false}={}) {
  const context=await browser.newContext({viewport:{width:1366,height:900},colorScheme:'light',reducedMotion:'reduce'});
  context.setDefaultTimeout(10000);contexts.push(context);
  await context.route('**/src/auth-config.js*',route=>route.fulfill({contentType:'application/javascript',body:'window.FAVORITES_CONFIG={apiBase:"/api"};'}));
  await context.route(`${baseURL.origin}/api/**`,route=>backend.intercept(route,{configured:cloud}));
  await context.route('https://busuanzi.9420.ltd/api',route=>route.fulfill({json:{success:true,data:{page_pv:1,site_pv:1,site_uv:1}}}));
  await context.addInitScript(({legacy,language,broken})=>{
   if(sessionStorage.getItem('favorites_fixture_seeded'))return;
   localStorage.setItem('st_lang',language);localStorage.setItem('st_theme','light');
   localStorage.setItem('st_favorites',broken?'{invalid json':JSON.stringify(legacy));
   sessionStorage.setItem('favorites_fixture_seeded','1');
  },{legacy,language,broken});
  if(user)await context.addCookies([{name:fixtureCookie,value:user.id,url:baseURL.origin,httpOnly:true,sameSite:'Lax'}]);
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await ready(page);return {context,page};
 }
 try {
  const local=await device({cloud:false,legacy:[first.id]});
  await openFavorites(local.page);
  assert.deepEqual((await state(local.page)).ids,[first.id]);
  assert.equal(await local.page.locator('#githubSignIn').count(),0,'disabled backend does not advertise working sign-in');
  assert.equal(await local.page.locator('script[src*="supabase"]').count(),0,'the page has no Supabase SDK dependency');
  await clickGridFavorite(local.page,second.id);await local.page.reload();await ready(local.page);
  assert.deepEqual(new Set((await state(local.page)).ids),new Set([first.id,second.id]),'anonymous local favorites survive reload');
  const bad=await device({cloud:false,broken:true});
  assert.deepEqual((await state(bad.page)).ids,[],'corrupt legacy JSON does not stop the page');
  assert.equal(backend.requests.some(request=>request.path.startsWith('/api/auth/')),false);

  const existingCloudId=987654320;
  backend.rows.get(alice.id).set(existingCloudId,{repo_id:existingCloudId,repository:{id:existingCloudId,full_name:'cloud/existing-tool',url:'https://github.com/cloud/existing-tool',description:'Saved before this browser signed in',sources:['mcp'],stars:2}});
  const a=await device({legacy:[first.id]});await openFavorites(a.page);
  assert.equal(await a.page.locator('#githubSignIn').isEnabled(),true);
  await a.page.locator('#githubSignIn').click();await ready(a.page);
  await waitState(a.page,s=>s.user?.id===alice.id&&s.status==='synced'&&s.ids.includes(first.id),'first login imports existing local favorites');
  assert.equal(backend.rows.get(alice.id).has(first.id),true);
  assert.equal((await state(a.page)).ids.includes(existingCloudId),true,'first import preserves existing cloud favorites');
  assert.equal(await a.page.evaluate(cookie=>document.cookie.includes(cookie),fixtureCookie),false,'the fixture session is HttpOnly');
  assert.equal(await a.page.evaluate(()=>Object.keys(localStorage).some(key=>/supabase|auth.token|access.token|refresh.token/i.test(key))),false,'account client does not persist provider tokens');
  const authRequest=backend.requests.find(request=>request.path==='/api/auth/github');
  assert.ok(authRequest,'sign-in uses the same-origin Worker route');
  assert.equal(new URL(authRequest.url).origin,baseURL.origin);
  await clickGridFavorite(a.page,second.id);await waitState(a.page,s=>s.status==='synced'&&s.ids.includes(second.id),'online addition saves');
  assert.equal(backend.rows.get(alice.id).has(second.id),true);

  backend.setFailWrites(true);
  await clickGridFavorite(a.page,third.id);await waitState(a.page,s=>s.error==='save_failed'&&!s.ids.includes(third.id),'failed addition rolls back');
  assert.equal(backend.rows.get(alice.id).has(third.id),false);
  await a.page.locator('#favoritesNotice').waitFor({state:'visible'});
  assert.equal(await a.page.locator('#favoritesNotice').getAttribute('role'),'status');
  assert.match(await a.page.locator('#favoritesNotice').innerText(),/not saved|previous state/i,'failed grid save is visibly explained');
  assert.equal(await a.page.locator(`#grid .fav-btn[data-id="${third.id}"]`).evaluate(button=>button.classList.contains('saved')),false,'failed grid save restores the button');
  await openFavorites(a.page);
  await a.page.locator(`.fav-modal-section:not(.hidden) .fav-btn[data-id="${first.id}"]`).click();
  await waitState(a.page,s=>s.error==='save_failed'&&s.ids.includes(first.id),'failed modal removal rolls back');
  assert.equal(backend.rows.get(alice.id).has(first.id),true);
  assert.match(await a.page.locator('#favoritesSyncStatus').innerText(),/not saved|previous state/i,'modal save failure is visibly explained');
  backend.setFailWrites(false);
  await clickGridFavorite(a.page,third.id);await waitState(a.page,s=>s.status==='synced'&&s.ids.includes(third.id),'retry can save an addition');
  await clickGridFavorite(a.page,first.id);await waitState(a.page,s=>s.status==='synced'&&!s.ids.includes(first.id),'retry can remove a favorite');
  assert.equal(backend.rows.get(alice.id).has(first.id),false,'removal deletes the fixture row');

  backend.setDisconnected(true);
  await clickGridFavorite(a.page,second.id);await waitState(a.page,s=>s.error&&s.ids.includes(second.id),'offline removal does not pretend to save');
  assert.equal((await state(a.page)).pendingCount,0,'offline mutations are not queued');
  backend.setDisconnected(false);await a.page.evaluate(()=>favoritesStore.sync());
  await waitState(a.page,s=>s.status==='synced','explicit refresh recovers after offline failure');
  assert.equal(backend.rows.get(alice.id).has(second.id),true,'offline failure left server favorite intact');

  const outsideId=987654321;
  backend.rows.get(alice.id).set(outsideId,{repo_id:outsideId,repository:{id:outsideId,full_name:'cloud/archived-tool',url:'https://github.com/cloud/archived-tool',description:'<img src=x onerror="window.favoriteXSS=1">',sources:['skills'],stars:1}});
  const b=await device({user:alice});
  await waitState(b.page,s=>s.status==='synced'&&s.ids.includes(second.id)&&s.ids.includes(third.id)&&s.ids.includes(outsideId),'another browser restores saved favorites');
  assert.equal((await state(b.page)).ids.includes(first.id),false,'a removed favorite does not return');
  await openFavorites(b.page);const outside=b.page.locator(`.saved-favorite[data-id="${outsideId}"]`);
  assert.equal(await outside.count(),1,'out-of-catalog favorite remains visible');
  assert.equal(await outside.locator('img').count(),0);assert.equal(await b.page.evaluate(()=>window.favoriteXSS),undefined);
  assert.equal(await outside.locator('a').first().getAttribute('href'),'https://github.com/cloud/archived-tool');
  for(const language of ['en','zh']) {
   await closeFavorites(b.page);if(await b.page.evaluate(()=>app.lang)!==language)await b.page.locator('#langBtn').click();
   for(const theme of ['light','dark']) {
    if(await b.page.locator('html').getAttribute('data-theme')!==theme)await b.page.locator('#themeBtn').click();
    for(const width of [320,390,1366]) {
     await b.page.setViewportSize({width,height:850});await openFavorites(b.page);
     const layout=await b.page.locator('#favModal').evaluate(node=>({width:innerWidth,scroll:node.scrollWidth,dialog:node.querySelector('.fav-modal').getBoundingClientRect().toJSON(),controls:[...node.querySelectorAll('#favoritesAccount button')].map(button=>button.getBoundingClientRect().toJSON())}));
     assert.ok(layout.scroll<=layout.width+1,`favorites fit ${language}/${theme}/${width}`);
     assert.ok(layout.dialog.left>=0&&layout.dialog.right<=width+1);assert.ok(layout.controls.every(rect=>rect.left>=0&&rect.right<=width+1));
     for(let i=0;i<8;i++){await b.page.keyboard.press('Tab');assert.equal(await b.page.evaluate(()=>document.querySelector('#favModal').contains(document.activeElement)),true);}
     if(width===390&&writeArtifacts){fs.mkdirSync('artifacts/favorites',{recursive:true});await b.page.locator('#favModal').evaluate(node=>{node.scrollTop=0;});await b.page.screenshot({path:`artifacts/favorites/account-${language}-${theme}.png`});}
     await closeFavorites(b.page);assert.equal(await b.page.locator('#favBtn').evaluate(node=>node===document.activeElement),true);
    }
   }
  }
  await openFavorites(b.page);await b.page.locator('#githubSignOut').click();await waitState(b.page,s=>!s.user,'sign-out returns to anonymous mode');
  assert.deepEqual((await state(b.page)).ids,[],'account favorites are not exposed as anonymous data');
  assert.equal(backend.rows.get(alice.id).has(second.id),true,'sign-out retains cloud favorites');
  assert.equal(await b.page.locator('#githubSignIn').isVisible(),true);
  backend.setLoginUser(bob);await b.page.locator('#githubSignIn').click();await ready(b.page);
  await waitState(b.page,s=>s.user?.id===bob.id&&s.status==='synced','another account can sign in');
  assert.deepEqual((await state(b.page)).ids,[],'new account does not inherit the previous account favorites');
  assert.equal(backend.rows.get(bob.id).size,0,'account switching does not import another account cache');
  const pageRows=backend.rows.get(bob.id);
  for(let i=0;i<503;i++){const id=700000000+i;pageRows.set(id,{repo_id:id,repository:{id,full_name:`paged/tool-${i}`,sources:['skills']}});}
  await b.page.evaluate(()=>favoritesStore.sync());
  await waitState(b.page,s=>s.status==='synced'&&s.ids.length===503,'browser restores every cursor page');
  const laterPage=backend.requests.find(request=>request.path==='/api/bootstrap'&&new URL(request.url).searchParams.has('after'));
  assert.ok(laterPage,'large lists request the next bootstrap page');
  assert.equal(laterPage.headers['x-favorites-user'],bob.id,'subsequent page remains bound to the first-page account');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'passed',base,auth:'same-origin HTTP fixture; production GitHub OAuth, Worker security and D1 require separate verification',checks:['local migration and corrupt storage','same-origin sign-in and HttpOnly fixture session','first import','online add/remove, visible failure and rollback','offline rollback without queue','second-browser and paginated restoration','out-of-catalog favorites and escaped content','account isolation and logout retention','bilingual light/dark 320–1366px layout and keyboard focus']}));
 }finally{await Promise.all(contexts.map(context=>context.close()));await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
