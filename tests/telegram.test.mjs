import {test, after, before} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {createDatabase} from '../server/database.mjs';
import {bootstrap} from '../server/auth.mjs';
import {makeServer} from '../server/index.mjs';
import {whenStageNotifiesSettled} from '../server/mail.mjs';
import {
  handleTelegramUpdate,
  isInterviewTomorrow,
  runTomorrowReminders,
  telegramDeepLink
} from '../server/telegram.mjs';

const dir = mkdtempSync(path.join(tmpdir(), 'jobster-tg-'));
const db = createDatabase(path.join(dir, 'test.sqlite'));
let server, origin, cookie = '', slug = '', candidateId = '';
const pass = 'telegram-test-password-4411';
const sent = [];

async function query(method, route, body, headers = {}, authCookie = cookie) {
  const options = {method, headers: {...(authCookie ? {Cookie: authCookie} : {}), ...headers}};
  if (body !== undefined) {
    options.headers['Content-Type'] ||= 'application/json';
    options.body = JSON.stringify(body);
  }
  const response = await fetch(origin + route, options);
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return {status: response.status, data, headers: response.headers};
}

before(async () => {
  process.env.JOBSTER_APPLY_DEV_LINKS = 'true';
  process.env.TELEGRAM_BOT_TOKEN = '000000:TESTTOKEN';
  process.env.TELEGRAM_BOT_USERNAME = 'JobsterTestBot';
  process.env.TELEGRAM_USE_POLLING = 'false';
  process.env.TELEGRAM_REMINDERS = 'false';
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;

  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('api.telegram.org')) {
      const body = opts?.body ? JSON.parse(opts.body) : {};
      sent.push({url: u, body});
      return {
        ok: true,
        json: async () => ({ok: true, result: {message_id: sent.length}})
      };
    }
    return realFetch(url, opts);
  };

  await bootstrap(db, {company: 'TG Co', name: 'Owner', email: 'tg-owner@example.com', password: pass});
  server = makeServer({db, allowedOrigin: ''});
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = `http://127.0.0.1:${server.address().port}`;
  const signed = await query('POST', '/api/auth/login', {email: 'tg-owner@example.com', password: pass}, {}, '');
  cookie = signed.headers.get('set-cookie').split(';')[0];

  const job = await query('POST', '/api/jobs', {
    title: 'Driver',
    department: 'Ops',
    location: 'Austin, TX',
    openings: 1,
    description: 'Drive safely.'
  });
  slug = job.data.data.publicSlug;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  db.close();
  rmSync(dir, {recursive: true, force: true});
});

test('apply returns telegram deep link and stores username', async () => {
  const start = await query('POST', `/api/public/jobs/${slug}/start`, {email: 'tg-cand@example.com'}, {}, '');
  const confirm = await query('POST', `/api/public/jobs/${slug}/confirm`, {
    email: 'tg-cand@example.com',
    code: start.data.dev.code
  }, {}, '');
  const submit = await query('POST', `/api/public/jobs/${slug}/submit`, {
    email: 'tg-cand@example.com',
    proof: confirm.data.proof,
    name: 'Alex Linked',
    phone: '555-0199',
    telegram: '@alex_driver',
    location: 'Austin, TX'
  }, {}, '');
  assert.equal(submit.status, 201);
  candidateId = submit.data.candidateId;
  assert.equal(submit.data.telegramConfigured, true);
  assert.equal(submit.data.telegramDeepLink, `https://t.me/JobsterTestBot?start=${candidateId}`);
  assert.equal(telegramDeepLink(candidateId), submit.data.telegramDeepLink);

  const list = await query('GET', '/api/candidates?stage=New');
  const c = list.data.items.find(x => x.id === candidateId);
  assert.equal(c.telegram, 'alex_driver');
  assert.equal(c.telegramChatId, '');
});

test('webhook /start links chat_id', async () => {
  sent.length = 0;
  const res = await query('POST', '/api/public/telegram/webhook', {
    update_id: 1,
    message: {
      message_id: 10,
      chat: {id: 424242},
      from: {id: 1, username: 'alex_driver'},
      text: `/start ${candidateId}`
    }
  }, {}, '');
  assert.equal(res.status, 200);
  assert.equal(res.data.linked, true);
  assert.ok(sent.some(s => s.url.includes('sendMessage') && String(s.body.chat_id) === '424242'));

  const list = await query('GET', `/api/candidates/${candidateId}`);
  assert.equal(list.status, 200);
  assert.equal(list.data.data.telegramChatId, '424242');
  assert.ok(list.data.data.telegramLinkedAt);
});

test('interview create sends telegram invite', async () => {
  sent.length = 0;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(11, 0, 0, 0);
  const created = await query('POST', '/api/interviews', {
    candidateId,
    title: 'Recruiter screen',
    startsAt: tomorrow.toISOString(),
    duration: 30,
    format: 'Video',
    location: 'https://meet.example/x',
    interviewer: 'TG Co'
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.telegram?.delivered, true);
  assert.ok(sent.some(s => /Приглашаем вас на интервью|Interview invite/.test(s.body.text)));
});

test('stage change sends the same notice to telegram', async () => {
  const jobId = (await query('GET', '/api/jobs')).data.items[0].id;
  const created = await query('POST', '/api/candidates', {
    name: 'Olga Stage',
    email: 'olga.stage@example.com',
    jobId,
    location: 'Austin, TX',
    source: 'Career site',
    telegramChatId: '555001'
  });
  assert.equal(created.status, 201);
  const id = created.data.data.id;

  sent.length = 0;
  const interview = await query('POST', `/api/candidates/${id}/stage`, {stage: 'Interview'});
  assert.equal(interview.status, 200);
  await whenStageNotifiesSettled();
  assert.equal(sent.length, 1);
  assert.ok(sent.some(s => String(s.body.chat_id) === '555001' && /Приглашаем вас на интервью/.test(s.body.text)));
  assert.ok(/Когда:/.test(sent[0].body.text));

  sent.length = 0;
  const offer = await query('POST', `/api/candidates/${id}/stage`, {stage: 'Offer'});
  assert.equal(offer.status, 200);
  await whenStageNotifiesSettled();
  assert.equal(sent.length, 1);
  assert.ok(sent.some(s => String(s.body.chat_id) === '555001' && /предложение по роли/.test(s.body.text)));

  sent.length = 0;
  const hired = await query('POST', `/api/candidates/${id}/stage`, {stage: 'Hired'});
  assert.equal(hired.status, 200);
  await whenStageNotifiesSettled();
  assert.equal(sent.length, 1);
  assert.ok(sent.some(s => String(s.body.chat_id) === '555001' && /успешно устроены/.test(s.body.text)));

  sent.length = 0;
  const screening = await query('POST', `/api/candidates/${id}/stage`, {stage: 'Screening'});
  assert.equal(screening.status, 200);
  await whenStageNotifiesSettled();
  assert.equal(sent.length, 0);
});

test('tomorrow reminder sends once', async () => {
  sent.length = 0;
  const now = new Date();
  assert.equal(isInterviewTomorrow(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 11).toISOString(), now), true);

  const first = await runTomorrowReminders(db);
  assert.ok(first.sent >= 1);
  assert.ok(sent.some(s => /завтра у вас собеседование|interview tomorrow/i.test(s.body.text)));

  sent.length = 0;
  const second = await runTomorrowReminders(db);
  assert.equal(second.sent, 0);
  assert.equal(sent.length, 0);
});

test('handleTelegramUpdate rejects unknown candidate', async () => {
  sent.length = 0;
  const result = await handleTelegramUpdate(db, {
    message: {chat: {id: 99}, text: '/start deadbeefdeadbeefdeadbeefdeadbeef'}
  });
  assert.equal(result.linked, false);
  assert.equal(result.reason, 'candidate_not_found');
});
