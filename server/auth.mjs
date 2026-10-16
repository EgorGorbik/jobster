import {randomBytes,createHash,randomUUID,randomInt,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {createWorkspace} from './database.mjs';
import {ValidationError} from './validation.mjs';
import {mailConfigured, sendLoginCode} from './mail.mjs';
import {normalizePhone, sendSms, smsConfigured} from './sms.mjs';
const scrypt = promisify(scryptCallback);
const DAYS = 7;
export const tokenHash = value => createHash('sha256').update(value).digest('hex');
export async function createPassword(password) {
  if (typeof password !== 'string' || password.length < 1 || password.length > 256) {
    throw new ValidationError('Password is required (1-256 characters)');
  }
  const salt = randomBytes(24).toString('hex');
  const digest = (await scrypt(password,salt,64)).toString('hex');
  return {salt,passwordHash:digest};
}
async function verifyPassword(password,salt,expectedHash) {
  const actual = await scrypt(String(password||''),salt,64);
  const expected = Buffer.from(expectedHash,'hex');
  return expected.length === actual.length && timingSafeEqual(actual,expected);
}
export async function bootstrap(db,{company,name,email,password}) {
  if (db.prepare('SELECT count(*) AS n FROM workspaces').get().n !== 0) throw new ValidationError('Workspace already exists. Use the admin API to add users.',409);
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new ValidationError('Invalid admin email');
  if (typeof company !== 'string' || !company.trim() || company.length>80) throw new ValidationError('Invalid company name');
  const userName=String(name||email.split('@')[0]);
  if (!userName.trim() || userName.length > 200) throw new ValidationError('Invalid admin name');
  const {salt,passwordHash}=await createPassword(password);
  return createWorkspace(db,{company,name:userName,email:email.toLowerCase(),salt,passwordHash});
}
function storedPhone(phone) {
  if (phone === undefined || phone === null || phone === '') return '';
  const normalized = normalizePhone(phone);
  if (!normalized) throw new ValidationError('Enter a phone number in international format, for example +375291112233.', 400);
  return normalized;
}
export async function addUser(db,workspaceId,{email,name,password,role,phone}) {
  if (!['Admin','Recruiter','Viewer'].includes(role)) throw new ValidationError('User role must be Admin, Recruiter, or Viewer');
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254) throw new ValidationError('Invalid email');
  if (typeof name !== 'string' || !name.trim() || name.length>200) throw new ValidationError('Invalid name');
  const normalizedPhone = storedPhone(phone);
  const {salt,passwordHash}=await createPassword(password);
  const user={id:randomUUID(),workspaceId,email:email.trim().toLowerCase(),name:name.trim(),role,phone:normalizedPhone};
  try {db.prepare('INSERT INTO users(id,workspace_id,email,name,salt,password_hash,role,phone,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(user.id,workspaceId,user.email,user.name,salt,passwordHash,role,normalizedPhone,new Date().toISOString());}
  catch(e) {
    const message = String(e.message);
    if (message.includes('users.phone') || message.includes('users_phone_unique')) throw new ValidationError('This phone number is already used by another account.', 409);
    if (message.includes('UNIQUE')) throw new ValidationError('Email is already registered', 409);
    throw e;
  }
  return user;
}
export function setUserPhone(db, userId, phone) {
  const normalized = storedPhone(phone);
  const user = db.prepare('SELECT * FROM users WHERE id=? AND disabled=0').get(userId);
  if (!user) throw new ValidationError('Authentication required', 401);
  try { db.prepare('UPDATE users SET phone=? WHERE id=?').run(normalized, userId); }
  catch (e) {
    if (String(e.message).includes('UNIQUE') || String(e.message).includes('users_phone_unique')) {
      throw new ValidationError('This phone number is already used by another account.', 409);
    }
    throw e;
  }
  user.phone = normalized;
  return publicUser(user);
}
const attempts = new Map();
function bruteForceKey(ip,email) { return `${ip}|${String(email).toLowerCase().trim()}`; }
function checkRate(ip,email) {
  const now=Date.now(); const key=bruteForceKey(ip,email);
  if (attempts.size>5000) for (const [k,v] of attempts) if (now-v.since>900000) attempts.delete(k);
  const value=attempts.get(key);
  if (value && now-value.since<900000 && value.count>=8) throw new ValidationError('Too many sign-in attempts. Try again later.',429);
  return key;
}
function unsuccessful(key) {
  const now=Date.now(); const v=attempts.get(key);
  attempts.set(key,v && now-v.since<900000 ? {...v,count:v.count+1} : {since:now,count:1});
}
const CODE_TTL_MS = 10 * 60 * 1000;
const sendWindow = new Map();
function hashesEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}
function maskEmail(email) {
  const [name, host] = String(email).split('@');
  return `${(name || '').slice(0, 1)}***@${host || ''}`;
}
function maskPhone(phone) {
  const value = String(phone || '');
  if (value.length < 6) return '***';
  return `${value.slice(0, 4)}***${value.slice(-2)}`;
}
function deliveryChannels() {
  const channels = [];
  if (mailConfigured()) channels.push('email');
  if (smsConfigured()) channels.push('sms');
  return channels;
}
function checkSendRate(userId) {
  const now = Date.now();
  if (sendWindow.size > 5000) for (const [k, v] of sendWindow) if (now - v.since > 900000) sendWindow.delete(k);
  const row = sendWindow.get(userId);
  if (row && now - row.since < 900000 && row.count >= 5) throw new ValidationError('Too many sign-in codes. Try again later.', 429);
  sendWindow.set(userId, row && now - row.since < 900000 ? {...row, count: row.count + 1} : {since: now, count: 1});
}
function createSession(db, user) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + DAYS * 86400000).toISOString();
  db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)')
    .run(tokenHash(token), user.id, new Date().toISOString(), expiresAt);
  return {token, expiresAt, user: publicUser(user)};
}
function companyName(db, user) {
  return db.prepare('SELECT name FROM workspaces WHERE id=?').get(user.workspace_id)?.name || 'Falcon Jobster';
}
async function deliverCode({channel, destination, code, company}) {
  if (channel === 'sms') {
    return sendSms({
      to: destination,
      body: `${company}: код входа ${code}. 10 мин. Никому не сообщайте. Sign-in code ${code}.`
    });
  }
  return sendLoginCode({email: destination, code, company});
}
function challengePayload(row) {
  return {
    mfa: true,
    challenge: row.id,
    channel: row.channel,
    destination: row.channel === 'sms' ? maskPhone(row.destination) : maskEmail(row.destination),
    expiresAt: row.expires_at
  };
}
async function issueChallenge(db, user, channel, destination) {
  checkSendRate(user.id);
  const code = String(randomInt(0, 1000000)).padStart(6, '0');
  const id = randomBytes(32).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS).toISOString();
  const iso = now.toISOString();
  db.prepare('DELETE FROM login_challenges WHERE user_id=? OR expires_at < ?').run(user.id, iso);
  db.prepare(`INSERT INTO login_challenges(id,user_id,code_hash,channel,destination,attempts,sends,expires_at,created_at,sent_at)
    VALUES(?,?,?,?,?,0,1,?,?,?)`).run(id, user.id, tokenHash(code), channel, destination, expiresAt, iso, iso);
  let sent;
  try { sent = await deliverCode({channel, destination, code, company: companyName(db, user)}); }
  catch (error) {
    db.prepare('DELETE FROM login_challenges WHERE id=?').run(id);
    console.error('[login] code delivery failed:', error?.message || error);
    sent = {delivered: false};
  }
  if (!sent?.delivered) {
    db.prepare('DELETE FROM login_challenges WHERE id=?').run(id);
    throw new ValidationError(
      channel === 'sms'
        ? 'Could not send the SMS code. Check Twilio settings and try again.'
        : 'Could not send the email code. Check Resend settings and try again.',
      502
    );
  }
  return challengePayload({id, channel, destination, expires_at: expiresAt});
}
export async function login(db, emailOrBody, passwordOrIp, ipMaybe = 'unknown') {
  const body = emailOrBody && typeof emailOrBody === 'object'
    ? emailOrBody
    : {email: emailOrBody, password: passwordOrIp};
  const ip = emailOrBody && typeof emailOrBody === 'object' ? (passwordOrIp || 'unknown') : ipMaybe;
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const phone = normalizePhone(typeof body.phone === 'string' ? body.phone : '');
  const password = typeof body.password === 'string' ? body.password : '';
  const requested = body.channel === 'sms' || body.channel === 'email' ? body.channel : '';
  if ((requested === 'sms' || (!email && body.phone)) && String(body.phone || '').trim() && !phone) {
    throw new ValidationError('Enter a phone number in international format, for example +375291112233.', 400);
  }
  const usePhone = requested === 'sms' ? true : requested === 'email' ? false : !email && !!phone;
  if (password.length > 256 || email.length > 254) throw new ValidationError('Invalid credentials', 401);
  const ident = usePhone ? (phone || phoneRaw(body.phone)) : email.toLowerCase();
  if (!ident) throw new ValidationError('Invalid credentials', 401);
  const key = checkRate(ip, ident);
  const user = usePhone
    ? (phone ? db.prepare('SELECT * FROM users WHERE phone=? AND disabled=0').get(phone) : null)
    : (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? db.prepare('SELECT * FROM users WHERE email=? COLLATE NOCASE AND disabled=0').get(email) : null);
  const dummySalt = '0'.repeat(48), dummyHash = '0'.repeat(128);
  const matches = await verifyPassword(password, user?.salt || dummySalt, user?.password_hash || dummyHash);
  if (!user || !matches) { unsuccessful(key); throw new ValidationError('Invalid credentials', 401); }
  attempts.delete(key);
  const channels = deliveryChannels();
  if (!channels.length) return createSession(db, user);
  if (usePhone && requested === 'email') throw new ValidationError('Phone sign-in sends the code by SMS.', 400);
  const channel = requested || (channels.length === 1 ? channels[0] : '');
  if (!channel) {
    return {
      mfa: true,
      channels,
      emailMasked: maskEmail(user.email),
      phoneMasked: user.phone ? maskPhone(user.phone) : ''
    };
  }
  if (!channels.includes(channel)) {
    throw new ValidationError(
      channel === 'sms'
        ? 'SMS codes are unavailable. Twilio is not configured.'
        : 'Email codes are unavailable. Resend is not configured.',
      503
    );
  }
  const destination = channel === 'sms' ? normalizePhone(user.phone) : user.email;
  if (channel === 'sms' && !destination) {
    throw new ValidationError('No phone number on this account. Sign in by email, then save a phone in Settings.', 400);
  }
  return issueChallenge(db, user, channel, destination);
}
function phoneRaw(value) {
  return String(value || '').trim().slice(0, 40) || 'invalid-phone';
}
export async function verifyLoginCode(db, challengeId, code, ip = 'unknown') {
  if (typeof challengeId !== 'string' || !/^[\w-]{20,200}$/.test(challengeId)) {
    throw new ValidationError('Invalid or expired code.', 400);
  }
  const digits = String(code ?? '').trim();
  if (!/^\d{6}$/.test(digits)) throw new ValidationError('Enter the 6-digit code.', 400);
  const key = checkRate(ip, `otp:${challengeId.slice(0, 24)}`);
  const row = db.prepare('SELECT * FROM login_challenges WHERE id=?').get(challengeId);
  const now = new Date().toISOString();
  const expired = !row || row.expires_at <= now || row.attempts >= 5;
  const ok = !expired && hashesEqual(tokenHash(digits), row.code_hash);
  if (!ok) {
    unsuccessful(key);
    if (row) {
      const attemptsLeft = row.attempts + 1;
      if (attemptsLeft >= 5 || row.expires_at <= now) db.prepare('DELETE FROM login_challenges WHERE id=?').run(row.id);
      else db.prepare('UPDATE login_challenges SET attempts=? WHERE id=?').run(attemptsLeft, row.id);
    }
    throw new ValidationError(row && row.expires_at <= now ? 'Code expired. Request a new one.' : 'Invalid code.', 400);
  }
  attempts.delete(key);
  const user = db.prepare('SELECT * FROM users WHERE id=? AND disabled=0').get(row.user_id);
  db.prepare('DELETE FROM login_challenges WHERE user_id=?').run(row.user_id);
  if (!user) throw new ValidationError('Invalid or expired code.', 400);
  return createSession(db, user);
}
export async function resendLoginCode(db, challengeId) {
  if (typeof challengeId !== 'string' || !/^[\w-]{20,200}$/.test(challengeId)) {
    throw new ValidationError('Invalid or expired code.', 400);
  }
  const row = db.prepare('SELECT * FROM login_challenges WHERE id=?').get(challengeId);
  const now = new Date();
  if (!row || row.expires_at <= now.toISOString()) throw new ValidationError('Code expired. Request a new one.', 400);
  if (now.getTime() - Date.parse(row.sent_at) < 30000) throw new ValidationError('Wait a moment before requesting another code.', 429);
  if (row.sends >= 5) throw new ValidationError('Too many sign-in codes. Try again later.', 429);
  const user = db.prepare('SELECT * FROM users WHERE id=? AND disabled=0').get(row.user_id);
  if (!user) throw new ValidationError('Invalid or expired code.', 400);
  checkSendRate(user.id);
  const code = String(randomInt(0, 1000000)).padStart(6, '0');
  let sent;
  try { sent = await deliverCode({channel: row.channel, destination: row.destination, code, company: companyName(db, user)}); }
  catch (error) {
    console.error('[login] code delivery failed:', error?.message || error);
    sent = {delivered: false};
  }
  if (!sent?.delivered) {
    throw new ValidationError(
      row.channel === 'sms'
        ? 'Could not send the SMS code. Check Twilio settings and try again.'
        : 'Could not send the email code. Check Resend settings and try again.',
      502
    );
  }
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS).toISOString();
  const iso = now.toISOString();
  db.prepare('UPDATE login_challenges SET code_hash=?, attempts=0, sends=sends+1, expires_at=?, sent_at=? WHERE id=?')
    .run(tokenHash(code), expiresAt, iso, row.id);
  return challengePayload({...row, expires_at: expiresAt});
}
export function publicUser(user) {
  return {id:user.id,email:user.email,name:user.name,role:user.role,phone:user.phone||'',workspaceId:user.workspace_id||user.workspaceId};
}
export function parseSessionCookie(cookieHeader) {
  if (typeof cookieHeader !== 'string') return null;
  const entry=cookieHeader.split(';').map(x=>x.trim()).find(x=>x.startsWith('jobster_session='));
  if (!entry) return null;
  const value=entry.slice('jobster_session='.length);
  return /^[\w-]{35,100}$/.test(value) ? value : null;
}
export function sessionUser(db,cookieHeader) {
  const token=parseSessionCookie(cookieHeader);
  if (!token) return null;
  const now=new Date().toISOString();
  const user=db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>? AND u.disabled=0`).get(tokenHash(token),now);
  return user ? publicUser(user) : null;
}
export function logout(db,cookieHeader) {
  const token=parseSessionCookie(cookieHeader);
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(token));
}
export async function changePassword(db,userId,currentPassword,newPassword) {
  const user=db.prepare('SELECT * FROM users WHERE id=?').get(userId);
  if (!user || !await verifyPassword(currentPassword,user.salt,user.password_hash)) throw new ValidationError('Current password is incorrect',403);
  const {salt,passwordHash}=await createPassword(newPassword);
  db.prepare('UPDATE users SET salt=?, password_hash=? WHERE id=?').run(salt,passwordHash,userId);
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
}
export function cookieHeader(token,secure=false) {
  return `jobster_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${DAYS*86400}${secure?'; Secure':''}`;
}
export function clearCookieHeader(secure=false) {
  return `jobster_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure?'; Secure':''}`;
}
