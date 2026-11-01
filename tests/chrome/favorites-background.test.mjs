import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerFavoritesMessages, createWebsiteRegistry} from '../../chrome/favorites-background.mjs';

const id='medjijlfgmfeldlelkidiickdcnbicaf';
const sender={id,url:`chrome-extension://${id}/panel.html`};
function harness(controller={}) {
  let listener, externalListener;
  const calls=[];
  const snapshot={user:null,favorites:{},status:'local',error:null};
  const favorites={init:async()=>calls.push('init'),getSnapshot:async()=>snapshot,
    toggle:async repo=>calls.push(repo),...controller};
  registerFavoritesMessages({runtime:{id,onMessage:{addListener:fn=>{listener=fn;}},onMessageExternal:{addListener:fn=>{externalListener=fn;}}}},favorites);
  function send(message,source=sender) {
    return new Promise(resolve=>{
      const accepted=listener(message,source,resolve);
      if(!accepted)resolve(null);
    });
  }
  const sendExternal=(message,source)=>new Promise(resolve=>{if(!externalListener(message,source,resolve))resolve(null);});
  return {send,sendExternal,calls,snapshot};
}
test('only this extension panel can invoke the favorites controller',async()=>{
  const h=harness();
  for(const source of [{...sender,id:'another-extension'}, {...sender,url:'https://evil.example/panel.html'},
    {...sender,url:'chrome-extension://another/panel.html'}, {...sender,url:`chrome-extension://${id}/help.html`}]) {
    assert.equal(await h.send({type:'favorites:snapshot'},source),null);
  }
  for(const type of ['favorites:constructor','favorites:unknown','other:snapshot'])assert.equal(await h.send({type}),null);
  assert.deepEqual(h.calls,[]);
  assert.deepEqual(await h.send({type:'favorites:snapshot'}),{ok:true,snapshot:h.snapshot});
  assert.deepEqual(h.calls,['init']);
});
test('controller failures cross runtime messages only as fixed public state',async()=>{
  const h=harness({toggle:async()=>{throw new Error('private-upstream-secret');}});
  const result=await h.send({type:'favorites:toggle',repository:{full_name:'owner/tool'}});
  assert.deepEqual(result,{ok:false,snapshot:h.snapshot});
  assert.equal(JSON.stringify(result).includes('private-upstream'),false);
  const broken=harness({getSnapshot:async()=>{throw new Error('private-storage-detail');}});
  assert.deepEqual(await broken.send({type:'favorites:snapshot'}),{ok:false,error:'favorites_unavailable'});
});

const website={origin:'https://agentskills.media',url:'https://agentskills.media/extension/connect/',frameId:0,tab:{id:12}};
const completion={type:'favorites:connect',code:'c'.repeat(43),state:'s'.repeat(43)};
test('only the exact top-level website connection page can reach the external controller',async()=>{
  const calls=[],h=harness({completeWebsiteSignIn:async(...args)=>{calls.push(args);return{ok:true,connected:true,user:{id:'101',login:'alice',avatar_url:''}};}});
  for(const source of [{...website,id:'another-extension'},{...website,id:null},{...website,origin:'https://evil.example'},
    {...website,frameId:1},{...website,tab:undefined},{...website,url:'https://agentskills.media/'},
    {...website,url:'https://agentskills.media/extension/connect/evil.html'},
    {...website,url:'https://agentskills.media.evil.example/extension/connect/'},{...website,origin:undefined}]){
    assert.equal(await h.sendExternal(completion,source),null);
  }
  for(const message of [{...completion,type:'favorites:toggle'},{...completion,code:'private'},{...completion,state:123}])assert.equal(await h.sendExternal(message,website),null);
  assert.deepEqual(calls,[]);assert.deepEqual(h.calls,[]);
  assert.deepEqual(await h.sendExternal(completion,website),{ok:true,connected:true,user:{id:'101',login:'alice',avatar_url:''}});
  assert.equal(calls.length,1);
});
test('external responses never return account favorites, tokens, or private errors',async()=>{
  const h=harness({completeWebsiteSignIn:async()=>({connected:true,token:'secret',favorites:{private:'data'},user:{id:'101',login:'alice',avatar_url:'',token:'secret'}})});
  const result=await h.sendExternal(completion,website);assert.deepEqual(result,{ok:true,connected:true,user:{id:'101',login:'alice',avatar_url:''}});
  const failed=harness({completeWebsiteSignIn:async()=>{throw Error('private-backend-secret');}});
  assert.deepEqual(await failed.sendExternal(completion,website),{ok:false,connected:false});
  const rejected=harness({completeWebsiteSignIn:async()=>({connected:false,error:'private-upstream-detail'})});
  assert.deepEqual(await rejected.sendExternal(completion,website),{ok:false,connected:false});
});

function websitePort(source={...website,url:'https://agentskills.media/'}){
  const received=[],closed=[],sent=[];
  return{name:'favorites:website',sender:source,sent,disconnected:false,onMessage:{addListener:fn=>received.push(fn)},onDisconnect:{addListener:fn=>closed.push(fn)},
    postMessage:message=>sent.push(message),receive:message=>received.forEach(fn=>fn(message)),disconnect(){this.disconnected=true;closed.forEach(fn=>fn());}};
}
test('website registry rejects invalid ports and treats repeated ready heartbeats as no change',()=>{
  let updates=0;const registry=createWebsiteRegistry({onReady:()=>updates++});
  for(const sender of [{...website,id:'other'},{...website,origin:'https://evil.example'},{...website,frameId:1},{...website,url:'https://agentskills.media/privacy/'}]){
    const port=websitePort(sender);assert.equal(registry.register(port),false);assert.equal(port.disconnected,true);
  }
  assert.deepEqual(registry.list(),[]);const port=websitePort();registry.register(port);
  port.receive({type:'favorites:ready',user:{id:'101',login:'alice'}});port.receive({type:'favorites:ready',user:{id:'101',login:'alice'}});
  assert.equal(updates,1);assert.equal(registry.list()[0].user.id,'101');
  port.receive({type:'favorites:ready',user:null});assert.equal(updates,2);port.disconnect();assert.deepEqual(registry.list(),[]);
});
test('registry challenges bind the actual port and late replies on disconnected ports cannot resolve new requests',async()=>{
  const registry=createWebsiteRegistry(),port=websitePort();registry.register(port);port.receive({type:'favorites:ready',user:{id:'101',login:'alice'}});
  const candidate=registry.list()[0],challenge={client_state:'s'.repeat(43),client_challenge:'c'.repeat(43),expected_user_id:'101'};
  const pending=registry.request(candidate,challenge);assert.deepEqual(port.sent[0],{type:'favorites:challenge',...challenge});
  port.receive({type:'favorites:connect',code:'x'.repeat(43),state:'wrong'});port.disconnect();await assert.rejects(pending,{code:'website_connection_lost'});
  port.receive({type:'favorites:connect',code:'x'.repeat(43),state:challenge.client_state});assert.deepEqual(registry.list(),[]);
});

test('external one-shot main-page completion requires one extension_sync=1 marker',async()=>{
  let calls=0;const h=harness({completeWebsiteSignIn:async()=>{calls++;return{connected:true};}});
  for(const path of['/','/index.html','/?extension_sync=0','/?extension_sync=1&extension_sync=1','/#extension_sync=1']){
    assert.equal(await h.sendExternal(completion,{...website,url:'https://agentskills.media'+path}),null,path);
  }
  assert.equal(calls,0);
  for(const path of['/?extension_sync=1','/index.html?extension_sync=1']){
    assert.deepEqual(await h.sendExternal(completion,{...website,url:'https://agentskills.media'+path}),{ok:true,connected:true},path);
  }
  assert.equal(calls,2);
});

test('native website messaging patterns include root query URLs without broadening to other website paths',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../../chrome/manifest.json',import.meta.url),'utf8'));
  assert.deepEqual(new Set(manifest.externally_connectable.matches),new Set([
    'https://agentskills.media/','https://agentskills.media/?*',
    'https://agentskills.media/index.html','https://agentskills.media/index.html?*',
    'https://agentskills.media/extension/connect/*',
  ]));
  assert.equal(manifest.externally_connectable.ids,undefined,'other extensions are not permitted as website bridge senders');
});
