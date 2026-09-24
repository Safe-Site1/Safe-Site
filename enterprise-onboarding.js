(function(){
 'use strict';
 const core=SafeSiteOnboardingCore,$=id=>document.getElementById(id);
 const permitted=()=>!!cloudUser?.id&&!!cloudOrganizationId&&['Administrator','Safety Coordinator'].includes(db.settings.role);
 const committed=p=>['committed','documents_pending','complete'].includes(p?.batch.status);
 let context=null,preview=null,sourceRows={},busy=false,files=[],targets=[],generation=0;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const status=s=>{$('onboardingStatus').textContent=s;};
 function capture(){if(!permitted())throw Error('Administrator or Safety Coordinator access required.');return {org:cloudOrganizationId,user:cloudUser.id,generation};}
 function check(c){if(!permitted()||c.org!==cloudOrganizationId||c.user!==cloudUser.id||c.generation!==generation)throw Error('Account or organization changed. Reopen bulk onboarding.');}
 async function rpc(c,name,args){check(c);const {data,error}=await core.withTimeout(initSupabase().rpc(name,args));check(c);if(error)throw error;if(!data)throw Error('Server response was not confirmed.');return data;}
 async function run(message,fn){if(busy)return;let c;try{c=capture();busy=true;controls();status(message);await fn(c);}catch(e){if(!c||c.generation===generation)status((e.message||'Request failed.')+' Your batch remains available below; refresh it before retrying.');}finally{busy=false;controls();}}
 function controls(){
  const allowed=permitted(),done=committed(preview);
  document.querySelectorAll('#enterpriseOnboarding button,#enterpriseOnboarding input,#enterpriseOnboarding select').forEach(el=>el.disabled=busy||!allowed);
  $('onboardingCommit').disabled=busy||!allowed||!preview||done||preview.counts.errors>0||(preview.counts.updates>0&&!$('onboardingConfirm').checked);
  $('onboardingUploads').hidden=!done||!preview.counts.documents;
  $('onboardingUpload').disabled=busy||!allowed||!done||!files.length;
  $('onboardingReview').hidden=!preview;
  $('onboardingConfirmLabel').hidden=!preview||done||!preview.counts.updates;
  $('onboardingProgress').hidden=!busy;
 }
 function render(p){
  preview=p;$('onboardingConfirm').checked=false;
  $('onboardingBatchTitle').textContent=p.batch.sourceFileName+' — '+p.batch.status.replaceAll('_',' ');
  $('onboardingBatchId').textContent='Batch '+p.batch.id;
  $('onboardingCounts').innerHTML=Object.entries(p.counts).map(([k,v])=>'<div class="card stat"><b>'+esc(v)+'</b>'+esc(k.replace(/([A-Z])/g,' $1'))+'</div>').join('');
  const keys={worker:'workers',qualification:'qualifications',requirement:'requirements',document:'documents'};
  $('onboardingIssues').innerHTML=(p.issues||[]).map(i=>'<div class="item"><b>'+esc(i.severity)+' · '+esc(i.row_kind)+' · '+(sourceRows[keys[i.row_kind]]?.[i.row_number-1]?'worksheet row '+sourceRows[keys[i.row_kind]][i.row_number-1]:'data row '+i.row_number)+'</b><div>'+esc(i.row_key)+'</div><div>'+[...(i.validation_errors||[]),...(i.validation_warnings||[])].map(esc).join('<br>')+'</div></div>').join('')||'<p>No validation issues.</p>';
  $('onboardingIssueLimit').textContent='Preview shows up to 200 issues. Data rows are numbered from the first non-empty row after the header. Use row review below for all staged values and issues.';
  $('onboardingOutcome').textContent=committed(p)?(p.batch.status==='complete'?'Import complete. All indexed documents are registered.':'Records imported. '+(p.counts.documents-p.counts.documentsUploaded)+' document(s) still need upload/registration.'):p.counts.errors?'Fix the workbook and stage a new batch. This batch cannot import until every error is resolved.':'Review inserts, updates and skips before importing. Existing records change only after confirmation.';
  controls();
 }
 async function history(c){
  const {data,error}=await core.withTimeout(initSupabase().from('onboarding_batches').select('id,source_file_name,status,created_at').eq('organization_id',c.org).order('created_at',{ascending:false}).limit(100));check(c);if(error)throw error;
  $('onboardingHistory').replaceChildren();
  const placeholder=new Option('Choose a recent batch to review or resume','');$('onboardingHistory').add(placeholder);
  for(const b of data)$('onboardingHistory').add(new Option(b.source_file_name+' · '+b.status+' · '+new Date(b.created_at).toLocaleString(),b.id));
 }
 function readWorkbook(file){return new Promise((resolve,reject)=>{
  const worker=new Worker('enterprise-onboarding-worker.js');
  const timer=setTimeout(()=>{worker.terminate();reject(Error('Workbook parsing exceeded 60 seconds. Split the workbook.'));},60000);
  const finish=()=>{clearTimeout(timer);worker.terminate();};
  worker.onmessage=({data})=>{finish();data.error?reject(Error(data.error)):resolve(data.result);};
  worker.onerror=()=>{finish();reject(Error('Workbook parser could not load. Reload and retry.'));};worker.postMessage(file);
 });}
 async function loadTargets(c){
  const rows=[];
  // Table-valued RPCs have the same server row cap as table reads.
  for(let start=0;start<20000;start+=500){
   check(c);const {data,error}=await core.withTimeout(initSupabase().rpc('get_enterprise_onboarding_document_targets',{p_batch_id:preview.batch.id}).range(start,start+499));check(c);
   if(error)throw error;if(!Array.isArray(data))throw Error('Document targets were not confirmed.');
   rows.push(...data);if(data.length<500)break;
  }
  if(rows.length!==preview.counts.documents)throw Error('Document target count does not match the batch. Refresh and resolve worker identity matches before uploading.');
  targets=rows;renderTargets();
 }
 function renderTargets(messages={}){
  $('onboardingDocumentRows').innerHTML=targets.map(t=>'<div class="item"><b>'+esc(t.employee_number)+' · '+esc(t.file_name)+'</b><div>'+esc(t.uploaded_document_id?'Registered':messages[t.row_number]||'Awaiting file')+'</div></div>').join('');
 }
 function reset(){generation++;context=null;preview=null;sourceRows={};targets=[];files=[];$('onboardingWorkbook').value='';$('onboardingFiles').value='';$('onboardingRows').replaceChildren();$('onboardingHistory').replaceChildren();$('onboardingDocumentRows').replaceChildren();$('onboardingIssues').replaceChildren();$('onboardingCounts').replaceChildren();controls();}
 const previousShow=window.show;
 window.show=function(id){
  if(id==='enterpriseOnboarding'){
   if(!permitted()){toast('Administrator or Safety Coordinator access required');return;}
   if(!context||context.user!==cloudUser.id||context.org!==cloudOrganizationId){reset();context=capture();}
   previousShow(id);run('Loading recent batches…',async c=>{await history(c);status('Upload a workbook, or resume a recent batch.');});return;
  }
  return previousShow.apply(this,arguments);
 };
 $('onboardingStage').onclick=()=>run('Reading and validating workbook…',async c=>{
  const file=$('onboardingWorkbook').files[0];if(!file||!file.name.toLowerCase().endsWith('.xlsx'))throw Error('Choose an .xlsx workbook.');
  const parsed=await readWorkbook(file);check(c);status('Staging workbook and checking live records…');
  preview=null;targets=[];files=[];$('onboardingFiles').value='';$('onboardingRows').replaceChildren();controls();sourceRows=parsed.sourceRows;
  // Stage creates only isolated staging rows. If its response is lost, recover via recent batches before staging again.
  render(await rpc(c,'stage_enterprise_onboarding',{p_organization_id:c.org,p_source_file_name:file.name,p_payload:parsed.payload}));
  await history(c);status('Validation finished. Review the batch below.');
 });
 $('onboardingRefresh').onclick=()=>run('Refreshing batches…',async c=>{await history(c);if(preview){render(await rpc(c,'get_enterprise_onboarding_preview',{p_batch_id:preview.batch.id}));if(committed(preview))await loadTargets(c);}status('Batches refreshed.');});
 $('onboardingHistory').onchange=()=>{const id=$('onboardingHistory').value;if(!id)return;run('Loading batch…',async c=>{sourceRows={};files=[];$('onboardingFiles').value='';$('onboardingRows').replaceChildren();render(await rpc(c,'get_enterprise_onboarding_preview',{p_batch_id:id}));if(committed(preview))await loadTargets(c);status('Batch loaded.');});};
 $('onboardingConfirm').onchange=controls;
 $('onboardingCommit').onclick=()=>run('Rechecking live records…',async c=>{
  if(!preview||committed(preview)||preview.counts.errors)throw Error('Load a valid, uncommitted batch.');
  const confirm=$('onboardingConfirm').checked;if(preview.counts.updates&&!confirm)throw Error('Explicit update confirmation is required.');
  const before=JSON.stringify({counts:preview.counts,issues:preview.issues});
  const fresh=await rpc(c,'validate_enterprise_onboarding',{p_batch_id:preview.batch.id});
  if(before!==JSON.stringify({counts:fresh.counts,issues:fresh.issues})){render(fresh);status('Validation changed. Review the refreshed preview and confirm again.');return;}
  status('Importing records in one transaction…');
  render(await rpc(c,'commit_enterprise_onboarding',{p_batch_id:preview.batch.id,p_confirm_updates:confirm}));
  if(committed(preview))await loadTargets(c);
  status(preview.batch.status==='complete'?'Import complete.':'Records imported. Select the indexed certificate files below.');
  try{await loadCloudWorkers();}catch(e){status('Records imported. Reload Workers to refresh the list. Documents can still be resumed here.');}
 });
 $('onboardingFiles').onchange=()=>{files=[...$('onboardingFiles').files];controls();};
 $('onboardingUpload').onclick=()=>run('Matching indexed documents…',async c=>{
  await loadTargets(c);const matched=core.matchFiles(targets,files),messages={};let failed=0,done=0;
  for(const target of targets){
   check(c);if(target.uploaded_document_id){done++;continue;}
   const file=matched.map.get(target.file_name);
   if(!file){messages[target.row_number]='Missing: select this exact filename to retry.';failed++;continue;}
   status('Uploading document '+(done+failed+1)+' of '+targets.length+'…');
   try{target.uploaded_document_id=await core.uploadDocument(initSupabase(),c.org,preview.batch.id,target,file,crypto,()=>check(c));done++;}
   catch(e){check(c);messages[target.row_number]='Retry needed: '+(e.message||'Upload or registration failed');failed++;}
   renderTargets(messages);
  }
  renderTargets(messages);render(await rpc(c,'get_enterprise_onboarding_preview',{p_batch_id:preview.batch.id}));
  status(done+' registered; '+failed+' pending. '+(matched.unmatched.length?'Not in Document Index (not uploaded): '+matched.unmatched.join(', '):'')+(failed?' Select missing files or retry failed files.':''));
 });
 $('onboardingTemplate').onclick=()=>run('Preparing template…',async c=>{check(c);XLSX.writeFile(core.template(XLSX),'Safe_Site_Bulk_Onboarding_Template.xlsx');status('Template downloaded. Keep employee numbers as text; use YYYY-MM-DD dates.');});
 $('onboardingLoadRows').onclick=()=>run('Loading staged rows…',async c=>{
  if(!preview)throw Error('Choose a batch first.');
  const kind=$('onboardingRowKind').value,page=Math.max(1,Number($('onboardingRowPage').value)||1),start=(page-1)*50;
  const {data,error}=await core.withTimeout(initSupabase().from('onboarding_'+kind+'_rows').select('*').eq('batch_id',preview.batch.id).order('row_number').range(start,start+49));check(c);if(error)throw error;
  $('onboardingRows').innerHTML=data.map(row=>'<details class="item"><summary>Data row '+row.row_number+' · '+esc(row.proposed_action)+' · '+esc(row.employee_number||row.site_name)+'</summary>'+Object.entries(row).filter(([k])=>!['id','batch_id'].includes(k)).map(([k,v])=>'<div><b>'+esc(k.replaceAll('_',' '))+':</b> '+esc(Array.isArray(v)?v.join('; '):v)+'</div>').join('')+'</details>').join('')||'<p>No rows on this page.</p>';status('Showing up to 50 rows on page '+page+'.');
 });
 function refreshAccess(){
  document.querySelectorAll('[data-onboarding-entry]').forEach(b=>b.hidden=!permitted());
  if(context&&(!permitted()||context.user!==cloudUser?.id||context.org!==cloudOrganizationId)){reset();$('enterpriseOnboarding').classList.add('hidden');}
 }
 setInterval(refreshAccess,1000);refreshAccess();controls();
})();
