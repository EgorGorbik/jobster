/* Local demo data boundary. Replace this module with an authenticated API adapter. */
(function () {
  'use strict';
  const KEY = 'falcon-jobster:interactive:v1';
  const STAGES = ['New', 'Screening', 'Interview', 'Offer', 'Hired'];
  const clone = value => JSON.parse(JSON.stringify(value));
  let warning = '', persistent = true;
  function validate(data) {
    const strings = (x, keys) => keys.every(k => typeof x[k] === 'string');
    const dates = (x, keys) => keys.every(k => typeof x[k] === 'string' && !Number.isNaN(Date.parse(x[k])));
    if (!data || data.version !== 1 || !data.settings || !strings(data.settings, ['company', 'website', 'timezone', 'logo'])) return false;
    if (!['digest', 'interview', 'offers'].every(k => typeof data.settings[k] === 'boolean')) return false;
    const collections = ['candidates', 'jobs', 'campaigns', 'interviews', 'messages', 'team', 'activity'];
    if (!collections.every(k => Array.isArray(data[k]) && data[k].length <= 50000)) return false;
    if (!collections.every(k => data[k].every(x => x && typeof x.id === 'string') && new Set(data[k].map(x => x.id)).size === data[k].length)) return false;
    if (!data.jobs.every(j => strings(j, ['title', 'location', 'department', 'pay', 'owner', 'description']) && dates(j, ['createdAt']) && Number.isInteger(j.openings) && j.openings >= 1 && ['Active', 'Paused', 'Closed'].includes(j.status))) return false;
    if (!data.candidates.every(c => strings(c, ['name', 'email', 'phone', 'location', 'source', 'owner', 'experience', 'notes', 'color']) && typeof c.favorite === 'boolean' && typeof c.archived === 'boolean' && STAGES.includes(c.stage) && data.jobs.some(j => j.id === c.jobId) && Array.isArray(c.tags) && c.tags.every(t => typeof t === 'string') && Array.isArray(c.history) && c.history.every(h => h && typeof h.text === 'string' && !Number.isNaN(Date.parse(h.at))) && !Number.isNaN(Date.parse(c.createdAt)) && !Number.isNaN(Date.parse(c.updatedAt)) && (c.rating === null || (Number.isFinite(c.rating) && c.rating >= 0 && c.rating <= 100)))) return false;
    if (!data.campaigns.every(c => strings(c, ['name', 'message']) && dates(c, ['createdAt', 'updatedAt']) && ['All', 'Favorites'].includes(c.audience) && ['SMS', 'Email'].includes(c.channel) && ['Draft', 'Ready', 'Running', 'Paused', 'Completed'].includes(c.status) && (c.jobId === 'All' || data.jobs.some(j => j.id === c.jobId)) && (c.stage === 'All' || STAGES.includes(c.stage)))) return false;
    if (!data.interviews.every(i => strings(i, ['title', 'format', 'location', 'interviewer', 'notes']) && dates(i, ['createdAt']) && ['Video', 'Phone', 'On-site'].includes(i.format) && data.candidates.some(c => c.id === i.candidateId) && !Number.isNaN(Date.parse(i.startsAt)) && Number.isInteger(i.duration) && i.duration >= 15 && i.duration <= 240 && ['Scheduled', 'Completed', 'Cancelled'].includes(i.status))) return false;
    if (!data.messages.every(m => strings(m, ['body', 'subject']) && dates(m, ['createdAt']) && m.status === 'Draft' && ['SMS', 'Email'].includes(m.channel) && data.candidates.some(c => c.id === m.candidateId))) return false;
    if (!data.team.length || !data.team.every(m => strings(m, ['name', 'email', 'status']) && ['Owner', 'Admin', 'Recruiter', 'Viewer'].includes(m.role))) return false;
    if (!data.activity.every(a => typeof a.text === 'string' && !Number.isNaN(Date.parse(a.at)))) return false;
    try { new Intl.DateTimeFormat('en-US', {timeZone: data.settings.timezone}).format(); } catch { return false; }
    if (data.settings.logo && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(data.settings.logo)) return false;
    return true;
  }
  function load() {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!validate(parsed)) throw new Error('Invalid saved data');
        return parsed;
      }
    } catch (error) {
      warning = error.name === 'SecurityError' ? 'Browser storage is unavailable. Changes last only for this session. Export a JSON backup to keep them.' : 'Saved demo data could not be read. Fresh sample data is shown; the unreadable stored copy has not been changed.';
      persistent = false;
    }
    return window.FalconSeed();
  }
  let state = load();
  function write() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); persistent = true; warning = ''; return true; }
    catch { persistent = false; warning = 'Browser storage is unavailable or full. Changes last only for this session. Export a backup to keep them.'; return false; }
  }
  const api = {
    KEY, STAGES,
    get state() { return state; },
    get persistent() { return persistent; },
    get warning() { return warning; },
    id() { return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2); },
    update(mutator) {
      const next = clone(state);
      mutator(next);
      if (!validate(next)) throw new Error('The requested change would produce invalid data.');
      state = next;
      return write();
    },
    log(draft, text) { draft.activity.unshift({id: api.id(), text, at: new Date().toISOString(), read: false}); draft.activity = draft.activity.slice(0, 200); },
    restore(data) { if (!validate(data)) throw new Error('This is not a valid Falcon Jobster backup.'); state = clone(data); return write(); },
    reset() { state = window.FalconSeed(); return write(); },
    reload() { state = load(); },
    validate,
    snapshot() { return clone(state); }
  };
  window.FalconStore = api;
})();
