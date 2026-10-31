const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createFavoritesStore, sanitizeRepository, validConfiguration, STORAGE_KEYS: K, SESSION_KEYS: S} = require('../src/favorites.js');
const CONFIG = {apiBase: '/api'};
const CROSS_CONFIG = {apiBase: 'https://favorites-api.test/api'};
const {webcrypto, createHash} = require('node:crypto');
const OLD_ACCOUNT_PREFIX = 'st_favorites_worker_account_v1:';
const ALICE = {id: '101', login: 'alice', avatar_url: 'https://avatars.githubusercontent.com/u/101'};
const BOB = {id: '202', login: 'bob', avatar_url: 'https://avatars.githubusercontent.com/u/202'};
const repo = (id, extra = {}) => ({id, full_name: `team/repo-${id}`, url: `https://github.com/team/repo-${id}`,
  description: `Repository ${id}`, stars: id, sources: ['skills'], ...extra});
const clone = value => JSON.parse(JSON.stringify(value));
class MemoryStorage {
  constructor(initial = {}) { this.values = new Map(Object.entries(initial)); this.fail = null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { if (this.fail?.(key)) throw new Error('quota exceeded'); this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; }
function fakeBackend(user = null) {
  const server = {user, configured: true, absent: false, unavailable: false, offline: false, failWrites: false,
    sessions: new Map(), exchange: null, rows: new Map(), receipts: new Set(), requests: [], beforeRead: null, beforeWrite: null, loseImportResponse: false, pageSize: null};
  server.tokenFor = owner => { const token = ('s' + owner.id).padEnd(43, '_'); server.sessions.set(token, clone(owner)); return token; };
  server.put = (user, id, value = repo(id)) => server.rows.set(`${user.id}:${id}`, {repo_id:id, repository:clone(value)});
  server.remove = (user, id) => server.rows.delete(`${user.id}:${id}`);
  server.list = user => [...server.rows.entries()].filter(([key])=>key.startsWith(user.id+':')).map(([,row])=>clone(row)).sort((a,b)=>a.repo_id-b.repo_id);
  server.fetch = async (address, options = {}) => {
    const url = new URL(address), path = url.pathname, method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : null;
    server.requests.push({path,query:url.search,method,body,headers:options.headers,credentials:options.credentials});
    assert.equal(options.credentials,'omit');
    const token = options.headers?.Authorization?.replace(/^Bearer /, ''), owner = server.sessions.get(token);
    const respond = (status, value) => new Response(JSON.stringify(value), {status, headers:{'Content-Type':'application/json'}});
    if(server.offline)throw new TypeError('Failed to fetch');
    if(server.absent)return respond(404,{error:'not_found'});
    if(server.unavailable)return respond(503,{error:'auth_not_configured'});
    if(path==='/api/auth/exchange'&&method==='POST'){
      assert.equal(options.headers.Authorization,undefined);
      const exchange=server.exchange;server.exchange=null;
      if(!exchange||body.code!==exchange.code||body.state!==exchange.state||body.verifier!==exchange.verifier)return respond(401,{error:'invalid_exchange'});
      return respond(200,{token:server.tokenFor(exchange.user),expiresAt:new Date(Date.now()+8*60*60*1000).toISOString(),user:exchange.user});
    }
    if(path==='/api/bootstrap') {
      const after=Number(url.searchParams.get('after')||0);
      if(after&&(!owner||options.headers?.['X-Favorites-User']!==owner.id))return respond(409,{error:'account_changed'});
      const available=owner?server.list(owner).filter(row=>row.repo_id>after):[];
      const page=server.pageSize?available.slice(0,server.pageSize):available;
      const payload={authConfigured:server.configured,user:owner?clone(owner):null,favorites:page};
      if(server.pageSize)payload.nextCursor=available.length>server.pageSize?page.at(-1).repo_id:null;
      if(server.beforeRead)await server.beforeRead({after,payload});
      return respond(200,payload);
    }
    if(!owner)return respond(401,{error:'authentication_required'});
    if(options.headers?.['X-Favorites-User']!==owner.id)return respond(409,{error:'account_changed'});
    if(server.beforeWrite)await server.beforeWrite({path,method,body});
    if(server.offline)throw new TypeError('Failed to fetch');
    if(server.failWrites)return respond(503,{error:'temporarily_unavailable'});
    if(path==='/api/auth/logout'&&method==='POST'){server.sessions.delete(token);server.user=null;return respond(200,{ok:true});}
    if(path==='/api/favorites/import'&&method==='POST') {
      assert.ok(body.favorites.length<=100);
      assert.match(body.migration_id,/^[A-Za-z0-9_-]{16,100}$/);
      assert.ok(Number.isInteger(body.batch_id));
      const receipt=`${owner.id}:${body.migration_id}:${body.batch_id}`;
      const replayed=server.receipts.has(receipt);
      if(!replayed){for(const row of body.favorites){const key=`${owner.id}:${row.repo_id}`;if(!server.rows.has(key))server.rows.set(key,clone(row));}server.receipts.add(receipt);}
      if(server.loseImportResponse){server.loseImportResponse=false;throw new TypeError('Response lost after commit');}
      return respond(200,{ok:true,replayed});
    }
    const match=/^\/api\/favorites\/(\d+)$/.exec(path);
    if(match&&method==='PUT'){server.put(owner,Number(match[1]),body.repository);return respond(200,{ok:true});}
    if(match&&method==='DELETE'){server.remove(owner,Number(match[1]));return respond(200,{ok:true});}
    return respond(404,{error:'not_found'});
  };
  return server;
}
function fixture(t, settings = {}) {
  const server = settings.server || fakeBackend(settings.user);
  const storage = settings.storage || new MemoryStorage();
  const sessionStorage = settings.sessionStorage || new MemoryStorage();
  if (settings.sessionStorage === undefined && server.user) {
    const api = new URL((settings.config || CONFIG).apiBase || '/api', 'https://agentskills.media').href.replace(/\/$/, '');
    sessionStorage.setItem(S.session,JSON.stringify({api,token:server.tokenFor(server.user),expiresAt:new Date(Date.now()+8*60*60*1000).toISOString(),user:server.user}));
  }
  const eventTarget = settings.eventTarget || new EventTarget();
  const location = settings.location || {href:'https://agentskills.media/#mcp',assign(value){this.destination=value;}};
  const history = settings.history || {replaceState(_state,_title,value){location.href=value;}};
  const changes=[];
  const store=createFavoritesStore({storage,sessionStorage,crypto:settings.crypto===undefined?webcrypto:settings.crypto,now:settings.now,config:settings.config===undefined?CONFIG:settings.config,fetch:server.fetch,
    catalog:settings.catalog || (()=>[repo(1),repo(2),repo(3)]),location,history,eventTarget,onChange:snapshot=>changes.push(snapshot)});
  t.after(()=>store.destroy());
  return {store,storage,sessionStorage,server,eventTarget,location,changes};
}
async function settle(){await new Promise(resolve=>setImmediate(resolve));}

test('legacy numeric IDs and old anonymous snapshots migrate without loss or resurrection', async t=>{
  const storage=new MemoryStorage({[K.legacy]:'[1,1,2,"3",999,null,-1]',[K.anonymous]:JSON.stringify({entries:{7:{repository:repo(7),deleted:false},8:{repository:repo(8),deleted:true}}})});
  const f=fixture(t,{storage});f.server.absent=true;await f.store.init();
  assert.deepEqual(f.store.getSnapshot().ids,[1,2,3,7,999]);
  assert.equal(storage.getItem(K.backup),'[1,1,2,"3",999,null,-1]');
  assert.equal(f.store.getSnapshot().records[999].url,'');
  await f.store.toggle(1);
  const next=fixture(t,{storage});next.server.absent=true;await next.store.init();
  assert.deepEqual(next.store.getSnapshot().ids,[2,3,7,999]);
});
test('bad JSON, primitive metadata and blocked storage do not crash local favorites',async t=>{
  for(const value of ['{','true','1','"oops"','[1]']){
    const f=fixture(t,{storage:new MemoryStorage({[K.meta]:value,[K.legacy]:'{'}),config:{}});
    await f.store.init();await f.store.toggle(repo(1));assert.deepEqual(f.store.getSnapshot().ids,[1]);
  }
  const f=fixture(t,{storage:{getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}},config:{}});
  await f.store.init();await f.store.toggle(repo(2));
  assert.deepEqual(f.store.getSnapshot().ids,[2]);assert.equal(f.store.getSnapshot().error,'storage_unavailable');
});
test('a partial quota failure never marks an unwritten legacy migration complete',async t=>{
  const storage=new MemoryStorage({[K.legacy]:'[1]'});storage.fail=key=>key===K.anonymous;
  const f=fixture(t,{storage,config:{}});await f.store.init();
  assert.deepEqual(f.store.getSnapshot().ids,[1]);assert.notEqual(JSON.parse(storage.getItem(K.meta))?.migratedLegacy,true);
  storage.fail=null;const reloaded=fixture(t,{storage,config:{}});await reloaded.store.init();assert.deepEqual(reloaded.store.getSnapshot().ids,[1]);
});
test('temporary local-storage quota failure does not discard earlier in-memory local changes',async t=>{
  const storage=new MemoryStorage({[K.legacy]:'[1]'}),f=fixture(t,{storage,config:{}});await f.store.init();
  storage.fail=key=>key===K.anonymous;
  await f.store.toggle(repo(2));await f.store.toggle(repo(3));
  assert.deepEqual(f.store.getSnapshot().ids,[1,2,3]);assert.equal(f.store.getSnapshot().error,'storage_unavailable');
  storage.fail=null;await f.store.toggle(1);
  const reloaded=fixture(t,{storage,config:{}});await reloaded.store.init();assert.deepEqual(reloaded.store.getSnapshot().ids,[2,3]);
});
test('explicit HTTPS APIs or same-origin local-development paths are accepted',()=>{
  assert.equal(validConfiguration(CONFIG,'https://agentskills.media/#mcp'),true);
  assert.equal(validConfiguration(CONFIG,'http://127.0.0.1:8080/'),true);
  assert.equal(validConfiguration(CROSS_CONFIG,'https://agentskills.media/'),true);
  for(const apiBase of ['http://evil.example/api','//evil.example/api','/api?secret=x','/api#fragment','/','/api/../auth','https://user:pass@agentskills.media/api'])assert.equal(validConfiguration({apiBase},'https://agentskills.media/'),false,apiBase);
  assert.equal(validConfiguration(CONFIG,'http://example.com/'),false);
});
test('missing or unconfigured APIs retain local mode instead of advertising cloud saves',async t=>{
  for(const mode of ['absent','unavailable','configured']){
    const f=fixture(t,{storage:new MemoryStorage({[K.legacy]:'[1]'})});
    if(mode==='configured')f.server.configured=false;else f.server[mode]=true;
    await f.store.init();assert.equal(f.store.getSnapshot().configured,false);assert.equal(f.store.getSnapshot().status,'local');
    await f.store.toggle(repo(2));assert.deepEqual(f.store.getSnapshot().ids,[1,2]);assert.equal(f.store.getSnapshot().pendingCount,0);
    assert.equal(f.server.requests.filter(r=>r.method!=='GET').length,0);
  }
});
test('sign-in uses PKCE and cleans callback errors without tokens or secrets',async t=>{
  const f=fixture(t,{location:{href:'https://agentskills.media/?auth_error=access_denied&code=old#mcp',assign(value){this.destination=value;}}});
  await f.store.init();assert.equal(f.store.getSnapshot().error,'auth_failed');assert.equal(f.location.href,'https://agentskills.media/#mcp');
  await f.store.signIn();
  const url=new URL(f.location.destination);assert.equal(url.origin,'https://agentskills.media');assert.equal(url.pathname,'/api/auth/github');
  assert.equal(url.searchParams.get('return_to'),'/#mcp');
  const pending=JSON.parse(f.sessionStorage.getItem(S.login));
  assert.match(pending.verifier,/^[A-Za-z0-9_-]{43}$/);assert.match(pending.state,/^[A-Za-z0-9_-]{43}$/);
  assert.equal(url.searchParams.get('client_state'),pending.state);
  assert.equal(url.searchParams.get('client_challenge'),createHash('sha256').update(pending.verifier).digest('base64url'));
  assert.equal(url.searchParams.has('verifier'),false);assert.equal(url.searchParams.has('client_secret'),false);
  const token=fixture(t,{location:{href:'https://agentskills.media/#access_token=private&refresh_token=private',assign(value){this.destination=value;}}});
  await token.store.init();assert.equal(token.location.href,'https://agentskills.media/');await token.store.signIn();assert.equal(new URL(token.location.destination).searchParams.get('return_to'),'/');
});
test('first sign-in merges local and cloud favorites; another device restores them and logout retains cloud data',async t=>{
  const server=fakeBackend(ALICE);server.put(ALICE,2,repo(2,{description:'Keep the cloud snapshot'}));
  const f=fixture(t,{server,storage:new MemoryStorage({[K.legacy]:'[1,2]'})});await f.store.init();
  assert.deepEqual(f.store.getSnapshot().ids,[1,2]);assert.equal(f.store.getSnapshot().status,'synced');
  assert.equal(server.rows.get('101:2').repository.description,'Keep the cloud snapshot');
  assert.equal(JSON.parse(f.storage.getItem(K.cloud)).done,true);
  const other=fixture(t,{server});await other.store.init();assert.deepEqual(other.store.getSnapshot().ids,[1,2]);
  await f.store.signOut();assert.equal(f.store.getSnapshot().user,null);assert.deepEqual(f.store.getSnapshot().ids,[]);assert.equal(server.list(ALICE).length,2);
});
test('an import response lost after commit is safely retried without reviving a later deletion',async t=>{
  const server=fakeBackend(ALICE);server.loseImportResponse=true;
  const f=fixture(t,{server,storage:new MemoryStorage({[K.legacy]:'[1]'})});await f.store.init();
  assert.equal(f.store.getSnapshot().error,'local_import_failed');assert.deepEqual(f.store.getSnapshot().ids,[1]);
  const batch=server.requests.find(r=>r.path==='/api/favorites/import').body;
  server.remove(ALICE,1);await f.store.sync();
  assert.deepEqual(f.store.getSnapshot().ids,[]);assert.equal(server.rows.has('101:1'),false);
  const retry=server.requests.filter(r=>r.path==='/api/favorites/import')[1].body;
  assert.equal(retry.migration_id,batch.migration_id);assert.equal(retry.batch_id,batch.batch_id);
});
test('first-import batches are bounded, resumable and metadata is durable before network writes',async t=>{
  const ids=Array.from({length:205},(_,i)=>i+1),server=fakeBackend(ALICE),storage=new MemoryStorage({[K.legacy]:JSON.stringify(ids)});
  storage.fail=key=>key===K.cloud;
  const f=fixture(t,{server,storage});await f.store.init();assert.equal(f.store.getSnapshot().error,'storage_unavailable');
  assert.equal(server.requests.some(r=>r.path==='/api/favorites/import'),false);
  storage.fail=null;await f.store.sync();
  const batches=server.requests.filter(r=>r.path==='/api/favorites/import').map(r=>r.body);
  assert.deepEqual(batches.map(b=>b.favorites.length),[100,100,5]);assert.deepEqual(batches.map(b=>b.batch_id),[0,1,2]);
  assert.equal(new Set(batches.map(b=>b.migration_id)).size,1);assert.equal(f.store.getSnapshot().ids.length,205);
});
test('online adds and removes roll back on failure and are not silently queued offline',async t=>{
  const server=fakeBackend(ALICE);server.put(ALICE,1);
  const f=fixture(t,{server});await f.store.init();
  server.failWrites=true;await f.store.toggle(repo(2));assert.deepEqual(f.store.getSnapshot().ids,[1]);assert.equal(f.store.getSnapshot().error,'save_failed');
  await f.store.toggle(1);assert.deepEqual(f.store.getSnapshot().ids,[1]);assert.equal(server.rows.has('101:1'),true);
  server.failWrites=false;server.offline=true;await f.store.toggle(repo(3));
  assert.deepEqual(f.store.getSnapshot().ids,[1]);assert.equal(f.store.getSnapshot().status,'offline');assert.equal(f.store.getSnapshot().pendingCount,0);
  const writes=server.requests.filter(r=>r.method!=='GET').length;server.offline=false;await f.store.sync();
  assert.equal(server.requests.filter(r=>r.method!=='GET').length,writes,'recovery reads state rather than replaying failed ordinary saves');
  await f.store.toggle(repo(2));assert.deepEqual(f.store.getSnapshot().ids,[1,2]);await f.store.toggle(1);assert.deepEqual(f.store.getSnapshot().ids,[2]);
});
test('rapid toggles are serialized so the final intent wins',async t=>{
  const server=fakeBackend(ALICE),f=fixture(t,{server});await f.store.init();
  const hold=deferred();let first=true;server.beforeWrite=async()=>{if(first){first=false;await hold.promise;}};
  const add=f.store.toggle(repo(1));await settle();const remove=f.store.toggle(repo(1));
  assert.deepEqual(f.store.getSnapshot().ids,[]);hold.resolve();await Promise.all([add,remove]);
  assert.deepEqual(f.store.getSnapshot().ids,[]);assert.equal(server.rows.has('101:1'),false);
  assert.deepEqual(server.requests.filter(r=>/favorites\/1$/.test(r.path)).map(r=>r.method),['PUT','DELETE']);
});
test('rolling back a failed earlier save preserves a newer optimistic change',async t=>{
  const server=fakeBackend(ALICE),f=fixture(t,{server});await f.store.init();
  const first=deferred(),second=deferred();let number=0;
  server.beforeWrite=async()=>{number+=1;if(number===1){await first.promise;throw new TypeError('Failed to fetch');}if(number===2)await second.promise;};
  const failed=f.store.toggle(repo(1));await settle();const saved=f.store.toggle(repo(2));
  first.resolve();await failed;assert.deepEqual(f.store.getSnapshot().ids,[2]);
  second.resolve();await saved;assert.deepEqual(f.store.getSnapshot().ids,[2]);assert.equal(server.rows.has('101:1'),false);assert.equal(server.rows.has('101:2'),true);
});
test('a revoked tab session cannot write into a newly logged-in account',async t=>{
  const server=fakeBackend(ALICE);server.put(ALICE,1);server.put(BOB,2);
  const f=fixture(t,{server});await f.store.init();server.sessions.clear();server.user=BOB;server.tokenFor(BOB);
  await f.store.toggle(repo(3));
  assert.equal(server.rows.has('202:3'),false);assert.equal(f.store.getSnapshot().user,null);assert.deepEqual(f.store.getSnapshot().ids,[]);
  assert.equal(f.store.getSnapshot().error,'auth_failed');assert.equal(f.sessionStorage.getItem(S.session),null);
  assert.equal(server.requests.find(r=>r.path==='/api/favorites/3').headers['X-Favorites-User'],ALICE.id);
});
test('a second account does not import another account cache or its original local migration',async t=>{
  const server=fakeBackend(ALICE),storage=new MemoryStorage({[K.legacy]:'[1]'}),f=fixture(t,{server,storage});await f.store.init();
  await f.store.signOut();await f.store.toggle(repo(3));server.user=BOB;
  const bob=fixture(t,{server,storage});await bob.store.init();
  assert.equal(bob.store.getSnapshot().user.id,BOB.id);assert.deepEqual(bob.store.getSnapshot().ids,[]);assert.equal(server.list(BOB).length,0);
  server.user=ALICE;const alice=fixture(t,{server,storage});await alice.store.init();assert.deepEqual(alice.store.getSnapshot().ids,[1,3]);
});
test('out-of-catalog snapshots remain visible and untrusted fields cannot create arbitrary links',async t=>{
  const server=fakeBackend(ALICE);server.put(ALICE,77,repo(77,{description:'<img src=x onerror=alert(1)>',url:'javascript:alert(1)',sources:['skills','__proto__','unknown'],secret:'not retained'}));
  const f=fixture(t,{server});await f.store.init();const record=f.store.getSnapshot().records[77];
  assert.equal(record.full_name,'team/repo-77');assert.equal(record.url,'https://github.com/team/repo-77');assert.deepEqual(record.sources,['skills']);assert.equal(record.secret,undefined);
  assert.equal(sanitizeRepository({id:1,full_name:'../wrong',url:'javascript:alert(1)'}).url,'');
  assert.equal(sanitizeRepository({id:-1}),null);assert.equal(sanitizeRepository({id:9007199254740992}),null);
  assert.equal(sanitizeRepository({id:1,full_name:'good/repo'},2).id,2);
});
test('focus and online refresh server state; destroy removes listeners without retrying rejected writes',async t=>{
  const server=fakeBackend(ALICE),f=fixture(t,{server});await f.store.init();
  server.put(ALICE,2);f.eventTarget.dispatchEvent(new Event('focus'));await settle();assert.deepEqual(f.store.getSnapshot().ids,[2]);
  server.put(ALICE,3);f.eventTarget.dispatchEvent(new Event('online'));await settle();assert.deepEqual(f.store.getSnapshot().ids,[2,3]);
  const before=server.requests.length;f.store.destroy();f.eventTarget.dispatchEvent(new Event('focus'));await settle();assert.equal(server.requests.length,before);
});
test('account caches never serve as anonymous favorites before server identity is verified',async t=>{
  const storage=new MemoryStorage({[OLD_ACCOUNT_PREFIX+ALICE.id]:JSON.stringify({entries:{1:{repository:repo(1),deleted:false}}})});
  const f=fixture(t,{storage});await f.store.init();assert.equal(f.store.getSnapshot().user,null);assert.deepEqual(f.store.getSnapshot().ids,[]);
});
test('authenticated favorites are kept in memory without writing or cleaning old account mirrors',async t=>{
  const old=JSON.stringify({entries:{77:{repository:repo(77),deleted:false}}});
  const storage=new MemoryStorage({[OLD_ACCOUNT_PREFIX+ALICE.id]:old});
  storage.fail=key=>key.startsWith(OLD_ACCOUNT_PREFIX);
  const server=fakeBackend(ALICE);server.put(ALICE,1);
  const f=fixture(t,{server,storage});await f.store.init();await f.store.toggle(repo(2));
  assert.deepEqual(f.store.getSnapshot().ids,[1,2]);assert.equal(f.store.getSnapshot().error,null);
  assert.equal(storage.getItem(OLD_ACCOUNT_PREFIX+ALICE.id),old,'previous data is left untouched');
  assert.deepEqual([...storage.values.keys()].filter(key=>key.startsWith(OLD_ACCOUNT_PREFIX)),[OLD_ACCOUNT_PREFIX+ALICE.id]);
});
test('cursor pagination restores every favorite beyond 5000 without exposing partial synced results',async t=>{
  const server=fakeBackend(ALICE);server.pageSize=500;
  for(let id=1;id<=5017;id+=1)server.put(ALICE,id);
  const f=fixture(t,{server});await f.store.init();
  assert.equal(f.store.getSnapshot().status,'synced');assert.equal(f.store.getSnapshot().ids.length,5017);
  assert.equal(f.store.getSnapshot().ids.at(-1),5017);
  const pages=server.requests.filter(request=>request.path==='/api/bootstrap');
  assert.equal(pages.length,11);assert.equal(pages[0].headers['X-Favorites-User'],undefined);
  for(const page of pages.slice(1))assert.equal(page.headers['X-Favorites-User'],ALICE.id);
  assert.ok(f.changes.filter(snapshot=>snapshot.status==='synced').every(snapshot=>snapshot.ids.length===5017));
});
test('a mismatched account response cannot replace the bearer session identity',async t=>{
  const server=fakeBackend(ALICE);server.put(ALICE,1);server.put(BOB,3);
  const f=fixture(t,{server});await f.store.init();
  server.beforeRead=({payload})=>{payload.user=BOB;payload.favorites=server.list(BOB);};
  await f.store.sync();assert.equal(f.store.getSnapshot().user.id,ALICE.id);assert.deepEqual(f.store.getSnapshot().ids,[1]);
  assert.equal(f.store.getSnapshot().error,'account_changed');
  assert.ok(f.changes.every(snapshot=>snapshot.user?.id!==BOB.id));
});
test('an expired session during pagination returns to anonymous state without storing partial favorites',async t=>{
  const server=fakeBackend(ALICE);server.pageSize=1;server.put(ALICE,1);server.put(ALICE,2);
  let expired=false;server.beforeRead=({after})=>{if(!expired&&after===0){expired=true;server.sessions.clear();server.user=null;}};
  const f=fixture(t,{server});await f.store.init();
  assert.equal(f.store.getSnapshot().user,null);assert.deepEqual(f.store.getSnapshot().ids,[]);
  assert.equal(f.storage.getItem(OLD_ACCOUNT_PREFIX+ALICE.id),null);
});
test('a removed final page is accepted while repeated or invalid cursors fail safely',async t=>{
  const server=fakeBackend(ALICE);server.pageSize=1;server.put(ALICE,1);server.put(ALICE,2);
  const f=fixture(t,{server});await f.store.init();
  server.beforeRead=({after,payload})=>{if(after===1){payload.favorites=[];payload.nextCursor=null;}};
  await f.store.sync();assert.deepEqual(f.store.getSnapshot().ids,[1]);
  server.beforeRead=({after,payload})=>{if(after===1)payload.nextCursor=1;};
  await f.store.sync();assert.equal(f.store.getSnapshot().error,'sync_failed');assert.deepEqual(f.store.getSnapshot().ids,[1]);
});
test('destroying the store discards an old cursor-page response before it reaches the UI',async t=>{
  const server=fakeBackend(ALICE);server.pageSize=1;server.put(ALICE,1);server.put(ALICE,2);
  const held=deferred();server.beforeRead=async({after})=>{if(after===1)await held.promise;};
  const f=fixture(t,{server}),initializing=f.store.init();await settle();
  const previousChanges=f.changes.length;f.store.destroy();held.resolve();await initializing;
  assert.equal(f.changes.length,previousChanges);assert.equal(f.store.getSnapshot().user,null);assert.deepEqual(f.store.getSnapshot().ids,[]);
});

test('cross-origin callback exchanges PKCE once, cleans the URL before fetching and survives a same-tab reload',async t=>{
  const server=fakeBackend(),sessionStorage=new MemoryStorage(),storage=new MemoryStorage({[K.legacy]:'[1]'});
  const location={href:'https://agentskills.media/?view=saved#mcp',assign(value){this.destination=value;}};
  const initial=fixture(t,{server,sessionStorage,storage,location,config:CROSS_CONFIG});await initial.store.init();await initial.store.signIn();
  const pending=JSON.parse(sessionStorage.getItem(S.login)),destination=new URL(location.destination);
  assert.equal(destination.origin,'https://favorites-api.test');assert.equal(destination.searchParams.get('return_to'),'/?view=saved#mcp');
  initial.store.destroy();
  const code='c'.repeat(43);server.exchange={code,state:pending.state,verifier:pending.verifier,user:ALICE};
  location.href=`https://agentskills.media/?view=saved&login_code=${code}&login_state=${pending.state}#mcp`;
  const original=server.fetch;
  server.fetch=async(address,options)=>{assert.equal(new URL(location.href).searchParams.has('login_code'),false);assert.equal(sessionStorage.getItem(S.login),null);return original(address,options);};
  const callback=fixture(t,{server,sessionStorage,storage,location,config:CROSS_CONFIG});await callback.store.init();
  assert.equal(location.href,'https://agentskills.media/?view=saved#mcp');assert.equal(callback.store.getSnapshot().user.id,ALICE.id);assert.deepEqual(callback.store.getSnapshot().ids,[1]);
  const stored=JSON.parse(sessionStorage.getItem(S.session));assert.equal(stored.api,CROSS_CONFIG.apiBase);assert.equal(stored.user.id,ALICE.id);
  assert.ok(![...storage.values.values()].some(value=>value.includes(stored.token)),'site token never goes into localStorage');
  assert.ok(!location.href.includes(stored.token));
  const exchange=server.requests.find(request=>request.path==='/api/auth/exchange');assert.deepEqual(exchange.body,{code,verifier:pending.verifier,state:pending.state});assert.equal(exchange.headers.Authorization,undefined);
  assert.equal(server.requests.find(request=>request.path==='/api/favorites/import').headers.Authorization,'Bearer '+stored.token);
  callback.store.destroy();server.fetch=original;
  const reloaded=fixture(t,{server,sessionStorage,storage,location,config:CROSS_CONFIG});await reloaded.store.init();assert.equal(reloaded.store.getSnapshot().user.id,ALICE.id);
  await reloaded.store.signOut();assert.equal(sessionStorage.getItem(S.session),null);assert.equal(server.sessions.has(stored.token),false);assert.equal(server.list(ALICE).length,1);
});
test('callback replay, missing PKCE, mismatched state and old pending logins cannot exchange',async t=>{
  const code='c'.repeat(43),state='s'.repeat(43),verifier='v'.repeat(43),api=CROSS_CONFIG.apiBase;
  for(const pending of [null,{api,verifier,state:'x'.repeat(43),createdAt:Date.now()},{api,verifier,state,createdAt:Date.now()-11*60*1000},{api:'https://other-api.test/api',verifier,state,createdAt:Date.now()}]){
    const sessionStorage=new MemoryStorage(pending?{[S.login]:JSON.stringify(pending)}:{});
    const location={href:`https://agentskills.media/?login_code=${code}&login_state=${state}#skills`};
    const f=fixture(t,{sessionStorage,location,config:CROSS_CONFIG});await f.store.init();
    assert.equal(location.href,'https://agentskills.media/#skills');assert.equal(f.store.getSnapshot().error,'auth_failed');assert.equal(sessionStorage.getItem(S.login),null);assert.equal(sessionStorage.getItem(S.session),null);
    assert.equal(f.server.requests.some(request=>request.path==='/api/auth/exchange'),false);
  }
});
test('sessionStorage expiry and API origin binding prevent reuse of an old site session',async t=>{
  const server=fakeBackend(ALICE);server.put(ALICE,1);
  for(const record of [{api:CROSS_CONFIG.apiBase,expiresAt:new Date(Date.now()-1000).toISOString()},{api:'https://other-api.test/api',expiresAt:new Date(Date.now()+100000).toISOString()}]){
    const token=server.tokenFor(ALICE),sessionStorage=new MemoryStorage({[S.session]:JSON.stringify({...record,token,user:ALICE})});
    const f=fixture(t,{server,sessionStorage,config:CROSS_CONFIG});await f.store.init();
    assert.equal(f.store.getSnapshot().user,null);assert.equal(sessionStorage.getItem(S.session),null);assert.equal(server.requests.at(-1).headers.Authorization,undefined);
  }
});
test('a session expiring in an open tab rolls back the write and does not replay it after login',async t=>{
  const server=fakeBackend(ALICE);server.put(ALICE,1);let clock=Date.now();
  const f=fixture(t,{server,now:()=>clock});await f.store.init();clock+=9*60*60*1000;
  await f.store.toggle(repo(2));assert.equal(f.store.getSnapshot().user,null);assert.deepEqual(f.store.getSnapshot().ids,[]);assert.equal(f.store.getSnapshot().error,'auth_failed');
  assert.equal(server.requests.some(request=>request.path==='/api/favorites/2'),false);assert.equal(server.rows.has('101:2'),false);
});
test('blocked sessionStorage and unavailable secure randomness stop sign-in before navigation',async t=>{
  const blocked=new MemoryStorage();blocked.fail=()=>true;
  const f=fixture(t,{sessionStorage:blocked});await f.store.init();await assert.rejects(f.store.signIn(),{code:'storage_unavailable'});assert.equal(f.location.destination,undefined);assert.equal(f.store.getSnapshot().error,'storage_unavailable');
  const weak=fixture(t,{crypto:{}});await weak.store.init();await assert.rejects(weak.store.signIn(),{code:'auth_failed'});assert.equal(weak.location.destination,undefined);assert.equal(weak.sessionStorage.getItem(S.login),null);
});
