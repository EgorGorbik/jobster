import {randomBytes} from 'node:crypto';

const LAYOUTS = new Set(['classic', 'spotlight', 'compact']);
const slugify = () => randomBytes(5).toString('hex');

export function normalizeJobPublicFields(job) {
  if (!job || typeof job !== 'object') return job;
  if (!job.publicSlug || typeof job.publicSlug !== 'string' || !/^[a-z0-9-]{6,40}$/i.test(job.publicSlug)) {
    job.publicSlug = slugify();
  } else {
    job.publicSlug = job.publicSlug.toLowerCase();
  }
  if (!LAYOUTS.has(job.landingLayout)) job.landingLayout = 'classic';
  if (typeof job.publicEnabled !== 'boolean') job.publicEnabled = true;
  return job;
}

export {LAYOUTS as LANDING_LAYOUTS};
