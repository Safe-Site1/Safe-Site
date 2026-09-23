/* Safe Site - Corrective Action Closeout v1 */
(function(){
'use strict';
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;");
const label=v=>String(v||'').replaceAll('_',' ').replace(/\b\w/g,m=>m.toUpperCase());

function ensureUI(){
  if(!document.getElementById('actionCloseoutStyles')){
    const s=document.createElement('style');s.id='actionCloseoutStyles';s.textContent=`
      .actionTap{cursor:pointer}.actionTap:active{transform:scale(.995)}
      .actionDetailGrid{display:grid;gap:0}.actionDetailRow{padding:12px 0;border-bottom:1px solid rgba(255,255,255,.07)}
      .actionDetailRow:last-child{border-bottom:0}.actionDetailRow b{display:block;font-size:11px;text-transform:uppercase;color:#9cb0ba;margin-bottom:5px}
      .closeoutBox textarea{min-height:110px}.closeoutDanger{border-color:#8d3434;background:rgba(239,75,75,.06)}
    `;document.head.appendChild(s);
  }
  if(!document.getElementById('actionDetail')){
    const sec=document.createElement('section');sec.id='actionDetail';sec.className='screen hidden';sec.innerHTML=`
      <div id="actionDetailBack" class="back">‹ Back</div>
      <h1>Corrective Action</h1><p id="actionDetailSub" class="muted"></p>
      <div id="actionDetailBody"><div class="card muted">Loading action…</div></div>`;
    document.querySelector('main')?.appendChild(sec);
  }
}

async function getCloudAction(id){
  const client=initSupabase();
  const {data,error}=await client.from('corrective_actions')
    .select('id,site_id,safety_record_id,title,description,priority,status,due_date,created_at,closed_at,closed_by,closeout_note')
    .eq('id',id).eq('organization_id',cloudOrganizationId).single();
  if(error) throw error;return data;
}

let detailRequest=0;
let currentDetail=null;
window.openActionDetail=async function(id){
  const request=++detailRequest;
  currentDetail=null;
  ensureUI();
  const back=document.getElementById('actionDetailBack');
  const reports=['Administrator','Supervisor','Safety Coordinator','Client Viewer'].includes(db.settings.role);
  back.textContent=reports?'‹ Back to Reports':'‹ Back to Home';
  back.onclick=()=>show(reports?'reports':'dashboard');
  document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden'));
  document.getElementById('actionDetail').classList.remove('hidden');
  document.querySelectorAll('.nav button').forEach(b=>b.classList.remove('active'));
  document.getElementById('n-reports')?.classList.add('active');
  const body=document.getElementById('actionDetailBody');body.innerHTML='<div class="card muted">Loading action…</div>';
  try{
    const a=await getCloudAction(id);const overdue=a.status!=='closed'&&a.due_date&&a.due_date<new Date().toISOString().slice(0,10);
    if(request!==detailRequest)return;
    currentDetail={id:a.id,status:a.status,organizationId:cloudOrganizationId};
    document.getElementById('actionDetailSub').textContent=`${label(a.status)} · ${label(a.priority)} priority${overdue?' · OVERDUE':''}`;
    body.innerHTML=`
      <div class="card ${overdue?'closeoutDanger':''}"><div class="actionDetailGrid">
        <div class="actionDetailRow"><b>Action</b><div>${esc(a.title||'Corrective action')}</div></div>
        <div class="actionDetailRow"><b>Description / Legacy History</b><div style="white-space:pre-wrap">${esc(a.description||'No additional details.')}</div></div>
        <div class="actionDetailRow"><b>Priority</b><div>${esc(label(a.priority))}</div></div>
        <div class="actionDetailRow"><b>Status</b><div>${esc(label(a.status))}</div></div>
        <div class="actionDetailRow"><b>Due Date</b><div>${esc(a.due_date||'No due date')}${overdue?' · OVERDUE':''}</div></div>
        <div class="actionDetailRow"><b>Created</b><div>${esc(new Date(a.created_at).toLocaleString())}</div></div>
        ${a.closed_at?`<div class="actionDetailRow"><b>Closed</b><div>${esc(new Date(a.closed_at).toLocaleString())}</div></div>`:''}
        ${a.closed_by?`<div class="actionDetailRow"><b>Closed by authenticated account</b><div>${esc(a.closed_by)}</div></div>`:''}
        ${a.closeout_note?`<div class="actionDetailRow"><b>Closeout Note</b><div style="white-space:pre-wrap">${esc(a.closeout_note)}</div></div>`:''}
      </div></div>
      ${a.safety_record_id?`<button class="btn secondary" onclick="openRecordDetail('${esc(a.safety_record_id)}')">View Source Safety Record</button>`:''}
      ${['open','in_progress'].includes(a.status)&&canManageCorrectiveActions()?`<div class="card closeoutBox"><div class="section" style="margin-top:0">Closeout</div>
        <label>Closeout Note (required)<textarea id="actionCloseoutNote" required placeholder="Describe what was corrected, verified, or completed before closing this action."></textarea></label>
        <button id="actionCloseoutSubmit" class="btn" onclick="completeActionCloseout('${esc(a.id)}')">Close Corrective Action</button>
      </div>`:a.status==='closed'?`<div class="notice">${a.closed_by?'This corrective action has a verified closeout.':'Legacy closure — no verified closer identity was recorded.'}</div>`:'<div class="notice">Read-only corrective action.</div>'}`;
    window.scrollTo(0,0);
  }catch(e){console.error(e);body.innerHTML='<div class="card bad">Could not load this corrective action.</div>';}
};

const closing=new Set();
window.completeActionCloseout=async function(id){
  if(!canManageCorrectiveActions()){toast('Your role cannot close corrective actions');return;}
  if(closing.has(id))return;
  const detail=currentDetail;
  if(!detail||detail.id!==id||detail.organizationId!==cloudOrganizationId||!['open','in_progress'].includes(detail.status)){
    toast('Open and review the current action before closing it');return;
  }
  const note=(document.getElementById('actionCloseoutNote')?.value||'').trim();
  if(!note){toast('Enter a closeout note before closing the action');return;}
  if(!confirm('Close this corrective action?')) return;
  closing.add(id);
  const button=document.getElementById('actionCloseoutSubmit');
  if(button)button.disabled=true;
  try{
    const client=initSupabase();
    const {data:row,error}=await client.from('corrective_actions').update({status:'closed',closeout_note:note})
      .eq('id',id).eq('organization_id',detail.organizationId).eq('status',detail.status)
      .select('id,closed_by,closed_at').single();
    if(error||!row?.closed_by||!row?.closed_at)throw error||new Error('Closeout not saved');
    if(typeof logAudit==='function')logAudit('closed','corrective_action',id);
    try{await loadCloudSafetyData();await openActionDetail(id);toast('Corrective action closed and verified');}
    catch(e){console.error(e);toast('Closeout saved. Reload to see the updated record.');}
  }catch(e){console.error(e);toast('Closeout could not complete. Refresh and check your access; the action may have changed.');}
  finally{closing.delete(id);if(button)button.disabled=false;}
};

function makeReportActionsTappable(){
  if(typeof window.renderReports!=='function'||window.__actionCloseoutReportsWrapped)return;
  window.__actionCloseoutReportsWrapped=true;
  const base=window.renderReports;
  window.renderReports=function(){
    base();
    if(typeof reportTab!=='undefined'&&reportTab==='actions'){
      document.querySelectorAll('#reportsBody .item').forEach(el=>{
        const id=el.dataset.actionId;
        if(id){el.classList.add('actionTap');el.onclick=()=>openActionDetail(id);}
      });
    }
  };
}

function makeActionScreenTappable(){
  if(typeof window.renderActions!=='function'||window.__actionCloseoutActionsWrapped)return;
  window.__actionCloseoutActionsWrapped=true;
  const base=window.renderActions;
  window.renderActions=function(){base();document.querySelectorAll('#actionsList .actionCard').forEach(card=>{
    if(card.dataset.actionId){card.classList.add('actionTap');card.addEventListener('click',e=>{if(e.target.closest('button'))return;openActionDetail(card.dataset.actionId);});}
  });};
}

window.addEventListener('load',()=>setTimeout(()=>{ensureUI();makeReportActionsTappable();makeActionScreenTappable();},500));
setTimeout(()=>{ensureUI();makeReportActionsTappable();makeActionScreenTappable();},900);
})();
