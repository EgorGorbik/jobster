import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePhone,
  alphanumericSender,
  smsConfigured,
  smsStageBody,
  smsInterviewBody,
  sendSms,
  _resetSmsCacheForTests
} from '../server/sms.mjs';

const KEYS = [
  'TWILIO_API_KEY','TWILIO_API_SECRET','TWILIO_API_KEY_SID','TWILIO_API_KEY_SECRET',
  'TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_FROM_NUMBER','TWILIO_SENDER_ID'
];

function clearTwilioEnv() {
  for (const k of KEYS) delete process.env[k];
  _resetSmsCacheForTests();
}

test('normalizePhone accepts E.164 and common local formats', () => {
  assert.equal(normalizePhone('+375 29 111-22-33'), '+375291112233');
  assert.equal(normalizePhone('80291112233'), '+375291112233');
  assert.equal(normalizePhone('89161234567'), '+79161234567');
  assert.equal(normalizePhone('bad'), '');
  assert.equal(normalizePhone(''), '');
});

test('smsConfigured needs API key + secret + from', () => {
  const prev = {...process.env};
  try {
    clearTwilioEnv();
    assert.equal(smsConfigured(), false);
    process.env.TWILIO_API_KEY = 'SKtest';
    process.env.TWILIO_API_SECRET = 'secret';
    assert.equal(smsConfigured(), false);
    process.env.TWILIO_FROM_NUMBER = '+15551234567';
    assert.equal(smsConfigured(), true);
  } finally {
    clearTwilioEnv();
    Object.assign(process.env, prev);
  }
});

test('SMS bodies stay compact', () => {
  const stage = smsStageBody({name: 'Алексей Котов', role: 'Программист', company: 'Falcon', toStage: 'Interview'});
  assert.ok(stage.length < 200);
  assert.match(stage, /интервью/);
  const invite = smsInterviewBody({
    name: 'Алексей',
    jobTitle: 'Программист',
    company: 'Falcon',
    interview: {startsAt: '2026-10-20T12:00:00.000Z', format: 'Video', title: 'Tech', location: 'Zoom'}
  });
  assert.ok(invite.length <= 320);
  assert.match(invite, /Video/);
});

test('sendSms uses TWILIO_ACCOUNT_SID and posts message', async () => {
  const prev = {...process.env};
  const calls = [];
  const original = globalThis.fetch;
  try {
    clearTwilioEnv();
    process.env.TWILIO_ACCOUNT_SID = 'ACffffffffffffffffffffffffffffffff';
    process.env.TWILIO_API_KEY = 'SKabc';
    process.env.TWILIO_API_SECRET = 'sec';
    process.env.TWILIO_FROM_NUMBER = '+15550001111';
    globalThis.fetch = async (url, opts) => {
      calls.push({url: String(url), opts});
      return {ok: true, json: async () => ({sid: 'SMxxx'})};
    };
    const r = await sendSms({to: '+375291112233', body: 'hello'});
    assert.equal(r.delivered, true);
    assert.equal(r.messageId, 'SMxxx');
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /Accounts\/ACffffffffffffffffffffffffffffffff\/Messages\.json/);
    assert.match(calls[0].opts.body, /To=%2B375291112233/);
    assert.match(calls[0].opts.body, /From=%2B15550001111/);
    assert.equal(alphanumericSender(), 'Falcon');
  } finally {
    globalThis.fetch = original;
    clearTwilioEnv();
    Object.assign(process.env, prev);
  }
});

test('sendSms retries with alphanumeric sender after Twilio 21612', async () => {
  const prev = {...process.env};
  const calls = [];
  const original = globalThis.fetch;
  try {
    clearTwilioEnv();
    process.env.TWILIO_ACCOUNT_SID = 'ACffffffffffffffffffffffffffffffff';
    process.env.TWILIO_API_KEY = 'SKabc';
    process.env.TWILIO_API_SECRET = 'sec';
    process.env.TWILIO_FROM_NUMBER = '+15550001111';
    process.env.TWILIO_SENDER_ID = 'Falcon';
    globalThis.fetch = async (url, opts) => {
      calls.push(String(opts.body));
      if (calls.length === 1) {
        return {ok: false, json: async () => ({code: 21612, message: 'bad combo'})};
      }
      return {ok: true, json: async () => ({sid: 'SMretry'})};
    };
    const r = await sendSms({to: '+995598283822', body: 'code'});
    assert.equal(r.delivered, true);
    assert.equal(r.messageId, 'SMretry');
    assert.equal(calls.length, 2);
    assert.match(calls[0], /From=%2B15550001111/);
    assert.match(calls[1], /From=Falcon/);
    assert.match(calls[1], /To=%2B995598283822/);
  } finally {
    globalThis.fetch = original;
    clearTwilioEnv();
    Object.assign(process.env, prev);
  }
});
