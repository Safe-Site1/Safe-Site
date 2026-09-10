/* Safe Site - Cloud Training Expiry Fix v3 */
(function(){
'use strict';
const DAY=86400000;

function parseDate(v){
  if(!v) return null;
  if(v instanceof Date) return new Date(v.getFullYear(),v.getMonth(),v.getDate());
  const s=String(v).trim();
  let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m) return new Date(+m[1],+m[2]-1,+m[3]);
  m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m) return new Date(+m[3],+m[2]-1,+m[1]);
  const d=new Date(s);
  return isNaN(d)?null:new Date(d.getFullYear(),d.getMonth(),d.getDate());
}

function daysUntil(v){
  const e=parseDate(v); if(!e) return null;
  const n=new Date(); n.setHours(0,0,0,0);
  return Math.round((e-n)/DAY);
}

function selectedWorkers(){
  if(typeof db==='undefined' || !Array.isArray(db.workers)) return [];
  const site=db.settings?.site;
  return db.workers.filter(w=>!site || w.site===site);
}

function expiryRows(){
  const out=[];
  selectedWorkers().forEach(w=>(w.quals||[]).forEach(q=>{
    const d=daysUntil(q.expires);
    if(d===null || d>90) return;
    const band=d<0?'expired':d<=30?'30':d<=60?'60':'90';
    out.push({w,q,d,band});
  }));
  return out.sort((a,b)=>a.d-b.d);
}

function paint(){
  const box=document.getElementById('trainingExpiryIntel');
  if(!box) return;

  const rows=expiryRows();
  const c30=rows.filter(x=>x.band==='expired'||x.band==='30').length;
  const c60=rows.filter(x=>x.band==='60').length;
  const c90=rows.filter(x=>x.band==='90').length;

  const stats=box.querySelectorAll('.expiryIntelStat b');
  if(stats.length>=3){
    stats[0].textContent=c30;
    stats[1].textContent=c60;
    stats[2].textContent=c90;
  }

  const card=box.querySelector('.card');
  if(!card) return;

  [...card.querySelectorAll('.muted.small')].forEach(el=>{
    if(/No training expires within 90 days/i.test(el.textContent))
      el.style.display=rows.length?'none':'';
  });

  let detail=box.querySelector('#cloudExpiryRows');
  if(!detail){
    detail=document.createElement('div');
    detail.id='cloudExpiryRows';
    detail.style.marginTop='10px';
    card.appendChild(detail);
  }

  detail.innerHTML=rows.length?rows.slice(0,6).map(x=>{
    const label=x.d<0?`Expired ${Math.abs(x.d)} days ago`:x.d===0?'Expires today':`Expires in ${x.d} days`;
    return `<div class="expiryAlertRow"><div class="grow"><b>${String(x.w.name||'Worker')}</b><div class="expirySub">${String(x.q.name||'Qualification')} · ${String(x.q.expires||'')}</div></div><span class="expiryBadge ${x.d<=30?'bad':'warn'}">${label}</span></div>`;
  }).join(''):'';
}

async function refreshFromCloud(){
  try{
    if(typeof loadCloudWorkers==='function' && typeof cloudOrganizationId!=='undefined' && cloudOrganizationId){
      await loadCloudWorkers();
    }
  }catch(e){ console.error('Expiry cloud refresh',e); }
  setTimeout(paint,50);
}

window.SafeSiteRefreshExpiry=refreshFromCloud;
window.addEventListener('safesite:qualifications-updated',refreshFromCloud);
document.addEventListener('visibilitychange',()=>{ if(!document.hidden) refreshFromCloud(); });
window.addEventListener('load',()=>setTimeout(refreshFromCloud,1000));
setInterval(paint,1500);
})();
