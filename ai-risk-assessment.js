 /* Safe Site - AI Risk Assessment v3: live AI + supervisor review workflow */
(function(){
'use strict';
const byId=id=>document.getElementById(id);
const clean=s=>String(s||'').replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g,'').trim();
const lines=v=>String(v||'').split(/[\n,]+/).map(clean).filter(Boolean);
const unique=a=>[...new Set((a||[]).map(clean).filter(Boolean))];

function selectedTask(){
  const s=byId('praTask');
  if(!s||typeof db==='undefined') return null;
  const t=(db.tasks||[]).find(t=>String(t.id)===String(s.value));
  return t||{id:s.value,name:s.selectedOptions?.[0]?.textContent||s.value};
}
function siteContext(){
  const switcher=byId('siteSwitcher');
  const selectedId=switcher?.value;
  const selectedName=switcher?.selectedOptions?.[0]?.textContent||'';
  const site=(typeof db!=='undefined'&&Array.isArray(db?.sites))
    ? db.sites.find(s=>String(s.id)===String(selectedId)||clean(s.name)===clean(selectedName))
    : null;
  return {
    name:clean(site?.name||db?.settings?.site||selectedName),
    country:clean(site?.country||db?.settings?.country),
    jurisdiction:clean(site?.jurisdiction||db?.settings?.jurisdiction),
    regulator:clean(site?.regulator||db?.settings?.regulator),
    sector:clean(site?.sector||site?.mining_sector||db?.settings?.sector),
    mineType:clean(site?.mineType||site?.mine_type||db?.settings?.mineType)
  };
}
function status(text,warn=false){
  const e=byId('aiRiskStatus');
  if(e){e.className='notice small'+(warn?' warn':'');e.textContent=clean(text);}
}
function escapeHtml(s){return clean(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function showQuestions(items){
  let box=byId('aiRiskQuestions');
  if(!box){
    box=document.createElement('div');box.id='aiRiskQuestions';box.className='notice small';box.style.display='none';
    byId('aiRiskStatus')?.insertAdjacentElement('afterend',box);
  }
  const q=unique(items);
  if(!q.length){box.style.display='none';box.textContent='';return;}
  box.style.display='block';
  box.innerHTML='<b>Supervisor review questions</b><br>'+q.map(x=>'• '+escapeHtml(x)).join('<br>');
}
function setSelect(id,value){const el=byId(id);if(el&&value>=1&&value<=5)el.value=String(value);}

function renderReview(hazards,controls,summary){
  let box=byId('aiSupervisorReview');
  if(!box){
    box=document.createElement('div');box.id='aiSupervisorReview';box.className='card';box.style.marginTop='12px';
    byId('aiRiskQuestions')?.insertAdjacentElement('afterend',box);
  }
  const hs=unique(hazards);
  box.innerHTML=
    '<div class="section" style="margin-top:0">Supervisor AI Draft Review</div>'+
    (summary?'<div class="notice small">'+escapeHtml(summary)+'</div>':'')+
    '<div class="small" style="margin:10px 0">Review each AI-generated hazard before submission.</div>'+
    hs.map((h,i)=>'<label style="display:flex;gap:10px;align-items:flex-start;margin:8px 0"><input type="checkbox" class="aiHazardReview" data-i="'+i+'" style="width:auto;margin-top:3px"><span>'+escapeHtml(h)+'</span></label>').join('')+
    '<label style="display:flex;gap:10px;align-items:flex-start;margin:12px 0"><input type="checkbox" id="aiControlsRiskReviewed" style="width:auto;margin-top:3px"><span>I reviewed and adjusted the controls and risk scores for the actual work conditions.</span></label>';
  window.__safeSiteAiDraftPendingReview=true;
}
function reviewComplete(){
  if(!window.__safeSiteAiDraftPendingReview) return true;
  const hazards=[...document.querySelectorAll('.aiHazardReview')];
  return hazards.length>0 && hazards.every(x=>x.checked) && !!byId('aiControlsRiskReviewed')?.checked;
}
function applyDraft(draft,source){
  const hazards=unique(draft?.hazards||[]), controls=unique(draft?.controls||[]);
  if(byId('praHazards')&&hazards.length) byId('praHazards').value=hazards.join('\n');
  if(byId('praControls')&&controls.length) byId('praControls').value=controls.join('\n');
  setSelect('praInitialLikelihood',Number(draft?.initial_likelihood));
  setSelect('praInitialSeverity',Number(draft?.initial_severity));
  setSelect('praResidualLikelihood',Number(draft?.residual_likelihood));
  setSelect('praResidualSeverity',Number(draft?.residual_severity));
  showQuestions(draft?.review_questions||[]);
  renderReview(hazards,controls,draft?.summary||'');
  if(typeof updateRiskScores==='function') updateRiskScores();
  status((source==='ai'?'AI draft prepared':'Local draft prepared')+'. A competent supervisor must review every hazard, control and risk score before work starts.',true);
}
function localDraft(t){
  const h=lines(t?.hazards),c=lines(t?.controls),n=clean(t?.name).toLowerCase();
  if(/rebar|ground support|bolt|bolting/.test(n)){
    h.push('Unsupported or loose ground','Stored energy and pinch points during installation','Manual handling and ergonomic strain','Interaction with drilling or installation equipment','Poor visibility, access, or footing');
    c.push('Inspect and scale the work area as required before starting','Establish exclusion zones and keep hands clear of pinch points','Use mechanical assistance and proper lifting technique where practicable','Complete equipment pre-use checks and isolate equipment before clearing jams','Maintain lighting, housekeeping, communication, and secure footing');
  } else if(/haul|truck|muck|scoop|loader|mobile/.test(n)){
    h.push('Mobile equipment interaction and line-of-fire exposure','Limited visibility and blind spots','Ground or roadway conditions','Unexpected equipment movement or mechanical failure','Pedestrian interaction');
    c.push('Follow site traffic rules and positive communication requirements','Verify brakes, steering, lights, alarms, and safety devices before use','Maintain safe speed and distance for conditions','Use approved parking and isolation procedures','Keep pedestrians separated from operating equipment');
  } else {
    h.push('Line-of-fire and pinch-point exposure','Slips, trips, and poor access','Unexpected equipment or energy movement','Communication failure or changing work conditions');
    c.push('Inspect the work area before starting and correct unsafe conditions','Keep clear of line-of-fire and pinch points','Apply required isolation/lockout and equipment controls','Maintain positive communication and stop work if conditions change');
  }
  return {hazards:unique(h),controls:unique(c),initial_likelihood:3,initial_severity:3,residual_likelihood:2,residual_severity:3,review_questions:[],summary:'Local fallback draft. Verify against the actual task and site conditions.'};
}
async function cloudDraft(t){
  if(typeof initSupabase!=='function') throw new Error('Cloud client unavailable');
  const client=initSupabase();
  if(!client?.functions?.invoke) throw new Error('Cloud functions unavailable');
  const payload={
    task:t?.name||byId('praTask')?.selectedOptions?.[0]?.textContent||'',
    taskDetails:{role:t?.role||t?.jobRole||'',equipment:t?.equipment||'',description:t?.description||''},
    area:byId('praArea')?.value||'',
    existingHazards:lines(byId('praHazards')?.value||t?.hazards||''),
    existingControls:lines(byId('praControls')?.value||t?.controls||''),
    site:siteContext()
  };
  const {data,error}=await client.functions.invoke('ai-risk-assessment',{body:payload});
  if(error) throw error;
  if(!data?.draft) throw new Error(data?.error||'No AI draft returned');
  return data.draft;
}
window.generateAIRiskAssessment=async function(){
  const t=selectedTask();
  if(!t){if(typeof toast==='function')toast('Select a task first');return;}
  const b=byId('aiRiskGenerateBtn');
  if(b){b.disabled=true;b.textContent='Generating AI draft...';}
  window.__safeSiteAiDraftPendingReview=false;
  status('Safe Site AI is reviewing the task and work context...');
  showQuestions([]);
  byId('aiSupervisorReview')?.remove();
  try{
    const d=await cloudDraft(t);
    applyDraft(d,'ai');
    if(typeof toast==='function')toast('AI risk assessment draft generated');
  }catch(err){
    console.warn('Safe Site AI unavailable; using local draft',err);
    applyDraft(localDraft(t),'local');
    status('Live AI is not configured or temporarily unavailable, so Safe Site used the local draft. Supervisor review is required.',true);
    if(typeof toast==='function')toast('Used local risk draft');
  }finally{
    if(b){b.disabled=false;b.textContent='Generate with AI';}
  }
};
function wrapSubmit(){
  if(typeof window.submitRiskAssessment!=='function'||window.submitRiskAssessment.__aiWrapped)return;
  const original=window.submitRiskAssessment;
  const wrapped=async function(){
    if(!reviewComplete()){
      status('Complete the Supervisor AI Draft Review before submitting this assessment.',true);
      byId('aiSupervisorReview')?.scrollIntoView({behavior:'smooth',block:'center'});
      if(typeof toast==='function')toast('Supervisor review is required');
      return;
    }
    const result=await original.apply(this,arguments);
    window.__safeSiteAiDraftPendingReview=false;
    return result;
  };
  wrapped.__aiWrapped=true;
  window.submitRiskAssessment=wrapped;
}
function install(){
  const s=byId('praTask');if(!s)return;
  if(!byId('aiRiskGenerateBtn')){
    const b=document.createElement('button');b.id='aiRiskGenerateBtn';b.type='button';b.className='btn secondary';b.textContent='Generate with AI';b.onclick=window.generateAIRiskAssessment;
    const note=document.createElement('div');note.id='aiRiskStatus';note.className='notice small';note.textContent='AI creates a draft only. Supervisor review is required before work starts.';
    const a=s.closest('label')||s;a.insertAdjacentElement('afterend',b);b.insertAdjacentElement('afterend',note);
  }
  wrapSubmit();
}
document.addEventListener('DOMContentLoaded',install);window.addEventListener('load',install);setTimeout(install,500);setTimeout(wrapSubmit,1200);
})();
