/* Safe Site - Invitation Bootstrap Guard v1 */
(function(){
'use strict';
const token=()=>new URLSearchParams(location.search).get('invite');
const originalEnsure=window.ensureCloudTenant;
const originalRestore=window.restoreSession;
async function acceptInviteFirst(){
  const t=token(); if(!t)return false;
  const client=initSupabase();
  const {data:{user}}=await client.auth.getUser();
  if(!user)return false;
  const {error}=await client.rpc('accept_team_invitation',{p_token:t});
  if(error)throw error;
  history.replaceState({},'',location.pathname);
  return true;
}
window.ensureCloudTenant=async function(){
  if(token()){
    const client=initSupabase();
    const {data:{user}}=await client.auth.getUser();
    if(!user)throw new Error('Sign in required to accept this invitation');
    await acceptInviteFirst();
  }
  return originalEnsure.apply(this,arguments);
};
window.restoreSession=async function(){
  const client=initSupabase(); if(!client)return;
  const {data:{session}}=await client.auth.getSession();
  if(!session?.user)return;
  cloudUser=session.user;
  try{
    if(token())await acceptInviteFirst();
    await originalEnsure();
    await loadCloudContext();
    await loadCloudWorkers();
    await loadCloudSafetyData();
    openAuthenticatedApp();
  }catch(e){
    console.error('Safe Site invitation/session restore failed',e);
    const status=document.getElementById('loginStatus');
    if(status)status.textContent=e.message||'Safe Site could not accept this invitation.';
  }
};
window.SafeSiteInvitationGuard={version:'1.0'};
})();