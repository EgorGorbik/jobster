import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {clone, validateWorkspace, ValidationError} from './validation.mjs';
import {normalizeJobPublicFields} from './job-public.mjs';
import {notifyStageChanges} from './mail.mjs';
import {buildDefaultSeed} from './seed-jobs.mjs';

const KINDS = ['jobs', 'candidates', 'interviews', 'campaigns', 'messages', 'team', 'activity'];
const defaults = (company = 'Falcon Jobster', member = {name:'Workspace owner', email:''}) => {
  const now = new Date().toISOString();
  const {jobs, candidates} = buildDefaultSeed({company, owner: member.name});
  return {
    version: 1,
    jobs,
    candidates,
    interviews: [],
    campaigns: [],
    messages: [],
    team: [{id: randomUUID(), name: member.name, email: member.email, role: 'Owner', status: 'Active'}],
    activity: [{
      id: randomUUID(),
      text: 'Workspace initialized with default jobs and sample candidates',
      at: now,
      read: false
    }],
    settings: {company, website: '', timezone: 'America/New_York', logo: '', digest: true, interview: true, offers: true}
  };
};
export {defaults as emptyWorkspace};

export function createDatabase(filename) {
  if (filename !== ':memory:') {
    fs.mkdirSync(path.dirname(filename), {recursive:true, mode:0o700});
    if (!fs.existsSync(filename)) fs.closeSync(fs.openSync(filename, 'wx', 0o600));
    fs.chmodSync(filename, 0o600);
  }
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  if (filename !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, settings_json TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL,
      salt TEXT NOT NULL, password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('Owner','Admin','Recruiter','Viewer')),
      disabled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL, expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS sessions_exp_idx ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS records (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      kind TEXT NOT NULL, id TEXT NOT NULL, data_json TEXT NOT NULL,
      PRIMARY KEY(workspace_id,kind,id)
    );
    CREATE INDEX IF NOT EXISTS records_kind_idx ON records(workspace_id,kind);
    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL, details TEXT NOT NULL, at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS audit_ws_idx ON audit_events(workspace_id,id DESC);
  `);
  const schemaVersion = db.prepare('PRAGMA user_version').get().user_version;
  if (schemaVersion > 1) throw new Error('Database schema is newer than this server.');
  if (schemaVersion === 0) db.exec('PRAGMA user_version = 1;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS apply_tokens (
      token_hash TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL,
      email TEXT NOT NULL COLLATE NOCASE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS apply_tokens_job_idx ON apply_tokens(workspace_id, job_id, email);
    CREATE INDEX IF NOT EXISTS apply_tokens_exp_idx ON apply_tokens(expires_at);
  `);
  const userColumns = db.prepare('PRAGMA table_info(users)').all();
  if (!userColumns.some(column => column.name === 'phone')) {
    db.exec(`ALTER TABLE users ADD COLUMN phone TEXT NOT NULL DEFAULT ''`);
  }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique ON users(phone) WHERE phone <> '';
    CREATE TABLE IF NOT EXISTS login_challenges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL,
      channel TEXT NOT NULL CHECK(channel IN ('email','sms')),
      destination TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      sends INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      sent_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS login_challenges_user_idx ON login_challenges(user_id);
    CREATE INDEX IF NOT EXISTS login_challenges_exp_idx ON login_challenges(expires_at);
  `);
  return db;
}
export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const value = fn(); db.exec('COMMIT'); return value; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function getWorkspace(db, workspaceId) {
  const ws = db.prepare('SELECT * FROM workspaces WHERE id=?').get(workspaceId);
  if (!ws) throw new ValidationError('Workspace not found', 404);
  const state = {version:1, settings:JSON.parse(ws.settings_json)};
  for (const kind of KINDS) state[kind] = [];
  for (const row of db.prepare('SELECT kind,data_json FROM records WHERE workspace_id=? ORDER BY rowid').all(workspaceId)) {
    if (state[row.kind]) state[row.kind].push(JSON.parse(row.data_json));
  }
  return {revision:ws.revision, state};
}
function replace(db, workspaceId, state) {
  db.prepare('UPDATE workspaces SET name=?,settings_json=?,updated_at=? WHERE id=?')
    .run(state.settings.company, JSON.stringify(state.settings), new Date().toISOString(), workspaceId);
  const del = db.prepare('DELETE FROM records WHERE workspace_id=?');
  const add = db.prepare('INSERT INTO records(workspace_id,kind,id,data_json) VALUES(?,?,?,?)');
  del.run(workspaceId);
  for (const kind of KINDS) for (const r of state[kind]) add.run(workspaceId,kind,r.id,JSON.stringify(r));
}
export function createWorkspace(db, {company, name, email, salt, passwordHash}) {
  const id = randomUUID(), userId = randomUUID(), now = new Date().toISOString();
  const state = defaults(company, {name, email});
  validateWorkspace(state);
  return transaction(db, () => {
    db.prepare('INSERT INTO workspaces(id,name,settings_json,revision,created_at,updated_at) VALUES(?,?,?,?,?,?)')
      .run(id,company,JSON.stringify(state.settings),1,now,now);
    db.prepare('INSERT INTO users(id,workspace_id,email,name,salt,password_hash,role,created_at) VALUES(?,?,?,?,?,?,?,?)')
      .run(userId,id,email.toLowerCase(),name,salt,passwordHash,'Owner',now);
    replace(db, id, state);
    return {workspaceId:id, userId, revision:1};
  });
}
export function saveWorkspace(db, workspaceId, inputState, expectedRevision, actorId, action = 'workspace.replace') {
  const state = clone(inputState);
  if (Array.isArray(state.jobs)) state.jobs.forEach(normalizeJobPublicFields);
  validateWorkspace(state);
  let previousState = null;
  const saved = transaction(db, () => {
    const row = db.prepare('SELECT revision FROM workspaces WHERE id=?').get(workspaceId);
    if (!row) throw new ValidationError('Workspace not found', 404);
    if (expectedRevision !== undefined && expectedRevision !== row.revision) {
      throw new ValidationError('Workspace revision conflict. Reload before retrying.', 409);
    }
    previousState = getWorkspace(db, workspaceId).state;
    replace(db, workspaceId, state);
    const revision = row.revision + 1;
    db.prepare('UPDATE workspaces SET revision=? WHERE id=?').run(revision, workspaceId);
    db.prepare('INSERT INTO audit_events(workspace_id,actor_id,action,details,at) VALUES(?,?,?,?,?)')
      .run(workspaceId,actorId,action,JSON.stringify({revision}),new Date().toISOString());
    return {revision, state};
  });
  notifyStageChanges(previousState, saved.state, {db, workspaceId});
  return saved;
}
export function mutateWorkspace(db, workspaceId, expectedRevision, actorId, action, fn) {
  const snapshot = getWorkspace(db, workspaceId);
  if (expectedRevision !== undefined && snapshot.revision !== expectedRevision) throw new ValidationError('Workspace revision conflict. Reload before retrying.', 409);
  const state = clone(snapshot.state);
  const value = fn(state);
  const saved = saveWorkspace(db,workspaceId,state,snapshot.revision,actorId,action);
  return {revision:saved.revision, data:value};
}
export function listAudit(db, workspaceId, limit = 50) {
  return db.prepare('SELECT id,action,at,actor_id AS actorId,details FROM audit_events WHERE workspace_id=? ORDER BY id DESC LIMIT ?')
    .all(workspaceId, Math.min(200,Math.max(1,limit))).map(x=>({...x,details:JSON.parse(x.details)}));
}
