/* Append-only evidence, stored privately under organization/record/content-hash. */
(function(){
  const bucket='record-photos',types={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
  let sequence=0,context=null,uploading=false;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const message=text=>{const el=document.getElementById('recordPhotoMessage');if(el)el.textContent=text;};
  function current(c){return context===c&&cloudUser?.id===c.user&&cloudOrganizationId===c.organization;}
  async function photoInfo(file){
    if(!types[file?.type]||!file.size||file.size>10485760)throw new Error('Choose a JPG, PNG or WebP photo, up to 10 MB.');
    const bytes=await file.arrayBuffer(),b=new Uint8Array(bytes);
    const valid=file.type==='image/jpeg'?b[0]===255&&b[1]===216&&b[2]===255:
      file.type==='image/png'?[137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v):
      [82,73,70,70].every((v,i)=>b[i]===v)&&[87,69,66,80].every((v,i)=>b[i+8]===v);
    if(!valid)throw new Error('The file contents do not match its photo type.');
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
    return hash+'.'+types[file.type];
  }
  async function list(c){
    const {data,error}=await initSupabase().storage.from(bucket).list(c.prefix,{limit:100,sortBy:{column:'created_at',order:'desc'}});
    if(error)throw error;
    if(!current(c))return;
    c.photos=(data||[]).filter(p=>/^[a-f0-9]{64}\.(jpg|png|webp)$/.test(p.name));
    document.getElementById('recordPhotoList').innerHTML=c.photos.map((p,i)=>`<div class="item"><button type="button" onclick="viewRecordPhoto(${i})">View photo ${i+1}</button><div class="small muted">Uploaded ${esc(p.created_at?new Date(p.created_at).toLocaleString():'')}</div></div>`).join('')||'<p>No uploaded photos.</p>';
    if(data?.length===100)message('Showing the 100 most recent photos.');
  }
  window.renderRecordPhotos=async function(id){
    const ticket=++sequence;context=null;
    const host=document.getElementById('recordPhotos');if(!host)return;
    host.innerHTML='<h2>Photo Evidence</h2><p>Loading photos…</p>';
    const user=cloudUser?.id,organization=cloudOrganizationId;
    try{
      const {data:r,error}=await initSupabase().from('safety_records').select('id,organization_id,created_by,record_type,status').eq('id',id).eq('organization_id',organization).single();
      if(error||!r)throw error||new Error('Report unavailable');
      if(ticket!==sequence||user!==cloudUser?.id||organization!==cloudOrganizationId)return;
      if(!['inspection','incident','near_miss'].includes(r.record_type)){host.innerHTML='';return;}
      const staff=['Administrator','Supervisor','Safety Coordinator'].includes(db.settings.role);
      const canUpload=r.status==='submitted'&&(staff||(db.settings.role==='Worker'&&r.created_by===user));
      const c=context={id,user,organization,prefix:organization+'/'+id,canUpload,photos:[]};
      host.innerHTML=`<h2>Photo Evidence</h2><p class="small muted">Private photos linked to this report. JPG, PNG or WebP, up to 10 MB. Uploaded photos cannot be replaced or removed here.</p><div id="recordPhotoList"></div><p id="recordPhotoMessage" role="status"></p><div id="recordPhotoPreview"></div>${canUpload?'<label>Add Photo<input id="recordPhotoInput" type="file" accept="image/jpeg,image/png,image/webp"></label><button id="recordPhotoUpload" class="btn" onclick="attachRecordPhoto()">Upload Photo</button>':''}`;
      await list(c);
    }catch(e){console.error(e);if(ticket===sequence)host.innerHTML='<h2>Photo Evidence</h2><p>Photos could not load. Reopen this report to retry.</p>';}
  };
  window.attachRecordPhoto=async function(){
    const c=context;if(!c||!current(c)||!c.canUpload||uploading)return;
    const input=document.getElementById('recordPhotoInput'),file=input?.files?.[0];
    if(!file){message('Choose a photo first.');return;}
    uploading=true;const button=document.getElementById('recordPhotoUpload');button.disabled=true;
    try{
      const name=await photoInfo(file);if(!current(c))return;
      message('Uploading photo…');
      const store=initSupabase().storage.from(bucket);
      const {error}=await store.upload(c.prefix+'/'+name,file,{contentType:file.type,upsert:false});
      if(error){
        // A lost response or duplicate retry may mean the same bytes already exist.
        const check=await store.list(c.prefix,{search:name,limit:1});
        if(check.error||!check.data?.some(p=>p.name===name))throw error;
      }
      if(!current(c))return;
      input.value='';message('Photo saved securely.');
      try{await list(c);}catch(e){console.error(e);message('Photo saved. Reopen the report to refresh the photo list.');}
    }catch(e){console.error(e);if(current(c))message(e.message?.startsWith('Choose a')||e.message?.startsWith('The file')?e.message:'Photo upload was not confirmed. Your report is already saved. Retry this file; after a reload, select the same file again.');}
    finally{uploading=false;if(button.isConnected)button.disabled=false;}
  };
  window.viewRecordPhoto=async function(index){
    const c=context,p=c?.photos[index];if(!p||!current(c))return;
    try{
      const {data,error}=await initSupabase().storage.from(bucket).createSignedUrl(c.prefix+'/'+p.name,60);
      if(error||!data?.signedUrl)throw error||new Error('Photo unavailable');
      if(!current(c))return;
      const img=document.createElement('img');img.alt='Photo evidence for this safety report';img.style.maxWidth='100%';img.src=data.signedUrl;
      img.onerror=()=>{if(current(c))message('Photo could not display. Tap View photo again to refresh access.');};
      document.getElementById('recordPhotoPreview').replaceChildren(img);
    }catch(e){console.error(e);if(current(c))message('Photo could not open. Check your connection and access.');}
  };
  window.SafeSitePhotos={photoInfo};
})();
