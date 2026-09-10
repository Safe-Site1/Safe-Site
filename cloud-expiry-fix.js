/* Safe Site - Cloud Training Expiry Fix v2
   Uses the same db.workers qualification data loaded from Supabase.
*/
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
function days(v){
  const e=parseDate(v); if(!e)return null;
  const n=new Date(); n.setHours(0,0,0,0);
  return Math.round((e-n)/DAY);
}
function selectedWorkers(){
  const all=(window.db&&Array.isArray(db.workers))?db.workers:[];
  const site=db?.settings?.site;
  return all.filter(w=>!site || w.site===site);
}
function rows(){
  const a=[];
  selectedWorkers().forEach(w=>(w.quals||[]).forEach(q=>{
    const d=days(q.expires);
    if(d===null||d>90)return;
    let band=d<0?'expired':d<=30?'30':d<=60?'60':'90';
    a.push({w,q,d,band});
  }));
  return a.sort((x,y)=>x.d-y.d);
}
function paint(){
  const box=document.getElementById('trainingExpiryIntel');
  if(!box)return;
  const r=rows(), c30=r.filter(x=>x.band==='expired'||x.band==='30').length,
        c60=r.filter(x=>x.band==='60').length, c90=r.filter(x=>x.band==='90').length;
  const stats=box.querySelectorAll('.expiryIntelStat b');
  if(stats.length>=3){stats[0].textContent=c30;stats[1].textContent=c60;stats[2].textContent=c90;}
  const card=box.querySelector('.card');
  if(!card)return;
  let detail=box.querySelector('#cloudExpiryRows');
  if(!detail){detail=document.createElement('div');detail.id='cloudExpiryRows';detail.style.marginTop='10px';card.appendChild(detail);}
  detail.innerHTML=r.length?r.slice(0,6).map(x=>{
    const label=x.d<0?`Expired ${Math.abs(x.d)} days ago`:x.d===0?'Expires today':`Expires in ${x.d} days`;
    return `<div class="expiryAlertRow"><div class="grow"><b>${String(x.w.name||'Worker')}</b><div class="expirySub">${String(x.q.name||'Qualification')} · ${String(x.q.expires||'')}</div></div><span class="expiryBadge ${x.d<=30?'bad':'warn'}">${label}</span></div>`;
  }).join(''):'';
  // Hide the old "No training..." message when cloud rows exist.
  if(r.length){
    [...card.querySelectorAll('.muted.small')].forEach(el=>{
      if(/No training expires within 90 days/i.test(el.textContent)) el.style.display='none';
    });
  }
}
async function refreshFromCloud(){
  try{
    if(typeof window.loadCloudWorkers==='function' && window.cloudOrganizationId) await window.loadCloudWorkers();
  }catch(e){console.error('Expiry cloud refresh',e);}
  setTimeout(paint,20);
}
window.SafeSiteRefreshExpiry=refreshFromCloud;
window.addEventListener('safesite:qualifications-updated',refreshFromCloud);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshFromCloud();});
window.addEventListener('load',()=>setTimeout(refreshFromCloud,900));
setInterval(paint,2000);
})();
