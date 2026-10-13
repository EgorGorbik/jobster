import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {emptyWorkspace} from '../server/database.mjs';

const script=fs.readFileSync(new URL('../src/remote.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,15));
function boot({rejectPut=false}={}) {
  let revision=1;const events=[];const state=emptyWorkspace('Falcon Jobster');const puts=[];
  const store={validate:()=>true,id:()=>''};
  const banner={hidden:true,append(){},replaceChildren(){},setAttribute(){}};
  const root={innerHTML:'',querySelector(){return null;}};
  const doc={
    querySelector:q=>q==='#root'?root:null,
    createElement:tag=>({...banner,tagName:tag,style:{}}),
    body:{append(node){if(node.id==='jobster-remote-banner') Object.assign(banner,node);}},
    addEventListener(){},dispatchEvent:event=>events.push(event.detail)
  };
  const responses={
    '/api/session':()=>({user:{id:'admin',role:'Owner',name:'Admin',email:'test@example.com'}}),
    '/api/state':options=>{
      if(options?.method==='PUT') {
        const data=JSON.parse(options.body);puts.push(data);
        if(rejectPut) return {status:409,error:'Conflict'};
        assert.equal(data.revision,revision);revision++;
        return {revision};
      }
      return {revision,state};
    }
  };
  const fakeFetch=async (url,options)=>{
    const result=responses[url](options);const status=result.status||200;
    return {ok:status<400,status,json:async()=>result};
  };
  const sandbox={window:{FalconStore:store,FalconI18n:{language:'en',setLanguage(){}},addEventListener(){}},
    document:doc,fetch:fakeFetch,structuredClone,queueMicrotask,CustomEvent:class {constructor(_,opts){this.detail=opts.detail;}},
    URL,Blob,setTimeout,clearTimeout,console,location:{reload(){}},confirm:()=>false};
  vm.runInNewContext(script,sandbox,{filename:'remote.js'});
  return {store,events,puts,banner};
}
test('frontend API adapter hydrates workspace and sends versioned writes',async()=>{
  const app=boot();await tick();assert.equal(app.store.remote,true);
  app.store.update(state=>{state.settings.company='New company';});
  await tick();assert.equal(app.puts.length,1);assert.equal(app.puts[0].revision,1);
  assert.equal(app.puts[0].state.settings.company,'New company');
  assert.equal(app.store.persistent,true);assert.equal(app.events.at(-1).status,'saved');
});
test('frontend API adapter preserves unsaved state on conflict without overwriting',async()=>{
  const app=boot({rejectPut:true});await tick();
  app.store.update(state=>{state.settings.company='Unsaved';});await tick();
  assert.equal(app.puts.length,1);assert.equal(app.store.persistent,false);
  assert.equal(app.store.state.settings.company,'Unsaved');
  assert.equal(app.events.at(-1).status,'error');
  assert.throws(()=>app.store.update(s=>{s.settings.company='Blocked';}),/NOT been saved/);
});
