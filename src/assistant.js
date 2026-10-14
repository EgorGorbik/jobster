/* Falcon Jobster AI assistant — agent: api_get + auto-applied mutations. */
(function () {
  'use strict';
  const I = window.FalconI18n;
  const Store = window.FalconStore;
  if (!I || !Store) return;

  const strings = {
    en: {
      label:'AI Assistant',title:'Falcon AI Assistant',sub:'Your recruiting co-pilot',close:'Close assistant',open:'Open AI assistant',
      connected:'Key configured',checking:'Checking connection',unconfigured:'API key required',invalidKey:'Check API key',unavailable:'Connection unavailable',demo:'Local demo',retry:'Check again',
      introTitle:'How can I help?',intro:'I read live API data, open pages, and apply recruiting changes for you automatically.',
      prompt1:'Where is the hiring report and what does my funnel look like?',prompt2:'Move everyone in New to Screening',prompt3:'Invite someone from Screening to interview tomorrow after 11',
      disconnected:'The AI assistant is available in server mode. Open the full-stack application to connect.',
      missingKey:'The server is running, but no AI key is configured. Add OPENAI_API_KEY (OpenAI or OpenRouter sk-or-...) to .env and restart the backend.',
      statusError:'Could not check the AI connection. Please try again.',invalidKeyBody:'OpenAI rejected the configured server key. Check the key in server settings.',placeholder:'Ask a recruiting question...',send:'Send',
      clear:'New conversation',typing:'Thinking…',limit:'Write a question to continue.',summary:'Also attach aggregate snapshot to the prompt',
      summaryTip:'Agent already loads records via API tools. Snapshot is optional context for read-only mode.',
      privacy:'Messages and tool results are sent to the AI provider. Avoid secrets; applicant data may be included when tools run.',
      genericError:'Could not get an AI response. Try again.',rateError:'Too many requests. Please try again later.',authError:'Session expired. Please sign in again.',
      setup:'Connection instructions',instructions:'Server setup: add OPENAI_API_KEY (or OPENROUTER_API_KEY) to .env. OpenRouter keys (sk-or-...) enable the full agent. Set OPENAI_MODEL=openai/gpt-4o-mini, run npm run backend:start.',
      idleHint:'Enter sends · Shift + Enter adds a line',readOnly:'Read-only assistant · Does not change records',canAct:'Full co-pilot · Applies changes automatically',
      confirmTitle:'Confirm changes',confirm:'Confirm',cancel:'Cancel',confirming:'Applying…',cancelled:'Cancelled.',applied:'Applied.'
    },
    ru: {
      label:'ИИ-ассистент',title:'Falcon AI Ассистент',sub:'Помощник по подбору персонала',close:'Закрыть ассистента',open:'Открыть ИИ-ассистента',
      connected:'Ключ настроен',checking:'Проверка подключения',unconfigured:'Нужен API-ключ',invalidKey:'Проверьте API-ключ',unavailable:'Нет подключения',demo:'Локальная демоверсия',retry:'Проверить ещё раз',
      introTitle:'Чем могу помочь?',intro:'Читаю живые API-данные, открываю страницы и сам применяю изменения в найме.',
      prompt1:'Где отчёты и какая сейчас воронка?',prompt2:'Перемести всех из New в Screening',prompt3:'Пригласи кого-то из Screening на интервью завтра после 11',
      disconnected:'ИИ-ассистент работает в серверной версии. Откройте полный проект с backend для подключения.',
      missingKey:'Сервер работает, но AI-ключ не настроен. Добавьте OPENAI_API_KEY (OpenRouter sk-or-...) в .env и перезапустите backend.',
      statusError:'Не удалось проверить подключение ИИ. Попробуйте ещё раз.',invalidKeyBody:'OpenAI отклонил серверный ключ. Проверьте его в настройках сервера.',placeholder:'Задайте вопрос о найме...',send:'Отправить',
      clear:'Новый диалог',typing:'Думаю…',limit:'Введите вопрос для отправки.',summary:'Добавить сводный snapshot в промпт',
      summaryTip:'Агент сам грузит записи через API. Snapshot нужен в основном для read-only режима.',
      privacy:'Сообщения и результаты tools уходят провайдеру ИИ. Не вводите секреты; данные кандидатов могут попасть в запрос.',
      genericError:'Не удалось получить ответ ИИ. Попробуйте позднее.',rateError:'Слишком много запросов. Попробуйте позднее.',authError:'Сессия закончилась. Войдите в систему снова.',
      setup:'Как подключить',instructions:'В .env: OPENAI_API_KEY или OPENROUTER_API_KEY. Ключи OpenRouter (sk-or-...) включают полный агент. Модель: OPENAI_MODEL=openai/gpt-4o-mini, затем npm run backend:start.',
      idleHint:'Enter — отправить · Shift + Enter — новая строка',readOnly:'Только консультации · Записи не изменяются',canAct:'Полный co-pilot · Изменения применяются сразу',
      confirmTitle:'Подтвердите изменения',confirm:'Подтвердить',cancel:'Отмена',confirming:'Применяю…',cancelled:'Отменено.',applied:'Готово.'
    }
  };
  const sparkles = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3-1.9 5.1L5 10l5.1 1.9L12 17l1.9-5.1L19 10l-5.1-1.9L12 3Z"/><path d="m19 16-.8 2.2L16 19l2.2.8L19 22l.8-2.2L22 19l-2.2-.8L19 16ZM5 2 4 4 2 5l2 1 1 2 1-2 2-1-2-1-1-2Z"/></svg>`;
  const plane = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>`;
  const closeIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
  const resetIcon = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7M3 3v6h6"/></svg>`;

  let root = null;
  let open = false;
  let status = 'demo';
  let canMutate = false;
  let uiMessages = [];
  let agentThread = [];
  let pendingChange = null;
  let busy = false;
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
  const pageHash = () => (location.hash && location.hash.startsWith('#/') ? location.hash : '#/pipeline').slice(0, 200);

  function normalizePending(raw) {
    if (!raw) return null;
    if (Array.isArray(raw.changes) && raw.changes.length) {
      return {summary: String(raw.summary || ''), changes: raw.changes, toolCallId: raw.toolCallId};
    }
    if (raw.method && raw.path) {
      return {
        summary: String(raw.summary || ''),
        changes: [{label: String(raw.summary || raw.path), method: raw.method, path: raw.path, body: raw.body ?? {}}],
        toolCallId: raw.toolCallId
      };
    }
    return null;
  }

  function appendMessage(container, item) {
    const line = document.createElement('div');
    line.className = `fja-msg fja-msg-${item.role}`;
    if (item.kind === 'confirm') {
      line.className = 'fja-msg fja-msg-confirm';
      const box = document.createElement('div');
      box.className = 'fja-confirm';
      box.innerHTML = `<strong>${safe(t('confirmTitle'))}</strong><p>${safe(item.summary)}</p><ul>${item.changes.map(c => `<li><code>${safe(c.method)} ${safe(c.path)}</code> — ${safe(c.label || '')}</li>`).join('')}</ul>`;
      const actions = document.createElement('div');
      actions.className = 'fja-confirm-actions';
      const ok = document.createElement('button');
      ok.type = 'button';
      ok.className = 'fja-confirm-ok';
      ok.textContent = t('confirm');
      ok.dataset.fjaConfirm = '1';
      const no = document.createElement('button');
      no.type = 'button';
      no.className = 'fja-confirm-no';
      no.textContent = t('cancel');
      no.dataset.fjaCancel = '1';
      actions.append(ok, no);
      box.append(actions);
      line.append(box);
    } else {
      const body = document.createElement('p');
      body.textContent = item.content;
      line.append(body);
    }
    container.append(line);
  }

  function draw({focus = false} = {}) {
    if (!root) return;
    const label = status === 'ready' ? 'connected' : status === 'checking' ? 'checking' : status === 'invalid' ? 'invalidKey' : status === 'failed' ? 'unavailable' : status === 'demo' ? 'demo' : 'unconfigured';
    const prompts = ['prompt1', 'prompt2', 'prompt3'];
    const locked = busy || !!pendingChange;
    root.innerHTML = `
      <button type="button" class="fja-launcher" id="fja-launcher" aria-label="${safe(t('open'))}" aria-controls="fja-panel" aria-expanded="${open}">
        <span class="fja-launch-icon">${sparkles}</span><span class="fja-launch-text">${safe(t('label'))}</span>
        <span class="fja-dot ${connected() ? 'is-live' : ''}" aria-hidden="true"></span>
      </button>
      <section id="fja-panel" class="fja-panel" role="dialog" aria-modal="false" aria-label="${safe(t('title'))}" ${open ? '' : 'hidden'}>
        <header class="fja-header"><div class="fja-header-icon">${sparkles}</div><div class="fja-heading"><strong>${safe(t('title'))}</strong><small>${safe(t('sub'))}</small></div>
          <button type="button" class="fja-top-button" id="fja-reset" aria-label="${safe(t('clear'))}" title="${safe(t('clear'))}">${resetIcon}</button>
          <button type="button" class="fja-top-button" id="fja-close" aria-label="${safe(t('close'))}">${closeIcon}</button></header>
        <div class="fja-status"><span class="fja-status-pill fja-${safe(status)}"><i></i>${safe(t(label))}</span><span>${safe(t(canMutate ? 'canAct' : 'readOnly'))}</span></div>
        <div class="fja-transcript" id="fja-transcript" role="log" aria-label="${safe(t('title'))}" aria-live="polite" aria-relevant="additions text">
          ${uiMessages.length === 0 && connected() ? `<div class="fja-welcome"><span class="fja-welcome-icon">${sparkles}</span><strong>${safe(t('introTitle'))}</strong><p>${safe(t('intro'))}</p><div class="fja-prompts">${prompts.map(key => `<button type="button" data-fja-prompt="${key}">${safe(t(key))}</button>`).join('')}</div></div>` : ''}
          ${!connected() ? `<div class="fja-connection"><span class="fja-connect-icon">${sparkles}</span><strong>${safe(status === 'demo' ? t('demo') : status === 'checking' ? t('checking') : t(label))}</strong><p>${safe(status === 'demo' ? t('disconnected') : status === 'unconfigured' ? t('missingKey') : status === 'failed' ? t('statusError') : status === 'invalid' ? t('invalidKeyBody') : t('checking'))}</p>
            <button type="button" id="fja-setup" class="fja-link">${safe(t('setup'))}</button>${Store.remote ? `<button type="button" id="fja-retry" class="fja-retry">${safe(t('retry'))}</button>` : ''}<p class="fja-setup-text" id="fja-setup-text" hidden>${safe(t('instructions'))}</p></div>` : ''}
        </div>
        <div class="fja-bottom"><label class="fja-summary-option"><input type="checkbox" id="fja-summary" ${optedIn ? 'checked' : ''} ${connected() ? '' : 'disabled'}><span>${safe(t('summary'))}</span></label>
          <p class="fja-summary-tip">${safe(t('summaryTip'))}</p>
          <form id="fja-form" novalidate><label class="fja-sr-only" for="fja-input">${safe(t('placeholder'))}</label>
            <textarea id="fja-input" rows="2" maxlength="3000" placeholder="${safe(t('placeholder'))}" ${connected() && !locked ? '' : 'disabled'}></textarea>
            <button id="fja-send" type="submit" class="fja-send" aria-label="${safe(t('send'))}" title="${safe(t('send'))}" ${connected() && !locked ? '' : 'disabled'}>${plane}</button></form>
          <p class="fja-error" id="fja-error" role="alert" ${error ? '' : 'hidden'}></p>
          <p class="fja-footnote">${safe(t('privacy'))}</p>
        </div>
      </section>`;
    document.body.classList.toggle('fja-open', open);
    const log = q('#fja-transcript');
    for (const item of uiMessages) appendMessage(log, item);
    if (busy && !pendingChange) {
      const line = document.createElement('div');
      line.className = 'fja-msg fja-msg-wait';
      const p = document.createElement('p');
      p.textContent = t('typing');
      line.append(p);
      log.append(line);
    }
    const textarea = q('#fja-input');
    if (textarea) textarea.value = draft;
    const err = q('#fja-error');
    if (err) err.textContent = error;
    if (log) log.scrollTop = log.scrollHeight;
    if (focus && open && connected()) textarea?.focus({preventScroll: true});
  }

  function setOpen(next) {
    if (next === open) return;
    if (next) focusReturn = document.activeElement;
    open = next;
    draw({focus: next});
    if (!next) (q('#fja-launcher') || focusReturn)?.focus({preventScroll: true});
    if (next && Store.remote && status !== 'ready') void checkConnection();
  }

  async function checkConnection() {
    if (!Store.remote) { status = 'demo'; draw(); return; }
    status = 'checking';
    draw();
    try {
      const response = await fetch('/api/assistant/status', {credentials: 'same-origin', cache: 'no-store'});
      if (!response.ok) throw new Error(`Connection failed: ${response.status}`);
      const data = await response.json();
      status = data.configured ? 'ready' : 'unconfigured';
      canMutate = !!data.canMutate;
    } catch {
      status = 'failed';
      canMutate = false;
    }
    draw();
  }

  function applyOpen(path) {
    if (typeof path === 'string' && path.startsWith('#/')) location.hash = path;
  }

  async function continueAgent(thread) {
    const response = await fetch('/api/assistant/chat', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({messages: thread, page: pageHash(), language: I.language}),
      signal: requestController?.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const problem = new Error(data.error || t('genericError'));
      problem.status = response.status;
      problem.code = data.code;
      throw problem;
    }
    return data;
  }

  function mergeAgent(data) {
    if (Array.isArray(data.messages) && data.messages.length) {
      agentThread = agentThread.concat(data.messages);
    }
    if (data.open) applyOpen(data.open);
    const pending = normalizePending(data.pending);
    if (pending) {
      pendingChange = pending;
      const summary = pending.summary || data.reply || t('confirming');
      uiMessages.push({role: 'assistant', content: `${t('confirming')}${summary ? `\n${summary}` : ''}`});
      // Auto-apply mutations — no Confirm click required.
      queueMicrotask(() => { void confirmPending(); });
    } else if (data.reply) {
      uiMessages.push({role: 'assistant', content: String(data.reply).slice(0, 12000)});
    }
  }

  async function submit(input) {
    const content = String(input || '').trim();
    if (!content) { error = t('limit'); draw({focus: true}); return; }
    if (!connected() || busy || pendingChange) return;
    error = '';
    draft = '';
    uiMessages.push({role: 'user', content});
    agentThread.push({role: 'user', content});
    busy = true;
    draw();
    const run = ++serial;
    requestController = new AbortController();
    try {
      let data;
      if (canMutate) {
        data = await continueAgent(agentThread);
      } else {
        const history = [];
        let budget = 9000;
        for (const item of uiMessages.slice(0, -1).slice(-12).reverse()) {
          if (!item.content || item.content.length > budget) break;
          history.unshift({role: item.role, content: item.content.slice(0, 3000)});
          budget -= item.content.length;
        }
        const response = await fetch('/api/assistant/chat', {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({message: content, history, language: I.language, includeSummary: optedIn}),
          signal: requestController.signal
        });
        data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const problem = new Error(data.error || t('genericError'));
          problem.status = response.status;
          problem.code = data.code;
          throw problem;
        }
      }
      if (run !== serial) return;
      if (canMutate) mergeAgent(data);
      else {
        if (!data.reply || typeof data.reply !== 'string') throw new Error(t('genericError'));
        uiMessages.push({role: 'assistant', content: data.reply.slice(0, 12000)});
      }
    } catch (problem) {
      if (run !== serial) return;
      uiMessages.pop();
      agentThread.pop();
      draft = content;
      error = problem.status === 401 ? t('authError') : problem.status === 429 ? t('rateError') : t('genericError');
      if (problem.code === 'NOT_CONFIGURED') { status = 'unconfigured'; error = t('missingKey'); }
      if (problem.code === 'INVALID_PROVIDER_KEY') { status = 'invalid'; error = t('invalidKeyBody'); }
    } finally {
      if (run === serial) { busy = false; requestController = null; draw({focus: open}); }
    }
  }

  async function runApiChange(change) {
    const method = String(change.method || 'POST').toUpperCase();
    const path = String(change.path || '');
    const opts = {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {'Content-Type': 'application/json'}
    };
    if (method !== 'GET' && method !== 'HEAD') {
      opts.body = JSON.stringify(change.body ?? {});
    }
    const response = await fetch(path, opts);
    const data = await response.json().catch(() => ({}));
    return {ok: response.ok, status: response.status, label: change.label || path, data};
  }

  function patchToolResult(toolCallId, content) {
    let found = false;
    agentThread = agentThread.map(m => {
      if (m.role === 'tool' && m.tool_call_id === toolCallId) {
        found = true;
        return {...m, content};
      }
      return m;
    });
    if (!found) agentThread.push({role: 'tool', tool_call_id: toolCallId, content});
  }

  async function confirmPending() {
    if (!pendingChange) return;
    // Allow chaining from mergeAgent while the previous turn is still marked busy.
    const batch = pendingChange;
    pendingChange = null;
    busy = true;
    draw();
    const run = ++serial;
    requestController = new AbortController();
    try {
      const results = [];
      for (const change of batch.changes) {
        results.push(await runApiChange(change));
      }
      const text = results.map(r =>
        `${r.ok ? 'OK' : 'FAIL'} ${r.status} ${r.label}: ${JSON.stringify(r.data).slice(0, 1500)}`
      ).join('\n');
      patchToolResult(batch.toolCallId, text);
      if (typeof Store.pullRemote === 'function') {
        try { await Store.pullRemote(); } catch { /* ignore */ }
      }
      const data = await continueAgent(agentThread);
      if (run !== serial) return;
      mergeAgent(data);
      if (!data.pending && !data.reply) {
        uiMessages.push({role: 'assistant', content: t('applied')});
      }
    } catch (problem) {
      if (run !== serial) return;
      error = problem.status === 401 ? t('authError') : t('genericError');
      patchToolResult(batch.toolCallId, `Error applying change: ${problem.message || problem}`);
    } finally {
      if (run === serial) {
        requestController = null;
        // Keep busy if another mutation was queued by mergeAgent for auto-apply.
        if (!pendingChange) {
          busy = false;
          draw({focus: open});
        }
      }
    }
  }

  async function cancelPending() {
    if (!pendingChange || busy) return;
    const batch = pendingChange;
    pendingChange = null;
    const idx = [...uiMessages].map((m, i) => m.kind === 'confirm' ? i : -1).filter(i => i >= 0).pop();
    if (typeof idx === 'number' && idx >= 0) {
      uiMessages[idx] = {role: 'assistant', content: t('cancelled')};
    }
    patchToolResult(batch.toolCallId, 'Admin cancelled the proposed change.');
    busy = true;
    draw();
    const run = ++serial;
    requestController = new AbortController();
    try {
      const data = await continueAgent(agentThread);
      if (run !== serial) return;
      mergeAgent(data);
    } catch (problem) {
      if (run !== serial) return;
      error = problem.status === 401 ? t('authError') : t('genericError');
    } finally {
      if (run === serial) { busy = false; requestController = null; draw({focus: open}); }
    }
  }

  function clearConversation() {
    serial++;
    requestController?.abort();
    requestController = null;
    busy = false;
    pendingChange = null;
    uiMessages = [];
    agentThread = [];
    draft = '';
    error = '';
    optedIn = false;
    draw({focus: open});
  }

  function mount() {
    if (root || !document.querySelector('#workspace')) return;
    root = document.createElement('div');
    root.id = 'fja-root';
    document.body.append(root);
    status = Store.remote ? 'checking' : 'demo';
    draw();
    if (Store.remote) void checkConnection();
  }

  document.addEventListener('click', event => {
    if (!root) return;
    const target = event.target;
    if (!root.contains(target)) return;
    if (target.closest('#fja-launcher')) { setOpen(!open); return; }
    if (target.closest('#fja-close')) { setOpen(false); return; }
    if (target.closest('#fja-reset')) { clearConversation(); return; }
    if (target.closest('#fja-retry')) { void checkConnection(); return; }
    if (target.closest('#fja-setup')) {
      const note = q('#fja-setup-text');
      if (note) note.hidden = !note.hidden;
      return;
    }
    if (target.closest('[data-fja-confirm]')) { void confirmPending(); return; }
    if (target.closest('[data-fja-cancel]')) { void cancelPending(); return; }
    const chip = target.closest('[data-fja-prompt]');
    if (chip) { void submit(t(chip.dataset.fjaPrompt)); return; }
  });
  document.addEventListener('input', event => {
    if (root?.contains(event.target) && event.target.id === 'fja-input') draft = event.target.value;
  });
  document.addEventListener('change', event => {
    if (root?.contains(event.target) && event.target.id === 'fja-summary') optedIn = event.target.checked;
  });
  document.addEventListener('submit', event => {
    if (event.target.id !== 'fja-form') return;
    event.preventDefault();
    void submit(q('#fja-input')?.value);
  });
  document.addEventListener('keydown', event => {
    if (!root) return;
    if (event.key === 'Escape' && open) { event.preventDefault(); setOpen(false); }
    if (event.target.id === 'fja-input' && event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      void submit(event.target.value);
    }
  });
  document.addEventListener('falcon:language-change', () => { if (root) draw(); });
  const host = document.getElementById('root');
  if (host) {
    const observer = new MutationObserver(() => { if (!root) mount(); });
    observer.observe(host, {childList: true});
  }
  mount();
})();
