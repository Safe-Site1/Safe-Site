// Shipped UI + real XLSX/Web Worker parser, mocked cloud transport.
// Run the SQL companion separately for real database/RLS/transaction assertions.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const XLSX=require('../vendor/xlsx-0.20.3.min.js'),core=require('../enterprise-onboarding-core.js');
const root=path.join(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname;const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.html')?'text/html':'text/plain');res.end(fs.readFileSync(file));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 try{
 for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'application/javascript',body:'window.supabase={createClient:()=>window.testClient};'}));
  await page.route('https://*.supabase.co/**',route=>route.abort());
  await page.addInitScript(()=>{
   window.testCalls=[];window.testPreview=null;window.testLostCommit=true;window.testRegistrationFail=true;window.testRegistered=false;
   window.testClient={
    auth:{getSession:async()=>({data:{session:null}}),getUser:async()=>({data:{user:{id:'test-user'}}})},
    from(table){const q={select(){return q;},eq(){return q;},order(){return q;},limit(){return q;},range(){return q;},then(resolve){return Promise.resolve({data:table==='onboarding_batches'&&window.testPreview?[{id:'batch',source_file_name:'500.xlsx',status:window.testPreview.batch.status,created_at:'2026-09-24'}]:[]}).then(resolve);}};return q;},
    storage:{from(){return {upload:async()=>({data:{}}),download:async()=>({error:Error('Not found')})};}},
    rpc(name,args){
     const pending=this.callRpc(name,args);pending.range=()=>pending;return pending;
    },
    async callRpc(name,args){
     window.testCalls.push({name,args});
     if(name==='stage_enterprise_onboarding'){
      if(args.p_payload.workers.length!==500)throw Error('Parser lost workers');
      window.testPreview={batch:{id:'batch',status:'validated',sourceFileName:'500.xlsx'},counts:{workers:500,qualifications:0,requirements:0,documents:1,errors:0,warnings:1,inserts:499,updates:1,skips:0,documentsUploaded:0},issues:[{row_kind:'worker',row_number:1,row_key:'<img src=x onerror=alert(1)>',severity:'warning',validation_errors:[],validation_warnings:['Existing worker will be updated']}]};
     }
     if(name==='commit_enterprise_onboarding'){
      if(!args.p_confirm_updates)throw Error('Missing explicit confirmation');
      window.testPreview.batch.status='documents_pending';
      if(window.testLostCommit){window.testLostCommit=false;return {error:Error('Lost commit response')};}
     }
     if(name==='get_enterprise_onboarding_document_targets')return {data:[{row_number:1,employee_number:'00000',worker_id:'worker',file_name:'test.pdf',uploaded_document_id:window.testRegistered?'document':null}]};
     if(name==='register_enterprise_onboarding_document'){
      if(window.testRegistrationFail){window.testRegistrationFail=false;return {error:Error('Lost document registration response')};}
      window.testRegistered=true;window.testPreview.batch.status='complete';window.testPreview.counts.documentsUploaded=1;return {data:'document'};
     }
     return {data:structuredClone(window.testPreview)};
    }
   };
  });
  await page.goto(url);await page.waitForFunction(()=>window.SafeSiteOnboardingCore);
  await page.evaluate(()=>{cloudUser={id:'test-user'};cloudOrganizationId='org';db.settings.role='Safety Coordinator';loadCloudWorkers=async()=>{};show('enterpriseOnboarding');});
  await page.waitForFunction(()=>document.getElementById('onboardingStatus').textContent.includes('Upload a workbook'));
  const wb=core.template(XLSX);wb.Sheets.Workers=XLSX.utils.aoa_to_sheet([core.sheets.Workers.fields,...Array.from({length:500},(_,i)=>[String(i).padStart(5,'0'),'First','Last','Miner','North'])]);
  wb.Sheets['Document Index']=XLSX.utils.aoa_to_sheet([core.sheets['Document Index'].fields,['00000','','test.pdf']]);
  await page.locator('#onboardingWorkbook').setInputFiles({name:'500.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}))});
  await page.locator('#onboardingStage').click();await page.waitForFunction(()=>document.getElementById('onboardingStatus').textContent.includes('Validation finished'));
  assert.equal(await page.locator('#onboardingCommit').isDisabled(),true);
  assert.equal(await page.locator('#onboardingIssues img').count(),0);
  await page.locator('#onboardingConfirm').check();assert.equal(await page.locator('#onboardingCommit').isDisabled(),false);
  await page.screenshot({path:path.join(process.env.ARTIFACT_DIR||root,'onboarding-'+width+'.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow');
  await page.locator('#onboardingCommit').click();await page.waitForFunction(()=>document.getElementById('onboardingStatus').textContent.includes('Lost commit response'));
  await page.locator('#onboardingRefresh').click();await page.waitForFunction(()=>document.getElementById('onboardingStatus').textContent==='Batches refreshed.');
  assert.equal(await page.locator('#onboardingCommit').isDisabled(),true);
  assert.match(await page.locator('#onboardingOutcome').textContent(),/Records imported/);
  await page.locator('#onboardingFiles').setInputFiles({name:'test.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\nfixture')});
  await page.locator('#onboardingUpload').click();await page.waitForFunction(()=>document.getElementById('onboardingStatus').textContent.includes('1 pending'));
  await page.locator('#onboardingUpload').click();await page.waitForFunction(()=>document.getElementById('onboardingStatus').textContent.includes('1 registered; 0 pending'));
  assert.match(await page.locator('#onboardingOutcome').textContent(),/Import complete/);
  for(const role of ['Worker','Supervisor','Client Viewer']){
   await page.evaluate(role=>{db.settings.role=role;show('enterpriseOnboarding');},role);
   await page.waitForFunction(()=>document.getElementById('enterpriseOnboarding').classList.contains('hidden'));
  }
  assert.deepEqual(errors,[]);console.log(width+'px: 500-worker parse, explicit confirmation, XSS escaping, lost commit recovery, document retry, role gating passed');
  await page.close();
 }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
