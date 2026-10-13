/* Falcon Jobster interactive frontend. Vanilla JavaScript; no backend calls. */
(function () {
  'use strict';
  const I = window.FalconI18n;
  const Store = window.FalconStore;
  const STAGES = Store.STAGES;
  const VIEWS = {overview: 'Overview', pipeline: 'Pipeline', candidates: 'Candidates', jobs: 'Jobs', calendar: 'Calendar', campaigns: 'Campaigns', reports: 'Reports', settings: 'Settings'};
  const NAV_ICONS = {overview: 'grid', pipeline: 'kanban', candidates: 'users', jobs: 'briefcase', calendar: 'calendar', campaigns: 'send', reports: 'chart', settings: 'settings'};
  Object.assign(window.FalconIcons, {
    star: `<path d="m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.6l6.3-.9Z"/>`,
    archive: `<rect x="3" y="3" width="18" height="4" rx="1"/><path d="M5 7v13h14V7M9 11h6"/>`,
    edit: `<path d="m16 3 5 5-12 12H4v-5ZM14 5l5 5"/>`,
    shield: `<path d="M12 3 3 7v6c0 5 9 9 9 9s9-4 9-9V7Z"/><path d="m8 12 3 3 5-6"/>`,
    link: `<path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 2 1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0"/>`,
    left: `<path d="m14 6-6 6 6 6"/>`, right: `<path d="m10 6 6 6-6 6"/>`,
    info: `<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>`,
    refresh: `<path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 3M18 18A8 8 0 0 1 5 15"/>`,
    play: `<path d="m8 4 12 8-12 8Z"/>`,
    checkCircle: `<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>`,
    database: `<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>`,
    help: `<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 4 3v2M12 17h.01"/>`
  });
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'}[char]));
  const icon = (name, size = 18) => `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${window.FalconIcons[name] || window.FalconIcons.more}</svg>`;
  const state = () => Store.state;
  const jobFor = c => state().jobs.find(j => j.id === c.jobId);
  const jobTitle = c => jobFor(c)?.title || I.t('Unassigned role');
  const active = () => state().candidates.filter(c => !c.archived);
  const initials = name => String(name).trim().split(/\s+/).slice(0, 2).map(x => x[0] || '').join('').toUpperCase();
  const percent = (n, d) => d ? Math.round(n / d * 100) : 0;
  const validColor = c => /^#[\da-f]{6}$/i.test(c) ? c : '#deebe6';
  const avatar = (c, size = '') => `<span class="avatar ${size}" style="background:${validColor(c.color)}">${esc(initials(c.name))}</span>`;
  const dateFormat = (date, opts = {}) => {
    try { return new Intl.DateTimeFormat(I.locale, {timeZone: state().settings.timezone, month: 'short', day: 'numeric', ...opts}).format(new Date(date)); }
    catch { return I.t('Not set'); }
  };
  const timeFormat = date => dateFormat(date, {month: undefined, day: undefined, hour: 'numeric', minute: '2-digit'});
  const dateKey = (date, zone = state().settings.timezone) => {
    const parts = new Intl.DateTimeFormat('en-US', {timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(new Date(date));
    const get = type => parts.find(p => p.type === type).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  };
  const daysAgo = date => Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86400000));
  const relative = date => I.relative(daysAgo(date));
  const stageBadge = stage => `<span class="stage-badge"><i class="status-dot stage-${STAGES.indexOf(stage)}"></i>${esc(I.t(stage))}</span>`;
  const badge = status => `<span class="badge ${String(status).toLowerCase().replace(/\s/g, '-')}">${esc(I.t(status))}</span>`;
  const button = (label, action, ico = '', kind = 'secondary', extra = '') => `<button type="button" class="${kind}" data-action="${action}" ${extra}>${ico ? icon(ico, 16) : ''}${I.t(label)}</button>`;
  const iconButton = (label, action, ico, extra = '') => `<button type="button" class="icon-button" aria-label="${esc(label)}" title="${esc(label)}" data-action="${action}" ${extra}>${icon(ico, 17)}</button>`;
  const options = (values, selected, all, translateLabels = true) => (all ? `<option value="All" ${selected === 'All' ? 'selected' : ''}>${esc(I.t(all))}</option>` : '') + values.map(v => {
    const value = typeof v === 'string' ? v : v.value;
    const label = typeof v === 'string' ? v : v.label;
    return `<option value="${esc(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${esc(translateLabels ? I.t(label) : label)}</option>`;
  }).join('');
  const jobOptions = (selected, all = 'All jobs') => options(state().jobs.map(j => ({value: j.id, label: j.title})), selected, all, false);
  const ownerOptions = selected => options(state().team.map(t => t.name), selected, null, false);
  const empty = (title, text, action = '') => `<div class="empty-state"><span class="empty-icon">${icon('users', 25)}</span><h3>${title}</h3><p>${text}</p>${action}</div>`;
  const heading = (kicker, title, text, actions = '') => `<div class="page-heading"><div><span class="eyebrow">${kicker}</span><h1>${title}</h1><p>${text}</p></div><div class="heading-actions">${actions}</div></div>`;
  const panelHead = (title, subtitle, action = '') => `<div class="section-title"><div><h2>${title}</h2><p>${subtitle}</p></div>${action}</div>`;
  const today = dateKey(new Date());
  const ui = {view: 'overview', search: '', job: 'All', stage: 'All', source: 'All', candidateTab: 'All', jobStatus: 'All', sort: 'updated', page: 1, pageSize: 10, selected: new Set(), reportDays: 30, flowDays: 14, settingsTab: 'workspace', calendarDate: today, calendarMonth: today.slice(0, 7), calendarFilter: 'All', drawerTab: 'profile'};
  let dragId = null, lastFocus = null, currentCandidateId = null;

  function languageSwitcher() {
    return `<div class="language-switcher" role="group" aria-label="${esc(I.t('Interface language'))}"><button type="button" data-action="set-language" data-language="en" lang="en" title="English" aria-label="English" aria-pressed="${I.language === 'en'}">EN</button><button type="button" data-action="set-language" data-language="ru" lang="ru" title="\u0420\u0443\u0441\u0441\u043a\u0438\u0439" aria-label="\u0420\u0443\u0441\u0441\u043a\u0438\u0439" aria-pressed="${I.language === 'ru'}">RU</button></div>`;
  }
  function changeLanguage(language, persist = true) {
    if (!['en', 'ru'].includes(language) || language === I.language) return;
    // The topbar is inert while a modal is open; never discard an open draft.
    if ($('#overlay-root').children.length) return;
    const y = scrollY, menuOpen = !!$('.sidebar.open');
    const globalQuery = $('#global-search')?.value || '';
    const focused = document.activeElement;
    const focusedId = focused?.id;
    const settingsDraft = $('#settings-form') ? Array.from($('#settings-form').elements).filter(el => el.name && el.type !== 'file').map(el => ({name: el.name, value: el.value, checked: el.checked, type: el.type})) : [];
    const stored = I.setLanguage(language, persist);
    shell();
    const form = $('#settings-form');
    if (form) settingsDraft.forEach(({name, value, checked, type}) => { const el = form.elements.namedItem(name); if (el) { el.value = value; if (type === 'checkbox') el.checked = checked; } });
    if (globalQuery) { $('#global-search').value = globalQuery; searchGlobal(globalQuery); }
    if (menuOpen) { $('.sidebar').classList.add('open'); document.body.classList.add('menu-open'); }
    clearTimeout(toast.timer); $('#toast-root').innerHTML = '';
    if (focusedId) document.getElementById(focusedId)?.focus({preventScroll: true});
    else $(`[data-language="${language}"]`)?.focus({preventScroll: true});
    window.scrollTo({top: y, behavior: 'instant'});
    if (!stored) toast(I.t('Language changed for this session only. Browser storage is unavailable.'), true);
    document.dispatchEvent(new CustomEvent('falcon:language-change', {detail:{language}}));
  }
  function prepareForms() {
    // Render our own localized, screen-reader-visible error; do not rely on the
    // browser chrome language for native validation bubbles.
    $$('form').forEach(form => { form.noValidate = true; });
  }
  function validateForm(form) {
    const invalid = Array.from(form.elements).find(el => el.willValidate && !el.validity.valid);
    $$('[aria-invalid]', form).forEach(el => el.removeAttribute('aria-invalid'));
    if (!invalid) return true;
    const v = invalid.validity;
    const message = v.valueMissing ? I.t('Complete all required fields.') : v.typeMismatch && invalid.type === 'email' ? I.t('Enter a valid email address.') : v.typeMismatch && invalid.type === 'url' ? I.t('Enter a valid website URL.') : v.rangeUnderflow || v.rangeOverflow ? I.t('Enter a value between {0} and {1}.', [invalid.min, invalid.max]) : v.stepMismatch || v.badInput ? I.t('Enter a valid whole number.') : I.t('Check this field and try again.');
    invalid.setAttribute('aria-invalid', 'true');
    showFormError(form, message); invalid.focus(); return false;
  }

  function shell() {
    $('#root').innerHTML = `<a class="skip-link" href="#workspace">${I.t("Skip to workspace")}</a><div class="app-shell"><aside class="sidebar" aria-label="${I.t("Main navigation")}"><a class="brand" href="#/overview" data-action="navigate" data-view="overview"><span class="brand-mark"><svg viewBox="0 0 32 32" width="25" height="25" aria-hidden="true"><path d="M5 6h25L12 17h13L8 28l4-15Z" fill="currentColor"/></svg></span><span>${I.t("Falcon")} <b>${I.t("Jobster")}</b><small>${I.t("THE HIRING WORKSPACE")}</small></span></a><button type="button" class="icon-button mobile-close" data-action="close-menu" aria-label="${I.t("Close navigation")}">${icon('x', 17)}</button><nav class="main-nav"><span class="nav-caption">${I.t("WORKSPACE")}</span>${['overview', 'pipeline', 'candidates', 'jobs', 'calendar'].map(navItem).join('')}<span class="nav-caption second">${I.t("ENGAGE & MEASURE")}</span>${['campaigns', 'reports'].map(navItem).join('')}</nav><div class="sidebar-bottom"><div class="workspace-note"><span class="live-dot"></span><strong>${Store.remote ? state().settings.company : I.t("Your local workspace")}</strong><p>${Store.remote ? (I.language === "ru" ? "\u0414\u0430\u043d\u043d\u044b\u0435 \u0445\u0440\u0430\u043d\u044f\u0442\u0441\u044f \u043d\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435." : "Records are stored on the server.") : I.t("Explore freely. Sample data stays in this browser.")}</p><button data-action="help">${Store.remote ? (I.language === "ru" ? "\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u0441\u043f\u0440\u0430\u0432\u043a\u0443" : "View help") : I.t("Explore the demo {0}", [icon('arrow', 13)])}</button></div>${navItem('settings')}${Store.remote ? `<button type="button" class="nav-item remote-sidebar-logout" data-action="remote-logout">${icon("x", 16)}${I.language === "ru" ? "\u0412\u044b\u0439\u0442\u0438" : "Sign out"}</button>` : ""}<button class="workspace-user" data-action="navigate" data-view="settings"><span class="avatar small">${Store.remote ? esc(initials(window.FalconSession?.name || "Admin")) : I.t("ZS")}</span><span><strong>${Store.remote ? esc(window.FalconSession?.name || "Admin") : I.t("Zafar Safarov")}</strong><small>${Store.remote ? esc(window.FalconSession?.role || "Owner") : I.t("Demo administrator")}</small></span>${icon('chevron', 15)}</button></div></aside><button class="sidebar-scrim" aria-label="${I.t("Close navigation")}" data-action="close-menu"></button><main><header class="topbar"><button class="icon-button mobile-menu" data-action="open-menu" aria-label="${I.t("Open navigation")}">${icon('menu', 21)}</button><div class="breadcrumb"><span>${I.t("Workspace")}</span>${icon('right', 12)}<strong id="breadcrumb-view">${I.t("Overview")}</strong></div><div class="global-search-wrap"><label class="global-search">${icon('search', 17)}<input id="global-search" autocomplete="off" placeholder="${I.t("Search your workspace...")}" aria-label="${I.t("Search candidates, jobs and campaigns")}" aria-controls="global-results" aria-expanded="false"><kbd><span class="shortcut-mod">${I.t("Ctrl")}</span> ${I.t("K")}</kbd></label><div id="global-results" class="global-results" hidden></div></div><div class="top-actions">${languageSwitcher()}<span class="demo-pill"><span></span>${Store.remote ? (I.language === "ru" ? "\u0421\u0435\u0440\u0432\u0435\u0440" : "Server mode") : I.t("Local demo")}</span>${Store.remote ? `<button type="button" class="secondary remote-logout" data-action="remote-logout">${I.language === "ru" ? "\u0412\u044b\u0439\u0442\u0438" : "Sign out"}</button>` : ""}<button class="icon-button notification" data-action="notifications" aria-label="${I.t("Activity notifications")}">${icon('bell', 19)}<i id="notification-dot"></i></button><button class="company-switcher" data-action="navigate" data-view="settings" aria-label="${I.t("Open workspace settings")}"><span id="company-logo" class="company-logo">${I.t("FS")}</span><span id="company-name">${I.t("Falcon Staffing")}</span>${icon('chevron', 13)}</button></div></header><div id="storage-warning" role="alert" hidden></div><section class="workspace" id="workspace" tabindex="-1"></section><footer class="app-footer"><span>${I.t("FALCON JOBSTER")} <i>/</i> ${I.t("Recruiting, thoughtfully connected.")}</span><span>${Store.remote ? (I.language === "ru" ? "\u041d\u0435\u0442 \u043e\u0442\u043f\u0440\u0430\u0432\u043a\u0438 SMS/email" : "No live SMS/email sending") : I.t("Sample data · No live messaging")}</span></footer></main></div>`;
    if (/Mac|iPhone|iPad/.test(navigator.platform)) $('.shortcut-mod').textContent = '\u2318';
    render();
  }
  function navItem(view) { return `<button data-action="navigate" data-view="${view}" class="nav-item ${ui.view === view ? 'active' : ''}" ${ui.view === view ? 'aria-current="page"' : ''}>${icon(NAV_ICONS[view], 18)}<span>${I.t(VIEWS[view])}</span><em data-nav-count="${view}"></em></button>`; }
  function updateChrome() {
    $$('.nav-item').forEach(b => { const isCurrent = b.dataset.view === ui.view; b.classList.toggle('active', isCurrent); isCurrent ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'); });
    $$('[data-nav-count]').forEach(el => { const v = el.dataset.navCount; el.textContent = v === 'candidates' ? active().length : v === 'jobs' ? state().jobs.filter(j => j.status === 'Active').length : ''; el.hidden = !['candidates', 'jobs'].includes(v); });
    $('#breadcrumb-view').textContent = I.t(VIEWS[ui.view]);
    $('#company-name').textContent = state().settings.company;
    $('#company-logo').innerHTML = state().settings.logo ? `<img src="${esc(state().settings.logo)}" alt="${I.t("Workspace logo")}">` : esc(initials(state().settings.company));
    $('#notification-dot').hidden = !state().activity.some(a => !a.read);
    const warning = $('#storage-warning'); warning.hidden = !Store.warning; warning.textContent = I.t(Store.warning);
    document.documentElement.lang = I.language;
    document.title = `${I.t(VIEWS[ui.view])} | Falcon Jobster`;
    const languageSelect = $('#workspace-language'); if (languageSelect) languageSelect.value = I.language;
  }
  function render() {
    const focused = document.activeElement;
    const focusedId = focused?.closest('#workspace') ? focused.id : null;
    const cursor = focusedId && 'selectionStart' in focused ? focused.selectionStart : null;
    const renderers = {overview, pipeline, candidates: candidateTable, jobs: jobsView, calendar: calendarView, campaigns: campaignsView, reports: reportsView, settings: settingsView};
    $('#workspace').innerHTML = renderers[ui.view]();
    $('#workspace').dataset.view = ui.view;
    updateChrome();
    prepareForms();
    if (focusedId && $('#' + focusedId)) { const el = $('#' + focusedId); el.focus({preventScroll: true}); if (cursor !== null && el.setSelectionRange) { try { el.setSelectionRange(cursor, cursor); } catch {} } }
  }
  function navigate(view, extra = {}) {
    if (!VIEWS[view]) return;
    closeOverlay(); closeGlobal(); closeMenu();
    Object.assign(ui, {view, search: '', job: 'All', stage: 'All', source: 'All', candidateTab: 'All', jobStatus: 'All', page: 1, selected: new Set()}, extra);
    if (location.hash !== '#/' + view) history.pushState(null, '', '#/' + view);
    render(); window.scrollTo({top: 0, behavior: 'instant'});
  }
  function route() {
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    const next = VIEWS[parts[0]] ? parts[0] : 'overview';
    if (next !== ui.view) Object.assign(ui, {view: next, search: '', job: 'All', stage: 'All', source: 'All', candidateTab: 'All', page: 1, selected: new Set()});
    closeOverlay(); render();
    if (parts[1] && next === 'candidates') openDrawer(parts[1]);
  }
  function commit(mutator, message = '', redraw = true) {
    try {
      const saved = Store.update(mutator);
      if (redraw) render(); else updateChrome();
      if (message) toast(Store.remote ? (I.language === "ru" ? "\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435 \u043d\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435..." : "Saving to server...") : (saved ? message : I.t("{0} Not saved to browser storage.", [message])), !saved);
      return true;
    } catch (error) { toast(error.message || I.t("The change could not be saved."), true); return false; }
  }
  function addHistory(c, type, text, stage) { c.updatedAt = new Date().toISOString(); c.history.push({id: Store.id(), type, text, at: c.updatedAt, ...(stage ? {stage} : {})}); }
  function metric(label, value, note, ico, tag = '') { return `<div class="metric"><div class="metric-label"><span>${label}</span>${icon(ico, 18)}</div><div class="metric-value"><strong>${value}</strong>${tag ? `<em>${tag}</em>` : ''}</div><p>${note}</p></div>`; }

  function overview() {
    const people = active();
    const openJobs = state().jobs.filter(j => j.status === 'Active');
    const hired = people.filter(c => c.stage === 'Hired');
    const upcoming = state().interviews.filter(i => i.status === 'Scheduled' && new Date(i.startsAt) > new Date()).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const headcount = openJobs.reduce((n, j) => n + Math.max(0, j.openings - people.filter(c => c.jobId === j.id && c.stage === 'Hired').length), 0);
    const flow = Array.from({length: ui.flowDays / 2}, (_, i) => { const offset = ui.flowDays - 2 - i * 2; const d = new Date(Date.now() - offset * 86400000); return {date: d, count: people.filter(c => { const age = daysAgo(c.createdAt); return age >= offset && age < offset + 2; }).length}; });
    const max = Math.max(...flow.map(x => x.count), 1);
    const recentPeople = people.filter(c => daysAgo(c.createdAt) < ui.flowDays);
    const sources = sourceStats(people).slice(0, 5);
    const offer = people.find(c => c.stage === 'Offer');
    const unreviewed = people.filter(c => c.stage === 'New');
    return `${heading(dateFormat(new Date(), {weekday: 'long', month: 'long', day: 'numeric'}).toUpperCase(), I.t("A clearer path to your next hire."), I.t("Good to see you, Zafar. Here is your recruiting workspace at a glance."), button(I.t("Open pipeline"), 'navigate', 'kanban', 'secondary', 'data-view="pipeline"') + button(I.t("Add candidate"), 'add-candidate', 'plus', 'primary'))}
      <div class="metrics-strip">${metric(I.t("Active jobs"), openJobs.length, I.t("{0} remaining openings", [headcount]), 'briefcase', I.t("Hiring now"))}${metric(I.t("Candidates in play"), people.length - hired.length, I.t("{0} waiting for first review", [unreviewed.length]), 'users')}${metric(I.t("Upcoming interviews"), upcoming.length, I.t("Scheduled in this workspace"), 'calendar')}${metric(I.t("Hired candidates"), hired.length, I.t("Current active candidate records"), 'checkCircle', I.t("{0}% of talent pool", [percent(hired.length, people.length)]))}</div>
      <div class="overview-grid"><section class="panel flow-panel">${panelHead(I.t("Candidate flow"), I.t("Applications added to the local workspace"), `<div class="segmented compact">${[14, 28].map(d => button(I.count('day', d), 'flow-days', '', ui.flowDays === d ? 'active' : '', `data-days="${d}"`)).join('')}</div>`)}<div class="chart-area" role="img" aria-label="${I.t("{0} applications in the last {1} days", [recentPeople.length, ui.flowDays])}">${flow.map(x => `<div class="bar-wrap"><span class="bar-count">${x.count || ''}</span><div class="bar ${x.count ? '' : 'zero'}" style="height:${x.count ? 28 + x.count / max * 105 : 4}px" title="${I.t("{0}: {1} applications", [dateFormat(x.date), x.count])}"></div><span class="bar-label">${dateFormat(x.date)}</span></div>`).join('')}</div><div class="chart-legend"><span><i></i>${I.t("{0} applications", [recentPeople.length])}</span><span><i class="pale"></i>${I.t("{0} past initial review", [recentPeople.filter(c => STAGES.indexOf(c.stage) >= 1).length])}</span><button class="text-button" data-action="navigate" data-view="reports">${I.t("View report {0}", [icon('arrow', 13)])}</button></div></section>
      <section class="panel source-panel">${panelHead(I.t("Where talent comes from"), I.t("Share of active candidate records"), icon('target', 19))}<div class="source-list">${sources.map((s, i) => `<button class="source-item" data-action="source-candidates" data-source="${esc(s.source)}"><span><i style="opacity:${1 - i * .12}"></i>${esc(I.t(s.source))}</span><strong>${percent(s.total, people.length)}%</strong><div><b style="width:${percent(s.total, people.length)}%;opacity:${1 - i * .1}"></b></div><small>${I.t("{0} candidate{1} · {2} past initial review", [s.total, s.total === 1 ? '' : 's', s.advanced])}</small></button>`).join('') || `<p class="muted">${I.t("Add candidates to see sources.")}</p>`}</div></section></div>
      <div class="lower-grid"><section class="panel today-panel">${panelHead(I.t("On your calendar"), I.t("Upcoming appointments &middot; {0}", [esc(state().settings.timezone)]), button(I.t("Open calendar"), 'navigate', 'arrow', 'text-button', 'data-view="calendar"'))}<div class="agenda">${upcoming.slice(0, 3).map(i => agendaRow(i)).join('') || empty(I.t("Your calendar is clear"), I.t("Schedule a conversation from any candidate profile."), button(I.t("Schedule interview"), 'add-interview', 'plus'))}</div></section>
      <section class="panel attention-panel">${panelHead(I.t("A little attention goes a long way"), I.t("Your next useful actions"), icon('sparkles', 19))}${offer ? `<button data-action="candidate" data-id="${esc(offer.id)}"><span>${icon('clock')}</span><b>${I.t("Follow up on an offer")}<small>${esc(offer.name)} &middot; ${esc(jobTitle(offer))}</small></b>${icon('right', 15)}</button>` : ''}<button data-action="new-candidates"><span>${icon('users')}</span><b>${unreviewed.length ? I.t('Review {0} new applications', [unreviewed.length]) : I.t('Explore your talent pool')}<small>${I.t(unreviewed.length ? 'Move promising people into screening' : 'No new applications waiting for review')}</small></b>${icon('right', 15)}</button><div class="quiet-note">${I.t("{0} These are sample records, not live hiring results.", [icon('info', 14)])}</div></section></div>
      <section class="panel activity-panel">${panelHead(I.t("The latest in your workspace"), I.t("A shared view of local demo changes"), button(I.t("See activity"), 'notifications', 'arrow', 'text-button'))}<div class="activity-inline">${state().activity.slice(0, 3).map(a => `<div><span class="activity-dot"></span><p>${esc(I.message(a.text))}<small>${relative(a.at)} &middot; ${timeFormat(a.at)}</small></p></div>`).join('')}</div></section>`;
  }
  function agendaRow(i, showDate = true) {
    const c = state().candidates.find(c => c.id === i.candidateId);
    return `<button class="agenda-row" data-action="interview" data-id="${esc(i.id)}"><time>${showDate ? `<strong>${dateFormat(i.startsAt)}</strong>` : ''}${timeFormat(i.startsAt)}</time><span class="agenda-icon">${icon(i.format === 'Phone' ? 'phone' : 'calendar', 17)}</span><span class="agenda-person"><strong>${esc(i.title)} &middot; ${esc(c?.name || 'Candidate')}</strong><small>${I.t("{0} · {1} min · {2}", [esc(c ? jobTitle(c) : ''), i.duration, esc(I.t(i.format))])}</small></span>${icon('right', 15)}</button>`;
  }
  function sourceStats(people) {
    const map = new Map();
    people.forEach(c => { const s = map.get(c.source) || {source: c.source, total: 0, advanced: 0, hired: 0}; s.total++; if (STAGES.indexOf(c.stage) >= 1) s.advanced++; if (c.stage === 'Hired') s.hired++; map.set(c.source, s); });
    return [...map.values()].sort((a, b) => b.total - a.total || a.source.localeCompare(b.source));
  }
  function filteredCandidates() {
    const q = ui.search.toLowerCase().trim();
    return state().candidates.filter(c => (ui.candidateTab === 'Archived' ? c.archived : !c.archived) && (ui.candidateTab !== 'Favorites' || c.favorite) && (ui.job === 'All' || c.jobId === ui.job) && (ui.stage === 'All' || c.stage === ui.stage) && (ui.source === 'All' || c.source === ui.source) && (!q || `${c.name} ${jobTitle(c)} ${c.email} ${c.location} ${c.source} ${c.tags.join(' ')}`.toLowerCase().includes(q))).sort((a, b) => ui.sort === 'name' ? a.name.localeCompare(b.name) : ui.sort === 'rating' ? (b.rating ?? -1) - (a.rating ?? -1) : b.updatedAt.localeCompare(a.updatedAt));
  }
  function filters(count, table = false) {
    return `<div class="filter-bar"><label class="local-search">${icon('search', 16)}<input id="local-search" value="${esc(ui.search)}" placeholder="${I.t("Search candidates...")}" aria-label="${I.t("Search candidate list")}"></label><label class="select-control">${icon('briefcase', 15)}<select id="job-filter" data-filter="job" aria-label="${I.t("Filter by job")}">${jobOptions(ui.job)}</select></label><label class="select-control">${icon('filter', 15)}<select id="stage-filter" data-filter="stage" aria-label="${I.t("Filter by stage")}">${options(STAGES, ui.stage, 'All stages')}</select></label>${table ? `<label class="select-control source-filter"><select id="source-filter" data-filter="source" aria-label="${I.t("Filter by source")}">${options([...new Set(state().candidates.map(c => c.source))], ui.source, 'All sources')}</select></label>` : ''}<div class="filter-end"><span>${I.count('candidate', count)}</span>${ui.search || ui.job !== 'All' || ui.stage !== 'All' || ui.source !== 'All' ? button(I.t("Clear"), 'clear-filters', 'x', 'text-button') : ''}</div></div>`;
  }
  function pipeline() {
    const list = filteredCandidates();
    return `${heading(I.t("HIRING WORKSPACE"), I.t("Good people. Clear next steps."), I.t("Drag a card to move it forward, or choose a stage in the candidate profile."), `<div class="view-switch">${button(I.t("Board"), 'navigate', 'kanban', 'selected', 'data-view="pipeline"')}${button(I.t("List"), 'navigate', 'users', '', 'data-view="candidates"')}</div>` + button(I.t("Add candidate"), 'add-candidate', 'plus', 'primary'))}${filters(list.length)}<div class="kanban" aria-label="${I.t("Candidate pipeline")}">${STAGES.map((stage, i) => { const people = list.filter(c => c.stage === stage); return `<section class="kanban-column" data-drop-stage="${stage}" aria-label="${I.t("{0} stage", [I.t(stage)])}"><div class="column-head"><span><i class="status-dot stage-${i}"></i>${I.t(stage)}<em>${people.length}</em></span>${iconButton(I.t("Add candidate to ") + I.t(stage), 'add-candidate', 'plus', `data-stage="${stage}"`)}</div><div class="column-body">${people.map(candidateCard).join('') || `<div class="empty-drop">${icon('plus', 22)}<span>${I.t("No candidates yet")}</span><small>${I.t("Drop a card here")}</small></div>`}</div><button class="column-add" data-action="add-candidate" data-stage="${stage}">${I.t("{0} Add candidate", [icon('plus', 14)])}</button></section>`; }).join('')}</div><p class="board-note">${I.t("{0} Ratings are manually entered sample scores. No AI evaluation is running.", [icon('info', 14)])}</p>`;
  }
  function candidateCard(c) {
    return `<article class="candidate-card" draggable="true" data-drag-id="${esc(c.id)}" data-action="candidate" data-id="${esc(c.id)}" tabindex="0" role="button" aria-label="${I.t("Open {0}", [esc(c.name)])}"><div class="candidate-top">${avatar(c)}${iconButton(c.favorite ? I.t("Remove favorite") : I.t("Add favorite"), 'favorite', 'star', `data-id="${esc(c.id)}" aria-pressed="${!!c.favorite}"`)}</div><h3>${esc(c.name)}</h3><p>${esc(jobTitle(c))}</p><div class="candidate-location">${icon('pin', 12)}${esc(c.location)}</div><div class="candidate-tags">${c.tags.slice(0, 2).map(t => `<span>${esc(t)}</span>`).join('') || `<span>${esc(I.t(c.source))}</span>`}</div><footer><span>${icon('clock', 12)} ${relative(c.updatedAt)}</span><span class="rating ${c.rating !== null && c.rating >= 90 ? 'high' : ''}" title="${I.t("Manual recruiter rating")}">${icon('star', 11)}${c.rating ?? '&mdash;'}</span></footer></article>`;
  }
  function candidateTable() {
    const list = filteredCandidates();
    const totalPages = Math.max(1, Math.ceil(list.length / ui.pageSize)); ui.page = Math.min(ui.page, totalPages);
    const page = list.slice((ui.page - 1) * ui.pageSize, ui.page * ui.pageSize);
    const allChecked = page.length > 0 && page.every(c => ui.selected.has(c.id));
    const counts = {All: active().length, Favorites: active().filter(c => c.favorite).length, Archived: state().candidates.filter(c => c.archived).length};
    return `${heading(I.t("TALENT DATABASE"), I.t("Your people, in one place."), I.t("Find the right record, keep the context, and make the next move."), button(I.t("Export CSV"), 'export-candidates', 'download') + button(I.t("Add candidate"), 'add-candidate', 'plus', 'primary'))}<div class="candidate-topline"><div class="tabs" role="tablist" aria-label="${I.t("Candidate groups")}">${['All', 'Favorites', 'Archived'].map(tab => `<button role="tab" aria-selected="${ui.candidateTab === tab}" data-action="candidate-tab" data-tab="${tab}" class="${ui.candidateTab === tab ? 'active' : ''}">${I.t(tab)}<span>${counts[tab]}</span></button>`).join('')}</div><label class="sort-control">${I.t("Sort by")} <select id="candidate-sort" data-filter="sort" aria-label="${I.t("Sort candidates")}">${options([{value: 'updated', label: I.t("Recently updated")}, {value: 'name', label: I.t("Name A-Z")}, {value: 'rating', label: I.t("Recruiter rating")}], ui.sort)}</select></label></div>${filters(list.length, true)}
      ${ui.selected.size ? `<div class="bulk-bar"><strong>${I.t("{0} selected", [ui.selected.size])}</strong><label>${I.t("Move to")} <select id="bulk-stage" aria-label="${I.t("Bulk move stage")}"><option value="">${I.t("Choose stage")}</option>${options(STAGES, '')}</select></label>${button(ui.candidateTab === 'Archived' ? I.t("Restore selected") : I.t("Archive selected"), 'bulk-archive', 'archive', 'text-button')}${button(I.t("Export selected"), 'export-selected', 'download', 'text-button')}${button(I.t("Clear"), 'clear-selection', 'x', 'text-button')}</div>` : ''}
      <div class="data-table"><table><thead><tr><th class="check-cell"><input type="checkbox" id="select-all" aria-label="${I.t("Select candidates on this page")}" ${allChecked ? 'checked' : ''}></th><th>${I.t("Candidate")}</th><th>${I.t("Role")}</th><th>${I.t("Stage")}</th><th>${I.t("Source")}</th><th><span title="${I.t("Manually entered, not AI-generated")}">${I.t("Rating")}</span></th><th class="favorite-cell"><span class="sr-only">${I.t("Favorite")}</span></th></tr></thead><tbody>${page.map(c => `<tr><td class="check-cell"><input type="checkbox" data-select-id="${esc(c.id)}" aria-label="${I.t("Select {0}", [esc(c.name)])}" ${ui.selected.has(c.id) ? 'checked' : ''}></td><td><button class="person-cell" data-action="candidate" data-id="${esc(c.id)}">${avatar(c)}<span><strong>${esc(c.name)}</strong><small>${esc(c.location)}</small></span></button></td><td class="role-cell">${esc(jobTitle(c))}</td><td>${stageBadge(c.stage)}</td><td class="source-cell">${esc(I.t(c.source))}</td><td><span class="rating ${c.rating !== null && c.rating >= 90 ? 'high' : ''}">${icon('star', 11)}${c.rating ?? '&mdash;'}</span></td><td>${iconButton(c.favorite ? I.t("Remove favorite") : I.t("Add favorite"), 'favorite', 'star', `data-id="${esc(c.id)}" aria-pressed="${!!c.favorite}"`)}</td></tr>`).join('')}</tbody></table>${page.length ? '' : empty(I.t("No candidates found"), I.t("Try a different search or clear your filters."), button(I.t("Clear filters"), 'clear-filters', 'refresh'))}<div class="pagination"><span>${I.t("{0}–{1} of {2} candidates", [list.length ? (ui.page - 1) * ui.pageSize + 1 : 0, Math.min(ui.page * ui.pageSize, list.length), list.length])}</span><div>${iconButton(I.t("Previous page"), 'page', 'left', `data-page="${ui.page - 1}" ${ui.page === 1 ? 'disabled' : ''}`)}<span>${I.t("Page {0} of {1}", [ui.page, totalPages])}</span>${iconButton(I.t("Next page"), 'page', 'right', `data-page="${ui.page + 1}" ${ui.page === totalPages ? 'disabled' : ''}`)}</div></div></div>`;
  }

  function jobsView() {
    const q = ui.search.toLowerCase().trim();
    const list = state().jobs.filter(j => (ui.jobStatus === 'All' || j.status === ui.jobStatus) && (!q || `${j.title} ${j.location} ${j.department}`.toLowerCase().includes(q)));
    const people = active(), open = state().jobs.filter(j => j.status === 'Active');
    const openings = open.reduce((sum, j) => sum + Math.max(0, j.openings - people.filter(c => c.jobId === j.id && c.stage === 'Hired').length), 0);
    return `${heading(I.t("HEADCOUNT PLAN"), I.t("Make room for the right people."), I.t("Manage roles and see the candidates connected to each opportunity."), button(I.t("Create job"), 'add-job', 'plus', 'primary'))}<div class="metrics-strip">${metric(I.t("Active roles"), open.length, I.t("Accepting applications in this demo"), 'briefcase')}${metric(I.t("Remaining openings"), openings, I.t("Active targets minus current hires"), 'target')}${metric(I.t("Candidates"), people.length, I.t("Linked to a job record"), 'users')}${metric(I.t("Paused roles"), state().jobs.filter(j => j.status === 'Paused').length, I.t("Resume whenever you are ready"), 'pause')}</div><div class="filter-bar"><label class="local-search">${icon('search', 16)}<input id="local-search" value="${esc(ui.search)}" placeholder="${I.t("Search jobs or locations...")}" aria-label="${I.t("Search jobs")}"></label><div class="segmented">${['All', 'Active', 'Paused', 'Closed'].map(s => button(s, 'job-status-filter', '', ui.jobStatus === s ? 'active' : '', `data-status="${s}"`)).join('')}</div><span class="filter-count">${I.t("{0} roles", [list.length])}</span></div><div class="jobs-list"><div class="jobs-header"><span>${I.t("Role & location")}</span><span>${I.t("Status")}</span><span>${I.t("Candidates")}</span><span>${I.t("Hiring progress")}</span><span>${I.t("Compensation")}</span><span></span></div>${list.map(j => { const applicants = people.filter(c => c.jobId === j.id), hired = applicants.filter(c => c.stage === 'Hired').length; return `<article class="job-row"><button class="job-name" data-action="job" data-id="${esc(j.id)}"><span class="job-icon">${icon('briefcase', 19)}</span><span><strong>${esc(j.title)}</strong><small>${esc(j.location)}</small><em>${esc(j.department)} &middot; ${esc(j.owner)}</em></span></button><span>${badge(j.status)}</span><button class="pipeline-count" data-action="job-candidates" data-id="${esc(j.id)}"><strong>${applicants.length}</strong><span>${I.t("View candidates {0}", [icon('right', 12)])}</span></button><div class="headcount"><span><b>${hired}</b> ${I.t("/ {0} hired", [j.openings])}</span><div><i style="width:${Math.min(100, percent(hired, j.openings))}%"></i></div></div><span class="pay">${esc(j.pay || I.t('Not specified'))}<small>${I.t("Sample role")}</small></span>${iconButton(I.t("Manage ") + j.title, 'job', 'more', `data-id="${esc(j.id)}"`)}</article>`; }).join('') || empty(I.t("No jobs match"), I.t("Try another status or search term."), button(I.t("Create a job"), 'add-job', 'plus'))}</div><p class="board-note">${I.t("{0} Jobs saved here are not published to Indeed, LinkedIn, or any external job board.", [icon('info', 14)])}</p>`;
  }
  function calendarView() {
    const [year, month] = ui.calendarMonth.split('-').map(Number);
    const first = new Date(Date.UTC(year, month - 1, 1, 12));
    const gridStart = new Date(first); gridStart.setUTCDate(1 - ((first.getUTCDay() - I.weekStart + 7) % 7));
    const events = state().interviews.filter(i => ui.calendarFilter === 'All' ? i.status !== 'Cancelled' : i.status === ui.calendarFilter);
    const onDay = events.filter(i => dateKey(i.startsAt) === ui.calendarDate).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const selectedDate = new Date(ui.calendarDate + 'T12:00:00Z');
    return `${heading(I.t("MAKE TIME FOR PEOPLE"), I.t("Conversations move hiring forward."), I.t("Local appointments, displayed in {0}. No external calendar is connected.", [esc(state().settings.timezone)]), button(I.t("Export calendar"), 'export-calendar', 'download') + button(I.t("Schedule interview"), 'add-interview', 'plus', 'primary'))}<div class="calendar-layout"><section class="panel month-panel"><div class="section-title"><h2>${first.toLocaleDateString(I.locale, {timeZone: 'UTC', month: 'long', year: 'numeric'})}</h2><div class="calendar-controls">${iconButton(I.t("Previous month"), 'calendar-month', 'left', 'data-step="-1"')}${button(I.t("Today"), 'calendar-today', '', 'text-button')}${iconButton(I.t("Next month"), 'calendar-month', 'right', 'data-step="1"')}</div></div><div class="calendar-weekdays">${I.weekdays().map(d => `<span>${d}</span>`).join('')}</div><div class="calendar-grid">${Array.from({length: 42}, (_, i) => { const d = new Date(gridStart); d.setUTCDate(d.getUTCDate() + i); const key = d.toISOString().slice(0, 10), count = events.filter(e => dateKey(e.startsAt) === key).length; return `<button class="calendar-day ${d.getUTCMonth() === month - 1 ? '' : 'outside'} ${key === ui.calendarDate ? 'selected' : ''} ${key === today ? 'today' : ''}" data-action="calendar-day" data-date="${key}" aria-label="${I.t("{0}, {1} appointments", [key, count])}" aria-pressed="${key === ui.calendarDate}"><span>${d.getUTCDate()}</span>${count ? `<i></i><small>${I.count('event', count)}</small>` : ''}</button>`; }).join('')}</div><div class="calendar-legend"><span><i></i>${I.t("Appointment")}</span><button class="text-button" data-action="calendar-upcoming">${I.t("Go to next appointment {0}", [icon('arrow', 12)])}</button></div></section><section class="panel day-panel">${panelHead(selectedDate.toLocaleDateString(I.locale, {timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric'}), I.count('appointment', onDay.length), `<label class="select-control"><select id="calendar-filter" data-filter="calendarFilter" aria-label="${I.t("Filter appointments")}">${options(['Scheduled', 'Completed', 'Cancelled'], ui.calendarFilter, 'Active events')}</select></label>`)}<div class="day-events">${onDay.map(i => { const c = state().candidates.find(c => c.id === i.candidateId); return `<button class="event-card" data-action="interview" data-id="${esc(i.id)}"><div><span>${I.t("{0} · {1} min", [timeFormat(i.startsAt), i.duration])}</span>${badge(i.status)}</div><h3>${esc(i.title)}</h3><p>${c ? esc(c.name) : 'Candidate'}</p><small>${icon(i.format === 'Phone' ? 'phone' : 'calendar', 14)} ${esc(I.t(i.format))} &middot; ${esc(i.interviewer)}</small></button>`; }).join('') || empty(I.t("Space for a conversation"), I.t("There are no appointments for this date."), button(I.t("Schedule interview"), 'add-interview', 'plus'))}</div></section></div>`;
  }
  function campaignAudience(campaign) {
    return active().filter(c => (campaign.jobId === 'All' || c.jobId === campaign.jobId) && (campaign.stage === 'All' || c.stage === campaign.stage) && (campaign.audience !== 'Favorites' || c.favorite));
  }
  function messagePreview(text, c) {
    return String(text).replaceAll('{{first_name}}', c?.name.trim().split(/\s+/)[0] || 'Candidate').replaceAll('{{company}}', state().settings.company).replaceAll('{{job_title}}', c ? jobTitle(c) : 'your next role');
  }
  function campaignsView() {
    const q = ui.search.toLowerCase().trim();
    const list = state().campaigns.filter(c => !q || `${c.name} ${c.channel} ${c.message}`.toLowerCase().includes(q));
    const running = state().campaigns.find(c => c.status === 'Running');
    const featured = running || state().campaigns.find(c => c.status === 'Ready') || state().campaigns[0];
    return `${heading(I.t("THOUGHTFUL OUTREACH"), I.t("Start a better conversation."), I.t("Build segments, personalize a message, and preview every campaign before connecting a provider."), button(I.t("Templates"), 'templates', 'message') + button(I.t("New campaign"), 'add-campaign', 'plus', 'primary'))}<section class="campaign-hero"><div class="campaign-hero-content"><span class="eyebrow light">${I.t(running ? 'DEMO SIMULATION IN PROGRESS' : 'A LITTLE PERSONAL GOES A LONG WAY')}</span><h2>${featured ? esc(featured.name) : I.t('Your next conversation starts here.')}</h2><p>${I.t(running ? 'This campaign is running only as a local simulation. No messages have been sent or delivered.' : 'Keep the context. Write like a person. Preview your audience and message in one place.')}</p><div>${featured ? button(I.t("Preview campaign"), 'campaign', 'arrow', 'light-button', `data-id="${esc(featured.id)}"`) : button(I.t("Create campaign"), 'add-campaign', 'plus', 'light-button')}${button(I.t("Browse templates"), 'templates', '', 'ghost-light')}</div></div><div class="campaign-art" aria-hidden="true"><div class="message-bubble"><span class="bubble-avatar">${icon('message', 19)}</span><span>${I.t("A more personal hello.")}<i></i><i></i></span></div><div class="message-bubble reply"><span>${I.t("{0} Keep people at the center.", [icon('checkCircle', 18)])}</span></div><span class="art-caption">${I.t("RIGHT MESSAGE. HUMAN CONNECTION.")}</span></div></section><div class="campaign-stats"><div><span>${I.t("Campaign drafts")}</span><strong>${state().campaigns.filter(c => c.status === 'Draft').length}</strong><small>${I.t("Saved in this browser")}</small></div><div><span>${I.t("Ready to review")}</span><strong>${state().campaigns.filter(c => c.status === 'Ready').length}</strong><small>${I.t("Message and segment prepared")}</small></div><div><span>${I.t("Live messages sent")}</span><strong>0</strong><small>${I.t("No provider is connected")}</small></div></div><section class="panel campaign-table">${panelHead(I.t("Your campaigns"), I.t("Local drafts and explicitly labeled simulations"), `<label class="local-search narrow">${icon('search', 15)}<input id="local-search" value="${esc(ui.search)}" placeholder="${I.t("Find a campaign...")}" aria-label="${I.t("Search campaigns")}"></label>`)}<div class="campaign-rows">${list.map(c => `<button class="campaign-row" data-action="campaign" data-id="${esc(c.id)}"><span class="channel-icon">${icon(c.channel === 'SMS' ? 'message' : 'mail', 20)}</span><span class="campaign-name"><strong>${esc(c.name)}</strong><small>${I.t("{0} · Updated {1}", [esc(I.t(c.channel)), relative(c.updatedAt)])}</small></span>${badge(c.status === 'Running' ? 'Demo running' : c.status)}<span class="campaign-audience"><strong>${campaignAudience(c).length}</strong><small>${I.t("in audience")}</small></span>${icon('right', 16)}</button>`).join('') || empty(I.t("No campaigns yet"), I.t("Start with a template or a new draft."), button(I.t("New campaign"), 'add-campaign', 'plus'))}</div></section>`;
  }
  function reportData() {
    const people = active().filter(c => ui.reportDays === 0 || new Date(c.createdAt).getTime() >= Date.now() - ui.reportDays * 86400000);
    const hires = people.filter(c => c.stage === 'Hired');
    const durations = hires.map(c => { const h = c.history.filter(h => h.stage === 'Hired').at(-1); return h ? Math.max(0, (new Date(h.at) - new Date(c.createdAt)) / 86400000) : null; }).filter(v => v !== null).sort((a, b) => a - b);
    const median = durations.length ? (durations[Math.floor((durations.length - 1) / 2)] + durations[Math.ceil((durations.length - 1) / 2)]) / 2 : null;
    const funnel = STAGES.map((stage, index) => ({stage, count: people.filter(c => Math.max(STAGES.indexOf(c.stage), ...c.history.map(h => STAGES.indexOf(h.stage))) >= index).length}));
    const locations = [...new Set(people.map(c => c.location))].map(location => ({location, total: people.filter(c => c.location === location).length, hired: hires.filter(c => c.location === location).length})).sort((a, b) => b.total - a.total);
    return {people, hires, median, funnel, locations, sources: sourceStats(people)};
  }
  function reportsView() {
    const r = reportData();
    return `${heading(I.t("A CLEARER PICTURE"), I.t("Hiring, without the guesswork."), I.t("Metrics calculated from your current, non-archived demo records. No estimated costs or invented trends."), button(I.t("Export report"), 'export-report', 'download'))}<div class="report-toolbar"><div class="segmented">${[{d: 7, label: I.t("7 days")}, {d: 30, label: I.t("30 days")}, {d: 90, label: I.t("90 days")}, {d: 0, label: I.t("All time")}].map(x => button(x.label, 'report-period', '', ui.reportDays === x.d ? 'active' : '', `data-days="${x.d}"`)).join('')}</div><span>${I.t("Candidate cohort by application date")}</span></div><div class="metrics-strip">${metric(I.t("Applications in cohort"), r.people.length, ui.reportDays ? I.t("Added within the last {0} days", [ui.reportDays]) : I.t("All non-archived applications"), 'users')}${metric(I.t("Currently hired"), r.hires.length, I.t("Within the selected cohort"), 'checkCircle')}${metric(I.t("Application to hire"), percent(r.hires.length, r.people.length) + '%', I.t("Current hires / cohort applications"), 'target')}${metric(I.t("Median time to hire"), r.median === null ? '&mdash;' : I.number(r.median, {minimumFractionDigits: 1, maximumFractionDigits: 1}) + `<small>${I.t("d")}</small>`, r.median === null ? I.t("No hire history in this cohort") : I.t("From {0} sample hire record{1}", [r.hires.length, r.hires.length === 1 ? '' : 's']), 'clock')}</div><div class="report-grid"><section class="panel conversion-panel">${panelHead(I.t("Pipeline progression"), I.t("Reached this stage or a later stage; not step-by-step conversion"))}<div class="funnel">${r.funnel.map((f, i) => `<div><span><i class="status-dot stage-${i}"></i>${I.t(f.stage)}</span><div class="funnel-track"><b style="width:${percent(f.count, r.people.length)}%"></b></div><strong>${f.count}</strong><em>${percent(f.count, r.people.length)}%</em></div>`).join('')}</div><p class="quiet-note">${I.t("Moving a candidate backward keeps their earlier stage history.")}</p></section><section class="panel location-panel">${panelHead(I.t("Your talent map"), I.t("Active applications by location"))}<div class="location-list">${r.locations.slice(0, 6).map(l => `<div><span><strong>${esc(l.location)}</strong><small>${I.t("{0} currently hired", [l.hired])}</small></span><div><i style="width:${percent(l.total, r.people.length)}%"></i></div><b>${l.total}</b></div>`).join('') || `<p class="muted">${I.t("No records in this period.")}</p>`}</div></section></div><section class="panel source-report">${panelHead(I.t("Source performance"), I.t("Counts use the same selected candidate cohort"))}<div class="table-scroll"><table><thead><tr><th>${I.t("Source")}</th><th>${I.t("Applications")}</th><th>${I.t("Past first review")}</th><th>${I.t("Currently hired")}</th><th>${I.t("Hire rate")}</th></tr></thead><tbody>${r.sources.map(s => `<tr><td><strong>${esc(I.t(s.source))}</strong></td><td>${s.total}</td><td>${s.advanced}</td><td>${s.hired}</td><td>${percent(s.hired, s.total)}%</td></tr>`).join('')}</tbody></table>${r.sources.length ? '' : empty(I.t("No data in this period"), I.t("Select a longer time range to include more applications."))}</div></section>`;
  }
  function toggle(name, title, description, checked) { return `<label class="toggle-row"><span><strong>${title}</strong><small>${description}</small></span><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}><i aria-hidden="true"></i></label>`; }
  function settingsView() {
    return `${heading(I.t("MAKE IT YOUR WORKSPACE"), I.t("The details behind the work."), (Store.remote ? (I.language === "ru" ? "\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u0441\u043e\u0445\u0440\u0430\u043d\u044f\u044e\u0442\u0441\u044f \u043d\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435. \u0412\u043d\u0435\u0448\u043d\u0438\u0435 \u0441\u0435\u0440\u0432\u0438\u0441\u044b \u043d\u0435 \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u044b." : "Settings are stored on the server. External providers are not connected.") : I.t("Workspace preferences are local. Team roles and notification settings do not activate backend services.")))}<div class="settings-layout"><nav class="settings-nav" aria-label="${I.t("Settings sections")}">${[{id: 'workspace', label: I.t("Workspace"), ico: 'briefcase'}, {id: 'team', label: I.t("Team & roles"), ico: 'users'}, {id: 'integrations', label: I.t("Integrations"), ico: 'link'}, {id: 'data', label: I.t("Data & privacy"), ico: 'shield'}].map(x => `<button class="${ui.settingsTab === x.id ? 'active' : ''}" data-action="settings-tab" data-tab="${x.id}" ${ui.settingsTab === x.id ? 'aria-current="page"' : ''}>${icon(x.ico, 17)}${x.label}</button>`).join('')}</nav><div class="settings-content">${({workspace: workspaceSettings, team: teamSettings, integrations: integrationSettings, data: dataSettings}[ui.settingsTab] || workspaceSettings)()}</div></div>`;
  }
  function workspaceSettings() {
    const s = state().settings;
    return `<form id="settings-form" class="settings-section"><div class="language-settings"><div><h2>${I.t('Interface language')}</h2><p>${I.t('Choose the interface language. Your records and draft messages stay unchanged.')}</p></div><label for="workspace-language">${I.t('Language')}<select id="workspace-language" data-language-control><option value="en" lang="en" ${I.language === 'en' ? 'selected' : ''}>English</option><option value="ru" lang="ru" ${I.language === 'ru' ? 'selected' : ''}>Русский</option></select></label></div><hr><div><h2>${I.t("Workspace details")}</h2><p>${I.t("The name your team sees throughout the demo.")}</p></div><div class="logo-upload"><span>${s.logo ? `<img src="${esc(s.logo)}" alt="${I.t("Workspace logo")}">` : esc(initials(s.company))}</span><div><label class="secondary upload-label" for="logo-file">${I.t("{0}Upload logo", [icon('upload', 15)])}</label><input id="logo-file" type="file" accept="image/png,image/jpeg,image/webp" hidden><small>${I.t("PNG, JPG or WebP. Up to 512 KB.")}</small></div>${s.logo ? button(I.t("Remove"), 'remove-logo', 'x', 'text-button') : ''}</div><label>${I.t("Company name")}<input name="company" value="${esc(s.company)}" required maxlength="80" autocomplete="organization"></label><div class="form-grid"><label>${I.t("Company website")}<input name="website" value="${esc(s.website)}" type="url" placeholder="${I.t("https://example.com")}" maxlength="250"></label><label>${I.t("Display timezone")}<select name="timezone">${options([{value: 'America/New_York', label: I.t("Eastern Time (New York)")}, {value: 'America/Chicago', label: I.t("Central Time (Chicago)")}, {value: 'America/Denver', label: I.t("Mountain Time (Denver)")}, {value: 'America/Los_Angeles', label: I.t("Pacific Time (Los Angeles)")}, {value: 'America/Phoenix', label: I.t("Arizona (Phoenix)")}, {value: 'UTC', label: I.t("UTC")}], s.timezone)}</select></label></div><hr><div><h2>${I.t("Notification preferences")}</h2><p>${I.t("Saved for a future integration. This demo does not send notifications.")}</p></div>${toggle('digest', I.t("Daily recruiting digest"), I.t("A morning overview of the hiring workspace."), s.digest)}${toggle('interview', I.t("Interview reminders"), I.t("A reminder preference for upcoming conversations."), s.interview)}${toggle('offers', I.t("Offer activity"), I.t("Updates when a candidate reaches an offer stage."), s.offers)}<p class="form-error" role="alert" hidden></p><div class="settings-actions"><span class="muted">${Store.remote ? `${icon("database", 14)} ${I.language === "ru" ? "\u0425\u0440\u0430\u043d\u0438\u0442\u0441\u044f \u043d\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435" : "Stored on server"}` : I.t("{0} Saved in this browser", [icon('database', 14)])}</span><button class="primary" type="submit">${I.t("{0}Save changes", [icon('check', 16)])}</button></div></form>`;
  }
  function teamSettings() {
    return `<section class="settings-section">${panelHead(I.t("People behind the hiring"), I.t("Sample team directory. Roles are labels, not enforced permissions."), button(I.t("Add member"), 'add-member', 'plus', 'primary'))}<div class="notice">${I.t("{0} Invitations are saved as local drafts. No invitation email is sent.", [icon('info', 17)])}</div><div class="team-list">${state().team.map(t => `<div>${avatar({...t, color: '#deebe6'})}<span><strong>${esc(t.name)}</strong><small>${esc(t.email || I.t('Email not configured'))} &middot; ${esc(I.t(t.status))}</small></span><em>${esc(I.t(t.role === 'Owner' ? 'Workspace owner' : t.role))}</em>${iconButton(I.t("Edit ") + t.name, 'edit-member', 'edit', `data-id="${esc(t.id)}"`)}</div>`).join('')}</div></section>`;
  }
  function integrationSettings() {
    return `<section class="settings-section"><div><h2>${Store.remote ? "Connect external services" : I.t("Connect when your backend is ready")}</h2><p>${Store.remote ? "The backend API is connected; SMS, email, and calendar providers are not connected. Keep API secrets on the server." : I.t("No provider is connected in this build. Never place API secrets in frontend code or browser storage.")}</p></div><div class="integration-grid">${[{id: 'api', name: 'Backend API', text: 'Authentication, records, audit trail and permissions.', ico: 'database'}, {id: 'sms', name: 'SMS provider', text: 'Server-side sending, consent checks and delivery events.', ico: 'message'}, {id: 'email', name: 'Email provider', text: 'Server-side templates, sending and delivery events.', ico: 'mail'}, {id: 'calendar', name: 'External calendar', text: 'Account connection and two-way event synchronization.', ico: 'calendar'}].map(i => `<article><span class="integration-icon">${icon(i.ico, 23)}</span><h3>${I.t(i.name)}</h3><p>${I.t(i.text)}</p><span class="badge ${i.id === "api" && Store.remote ? "active" : "not-connected"}">${i.id === "api" && Store.remote ? (I.language === "ru" ? "\u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u043e" : "Connected") : I.t("Not connected")}</span>${button(I.t("View requirements"), 'integration-info', 'arrow', 'text-button', `data-integration="${i.id}"`)}</article>`).join('')}</div></section>`;
  }
  function dataSettings() {
    return `<section class="settings-section"><div><h2>${Store.remote ? (I.language === "ru" ? "\u0414\u0430\u043d\u043d\u044b\u0435 \u043a\u043e\u043c\u0430\u043d\u0434\u044b" : "Workspace data") : I.t("Your demo data")}</h2><p>${Store.remote ? (I.language === "ru" ? "\u0417\u0430\u043f\u0438\u0441\u0438 \u0445\u0440\u0430\u043d\u044f\u0442\u0441\u044f \u043d\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435." : "Records are stored in the SQLite database.") : I.t("Records are stored in this browser, not in a cloud database.")}</p></div><div class="notice">${Store.remote ? `${icon("shield", 19)} ${I.language === "ru" ? "\u0418\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u0439\u0442\u0435 \u0442\u0435\u0441\u0442\u043e\u0432\u044b\u0435 \u0434\u0430\u043d\u043d\u044b\u0435 \u0434\u043e \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0438 \u0431\u0435\u0437\u043e\u043f\u0430\u0441\u043d\u043e\u0441\u0442\u0438 \u0438 \u043a\u043e\u043d\u0444\u0438\u0434\u0435\u043d\u0446\u0438\u0430\u043b\u044c\u043d\u043e\u0441\u0442\u0438." : "Use test data until security and privacy review is complete."}` : I.t("{0} Do not enter real applicant data, identification documents, medical information, or secret keys. This frontend has no authentication or access control.", [icon('shield', 19)])}</div><div class="data-summary"><div><strong>${state().candidates.length}</strong><span>${I.t("Candidate records")}</span></div><div><strong>${state().jobs.length}</strong><span>${I.t("Job records")}</span></div><div><strong>${state().interviews.length}</strong><span>${I.t("Appointments")}</span></div></div><div class="data-action-row"><span><strong>${I.t("Export a backup")}</strong><small>${(Store.remote ? "Includes the current workspace records and settings as JSON." : I.t("Includes all local records and settings as JSON."))}</small></span>${button(I.t("Export JSON"), 'export-backup', 'download')}</div><div class="data-action-row"><span><strong>${I.t("Restore a backup")}</strong><small>${(Store.remote ? "Replaces the entire server workspace after confirmation." : I.t("Replaces this demo workspace after confirmation."))}</small></span><label class="secondary upload-label" for="backup-file">${I.t("{0}Import JSON", [icon('upload', 15)])}</label><input id="backup-file" type="file" accept="application/json,.json" hidden></div>${Store.remote ? "" : `<div class="data-action-row danger-zone"><span><strong>${I.t("Reset demo workspace")}</strong><small>${I.t("Replace Jobster records with the original sample data. Other browser data is not cleared.")}</small></span>${button(I.t("Reset demo"), 'confirm-reset', 'refresh', 'danger-button')}</div>`}</section>`;
  }

  function openOverlay(html, drawer = false) {
    if (!$('#overlay-root').children.length) lastFocus = document.activeElement;
    $('#overlay-root').innerHTML = `<div class="${drawer ? 'drawer-backdrop' : 'modal-backdrop'}" data-backdrop><section class="${drawer ? 'candidate-drawer' : 'modal'}" role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabindex="-1">${html}</section></div>`;
    $('.app-shell').inert = true; document.body.classList.add('overlay-open'); closeGlobal();
    prepareForms();
    const dialog = $('[role="dialog"]');
    if (dialog) ($('input:not([type="hidden"]), textarea, select', dialog) || $('button', dialog) || dialog).focus({preventScroll: true});
  }
  function modal(title, text, content, wide = false) {
    openOverlay(`<div class="modal-head"><div><span class="eyebrow">${I.t("FALCON JOBSTER")}</span><h2 id="dialog-title">${title}</h2><p>${text}</p></div>${iconButton(I.t("Close dialog"), 'close-overlay', 'x')}</div>${content}`);
    if (wide) $('.modal').classList.add('wide');
  }
  function closeOverlay() {
    if (!$('#overlay-root')) return;
    const wasOpen = !!$('#overlay-root').children.length;
    $('#overlay-root').innerHTML = ''; document.body.classList.remove('overlay-open');
    if ($('.app-shell')) $('.app-shell').inert = false;
    if (wasOpen && lastFocus?.isConnected) lastFocus.focus({preventScroll: true});
    lastFocus = null; currentCandidateId = null;
  }
  function formActions(label = 'Save changes', extra = '') { return `<p class="form-error" role="alert" hidden></p><div class="modal-actions">${button(I.t("Cancel"), 'close-overlay')}${extra}<button class="primary" type="submit">${icon('check', 16)}${I.t(label)}</button></div>`; }
  function showFormError(form, message) { const error = $('.form-error', form); if (error) { error.textContent = I.message(message); error.hidden = false; error.scrollIntoView({block: 'nearest'}); } else toast(message, true); }
  function openDrawer(id, tab = 'profile') {
    const c = state().candidates.find(c => c.id === id);
    if (!c) { toast(I.t("This candidate could not be found."), true); return; }
    currentCandidateId = id; ui.drawerTab = tab;
    const appointments = state().interviews.filter(i => i.candidateId === id && i.status === 'Scheduled').sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const messages = state().messages.filter(m => m.candidateId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const profile = `<section class="drawer-section"><h3>${I.t("Contact & context")}</h3><div class="contact-links">${c.email ? `<a href="mailto:${encodeURIComponent(c.email)}">${icon('mail', 15)}${esc(c.email)}</a>` : `<span class="muted">${I.t("No email added")}</span>`}${c.phone ? `<a href="tel:${esc(c.phone.replace(/[^+\d]/g, ''))}">${icon('phone', 15)}${esc(c.phone)}</a>` : `<span class="muted">${I.t("No phone added")}</span>`}</div><div class="facts"><div><span>${I.t("Experience")}</span><strong>${esc(c.experience || I.t('Not specified'))}</strong></div><div><span>${I.t("Applied")}</span><strong>${dateFormat(c.createdAt, {year: 'numeric'})}</strong></div><div><span>${I.t("Source")}</span><strong>${esc(I.t(c.source))}</strong></div><div><span>${I.t("Recruiter")}</span><strong>${esc(c.owner)}</strong></div></div><div class="tags">${c.tags.map(t => `<span>${esc(t)}</span>`).join('')}</div></section><section class="drawer-section"><form id="notes-form" data-id="${esc(c.id)}"><label for="candidate-notes">${I.t("Recruiter notes")}</label><textarea id="candidate-notes" name="notes" rows="4" maxlength="6000" placeholder="${I.t("Keep useful context for the next conversation...")}">${esc(c.notes)}</textarea><button class="secondary" type="submit">${I.t("{0}Save note", [icon('check', 14)])}</button></form></section><section class="drawer-section">${panelHead(I.t("Scheduled conversations"), I.t("Stored in this workspace only"), iconButton(I.t("Schedule interview"), 'add-interview', 'plus', `data-candidate-id="${esc(id)}"`))}${appointments.map(i => `<button class="mini-event" data-action="interview" data-id="${esc(i.id)}">${icon('calendar', 17)}<span><strong>${esc(i.title)}</strong><small>${I.t("{0} at {1}", [dateFormat(i.startsAt), timeFormat(i.startsAt)])}</small></span>${icon('right', 14)}</button>`).join('') || `<p class="muted">${I.t("No scheduled conversations yet.")}</p>`}</section>`;
    const activity = `<section class="drawer-section timeline">${[...c.history].reverse().map(h => `<div><i></i><span><strong>${esc(I.message(h.text))}</strong><small>${dateFormat(h.at)} &middot; ${timeFormat(h.at)}</small></span></div>`).join('')}</section>`;
    const drafts = `<section class="drawer-section"><div class="notice">${I.t("{0} These are drafts. No email or SMS has been sent.", [icon('info', 16)])}</div>${messages.map(m => `<article class="draft-message"><header><span>${I.t("{0}{1} draft", [icon(m.channel === 'SMS' ? 'message' : 'mail', 15), esc(I.t(m.channel))])}</span><small>${dateFormat(m.createdAt)}</small></header>${m.subject ? `<strong>${esc(m.subject)}</strong>` : ''}<p>${esc(m.body)}</p>${button(I.t("Edit draft"), 'edit-message', 'edit', 'text-button', `data-id="${esc(m.id)}"`)}</article>`).join('') || empty(I.t("Start with a thoughtful draft"), I.t("Write a message and save it for review."), button(I.t("Write message"), 'message', 'message', 'primary', `data-id="${esc(id)}"`))}</section>`;
    openOverlay(`<div class="drawer-head"><span class="eyebrow">${I.t("CANDIDATE PROFILE{0}", [c.archived ? I.t(' / ARCHIVED') : ''])}</span><div>${iconButton(c.favorite ? I.t("Remove favorite") : I.t("Add favorite"), 'favorite', 'star', `data-id="${esc(id)}" aria-pressed="${!!c.favorite}"`)}${iconButton(I.t("Edit candidate"), 'edit-candidate', 'edit', `data-id="${esc(id)}"`)}${iconButton(I.t("Close profile"), 'close-overlay', 'x')}</div></div><div class="profile-lead">${avatar(c, 'large')}<div><h2 id="dialog-title">${esc(c.name)}</h2><p>${esc(jobTitle(c))}</p><span>${icon('pin', 13)}${esc(c.location)}</span></div></div><div class="profile-meta">${stageBadge(c.stage)}<span class="rating" title="${I.t("Manual recruiter rating")}">${icon('star', 12)}${c.rating ?? '&mdash;'} <small>${I.t("Manual rating")}</small></span></div><div class="drawer-actions">${button(I.t("Message draft"), 'message', 'message', 'primary', `data-id="${esc(id)}"`)}${button(I.t("Schedule"), 'add-interview', 'calendar', 'secondary', `data-candidate-id="${esc(id)}" ${c.archived ? 'disabled' : ''}`)}</div><div class="stage-progress" aria-label="${I.t("Change candidate stage")}">${STAGES.map((s, i) => `<button class="${i <= STAGES.indexOf(c.stage) ? 'done' : ''} ${s === c.stage ? 'current' : ''}" data-action="move-candidate" data-id="${esc(id)}" data-stage="${s}" aria-pressed="${s === c.stage}"><i></i><span>${I.t(s)}</span></button>`).join('')}</div><div class="drawer-tabs" role="tablist" aria-label="${I.t("Candidate profile tabs")}">${[{id: 'profile', label: I.t("Profile")}, {id: 'activity', label: I.t("Activity")}, {id: 'messages', label: I.t("Drafts ({0})", [messages.length])}].map(t => `<button role="tab" aria-selected="${tab === t.id}" class="${tab === t.id ? 'active' : ''}" data-action="drawer-tab" data-id="${esc(id)}" data-tab="${t.id}">${t.label}</button>`).join('')}</div>${tab === 'activity' ? activity : tab === 'messages' ? drafts : profile}<div class="drawer-footer">${button(c.archived ? I.t("Restore candidate") : I.t("Archive candidate"), 'archive-candidate', 'archive', 'text-button', `data-id="${esc(id)}"`)}<span>${I.t("Sample record · Local only")}</span></div>`, true);
  }
  function openCandidateForm(id = '', stage = 'New') {
    const c = state().candidates.find(c => c.id === id);
    if (!state().jobs.length) { modal(I.t("Create a role first"), I.t("Every candidate is linked to a job record."), button(I.t("Create job"), 'add-job', 'plus', 'primary')); return; }
    modal(c ? I.t("Edit candidate") : I.t("A new person. A new possibility."), I.t("Add sample information only. Required fields are marked with an asterisk."), `<form id="candidate-form" data-id="${esc(id)}"><div class="form-grid"><label>${I.t("Full name *")}<input name="name" required maxlength="100" value="${esc(c?.name || '')}" placeholder="${I.t("Taylor Morgan")}" autocomplete="off"></label><label>${I.t("Email *")}<input name="email" type="email" required maxlength="180" value="${esc(c?.email || '')}" placeholder="${I.t("taylor@example.com")}" autocomplete="off"></label></div><label>${I.t("Job *")}<select name="jobId" required>${jobOptions(c?.jobId || (ui.job !== 'All' ? ui.job : state().jobs[0]?.id), '')}</select></label><div class="form-grid"><label>${I.t("Location *")}<input name="location" required maxlength="100" value="${esc(c?.location || '')}" placeholder="${I.t("City, ST")}"></label><label>${I.t("Phone")}<input name="phone" type="tel" maxlength="40" value="${esc(c?.phone || '')}" placeholder="(555) 555-0100"></label></div><div class="form-grid"><label>${I.t("Source")}<select name="source">${options([...new Set(['Indeed', 'Career site', 'Referral', 'LinkedIn', 'Text campaign', 'Job fair', 'Manual', ...(c ? [c.source] : [])])], c?.source || 'Manual')}</select></label><label>${I.t("Stage")}<select name="stage">${options(STAGES, c?.stage || stage)}</select></label></div><div class="form-grid"><label>${I.t("Recruiter")}<select name="owner">${ownerOptions(c?.owner || 'Zafar Safarov')}</select></label><label>${I.t("Manual rating (0-100)")}<input name="rating" type="number" min="0" max="100" step="1" value="${c?.rating ?? ''}" placeholder="${I.t("Not rated")}"></label></div><div class="form-grid"><label>${I.t("Experience")}<input name="experience" maxlength="100" value="${esc(c?.experience || '')}" placeholder="${I.t("e.g. 3 years")}"></label><label>${I.t("Tags, separated by commas")}<input name="tags" maxlength="300" value="${esc(c?.tags.join(', ') || '')}" placeholder="${I.t("Bilingual, Customer support")}"></label></div><label>${I.t("Recruiter notes")}<textarea name="notes" maxlength="6000" rows="3" placeholder="${I.t("Useful context for the next conversation...")}">${esc(c?.notes || '')}</textarea></label>${formActions(c ? I.t("Save candidate") : I.t("Add candidate"))}</form>`, true);
  }
  function openJobForm(id = '') {
    const j = state().jobs.find(j => j.id === id);
    modal(j ? I.t("Edit job") : I.t("Create a new opportunity."), I.t("This saves a local job record. It does not publish to any job board."), `<form id="job-form" data-id="${esc(id)}"><label>${I.t("Job title *")}<input name="title" required maxlength="120" value="${esc(j?.title || '')}" placeholder="${I.t("Customer Support Specialist")}"></label><div class="form-grid"><label>${I.t("Department *")}<input name="department" required maxlength="80" value="${esc(j?.department || '')}" placeholder="${I.t("Operations")}"></label><label>${I.t("Location *")}<input name="location" required maxlength="140" value="${esc(j?.location || '')}" placeholder="${I.t("Austin, TX - Hybrid")}"></label></div><div class="form-grid"><label>${I.t("Hiring target *")}<input name="openings" type="number" required min="1" max="10000" step="1" value="${j?.openings || 1}"></label><label>${I.t("Compensation")}<input name="pay" maxlength="100" value="${esc(j?.pay || '')}" placeholder="${I.t("Not specified")}"></label></div><div class="form-grid"><label>${I.t("Owner")}<select name="owner">${ownerOptions(j?.owner || 'Zafar Safarov')}</select></label><label>${I.t("Status")}<select name="status">${options(['Active', 'Paused', 'Closed'], j?.status || 'Active')}</select></label></div><label>${I.t("Role description")}<textarea name="description" rows="4" maxlength="6000" placeholder="${I.t("Responsibilities and requirements...")}">${esc(j?.description || '')}</textarea></label>${formActions(j ? I.t("Save job") : I.t("Create job"))}</form>`);
  }
  function openJob(id) {
    const j = state().jobs.find(j => j.id === id); if (!j) return;
    const people = active().filter(c => c.jobId === id);
    modal(esc(j.title), `${esc(j.department)} &middot; ${esc(j.location)}`, `<div class="job-detail-meta">${badge(j.status)}<span>${esc(j.owner)}</span></div><div class="data-summary"><div><strong>${people.length}</strong><span>${I.t("Candidates")}</span></div><div><strong>${people.filter(c => c.stage === 'Hired').length}</strong><span>${I.t("Hired")}</span></div><div><strong>${j.openings}</strong><span>${I.t("Target")}</span></div></div><div class="mini-pipeline">${STAGES.map(s => `<button data-action="job-stage-candidates" data-id="${esc(id)}" data-stage="${s}">${stageBadge(s)}<strong>${people.filter(c => c.stage === s).length}</strong></button>`).join('')}</div><div class="job-description"><h3>${I.t("Compensation")}</h3><p>${esc(j.pay || I.t('Not specified'))}</p><h3>${I.t("About the role")}</h3><p>${esc(j.description || I.t('No role description added yet.'))}</p></div><div class="notice">${I.t("{0} Local record only. Not published to a job board.", [icon('info', 16)])}</div><div class="modal-actions wrap">${button(I.t("Edit job"), 'edit-job', 'edit', 'secondary', `data-id="${esc(id)}"`)}${button(j.status === 'Active' ? I.t("Pause job") : I.t("Activate job"), 'toggle-job', j.status === 'Active' ? 'pause' : 'play', 'secondary', `data-id="${esc(id)}"`)}${j.status !== 'Closed' ? button(I.t("Close role"), 'close-job', 'archive', 'text-button', `data-id="${esc(id)}"`) : ''}${button(I.t("View pipeline"), 'job-pipeline', 'kanban', 'primary', `data-id="${esc(id)}"`)}</div>`, true);
  }
  function openMessage(candidateId, messageId = '') {
    const c = state().candidates.find(c => c.id === candidateId); if (!c) return;
    const m = state().messages.find(m => m.id === messageId);
    modal(I.t("A message for {0}", [esc(c.name.split(' ')[0])]), I.t("Save a local draft. Sending is unavailable until a secure backend and provider are connected."), `<form id="message-form" data-candidate-id="${esc(candidateId)}" data-id="${esc(messageId)}"><div class="notice">${I.t("{0} Draft only · No SMS or email will be sent.", [icon('mail', 17)])}</div><label>${I.t("Channel")}<select name="channel">${options(['SMS', 'Email'], m?.channel || 'Email')}</select></label><label>${I.t("Subject (email)")}<input name="subject" maxlength="200" value="${esc(m?.subject || `Your application for ${jobTitle(c)}`)}"></label><label>${I.t("Message *")}<textarea name="body" required maxlength="6000" rows="7">${esc(m?.body || `Hi ${c.name.split(' ')[0]},\n\nThank you for your interest in the ${jobTitle(c)} role. We would like to learn more about your experience. When would be a good time for a conversation?\n\n${state().settings.company}`)}</textarea></label>${formActions(I.t("Save draft"))}</form>`);
  }
  function openInterviewForm(candidateId = '', id = '') {
    const event = state().interviews.find(i => i.id === id);
    const people = active();
    if (!people.length) { modal(I.t("Add a candidate first"), I.t("An interview needs a candidate record."), button(I.t("Add candidate"), 'add-candidate', 'plus', 'primary')); return; }
    let initial = new Date(); initial.setDate(initial.getDate() + 1); initial.setHours(10, 0, 0, 0);
    if (event) initial = new Date(event.startsAt);
    else if (ui.view === 'calendar') initial = new Date(ui.calendarDate + 'T10:00:00');
    const localValue = new Date(initial.getTime() - initial.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    modal(event ? I.t("Reschedule conversation") : I.t("Make time for a conversation."), I.t("Stored only in the demo calendar. No meeting invitation is sent."), `<form id="interview-form" data-id="${esc(id)}"><label>${I.t("Candidate *")}<select name="candidateId" required>${options(people.map(c => ({value: c.id, label: `${c.name} - ${jobTitle(c)}`})), event?.candidateId || candidateId || people[0].id, null, false)}</select></label><label>${I.t("Conversation title *")}<input name="title" required maxlength="150" value="${esc(event?.title || I.t('Recruiter interview'))}"></label><div class="form-grid"><label>${I.t("Date and time *")}<input name="startsAt" type="datetime-local" required value="${localValue}"></label><label>${I.t("Duration")}<select name="duration">${options([15, 30, 45, 60, 90, 120].map(n => ({value: String(n), label: I.count('minute', n)})), String(event?.duration || 30))}</select></label></div><p class="field-hint">${I.t("Enter time in this device's timezone:")} <strong>${esc(deviceZone)}</strong>${I.t(". The workspace displays appointments in {0}.", [esc(state().settings.timezone)])}</p><div class="form-grid"><label>${I.t("Format")}<select name="format">${options(['Video', 'Phone', 'On-site'], event?.format || 'Video')}</select></label><label>${I.t("Interviewer")}<select name="interviewer">${ownerOptions(event?.interviewer || 'Zafar Safarov')}</select></label></div><label>${I.t("Meeting link or location")}<input name="location" maxlength="500" value="${esc(event?.location || '')}" placeholder="${I.t("Optional meeting link or address")}"></label><label>${I.t("Notes")}<textarea name="notes" maxlength="4000" rows="3">${esc(event?.notes || '')}</textarea></label>${formActions(event ? I.t("Save appointment") : I.t("Schedule interview"))}</form>`);
  }
  function openInterview(id) {
    const i = state().interviews.find(i => i.id === id); if (!i) return;
    const c = state().candidates.find(c => c.id === i.candidateId);
    modal(esc(i.title), c ? `${esc(c.name)} &middot; ${esc(jobTitle(c))}` : I.t("Candidate interview"), `<div class="interview-detail"><div>${icon('calendar', 22)}<span><strong>${dateFormat(i.startsAt, {weekday: 'long', year: 'numeric'})}</strong><small>${I.t("{0} · {1} minutes · {2}", [timeFormat(i.startsAt), i.duration, esc(state().settings.timezone)])}</small></span>${badge(i.status)}</div><div>${icon(i.format === 'Phone' ? 'phone' : 'link', 21)}<span><strong>${esc(I.t(i.format))}</strong><small>${esc(i.location || I.t('Location not specified'))}</small></span></div><div>${icon('users', 21)}<span><strong>${esc(i.interviewer)}</strong><small>${I.t("Interviewer")}</small></span></div>${i.notes ? `<p class="pre-wrap">${esc(i.notes)}</p>` : ''}</div><div class="notice">${I.t("{0} A local appointment, not a sent invitation.", [icon('info', 16)])}</div><div class="modal-actions wrap">${button(I.t("Export .ics"), 'export-interview', 'download', 'secondary', `data-id="${esc(id)}"`)}${i.status === 'Scheduled' ? button(I.t("Reschedule"), 'edit-interview', 'calendar', 'secondary', `data-id="${esc(id)}"`) + button(I.t("Cancel event"), 'cancel-interview', 'x', 'text-button', `data-id="${esc(id)}"`) + button(I.t("Mark completed"), 'complete-interview', 'check', 'primary', `data-id="${esc(id)}"`) : button(I.t("Candidate profile"), 'candidate', 'users', 'primary', `data-id="${esc(i.candidateId)}"`)}</div>`);
  }
  const TEMPLATES = [
    {name: 'A first conversation', channel: 'Email', message: 'Hi {{first_name}},\n\nThank you for your interest in our {{job_title}} role at {{company}}. We would like to learn more about you. What is a good time to connect?\n\nBest,\n{{company}}'},
    {name: 'A short availability check', channel: 'SMS', message: 'Hi {{first_name}}, this is {{company}}. Are you available this week to discuss our {{job_title}} role?'},
    {name: 'A thoughtful follow-up', channel: 'Email', message: 'Hi {{first_name}},\n\nChecking in about the {{job_title}} opportunity at {{company}}. We would be happy to answer your questions and share the next steps.\n\nThank you,\n{{company}}'}
  ];
  function openTemplates() {
    modal(I.t("A starting point, not a script."), I.t("Choose a template, then make it your own."), `<p class="notice">${I.t('Templates are in English for U.S. recipients. Draft text is not automatically translated.')}</p><div class="template-list">${TEMPLATES.map((t, i) => `<article><span class="channel-icon">${icon(t.channel === 'SMS' ? 'message' : 'mail', 18)}</span><div><h3>${I.t(t.name)}</h3><p>${esc(t.message)}</p>${button(I.t("Use template"), 'use-template', 'arrow', 'text-button', `data-template="${i}"`)}</div></article>`).join('')}</div>`, true);
  }
  function openCampaignForm(id = '', templateIndex = null) {
    const c = state().campaigns.find(c => c.id === id);
    const template = templateIndex === null ? null : TEMPLATES[templateIndex];
    modal(c ? I.t("Edit campaign") : I.t("Build a more personal campaign."), I.t("Save a draft or prepare it for review. No messages will be sent."), `<form id="campaign-form" data-id="${esc(id)}"><label>${I.t("Campaign name *")}<input name="name" required maxlength="140" value="${esc(c?.name || template?.name || '')}" placeholder="${I.t("Warehouse hiring - Columbus")}"></label><div class="form-grid"><label>${I.t("Channel")}<select name="channel">${options(['SMS', 'Email'], c?.channel || template?.channel || 'SMS')}</select></label><label>${I.t("Audience")}<select name="audience">${options(['All', 'Favorites'], c?.audience || 'All')}</select></label></div><div class="form-grid"><label>${I.t("Job segment")}<select name="jobId">${jobOptions(c?.jobId || 'All')}</select></label><label>${I.t("Stage segment")}<select name="stage">${options(STAGES, c?.stage || 'All', 'All stages')}</select></label></div><div id="audience-preview" class="audience-preview"></div><label>${I.t("Message *")}<textarea name="message" required maxlength="6000" rows="6">${esc(c?.message || template?.message || 'Hi {{first_name}}, {{company}} has a {{job_title}} opportunity. Would you like to learn more?')}</textarea></label><p class="field-hint">${I.t("Available fields:")} <code>${I.t("{{first_name}}")}</code> <code>${I.t("{{job_title}}")}</code> <code>${I.t("{{company}}")}</code></p><p class="form-error" role="alert" hidden></p><div class="modal-actions">${button(I.t("Cancel"), 'close-overlay')}<button type="submit" name="intent" value="Draft" class="secondary">${I.t("Save draft")}</button><button type="submit" name="intent" value="Ready" class="primary">${I.t("{0}Ready for review", [icon('check', 16)])}</button></div></form>`, true);
    updateAudiencePreview();
  }
  function updateAudiencePreview() {
    const form = $('#campaign-form'); if (!form) return;
    const d = Object.fromEntries(new FormData(form));
    const people = campaignAudience(d);
    $('#audience-preview').innerHTML = `<strong>${I.t("{0}{1} candidates in this segment", [icon('users', 15), people.length])}</strong><span>${people.length ? people.slice(0, 3).map(c => esc(c.name)).join(', ') + (people.length > 3 ? I.t(' + {0} more', [people.length - 3]) : '') : I.t('Choose another segment or add candidates.')}</span><div class="message-preview"><small>${I.t("PERSONALIZED PREVIEW")}</small><p>${esc(messagePreview(d.message, people[0]))}</p></div>`;
  }
  function openCampaign(id) {
    const c = state().campaigns.find(c => c.id === id); if (!c) return;
    const people = campaignAudience(c);
    modal(esc(c.name), I.t("{0} &middot; {1} people in the current segment", [esc(I.t(c.channel)), people.length]), `<div class="job-detail-meta">${badge(c.status === 'Running' ? 'Demo running' : c.status)}<span>${I.t("Local only")}</span></div><div class="notice">${I.t("{0} No provider is connected. A simulation changes only the status; no messages are sent, no delivery or reply metrics are fabricated.", [icon('info', 17)])}</div><div class="campaign-detail"><h3>${I.t("Audience")}</h3><p>${c.jobId === 'All' ? I.t('All jobs') : esc(state().jobs.find(j => j.id === c.jobId)?.title)} &middot; ${c.stage === 'All' ? I.t('All stages') : esc(I.t(c.stage))} &middot; ${I.t(c.audience === 'Favorites' ? 'Favorites only' : 'All non-archived candidates')}</p><div class="audience-people">${people.slice(0, 8).map(p => `<button data-action="candidate" data-id="${esc(p.id)}">${avatar(p, 'small')}<span>${esc(p.name)}</span></button>`).join('') || `<p class="muted">${I.t("This segment is empty.")}</p>`}</div><h3>${I.t("Message preview{0}", [people[0] ? I.t(' for {0}', [esc(people[0].name.split(' ')[0])]) : ''])}</h3><div class="message-preview"><p>${esc(messagePreview(c.message, people[0]))}</p></div></div><div class="modal-actions wrap">${button(I.t("Edit campaign"), 'edit-campaign', 'edit', 'secondary', `data-id="${esc(id)}"`)}${c.status === 'Running' ? button(I.t("Pause simulation"), 'pause-campaign', 'pause', 'primary', `data-id="${esc(id)}"`) : button(c.status === 'Paused' ? I.t("Resume demo") : I.t("Simulate campaign"), 'simulate-campaign', 'play', 'primary', `data-id="${esc(id)}" ${people.length ? '' : 'disabled'}`)}</div>`, true);
  }
  function openMemberForm(id = '') {
    const t = state().team.find(t => t.id === id);
    modal(t ? I.t("Edit team member") : I.t("Add a demo team member"), I.t("This only updates the local directory. Roles do not enforce permissions and no invitation is sent."), `<form id="member-form" data-id="${esc(id)}"><label>${I.t("Name *")}<input name="name" required maxlength="100" value="${esc(t?.name || '')}"></label><label>${I.t("Email {0}", [t?.role === 'Owner' ? '' : '*'])}<input name="email" type="email" ${t?.role === 'Owner' ? '' : 'required'} maxlength="180" value="${esc(t?.email || '')}" placeholder="${I.t("name@example.com")}"></label><label>${I.t("Role")}<select name="role">${options(t?.role === 'Owner' ? ['Owner'] : ['Admin', 'Recruiter', 'Viewer'], t?.role || 'Recruiter')}</select></label>${formActions(t ? I.t("Save member") : I.t("Save draft invitation"))}</form>`);
  }
  function notifications() {
    modal(I.t("Your workspace, in motion."), I.t("Activity recorded by this local demo. No external notification service is connected."), `<div class="notification-list">${state().activity.map(a => `<div class="${a.read ? '' : 'unread'}"><span class="activity-dot"></span><p>${esc(I.message(a.text))}<small>${dateFormat(a.at)} &middot; ${timeFormat(a.at)}</small></p></div>`).join('') || empty(I.t("No activity yet"), I.t("Changes in the workspace will appear here."))}</div><div class="modal-actions">${button(I.t("Mark all as read"), 'read-notifications', 'check', 'primary')}</div>`);
  }

  let pendingConfirmation = null;
  function confirmDialog(title, text, label, callback, danger = false) {
    pendingConfirmation = callback;
    modal(title, text, `<div class="modal-actions">${button(I.t("Cancel"), 'close-overlay')}${button(label, 'confirm-action', danger ? 'archive' : 'check', danger ? 'danger-button' : 'primary')}</div>`);
  }
  function moveCandidate(id, stage, reopen = false) {
    const c = state().candidates.find(c => c.id === id);
    if (!c || !STAGES.includes(stage)) return;
    if (c.stage === stage) return;
    commit(d => { const person = d.candidates.find(c => c.id === id); person.stage = stage; addHistory(person, 'stage', `Moved to ${stage}`, stage); Store.log(d, `${person.name} moved to ${stage}`); }, `Moved ${c.name} to ${stage}`);
    if (reopen) openDrawer(id, ui.drawerTab);
  }
  function closeMenu() { $('.sidebar')?.classList.remove('open'); document.body.classList.remove('menu-open'); }
  function closeGlobal() { const results = $('#global-results'); if (results) results.hidden = true; $('#global-search')?.setAttribute('aria-expanded', 'false'); }
  function searchGlobal(query) {
    const q = query.trim().toLowerCase(), results = $('#global-results');
    if (!q) { closeGlobal(); return; }
    const people = state().candidates.filter(c => `${c.name} ${c.email} ${jobTitle(c)} ${c.location}`.toLowerCase().includes(q)).slice(0, 5);
    const jobs = state().jobs.filter(j => `${j.title} ${j.location}`.toLowerCase().includes(q)).slice(0, 3);
    const campaigns = state().campaigns.filter(c => `${c.name} ${c.channel}`.toLowerCase().includes(q)).slice(0, 3);
    const section = (title, items) => items ? `<h3>${title}</h3>${items}` : '';
    results.innerHTML = section(I.t("Candidates"), people.map(c => `<button data-action="candidate" data-id="${esc(c.id)}">${avatar(c, 'small')}<span><strong>${esc(c.name)}${c.archived ? I.t(' (archived)') : ''}</strong><small>${esc(jobTitle(c))}</small></span>${icon('right', 13)}</button>`).join('')) + section(I.t("Jobs"), jobs.map(j => `<button data-action="job" data-id="${esc(j.id)}">${icon('briefcase', 20)}<span><strong>${esc(j.title)}</strong><small>${esc(j.location)}</small></span>${badge(j.status)}</button>`).join('')) + section(I.t("Campaigns"), campaigns.map(c => `<button data-action="campaign" data-id="${esc(c.id)}">${icon('send', 20)}<span><strong>${esc(c.name)}</strong><small>${esc(I.t(c.channel))} &middot; ${esc(I.t(c.status))}</small></span></button>`).join('')) || `<div class="search-empty">${I.t("No matching people, jobs, or campaigns.")}</div>`;
    results.hidden = false; $('#global-search').setAttribute('aria-expanded', 'true');
  }
  function toast(message, error = false) {
    clearTimeout(toast.timer);
    $('#toast-root').innerHTML = `<div class="toast ${error ? 'error' : ''}">${icon(error ? 'info' : 'checkCircle', 19)}<span>${esc(I.message(message))}</span>${iconButton(I.t("Dismiss notification"), 'dismiss-toast', 'x')}</div>`;
    toast.timer = setTimeout(() => { $('#toast-root').innerHTML = ''; }, error ? 6500 : 3800);
  }
  function download(name, content, type) {
    const blob = new Blob([content], {type}), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
  function csvCell(value) { let text = String(value ?? ''); if (/^[\s]*[=+\-@]|^[\t\r]/.test(text)) text = "'" + text; return '"' + text.replaceAll('"', '""') + '"'; }
  function csvDownload(name, rows) { download(name, '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8'); }
  function exportCandidates(selectedOnly = false) {
    const people = selectedOnly ? state().candidates.filter(c => ui.selected.has(c.id)) : filteredCandidates();
    csvDownload('falcon-jobster-candidates.csv', [['Name', 'Job', 'Location', 'Stage', 'Source', 'Manual rating', 'Email', 'Phone', 'Recruiter', 'Archived'].map(x => I.t(x)), ...people.map(c => [c.name, jobTitle(c), c.location, I.t(c.stage), I.t(c.source), c.rating ?? '', c.email, c.phone, c.owner, I.t(c.archived ? 'Yes' : 'No')])]);
    toast(I.t("Exported {0} candidate records", [people.length]));
  }
  function exportReport() {
    const r = reportData();
    csvDownload('falcon-jobster-hiring-report.csv', [[I.t('Section'), I.t('Metric / source'), I.t('Count'), I.t('Advanced'), I.t('Hired'), I.t('Rate / note')], [I.t('Summary'), I.t('Period'), ui.reportDays || I.t('All time'), '', '', I.t('Cohort based on application date; excludes archived records')], [I.t('Summary'), I.t('Applications'), r.people.length], [I.t('Summary'), I.t('Currently hired'), r.hires.length], [I.t('Summary'), I.t('Hire rate'), percent(r.hires.length, r.people.length) + '%'], [I.t('Summary'), I.t('Median time to hire (days)'), r.median === null ? I.t('Not available') : I.number(r.median, {minimumFractionDigits: 1, maximumFractionDigits: 1})], ...r.funnel.map(f => [I.t('Stage reached or later'), I.t(f.stage), f.count, '', '', percent(f.count, r.people.length) + '%']), ...r.sources.map(s => [I.t('Source'), I.t(s.source), s.total, s.advanced, s.hired, percent(s.hired, s.total) + '%']), ...r.locations.map(l => [I.t('Location'), l.location, l.total, '', l.hired])]);
    toast(I.t("Hiring report exported"));
  }
  function exportCalendar(id = '') {
    const events = id ? state().interviews.filter(i => i.id === id) : state().interviews.filter(i => i.status !== 'Cancelled');
    if (!events.length) { toast(I.t("There are no appointments to export."), true); return; }
    const stamp = date => new Date(date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const escapeICS = value => String(value || '').replaceAll('\\', '\\\\').replaceAll(';', '\\;').replaceAll(',', '\\,').replace(/\r?\n/g, '\\n');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Falcon Jobster//Local Demo//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    events.forEach(i => { const c = state().candidates.find(c => c.id === i.candidateId); lines.push('BEGIN:VEVENT', `UID:${i.id}@falcon-jobster.local`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(i.startsAt)}`, `DTEND:${stamp(new Date(new Date(i.startsAt).getTime() + i.duration * 60000))}`, `SUMMARY:${escapeICS(i.title + ' - ' + (c?.name || 'Candidate'))}`, `DESCRIPTION:${escapeICS(I.t('Local demo appointment. No invitation was sent.') + '\n' + I.t('Interviewer:') + ' ' + i.interviewer + '\n' + (i.notes || ''))}`, `LOCATION:${escapeICS(i.location)}`, `STATUS:${i.status === 'Cancelled' ? 'CANCELLED' : 'CONFIRMED'}`, 'END:VEVENT'); });
    lines.push('END:VCALENDAR');
    const folded = lines.map(line => { let out = '', length = 0; for (const char of line) { const bytes = new TextEncoder().encode(char).length; if (length + bytes > 74) { out += '\r\n '; length = 1; } out += char; length += bytes; } return out; }).join('\r\n') + '\r\n';
    download(id ? 'falcon-jobster-interview.ics' : 'falcon-jobster-calendar.ics', folded, 'text/calendar;charset=utf-8'); toast(I.t("Calendar file exported. No invitation was sent."));
  }
  function exportBackup() { download('falcon-jobster-backup.json', JSON.stringify(Store.snapshot(), null, 2), 'application/json'); toast(I.t("Workspace backup exported")); }
  function handleAction(event) {
    const target = event.target.closest('[data-action]'); if (!target || target.disabled) return;
    event.preventDefault();
    const {action, id, view, stage, tab, status, candidateId} = target.dataset;
    switch (action) {
      case 'set-language': changeLanguage(target.dataset.language); break;
      case 'navigate': navigate(view); break;
      case 'open-menu': $('.sidebar').classList.add('open'); document.body.classList.add('menu-open'); break;
      case 'close-menu': closeMenu(); break;
      case 'close-overlay': pendingConfirmation = null; closeOverlay(); break;
      case 'dismiss-toast': $('#toast-root').innerHTML = ''; break;
      case 'add-candidate': openCandidateForm('', stage || 'New'); break;
      case 'edit-candidate': openCandidateForm(id); break;
      case 'candidate': openDrawer(id); break;
      case 'drawer-tab': openDrawer(id, tab); break;
      case 'favorite': {
        const drawerOpen = !!$('.candidate-drawer'), currentTab = ui.drawerTab;
        commit(d => { const c = d.candidates.find(c => c.id === id); if (c) c.favorite = !c.favorite; }, 'Favorites updated');
        if (drawerOpen) openDrawer(id, currentTab); break;
      }
      case 'move-candidate': moveCandidate(id, stage, true); break;
      case 'archive-candidate': {
        const c = state().candidates.find(c => c.id === id); if (!c) break;
        commit(d => { const c = d.candidates.find(c => c.id === id); c.archived = !c.archived; addHistory(c, 'archive', c.archived ? 'Candidate archived' : 'Candidate restored'); Store.log(d, `${c.name} ${c.archived ? 'archived' : 'restored'}`); }, c.archived ? 'Candidate restored' : 'Candidate archived'); closeOverlay(); break;
      }
      case 'candidate-tab': Object.assign(ui, {candidateTab: tab, page: 1, selected: new Set()}); render(); break;
      case 'new-candidates': navigate('candidates', {stage: active().some(c => c.stage === 'New') ? 'New' : 'All'}); break;
      case 'source-candidates': navigate('candidates', {source: target.dataset.source}); break;
      case 'clear-filters': Object.assign(ui, {search: '', job: 'All', stage: 'All', source: 'All', page: 1, selected: new Set()}); render(); break;
      case 'clear-selection': ui.selected.clear(); render(); break;
      case 'page': ui.page = Math.max(1, Number(target.dataset.page) || 1); render(); break;
      case 'bulk-archive': {
        const ids = [...ui.selected], restore = ui.candidateTab === 'Archived';
        confirmDialog(restore ? I.t("Restore selected candidates?") : I.t("Archive selected candidates?"), I.t("{0} records will be {1}. Notes, history, and appointments are preserved.", [ids.length, I.t(restore ? 'restored' : 'archived')]), restore ? I.t("Restore records") : I.t("Archive records"), () => {
          commit(d => { d.candidates.filter(c => ids.includes(c.id)).forEach(c => { c.archived = !restore; addHistory(c, 'archive', restore ? 'Candidate restored' : 'Candidate archived'); }); Store.log(d, `${ids.length} candidates ${restore ? 'restored' : 'archived'}`); }, `${ids.length} candidate records updated`); ui.selected.clear(); render();
        }); break;
      }
      case 'export-candidates': exportCandidates(); break;
      case 'export-selected': exportCandidates(true); break;
      case 'flow-days': ui.flowDays = Number(target.dataset.days); render(); break;
      case 'add-job': openJobForm(); break;
      case 'edit-job': openJobForm(id); break;
      case 'job': openJob(id); break;
      case 'job-status-filter': ui.jobStatus = status; render(); break;
      case 'job-candidates': navigate('candidates', {job: id}); break;
      case 'job-pipeline': navigate('pipeline', {job: id}); break;
      case 'job-stage-candidates': navigate('candidates', {job: id, stage}); break;
      case 'toggle-job': commit(d => { const j = d.jobs.find(j => j.id === id); j.status = j.status === 'Active' ? 'Paused' : 'Active'; Store.log(d, `${j.title} is now ${j.status.toLowerCase()}`); }, 'Job status updated'); openJob(id); break;
      case 'close-job': confirmDialog(I.t("Close this role?"), I.t("Candidate records remain intact. You can reactivate this role later."), I.t("Close role"), () => { commit(d => { const j = d.jobs.find(j => j.id === id); j.status = 'Closed'; Store.log(d, `${j.title} closed`); }, 'Role closed'); openJob(id); }); break;
      case 'message': openMessage(id); break;
      case 'edit-message': { const m = state().messages.find(m => m.id === id); if (m) openMessage(m.candidateId, id); break; }
      case 'add-interview': openInterviewForm(candidateId || ''); break;
      case 'edit-interview': openInterviewForm('', id); break;
      case 'interview': openInterview(id); break;
      case 'cancel-interview': confirmDialog(I.t("Cancel this appointment?"), I.t("Only the local calendar record changes. No cancellation message will be sent."), I.t("Cancel appointment"), () => { commit(d => { const i = d.interviews.find(i => i.id === id); i.status = 'Cancelled'; Store.log(d, `${i.title} cancelled`); }, 'Local appointment cancelled'); openInterview(id); }); break;
      case 'complete-interview': commit(d => { const i = d.interviews.find(i => i.id === id); i.status = 'Completed'; const c = d.candidates.find(c => c.id === i.candidateId); addHistory(c, 'interview', `${i.title} completed`); Store.log(d, `${i.title} with ${c.name} completed`); }, 'Appointment marked completed'); openInterview(id); break;
      case 'calendar-month': { const [y, m] = ui.calendarMonth.split('-').map(Number); ui.calendarMonth = new Date(Date.UTC(y, m - 1 + Number(target.dataset.step), 1)).toISOString().slice(0, 7); render(); break; }
      case 'calendar-day': ui.calendarDate = target.dataset.date; ui.calendarMonth = ui.calendarDate.slice(0, 7); render(); break;
      case 'calendar-today': ui.calendarDate = dateKey(new Date()); ui.calendarMonth = ui.calendarDate.slice(0, 7); render(); break;
      case 'calendar-upcoming': { const next = state().interviews.filter(i => i.status === 'Scheduled' && new Date(i.startsAt) > new Date()).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0]; if (next) { ui.calendarDate = dateKey(next.startsAt); ui.calendarMonth = ui.calendarDate.slice(0, 7); ui.calendarFilter = 'Scheduled'; render(); } else toast(I.t("There are no upcoming scheduled appointments.")); break; }
      case 'export-calendar': exportCalendar(); break;
      case 'export-interview': exportCalendar(id); break;
      case 'add-campaign': openCampaignForm(); break;
      case 'edit-campaign': openCampaignForm(id); break;
      case 'campaign': openCampaign(id); break;
      case 'templates': openTemplates(); break;
      case 'use-template': openCampaignForm('', Number(target.dataset.template)); break;
      case 'simulate-campaign': confirmDialog(I.t("Start a local simulation?"), I.t("This only changes the campaign status to Demo running. No messages are sent, and no delivery or reply counts will be generated."), I.t("Start simulation"), () => { commit(d => { const c = d.campaigns.find(c => c.id === id); c.status = 'Running'; c.updatedAt = new Date().toISOString(); Store.log(d, `Local simulation started: ${c.name}`); }, 'Demo simulation started. No messages sent.'); openCampaign(id); }); break;
      case 'pause-campaign': commit(d => { const c = d.campaigns.find(c => c.id === id); c.status = 'Paused'; c.updatedAt = new Date().toISOString(); Store.log(d, `Simulation paused: ${c.name}`); }, 'Simulation paused'); openCampaign(id); break;
      case 'report-period': ui.reportDays = Number(target.dataset.days); render(); break;
      case 'export-report': exportReport(); break;
      case 'settings-tab': ui.settingsTab = tab; render(); break;
      case 'remove-logo': commit(d => { d.settings.logo = ''; }, 'Workspace logo removed'); break;
      case 'add-member': openMemberForm(); break;
      case 'edit-member': openMemberForm(id); break;
      case 'export-backup': exportBackup(); break;
      case 'confirm-reset': confirmDialog(I.t("Reset this demo workspace?"), I.t("All Jobster records and preferences in this browser will be replaced with fresh sample data. Export a JSON backup first to keep your changes. Other browser storage is not affected."), I.t("Reset Jobster demo"), () => { Store.reset(); ui.selected.clear(); ui.settingsTab = 'workspace'; navigate('overview'); toast(I.t("Demo reset. Other browser data was not changed.")); }, true); break;
      case 'confirm-action': { const callback = pendingConfirmation; pendingConfirmation = null; closeOverlay(); if (callback) callback(); break; }
      case 'notifications': notifications(); break;
      case 'read-notifications': commit(d => d.activity.forEach(a => { a.read = true; }), 'Activity marked as read'); closeOverlay(); break;
      case 'integration-info': integrationInfo(target.dataset.integration); break;
      case 'help': modal(I.t("A workspace you can explore."), I.t("A functional frontend with local sample data, not a production recruiting system."), `<div class="help-content"><h3>${I.t("Try the full recruiting loop")}</h3><p>${I.t("Create a role, add a candidate, move them through the pipeline, write a draft message, and schedule a local interview. Your dashboards update from those records.")}</p><h3>${I.t("Keep your work")}</h3><p>${I.t("Changes persist in this browser when storage is available. Use Settings > Data & privacy to export or restore a JSON backup.")}</p><h3>${I.t("Know the boundaries")}</h3><p>${I.t("No real email, SMS, job posting, calendar invitations, authentication, or AI scoring is connected. Use fictional information only.")}</p><div class="keyboard-help"><span><kbd>${I.t("Ctrl / Cmd")}</kbd> + <kbd>${I.t("K")}</kbd> ${I.t("Search workspace")}</span><span><kbd>${I.t("Esc")}</kbd> ${I.t("Close a dialog")}</span><span><kbd>${I.t("Tab")}</kbd> ${I.t("Navigate controls")}</span></div></div><div class="modal-actions">${button(I.t("Open pipeline"), 'navigate', 'kanban', 'primary', 'data-view="pipeline"')}</div>`); break;
    }
  }
  function integrationInfo(type) {
    const info = {
      api: {title: 'Backend API', steps: ['Authenticated sessions and server-enforced roles.', 'Candidate and job endpoints with stable IDs and tenant isolation.', 'Input validation, audit events, backups, and a database.', 'Replace the local store behind the data boundary; never expose secret keys.']},
      sms: {title: 'SMS integration', steps: ['Connect a messaging provider on the server, not in the browser.', 'Check recipient eligibility and consent before sending.', 'Implement opt-out handling, rate limits, idempotency, and delivery callbacks.', 'Replace draft-only controls with an explicit, reviewed send workflow.']},
      email: {title: 'Email integration', steps: ['Configure an authenticated sending domain and a server-side provider.', 'Render templates safely and validate recipients on the server.', 'Handle delivery, bounce, and unsubscribe events.', 'Keep provider credentials outside the frontend.']},
      calendar: {title: 'External calendar', steps: ['Use an authenticated account connection.', 'Create and update events on the server with timezone handling.', 'Implement availability checks and synchronization.', 'Ask for an explicit action before sending real invitations.']}
    }[type];
    if (info) modal(I.t(info.title), I.t("Integration requirements. No service is connected by this dialog."), `<div class="integration-requirements">${info.steps.map((s, i) => `<div><b>${i + 1}</b><p>${I.t(s)}</p></div>`).join('')}</div><div class="modal-actions">${button(I.t("Understood"), 'close-overlay', 'check', 'primary')}</div>`);
  }

  document.addEventListener('submit', event => {
    const form = event.target;
    const supported = ['candidate-form', 'job-form', 'notes-form', 'message-form', 'interview-form', 'campaign-form', 'member-form', 'settings-form'];
    if (!supported.includes(form.id)) return;
    event.preventDefault();
    if (!validateForm(form)) return;
    const d = Object.fromEntries(new FormData(form));
    Object.keys(d).forEach(k => { if (typeof d[k] === 'string') d[k] = d[k].trim(); });
    const id = form.dataset.id || '', now = new Date().toISOString();
    const fail = text => showFormError(form, I.t(text));
    if (form.id === 'candidate-form') {
      if (!d.name || !d.location || !d.email) return fail('Name, email, and location cannot be blank.');
      if (state().candidates.some(c => c.id !== id && c.email.toLowerCase() === d.email.toLowerCase())) return fail('A candidate with this email already exists, including archived records.');
      const rating = d.rating === '' ? null : Number(d.rating);
      if (rating !== null && (!Number.isInteger(rating) || rating < 0 || rating > 100)) return fail('Enter a whole-number rating from 0 to 100, or leave it blank.');
      const candidateId = id || Store.id();
      const payload = {name: d.name, email: d.email, phone: d.phone, location: d.location, jobId: d.jobId, source: d.source, stage: d.stage, owner: d.owner, rating, experience: d.experience, tags: [...new Set(d.tags.split(',').map(t => t.trim()).filter(Boolean))].slice(0, 12), notes: d.notes};
      if (commit(s => { let c = s.candidates.find(c => c.id === id); if (c) { const oldStage = c.stage; Object.assign(c, payload); addHistory(c, 'edited', 'Candidate details updated'); if (oldStage !== c.stage) addHistory(c, 'stage', `Moved to ${c.stage}`, c.stage); } else { c = {id: candidateId, ...payload, favorite: false, archived: false, color: '#deebe6', createdAt: now, updatedAt: now, history: []}; addHistory(c, 'created', 'Candidate added to workspace', 'New'); if (c.stage !== 'New') addHistory(c, 'stage', `Added at ${c.stage}`, c.stage); s.candidates.unshift(c); } Store.log(s, `${c.name} ${id ? 'updated' : 'added to the workspace'}`); }, id ? 'Candidate updated' : 'Candidate added')) { closeOverlay(); openDrawer(candidateId); }
    } else if (form.id === 'job-form') {
      if (!d.title || !d.department || !d.location) return fail('Title, department, and location cannot be blank.');
      const openings = Number(d.openings); if (!Number.isInteger(openings) || openings < 1 || openings > 10000) return fail('Hiring target must be a whole number between 1 and 10,000.');
      const jobId = id || Store.id(), payload = {title: d.title, department: d.department, location: d.location, openings, pay: d.pay, owner: d.owner, status: d.status, description: d.description};
      if (commit(s => { const j = s.jobs.find(j => j.id === id); if (j) Object.assign(j, payload); else s.jobs.unshift({id: jobId, ...payload, createdAt: now}); Store.log(s, `${d.title} ${id ? 'updated' : 'created'}`); }, 'Job saved locally. Not published.')) { closeOverlay(); navigate('jobs'); openJob(jobId); }
    } else if (form.id === 'notes-form') {
      commit(s => { const c = s.candidates.find(c => c.id === id); c.notes = d.notes; addHistory(c, 'note', 'Recruiter notes updated'); Store.log(s, `Notes updated for ${c.name}`); }, 'Recruiter notes saved');
    } else if (form.id === 'message-form') {
      if (!d.body) return fail('Write a message before saving a draft.');
      const candidateId = form.dataset.candidateId;
      if (commit(s => { const m = s.messages.find(m => m.id === id); const payload = {candidateId, channel: d.channel, subject: d.subject, body: d.body, status: 'Draft', createdAt: now}; if (m) Object.assign(m, payload); else s.messages.unshift({id: Store.id(), ...payload}); const c = s.candidates.find(c => c.id === candidateId); addHistory(c, 'message', `${d.channel} draft saved. Not sent.`); Store.log(s, `${d.channel} draft saved for ${c.name}`); }, 'Message draft saved. Nothing was sent.')) { closeOverlay(); openDrawer(candidateId, 'messages'); }
    } else if (form.id === 'interview-form') {
      const starts = new Date(d.startsAt), duration = Number(d.duration);
      if (!d.title || Number.isNaN(starts.getTime())) return fail('Enter a title and valid date and time.');
      if (starts.getTime() <= Date.now()) return fail('Choose a future date and time for this appointment.');
      if (starts.getFullYear() !== Number(d.startsAt.slice(0, 4)) || starts.getHours() !== Number(d.startsAt.slice(11, 13))) return fail('This local time is not valid. Choose another time.');
      if (state().interviews.some(i => i.id !== id && i.status === 'Scheduled' && i.interviewer === d.interviewer && starts.getTime() < new Date(i.startsAt).getTime() + i.duration * 60000 && starts.getTime() + duration * 60000 > new Date(i.startsAt).getTime())) return fail('This interviewer already has an overlapping local appointment. Choose another time or interviewer.');
      const eventId = id || Store.id();
      if (commit(s => { const i = s.interviews.find(i => i.id === id), payload = {candidateId: d.candidateId, title: d.title, startsAt: starts.toISOString(), duration, format: d.format, location: d.location, interviewer: d.interviewer, status: 'Scheduled', notes: d.notes}; if (i) Object.assign(i, payload); else s.interviews.push({id: eventId, ...payload, createdAt: now}); const c = s.candidates.find(c => c.id === d.candidateId); addHistory(c, 'interview', `${d.title} ${id ? 'rescheduled' : 'scheduled'} (local only)`); Store.log(s, `${d.title} with ${c.name} ${id ? 'rescheduled' : 'scheduled'}`); }, 'Appointment saved. No invitation sent.')) { closeOverlay(); ui.calendarDate = dateKey(starts); ui.calendarMonth = ui.calendarDate.slice(0, 7); navigate('calendar'); openInterview(eventId); }
    } else if (form.id === 'campaign-form') {
      if (!d.name || !d.message) return fail('Campaign name and message cannot be blank.');
      if (/{{(?!first_name}}|job_title}}|company}})[^}]+}}/.test(d.message)) return fail('Use only {{first_name}}, {{job_title}}, or {{company}} placeholders.');
      const campaignId = id || Store.id(), requestedStatus = event.submitter?.value === 'Ready' ? 'Ready' : 'Draft';
      if (requestedStatus === 'Ready' && !campaignAudience(d).length) return fail('This segment is empty. Change the segment or save as a draft.');
      if (commit(s => { const c = s.campaigns.find(c => c.id === id), payload = {name: d.name, channel: d.channel, audience: d.audience, jobId: d.jobId, stage: d.stage, message: d.message, status: requestedStatus, updatedAt: now}; if (c) Object.assign(c, payload); else s.campaigns.unshift({id: campaignId, ...payload, createdAt: now}); Store.log(s, `Campaign ${d.name} saved as ${requestedStatus.toLowerCase()}`); }, `Campaign ${requestedStatus === 'Ready' ? 'ready for review' : 'draft saved'}`)) { closeOverlay(); navigate('campaigns'); openCampaign(campaignId); }
    } else if (form.id === 'member-form') {
      if (!d.name) return fail('Enter a team member name.');
      if (d.email && state().team.some(t => t.id !== id && t.email.toLowerCase() === d.email.toLowerCase())) return fail('This email is already in the local directory.');
      if (state().team.some(t => t.id !== id && t.name.toLowerCase() === d.name.toLowerCase())) return fail('Use a distinct team member name to keep assignments clear.');
      if (commit(s => { const t = s.team.find(t => t.id === id); if (t) { const old = t.name; Object.assign(t, {name: d.name, email: d.email, role: d.role}); s.candidates.forEach(c => { if (c.owner === old) c.owner = d.name; }); s.jobs.forEach(j => { if (j.owner === old) j.owner = d.name; }); s.interviews.forEach(i => { if (i.interviewer === old) i.interviewer = d.name; }); } else s.team.push({id: Store.id(), name: d.name, email: d.email, role: d.role, status: 'Draft invite'}); Store.log(s, `Local team directory updated: ${d.name}`); }, id ? 'Team member updated' : 'Draft invitation saved. No email sent.')) closeOverlay();
    } else if (form.id === 'settings-form') {
      if (!d.company) return fail('Company name cannot be blank.');
      if (d.website && !/^https?:\/\//i.test(d.website)) return fail('Website must start with https:// or http://.');
      commit(s => { Object.assign(s.settings, {company: d.company, website: d.website, timezone: d.timezone, digest: 'digest' in d, interview: 'interview' in d, offers: 'offers' in d}); Store.log(s, 'Workspace preferences updated'); }, 'Workspace preferences saved');
    }
  });
  document.addEventListener('input', event => {
    const target = event.target;
    if (target.id === 'local-search') { ui.search = target.value; ui.page = 1; ui.selected.clear(); render(); }
    if (target.id === 'global-search') searchGlobal(target.value);
    if (target.closest('#campaign-form')) updateAudiencePreview();
  });
  document.addEventListener('change', event => {
    const target = event.target;
    if (target.matches('[data-language-control]')) { changeLanguage(target.value); return; }
    if (target.dataset.filter) { ui[target.dataset.filter] = target.value; ui.page = 1; ui.selected.clear(); render(); }
    if (target.dataset.selectId) { target.checked ? ui.selected.add(target.dataset.selectId) : ui.selected.delete(target.dataset.selectId); render(); }
    if (target.id === 'select-all') { filteredCandidates().slice((ui.page - 1) * ui.pageSize, ui.page * ui.pageSize).forEach(c => target.checked ? ui.selected.add(c.id) : ui.selected.delete(c.id)); render(); }
    if (target.id === 'bulk-stage' && STAGES.includes(target.value)) { const stage = target.value, ids = [...ui.selected]; commit(s => { s.candidates.filter(c => ids.includes(c.id) && c.stage !== stage).forEach(c => { c.stage = stage; addHistory(c, 'stage', `Moved to ${stage}`, stage); }); Store.log(s, `${ids.length} candidates moved to ${stage}`); }, `${ids.length} candidates moved to ${stage}`); ui.selected.clear(); render(); }
    if (target.id === 'logo-file') importLogo(target.files[0]);
    if (target.id === 'backup-file') importBackup(target.files[0]);
    if (target.closest('#campaign-form')) updateAudiencePreview();
  });
  function importLogo(file) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 512 * 1024) { toast(I.t("Use a PNG, JPG, or WebP image smaller than 512 KB."), true); return; }
    const reader = new FileReader(); reader.onerror = () => toast(I.t("The image could not be read."), true); reader.onload = () => { const img = new Image(); img.onload = () => commit(s => { s.settings.logo = reader.result; }, 'Workspace logo saved locally'); img.onerror = () => toast(I.t("The file is not a readable image."), true); img.src = reader.result; }; reader.readAsDataURL(file);
  }
  async function importBackup(file) {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { toast(I.t("Backup is too large. Maximum size is 4 MB."), true); return; }
    try { const data = JSON.parse(await file.text()); if (!Store.validate(data)) throw new Error('This is not a valid Falcon Jobster backup.'); confirmDialog(I.t("Replace this workspace?"), I.t("The backup contains {0} candidates, {1} jobs, and {2} appointments. Current demo data will be replaced.", [data.candidates.length, data.jobs.length, data.interviews.length]), I.t("Restore backup"), () => { const saved = Store.restore(data); ui.selected.clear(); navigate('overview'); toast(Store.remote ? (I.language === "ru" ? "\u0417\u0430\u043f\u0443\u0449\u0435\u043d\u043e \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435 \u043d\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435..." : "Syncing restored backup...") : (saved ? I.t("Workspace backup restored") : I.t("Backup loaded for this session only.")), !saved); }); }
    catch (error) { toast(error.message || I.t("The backup could not be read."), true); }
  }
  document.addEventListener('click', event => {
    if (event.target.matches('[data-backdrop]')) { pendingConfirmation = null; closeOverlay(); return; }
    if (!event.target.closest('.global-search-wrap')) closeGlobal();
    handleAction(event);
  });
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); closeOverlay(); $('#global-search').focus(); searchGlobal($('#global-search').value); }
    if (event.key === 'Escape') { closeOverlay(); closeGlobal(); closeMenu(); pendingConfirmation = null; }
    if (event.target.id === 'global-search' && ['Enter', 'ArrowDown'].includes(event.key) && !$('#global-results').hidden) { event.preventDefault(); const first = $('#global-results button'); if (event.key === 'Enter') first?.click(); else first?.focus(); }
    if (event.target.matches('.candidate-card') && ['Enter', ' '].includes(event.key)) { event.preventDefault(); event.target.click(); }
    prepareForms();
    const dialog = $('[role="dialog"]');
    if (dialog && event.key === 'Tab') { const controls = $$('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]', dialog).filter(el => el.getClientRects().length); const first = controls[0], last = controls.at(-1); if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
  });
  document.addEventListener('dragstart', event => { const card = event.target.closest('[data-drag-id]'); if (!card) return; dragId = card.dataset.dragId; event.dataTransfer.setData('text/plain', dragId); event.dataTransfer.effectAllowed = 'move'; card.classList.add('dragging'); });
  document.addEventListener('dragover', event => { const col = event.target.closest('[data-drop-stage]'); if (!col || !dragId) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; col.classList.add('drag-over'); });
  document.addEventListener('dragleave', event => { const col = event.target.closest('[data-drop-stage]'); if (col && !col.contains(event.relatedTarget)) col.classList.remove('drag-over'); });
  document.addEventListener('drop', event => { const col = event.target.closest('[data-drop-stage]'); if (!col || !dragId) return; event.preventDefault(); col.classList.remove('drag-over'); moveCandidate(dragId, col.dataset.dropStage); dragId = null; });
  document.addEventListener('dragend', () => { dragId = null; $$('.drag-over,.dragging').forEach(el => el.classList.remove('drag-over', 'dragging')); });
  document.addEventListener('falcon:remote-sync', event => {
    if (!Store.remote) return;
    updateChrome();
    if (event.detail.status === 'saved') toast(I.language === 'ru' ? '\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u043e \u043d\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435' : 'Saved on server');
    else toast(event.detail.error || 'Server save failed', true);
  });
  window.addEventListener('popstate', route);
  window.addEventListener('hashchange', route);
  window.addEventListener('storage', event => { if (event.key === I.KEY) { changeLanguage(event.newValue || 'en', false); }
    if (event.key === Store.KEY) { Store.reload(); render(); toast(I.t("Workspace updated from another browser tab.")); } });
  shell(); route();
})();
