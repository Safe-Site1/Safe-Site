/* Safe Site - AI Risk Assessment UI v1 */
(function(){
'use strict';
const byId=id=>document.getElementById(id);
const lines=v=>String(v||'').split('\n').map(x=>x.trim()).filter(Boolean);
const unique=a=>[...new Set(a)];
function task(){const s=byId('praTask');return s&&typeof db!=='undefined'?(db.tasks||[]).find(t=>String(t.id)===String(s.value)):null}
function draft(t){
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
 return {hazards:unique(h),controls:unique(c)};
}
function status(text,warn){const e=byId('aiRiskStatus');if(e){e.className='notice small'+(warn?' warn':'');e.textContent=text}}
window.generateAIRiskAssessment=async function(){
 const t=task();if(!t){if(typeof toast==='function')toast('Select a task first');return}
 const b=byId('aiRiskGenerateBtn');if(b){b.disabled=true;b.textContent='Generating draft...'}
 try{
  const d=draft(t);
  if(byId('praHazards'))byId('praHazards').value=d.hazards.join('\n');
  if(byId('praControls'))byId('praControls').value=d.controls.join('\n');
  status('AI draft prepared. A competent supervisor must review every hazard, control and risk score before work starts.',true);
  if(typeof updateRiskPreview==='function')updateRiskPreview();
  if(typeof toast==='function')toast('AI risk assessment draft generated');
 }finally{if(b){b.disabled=false;b.textContent='Generate with AI'}}
};
function install(){
 const s=byId('praTask');if(!s||byId('aiRiskGenerateBtn'))return;
 const b=document.createElement('button');b.id='aiRiskGenerateBtn';b.type='button';b.className='btn secondary';b.textContent='Generate with AI';b.onclick=window.generateAIRiskAssessment;
 const note=document.createElement('div');note.id='aiRiskStatus';note.className='notice small';note.textContent='AI creates a draft only. Supervisor review is required before work starts.';
 const a=s.closest('label')||s;a.insertAdjacentElement('afterend',b);b.insertAdjacentElement('afterend',note);
}
document.addEventListener('DOMContentLoaded',install);window.addEventListener('load',install);setTimeout(install,500);
})();