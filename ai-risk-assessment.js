/* Safe Site - AI Risk Assessment v2: secure server-side AI + local fallback */
(function(){
'use strict';
const byId=id=>document.getElementById(id);
const lines=v=>String(v||'').split(/[\n,]+/).map(x=>x.trim()).filter(Boolean);
const unique=a=>[...new Set(a.map(x=>String(x).trim()).filter(Boolean))];

function selectedTask(){
  const s=byId('praTask');
  if(!s||typeof db==='undefined') return null;
  const t=(db.tasks||[]).find(t=>String(t.id)===String(s.value));
  return t||{id:s.value,name:s.selectedOptions?.[0]?.textContent||s.value};
}
function siteContext(){
  const name=(typeof db!=='undefined'&&db?.settings?.site)||byId('siteSwitcher')?.selectedOptions?.[0]?.textContent||'';
  return {name};
}
function status(text,warn=false){
  const e=byId('aiRiskStatus');
  if(e){e.className='notice small'+(warn?' warn':'');e.textContent=text;}
}
function showQuestions(items){
  let box=byId('aiRiskQuestions');
  if(!box){
    box=document.createElement('div');box.id='aiRiskQuestions';box.className='notice small';box.style.display='none';
    byId('aiRiskStatus')?.insertAdjacentElement('afterend',box);
  }
  const q=unique(Array.isArray(items)?items:[]);
  if(!q.length){box.style.display='none';box.textContent='';return;}
  box.style.display='block';
  box.innerHTML='<b>Supervisor review questions</b><br>'+q.map(x=>'• '+escapeHtml(x)).join('<br>');
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function setSelect(id,value){const el=byId(id);if(el&&value>=1&&value<=5)el.value=String(value);}
function applyDraft(draft,source){
  const hazards=unique(draft?.hazards||[]), controls=unique(draft?.controls||[]);
  if(byId('praHazards')&&hazards.length) byId('praHazards').value=hazards.join('\n');
  if(byId('praControls')&&controls.length) byId('praControls').value=controls.join('\n');
  setSelect('praInitialLikelihood',Number(draft?.initial_likelihood));
  setSelect('praInitialSeverity',Number(draft?.initial_severity));
  setSelect('praResidualLikelihood',Number(draft?.residual_likelihood));
  setSelect('praResidualSeverity',Number(draft?.residual_severity));
  showQuestions(draft?.review_questions||[]);
  if(typeof updateRiskScores==='function') updateRiskScores();
  status((source==='ai'?'AI draft prepared':'Local draft prepared')+'. A competent supervisor must review every hazard, control and risk score before work starts.',true);
}
function localDraft(t){
  const h=lines(t?.hazards),c=lines(t?.controls),n=String(t?.name||'').toLowerCase();
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
  return {hazards:unique(h),controls:unique(c),initial_likelihood:3,initial_severity:3,residual_likelihood:2,residual_severity:3,review_questions:[]};
}
async function cloudDraft(t){
  if(typeof initSupabase!=='function') throw new Error('Cloud client unavailable');
  const client=initSupabase();
  if(!client?.functions?.invoke) throw new Error('Cloud functions unavailable');
  const payload={
    task:t?.name||byId('praTask')?.selectedOptions?.[0]?.textContent||'',
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
  status('Safe Site AI is reviewing the task and work context...');
  showQuestions([]);
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
function install(){
  const s=byId('praTask');if(!s||byId('aiRiskGenerateBtn'))return;
  const b=document.createElement('button');b.id='aiRiskGenerateBtn';b.type='button';b.className='btn secondary';b.textContent='Generate with AI';b.onclick=window.generateAIRiskAssessment;
  const note=document.createElement('div');note.id='aiRiskStatus';note.className='notice small';note.textContent='AI creates a draft only. Supervisor review is required before work starts.';
  const a=s.closest('label')||s;a.insertAdjacentElement('afterend',b);b.insertAdjacentElement('afterend',note);
}
document.addEventListener('DOMContentLoaded',install);window.addEventListener('load',install);setTimeout(install,500);
})();