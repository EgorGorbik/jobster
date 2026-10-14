/**
 * Telegram Bot API: link candidates via deep-link /start=<candidateId>,
 * send interview invites + day-before reminders.
 * No-op when TELEGRAM_BOT_TOKEN is unset.
 */
import {getWorkspace, mutateWorkspace} from './database.mjs';
import {stageNoticeText, STAGE_EMAIL_STAGES} from './mail.mjs';
import {ValidationError} from './validation.mjs';

const API = token => `https://api.telegram.org/bot${token}`;
const REMINDER_INTERVAL_MS = 60 * 60 * 1000;
let pollAbort = null;
let reminderTimer = null;

export function telegramConfigured() {
  return !!(process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_BOT_USERNAME?.trim());
}

export function botUsername() {
  return String(process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '').trim();
}

export function normalizeTelegramUsername(raw) {
  const v = String(raw || '').trim().replace(/^@/, '');
  if (!v) return '';
  if (!/^[A-Za-z0-9_]{5,32}$/.test(v)) {
    throw new ValidationError('Telegram username: 5–32 letters, digits, underscore (no @ needed).', 400);
  }
  return v;
}

function startPayload(candidateId) {
  return String(candidateId).slice(0, 64);
}

/** HTTPS landing (t.me). Shows Telegram interstitial — avoid as primary CTA. */
export function telegramDeepLink(candidateId) {
  if (!telegramConfigured() || !candidateId) return null;
  return `https://t.me/${botUsername()}?start=${encodeURIComponent(startPayload(candidateId))}`;
}

/** Native Telegram Desktop/mobile protocol with /start payload. */
export function telegramAppDeepLink(candidateId) {
  if (!telegramConfigured() || !candidateId) return null;
  return `tg://resolve?domain=${botUsername()}&start=${encodeURIComponent(startPayload(candidateId))}`;
}

/**
 * Open bot chat in Telegram Web A by @username.
 * NOTE: Web clients usually IGNORE ?start= — user must press Start or send /start <payload>.
 */
export function telegramWebClientLink(candidateId) {
  if (!telegramConfigured() || !candidateId) return null;
  return `https://web.telegram.org/a/#@${botUsername()}`;
}

/** Exact text the candidate should send if deep-link start is lost. */
export function telegramStartCommand(candidateId) {
  if (!candidateId) return null;
  return `/start ${startPayload(candidateId)}`;
}

async function botCall(method, body) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return {ok: false, skipped: true, reason: 'not_configured'};
  const res = await fetch(`${API(token)}/${method}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) {
    console.error(`[telegram] ${method} failed:`, data.description || res.status);
  }
  return data;
}

export async function sendTelegramMessage(chatId, text, extra = {}) {
  if (!chatId || !text) return {ok: false, skipped: true, reason: 'missing_chat_or_text'};
  if (!telegramConfigured()) return {ok: false, skipped: true, reason: 'not_configured'};
  const data = await botCall('sendMessage', {
    chat_id: chatId,
    text: String(text).slice(0, 4000),
    disable_web_page_preview: true,
    ...extra
  });
  return {
    ok: !!data.ok,
    delivered: !!data.ok,
    skipped: false,
    messageId: data.result?.message_id,
    error: data.ok ? undefined : (data.description || 'telegram_send_failed')
  };
}

function whenLabel(startsAt) {
  const when = new Date(startsAt);
  if (Number.isNaN(when.getTime())) return startsAt;
  return when.toLocaleString('ru-RU', {dateStyle: 'full', timeStyle: 'short'});
}

export async function sendInterviewTelegram({candidate, jobTitle, interview, company}) {
  const chatId = candidate?.telegramChatId;
  if (!chatId) return {ok: false, skipped: true, reason: 'no_chat_id'};
  const name = candidate.name || 'кандидат';
  const text = [
    `Здравствуйте, ${name}!`,
    ``,
    `Приглашаем вас на интервью.`,
    `Компания: ${company}`,
    `Роль: ${jobTitle || interview.title}`,
    `Когда: ${whenLabel(interview.startsAt)}`,
    `Формат: ${interview.format}`,
    interview.location ? `Место / ссылка: ${interview.location}` : null,
    interview.interviewer ? `Интервьюер: ${interview.interviewer}` : null,
    `Длительность: ${interview.duration} мин.`,
    ``,
    `---`,
    `Hello, ${name}!`,
    `Interview invite for ${jobTitle || interview.title}.`,
    `When: ${whenLabel(interview.startsAt)}`,
    `Format: ${interview.format}`
  ].filter(Boolean).join('\n');
  return sendTelegramMessage(chatId, text);
}

/** Same copy as the stage-change email (Interview without a slot, Offer, Hired). */
export async function sendStageChangeTelegram({candidate, jobTitle, toStage, company}) {
  const chatId = candidate?.telegramChatId;
  if (!chatId) return {ok: false, skipped: true, reason: 'no_chat_id'};
  if (!STAGE_EMAIL_STAGES.includes(toStage)) {
    return {ok: false, skipped: true, reason: 'stage-not-notified'};
  }
  const name = candidate.name || 'кандидат';
  const role = jobTitle || 'вакансию';
  const {text} = stageNoticeText({name, role, company, toStage});
  return sendTelegramMessage(chatId, text);
}

export async function sendTomorrowReminderTelegram({candidate, jobTitle, interview, company}) {
  const chatId = candidate?.telegramChatId;
  if (!chatId) return {ok: false, skipped: true, reason: 'no_chat_id'};
  const name = candidate.name || 'кандидат';
  const text = [
    `Здравствуйте, ${name}!`,
    ``,
    `Напоминаем: завтра у вас собеседование.`,
    `Компания: ${company}`,
    `Роль: ${jobTitle || interview.title}`,
    `Когда: ${whenLabel(interview.startsAt)}`,
    `Формат: ${interview.format}`,
    interview.location ? `Место / ссылка: ${interview.location}` : null,
    ``,
    `Удачи!`,
    ``,
    `---`,
    `Reminder: you have an interview tomorrow.`,
    `When: ${whenLabel(interview.startsAt)}`
  ].filter(Boolean).join('\n');
  return sendTelegramMessage(chatId, text);
}

/** Find candidate by id across all workspaces. */
export function findCandidateAnywhere(db, candidateId) {
  const id = String(candidateId || '').trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return null;
  for (const ws of db.prepare('SELECT id FROM workspaces').all()) {
    const {state} = getWorkspace(db, ws.id);
    const candidate = state.candidates.find(c => c.id === id);
    if (candidate) return {workspaceId: ws.id, candidate, state};
  }
  return null;
}

function parseStartPayload(text) {
  const raw = String(text || '').trim();
  const m = raw.match(/^\/start(?:@\w+)?(?:\s+(.+))?$/i);
  if (!m) return null;
  return (m[1] || '').trim().slice(0, 64) || null;
}

/**
 * Handle one Telegram Update (webhook or polling).
 * Links chat_id when /start <candidateId>.
 */
export async function handleTelegramUpdate(db, update) {
  const message = update?.message || update?.edited_message;
  if (!message?.chat?.id) return {handled: false};
  const chatId = String(message.chat.id);
  const startId = parseStartPayload(message.text);
  if (!startId) {
    if (/^\/start/i.test(String(message.text || ''))) {
      await sendTelegramMessage(chatId,
        'Чтобы привязать уведомления о собеседованиях, откройте ссылку с сайта вакансии (кнопка «Подключить Telegram») и нажмите Start.\n\nOpen the link from the career page first, then press Start.');
      return {handled: true, linked: false, reason: 'missing_payload'};
    }
    return {handled: false};
  }

  const found = findCandidateAnywhere(db, startId);
  if (!found) {
    await sendTelegramMessage(chatId,
      'Не нашли заявку по этой ссылке. Откликнитесь на вакансию ещё раз и откройте новую ссылку.\n\nApplication not found for this link.');
    return {handled: true, linked: false, reason: 'candidate_not_found'};
  }

  const fromUser = message.from?.username ? String(message.from.username) : '';
  const now = new Date().toISOString();
  mutateWorkspace(db, found.workspaceId, undefined, null, 'candidate.telegram_link', state => {
    const c = state.candidates.find(x => x.id === startId);
    if (!c) throw new ValidationError('Candidate not found', 404);
    c.telegramChatId = chatId;
    c.telegramLinkedAt = now;
    if (fromUser) c.telegram = fromUser;
    else if (!c.telegram) c.telegram = '';
    c.updatedAt = now;
    c.history = c.history || [];
    c.history.push({
      id: `tg-${Date.now().toString(36)}`,
      type: 'telegram',
      text: 'Telegram linked for interview notifications',
      at: now
    });
    if (c.history.length > 500) c.history = c.history.slice(-500);
    return {id: c.id, telegramChatId: chatId};
  });

  await sendTelegramMessage(chatId,
    `Готово, ${found.candidate.name}! Telegram подключён.\nСюда придут те же уведомления, что и на почту: интервью, оффер, найм — и напоминание за день до собеседования.\n\nLinked. You will get the same updates as email (interview, offer, hired) plus a reminder the day before.`);
  return {handled: true, linked: true, candidateId: startId, chatId};
}

async function readJSONBody(req, maxBytes = 256 * 1024) {
  let length = 0;
  const chunks = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > maxBytes) throw new ValidationError('Request body is too large', 413);
    chunks.push(chunk);
  }
  if (!length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ValidationError('Invalid JSON', 400);
  }
}

/**
 * POST /api/public/telegram/webhook
 * Optional header X-Telegram-Bot-Api-Secret-Token = TELEGRAM_WEBHOOK_SECRET
 */
export async function handleTelegramWebhook(req, res, db) {
  if ((req.method || 'GET') !== 'POST') {
    throw new ValidationError('Method not allowed', 405);
  }
  if (!telegramConfigured()) {
    res.writeHead(503, {'Content-Type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify({error: 'Telegram bot is not configured'}));
    return;
  }
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (secret) {
    const got = req.headers['x-telegram-bot-api-secret-token'];
    if (got !== secret) throw new ValidationError('Invalid webhook secret', 403);
  }
  const update = await readJSONBody(req);
  const result = await handleTelegramUpdate(db, update);
  res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'});
  res.end(JSON.stringify({ok: true, ...result}));
}

function startOfLocalDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Interviews whose local calendar day is tomorrow. */
export function isInterviewTomorrow(startsAt, now = new Date()) {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return false;
  const tomorrow = startOfLocalDay(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const day = startOfLocalDay(start);
  return day.getTime() === tomorrow.getTime();
}

/**
 * Scan all workspaces: send "tomorrow" Telegram reminders once per interview.
 */
export async function runTomorrowReminders(db) {
  if (!telegramConfigured()) return {sent: 0, skipped: true};
  let sent = 0;
  const workspaces = db.prepare('SELECT id FROM workspaces').all();
  for (const ws of workspaces) {
    const due = [];
    const snap = getWorkspace(db, ws.id);
    for (const interview of snap.state.interviews) {
      if (interview.status !== 'Scheduled') continue;
      if (interview.telegramReminderSentAt) continue;
      if (!isInterviewTomorrow(interview.startsAt)) continue;
      const candidate = snap.state.candidates.find(c => c.id === interview.candidateId);
      if (!candidate?.telegramChatId) continue;
      const job = snap.state.jobs.find(j => j.id === candidate.jobId);
      due.push({interview, candidate, jobTitle: job?.title || null, company: snap.state.settings.company});
    }
    for (const item of due) {
      try {
        const result = await sendTomorrowReminderTelegram({
          candidate: item.candidate,
          jobTitle: item.jobTitle,
          interview: item.interview,
          company: item.company
        });
        if (result.delivered) {
          sent += 1;
          mutateWorkspace(db, ws.id, undefined, null, 'interview.telegram_reminder', state => {
            const iv = state.interviews.find(i => i.id === item.interview.id);
            if (iv) iv.telegramReminderSentAt = new Date().toISOString();
            return {id: item.interview.id};
          });
        }
      } catch (err) {
        console.error('[telegram] reminder failed:', err.message || err);
      }
    }
  }
  return {sent};
}

export function startTelegramReminderLoop(db) {
  if (reminderTimer || !telegramConfigured()) return;
  if (process.env.TELEGRAM_REMINDERS === 'false') return;
  const tick = () => {
    runTomorrowReminders(db).catch(err => console.error('[telegram] reminder loop:', err.message || err));
  };
  tick();
  reminderTimer = setInterval(tick, REMINDER_INTERVAL_MS);
  if (typeof reminderTimer.unref === 'function') reminderTimer.unref();
}

export function stopTelegramReminderLoop() {
  if (reminderTimer) {
    clearInterval(reminderTimer);
    reminderTimer = null;
  }
}

/** Long-polling for local/dev when webhook is unreachable. */
export function startTelegramPolling(db) {
  if (pollAbort || !telegramConfigured()) return;
  if (process.env.TELEGRAM_USE_POLLING !== 'true') return;
  const token = process.env.TELEGRAM_BOT_TOKEN.trim();
  const ac = new AbortController();
  pollAbort = ac;
  let offset = 0;
  (async () => {
    console.log('[telegram] long-polling enabled (TELEGRAM_USE_POLLING=true)');
    while (!ac.signal.aborted) {
      try {
        const res = await fetch(`${API(token)}/getUpdates?offset=${offset}&timeout=25`, {
          signal: ac.signal
        });
        const data = await res.json();
        if (!data.ok) {
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }
        for (const update of data.result || []) {
          offset = Math.max(offset, (update.update_id || 0) + 1);
          try {
            await handleTelegramUpdate(db, update);
          } catch (err) {
            console.error('[telegram] update handler:', err.message || err);
          }
        }
      } catch (err) {
        if (ac.signal.aborted) break;
        console.error('[telegram] poll error:', err.message || err);
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  })();
}

export function stopTelegramPolling() {
  if (pollAbort) {
    pollAbort.abort();
    pollAbort = null;
  }
}

export function startTelegramServices(db) {
  startTelegramReminderLoop(db);
  startTelegramPolling(db);
}

export function stopTelegramServices() {
  stopTelegramReminderLoop();
  stopTelegramPolling();
}
