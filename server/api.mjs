import {randomUUID} from 'node:crypto';
import {getWorkspace,saveWorkspace,mutateWorkspace,listAudit} from './database.mjs';
import {login,sessionUser,logout,cookieHeader,clearCookieHeader,changePassword,addUser} from './auth.mjs';
import {clone,validateWorkspace,validateRecord,ValidationError,STAGES} from './validation.mjs';
import {normalizeJobPublicFields} from './job-public.mjs';
import {sendInterviewInvite} from './mail.mjs';
import {sendInterviewTelegram} from './telegram.mjs';
import {ensureScheduledInterview, promoteToInterview} from './interview-slot.mjs';

const RESOURCES=['jobs','candidates','interviews','campaigns','messages','team'];
const writeMethods=['POST','PUT','PATCH','DELETE'];
const allowWrite = user => ['Owner','Admin','Recruiter'].includes(user.role);
const allowAdmin = user => ['Owner','Admin'].includes(user.role);
const iso = () => new Date().toISOString();
const freshId = () => randomUUID();
const present = (value) => value!==undefined && value!==null;
const notFound = () => {throw new ValidationError('Record not found',404);};
const asString = v => typeof v === 'string' ? v : '';
const wanted = (obj,keys) => Object.fromEntries(keys.filter(k=>Object.hasOwn(obj,k)).map(k=>[k,obj[k]]));
const maxJSON = 4*1024*1024;

function json(res,status,value,extra={}) {
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra});
  res.end(JSON.stringify(value));
}
function requireRole(user,allow) {
  if (!user || !allow(user)) throw new ValidationError('Insufficient permissions',403);
}
function readRevision(req,body) {
  const match=req.headers['if-match'];
  const fromHeader=typeof match === 'string' && /^"?[0-9]+"?$/.test(match) ? Number(match.replaceAll('"','')) : undefined;
  if (match && fromHeader === undefined) throw new ValidationError('Invalid If-Match header',400);
  const revision=fromHeader??body?.revision;
  if (revision !== undefined && (!Number.isSafeInteger(revision) || revision<1)) throw new ValidationError('Invalid revision',400);
  return revision;
}
async function readJSON(req) {
  const contentType=String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') throw new ValidationError('Content-Type must be application/json',415);
  let length=0; const chunks=[];
  for await (const chunk of req) {
    length+=chunk.length;
    if (length>maxJSON) throw new ValidationError('Request body is too large (4 MB limit)',413);
    chunks.push(chunk);
  }
  if (!length) throw new ValidationError('JSON body is required',400);
  let body;
  try {body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch {throw new ValidationError('Invalid JSON',400);}
  if (!body || typeof body!=='object' || Array.isArray(body)) throw new ValidationError('JSON object required',400);
  return body;
}
function makeRecord(kind,body) {
  const now=iso(), id=freshId();
  switch (kind) {
    case 'jobs': return normalizeJobPublicFields({id,title:asString(body.title),department:asString(body.department),location:asString(body.location),openings:body.openings??1,status:body.status||'Active',pay:asString(body.pay),owner:asString(body.owner),description:asString(body.description),publicSlug:asString(body.publicSlug),landingLayout:body.landingLayout||'classic',publicEnabled:body.publicEnabled!==false,createdAt:now});
    case 'candidates': return {id,name:asString(body.name),jobId:body.jobId,location:asString(body.location),source:asString(body.source),rating:body.rating??null,stage:body.stage||'New',email:asString(body.email),phone:asString(body.phone),telegram:asString(body.telegram).replace(/^@/,''),telegramChatId:asString(body.telegramChatId),telegramLinkedAt:asString(body.telegramLinkedAt),experience:asString(body.experience),owner:asString(body.owner),tags:body.tags??[],notes:asString(body.notes),favorite:false,archived:false,color:'#deebe6',createdAt:now,updatedAt:now,history:[{id:freshId(),type:'created',text:'Candidate created',stage:'New',at:now}]};
    case 'interviews':return {id,candidateId:body.candidateId,title:asString(body.title),startsAt:body.startsAt,duration:body.duration??30,format:body.format||'Video',location:asString(body.location),interviewer:asString(body.interviewer),status:'Scheduled',notes:asString(body.notes),createdAt:now};
    case 'campaigns':return {id,name:asString(body.name),message:asString(body.message),jobId:body.jobId||'All',stage:body.stage||'All',audience:body.audience||'All',channel:body.channel||'Email',status:'Draft',createdAt:now,updatedAt:now};
    case 'messages':return {id,candidateId:body.candidateId,channel:body.channel||'Email',subject:asString(body.subject),body:asString(body.body),status:'Draft',createdAt:now};
    case 'team':return {id,name:asString(body.name),email:asString(body.email),role:body.role||'Recruiter',status:'Directory entry'};
    default:throw new ValidationError('Unsupported resource',404);
  }
}
const PATCH_FIELDS={
  jobs:['title','department','location','openings','status','pay','owner','description','publicSlug','landingLayout','publicEnabled'],
  candidates:['name','jobId','location','source','rating','email','phone','telegram','experience','owner','tags','notes','favorite'],
  interviews:['title','candidateId','startsAt','duration','format','location','interviewer','status','notes'],
  campaigns:['name','message','jobId','stage','audience','channel','status'],
  messages:['candidateId','subject','body','channel'],
  team:['name','email','role','status']
};
function addHistory(candidate,type,text,stage) {
  candidate.updatedAt=iso();
  candidate.history.push({id:freshId(),type,text,at:candidate.updatedAt,...(stage?{stage}:{})});
  if (candidate.history.length>500) candidate.history.splice(0,candidate.history.length-500);
}
function log(state,message) {
  state.activity.unshift({id:freshId(),text:message.slice(0,1000),at:iso(),read:false});
  state.activity=state.activity.slice(0,200);
}
function filterRecords(kind,records,url) {
  let selected=records;
  const q=String(url.searchParams.get('q')||'').toLowerCase().slice(0,120);
  if (q) selected=selected.filter(x=>Object.values(x).some(value=>typeof value === 'string' && value.toLowerCase().includes(q)));
  const matchKeys={candidates:['jobId','stage','archived','source'],jobs:['status'],interviews:['candidateId','status'],campaigns:['jobId','status','channel'],messages:['candidateId'],team:['role']}[kind]||[];
  for (const key of matchKeys) if (url.searchParams.has(key)) {
    const expected=url.searchParams.get(key);
    selected=selected.filter(x=>String(x[key])===expected);
  }
  const total=selected.length;
  const offset=Number(url.searchParams.get('offset')||0);
  const limit=Number(url.searchParams.get('limit')||50);
  if (!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>200) throw new ValidationError('Pagination: limit must be 1-200 and offset >= 0',400);
  return {items:selected.slice(offset,offset+limit),total,limit,offset};
}
function assertSafeMutation(req,options) {
  const origin=req.headers.origin;
  if (req.headers['sec-fetch-site']==='cross-site') throw new ValidationError('Cross-site request rejected',403);
  if (origin) {
    let declared=options.allowedOrigin;
    if (!declared) declared=`${options.cookieSecure?'https':'http'}://${req.headers.host}`;
    if (origin!==declared) throw new ValidationError('Origin check failed',403);
  }
}
export async function handleApi(req,res,db,url,options={}) {
  const method=req.method||'GET', pathname=url.pathname;
  if (pathname==='/api/healthz' && method==='GET') return json(res,200,{status:'ok',database:'sqlite',messaging:'disabled'});
  if (writeMethods.includes(method)) assertSafeMutation(req,options);
  if (pathname==='/api/auth/login' && method==='POST') {
    const body=await readJSON(req);
    const session=await login(db,body.email,body.password,req.socket.remoteAddress||'unknown');
    return json(res,200,{user:session.user,expiresAt:session.expiresAt}, {'Set-Cookie':cookieHeader(session.token,options.cookieSecure)});
  }
  const user=sessionUser(db,req.headers.cookie);
  if (!user) throw new ValidationError('Authentication required',401);
  if (pathname==='/api/session' && method==='GET') return json(res,200,{user});
  if (pathname==='/api/auth/logout' && method==='POST') {
    logout(db,req.headers.cookie);
    return json(res,200,{ok:true},{'Set-Cookie':clearCookieHeader(options.cookieSecure)});
  }
  if (pathname==='/api/auth/password' && method==='POST') {
    const body=await readJSON(req);
    await changePassword(db,user.id,body.currentPassword,body.newPassword);
    return json(res,200,{ok:true,signedOut:true},{'Set-Cookie':clearCookieHeader(options.cookieSecure)});
  }
  if (pathname==='/api/users' && method==='GET') {
    requireRole(user,allowAdmin);
    const users=db.prepare('SELECT id,name,email,role,disabled,created_at AS createdAt FROM users WHERE workspace_id=? ORDER BY created_at').all(user.workspaceId);
    return json(res,200,{items:users});
  }
  if (pathname==='/api/users' && method==='POST') {
    requireRole(user,u=>u.role==='Owner');
    const body=await readJSON(req);
    const created=await addUser(db,user.workspaceId,body);
    return json(res,201,{data:created});
  }
  if (pathname==='/api/audit' && method==='GET') {
    requireRole(user,allowAdmin);
    const result=listAudit(db,user.workspaceId,Number(url.searchParams.get('limit')||50));
    return json(res,200,{items:result});
  }
  if (pathname==='/api/state' || pathname==='/api/workspace/state') {
    if (method==='GET') return json(res,200,{...getWorkspace(db,user.workspaceId),user});
    if (method==='PUT') {
      requireRole(user,allowAdmin);
      const body=await readJSON(req);
      const revision=readRevision(req,body);
      if (revision===undefined) throw new ValidationError('A revision is required to protect against overwriting changes',428);
      const result=saveWorkspace(db,user.workspaceId,body.state,revision,user.id,'workspace.sync');
      return json(res,200,{revision:result.revision});
    }
  }
  if (pathname==='/api/workspace') {
    if (method==='GET') {
      const {state,revision}=getWorkspace(db,user.workspaceId);
      return json(res,200,{data:state.settings,revision});
    }
    if (method==='PATCH') {
      requireRole(user,allowAdmin);const body=await readJSON(req);
      const revision=readRevision(req,body);
      const result=mutateWorkspace(db,user.workspaceId,revision,user.id,'workspace.settings',state=>{
        const patch=wanted(body,['company','website','timezone','logo','digest','interview','offers']);
        Object.assign(state.settings,patch);
        return clone(state.settings);
      });
      return json(res,200,result);
    }
  }
  if (pathname==='/api/reports' && method==='GET') {
    const {state,revision}=getWorkspace(db,user.workspaceId);
    const candidates=state.candidates.filter(c=>!c.archived);
    const counts=Object.fromEntries(STAGES.map(stage=>[stage,candidates.filter(x=>x.stage===stage).length]));
    const bySource={};
    for (const c of candidates) bySource[c.source]=(bySource[c.source]||0)+1;
    return json(res,200,{revision,candidates:{total:candidates.length,archived:state.candidates.length-candidates.length,byStage:counts,bySource},jobs:{total:state.jobs.length,active:state.jobs.filter(j=>j.status==='Active').length},interviews:{scheduled:state.interviews.filter(i=>i.status==='Scheduled').length},campaigns:{draft:state.campaigns.filter(c=>c.status==='Draft').length},note:'Counts are derived from persisted records; no messages have been sent.'});
  }
  if (pathname==='/api/activity' && method==='GET') return json(res,200,filterRecords('activity',getWorkspace(db,user.workspaceId).state.activity,url));
  const parts=pathname.split('/').filter(Boolean);
  const kind=parts[1], recordId=parts[2], command=parts[3];
  if (parts[0]!=='api'|| !RESOURCES.includes(kind) || parts.length>4) throw new ValidationError('Endpoint not found',404);
  if (kind==='team' && writeMethods.includes(method)) requireRole(user,allowAdmin);
  else if (writeMethods.includes(method)) requireRole(user,allowWrite);
  if (method==='GET') {
    const {state,revision}=getWorkspace(db,user.workspaceId);
    if (!recordId) return json(res,200,{...filterRecords(kind,state[kind],url),revision});
    if (command) throw new ValidationError('Endpoint not found',404);
    const value=state[kind].find(x=>x.id===recordId);
    if (!value) notFound();
    return json(res,200,{data:value,revision});
  }
  if (method==='POST' && !recordId) {
    const body=await readJSON(req);const revision=readRevision(req,body);
    let mailMeta=null;
    const result=mutateWorkspace(db,user.workspaceId,revision,user.id,`${kind}.create`,state=>{
      const record=makeRecord(kind,body);
      validateRecord(kind,record,state);
      state[kind].push(record);
      log(state,`${kind} record created`);
      if (kind==='interviews') {
        const candidate=state.candidates.find(c=>c.id===record.candidateId);
        if (candidate && promoteToInterview(candidate)) {
          addHistory(candidate,'stage','Moved to Interview (interview scheduled)','Interview');
        }
        if (candidate) addHistory(candidate,'interview',`${record.title} scheduled`);
        const job=candidate ? state.jobs.find(j=>j.id===candidate.jobId) : null;
        mailMeta={
          candidate: candidate ? {
            name:candidate.name,
            email:candidate.email,
            telegramChatId:candidate.telegramChatId||''
          } : null,
          jobTitle: job?.title || null,
          interview: record,
          company: state.settings?.company || 'Falcon Jobster'
        };
      }
      return record;
    });
    if (kind==='interviews' && mailMeta?.candidate) {
      let email={skipped:true};
      let telegram={skipped:true};
      if (mailMeta.candidate.email) {
        try { email=await sendInterviewInvite(mailMeta); }
        catch (err) { email={delivered:false,error:err.message||String(err)}; }
      }
      if (mailMeta.candidate.telegramChatId) {
        try { telegram=await sendInterviewTelegram(mailMeta); }
        catch (err) { telegram={delivered:false,error:err.message||String(err)}; }
      }
      return json(res,201,{...result,email,telegram});
    }
    return json(res,201,result);
  }
  if (recordId && !/^[A-Za-z0-9_-]{1,128}$/.test(recordId)) throw new ValidationError('Invalid id',400);
  if (recordId && method==='POST' && kind==='candidates' && ['stage','archive','notes'].includes(command)) {
    const body=await readJSON(req);const revision=readRevision(req,body);
    const result=mutateWorkspace(db,user.workspaceId,revision,user.id,`candidate.${command}`,state=>{
      const c=state.candidates.find(x=>x.id===recordId);
      if (!c) notFound();
      if (command==='stage') {
        if (!STAGES.includes(body.stage)) throw new ValidationError('Unknown candidate stage');
        c.stage=body.stage;addHistory(c,'stage',`Moved to ${c.stage}`,c.stage);
        if (body.stage==='Interview') {
          const slot=ensureScheduledInterview(state,c);
          if (slot) addHistory(c,'interview',`${slot.title} added to calendar`);
        }
      }
      if (command==='archive') {
        if (typeof body.archived!=='boolean') throw new ValidationError('archived must be boolean');
        c.archived=body.archived;addHistory(c,'archive',body.archived?'Candidate archived':'Candidate restored');
      }
      if (command==='notes') {
        if (typeof body.notes!=='string') throw new ValidationError('notes must be a string');
        c.notes=body.notes;addHistory(c,'note','Recruiter notes updated');
      }
      log(state,`Candidate ${command} updated`);
      return c;
    });
    return json(res,200,result);
  }
  if (recordId && !command && method==='PATCH') {
    const body=await readJSON(req);const revision=readRevision(req,body);
    const result=mutateWorkspace(db,user.workspaceId,revision,user.id,`${kind}.update`,state=>{
      const record=state[kind].find(x=>x.id===recordId);
      if (!record) notFound();
      const changes=wanted(body,PATCH_FIELDS[kind]);
      if (!Object.keys(changes).length) throw new ValidationError('No writable fields supplied');
      if (kind==='candidates' && typeof changes.telegram==='string') {
        changes.telegram=changes.telegram.trim().replace(/^@/,'');
      }
      Object.assign(record,changes);
      if (kind==='jobs') normalizeJobPublicFields(record);
      if (kind==='candidates') addHistory(record,'edited','Candidate details updated');
      if (kind==='campaigns') record.updatedAt=iso();
      log(state,`${kind} record updated`);
      return record;
    });
    return json(res,200,result);
  }
  if (recordId && !command && method==='DELETE') {
    if (kind==='candidates') throw new ValidationError('Use archive instead of deleting a candidate',405);
    const body=await readOptionalBody(req);
    const revision=readRevision(req,body);
    const result=mutateWorkspace(db,user.workspaceId,revision,user.id,`${kind}.delete`,state=>{
      const record=state[kind].find(x=>x.id===recordId);
      if (!record) notFound();
      if (kind==='jobs' && (state.candidates.some(c=>c.jobId===recordId) || state.campaigns.some(c=>c.jobId===recordId))) throw new ValidationError('Job has linked candidates or campaigns',409);
      if (kind==='team' && state.team.length===1) throw new ValidationError('Cannot remove last team directory entry',409);
      state[kind]=state[kind].filter(x=>x.id!==recordId);
      log(state,`${kind} record deleted`);
      return {id:recordId,deleted:true};
    });
    return json(res,200,result);
  }
  throw new ValidationError('Endpoint not found',404);
}
async function readOptionalBody(req) {
  if (!req.headers['content-length'] && !req.headers['transfer-encoding']) return {};
  return readJSON(req);
}
export function handleError(error,res) {
  if (res.headersSent) {res.end();return;}
  const status=error instanceof ValidationError ? error.status : 500;
  if (status===500) console.error('Jobster API error:',error);
  json(res,status,{error:status===500?'Internal server error':error.message});
}
