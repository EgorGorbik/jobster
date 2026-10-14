/* Server-hosted bootloader: the original standalone HTML still runs entirely locally. */
(function () {
  'use strict';
  const store=window.FalconStore, i18n=window.FalconI18n;
  const labels={
    en:{title:'Sign in to Falcon Jobster',subtitle:'Your recruiting workspace is protected by a server session.',email:'Email',password:'Password',signIn:'Sign in',loading:'Connecting to server...',bad:'Unable to sign in. Check your credentials.',retry:'Retry',offline:'Cannot connect to the backend.',saved:'Saved to server',pending:'Saving changes...',failed:'Changes have NOT been saved on the server.',export:'Export unsaved JSON',reload:'Discard local edits and reload server data',logout:'Sign out',readonly:'The full workspace interface requires an Owner, Admin, or Recruiter account.',conflict:'Another session changed these records. Export your unsaved work before reloading.',changes:'Your latest edits are not yet confirmed by the server.'},
    ru:{title:'\u0412\u0445\u043e\u0434 \u0432 Falcon Jobster',subtitle:'\u0414\u0430\u043d\u043d\u044b\u0435 \u0437\u0430\u0449\u0438\u0449\u0435\u043d\u044b \u0441\u0435\u0440\u0432\u0435\u0440\u043d\u043e\u0439 \u0441\u0435\u0441\u0441\u0438\u0435\u0439.',email:'\u042d\u043b. \u043f\u043e\u0447\u0442\u0430',password:'\u041f\u0430\u0440\u043e\u043b\u044c',signIn:'\u0412\u043e\u0439\u0442\u0438',loading:'\u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u0435 \u043a \u0441\u0435\u0440\u0432\u0435\u0440\u0443...',bad:'\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0432\u043e\u0439\u0442\u0438. \u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u0434\u0430\u043d\u043d\u044b\u0435.',retry:'\u041f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u044c',offline:'\u041d\u0435\u0442 \u0441\u0432\u044f\u0437\u0438 \u0441 backend.',saved:'\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u043e \u043d\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435',pending:'\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435...',failed:'\u0418\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f \u041d\u0415 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u044b \u043d\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435.',export:'\u042d\u043a\u0441\u043f\u043e\u0440\u0442 JSON',reload:'\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c \u043f\u0440\u0430\u0432\u043a\u0438 \u0438 \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0441 \u0441\u0435\u0440\u0432\u0435\u0440\u0430',logout:'\u0412\u044b\u0439\u0442\u0438',readonly:'\u0414\u043b\u044f \u0440\u0430\u0431\u043e\u0442\u044b \u0432 \u0438\u043d\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u0435 \u043d\u0443\u0436\u043d\u0430 \u0440\u043e\u043b\u044c Owner, Admin \u0438\u043b\u0438 Recruiter.',conflict:'\u0414\u0440\u0443\u0433\u0430\u044f \u0441\u0435\u0441\u0441\u0438\u044f \u0438\u0437\u043c\u0435\u043d\u0438\u043b\u0430 \u0434\u0430\u043d\u043d\u044b\u0435. \u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u0435 \u043a\u043e\u043f\u0438\u044e \u043f\u0435\u0440\u0435\u0434 \u043f\u0435\u0440\u0435\u0437\u0430\u0433\u0440\u0443\u0437\u043a\u043e\u0439.',changes:'\u0418\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f \u0435\u0449\u0435 \u043d\u0435 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u044b \u0441\u0435\u0440\u0432\u0435\u0440\u043e\u043c.'}
  };
  const t=key=>labels[i18n.language]?.[key]||labels.en[key];
  const $=selector=>document.querySelector(selector);
  let state=null, revision=0, generation=0, savedGeneration=0, activeSave=false, blocked=false, failure='', appLoaded=false;
  const root=$('#root');
  const banner=document.createElement('div');banner.id='jobster-remote-banner';banner.setAttribute('role','status');banner.hidden=true;document.body.append(banner);
  async function call(url,options={}) {
    const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});
    let result;try {result=await response.json();} catch {result={};}
    if (!response.ok) { const error=new Error(result.error||`Server error (${response.status})`);error.status=response.status;throw error; }
    return result;
  }
  function loginView(error='') {
    document.documentElement.lang=i18n.language;
    root.innerHTML=`<main class="remote-entry"><section class="remote-entry-panel"><div class="remote-symbol" aria-hidden="true">F</div><div class="remote-entry-top"><strong>FALCON JOBSTER</strong><div class="remote-entry-langs"><button type="button" data-remote-lang="en" aria-pressed="${i18n.language==='en'}">EN</button><button type="button" data-remote-lang="ru" aria-pressed="${i18n.language==='ru'}">RU</button></div></div><h1>${t('title')}</h1><p>${t('subtitle')}</p><form id="remote-login" autocomplete="on"><label>${t('email')}<input type="email" name="email" autocomplete="username" maxlength="254" required autofocus></label><label>${t('password')}<input type="password" name="password" autocomplete="current-password" required></label><p class="remote-entry-error" id="remote-login-error" role="alert">${error}</p><button type="submit" class="primary">${t('signIn')}</button></form><small>${i18n.language==='ru' ? 'Сервер не отправляет email, SMS или приглашения в календарь.' : 'No email, SMS or calendar invitations are sent by this server.'}</small></section></main>`;
    const form=$('#remote-login');
    form.addEventListener('submit',async(event)=>{
      event.preventDefault(); const button=form.querySelector('button[type=submit]');button.disabled=true;
      const data=new FormData(form);
      try {await call('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:data.get('email'),password:data.get('password')})});await loadSession();}
      catch(e){$('#remote-login-error').textContent=e.status===401?t('bad'):e.message||t('offline');button.disabled=false;}
    });
    root.querySelectorAll('[data-remote-lang]').forEach(button=>button.addEventListener('click',()=>{const email=form.elements.email.value;i18n.setLanguage(button.dataset.remoteLang);loginView(error);$('#remote-login').elements.email.value=email;}));
  }
  function remoteBanner() {
    if (!state) return;
    const pending=generation!==savedGeneration;
    banner.hidden=!pending&&!blocked;
    if (banner.hidden) {banner.replaceChildren();return;}
    const msg=document.createElement('span');msg.textContent=blocked?`${t('failed')} ${failure}`:t('pending');
    banner.replaceChildren(msg);
    if(blocked){
      const download=document.createElement('button');download.textContent=t('export');download.onclick=downloadUnsaved;
      const reload=document.createElement('button');reload.textContent=t('reload');reload.onclick=()=>{if(confirm(t('reload'))) location.reload();};
      banner.append(download,reload);
    }
  }
  function downloadUnsaved() {
    const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='jobster-unsaved-backup.json';a.click();
    setTimeout(()=>URL.revokeObjectURL(url),3000);
  }
  function changed(status,error='') {document.dispatchEvent(new CustomEvent('falcon:remote-sync',{detail:{status,error}}));}
  async function flush() {
    if (activeSave||blocked||generation===savedGeneration) return;
    activeSave=true;
    try {
      while(generation!==savedGeneration&&!blocked){
        const sentGeneration=generation,snapshot=structuredClone(state);
        const result=await call('/api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,state:snapshot})});
        revision=result.revision;savedGeneration=sentGeneration;
      }
      if(!blocked)changed('saved');
    }catch(e){
      blocked=true;
      failure=e.status===409?t('conflict'):e.message||t('offline');
      changed('error',failure);
    }finally{activeSave=false;remoteBanner();}
  }
  function queue() {generation++;remoteBanner();queueMicrotask(flush);}
  function hydrate(snapshot) {
    if(!store.validate(snapshot.state)) throw Error('Invalid workspace data from server');
    state=structuredClone(snapshot.state);revision=snapshot.revision;
    generation=savedGeneration=0;blocked=false;failure='';
    Object.defineProperty(store,'state',{configurable:true,get:()=>state});
    Object.defineProperty(store,'persistent',{configurable:true,get:()=>!blocked&&generation===savedGeneration});
    Object.defineProperty(store,'warning',{configurable:true,get:()=>blocked?`${t('failed')} ${failure}`:''});
    store.remote=true;
    store.KEY='falcon-jobster:remote-only';
    store.update=mutator=>{
      if(blocked) throw Error(`${t('failed')} ${failure}`);
      const next=structuredClone(state);mutator(next);
      if(!store.validate(next)) throw Error('Invalid workspace data');
      state=next;queue();return true;
    };
    store.restore=data=>{if(blocked) throw Error(failure);if(!store.validate(data)) throw Error('Invalid backup');state=structuredClone(data);queue();return true;};
    store.reset=()=>{throw Error('Reset is disabled for the server workspace. Use the export/restore workflow.');};
    store.reload=()=>{};
    store.pullRemote=async()=>{
      if(generation!==savedGeneration){location.reload();return false;}
      const snapshot=await call('/api/state');
      hydrate(snapshot);
      document.dispatchEvent(new CustomEvent('falcon:remote-pulled',{detail:{revision}}));
      return true;
    };
    store.snapshot=()=>structuredClone(state);
    remoteBanner();
  }
  async function loadSession() {
    const session=await call('/api/session');
    if(!['Owner','Admin','Recruiter'].includes(session.user.role)) {
      loginView(t('readonly'));
      const b=document.createElement('button');b.className='secondary';b.textContent=t('logout');b.onclick=signOut;
      root.querySelector('.remote-entry-panel').append(b);
      return;
    }
    const snapshot=await call('/api/state');
    window.FalconSession=session.user;
    hydrate(snapshot);
    if(!appLoaded){appLoaded=true;const script=document.createElement('script');script.src='/app.js';script.onerror=()=>{root.textContent=t('offline');};document.body.append(script);}
    else location.reload();
  }
  async function signOut(){
    if(generation!==savedGeneration && !confirm(t('changes'))) return;
    try{await call('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});}finally{location.reload();}
  }
  document.addEventListener('click',event=>{
    const trigger=event.target.closest('[data-action="remote-logout"]');
    if(trigger){event.preventDefault();event.stopImmediatePropagation();void signOut();}
  },true);
  window.addEventListener('beforeunload',event=>{
    if(state&&generation!==savedGeneration){event.preventDefault();event.returnValue='';}
  });
  root.innerHTML=`<div class="remote-loading" role="status">${t('loading')}</div>`;
  loadSession().catch(error=>{if(error.status===401) loginView();else loginView(error.message||t('offline'));});
})();
