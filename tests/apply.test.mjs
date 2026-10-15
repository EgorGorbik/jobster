import {test, after, before} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {createDatabase} from '../server/database.mjs';
import {bootstrap} from '../server/auth.mjs';
import {makeServer} from '../server/index.mjs';

const dir = mkdtempSync(path.join(tmpdir(), 'jobster-apply-'));
const db = createDatabase(path.join(dir, 'test.sqlite'));
let server, origin, cookie = '', slug = '';
const pass = 'apply-test-password-9912';

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
  // Isolate tests from a developer machine Resend key — use inbox-bypass + exposed codes.
  delete process.env.RESEND_API_KEY;
  await bootstrap(db, {company: 'Apply Co', name: 'Owner', email: 'apply-owner@example.com', password: pass});
  server = makeServer({db, allowedOrigin: ''});
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = `http://127.0.0.1:${server.address().port}`;
  const signed = await query('POST', '/api/auth/login', {email: 'apply-owner@example.com', password: pass}, {}, '');
  cookie = signed.headers.get('set-cookie').split(';')[0];
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  db.close();
  rmSync(dir, {recursive: true, force: true});
});

test('job gets public slug and apply page HTML is served', async () => {
  const job = await query('POST', '/api/jobs', {
    title: 'Warehouse Associate',
    department: 'Ops',
    location: 'Dallas, TX',
    openings: 1,
    landingLayout: 'spotlight',
    description: 'Move freight carefully.'
  });
  assert.equal(job.status, 201);
  assert.match(job.data.data.publicSlug, /^[a-z0-9-]{6,40}$/i);
  assert.equal(job.data.data.landingLayout, 'spotlight');
  slug = job.data.data.publicSlug;
  const page = await fetch(`${origin}/apply/${slug}`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /src\/apply\.js/);
});

test('public apply flow verifies email and creates New candidate', async () => {
  const pub = await query('GET', `/api/public/jobs/${slug}`, undefined, {}, '');
  assert.equal(pub.status, 200);
  assert.equal(pub.data.job.title, 'Warehouse Associate');
  assert.equal(pub.data.closed, false);

  const start = await query('POST', `/api/public/jobs/${slug}/start`, {email: 'candidate@example.com'}, {}, '');
  assert.equal(start.status, 200);
  assert.ok(start.data.dev?.code);
  assert.match(start.data.dev.code, /^\d{6}$/);

  const confirm = await query('POST', `/api/public/jobs/${slug}/confirm`, {
    email: 'candidate@example.com',
    code: start.data.dev.code
  }, {}, '');
  assert.equal(confirm.status, 200);
  assert.ok(confirm.data.proof);

  const submit = await query('POST', `/api/public/jobs/${slug}/submit`, {
    email: 'candidate@example.com',
    proof: confirm.data.proof,
    name: 'Jamie Applicant',
    phone: '555-0100',
    location: 'Dallas, TX',
    experience: '2 years',
    notes: 'Ready to start'
  }, {}, '');
  assert.equal(submit.status, 201);
  assert.equal(submit.data.stage, 'New');

  const list = await query('GET', '/api/candidates?stage=New');
  assert.equal(list.status, 200);
  const jamie = list.data.items.find(c => c.email === 'candidate@example.com');
  assert.ok(jamie);
  assert.equal(jamie.source, 'Career site');
  assert.equal(jamie.assignmentUrl || '', '');
  assert.ok(jamie.history.some(h => /career page/i.test(h.text)));
});

test('duplicate apply and bad code rejected', async () => {
  const start = await query('POST', `/api/public/jobs/${slug}/start`, {email: 'other@example.com'}, {}, '');
  assert.equal((await query('POST', `/api/public/jobs/${slug}/confirm`, {
    email: 'other@example.com', code: '000000'
  }, {}, '')).status, 400);

  const again = await query('POST', `/api/public/jobs/${slug}/start`, {email: 'candidate@example.com'}, {}, '');
  const confirm = await query('POST', `/api/public/jobs/${slug}/confirm`, {
    email: 'candidate@example.com', code: again.data.dev.code
  }, {}, '');
  assert.equal((await query('POST', `/api/public/jobs/${slug}/submit`, {
    email: 'candidate@example.com',
    proof: confirm.data.proof,
    name: 'Jamie Again',
    location: 'Dallas, TX'
  }, {}, '')).status, 409);
});
