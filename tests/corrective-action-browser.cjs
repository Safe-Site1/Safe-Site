const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 try{
  for(const role of ['Worker','Client Viewer','Supervisor','Administrator','Safety Coordinator']){
   const page=await browser.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='cdn.jsdelivr.net')return route.fulfill({contentType:'application/javascript',body:'window.supabase={createClient:()=>window.testClient};'});
    if(url.hostname!=='safe-site.test')return route.abort();
    const file=path.join(root,url.pathname==='/'?'index.html':url.pathname.slice(1));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
    return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':'text/html'});
   });
   await page.addInitScript(()=>{
    window.actions=[{id:'late',due_date:'2030-01-01',description:'LATE'},{id:'closed',due_date:'2020-01-01',description:'OLD',status:'closed'},
     {id:'early',due_date:'2021-01-01',description:'EARLY'}].map(a=>({organization_id:'org',site_id:'site',title:'Duplicate title',status:'open',priority:'high',created_at:'2026-01-01',...a}));
    window.patches=[];window.inserts=[];
    window.testClient={auth:{getSession:async()=>({data:{session:null}})},from(table){
     let filters=[],patch,insert,single=false;
     const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},order(){return q;},insert(p){insert=p;return q;},update(p){patch=p;return q;},single(){single=true;return q;},
      then(resolve,reject){return Promise.resolve().then(()=>{
       let data=table==='corrective_actions'?actions.filter(a=>filters.every(([k,v])=>a[k]===v)):[];
       if(insert&&table==='corrective_actions'){
        inserts.push(insert);if(window.rejectCreate){window.rejectCreate=false;return {data:null,error:{message:'Save failed'}};}
        const row={id:'created',created_at:new Date().toISOString(),...insert};actions.push(row);data=[row];
       }
       if(patch){patches.push(patch);if(window.rejectClose){window.rejectClose=false;return {data:null,error:{message:'No matching row'}};}
        for(const a of data)Object.assign(a,patch,patch.status==='closed'?{closed_by:'staff-account',closed_at:new Date().toISOString()}:{});}
       return {data:single?data[0]||null:data,error:null};
      }).then(resolve,reject);}};return q;}};
   });
   await page.goto('http://safe-site.test/');
   await page.waitForFunction(()=>window.__actionCloseoutActionsWrapped);
   await page.evaluate(async role=>{
    cloudOrganizationId='org';cloudSiteIds={Pilot:'site'};db.settings={company:'Test',site:'Pilot',role};db.workers=[];db.records=[];
    document.getElementById('header').classList.remove('hidden');document.getElementById('nav').classList.remove('hidden');
    await loadCloudSafetyData();show('actions');
   },role);
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
   assert.deepEqual(errors,[]);console.log(`PASS: ${role} closeout flow`);await page.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
