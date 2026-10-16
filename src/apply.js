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
    assignment: 'Test assignment',
    assignmentRequired: 'Required with your application',
    assignmentLink: 'Link to your solution *',
    assignmentLinkOptional: 'Link to your solution',
    assignmentHint: 'GitHub, GitLab, Gist or Drive link to your completed assignment.',
    applyTitle: 'Apply for this role',
    applyLead: 'Confirm your email or phone, then complete a short application. Verified applicants land in New in the hiring pipeline.',
    stepEmail: 'Email',
    stepPhone: 'Phone',
    stepCode: 'Verify',
    stepForm: 'Profile',
    viaEmail: 'Email',
    viaPhone: 'Phone',
    emailLabel: 'Work or personal email *',
    phoneLabel: 'Phone number *',
    phoneHint: 'International format, for example +375291112233. The code arrives by SMS.',
    badPhone: 'Enter the phone in international format, for example +375291112233.',
    sendCode: 'Send verification code',
    codeLead: 'We emailed a 6-digit code to',
    codeLeadSms: 'We texted a 6-digit code to',
    codeSent: 'Check your inbox and spam folder. The code expires in about 30 minutes.',
    codeSentSms: 'The SMS code expires in about 30 minutes.',
    codeLabel: 'Verification code *',
    verify: 'Verify email',
    verifyPhone: 'Verify phone',
    changeEmail: 'Use a different email',
    changePhone: 'Use a different phone',
    optionalEmail: 'Email',
    optionalEmailHint: 'Optional. Leave blank if you only want to be contacted by phone.',
    formLeadSms: 'Phone verified. Tell us a bit about yourself.',
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
    successBody: 'Thank you! We received your application. A recruiter will review it and get back to you.',
    telegramConnect: 'Open Telegram',
    devHint: 'Development mode: delivery is not connected. Use this code (also printed in the server console):',
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
    assignment: 'Тестовое задание',
    assignmentRequired: 'Обязательно приложите к анкете',
    assignmentLink: 'Ссылка на решение *',
    assignmentLinkOptional: 'Ссылка на решение',
    assignmentHint: 'GitHub, GitLab, Gist или Drive со сделанным тестовым.',
    applyTitle: 'Откликнуться',
    applyLead: 'Подтвердите почту или телефон и заполните короткую анкету. После этого вы попадёте в этап New в pipeline.',
    stepEmail: 'Email',
    stepPhone: 'Телефон',
    stepCode: 'Код',
    stepForm: 'Анкета',
    viaEmail: 'Почта',
    viaPhone: 'Телефон',
    emailLabel: 'Email *',
    phoneLabel: 'Телефон *',
    phoneHint: 'Международный формат, например +375291112233. Код придёт в SMS.',
    badPhone: 'Введите телефон в международном формате, например +375291112233.',
    sendCode: 'Отправить код',
    codeLead: 'Мы отправили 6-значный код на',
    codeLeadSms: 'Мы отправили SMS с кодом на',
    codeSent: 'Проверьте входящие и спам. Код действует около 30 минут.',
    codeSentSms: 'Код в SMS действует около 30 минут.',
    codeLabel: 'Код подтверждения *',
    verify: 'Подтвердить email',
    verifyPhone: 'Подтвердить телефон',
    changeEmail: 'Другой email',
    changePhone: 'Другой телефон',
    optionalEmail: 'Email',
    optionalEmailHint: 'Необязательно. Можно не указывать, если связаться нужно по телефону.',
    formLeadSms: 'Телефон подтверждён. Расскажите немного о себе.',
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
    successBody: 'Спасибо! Мы получили ваш отклик. Рекрутер посмотрит анкету и свяжется с вами.',
    telegramConnect: 'Открыть Telegram',
    devHint: 'Режим разработки: отправка не подключена. Используйте этот код (он же в консоли сервера):',
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
let channel = 'email'; // email | sms
let email = params.get('email') || '';
let phone = params.get('phone') || '';
let proof = '';
let lastDev = null;
let busy = false;
let telegramLink = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

const ruErrors = {
  'Enter a valid email address.': 'Введите корректный email.',
  'Enter a phone number in international format, for example +375291112233.': 'Введите телефон в международном формате, например +375291112233.',
  'SMS verification is unavailable: Twilio is not configured on the server.': 'SMS-подтверждение недоступно: Twilio не настроен на сервере.',
  'Could not send the SMS code. Check Twilio settings and try again.': 'Не удалось отправить SMS. Проверьте настройки Twilio и попробуйте ещё раз.',
  'Verification expired or not found. Request a new code.': 'Код истёк или не найден. Запросите новый.',
  'Verification expired. Request a new code.': 'Код истёк. Запросите новый.',
  'Invalid verification code.': 'Неверный код.',
  'Verification is required.': 'Сначала подтвердите телефон или почту.',
  'Verified session expired. Verify your email again.': 'Сессия истекла. Подтвердите контакт ещё раз.',
  'You already applied to this role with this phone number.': 'Вы уже откликались на эту вакансию с этого номера.',
  'You already applied to this role with this email.': 'Вы уже откликались на эту вакансию с этого email.',
  'Too many attempts. Try again later.': 'Слишком много попыток. Попробуйте позже.'
};

function localizeError(message) {
  if (lang === 'ru' && message && ruErrors[message]) return ruErrors[message];
  return message || t.errorGeneric;
}

async function api(path, body) {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: body ? {'Content-Type': 'application/json'} : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(localizeError(data.error));
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

function assignmentBlock(job, {light = false} = {}) {
  const text = String(job.assignment || '').trim();
  if (!text) return '';
  const req = job.assignmentRequired
    ? `<span class="assignment-req">${esc(t.assignmentRequired)}</span>`
    : '';
  return `<div class="assignment-block${light ? ' is-light' : ''}">
    <div class="assignment-head"><span>${esc(t.assignment)}</span>${req}</div>
    <p class="job-body assignment-body">${esc(text)}</p>
  </div>`;
}

function rolePlane(job, company, {showBody = true} = {}) {
  const hasDesc = !!(job.description && String(job.description).trim());
  const hasPay = !!(job.pay && String(job.pay).trim());
  const body = showBody
    ? `<p class="job-body${hasDesc ? '' : ' is-empty'}">${esc(hasDesc ? job.description : t.notSpecified)}</p>
      ${assignmentBlock(job)}
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
    <span class="${idx>0?'done':''} ${idx===0?'active':''}">${esc(channel === 'sms' ? t.stepPhone : t.stepEmail)}</span>
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
    const sms = channel === 'sms';
    body = `<form id="start-form">
      <div class="channel-switch" role="group" aria-label="${esc(t.applyTitle)}">
        <button type="button" data-channel="email" aria-pressed="${sms ? 'false' : 'true'}">${esc(t.viaEmail)}</button>
        <button type="button" data-channel="sms" aria-pressed="${sms ? 'true' : 'false'}">${esc(t.viaPhone)}</button>
      </div>
      ${sms
        ? `<label>${esc(t.phoneLabel)}<input name="phone" type="tel" required maxlength="40" value="${esc(phone)}" autocomplete="tel" inputmode="tel" placeholder="+375291112233" autofocus><small class="field-hint">${esc(t.phoneHint)}</small></label>`
        : `<label>${esc(t.emailLabel)}<input name="email" type="email" required maxlength="180" value="${esc(email)}" autocomplete="email" autofocus></label>`}
      <div class="form-actions"><button class="btn btn-primary" type="submit"${busy?' disabled':''}>${esc(t.sendCode)}</button></div>
    </form>`;
  } else if (step === 'code') {
    const dest = channel === 'sms' ? phone : email;
    body = `<p class="lead">${esc(channel === 'sms' ? t.codeLeadSms : t.codeLead)} <strong>${esc(dest)}</strong>.</p>
      <div class="notice ok">${esc(channel === 'sms' ? t.codeSentSms : t.codeSent)}</div>
      ${lastDev ? `<div class="notice dev"><strong>${esc(t.devHint)}</strong><div class="dev-code">${esc(lastDev.code)}</div>
        ${lastDev.link ? `<a href="${esc(lastDev.link)}">${esc(t.openLink)}</a>` : ''}</div>` : ''}
      <form id="confirm-form">
        <label>${esc(t.codeLabel)}<input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="one-time-code"></label>
        <div class="form-actions">
          <button class="btn btn-primary" type="submit"${busy?' disabled':''}>${esc(channel === 'sms' ? t.verifyPhone : t.verify)}</button>
          <button class="btn btn-secondary" type="button" data-action="resend-code"${busy?' disabled':''}>${esc(t.resendCode)}</button>
          <button class="btn btn-secondary" type="button" data-action="reset-email">${esc(channel === 'sms' ? t.changePhone : t.changeEmail)}</button>
        </div>
      </form>`;
  } else {
    const job = jobPayload?.job || {};
    const hasAssignment = !!(job.assignment && String(job.assignment).trim());
    const assignmentField = hasAssignment
      ? `<label>${esc(job.assignmentRequired ? t.assignmentLink : t.assignmentLinkOptional)}<input name="assignmentUrl" type="url" maxlength="500" ${job.assignmentRequired ? 'required' : ''} placeholder="https://github.com/…/repo" autocomplete="off"><small class="field-hint">${esc(t.assignmentHint)}</small></label>`
      : '';
    const contactLine = channel === 'sms'
      ? `<p class="lead">${esc(t.formLeadSms)} <strong>${esc(phone)}</strong></p>`
      : `<p class="lead">${esc(t.formLead)} <strong>${esc(email)}</strong></p>`;
    const contactFields = channel === 'sms'
      ? `<label>${esc(t.phoneLabel)}<input name="phone" type="tel" value="${esc(phone)}" readonly></label>
        <label>${esc(t.optionalEmail)}<input name="email" type="email" maxlength="180" autocomplete="email"><small class="field-hint">${esc(t.optionalEmailHint)}</small></label>`
      : `<label>${esc(t.phone)}<input name="phone" type="tel" maxlength="40" autocomplete="tel"></label>`;
    body = `${contactLine}
      <form id="submit-form">
        <label>${esc(t.name)}<input name="name" required maxlength="100" autocomplete="name"></label>
        ${contactFields}
        <label>${esc(t.telegram)}<input name="telegram" maxlength="32" autocomplete="off" placeholder="@username" pattern="[@A-Za-z0-9_]{0,33}"><small class="field-hint">${esc(t.telegramHint)}</small></label>
        <label>${esc(t.location)}<input name="location" required maxlength="100" autocomplete="address-level2" placeholder="City, ST"></label>
        <label>${esc(t.experience)}<input name="experience" maxlength="100" placeholder="e.g. 3 years"></label>
        ${assignmentField}
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
          ${assignmentBlock(job, {light: true})}
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
  if (busy) return;
  if (channel === 'sms' ? !phone : !email) return;
  busy = true; render();
  try {
    const res = await api(`/api/public/jobs/${encodeURIComponent(slug)}/start`, channel === 'sms' ? {channel: 'sms', phone} : {email});
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
  const channelBtn = event.target.closest('[data-channel]');
  if (channelBtn && step === 'email') {
    const current = document.querySelector('#start-form input');
    if (current) {
      if (channel === 'sms') phone = current.value;
      else email = current.value;
    }
    channel = channelBtn.dataset.channel === 'sms' ? 'sms' : 'email';
    render();
    return;
  }
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
      if (channel === 'sms') phone = String(data.phone || '').trim();
      else email = String(data.email || '').trim().toLowerCase();
      busy = false;
      await startVerification();
      return;
    } else if (form.id === 'confirm-form') {
      const payload = channel === 'sms' ? {channel: 'sms', phone, code: data.code} : {email, code: data.code};
      const res = await api(`/api/public/jobs/${encodeURIComponent(slug)}/confirm`, payload);
      proof = res.proof;
      if (res.channel === 'sms') { channel = 'sms'; phone = res.phone || phone; }
      else { channel = 'email'; email = res.email || email; }
      step = 'form';
      lastDev = null;
    } else if (form.id === 'submit-form') {
      const submitted = await api(`/api/public/jobs/${encodeURIComponent(slug)}/submit`, {
        channel,
        email: channel === 'sms' ? String(data.email || '').trim().toLowerCase() : email,
        proof,
        name: data.name,
        phone: channel === 'sms' ? phone : data.phone,
        telegram: data.telegram,
        location: data.location, experience: data.experience, notes: data.notes,
        assignmentUrl: data.assignmentUrl
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
