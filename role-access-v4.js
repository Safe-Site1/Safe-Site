/* Safe Site - Role-Based Access Control v4 */
(function(){
'use strict';

const role=()=>String(window.db?.settings?.role||'').toLowerCase().replaceAll(' ','_');
const has=(...roles)=>roles.includes(role());
const isAdmin=()=>has('administrator');
const isStaff=()=>has('administrator','supervisor','safety_coordinator');
const isWorker=()=>has('worker');
const isClient=()=>has('client_viewer');

const screenRules={
  admin:['administrator'],
  team:['administrator'],
  teamInvite:['administrator'],
  workerEditor:['administrator','supervisor','safety_coordinator'],
  qualificationEditor:['administrator','safety_coordinator'],
  taskLibrary:['administrator','supervisor','safety_coordinator'],
  taskEditor:['administrator','supervisor','safety_coordinator'],
  correctiveAction:['administrator','supervisor','safety_coordinator'],
  preshift:['administrator','supervisor','safety_coordinator','worker'],
  flra:['administrator','supervisor','safety_coordinator','worker'],
  riskAssessment:['administrator','supervisor','safety_coordinator','worker'],
  inspection:['administrator','supervisor','safety_coordinator','worker'],
  incident:['administrator','supervisor','safety_coordinator','worker'],
  reports:['administrator','supervisor','safety_coordinator','client_viewer'],
  workers:['administrator','supervisor','safety_coordinator','worker'],
  workerDetail:['administrator','supervisor','safety_coordinator','worker']
};

const canOpen=id=>!screenRules[id] || screenRules[id].includes(role());

function setVisible(id,visible){
  const el=document.getElementById(id);
  if(el) el.style.display=visible?'':'none';
}
function hideButtonByText(text){
  document.querySelectorAll('button').forEach(b=>{
    if(b.textContent.trim().includes(text)) b.style.display='none';
  });
}
function disableWriteControls(root=document){
  root.querySelectorAll('button,input,select,textarea').forEach(el=>{
    if(el.closest('#header') || el.id==='siteSwitcher' || el.textContent?.includes('Back')) return;
    if(el.tagName==='BUTTON'){
      const t=el.textContent.trim().toLowerCase();
      if(t.includes('print') || t.includes('back') || t.includes('view')) return;
    }
    el.disabled=true;
  });
}
function addRoleBanner(){
  let b=document.getElementById('safeSiteRoleBanner');
  if(!b){
    b=document.createElement('div');
    b.id='safeSiteRoleBanner';
    b.className='notice small';
    b.style.margin='0 0 12px';
    document.querySelector('main')?.prepend(b);
  }
  const labels={
    administrator:'Administrator — full access',
    supervisor:'Supervisor — operational safety access',
    safety_coordinator:'Safety Coordinator — safety & compliance access',
    worker:'Worker — personal & field safety access',
    client_viewer:'Client Viewer — read-only access'
  };
  b.textContent=labels[role()]||'Restricted access';
}
function applyRoleUI(){
  addRoleBanner();

  // Admin-only company/team controls.
  setVisible('n-admin',isAdmin());
  document.querySelectorAll('.adminOnly').forEach(el=>el.style.display=isAdmin()?'':'none');

  // Workforce creation/editing.
  setVisible('addWorkerBtn',isStaff());
  setVisible('addQualBtn',has('administrator','safety_coordinator'));
  setVisible('uploadDocBox',has('administrator','safety_coordinator'));
  setVisible('addTaskBtn',isStaff());
  setVisible('manageTaskBtn',isStaff());

  // Workers do not get organization management controls.
  if(isWorker()){
    setVisible('n-admin',false);
    setVisible('addWorkerBtn',false);
    setVisible('addQualBtn',false);
    setVisible('uploadDocBox',false);
    setVisible('addTaskBtn',false);
    setVisible('manageTaskBtn',false);
    hideButtonByText('Close Action');
    hideButtonByText('Team & Permissions');
  }

  // Client Viewer is strictly read-only in the UI.
  if(isClient()){
    setVisible('n-admin',false);
    setVisible('addWorkerBtn',false);
    setVisible('addQualBtn',false);
    setVisible('uploadDocBox',false);
    setVisible('addTaskBtn',false);
    setVisible('manageTaskBtn',false);
    ['START PRE-SHIFT','FLRA','Pre-Task Risk Assessment','Inspection','Incident',
     'Submit','Save','Add','Upload','Create','Close Action'].forEach(hideButtonByText);
  }
}

const previousShow=window.show;
if(typeof previousShow==='function'){
  window.show=function(id){
    if(!canOpen(id)){
      window.toast?.(isClient()?'Read-only access':'Your role does not have access to that screen');
      return previousShow('dashboard');
    }
    previousShow(id);
    setTimeout(()=>{
      applyRoleUI();
      if(isClient()){
        const screen=document.getElementById(id);
        if(screen && !['dashboard','reports'].includes(id)) disableWriteControls(screen);
      }
    },0);
  };
}

// Function-level guards protect against manually invoking hidden UI actions.
const writeGuards={
  saveWorker:['administrator','supervisor','safety_coordinator'],
  saveQualification:['administrator','safety_coordinator'],
  attachWorkerDocument:['administrator','safety_coordinator'],
  saveTask:['administrator','supervisor','safety_coordinator'],
  deleteTask:['administrator','supervisor','safety_coordinator'],
  createRealInvitation:['administrator'],
  inviteUser:['administrator']
};
function installGuards(){
  Object.entries(writeGuards).forEach(([name,roles])=>{
    const original=window[name];
    if(typeof original!=='function' || original.__rbacV4) return;
    const guarded=function(...args){
      if(!roles.includes(role())){
        window.toast?.('Your role does not have permission for that action');
        return;
      }
      return original.apply(this,args);
    };
    guarded.__rbacV4=true;
    window[name]=guarded;
  });
}

function refresh(){
  installGuards();
  applyRoleUI();
}
window.addEventListener('load',()=>setTimeout(refresh,900));
setInterval(refresh,2000);
window.safeSitePermissions={
  version:'4.0',
  role,
  canOpen,
  isAdmin,isStaff,isWorker,isClient,
  refresh
};
})();
