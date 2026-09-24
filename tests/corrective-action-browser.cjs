const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 try{
  for(const role of ['Worker','Client Viewer','Supervisor','Administrator','Safety Coordinator']){
   const page=await browser.newPage({viewport:{width:Number(process.env.TEST_VIEWPORT)||1100,height:850}}),errors=[];
   const checkLayout=async label=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${role}: ${label} fits viewport`);};
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='cdn.jsdelivr.net')return route.fulfill({contentType:'application/javascript',body:'window.supabase={createClient:()=>window.testClient};'});
    if(url.hostname!=='safe-site.test')return route.abort();
    const file=path.join(root,url.pathname==='/'?'index.html':url.pathname.slice(1));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
    return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html'});
   });
   await page.addInitScript(()=>{
    window.actions=[{id:'late',due_date:'2030-01-01',description:'LATE'},{id:'closed',due_date:'2020-01-01',description:'OLD',status:'closed'},
     {id:'early',due_date:'2021-01-01',description:'EARLY'}].map(a=>({organization_id:'org',site_id:'site',title:'Duplicate title',status:'open',priority:'high',created_at:'2026-01-01',...a}));
    window.patches=[];window.inserts=[];window.fieldCalls=JSON.parse(sessionStorage.getItem('mockFieldCalls')||'[]');window.fieldRecords=JSON.parse(sessionStorage.getItem('mockFieldRecords')||'[]');
    window.storagePhotos=[];window.photoUploads=0;
    window.testClient={storage:{from(){return {
     async list(prefix,options){return {data:storagePhotos.filter(p=>!options?.search||p.name===options.search)};},
     async upload(path,file,options){photoUploads++;if(window.rejectPhoto){window.rejectPhoto=false;return {error:{message:'Offline'}};}
      const name=path.split('/').at(-1);if(!storagePhotos.some(p=>p.name===name))storagePhotos.push({name,created_at:new Date().toISOString()});
      return {error:{message:'Response lost after upload'}};
     },
     async createSignedUrl(){return {data:{signedUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='}};}
    };}},auth:{getSession:async()=>({data:{session:null}})},async rpc(name,p){
     if(name!=='submit_field_record')return {data:null,error:null};
     fieldCalls.push(p);
     if(!fieldRecords.some(r=>r.id===p.p_id))fieldRecords.push({id:p.p_id,organization_id:p.p_organization_id,site_id:p.p_site_id,record_type:p.p_type,title:p.p_title,work_area:p.p_area,data:p.p_data,status:'submitted',created_at:new Date().toISOString()});
     sessionStorage.setItem('mockFieldCalls',JSON.stringify(fieldCalls));sessionStorage.setItem('mockFieldRecords',JSON.stringify(fieldRecords));
     if(window.loseFieldResponse){window.loseFieldResponse=false;return {error:{message:'Lost response'}};}
     return {data:p.p_id,error:null};
    },from(table){
     let filters=[],patch,insert,single=false;
     const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},order(){return q;},insert(p){insert=p;return q;},update(p){patch=p;return q;},single(){single=true;return q;},
      then(resolve,reject){return Promise.resolve().then(()=>{
       let data=(table==='corrective_actions'?actions:table==='safety_records'?fieldRecords:[]).filter(a=>filters.every(([k,v])=>a[k]===v));
       if(insert&&table==='corrective_actions'){
        inserts.push(insert);if(window.rejectCreate){window.rejectCreate=false;return {data:null,error:{message:'Save failed'}};}
        const row={id:'created',created_at:new Date().toISOString(),...insert};actions.push(row);data=[row];
       }
       if(patch){patches.push(patch);if(window.rejectClose){window.rejectClose=false;return {data:null,error:{message:'No matching row'}};}
        for(const a of data)Object.assign(a,patch,patch.status==='closed'?{closed_by:'staff-account',closed_at:new Date().toISOString()}:{});}
       return {data:single?data[0]||null:data,error:null};
      }).then(resolve,reject);}};return q;}};
   });
   await page.goto('https://safe-site.test/');
   await page.waitForFunction(()=>window.__actionCloseoutActionsWrapped);
   await page.evaluate(async role=>{
    cloudUser={id:'pilot-user'};cloudOrganizationId='org';cloudSiteIds={Pilot:'site'};db.settings={company:'Test',site:'Pilot',role};db.workers=[];db.records=[];
    document.getElementById('header').classList.remove('hidden');document.getElementById('nav').classList.remove('hidden');
    await loadCloudSafetyData();show('actions');
   },role);
   if(role==='Client Viewer'){
    await page.evaluate(async()=>{await submitInspection();await submitIncident();show('inspection');});
    assert.equal(await page.evaluate(()=>fieldCalls.length),0);assert.equal(await page.locator('#inspection').isVisible(),false);
    await page.evaluate(()=>show('reports'));assert.equal(await page.locator('#reports').isVisible(),true);
   }else{
    await page.evaluate(()=>show('inspection'));
    await checkLayout('inspection');
    await page.locator('#inspectionSubmit').click();assert.equal(await page.evaluate(()=>fieldCalls.length),0);
    await page.locator('#inspArea').fill('PILOT TEST ONLY — inspection');
    await page.locator('#inspCond').selectOption('Deficiency Found');
    await page.locator('#inspectionSubmit').click();assert.equal(await page.evaluate(()=>fieldCalls.length),0);
    await page.locator('#inspNotes').fill('Synthetic defect');
    await page.evaluate(()=>{window.loseFieldResponse=true;});await page.locator('#inspectionSubmit').click();
    await page.waitForFunction(()=>!loseFieldResponse&&!document.getElementById('inspectionSubmit').disabled);
    assert.equal(await page.locator('#inspNotes').isDisabled(),true);
    await page.reload();await page.waitForFunction(()=>window.__actionCloseoutActionsWrapped);
    await page.evaluate(async role=>{
     cloudUser={id:'pilot-user'};cloudOrganizationId='org';cloudSiteIds={Pilot:'site'};db.settings={company:'Test',site:'Pilot',role};db.workers=[];db.records=[];
     document.getElementById('header').classList.remove('hidden');document.getElementById('nav').classList.remove('hidden');
     await loadCloudSafetyData();show('inspection');
    },role);
    assert.equal(await page.locator('#inspNotes').inputValue(),'Synthetic defect');
    assert.equal(await page.locator('#inspNotes').isDisabled(),true);
    assert.match(await page.locator('#inspectionRecovery').innerText(),/earlier submission/);
    await page.locator('#inspectionSubmit').click();await page.waitForFunction(()=>!document.getElementById('dashboard').classList.contains('hidden'));
    assert.equal(await page.evaluate(()=>fieldCalls[0].p_id===fieldCalls[1].p_id),true);
    assert.equal(await page.evaluate(()=>fieldRecords.length),1);
    for(const kind of ['Incident','Near Miss']){
     await page.evaluate(()=>show('incident'));await page.locator('#incType').selectOption(kind);
     await page.locator('#incidentSubmit').click();
     await page.locator('#incLocation').fill('Pilot test bay');await page.locator('#incDesc').fill('Synthetic '+kind);
     await page.locator('#incidentSubmit').click();await page.waitForFunction(()=>!document.getElementById('dashboard').classList.contains('hidden'));
    }
    assert.deepEqual(await page.evaluate(()=>fieldRecords.map(r=>r.record_type)),['inspection','incident','near_miss']);
    if(role!=='Worker'){
     await page.evaluate(()=>{show('reports');reportTab='records';renderReports();});
     assert.deepEqual(await page.locator('#reportsBody .badge').allTextContents(),['Submitted','Submitted','Submitted']);
    }
   }
   await page.evaluate(()=>show('actions'));
   if(['Worker','Client Viewer'].includes(role)){
    await page.evaluate(async()=>{addAction();await submitNewAction();});
    assert.equal(await page.locator('#actionCreateForm').isVisible(),false);
    assert.equal(await page.evaluate(()=>inserts.length),0);
    assert.equal(await page.getByRole('button',{name:'Close Action',exact:true}).count(),0);
    await page.evaluate(()=>openActionDetail('early'));
    assert.equal(await page.locator('#actionCloseoutSubmit').count(),0);
    await page.evaluate(()=>completeActionCloseout('early'));
    assert.equal(await page.evaluate(()=>patches.length),0);
   }else{
    await page.locator('#addActionBtn').click();
    await page.locator('#actionCreateTitle').fill('   ');
    await page.locator('#actionCreateSubmit').click();assert.equal(await page.evaluate(()=>inserts.length),0);
    await page.locator('#actionCreateTitle').fill('PILOT TEST ONLY — manual action');
    await page.locator('#actionCreateDescription').fill('Synthetic test description');
    await page.locator('#actionCreatePriority').selectOption('high');
    await page.locator('#actionCreateDue').fill('2030-06-15');
    await page.evaluate(()=>{window.rejectCreate=true;});await page.locator('#actionCreateSubmit').click();
    await page.waitForFunction(()=>!rejectCreate&&!document.getElementById('actionCreateSubmit').disabled);
    assert.equal(await page.locator('#actionCreateTitle').inputValue(),'PILOT TEST ONLY — manual action');
    await page.locator('#actionCreateSubmit').click();
    await page.locator('#actionCreateForm').waitFor({state:'hidden'});
    assert.deepEqual(await page.evaluate(()=>inserts.at(-1)),{organization_id:'org',site_id:'site',safety_record_id:null,title:'PILOT TEST ONLY — manual action',description:'Synthetic test description',priority:'high',status:'open',due_date:'2030-06-15'});
    assert.equal(await page.evaluate(()=>actions.filter(a=>a.id==='created').length),1);
    await page.locator('#addActionBtn').click();await page.locator('#actionCreateTitle').fill('Discarded draft');
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    await page.locator('#addActionBtn').click();assert.equal(await page.locator('#actionCreateTitle').inputValue(),'');
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    assert.equal(await page.locator('.actionCard').first().getAttribute('data-action-id'),'early');
    await page.locator('.actionCard').first().getByRole('button',{name:'Close Action',exact:true}).click();
    await page.locator('#actionCloseoutNote').waitFor();
    assert.match(await page.locator('#actionDetailBody').innerText(),/EARLY/);
    await page.locator('#actionCloseoutSubmit').click();assert.equal(await page.evaluate(()=>patches.length),0);
    await page.locator('#actionCloseoutNote').fill('Pilot correction verified');
    await page.evaluate(()=>{window.rejectClose=true;});await page.locator('#actionCloseoutSubmit').click();
    await page.waitForFunction(()=>!rejectClose&&!document.getElementById('actionCloseoutSubmit').disabled);
    assert.equal(await page.locator('#actionCloseoutNote').inputValue(),'Pilot correction verified');
    await page.locator('#actionCloseoutSubmit').click();
    await page.waitForFunction(()=>document.getElementById('actionDetailBody').textContent.includes('staff-account'));
    assert.deepEqual(await page.evaluate(()=>patches.at(-1)),{status:'closed',closeout_note:'Pilot correction verified'});
    assert.match(await page.locator('#actionDetailBody').innerText(),/EARLY/);
    assert.equal(await page.locator('#actionCloseoutSubmit').count(),0);
    await page.evaluate(()=>{show('reports');reportTab='actions';renderReports();});
    await page.locator('#reportsBody [data-action-id="late"]').click();
    await page.locator('#actionCloseoutNote').waitFor();
    assert.match(await page.locator('#actionDetailBody').innerText(),/LATE/);
   }
   await page.evaluate(async()=>{
    fieldRecords.push({id:'photo-record',organization_id:'org',site_id:'site',record_type:'inspection',created_by:'pilot-user',title:'PILOT PHOTO TEST',work_area:'Test',data:{},status:'submitted',created_at:new Date().toISOString()});
    await loadCloudSafetyData();await openRecordDetail('photo-record');
   });
   await page.locator('#recordPhotoList').waitFor();
   await checkLayout('record details');
   if(role==='Client Viewer'){
    assert.equal(await page.locator('#recordPhotoUpload').count(),0);await page.evaluate(()=>attachRecordPhoto());assert.equal(await page.evaluate(()=>photoUploads),0);
   }else{
    const png={name:'pilot.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')};
    await page.locator('#recordPhotoInput').setInputFiles(png);await page.evaluate(()=>{window.rejectPhoto=true;});
    await page.locator('#recordPhotoUpload').click();await page.waitForFunction(()=>!document.getElementById('recordPhotoUpload').disabled);
    assert.match(await page.locator('#recordPhotoMessage').innerText(),/not confirmed/);assert.equal(await page.evaluate(()=>storagePhotos.length),0);
    await page.locator('#recordPhotoUpload').click();await page.waitForFunction(()=>document.getElementById('recordPhotoMessage').textContent.includes('saved securely'));
    await page.locator('#recordPhotoInput').setInputFiles(png);await page.locator('#recordPhotoUpload').click();await page.waitForFunction(()=>!document.getElementById('recordPhotoUpload').disabled);
    assert.equal(await page.evaluate(()=>storagePhotos.length),1);
    await page.getByRole('button',{name:'View photo 1',exact:true}).click();assert.equal(await page.locator('#recordPhotoPreview img').count(),1);
   }
   await page.evaluate(()=>{window.projectCalls=[];testClient.rpc=async(name,p)=>{projectCalls.push(p);return {data:p.p_id};};});
   if(role==='Administrator'){
    await page.evaluate(()=>{loadCloudContext=async()=>{};loadCloudWorkers=async()=>{};show('admin');});
    await page.locator('#newProjectName').fill('Customer <North> & East');await page.locator('#addProjectButton').click();
    await checkLayout('administration');
    await page.waitForFunction(()=>document.getElementById('projectSaveStatus').textContent.includes('Project saved'));
    assert.equal(await page.evaluate(()=>projectCalls[0].p_name),'Customer <North> & East');
    assert.equal(await page.locator('#currentSiteName').isEnabled(),true);
    await page.locator('#currentSiteName').fill('Renamed Customer Project');await page.locator('#companyName').fill('Customer Business');
    await page.getByRole('button',{name:'Save Settings',exact:true}).click();
    await page.waitForFunction(()=>projectCalls.length===2);
    assert.equal(await page.evaluate(()=>projectCalls[1].p_id),'site');assert.equal(await page.locator('#currentRole').isDisabled(),true);
   }else{
    await page.evaluate(async()=>{await addSite();await saveAdminSettings();});assert.equal(await page.evaluate(()=>projectCalls.length),0);
   }
   if(['Administrator','Safety Coordinator'].includes(role)){
    await page.evaluate(()=>{window.taskCalls=[];testClient.rpc=async(name,p)=>{taskCalls.push(p);return {data:p.p_id};};newTask();});
    await page.locator('#editTaskName').fill('Customer project task');await page.locator('#editTaskHazards').fill('Falling material');await page.locator('#editTaskControls').fill('Barricade area');
    await checkLayout('task editor');await page.getByRole('button',{name:'Save Task',exact:true}).click();
    await page.waitForFunction(()=>taskCalls.length===1);assert.equal(await page.evaluate(()=>taskCalls[0].p_site),'site');
   }
   assert.deepEqual(errors,[]);console.log(`PASS: ${role} field, closeout, photo, project and task flows`);await page.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
