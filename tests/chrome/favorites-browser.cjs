/* Real MV3 account integration in an isolated Chrome profile. The real website/controller and native external ports are exercised.
 * Only API responses and GitHub redirects are fixtures; production is never contacted. Run with PLAYWRIGHT_MODULE=/path/to/playwright-core.
 */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const websiteOrigin='https://agentskills.media';
const siteSessionKey='st_favorites_session_v1';

const root = path.resolve(__dirname, '../..');
const expectedId = 'medjijlfgmfeldlelkidiickdcnbicaf';
const api = 'https://agent-leaderboard-api.jaychempan.workers.dev/api';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-favorites-browser-'));
const artifacts = path.join(root, 'artifacts/extension');
const profiles=[profile];
let stage = 'launch', context, page, website;

async function eventually(check,message,timeout=10000){
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){if(await check())return;await new Promise(resolve=>setTimeout(resolve,50));}
  assert.fail(message);
}

async function installBackendFixture({api,id,chosen,seed=true}){
      if(chrome.runtime.id!==id)throw new Error('native_extension_id_mismatch');
      const originalFetch=globalThis.fetch.bind(globalThis);
      const bundled=await(await originalFetch(chrome.runtime.getURL('data/catalog.json'))).json();
      const bundledTrends=await(await originalFetch(chrome.runtime.getURL('data/trends.json'))).json();
      const user={id:'701',login:'browser-fixture-user',avatar_url:''};
      const backend=globalThis.__favoritesBrowserBackend={user,rows:new Map(),sessions:new Map(),exchanges:new Map(),oauthStates:new Map(),
        receipts:new Set(),externalPorts:[],portDisconnects:0,handoffs:0,extensionExchanges:0,websiteExchanges:0,imports:0,importRows:0,writes:0,failedWrites:0,
        failNextWrite:false,requests:[],externalMessages:[],extensionTokensExcludeWebsite:true,handoffCodesExcludeTokens:true};
      const random=()=>{let bytes='';for(const value of crypto.getRandomValues(new Uint8Array(32)))bytes+=String.fromCharCode(value);
        return btoa(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
      const hash=async value=>{let bytes='';for(const byte of new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))))bytes+=String.fromCharCode(byte);
        return btoa(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
      backend.openSession=(client,owner=user)=>{
        const token=random(),expiresAt=new Date(Date.now()+8*3600000).toISOString();
        backend.sessions.set(token,{client,user:owner});return {api,token,expiresAt,user:owner};
      };
      const response=(status,json)=>({status,json});
      backend.request=async({url:address,method='GET',headers:rawHeaders={},body=null})=>{
        const url=new URL(address),headers=new Headers(rawHeaders),hint=headers.get('X-Favorites-Extension');
        backend.requests.push({path:url.pathname,method,extension:hint===id});
        if(method==='OPTIONS')return response(204,null);
        if(url.pathname==='/api/auth/github'){
          const challenge=url.searchParams.get('client_challenge'),state=url.searchParams.get('client_state'),returnTo=url.searchParams.get('return_to');
          if(!/^[A-Za-z0-9_-]{43}$/.test(challenge||'')||!/^[A-Za-z0-9_-]{43}$/.test(state||'')||!returnTo?.startsWith('/')||returnTo.startsWith('//'))return response(400,{error:'invalid_login_request'});
          const nonce=random();backend.oauthStates.set(nonce,{challenge,state,returnTo});
          return {status:302,location:'https://github.com/login/oauth/authorize?'+new URLSearchParams({state:nonce,client_id:'browser-fixture'})};
        }
        if(url.pathname==='/api/auth/github/callback'){
          const pending=backend.oauthStates.get(url.searchParams.get('state'));
          if(!pending)return response(400,{error:'invalid_state'});
          backend.oauthStates.delete(url.searchParams.get('state'));
          const code=random();backend.exchanges.set(code,{...pending,client:'website'});
          const target=new URL(pending.returnTo,'https://agentskills.media');
          target.searchParams.set('login_code',code);target.searchParams.set('login_state',pending.state);
          return {status:302,location:target.href};
        }
        if(url.pathname==='/api/auth/exchange'){
          if(headers.has('Authorization'))throw new Error('exchange_has_old_bearer');
          const exchange=backend.exchanges.get(body?.code);
          if(!exchange||body.state!==exchange.state||await hash(body.verifier)!==exchange.challenge)return response(400,{error:'invalid_login_exchange'});
          if((exchange.client==='extension')!==(hint===id))return response(403,{error:'origin_rejected'});
          backend.exchanges.delete(body.code);
          if(exchange.client==='extension')backend.extensionExchanges++;else backend.websiteExchanges++;
          const session=backend.openSession(exchange.client,exchange.user||user);
          return response(200,{token:session.token,expiresAt:session.expiresAt,user:session.user});
        }
        const token=(headers.get('Authorization')||'').replace(/^Bearer /,''),session=backend.sessions.get(token),owner=session?.user;
        if(hint===id&&session?.client==='website')backend.extensionTokensExcludeWebsite=false;
        if(hint===id&&session&&session.client!=='extension')return response(401,{error:'authentication_required'});
        if(url.pathname==='/api/bootstrap'){
          const after=Number(url.searchParams.get('after')||0);
          if(after&&(!owner||headers.get('X-Favorites-User')!==owner.id))return response(409,{error:'account_changed'});
          const rows=owner?[...backend.rows].filter(([key])=>key.startsWith(owner.id+':')).map(([,row])=>row)
            .filter(row=>row.repo_id>after).sort((a,b)=>a.repo_id-b.repo_id):[];
          return response(200,{authConfigured:true,user:owner||null,favorites:rows.slice(0,500),nextCursor:rows.length>500?rows[499].repo_id:null});
        }
        if(!owner)return response(401,{error:'authentication_required'});
        if(headers.get('X-Favorites-User')!==owner.id)return response(409,{error:'account_changed'});
        if(url.pathname==='/api/auth/extension'){
          if(hint||session.client!=='website'||headers.get('Origin')!=='https://agentskills.media')return response(403,{error:'origin_rejected'});
          if(body.extension_id!==id||!/^[A-Za-z0-9_-]{43}$/.test(body.client_challenge||'')||!/^[A-Za-z0-9_-]{43}$/.test(body.client_state||''))return response(400,{error:'invalid_login_request'});
          const code=random();backend.exchanges.set(code,{client:'extension',challenge:body.client_challenge,state:body.client_state,user:owner});backend.handoffs++;
          backend.handoffCodesExcludeTokens&&=!backend.sessions.has(code);
          const handoff=response(200,{code,state:body.client_state,expiresAt:new Date(Date.now()+90000).toISOString()});
          if(backend.delayHandoffState===body.client_state)return new Promise(resolve=>{backend.releaseDelayedHandoff=()=>resolve(response(503,{error:'temporarily_unavailable'}));});
          return handoff;
        }
        if(url.pathname==='/api/auth/logout'){backend.sessions.delete(token);return response(200,{ok:true});}
        if(url.pathname==='/api/favorites/resolve')return response(404,{error:'repository_not_found'});
        if(url.pathname==='/api/favorites/import'){
          const receipt=`${owner.id}:${body.migration_id}:${body.batch_id}`;
          if(!backend.receipts.has(receipt)){
            for(const value of body.favorites){const key=`${owner.id}:${value.repo_id}`;if(!backend.rows.has(key))backend.rows.set(key,value);}
            backend.receipts.add(receipt);backend.imports++;backend.importRows+=body.favorites.length;
          }
          return response(200,{ok:true});
        }
        const match=/^\/api\/favorites\/([1-9]\d*)$/.exec(url.pathname);
        if(!match||!['PUT','DELETE'].includes(method))return response(404,{error:'not_found'});
        if(backend.failNextWrite){backend.failNextWrite=false;backend.failedWrites++;return response(503,{error:'unavailable'});}
        const repoId=Number(match[1]),key=`${owner.id}:${repoId}`;
        if(method==='PUT')backend.rows.set(key,{repo_id:repoId,repository:body.repository});else backend.rows.delete(key);
        backend.writes++;return response(200,{ok:true});
      };
      globalThis.fetch=async(input,options={})=>{
        const url=new URL(typeof input==='string'?input:input.url);
        if(url.protocol==='chrome-extension:')return originalFetch(input,options);
        if(url.href==='https://agentskills.media/data/discovery_index.json')return Response.json(bundled);
        if(url.href==='https://agentskills.media/data/trends.json')return Response.json(bundledTrends);
        if(url.origin+'/api'!==api)throw new Error('external_network_blocked');
        const headers=new Headers(options.headers);
        if(headers.get('X-Favorites-Extension')!==id||options.credentials!=='omit')throw new Error('invalid_extension_transport');
        const value=await backend.request({url:url.href,method:options.method||'GET',headers:Object.fromEntries(headers),body:options.body?JSON.parse(options.body):null});
        return Response.json(value.json,{status:value.status});
      };
      // Observe native sender metadata without responding or replacing the runtime API.
      chrome.runtime.onMessageExternal.addListener((message,sender)=>{
        backend.externalMessages.push({type:message.type,origin:sender.origin,url:sender.url,tabId:sender.tab?.id,frameId:sender.frameId,hasSenderId:Boolean(sender.id),keys:Object.keys(message).sort(),
          websiteTokenAbsent:[...backend.sessions].filter(([,value])=>value.client==='website').every(([token])=>!JSON.stringify(message).includes(token))});
      });
      chrome.runtime.onConnectExternal.addListener(port=>{
        const sender=port.sender,entry={name:port.name,origin:sender.origin,url:sender.url,tabId:sender.tab?.id,
          frameId:sender.frameId,hasSenderId:Boolean(sender.id),messages:[]};
        backend.externalPorts.push(entry);
        port.onMessage.addListener(message=>entry.messages.push({type:message.type,keys:Object.keys(message).sort(),
          userId:message.user?.id||null,websiteTokenAbsent:[...backend.sessions].filter(([,value])=>value.client==='website').every(([token])=>!JSON.stringify(message).includes(token))}));
        port.onDisconnect.addListener(()=>{entry.disconnected=true;backend.portDisconnects++;});
      });
      if(seed)await chrome.storage.local.set({[`favorite:${chosen[0].key}`]:chosen[0],checkedAt:Date.now(),uiLocale:'zh-CN',themeMode:'light'});
      return {id:chrome.runtime.id,user:user.login,records:chosen.map(({key,full_name,source_id})=>({key,full_name,id:source_id}))};

}

async function configurePageRoutes(context,getWorker){
    await context.route(websiteOrigin+'/**',async route=>{
      const url=new URL(route.request().url());
      const pathname=url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname;
      const file=path.resolve(root,'.'+decodeURIComponent(pathname));
      if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:'Not found'});
      const types={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
      return route.fulfill({status:200,contentType:types[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
    });
    await context.route(api+'/**',async route=>{
      const request=route.request(),headers=await request.allHeaders();
      const value=await getWorker().evaluate(request=>globalThis.__favoritesBrowserBackend.request(request),{
        url:request.url(),method:request.method(),headers,body:request.postData()?JSON.parse(request.postData()):null});
      const cors={'access-control-allow-origin':websiteOrigin,'access-control-allow-methods':'GET, POST, PUT, DELETE, OPTIONS',
        'access-control-allow-headers':'Authorization, Content-Type, X-Favorites-User'};
      // route interception follows only the first URL in an HTTP redirect
      // chain. A fixture document starts each navigation independently, keeping
      // GitHub and callbacks entirely intercepted instead of touching the network.
      if(value.location)return route.fulfill({status:200,contentType:'text/html',body:`<script>location.replace(${JSON.stringify(value.location)})</script>`});
      return route.fulfill({status:value.status,headers:cors,...(value.status===204?{}:{json:value.json})});
    });
    await context.route(/^https:\/\/github\.com\/login\/oauth\/authorize(?:\?|$)/,route=>{
      const source=new URL(route.request().url());
      const target=api+'/auth/github/callback?'+new URLSearchParams({state:source.searchParams.get('state'),code:'browser-fixture-only'});
      return route.fulfill({status:200,contentType:'text/html',body:`<script>location.replace(${JSON.stringify(target)})</script>`});
    });
}

(async () => {
  context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, colorScheme: 'dark', viewport: {width: 390, height: 850},
    ignoreDefaultArgs: ['--disable-extensions'], args: ['--enable-unsafe-extension-debugging','--host-resolver-rules=MAP * ~NOTFOUND'],
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
    let worker = context.serviceWorkers().find(value => value.url().startsWith(`chrome-extension://${id}/`))
      || await context.waitForEvent('serviceworker', {predicate: value => value.url().startsWith(`chrome-extension://${id}/`)});
    const transport=await worker.evaluate(()=>{const manifest=chrome.runtime.getManifest();return {identity:manifest.permissions.includes('identity'),matches:manifest.externally_connectable?.matches};});
    assert.deepEqual(transport,{identity:false,matches:[websiteOrigin+'/',websiteOrigin+'/?*',websiteOrigin+'/index.html',websiteOrigin+'/index.html?*',websiteOrigin+'/extension/connect/*']},'website bridge needs no identity permission and allows only the official homepage and connection page');
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
    const fixture = await worker.evaluate(installBackendFixture,{api,id,chosen});
    await configurePageRoutes(context,()=>worker);
    async function finishWebsiteConnection(website,{signIn=false}={}){
      await website.locator('#navbar').waitFor();await website.locator('#favModal').waitFor({state:'visible'});
      assert.equal(await website.locator('#connect-title,#connect-approve,.connect-main').count(),0,'connection uses the existing website and favorites modal without an interstitial or confirm action');
      if(signIn){await website.locator('#githubSignIn').waitFor({state:'visible'});await website.locator('#githubSignIn').click();}
      await website.locator('#favModal').waitFor({state:'visible'});
      await website.locator('#githubSignOut').waitFor({state:'visible'});
      await website.waitForFunction(()=>document.getElementById('favoritesSyncStatus')?.dataset.extensionState==='connected'&&document.getElementById('favoritesSyncStatus').getAttribute('aria-busy')==='false');
    }

    const panelURL = `chrome-extension://${id}/panel.html`;
    page = await context.newPage(); const errors = [];
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
    stage = 'website-first automatic connection and migration';
    website=await context.newPage();website.on('pageerror',error=>errors.push(error.name));
    const websiteSession=await worker.evaluate(()=>globalThis.__favoritesBrowserBackend.openSession('website'));
    await website.addInitScript(({key,value,origin})=>{if(location.origin===origin&&!sessionStorage.getItem(key))sessionStorage.setItem(key,JSON.stringify(value));},
      {key:siteSessionKey,value:websiteSession,origin:websiteOrigin});
    await website.goto(websiteOrigin+'/');await website.locator('#favBtn').waitFor();
    await website.waitForFunction(()=>typeof favoritesStore!=='undefined'&&favoritesStore.getSnapshot().user?.id==='701');
    const originalWebsite={url:website.url(),history:await website.evaluate(()=>history.length)};
    const websiteTabId=await worker.evaluate(async origin=>(await chrome.tabs.query({})).find(tab=>tab.url===origin+'/')?.id,websiteOrigin);
    assert.ok(Number.isInteger(websiteTabId),'the signed-in website tab exists before opening the extension');
    await page.bringToFront();
    const baseline=await worker.evaluate(async()=>({tabs:(await chrome.tabs.query({})).length,active:(await chrome.tabs.query({active:true,currentWindow:true}))[0]?.id}));
    await page.goto(panelURL);await page.locator('.repo').first().waitFor();await page.locator('#favorites').click();
    await waitSynced(page);await waitCount(page,1);
    assert.equal(website.url(),originalWebsite.url,'automatic connection never navigates the website');
    assert.equal(await website.evaluate(()=>history.length),originalWebsite.history,'automatic connection does not change website history');
    assert.deepEqual(await worker.evaluate(async()=>({tabs:(await chrome.tabs.query({})).length,active:(await chrome.tabs.query({active:true,currentWindow:true}))[0]?.id})),baseline,
      'automatic connection neither creates tabs nor changes the active tab');
    assert.equal(await page.locator('#account-user').textContent(), fixture.user);
    const snapshot = await page.evaluate(() => chrome.runtime.sendMessage({type: 'favorites:snapshot'}));
    const secure = await worker.evaluate(async snapshot => {
      const values = await chrome.storage.session.get(null), local = await chrome.storage.local.get(null);
      const value = values.agentFavoritesSessionV1, token = value?.token;
      return {handoffs: globalThis.__favoritesBrowserBackend.handoffs, pkce: globalThis.__favoritesBrowserBackend.extensionExchanges,
        imports: globalThis.__favoritesBrowserBackend.imports, importRows: globalThis.__favoritesBrowserBackend.importRows,
        tokenValid: /^[A-Za-z0-9_-]{43}$/.test(token || ''), eightHours: Math.abs(Date.parse(value?.expiresAt) - Date.now() - 8 * 3600000) < 15000,
        tokenAbsentFromLocal: Boolean(token) && !JSON.stringify(local).includes(token), tokenAbsentFromSnapshot: Boolean(token) && !JSON.stringify(snapshot).includes(token),
        pendingCleared: !values.agentFavoritesLoginV1, oldKeysRemoved: !Object.keys(local).some(key => key.startsWith('favorite:'))};
    }, snapshot);
    assert.deepEqual(secure, {handoffs: 1, pkce: 1, imports: 1, importRows: 1, tokenValid: true, eightHours: true,
      tokenAbsentFromLocal: true, tokenAbsentFromSnapshot: true, pendingCleared: true, oldKeysRemoved: true});
    const bridgeSecurity=await worker.evaluate(()=>{
      const backend=globalThis.__favoritesBrowserBackend,entry=backend.externalPorts.find(entry=>entry.messages.some(message=>message.type==='favorites:connect'));
      return {origin:entry?.origin,url:new URL(entry?.url).pathname,frameId:entry?.frameId,hasSenderId:entry?.hasSenderId,
        name:entry?.name,connectKeys:entry?.messages.find(message=>message.type==='favorites:connect')?.keys,
        websiteTokenAbsent:entry?.messages.every(message=>message.websiteTokenAbsent),websiteTokenUnsent:backend.extensionTokensExcludeWebsite,codeNotSession:backend.handoffCodesExcludeTokens};
    });
    assert.equal(await worker.evaluate(()=>globalThis.__favoritesBrowserBackend.externalPorts.find(entry=>entry.messages.some(message=>message.type==='favorites:connect'))?.tabId),websiteTabId,'native port belongs to the original website tab');
    assert.deepEqual(bridgeSecurity,{origin:websiteOrigin,url:'/',frameId:0,hasSenderId:false,name:'favorites:website',
      connectKeys:['code','state','type'],websiteTokenAbsent:true,websiteTokenUnsent:true,codeNotSession:true});
    stage = 'reload and second panel';
    await page.reload(); await page.locator('.repo').first().waitFor(); await page.locator('#favorites').click(); await waitSynced(page);
    assert.equal(await page.locator('#account-user').textContent(), fixture.user); await waitCount(page, 1);
    const second = await context.newPage(); second.on('pageerror', error => errors.push(error.name));
    await second.goto(panelURL); await second.locator('.repo').first().waitFor(); await second.locator('#favorites').click(); await waitCount(second, 1);
    stage='existing plugin account survives another website account';
    const otherWebsite=await context.newPage();otherWebsite.on('pageerror',error=>errors.push(error.name));
    const otherSession=await worker.evaluate(()=>globalThis.__favoritesBrowserBackend.openSession('website',{id:'702',login:'other-browser-user',avatar_url:''}));
    await otherWebsite.addInitScript(({key,value,origin})=>{if(location.origin===origin&&!sessionStorage.getItem(key))sessionStorage.setItem(key,JSON.stringify(value));},
      {key:siteSessionKey,value:otherSession,origin:websiteOrigin});
    await otherWebsite.goto(websiteOrigin+'/');await otherWebsite.locator('#favBtn').waitFor();
    await otherWebsite.waitForFunction(()=>typeof favoritesStore!=='undefined'&&favoritesStore.getSnapshot().user?.id==='702');
    await eventually(()=>worker.evaluate(()=>globalThis.__favoritesBrowserBackend.externalPorts.some(entry=>entry.messages.some(message=>message.type==='favorites:ready'&&message.userId==='702'))),'second website account publishes a real ready message');
    const handoffsBeforeAccountCheck=await worker.evaluate(()=>globalThis.__favoritesBrowserBackend.handoffs);
    await page.bringToFront();await page.locator('#account-sync').click();await waitSynced(page);
    assert.equal(await page.locator('#account-user').textContent(),fixture.user,'a ready website account never replaces an existing plugin account');
    assert.equal(await worker.evaluate(()=>globalThis.__favoritesBrowserBackend.handoffs),handoffsBeforeAccountCheck,'existing plugin session syncs without minting another account grant');
    stage='real website port disconnect and recovery';
    const connectionsBefore=await worker.evaluate(()=>globalThis.__favoritesBrowserBackend.externalPorts.length);
    await website.reload();await website.locator('#favBtn').waitFor();
    await website.waitForFunction(()=>typeof favoritesStore!=='undefined'&&favoritesStore.getSnapshot().user?.id==='701');
    await eventually(()=>worker.evaluate(count=>globalThis.__favoritesBrowserBackend.portDisconnects>0&&globalThis.__favoritesBrowserBackend.externalPorts.length>count,connectionsBefore),'website reload disconnects the old native port and opens a new port');
    await page.bringToFront();await page.locator('#account-sync').click();await waitSynced(page);
    assert.equal(await page.locator('#account-user').textContent(),fixture.user);
    assert.equal(await worker.evaluate(()=>globalThis.__favoritesBrowserBackend.handoffs),handoffsBeforeAccountCheck,'reconnected website port does not replace a valid plugin session');
    stage = 'two panel additions and deletions';
    await page.locator('#all').click(); await page.locator('#query').fill(fixture.records[1].full_name);
    await row(page, fixture.records[1].key).locator('.save').click();
    await waitBackendHas(fixture.records[1].id, true); await waitCount(second, 2);
    await row(second, fixture.records[0].key).locator('.save').click();
    await waitBackendHas(fixture.records[0].id, false); await waitCount(page, 1); await waitCount(second, 1);
    stage = 'website favorite and missing repository details';
    await page.locator('#query').fill(''); await page.locator('#favorites').click(); await waitSynced(page);
    const websiteId = 910000991, unknownId = 910000992;
    await website.goto(websiteOrigin+'/');await website.locator('#favBtn').waitFor();
    await website.waitForFunction(()=>typeof favoritesStore!=='undefined'&&favoritesStore.getSnapshot().user?.id==='701');
    await website.evaluate(async({websiteId,unknownId})=>{
      await favoritesStore.sync();
      await favoritesStore.toggle({id:websiteId,full_name:'browser-fixture/shared-site-repository',
        description:'Saved through the real website store',sources:['skills'],stars:1});
      await favoritesStore.toggle({id:unknownId,full_name:'',description:'',sources:[]});
    },{websiteId,unknownId});
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
        activeSessions: [...backend.sessions.values()].filter(value=>value.client==='extension').length, rows: backend.rows.size};
    });
    assert.deepEqual(loggedOut, {sessionGone: true, cacheGone: true, pendingGone: true, activeSessions: 0, rows: cloudBefore});
    assert.equal(cloudBefore, 2);
    assert.equal(await worker.evaluate(token=>globalThis.__favoritesBrowserBackend.sessions.get(token)?.client,websiteSession.token),'website','extension sign-out preserves the website session');
    stage='sign-out suppresses automatic resurrection across page reloads';
    const exchangesAfterLogout=await worker.evaluate(()=>globalThis.__favoritesBrowserBackend.extensionExchanges);
    await website.reload();await website.locator('#favBtn').waitFor();
    await page.reload();await page.locator('#favorites').waitFor();
    await page.waitForFunction(()=>document.getElementById('results').getAttribute('aria-busy')==='false');
    await page.locator('#favorites').click();
    const suppressed=await page.evaluate(()=>chrome.runtime.sendMessage({type:'favorites:sync'}));
    assert.equal(suppressed.snapshot.user,null,'sync remains anonymous after explicit sign-out');
    assert.equal(await worker.evaluate(async()=>(await chrome.storage.local.get('agentFavoritesAutoConnectDisabledV1')).agentFavoritesAutoConnectDisabledV1),true,'non-sensitive sign-out suppression persists');
    assert.equal(await worker.evaluate(()=>globalThis.__favoritesBrowserBackend.extensionExchanges),exchangesAfterLogout,'website ready/reload does not restore a signed-out plugin');
    stage='multiple website accounts require deliberate account selection';
    await page.bringToFront();const ambiguousTabs=await worker.evaluate(async()=>chrome.tabs.query({}).then(tabs=>tabs.length));
    const accountUrls=[website.url(),otherWebsite.url()];
    await page.locator('#account-sign-in').click();
    await eventually(()=>page.evaluate(async()=>{const value=await chrome.runtime.sendMessage({type:'favorites:snapshot'});return value.snapshot.error==='website_account_selection_required';}),'different signed-in website accounts are not selected arbitrarily');
    assert.equal(await worker.evaluate(()=>globalThis.__favoritesBrowserBackend.extensionExchanges),exchangesAfterLogout);
    assert.deepEqual([website.url(),otherWebsite.url()],accountUrls,'ambiguous accounts are not navigated');
    assert.equal(await worker.evaluate(async()=>chrome.tabs.query({}).then(tabs=>tabs.length)),ambiguousTabs,'account selection never creates a surprise tab');
    await otherWebsite.close();
    stage='explicit reconnect uses the available website port without navigation';
    await page.locator('#account-sign-in').click();await waitSynced(page);await waitCount(page,cloudBefore);
    assert.equal(await page.locator('#account-user').textContent(),fixture.user);
    assert.equal(website.url(),accountUrls[0]);
    assert.equal(await worker.evaluate(async()=>(await chrome.storage.local.get('agentFavoritesAutoConnectDisabledV1')).agentFavoritesAutoConnectDisabledV1),false,'explicit sign-in is the action that clears suppression');
    await page.locator('#account-sign-out').click();await page.locator('#account-sign-in').waitFor();await waitCount(page,0);
    stage='create website tab and sign in through website OAuth';
    for(const tab of context.pages())if(tab.url().startsWith(websiteOrigin+'/'))await tab.close();
    await eventually(()=>worker.evaluate(()=>globalThis.__favoritesBrowserBackend.externalPorts.every(entry=>entry.disconnected)),'closing website tabs disconnects their native ports');
    const newWebsitePromise=context.waitForEvent('page');
    await page.locator('#account-sign-in').click();const freshWebsite=await newWebsitePromise;website=freshWebsite;
    freshWebsite.on('pageerror',error=>errors.push(error.name));
    await freshWebsite.waitForURL(address=>address.origin===websiteOrigin&&address.pathname==='/'&&address.searchParams.get('extension_sync')==='1');
    await finishWebsiteConnection(freshWebsite,{signIn:true});await waitSynced(page);await waitCount(page,cloudBefore);await waitCount(second,cloudBefore);
    assert.equal(await worker.evaluate(()=>globalThis.__favoritesBrowserBackend.websiteExchanges),1,'new website tab completes ordinary website OAuth');
    assert.equal(await worker.evaluate(()=>globalThis.__favoritesBrowserBackend.extensionExchanges),3,'new-tab fallback completes its own extension PKCE exchange');
    assert.equal(await worker.evaluate(()=>globalThis.__favoritesBrowserBackend.importRows),1,'reconnecting does not reimport or resurrect removed local favorites');
    stage='upgrade-equivalent empty session with a stale signed-in connect page';
    const staleState='S'.repeat(43),staleChallenge='C'.repeat(43);
    const staleUrl=websiteOrigin+'/extension/connect/#'+new URLSearchParams({extension_id:expectedId,client_challenge:staleChallenge,client_state:staleState});
    const savedWebsiteSession=await freshWebsite.evaluate(key=>JSON.parse(sessionStorage.getItem(key)),siteSessionKey);
    const persistedFixture=await worker.evaluate(()=>{
      const b=globalThis.__favoritesBrowserBackend;
      return {rows:[...b.rows],sessions:[...b.sessions],receipts:[...b.receipts]};
    });
    await context.close();
    // A fresh profile naturally has no extension session or pending proof,
    // exactly the authentication precondition after an upgrade. Only the
    // ordinary website's valid session and external API fixture are seeded.
    const upgradeProfile=fs.mkdtempSync(path.join(os.tmpdir(),'agent-favorites-upgrade-'));profiles.push(upgradeProfile);
    context=await chromium.launchPersistentContext(upgradeProfile,{
      executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless:true,colorScheme:'dark',viewport:{width:390,height:850},ignoreDefaultArgs:['--disable-extensions'],
      args:['--enable-unsafe-extension-debugging','--host-resolver-rules=MAP * ~NOTFOUND'],
    });context.setDefaultTimeout(10000);
    await context.route('https://**/*',route=>route.abort('blockedbyclient'));
    const upgradeCDP=await context.browser().newBrowserCDPSession();
    const upgradeExtension=await upgradeCDP.send('Extensions.loadUnpacked',{path:process.env.EXTENSION_PATH||path.join(root,'chrome')});
    assert.equal(upgradeExtension.id,id,'the same official extension is loaded for upgrade recovery');
    worker=context.serviceWorkers().find(value=>value.url().startsWith(`chrome-extension://${id}/`))
      ||await context.waitForEvent('serviceworker',{predicate:value=>value.url().startsWith(`chrome-extension://${id}/`)});
    await worker.evaluate(installBackendFixture,{api,id,chosen,seed:false});
    await worker.evaluate(({saved,staleState})=>{
      const b=globalThis.__favoritesBrowserBackend;
      b.rows=new Map(saved.rows);b.sessions=new Map(saved.sessions);b.receipts=new Set(saved.receipts);b.delayHandoffState=staleState;
    },{saved:persistedFixture,staleState});
    await configurePageRoutes(context,()=>worker);
    const cleared=await worker.evaluate(async()=>{
      const value=await chrome.storage.session.get(['agentFavoritesSessionV1','agentFavoritesLoginV1']);
      return {session:!value.agentFavoritesSessionV1,pending:!value.agentFavoritesLoginV1};
    });
    assert.deepEqual(cleared,{session:true,pending:true},'the recovery scenario starts with naturally empty extension authentication');
    const upgradeWebsite=await context.newPage();upgradeWebsite.on('pageerror',error=>errors.push(error.name));
    await upgradeWebsite.addInitScript(({key,value,origin})=>{if(location.origin===origin&&!sessionStorage.getItem(key))sessionStorage.setItem(key,JSON.stringify(value));},
      {key:siteSessionKey,value:savedWebsiteSession,origin:websiteOrigin});
    await upgradeWebsite.goto(staleUrl);website=upgradeWebsite;
    await upgradeWebsite.waitForURL(address=>address.origin===websiteOrigin&&address.pathname==='/'&&address.searchParams.get('extension_sync')==='1');
    await upgradeWebsite.locator('#favModal').waitFor({state:'visible'});
    assert.equal(await upgradeWebsite.locator('#connect-title,.connect-main').count(),0,'legacy links redirect to the existing homepage instead of a standalone hero');
    await eventually(()=>worker.evaluate(()=>typeof globalThis.__favoritesBrowserBackend.releaseDelayedHandoff==='function'),'stale legacy handoff is held while the passive website port stays available');
    const staleBefore={url:upgradeWebsite.url(),history:await upgradeWebsite.evaluate(()=>history.length)};
    page=await context.newPage();page.on('pageerror',error=>errors.push(error.name));await page.bringToFront();
    const tabsBeforeUpgradeSync=await worker.evaluate(async()=>({count:(await chrome.tabs.query({})).length,active:(await chrome.tabs.query({active:true,currentWindow:true}))[0]?.id}));
    await page.goto(panelURL);await page.locator('#favorites').waitFor();await page.locator('#favorites').click();await waitSynced(page);await waitCount(page,cloudBefore);
    await upgradeWebsite.waitForFunction(()=>document.getElementById('favoritesSyncStatus')?.dataset.extensionState==='connected');
    assert.equal(upgradeWebsite.url(),websiteOrigin+'/','successful legacy recovery cleans proof parameters on the homepage without an interstitial');
    assert.equal(await upgradeWebsite.evaluate(()=>history.length),staleBefore.history,'successful proof cleanup replaces history without adding a page');
    assert.deepEqual(await worker.evaluate(async()=>({count:(await chrome.tabs.query({})).length,active:(await chrome.tabs.query({active:true,currentWindow:true}))[0]?.id})),tabsBeforeUpgradeSync,'upgrade recovery neither creates nor activates another tab');
    const delayedFailure=upgradeWebsite.waitForResponse(response=>response.url()===api+'/auth/extension'&&response.status()===503
      &&response.request().postDataJSON()?.client_state===staleState);
    await worker.evaluate(()=>globalThis.__favoritesBrowserBackend.releaseDelayedHandoff());
    await(await delayedFailure).finished();
    // Flush response microtasks and the resulting render before checking that
    // a genuinely late API failure leaves the connected state intact.
    await upgradeWebsite.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await upgradeWebsite.waitForFunction(()=>document.getElementById('favoritesSyncStatus')?.getAttribute('aria-busy')==='false');
    assert.equal(await page.locator('#account-user').textContent(),fixture.user);
    assert.equal(await upgradeWebsite.locator('#favoritesSyncStatus').getAttribute('data-extension-state'),'connected','a late stale legacy failure cannot overwrite the successful native-port connection');
    assert.match(await upgradeWebsite.locator('#favoritesSyncStatus').textContent(),/插件收藏已同步|Extension favorites synced/i);
    assert.equal(await upgradeWebsite.locator('#favModal').isVisible(),true,'the normal favorites modal stays open after recovery');
    await upgradeWebsite.screenshot({path:path.join(artifacts,'upgrade-stale-connect-390.png')});
    const upgradePort=await worker.evaluate(()=>globalThis.__favoritesBrowserBackend.externalPorts.find(entry=>entry.messages.some(message=>message.type==='favorites:connect')));
    assert.equal(new URL(upgradePort.url).pathname,'/','legacy recovery uses a native port from the homepage');
    assert.equal(await worker.evaluate(()=>globalThis.__favoritesBrowserBackend.extensionExchanges),1,'upgrade recovery uses a new PKCE exchange rather than the stale proof');
    stage='connect page with an invalid old fragment still exposes the signed-in passive port';
    const invalidUrl=websiteOrigin+'/extension/connect/#staleproof';
    await upgradeWebsite.goto(invalidUrl);
    await upgradeWebsite.waitForURL(address=>address.origin===websiteOrigin&&address.pathname==='/'&&address.searchParams.get('extension_sync')==='1');
    await upgradeWebsite.reload();await upgradeWebsite.locator('#favModal').waitFor({state:'visible'});
    await upgradeWebsite.locator('#favoritesAccount').filter({hasText:fixture.user}).waitFor();
    await eventually(()=>worker.evaluate(()=>globalThis.__favoritesBrowserBackend.externalPorts.some(entry=>entry.url.endsWith('#staleproof')&&entry.messages.some(message=>message.type==='favorites:ready'&&message.userId==='701'))),'an invalid old fragment still initializes website identity and the passive native port');
    const invalidHistory=await upgradeWebsite.evaluate(()=>history.length);
    await page.bringToFront();await page.locator('#account-sync').click();await waitSynced(page);await waitCount(page,cloudBefore);
    assert.equal(new URL(upgradeWebsite.url()).pathname,'/');assert.equal(new URL(upgradeWebsite.url()).searchParams.get('extension_sync'),'1');
    assert.equal(await upgradeWebsite.evaluate(()=>history.length),invalidHistory);

    assert.deepEqual(errors, []);
    console.log(JSON.stringify({status: 'passed', runtime: 'real unpacked Chrome MV3', extensionId: id, accountIntegration: 'real signed-in website + native external port; API/OAuth navigation fixtures',
      pkce: 'S256 verified for website and extension', nativeTabs:'automatic sync leaves the website unchanged; explicit fallback uses the existing homepage favorites modal', panels: 2, upgradeRecovery:'old links redirect to homepage, fresh empty extension session recovers by native port, late failure ignored', screenshots, productionNetwork: 'blocked', userProfile: 'not accessed', credentialsPrinted: false}));
  } catch(error) {
    if(website&&!website.isClosed())error.message+='\nWebsite: '+JSON.stringify(await website.evaluate(()=>({url:location.href,path:location.pathname,
      status:document.getElementById('favoritesSyncStatus')?.textContent,error:document.getElementById('favoritesSyncStatus')?.dataset.extensionState,
      native:{runtime:typeof globalThis.chrome?.runtime,connect:typeof globalThis.chrome?.runtime?.connect,sendMessage:typeof globalThis.chrome?.runtime?.sendMessage},
      store:typeof favoritesStore==='undefined'?null:{user:favoritesStore.getSnapshot().user,status:favoritesStore.getSnapshot().status,error:favoritesStore.getSnapshot().error}})).catch(()=>({unavailable:true})));
    const diagnosticWorker=context.serviceWorkers().find(value=>value.url().startsWith(`chrome-extension://${expectedId}/`));
    if(diagnosticWorker)error.message+='\nBridge: '+JSON.stringify(await diagnosticWorker.evaluate(async()=>{
      const b=globalThis.__favoritesBrowserBackend,p=(await chrome.storage.session.get('agentFavoritesLoginV1')).agentFavoritesLoginV1;
      return {handoffs:b?.handoffs,extensionExchanges:b?.extensionExchanges,externalPorts:b?.externalPorts?.slice(-2).map(entry=>({...entry,messages:entry.messages.slice(-5)})),requests:b?.requests?.slice(-8),
        pending:p?{mode:p.mode,tabId:p.tabId}:null};
    }).catch(()=>({unavailable:true})));
    throw error;
  } finally { await context.close(); }
})().catch(error => {
  console.error(JSON.stringify({status: 'failed', stage, error: error.name, message: error.message, location:error.stack?.split('\n').find(line=>line.includes(__filename))})); process.exitCode = 1;
}).finally(() => { for(const folder of profiles)try { fs.rmSync(folder, {recursive: true, force: true}); } catch { /* Chrome may briefly retain a profile file. */ } });
