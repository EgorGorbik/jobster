import {randomBytes,createHash,randomUUID,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {createWorkspace} from './database.mjs';
import {ValidationError} from './validation.mjs';
const scrypt = promisify(scryptCallback);
const DAYS = 7;
const weak = new Set(['password12345','123456789012','qwerty123456','changeme12345']);
export const tokenHash = value => createHash('sha256').update(value).digest('hex');
export async function createPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256 || weak.has(password.toLowerCase())) {
    throw new ValidationError('Password must contain 12-256 characters and must not be a common default');
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
export async function addUser(db,workspaceId,{email,name,password,role}) {
  if (!['Admin','Recruiter','Viewer'].includes(role)) throw new ValidationError('User role must be Admin, Recruiter, or Viewer');
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254) throw new ValidationError('Invalid email');
  if (typeof name !== 'string' || !name.trim() || name.length>200) throw new ValidationError('Invalid name');
  const {salt,passwordHash}=await createPassword(password);
  const user={id:randomUUID(),workspaceId,email:email.trim().toLowerCase(),name:name.trim(),role};
  try {db.prepare('INSERT INTO users(id,workspace_id,email,name,salt,password_hash,role,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(user.id,workspaceId,user.email,user.name,salt,passwordHash,role,new Date().toISOString());}
  catch(e) {if (e.message.includes('UNIQUE')) throw new ValidationError('Email is already registered',409); throw e;}
  return user;
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
export async function login(db,email,password,ip='unknown') {
  if (typeof email !== 'string' || typeof password !== 'string' || email.length>254 || password.length>256) throw new ValidationError('Invalid credentials',401);
  const key=checkRate(ip,email);
  const user=db.prepare('SELECT * FROM users WHERE email=? COLLATE NOCASE AND disabled=0').get(email.trim());
  // Spend comparable work for an unknown user to reduce account enumeration.
  const dummySalt='0'.repeat(48), dummyHash='0'.repeat(128);
  const matches=await verifyPassword(password,user?.salt||dummySalt,user?.password_hash||dummyHash);
  if (!user || !matches) {unsuccessful(key); throw new ValidationError('Invalid credentials',401);}
  attempts.delete(key);
  const token=randomBytes(32).toString('base64url');
  const expiresAt=new Date(Date.now()+DAYS*86400000).toISOString();
  db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)')
    .run(tokenHash(token),user.id,new Date().toISOString(),expiresAt);
  return {token,expiresAt,user:publicUser(user)};
}
export function publicUser(user) {return {id:user.id,email:user.email,name:user.name,role:user.role,workspaceId:user.workspace_id||user.workspaceId};}
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
