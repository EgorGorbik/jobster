import {createHash, randomBytes, randomInt} from 'node:crypto';
import {getWorkspace, mutateWorkspace} from './database.mjs';
import {ValidationError, clone} from './validation.mjs';
import {normalizeJobPublicFields} from './job-public.mjs';
import {mailConfigured, sendApplyVerification} from './mail.mjs';
import {
  botUsername,
  normalizeTelegramUsername,
  telegramAppDeepLink,
  telegramConfigured,
  telegramDeepLink,
  telegramStartCommand,
  telegramWebClientLink
} from './telegram.mjs';

const TOKEN_TTL_MS = 30 * 60 * 1000;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const startAttempts = new Map();
const submitAttempts = new Map();

const iso = () => new Date().toISOString();
const hash = value => createHash('sha256').update(String(value)).digest('hex');
const freshId = () => randomBytes(16).toString('hex');
const asString = v => typeof v === 'string' ? v.trim() : '';

function rateLimit(map, key, max) {
  const now = Date.now();
  if (map.size > 8000) for (const [k, v] of map) if (now - v.since > RATE_WINDOW_MS) map.delete(k);
  const row = map.get(key);
  if (row && now - row.since < RATE_WINDOW_MS && row.count >= max) {
    throw new ValidationError('Too many attempts. Try again later.', 429);
  }
  map.set(key, row && now - row.since < RATE_WINDOW_MS ? {...row, count: row.count + 1} : {since: now, count: 1});
}

export function findPublicJob(db, slug) {
  const clean = asString(slug).toLowerCase();
  if (!/^[a-z0-9-]{6,40}$/.test(clean)) return null;
  for (const ws of db.prepare('SELECT id FROM workspaces').all()) {
    const {state} = getWorkspace(db, ws.id);
    const job = state.jobs.find(j => String(j.publicSlug || '').toLowerCase() === clean);
    if (!job) continue;
    normalizeJobPublicFields(job);
    if (job.status !== 'Active' || job.publicEnabled === false) {
      return {closed: true, workspaceId: ws.id, job, settings: state.settings};
    }
    return {closed: false, workspaceId: ws.id, job, settings: state.settings, state};
  }
  return null;
}

function publicJobPayload(found) {
  const {job, settings, closed} = found;
  return {
    closed,
    company: settings.company,
    website: settings.website || '',
    job: {
      title: job.title,
      department: job.department,
      location: job.location,
      pay: job.pay,
      description: job.description,
      openings: job.openings,
      landingLayout: job.landingLayout || 'classic',
      slug: job.publicSlug
    }
  };
}

function json(res, status, value) {
  res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'});
  res.end(JSON.stringify(value));
}

async function readJSON(req) {
  const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') throw new ValidationError('Content-Type must be application/json', 415);
  let length = 0;
  const chunks = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 256 * 1024) throw new ValidationError('Request body is too large', 413);
    chunks.push(chunk);
  }
  if (!length) throw new ValidationError('JSON body is required', 400);
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new ValidationError('Invalid JSON', 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('JSON object required', 400);
  return body;
}

function assertSameOrigin(req, options) {
  const origin = req.headers.origin;
  if (req.headers['sec-fetch-site'] === 'cross-site') throw new ValidationError('Cross-site request rejected', 403);
  if (origin) {
    let declared = options.allowedOrigin;
    if (!declared) declared = `${options.cookieSecure ? 'https' : 'http'}://${req.headers.host}`;
    if (origin !== declared) throw new ValidationError('Origin check failed', 403);
  }
}

function emailOk(email) {
  return typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !/[<>]/.test(email);
}

function purgeExpired(db) {
  db.prepare('DELETE FROM apply_tokens WHERE expires_at < ? OR (used_at IS NOT NULL AND used_at < ?)').run(iso(), new Date(Date.now() - 86400000).toISOString());
}

function createApplyChallenge(db, {workspaceId, jobId, email}) {
  purgeExpired(db);
  const rawToken = randomBytes(24).toString('base64url');
  const code = String(randomInt(100000, 999999));
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  db.prepare('DELETE FROM apply_tokens WHERE workspace_id=? AND job_id=? AND email=? AND used_at IS NULL').run(workspaceId, jobId, email.toLowerCase());
  db.prepare('INSERT INTO apply_tokens(token_hash,code_hash,workspace_id,job_id,email,expires_at,used_at,created_at) VALUES(?,?,?,?,?,?,NULL,?)')
    .run(hash(rawToken), hash(code), workspaceId, jobId, email.toLowerCase(), expiresAt, iso());
  return {rawToken, code, expiresAt};
}

function consumeChallenge(db, {workspaceId, jobId, email, code, token}) {
  purgeExpired(db);
  const row = db.prepare('SELECT * FROM apply_tokens WHERE workspace_id=? AND job_id=? AND email=? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1')
    .get(workspaceId, jobId, email.toLowerCase());
  if (!row) throw new ValidationError('Verification expired or not found. Request a new code.', 400);
  if (Date.parse(row.expires_at) < Date.now()) throw new ValidationError('Verification expired. Request a new code.', 400);
  const ok = (code && hash(String(code).trim()) === row.code_hash) || (token && hash(String(token).trim()) === row.token_hash);
  if (!ok) throw new ValidationError('Invalid verification code.', 400);
  const proof = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  db.prepare('UPDATE apply_tokens SET used_at=?, token_hash=?, expires_at=? WHERE token_hash=?')
    .run(iso(), hash(`proof:${proof}`), expiresAt, row.token_hash);
  return {proof, email: row.email, expiresAt};
}

function requireProof(db, {workspaceId, jobId, email, proof}) {
  const row = db.prepare('SELECT * FROM apply_tokens WHERE workspace_id=? AND job_id=? AND email=? AND token_hash=?')
    .get(workspaceId, jobId, email.toLowerCase(), hash(`proof:${proof}`));
  if (!row || !row.used_at) throw new ValidationError('Email is not verified for this application.', 403);
  if (Date.parse(row.expires_at) < Date.now()) {
    throw new ValidationError('Verified session expired. Verify your email again.', 403);
  }
  return row;
}

async function deliverChallenge({email, code, link, jobTitle, company}) {
  const result = await sendApplyVerification({email, code, link, jobTitle, company});
  if (!result.delivered) {
    console.log([
      `[Jobster apply] Verification for ${email}`,
      `Company: ${company}`,
      `Role: ${jobTitle}`,
      `Code: ${code}`,
      `Link: ${link}`,
      mailConfigured() ? 'SMTP send skipped/failed — see logs above.' : 'SMTP not configured; code logged for development.'
    ].join('\n'));
  }
  return result;
}

/**
 * Public apply API — no session cookie required.
 * Paths: /api/public/jobs/:slug, /api/public/jobs/:slug/start|confirm|submit
 */
export async function handlePublicApply(req, res, db, url, options = {}) {
  const method = req.method || 'GET';
  const parts = url.pathname.split('/').filter(Boolean);
  // /api/public/jobs/:slug[/(start|confirm|submit)]
  if (parts[0] !== 'api' || parts[1] !== 'public' || parts[2] !== 'jobs' || !parts[3]) {
    throw new ValidationError('Endpoint not found', 404);
  }
  const slug = parts[3];
  const action = parts[4];
  if (parts.length > 5) throw new ValidationError('Endpoint not found', 404);

  if (method === 'GET' && !action) {
    const found = findPublicJob(db, slug);
    if (!found) throw new ValidationError('Job not found', 404);
    return json(res, 200, publicJobPayload(found));
  }

  if (!['POST'].includes(method) || !['start', 'confirm', 'submit'].includes(action)) {
    throw new ValidationError('Endpoint not found', 404);
  }
  assertSameOrigin(req, options);
  const body = await readJSON(req);
  const found = findPublicJob(db, slug);
  if (!found) throw new ValidationError('Job not found', 404);
  if (found.closed) throw new ValidationError('This role is not accepting applications.', 409);

  const ip = req.socket.remoteAddress || 'unknown';
  const email = asString(body.email).toLowerCase();

  if (action === 'start') {
    if (!emailOk(email)) throw new ValidationError('Enter a valid email address.', 400);
    const allowDevBypass = process.env.JOBSTER_APPLY_DEV_LINKS === 'true';
    // Production careers page: real inbox delivery is mandatory.
    if (!mailConfigured() && !allowDevBypass) {
      throw new ValidationError(
        'Email verification is unavailable: SMTP is not configured on the server.',
        503
      );
    }
    rateLimit(startAttempts, `${ip}:${email}`, 8);
    const {rawToken, code, expiresAt} = createApplyChallenge(db, {
      workspaceId: found.workspaceId,
      jobId: found.job.id,
      email
    });
    const base = options.allowedOrigin || `${options.cookieSecure ? 'https' : 'http'}://${req.headers.host}`;
    const link = `${base}/apply/${found.job.publicSlug}?email=${encodeURIComponent(email)}&token=${encodeURIComponent(rawToken)}`;
    let delivered = false;
    if (mailConfigured()) {
      try {
        const sendResult = await deliverChallenge({
          email, code, link,
          jobTitle: found.job.title,
          company: found.settings.company
        });
        delivered = !!sendResult?.delivered;
      } catch (error) {
        console.error('[apply] email send failed:', error.message || error);
        throw new ValidationError('Could not send verification email. Check SMTP settings and try again.', 502);
      }
      if (!delivered) {
        throw new ValidationError('Could not send verification email. Check SMTP settings and try again.', 502);
      }
    } else {
      // Dev-only: log code when SMTP is absent and JOBSTER_APPLY_DEV_LINKS=true.
      console.log(`[apply:dev] code=${code} email=${email} link=${link}`);
    }
    return json(res, 200, {
      ok: true,
      expiresAt,
      delivered,
      email,
      message: delivered
        ? 'Verification email sent. Check your inbox (and spam folder).'
        : 'Verification code created (development mode).',
      ...(allowDevBypass ? {dev: {code, link}} : {})
    });
  }

  if (action === 'confirm') {
    if (!emailOk(email)) throw new ValidationError('Enter a valid email address.', 400);
    rateLimit(startAttempts, `confirm:${ip}:${email}`, 20);
    const proof = consumeChallenge(db, {
      workspaceId: found.workspaceId,
      jobId: found.job.id,
      email,
      code: body.code,
      token: body.token
    });
    return json(res, 200, {ok: true, proof: proof.proof, email: proof.email, expiresAt: proof.expiresAt});
  }

  if (action === 'submit') {
    if (!emailOk(email)) throw new ValidationError('Enter a valid email address.', 400);
    rateLimit(submitAttempts, `${ip}:${email}`, 10);
    const proof = asString(body.proof);
    if (!proof) throw new ValidationError('Email verification is required.', 403);
    requireProof(db, {workspaceId: found.workspaceId, jobId: found.job.id, email, proof});

    const name = asString(body.name);
    const phone = asString(body.phone);
    const location = asString(body.location);
    const experience = asString(body.experience);
    const notes = asString(body.notes);
    let telegram = '';
    try {
      telegram = normalizeTelegramUsername(body.telegram);
    } catch (err) {
      if (err instanceof ValidationError) throw err;
      throw err;
    }
    if (!name || name.length > 100) throw new ValidationError('Full name is required (max 100 characters).', 400);
    if (!location || location.length > 100) throw new ValidationError('Location is required (max 100 characters).', 400);
    if (phone.length > 40) throw new ValidationError('Phone is too long.', 400);
    if (experience.length > 100) throw new ValidationError('Experience is too long.', 400);
    if (notes.length > 4000) throw new ValidationError('Notes are too long.', 400);

    const now = iso();
    const result = mutateWorkspace(db, found.workspaceId, undefined, null, 'candidate.apply', state => {
      const existing = state.candidates.find(c => c.email.toLowerCase() === email && c.jobId === found.job.id);
      if (existing) throw new ValidationError('You already applied to this role with this email.', 409);
      const id = freshId();
      const applicationNote = [
        notes,
        experience ? `Experience: ${experience}` : '',
        telegram ? `Telegram: @${telegram}` : '',
        'Submitted via public career page after email verification.'
      ].filter(Boolean).join('\n');
      const candidate = {
        id,
        name,
        email,
        phone,
        telegram,
        telegramChatId: '',
        telegramLinkedAt: '',
        location,
        jobId: found.job.id,
        source: 'Career site',
        rating: null,
        stage: 'New',
        experience,
        owner: found.job.owner || found.settings.company,
        tags: ['career-page'],
        notes: applicationNote,
        favorite: false,
        archived: false,
        color: '#deebe6',
        createdAt: now,
        updatedAt: now,
        history: [{
          id: freshId(),
          type: 'created',
          text: 'Applied via career page (email verified)',
          stage: 'New',
          at: now
        }]
      };
      state.candidates.unshift(candidate);
      state.activity.unshift({
        id: freshId(),
        text: `${name} applied to ${found.job.title} via career page`,
        at: now,
        read: false
      });
      state.activity = state.activity.slice(0, 200);
      return clone(candidate);
    });

    db.prepare('DELETE FROM apply_tokens WHERE workspace_id=? AND job_id=? AND email=?').run(found.workspaceId, found.job.id, email);
    const id = result.data.id;
    return json(res, 201, {
      ok: true,
      candidateId: id,
      stage: 'New',
      message: 'Application received. You are in the New stage of the hiring pipeline.',
      telegramConfigured: telegramConfigured(),
      telegramDeepLink: telegramDeepLink(id),
      telegramAppLink: telegramAppDeepLink(id),
      telegramWebLink: telegramWebClientLink(id),
      telegramStartCommand: telegramStartCommand(id),
      telegramBot: telegramConfigured() ? botUsername() : null
    });
  }
}
