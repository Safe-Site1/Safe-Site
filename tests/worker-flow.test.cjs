const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const source=name=>fs.readFileSync(path.join(root,name),'utf8');

test('qualification expiry uses current calendar day, including yesterday, today and 90-day boundary',()=>{
 const f=fixture();let now='2026-09-25T12:00:00';
 f.ctx.Date=class extends Date{constructor(...args){super(...(args.length?args:[now]));}};
 assert.equal(f.ctx.qualificationStatus({expires:'2026-09-24'}),'expired');
 assert.equal(f.ctx.qualificationStatus({expires:'2026-09-25'}),'expiring');
 assert.equal(f.ctx.qualificationStatus({expires:'2026-12-24'}),'expiring');
 assert.equal(f.ctx.qualificationStatus({expires:'2026-12-25'}),'valid');
 now='2026-09-26T00:01:00';
 assert.equal(f.ctx.qualificationStatus({expires:'2026-09-25'}),'expired');
 assert.equal(f.ctx.qualificationStatus({expires:''}),'valid');
});

test('required training warning boundary survives the autumn daylight-saving change',()=>{
 const oldTZ=process.env.TZ;process.env.TZ='America/Toronto';
 try{
  const f=fixture();f.ctx.Date=class extends Date{constructor(...args){super(...(args.length?args:['2026-10-15T12:00:00']));}};
  f.load('qualification-requirements.js');
  const api=f.ctx.SafeSiteQualificationRequirements;
  api.requirements['DST Site']={Miner:[{qualification_name:'First Aid',warning_days:30}]};
  const result=api.evaluateWorker({site:'DST Site',role:'Miner',quals:[{name:'First Aid',expires:'2026-11-14'}]});
  assert.equal(result.requirements[0].days,30);assert.equal(result.requirements[0].status,'expiring');
 }finally{if(oldTZ===undefined)delete process.env.TZ;else process.env.TZ=oldTZ;}
});

test('cloud task edits create new versions and retain inputs on save failure',async()=>{
 const f=fixture();f.load('cloud-task-editor.js');f.run("db.settings.role='Administrator';db.tasks=[{id:'old',siteId:'site-a',version:1,name:'Old',category:'Other',hazards:['H'],controls:['C']}]");
 f.ctx.editTask('old');f.element('editTaskName').value='Changed';let first,second;
 f.client.rpc=async(name,p)=>{first=p;return {error:{message:'Offline'}};};await f.ctx.saveTask();
 assert.notEqual(first.p_id,'old');assert.equal(first.p_previous,'old');assert.equal(first.p_version,1);assert.equal(f.element('editTaskName').value,'Changed');
 f.client.rpc=async(name,p)=>{second=p;return {data:p.p_id};};f.ctx.loadCloudTaskTemplates=async()=>{};await f.ctx.saveTask();assert.equal(second.p_id,first.p_id);
});

test('workers, supervisors and viewers cannot edit cloud task templates',async()=>{
 for(const role of ['Worker','Supervisor','Client Viewer']){
  const f=fixture();f.load('cloud-task-editor.js');f.run(`db.settings.role=${JSON.stringify(role)}`);let calls=0;f.client.rpc=async()=>{calls++;};
  f.ctx.newTask();await f.ctx.saveTask();await f.ctx.deleteTask();assert.equal(calls,0);
 }
});

test('reconnecting preserves unsent local items and never claims they synced',()=>{
 const f=fixture();f.run("db.offlineQueue=[{kind:'task',payload:{name:'Unsent'}}]");
 f.ctx.updateConnectivity();assert.equal(f.run('db.offlineQueue.length'),1);
 assert.match(f.messages.at(-1),/have not been uploaded/);
});

test('customer projects require admin and preserve the same create ID after uncertain saves',async()=>{
 const f=fixture();f.load('customer-projects.js');f.run("cloudUser={id:'admin'}");
 f.element('newProjectName').value='Customer Project';let calls=[];
 f.client.rpc=async(name,p)=>{calls.push(p);return {error:{message:'Lost response'}};};
 await f.ctx.addSite();assert.equal(calls.length,0);
 f.run("db.settings.role='Administrator'");await f.ctx.addSite();await f.ctx.addSite();
 assert.equal(calls[0].p_id,calls[1].p_id);assert.equal(calls[0].p_org,'org');assert.equal(f.element('newProjectName').value,'Customer Project');
 f.client.rpc=async(name,p)=>({data:p.p_id});f.ctx.loadCloudContext=async()=>{throw new Error('Refresh failed');};
 await f.ctx.addSite();assert.match(f.element('projectSaveStatus').textContent,/Project saved/);assert.equal(f.element('newProjectName').value,'');
});

test('project rename sends stable site ID and cannot change the role',async()=>{
 const f=fixture();f.load('customer-projects.js');f.run("cloudUser={id:'admin'};db.settings.role='Administrator'");
 f.element('currentSiteName').value='Client B & North';f.element('companyName').value='Client B';f.element('currentRole').value='Worker';
 let payload;f.client.rpc=async(name,p)=>{payload=p;return {data:p.p_id};};f.ctx.loadCloudContext=async()=>{throw new Error('Refresh failed');};
 await f.ctx.saveAdminSettings();assert.equal(payload.p_id,'site-a');assert.equal(payload.p_name,'Client B & North');assert.equal(payload.p_company,'Client B');assert.equal(f.run('db.settings.role'),'Administrator');
 assert.equal(f.ctx.escapeProjectName('<East & West>'),'&lt;East &amp; West&gt;');
});

test('photo uploads validate type, size and signatures and hash identical bytes consistently',async()=>{
  const f=fixture();f.load('record-photos.js');
  const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
  const photo={type:'image/png',size:bytes.length,arrayBuffer:async()=>bytes};
  const name=await f.ctx.SafeSitePhotos.photoInfo(photo);assert.match(name,/^[a-f0-9]{64}\.png$/);
  assert.equal(await f.ctx.SafeSitePhotos.photoInfo(photo),name);
  await assert.rejects(f.ctx.SafeSitePhotos.photoInfo({...photo,type:'image/svg+xml'}),/Choose a/);
  await assert.rejects(f.ctx.SafeSitePhotos.photoInfo({...photo,size:10485761}),/10 MB/);
  await assert.rejects(f.ctx.SafeSitePhotos.photoInfo({...photo,type:'image/jpeg'}),/contents do not match/);
});

test('reload restores the exact uncertain report and retires recovery after confirmation',async()=>{
  const session=new Map(),first=fixture({session});first.run("cloudUser={id:'worker'}");first.load('field-submissions.js');
  first.element('incType').value='Near Miss';first.element('incLocation').value='Bay';first.element('incDesc').value='Original';
  let original;first.client.rpc=async(name,p)=>{original=p;return {error:{message:'Lost response'}};};
  await first.ctx.submitIncident();assert.equal(session.size,1);
  const next=fixture({session});next.run("cloudUser={id:'worker'}");next.load('field-submissions.js');next.ctx.show('incident');
  assert.equal(next.element('incDesc').value,'Original');assert.equal(next.element('incDesc').disabled,true);
  next.client.rpc=async(name,p)=>{assert.deepEqual(JSON.parse(JSON.stringify(p)),JSON.parse(JSON.stringify(original)));return {data:p.p_id};};
  await next.ctx.submitIncident();assert.equal(session.size,0);assert.equal(next.element('incDesc').value,'');
});

test('recovery is isolated by account/site and sign-out clears only recovery keys',async()=>{
  const session=new Map([['unrelated','keep']]),f=fixture({session});f.run("cloudUser={id:'worker'}");f.load('field-submissions.js');
  f.element('incType').value='Incident';f.element('incLocation').value='Bay';f.element('incDesc').value='Private report';
  f.client.rpc=async()=>({error:{message:'Offline'}});await f.ctx.submitIncident();
  f.ctx.clearFieldDrafts();f.run("db.settings.site='B'");f.ctx.show('incident');assert.equal(f.element('incDesc').value,'');
  f.run("db.settings.site='A';cloudUser={id:'different'}");f.ctx.show('incident');assert.equal(f.element('incDesc').value,'');
  f.run("cloudUser={id:'worker'}");f.ctx.show('incident');assert.equal(f.element('incDesc').value,'Private report');
  f.ctx.clearFieldDrafts(true);assert.equal(session.size,1);assert.equal(session.get('unrelated'),'keep');
});

test('blocked session storage prevents sending a report without reload recovery',async()=>{
  const f=fixture();f.run("cloudUser={id:'worker'}");f.load('field-submissions.js');
  f.element('incType').value='Incident';f.element('incLocation').value='Bay';f.element('incDesc').value='Test';
  f.ctx.sessionStorage.setItem=()=>{throw new Error('Blocked');};let calls=0;f.client.rpc=async()=>{calls++;};
  await f.ctx.submitIncident();assert.equal(calls,0);assert.match(f.element('incidentRecovery').textContent,/Nothing was sent/);
});

test('a later permission rejection does not discard an earlier uncertain submission',async()=>{
  const session=new Map(),f=fixture({session});f.run("cloudUser={id:'worker'}");f.load('field-submissions.js');
  f.element('incType').value='Incident';f.element('incLocation').value='Bay';f.element('incDesc').value='Test';
  f.client.rpc=async()=>({error:{message:'Response lost'}});await f.ctx.submitIncident();
  const original=[...session.values()][0];f.client.rpc=async()=>({error:{code:'42501'}});await f.ctx.submitIncident();
  assert.equal(session.size,1);assert.equal([...session.values()][0],original);assert.equal(f.element('incDesc').disabled,true);
});

test('field submissions validate, deduplicate clicks and retry uncertain saves with unchanged ID',async()=>{
  const f=fixture();f.run("cloudUser={id:'worker'}");f.load('field-submissions.js');
  f.element('inspEquip').value='Bolter';f.element('inspCond').value='Deficiency Found';
  const calls=[];let release;f.client.rpc=async(name,args)=>{calls.push(args);return new Promise(r=>release=r);};
  await f.ctx.submitInspection();assert.equal(calls.length,0);
  f.element('inspArea').value=' Area ';await f.ctx.submitInspection();assert.equal(calls.length,0);
  f.element('inspNotes').value='Pilot defect';
  const first=f.ctx.submitInspection();await f.ctx.submitInspection();assert.equal(calls.length,1);
  release({error:{message:'Response lost'}});await first;assert.equal(f.element('inspArea').disabled,true);
  f.element('inspNotes').value='Tampered while pending';
  f.client.rpc=async(name,args)=>{calls.push(args);return {data:args.p_id,error:null};};
  await f.ctx.submitInspection();assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);
  assert.equal(calls[0].p_area,'Area');assert.equal(calls[0].p_data.notes,'Pilot defect');
  assert.equal(f.element('inspArea').value,'');assert.equal(f.element('inspArea').disabled,false);
});

test('field submission rejection allows correction; successful save with refresh failure does not invite retry',async()=>{
  const f=fixture();f.run("cloudUser={id:'worker'}");f.load('field-submissions.js');
  f.element('incType').value='Near Miss';f.element('incLocation').value='Bay';f.element('incDesc').value='Pilot near miss';
  f.client.rpc=async()=>({error:{code:'23514',message:'Invalid details'}});
  await f.ctx.submitIncident();assert.equal(f.element('incDesc').disabled,false);assert.equal(f.element('incDesc').value,'Pilot near miss');
  f.client.rpc=async(name,args)=>({data:args.p_id});f.ctx.loadCloudSafetyData=async()=>{throw new Error('Refresh failed');};
  await f.ctx.submitIncident();assert.equal(f.element('incDesc').value,'');assert.match(f.messages.at(-1),/Report saved/);
});

test('field submission guards Client Viewer and missing authentication, and does not silently save filename-only photos',async()=>{
  const f=fixture();f.load('field-submissions.js');let calls=0;f.client.rpc=async()=>{calls++;};
  f.run("db.settings.role='Client Viewer';cloudUser={id:'viewer'}");await f.ctx.submitIncident();await f.ctx.submitInspection();
  f.run("db.settings.role='Worker';cloudUser=null");await f.ctx.submitIncident();
  f.run("cloudUser={id:'worker'}");f.element('incType').value='Incident';f.element('incLocation').value='Bay';f.element('incDesc').value='Test';
  f.element('incPhoto').files=[{name:'not-uploaded.jpg'}];await f.ctx.submitIncident();assert.equal(calls,0);assert.match(f.messages.at(-1),/Photo uploads/);
});

test('site/signout draft reset ignores a late field submission response',async()=>{
  const f=fixture();f.run("cloudUser={id:'worker'}");f.load('field-submissions.js');let release;
  f.element('incType').value='Incident';f.element('incLocation').value='Bay';f.element('incDesc').value='Test';
  f.client.rpc=async(name,args)=>new Promise(r=>{release=()=>r({data:args.p_id});});
  const pending=f.ctx.submitIncident();f.ctx.clearFieldDrafts();f.run("db.settings.site='B'");
  f.element('incDesc').value='New site draft';release();await pending;
  assert.equal(f.element('incDesc').value,'New site draft');assert.equal(f.ctx.lastScreen,undefined);
});

test('manual actions validate dates, preserve failed drafts and block duplicate in-flight saves',async()=>{
  const f=fixture();f.run("db.settings.role='Supervisor'");f.ctx.addAction();
  f.element('actionCreateTitle').value='Test action';f.element('actionCreateDescription').value='Details';
  f.element('actionCreateDue').value='2026-02-30';let calls=0,release;
  f.ctx.saveCloudCorrectiveAction=async()=>{calls++;return new Promise(resolve=>{release=resolve;});};
  await f.ctx.submitNewAction();assert.equal(calls,0);
  f.element('actionCreateDue').value='2026-09-30';
  const pending=f.ctx.submitNewAction();await f.ctx.submitNewAction();assert.equal(calls,1);
  release(null);await pending;assert.equal(f.element('actionCreateTitle').value,'Test action');
  f.ctx.saveCloudCorrectiveAction=async()=>({id:'saved'});
  f.ctx.loadCloudSafetyData=async()=>{throw new Error('Refresh unavailable');};
  await f.ctx.submitNewAction();assert.equal(f.element('actionCreateTitle').value,'');
  assert.match(f.messages.at(-1),/Action saved, but the list could not refresh/);
});

test('manual action drafts cannot submit into a different site',async()=>{
  const f=fixture();f.run("db.settings.role='Supervisor'");f.ctx.addAction();
  f.element('actionCreateTitle').value='Site A draft';let calls=0;
  f.ctx.saveCloudCorrectiveAction=async()=>{calls++;return {id:'saved'};};
  f.run("db.settings.site='B'");await f.ctx.submitNewAction();
  assert.equal(calls,0);assert.equal(f.element('actionCreateTitle').value,'');
});

function fixture({storage=new Map(),session=new Map(),url='https://safe-site.test/',hour=9}={}){
  const elements=new Map(),listeners=new Map(),queries=[],saved=[],messages=[];
  const element=id=>{
    if(!elements.has(id))elements.set(id,{id,value:'',style:{},textContent:'',className:'',
      classList:{add(){},remove(){},toggle(){},contains(){return false;}},
      focus(){this.focused=true;},querySelectorAll(){return [];},appendChild(){},
      set innerHTML(html){this.html=html;if(/Task$/.test(id))this.value=html.match(/<option value="([^"]*)"/)?.[1]||'';},
      get innerHTML(){return this.html||'';}});
    return elements.get(id);
  };
  const location=new URL(url);
  class Clock extends Date{getHours(){return hour;}}
  const ctx=vm.createContext({console:{error(){}},URL,URLSearchParams,Date:Clock,crypto:require('node:crypto'),
    navigator:{onLine:true},location,history:{replaceState(a,b,next){location.href=new URL(next,location).href;}},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    sessionStorage:{getItem:key=>session.get(key)||null,setItem:(key,value)=>session.set(key,value),removeItem:key=>session.delete(key),get length(){return session.size;},key:i=>[...session.keys()][i]},
    document:{getElementById:element,querySelectorAll:()=>[],querySelector:()=>null,createElement:()=>element('new')},
    setTimeout:()=>0,setInterval:()=>0,scrollTo(){},
    addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},
    removeEventListener(type,fn){listeners.get(type)?.delete(fn);},
  });
  ctx.window=ctx;
  for(const match of source('index.html').matchAll(/id="([^"]+)"/g))ctx[match[1]]=element(match[1]);
  const run=code=>vm.runInContext(code,ctx);
  const load=name=>run(source(name));
  load('app.js');
  ctx.toast=msg=>messages.push(msg);
  ctx.show=id=>{ctx.lastScreen=id;};
  ctx.logAudit=()=>{};
  ctx.loadCloudSafetyData=async()=>{};
  ctx.saveCloudSafetyRecord=async(...args)=>{saved.push(args);return {id:'record'};};
  const client={auth:{getUser:async()=>({data:{user:{id:'worker'}}}),getSession:async()=>({data:{session:null}})},
    rpc:async()=>({error:null}),from(table){
      const query={table,filters:[],select(columns){this.columns=columns;return this;},eq(...args){this.filters.push(args);return this;},
        or(filter){this.scope=filter;return this;},order(column){this.orderBy=column;queries.push(this);return client.result(this);}};
      return query;
    },result:async()=>({data:[],error:null})};
  ctx.initSupabase=()=>client;
  run("cloudOrganizationId='org';cloudSiteIds={A:'site-a',B:'site-b'};db.settings.site='A';db.settings.role='Worker';");
  return {ctx,run,load,client,queries,saved,messages,element,listeners,storage,location};
}
const task={id:'cloud-uuid',name:'Site task <test>',category:'Mining',
  task_template_hazards:[{hazard:'Second',sort_order:2},{hazard:'First',sort_order:1}],
  task_template_controls:[{control:'Control B',sort_order:2},{control:'Control A',sort_order:1}]};
async function ready(f){f.client.result=async()=>({data:[task],error:null});await f.ctx.loadCloudTaskTemplates();}

test('invitation survives sign-up confirmation, reload and failed acceptance; clears only on success',async()=>{
  const storage=new Map();
  const first=fixture({storage,url:'https://safe-site.test/?invite=token&view=welcome#confirm'});
  first.load('invitation-bootstrap-guard.js');
  first.load('team-permissions.js');
  first.element('loginEmail').value='worker@example.test';first.element('loginPassword').value='test-password';
  first.client.auth.signUp=async()=>({data:{session:null},error:null});
  await first.ctx.createAccount();
  assert.equal(storage.get('safeSitePendingInvitation'),'token');
  const returned=fixture({storage,url:'https://safe-site.test/?view=welcome#confirm'});
  let bootstraps=0;returned.ctx.ensureCloudTenant=async()=>bootstraps++;
  returned.load('invitation-bootstrap-guard.js');
  returned.client.rpc=async()=>({error:new Error('temporary failure')});
  await assert.rejects(returned.ctx.ensureCloudTenant(),/temporary failure/);
  assert.equal(storage.get('safeSitePendingInvitation'),'token');assert.equal(bootstraps,0);
  let accepts=0;
  returned.client.rpc=async(name,args)=>{assert.equal(name,'accept_team_invitation');assert.equal(args.p_token,'token');accepts++;return {error:null};};
  await returned.ctx.ensureCloudTenant();
  assert.equal(storage.has('safeSitePendingInvitation'),false);assert.equal(accepts,1);assert.equal(bootstraps,1);
  assert.equal(returned.location.search,'?view=welcome');assert.equal(returned.location.hash,'#confirm');
});

test('lost invitation acceptance response retries the receipt and clears pending token only after confirmation',async()=>{
  const storage=new Map(),f=fixture({storage,url:'https://safe-site.test/?invite=receipt'});
  let accepted=false,writes=0,bootstraps=0;
  f.ctx.ensureCloudTenant=async()=>bootstraps++;
  f.load('invitation-bootstrap-guard.js');
  f.client.rpc=async(name,args)=>{
    assert.equal(name,'accept_team_invitation');assert.equal(args.p_token,'receipt');
    if(!accepted){accepted=true;writes++;return {error:new Error('Response lost after commit')};}
    return {data:[{organization_id:'org',role:'worker',site_id:'site-a'}],error:null};
  };
  await assert.rejects(f.ctx.ensureCloudTenant(),/Response lost/);
  assert.equal(storage.get('safeSitePendingInvitation'),'receipt');assert.equal(bootstraps,0);
  await f.ctx.ensureCloudTenant();
  assert.equal(writes,1);assert.equal(bootstraps,1);
  assert.equal(storage.has('safeSitePendingInvitation'),false);assert.equal(f.location.search,'');
});

test('guard replaces the registered restore handler and restores invitation before tenant bootstrap',async()=>{
  const f=fixture({url:'https://safe-site.test/?invite=token&keep=yes'}),events=[];
  const old=f.ctx.restoreSession;
  f.ctx.ensureCloudTenant=async()=>events.push('tenant');
  f.ctx.loadCloudContext=async()=>events.push('context');f.ctx.loadCloudWorkers=async()=>{};
  f.ctx.openAuthenticatedApp=()=>events.push('open');
  f.client.auth.getSession=async()=>({data:{session:{user:{id:'worker'}}}});
  f.client.rpc=async()=>{events.push('accept');return {error:null};};
  f.load('invitation-bootstrap-guard.js');
  assert.equal(f.listeners.get('load').has(old),false);
  for(const handler of f.listeners.get('load'))await handler();
  assert.deepEqual(events,['accept','tenant','context','open']);
  assert.equal(f.location.search,'?keep=yes');
});

test('login and tenant guard share one acceptance; concurrent acceptance is deduplicated',async()=>{
  const f=fixture({url:'https://safe-site.test/?invite=token'});let accepts=0;
  f.ctx.ensureCloudTenant=async()=>{};f.ctx.loadCloudContext=async()=>{};f.ctx.loadCloudWorkers=async()=>{};f.ctx.openAuthenticatedApp=()=>{};
  f.client.auth.signInWithPassword=async()=>({data:{user:{id:'worker'}},error:null});
  f.client.rpc=async()=>{accepts++;return {error:null};};
  f.load('invitation-bootstrap-guard.js');f.load('team-permissions.js');
  f.element('loginEmail').value='worker@example.test';f.element('loginPassword').value='test-password';
  await f.ctx.login();assert.equal(accepts,1);
  f.storage.set('safeSitePendingInvitation','next');
  await Promise.all([f.ctx.SafeSiteInvitationGuard.accept(),f.ctx.SafeSiteInvitationGuard.accept()]);
  assert.equal(accepts,2);
});

test('unauthenticated invitation is retained and cannot bootstrap a tenant',async()=>{
  const f=fixture({url:'https://safe-site.test/?invite=token'});
  f.load('invitation-bootstrap-guard.js');f.client.auth.getUser=async()=>({data:{user:null}});
  await assert.rejects(f.ctx.ensureCloudTenant(),/Sign in required/);
  assert.equal(f.storage.get('safeSitePendingInvitation'),'token');
});

test('tasks come from active org/site including shared templates, with ordered children and escaped names',async()=>{
  const f=fixture();assert.equal(f.run('db.tasks.length'),0);await ready(f);
  assert.equal(f.queries[0].table,'task_templates');
  assert.deepEqual(f.queries[0].filters,[['organization_id','org'],['active',true]]);
  assert.equal(f.queries[0].scope,'site_id.eq.site-a,site_id.is.null');
  assert.match(f.queries[0].columns,/task_template_hazards\(hazard,sort_order\)/);
  assert.match(f.queries[0].columns,/task_template_controls\(control,sort_order\)/);
  for(const prefix of ['flra','pra','ps']){
    assert.equal(f.element(prefix+'Hazards').value,'First\nSecond');
    assert.equal(f.element(prefix+'Controls').value,'Control A\nControl B');
    assert.match(f.element(prefix+'Task').innerHTML,/&lt;test&gt;/);
  }
});

test('cached demo tasks are ignored; empty/error loads clear previous task details and block submission',async()=>{
  const storage=new Map([['safeSiteRC',JSON.stringify({settings:{site:'A'},tasks:[{id:1,name:'Demo'}]})]]);
  const f=fixture({storage});assert.equal(f.run('db.tasks.length'),0);
  await ready(f);f.client.result=async()=>({data:[],error:null});await f.ctx.loadCloudTaskTemplates();
  assert.equal(f.element('flraHazards').value,'');assert.match(f.element('flraTask').innerHTML,/No active tasks/);
  await ready(f);f.client.result=async()=>({error:new Error('denied')});await f.ctx.loadCloudTaskTemplates();
  assert.equal(f.run('db.tasks.length'),0);assert.equal(f.element('flraControls').value,'');
  f.element('flraArea').value='Actual area';await f.ctx.submitFLRA();assert.equal(f.saved.length,0);
});

test('site switch clears tasks immediately and ignores late responses from the previous site',async()=>{
  const f=fixture(),pending=[];f.client.result=()=>new Promise(resolve=>pending.push(resolve));
  const a=f.ctx.loadCloudTaskTemplates();
  f.element('siteSwitcher').value='B';const b=f.ctx.switchSite();
  assert.equal(f.run('db.tasks.length'),0);
  pending[1]({data:[{...task,id:'site-b-task'}]});await b;
  pending[0]({data:[task]});await a;
  assert.equal(f.run('db.tasks[0].id'),'site-b-task');assert.equal(f.queries[1].scope,'site_id.eq.site-b,site_id.is.null');
});

test('missing active site cannot load another site or submit',async()=>{
  const f=fixture();await ready(f);f.run('cloudSiteIds={};');await f.ctx.loadCloudTaskTemplates();
  assert.equal(f.run('db.tasks.length'),0);assert.equal(f.queries.length,1);
  f.element('flraArea').value='Actual area';await f.ctx.submitFLRA();assert.equal(f.saved.length,0);
});

test('Worker FLRA requires a nonblank Work Area and saves trimmed area with cloud task hazards/controls',async()=>{
  const f=fixture();await ready(f);
  for(const area of ['', '   ', '\n\t']){f.element('flraArea').value=area;await f.ctx.submitFLRA();}
  assert.equal(f.saved.length,0);assert.equal(f.element('flraArea').focused,true);
  f.element('flraArea').value='  North workshop  ';await f.ctx.submitFLRA();
  assert.equal(f.saved.length,1);assert.equal(f.saved[0][2],'North workshop');assert.equal(f.saved[0][3],task.name);
  assert.equal(f.saved[0][4].hazards,'First\nSecond');assert.equal(f.ctx.lastScreen,'dashboard');
});

test('Client Viewer cannot submit FLRA, and existing Worker/Client Viewer screen and task-edit guards hold',async()=>{
  const f=fixture();await ready(f);f.run("db.settings.role='Client Viewer'");
  f.element('flraArea').value='Actual area';await f.ctx.submitFLRA();assert.equal(f.saved.length,0);
  f.load('role-access-v4.js');f.ctx.safeSitePermissions.refresh();
  assert.equal(f.ctx.safeSitePermissions.canOpen('flra'),false);
  assert.equal(f.ctx.safeSitePermissions.canOpen('reports'),true);
  f.run("db.settings.role='Worker'");f.ctx.safeSitePermissions.refresh();
  assert.equal(f.ctx.safeSitePermissions.canOpen('flra'),true);
  for(const screen of ['admin','team','reports','taskLibrary','taskEditor','qualificationEditor'])assert.equal(f.ctx.safeSitePermissions.canOpen(screen),false);
  f.load('cloud-task-editor.js');
  const before=f.run('JSON.stringify(db.tasks)');await f.ctx.saveTask();await f.ctx.deleteTask();assert.equal(f.run('JSON.stringify(db.tasks)'),before);
  f.load('worker-permissions-fix.js');
  for(const handler of f.listeners.get('load')){if(handler!==f.ctx.restoreSession)handler();}
  assert.equal(f.element('n-reports').style.display,'none');assert.equal(f.element('n-admin').style.display,'none');
});

for(const [hour,greeting] of [[0,'Good Morning'],[11,'Good Morning'],[12,'Good Afternoon'],[17,'Good Afternoon'],[18,'Good Evening'],[23,'Good Evening']]){
  test(`dashboard greeting at ${hour}:00`,()=>{const f=fixture({hour});f.ctx.renderDashboard();assert.equal(f.element('dashboardGreeting').textContent,greeting);});
}

test('production forms have no demo area/person defaults; FLRA input is required',()=>{
  for(const name of ['app.js','index.html','team-permissions.js'])assert.doesNotMatch(source(name),/(?:value|placeholder)="(?:Level 420 – East Drift|John Smith, Sarah Johnson|Demo Supervisor)"/);
  assert.match(source('index.html'),/id="flraArea" required/);
});

test('all shipped JavaScript parses, including the worker permission module',()=>{
  for(const name of fs.readdirSync(root).filter(name=>name.endsWith('.js')))new vm.Script(source(name),{filename:name});
});

test('Pre-Shift requires Work Area, hazards, controls and a current cloud task',async()=>{
  const f=fixture();await ready(f);
  for(const area of ['', '   ', '\n\t']){f.element('psArea').value=area;await f.ctx.submitPreShift();}
  assert.equal(f.saved.length,0);assert.equal(f.element('psArea').focused,true);
  f.element('psArea').value=' Work bay ';
  f.element('psHazards').value=' ';await f.ctx.submitPreShift();assert.equal(f.saved.length,0);
  await ready(f);f.element('psControls').value=' ';await f.ctx.submitPreShift();assert.equal(f.saved.length,0);
  await ready(f);f.element('psTask').value='not-a-task';await f.ctx.submitPreShift();assert.equal(f.saved.length,0);
  await ready(f);f.run("db.settings.site='B'");await f.ctx.submitPreShift();assert.equal(f.saved.length,0);
});

for(const role of ['Worker','Supervisor','Administrator','Safety Coordinator']){
  test(`${role} submits Pre-Shift pending review without signature fields`,async()=>{
    const f=fixture();await ready(f);f.run(`db.settings.role=${JSON.stringify(role)}`);
    f.element('psArea').value='  Actual bay  ';await f.ctx.submitPreShift();
    assert.equal(f.saved.length,1);const args=f.saved[0];
    assert.equal(args[0],'pre_shift');assert.equal(args[2],'Actual bay');assert.equal(args[5],'pending_review');
    assert.equal(args[4].taskTemplateId,task.id);assert.equal(args[4].hazards,'First\nSecond');
    assert.equal(args[4].controls,'Control A\nControl B');assert.equal('supervisor' in args[4],false);
    assert.equal(f.element('psArea').value,'');assert.match(f.messages.at(-1),/Pending Supervisor Review/);
  });
}

test('Pre-Shift blocks Client Viewer and unknown roles; repeated clicks submit once',async()=>{
  const f=fixture();await ready(f);f.element('psArea').value='Area';
  for(const role of ['Client Viewer','Unknown']){f.run(`db.settings.role=${JSON.stringify(role)}`);await f.ctx.submitPreShift();}
  assert.equal(f.saved.length,0);f.run("db.settings.role='Worker'");
  let resolve;f.ctx.saveCloudSafetyRecord=()=>new Promise(r=>resolve=r);
  const first=f.ctx.submitPreShift();assert.equal(f.element('psSubmit').disabled,true);
  await f.ctx.submitPreShift();resolve({id:'one'});await first;assert.equal(f.element('psSubmit').disabled,false);
});

test('failed pre-shift save preserves entry and allows retry; refresh failure does not invite duplicate',async()=>{
  const f=fixture();await ready(f);f.element('psArea').value='Area';
  f.ctx.saveCloudSafetyRecord=async()=>{throw new Error('offline');};await f.ctx.submitPreShift();
  assert.equal(f.element('psArea').value,'Area');assert.equal(f.element('psSubmit').disabled,false);
  f.ctx.saveCloudSafetyRecord=async()=>({id:'ok'});f.ctx.loadCloudSafetyData=async()=>{throw new Error('refresh');};
  await f.ctx.submitPreShift();assert.equal(f.element('psArea').value,'');assert.match(f.messages.at(-1),/submitted/);
});

test('Pre-Shift form has no typed sign-off; review renders safe status and only staff can sign',()=>{
  assert.doesNotMatch(source('index.html'),/psSupervisor/);assert.match(source('index.html'),/id="psArea" required/);
  const f=fixture(),record={id:'id',type:'Pre-Shift',cloudStatus:'pending_review'};
  for(const role of ['Worker','Client Viewer']){
    f.run(`db.settings.role=${JSON.stringify(role)}`);assert.doesNotMatch(f.ctx.preShiftReviewHTML(record),/<button/);
  }
  for(const role of ['Supervisor','Administrator','Safety Coordinator']){
    f.run(`db.settings.role=${JSON.stringify(role)}`);assert.match(f.ctx.preShiftReviewHTML(record),/Approve &amp; Sign/);
  }
  assert.equal(f.ctx.preShiftStatusLabel({...record,cloudStatus:'approved'}),'Pending Supervisor Review');
  const approved={...record,cloudStatus:'approved',approvedBy:'<script>',approvedAt:'2026-09-23T01:00:00Z'};
  const html=f.ctx.preShiftReviewHTML(approved);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<button|<script>/);
});

function approvalClient(f,result={data:{id:'record',approved_by:'staff-id',approved_at:'2026-09-23T01:00:00Z'},error:null}){
  const calls=[];
  f.client.from=table=>{
    const call={table,filters:[]};calls.push(call);
    return {update(patch){call.patch=patch;return this;},eq(...filter){call.filters.push(filter);return this;},
      select(){return this;},single:async()=>result};
  };
  return calls;
}
test('workers/viewers cannot invoke approval; staff approval sends only status and uses pending conditional update',async()=>{
  const f=fixture(),calls=approvalClient(f);
  for(const role of ['Worker','Client Viewer']){f.run(`db.settings.role=${JSON.stringify(role)}`);await f.ctx.approvePreShift('record');}
  assert.equal(calls.length,0);
  for(const role of ['Supervisor','Administrator','Safety Coordinator']){
    f.run(`db.settings.role=${JSON.stringify(role)}`);await f.ctx.approvePreShift('record');
    assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1).patch)),{status:'approved'});
    assert.deepEqual(calls.at(-1).filters,[['id','record'],['organization_id','org'],['record_type','pre_shift'],['status','pending_review']]);
    assert.match(f.messages.at(-1),/approved and signed/);
  }
});
test('expired login, denied or already-reviewed approval cannot report success',async()=>{
  const f=fixture(),calls=approvalClient(f,{data:null,error:new Error('zero rows')});f.run("db.settings.role='Supervisor'");
  f.client.auth.getUser=async()=>({data:{user:null}});await f.ctx.approvePreShift('record');assert.equal(calls.length,0);
  f.client.auth.getUser=async()=>({data:{user:{id:'staff'}}});await f.ctx.approvePreShift('record');
  assert.equal(calls.length,1);assert.doesNotMatch(f.messages.join(' '),/approved and signed/);
});

async function readyRisk(f){
  await ready(f);
  for(const [id,value] of Object.entries({praArea:' Actual bay ',praInitialLikelihood:'3',praInitialSeverity:'4',praResidualLikelihood:'2',praResidualSeverity:'3'}))f.element(id).value=value;
}
test('risk assessment requires Work Area, cloud task, hazards, controls and integer ratings',async()=>{
  const f=fixture();await readyRisk(f);
  for(const area of ['', '  ', '\n\t']){f.element('praArea').value=area;await f.ctx.submitRiskAssessment();}
  assert.equal(f.saved.length,0);assert.equal(f.element('praArea').focused,true);
  for(const [id,value] of [['praHazards',' '],['praControls',' '],['praTask','unknown'],['praInitialSeverity','1.5'],['praResidualLikelihood','6'],['praResidualSeverity','NaN']]){
    await readyRisk(f);f.element(id).value=value;await f.ctx.submitRiskAssessment();assert.equal(f.saved.length,0);
  }
  await readyRisk(f);f.run("db.settings.site='B'");await f.ctx.submitRiskAssessment();assert.equal(f.saved.length,0);
});
for(const role of ['Worker','Supervisor','Administrator','Safety Coordinator']){
  test(`${role} submits risk assessment pending review without supervisor metadata`,async()=>{
    const f=fixture();await readyRisk(f);f.run(`db.settings.role=${JSON.stringify(role)}`);
    const row=await f.ctx.submitRiskAssessment();assert.equal(row.id,'record');
    assert.equal(f.saved.length,1);const args=f.saved[0];
    assert.equal(args[0],'pre_task_risk_assessment');assert.equal(args[2],'Actual bay');assert.equal(args[5],'pending_review');
    assert.equal(args[4].taskTemplateId,task.id);assert.equal(args[4].initialScore,12);assert.equal(args[4].residualScore,6);
    assert.equal('supervisor' in args[4],false);assert.equal(f.element('praArea').value,'');
  });
}
test('risk stop-work gate uses cloud site threshold even when local configuration is forged',async()=>{
  const f=fixture();await readyRisk(f);
  f.run("cloudRiskThresholds={'site-a':6};db.settings.riskStopWorkThreshold=25;window.SAFE_SITE_RISK_CONFIG={stopWorkThreshold:25}");
  await f.ctx.submitRiskAssessment();assert.equal(f.saved.length,0);
  f.element('praResidualSeverity').value='2';await f.ctx.submitRiskAssessment();assert.equal(f.saved.length,1);
});
test('Client Viewer cannot submit risks and failed saves preserve inputs for retry',async()=>{
  const f=fixture();await readyRisk(f);f.run("db.settings.role='Client Viewer'");await f.ctx.submitRiskAssessment();assert.equal(f.saved.length,0);
  f.run("db.settings.role='Worker'");f.ctx.saveCloudSafetyRecord=async()=>{throw new Error('offline');};
  await f.ctx.submitRiskAssessment();assert.equal(f.element('praArea').value,' Actual bay ');assert.equal(f.element('praSubmit').disabled,false);
});
test('risk approval uses the risk record type and shares verified review display',async()=>{
  const f=fixture(),calls=approvalClient(f);f.run("db.settings.role='Supervisor'");
  await f.ctx.approvePreShift('risk','pre_task_risk_assessment');
  assert.deepEqual(calls[0].filters[2],['record_type','pre_task_risk_assessment']);
  assert.match(f.ctx.preShiftReviewHTML({id:'risk',type:'Pre-Task Risk Assessment',cloudStatus:'pending_review'}),/pre_task_risk_assessment/);
  assert.doesNotMatch(source('index.html')+source('app.js'),/praSupervisor/);
  assert.match(source('index.html'),/id="praArea" required/);
});

test('only staff may change actions; closing always opens the required-note workflow',async()=>{
  const f=fixture();let opened=0;f.ctx.openActionDetail=async()=>opened++;
  f.run("db.actions=[{id:'a',status:'open'}]");
  for(const role of ['Worker','Client Viewer']){f.run(`db.settings.role=${JSON.stringify(role)}`);await f.ctx.setAction('a','closed');}
  assert.equal(opened,0);
  for(const role of ['Supervisor','Administrator','Safety Coordinator']){f.run(`db.settings.role=${JSON.stringify(role)}`);await f.ctx.setAction('a','closed');}
  assert.equal(opened,3);assert.equal(f.queries.length,0);
});
test('action detail is read-only for Worker/Client Viewer and closeout never reports denied updates as success',async()=>{
  const f=fixture();f.load('action-closeout.js');f.ctx.confirm=()=>true;
  let writes=0;
  f.client.from=()=>{let patch;return {select(){return this;},eq(){return this;},update(value){writes++;patch=value;return this;},
    single:async()=>patch?{data:null,error:new Error('No rows')}:{data:{id:'a',status:'open',title:'Action',created_at:new Date().toISOString()}}};};
  for(const role of ['Worker','Client Viewer']){
    f.run(`db.settings.role=${JSON.stringify(role)}`);await f.ctx.openActionDetail('a');
    assert.doesNotMatch(f.element('actionDetailBody').innerHTML,/actionCloseoutSubmit/);
    await f.ctx.completeActionCloseout('a');
  }
  assert.equal(writes,0);f.run("db.settings.role='Supervisor'");await f.ctx.openActionDetail('a');
  f.element('actionCloseoutNote').value='  ';await f.ctx.completeActionCloseout('a');assert.equal(writes,0);
  f.element('actionCloseoutNote').value='Verified test only';await f.ctx.completeActionCloseout('a');
  assert.equal(writes,1);assert.match(f.messages.at(-1),/could not complete/);assert.equal(f.element('actionCloseoutNote').value,'Verified test only');
});
