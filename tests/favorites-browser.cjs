/* Browser integration for account favorites. The real Supabase SDK talks to a
 * deterministic HTTP fixture; this does not verify a live GitHub OAuth App or RLS. */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || '/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.SITE_BASE_URL || 'http://127.0.0.1:8765/';
const writeArtifacts = ['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname);
const authOrigin = 'https://favorites-test.supabase.co';
const authKey = 'st_supabase_auth_v1';
const firstRepos = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/data.json'), 'utf8')).repos.slice(0, 3);
const [first, second, third] = firstRepos;
const alice = makeUser('11111111-1111-4111-8111-111111111111', 'alice');
const bob = makeUser('22222222-2222-4222-8222-222222222222', 'bob');

function makeUser(id, login) {
  return {id, aud:'authenticated', role:'authenticated', email:`${login}@example.test`,
    app_metadata:{provider:'github', providers:['github']},
    user_metadata:{user_name:login, preferred_username:login, avatar_url:`https://avatars.githubusercontent.com/${login}`},
    identities:[{id:login, identity_id:id, user_id:id, provider:'github', identity_data:{sub:login, user_name:login}}],
    created_at:'2026-10-31T00:00:00Z', updated_at:'2026-10-31T00:00:00Z'};
}
function session(user) {
  const now = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return {access_token:`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:user.id,role:'authenticated',aud:'authenticated',iss:`${authOrigin}/auth/v1`,iat:now,exp:now+3600})}.test-signature`,
    token_type:'bearer', expires_in:3600, expires_at:now+3600,
    refresh_token:`refresh-${user.id}`, user};
}
function publicRepo(repo, sources=['skills']) {
  return {...repo, sources};
}
async function eventually(predicate, message, timeout=10000) {
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline) { if(await predicate())return; await new Promise(resolve=>setTimeout(resolve,60)); }
  assert.fail(message);
}
async function state(page) { return page.evaluate(()=>favoritesStore.getSnapshot()); }
async function waitState(page, predicate, label) {
  let latest;
  try {await eventually(async()=>predicate(latest=await state(page)), label);}
  catch(error) {error.message+=`\nLast favorites state: ${JSON.stringify(latest)}`;throw error;}
}
async function ready(page) {
  await page.locator('#pageLoader').waitFor({state:'detached'});
  await page.waitForFunction(()=>typeof favoritesStore!=='undefined');
}
async function openFavorites(page) {
  if(!await page.locator('#favModal').isVisible())await page.locator('#favBtn').click();
  await page.locator('#favoritesAccount').waitFor({state:'visible'});
}
async function closeFavorites(page) {
  if(await page.locator('#favModal').isVisible()) {
    await page.keyboard.press('Escape');
    await page.locator('#favModal').waitFor({state:'hidden'});
  }
}
async function clickGridFavorite(page, id) {
  await closeFavorites(page);
  await page.locator(`#grid .fav-btn[data-id="${id}"]`).click();
}

function backendFixture() {
  const rows = new Map([[alice.id,new Map()], [bob.id,new Map()]]);
  const requests=[];
  let oauthUser=alice, failWrites=false, disconnected=false;
  const getUser=request=>{
    try { const payload=JSON.parse(Buffer.from((request.headers().authorization||'').replace(/^Bearer\s+/i,'').split('.')[1], 'base64url'));return [alice,bob].find(user=>user.id===payload.sub); }
    catch {return null;}
  };
  const cors={'access-control-allow-origin':'*','access-control-allow-headers':'apikey,authorization,x-client-info,content-type,prefer,range,range-unit','access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS','access-control-expose-headers':'content-range'};
  async function intercept(route) {
    const request=route.request(), url=new URL(request.url());
    requests.push({method:request.method(),url:url.href,body:request.postData()});
    if(disconnected)return route.abort('internetdisconnected');
    const respond=(status,json,headers={})=>route.fulfill({status,headers:{...cors,...headers},...(json===undefined?{}:{json})});
    if(request.method()==='OPTIONS')return respond(204);
    if(url.pathname==='/auth/v1/authorize')return route.fulfill({status:200,headers:cors,contentType:'text/html',body:'<!doctype html><title>Mock authorization</title><p>GitHub authorization fixture</p>'});
    if(url.pathname==='/auth/v1/token') {
      const body=request.postDataJSON()||{};
      if(url.searchParams.get('grant_type')==='pkce') {
        assert.ok(body.code_verifier,'PKCE exchange includes the verifier');
        assert.ok(body.auth_code,'PKCE exchange includes the authorization code');
        assert.equal('client_secret' in body,false,'provider secret stays outside the browser');
      }
      const user=url.searchParams.get('grant_type')==='refresh_token'
        ? [alice,bob].find(item=>body.refresh_token===`refresh-${item.id}`) : oauthUser;
      return user?respond(200,session(user)):respond(400,{error:'invalid_grant'});
    }
    if(url.pathname==='/auth/v1/user')return getUser(request)?respond(200,getUser(request)):respond(401,{message:'Not authenticated'});
    if(url.pathname==='/auth/v1/logout')return respond(204);
    if(url.pathname!=='/rest/v1/favorites')return respond(404,{message:'Unexpected fixture endpoint'});
    const user=getUser(request);
    if(!user)return respond(401,{message:'Not authenticated'});
    const ownRows=rows.get(user.id);
    if(request.method()==='GET') {
      const owner=url.searchParams.get('user_id');
      if(owner&&owner!==`eq.${user.id}`)return respond(200,[]);
      let values=[...ownRows.values()].sort((a,b)=>a.repo_id-b.repo_id);
      const deleted=url.searchParams.get('deleted');
      if(deleted==='eq.false')values=values.filter(row=>!row.deleted);
      const range=request.headers().range;
      const from=Number(url.searchParams.get('offset')||(range?range.split('-')[0]:0));
      const count=Number(url.searchParams.get('limit')||(range?Number(range.split('-')[1])-from+1:500));
      const page=values.slice(from,from+count);
      return respond(200,page,{'content-range':`${from}-${Math.max(from,from+page.length-1)}/${values.length}`});
    }
    if(request.method()==='POST') {
      if(failWrites)return respond(503,{message:'Temporary unavailable'});
      const payload=request.postDataJSON(), updates=Array.isArray(payload)?payload:[payload];
      assert.ok(updates.length<=100,'writes use bounded batches');
      if(updates.some(row=>row.user_id!==user.id))return respond(403,{message:'Fixture owner policy'});
      for(const row of updates)ownRows.set(Number(row.repo_id),{...row,repo_id:Number(row.repo_id),updated_at:new Date().toISOString()});
      return respond(201,[]);
    }
    return respond(405,{message:'Unexpected fixture operation'});
  }
  return {rows,requests,intercept,setOAuthUser:user=>{oauthUser=user;},setFailWrites:value=>{failWrites=value;},setDisconnected:value=>{disconnected=value;}};
}

(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const errors=[];
  const backend=backendFixture();
  const contexts=[];
  async function device({cloud=true,user=null,legacy=[],language='en',broken=false}={}) {
    const context=await browser.newContext({viewport:{width:1366,height:900},colorScheme:'light',reducedMotion:'reduce'});
    context.setDefaultTimeout(10000);contexts.push(context);
    await context.route('**/src/auth-config.js*',route=>route.fulfill({contentType:'application/javascript',body:`window.FAVORITES_CONFIG=${JSON.stringify(cloud?{url:authOrigin,publishableKey:'sb_publishable_test'}:{url:'',publishableKey:''})};`}));
    await context.route(`${authOrigin}/**`,backend.intercept);
    await context.route('https://busuanzi.9420.ltd/api',route=>route.fulfill({json:{success:true,data:{page_pv:1,site_pv:1,site_uv:1}}}));
    await context.addInitScript(({legacy,language,broken,userSession,authKey})=>{
      if(sessionStorage.getItem('favorites_fixture_seeded'))return;
      localStorage.setItem('st_lang',language);localStorage.setItem('st_theme','light');
      localStorage.setItem('st_favorites',broken?'{invalid json':JSON.stringify(legacy));
      if(userSession)localStorage.setItem(authKey,JSON.stringify(userSession));
      sessionStorage.setItem('favorites_fixture_seeded','1');
    },{legacy,language,broken,userSession:user?session(user):null,authKey});
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base);await ready(page);
    return {context,page};
  }
  try {
    // Anonymous users retain local favorites and are not advertised a working login without configuration.
    const local=await device({cloud:false,legacy:[first.id]});
    await openFavorites(local.page);
    assert.deepEqual((await state(local.page)).ids,[first.id]);
    assert.equal(await local.page.locator('#githubSignIn').count(),0);
    assert.equal(await local.page.locator(`.fav-modal-section:not(.hidden) .saved-favorite[data-id="${first.id}"]`).count(),1);
    await clickGridFavorite(local.page,second.id);
    await local.page.reload();await ready(local.page);
    assert.deepEqual(new Set((await state(local.page)).ids),new Set([first.id,second.id]),'local saves survive reload');
    const bad=await device({cloud:false,broken:true});
    assert.deepEqual((await state(bad.page)).ids,[],'corrupted legacy storage does not stop the page');
    assert.equal(backend.requests.length,0,'unconfigured anonymous visitors make no auth or favorites requests');

    // Exercise the actual SDK PKCE path against a HTTP fixture, rather than stubbing SDK methods.
    const a=await device({legacy:[first.id]});
    await openFavorites(a.page);
    await a.page.locator('#githubSignIn').click();
    await a.page.waitForURL(`${authOrigin}/auth/v1/authorize**`);
    const authorization=new URL(a.page.url());
    assert.equal(authorization.searchParams.get('provider'),'github');
    assert.equal(authorization.searchParams.get('code_challenge_method')?.toLowerCase(),'s256');
    assert.ok(authorization.searchParams.get('code_challenge'));
    assert.equal(/(?:^|[ ,])(?:repo|public_repo|gist)(?:$|[ ,])/.test(authorization.searchParams.get('scopes')||''),false);
    assert.equal(new URL(authorization.searchParams.get('redirect_to')).origin,new URL(base).origin);
    await a.page.goto(new URL('?code=favorites-test-code#skills',base).href);await ready(a.page);
    await waitState(a.page,s=>s.user?.id===alice.id&&s.status==='synced','GitHub session restores and first sync completes');
    assert.equal(new URL(a.page.url()).searchParams.has('code'),false,'authorization code is removed after exchange');
    assert.ok(backend.rows.get(alice.id).has(first.id),'first sign-in uploads existing anonymous favorites');
    await openFavorites(a.page);
    assert.match(await a.page.locator('#favoritesAccount').innerText(),/alice/);

    // A failed write keeps the local add/remove pair until an explicit retry succeeds.
    backend.setFailWrites(true);
    await clickGridFavorite(a.page,second.id);
    await clickGridFavorite(a.page,first.id);
    await waitState(a.page,s=>s.pendingCount>0&&['error','offline'].includes(s.status),'failed writes remain pending');
    assert.deepEqual(new Set((await state(a.page)).ids),new Set([second.id]));
    assert.equal(backend.rows.get(alice.id).get(first.id).deleted,false,'cloud is unchanged during failure');
    backend.setFailWrites(false);
    await openFavorites(a.page);await a.page.locator('#favoritesSync').click();
    await waitState(a.page,s=>s.status==='synced'&&s.pendingCount===0,'retry drains pending operations');
    assert.equal(backend.rows.get(alice.id).get(first.id).deleted,true,'offline removal has a cloud tombstone');
    assert.equal(backend.rows.get(alice.id).get(second.id).deleted,false);

    backend.setDisconnected(true);
    await a.context.setOffline(true);
    await clickGridFavorite(a.page,third.id);
    await waitState(a.page,s=>s.status==='offline'&&s.ids.includes(third.id)&&s.pendingCount>0,'browser offline save remains available locally');
    assert.equal(backend.rows.get(alice.id).has(third.id),false);
    backend.setDisconnected(false);
    await a.context.setOffline(false);
    await waitState(a.page,s=>s.status==='synced'&&s.pendingCount===0,'returning online automatically saves pending favorites');
    assert.equal(backend.rows.get(alice.id).get(third.id).deleted,false);

    // A separate browser starts from the account data, including previously removed entries.
    const outsideId=2147000000;
    backend.rows.get(alice.id).set(outsideId,{user_id:alice.id,repo_id:outsideId,deleted:false,updated_at:new Date().toISOString(),repository:{id:outsideId,full_name:'cloud/archived-tool',url:'https://github.com/cloud/archived-tool',description:'<img src=x onerror="window.favoriteXSS=1">',sources:['skills'],stars:1}});
    const b=await device({user:alice});
    await waitState(b.page,s=>s.status==='synced'&&s.ids.includes(second.id)&&s.ids.includes(third.id)&&s.ids.includes(outsideId),'second device restores cloud favorites');
    assert.equal((await state(b.page)).ids.includes(first.id),false,'deleted favorite does not return on another device');
    await openFavorites(b.page);
    const outside=b.page.locator(`.saved-favorite[data-id="${outsideId}"]`);
    assert.equal(await outside.count(),1,'a repository absent from current boards is still visible');
    assert.equal(await outside.locator('img').count(),0,'stored descriptions remain text');
    assert.equal(await b.page.evaluate(()=>window.favoriteXSS),undefined);
    assert.equal(await outside.locator('a').first().getAttribute('href'),'https://github.com/cloud/archived-tool');

    for(const language of ['en','zh']) {
      await closeFavorites(b.page);
      const current=await b.page.evaluate(()=>app.lang);
      if(current!==language)await b.page.locator('#langBtn').click();
      for(const theme of ['light','dark']) {
        if(await b.page.locator('html').getAttribute('data-theme')!==theme)await b.page.locator('#themeBtn').click();
        for(const width of [320,390,1366]) {
          await b.page.setViewportSize({width,height:850});await openFavorites(b.page);
          const layout=await b.page.locator('#favModal').evaluate(node=>({width:innerWidth,scroll:node.scrollWidth,dialog:node.querySelector('.fav-modal').getBoundingClientRect().toJSON(),controls:[...node.querySelectorAll('#favoritesAccount button')].map(button=>button.getBoundingClientRect().toJSON())}));
          assert.ok(layout.scroll<=layout.width+1,`favorites overlay fits ${language}/${theme}/${width}`);
          assert.ok(layout.dialog.left>=0&&layout.dialog.right<=width+1);
          assert.ok(layout.controls.every(rect=>rect.left>=0&&rect.right<=width+1));
          for(let index=0;index<8;index++) {await b.page.keyboard.press('Tab');assert.equal(await b.page.evaluate(()=>document.querySelector('#favModal').contains(document.activeElement)),true,'favorites keeps keyboard focus inside');}
          if(width===390&&writeArtifacts) {fs.mkdirSync('artifacts/favorites',{recursive:true});await b.page.locator('#favModal').evaluate(node=>{node.scrollTop=0;});await b.page.screenshot({path:`artifacts/favorites/account-${language}-${theme}.png`});}
          await closeFavorites(b.page);
          assert.equal(await b.page.locator('#favBtn').evaluate(node=>node===document.activeElement),true,'Escape restores the favorites entry focus');
        }
      }
    }
    await openFavorites(b.page);
    await b.page.locator('#githubSignOut').click();
    await waitState(b.page,s=>!s.user,'sign-out returns to local mode');
    assert.deepEqual((await state(b.page)).ids,[],'sign-out does not expose account favorites as anonymous data');
    assert.equal(backend.rows.get(alice.id).get(second.id).deleted,false,'sign-out keeps cloud favorites');
    assert.equal(await b.page.locator('#githubSignIn').isVisible(),true);
    backend.setOAuthUser(bob);
    await b.page.locator('#githubSignIn').click();await b.page.waitForURL(`${authOrigin}/auth/v1/authorize**`);
    await b.page.goto(new URL('?code=bob-test-code#skills',base).href);await ready(b.page);
    await waitState(b.page,s=>s.user?.id===bob.id&&s.status==='synced','second account can sign in');
    assert.deepEqual((await state(b.page)).ids,[],'the next account does not inherit the previous account cache');
    assert.equal(backend.rows.get(bob.id).size,0,'switching account does not upload another user favorites');
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({status:'passed',base,auth:'real Supabase SDK with mocked HTTP; live GitHub OAuth and database RLS require separate verification',checks:['local migration and malformed storage','GitHub PKCE redirect and code exchange','initial merge','failed add/remove retry','second-browser restoration','out-of-catalog favorites and escaped content','account isolation and logout retention','bilingual light/dark 320–1366px modal layout and keyboard focus']}));
  } finally {await Promise.all(contexts.map(context=>context.close()));await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
