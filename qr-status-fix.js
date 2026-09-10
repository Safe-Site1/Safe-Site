/* Safe Site - QR Worker Pass Status Alignment v1 */
(function(){
'use strict';

function reconcileWorkerPassStatus(){
  const pass=document.getElementById('publicWorkerPass');
  if(!pass) return;

  const status=pass.querySelector('.passStatus');
  const stats=[...pass.querySelectorAll('.passStat')];
  if(!status || stats.length<3) return;

  const getCount=(label)=>{
    const el=stats.find(x=>x.textContent.toLowerCase().includes(label));
    const n=parseInt(el?.querySelector('b')?.textContent||'0',10);
    return Number.isFinite(n)?n:0;
  };

  const valid=getCount('valid');
  const expiring=getCount('expiring');
  const expired=getCount('expired');

  status.classList.remove('ok','warn','bad');

  if(expired>0){
    status.classList.add('bad');
    status.textContent='! REVIEW REQUIRED';
  }else if(expiring>0){
    status.classList.add('warn');
    status.textContent='⚠ TRAINING EXPIRING';
  }else if(valid>0){
    status.classList.add('ok');
    status.textContent='✓ READY FOR WORK';
  }else{
    status.classList.add('bad');
    status.textContent='! REVIEW REQUIRED';
  }
}

const observer=new MutationObserver(reconcileWorkerPassStatus);
observer.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('load',()=>setTimeout(reconcileWorkerPassStatus,700));
setTimeout(reconcileWorkerPassStatus,1200);
})();
