const dict = {
  en: {
    loading: 'Loading role…',
    notFound: 'This role was not found',
    notFoundBody: 'The link may be wrong or the posting was removed.',
    closed: 'Not accepting applications',
    closedBody: 'This role is paused or closed. Check back later or ask the recruiter for an update.',
    companyRole: 'Open role',
    openings: n => (n === 1 ? '1 opening' : `${n} openings`),
    compensation: 'Compensation',
    notSpecified: 'Details coming soon from the hiring team.',
    about: 'About the role',
    applyTitle: 'Apply for this role',
    applyLead: 'Confirm your email, then complete a short application. Verified applicants land in New in the hiring pipeline.',
    stepEmail: 'Email',
    stepCode: 'Verify',
    stepForm: 'Profile',
    emailLabel: 'Work or personal email *',
    sendCode: 'Send verification code',
    codeLead: 'We emailed a 6-digit code to',
    codeSent: 'Check your inbox and spam folder. The code expires in about 30 minutes.',
    codeLabel: 'Verification code *',
    verify: 'Verify email',
    changeEmail: 'Use a different email',
    resendCode: 'Resend code',
    formLead: 'Email verified. Tell us a bit about yourself.',
    name: 'Full name *',
    phone: 'Phone',
    telegram: 'Telegram username',
    telegramHint: 'Optional. After submit, connect the bot so we can remind you about interviews.',
    location: 'Location *',
    experience: 'Experience',
    notes: 'Why you / notes',
    submit: 'Submit application',
    successTitle: 'Application sent',
    successBody: 'Thank you! We received your application. A recruiter will review it and get back to you by email.',
    telegramConnect: 'Open Telegram',
    devHint: 'Development mode: SMTP is not connected. Use this code (also printed in the server console):',
    openLink: 'Or open magic link',
    errorGeneric: 'Something went wrong. Try again.',
    lang: 'Language'
  },
  ru: {
    loading: 'Загрузка вакансии…',
    notFound: 'Вакансия не найдена',
    notFoundBody: 'Ссылка могла устареть или вакансия удалена.',
    closed: 'Отклики не принимаются',
    closedBody: 'Вакансия на паузе или закрыта. Загляните позже или уточните у рекрутера.',
    companyRole: 'Открытая вакансия',
    openings: n => (n === 1 ? '1 место' : `${n} мест`),
    compensation: 'Компенсация',
    notSpecified: 'Подробности скоро появятся от команды найма.',
    about: 'О роли',
    applyTitle: 'Откликнуться',
    applyLead: 'Подтвердите email и заполните короткую анкету. После этого вы попадёте в этап New в pipeline.',
    stepEmail: 'Email',
    stepCode: 'Код',
    stepForm: 'Анкета',
    emailLabel: 'Email *',
    sendCode: 'Отправить код',
    codeLead: 'Мы отправили 6-значный код на',
    codeSent: 'Проверьте входящие и спам. Код действует около 30 минут.',
    codeLabel: 'Код подтверждения *',
    verify: 'Подтвердить email',
    changeEmail: 'Другой email',
    resendCode: 'Отправить код ещё раз',
    formLead: 'Email подтверждён. Расскажите немного о себе.',
    name: 'ФИО *',
    phone: 'Телефон',
    telegram: 'Telegram username',
    telegramHint: 'Необязательно. После отправки подключите бота — пришлём напоминание о собеседовании.',
    location: 'Локация *',
    experience: 'Опыт',
    notes: 'О себе / комментарий',
    submit: 'Отправить анкету',
    successTitle: 'Анкета отправлена',
    successBody: 'Спасибо! Мы получили ваш отклик. Рекрутер посмотрит анкету и напишет вам на email.',
    telegramConnect: 'Открыть Telegram',
    devHint: 'Режим разработки: SMTP не подключён. Используйте этот код (он же в консоли сервера):',
    openLink: 'Или открыть magic link',
    errorGeneric: 'Что-то пошло не так. Попробуйте ещё раз.',
    lang: 'Язык'
  }
};

const root = document.getElementById('apply-root');
const slug = (location.pathname.match(/^\/apply\/([a-z0-9-]{6,40})\/?$/i) || [])[1];
const params = new URLSearchParams(location.search);
let lang = localStorage.getItem('falcon-jobster:apply-locale:v1') || (navigator.language?.startsWith('ru') ? 'ru' : 'en');
let t = dict[lang] || dict.en;
let jobPayload = null;
let step = 'email'; // email | code | form | done
let email = params.get('email') || '';
let proof = '';
let lastDev = null;
let busy = false;
let telegramLink = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

async function api(path, body) {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: body ? {'Content-Type': 'application/json'} : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || t.errorGeneric);
  return data;
}

function setLang(next) {
  lang = next;
  t = dict[lang] || dict.en;
  document.documentElement.lang = lang;
  localStorage.setItem('falcon-jobster:apply-locale:v1', lang);
  render();
}

function shell(inner) {
  return `<div class="apply-shell">
    <header class="apply-top">
      <a class="apply-brand" href="${esc(location.pathname)}">
        <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><path d="M5 6h25L12 17h13L8 28l4-15Z" fill="currentColor"/></svg>
        <span>Falcon <b>Jobster</b><small>CAREERS</small></span>
      </a>
      <div class="apply-lang" role="group" aria-label="${esc(t.lang)}">
        <button type="button" data-lang="en" aria-pressed="${lang==='en'}">EN</button>
        <button type="button" data-lang="ru" aria-pressed="${lang==='ru'}">RU</button>
      </div>
    </header>
    <main class="apply-main">${inner}</main>
  </div>`;
}

function chipsHtml(job) {
  return [
    job.department,
    job.location,
    t.openings(job.openings)
  ].filter(Boolean).map(x => `<span class="chip">${esc(x)}</span>`).join('');
}

function rolePlane(job, company, {showBody = true} = {}) {
  const hasDesc = !!(job.description && String(job.description).trim());
  const hasPay = !!(job.pay && String(job.pay).trim());
  const body = showBody
    ? `<p class="job-body${hasDesc ? '' : ' is-empty'}">${esc(hasDesc ? job.description : t.notSpecified)}</p>
      ${hasPay ? `<div class="pay"><span>${esc(t.compensation)}</span>${esc(job.pay)}</div>` : ''}`
    : '';
  return `<section class="role-plane" aria-label="${esc(job.title)}">
    <div class="role-plane-inner">
      <div class="eyebrow">${esc(company || t.companyRole)}</div>
      <h1>${esc(job.title)}</h1>
      <div class="meta">${chipsHtml(job)}</div>
      ${body}
    </div>
  </section>`;
}

function stepsUi() {
  const order = ['email', 'code', 'form'];
  const idx = step === 'done' ? 3 : order.indexOf(step);
  return `<div class="steps" aria-hidden="true">
    <span class="${idx>0?'done':''} ${idx===0?'active':''}">${esc(t.stepEmail)}</span>
    <span class="${idx>1?'done':''} ${idx===1?'active':''}">${esc(t.stepCode)}</span>
    <span class="${idx>2?'done':''} ${idx===2?'active':''}">${esc(t.stepForm)}</span>
  </div>`;
}

function formPanel() {
  if (step === 'done') {
    const tg = telegramLink
      ? `<div class="tg-connect">
          <a class="btn btn-primary tg-btn" href="${esc(telegramLink)}" target="_blank" rel="noopener noreferrer">${esc(t.telegramConnect)}</a>
        </div>`
      : '';
    return `<section class="form-panel success-card">
      <div class="eyebrow">${esc(lang === 'ru' ? 'Готово' : 'Done')}</div>
      <h2>${esc(t.successTitle)}</h2>
      <p>${esc(t.successBody)}</p>
      ${tg}
    </section>`;
  }
  let body = '';
  if (step === 'email') {
    body = `<form id="start-form">
      <label>${esc(t.emailLabel)}<input name="email" type="email" required maxlength="180" value="${esc(email)}" autocomplete="email"></label>
      <div class="form-actions"><button class="btn btn-primary" type="submit"${busy?' disabled':''}>${esc(t.sendCode)}</button></div>
    </form>`;
  } else if (step === 'code') {
    body = `<p class="lead">${esc(t.codeLead)} <strong>${esc(email)}</strong>.</p>
      <div class="notice ok">${esc(t.codeSent)}</div>
      ${lastDev ? `<div class="notice dev"><strong>${esc(t.devHint)}</strong><div class="dev-code">${esc(lastDev.code)}</div>
        <a href="${esc(lastDev.link)}">${esc(t.openLink)}</a></div>` : ''}
      <form id="confirm-form">
        <label>${esc(t.codeLabel)}<input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="one-time-code"></label>
        <div class="form-actions">
          <button class="btn btn-primary" type="submit"${busy?' disabled':''}>${esc(t.verify)}</button>
          <button class="btn btn-secondary" type="button" data-action="resend-code"${busy?' disabled':''}>${esc(t.resendCode)}</button>
          <button class="btn btn-secondary" type="button" data-action="reset-email">${esc(t.changeEmail)}</button>
        </div>
      </form>`;
  } else {
    body = `<p class="lead">${esc(t.formLead)} <strong>${esc(email)}</strong></p>
      <form id="submit-form">
        <label>${esc(t.name)}<input name="name" required maxlength="100" autocomplete="name"></label>
        <label>${esc(t.phone)}<input name="phone" type="tel" maxlength="40" autocomplete="tel"></label>
        <label>${esc(t.telegram)}<input name="telegram" maxlength="32" autocomplete="off" placeholder="@username" pattern="[@A-Za-z0-9_]{0,33}"><small class="field-hint">${esc(t.telegramHint)}</small></label>
        <label>${esc(t.location)}<input name="location" required maxlength="100" autocomplete="address-level2" placeholder="City, ST"></label>
        <label>${esc(t.experience)}<input name="experience" maxlength="100" placeholder="e.g. 3 years"></label>
        <label>${esc(t.notes)}<textarea name="notes" rows="4" maxlength="4000"></textarea></label>
        <div class="form-actions"><button class="btn btn-primary" type="submit"${busy?' disabled':''}>${esc(t.submit)}</button></div>
      </form>`;
  }
  return `<section class="form-panel">
    <h2>${esc(t.applyTitle)}</h2>
    <p class="lead">${esc(t.applyLead)}</p>
    ${stepsUi()}
    <div id="form-error" class="notice error" hidden></div>
    ${body}
  </section>`;
}

function render() {
  if (!slug) {
    root.innerHTML = shell(`<div class="apply-error"><h1>${esc(t.notFound)}</h1><p>${esc(t.notFoundBody)}</p></div>`);
    return;
  }
  if (!jobPayload) {
    root.innerHTML = shell(`<div class="apply-boot">${esc(t.loading)}</div>`);
    return;
  }
  if (jobPayload.missing) {
    root.innerHTML = shell(`<div class="apply-error"><h1>${esc(t.notFound)}</h1><p>${esc(t.notFoundBody)}</p></div>`);
    return;
  }
  const {company, job, closed} = jobPayload;
  const layout = job.landingLayout || 'classic';
  if (closed) {
    root.innerHTML = shell(`<div class="apply-closed"><h1>${esc(t.closed)}</h1><p>${esc(t.closedBody)}</p></div>`);
    return;
  }

  const hasDesc = !!(job.description && String(job.description).trim());
  let inner = '';
  if (layout === 'spotlight') {
    inner = `<div class="apply-stage-spotlight">
      ${rolePlane(job, company, {showBody: true})}
      <div class="apply-grid">
        ${formPanel()}
        <section class="about-panel">
          <h3>${esc(t.about)}</h3>
          <p class="job-body${hasDesc ? '' : ' is-empty'}">${esc(hasDesc ? job.description : t.notSpecified)}</p>
        </section>
      </div>
    </div>`;
  } else if (layout === 'compact') {
    inner = `<div class="apply-stage-compact">
      ${rolePlane(job, company)}
      ${formPanel()}
    </div>`;
  } else {
    inner = `<div class="apply-stage-classic">
      ${rolePlane(job, company)}
      <div class="form-rail">${formPanel()}</div>
    </div>`;
  }
  root.innerHTML = shell(inner);
}

function showError(message) {
  const el = document.getElementById('form-error');
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || '';
}

async function boot() {
  document.documentElement.lang = lang;
  render();
  if (!slug) return;
  try {
    jobPayload = await api(`/api/public/jobs/${encodeURIComponent(slug)}`);
  } catch {
    jobPayload = {missing: true};
    render();
    return;
  }
  render();
  const token = params.get('token');
  if (token && email && !jobPayload.closed) {
    busy = true; render();
    try {
      const confirmed = await api(`/api/public/jobs/${encodeURIComponent(slug)}/confirm`, {email, token});
      proof = confirmed.proof;
      email = confirmed.email;
      step = 'form';
      history.replaceState({}, '', location.pathname);
    } catch (err) {
      step = 'code';
      showError(err.message);
    } finally {
      busy = false;
      render();
      if (step === 'code') showError(document.getElementById('form-error')?.textContent || '');
    }
  }
}

async function startVerification() {
  if (!email || busy) return;
  busy = true; render();
  try {
    const res = await api(`/api/public/jobs/${encodeURIComponent(slug)}/start`, {email});
    lastDev = res.dev || null;
    step = 'code';
  } catch (err) {
    busy = false;
    render();
    showError(err.message || t.errorGeneric);
    return;
  }
  busy = false;
  render();
}

root.addEventListener('click', event => {
  const langBtn = event.target.closest('[data-lang]');
  if (langBtn) { setLang(langBtn.dataset.lang); return; }
  if (event.target.closest('[data-action="reset-email"]')) {
    step = 'email'; proof = ''; lastDev = null; render();
    return;
  }
  if (event.target.closest('[data-action="resend-code"]')) {
    void startVerification();
  }
});

root.addEventListener('submit', async event => {
  const form = event.target;
  if (!['start-form', 'confirm-form', 'submit-form'].includes(form.id)) return;
  event.preventDefault();
  if (busy) return;
  showError('');
  const data = Object.fromEntries(new FormData(form));
  busy = true; render();
  try {
    if (form.id === 'start-form') {
      email = String(data.email || '').trim().toLowerCase();
      busy = false;
      await startVerification();
      return;
    } else if (form.id === 'confirm-form') {
      const res = await api(`/api/public/jobs/${encodeURIComponent(slug)}/confirm`, {email, code: data.code});
      proof = res.proof;
      email = res.email;
      step = 'form';
      lastDev = null;
    } else if (form.id === 'submit-form') {
      const submitted = await api(`/api/public/jobs/${encodeURIComponent(slug)}/submit`, {
        email, proof,
        name: data.name, phone: data.phone, telegram: data.telegram,
        location: data.location, experience: data.experience, notes: data.notes
      });
      telegramLink = submitted.telegramDeepLink || submitted.telegramAppLink || null;
      step = 'done';
      proof = '';
    }
  } catch (err) {
    busy = false;
    render();
    showError(err.message || t.errorGeneric);
    return;
  }
  busy = false;
  render();
});

boot();
