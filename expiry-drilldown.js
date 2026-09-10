/* Safe Site - Expiry Drilldown Add-on v1 */
(function(){
'use strict';
const DAY=86400000; let active=null;
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;");
function days(q){if(!q?.expires)return null;const n=new Date();n.setHours(0,0,0,0);const e=new Date(q.expires+'T00:00:00');e.setHours(0,0,0,0);return Math.ceil((e-n)/DAY);}
function band(q){const d=days(q);if(d===null)return null;if(d<=30)return '30';if(d<=60)return '60';if(d<=90)return '90';return null;}
function workers(){return typeof currentWorkers==='function'?currentWorkers():(db?.workers||[]).filter(w=>w.site===db?.settings?.site);}
function rows(){const r=[];workers().forEach(w=>(w.quals||[]).forEach(q=>{const b=band(q);if(b)r.push({w,q,b,d:days(q)});}));return r.sort((a,b)=>a.d-b.d);}
function openWorker(id){const w=(db?.workers||[]).find(x=>String(x.id)===String(id));if(!w)return;currentWorkerId=w.id;if(typeof show==='function')show('workerDetail');}
function draw(){
 const d=document.getElementById('expiryDrilldown');if(!d)return;
 document.querySelectorAll('#trainingExpiryIntel .expiryIntelStat').forEach((x,i)=>x.style.borderColor=active===['30','60','90'][i]?'#f06b35':'');
 if(!active){d.innerHTML='<div class="small muted" style="margin-top:10px">Tap an expiry box to review affected workers.</div>';return;}
 const names={30:'Due / Expired ≤30 Days',60:'Expiring in 31–60 Days',90:'Expiring in 61–90 Days'};
 const r=rows().filter(x=>x.b===active);
 d.innerHTML=`<div style="font-weight:800;margin:14px 0 4px">${names[active]}</div>${r.length?r.map(x=>`<div class="item row" data-exp-worker="${esc(x.w.id)}" style="cursor:pointer"><div class="grow"><b>${esc(x.w.name)}</b><div class="small muted">${esc(x.q.name)} · ${esc(x.q.expires||'')}</div></div><span class="badge ${x.d<=30?'bad':'warn'}">${x.d<0?'Expired':x.d+' days'}</span><span style="font-size:20px;color:#9cb0ba">›</span></div>`).join(''):'<div class="small muted" style="padding:10px 0">No workers in this expiry range.</div>'}`;
 d.querySelectorAll('[data-exp-worker]').forEach(el=>el.onclick=()=>openWorker(el.dataset.expWorker));
}
function install(){
 const box=document.getElementById('trainingExpiryIntel');if(!box)return;
 const stats=box.querySelectorAll('.expiryIntelStat');if(stats.length<3)return;
 const keys=['30','60','90'];
 stats.forEach((el,i)=>{el.style.cursor='pointer';el.onclick=()=>{active=active===keys[i]?null:keys[i];draw();};});
 let d=document.getElementById('expiryDrilldown');
 if(!d){d=document.createElement('div');d.id='expiryDrilldown';box.querySelector('.card')?.appendChild(d);}
 draw();
}
window.addEventListener('load',()=>setTimeout(install,1600));
setInterval(()=>{if(document.getElementById('trainingExpiryIntel')&&!document.getElementById('expiryDrilldown'))install();},1200);
})();