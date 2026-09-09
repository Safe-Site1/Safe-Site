
const TODAY = new Date();

const SUPABASE_URL = 'https://dfuelhonvhoqvipwzcpp.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_rov8STHxS842ZUsGKmdkgQ_d3fp5Xsd';
let supabaseClient = null;
let cloudUser = null;
let cloudOrganizationId = null;
let cloudSiteIds = {};

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
          <label>Work Area<input id="praArea" value="Level 420 – East Drift"></label>
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
          <label>Supervisor Sign-off<input id="praSupervisor" value="Demo Supervisor"></label>
          <label>Crew Acknowledgement<input id="praCrew" placeholder="John Smith, Sarah Johnson"></label>
          <button class="btn" onclick="submitRiskAssessment()">Submit Pre-Task Risk Assessment</button>
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
    d.tasks ||= deepCopy(seed.tasks); d.audit ||= []; d.offlineQueue ||= []; d.users ||= deepCopy(seed.users);
    d.sites ||= deepCopy(seed.sites); d.actions ||= []; d.records ||= []; d.workers ||= [];
    return d;
  }
  return deepCopy(seed);
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
    client.from('sites').select('id,name').eq('organization_id',cloudOrganizationId).eq('active',true).order('created_at')
  ]);
  if(oe) throw oe; if(se) throw se;
  db.settings.company=org.name;
  db.settings.role=pretty(m.role);
  if(sites?.length){
    db.sites=sites.map(x=>x.name);
    cloudSiteIds=Object.fromEntries(sites.map(x=>[x.name,x.id]));
    if(!db.sites.includes(db.settings.site)) db.settings.site=db.sites[0];
  }
  persist();
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

function openAuthenticatedApp(){
  installRiskAssessmentUI();
  header.classList.remove('hidden'); nav.classList.remove('hidden'); document.getElementById('login').classList.add('hidden');
  populateSiteSwitcher(); applyPermissions(); updateConnectivity(); show('dashboard');
}

async function signOut(){
  if(initSupabase()) await supabaseClient.auth.signOut();
  cloudUser=null; cloudOrganizationId=null; cloudSiteIds={};
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
    try{ await ensureCloudTenant(); await loadCloudContext(); await loadCloudWorkers(); openAuthenticatedApp(); }
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
function switchSite(){ db.settings.site=siteSwitcher.value; persist(); show('dashboard'); }
function currentWorkers(){ return db.workers.filter(w=>w.site===db.settings.site); }

function renderDashboard(){
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
  flraTask.innerHTML=db.tasks.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
  if(selected && db.tasks.some(t=>String(t.id)===String(selected))) flraTask.value=selected;
}
function loadTaskTemplate(){
  const t=db.tasks.find(x=>String(x.id)===String(flraTask.value)); if(!t)return;
  flraHazards.value=t.hazards.join('\n'); flraControls.value=t.controls.join('\n');
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
  else{obj.id=Math.max(0,...db.tasks.map(t=>t.id||0))+1;db.tasks.push(obj);logAudit('created','task template',name)}
  saveAndQueue('task',obj);toast('Task saved');show('taskLibrary');
}
function deleteTask(){
  if(editingTaskId===null)return;if(!confirm('Delete this task template?'))return;
  const t=db.tasks.find(x=>x.id===editingTaskId);db.tasks=db.tasks.filter(x=>x.id!==editingTaskId);logAudit('deleted','task template',t?.name||'');persist();toast('Task deleted');show('taskLibrary');
}
function submitFLRA(){
  const t=db.tasks.find(x=>String(x.id)===String(flraTask.value));
  const rec={id:Math.max(0,...db.records.map(r=>r.id||0))+1,type:'FLRA',title:t?.name||'Custom Task',site:db.settings.site,time:nowISO(),details:{area:flraArea.value,hazards:flraHazards.value,controls:flraControls.value,crew:flraCrew.value}};
  db.records.push(rec);logAudit('submitted','FLRA',rec.title);saveAndQueue('record',rec);toast('FLRA submitted');show('dashboard');
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
  praTask.innerHTML=db.tasks.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
  loadRiskTaskTemplate();
  updateRiskScores();
}
function loadRiskTaskTemplate(){
  const t=db.tasks.find(x=>String(x.id)===String(praTask.value)); if(!t)return;
  praHazards.value=t.hazards.join('\n');
  praControls.value=t.controls.join('\n');
}
function submitRiskAssessment(){
  const t=db.tasks.find(x=>String(x.id)===String(praTask.value));
  if(!praHazards.value.trim()){toast('Add at least one hazard');return}
  if(!praControls.value.trim()){toast('Add controls before submitting');return}
  const initialScore=riskScore(praInitialLikelihood.value,praInitialSeverity.value);
  const residualScore=riskScore(praResidualLikelihood.value,praResidualSeverity.value);
  const initialLevel=riskLevel(initialScore), residualLevel=riskLevel(residualScore);
  const rec={id:Math.max(0,...db.records.map(r=>r.id||0))+1,type:'Pre-Task Risk Assessment',title:t?.name||'Custom Task',site:db.settings.site,time:nowISO(),details:{
    area:praArea.value,hazards:praHazards.value,controls:praControls.value,
    initialLikelihood:Number(praInitialLikelihood.value),initialSeverity:Number(praInitialSeverity.value),initialScore,initialLevel,
    residualLikelihood:Number(praResidualLikelihood.value),residualSeverity:Number(praResidualSeverity.value),residualScore,residualLevel,
    supervisor:praSupervisor.value,crew:praCrew.value
  }};
  db.records.push(rec);
  if(residualScore>=10){
    db.actions.push({id:Math.max(0,...db.actions.map(a=>a.id||0))+1,description:`Review ${residualLevel} residual risk before work: ${rec.title}`,owner:praSupervisor.value||'Supervisor',site:db.settings.site,due:new Date().toISOString().slice(0,10),status:'open'});
  }
  logAudit('submitted','pre-task risk assessment',`${rec.title}: ${initialLevel} → ${residualLevel}`);
  saveAndQueue('record',rec);
  toast(residualScore>=10?`${residualLevel} residual risk saved — review required`:'Pre-Task Risk Assessment submitted');
  show('dashboard');
}
function prepPreShift(){
  psTask.innerHTML=db.tasks.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
  const t=db.tasks[0]; if(t){psHazards.value=t.hazards.join('\n');psControls.value=t.controls.join('\n')}
  psTask.onchange=()=>{const x=db.tasks.find(t=>String(t.id)===String(psTask.value));if(x){psHazards.value=x.hazards.join('\n');psControls.value=x.controls.join('\n')}};
}
function submitPreShift(){
  const t=db.tasks.find(x=>String(x.id)===String(psTask.value));
  const rec={id:Math.max(0,...db.records.map(r=>r.id||0))+1,type:'Pre-Shift',title:t?.name||'Task',site:db.settings.site,time:nowISO(),details:{crew:psCrew.value,area:psArea.value,hazards:psHazards.value,controls:psControls.value,supervisor:psSupervisor.value}};
  db.records.push(rec);logAudit('submitted','pre-shift',rec.title);saveAndQueue('record',rec);toast('Pre-shift submitted');show('dashboard');
}
function submitInspection(){
  const rec={id:Math.max(0,...db.records.map(r=>r.id||0))+1,type:'Inspection',title:inspEquip.value,site:db.settings.site,time:nowISO(),details:{condition:inspCond.value,notes:inspNotes.value,photo:inspPhoto.files[0]?.name||null}};
  db.records.push(rec);
  if(inspCond.value!=='Pass'){
    db.actions.push({id:Math.max(0,...db.actions.map(a=>a.id||0))+1,description:`Inspection deficiency: ${inspEquip.value}`,owner:'Supervisor',site:db.settings.site,due:new Date(Date.now()+7*86400000).toISOString().slice(0,10),status:'open'});
  }
  logAudit('submitted','inspection',inspEquip.value);saveAndQueue('record',rec);toast('Inspection submitted');show('dashboard');
}
function submitIncident(){
  const rec={id:Math.max(0,...db.records.map(r=>r.id||0))+1,type:incType.value,title:incLocation.value||incType.value,site:db.settings.site,time:nowISO(),details:{description:incDesc.value,immediateAction:incAction.value,people:incPeople.value,photo:incPhoto.files[0]?.name||null}};
  db.records.push(rec);logAudit('submitted',incType.value,rec.title);saveAndQueue('record',rec);toast('Report submitted');show('dashboard');
}

function renderActions(){
  actionsList.innerHTML=db.actions.filter(a=>a.site===db.settings.site).map(a=>`<div class="card"><div class="row"><div class="grow"><b>${a.description}</b><div class="small muted">${a.owner} · Due ${a.due}</div></div>${badge(a.status)}</div><div class="quick" style="margin-top:10px"><button onclick="setAction(${a.id},'in_progress')">Start</button><button onclick="setAction(${a.id},'closed')">Close</button></div></div>`).join('')||'<div class="card muted">No corrective actions.</div>';
}
function addAction(){
  const d=prompt('Corrective action');if(!d)return;const owner=prompt('Owner','Supervisor')||'Supervisor';
  const due=prompt('Due date (YYYY-MM-DD)',new Date(Date.now()+7*86400000).toISOString().slice(0,10))||'';
  const a={id:Math.max(0,...db.actions.map(a=>a.id||0))+1,description:d,owner,site:db.settings.site,due,status:'open'};
  db.actions.push(a);logAudit('created','corrective action',d);saveAndQueue('action',a);renderActions();toast('Action added');
}
function setAction(id,status){const a=db.actions.find(x=>x.id===id);if(!a)return;a.status=status;logAudit('updated','corrective action',`${a.description}: ${status}`);saveAndQueue('action',a);renderActions();}

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
