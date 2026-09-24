const {test}=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const XLSX=require('../vendor/xlsx-0.20.3.min.js');
const core=require('../enterprise-onboarding-core.js');
test('stalled requests release controls with an explicit uncertain-outcome timeout',async()=>{
 await assert.rejects(core.withTimeout(new Promise(()=>{}),5),/Refresh the batch/);
 assert.equal(await core.withTimeout(Promise.resolve('ok'),100),'ok');
});
function workbook(n=1){
 const wb=core.template(XLSX);
 const spec=core.sheets.Workers;
 wb.Sheets.Workers=XLSX.utils.aoa_to_sheet([spec.fields,...Array.from({length:n},(_,i)=>[String(i).padStart(5,'0'),'First','Last','Miner','North','worker'+i+'@example.test','active'])]);
 return wb;
}
test('500-worker XLSX round trip preserves stable identity and all four sheets',()=>{
 const bytes=XLSX.write(workbook(500),{type:'buffer',bookType:'xlsx'});
 const result=core.parseWorkbook(XLSX.read(bytes,{type:'buffer'}),XLSX);
 assert.equal(result.payload.workers.length,500);assert.equal(result.payload.workers[0].employee_number,'00000');
 assert.equal(result.payload.workers[499].email,'worker499@example.test');assert.equal(result.sourceRows.workers[499],501);
 assert.deepEqual(result.payload.documents,[]);
});
test('missing sheets, duplicate headers, unknown headings, formulas and oversized batches fail closed',()=>{
 let wb=workbook();wb.SheetNames.pop();assert.throws(()=>core.parseWorkbook(wb,XLSX),/Document Index/);
 wb=workbook();wb.Sheets.Workers.B1.v='Employee Number';assert.throws(()=>core.parseWorkbook(wb,XLSX),/duplicate/);
 wb=workbook();wb.Sheets.Workers.H1.v='Secret Unexpected Field';assert.throws(()=>core.parseWorkbook(wb,XLSX),/unrecognized/);
 wb=workbook();wb.Sheets.Workers.A2.f='1+1';assert.throws(()=>core.parseWorkbook(wb,XLSX),/formulas/);
 assert.throws(()=>core.parseWorkbook(workbook(2001),XLSX),/2000/);
});
test('blank rows retain worksheet issue mapping and formatted numeric employee IDs retain zeros',()=>{
 const wb=workbook();XLSX.utils.sheet_add_aoa(wb.Sheets.Workers,[[],['00002','Second','Last','Miner','North']],{origin:'A3'});
 wb.Sheets.Workers.A2={t:'n',v:42,z:'00000'};
 const r=core.parseWorkbook(wb,XLSX);assert.equal(r.payload.workers[0].employee_number,'00042');assert.deepEqual(r.sourceRows.workers,[2,4]);
});
test('Excel dates normalize and ambiguous/invalid dates are rejected',()=>{
 const wb=workbook();wb.Sheets.Qualifications=XLSX.utils.aoa_to_sheet([['Employee Number','Qualification','Issued On','Expires On'],['00000','First Aid',45000,'2027-01-01']]);
 assert.match(core.parseWorkbook(wb,XLSX).payload.qualifications[0].issued_on,/^2023-/);
 wb.Sheets.Qualifications.D2={t:'s',v:'2026-02-30'};assert.throws(()=>core.parseWorkbook(wb,XLSX),/dates/);
 wb.Sheets.Qualifications.D2={t:'s',v:'01/02/2026'};assert.throws(()=>core.parseWorkbook(wb,XLSX),/dates/);
});
test('document matching is exact and duplicate filenames cannot cross-link employees',()=>{
 const target={file_name:'A.pdf'};
 assert.deepEqual(core.matchFiles([target],[{name:'a.pdf'}]).unmatched,['a.pdf']);
 assert.throws(()=>core.matchFiles([target],[{name:'A.pdf'},{name:'A.pdf'}]),/Duplicate/);
 assert.throws(()=>core.matchFiles([target,target],[]),/more than once/);
});
test('secure uploads never overwrite; lost upload and registration responses are retryable',async()=>{
 const file=new Blob(['%PDF-1.7\nfixture'],{type:'application/pdf'}),target={row_number:1,worker_id:'worker'},objects=new Map();let fail=true,registered=0;
 const client={storage:{from(name){assert.equal(name,'worker-documents');return {
  async upload(path,bytes,options){assert.equal(options.upsert,false);if(objects.has(path))return {error:Error('Exists')};objects.set(path,bytes);return {error:Error('Lost response')};},
  async download(path){return {data:objects.get(path)};}
 };}},async rpc(name,args){assert.equal(name,'register_enterprise_onboarding_document');assert.match(args.p_storage_path,/^org\/worker\/batch\/1-[a-f0-9]{64}\.pdf$/);if(fail){fail=false;return {error:Error('Lost registration response')};}registered++;return {data:'document'};}};
 await assert.rejects(core.uploadDocument(client,'org','batch',target,file,webcrypto),/Lost registration/);
 assert.equal(await core.uploadDocument(client,'org','batch',target,file,webcrypto),'document');assert.equal(objects.size,1);assert.equal(registered,1);
});
test('oversize, spoofed and unsupported certificates are rejected before storage writes',async()=>{
 await assert.rejects(core.documentInfo({size:10485761},webcrypto),/10 MB/);
 await assert.rejects(core.documentInfo(new Blob(['<svg/>'],{type:'image/svg+xml'}),webcrypto),/Unsupported/);
 await assert.rejects(core.documentInfo(new Blob(['%PDF-1.7'],{type:'image/png'}),webcrypto),/does not match/);
});
test('account change while hashing prevents upload',async()=>{
 let uploaded=false;const client={storage:{from(){uploaded=true;}}};
 await assert.rejects(core.uploadDocument(client,'org','batch',{worker_id:'w',row_number:1},new Blob(['%PDF-1.7'],{type:'application/pdf'}),webcrypto,()=>{throw Error('Account changed');}),/Account changed/);assert.equal(uploaded,false);
});
