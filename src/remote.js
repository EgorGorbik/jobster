/* Server-hosted bootloader: the original standalone HTML still runs entirely locally. */
(function () {
  'use strict';
  const store=window.FalconStore, i18n=window.FalconI18n;
  const labels={
    en:{
      title:'Sign in to Falcon Jobster',subtitle:'Password, then a one-time code by email or SMS.',
      email:'Email',phone:'Phone',password:'Password',signIn:'Continue',
      byEmail:'Email',bySms:'SMS',codeTitle:'Enter the code',codeLabel:'6-digit code',confirm:'Confirm',resend:'Resend code',back:'Back',
      sentEmail:'Code sent to {0}.',sentSms:'SMS sent to {0}.',
      noPhone:'No phone on this account. Sign in by email, then save a phone in Settings.',
      badPhone:'Enter the phone in international format, for example +375291112233.',
      bad:'Unable to sign in. Check your credentials.',badCode:'That code is not valid.',expired:'Code expired. Request a new one.',
      rate:'Too many attempts. Try again later.',wait:'Wait a moment before requesting another code.',emailOff:'Email codes are unavailable.',smsOff:'SMS codes are unavailable.',
      emailFail:'Could not send the email code.',smsFail:'Could not send the SMS code.',
      smsHint:'The number must already be saved on the account. First sign-in is by email.',
      loading:'Connecting to server...',retry:'Retry',offline:'Cannot connect to the backend.',
      saved:'Saved to server',pending:'Saving changes...',failed:'Changes have NOT been saved on the server.',
      export:'Export unsaved JSON',reload:'Discard local edits and reload server data',logout:'Sign out',
      readonly:'The full workspace interface requires an Owner, Admin, or Recruiter account.',
      conflict:'Another session changed these records. Export your unsaved work before reloading.',
      changes:'Your latest edits are not yet confirmed by the server.',
      footnote:'Email via Resend, SMS via Twilio, when configured. Calendar invitations are not sent.'
    },
    ru:{
      title:'Вход в Falcon Jobster',subtitle:'Пароль, затем разовый код на почту или в SMS.',
      email:'Эл. почта',phone:'Телефон',password:'Пароль',signIn:'Продолжить',
      byEmail:'Почта',bySms:'SMS',codeTitle:'Введите код',codeLabel:'Код из 6 цифр',confirm:'Подтвердить',resend:'Отправить код ещё раз',back:'Назад',
      sentEmail:'Код отправлен на {0}.',sentSms:'SMS отправлено на {0}.',
      noPhone:'На аккаунте нет телефона. Войдите по почте и сохраните номер в настройках.',
      badPhone:'Введите телефон в международном формате, например +375291112233.',
      bad:'Не удалось войти. Проверьте данные.',badCode:'Неверный код.',expired:'Код истёк. Запросите новый.',
      rate:'Слишком много попыток. Попробуйте позже.',wait:'Подождите немного перед повторной отправкой.',emailOff:'Коды на почту сейчас недоступны.',smsOff:'SMS-коды сейчас недоступны.',
      emailFail:'Не удалось отправить код на почту.',smsFail:'Не удалось отправить SMS.',
      smsHint:'Номер уже должен быть сохранён в аккаунте. Первый вход — по почте.',
      loading:'Подключение к серверу...',retry:'Повторить',offline:'Нет связи с backend.',
      saved:'Сохранено на сервере',pending:'Сохранение...',failed:'Изменения НЕ сохранены на сервере.',
      export:'Экспорт JSON',reload:'Отменить правки и загрузить с сервера',logout:'Выйти',
      readonly:'Для работы в интерфейсе нужна роль Owner, Admin или Recruiter.',
      conflict:'Другая сессия изменила данные. Сохраните копию перед перезагрузкой.',
      changes:'Изменения ещё не подтверждены сервером.',
      footnote:'Почта через Resend, SMS через Twilio, если они настроены. Календарные приглашения не отправляются.'
    }
  };
  const t=key=>labels[i18n.language]?.[key]||labels.en[key];
  const $=selector=>document.querySelector(selector);
  let state=null, revision=0, generation=0, savedGeneration=0, activeSave=false, blocked=false, failure='', appLoaded=false;
  const draft={channel:'email',email:'',phone:'',password:'',error:''};
  let pendingCode=null;
  const root=$('#root');
  const banner=document.createElement('div');banner.id='jobster-remote-banner';banner.setAttribute('role','status');banner.hidden=true;document.body.append(banner);
  async function call(url,options={}) {
    const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});
    let result;try {result=await response.json();} catch {result={};}
    if (!response.ok) { const error=new Error(result.error||`Server error (${response.status})`);error.status=response.status;throw error; }
    return result;
  }
  function entryShell(body) {
    document.documentElement.lang=i18n.language;
    root.innerHTML=`<main class="remote-entry"><section class="remote-entry-panel"><div class="remote-symbol" aria-hidden="true">F</div><div class="remote-entry-top"><strong>FALCON JOBSTER</strong><div class="remote-entry-langs"><button type="button" data-remote-lang="en" aria-pressed="${i18n.language==='en'}">EN</button><button type="button" data-remote-lang="ru" aria-pressed="${i18n.language==='ru'}">RU</button></div></div>${body}</section></main>`;
  }
  function bindLang(render) {
    root.querySelectorAll('[data-remote-lang]').forEach(button=>button.addEventListener('click',()=>{i18n.setLanguage(button.dataset.remoteLang);render();}));
  }
  function loginFailure(error, channel) {
    if (error.status===401) return t('bad');
    if (error.status===429) return /wait/i.test(String(error.message||''))?t('wait'):t('rate');
    if (error.status===503) return channel==='sms'?t('smsOff'):t('emailOff');
    if (error.status===502) return channel==='sms'?t('smsFail'):t('emailFail');
    if (error.status===400) {
      const message=String(error.message||'');
      if (/no phone/i.test(message)) return t('noPhone');
      if (/international|format/i.test(message)) return t('badPhone');
      if (/expired/i.test(message)) return t('expired');
      return t('badCode');
    }
    return error.message||t('offline');
  }
  function syncLoginChannel(form) {
    const sms=form.elements.channel.value==='sms';
    form.elements.email.closest('label').hidden=sms;
    form.elements.phone.closest('label').hidden=!sms;
    form.querySelector('[data-sms-hint]').hidden=!sms;
    form.elements.email.required=!sms;
    form.elements.phone.required=sms;
  }
  function readLoginDraft(form) {
    draft.channel=form.elements.channel.value==='sms'?'sms':'email';
    draft.email=form.elements.email.value;
    draft.phone=form.elements.phone.value;
    draft.password=form.elements.password.value;
  }
  function loginView(error) {
    if (typeof error==='string') draft.error=error;
    pendingCode=null;
    const sms=draft.channel==='sms';
    entryShell(`<h1>${t('title')}</h1><p>${t('subtitle')}</p><form id="remote-login" autocomplete="on"><div class="remote-channels" role="radiogroup" aria-label="${t('title')}"><label><input type="radio" name="channel" value="email" ${sms?'':'checked'}>${t('byEmail')}</label><label><input type="radio" name="channel" value="sms" ${sms?'checked':''}>${t('bySms')}</label></div><label>${t('email')}<input type="email" name="email" autocomplete="username" maxlength="254" value="${escapeAttr(draft.email)}" ${sms?'':'required autofocus'}></label><label ${sms?'':'hidden'}>${t('phone')}<input type="tel" name="phone" autocomplete="tel" maxlength="40" inputmode="tel" placeholder="+375291112233" value="${escapeAttr(draft.phone)}" ${sms?'required autofocus':''}></label><p class="field-hint" data-sms-hint ${sms?'':'hidden'}>${t('smsHint')}</p><label>${t('password')}<input type="password" name="password" autocomplete="current-password" required value="${escapeAttr(draft.password)}"></label><p class="remote-entry-error" id="remote-login-error" role="alert">${escapeText(draft.error)}</p><button type="submit" class="primary">${t('signIn')}</button></form><small>${t('footnote')}</small>`);
    const form=$('#remote-login');
    syncLoginChannel(form);
    form.elements.channel.forEach(input=>input.addEventListener('change',()=>{readLoginDraft(form);syncLoginChannel(form);}));
    form.addEventListener('submit',async(event)=>{
      event.preventDefault(); readLoginDraft(form);
      const button=form.querySelector('button[type=submit]');button.disabled=true;
      const payload=draft.channel==='sms'
        ? {phone:draft.phone,password:draft.password,channel:'sms'}
        : {email:draft.email,password:draft.password,channel:'email'};
      try {
        const result=await call('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        draft.password='';
        if (result.mfa && result.challenge) {codeView(result);return;}
        if (result.mfa) {draft.error=draft.channel==='sms'?t('smsOff'):t('emailOff');loginView();return;}
        await loadSession();
      } catch(e) {
        draft.error=loginFailure(e, draft.channel);
        button.disabled=false;
        const node=$('#remote-login-error');
        if (node) node.textContent=draft.error;
        else loginView();
      }
    });
    bindLang(()=>{readLoginDraft(form);loginView();});
  }
  function codeView(result) {
    pendingCode={challenge:result.challenge,channel:result.channel,destination:result.destination||'',error:pendingCode?.error||''};
    const sent=(pendingCode.channel==='sms'?t('sentSms'):t('sentEmail')).replace('{0}',pendingCode.destination);
    entryShell(`<h1>${t('codeTitle')}</h1><p>${escapeText(sent)}</p><form id="remote-code" autocomplete="one-time-code"><label>${t('codeLabel')}<input class="remote-code" name="code" inputmode="numeric" autocomplete="one-time-code" minlength="6" maxlength="6" pattern="[0-9]{6}" required autofocus></label><p class="remote-entry-error" id="remote-login-error" role="alert">${escapeText(pendingCode.error)}</p><button type="submit" class="primary">${t('confirm')}</button><button type="button" class="secondary" data-resend>${t('resend')}</button><button type="button" class="secondary" data-back>${t('back')}</button></form><small>${t('footnote')}</small>`);
    const form=$('#remote-code');
    form.addEventListener('submit',async(event)=>{
      event.preventDefault();
      const button=form.querySelector('button[type=submit]');button.disabled=true;
      try {
        await call('/api/auth/login/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({challenge:pendingCode.challenge,code:form.elements.code.value.trim()})});
        pendingCode=null;
        await loadSession();
      } catch(e) {
        pendingCode.error=loginFailure(e, pendingCode.channel);
        button.disabled=false;
        $('#remote-login-error').textContent=pendingCode.error;
      }
    });
    form.querySelector('[data-resend]').addEventListener('click',async()=>{
      const button=form.querySelector('[data-resend]');button.disabled=true;
      try {
        const next=await call('/api/auth/login/resend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({challenge:pendingCode.challenge})});
        pendingCode.error='';
        codeView(next);
      } catch(e) {
        pendingCode.error=loginFailure(e, pendingCode.channel);
        button.disabled=false;
        $('#remote-login-error').textContent=pendingCode.error;
      }
    });
    form.querySelector('[data-back]').addEventListener('click',()=>{pendingCode=null;draft.error='';loginView();});
    bindLang(()=>codeView(pendingCode));
  }
  function escapeText(value) {return String(value??'').replace(/[&<>]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]));}
  function escapeAttr(value) {return escapeText(value).replace(/"/g,'&quot;');}
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
