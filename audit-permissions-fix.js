/* Cloud workflow audit viewer. No browser-local activity is presented as audit evidence. */
(function(){
'use strict';
let generation=0;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function allowed(){return ['administrator','safety_coordinator'].includes(String(db.settings?.role||'').toLowerCase().replaceAll(' ','_'));}
function context(){return [cloudUser?.id,cloudOrganizationId,cloudSiteIds[db.settings.site],db.settings.role].join('|');}
function permissions(){const button=document.getElementById('auditTab');if(button)button.style.display=allowed()?'':'none';}
async function load(cursor=null){
 const token=++generation,stamp=context(),box=document.getElementById('reportsBody');
 permissions();
 if(!allowed()||!cloudUser?.id){box.textContent='Administrator or Safety Coordinator sign-in required.';return;}
 const site=cloudSiteIds[db.settings.site];
 if(!site||!cloudOrganizationId){box.textContent='Select an active project to view its audit history.';return;}
 box.textContent='Loading verified audit history…';
 let timer;
 try{
  let query=initSupabase().from('audit_log')
   .select('id,user_id,action,entity_type,entity_id,metadata,created_at')
   .eq('organization_id',cloudOrganizationId).eq('metadata->>site_id',site)
   .like('action','workflow.%').order('id',{ascending:false}).limit(51);
  if(cursor)query=query.lt('id',cursor);
  const {data,error}=await Promise.race([query,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Audit request timed out. Please retry.')),30000);})]);
  if(token!==generation||stamp!==context()||!allowed()||reportTab!=='audit')return;
  if(error)throw error;
  const rows=(data||[]).slice(0,50),more=(data||[]).length>50;
  const labels={'workflow.safety_record.submitted':'Safety record submitted','workflow.safety_record.approved':'Safety record approved','workflow.safety_record.status_changed':'Safety record status changed','workflow.corrective_action.created':'Corrective action created','workflow.corrective_action.closed':'Corrective action closed','workflow.corrective_action.status_changed':'Corrective action status changed'};
  box.innerHTML='<h2>Verified audit history</h2><p class="small muted">Current project • newest first • up to 50 events per page. Workflow auditing began September 25, 2026. Earlier events were not backfilled.</p>'+
   (rows.length?rows.map(row=>{
    const m=row.metadata||{};
    return '<article class="item" style="overflow-wrap:anywhere"><b>'+esc(labels[row.action]||row.action)+'</b><div>'+esc(m.title||'')+'</div>'+
    '<div class="small muted">'+esc(new Date(row.created_at).toLocaleString())+'</div>'+
    '<div class="small">Account: '+esc(row.user_id||'Unavailable')+'</div>'+
    '<div class="small">Record: '+esc(row.entity_id)+'</div>'+
    '<div class="small">Status: '+esc(m.previous_status?m.previous_status+' → '+m.status:m.status)+'</div>'+
    (m.safety_record_id?'<div class="small">Source report: '+esc(m.safety_record_id)+'</div>':'')+
    (m.closeout_note?'<div class="small">Closeout: '+esc(m.closeout_note)+'</div>':'')+'</article>';
   }).join(''):'<p>No verified workflow events for this project yet. Existing reports may predate central auditing.</p>')+
   '<button id="auditRefresh" class="btn secondary">Refresh / newest</button>'+
   (more?'<button id="auditOlder" class="btn secondary">Older events</button>':'');
  document.getElementById('auditRefresh').onclick=()=>load();
  if(more)document.getElementById('auditOlder').onclick=()=>load(String(rows.at(-1).id));
 }catch(error){
  if(token!==generation||stamp!==context()||reportTab!=='audit')return;
  box.innerHTML='<p role="alert">Audit history could not be loaded. '+esc(error.message||'Check your connection and retry.')+'</p><button id="auditRetry" class="btn secondary">Retry</button>';
  document.getElementById('auditRetry').onclick=()=>load(cursor);
 }finally{clearTimeout(timer);}
}
const base=window.renderReports;
window.renderReports=function(){
 permissions();
 if(reportTab!=='audit'){generation++;return base.apply(this,arguments);}
 const filters=document.getElementById('pilotReportFilters');if(filters)filters.style.display='none';
 return load();
};
const show=window.show;
window.show=function(name){if(name!=='reports')generation++;const result=show.apply(this,arguments);permissions();return result;};
window.addEventListener('safeSiteRoleChanged',()=>{generation++;permissions();if(reportTab==='audit')load();});
window.SafeSiteCloudAudit={load,allowed};
permissions();
})();
