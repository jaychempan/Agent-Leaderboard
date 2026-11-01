import test from 'node:test';
import assert from 'node:assert/strict';
import {registerFavoritesMessages} from '../../chrome/favorites-background.mjs';

const id='medjijlfgmfeldlelkidiickdcnbicaf';
const sender={id,url:`chrome-extension://${id}/panel.html`};
function harness(controller={}) {
  let listener;
  const calls=[];
  const snapshot={user:null,favorites:{},status:'local',error:null};
  const favorites={init:async()=>calls.push('init'),getSnapshot:async()=>snapshot,
    toggle:async repo=>calls.push(repo),...controller};
  registerFavoritesMessages({runtime:{id,onMessage:{addListener:fn=>{listener=fn;}}}},favorites);
  function send(message,source=sender) {
    return new Promise(resolve=>{
      const accepted=listener(message,source,resolve);
      if(!accepted)resolve(null);
    });
  }
  return {send,calls,snapshot};
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
