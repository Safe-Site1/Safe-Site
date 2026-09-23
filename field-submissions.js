/* One transaction per field submission; retry the same payload after an uncertain response. */
(function(){
  const attempts=new Map(),busy=new Set();
  const value=id=>(document.getElementById(id)?.value||'').trim();
  const allowed=()=>['Worker','Supervisor','Administrator','Safety Coordinator'].includes(db.settings.role);
  const fields={inspection:['inspEquip','inspArea','inspCond','inspNotes','inspPhoto'],incident:['incType','incLocation','incDesc','incAction','incPeople','incPhoto']};
  function lock(kind,locked){fields[kind].forEach(id=>{document.getElementById(id).disabled=locked;});}
  async function submit(kind){
    if(!allowed()){toast('Your role cannot submit safety records');return;}
    if(busy.has(kind))return;
    const site=currentCloudSiteId(),organization=cloudOrganizationId,user=cloudUser?.id;
    if(!site||!organization||!user){toast('Wait for your signed-in cloud site to load');return;}
    let attempt=attempts.get(kind);
    if(attempt&&(attempt.p_site_id!==site||attempt.p_organization_id!==organization||attempt.user!==user)){
      attempts.delete(kind);lock(kind,false);attempt=null;
    }
    if(!attempt){
      const inspection=kind==='inspection';
      const area=value(inspection?'inspArea':'incLocation');
      if(!area){toast(inspection?'Work Area is required':'Location is required');return;}
      const condition=value('inspCond'),description=value('incDesc'),notes=value('inspNotes');
      if(inspection&&!['Pass','Deficiency Found','Out of Service'].includes(condition)){toast('Choose an inspection condition');return;}
      if(inspection&&condition!=='Pass'&&!notes){toast('Describe the deficiency before submitting');return;}
      if(!inspection&&!['Incident','Near Miss'].includes(value('incType'))){toast('Choose a report type');return;}
      if(!inspection&&!description){toast('Describe the incident or near miss');return;}
      // The old form saved only a filename, not photo evidence. Do not pretend a file was uploaded.
      if(document.getElementById(inspection?'inspPhoto':'incPhoto').files?.length){toast('Photo uploads are not available yet. Remove the file and describe the evidence in your notes.');return;}
      attempt={user,p_id:crypto.randomUUID(),p_organization_id:organization,p_site_id:site,
        p_type:inspection?'inspection':value('incType')==='Near Miss'?'near_miss':'incident',
        p_title:inspection?value('inspEquip'):area,p_area:area,
        p_data:inspection?{area,workArea:area,condition,notes,photo:null}:{description,immediateAction:value('incAction'),people:value('incPeople'),photo:null}};
      if(!attempt.p_title){toast('Equipment is required');return;}
      attempts.set(kind,attempt);
    }
    busy.add(kind);lock(kind,true);
    const button=document.getElementById(kind==='inspection'?'inspectionSubmit':'incidentSubmit');
    button.disabled=true;
    try{
      const {user:ignored,...payload}=attempt;
      const {data,error}=await initSupabase().rpc('submit_field_record',payload);
      if(error||data!==attempt.p_id)throw error||new Error('Submission was not confirmed');
      if(attempts.get(kind)!==attempt)return;
      attempts.delete(kind);
      if(cloudUser?.id!==user||cloudOrganizationId!==organization||currentCloudSiteId()!==site)return;
      fields[kind].filter(id=>!['inspEquip','inspCond','incType'].includes(id)).forEach(id=>{document.getElementById(id).value='';});
      lock(kind,false);
      logAudit('submitted',attempt.p_type,attempt.p_title);
      try{await loadCloudSafetyData();show('dashboard');toast(kind==='inspection'&&attempt.p_data.condition!=='Pass'?'Inspection and linked action saved to cloud':'Report saved to cloud');}
      catch(e){console.error(e);toast('Report saved. Reload to refresh the list; do not submit it again.');}
    }catch(e){
      console.error(e);
      if(attempts.get(kind)!==attempt)return;
      if(e?.code&&/^(22|23|42|P0)/.test(e.code)){
        attempts.delete(kind);lock(kind,false);
        toast('Report was not saved. Check your entries and access, then retry.');
      }else toast('Save not confirmed. Entries are locked for a safe retry; tap Submit again to check or complete this submission.');
    }finally{busy.delete(kind);button.disabled=false;if(!attempts.has(kind))lock(kind,false);}
  }
  window.submitInspection=()=>submit('inspection');
  window.submitIncident=()=>submit('incident');
  window.clearFieldDrafts=()=>{
    attempts.clear();
    for(const kind of Object.keys(fields)){
      fields[kind].filter(id=>!['inspEquip','inspCond','incType'].includes(id)).forEach(id=>{document.getElementById(id).value='';});
      lock(kind,false);
    }
  };
})();
