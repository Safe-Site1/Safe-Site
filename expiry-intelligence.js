/* Safe Site - Training Expiry Intelligence v1 */
(function(){
'use strict';

const DAY=86400000;
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;");

function daysToExpiry(q){
  if(!q?.expires) return null;
  const now=new Date(); now.setHours(0,0,0,0);
  const exp=new Date(q.expires+'T00:00:00'); exp.setHours(0,0,0,0);
  return Math.ceil((exp-now)/DAY);
}

function expiryBand(q){
  const d=daysToExpiry(q);
  if(d===null) return {key:'no_expiry',label:'No expiry',className:'ok',days:null};
  if(d<0) return {key:'expired',label:`Expired ${Math.abs(d)} day${Math.abs(d)===1?'':'s'} ago`,className:'bad',days:d};
  if(d<=30) return {key:'30',label:`Expires in ${d} day${d===1?'':'s'}`,className:'bad',days:d};
  if(d<=60) return {key:'60',label:`Expires in ${d} days`,className:'warn',days:d};
  if(d<=90) return {key:'90',label:`Expires in ${d} days`,className:'warn',days:d};
  return {key:'valid',label:`Expires ${new Date(q.expires+'T00:00:00').toLocaleDateString()}`,className:'ok',days:d};
}

function siteWorkers(){
  if(typeof currentWorkers==='function') return currentWorkers();
  return (db?.workers||[]).filter(w=>w.site===db?.settings?.site);
}

function expirySummary(){
  const rows=[];
  siteWorkers().forEach(w=>(w.quals||[]).forEach(q=>{
    const band=expiryBand(q);
    if(['expired','30','60','90'].includes(band.key)) rows.push({worker:w,qual:q,band});
  }));
  rows.sort((a,b)=>(a.band.days??99999)-(b.band.days??99999));
  return rows;
}

function ensureStyles(){
  if(document.getElementById('expiryIntelStyles')) return;
  const s=document.createElement('style');
  s.id='expiryIntelStyles';
  s.textContent=`
    .expiryIntel{margin-top:12px}.expiryIntelGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
    .expiryIntelStat{background:#102733;border:1px solid #315564;border-radius:10px;padding:10px;text-align:center}
    .expiryIntelStat b{display:block;font-size:22px}.expiryIntelStat span{font-size:11px;color:#9cb0ba}
    .expiryAlertRow{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.06)}
    .expiryAlertRow:last-child{border-bottom:0}.expiryAlertRow .grow{min-width:0}
    .expirySub{font-size:12px;color:#9cb0ba;margin-top:2px}
    .expiryBadge{font-size:11px;font-weight:900;padding:5px 8px;border-radius:999px;white-space:nowrap}
  `;
  document.head.appendChild(s);
}

function renderDashboardExpiry(){
  ensureStyles();
  const dashboard=document.getElementById('dashboard');
  if(!dashboard) return;

  let box=document.getElementById('trainingExpiryIntel');
  if(!box){
    box=document.createElement('div');
    box.id='trainingExpiryIntel';
    box.className='expiryIntel';
    const grid=dashboard.querySelector('.grid');
    if(grid) grid.insertAdjacentElement('afterend',box);
  }

  const rows=expirySummary();
  const c30=rows.filter(x=>x.band.key==='30').length;
  const c60=rows.filter(x=>x.band.key==='60').length;
  const c90=rows.filter(x=>x.band.key==='90').length;
  const expired=rows.filter(x=>x.band.key==='expired').length;

  box.innerHTML=`
    <div class="section">Training Expiry Alerts</div>
    <div class="card">
      <div class="expiryIntelGrid">
        <div class="expiryIntelStat"><b>${c30+expired}</b><span>Due / Expired ≤30d</span></div>
        <div class="expiryIntelStat"><b>${c60}</b><span>31–60 Days</span></div>
        <div class="expiryIntelStat"><b>${c90}</b><span>61–90 Days</span></div>
      </div>
      <div style="margin-top:10px">
        ${rows.length?rows.slice(0,6).map(x=>`
          <div class="expiryAlertRow">
            <div class="grow"><b>${esc(x.worker.name)}</b><div class="expirySub">${esc(x.qual.name)} · ${esc(x.qual.expires||'')}</div></div>
            <span class="expiryBadge ${x.band.className}">${esc(x.band.label)}</span>
          </div>`).join(''):'<div class="muted small">No training expires within 90 days.</div>'}
      </div>
    </div>`;
}

function renderWorkerExpiry(){
  const w=(db?.workers||[]).find(x=>x.id===currentWorkerId);
  const list=document.getElementById('qualList');
  if(!w||!list) return;

  list.innerHTML=(w.quals||[]).map(q=>{
    const b=expiryBand(q);
    const icon=b.key==='expired'||b.key==='30'?'!':'✓';
    const checkClass=(b.key==='expired'||b.key==='30'||b.key==='60'||b.key==='90')?'check warn':'check';
    const badgeClass=b.className;
    const expiryText=q.expires?`${new Date(q.expires+'T00:00:00').toLocaleDateString()} · ${b.label}`:'No expiry';
    return `<div class="item row">
      <span class="${checkClass}">${icon}</span>
      <div class="grow"><b>${esc(q.name)}</b><div class="small muted">${esc(expiryText)}</div></div>
      <span class="badge ${badgeClass}">${b.key==='expired'?'Expired':b.key==='30'?'≤30 Days':b.key==='60'?'31–60':b.key==='90'?'61–90':'Valid'}</span>
    </div>`;
  }).join('')||'<div class="muted">No qualifications added.</div>';
}

async function enhancePublicPass(){
  const token=new URLSearchParams(location.search).get('pass');
  const wrap=document.getElementById('publicWorkerPass');
  if(!token||!wrap||typeof initSupabase!=='function') return;

  try{
    const client=initSupabase();
    const {data,error}=await client.rpc('lookup_worker_pass_expiry',{p_token:token});
    if(error) throw error;
    const p=Array.isArray(data)?data[0]:data;
    if(!p) return;

    let extra=document.getElementById('publicExpiryIntel');
    if(!extra){
      extra=document.createElement('div');
      extra.id='publicExpiryIntel';
      const card=wrap.querySelector('.workerPassCard');
      if(card) card.appendChild(extra);
    }
    const next=p.days_until_next_expiry==null
      ? 'No upcoming dated expiries.'
      : `Next dated qualification expires in ${p.days_until_next_expiry} day${Number(p.days_until_next_expiry)===1?'':'s'} (${new Date(p.next_expiry_date+'T00:00:00').toLocaleDateString()}).`;

    extra.innerHTML=`
      <div class="section" style="text-align:left;margin-top:16px">Expiry Watch</div>
      <div class="expiryIntelGrid">
        <div class="expiryIntelStat"><b>${Number(p.expiring_30_count||0)}</b><span>≤30 Days</span></div>
        <div class="expiryIntelStat"><b>${Number(p.expiring_60_count||0)}</b><span>31–60 Days</span></div>
        <div class="expiryIntelStat"><b>${Number(p.expiring_90_count||0)}</b><span>61–90 Days</span></div>
      </div>
      <div class="notice small" style="margin-top:10px;text-align:left">${esc(next)}</div>`;
  }catch(e){ console.error('Safe Site expiry intelligence:',e); }
}

function wrapRenderers(){
  if(typeof window.renderDashboard==='function'&&!window.__expiryDashboardWrapped){
    window.__expiryDashboardWrapped=true;
    const base=window.renderDashboard;
    window.renderDashboard=function(){base();renderDashboardExpiry();};
  }
  if(typeof window.renderWorkerDetail==='function'&&!window.__expiryWorkerWrapped){
    window.__expiryWorkerWrapped=true;
    const base=window.renderWorkerDetail;
    window.renderWorkerDetail=function(){base();setTimeout(renderWorkerExpiry,0);};
  }
}

function init(){
  ensureStyles();
  wrapRenderers();
  setTimeout(()=>{
    renderDashboardExpiry();
    renderWorkerExpiry();
    enhancePublicPass();
  },700);
}

window.addEventListener('load',()=>setTimeout(init,400));
setTimeout(init,900);
})();