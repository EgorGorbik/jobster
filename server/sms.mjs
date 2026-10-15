/**
 * Outbound SMS via Twilio Messages API.
 * Config: API Key (SK…) + Secret + From + Account SID (AC…).
 * Account SID is on the Twilio Console dashboard (not secret); Restricted
 * API keys cannot list accounts, so auto-lookup is best-effort only.
 * https://www.twilio.com/docs/sms/api/message-resource
 */
import {STAGE_EMAIL_STAGES} from './mail.mjs';

const ACCOUNTS_URL = 'https://api.twilio.com/2010-04-01/Accounts.json?PageSize=1&Status=active';
const messagesUrl = sid => `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;

let cachedAccountSid = '';

function apiKeySid() {
  return process.env.TWILIO_API_KEY?.trim()
    || process.env.TWILIO_API_KEY_SID?.trim()
    || '';
}

function apiKeySecret() {
  return process.env.TWILIO_API_SECRET?.trim()
    || process.env.TWILIO_API_KEY_SECRET?.trim()
    || '';
}

function fromNumber() {
  return process.env.TWILIO_FROM_NUMBER?.trim() || '';
}

function accountSidEnv() {
  return process.env.TWILIO_ACCOUNT_SID?.trim() || '';
}

function basicAuth(user, pass) {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

/** True when Key+Secret+From+Account SID (or legacy SID+Auth Token+From) are set. */
export function smsConfigured() {
  if (!fromNumber()) return false;
  if (apiKeySid() && apiKeySecret() && accountSidEnv()) return true;
  // Legacy / Standard key without SID: still "configured" — send will try lookup.
  if (apiKeySid() && apiKeySecret()) return true;
  return !!(accountSidEnv() && process.env.TWILIO_AUTH_TOKEN?.trim());
}

function credentials() {
  const from = fromNumber();
  if (!from) return null;
  const key = apiKeySid();
  const secret = apiKeySecret();
  if (key && secret) {
    return {
      from,
      user: key,
      pass: secret,
      accountSid: accountSidEnv() || cachedAccountSid || ''
    };
  }
  const sid = accountSidEnv();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (sid && token) return {from, user: sid, pass: token, accountSid: sid};
  return null;
}

async function resolveAccountSid(cred) {
  if (cred.accountSid) return cred.accountSid;
  const res = await fetch(ACCOUNTS_URL, {
    headers: {Authorization: basicAuth(cred.user, cred.pass)}
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data?.message || data?.error_message || `HTTP ${res.status}`;
    throw new Error(
      `Twilio account lookup failed (${err}). Restricted API keys cannot list accounts — ` +
      `set TWILIO_ACCOUNT_SID=AC… from https://console.twilio.com (Account Info).`
    );
  }
  const sid = data?.accounts?.[0]?.sid || data?.sid || '';
  if (!sid || !/^AC[0-9a-fA-F]{32}$/.test(sid)) {
    throw new Error('Twilio account lookup returned no Account SID — set TWILIO_ACCOUNT_SID=AC… in .env');
  }
  cachedAccountSid = sid;
  return sid;
}

/** Normalize to E.164 when possible; return '' if unusable. */
export function normalizePhone(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  s = s.replace(/[\s().-]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (/^80\d{9}$/.test(s)) s = `+375${s.slice(2)}`;
  else if (/^8\d{10}$/.test(s)) s = `+7${s.slice(1)}`;
  else if (/^\d{10,15}$/.test(s)) s = `+${s}`;
  if (!/^\+[1-9]\d{7,14}$/.test(s)) return '';
  return s;
}

export async function sendSms({to, body}) {
  const cred = credentials();
  if (!cred) {
    console.log(`[sms] Twilio not configured — skip to=${to}\n${body}`);
    return {delivered: false, skipped: true};
  }
  const dest = normalizePhone(to);
  if (!dest) return {delivered: false, skipped: true, reason: 'invalid-to'};
  const text = String(body || '').slice(0, 1500);
  if (!text.trim()) return {delivered: false, skipped: true, reason: 'empty-body'};

  let accountSid;
  try {
    accountSid = await resolveAccountSid(cred);
  } catch (err) {
    console.error('[sms]', err.message || err);
    return {delivered: false, skipped: false, error: String(err.message || err)};
  }

  const form = new URLSearchParams({To: dest, From: cred.from, Body: text});
  let res;
  let data = {};
  try {
    res = await fetch(messagesUrl(accountSid), {
      method: 'POST',
      headers: {
        Authorization: basicAuth(cred.user, cred.pass),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: form.toString()
    });
    data = await res.json().catch(() => ({}));
  } catch (err) {
    const msg = err?.cause?.message || err?.message || String(err);
    console.error('[sms] Twilio request failed:', msg);
    return {delivered: false, skipped: false, error: msg};
  }
  if (!res.ok) {
    const err = data?.message || data?.error_message || `HTTP ${res.status}`;
    console.error('[sms] Twilio send failed:', err);
    return {delivered: false, skipped: false, error: String(err)};
  }
  return {delivered: true, messageId: data.sid || null, provider: 'twilio', to: dest};
}

/** Compact SMS (≤~320 chars) for stage / interview notices. */
export function smsStageBody({name, role, company, toStage}) {
  const first = String(name || '').split(/\s+/)[0] || 'кандидат';
  if (toStage === 'Interview') {
    return `${company}: ${first}, приглашаем на интервью по роли «${role}». Детали встречи пришлём отдельно.`;
  }
  if (toStage === 'Offer') {
    return `${company}: ${first}, готовы сделать предложение по роли «${role}». Рекрутер свяжется с условиями.`;
  }
  return `${company}: ${first}, поздравляем — вы приняты на роль «${role}»! Добро пожаловать в команду.`;
}

export function smsInterviewBody({name, jobTitle, interview, company}) {
  const first = String(name || '').split(/\s+/)[0] || 'кандидат';
  const when = new Date(interview.startsAt);
  const whenLabel = Number.isNaN(when.getTime())
    ? interview.startsAt
    : when.toLocaleString('ru-RU', {dateStyle: 'short', timeStyle: 'short'});
  const role = jobTitle || interview.title || 'вакансию';
  const loc = interview.location ? ` ${interview.location}` : '';
  return `${company}: ${first}, интервью «${role}» — ${whenLabel}, ${interview.format || 'встреча'}.${loc}`.slice(0, 320);
}

export async function sendStageChangeSms({candidate, jobTitle, toStage, company}) {
  if (process.env.JOBSTER_SMS_STAGE_NOTIFY === 'false') {
    return {delivered: false, skipped: true};
  }
  if (!STAGE_EMAIL_STAGES.includes(toStage)) {
    return {delivered: false, skipped: true, reason: 'stage-not-notified'};
  }
  const phone = candidate.phone;
  if (!normalizePhone(phone)) return {delivered: false, skipped: true, reason: 'no-phone'};
  const role = jobTitle || 'вакансию';
  const body = smsStageBody({name: candidate.name, role, company, toStage});
  return sendSms({to: phone, body});
}

export async function sendInterviewSms({candidate, jobTitle, interview, company}) {
  if (!normalizePhone(candidate.phone)) {
    return {delivered: false, skipped: true, reason: 'no-phone'};
  }
  const body = smsInterviewBody({name: candidate.name, jobTitle, interview, company});
  return sendSms({to: candidate.phone, body});
}

/** Test helper — clear resolved Account SID cache. */
export function _resetSmsCacheForTests() {
  cachedAccountSid = '';
}
