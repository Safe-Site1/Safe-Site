/* Safe Site - Worker Passport Expiry Display Fix v1 */
(function(){
  'use strict';

  function formatExpiryDate(value){
    if(!value) return 'No expiry';
    const d = new Date(String(value).slice(0,10) + 'T00:00:00');
    if(Number.isNaN(d.getTime())) return 'No expiry';
    return 'Expires ' + d.toLocaleDateString('en-CA', {
      year:'numeric', month:'short', day:'numeric'
    });
  }

  function patchPassportExpiry(){
    const screen=document.getElementById('workerDetail');
    if(!screen || screen.classList.contains('hidden')) return;

    const w=(db.workers||[]).find(x=>String(x.id)===String(currentWorkerId));
    if(!w || !Array.isArray(w.quals)) return;

    const rows=[...screen.querySelectorAll('.item')];
    w.quals.forEach(q=>{
      if(!q || !q.name || !q.expires) return;
      const row=rows.find(el=>{
        const b=el.querySelector('b');
        return b && b.textContent.trim().toLowerCase()===String(q.name).trim().toLowerCase();
      });
      if(!row) return;
      const muted=row.querySelector('.muted');
      if(muted) muted.textContent=formatExpiryDate(q.expires);
    });
  }

  const originalShow=window.show;
  if(typeof originalShow==='function'){
    window.show=function(name){
      const result=originalShow.apply(this,arguments);
      if(name==='workerDetail') setTimeout(patchPassportExpiry,0);
      return result;
    };
  }

  const originalRender=window.renderWorkerDetail;
  if(typeof originalRender==='function'){
    window.renderWorkerDetail=function(){
      const result=originalRender.apply(this,arguments);
      setTimeout(patchPassportExpiry,0);
      return result;
    };
  }

  document.addEventListener('safe-site-workers-updated',()=>setTimeout(patchPassportExpiry,0));
  setTimeout(patchPassportExpiry,250);
})();
