/* Safe Site - Qualification Requirements Reliability Patch v2 */
(function(){
'use strict';
let timer=null, attempts=0;
function api(){ return window.SafeSiteQualificationRequirements; }
function currentEvaluation(){
  try{
    if(typeof db==='undefined' || !api()?.evaluateWorker) return null;
    let worker=null;
    if(typeof currentWorkerId!=='undefined' && currentWorkerId!=null){
      worker=(db.workers||[]).find(w=>String(w.id)===String(currentWorkerId));
    }
    if(!worker) worker=(db.workers||[])[0]||null;
    return worker ? api().evaluateWorker(worker) : null;
  }catch(_){ return null; }
}
function schedule(delay){ clearTimeout(timer); timer=setTimeout(retry,delay); }
async function retry(){
  clearTimeout(timer);
  const q=api();
  if(!q || typeof q.loadCloud!=='function'){
    attempts++; schedule(attempts<20?400:1500); return;
  }
  try{
    await q.loadCloud(0);
    q.refresh?.();
    const evaluation=currentEvaluation();
    if(evaluation && evaluation.overall!=='loading'){ attempts=0; return; }
  }catch(e){ console.warn('Safe Site qualification requirements retry',e); }
  attempts++;
  schedule(attempts<20?500:attempts<60?1500:5000);
}
window.addEventListener('load',()=>schedule(100));
window.addEventListener('safesite:qualifications-updated',()=>schedule(50));
window.addEventListener('safesite:cloud-ready',()=>schedule(50));
document.addEventListener('visibilitychange',()=>{ if(!document.hidden) schedule(50); });
const originalShow=window.show;
if(typeof originalShow==='function' && !window.__qualificationReliabilityShowWrappedV2){
  window.__qualificationReliabilityShowWrappedV2=true;
  window.show=function(name){
    const result=originalShow.apply(this,arguments);
    if(name==='workerDetail' || name==='myPassport') schedule(50);
    return result;
  };
}
schedule(150);
})();
