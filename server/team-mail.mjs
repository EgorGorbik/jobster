/**
 * Team (recruiter) notification emails driven by workspace settings:
 * - digest: daily hiring summary (~08:00 local)
 * - interview: reminders 24h and 1h before Scheduled interviews
 * - offers: email when a candidate moves to Offer
 */
import {getWorkspace, mutateWorkspace} from './database.mjs';
import {mailConfigured, sendMail} from './mail.mjs';

const LOOP_MS = 15 * 60 * 1000;
const H24 = 24 * 60 * 60 * 1000;
const H1 = 60 * 60 * 1000;
let loopTimer = null;

const emailOk = v => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && !/[<>]/.test(v);

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

function wrapHtml({title, preheader, bodyHtml, company}) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#eef2ea;font-family:Georgia,'Times New Roman',serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef2ea;padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #d5e0d1;box-shadow:0 12px 40px rgba(28,49,41,.08)">
        <tr><td style="background:linear-gradient(135deg,#1c3129 0%,#2f4a3c 100%);padding:28px 32px;color:#edf0cd">
          <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:.8;font-family:ui-sans-serif,system-ui,sans-serif">Falcon Jobster</div>
          <div style="font-size:24px;line-height:1.25;margin-top:8px;font-weight:700">${esc(title)}</div>
          <div style="font-size:14px;margin-top:6px;opacity:.85;font-family:ui-sans-serif,system-ui,sans-serif">${esc(company || '')}</div>
        </td></tr>
        <tr><td style="padding:28px 32px;color:#1c3129;font-size:15px;line-height:1.55">${bodyHtml}</td></tr>
        <tr><td style="padding:0 32px 28px;color:#6d7f6a;font-size:12px;font-family:ui-sans-serif,system-ui,sans-serif;line-height:1.5">
          Уведомление для команды найма. Отключить можно в Настройки → уведомления.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function buildMetricRowHtml(items) {
  const cells = items.map(it => (
    '<td style="width:33%;padding:12px;background:#f4f7f1;border-radius:12px;text-align:center;vertical-align:top">' +
      `<div style="font-size:22px;font-weight:700;color:#1c3129;font-family:ui-sans-serif,system-ui,sans-serif">${esc(it.value)}</div>` +
      `<div style="font-size:11px;letter-spacing:.6px;text-transform:uppercase;color:#5f7368;margin-top:4px;font-family:ui-sans-serif,system-ui,sans-serif">${esc(it.label)}</div>` +
    '</td>'
  )).join('<td style="width:8px"></td>');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0 8px"><tr>${cells}</tr></table>`;
}

export function collectTeamEmails(db, workspaceId, state) {
  const out = new Set();
  for (const t of state?.team || []) {
    const e = String(t.email || '').trim().toLowerCase();
    if (emailOk(e)) out.add(e);
  }
  try {
    const rows = db.prepare('SELECT email FROM users WHERE workspace_id=? AND disabled=0').all(workspaceId);
    for (const row of rows) {
      const e = String(row.email || '').trim().toLowerCase();
      if (emailOk(e)) out.add(e);
    }
  } catch { /* users table always exists in this app */ }
  return [...out];
}

async function sendToTeam(emails, {subject, text, html}) {
  const results = [];
  for (const to of emails) {
    if (/\@(example\.(com|org|net)|test|localhost)$/i.test(to)) {
      console.log(`[team-mail] skip reserved/test address ${to}`);
      results.push({delivered: false, skipped: true, reason: 'test-domain'});
      continue;
    }
    results.push(await sendMail({to, subject, text, html}));
  }
  return results;
}

function activeCandidates(state) {
  return (state.candidates || []).filter(c => !c.archived);
}

export function buildDigestPayload(state) {
  const people = activeCandidates(state);
  const byStage = Object.fromEntries(['New', 'Screening', 'Interview', 'Offer', 'Hired'].map(s => [s, people.filter(c => c.stage === s).length]));
  const openJobs = (state.jobs || []).filter(j => j.status === 'Active');
  const upcoming = (state.interviews || [])
    .filter(i => i.status === 'Scheduled' && Date.parse(i.startsAt) >= Date.now())
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .slice(0, 5);
  const company = state.settings?.company || 'Falcon Jobster';
  const rows = upcoming.map(i => {
    const c = people.find(x => x.id === i.candidateId);
    const when = new Date(i.startsAt).toLocaleString('ru-RU', {dateStyle: 'short', timeStyle: 'short'});
    return `${when} — ${c?.name || 'кандидат'} · ${i.title} (${i.format})`;
  });
  const subject = `${company}: ежедневная сводка по найму`;
  const text = [
    `Доброе утро — сводка ${company}`,
    ``,
    `Активные вакансии: ${openJobs.length}`,
    `Кандидаты (не в архиве): ${people.length}`,
    `New ${byStage.New} · Screening ${byStage.Screening} · Interview ${byStage.Interview} · Offer ${byStage.Offer} · Hired ${byStage.Hired}`,
    ``,
    `Ближайшие собеседования:`,
    ...(rows.length ? rows.map(r => `• ${r}`) : ['• нет запланированных']),
    ``,
    `Хорошего дня — Falcon Jobster`
  ].join('\n');

  const metricsHtml = buildMetricRowHtml([
    {value: openJobs.length, label: 'Вакансии'},
    {value: people.length, label: 'Кандидаты'},
    {value: byStage.Interview + byStage.Offer, label: 'В работе'}
  ]);
  const upcomingHtml = rows.length
    ? `<ul style="margin:0;padding-left:18px;font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px;color:#314538">${rows.map(r => `<li style="margin:6px 0">${esc(r)}</li>`).join('')}</ul>`
    : '<p style="margin:0;color:#6d7f6a;font-family:ui-sans-serif,system-ui,sans-serif">Пока пусто — отличный момент спланировать неделю.</p>';

  const bodyHtml = [
    '<p style="margin:0 0 12px">Доброе утро. Краткий срез воркспейса на сегодня.</p>',
    metricsHtml,
    '<p style="margin:20px 0 8px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#5f7368;font-family:ui-sans-serif,system-ui,sans-serif">Воронка</p>',
    `<p style="margin:0;font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px;color:#314538">New <strong>${byStage.New}</strong> · Screening <strong>${byStage.Screening}</strong> · Interview <strong>${byStage.Interview}</strong> · Offer <strong>${byStage.Offer}</strong> · Hired <strong>${byStage.Hired}</strong></p>`,
    '<p style="margin:22px 0 8px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#5f7368;font-family:ui-sans-serif,system-ui,sans-serif">Ближайшие собеседования</p>',
    upcomingHtml
  ].join('');

  const html = wrapHtml({
    title: 'Ежедневная сводка',
    preheader: `${people.length} кандидатов · ${openJobs.length} активных ролей`,
    bodyHtml,
    company
  });
  return {subject, text, html};
}

/** Force-send digest now (ignores morning window / digestLastSent). */
export async function sendDigestPreview(db, {to} = {}) {
  if (!mailConfigured()) return {delivered: false, skipped: true, reason: 'mail-off'};
  const ws = db.prepare('SELECT id FROM workspaces').get();
  if (!ws) return {delivered: false, skipped: true, reason: 'no-workspace'};
  const snap = getWorkspace(db, ws.id);
  const payload = buildDigestPayload(snap.state);
  const emails = to
    ? [String(to).trim().toLowerCase()].filter(emailOk)
    : collectTeamEmails(db, ws.id, snap.state);
  if (!emails.length) return {delivered: false, skipped: true, reason: 'no-recipients'};
  const results = await sendToTeam(emails, payload);
  return {
    delivered: results.some(r => r.delivered),
    results,
    to: emails,
    subject: payload.subject
  };
}

function buildOfferPayload({candidate, jobTitle, company, fromStage}) {
  const subject = `${company}: Offer — ${candidate.name}`;
  const role = jobTitle || 'вакансию';
  const text = [
    `Команда ${company},`,
    ``,
    `${candidate.name} переведён(а) на этап Offer.`,
    `Роль: ${role}`,
    `Было: ${fromStage || '—'} → Offer`,
    candidate.email ? `Email: ${candidate.email}` : null,
    candidate.phone ? `Телефон: ${candidate.phone}` : null,
    ``,
    `Проверьте условия и свяжитесь с кандидатом.`
  ].filter(Boolean).join('\n');
  const bodyHtml = `
    <p style="margin:0 0 14px">Кандидат перешёл на этап <strong>Offer</strong>.</p>
    <div style="padding:16px 18px;background:#f4f7f1;border-radius:12px;font-family:ui-sans-serif,system-ui,sans-serif">
      <div style="font-size:18px;font-weight:700;color:#1c3129">${esc(candidate.name)}</div>
      <div style="margin-top:6px;color:#5f7368;font-size:14px">${esc(role)}</div>
      <div style="margin-top:12px;font-size:13px;color:#314538">${esc(fromStage || '—')} → <strong>Offer</strong></div>
      ${candidate.email ? `<div style="margin-top:8px;font-size:13px"><a href="mailto:${esc(candidate.email)}" style="color:#2f4a3c">${esc(candidate.email)}</a></div>` : ''}
    </div>
    <p style="margin:18px 0 0;color:#5f7368;font-size:14px;font-family:ui-sans-serif,system-ui,sans-serif">Время согласовать оффер и следующий контакт.</p>
  `;
  return {subject, text, html: wrapHtml({title: 'Новый Offer', preheader: `${candidate.name} → Offer`, bodyHtml, company})};
}

function buildInterviewReminderPayload({candidate, jobTitle, interview, company, kind}) {
  const when = new Date(interview.startsAt);
  const whenLabel = Number.isNaN(when.getTime())
    ? interview.startsAt
    : when.toLocaleString('ru-RU', {dateStyle: 'full', timeStyle: 'short'});
  const headline = kind === '1h' ? 'Через час — собеседование' : 'Завтра / в течение суток — собеседование';
  const subject = `${company}: ${kind === '1h' ? 'через 1 час' : 'за 24 часа'} — ${candidate.name}`;
  const role = jobTitle || interview.title || 'роль';
  const text = [
    headline,
    ``,
    `Кандидат: ${candidate.name}`,
    `Роль: ${role}`,
    `Тема: ${interview.title}`,
    `Когда: ${whenLabel}`,
    `Формат: ${interview.format}`,
    interview.location ? `Место / ссылка: ${interview.location}` : null,
    interview.interviewer ? `Интервьюер: ${interview.interviewer}` : null,
    `Длительность: ${interview.duration} мин.`
  ].filter(Boolean).join('\n');
  const bodyHtml = `
    <p style="margin:0 0 14px">${esc(headline)}.</p>
    <div style="padding:16px 18px;background:#f4f7f1;border-radius:12px;font-family:ui-sans-serif,system-ui,sans-serif">
      <div style="font-size:18px;font-weight:700">${esc(candidate.name)}</div>
      <div style="margin-top:6px;color:#5f7368">${esc(role)} · ${esc(interview.title)}</div>
      <div style="margin-top:14px;font-size:15px;color:#1c3129"><strong>${esc(whenLabel)}</strong></div>
      <div style="margin-top:8px;font-size:13px;color:#314538">${esc(interview.format)}${interview.location ? ` · ${esc(interview.location)}` : ''} · ${esc(String(interview.duration))} мин.</div>
      ${interview.interviewer ? `<div style="margin-top:8px;font-size:13px;color:#5f7368">Интервьюер: ${esc(interview.interviewer)}</div>` : ''}
    </div>
  `;
  return {subject, text, html: wrapHtml({title: kind === '1h' ? 'Напоминание · 1 час' : 'Напоминание · 24 часа', preheader: `${candidate.name} · ${whenLabel}`, bodyHtml, company})};
}

export function msUntilInterview(startsAt, now = Date.now()) {
  const t = Date.parse(startsAt);
  if (!Number.isFinite(t)) return NaN;
  return t - now;
}

export function shouldSend24hReminder(startsAt, now = Date.now()) {
  const left = msUntilInterview(startsAt, now);
  return Number.isFinite(left) && left > H1 && left <= H24;
}

export function shouldSend1hReminder(startsAt, now = Date.now()) {
  const left = msUntilInterview(startsAt, now);
  return Number.isFinite(left) && left > 0 && left <= H1;
}

export function localDateKey(timezone = 'UTC', now = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'}).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function localHour(timezone = 'UTC', now = new Date()) {
  try {
    return Number(new Intl.DateTimeFormat('en-US', {timeZone: timezone, hour: 'numeric', hour12: false}).format(now));
  } catch {
    return now.getUTCHours();
  }
}

export async function notifyTeamOfferChange(prevState, nextState, {db, workspaceId} = {}) {
  if (!nextState?.settings?.offers) return {sent: 0, skipped: true, reason: 'offers-off'};
  if (!mailConfigured()) return {sent: 0, skipped: true, reason: 'mail-off'};
  const prevMap = new Map((prevState?.candidates || []).map(c => [c.id, c]));
  const jobs = new Map((nextState.jobs || []).map(j => [j.id, j.title]));
  const company = nextState.settings.company || 'Falcon Jobster';
  const emails = workspaceId && db
    ? collectTeamEmails(db, workspaceId, nextState)
    : [...new Set((nextState.team || []).map(t => String(t.email || '').toLowerCase()).filter(emailOk))];
  if (!emails.length) return {sent: 0, skipped: true, reason: 'no-recipients'};
  let sent = 0;
  for (const c of nextState.candidates || []) {
    if (c.archived) continue;
    const prev = prevMap.get(c.id);
    if (!prev || prev.stage === c.stage) continue;
    if (c.stage !== 'Offer') continue;
    const payload = buildOfferPayload({
      candidate: c,
      jobTitle: jobs.get(c.jobId) || '',
      company,
      fromStage: prev.stage
    });
    const results = await sendToTeam(emails, payload);
    sent += results.filter(r => r.delivered).length;
  }
  return {sent};
}

export async function runTeamInterviewReminders(db) {
  if (!mailConfigured()) return {sent: 0, skipped: true};
  let sent = 0;
  const workspaces = db.prepare('SELECT id FROM workspaces').all();
  for (const ws of workspaces) {
    const snap = getWorkspace(db, ws.id);
    if (!snap.state.settings?.interview) continue;
    const emails = collectTeamEmails(db, ws.id, snap.state);
    if (!emails.length) continue;
    const company = snap.state.settings.company || 'Falcon Jobster';
    for (const interview of snap.state.interviews || []) {
      if (interview.status !== 'Scheduled') continue;
      const candidate = snap.state.candidates.find(c => c.id === interview.candidateId);
      if (!candidate || candidate.archived) continue;
      const job = snap.state.jobs.find(j => j.id === candidate.jobId);
      const kinds = [];
      if (!interview.emailReminder24hSentAt && shouldSend24hReminder(interview.startsAt)) kinds.push('24h');
      if (!interview.emailReminder1hSentAt && shouldSend1hReminder(interview.startsAt)) kinds.push('1h');
      for (const kind of kinds) {
        try {
          const payload = buildInterviewReminderPayload({
            candidate,
            jobTitle: job?.title || null,
            interview,
            company,
            kind
          });
          const results = await sendToTeam(emails, payload);
          if (results.some(r => r.delivered)) {
            mutateWorkspace(db, ws.id, undefined, null, `interview.email_reminder_${kind}`, state => {
              const iv = state.interviews.find(i => i.id === interview.id);
              if (!iv) return {id: interview.id};
              if (kind === '24h') iv.emailReminder24hSentAt = new Date().toISOString();
              if (kind === '1h') iv.emailReminder1hSentAt = new Date().toISOString();
              return {id: interview.id};
            });
            sent += 1;
          }
        } catch (err) {
          console.error('[team-mail] interview reminder failed:', err.message || err);
        }
      }
    }
  }
  return {sent};
}

export async function runDailyTeamDigests(db, now = new Date()) {
  if (!mailConfigured()) return {sent: 0, skipped: true};
  let sent = 0;
  const workspaces = db.prepare('SELECT id FROM workspaces').all();
  for (const ws of workspaces) {
    const snap = getWorkspace(db, ws.id);
    const settings = snap.state.settings || {};
    if (!settings.digest) continue;
    const tz = settings.timezone || 'UTC';
    const hour = localHour(tz, now);
    if (hour < 8 || hour >= 10) continue;
    const today = localDateKey(tz, now);
    if (settings.digestLastSent === today) continue;
    const emails = collectTeamEmails(db, ws.id, snap.state);
    if (!emails.length) continue;
    try {
      const payload = buildDigestPayload(snap.state);
      const results = await sendToTeam(emails, payload);
      if (results.some(r => r.delivered)) {
        mutateWorkspace(db, ws.id, undefined, null, 'settings.digest_sent', state => {
          state.settings.digestLastSent = today;
          return {digestLastSent: today};
        });
        sent += results.filter(r => r.delivered).length;
      }
    } catch (err) {
      console.error('[team-mail] digest failed:', err.message || err);
    }
  }
  return {sent};
}

export async function runTeamMailTick(db) {
  const digests = await runDailyTeamDigests(db);
  const reminders = await runTeamInterviewReminders(db);
  return {digests, reminders};
}

export function startTeamMailServices(db) {
  if (loopTimer) return;
  if (process.env.JOBSTER_TEAM_MAIL === 'false') return;
  const tick = () => {
    runTeamMailTick(db).catch(err => console.error('[team-mail] loop:', err.message || err));
  };
  tick();
  loopTimer = setInterval(tick, LOOP_MS);
  if (typeof loopTimer.unref === 'function') loopTimer.unref();
  console.log('[team-mail] digest / interview reminder loop started (15m)');
}

export function stopTeamMailServices() {
  if (loopTimer) {
    clearInterval(loopTimer);
    loopTimer = null;
  }
}
