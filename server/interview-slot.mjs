/**
 * Ensure a candidate in Interview has a Scheduled calendar appointment.
 */
import {randomUUID} from 'node:crypto';

export function defaultInterviewStart(when) {
  if (when && Number.isFinite(Date.parse(when))) return new Date(when).toISOString();
  const base = new Date();
  base.setDate(base.getDate() + 1);
  base.setHours(11, 0, 0, 0);
  if (base.getTime() <= Date.now()) base.setDate(base.getDate() + 1);
  return base.toISOString();
}

/**
 * @returns {object|null} created interview record, or null if one already exists
 */
export function ensureScheduledInterview(state, candidate, {
  title = 'Recruiter interview',
  startsAt,
  duration = 30,
  format = 'Video',
  location = 'Video call',
  notes = 'Scheduled when moved to Interview'
} = {}) {
  if (!candidate?.id) return null;
  const existing = (state.interviews || []).find(
    i => i.candidateId === candidate.id && i.status === 'Scheduled'
  );
  if (existing) return null;
  const record = {
    id: randomUUID(),
    candidateId: candidate.id,
    title: String(title).slice(0, 150),
    startsAt: defaultInterviewStart(startsAt),
    duration: Number.isInteger(duration) ? duration : 30,
    format: ['Video', 'Phone', 'On-site'].includes(format) ? format : 'Video',
    location: String(location || 'Video call').slice(0, 500),
    interviewer: String(state.settings?.company || 'Recruiter').slice(0, 120),
    status: 'Scheduled',
    notes: String(notes || '').slice(0, 4000),
    createdAt: new Date().toISOString()
  };
  state.interviews.push(record);
  return record;
}

/** Move candidate to Interview if not already past that stage. */
export function promoteToInterview(candidate) {
  if (!candidate) return false;
  if (['Interview', 'Offer', 'Hired'].includes(candidate.stage)) return false;
  candidate.stage = 'Interview';
  return true;
}
