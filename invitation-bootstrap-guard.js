/* Safe Site - Invitation Bootstrap Guard v1 */
(function(){
'use strict';
const storageKey='safeSitePendingInvitation';
// Capture before sign-up can send the user away to confirm their email.
const urlToken=new URLSearchParams(location.search).get('invite');
if(urlToken) localStorage.setItem(storageKey,urlToken);
const token=()=>localStorage.getItem(storageKey);
const originalEnsure=window.ensureCloudTenant;
const originalRestore=window.restoreSession;
let accepting=null;
async function acceptInviteFirst(){
  const t=token(); if(!t)return false;
  if(accepting)return accepting;
  accepting=(async()=>{
    const client=initSupabase();
    const {data:{user},error:authError}=await client.auth.getUser();
    if(authError)throw authError;
    if(!user)return false;
    const {error}=await client.rpc('accept_team_invitation',{p_token:t});
    if(error)throw error;
    if(token()===t)localStorage.removeItem(storageKey);
    const url=new URL(location.href);
    if(url.searchParams.get('invite')===t)url.searchParams.delete('invite');
    history.replaceState({},'',url.pathname+url.search+url.hash);
    return true;
  })();
  try{return await accepting;}finally{accepting=null;}
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
// app.js registered the original function before this script was loaded.
window.removeEventListener('load',originalRestore);
window.addEventListener('load',()=>window.restoreSession());
window.SafeSiteInvitationGuard={version:'2.0',token,accept:acceptInviteFirst};
})();
