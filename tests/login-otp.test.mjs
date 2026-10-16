import {test, after, before} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {createDatabase} from '../server/database.mjs';
import {bootstrap} from '../server/auth.mjs';
import {makeServer} from '../server/index.mjs';

const dir = mkdtempSync(path.join(tmpdir(), 'falcon-jobster-otp-'));
const db = createDatabase(path.join(dir, 'test.sqlite'));
const pass = 'correct-test-password-8463';
const phone = '+375291110099';
const envKeys = ['RESEND_API_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY', 'TWILIO_API_SECRET', 'TWILIO_FROM_NUMBER', 'TWILIO_AUTH_TOKEN'];
const previousEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
let server, origin, cookie = '';
const deliveries = [];

function codeFrom(body) {
  const match = String(body).match(/\b(\d{6})\b/);
  assert.ok(match, 'delivery body has a 6-digit code');
  return match[1];
}

async function query(method, route, body, authCookie = cookie) {
  const response = await fetch(origin + route, {
    method,
    headers: {
      ...(authCookie ? {Cookie: authCookie} : {}),
      ...(body !== undefined ? {'Content-Type': 'application/json'} : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  return {status: response.status, data, headers: response.headers};
}

before(async () => {
  process.env.RESEND_API_KEY = 're_test_key';
  process.env.TWILIO_ACCOUNT_SID = 'ACffffffffffffffffffffffffffffffff';
  process.env.TWILIO_API_KEY = 'SKtest';
  process.env.TWILIO_API_SECRET = 'secret';
  process.env.TWILIO_FROM_NUMBER = '+15550001111';
  delete process.env.TWILIO_AUTH_TOKEN;
  globalThis.fetch = async (url, opts = {}) => {
    const target = String(url);
    if (target.includes('api.resend.com') || target.includes('api.twilio.com')) {
      deliveries.push({url: target, body: opts.body});
      return {ok: true, json: async () => ({id: 'email_1', sid: 'SM1'})};
    }
    return originalFetch(url, opts);
  };
  await bootstrap(db, {company: 'OTP Hiring', name: 'OTP Owner', email: 'otp-owner@example.com', password: pass});
  server = makeServer({db, allowedOrigin: 'http://localhost:7878'});
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  globalThis.fetch = originalFetch;
  for (const key of envKeys) {
    if (previousEnv[key] === undefined) delete process.env[key];
    else process.env[key] = previousEnv[key];
  }
  if (server) await new Promise(resolve => server.close(resolve));
  db.close();
  rmSync(dir, {recursive: true, force: true});
});

test('email and SMS sign-in require a one-time code', async () => {
  const wrong = await query('POST', '/api/auth/login', {email: 'otp-owner@example.com', password: 'nope', channel: 'email'}, '');
  assert.equal(wrong.status, 401);
  deliveries.length = 0;
  const pending = await query('POST', '/api/auth/login', {email: 'otp-owner@example.com', password: pass, channel: 'email'}, '');
  assert.equal(pending.status, 200);
  assert.equal(pending.data.mfa, true);
  assert.equal(pending.data.channel, 'email');
  assert.equal(pending.headers.get('set-cookie'), null);
  assert.equal((await query('GET', '/api/session', undefined, '')).status, 401);
  const code = codeFrom(deliveries.at(-1).body);
  assert.match(deliveries.at(-1).url, /api\.resend\.com/);
  const bad = await query('POST', '/api/auth/login/verify', {challenge: pending.data.challenge, code: code === '000000' ? '111111' : '000000'}, '');
  assert.equal(bad.status, 400);
  const signed = await query('POST', '/api/auth/login/verify', {challenge: pending.data.challenge, code}, '');
  assert.equal(signed.status, 200);
  assert.equal(signed.data.user.email, 'otp-owner@example.com');
  cookie = signed.headers.get('set-cookie').split(';')[0];
  assert.match(signed.headers.get('set-cookie'), /HttpOnly/);

  const missing = await query('POST', '/api/auth/login', {phone: phone, password: pass, channel: 'sms'}, '');
  assert.equal(missing.status, 401);
  const saved = await query('POST', '/api/auth/phone', {phone: '375 29 111-00-99'});
  assert.equal(saved.status, 200);
  assert.equal(saved.data.user.phone, phone);
  assert.equal((await query('POST', '/api/auth/logout', {})).status, 200);
  cookie = '';
  deliveries.length = 0;
  const smsPending = await query('POST', '/api/auth/login', {phone: '80291110099', password: pass, channel: 'sms'}, '');
  assert.equal(smsPending.status, 200);
  assert.equal(smsPending.data.channel, 'sms');
  assert.match(deliveries.at(-1).url, /api\.twilio\.com/);
  assert.match(String(deliveries.at(-1).body), /To=%2B375291110099/);
  const smsCode = codeFrom(deliveries.at(-1).body);
  const smsSigned = await query('POST', '/api/auth/login/verify', {challenge: smsPending.data.challenge, code: smsCode}, '');
  assert.equal(smsSigned.status, 200);
  assert.equal(smsSigned.data.user.phone, phone);
  cookie = smsSigned.headers.get('set-cookie').split(';')[0];

  assert.equal((await query('POST', '/api/auth/logout', {})).status, 200);
  cookie = '';
  deliveries.length = 0;
  const resendPending = await query('POST', '/api/auth/login', {email: 'otp-owner@example.com', password: pass, channel: 'email'}, '');
  const first = codeFrom(deliveries.at(-1).body);
  db.prepare(`UPDATE login_challenges SET sent_at=? WHERE id=?`).run(new Date(Date.now() - 60000).toISOString(), resendPending.data.challenge);
  const again = await query('POST', '/api/auth/login/resend', {challenge: resendPending.data.challenge}, '');
  assert.equal(again.status, 200);
  const second = codeFrom(deliveries.at(-1).body);
  assert.notEqual(second, first);
  assert.equal((await query('POST', '/api/auth/login/verify', {challenge: resendPending.data.challenge, code: first}, '')).status, 400);
  const resendSigned = await query('POST', '/api/auth/login/verify', {challenge: again.data.challenge, code: second}, '');
  assert.equal(resendSigned.status, 200);
  cookie = resendSigned.headers.get('set-cookie').split(';')[0];

  const created = await query('POST', '/api/users', {
    email: 'sms-recruiter@example.com', name: 'SMS Recruiter', password: 'recruiter-password-99', role: 'Recruiter', phone: '+375293334455'
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.data.phone, '+375293334455');
  const listed = await query('GET', '/api/users');
  assert.ok(listed.data.items.some(user => user.email === 'sms-recruiter@example.com' && user.phone === '+375293334455'));
});
