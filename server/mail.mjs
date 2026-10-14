/**
 * Outbound email via SMTP (Gmail / Brevo / etc).
 * No-op when SMTP_* is not configured — mutations still succeed.
 */
import nodemailer from 'nodemailer';

let cached = null;

export function mailConfigured() {
  return !!(process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim());
}

function smtpPass() {
  // Gmail app passwords are often pasted with spaces.
  return String(process.env.SMTP_PASS || '').replace(/\s+/g, '');
}

function transport() {
  if (!mailConfigured()) return null;
  if (cached) return cached;
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = process.env.SMTP_SECURE != null
    ? process.env.SMTP_SECURE !== 'false'
    : port === 465;
  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST.trim(),
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER.trim(),
      pass: smtpPass()
    }
  });
  return cached;
}

function fromAddress() {
  const user = process.env.SMTP_USER.trim();
  const raw = process.env.JOBSTER_MAIL_FROM?.trim();
  // Gmail rejects / quietly drops mismatched From — prefer SMTP_USER when From domain differs.
  if (!raw) return user;
  const match = raw.match(/<([^>]+)>/) || [null, raw];
  const addr = (match[1] || raw).trim().toLowerCase();
  if (addr !== user.toLowerCase() && !addr.endsWith('@' + user.split('@')[1]?.toLowerCase())) {
    return `Falcon Jobster <${user}>`;
  }
  if (raw.includes('<')) return raw;
  return `Falcon Jobster <${raw}>`;
}

export async function sendMail({to, subject, text, html}) {
  const tx = transport();
  if (!tx) {
    console.log(`[mail] SMTP not configured — skip to=${to} subject=${subject}\n${text}`);
    return {delivered: false, skipped: true};
  }
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return {delivered: false, skipped: true, reason: 'invalid-to'};
  }
  const info = await tx.sendMail({
    from: fromAddress(),
    to,
    subject,
    text,
    html: html || undefined
  });
  return {delivered: true, messageId: info.messageId || null};
}

export async function sendApplyVerification({email, code, link, jobTitle, company}) {
  const subject = `${company}: код подтверждения / verification — ${jobTitle}`;
  const text = [
    `Здравствуйте!`,
    ``,
    `Код подтверждения для отклика на «${jobTitle}»: ${code}`,
    `Или откройте ссылку: ${link}`,
    ``,
    `Код действует около 30 минут.`,
    ``,
    `Если вы не оставляли отклик — просто проигнорируйте это письмо.`,
    ``,
    `---`,
    `Hello!`,
    `Verification code for «${jobTitle}»: ${code}`,
    `Or open: ${link}`,
    `Company: ${company}`,
    `If you did not apply, ignore this email.`
  ].join('\n');
  const html = `
    <div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;color:#1c3129">
      <p style="font-size:15px;line-height:1.5">Здравствуйте!</p>
      <p style="font-size:15px;line-height:1.5">Код подтверждения для отклика на <strong>${escapeHtml(jobTitle)}</strong>:</p>
      <p style="font-size:32px;letter-spacing:6px;font-weight:700;font-family:ui-monospace,Menlo,monospace;background:#eaf1e9;padding:16px 20px;border-radius:10px;text-align:center">${escapeHtml(code)}</p>
      <p style="font-size:14px;line-height:1.5"><a href="${escapeAttr(link)}">Открыть ссылку подтверждения</a></p>
      <p style="font-size:13px;color:#5f7368">Код действует около 30 минут. Компания: ${escapeHtml(company)}</p>
      <hr style="border:none;border-top:1px solid #d5e0d6;margin:24px 0">
      <p style="font-size:14px;line-height:1.5">Hello! Your verification code for <strong>${escapeHtml(jobTitle)}</strong> is <strong>${escapeHtml(code)}</strong>.</p>
    </div>`;
  return sendMail({to: email, subject, text, html});
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '');
}

export async function sendInterviewInvite({candidate, jobTitle, interview, company}) {
  const name = candidate.name || 'кандидат';
  const when = new Date(interview.startsAt);
  const whenLabel = Number.isNaN(when.getTime())
    ? interview.startsAt
    : when.toLocaleString('ru-RU', {dateStyle: 'full', timeStyle: 'short'});
  const subject = `${company}: приглашение на интервью — ${jobTitle || interview.title}`;
  const text = [
    `Здравствуйте, ${name}!`,
    ``,
    `Приглашаем вас на интервью.`,
    `Роль: ${jobTitle || '—'}`,
    `Тема: ${interview.title}`,
    `Когда: ${whenLabel}`,
    `Формат: ${interview.format}`,
    interview.location ? `Место / ссылка: ${interview.location}` : null,
    interview.interviewer ? `Интервьюер: ${interview.interviewer}` : null,
    `Длительность: ${interview.duration} мин.`,
    ``,
    `Компания: ${company}`,
    ``,
    `---`,
    `Hello, ${name}!`,
    `You are invited to an interview for ${jobTitle || interview.title}.`,
    `When: ${whenLabel}`,
    `Format: ${interview.format}`
  ].filter(Boolean).join('\n');
  return sendMail({to: candidate.email, subject, text});
}

/** Only these pipeline stages trigger candidate emails (not New / Screening). */
export const STAGE_EMAIL_STAGES = ['Interview', 'Offer', 'Hired'];

export function stageNoticeText({name, role, company, toStage}) {
  if (toStage === 'Interview') {
    return {
      subject: `${company}: приглашение на интервью — ${role}`,
      text: [
        `Здравствуйте, ${name}!`,
        ``,
        `Мы хотели бы пригласить вас на интервью по роли «${role}».`,
        `С вами свяжутся по деталям встречи (время, формат, ссылка).`,
        ``,
        `Компания: ${company}`,
        ``,
        `---`,
        `Hello, ${name}!`,
        `We would like to invite you to an interview for «${role}».`,
        `You will receive meeting details (time, format, link) separately when scheduled.`,
        `Company: ${company}`
      ].join('\n')
    };
  }
  if (toStage === 'Offer') {
    return {
      subject: `${company}: предложение о работе — ${role}`,
      text: [
        `Здравствуйте, ${name}!`,
        ``,
        `Отличные новости: мы готовы сделать вам предложение по роли «${role}».`,
        `Рекрутер свяжется с вами по условиям оффера.`,
        ``,
        `Компания: ${company}`,
        ``,
        `---`,
        `Hello, ${name}!`,
        `Great news — we are ready to extend an offer for «${role}».`,
        `A recruiter will follow up with the offer details.`,
        `Company: ${company}`
      ].join('\n')
    };
  }
  // Hired
  return {
    subject: `${company}: вы приняты в команду — ${role}`,
    text: [
      `Здравствуйте, ${name}!`,
      ``,
      `Поздравляем! Вы успешно устроены к нам в компанию на роль «${role}».`,
      `Рады приветствовать вас в команде ${company}.`,
      ``,
      `---`,
      `Hello, ${name}!`,
      `Congratulations — you have been hired for «${role}» at ${company}.`,
      `Welcome to the team!`
    ].join('\n')
  };
}

export async function sendStageChangeEmail({candidate, jobTitle, fromStage, toStage, company}) {
  if (process.env.JOBSTER_MAIL_STAGE_NOTIFY === 'false') {
    return {delivered: false, skipped: true};
  }
  if (!STAGE_EMAIL_STAGES.includes(toStage)) {
    return {delivered: false, skipped: true, reason: 'stage-not-notified'};
  }
  const name = candidate.name || 'кандидат';
  const email = candidate.email;
  const role = jobTitle || 'вакансию';
  const {subject, text} = stageNoticeText({name, role, company, toStage});
  return sendMail({to: email, subject, text});
}

/**
 * POST /api/interviews and the assistant invite already send the appointment
 * message themselves. Skip the stage diff for that same save so it is not sent twice.
 */
let suppressDuplicateInterviewNotify = 0;
export function withSuppressedInterviewStageNotify(fn) {
  suppressDuplicateInterviewNotify += 1;
  try { return fn(); }
  finally { suppressDuplicateInterviewNotify -= 1; }
}

let inflight = Promise.resolve();
export function whenStageNotifiesSettled() {
  return inflight;
}
function trackNotify(promise) {
  const tracked = Promise.resolve(promise).catch(err => {
    console.error('[notify] stage notify failed:', err?.message || err);
  });
  inflight = inflight.then(() => tracked, () => tracked);
}

/**
 * Diff candidate stages and notify asynchronously (never throws to caller).
 * Email when SMTP is configured; the same text goes to Telegram when the candidate linked the bot.
 * A brand-new interview created in the same save (pipeline drag onto Interview) uses the appointment text.
 */
export function notifyStageChanges(prevState, nextState) {
  try {
    const prevMap = new Map((prevState?.candidates || []).map(c => [c.id, c]));
    const prevInterviewIds = new Set((prevState?.interviews || []).map(i => i.id));
    const jobs = new Map((nextState?.jobs || []).map(j => [j.id, j.title]));
    const company = nextState?.settings?.company || process.env.JOBSTER_COMPANY || 'Falcon Jobster';
    const mailOn = mailConfigured() && process.env.JOBSTER_MAIL_STAGE_NOTIFY !== 'false';
    const tasks = [];
    for (const c of nextState?.candidates || []) {
      if (c.archived) continue;
      const prev = prevMap.get(c.id);
      if (!prev || prev.stage === c.stage) continue;
      if (!STAGE_EMAIL_STAGES.includes(c.stage)) continue;
      const freshInterview = c.stage === 'Interview'
        ? (nextState.interviews || []).find(i => i.candidateId === c.id && i.status !== 'Cancelled' && !prevInterviewIds.has(i.id))
        : null;
      const hasInterview = c.stage === 'Interview' && (nextState.interviews || []).some(
        i => i.candidateId === c.id && i.status !== 'Cancelled'
      );
      // Appointment already existed — invite was sent when it was created.
      if (c.stage === 'Interview' && hasInterview && !freshInterview) continue;
      // Caller sends the invite after this save (POST /api/interviews, assistant invite).
      if (freshInterview && suppressDuplicateInterviewNotify) continue;
      if (!c.email && !c.telegramChatId) continue;
      tasks.push({
        candidate: c,
        jobTitle: jobs.get(c.jobId) || '',
        fromStage: prev.stage,
        toStage: c.stage,
        company,
        interview: freshInterview || null
      });
    }
    for (const task of tasks) {
      if (!mailOn || !task.candidate.email) continue;
      const pending = task.interview
        ? sendInterviewInvite({
          candidate: task.candidate,
          jobTitle: task.jobTitle,
          interview: task.interview,
          company: task.company
        })
        : sendStageChangeEmail(task);
      trackNotify(pending);
    }
    const tgTasks = tasks.filter(t => t.candidate.telegramChatId);
    if (!tgTasks.length) return;
    trackNotify(import('./telegram.mjs').then(async mod => {
      if (!mod.telegramConfigured()) return;
      await Promise.all(tgTasks.map(task => {
        const pending = task.interview
          ? mod.sendInterviewTelegram({
            candidate: task.candidate,
            jobTitle: task.jobTitle,
            interview: task.interview,
            company: task.company
          })
          : mod.sendStageChangeTelegram({
            candidate: task.candidate,
            jobTitle: task.jobTitle,
            toStage: task.toStage,
            company: task.company
          });
        return pending.catch(err => console.error('[telegram] stage notify failed:', err.message || err));
      }));
    }));
  } catch (err) {
    console.error('[mail] stage diff failed:', err.message || err);
  }
}
