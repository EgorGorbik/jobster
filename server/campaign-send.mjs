/**
 * Real campaign blast: Email via Resend, SMS via Twilio.
 */
import {mailConfigured, sendMail} from './mail.mjs';
import {sendSms, smsConfigured} from './sms.mjs';
import {ValidationError} from './validation.mjs';

const MAX_AUDIENCE = 200;

export function renderCampaignMessage(template, {candidate, jobTitle, company}) {
  const first = String(candidate?.name || '').trim().split(/\s+/)[0] || 'Candidate';
  return String(template || '')
    .replaceAll('{{first_name}}', first)
    .replaceAll('{{job_title}}', jobTitle || 'your next role')
    .replaceAll('{{company}}', company || 'our team');
}

export function resolveCampaignAudience(state, campaign) {
  return (state.candidates || []).filter(c => {
    if (c.archived) return false;
    if (campaign.jobId && campaign.jobId !== 'All' && c.jobId !== campaign.jobId) return false;
    if (campaign.stage && campaign.stage !== 'All' && c.stage !== campaign.stage) return false;
    if (campaign.audience === 'Favorites' && !c.favorite) return false;
    return true;
  });
}

function wrapCampaignHtml(body, company) {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  return `<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1c3129;line-height:1.55;font-size:16px">
    <p style="white-space:pre-wrap;margin:0 0 20px">${esc(body)}</p>
    <p style="font-size:12px;color:#6d7f6a;margin:0;font-family:ui-sans-serif,system-ui,sans-serif">${esc(company)} · Falcon Jobster</p>
  </div>`;
}

/**
 * Send campaign to audience. Mutates nothing — caller persists summary on campaign.
 */
export async function sendCampaignBlast(state, campaign) {
  const channel = campaign.channel === 'SMS' ? 'SMS' : 'Email';
  if (channel === 'Email' && !mailConfigured()) {
    throw new ValidationError('Email is not configured (RESEND_API_KEY).', 503);
  }
  if (channel === 'SMS' && !smsConfigured()) {
    throw new ValidationError('SMS is not configured (TWILIO_*).', 503);
  }

  const people = resolveCampaignAudience(state, campaign);
  if (!people.length) throw new ValidationError('Audience is empty — nothing to send.', 400);
  if (people.length > MAX_AUDIENCE) {
    throw new ValidationError(`Audience too large (max ${MAX_AUDIENCE}). Narrow the segment.`, 400);
  }

  const company = state.settings?.company || 'Falcon Jobster';
  const jobs = new Map((state.jobs || []).map(j => [j.id, j.title]));
  const subjectBase = String(campaign.name || company).slice(0, 120);

  const results = [];
  let sent = 0, failed = 0, skipped = 0;

  for (const candidate of people) {
    const jobTitle = jobs.get(candidate.jobId) || '';
    const body = renderCampaignMessage(campaign.message, {candidate, jobTitle, company});
    const entry = {candidateId: candidate.id, name: candidate.name, channel};

    if (channel === 'Email') {
      if (!candidate.email) {
        skipped += 1;
        results.push({...entry, delivered: false, skipped: true, reason: 'no-email'});
        continue;
      }
      try {
        const r = await sendMail({
          to: candidate.email,
          subject: subjectBase,
          text: body,
          html: wrapCampaignHtml(body, company)
        });
        if (r.delivered) {
          sent += 1;
          results.push({...entry, delivered: true, messageId: r.messageId || null});
        } else if (r.skipped) {
          skipped += 1;
          results.push({...entry, delivered: false, skipped: true, reason: r.reason || 'skipped'});
        } else {
          failed += 1;
          results.push({...entry, delivered: false, error: r.error || 'send-failed'});
        }
      } catch (err) {
        failed += 1;
        results.push({...entry, delivered: false, error: err.message || String(err)});
      }
    } else {
      if (!candidate.phone) {
        skipped += 1;
        results.push({...entry, delivered: false, skipped: true, reason: 'no-phone'});
        continue;
      }
      try {
        const r = await sendSms({to: candidate.phone, body: body.slice(0, 1500)});
        if (r.delivered) {
          sent += 1;
          results.push({...entry, delivered: true, messageId: r.messageId || null});
        } else if (r.skipped) {
          skipped += 1;
          results.push({...entry, delivered: false, skipped: true, reason: r.reason || 'skipped'});
        } else {
          failed += 1;
          results.push({...entry, delivered: false, error: r.error || 'send-failed'});
        }
      } catch (err) {
        failed += 1;
        results.push({...entry, delivered: false, error: err.message || String(err)});
      }
    }
  }

  return {
    total: people.length,
    sent,
    failed,
    skipped,
    channel,
    results: results.slice(0, 100)
  };
}
