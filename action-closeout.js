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
      <div class="back" onclick="show('reports')">‹ Back to Reports</div>
      <h1>Corrective Action</h1><p id="actionDetailSub" class="muted"></p>
      <div id="actionDetailBody"><div class="card muted">Loading action…</div></div>`;
    document.querySelector('main')?.appendChild(sec);
  }
}

async function getCloudAction(id){
  const client=initSupabase();
  const {data,error}=await client.from('corrective_actions')
    .select('id,site_id,safety_record_id,title,description,priority,status,due_date,created_at,closed_at')
    .eq('id',id).single();
  if(error) throw error;return data;
}

window.openActionDetail=async function(id){
  ensureUI();
  document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden'));
  document.getElementById('actionDetail').classList.remove('hidden');
  document.querySelectorAll('.nav button').forEach(b=>b.classList.remove('active'));
  document.getElementById('n-reports')?.classList.add('active');
  const body=document.getElementById('actionDetailBody');body.innerHTML='<div class="card muted">Loading action…</div>';
  try{
    const a=await getCloudAction(id);const overdue=a.status!=='closed'&&a.due_date&&a.due_date<new Date().toISOString().slice(0,10);
    document.getElementById('actionDetailSub').textContent=`${label(a.status)} · ${label(a.priority)} priority${overdue?' · OVERDUE':''}`;
    body.innerHTML=`
      <div class="card ${overdue?'closeoutDanger':''}"><div class="actionDetailGrid">
        <div class="actionDetailRow"><b>Action</b><div>${esc(a.title||'Corrective action')}</div></div>
        <div class="actionDetailRow"><b>Description / Closeout History</b><div style="white-space:pre-wrap">${esc(a.description||'No additional details.')}</div></div>
        <div class="actionDetailRow"><b>Priority</b><div>${esc(label(a.priority))}</div></div>
        <div class="actionDetailRow"><b>Status</b><div>${esc(label(a.status))}</div></div>
        <div class="actionDetailRow"><b>Due Date</b><div>${esc(a.due_date||'No due date')}${overdue?' · OVERDUE':''}</div></div>
        <div class="actionDetailRow"><b>Created</b><div>${esc(new Date(a.created_at).toLocaleString())}</div></div>
        ${a.closed_at?`<div class="actionDetailRow"><b>Closed</b><div>${esc(new Date(a.closed_at).toLocaleString())}</div></div>`:''}
      </div></div>
      ${a.safety_record_id?`<button class="btn secondary" onclick="openRecordDetail('${esc(a.safety_record_id)}')">View Source Safety Record</button>`:''}
      ${a.status!=='closed'?`<div class="card closeoutBox"><div class="section" style="margin-top:0">Closeout</div>
        <label>Closeout Note<textarea id="actionCloseoutNote" placeholder="Describe what was corrected, verified, or completed before closing this action."></textarea></label>
        <button class="btn" onclick="completeActionCloseout('${esc(a.id)}')">Close Corrective Action</button>
      </div>`:'<div class="notice">This corrective action is closed.</div>'}`;
    window.scrollTo(0,0);
  }catch(e){console.error(e);body.innerHTML='<div class="card bad">Could not load this corrective action.</div>';}
};

window.completeActionCloseout=async function(id){
  const note=(document.getElementById('actionCloseoutNote')?.value||'').trim();
  if(!note){toast('Enter a closeout note before closing the action');return;}
  if(!confirm('Close this corrective action?')) return;
  try{
    const current=await getCloudAction(id);
    const stamp=new Date().toLocaleString();
    const history=[current.description||'',`Closeout (${stamp}): ${note}`].filter(Boolean).join('\n\n');
    const client=initSupabase();
    const {error}=await client.from('corrective_actions').update({status:'closed',closed_at:new Date().toISOString(),description:history}).eq('id',id);
    if(error) throw error;
    await loadCloudSafetyData();
    if(typeof logAudit==='function') logAudit('closed','corrective_action',current.title||id);
    toast('Corrective action closed');
    show('reports');
    if(typeof setReportTab==='function'){
      const buttons=[...document.querySelectorAll('#reports .tabs button')];
      const actionsBtn=buttons.find(b=>b.textContent.trim().toLowerCase()==='actions');
      if(actionsBtn) setReportTab('actions',actionsBtn); else renderReports();
    } else renderReports();
  }catch(e){console.error(e);toast('Corrective action could not be closed');}
};

function makeReportActionsTappable(){
  if(typeof window.renderReports!=='function'||window.__actionCloseoutReportsWrapped)return;
  window.__actionCloseoutReportsWrapped=true;
  const base=window.renderReports;
  window.renderReports=function(){
    base();
    if(typeof reportTab!=='undefined'&&reportTab==='actions'){
      document.querySelectorAll('#reportsBody .item').forEach(el=>{
        const title=el.querySelector('b')?.textContent?.trim();
        const a=db.actions.find(x=>x.description===title&&x.site===db.settings.site);
        if(a){el.classList.add('actionTap');el.onclick=()=>openActionDetail(a.id);}
      });
    }
  };
}

function makeActionScreenTappable(){
  if(typeof window.renderActions!=='function'||window.__actionCloseoutActionsWrapped)return;
  window.__actionCloseoutActionsWrapped=true;
  const base=window.renderActions;
  window.renderActions=function(){base();document.querySelectorAll('#actionsList .actionCard').forEach(card=>{
    const title=card.querySelector('b')?.textContent?.trim();const a=db.actions.find(x=>x.description===title&&x.site===db.settings.site);
    if(a){card.classList.add('actionTap');card.addEventListener('click',e=>{if(e.target.closest('button'))return;openActionDetail(a.id);});}
  });};
}

window.addEventListener('load',()=>setTimeout(()=>{ensureUI();makeReportActionsTappable();makeActionScreenTappable();},500));
setTimeout(()=>{ensureUI();makeReportActionsTappable();makeActionScreenTappable();},900);
})();