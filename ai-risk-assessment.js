/* Safe Site - AI Risk Assessment v3.4: sentence-safe permanent AI audit trail */
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
    '<div class="section" style="margin-top:0">Check AI Draft Before Submission</div>'+
    (summary?'<div class="notice small">'+escapeHtml(summary)+'</div>':'')+
    '<div class="small" style="margin:10px 0">Review each AI-generated hazard before submission.</div>'+
    hs.map((h,i)=>'<label style="display:flex;gap:10px;align-items:flex-start;margin:8px 0"><input type="checkbox" class="aiHazardReview" data-i="'+i+'" style="width:auto;margin-top:3px"><span>'+escapeHtml(h)+'</span></label>').join('')+
    '<label style="display:flex;gap:10px;align-items:flex-start;margin:12px 0"><input type="checkbox" id="aiControlsRiskReviewed" style="width:auto;margin-top:3px"><span>I reviewed and adjusted the controls and risk scores for the actual work conditions.</span></label>';
  window.__safeSiteAiDraftPendingReview=true;
  box.querySelectorAll('input[type="checkbox"]').forEach(x=>x.addEventListener('change',updateSubmitGate));
  installSubmitGuard();
  updateSubmitGate();
}
function reviewComplete(){
  if(!window.__safeSiteAiDraftPendingReview) return true;
  const hazards=[...document.querySelectorAll('.aiHazardReview')];
  return hazards.length>0 && hazards.every(x=>x.checked) && !!byId('aiControlsRiskReviewed')?.checked;
}

function stopWorkThreshold(){
  return currentRiskStopWorkThreshold();
}
function residualScore(){
  return Number(byId('praResidualLikelihood')?.value||0)*Number(byId('praResidualSeverity')?.value||0);
}
function residualBlocked(){ return residualScore()>=stopWorkThreshold(); }
function ensureResidualNotice(){
  let box=byId('aiResidualGateNotice');
  if(!box){
    box=document.createElement('div');box.id='aiResidualGateNotice';box.className='notice small warn';box.style.display='none';
    byId('praResidualResult')?.insertAdjacentElement('afterend',box);
  }
  const blocked=residualBlocked(),score=residualScore(),threshold=stopWorkThreshold();
  if(blocked){
    box.style.display='block';
    box.innerHTML='<b>STOP — additional controls required.</b><br>Residual risk score '+score+' meets or exceeds this site’s current stop-work threshold ('+threshold+'). Strengthen the controls and reassess the residual risk before work proceeds.';
  }else{
    box.style.display='none';box.textContent='';
  }
}
function submitButton(){
  return byId('praSubmit');
}
function updateSubmitGate(){
  const b=submitButton(); if(!b)return;
  ensureResidualNotice();
  const audit=window.__safeSiteAiAudit;
  const riskLocked=residualBlocked();
  if(audit&&riskLocked){
    const score=residualScore(), threshold=stopWorkThreshold();
    const last=audit.stopWorkEvents?.[audit.stopWorkEvents.length-1];
    if(!last||last.score!==score){
      (audit.stopWorkEvents ||= []).push({at:new Date().toISOString(),score,threshold});
    }
  }
  if(audit&&window.__safeSiteAiDraftPendingReview&&reviewComplete()&&!audit.preparerDraftCheckedAt){
    audit.preparerDraftCheckedAt=new Date().toISOString();
  }
  const reviewLocked=!!window.__safeSiteAiDraftPendingReview && !reviewComplete();
  const locked=reviewLocked||riskLocked||riskAssessmentSubmitting;
  b.disabled=locked;
  b.style.opacity=locked?'0.45':'';
  b.style.cursor=locked?'not-allowed':'';
  b.title=reviewLocked?'Check the AI draft before submitting':(riskLocked?'Additional controls and residual-risk reassessment required before submitting':'');
}
function installSubmitGuard(){
  const b=submitButton();
  if(!b||b.dataset.aiGuard==='1')return;
  b.dataset.aiGuard='1';
  b.addEventListener('click',function(e){
    if(window.__safeSiteAiDraftPendingReview && !reviewComplete()){
      e.preventDefault();e.stopImmediatePropagation();
      status('Check every AI-drafted hazard and control before submitting for supervisor review.',true);
      byId('aiSupervisorReview')?.scrollIntoView({behavior:'smooth',block:'center'});
      if(typeof toast==='function')toast('Check the AI draft before submitting');
      return;
    }
    if(residualBlocked()){
      e.preventDefault();e.stopImmediatePropagation();
      ensureResidualNotice();
      byId('aiResidualGateNotice')?.scrollIntoView({behavior:'smooth',block:'center'});
      if(typeof toast==='function')toast('Residual risk is above the site stop-work threshold');
    }
  },true);
}
function applyDraft(draft,source){
  const hazards=unique(draft?.hazards||[]), controls=unique(draft?.controls||[]);
  window.__safeSiteAiAudit={
    used:true,
    source,
    generatedAt:new Date().toISOString(),
    originalDraft:{
      hazards:[...hazards],
      controls:[...controls],
      initialLikelihood:Number(draft?.initial_likelihood)||null,
      initialSeverity:Number(draft?.initial_severity)||null,
      residualLikelihood:Number(draft?.residual_likelihood)||null,
      residualSeverity:Number(draft?.residual_severity)||null,
      reviewQuestions:unique(draft?.review_questions||[]),
      summary:clean(draft?.summary||'')
    },
    stopWorkEvents:[],
    preparerDraftCheckedAt:null
  };
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
let draftGeneration=0;
window.resetAIRiskDraft=function(){
  draftGeneration++;
  window.__safeSiteAiDraftPendingReview=false;
  window.__safeSiteAiAudit=null;
  byId('aiSupervisorReview')?.remove();
  showQuestions([]);
  status('AI creates a draft only. Supervisor approval is required after submission.');
  updateSubmitGate();
};
window.generateAIRiskAssessment=async function(){
  const t=selectedTask();
  if(!t){if(typeof toast==='function')toast('Select a task first');return;}
  const b=byId('aiRiskGenerateBtn');
  const generation=++draftGeneration;
  if(b){b.disabled=true;b.textContent='Generating AI draft...';}
  window.__safeSiteAiDraftPendingReview=false;
  updateSubmitGate();
  status('Safe Site AI is reviewing the task and work context...');
  showQuestions([]);
  byId('aiSupervisorReview')?.remove();
  try{
    const d=await cloudDraft(t);
    if(generation!==draftGeneration)return;
    applyDraft(d,'ai');
    if(typeof toast==='function')toast('AI risk assessment draft generated');
  }catch(err){
    if(generation!==draftGeneration)return;
    console.warn('Safe Site AI unavailable; using local draft',err);
    applyDraft(localDraft(t),'local');
    status('Live AI is not configured or temporarily unavailable, so Safe Site used the local draft. Supervisor review is required.',true);
    if(typeof toast==='function')toast('Used local risk draft');
  }finally{
    if(b){b.disabled=false;b.textContent='Generate with AI';}
  }
};
function auditLines(v){
  return String(v||'').split(/\n+/).map(x=>x.trim()).filter(Boolean);
}
function currentAuditPayload(){
  const a=window.__safeSiteAiAudit;
  if(!a?.used)return null;
  return {
    version:'4.0',
    aiUsed:true,
    source:a.source,
    generatedAt:a.generatedAt,
    originalDraft:a.originalDraft,
    preparerDraftCheckedAt:a.preparerDraftCheckedAt,
    stopWorkTriggered:(a.stopWorkEvents||[]).length>0,
    stopWorkEvents:a.stopWorkEvents||[],
    finalReviewed:{
      hazards:auditLines(byId('praHazards')?.value),
      controls:auditLines(byId('praControls')?.value),
      initialLikelihood:Number(byId('praInitialLikelihood')?.value||0),
      initialSeverity:Number(byId('praInitialSeverity')?.value||0),
      residualLikelihood:Number(byId('praResidualLikelihood')?.value||0),
      residualSeverity:Number(byId('praResidualSeverity')?.value||0),
      residualScore:residualScore(),
      stopWorkThreshold:stopWorkThreshold(),
      crew:clean(byId('praCrew')?.value),
      reviewedAt:new Date().toISOString()
    }
  };
}
function installCloudAuditWrapper(){
  if(typeof window.saveCloudSafetyRecord!=='function'||window.saveCloudSafetyRecord.__aiAuditWrapped)return;
  const original=window.saveCloudSafetyRecord;
  const wrapped=async function(recordType,title,workArea,taskName,data,statusValue){
    const audit=recordType==='pre_task_risk_assessment'?currentAuditPayload():null;
    const merged=audit?{...(data||{}),aiAudit:audit}:data;
    const row=await original.call(this,recordType,title,workArea,taskName,merged,statusValue);
    if(audit){
      try{
        const client=typeof initSupabase==='function'?initSupabase():null;
        const org=(typeof cloudOrganizationId!=='undefined'?cloudOrganizationId:null);
        const user=(typeof cloudUser!=='undefined'?cloudUser?.id:null);
        if(client&&org&&row?.id){
          await client.from('audit_log').insert({
            organization_id:org,
            user_id:user,
            action:'ai_risk_assessment_submitted',
            entity_type:'safety_record',
            entity_id:row.id,
            metadata:{
              ai_source:audit.source,
              generated_at:audit.generatedAt,
              preparer_draft_checked_at:audit.preparerDraftCheckedAt,
              stop_work_triggered:audit.stopWorkTriggered,
              stop_work_events:audit.stopWorkEvents,
              final_residual_score:audit.finalReviewed.residualScore,
              stop_work_threshold:audit.finalReviewed.stopWorkThreshold
            }
          });
        }
      }catch(e){console.warn('AI audit_log insert unavailable; audit remains stored in safety record',e);}
    }
    return row;
  };
  wrapped.__aiAuditWrapped=true;
  window.saveCloudSafetyRecord=wrapped;
}
function wrapSubmit(){
  if(typeof window.submitRiskAssessment!=='function'||window.submitRiskAssessment.__aiWrapped)return;
  const original=window.submitRiskAssessment;
  const wrapped=async function(){
    if(!reviewComplete()){
      status('Check every AI-drafted hazard and control before submitting for supervisor review.',true);
      byId('aiSupervisorReview')?.scrollIntoView({behavior:'smooth',block:'center'});
      if(typeof toast==='function')toast('Check the AI draft before submitting');
      return;
    }
    if(residualBlocked()){
      ensureResidualNotice();
      byId('aiResidualGateNotice')?.scrollIntoView({behavior:'smooth',block:'center'});
      if(typeof toast==='function')toast('Additional controls are required before work can proceed');
      return;
    }
    const result=await original.apply(this,arguments);
    if(result?.id)window.resetAIRiskDraft();
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
  installCloudAuditWrapper();
  wrapSubmit();
  installSubmitGuard();
  ['praResidualLikelihood','praResidualSeverity'].forEach(id=>{
    const el=byId(id);
    if(el&&el.dataset.aiRiskGate!=='1'){
      el.dataset.aiRiskGate='1';
      el.addEventListener('change',()=>{
        if(window.__safeSiteAiDraftPendingReview){
          const confirm=byId('aiControlsRiskReviewed');
          if(confirm) confirm.checked=false;
        }
        updateSubmitGate();
      });
    }
  });
  const controls=byId('praControls');
  if(controls&&controls.dataset.aiRiskGate!=='1'){
    controls.dataset.aiRiskGate='1';
    controls.addEventListener('input',()=>{
      if(window.__safeSiteAiDraftPendingReview){
        const confirm=byId('aiControlsRiskReviewed');
        if(confirm) confirm.checked=false;
      }
      updateSubmitGate();
    });
  }
  updateSubmitGate();
}
document.addEventListener('DOMContentLoaded',install);window.addEventListener('load',install);setTimeout(install,500);setTimeout(wrapSubmit,1200);
})();
