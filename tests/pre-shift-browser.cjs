// Browser integration against the shipped page/scripts with an in-memory cloud transport.
// Database authorization is independently exercised by pre-shift-database.sql.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
  try{
    for(const role of ['Worker','Supervisor','Administrator','Safety Coordinator','Client Viewer']){
      const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/*',async route=>{
        const url=new URL(route.request().url());
        if(url.hostname==='cdn.jsdelivr.net')return route.fulfill({contentType:'application/javascript',body:'window.supabase={createClient:()=>window.testClient};'});
        if(url.hostname!=='safe-site.test')return route.abort();
        const file=path.join(root,url.pathname==='/'?'index.html':url.pathname.slice(1));
        if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
        await route.fulfill({contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.html')?'text/html':'text/plain',body:fs.readFileSync(file)});
      });
      await page.addInitScript(()=>{
        window.testRecords=[];
        window.testClient={auth:{getSession:async()=>({data:{session:null}}),getUser:async()=>({data:{user:{id:'authenticated-staff'}}})},
          from(table){
            let filters=[],insert,patch,single=false;
            const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},or(){return q;},order(){return q;},limit(){return q;},
              insert(value){insert=value;return q;},update(value){patch=value;return q;},single(){single=true;return q;},
              then(resolve,reject){return Promise.resolve().then(()=>{
                let data=[];
                if(table==='task_templates')data=[{id:'task-id',name:'Cloud bolting task',task_template_hazards:[{hazard:'Falling rock',sort_order:1}],task_template_controls:[{control:'Barricade work area',sort_order:1}]}];
                if(table==='safety_records'){
                  if(insert)window.testRecords.push({...insert,id:'record-id',created_at:new Date().toISOString(),approved_by:null,approved_at:null});
                  data=window.testRecords.filter(row=>filters.every(([k,v])=>row[k]===v));
                  if(patch)for(const row of data)Object.assign(row,patch,{approved_by:'authenticated-staff',approved_at:new Date().toISOString()});
                }
                return {data:single?data[0]||null:data,error:null};
              }).then(resolve,reject);}};return q;
          }};
      });
      await page.goto('http://safe-site.test/');
      await page.evaluate(async role=>{
        cloudOrganizationId='org';cloudSiteIds={Pilot:'site'};cloudUser={id:'worker'};
        db.settings={company:'Safe Site',site:'Pilot',role};db.sites=['Pilot'];db.workers=[];db.actions=[];db.records=[];
        document.getElementById('header').classList.remove('hidden');
        document.getElementById('nav').classList.remove('hidden');
        await loadCloudTaskTemplates();
        safeSitePermissions.refresh();
      },role);
      if(role==='Worker'){
        await page.evaluate(()=>show('preshift'));
        assert.equal(await page.locator('#psSupervisor').count(),0);
        assert.equal(await page.locator('#psHazards').inputValue(),'Falling rock');
        assert.equal(await page.locator('#psControls').inputValue(),'Barricade work area');
        await page.locator('#psSubmit').click();
        assert.equal(await page.evaluate(()=>testRecords.length),0);
        await page.locator('#psArea').fill(' Pilot test bay ');
        await page.locator('#psSubmit').click();
        await page.waitForFunction(()=>testRecords.length===1&&db.records.length===1);
        assert.equal(await page.evaluate(()=>testRecords[0].status),'pending_review');
        await page.evaluate(()=>openRecordDetail('record-id'));
        assert.equal(await page.locator('#approvePreShiftButton').count(),0);
        assert.match(await page.locator('#recordDetailBody').innerText(),/Pending Supervisor Review/);
      }else{
        await page.evaluate(async()=>{
          testRecords.push({id:'record-id',organization_id:'org',site_id:'site',record_type:'pre_shift',title:'Cloud bolting task',work_area:'Pilot test bay',
            data:{crew:'Test crew',hazards:'Falling rock',controls:'Barricade work area'},status:'pending_review',created_at:new Date().toISOString()});
          await loadCloudSafetyData();show('reports');
        });
        assert.match(await page.locator('#reportsBody').innerText(),/Pending Supervisor Review/);
        await page.locator('.recordCard').click();
        await page.locator('#recordDetailBody h2').waitFor();
        if(role==='Client Viewer'){
          assert.equal(await page.locator('#approvePreShiftButton').count(),0);
          await page.evaluate(()=>approvePreShift('record-id'));
          assert.equal(await page.evaluate(()=>testRecords[0].status),'pending_review');
        }else{
          await page.locator('#approvePreShiftButton').click();
          await page.waitForFunction(()=>document.getElementById('recordDetailBody').textContent.includes('authenticated-staff'));
          assert.match(await page.locator('#recordDetailBody').innerText(),/Approved/);
          assert.equal(await page.locator('#approvePreShiftButton').count(),0);
          if(process.env.SCREENSHOT_DIR&&role==='Supervisor'){
            fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});
            await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'pre-shift-approved.png'),fullPage:true});
          }
        }
      }
      assert.deepEqual(errors,[],`${role}: browser errors`);
      console.log(`PASS: ${role} pre-shift browser flow`);
      await page.close();
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
