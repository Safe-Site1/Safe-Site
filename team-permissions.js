/* Safe Site Team & Permissions - Pilot Release */
(function(){
'use strict';
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const roleKey=()=>String(db?.settings?.role||'').toLowerCase().replaceAll(' ','_');
const isAdmin=()=>roleKey()==='administrator';
const isSupervisor=()=>roleKey()==='supervisor';

function addStyles(){
 if(document.getElementById('teamPermissionStyles')) return;
 const s=document.createElement('style'); s.id='teamPermissionStyles'; s.textContent=`
 .teamRole{display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.06)}
 .teamRole:last-child{border-bottom:0}.roleIcon{width:42px;height:42px;border-radius:10px;background:#153440;display:grid;place-items:center;font-size:20px}
 .permissionNote{border-left:3px solid var(--orange);padding-left:10px}.adminOnly.permissionHidden{display:none!important}
 `; document.head.appendChild(s);
}
function addScreen(){
 if(document.getElementById('team')) return;
 const main=document.querySelector('main'); if(!main) return;
 const sec=document.createElement('section'); sec.id='team'; sec.className='screen hidden';
 sec.innerHTML=`<div class="back" onclick="show('dashboard')">‹ Back</div><h1>Team & Permissions</h1><p class="muted">Pilot access for your Safe Site organization.</p>
 <div class="card"><div class="teamRole"><div class="roleIcon">👑</div><div class="grow"><b>Administrator</b><div class="small muted">Full pilot access including workforce and company controls.</div></div></div>
 <div class="teamRole"><div class="roleIcon">🦺</div><div class="grow"><b>Supervisor</b><div class="small muted">Daily safety workflows, reports and corrective actions.</div></div></div></div>
 <div class="section">Current access</div><div class="card"><div class="row"><div class="grow"><b>${esc(db?.settings?.company||'Safe Site')}</b><div class="small muted">Signed in role</div></div><span class="badge info" id="teamCurrentRole">${esc(db?.settings?.role||'User')}</span></div></div>
 <div class="notice permissionNote"><b>Pilot rule</b><div class="small muted">Administrators manage workforce and configuration. Supervisors run field safety workflows and manage corrective actions.</div></div>
 <div class="card adminOnly"><b>User invitations are the next connection step</b><p class="small muted" style="margin:6px 0 0">The role controls are now enforced in the app. Secure invitations will be connected to Supabase before a real contractor is invited.</p></div>`;
 main.appendChild(sec);
}
function addButton(){
 const dash=document.getElementById('dashboard'); if(!dash||document.getElementById('teamAccessBtn')) return;
 const host=document.getElementById('dashboardManage')||dash.querySelector('.quick'); if(!host) return;
 const b=document.createElement('button'); b.id='teamAccessBtn'; b.className='adminOnly'; b.textContent='👥 Team & Permissions'; b.onclick=()=>show('team'); host.appendChild(b);
}
function applyPermissions(){
 const admin=isAdmin(), supervisor=isSupervisor();
 document.querySelectorAll('.adminOnly').forEach(el=>el.classList.toggle('permissionHidden',!admin));
 ['addWorkerBtn','addQualBtn','uploadDocBox','addTaskBtn','manageTaskBtn'].forEach(id=>{
   const el=document.getElementById(id); if(el) el.style.display=admin?'':'none';
 });
 const role=document.getElementById('teamCurrentRole'); if(role) role.textContent=db?.settings?.role||'User';
}
function init(){addStyles();addScreen();addButton();applyPermissions();}
const baseShow=window.show;
window.show=function(id){
 if(id==='team'&&!isAdmin()){ if(typeof toast==='function') toast('Administrator access required'); return; }
 if(typeof baseShow==='function') baseShow(id);
 setTimeout(()=>{init();applyPermissions();},0);
};
const baseRenderDashboard=window.renderDashboard;
if(typeof baseRenderDashboard==='function') window.renderDashboard=function(){baseRenderDashboard();setTimeout(()=>{init();applyPermissions();},0);};
window.addEventListener('load',()=>setTimeout(init,300));
setTimeout(init,700);
})();