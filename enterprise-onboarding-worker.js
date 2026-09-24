importScripts('vendor/xlsx-0.20.3.min.js','enterprise-onboarding-core.js');
self.onmessage=async({data:file})=>{
 try{
  if(file.size>20*1024*1024)throw Error('Workbook exceeds 20 MB. Split it into smaller batches.');
  const workbook=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false,cellFormula:true});
  self.postMessage({result:SafeSiteOnboardingCore.parseWorkbook(workbook,XLSX)});
 }catch(e){self.postMessage({error:e.message||'Workbook could not be read.'});}
};
