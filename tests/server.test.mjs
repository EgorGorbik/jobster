import {test,after,before} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {createDatabase,createWorkspace,getWorkspace} from '../server/database.mjs';
import {bootstrap,createPassword} from '../server/auth.mjs';
import {makeServer} from '../server/index.mjs';

const dir=mkdtempSync(path.join(tmpdir(),'falcon-jobster-backend-'));
const db=createDatabase(path.join(dir,'test.sqlite'));
let server,origin,cookie='',newJob,newCandidate,newRevision;
const pass='correct-test-password-8463';
async function query(method,route,body,headers={},authCookie=cookie) {
  const options={method,headers:{...(authCookie?{Cookie:authCookie}:{}),...headers}};
  if (body!==undefined) {options.headers['Content-Type'] ||= 'application/json';options.body=JSON.stringify(body);}
  const response=await fetch(origin+route,options);
  const text=await response.text();let data;
  try{data=JSON.parse(text);}catch{data=text;}
  return {status:response.status,data,headers:response.headers};
}
const get=(route,authCookie=cookie)=>query('GET',route,undefined,{},authCookie);
const post=(route,body,headers={})=>query('POST',route,body,headers);
const patch=(route,body)=>query('PATCH',route,body);

before(async()=>{
  await bootstrap(db,{company:'Test Freight Hiring',name:'Test Owner',email:'owner@example.com',password:pass});
  server=makeServer({db,allowedOrigin:'http://localhost:7878'});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  origin=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{if(server) await new Promise(resolve=>server.close(resolve));db.close();rmSync(dir,{recursive:true,force:true});});

test('public health check and static frontend bootloader',async()=>{
  let r=await get('/api/healthz','');assert.equal(r.status,200);assert.equal(r.data.messaging,'disabled');
  const response=await fetch(origin+'/');const html=await response.text();
  assert.equal(response.status,200);assert.match(html,/src\/remote\.js/);assert.doesNotMatch(html,/src="\.\/app\.js"/);
  assert.match(response.headers.get('content-security-policy'),/connect-src 'self'/);
  assert.equal((await get('/server/database.mjs','')).status,404);
});
test('authentication required, no account enumeration, login cookie',async()=>{
  assert.equal((await get('/api/state','')).status,401);
  assert.equal((await query('POST','/api/auth/login',{email:'owner@example.com',password:'wrong'})).status,401);
  const signed=await query('POST','/api/auth/login',{email:'owner@example.com',password:pass});
  assert.equal(signed.status,200);assert.equal(signed.data.user.role,'Owner');
  const setCookie=signed.headers.get('set-cookie');assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/SameSite=Strict/);
  assert.doesNotMatch(setCookie,/Secure/);cookie=setCookie.split(';')[0];
  assert.equal((await get('/api/session')).data.user.email,'owner@example.com');
});
test('workspace empty by default and revision begins at 1',async()=>{
  const r=await get('/api/state');assert.equal(r.status,200);assert.equal(r.data.revision,1);
  assert.deepEqual(r.data.state.candidates,[]);assert.deepEqual(r.data.state.jobs,[]);
  assert.equal(r.data.state.team.length,1);assert.equal(r.data.state.settings.company,'Test Freight Hiring');
});
test('create job and candidate, persist and filter',async()=>{
  const job=await post('/api/jobs',{title:'CDL Driver',location:'Austin, TX',openings:2,department:'Operations',pay:'',owner:'Test Owner'});
  assert.equal(job.status,201);newJob=job.data.data.id;assert.equal(job.data.data.title,'CDL Driver');
  const c=await post('/api/candidates',{name:'Alex Test',email:'alex@example.com',jobId:newJob,location:'Texas',source:'Career site'});
  assert.equal(c.status,201);newCandidate=c.data.data.id;assert.equal(c.data.data.stage,'New');
  assert.equal((await get('/api/candidates?stage=New')).data.total,1);
  assert.equal((await get('/api/candidates?stage=Offer')).data.total,0);
  assert.equal((await get(`/api/candidates/${newCandidate}`)).data.data.email,'alex@example.com');
  assert.equal((await get('/api/reports')).data.candidates.byStage.New,1);
});
test('move stage, add notes, archive and restore',async()=>{
  const move=await post(`/api/candidates/${newCandidate}/stage`,{stage:'Interview'});
  assert.equal(move.status,200);assert.equal(move.data.data.stage,'Interview');
  assert.ok(move.data.data.history.some(h=>h.stage==='Interview'));
  // Moving to Interview auto-creates a calendar appointment.
  assert.equal((await get('/api/reports')).data.interviews.scheduled,1);
  assert.equal((await post(`/api/candidates/${newCandidate}/notes`,{notes:'Follow up on CDL'})).status,200);
  const archive=await post(`/api/candidates/${newCandidate}/archive`,{archived:true});
  assert.equal(archive.data.data.archived,true);assert.equal((await get('/api/reports')).data.candidates.total,0);
  assert.equal((await post(`/api/candidates/${newCandidate}/archive`,{archived:false})).status,200);
  assert.equal((await get('/api/reports')).data.candidates.byStage.Interview,1);
});
test('interviews, campaign definitions and draft messages never send',async()=>{
  // Candidate already has the auto calendar slot from Interview stage — add a second explicit one.
  const appointment=await post('/api/interviews',{candidateId:newCandidate,title:'Technical interview',startsAt:new Date(Date.now()+86400000).toISOString(),duration:30,format:'Video',interviewer:'Test Owner'});
  assert.equal(appointment.status,201);assert.equal(appointment.data.data.status,'Scheduled');
  const campaign=await post('/api/campaigns',{name:'Driver outreach',channel:'SMS',message:'Hello {{first_name}}',jobId:newJob});
  assert.equal(campaign.status,201);assert.equal(campaign.data.data.status,'Draft');
  const msg=await post('/api/messages',{candidateId:newCandidate,channel:'Email',subject:'Hello',body:'Draft only'});
  assert.equal(msg.status,201);assert.equal(msg.data.data.status,'Draft');
  assert.equal((await get('/api/healthz')).data.messaging,'disabled');
  assert.equal((await get('/api/reports')).data.interviews.scheduled,2);
});
test('invalid references rejected atomically and linked jobs protected',async()=>{
  const beforeState=await get('/api/state');const r=await patch(`/api/candidates/${newCandidate}`,{jobId:'missing-job'});
  assert.equal(r.status,422);
  assert.equal((await get(`/api/candidates/${newCandidate}`)).data.data.jobId,newJob);
  assert.equal((await query('DELETE',`/api/jobs/${newJob}`)).status,409);
  assert.equal((await query('DELETE',`/api/candidates/${newCandidate}`)).status,405);
  assert.equal((await get('/api/state')).data.revision,beforeState.data.revision);
});
test('optimistic revision concurrency protects users from lost updates',async()=>{
  const current=await get('/api/state');const beforeRevision=current.data.revision;
  const state=current.data.state;state.settings.company='Updated Freight Hiring';
  assert.equal((await query('PUT','/api/state',{revision:beforeRevision-1,state})).status,409);
  assert.equal((await query('PUT','/api/state',{state})).status,428);
  const ok=await query('PUT','/api/state',{revision:beforeRevision,state});assert.equal(ok.status,200);
  newRevision=ok.data.revision;assert.equal(newRevision,beforeRevision+1);
  assert.equal((await get('/api/workspace')).data.data.company,'Updated Freight Hiring');
  assert.equal((await query('PUT','/api/state',{revision:beforeRevision,state})).status,409);
});
test('rejects invalid state and unauthorized origins',async()=>{
  const latest=await get('/api/state');const malformed=structuredClone(latest.data.state);malformed.candidates[0].jobId='not-a-job';
  assert.equal((await query('PUT','/api/state',{revision:latest.data.revision,state:malformed})).status,422);
  assert.equal((await post('/api/jobs',{title:'Evil Origin'}, {'Origin':'https://evil.example'})).status,403);
  assert.equal((await query('POST','/api/jobs',{title:'Cross site'}, {'Sec-Fetch-Site':'cross-site'})).status,403);
  assert.equal((await query('POST','/api/jobs',{title:'Form request'}, {'Content-Type':'application/x-www-form-urlencoded'})).status,415);
  assert.equal((await get('/api/state')).data.revision,latest.data.revision);
});
test('tenant separation and viewer access restrictions',async()=>{
  const {salt,passwordHash}=await createPassword('second-workspace-password-44');
  createWorkspace(db,{company:'Second workspace',name:'Second owner',email:'second@example.com',salt,passwordHash});
  const second=await query('POST','/api/auth/login',{email:'second@example.com',password:'second-workspace-password-44'});
  const otherCookie=second.headers.get('set-cookie').split(';')[0];
  const other=await get('/api/state',otherCookie);assert.equal(other.status,200);assert.equal(other.data.state.candidates.length,0);
  assert.equal(other.data.state.settings.company,'Second workspace');
  assert.equal((await get('/api/state')).data.state.candidates.length,1);
  const viewer=await post('/api/users',{email:'viewer@example.com',name:'Read only',password:'viewer-password-34577',role:'Viewer'});
  assert.equal(viewer.status,201);
  const viewerLogin=await query('POST','/api/auth/login',{email:'viewer@example.com',password:'viewer-password-34577'});
  const viewerCookie=viewerLogin.headers.get('set-cookie').split(';')[0];
  assert.equal((await get('/api/state',viewerCookie)).status,200);
  assert.equal((await query('POST','/api/jobs',{title:'No access'}, {}, viewerCookie)).status,403);
  assert.equal((await query('PUT','/api/state',{revision:1,state:other.data.state}, {}, viewerCookie)).status,403);
  assert.equal((await get('/api/audit',viewerCookie)).status,403);
});
test('session logout revokes token, audit is server-side and persisted',async()=>{
  const entries=await get('/api/audit');assert.equal(entries.status,200);
  assert.ok(entries.data.items.some(x=>x.action==='workspace.sync'));
  const dbCopy=getWorkspace(db,(await get('/api/session')).data.user.workspaceId);
  assert.equal(dbCopy.state.settings.company,'Updated Freight Hiring');
  assert.equal((await post('/api/auth/logout',{})).status,200);
  assert.equal((await get('/api/state')).status,401);
});
