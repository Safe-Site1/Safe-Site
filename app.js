
const TODAY = new Date();

const SUPABASE_URL = 'https://dfuelhonvhoqvipwzcpp.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_rov8STHxS842ZUsGKmdkgQ_d3fp5Xsd';
let supabaseClient = null;
let cloudUser = null;
let cloudOrganizationId = null;
let cloudSiteIds = {};
let cloudRiskThresholds = {};
let taskLoadSequence = 0;
let taskContext = null;
let taskLoadState = 'idle';

function initSupabase(){
  if(window.supabase && !supabaseClient){
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  }
  return supabaseClient;
}


const seed = {
  settings:{company:'Safe Site Demo Mining',site:'Timmins Project',role:'Administrator'},
  sites:['Timmins Project','Kirkland Lake Project'],
  users:[
    {name:'Demo Admin',email:'admin@safesite.demo',role:'Administrator'},
    {name:'Demo Supervisor',email:'supervisor@safesite.demo',role:'Supervisor'}
  ],
  workers:[
    {id:1,name:'John Smith',role:'Construction Miner',employeeId:'MG-0042',site:'Timmins Project',docs:[],quals:[
      {name:'Underground Hard Rock Miner',issued:'2025-02-01',expires:'2030-02-01'},
      {name:'Operate LHD',issued:'2025-03-01',expires:'2028-03-01'},
      {name:'First Aid',issued:'2024-10-14',expires:'2026-10-14'}
    ]},
    {id:2,name:'Sarah Johnson',role:'Equipment Operator',employeeId:'MG-0043',site:'Timmins Project',docs:[],quals:[
      {name:'Site Orientation',issued:'2026-01-05',expires:'2027-01-05'}
    ]},
    {id:3,name:'Mike Wilson',role:'Mechanic',employeeId:'MG-0044',site:'Timmins Project',docs:[],quals:[
      {name:'WHMIS',issued:'2025-09-20',expires:'2026-09-20'}
    ]},
    {id:4,name:'Lisa Carter',role:'Electrician',employeeId:'MG-0045',site:'Kirkland Lake Project',docs:[],quals:[
      {name:'Working at Heights',issued:'2025-05-01',expires:'2028-05-01'}
    ]}
  ],
  tasks:[
    {id:1,name:'Install Rebar',category:'Ground Support',hazards:['Falling ground','Stored energy','Equipment interaction','Line of fire','Pinch points'],controls:['Inspect and scale ground as required','Establish exclusion zone','Inspect installation equipment','Stay clear of line of fire','Use required PPE and communication']},
    {id:2,name:'Bolting',category:'Ground Support',hazards:['Falling ground','Moving equipment','Stored energy','Pinch points','Noise'],controls:['Complete ground assessment','Maintain equipment exclusion zone','Inspect bolter before use','Keep hands clear of pinch points','Wear required hearing protection']},
    {id:3,name:'Haulage',category:'Haulage',hazards:['Mobile equipment interaction','Poor visibility','Traffic congestion','Road conditions','Fatigue'],controls:['Complete pre-op inspection','Follow traffic rules and radio protocol','Maintain safe following distance','Inspect travelway conditions','Stop work if unfit for duty']},
    {id:4,name:'Longhole Drilling',category:'Production',hazards:['Falling ground','Rotating equipment','Stored energy','Pinch points','Line of fire','Noise','Dust'],controls:['Assess ground conditions','Complete pre-op inspection','Establish exclusion zone','Isolate equipment before intervention','Use required PPE','Maintain ventilation and dust controls']},
    {id:5,name:'Mucking',category:'Development',hazards:['Mobile equipment interaction','Poor visibility','Loose ground','Dust','Traffic'],controls:['Inspect work area','Maintain radio communication','Control pedestrian access','Check ventilation','Use lights and warning devices']}
  ],
  records:[
    {id:1,type:'FLRA',title:'Install Rebar',site:'Timmins Project',time:new Date().toISOString(),details:{area:'Level 420 – East Drift'}},
    {id:2,type:'Inspection',title:'MacLean Bolter',site:'Timmins Project',time:new Date().toISOString(),details:{condition:'Pass'}}
  ],
  actions:[
    {id:1,description:'Repair minor hydraulic fitting leak',owner:'Maintenance',site:'Timmins Project',due:'2026-09-12',status:'open'},
    {id:2,description:'Review wet ground control near sump',owner:'Supervisor',site:'Timmins Project',due:'2026-09-10',status:'in_progress'}
  ],
  audit:[],
  offlineQueue:[]
};

let db = load();
let currentWorkerId = null;
let editingTaskId = null;
let reportTab = 'records';

function installRiskAssessmentUI(){
  if(!document.getElementById('riskAssessment')){
    const quick=document.querySelector('#dashboard .quick');
    if(quick && !quick.querySelector('[data-risk-assessment]')){
      const btn=document.createElement('button');
      btn.setAttribute('data-risk-assessment','true');
      btn.innerHTML='⚠️ Pre-Task Risk Assessment';
      btn.onclick=()=>show('riskAssessment');
      const flraBtn=[...quick.querySelectorAll('button')].find(b=>b.textContent.includes('FLRA'));
      if(flraBtn) flraBtn.insertAdjacentElement('afterend',btn); else quick.prepend(btn);
    }
    const preshift=document.getElementById('preshift');
    if(preshift){
      const section=document.createElement('section');
      section.id='riskAssessment'; section.className='screen hidden';
      section.innerHTML=`
        <div class="back" onclick="show('dashboard')">‹ Back</div>
        <h1>Pre-Task Risk Assessment</h1>
        <p class="muted">Identify the hazards, rate the initial risk, apply controls, then confirm the residual risk before work starts.</p>
        <div class="notice small">Uses a demo 5×5 risk matrix. Company/site risk criteria should be configured to match your approved procedure before real-world use.</div>
        <div class="card">
          <label>Task<select id="praTask" onchange="loadRiskTaskTemplate()"></select></label>
          <label>Work Area (required)<input id="praArea" required placeholder="Enter the actual work area"></label>
          <label>Hazards<textarea id="praHazards"></textarea></label>
          <div class="section">Initial Risk</div>
          <label>Likelihood<select id="praInitialLikelihood" onchange="updateRiskScores()"><option value="1">1 - Rare</option><option value="2">2 - Unlikely</option><option value="3" selected>3 - Possible</option><option value="4">4 - Likely</option><option value="5">5 - Almost Certain</option></select></label>
          <label>Severity<select id="praInitialSeverity" onchange="updateRiskScores()"><option value="1">1 - Minor</option><option value="2">2 - Moderate</option><option value="3">3 - Serious</option><option value="4" selected>4 - Major</option><option value="5">5 - Catastrophic</option></select></label>
          <div id="praInitialResult" class="notice"></div>
          <label>Controls<textarea id="praControls"></textarea></label>
          <div class="section">Residual Risk After Controls</div>
          <label>Likelihood<select id="praResidualLikelihood" onchange="updateRiskScores()"><option value="1">1 - Rare</option><option value="2" selected>2 - Unlikely</option><option value="3">3 - Possible</option><option value="4">4 - Likely</option><option value="5">5 - Almost Certain</option></select></label>
          <label>Severity<select id="praResidualSeverity" onchange="updateRiskScores()"><option value="1">1 - Minor</option><option value="2">2 - Moderate</option><option value="3" selected>3 - Serious</option><option value="4">4 - Major</option><option value="5">5 - Catastrophic</option></select></label>
          <div id="praResidualResult" class="notice"></div>
          <p class="notice">An authorized reviewer approves and signs separately using their own account.</p>
          <label>Crew Acknowledgement<input id="praCrew" placeholder="Names of participating crew members"></label>
          <button id="praSubmit" class="btn" onclick="submitRiskAssessment()">Submit for Supervisor Review</button>
        </div>`;
      preshift.insertAdjacentElement('beforebegin',section);
    }
  }
}

function deepCopy(o){ return JSON.parse(JSON.stringify(o)); }
function load(){
  const raw=localStorage.getItem('safeSiteRC');
  if(raw){
    const d=JSON.parse(raw);
    d.tasks = []; d.audit ||= []; d.offlineQueue ||= []; d.users ||= deepCopy(seed.users);
    d.sites ||= deepCopy(seed.sites); d.actions ||= []; d.records ||= []; d.workers ||= [];
    return d;
  }
  return {...deepCopy(seed),tasks:[]};
}
function persist(){ localStorage.setItem('safeSiteRC',JSON.stringify(db)); }

async function login(){
  const client=initSupabase();
  if(!client){ toast('Cloud service did not load. Refresh and try again.'); return; }
  const email=document.getElementById('loginEmail').value.trim();
  const password=document.getElementById('loginPassword').value;
  const status=document.getElementById('loginStatus');
  if(!email||!password){ status.textContent='Enter your email and password.'; return; }
  status.textContent='Signing in…';
  const {data,error}=await client.auth.signInWithPassword({email,password});
  if(error){ status.textContent=error.message; return; }
  cloudUser=data.user;
  try{
    await ensureCloudTenant();
    await loadCloudContext();
    await loadCloudWorkers();
    await loadCloudSafetyData();
  }catch(e){
    console.error(e); status.textContent='Signed in, but Safe Site could not load your company yet.'; return;
  }
  openAuthenticatedApp();
}

async function createAccount(){
  const client=initSupabase();
  if(!client){ toast('Cloud service did not load. Refresh and try again.'); return; }
  const email=document.getElementById('loginEmail').value.trim();
  const password=document.getElementById('loginPassword').value;
  const status=document.getElementById('loginStatus');
  if(!email||password.length<8){ status.textContent='Use a valid email and a password of at least 8 characters.'; return; }
  status.textContent='Creating secure account…';
  const {data,error}=await client.auth.signUp({email,password});
  if(error){ status.textContent=error.message; return; }
  if(!data.session){
    status.textContent='Account created. Check your email for the confirmation link, then return here and sign in.';
    return;
  }
  cloudUser=data.user;
  await ensureCloudTenant();
  await loadCloudContext();
  await loadCloudWorkers();
  await loadCloudSafetyData();
  openAuthenticatedApp();
}

async function ensureCloudTenant(){
  const client=initSupabase();
  const {data:{user}}=await client.auth.getUser();
  if(!user) throw new Error('No authenticated user');
  cloudUser=user;
  await client.from('profiles').upsert({id:user.id,email:user.email,full_name:user.user_metadata?.full_name||''},{onConflict:'id'});
  const {data:existing,error:existingError}=await client.from('organization_memberships').select('organization_id,role').eq('user_id',user.id).eq('active',true).limit(1);
  if(existingError) throw existingError;
  if(existing && existing.length) return;
  const orgId=crypto.randomUUID();
  const siteId=crypto.randomUUID();
  let r=await client.from('organizations').insert({id:orgId,name:'Safe Site Pilot',slug:'safe-site-pilot-'+user.id.slice(0,8)});
  if(r.error) throw r.error;
  r=await client.from('organization_memberships').insert({organization_id:orgId,user_id:user.id,role:'administrator'});
  if(r.error) throw r.error;
  r=await client.from('sites').insert({id:siteId,organization_id:orgId,name:'Timmins Project',location:'Ontario, Canada'});
  if(r.error) throw r.error;
  r=await client.from('site_memberships').insert({site_id:siteId,user_id:user.id});
  if(r.error) throw r.error;
}

async function loadCloudContext(){
  const client=initSupabase();
  const {data:{user}}=await client.auth.getUser();
  if(!user) throw new Error('No session');
  const {data:m,error:me}=await client.from('organization_memberships').select('organization_id,role').eq('user_id',user.id).eq('active',true).limit(1).single();
  if(me) throw me;
  cloudOrganizationId=m.organization_id;
  const [{data:org,error:oe},{data:sites,error:se}]=await Promise.all([
    client.from('organizations').select('name').eq('id',cloudOrganizationId).single(),
    client.from('sites').select('id,name,risk_stop_work_threshold').eq('organization_id',cloudOrganizationId).eq('active',true).order('created_at')
  ]);
  if(oe) throw oe; if(se) throw se;
  db.settings.company=org.name;
  db.settings.role=pretty(m.role);
  db.sites=(sites||[]).map(x=>x.name);
  cloudSiteIds=Object.fromEntries((sites||[]).map(x=>[x.name,x.id]));
  cloudRiskThresholds=Object.fromEntries((sites||[]).map(x=>[x.id,x.risk_stop_work_threshold]));
  if(!db.sites.includes(db.settings.site)) db.settings.site=db.sites[0]||'';
  await loadCloudTaskTemplates();
  persist();
}

async function loadCloudTaskTemplates(){
  const request=++taskLoadSequence;
  const organizationId=cloudOrganizationId, siteId=currentCloudSiteId();
  db.tasks=[];
  taskContext=null;
  taskLoadState='loading';
  refreshTaskForms();
  if(!organizationId||!siteId){taskLoadState='unavailable';refreshTaskForms();return;}
  try{
    const {data,error}=await initSupabase().from('task_templates')
      .select('id,name,category,task_template_hazards(hazard,sort_order),task_template_controls(control,sort_order)')
      .eq('organization_id',organizationId).eq('active',true)
      .or(`site_id.eq.${siteId},site_id.is.null`).order('name');
    if(error)throw error;
    // A slow response from a previous site/session must never replace this site's tasks.
    if(request!==taskLoadSequence||organizationId!==cloudOrganizationId||siteId!==currentCloudSiteId())return;
    const ordered=(rows,key)=>(rows||[]).slice().sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)).map(row=>row[key]);
    db.tasks=(data||[]).map(t=>({id:t.id,name:t.name,category:t.category||'',
      hazards:ordered(t.task_template_hazards,'hazard'),controls:ordered(t.task_template_controls,'control')}));
    taskContext={organizationId,siteId};
    taskLoadState='ready';
  }catch(e){
    if(request!==taskLoadSequence)return;
    taskLoadState='error';
    console.error('Task templates could not load',e);
    toast('Task templates could not load. Re-select your site to retry.');
  }
  refreshTaskForms();
}

function taskTemplatesReady(){
  return taskLoadState==='ready'&&taskContext?.organizationId===cloudOrganizationId&&taskContext?.siteId===currentCloudSiteId();
}
function taskOptions(){
  const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  if(!taskTemplatesReady()||!db.tasks.length){
    const message=taskLoadState==='loading'?'Loading tasks…':taskLoadState==='error'?'Tasks unavailable — re-select site to retry':'No active tasks for this site';
    return `<option value="">${message}</option>`;
  }
  return db.tasks.map(t=>`<option value="${escape(t.id)}">${escape(t.name)}</option>`).join('');
}
function refreshTaskForms(){
  if(document.getElementById('flraTask'))prepFLRA();
  if(document.getElementById('praTask'))prepRiskAssessment();
  if(document.getElementById('psTask'))prepPreShift();
}

async function loadCloudWorkers(){
  if(!cloudOrganizationId) return;
  const client=initSupabase();
  const {data:workers,error}=await client.from('workers')
    .select('id,site_id,employee_number,first_name,last_name,job_title,status,ready_for_work,qualifications(id,name,code,category,issued_on,expires_on,status)')
    .eq('organization_id',cloudOrganizationId).order('created_at');
  if(error) throw error;
  const siteNames=Object.fromEntries(Object.entries(cloudSiteIds).map(([name,id])=>[id,name]));
  db.workers=(workers||[]).map(w=>({
    id:w.id,
    name:[w.first_name,w.last_name].filter(Boolean).join(' '),
    role:w.job_title||'Worker',
    employeeId:w.employee_number||'',
    site:siteNames[w.site_id]||db.settings.site,
    docs:[],
    quals:(w.qualifications||[]).map(q=>({id:q.id,name:q.name,issued:q.issued_on||'',expires:q.expires_on||''}))
  }));
  persist();
}

function cloudRecordDisplayType(recordType){
  const map={
    pre_shift:'Pre-Shift',
    flra:'FLRA',
    pre_task_risk_assessment:'Pre-Task Risk Assessment',
    inspection:'Inspection',
    incident:'Incident',
    near_miss:'Near Miss'
  };
  return map[recordType]||pretty(recordType);
}

async function loadCloudSafetyData(){
  if(!cloudOrganizationId) return;
  const client=initSupabase();
  const [{data:records,error:re},{data:actions,error:ae}]=await Promise.all([
    client.from('safety_records')
      .select('id,site_id,record_type,title,work_area,task_name,data,status,created_at,approved_by,approved_at')
      .eq('organization_id',cloudOrganizationId)
      .order('created_at'),
    client.from('corrective_actions')
      .select('id,site_id,safety_record_id,title,description,priority,status,due_date,created_at,closed_at')
      .eq('organization_id',cloudOrganizationId)
      .order('created_at')
  ]);
  if(re) throw re;
  if(ae) throw ae;
  const siteNames=Object.fromEntries(Object.entries(cloudSiteIds).map(([name,id])=>[id,name]));
  db.records=(records||[]).map(r=>({
    id:r.id,
    type:cloudRecordDisplayType(r.record_type),
    title:r.title||r.task_name||cloudRecordDisplayType(r.record_type),
    site:siteNames[r.site_id]||db.settings.site,
    time:r.created_at,
    details:{...(r.data||{}),area:r.work_area||(r.data||{}).area||''},
    cloudStatus:r.status,
    approvedBy:r.approved_by,
    approvedAt:r.approved_at
  }));
  db.actions=(actions||[]).map(a=>({
    id:a.id,
    description:a.title||a.description||'Corrective action',
    owner:'Supervisor',
    site:siteNames[a.site_id]||db.settings.site,
    due:a.due_date||'',
    status:a.status,
    priority:a.priority,
    safetyRecordId:a.safety_record_id
  }));
  persist();
}

function currentCloudSiteId(){
  return cloudSiteIds[db.settings.site]||null;
}

async function saveCloudSafetyRecord(recordType,title,workArea,taskName,data,status='submitted'){
  const client=initSupabase();
  const siteId=currentCloudSiteId();
  if(!client||!cloudOrganizationId||!siteId) throw new Error('Cloud site is not ready');
  const payload={
    organization_id:cloudOrganizationId,
    site_id:siteId,
    created_by:cloudUser?.id||null,
    record_type:recordType,
    title:title||null,
    work_area:workArea||null,
    task_name:taskName||null,
    data:data||{},
    status
  };
  const {data:row,error}=await client.from('safety_records').insert(payload)
    .select('id,site_id,record_type,title,work_area,task_name,data,status,created_at').single();
  if(error) throw error;
  return row;
}

async function saveCloudCorrectiveAction({title,description='',priority='medium',dueDate=null,safetyRecordId=null}){
  const client=initSupabase();
  const siteId=currentCloudSiteId();
  if(!client||!cloudOrganizationId||!siteId) throw new Error('Cloud site is not ready');
  const {data:row,error}=await client.from('corrective_actions').insert({
    organization_id:cloudOrganizationId,
    site_id:siteId,
    safety_record_id:safetyRecordId,
    title,
    description,
    priority,
    status:'open',
    due_date:dueDate
  }).select('id,site_id,safety_record_id,title,description,priority,status,due_date,created_at').single();
  if(error) throw error;
  return row;
}

function openAuthenticatedApp(){
  installRiskAssessmentUI();
  header.classList.remove('hidden'); nav.classList.remove('hidden'); document.getElementById('login').classList.add('hidden');
  populateSiteSwitcher(); applyPermissions(); updateConnectivity(); show('dashboard');
}

async function signOut(){
  window.clearFieldDrafts?.();
  cancelNewAction();
  if(initSupabase()) await supabaseClient.auth.signOut();
  cloudUser=null; cloudOrganizationId=null; cloudSiteIds={}; cloudRiskThresholds={};
  window.resetAIRiskDraft?.();
  ++taskLoadSequence; db.tasks=[]; taskContext=null; taskLoadState='idle';
  header.classList.add('hidden'); nav.classList.add('hidden');
  document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden'));
  document.getElementById('login').classList.remove('hidden');
  document.getElementById('loginStatus').textContent='Signed out.';
}

async function restoreSession(){
  const client=initSupabase(); if(!client) return;
  const {data:{session}}=await client.auth.getSession();
  if(session?.user){
    cloudUser=session.user;
    try{ await ensureCloudTenant(); await loadCloudContext(); await loadCloudWorkers(); await loadCloudSafetyData(); openAuthenticatedApp(); }
    catch(e){ console.error('Session restore failed',e); }
  }
}
function show(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
  document.querySelectorAll('.nav button').forEach(b=>b.classList.remove('active'));
  const map={dashboard:'n-dashboard',workers:'n-workers',workerEditor:'n-workers',workerDetail:'n-workers',qualificationEditor:'n-workers',
    taskLibrary:'n-flra',taskEditor:'n-flra',flra:'n-flra',riskAssessment:'n-flra',preshift:'n-flra',inspection:'n-flra',incident:'n-flra',
    reports:'n-reports',actions:'n-reports',admin:'n-admin'};
  if(map[id]) document.getElementById(map[id]).classList.add('active');
  if(id==='dashboard') renderDashboard();
  if(id==='workers') renderWorkers();
  if(id==='workerEditor') prepWorkerEditor();
  if(id==='workerDetail') renderWorkerDetail();
  if(id==='flra') prepFLRA();
  if(id==='riskAssessment') prepRiskAssessment();
  if(id==='preshift') prepPreShift();
  if(id==='taskLibrary') renderTaskLibrary();
  if(id==='actions') renderActions();
  if(id==='reports') renderReports();
  if(id==='admin') renderAdmin();
  window.scrollTo(0,0);
}
function toast(msg){
  const t=document.getElementById('toast'); t.textContent=msg; t.style.display='block';
  setTimeout(()=>t.style.display='none',1800);
}
function nowISO(){ return new Date().toISOString(); }
function logAudit(action,entity,detail=''){
  db.audit.unshift({time:nowISO(),user:db.settings.role,action,entity,detail,site:db.settings.site});
  if(db.audit.length>250) db.audit=db.audit.slice(0,250);
}
function saveAndQueue(kind,payload){
  if(!navigator.onLine){
    db.offlineQueue.push({kind,payload,time:nowISO()});
    toast('Saved offline — will sync when service returns');
  }
  persist();
}
function updateConnectivity(){
  const online=navigator.onLine;
  syncBadge.textContent=online?(cloudUser?'Cloud':'Online'):'Offline';
  syncBadge.className='badge '+(online?'ok':'warn');
  if(online && db.offlineQueue.length){
    const count=db.offlineQueue.length; db.offlineQueue=[]; persist(); toast(`${count} offline item${count>1?'s':''} synced`);
  }
}
window.addEventListener('online',updateConnectivity);
window.addEventListener('offline',updateConnectivity);

function qualificationStatus(q){
  if(!q.expires) return 'valid';
  const exp=new Date(q.expires+'T23:59:59');
  const days=Math.ceil((exp-TODAY)/(1000*60*60*24));
  if(days<0) return 'expired';
  if(days<=90) return 'expiring';
  return 'valid';
}
function workerStatus(w){
  if(!w.quals || !w.quals.length) return 'noncompliant';
  const sts=w.quals.map(qualificationStatus);
  if(sts.includes('expired')) return 'noncompliant';
  if(sts.includes('expiring')) return 'expiring';
  return 'compliant';
}
function badge(status){
  if(status==='compliant'||status==='valid'||status==='closed') return `<span class="badge ok">${pretty(status)}</span>`;
  if(status==='expiring'||status==='in_progress') return `<span class="badge warn">${pretty(status)}</span>`;
  if(status==='noncompliant'||status==='expired'||status==='open') return `<span class="badge bad">${pretty(status)}</span>`;
  return `<span class="badge info">${pretty(status)}</span>`;
}
function pretty(x){ return String(x).replaceAll('_',' ').replace(/\b\w/g,m=>m.toUpperCase()); }

function populateSiteSwitcher(){
  siteSwitcher.innerHTML=db.sites.map(s=>`<option ${s===db.settings.site?'selected':''}>${s}</option>`).join('');
}
async function switchSite(){
  window.clearFieldDrafts?.();
  cancelNewAction();
  db.settings.site=siteSwitcher.value;
  const loading=loadCloudTaskTemplates();
  persist(); show('dashboard');
  await loading;
}
function currentWorkers(){ return db.workers.filter(w=>w.site===db.settings.site); }

function renderDashboard(){
  const hour=new Date().getHours();
  document.getElementById('dashboardGreeting').textContent=hour<12?'Good Morning':hour<18?'Good Afternoon':'Good Evening';
  const workers=currentWorkers();
  const ready=workers.filter(w=>workerStatus(w)==='compliant').length;
  const exp=workers.filter(w=>workerStatus(w)==='expiring').length;
  const bad=workers.filter(w=>workerStatus(w)==='noncompliant').length;
  const compliance=workers.length?Math.round(ready/workers.length*100):0;
  readyCount.textContent=ready; expiringCount.textContent=exp; issueCount.textContent=bad;
  actionCount.textContent=db.actions.filter(a=>a.site===db.settings.site&&a.status!=='closed').length;
  companyCtx.textContent=db.settings.company; roleCtx.textContent=`${db.settings.role} · ${db.settings.site}`;
  complianceBadge.textContent=`${compliance}% compliant`; complianceBar.style.width=`${compliance}%`;
  complianceBadge.className='badge '+(compliance>=90?'ok':compliance>=75?'warn':'bad');
  dashboardActions.innerHTML=db.actions.filter(a=>a.site===db.settings.site&&a.status!=='closed').slice(0,3).map(a=>
    `<div class="item"><b>${a.description}</b><div class="small muted">${a.owner} · Due ${a.due} · ${pretty(a.status)}</div></div>`
  ).join('')||'<div class="muted">No open corrective actions.</div>';
  activity.innerHTML=db.records.filter(r=>r.site===db.settings.site).slice(-6).reverse().map(r=>
    `<div class="item"><b>${r.type}</b><div class="small muted">${r.title} · ${new Date(r.time).toLocaleString()}</div></div>`
  ).join('')||'<div class="muted">No activity yet.</div>';
}

function renderWorkers(){
  const q=(workerSearch.value||'').toLowerCase();
  workersList.innerHTML='';
  currentWorkers().filter(w=>(w.name+' '+w.role+' '+w.employeeId).toLowerCase().includes(q)).forEach(w=>{
    const d=document.createElement('div'); d.className='card worker';
    d.innerHTML=`<div class="row"><div class="avatar">👷</div><div class="grow"><b>${w.name}</b><div class="small muted">${w.role} · ${w.employeeId}</div></div>${badge(workerStatus(w))}</div>`;
    d.onclick=()=>{currentWorkerId=w.id; show('workerDetail')}; workersList.appendChild(d);
  });
}
function prepWorkerEditor(){
  workerEditorTitle.textContent='Add Worker'; workerName.value='';workerRole.value='';workerId.value='';
  workerSite.innerHTML=db.sites.map(s=>`<option ${s===db.settings.site?'selected':''}>${s}</option>`).join('');
}
async function saveWorker(){
  if(!workerName.value.trim()||!workerRole.value.trim()||!workerId.value.trim()){toast('Name, role and employee ID are required');return}
  if(!cloudUser||!cloudOrganizationId){toast('Cloud connection required');return}
  const parts=workerName.value.trim().split(/\s+/); const firstName=parts.shift(); const lastName=parts.join(' ')||'-';
  const siteId=cloudSiteIds[workerSite.value]||null;
  const {data,error}=await initSupabase().from('workers').insert({
    organization_id:cloudOrganizationId,site_id:siteId,employee_number:workerId.value.trim(),
    first_name:firstName,last_name:lastName,job_title:workerRole.value.trim(),status:'active'
  }).select('id').single();
  if(error){toast(error.message.includes('duplicate')?'Employee ID already exists':'Could not save worker');console.error(error);return}
  logAudit('created','worker',workerName.value.trim());
  await loadCloudWorkers();
  currentWorkerId=data.id;
  toast('Worker saved to cloud');show('workers');
}
function renderWorkerDetail(){
  const w=db.workers.find(x=>x.id===currentWorkerId); if(!w){show('workers');return}
  workerDetailCard.innerHTML=`<div class="card"><div class="row"><div class="avatar">👷</div><div class="grow"><h2 style="margin-bottom:2px">${w.name}</h2><div class="muted">${w.role}<br>${w.employeeId}<br>${w.site}</div></div>${badge(workerStatus(w))}</div></div>`;
  qualList.innerHTML=(w.quals||[]).map(q=>{
    const st=qualificationStatus(q);
    return `<div class="item row"><span class="check ${st!=='valid'?'warn':''}">${st==='valid'?'✓':'!'}</span><div class="grow"><b>${q.name}</b><div class="small muted">Expires ${q.expires||'No expiry'}</div></div>${badge(st)}</div>`
  }).join('')||'<div class="muted">No qualifications added.</div>';
  workerDocs.innerHTML=(w.docs||[]).map(d=>`<div class="item"><b>${d.name}</b><div class="small muted">${d.type||'Document'} · added ${new Date(d.added).toLocaleDateString()}</div></div>`).join('')||'<div class="muted">No documents attached.</div>';
}
async function saveQualification(){
  const w=db.workers.find(x=>x.id===currentWorkerId); if(!w)return;
  if(!qualName.value.trim()){toast('Qualification name is required');return}
  if(!cloudUser||!cloudOrganizationId){toast('Cloud connection required');return}
  const {error}=await initSupabase().from('qualifications').insert({
    organization_id:cloudOrganizationId,worker_id:w.id,name:qualName.value.trim(),
    issued_on:qualIssued.value||null,expires_on:qualExpiry.value||null,status:'valid'
  });
  if(error){toast('Could not save qualification');console.error(error);return}
  logAudit('created','qualification',`${w.name}: ${qualName.value.trim()}`);
  await loadCloudWorkers();
  toast('Qualification saved to cloud');show('workerDetail');
}
function attachWorkerDocument(){
  const f=workerDocInput.files[0],w=db.workers.find(x=>x.id===currentWorkerId); if(!f||!w)return;
  w.docs.push({name:f.name,type:f.type,size:f.size,added:nowISO()});
  logAudit('attached','worker document',`${w.name}: ${f.name}`); persist(); renderWorkerDetail(); toast('Document attached in demo storage');
}

function prepFLRA(){
  populateTaskSelect();
  loadTaskTemplate();
}
function populateTaskSelect(){
  const selected=flraTask.value;
  flraTask.innerHTML=taskOptions();
  if(selected && db.tasks.some(t=>String(t.id)===String(selected))) flraTask.value=selected;
}
function loadTaskTemplate(){
  const t=db.tasks.find(x=>String(x.id)===String(flraTask.value));
  flraHazards.value=t?.hazards.join('\n')||''; flraControls.value=t?.controls.join('\n')||'';
}
function renderTaskLibrary(){
  const q=(taskSearch.value||'').toLowerCase(); taskLibraryList.innerHTML='';
  db.tasks.filter(t=>(t.name+' '+t.category).toLowerCase().includes(q)).forEach(t=>{
    const d=document.createElement('div');d.className='card worker';
    d.innerHTML=`<div class="row"><div class="grow"><b>${t.name}</b><div class="small muted">${t.category} · ${t.hazards.length} hazards · ${t.controls.length} controls</div></div><span class="badge info">Template</span></div>`;
    d.onclick=()=>editTask(t.id);taskLibraryList.appendChild(d);
  });
}
function newTask(){
  editingTaskId=null; taskEditorTitle.textContent='Add Task'; editTaskName.value=''; editTaskCategory.value='Other';editTaskHazards.value='';editTaskControls.value='';deleteTaskBtn.classList.add('hidden');show('taskEditor');
}
function editTask(id){
  const t=db.tasks.find(x=>x.id===id); if(!t)return; editingTaskId=id;taskEditorTitle.textContent='Edit Task';editTaskName.value=t.name;editTaskCategory.value=t.category;editTaskHazards.value=t.hazards.join('\n');editTaskControls.value=t.controls.join('\n');deleteTaskBtn.classList.remove('hidden');show('taskEditor');
}
function saveTask(){
  const name=editTaskName.value.trim(); if(!name){toast('Task name is required');return}
  const obj={name,category:editTaskCategory.value,hazards:editTaskHazards.value.split('\n').map(x=>x.trim()).filter(Boolean),controls:editTaskControls.value.split('\n').map(x=>x.trim()).filter(Boolean)};
  if(editingTaskId){Object.assign(db.tasks.find(t=>t.id===editingTaskId),obj);logAudit('updated','task template',name)}
  else{obj.id=crypto.randomUUID();db.tasks.push(obj);logAudit('created','task template',name)}
  saveAndQueue('task',obj);toast('Task saved');show('taskLibrary');
}
function deleteTask(){
  if(editingTaskId===null)return;if(!confirm('Delete this task template?'))return;
  const t=db.tasks.find(x=>x.id===editingTaskId);db.tasks=db.tasks.filter(x=>x.id!==editingTaskId);logAudit('deleted','task template',t?.name||'');persist();toast('Task deleted');show('taskLibrary');
}
async function submitFLRA(){
  if(!['Administrator','Supervisor','Safety Coordinator','Worker'].includes(db.settings.role)){
    toast('Your role does not have permission for that action');return;
  }
  const area=flraArea.value.trim();
  if(!area){toast('Enter the actual Work Area before submitting');flraArea.focus();return;}
  const t=db.tasks.find(x=>String(x.id)===String(flraTask.value));
  if(!taskTemplatesReady()||!t){toast('Select an active task for this site before submitting');return;}
  const details={area,hazards:flraHazards.value,controls:flraControls.value,crew:flraCrew.value};
  try{
    const row=await saveCloudSafetyRecord('flra',t.name,area,t.name,details);
    await loadCloudSafetyData();
    logAudit('submitted','FLRA',t?.name||'Custom Task');
    toast('FLRA saved to cloud');
    show('dashboard');
  }catch(e){
    console.error(e); toast('FLRA could not save to cloud');
  }
}

function riskLevel(score){
  if(score<=4) return 'Low';
  if(score<=9) return 'Medium';
  if(score<=16) return 'High';
  return 'Critical';
}
function riskClass(level){
  if(level==='Low') return 'ok';
  if(level==='Medium') return 'warn';
  return 'bad';
}
function riskScore(likelihood,severity){ return Number(likelihood)*Number(severity); }
function updateRiskScores(){
  const initial=riskScore(praInitialLikelihood.value,praInitialSeverity.value);
  const residual=riskScore(praResidualLikelihood.value,praResidualSeverity.value);
  const initialLevel=riskLevel(initial), residualLevel=riskLevel(residual);
  praInitialResult.innerHTML=`<div class="row"><div class="grow"><b>Initial Risk</b><div class="small muted">Likelihood × Severity = ${initial}</div></div><span class="badge ${riskClass(initialLevel)}">${initialLevel}</span></div>`;
  praResidualResult.innerHTML=`<div class="row"><div class="grow"><b>Residual Risk</b><div class="small muted">Likelihood × Severity = ${residual}</div></div><span class="badge ${riskClass(residualLevel)}">${residualLevel}</span></div>`;
}
function prepRiskAssessment(){
  praTask.innerHTML=taskOptions();
  loadRiskTaskTemplate();
  updateRiskScores();
}
function loadRiskTaskTemplate(){
  window.resetAIRiskDraft?.();
  const t=db.tasks.find(x=>String(x.id)===String(praTask.value));
  praHazards.value=t?.hazards.join('\n')||'';
  praControls.value=t?.controls.join('\n')||'';
}
function currentRiskStopWorkThreshold(){
  return Number(cloudRiskThresholds[currentCloudSiteId()])||10;
}
let riskAssessmentSubmitting=false;
async function submitRiskAssessment(){
  if(riskAssessmentSubmitting)return;
  if(!['Administrator','Supervisor','Safety Coordinator','Worker'].includes(db.settings.role)){
    toast('Your role does not have permission for that action');return;
  }
  const area=praArea.value.trim();
  if(!area){toast('Work Area is required');praArea.focus();return;}
  const t=db.tasks.find(x=>String(x.id)===String(praTask.value));
  if(!taskTemplatesReady()||!t){toast('Wait for cloud task templates to load before submitting');return;}
  if(!praHazards.value.trim()){toast('Add at least one hazard');return}
  if(!praControls.value.trim()){toast('Add controls before submitting');return}
  const ratings=[praInitialLikelihood,praInitialSeverity,praResidualLikelihood,praResidualSeverity].map(el=>Number(el.value));
  if(ratings.some(n=>!Number.isInteger(n)||n<1||n>5)){toast('Choose valid likelihood and severity ratings');return;}
  const initialScore=riskScore(praInitialLikelihood.value,praInitialSeverity.value);
  const residualScore=riskScore(praResidualLikelihood.value,praResidualSeverity.value);
  if(residualScore>=currentRiskStopWorkThreshold()){
    toast('STOP — additional controls and reassessment are required before submission');return;
  }
  const initialLevel=riskLevel(initialScore), residualLevel=riskLevel(residualScore);
  const title=t.name;
  const details={
    area,hazards:praHazards.value.trim(),controls:praControls.value.trim(),taskTemplateId:t.id,
    initialLikelihood:Number(praInitialLikelihood.value),initialSeverity:Number(praInitialSeverity.value),initialScore,initialLevel,
    residualLikelihood:Number(praResidualLikelihood.value),residualSeverity:Number(praResidualSeverity.value),residualScore,residualLevel,
    crew:praCrew.value
  };
  riskAssessmentSubmitting=true;
  const button=document.getElementById('praSubmit');
  if(button)button.disabled=true;
  try{
    const row=await saveCloudSafetyRecord('pre_task_risk_assessment',title,area,title,details,'pending_review');
    praArea.value='';
    try{await loadCloudSafetyData();}catch(e){console.error(e);}
    logAudit('submitted','pre-task risk assessment',`${title}: ${initialLevel} → ${residualLevel}`);
    toast('Risk assessment submitted — Pending Supervisor Review');
    show('dashboard');
    return row;
  }catch(e){
    console.error(e); toast('Risk assessment could not save to cloud');
  }finally{
    riskAssessmentSubmitting=false;
    if(button)button.disabled=false;
  }
}
function prepPreShift(){
  psTask.innerHTML=taskOptions();
  const load=()=>{
    const t=taskTemplatesReady()?db.tasks.find(t=>String(t.id)===String(psTask.value)):null;
    psHazards.value=t?.hazards.join('\n')||'';
    psControls.value=t?.controls.join('\n')||'';
  };
  load();
  psTask.onchange=load;
}
let preShiftSubmitting=false;
async function submitPreShift(){
  if(preShiftSubmitting)return;
  if(!['Administrator','Supervisor','Safety Coordinator','Worker'].includes(db.settings.role)){
    toast('Your role does not have permission for that action');return;
  }
  const area=psArea.value.trim();
  if(!area){toast('Work Area is required');psArea.focus();return;}
  const t=db.tasks.find(x=>String(x.id)===String(psTask.value));
  if(!taskTemplatesReady()||!t){toast('Wait for cloud task templates to load before submitting');return;}
  if(!psHazards.value.trim()||!psControls.value.trim()){toast('Hazards and controls are required');return;}
  const title=t.name;
  const details={crew:psCrew.value,area,hazards:psHazards.value.trim(),controls:psControls.value.trim(),taskTemplateId:t.id};
  preShiftSubmitting=true;
  const button=document.getElementById('psSubmit');
  if(button)button.disabled=true;
  try{
    await saveCloudSafetyRecord('pre_shift',title,area,title,details,'pending_review');
    psArea.value='';
    logAudit('submitted','pre-shift',title);
    try{await loadCloudSafetyData();}catch(e){console.error(e);}
    toast('Pre-shift submitted — Pending Supervisor Review');
    show('dashboard');
  }catch(e){
    console.error(e); toast('Pre-shift could not save to cloud');
  }finally{
    preShiftSubmitting=false;
    if(button)button.disabled=false;
  }
}

function canApprovePreShift(){
  return ['Administrator','Supervisor','Safety Coordinator'].includes(db.settings.role);
}
function preShiftStatusLabel(record){
  return record.cloudStatus==='approved'&&record.approvedBy&&record.approvedAt?'Approved':'Pending Supervisor Review';
}
function requiresSafetyReview(record){
  return ['Pre-Shift','Pre-Task Risk Assessment'].includes(record.type);
}
function preShiftReviewHTML(record){
  const esc=value=>String(value||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  if(!requiresSafetyReview(record))return '';
  const approved=preShiftStatusLabel(record)==='Approved';
  return `<div class="card"><h2>${preShiftStatusLabel(record)}</h2>${approved?
    `<p>Signed by authenticated account <strong>${esc(record.approvedBy)}</strong></p><p>${esc(new Date(record.approvedAt).toLocaleString())}</p>`:
    `<p>This submission has not been approved. An authorized reviewer must review the work area, hazards and controls below before signing.</p>${canApprovePreShift()&&record.cloudStatus==='pending_review'?
      `<button id="approvePreShiftButton" class="btn" onclick="approvePreShift('${esc(record.id)}','${record.type==='Pre-Shift'?'pre_shift':'pre_task_risk_assessment'}')">Approve &amp; Sign as My Account</button>`:''}`}</div>`;
}
const preShiftApprovals=new Set();
async function approvePreShift(id,recordType='pre_shift'){
  if(!['pre_shift','pre_task_risk_assessment'].includes(recordType))return;
  if(!canApprovePreShift()){toast('Your role cannot approve safety records');return;}
  if(preShiftApprovals.has(id))return;
  preShiftApprovals.add(id);
  const button=document.getElementById('approvePreShiftButton');
  if(button)button.disabled=true;
  try{
    const client=initSupabase();
    const {data:auth,error:authError}=await client.auth.getUser();
    if(authError||!auth?.user)throw new Error('Sign in required');
    // Send only the transition. The database validates membership and stamps identity/time.
    const {data:row,error}=await client.from('safety_records').update({status:'approved'})
      .eq('id',id).eq('organization_id',cloudOrganizationId).eq('record_type',recordType)
      .eq('status','pending_review').select('id,approved_by,approved_at').single();
    if(error||!row?.approved_by||!row?.approved_at)throw error||new Error('Approval not saved');
    try{
      await loadCloudSafetyData();
      if(typeof openRecordDetail==='function')await openRecordDetail(id);
      toast(`${recordType==='pre_shift'?'Pre-shift':'Risk assessment'} approved and signed`);
    }catch(e){
      console.error(e);
      toast('Approval saved. Reload to see the signed record.');
    }
  }catch(e){
    console.error(e);
    toast('Approval could not complete. Refresh the record and check your access; it may already be approved.');
  }finally{
    preShiftApprovals.delete(id);
    if(button)button.disabled=false;
  }
}
// Inspection and incident submission handlers live in field-submissions.js.

function renderActions(){
  actionsList.innerHTML=db.actions.filter(a=>a.site===db.settings.site).map(a=>`<div class="card"><div class="row"><div class="grow"><b>${a.description}</b><div class="small muted">${a.owner} · Due ${a.due}</div></div>${badge(a.status)}</div><div class="quick" style="margin-top:10px"><button onclick="setAction('${a.id}','in_progress')">Start</button><button onclick="setAction('${a.id}','closed')">Close</button></div></div>`).join('')||'<div class="card muted">No corrective actions.</div>';
}
let newActionContext=null,newActionSaving=false;
function cancelNewAction(){
  newActionContext=null;
  document.getElementById('actionCreateForm').classList.add('hidden');
  document.getElementById('actionCreateTitle').value='';
  document.getElementById('actionCreateDescription').value='';
}
function addAction(){
  if(!canManageCorrectiveActions()){toast('Your role cannot create corrective actions');return;}
  if(newActionSaving)return;
  if(!cloudOrganizationId||!currentCloudSiteId()){toast('Wait for your cloud site to load');return;}
  if(!newActionContext){
    newActionContext={organization:cloudOrganizationId,site:currentCloudSiteId()};
    document.getElementById('actionCreatePriority').value='medium';
    document.getElementById('actionCreateDue').value=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
  }
  document.getElementById('actionCreateSite').textContent=`Site: ${db.settings.site}`;
  document.getElementById('actionCreateForm').classList.remove('hidden');
  document.getElementById('actionCreateTitle').focus();
}
async function submitNewAction(){
  if(!canManageCorrectiveActions()){toast('Your role cannot create corrective actions');return;}
  if(newActionSaving)return;
  const context=newActionContext;
  if(!context||context.organization!==cloudOrganizationId||context.site!==currentCloudSiteId()){
    cancelNewAction();toast('Open a new action for your current site');return;
  }
  const title=document.getElementById('actionCreateTitle').value.trim();
  const description=document.getElementById('actionCreateDescription').value.trim();
  const priority=document.getElementById('actionCreatePriority').value;
  const dueDate=document.getElementById('actionCreateDue').value||null;
  if(!title||title.length>200||description.length>4000){toast('Enter an action of up to 200 characters and a description of up to 4000 characters');return;}
  if(!['low','medium','high','critical'].includes(priority)){toast('Choose a valid priority');return;}
  if(dueDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)||!Number.isFinite(Date.parse(dueDate))||new Date(dueDate).toISOString().slice(0,10)!==dueDate)){
    toast('Enter a valid due date');return;
  }
  const button=document.getElementById('actionCreateSubmit');
  newActionSaving=true;button.disabled=true;
  try{
    const row=await saveCloudCorrectiveAction({title,description,priority,dueDate});
    if(!row?.id)throw new Error('Cloud save did not return an action');
    if(newActionContext!==context)return;
    cancelNewAction();
    logAudit('created','corrective action',title);
    try{await loadCloudSafetyData();renderActions();toast('Corrective action saved to cloud');}
    catch(e){console.error(e);toast('Action saved, but the list could not refresh. Reload to see it.');}
  }catch(e){console.error(e);if(newActionContext===context)toast('Corrective action could not save. Your entries are kept for retry.');}
  finally{newActionSaving=false;button.disabled=false;}
}
async function setAction(id,status){
  if(!canManageCorrectiveActions()){toast('Your role cannot change corrective actions');return;}
  if(status==='closed')return window.openActionDetail?.(id);
  if(status!=='in_progress')return;
  const a=db.actions.find(x=>String(x.id)===String(id));if(!a)return;
  if(a.status!=='open'){toast('Refresh the action before changing its status');return;}
  const client=initSupabase();
  const {data:row,error}=await client.from('corrective_actions').update({status}).eq('id',id)
    .eq('organization_id',cloudOrganizationId).eq('status','open').select('id,status').single();
  if(error||!row){console.error(error);toast('Action could not update. Refresh and check your access.');return}
  await loadCloudSafetyData();
  logAudit('updated','corrective action',`${a.description}: ${status}`);
  renderActions();toast('Corrective action updated in cloud');
}
function canManageCorrectiveActions(){
  return ['Administrator','Supervisor','Safety Coordinator'].includes(db.settings.role);
}

function setReportTab(tab,btn){
  reportTab=tab;document.querySelectorAll('.tabs button').forEach(b=>b.classList.remove('active'));btn.classList.add('active');renderReports();
}
function renderReports(){
  const workers=currentWorkers();const ready=workers.filter(w=>workerStatus(w)==='compliant').length;
  rWorkers.textContent=workers.length;rCompliance.textContent=(workers.length?Math.round(ready/workers.length*100):0)+'%';
  rRecords.textContent=db.records.filter(r=>r.site===db.settings.site).length;
  rActions.textContent=db.actions.filter(a=>a.site===db.settings.site&&a.status!=='closed').length;
  if(reportTab==='records') reportsBody.innerHTML=db.records.filter(r=>r.site===db.settings.site).slice().reverse().map(r=>`<div class="item"><b>${r.type}: ${r.title}</b><div class="small muted">${new Date(r.time).toLocaleString()}</div></div>`).join('')||'<div class="muted">No records.</div>';
  if(reportTab==='actions') reportsBody.innerHTML=db.actions.filter(a=>a.site===db.settings.site).map(a=>`<div class="item"><b>${a.description}</b><div class="small muted">${a.owner} · ${a.due} · ${pretty(a.status)}</div></div>`).join('')||'<div class="muted">No actions.</div>';
  if(reportTab==='audit') reportsBody.innerHTML=db.audit.filter(a=>a.site===db.settings.site).slice(0,50).map(a=>`<div class="item"><b>${pretty(a.action)} ${a.entity}</b><div class="small muted">${a.detail} · ${new Date(a.time).toLocaleString()}</div></div>`).join('')||'<div class="muted">No audit activity.</div>';
}
function exportJSON(){
  const blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json'});downloadBlob(blob,'safe-site-export.json');
}
function exportWorkersCSV(){
  const rows=[['name','role','employee_id','site','status']];
  db.workers.forEach(w=>rows.push([w.name,w.role,w.employeeId,w.site,workerStatus(w)]));
  const csv=rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');
  downloadBlob(new Blob([csv],{type:'text/csv'}),'safe-site-workers.csv');
}
function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}

function renderAdmin(){
  companyName.value=db.settings.company;currentSiteName.value=db.settings.site;currentRole.value=db.settings.role;
  sitesAdmin.innerHTML=db.sites.map(s=>`<div class="item">${s}</div>`).join('');
  usersAdmin.innerHTML=db.users.map(u=>`<div class="item"><b>${u.name}</b><div class="small muted">${u.email} · ${u.role}</div></div>`).join('');
}
function saveAdminSettings(){
  db.settings.company=companyName.value.trim()||db.settings.company;db.settings.role=currentRole.value;
  const renamed=currentSiteName.value.trim();if(renamed&&renamed!==db.settings.site){const i=db.sites.indexOf(db.settings.site);if(i>=0)db.sites[i]=renamed;db.workers.forEach(w=>{if(w.site===db.settings.site)w.site=renamed});db.records.forEach(r=>{if(r.site===db.settings.site)r.site=renamed});db.actions.forEach(a=>{if(a.site===db.settings.site)a.site=renamed});db.settings.site=renamed;}
  logAudit('updated','settings',db.settings.company);persist();populateSiteSwitcher();applyPermissions();toast('Settings saved');
}
function addSite(){const s=prompt('Site name');if(!s)return;if(!db.sites.includes(s))db.sites.push(s);logAudit('created','site',s);persist();populateSiteSwitcher();renderAdmin();toast('Site added');}
function inviteUser(){const name=prompt('User name');if(!name)return;const email=prompt('Email');if(!email)return;const role=prompt('Role','Supervisor')||'Supervisor';db.users.push({name,email,role});logAudit('invited','user',email);persist();renderAdmin();toast('User invite added');}
function importWorkersCSV(){
  const f=csvInput.files[0];if(!f)return;
  const reader=new FileReader();reader.onload=()=>{const lines=reader.result.split(/\r?\n/).filter(Boolean);if(lines.length<2)return;const headers=lines[0].split(',').map(x=>x.replaceAll('"','').trim().toLowerCase());
    let added=0;for(const line of lines.slice(1)){const vals=line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)||[];const row={};headers.forEach((h,i)=>row[h]=(vals[i]||'').replace(/^"|"$/g,'').trim());if(!row.name||!row.employee_id)continue;
      db.workers.push({id:Math.max(0,...db.workers.map(w=>w.id||0))+1,name:row.name,role:row.role||'Worker',employeeId:row.employee_id,site:row.site||db.settings.site,quals:[],docs:[]});added++;}
    logAudit('imported','workers',`${added} workers`);persist();toast(`${added} workers imported`);renderAdmin();};reader.readAsText(f);
}
function resetDemo(){if(confirm('Reset all Safe Site demo data?')){db=deepCopy(seed);persist();populateSiteSwitcher();applyPermissions();toast('Demo reset');show('dashboard')}}

function applyPermissions(){
  const r=db.settings.role;const admin=r==='Administrator', safety=r==='Safety Coordinator', supervisor=r==='Supervisor', worker=r==='Worker', viewer=r==='Client Viewer';
  addWorkerBtn.style.display=(admin||safety)?'block':'none';
  addQualBtn.style.display=(admin||safety)?'block':'none';
  uploadDocBox.style.display=(admin||safety)?'block':'none';
  manageTaskBtn.style.display=(admin||safety)?'block':'none';
  addTaskBtn.style.display=(admin||safety)?'block':'none';
  addActionBtn.style.display=(admin||safety||supervisor)?'block':'none';
  document.getElementById('n-admin').style.display=(viewer||worker)?'none':'block';
  document.getElementById('n-reports').style.display=worker?'none':'block';
}
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('service-worker.js').catch(()=>{}));}
window.addEventListener('load',restoreSession);
