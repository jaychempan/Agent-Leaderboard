import test from 'node:test';
import assert from 'node:assert/strict';
import {registerFavoritesMessages} from '../../chrome/favorites-background.mjs';

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
