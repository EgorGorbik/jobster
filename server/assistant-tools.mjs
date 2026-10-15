/**
 * Workspace tools for the Falcon Jobster AI assistant (OpenRouter/chat mode).
 * Owner/Admin only — executed server-side against the SQLite workspace.
 */
import {randomUUID} from 'node:crypto';
import {getWorkspace, mutateWorkspace} from './database.mjs';
import {STAGES, ValidationError, validateRecord, clone} from './validation.mjs';
import {normalizeJobPublicFields} from './job-public.mjs';
import {sendInterviewInvite, withSuppressedInterviewStageNotify} from './mail.mjs';
import {sendInterviewSms} from './sms.mjs';
import {sendInterviewTelegram} from './telegram.mjs';
import {ensureScheduledInterview} from './interview-slot.mjs';

const JOB_STATUSES = ['Active', 'Paused', 'Closed'];
const INTERVIEW_FORMATS = ['Video', 'Phone', 'On-site'];
const INTERVIEW_STATUSES = ['Scheduled', 'Completed', 'Cancelled'];
const CAMPAIGN_CHANNELS = ['SMS', 'Email'];
const CAMPAIGN_STATUSES = ['Draft', 'Ready', 'Running', 'Paused', 'Completed'];
const AUDIENCES = ['All', 'Favorites'];
const TEAM_ROLES = ['Owner', 'Admin', 'Recruiter', 'Viewer'];
const LAYOUTS = ['classic', 'spotlight', 'compact'];

const iso = () => new Date().toISOString();
const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const asBool = (v, fallback = false) => typeof v === 'boolean' ? v : fallback;

function jobTitleMap(state) {
  return new Map(state.jobs.map(j => [j.id, j.title]));
}
function candidateNameMap(state) {
  return new Map(state.candidates.map(c => [c.id, c.name]));
}
function findJob(state, jobId) {
  const job = state.jobs.find(j => j.id === jobId);
  if (!job) throw new ValidationError('Job not found');
  return job;
}
function findCandidate(state, candidateId, {allowArchived = true} = {}) {
  const c = state.candidates.find(x => x.id === candidateId);
  if (!c) throw new ValidationError('Candidate not found');
  if (!allowArchived && c.archived) throw new ValidationError('Candidate is archived');
  return c;
}
function pushActivity(state, text) {
  state.activity.unshift({id: randomUUID(), text: String(text).slice(0, 1000), at: iso(), read: false});
  state.activity = state.activity.slice(0, 200);
}
function pushHistory(candidate, type, text, stage) {
  candidate.updatedAt = iso();
  candidate.history.push({id: randomUUID(), type, text, at: candidate.updatedAt, ...(stage ? {stage} : {})});
  if (candidate.history.length > 500) candidate.history.splice(0, candidate.history.length - 500);
}
function changed(payload) {
  return {...payload, workspaceChanged: true};
}
function ok(payload) {
  return {ok: true, workspaceChanged: false, ...payload};
}

const APP_GUIDE = {
  views: [
    {route: '#/overview', name: 'Overview', purpose: 'Hiring metrics, sources, upcoming interviews, activity feed'},
    {route: '#/pipeline', name: 'Pipeline', purpose: 'Kanban board by stage: New → Screening → Interview → Offer → Hired. Drag cards or ask the assistant to move people.'},
    {route: '#/candidates', name: 'Candidates', purpose: 'Searchable table of all applicants, filters, CSV export, archive'},
    {route: '#/jobs', name: 'Jobs', purpose: 'Open roles, openings, career-page link (/apply/:slug), layouts classic/spotlight/compact'},
    {route: '#/calendar', name: 'Calendar', purpose: 'Local interview appointments and .ics export (no live invites sent)'},
    {route: '#/campaigns', name: 'Campaigns', purpose: 'Audience segments; Send blasts via Resend/Twilio (POST /api/campaigns/:id/send)'},
    {route: '#/reports', name: 'Reports', purpose: 'Funnel, source and location hiring stats'},
    {route: '#/settings', name: 'Settings', purpose: 'Company prefs, team directory, import/export, password'}
  ],
  stages: [...STAGES],
  notes: [
    'AI assistant can read/write workspace data via tools (Owner/Admin).',
    'Outbound email/SMS/calendar invites are never sent by this MVP.',
    'Public apply pages live at /apply/:slug after a job is saved with publicEnabled=true and status=Active.'
  ]
};

export const ASSISTANT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_app_guide',
      description: 'Explain where features live in the Falcon Jobster UI (routes, pipeline stages, limitations). Use when the user asks "where is X" or how to navigate.',
      parameters: {type: 'object', properties: {}, additionalProperties: false}
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_workspace_overview',
      description: 'Return company settings plus aggregate hiring counts (pipeline, jobs, interviews, campaigns).',
      parameters: {type: 'object', properties: {}, additionalProperties: false}
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_hiring_report',
      description: 'Compute hiring statistics: stage funnel, sources, locations, active vs archived, interview statuses.',
      parameters: {
        type: 'object',
        properties: {
          days: {type: 'integer', minimum: 1, maximum: 3650, description: 'Optional cohort window by candidate createdAt (omit for all time)'}
        },
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_workspace',
      description: 'Full-text search across candidates, jobs, campaigns, interviews, team directory.',
      parameters: {
        type: 'object',
        properties: {
          query: {type: 'string', minLength: 1, maxLength: 120}
        },
        required: ['query'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_candidates',
      description: 'List candidates with optional filters. For interview invites, prefer stage=Screening (then Interview). Do not default to New.',
      parameters: {
        type: 'object',
        properties: {
          stage: {type: 'string', enum: [...STAGES]},
          jobId: {type: 'string'},
          jobTitleContains: {type: 'string'},
          source: {type: 'string'},
          archived: {type: 'boolean'},
          favorite: {type: 'boolean'},
          nameContains: {type: 'string'},
          limit: {type: 'integer', minimum: 1, maximum: 200}
        },
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_candidate',
      description: 'Get one candidate profile including notes, tags, and recent history.',
      parameters: {
        type: 'object',
        properties: {candidateId: {type: 'string'}},
        required: ['candidateId'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_candidate',
      description: 'Create a candidate linked to a job. Defaults to stage New.',
      parameters: {
        type: 'object',
        properties: {
          name: {type: 'string'},
          email: {type: 'string'},
          jobId: {type: 'string'},
          location: {type: 'string'},
          phone: {type: 'string'},
          source: {type: 'string'},
          stage: {type: 'string', enum: [...STAGES]},
          experience: {type: 'string'},
          owner: {type: 'string'},
          notes: {type: 'string'},
          tags: {type: 'array', items: {type: 'string'}},
          rating: {type: ['number', 'null']}
        },
        required: ['name', 'email', 'jobId', 'location'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_candidate',
      description: 'Patch candidate fields (name, email, job, notes, favorite, etc). Use move_candidates to change stage.',
      parameters: {
        type: 'object',
        properties: {
          candidateId: {type: 'string'},
          name: {type: 'string'},
          email: {type: 'string'},
          jobId: {type: 'string'},
          location: {type: 'string'},
          phone: {type: 'string'},
          source: {type: 'string'},
          experience: {type: 'string'},
          owner: {type: 'string'},
          notes: {type: 'string'},
          tags: {type: 'array', items: {type: 'string'}},
          rating: {type: ['number', 'null']},
          favorite: {type: 'boolean'}
        },
        required: ['candidateId'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'move_candidates',
      description: 'Move candidates between pipeline stages (bulk or filtered).',
      parameters: {
        type: 'object',
        properties: {
          fromStage: {type: 'string', enum: [...STAGES]},
          toStage: {type: 'string', enum: [...STAGES]},
          candidateIds: {type: 'array', items: {type: 'string'}},
          nameContains: {type: 'string'},
          limit: {type: 'integer', minimum: 1, maximum: 200}
        },
        required: ['toStage'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'archive_candidate',
      description: 'Archive or restore a candidate.',
      parameters: {
        type: 'object',
        properties: {
          candidateId: {type: 'string'},
          archived: {type: 'boolean'}
        },
        required: ['candidateId', 'archived'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_jobs',
      description: 'List jobs / open roles.',
      parameters: {
        type: 'object',
        properties: {
          status: {type: 'string', enum: JOB_STATUSES},
          titleContains: {type: 'string'}
        },
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_job',
      description: 'Create a job/role. Generates a public career slug automatically.',
      parameters: {
        type: 'object',
        properties: {
          title: {type: 'string'},
          department: {type: 'string'},
          location: {type: 'string'},
          openings: {type: 'integer', minimum: 1, maximum: 10000},
          pay: {type: 'string'},
          owner: {type: 'string'},
          description: {type: 'string'},
          status: {type: 'string', enum: JOB_STATUSES},
          landingLayout: {type: 'string', enum: LAYOUTS},
          publicEnabled: {type: 'boolean'}
        },
        required: ['title', 'department', 'location'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_job',
      description: 'Update an existing job, including public career page settings.',
      parameters: {
        type: 'object',
        properties: {
          jobId: {type: 'string'},
          title: {type: 'string'},
          department: {type: 'string'},
          location: {type: 'string'},
          openings: {type: 'integer', minimum: 1, maximum: 10000},
          pay: {type: 'string'},
          owner: {type: 'string'},
          description: {type: 'string'},
          status: {type: 'string', enum: JOB_STATUSES},
          landingLayout: {type: 'string', enum: LAYOUTS},
          publicEnabled: {type: 'boolean'}
        },
        required: ['jobId'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_interviews',
      description: 'List interview appointments.',
      parameters: {
        type: 'object',
        properties: {
          status: {type: 'string', enum: INTERVIEW_STATUSES},
          candidateId: {type: 'string'}
        },
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'invite_to_interview',
      description: 'High-level interview invite. Picks candidates from Screening (then Interview), NOT New. Parses relative time like tomorrow after 11, applies defaults (30 min, Video), creates the appointment, moves candidate to Interview, and emails the candidate when Resend is configured. Use this when the user says "invite / пригласи на интервью".',
      parameters: {
        type: 'object',
        properties: {
          candidateId: {type: 'string'},
          nameContains: {type: 'string'},
          count: {type: 'integer', minimum: 1, maximum: 10, description: 'How many people to invite (default 1)'},
          when: {type: 'string', description: 'Free-text time, e.g. "завтра после 11", "tomorrow 14:00"'},
          startsAt: {type: 'string', description: 'Optional explicit ISO datetime'},
          duration: {type: 'integer', minimum: 15, maximum: 240},
          format: {type: 'string', enum: INTERVIEW_FORMATS},
          location: {type: 'string'},
          interviewer: {type: 'string'},
          title: {type: 'string'},
          sendEmail: {type: 'boolean', description: 'Default true'}
        },
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_interview',
      description: 'Low-level: schedule one interview by exact candidateId + startsAt. Prefer invite_to_interview for natural-language invites.',
      parameters: {
        type: 'object',
        properties: {
          candidateId: {type: 'string'},
          title: {type: 'string'},
          startsAt: {type: 'string', description: 'ISO datetime'},
          duration: {type: 'integer', minimum: 15, maximum: 240},
          format: {type: 'string', enum: INTERVIEW_FORMATS},
          location: {type: 'string'},
          interviewer: {type: 'string'},
          notes: {type: 'string'},
          sendEmail: {type: 'boolean'}
        },
        required: ['candidateId', 'title', 'startsAt'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_interview',
      description: 'Update interview fields or mark completed/cancelled.',
      parameters: {
        type: 'object',
        properties: {
          interviewId: {type: 'string'},
          title: {type: 'string'},
          startsAt: {type: 'string'},
          duration: {type: 'integer', minimum: 15, maximum: 240},
          format: {type: 'string', enum: INTERVIEW_FORMATS},
          location: {type: 'string'},
          interviewer: {type: 'string'},
          notes: {type: 'string'},
          status: {type: 'string', enum: INTERVIEW_STATUSES}
        },
        required: ['interviewId'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_message_drafts',
      description: 'List saved message drafts (never sent).',
      parameters: {
        type: 'object',
        properties: {candidateId: {type: 'string'}},
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_message_draft',
      description: 'Create an Email/SMS draft for a candidate. Nothing is delivered.',
      parameters: {
        type: 'object',
        properties: {
          candidateId: {type: 'string'},
          channel: {type: 'string', enum: CAMPAIGN_CHANNELS},
          subject: {type: 'string'},
          body: {type: 'string'}
        },
        required: ['candidateId', 'body'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_campaigns',
      description: 'List outreach campaigns (send via POST /api/campaigns/:id/send).',
      parameters: {
        type: 'object',
        properties: {status: {type: 'string', enum: CAMPAIGN_STATUSES}},
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_campaign',
      description: 'Create a campaign definition. Status starts as Draft; messages are never sent.',
      parameters: {
        type: 'object',
        properties: {
          name: {type: 'string'},
          message: {type: 'string'},
          jobId: {type: 'string', description: 'Job id or All'},
          stage: {type: 'string', description: 'Stage or All'},
          audience: {type: 'string', enum: AUDIENCES},
          channel: {type: 'string', enum: CAMPAIGN_CHANNELS}
        },
        required: ['name', 'message'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_campaign',
      description: 'Update campaign fields or status (Draft/Ready/Completed).',
      parameters: {
        type: 'object',
        properties: {
          campaignId: {type: 'string'},
          name: {type: 'string'},
          message: {type: 'string'},
          jobId: {type: 'string'},
          stage: {type: 'string'},
          audience: {type: 'string', enum: AUDIENCES},
          channel: {type: 'string', enum: CAMPAIGN_CHANNELS},
          status: {type: 'string', enum: CAMPAIGN_STATUSES}
        },
        required: ['campaignId'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_team',
      description: 'List the local team directory (UI directory, separate from login users).',
      parameters: {type: 'object', properties: {}, additionalProperties: false}
    }
  },
  {
    type: 'function',
    function: {
      name: 'upsert_team_member',
      description: 'Add or update a team directory entry.',
      parameters: {
        type: 'object',
        properties: {
          memberId: {type: 'string', description: 'If omitted, creates a new directory entry'},
          name: {type: 'string'},
          email: {type: 'string'},
          role: {type: 'string', enum: TEAM_ROLES},
          status: {type: 'string'}
        },
        required: ['name', 'email'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_workspace_settings',
      description: 'Update company settings (name, website, timezone, notification toggles).',
      parameters: {
        type: 'object',
        properties: {
          company: {type: 'string'},
          website: {type: 'string'},
          timezone: {type: 'string'},
          digest: {type: 'boolean'},
          interview: {type: 'boolean'},
          offers: {type: 'boolean'}
        },
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_activity',
      description: 'Recent workspace activity feed.',
      parameters: {
        type: 'object',
        properties: {limit: {type: 'integer', minimum: 1, maximum: 50}},
        additionalProperties: false
      }
    }
  }
];

/** Resolve "завтра после 11" / "tomorrow 14:00" into an ISO timestamp. */
export function resolveInterviewStart({startsAt, when, hour = 11, minute = 0} = {}) {
  if (startsAt && Number.isFinite(Date.parse(startsAt))) return new Date(startsAt).toISOString();
  const raw = String(when || '').toLowerCase();
  const base = new Date();
  if (/завтра|tomorrow/.test(raw) || !raw) base.setDate(base.getDate() + 1);
  else if (/сегодня|today/.test(raw)) {/* keep today */}
  else base.setDate(base.getDate() + 1);

  let h = Number.isInteger(hour) ? hour : 11;
  let m = Number.isInteger(minute) ? minute : 0;
  const match = raw.match(/(\d{1,2})(?:[:.](\d{2}))?/);
  if (match) {
    h = Math.min(23, Math.max(0, Number(match[1])));
    m = match[2] ? Math.min(59, Number(match[2])) : 0;
  } else if (/после\s*11|after\s*11|11\s*(утра|am)/i.test(raw)) {
    h = 11; m = 0;
  }
  base.setHours(h, m, 0, 0);
  if (base.getTime() <= Date.now()) base.setDate(base.getDate() + 1);
  return base.toISOString();
}

function pickInviteCandidates(state, args) {
  const prefer = ['Screening', 'Interview'];
  const count = Number.isInteger(args.count) ? Math.min(10, Math.max(1, args.count)) : 1;
  let pool = state.candidates.filter(c => !c.archived);
  if (args.candidateId) pool = pool.filter(c => c.id === args.candidateId);
  if (args.nameContains) {
    const needle = str(args.nameContains).toLowerCase();
    pool = pool.filter(c => c.name.toLowerCase().includes(needle));
  }
  const ranked = [
    ...pool.filter(c => c.stage === 'Screening'),
    ...pool.filter(c => c.stage === 'Interview'),
    // only if explicitly named / id — allow other stages
    ...((args.candidateId || args.nameContains) ? pool.filter(c => !prefer.includes(c.stage)) : [])
  ];
  const seen = new Set();
  const unique = [];
  for (const c of ranked) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    unique.push(c);
    if (unique.length >= count) break;
  }
  return unique;
}

function computeReport(state, days) {
  const cutoff = Number.isInteger(days) ? Date.now() - days * 86400000 : null;
  const people = state.candidates.filter(c => !c.archived && (!cutoff || Date.parse(c.createdAt) >= cutoff));
  const byStage = Object.fromEntries(STAGES.map(s => [s, people.filter(c => c.stage === s).length]));
  const funnel = STAGES.map((stage, index) => ({
    stage,
    reachedOrLater: people.filter(c => STAGES.indexOf(c.stage) >= index).length
  }));
  const bySource = {};
  const byLocation = {};
  for (const c of people) {
    bySource[c.source || 'Unknown'] = (bySource[c.source || 'Unknown'] || 0) + 1;
    byLocation[c.location || 'Unknown'] = (byLocation[c.location || 'Unknown'] || 0) + 1;
  }
  const hired = people.filter(c => c.stage === 'Hired');
  const hireDays = hired.map(c => Math.max(0, (Date.parse(c.updatedAt) - Date.parse(c.createdAt)) / 86400000)).sort((a, b) => a - b);
  const median = hireDays.length
    ? (hireDays.length % 2 ? hireDays[(hireDays.length - 1) / 2] : (hireDays[hireDays.length / 2 - 1] + hireDays[hireDays.length / 2]) / 2)
    : null;
  return {
    cohortDays: days || null,
    totalActiveCandidates: people.length,
    archivedTotal: state.candidates.filter(c => c.archived).length,
    byStage,
    funnel,
    bySource,
    byLocation,
    hired: hired.length,
    hireRate: people.length ? Number((hired.length / people.length * 100).toFixed(1)) : 0,
    medianDaysToHire: median === null ? null : Number(median.toFixed(1)),
    interviews: {
      scheduled: state.interviews.filter(i => i.status === 'Scheduled').length,
      completed: state.interviews.filter(i => i.status === 'Completed').length,
      cancelled: state.interviews.filter(i => i.status === 'Cancelled').length
    },
    jobs: {
      active: state.jobs.filter(j => j.status === 'Active').length,
      paused: state.jobs.filter(j => j.status === 'Paused').length,
      closed: state.jobs.filter(j => j.status === 'Closed').length,
      openings: state.jobs.filter(j => j.status === 'Active').reduce((n, j) => n + j.openings, 0)
    }
  };
}

export async function executeAssistantTool(db, workspaceId, actorId, name, rawArgs = {}) {
  const args = rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs) ? rawArgs : {};

  if (name === 'get_app_guide') return ok({guide: APP_GUIDE});

  if (name === 'get_workspace_overview') {
    const {state, revision} = getWorkspace(db, workspaceId);
    const active = state.candidates.filter(c => !c.archived);
    const counts = Object.fromEntries(STAGES.map(s => [s, active.filter(c => c.stage === s).length]));
    return ok({
      revision,
      settings: {
        company: state.settings.company,
        website: state.settings.website,
        timezone: state.settings.timezone,
        digest: state.settings.digest,
        interview: state.settings.interview,
        offers: state.settings.offers
      },
      counts: {
        candidatesActive: active.length,
        candidatesArchived: state.candidates.length - active.length,
        pipeline: counts,
        jobsActive: state.jobs.filter(j => j.status === 'Active').length,
        interviewsScheduled: state.interviews.filter(i => i.status === 'Scheduled').length,
        campaigns: state.campaigns.length,
        drafts: state.messages.length,
        team: state.team.length
      }
    });
  }

  if (name === 'get_hiring_report') {
    const {state} = getWorkspace(db, workspaceId);
    const days = args.days === undefined ? undefined : Number(args.days);
    if (days !== undefined && (!Number.isInteger(days) || days < 1 || days > 3650)) throw new ValidationError('Invalid days');
    return ok({report: computeReport(state, days)});
  }

  if (name === 'search_workspace') {
    const q = str(args.query, 120).toLowerCase();
    if (!q) throw new ValidationError('query is required');
    const {state} = getWorkspace(db, workspaceId);
    const titles = jobTitleMap(state);
    const match = value => String(value || '').toLowerCase().includes(q);
    return ok({
      query: args.query,
      candidates: state.candidates.filter(c => [c.name, c.email, c.phone, c.location, c.source, c.notes, ...(c.tags || [])].some(match)).slice(0, 25)
        .map(c => ({id: c.id, name: c.name, email: c.email, stage: c.stage, archived: c.archived, jobTitle: titles.get(c.jobId) || null})),
      jobs: state.jobs.filter(j => [j.title, j.department, j.location, j.description, j.owner].some(match)).slice(0, 25)
        .map(j => ({id: j.id, title: j.title, status: j.status, location: j.location, publicSlug: j.publicSlug})),
      campaigns: state.campaigns.filter(c => [c.name, c.message].some(match)).slice(0, 15)
        .map(c => ({id: c.id, name: c.name, status: c.status, channel: c.channel})),
      interviews: state.interviews.filter(i => [i.title, i.interviewer, i.location, i.notes].some(match)).slice(0, 15)
        .map(i => ({id: i.id, title: i.title, status: i.status, startsAt: i.startsAt, candidateId: i.candidateId})),
      team: state.team.filter(t => [t.name, t.email, t.role].some(match)).slice(0, 15)
        .map(t => ({id: t.id, name: t.name, email: t.email, role: t.role}))
    });
  }

  if (name === 'list_candidates') {
    const {state} = getWorkspace(db, workspaceId);
    const titles = jobTitleMap(state);
    const archived = asBool(args.archived, false);
    let people = state.candidates.filter(c => !!c.archived === archived);
    if (args.stage) {
      if (!STAGES.includes(args.stage)) throw new ValidationError('Unknown stage');
      people = people.filter(c => c.stage === args.stage);
    }
    if (args.jobId) people = people.filter(c => c.jobId === args.jobId);
    if (args.source) people = people.filter(c => c.source === args.source);
    if (typeof args.favorite === 'boolean') people = people.filter(c => c.favorite === args.favorite);
    if (args.jobTitleContains) {
      const needle = str(args.jobTitleContains).toLowerCase();
      people = people.filter(c => String(titles.get(c.jobId) || '').toLowerCase().includes(needle));
    }
    if (args.nameContains) {
      const needle = str(args.nameContains).toLowerCase();
      people = people.filter(c => c.name.toLowerCase().includes(needle));
    }
    const limit = Number.isInteger(args.limit) ? Math.min(200, Math.max(1, args.limit)) : 100;
    people = people.slice(0, limit);
    return ok({
      count: people.length,
      candidates: people.map(c => ({
        id: c.id, name: c.name, email: c.email, phone: c.phone, stage: c.stage,
        jobId: c.jobId, jobTitle: titles.get(c.jobId) || null, location: c.location,
        source: c.source, owner: c.owner, favorite: c.favorite, archived: c.archived,
        rating: c.rating, tags: c.tags
      }))
    });
  }

  if (name === 'get_candidate') {
    const {state} = getWorkspace(db, workspaceId);
    const c = findCandidate(state, str(args.candidateId, 128));
    const job = state.jobs.find(j => j.id === c.jobId);
    return ok({
      candidate: {
        ...clone(c),
        history: c.history.slice(-20),
        jobTitle: job?.title || null
      }
    });
  }

  if (name === 'create_candidate') {
    const result = mutateWorkspace(db, workspaceId, undefined, actorId, 'assistant.create_candidate', state => {
      findJob(state, args.jobId);
      if (state.candidates.some(c => c.email.toLowerCase() === str(args.email, 180).toLowerCase())) {
        throw new ValidationError('A candidate with this email already exists');
      }
      const now = iso();
      const stage = STAGES.includes(args.stage) ? args.stage : 'New';
      const record = {
        id: randomUUID(),
        name: str(args.name, 100),
        email: str(args.email, 180).toLowerCase(),
        phone: str(args.phone, 40),
        location: str(args.location, 100),
        jobId: args.jobId,
        source: str(args.source, 120) || 'Manual',
        stage,
        experience: str(args.experience, 100),
        owner: str(args.owner, 120) || state.settings.company,
        notes: str(args.notes, 6000),
        tags: Array.isArray(args.tags) ? args.tags.map(t => str(t, 80)).filter(Boolean).slice(0, 12) : [],
        rating: args.rating === null || args.rating === undefined ? null : Number(args.rating),
        favorite: false,
        archived: false,
        color: '#deebe6',
        createdAt: now,
        updatedAt: now,
        history: [{id: randomUUID(), type: 'created', text: 'Candidate created by AI assistant', stage, at: now}]
      };
      validateRecord('candidates', record, state);
      state.candidates.unshift(record);
      pushActivity(state, `${record.name} added by AI assistant`);
      return clone(record);
    });
    return changed({candidate: result.data});
  }

  if (name === 'update_candidate') {
    const fields = ['name', 'email', 'jobId', 'location', 'phone', 'source', 'experience', 'owner', 'notes', 'tags', 'rating', 'favorite'];
    const result = mutateWorkspace(db, workspaceId, undefined, actorId, 'assistant.update_candidate', state => {
      const c = findCandidate(state, str(args.candidateId, 128));
      if (args.jobId) findJob(state, args.jobId);
      for (const key of fields) {
        if (!Object.hasOwn(args, key)) continue;
        if (key === 'tags') c.tags = Array.isArray(args.tags) ? args.tags.map(t => str(t, 80)).filter(Boolean).slice(0, 12) : c.tags;
        else if (key === 'rating') c.rating = args.rating === null ? null : Number(args.rating);
        else if (key === 'favorite') c.favorite = !!args.favorite;
        else if (key === 'email') c.email = str(args.email, 180).toLowerCase();
        else c[key] = typeof args[key] === 'string' ? str(args[key], key === 'notes' ? 6000 : 200) : args[key];
      }
      pushHistory(c, 'edited', 'Candidate details updated by AI assistant');
      validateRecord('candidates', c, state);
      pushActivity(state, `${c.name} updated by AI assistant`);
      return clone(c);
    });
    return changed({candidate: result.data});
  }

  if (name === 'move_candidates') {
    const toStage = args.toStage;
    if (!STAGES.includes(toStage)) throw new ValidationError('Invalid toStage');
    if (args.fromStage !== undefined && !STAGES.includes(args.fromStage)) throw new ValidationError('Invalid fromStage');
    const limit = Number.isInteger(args.limit) ? Math.min(200, Math.max(1, args.limit)) : 50;
    const ids = Array.isArray(args.candidateIds) ? args.candidateIds.filter(x => typeof x === 'string').slice(0, 200) : null;
    const nameNeedle = typeof args.nameContains === 'string' ? args.nameContains.trim().toLowerCase() : '';
    const result = mutateWorkspace(db, workspaceId, undefined, actorId, 'assistant.move_candidates', state => {
      let people = state.candidates.filter(c => !c.archived);
      if (ids?.length) people = people.filter(c => ids.includes(c.id));
      if (args.fromStage) people = people.filter(c => c.stage === args.fromStage);
      if (nameNeedle) people = people.filter(c => c.name.toLowerCase().includes(nameNeedle));
      people = people.filter(c => c.stage !== toStage).slice(0, limit);
      const moved = [];
      for (const c of people) {
        const previous = c.stage;
        c.stage = toStage;
        pushHistory(c, 'stage', `Moved to ${toStage} by AI assistant`, toStage);
        if (toStage === 'Interview') {
          const slot = ensureScheduledInterview(state, c, {notes: 'Scheduled by AI when moved to Interview'});
          if (slot) pushHistory(c, 'interview', `${slot.title} added to calendar`);
        }
        moved.push({id: c.id, name: c.name, from: previous, to: toStage});
      }
      if (moved.length) pushActivity(state, `AI assistant moved ${moved.length} candidate(s) to ${toStage}`);
      return {moved, toStage, count: moved.length};
    });
    return {...result.data, ok: true, workspaceChanged: result.data.count > 0};
  }

  if (name === 'archive_candidate') {
    if (typeof args.archived !== 'boolean') throw new ValidationError('archived must be boolean');
    const result = mutateWorkspace(db, workspaceId, undefined, actorId, 'assistant.archive_candidate', state => {
      const c = findCandidate(state, str(args.candidateId, 128));
      c.archived = args.archived;
      pushHistory(c, 'archive', args.archived ? 'Candidate archived by AI assistant' : 'Candidate restored by AI assistant');
      pushActivity(state, `${c.name} ${args.archived ? 'archived' : 'restored'} by AI assistant`);
      return {id: c.id, name: c.name, archived: c.archived};
    });
    return changed(result.data);
  }

  if (name === 'list_jobs') {
    const {state} = getWorkspace(db, workspaceId);
    let jobs = state.jobs;
    if (args.status) {
      if (!JOB_STATUSES.includes(args.status)) throw new ValidationError('Invalid status');
      jobs = jobs.filter(j => j.status === args.status);
    }
    if (args.titleContains) {
      const needle = str(args.titleContains).toLowerCase();
      jobs = jobs.filter(j => j.title.toLowerCase().includes(needle));
    }
    return ok({
      count: jobs.length,
      jobs: jobs.map(j => ({
        id: j.id, title: j.title, department: j.department, location: j.location,
        openings: j.openings, status: j.status, pay: j.pay, owner: j.owner,
        publicSlug: j.publicSlug, landingLayout: j.landingLayout, publicEnabled: j.publicEnabled,
        candidateCount: state.candidates.filter(c => c.jobId === j.id && !c.archived).length
      }))
    });
  }

  if (name === 'create_job') {
    const result = mutateWorkspace(db, workspaceId, undefined, actorId, 'assistant.create_job', state => {
      const record = normalizeJobPublicFields({
        id: randomUUID(),
        title: str(args.title, 120),
        department: str(args.department, 80),
        location: str(args.location, 140),
        openings: Number.isInteger(args.openings) ? args.openings : 1,
        status: JOB_STATUSES.includes(args.status) ? args.status : 'Active',
        pay: str(args.pay, 100),
        owner: str(args.owner, 120) || state.settings.company,
        description: str(args.description, 6000),
        landingLayout: LAYOUTS.includes(args.landingLayout) ? args.landingLayout : 'classic',
        publicEnabled: args.publicEnabled !== false,
        createdAt: iso()
      });
      validateRecord('jobs', record, state);
      state.jobs.unshift(record);
      pushActivity(state, `Job ${record.title} created by AI assistant`);
      return clone(record);
    });
    return changed({job: result.data, applyPath: `/apply/${result.data.publicSlug}`});
  }

  if (name === 'update_job') {
    const result = mutateWorkspace(db, workspaceId, undefined, actorId, 'assistant.update_job', state => {
      const job = findJob(state, str(args.jobId, 128));
      for (const key of ['title', 'department', 'location', 'pay', 'owner', 'description']) {
        if (Object.hasOwn(args, key)) job[key] = str(args[key], key === 'description' ? 6000 : 200);
      }
      if (Object.hasOwn(args, 'openings')) job.openings = Number(args.openings);
      if (Object.hasOwn(args, 'status')) {
        if (!JOB_STATUSES.includes(args.status)) throw new ValidationError('Invalid status');
        job.status = args.status;
      }
      if (Object.hasOwn(args, 'landingLayout')) {
        if (!LAYOUTS.includes(args.landingLayout)) throw new ValidationError('Invalid landingLayout');
        job.landingLayout = args.landingLayout;
      }
      if (Object.hasOwn(args, 'publicEnabled')) job.publicEnabled = !!args.publicEnabled;
      normalizeJobPublicFields(job);
      validateRecord('jobs', job, state);
      pushActivity(state, `Job ${job.title} updated by AI assistant`);
      return clone(job);
    });
    return changed({job: result.data, applyPath: `/apply/${result.data.publicSlug}`});
  }

  if (name === 'list_interviews') {
    const {state} = getWorkspace(db, workspaceId);
    const names = candidateNameMap(state);
    let items = state.interviews;
    if (args.status) {
      if (!INTERVIEW_STATUSES.includes(args.status)) throw new ValidationError('Invalid status');
      items = items.filter(i => i.status === args.status);
    }
    if (args.candidateId) items = items.filter(i => i.candidateId === args.candidateId);
    return ok({
      count: items.length,
      interviews: items.slice(0, 100).map(i => ({
        ...clone(i),
        candidateName: names.get(i.candidateId) || null
      }))
    });
  }

  if (name === 'invite_to_interview') {
    const startsAt = resolveInterviewStart(args);
    const sendEmail = args.sendEmail !== false;
    const invited = [];
    const result = withSuppressedInterviewStageNotify(() => mutateWorkspace(db, workspaceId, undefined, actorId, 'assistant.invite_to_interview', state => {
      const people = pickInviteCandidates(state, args);
      if (!people.length) {
        throw new ValidationError('No Screening/Interview candidates available to invite. Move someone to Screening first.');
      }
      const titles = jobTitleMap(state);
      for (const c of people) {
        const record = {
          id: randomUUID(),
          candidateId: c.id,
          title: str(args.title, 150) || 'Recruiter interview',
          startsAt,
          duration: Number.isInteger(args.duration) ? args.duration : 30,
          format: INTERVIEW_FORMATS.includes(args.format) ? args.format : 'Video',
          location: str(args.location, 500) || 'Video call',
          interviewer: str(args.interviewer, 120) || state.settings.company,
          status: 'Scheduled',
          notes: str(args.notes, 4000) || 'Scheduled via AI invite',
          createdAt: iso()
        };
        validateRecord('interviews', record, state);
        state.interviews.unshift(record);
        const previous = c.stage;
        if (c.stage !== 'Interview' && c.stage !== 'Offer' && c.stage !== 'Hired') {
          c.stage = 'Interview';
          pushHistory(c, 'stage', 'Moved to Interview by AI invite', 'Interview');
        }
        pushHistory(c, 'interview', 'Interview invitation created by AI assistant');
        pushActivity(state, `Interview invited for ${c.name} by AI assistant`);
        invited.push({
          candidate: {
            id: c.id,
            name: c.name,
            email: c.email,
            telegramChatId: c.telegramChatId || '',
            stage: c.stage,
            previousStage: previous
          },
          jobTitle: titles.get(c.jobId) || null,
          interview: clone(record)
        });
      }
      return {invited, company: state.settings.company};
    }));
    const emailResults = [];
    const smsResults = [];
    const telegramResults = [];
    if (sendEmail) {
      for (const item of result.data.invited) {
        try {
          const mail = await sendInterviewInvite({
            candidate: item.candidate,
            jobTitle: item.jobTitle,
            interview: item.interview,
            company: result.data.company
          });
          emailResults.push({candidateId: item.candidate.id, ...mail});
        } catch (err) {
          emailResults.push({candidateId: item.candidate.id, delivered: false, error: err.message || String(err)});
        }
        try {
          const sms = await sendInterviewSms({
            candidate: item.candidate,
            jobTitle: item.jobTitle,
            interview: item.interview,
            company: result.data.company
          });
          smsResults.push({candidateId: item.candidate.id, ...sms});
        } catch (err) {
          smsResults.push({candidateId: item.candidate.id, delivered: false, error: err.message || String(err)});
        }
        try {
          const tg = await sendInterviewTelegram({
            candidate: item.candidate,
            jobTitle: item.jobTitle,
            interview: item.interview,
            company: result.data.company
          });
          telegramResults.push({candidateId: item.candidate.id, ...tg});
        } catch (err) {
          telegramResults.push({candidateId: item.candidate.id, delivered: false, error: err.message || String(err)});
        }
      }
    }
    return changed({
      count: result.data.invited.length,
      invited: result.data.invited,
      emails: emailResults,
      sms: smsResults,
      telegrams: telegramResults,
      note: sendEmail
        ? 'Interview created; email/SMS/Telegram attempted when configured and candidate has phone/chat.'
        : 'Interview created without outbound notify.'
    });
  }

  if (name === 'create_interview') {
    const result = mutateWorkspace(db, workspaceId, undefined, actorId, 'assistant.create_interview', state => {
      const c = findCandidate(state, str(args.candidateId, 128), {allowArchived: false});
      const record = {
        id: randomUUID(),
        candidateId: c.id,
        title: str(args.title, 150),
        startsAt: str(args.startsAt, 64),
        duration: Number.isInteger(args.duration) ? args.duration : 30,
        format: INTERVIEW_FORMATS.includes(args.format) ? args.format : 'Video',
        location: str(args.location, 500),
        interviewer: str(args.interviewer, 120) || state.settings.company,
        status: 'Scheduled',
        notes: str(args.notes, 4000),
        createdAt: iso()
      };
      validateRecord('interviews', record, state);
      state.interviews.unshift(record);
      pushHistory(c, 'interview', 'Interview scheduled by AI assistant');
      pushActivity(state, `Interview scheduled for ${c.name} by AI assistant`);
      const job = state.jobs.find(j => j.id === c.jobId);
      return {interview: clone(record), candidate: clone(c), jobTitle: job?.title || null, company: state.settings.company};
    });
    let email = {delivered: false, skipped: true};
    let sms = {delivered: false, skipped: true};
    let telegram = {delivered: false, skipped: true};
    if (args.sendEmail) {
      try {
        email = await sendInterviewInvite({
          candidate: result.data.candidate,
          jobTitle: result.data.jobTitle,
          interview: result.data.interview,
          company: result.data.company
        });
      } catch (err) {
        email = {delivered: false, error: err.message || String(err)};
      }
      try {
        sms = await sendInterviewSms({
          candidate: result.data.candidate,
          jobTitle: result.data.jobTitle,
          interview: result.data.interview,
          company: result.data.company
        });
      } catch (err) {
        sms = {delivered: false, error: err.message || String(err)};
      }
      try {
        telegram = await sendInterviewTelegram({
          candidate: result.data.candidate,
          jobTitle: result.data.jobTitle,
          interview: result.data.interview,
          company: result.data.company
        });
      } catch (err) {
        telegram = {delivered: false, error: err.message || String(err)};
      }
    }
    return changed({interview: result.data.interview, email, sms, telegram});
  }

  if (name === 'update_interview') {
    const result = mutateWorkspace(db, workspaceId, undefined, actorId, 'assistant.update_interview', state => {
      const interview = state.interviews.find(i => i.id === args.interviewId);
      if (!interview) throw new ValidationError('Interview not found');
      for (const key of ['title', 'startsAt', 'location', 'interviewer', 'notes']) {
        if (Object.hasOwn(args, key)) interview[key] = str(args[key], key === 'notes' ? 4000 : 500);
      }
      if (Object.hasOwn(args, 'duration')) interview.duration = Number(args.duration);
      if (Object.hasOwn(args, 'format')) {
        if (!INTERVIEW_FORMATS.includes(args.format)) throw new ValidationError('Invalid format');
        interview.format = args.format;
      }
      if (Object.hasOwn(args, 'status')) {
        if (!INTERVIEW_STATUSES.includes(args.status)) throw new ValidationError('Invalid status');
        interview.status = args.status;
      }
      validateRecord('interviews', interview, state);
      pushActivity(state, `Interview ${interview.title} updated by AI assistant`);
      return clone(interview);
    });
    return changed({interview: result.data});
  }

  if (name === 'list_message_drafts') {
    const {state} = getWorkspace(db, workspaceId);
    let items = state.messages;
    if (args.candidateId) items = items.filter(m => m.candidateId === args.candidateId);
    return ok({count: items.length, drafts: items.slice(0, 100)});
  }

  if (name === 'create_message_draft') {
    const result = mutateWorkspace(db, workspaceId, undefined, actorId, 'assistant.create_message_draft', state => {
      const c = findCandidate(state, str(args.candidateId, 128));
      const record = {
        id: randomUUID(),
        candidateId: c.id,
        channel: CAMPAIGN_CHANNELS.includes(args.channel) ? args.channel : 'Email',
        subject: str(args.subject, 200),
        body: str(args.body, 6000),
        status: 'Draft',
        createdAt: iso()
      };
      validateRecord('messages', record, state);
      state.messages.unshift(record);
      pushHistory(c, 'message', `${record.channel} draft saved by AI assistant. Not sent.`);
      pushActivity(state, `Message draft for ${c.name} created by AI assistant`);
      return clone(record);
    });
    return changed({draft: result.data, note: 'Draft only. Nothing was sent.'});
  }

  if (name === 'list_campaigns') {
    const {state} = getWorkspace(db, workspaceId);
    let items = state.campaigns;
    if (args.status) {
      if (!CAMPAIGN_STATUSES.includes(args.status)) throw new ValidationError('Invalid status');
      items = items.filter(c => c.status === args.status);
    }
    return ok({count: items.length, campaigns: items});
  }

  if (name === 'create_campaign') {
    const result = mutateWorkspace(db, workspaceId, undefined, actorId, 'assistant.create_campaign', state => {
      const jobId = args.jobId && args.jobId !== 'All' ? args.jobId : 'All';
      if (jobId !== 'All') findJob(state, jobId);
      const stage = args.stage && args.stage !== 'All' ? args.stage : 'All';
      if (stage !== 'All' && !STAGES.includes(stage)) throw new ValidationError('Invalid stage');
      const now = iso();
      const record = {
        id: randomUUID(),
        name: str(args.name, 200),
        message: str(args.message, 6000),
        jobId,
        stage,
        audience: AUDIENCES.includes(args.audience) ? args.audience : 'All',
        channel: CAMPAIGN_CHANNELS.includes(args.channel) ? args.channel : 'Email',
        status: 'Draft',
        createdAt: now,
        updatedAt: now
      };
      validateRecord('campaigns', record, state);
      state.campaigns.unshift(record);
      pushActivity(state, `Campaign ${record.name} created by AI assistant`);
      return clone(record);
    });
    return changed({campaign: result.data, note: 'Draft campaign. No messages are sent.'});
  }

  if (name === 'update_campaign') {
    const result = mutateWorkspace(db, workspaceId, undefined, actorId, 'assistant.update_campaign', state => {
      const campaign = state.campaigns.find(c => c.id === args.campaignId);
      if (!campaign) throw new ValidationError('Campaign not found');
      if (Object.hasOwn(args, 'name')) campaign.name = str(args.name, 200);
      if (Object.hasOwn(args, 'message')) campaign.message = str(args.message, 6000);
      if (Object.hasOwn(args, 'jobId')) {
        campaign.jobId = args.jobId === 'All' ? 'All' : args.jobId;
        if (campaign.jobId !== 'All') findJob(state, campaign.jobId);
      }
      if (Object.hasOwn(args, 'stage')) {
        campaign.stage = args.stage === 'All' ? 'All' : args.stage;
        if (campaign.stage !== 'All' && !STAGES.includes(campaign.stage)) throw new ValidationError('Invalid stage');
      }
      if (Object.hasOwn(args, 'audience')) {
        if (!AUDIENCES.includes(args.audience)) throw new ValidationError('Invalid audience');
        campaign.audience = args.audience;
      }
      if (Object.hasOwn(args, 'channel')) {
        if (!CAMPAIGN_CHANNELS.includes(args.channel)) throw new ValidationError('Invalid channel');
        campaign.channel = args.channel;
      }
      if (Object.hasOwn(args, 'status')) {
        if (!CAMPAIGN_STATUSES.includes(args.status)) throw new ValidationError('Invalid status');
        campaign.status = args.status;
      }
      campaign.updatedAt = iso();
      validateRecord('campaigns', campaign, state);
      pushActivity(state, `Campaign ${campaign.name} updated by AI assistant`);
      return clone(campaign);
    });
    return changed({campaign: result.data});
  }

  if (name === 'list_team') {
    const {state} = getWorkspace(db, workspaceId);
    return ok({count: state.team.length, team: state.team});
  }

  if (name === 'upsert_team_member') {
    const result = mutateWorkspace(db, workspaceId, undefined, actorId, 'assistant.upsert_team_member', state => {
      if (args.memberId) {
        const member = state.team.find(t => t.id === args.memberId);
        if (!member) throw new ValidationError('Team member not found');
        const old = member.name;
        member.name = str(args.name, 200);
        member.email = str(args.email, 180);
        if (args.role) {
          if (!TEAM_ROLES.includes(args.role)) throw new ValidationError('Invalid role');
          member.role = args.role;
        }
        if (args.status) member.status = str(args.status, 100);
        if (old !== member.name) {
          state.candidates.forEach(c => { if (c.owner === old) c.owner = member.name; });
          state.jobs.forEach(j => { if (j.owner === old) j.owner = member.name; });
          state.interviews.forEach(i => { if (i.interviewer === old) i.interviewer = member.name; });
        }
        pushActivity(state, `Team directory updated: ${member.name}`);
        return clone(member);
      }
      const member = {
        id: randomUUID(),
        name: str(args.name, 200),
        email: str(args.email, 180),
        role: TEAM_ROLES.includes(args.role) ? args.role : 'Recruiter',
        status: str(args.status, 100) || 'Directory entry'
      };
      validateRecord('team', member, state);
      state.team.push(member);
      pushActivity(state, `Team member ${member.name} added by AI assistant`);
      return clone(member);
    });
    return changed({member: result.data});
  }

  if (name === 'update_workspace_settings') {
    const result = mutateWorkspace(db, workspaceId, undefined, actorId, 'assistant.update_workspace_settings', state => {
      if (Object.hasOwn(args, 'company')) state.settings.company = str(args.company, 80);
      if (Object.hasOwn(args, 'website')) state.settings.website = str(args.website, 250);
      if (Object.hasOwn(args, 'timezone')) state.settings.timezone = str(args.timezone, 90);
      for (const key of ['digest', 'interview', 'offers']) {
        if (Object.hasOwn(args, key)) state.settings[key] = !!args[key];
      }
      pushActivity(state, 'Workspace settings updated by AI assistant');
      return clone(state.settings);
    });
    return changed({settings: result.data});
  }

  if (name === 'list_activity') {
    const {state} = getWorkspace(db, workspaceId);
    const limit = Number.isInteger(args.limit) ? Math.min(50, Math.max(1, args.limit)) : 20;
    return ok({items: state.activity.slice(0, limit)});
  }

  throw new ValidationError(`Unknown tool: ${name}`, 400);
}
