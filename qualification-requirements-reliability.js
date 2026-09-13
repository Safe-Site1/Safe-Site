/* Safe Site - Qualification Requirements Reliability Patch v1 */
(function(){
'use strict';

let attempts = 0;
let timer = null;

function ready(){
  return typeof window.initSupabase === 'function' &&
    typeof window.cloudOrganizationId !== 'undefined' &&
    !!window.cloudOrganizationId &&
    typeof window.cloudSiteIds !== 'undefined' &&
    window.cloudSiteIds &&
    Object.keys(window.cloudSiteIds).length > 0 &&
    window.SafeSiteQualificationRequirements &&
    typeof window.SafeSiteQualificationRequirements.loadCloud === 'function';
}

async function retry(){
  clearTimeout(timer);
  if(ready()){
    try{
      await window.SafeSiteQualificationRequirements.loadCloud(0);
      window.SafeSiteQualificationRequirements.refresh?.();
      attempts = 0;
      return;
    }catch(e){
      console.warn('Safe Site qualification requirements retry', e);
    }
  }
  attempts++;
  const delay = attempts < 20 ? 500 : attempts < 60 ? 1500 : 5000;
  timer = setTimeout(retry, delay);
}

window.addEventListener('load', retry);
window.addEventListener('safesite:qualifications-updated', retry);
window.addEventListener('safesite:cloud-ready', retry);
document.addEventListener('visibilitychange',()=>{ if(!document.hidden) retry(); });

const originalShow = window.show;
if(typeof originalShow === 'function' && !window.__qualificationReliabilityShowWrapped){
  window.__qualificationReliabilityShowWrapped = true;
  window.show = function(name){
    const result = originalShow.apply(this, arguments);
    if(name === 'workerDetail') setTimeout(retry, 50);
    return result;
  };
}

setTimeout(retry, 250);
})();
