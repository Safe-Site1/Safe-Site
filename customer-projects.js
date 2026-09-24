(function(){
 let saving=false,createAttempt=null;
 const note=text=>{document.getElementById('projectSaveStatus').textContent=text;};
 async function save(isNew){
  if(db.settings.role!=='Administrator'){toast('Administrator access required');return;}
  if(saving)return;
  const org=cloudOrganizationId,user=cloudUser?.id;
  if(!org||!user){note('Wait for your signed-in organization to load.');return;}
  const name=document.getElementById(isNew?'newProjectName':'currentSiteName').value.trim();
  const company=document.getElementById('companyName').value.trim();
  if(!name||name.length>150||(!isNew&&(!company||company.length>150))){note('Enter a name of 1 to 150 characters.');return;}
  if(isNew&&(!createAttempt||createAttempt.name!==name||createAttempt.org!==org))createAttempt={id:crypto.randomUUID(),name,org};
  const id=isNew?createAttempt.id:currentCloudSiteId();
  if(!id){note('Select a project first.');return;}
  saving=true;note('Saving project…');
  try{
   const {data,error}=await initSupabase().rpc('save_customer_project',{p_org:org,p_id:id,p_name:name,p_new:isNew,p_company:isNew?null:company});
   if(error||data!==id)throw error||new Error('Save not confirmed');
   if(cloudOrganizationId!==org||cloudUser?.id!==user)return;
   if(isNew){document.getElementById('newProjectName').value='';createAttempt=null;}
   try{
    window.clearFieldDrafts?.();cancelNewAction();
    // Resolve by immutable ID after renaming, preserving all existing report links.
    await loadCloudContext();
    db.settings.site=Object.keys(cloudSiteIds).find(n=>cloudSiteIds[n]===id)||db.settings.site;
    await loadCloudTaskTemplates();await loadCloudWorkers();await loadCloudSafetyData();
    persist();populateSiteSwitcher();renderAdmin();note('Project saved to your organization.');
   }catch(e){console.error(e);note('Project saved. Reload to refresh your project list.');}
  }catch(e){console.error(e);note(e.code==='23514'?e.message:'Project save was not confirmed. Check your connection and administrator access, then retry.');}
  finally{saving=false;}
 }
 window.addSite=()=>save(true);
 window.saveAdminSettings=()=>save(false);
})();
