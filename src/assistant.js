/* Falcon Jobster: opt-in, read-only AI assistant. No API key in the browser. */
(function () {
  'use strict';
  const I = window.FalconI18n;
  const Store = window.FalconStore;
  if (!I || !Store) return;

  const strings = {
    en: {
      label:'AI Assistant',title:'Falcon AI Assistant',sub:'Your recruiting co-pilot',close:'Close assistant',open:'Open AI assistant',
      connected:'Key configured',checking:'Checking connection',unconfigured:'API key required',invalidKey:'Check API key',unavailable:'Connection unavailable',demo:'Local demo',retry:'Check again',
      introTitle:'How can I help?',intro:'Ask about recruiting workflows, interview questions, job descriptions, or the hiring pipeline.',
      prompt1:'Help me improve my hiring pipeline',prompt2:'Create interview questions for a CDL driver',prompt3:'Draft a recruiter follow-up plan',
      disconnected:'The AI assistant is available in server mode. Open the full-stack application to connect.',
      missingKey:'The server is running, but OPENAI_API_KEY is not configured. Add it to your server .env and restart the backend.',
      statusError:'Could not check the AI connection. Please try again.',invalidKeyBody:'OpenAI rejected the configured server key. Check the key in server settings.',placeholder:'Ask a recruiting question...',send:'Send',
      clear:'New conversation',typing:'Thinking…',limit:'Write a question to continue.',summary:'Include aggregate workspace statistics',
      summaryTip:'Only anonymous totals and hiring-stage counts are shared when enabled. Candidate profiles are never sent automatically.',
      privacy:'Messages are processed by OpenAI. Do not enter personal applicant data or secrets.',
      genericError:'Could not get an AI response. Try again.',rateError:'Too many requests. Please try again later.',authError:'Session expired. Please sign in again.',
      setup:'Connection instructions',instructions:'Server setup: add OPENAI_API_KEY to .env, run npm run backend:start, then open the app on the backend URL. Never paste API keys into this chat.',
      idleHint:'Enter sends · Shift + Enter adds a line',readOnly:'Read-only assistant · Does not change records',copied:'Copy'
    },
    ru: {
      label:'ИИ-ассистент',title:'Falcon AI Ассистент',sub:'Помощник по подбору персонала',close:'Закрыть ассистента',open:'Открыть ИИ-ассистента',
      connected:'Ключ настроен',checking:'Проверка подключения',unconfigured:'Нужен API-ключ',invalidKey:'Проверьте API-ключ',unavailable:'Нет подключения',demo:'Локальная демоверсия',retry:'Проверить ещё раз',
      introTitle:'Чем могу помочь?',intro:'Спросите о воронке найма, вопросах на интервью, вакансиях или ежедневной работе рекрутера.',
      prompt1:'Как улучшить воронку найма?',prompt2:'Составь вопросы для интервью CDL-водителя',prompt3:'Подготовь план работы рекрутера',
      disconnected:'ИИ-ассистент работает в серверной версии. Откройте полный проект с backend для подключения.',
      missingKey:'Сервер работает, но OPENAI_API_KEY ещё не настроен. Добавьте ключ в серверный .env и перезапустите backend.',
      statusError:'Не удалось проверить подключение ИИ. Попробуйте ещё раз.',invalidKeyBody:'OpenAI отклонил серверный ключ. Проверьте его в настройках сервера.',placeholder:'Задайте вопрос о найме...',send:'Отправить',
      clear:'Новый диалог',typing:'Думаю…',limit:'Введите вопрос для отправки.',summary:'Включить сводную статистику',
      summaryTip:'Передаются только обезличенные количества и этапы найма. Профили кандидатов автоматически не отправляются.',
      privacy:'Сообщения обрабатывает OpenAI. Не вводите персональные данные кандидатов и секретные ключи.',
      genericError:'Не удалось получить ответ ИИ. Попробуйте ещё раз.',rateError:'Слишком много запросов. Попробуйте позднее.',authError:'Сессия закончилась. Войдите в систему снова.',
      setup:'Как подключить',instructions:'На сервере добавьте OPENAI_API_KEY в .env, запустите npm run backend:start и откройте приложение по адресу backend. Не отправляйте API-ключ в этот чат.',
      idleHint:'Enter — отправить · Shift + Enter — новая строка',readOnly:'Только консультации · Записи не изменяются',copied:'Копировать'
    }
  };
  const sparkles = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3-1.9 5.1L5 10l5.1 1.9L12 17l1.9-5.1L19 10l-5.1-1.9L12 3Z"/><path d="m19 16-.8 2.2L16 19l2.2.8L19 22l.8-2.2L22 19l-2.2-.8L19 16ZM5 2 4 4 2 5l2 1 1 2 1-2 2-1-2-1-1-2Z"/></svg>`;
  const plane = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>`;
  const closeIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
  const resetIcon = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7M3 3v6h6"/></svg>`;
  let root = null;
  let open = false;
  let status = 'demo'; // demo | checking | ready | unconfigured | invalid | failed
  let messages = [];
  let pending = false;
  let optedIn = false;
  let draft = '';
  let error = '';
  let requestController = null;
  let serial = 0;
  let focusReturn = null;
  const t = key => (strings[I.language] || strings.en)[key];
  const q = selector => root?.querySelector(selector);
  const safe = value => String(value).replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  const connected = () => status === 'ready' && Store.remote === true;

  function appendMessage(container, item) {
    const line = document.createElement('div');
    line.className = `fja-msg fja-msg-${item.role}`;
    const body = document.createElement('p');
    body.textContent = item.content;
    line.append(body);
    container.append(line);
  }
  function draw({focus=false}={}) {
    if (!root) return;
    const label = status==='ready'?'connected':status==='checking'?'checking':status==='invalid'?'invalidKey':status==='failed'?'unavailable':status==='demo'?'demo':'unconfigured';
    const prompts = ['prompt1','prompt2','prompt3'];
    root.innerHTML = `
      <button type="button" class="fja-launcher" id="fja-launcher" aria-label="${safe(t('open'))}" aria-controls="fja-panel" aria-expanded="${open}">
        <span class="fja-launch-icon">${sparkles}</span><span class="fja-launch-text">${safe(t('label'))}</span>
        <span class="fja-dot ${connected()?'is-live':''}" aria-hidden="true"></span>
      </button>
      <section id="fja-panel" class="fja-panel" role="dialog" aria-modal="false" aria-label="${safe(t('title'))}" ${open?'':'hidden'}>
        <header class="fja-header"><div class="fja-header-icon">${sparkles}</div><div class="fja-heading"><strong>${safe(t('title'))}</strong><small>${safe(t('sub'))}</small></div>
          <button type="button" class="fja-top-button" id="fja-reset" aria-label="${safe(t('clear'))}" title="${safe(t('clear'))}">${resetIcon}</button>
          <button type="button" class="fja-top-button" id="fja-close" aria-label="${safe(t('close'))}">${closeIcon}</button></header>
        <div class="fja-status"><span class="fja-status-pill fja-${safe(status)}"><i></i>${safe(t(label))}</span><span>${safe(t('readOnly'))}</span></div>
        <div class="fja-transcript" id="fja-transcript" role="log" aria-label="${safe(t('title'))}" aria-live="polite" aria-relevant="additions text">
          ${messages.length===0 && connected() ? `<div class="fja-welcome"><span class="fja-welcome-icon">${sparkles}</span><strong>${safe(t('introTitle'))}</strong><p>${safe(t('intro'))}</p><div class="fja-prompts">${prompts.map(key=>`<button type="button" data-fja-prompt="${key}">${safe(t(key))}</button>`).join('')}</div></div>`:''}
          ${!connected() ? `<div class="fja-connection"><span class="fja-connect-icon">${sparkles}</span><strong>${safe(status==='demo'?t('demo'):status==='checking'?t('checking'):t(label))}</strong><p>${safe(status==='demo'?t('disconnected'):status==='unconfigured'?t('missingKey'):status==='failed'?t('statusError'):status==='invalid'?t('invalidKeyBody'):t('checking'))}</p>
            <button type="button" id="fja-setup" class="fja-link">${safe(t('setup'))}</button>${Store.remote ? `<button type="button" id="fja-retry" class="fja-retry">${safe(t('retry'))}</button>`:''}<p class="fja-setup-text" id="fja-setup-text" hidden>${safe(t('instructions'))}</p></div>`:''}
        </div>
        <div class="fja-bottom"><label class="fja-summary-option"><input type="checkbox" id="fja-summary" ${optedIn?'checked':''} ${connected()?'':'disabled'}><span>${safe(t('summary'))}</span></label>
          <p class="fja-summary-tip">${safe(t('summaryTip'))}</p>
          <form id="fja-form" novalidate><label class="fja-sr-only" for="fja-input">${safe(t('placeholder'))}</label>
            <textarea id="fja-input" rows="2" maxlength="3000" placeholder="${safe(t('placeholder'))}" ${connected()?'':'disabled'}></textarea>
            <button id="fja-send" type="submit" class="fja-send" aria-label="${safe(t('send'))}" title="${safe(t('send'))}" ${connected()&&!pending?'':'disabled'}>${plane}</button></form>
          <p class="fja-error" id="fja-error" role="alert" ${error?'':'hidden'}></p>
          <p class="fja-footnote">${safe(t('privacy'))}</p>
        </div>
      </section>`;
    document.body.classList.toggle('fja-open',open);
    const log=q('#fja-transcript');
    for (const item of messages) appendMessage(log,item);
    if(pending) {
      const line=document.createElement('div');line.className='fja-msg fja-msg-wait';
      const p=document.createElement('p');p.textContent=t('typing');line.append(p);log.append(line);
    }
    const textarea=q('#fja-input');if(textarea) textarea.value=draft;
    const err=q('#fja-error');if(err)err.textContent=error;
    if(log) log.scrollTop=log.scrollHeight;
    if(focus&&open&&connected()) textarea?.focus({preventScroll:true});
  }
  function setOpen(next) {
    if(next===open) return;
    if(next) focusReturn=document.activeElement;
    open=next;draw({focus:next});
    if(!next) (q('#fja-launcher')||focusReturn)?.focus({preventScroll:true});
    if(next && Store.remote && status!=='ready') void checkConnection();
  }
  async function checkConnection() {
    if(!Store.remote) {status='demo';draw();return;}
    status='checking';draw();
    try {
      const response=await fetch('/api/assistant/status',{credentials:'same-origin',cache:'no-store'});
      if(!response.ok) throw new Error(`Connection failed: ${response.status}`);
      const data=await response.json();status=data.configured?'ready':'unconfigured';
    } catch {status='failed';}
    draw();
  }
  async function submit(input) {
    const content=String(input||'').trim();
    if(!content) {error=t('limit');draw({focus:true});return;}
    if(!connected()||pending) return;
    error='';draft='';
    // Stay within the server's bounded history contract without truncating a message mid-sentence.
    const history=[];
    let budget=9000;
    for (const item of messages.slice(-12).reverse()) {
      if (item.content.length>budget) break;
      history.unshift({role:item.role,content:item.content.slice(0,3000)});
      budget-=item.content.length;
    }
    messages.push({role:'user',content});
    pending=true;draw();
    const run=++serial;
    requestController=new AbortController();
    try {
      const response=await fetch('/api/assistant/chat',{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({message:content,history,language:I.language,includeSummary:optedIn}),
        signal:requestController.signal
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok) {
        const problem=new Error(data.error||t('genericError'));
        problem.status=response.status;problem.code=data.code;throw problem;
      }
      if(run!==serial) return;
      if(!data.reply||typeof data.reply!=='string') throw new Error(t('genericError'));
      messages.push({role:'assistant',content:data.reply.slice(0,12000)});
    } catch (problem) {
      if(run!==serial) return;
      // A failed attempt is not left in the history sent to the AI on retry.
      messages.pop();draft=content;
      error=problem.status===401?t('authError'):problem.status===429?t('rateError'):t('genericError');
      if(problem.code==='NOT_CONFIGURED'){status='unconfigured';error=t('missingKey');}
      if(problem.code==='INVALID_PROVIDER_KEY') {status='invalid';error=t('invalidKeyBody');}
    } finally {
      if(run===serial){pending=false;requestController=null;draw({focus:open});}
    }
  }
  function clearConversation() {
    serial++;requestController?.abort();requestController=null;
    pending=false;messages=[];draft='';error='';optedIn=false;draw({focus:open});
  }
  function mount() {
    if(root || !document.querySelector('#workspace')) return;
    root=document.createElement('div');root.id='fja-root';document.body.append(root);
    status=Store.remote?'checking':'demo';draw();
    if(Store.remote)void checkConnection();
  }
  document.addEventListener('click',event=>{
    if(!root) return;
    const target=event.target;
    if(!root.contains(target)) return;
    if(target.closest('#fja-launcher')) {setOpen(!open);return;}
    if(target.closest('#fja-close')) {setOpen(false);return;}
    if(target.closest('#fja-reset')) {clearConversation();return;}
    if(target.closest('#fja-retry')) {void checkConnection();return;}
    if(target.closest('#fja-setup')) {const note=q('#fja-setup-text');if(note)note.hidden=!note.hidden;return;}
    const chip=target.closest('[data-fja-prompt]');
    if(chip) {void submit(t(chip.dataset.fjaPrompt));return;}
  });
  document.addEventListener('input',event=>{
    if(root?.contains(event.target)&&event.target.id==='fja-input') draft=event.target.value;
  });
  document.addEventListener('change',event=>{
    if(root?.contains(event.target)&&event.target.id==='fja-summary') optedIn=event.target.checked;
  });
  document.addEventListener('submit',event=>{
    if(event.target.id!=='fja-form') return;
    event.preventDefault();void submit(q('#fja-input')?.value);
  });
  document.addEventListener('keydown',event=>{
    if(!root) return;
    if(event.key==='Escape'&&open){event.preventDefault();setOpen(false);}
    if(event.target.id==='fja-input'&&event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();void submit(event.target.value);}
  });
  document.addEventListener('falcon:language-change',()=>{if(root)draw();});
  const host=document.getElementById('root');
  if (host) {
    const observer=new MutationObserver(()=>{if(!root)mount();});
    observer.observe(host,{childList:true});
  }
  mount();
})();
