import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldSend24hReminder,
  shouldSend1hReminder,
  localDateKey,
  notifyTeamOfferChange
} from '../server/team-mail.mjs';

test('interview reminder windows', () => {
  const now = Date.parse('2026-10-15T12:00:00.000Z');
  assert.equal(shouldSend24hReminder(new Date(now + 20 * 3600000).toISOString(), now), true);
  assert.equal(shouldSend24hReminder(new Date(now + 30 * 3600000).toISOString(), now), false);
  assert.equal(shouldSend1hReminder(new Date(now + 45 * 60000).toISOString(), now), true);
  assert.equal(shouldSend1hReminder(new Date(now + 2 * 3600000).toISOString(), now), false);
  assert.equal(shouldSend1hReminder(new Date(now - 60000).toISOString(), now), false);
});

test('localDateKey formats YYYY-MM-DD', () => {
  assert.match(localDateKey('UTC', new Date('2026-10-15T12:00:00Z')), /^\d{4}-\d{2}-\d{2}$/);
});

test('offer team notify respects settings.offers and sends mail', async () => {
  const prev = {
    settings: {company: 'Acme', offers: true, digest: true, interview: true, timezone: 'UTC'},
    team: [{id: 't1', name: 'Owner', email: 'owner@example.com', role: 'Owner', status: 'Active'}],
    jobs: [{id: 'j1', title: 'Driver'}],
    candidates: [{id: 'c1', name: 'Alex', email: 'a@x.com', jobId: 'j1', stage: 'Interview', archived: false}]
  };
  const next = {
    ...prev,
    candidates: [{...prev.candidates[0], stage: 'Offer'}]
  };
  const calls = [];
  const original = globalThis.fetch;
  process.env.RESEND_API_KEY = 're_test';
  try {
    globalThis.fetch = async (url, opts) => {
      calls.push({url, body: JSON.parse(opts.body)});
      return {ok: true, json: async () => ({id: 'email_1'})};
    };
    const r = await notifyTeamOfferChange(prev, next);
    assert.equal(r.sent, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.to[0], 'owner@example.com');
    assert.match(calls[0].body.subject, /Offer/);
    assert.match(calls[0].body.html, /Offer/);
  } finally {
    globalThis.fetch = original;
    delete process.env.RESEND_API_KEY;
  }
});

test('offer team notify skipped when offers toggle off', async () => {
  const prev = {
    settings: {company: 'Acme', offers: false, digest: false, interview: false, timezone: 'UTC'},
    team: [{id: 't1', name: 'Owner', email: 'owner@example.com', role: 'Owner', status: 'Active'}],
    jobs: [],
    candidates: [{id: 'c1', name: 'Alex', email: 'a@x.com', jobId: 'j1', stage: 'Interview', archived: false}]
  };
  const next = {...prev, candidates: [{...prev.candidates[0], stage: 'Offer'}], settings: {...prev.settings}};
  const r = await notifyTeamOfferChange(prev, next);
  assert.equal(r.skipped, true);
});
