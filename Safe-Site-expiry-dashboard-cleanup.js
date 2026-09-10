/* Safe Site - Expiry Dashboard Cleanup v1 */
(function(){
'use strict';
function cleanupExpiryDashboard(){
  const box=document.getElementById('trainingExpiryIntel');
  if(!box)return;
  const card=box.querySelector('.card');
  const grid=box.querySelector('.expiryIntelGrid');
  if(!card||!grid)return;
  Array.from(card.children).forEach(child=>{
    if(child===grid||child.id==='expiryDrilldown')return;
    if(child.tagName==='DIV')child.remove();
  });
}
function install(){
  cleanupExpiryDashboard();
  const dashboard=document.getElementById('dashboard');
  if(!dashboard)return;
  new MutationObserver(cleanupExpiryDashboard).observe(dashboard,{childList:true,subtree:true});
}
window.addEventListener('load',()=>setTimeout(install,1800));
setTimeout(install,2200);
})();
