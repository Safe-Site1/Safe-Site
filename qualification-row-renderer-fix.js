/* Safe Site - Qualification Row Renderer Fix v1 */
(function(){
  'use strict';

  function formatDate(value){
    if(!value) return 'No expiry';
    const raw=String(value).slice(0,10);
    const d=new Date(raw+'T00:00:00');
    if(Number.isNaN(d.getTime())) return 'No expiry';
    return 'Expires ' + d.toLocaleDateString('en-CA',{
      year:'numeric',month:'short',day:'numeric'
    });
  }

  function renderQualificationRows(){
    const w=(db.workers||[]).find(x=>String(x.id)===String(currentWorkerId));
    if(!w || !window.qualList) return;

    qualList.innerHTML=(w.quals||[]).map(q=>{
      const st=qualificationStatus(q);
      const expiryText=formatDate(q.expires);
      return `<div class="item row" data-qualification-id="${q.id||''}">
        <span class="check ${st!=='valid'?'warn':''}">${st==='valid'?'✓':'!'}</span>
        <div class="grow"><b>${q.name}</b><div class="small muted">${expiryText}</div></div>
        ${badge(st)}
      </div>`;
    }).join('') || '<div class="muted">No qualifications added.</div>';
  }

  const baseRender=window.renderWorkerDetail;
  if(typeof baseRender==='function'){
    window.renderWorkerDetail=function(){
      const result=baseRender.apply(this,arguments);
      renderQualificationRows();
      return result;
    };
  }

  const baseShow=window.show;
  if(typeof baseShow==='function'){
    window.show=function(name){
      const result=baseShow.apply(this,arguments);
      if(name==='workerDetail') setTimeout(renderQualificationRows,0);
      return result;
    };
  }

  setTimeout(renderQualificationRows,250);
})();
