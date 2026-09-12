/* Safe Site - Qualification Duplicate Prevention v1 */
(function(){
  function norm(v){ return String(v||'').trim().replace(/\s+/g,' ').toLowerCase(); }
  window.saveQualification=async function(){
    const w=(db.workers||[]).find(x=>String(x.id)===String(currentWorkerId));
    if(!w)return;
    const name=qualName.value.trim().replace(/\s+/g,' ');
    if(!name){toast('Qualification name is required');return}
    if(!cloudUser||!cloudOrganizationId){toast('Cloud connection required');return}
    const client=initSupabase();
    const existing=(w.quals||[]).find(q=>norm(q.name)===norm(name));
    const payload={name,issued_on:qualIssued.value||null,expires_on:qualExpiry.value||null,status:'valid'};
    let result;
    if(existing&&existing.id){
      result=await client.from('qualifications').update(payload).eq('id',existing.id).eq('worker_id',w.id).eq('organization_id',cloudOrganizationId);
    }else{
      result=await client.from('qualifications').insert({organization_id:cloudOrganizationId,worker_id:w.id,...payload});
    }
    if(result.error){toast(existing?'Could not update qualification':'Could not save qualification');console.error(result.error);return}
    logAudit(existing?'updated':'created','qualification',`${w.name}: ${name}`);
    await loadCloudWorkers();
    toast(existing?'Existing qualification updated':'Qualification saved to cloud');
    show('workerDetail');
  };
})();