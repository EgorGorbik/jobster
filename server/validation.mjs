// Authoritative validation for persisted Jobster workspace records.
export const RESOURCE_NAMES = Object.freeze({
  jobs: 'jobs', candidates: 'candidates', interviews: 'interviews',
  campaigns: 'campaigns', messages: 'messages', team: 'team', activity: 'activity'
});
export const STAGES = Object.freeze(['New', 'Screening', 'Interview', 'Offer', 'Hired']);
const JOB_STATUSES = ['Active', 'Paused', 'Closed'];
const CAMPAIGN_STATUSES = ['Draft', 'Ready', 'Running', 'Paused', 'Completed'];
const INTERVIEW_STATUSES = ['Scheduled', 'Completed', 'Cancelled'];
const ROLES = ['Owner', 'Admin', 'Recruiter', 'Viewer'];
const TYPES = ['SMS', 'Email'];
const IDENTIFIER = /^[A-Za-z0-9_-]{1,128}$/;
const blocked = new Set(['__proto__', 'prototype', 'constructor']);

export class ValidationError extends Error {
  constructor(message, status = 422) { super(message); this.status = status; }
}
const fail = message => { throw new ValidationError(message); };
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
export const clone = value => JSON.parse(JSON.stringify(value));
export function assertSafeJSON(value, depth = 0) {
  if (depth > 30) fail('JSON nesting is too deep');
  if (Array.isArray(value)) { if (value.length > 20000) fail('Array is too long'); value.forEach(x => assertSafeJSON(x, depth + 1)); }
  else if (isObject(value)) {
    const keys = Object.keys(value);
    if (keys.length > 500) fail('Object has too many keys');
    for (const key of keys) { if (blocked.has(key)) fail('Unsupported field'); assertSafeJSON(value[key], depth + 1); }
  } else if (!(value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)))) {
    fail('Unsupported JSON value');
  }
}
const obj = (v, title) => { if (!isObject(v)) fail(`${title} must be an object`); };
const str = (v, field, limit = 500, required = false) => {
  if (typeof v !== 'string' || v.length > limit || (required && !v.trim())) fail(`Invalid ${field}`);
};
const date = (v, field) => { str(v, field, 64, true); if (!Number.isFinite(Date.parse(v))) fail(`Invalid ${field}`); };
const oneOf = (v, values, field) => { if (!values.includes(v)) fail(`Invalid ${field}`); };
const id = (v, field = 'id') => { if (typeof v !== 'string' || !IDENTIFIER.test(v)) fail(`Invalid ${field}`); };
const boolean = (v, field) => { if (typeof v !== 'boolean') fail(`Invalid ${field}`); };
const maybeEmail = (v, field = 'email') => {
  str(v, field, 254);
  if (v && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || /[<>]/.test(v))) fail(`Invalid ${field}`);
};
const boundedArray = (value, field, maximum) => {
  if (!Array.isArray(value) || value.length > maximum) fail(`Invalid ${field}`);
};
const textArray = (value, field, count, maxLength = 120) => {
  boundedArray(value, field, count); value.forEach(v => str(v, field, maxLength));
};
const uniqueIds = (list, field) => {
  const seen = new Set();
  for (const value of list) { obj(value, field); id(value.id, `${field} id`); if (seen.has(value.id)) fail(`Duplicate ${field} id`); seen.add(value.id); }
};
const optionalStatus = (v, values, field) => { if (v !== undefined) oneOf(v, values, field); };

export function validateWorkspace(state) {
  obj(state, 'Workspace');
  assertSafeJSON(state);
  if (state.version !== 1) fail('Unsupported workspace data version');
  const collections = Object.keys(RESOURCE_NAMES);
  for (const kind of collections) { boundedArray(state[kind], kind, kind === 'activity' ? 500 : 10000); uniqueIds(state[kind], kind); }
  obj(state.settings, 'settings');
  const s = state.settings;
  str(s.company, 'company', 80, true); str(s.website, 'website', 250);
  str(s.timezone, 'timezone', 90, true); str(s.logo, 'logo', 750000);
  for (const field of ['digest', 'interview', 'offers']) boolean(s[field], field);
  try { new Intl.DateTimeFormat('en-US', {timeZone: s.timezone}); } catch { fail('Invalid timezone'); }
  if (s.website && (!/^https?:\/\//i.test(s.website) || !URL.canParse(s.website))) fail('Invalid company website');
  if (s.logo && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s.logo)) fail('Invalid logo format');

  const jobs = new Set(state.jobs.map(x => x.id));
  const people = new Set(state.candidates.map(x => x.id));
  for (const j of state.jobs) {
    str(j.title, 'job title', 200, true); str(j.department, 'department', 120);
    str(j.location, 'job location', 240); str(j.pay, 'pay', 120);
    str(j.owner, 'job owner', 120); str(j.description, 'job description', 20000);
    date(j.createdAt, 'job createdAt'); oneOf(j.status, JOB_STATUSES, 'job status');
    if (!Number.isInteger(j.openings) || j.openings < 1 || j.openings > 100000) fail('Invalid job openings');
  }
  for (const c of state.candidates) {
    id(c.jobId, 'candidate jobId'); if (!jobs.has(c.jobId)) fail('Candidate references a missing job');
    str(c.name, 'candidate name', 200, true); maybeEmail(c.email);
    str(c.phone, 'candidate phone', 120); str(c.location, 'candidate location', 240);
    str(c.source, 'candidate source', 120); str(c.owner, 'candidate owner', 120);
    str(c.experience, 'candidate experience', 120); str(c.notes, 'candidate notes', 20000);
    str(c.color, 'candidate color', 10); if (!/^#[0-9a-fA-F]{6}$/.test(c.color)) fail('Invalid candidate color');
    boolean(c.favorite, 'favorite'); boolean(c.archived, 'archived');
    oneOf(c.stage, STAGES, 'candidate stage');
    if (!(c.rating === null || (typeof c.rating === 'number' && Number.isFinite(c.rating) && c.rating >= 0 && c.rating <= 100))) fail('Invalid rating');
    textArray(c.tags, 'candidate tags', 25, 80);
    date(c.createdAt, 'candidate createdAt'); date(c.updatedAt, 'candidate updatedAt');
    boundedArray(c.history, 'candidate history', 500);
    for (const h of c.history) {
      obj(h, 'history event'); str(h.text, 'history text', 1500, true); date(h.at, 'history timestamp');
      if (h.id !== undefined) id(h.id, 'history id');
      if (h.type !== undefined) str(h.type, 'history event type', 50);
      if (h.stage !== undefined) oneOf(h.stage, STAGES, 'history stage');
    }
  }
  for (const i of state.interviews) {
    id(i.candidateId, 'interview candidateId'); if (!people.has(i.candidateId)) fail('Interview references a missing candidate');
    str(i.title, 'interview title', 200, true); str(i.location, 'interview location', 250);
    str(i.interviewer, 'interviewer', 120); str(i.notes, 'interview notes', 10000);
    oneOf(i.format, ['Video', 'Phone', 'On-site'], 'interview format');
    oneOf(i.status, INTERVIEW_STATUSES, 'interview status');
    date(i.startsAt, 'interview startsAt'); date(i.createdAt, 'interview createdAt');
    if (!Number.isInteger(i.duration) || i.duration < 15 || i.duration > 240) fail('Invalid interview duration');
  }
  for (const m of state.messages) {
    id(m.candidateId, 'draft candidateId'); if (!people.has(m.candidateId)) fail('Draft references a missing candidate');
    oneOf(m.status, ['Draft'], 'draft status'); oneOf(m.channel, TYPES, 'draft channel');
    str(m.subject, 'draft subject', 250); str(m.body, 'draft body', 20000);
    date(m.createdAt, 'draft createdAt');
  }
  for (const c of state.campaigns) {
    str(c.name, 'campaign name', 200, true); str(c.message, 'campaign message', 20000);
    oneOf(c.channel, TYPES, 'campaign channel'); oneOf(c.audience, ['All', 'Favorites'], 'campaign audience');
    oneOf(c.status, CAMPAIGN_STATUSES, 'campaign status');
    if (c.jobId !== 'All' && !jobs.has(c.jobId)) fail('Campaign references a missing job');
    if (c.stage !== 'All' && !STAGES.includes(c.stage)) fail('Invalid campaign stage');
    date(c.createdAt, 'campaign createdAt'); date(c.updatedAt, 'campaign updatedAt');
  }
  if (state.team.length < 1) fail('A workspace needs at least one team directory entry');
  for (const t of state.team) {
    str(t.name, 'team name', 200, true); maybeEmail(t.email);
    oneOf(t.role, ROLES, 'team role'); str(t.status, 'team status', 100);
  }
  for (const a of state.activity) {
    str(a.text, 'activity text', 2000, true); date(a.at, 'activity at');
    if (a.read !== undefined) boolean(a.read, 'activity read');
  }
  return true;
}

export function validateRecord(kind, record, state) {
  if (!Object.hasOwn(RESOURCE_NAMES, kind)) fail('Unknown resource');
  obj(record, kind);
  id(record.id);
  const next = clone(state);
  next[kind] = next[kind].filter(x => x.id !== record.id);
  next[kind].push(record);
  validateWorkspace(next);
  return record;
}

export const UUID = () => crypto.randomUUID();
