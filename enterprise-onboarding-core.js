/* Shared workbook and secure-upload logic; usable in the browser and node tests. */
(function(root){
 'use strict';
 const sheets={
  Workers:{key:'workers',limit:2000,required:['employee_number','first_name','last_name','job_title','site_name'],fields:['employee_number','first_name','last_name','job_title','site_name','email','status','notes']},
  Qualifications:{key:'qualifications',limit:20000,required:['employee_number','qualification_name'],fields:['employee_number','qualification_name','code','category','issued_on','expires_on','document_file_name','notes']},
  'Site Requirements':{key:'requirements',limit:5000,required:['site_name','job_title','qualification_name'],fields:['site_name','job_title','qualification_name','aliases','warning_days','country_code','jurisdiction_code','regulator','mining_sector','mine_type','requirement_source','active']},
  'Document Index':{key:'documents',limit:20000,required:['employee_number','file_name'],fields:['employee_number','qualification_name','file_name','document_type','issue_date','expiry_date','notes']}
 };
 const normalize=v=>String(v??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
 function withTimeout(request,ms=90000){let timer;return Promise.race([request,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Response timed out. Refresh the batch to check its result before retrying.')),ms);})]).finally(()=>clearTimeout(timer));}
 const aliases={employee_id:'employee_number',employee_no:'employee_number',site_project:'site_name',site:'site_name',project:'site_name',qualification:'qualification_name',training_name:'qualification_name',certificate_file_name:'document_file_name',document_filename:'document_file_name',filename:'file_name',warning_days_before_expiry:'warning_days',province_state:'jurisdiction_code',email_address:'email'};
 function parseWorkbook(workbook,XLSX){
  const payload={},sourceRows={};
  for(const [name,spec] of Object.entries(sheets)){
   const matches=workbook.SheetNames.filter(n=>normalize(n)===normalize(name));
   if(matches.length!==1)throw Error('Workbook must contain exactly one '+name+' sheet.');
   const ws=workbook.Sheets[matches[0]],range=XLSX.utils.decode_range(ws['!ref']||'A1');
   if(range.s.r!==0||range.s.c!==0)throw Error(name+' column headings must start in cell A1.');
   if(range.e.r>spec.limit+1000||range.e.c>100)throw Error(name+' sheet is too large. Remove unused formatted rows/columns or split the batch.');
   const rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,defval:'',blankrows:true});
   const header=rows[0]||[],keys=header.map(v=>aliases[normalize(v)]||normalize(v));
   if(keys.filter(Boolean).some((k,i,a)=>a.indexOf(k)!==i))throw Error(name+' has duplicate column headings.');
   for(const key of spec.required)if(!keys.includes(key))throw Error(name+' is missing column '+key+'.');
   const unknown=keys.filter(k=>k&&!spec.fields.includes(k));
   if(unknown.length)throw Error(name+' has unrecognized columns: '+unknown.join(', ')+'. Use the downloadable template.');
   payload[spec.key]=[];sourceRows[spec.key]=[];
   rows.slice(1).forEach((row,index)=>{
    if(!row.some(v=>String(v).trim()))return;
    if(row.slice(keys.length).some(v=>String(v).trim()))throw Error(name+' has data under an empty heading.');
    const item={};
    keys.forEach((key,col)=>{
     if(!key){if(String(row[col]??'').trim())throw Error(name+' has data under an empty heading.');return;}
     const cell=ws[XLSX.utils.encode_cell({r:index+1,c:col})];
     if(cell?.f||cell?.t==='e')throw Error(name+' row '+(index+2)+': replace formulas/errors with values.');
     let value=String(row[col]??'').trim();
     if(['issued_on','expires_on','issue_date','expiry_date'].includes(key)&&value){
      if(cell?.t==='n'){
       const d=XLSX.SSF.parse_date_code(cell.v,{date1904:!!workbook.Workbook?.WBProps?.date1904});
       if(!d||d.y<1900||(d.y===1900&&d.m===2&&d.d===29))throw Error(name+' row '+(index+2)+': invalid Excel date.');
       value=[d.y,String(d.m).padStart(2,'0'),String(d.d).padStart(2,'0')].join('-');
      }
      if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw Error(name+' row '+(index+2)+': dates must be YYYY-MM-DD or Excel date cells.');
     }
     if(value)item[key]=value;
    });
    payload[spec.key].push(item);sourceRows[spec.key].push(index+2);
   });
   if(payload[spec.key].length>spec.limit)throw Error(name+' exceeds '+spec.limit+' rows. Split the batch.');
  }
  if(!payload.workers.length)throw Error('Workers sheet must contain at least one worker.');
  return {payload,sourceRows};
 }
 function template(XLSX){const wb=XLSX.utils.book_new();for(const [name,spec] of Object.entries(sheets))XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([spec.fields]),name);return wb;}
 function matchFiles(targets,files){
  const map=new Map();for(const file of files){const key=file.name;map.set(key,[...(map.get(key)||[]),file]);}
  const indexed=new Set(targets.map(t=>t.file_name));
  const duplicates=[...map].filter(([,v])=>v.length>1).map(([k])=>k);
  if(duplicates.length)throw Error('Duplicate filenames selected: '+duplicates.join(', ')+'. Rename files and correct the workbook; matching must be unambiguous.');
  const counts=new Map();for(const t of targets)counts.set(t.file_name,(counts.get(t.file_name)||0)+1);
  if([...counts.values()].some(n=>n>1))throw Error('Document Index uses a filename more than once. Give every document a unique filename.');
  return {map:new Map([...map].map(([k,v])=>[k,v[0]])),unmatched:[...map.keys()].filter(k=>!indexed.has(k))};
 }
 async function documentInfo(file,cryptoAPI){
  if(!file.size||file.size>10485760)throw Error('Document must be between 1 byte and 10 MB.');
  const bytes=new Uint8Array(await file.arrayBuffer()),ascii=(a,b)=>String.fromCharCode(...bytes.slice(a,b));
  let mime,ext;
  if(ascii(0,5)==='%PDF-'){mime='application/pdf';ext='pdf';}
  else if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255){mime='image/jpeg';ext='jpg';}
  else if([137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n)){mime='image/png';ext='png';}
  else if(ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP'){mime='image/webp';ext='webp';}
  else throw Error('Unsupported document contents. Use PDF, JPEG, PNG or WebP.');
  if(file.type&&file.type!==mime&&file.type!=='application/octet-stream')throw Error('Document type does not match its contents.');
  const hash=[...new Uint8Array(await cryptoAPI.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  return {mime,hash,ext};
 }
 async function uploadDocument(client,org,batch,target,file,cryptoAPI,assertContext=()=>{}){
  if(target.uploaded_document_id)return target.uploaded_document_id;
  const info=await documentInfo(file,cryptoAPI);assertContext();
  const path=org+'/'+target.worker_id+'/'+batch+'/'+target.row_number+'-'+info.hash+'.'+info.ext;
  const bucket=client.storage.from('worker-documents');
  const {error}=await withTimeout(bucket.upload(path,file,{upsert:false,contentType:info.mime}));assertContext();
  if(error){
   // A lost upload response can leave the immutable object in storage. Verify its bytes before registering it.
   const {data:existing,error:readError}=await withTimeout(bucket.download(path));assertContext();
   if(readError||!existing)throw error;
   const prior=await documentInfo(existing,cryptoAPI);assertContext();
   if(prior.hash!==info.hash)throw Error('Stored document differs. Upload was not registered.');
  }
  const {data,error:registrationError}=await withTimeout(client.rpc('register_enterprise_onboarding_document',{p_batch_id:batch,p_row_number:target.row_number,p_storage_path:path,p_mime_type:info.mime}));assertContext();
  if(registrationError||!data)throw registrationError||Error('Document registration was not confirmed. Retry this file.');
  return data;
 }
 const api={sheets,parseWorkbook,template,matchFiles,documentInfo,uploadDocument,withTimeout};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SafeSiteOnboardingCore=api;
})(globalThis);
