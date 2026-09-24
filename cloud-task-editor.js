(function(){
 let context=null,busy=false;
 const permitted=()=>['Administrator','Safety Coordinator'].includes(db.settings.role);
 const oldNew=window.newTask,oldEdit=window.editTask;
 window.newTask=function(){
  if(!permitted()){toast('Administrator or Safety Coordinator access required');return;}
  context={id:crypto.randomUUID(),org:cloudOrganizationId,site:currentCloudSiteId(),version:0};oldNew();
 };
 window.editTask=function(id){
  if(!permitted()){toast('Administrator or Safety Coordinator access required');return;}
  const t=db.tasks.find(t=>t.id===id);if(!t)return;
  if(t.siteId!==currentCloudSiteId()){toast('This is a shared template. Create a project-specific task to customize it.');return;}
  context={id:crypto.randomUUID(),previous:t.id,org:cloudOrganizationId,site:t.siteId,version:t.version};oldEdit(id);
 };
 const valid=()=>permitted()&&context&&context.org===cloudOrganizationId&&context.site===currentCloudSiteId();
 window.saveTask=async function(){
  if(!valid()){toast('Reopen the task in its project with authorized access');return;}if(busy)return;
  const c=context,name=editTaskName.value.trim(),hazards=editTaskHazards.value.split('\n').map(x=>x.trim()).filter(Boolean),controls=editTaskControls.value.split('\n').map(x=>x.trim()).filter(Boolean);
  if(!name||!hazards.length||!controls.length){toast('Task name, hazards and controls are required');return;}
  busy=true;
  try{
   const {data,error}=await initSupabase().rpc('save_cloud_task',{p_id:c.id,p_org:c.org,p_site:c.site,p_name:name,p_category:editTaskCategory.value,p_hazards:hazards,p_controls:controls,p_version:c.version,p_previous:c.previous||null});
   if(error||data!==c.id)throw error||new Error('Task save not confirmed');
   if(context!==c||!valid())return;
   context=null;editingTaskId=null;
   await loadCloudTaskTemplates();show('taskLibrary');toast(taskTemplatesReady()?'Task saved to cloud':'Task saved. Reload to refresh templates.');
  }catch(e){console.error(e);toast(e.code==='23514'?e.message:'Task save not confirmed. Entries are kept; retry before leaving this form.');}
  finally{busy=false;}
 };
 window.deleteTask=async function(){
  if(!valid()||!context.version||busy){toast('Reopen the task with authorized access');return;}
  const c=context;busy=true;
  try{
   const {data,error}=await initSupabase().from('task_templates').update({active:false}).eq('id',c.previous).eq('organization_id',c.org).eq('site_id',c.site).eq('version',c.version).eq('active',true).select('id').single();
   if(error||!data)throw error||new Error('Task changed');
   if(context!==c||!valid())return;context=null;editingTaskId=null;await loadCloudTaskTemplates();show('taskLibrary');toast('Task archived. Existing reports are preserved.');
  }catch(e){console.error(e);toast('Task could not archive. Reopen it and check your access.');}finally{busy=false;}
 };
})();
