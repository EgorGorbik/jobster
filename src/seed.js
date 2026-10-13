/* Fictional sample records from the supplied frontend. No live customer data. */
(function () {
  'use strict';
  const originalCandidates = [
  {id:1,name:'Maya Thompson',role:'Customer Support Specialist',location:'Austin, TX',source:'Indeed',score:94,stage:'New',updated:'12m ago',initials:'MT',color:'#d9ece6',phone:'(512) 555-0142',email:'maya.thompson@example.com',experience:'4 years',applied:'Oct 9, 2026',owner:'Olivia Park',tags:['Bilingual','SaaS'],notes:'Strong customer-facing background and weekend availability.'},
  {id:2,name:'Jordan Lee',role:'Delivery Associate',location:'Phoenix, AZ',source:'Career site',score:86,stage:'New',updated:'28m ago',initials:'JL',color:'#e7e1f0',phone:'(602) 555-0189',email:'jordan.lee@example.com',experience:'2 years',applied:'Oct 9, 2026',owner:'Noah Williams',tags:['CDL'],notes:'Clean driving record. Available immediately.'},
  {id:3,name:'Sophia Martinez',role:'Retail Associate',location:'Miami, FL',source:'Text campaign',score:90,stage:'Screening',updated:'1h ago',initials:'SM',color:'#f5e5d5',phone:'(305) 555-0166',email:'sophia.martinez@example.com',experience:'3 years',applied:'Oct 8, 2026',owner:'Olivia Park',tags:['Spanish','POS'],notes:'Completed knockout questions with a perfect score.'},
  {id:4,name:'Ethan Brooks',role:'Warehouse Associate',location:'Columbus, OH',source:'Indeed',score:78,stage:'Screening',updated:'2h ago',initials:'EB',color:'#dce7ef',phone:'(614) 555-0118',email:'ethan.brooks@example.com',experience:'1 year',applied:'Oct 8, 2026',owner:'Ava Johnson',tags:['Forklift'],notes:'Forklift certification needs verification.'},
  {id:5,name:'Ava Patel',role:'People Operations Coordinator',location:'New York, NY',source:'Referral',score:97,stage:'Interview',updated:'Today',initials:'AP',color:'#f0e1e8',phone:'(917) 555-0177',email:'ava.patel@example.com',experience:'5 years',applied:'Oct 6, 2026',owner:'Zafar Safarov',tags:['HRIS','SHRM'],notes:'Panel interview scheduled. Excellent stakeholder communication.'},
  {id:6,name:'Marcus Reed',role:'Field Sales Representative',location:'Atlanta, GA',source:'LinkedIn',score:84,stage:'Interview',updated:'Today',initials:'MR',color:'#e1ecd8',phone:'(404) 555-0151',email:'marcus.reed@example.com',experience:'6 years',applied:'Oct 5, 2026',owner:'Zafar Safarov',tags:['B2B','Salesforce'],notes:'Exceeded quota in the last three quarters.'},
  {id:7,name:'Chloe Nguyen',role:'Store Manager',location:'Seattle, WA',source:'Career site',score:93,stage:'Offer',updated:'Yesterday',initials:'CN',color:'#eee4d7',phone:'(206) 555-0124',email:'chloe.nguyen@example.com',experience:'7 years',applied:'Oct 2, 2026',owner:'Olivia Park',tags:['Leadership'],notes:'Offer drafted at $68,000. Awaiting compensation approval.'},
  {id:8,name:'Darnell Carter',role:'Warehouse Associate',location:'Columbus, OH',source:'Job fair',score:88,stage:'Hired',updated:'Oct 7',initials:'DC',color:'#dce9e2',phone:'(614) 555-0197',email:'darnell.carter@example.com',experience:'3 years',applied:'Sep 28, 2026',owner:'Ava Johnson',tags:['Forklift'],notes:'Start date confirmed for October 19.'}
];
  const originalJobs = [
  {id:1,title:'Customer Support Specialist',department:'Customer Experience',location:'Austin, TX · Hybrid',applications:48,openings:5,hired:1,status:'Active',pay:'$22–$27/hr',owner:'Olivia Park'},
  {id:2,title:'Delivery Associate',department:'Operations',location:'Phoenix, AZ · On-site',applications:36,openings:12,hired:3,status:'Active',pay:'$20–$24/hr',owner:'Noah Williams'},
  {id:3,title:'Retail Associate',department:'Retail',location:'Miami, FL · On-site',applications:29,openings:8,hired:2,status:'Active',pay:'$18–$21/hr',owner:'Olivia Park'},
  {id:4,title:'Warehouse Associate',department:'Operations',location:'Columbus, OH · On-site',applications:54,openings:14,hired:4,status:'Active',pay:'$21–$25/hr',owner:'Ava Johnson'},
  {id:5,title:'People Operations Coordinator',department:'People',location:'New York, NY · Hybrid',applications:14,openings:1,hired:0,status:'Paused',pay:'$70k–$82k',owner:'Zafar Safarov'}
];
  window.FalconSeed = function () {
    const stages = ['New', 'Screening', 'Interview', 'Offer', 'Hired'];
    const now = new Date();
    const ago = days => new Date(now.getTime() - days * 86400000).toISOString();
    const jobs = originalJobs.map(j => ({ id: String(j.id), title: j.title, department: j.department,
      location: j.location, openings: j.openings, status: j.status, pay: j.pay,
      owner: j.owner, description: '', createdAt: ago(21) }));
    jobs.push({ id: '6', title: 'Field Sales Representative', department: 'Sales', location: 'Atlanta, GA', openings: 2, status: 'Active', pay: '', owner: 'Zafar Safarov', description: '', createdAt: ago(21) });
    jobs.push({ id: '7', title: 'Store Manager', department: 'Retail', location: 'Seattle, WA', openings: 1, status: 'Active', pay: '', owner: 'Olivia Park', description: '', createdAt: ago(21) });
    const ages = [0, 0, 1, 1, 3, 4, 7, 11];
    const candidates = originalCandidates.map((c, index) => {
      const createdAt = ago(ages[index]);
      const stageIndex = stages.indexOf(c.stage);
      const history = [{ id: 'seed-' + c.id, type: 'created', text: 'Sample application added', stage: 'New', at: createdAt }];
      for (let s = 1; s <= stageIndex; s++) {
        history.push({ id: 'seed-' + c.id + '-' + s, type: 'stage', text: 'Moved to ' + stages[s] + ' (sample history)', stage: stages[s], at: ago(Math.max(0, ages[index] - s)) });
      }
      return { id: String(c.id), name: c.name, jobId: jobs.find(j => j.title === c.role).id,
        location: c.location, source: c.source, rating: c.score, stage: c.stage,
        email: c.email, phone: c.phone, experience: c.experience, owner: c.owner,
        tags: c.tags, notes: c.notes, favorite: index === 0 || index === 4,
        archived: false, color: c.color, createdAt, updatedAt: history.at(-1).at, history };
    });
    const start = new Date(now); start.setDate(start.getDate() + 1); start.setHours(10, 30, 0, 0);
    const later = new Date(start); later.setHours(14, 0);
    return {
      version: 1, candidates, jobs,
      campaigns: [
        { id: 'campaign-1', name: 'Warehouse hiring - Columbus', channel: 'SMS', jobId: '4', stage: 'All', audience: 'All', status: 'Draft', message: 'Hi {{first_name}}, this is {{company}}. Are you interested in our {{job_title}} opening? Reply with your availability.', createdAt: ago(1), updatedAt: ago(1) },
        { id: 'campaign-2', name: 'Retail re-engagement - Miami', channel: 'Email', jobId: '3', stage: 'All', audience: 'All', status: 'Ready', message: 'Hi {{first_name}}, we would like to share a {{job_title}} opportunity at {{company}}. Let us know a good time to talk.', createdAt: ago(2), updatedAt: ago(1) },
        { id: 'campaign-3', name: 'Phoenix delivery referrals', channel: 'SMS', jobId: '2', stage: 'All', audience: 'All', status: 'Draft', message: 'Hi {{first_name}}, {{company}} is hiring for {{job_title}}. Would you like to learn more?', createdAt: ago(3), updatedAt: ago(3) }
      ],
      interviews: [
        { id: 'interview-1', candidateId: '5', title: 'Panel interview', startsAt: start.toISOString(), duration: 45, format: 'Video', location: 'Meeting link not added', interviewer: 'Zafar Safarov', status: 'Scheduled', notes: 'Sample appointment. No external calendar is connected.', createdAt: ago(1) },
        { id: 'interview-2', candidateId: '6', title: 'Recruiter conversation', startsAt: later.toISOString(), duration: 30, format: 'Phone', location: '', interviewer: 'Olivia Park', status: 'Scheduled', notes: 'Sample appointment.', createdAt: ago(1) }
      ], messages: [],
      team: [
        {id: 'team-1', name: 'Zafar Safarov', email: '', role: 'Owner', status: 'Demo member'},
        {id: 'team-2', name: 'Olivia Park', email: 'olivia@example.com', role: 'Admin', status: 'Demo member'},
        {id: 'team-3', name: 'Noah Williams', email: 'noah@example.com', role: 'Recruiter', status: 'Demo member'},
        {id: 'team-4', name: 'Ava Johnson', email: 'ava@example.com', role: 'Recruiter', status: 'Demo member'}
      ],
      settings: {company: 'Falcon Staffing', website: '', timezone: 'America/New_York', digest: true, interview: true, offers: true, logo: ''},
      activity: [{id: 'activity-1', text: 'Interactive workspace initialized with sample data', at: now.toISOString(), read: false}]
    };
  };
})();
