import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderCampaignMessage, resolveCampaignAudience} from '../server/campaign-send.mjs';

test('renderCampaignMessage substitutes tokens', () => {
  const out = renderCampaignMessage(
    'Hi {{first_name}}, {{company}} — {{job_title}}',
    {candidate: {name: 'Alex Driver'}, jobTitle: 'CDL Driver', company: 'Falcon'}
  );
  assert.equal(out, 'Hi Alex, Falcon — CDL Driver');
});

test('resolveCampaignAudience filters by job/stage/favorites/archived', () => {
  const state = {
    candidates: [
      {id: '1', name: 'A', jobId: 'j1', stage: 'New', archived: false, favorite: true},
      {id: '2', name: 'B', jobId: 'j1', stage: 'Offer', archived: false, favorite: false},
      {id: '3', name: 'C', jobId: 'j2', stage: 'New', archived: false, favorite: true},
      {id: '4', name: 'D', jobId: 'j1', stage: 'New', archived: true, favorite: true}
    ]
  };
  assert.equal(resolveCampaignAudience(state, {jobId: 'All', stage: 'All', audience: 'All'}).length, 3);
  assert.equal(resolveCampaignAudience(state, {jobId: 'j1', stage: 'All', audience: 'All'}).length, 2);
  assert.equal(resolveCampaignAudience(state, {jobId: 'j1', stage: 'New', audience: 'All'}).length, 1);
  assert.equal(resolveCampaignAudience(state, {jobId: 'All', stage: 'All', audience: 'Favorites'}).length, 2);
});
