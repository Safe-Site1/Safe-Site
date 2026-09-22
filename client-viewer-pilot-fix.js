/* Safe Site - Client Viewer Pilot Polish v1 */
(function(){
'use strict';
const role=()=>String((typeof db!=='undefined'&&db?.settings?.role)||'').toLowerCase().replaceAll(' ','_');
const isClient=()=>role()==='client_viewer';
const hide=e=>{if(e)e.style.display='none'}, showEl=e=>{if(e)e.style.display=''};

function applyNav(){
 if(!isClient())return;
 const nav=document.querySelector('.nav'); if(!nav)return;
 nav.querySelectorAll('button').forEach(b=>{
   if((b.textContent||'').toLowerCase().includes('my passport')){
     b.innerHTML='<span>👥</span>Workers'; b.onclick=()=>show('workers');
   }
 });
 showEl(document.getElementById('n-reports')); hide(document.getElementById('n-admin'));
}
function lockWrites(){
 if(!isClient())return;
 ['addWorkerBtn','addQualBtn','uploadDocBox','addTaskBtn','manageTaskBtn','deleteTaskBtn'].forEach(id=>hide(document.getElementById(id)));
 document.querySelectorAll('button').forEach(b=>{
   const t=(b.textContent||'').trim().toLowerCase();
   if(/^(save|submit|add|upload|create|delete|close|mark in progress)/.test(t)||
      t.includes('start pre-shift')||t==='flra'||t.includes('pre-task risk assessment')||
      t==='inspection'||t==='incident'||t.includes('manage corrective')) hide(b);
 });
}
function refreshCompliance(){
 if(!isClient())return;
 const engine=window.SafeSiteQualificationRequirements;
 if(!engine||typeof engine.evaluateWorker!=='function'||typeof db==='undefined')return;
 const workers=(db.workers||[]).filter(w=>w.site===db.settings.site);
 let ready=0,expiring=0,issues=0,loading=0;
 workers.forEach(w=>{
   const s=String(engine.evaluateWorker(w)?.overall||'').toLowerCase();
   if(s==='loading')loading++; else if(s==='ready')ready++; else if(s==='expiring')expiring++; else issues++;
 });
 if(loading){
   setTimeout(()=>engine.loadCloud?.(0).then(()=>setTimeout(refreshCompliance,50)).catch(()=>{}),500);
   return;
 }
 const total=workers.length,pct=total?Math.round(ready/total*100):0;
 const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v};
 set('readyCount',ready);set('expiringCount',expiring);set('issueCount',issues);
 const badge=document.getElementById('complianceBadge');
 if(badge){badge.textContent=pct+'% compliant';badge.className='badge '+(pct>=90?'ok':pct>=75?'warn':'bad')}
 const bar=document.getElementById('complianceBar');if(bar)bar.style.width=pct+'%';
}
function apply(){if(isClient()){applyNav();lockWrites();refreshCompliance()}}
const previousShow=window.show;
if(typeof previousShow==='function'&&!window.__clientViewerPolishWrapped){
 window.__clientViewerPolishWrapped=true;
 window.show=function(name){
   if(isClient() && ['workerEditor','qualificationEditor','taskEditor','correctiveAction','preshift','flra','riskAssessment','inspection','incident','admin','team','teamInvite'].includes(name)){
     window.toast?.('Client Viewer has read-only access'); return previousShow('dashboard');
   }
   const r=previousShow.apply(this,arguments);setTimeout(apply,25);return r;
 };
}
window.addEventListener('safesite:qualifications-updated',()=>setTimeout(apply,50));
window.addEventListener('load',()=>setTimeout(apply,700));
setInterval(apply,2000);
window.SafeSiteClientViewer={version:'1.0',apply};
})();
