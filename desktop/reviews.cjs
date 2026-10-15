const crypto=require('node:crypto');
const period=require('./period.cjs');
const {validReasons}=require('./benefit.cjs');
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sourceId=ref=>hash([ref.file,ref.page,ref.item,ref.name,ref.tin||'']);
const serviceSignature=row=>hash([row.service_label,row.service_months,row.service_cell,row.salary,row.payfile_pbb]);
function prepare(result){
 const scope=[result.pay_folder.toLowerCase(),result.roster_folder.toLowerCase()];
 result.roster=result.roster.map(ref=>({...ref,id:sourceId(ref)}));
 if(result.history){result.history.people=result.history.people.map(ref=>({...ref,id:sourceId(ref)}));result.roster.push(...result.history.people);}
 result.retirements=(result.retirements||[]).map(record=>({...record,id:hash(['retirement',record.file,record.sheet,record.cell,record.name,record.date]),source:'retirement',item:record.items?.[0]||'',position:'Retirement record - '+record.date,page:null}));
 result.roster.push(...result.retirements);
 result.results=result.results.map(row=>({...row,id:hash([...scope,row.file,row.sheet,row.cell,row.name,row.tin||'']),originalStatus:row.status,originalReferences:row.references,originalDetail:row.detail,references:row.references.map(ref=>({...ref,id:sourceId(ref)}))}));
 return result;
}
function markPreaudited(row){
 if(['Matched','TIN matched','Confirmed match'].includes(row.status)){
  row.audit_method=row.status==='Confirmed match'?'Manually confirmed':'Automatic match';
  row.status='Pre-audited';row.detail=row.audit_method+'; identity pre-audited. See the separate PBB service result.';
 }
}
function applyReviews(result,decisions){
 const roster=new Map(result.roster.map(ref=>[ref.id,ref]));
 const periodIndex=period.indices(result);
 for(const row of result.results){
  row.scope=decisions[row.id]?.scope||period.inferScope(row);
  row.status=row.originalStatus;row.references=row.originalReferences.map(ref=>({...ref,id:sourceId(ref)}));row.detail=row.originalDetail;delete row.review;delete row.roster_retired;delete row.audit_method;
  const saved=decisions[row.id];if(!saved){row.eligibility=period.assess(result,row,periodIndex);markPreaudited(row);continue;}
  const effectiveSaved={...saved,service_verified:saved.service_verified===true&&saved.service_snapshot===serviceSignature(row),service_verification_stale:saved.service_verified===true&&saved.service_snapshot!==serviceSignature(row)};
  const rejected=saved.rejected||[];row.references=row.references.filter(ref=>!rejected.includes(ref.id));row.review=effectiveSaved;
  if(saved.action==='match'&&!roster.has(saved.target)){delete row.review;row.status='Needs manual match';row.detail='The previously confirmed PSIPOP entry changed or is unavailable. Verify identity again.';}
  if(saved.action==='different'){
   row.status=row.references.length?'Possible name variant':'Needs manual match';
   row.detail='Rejected suggestions are different people. Select another PSIPOP person or keep reviewing.';
   if(!row.references.length&&!(result.roster_problems||[]).length&&!['Matched','TIN matched','Multiple roster entries','Multiple TIN matches'].includes(row.originalStatus)){
    row.status='Retired - per roster rule';row.roster_retired=true;
    row.detail='No matching current PSIPOP person remains after review. Classified as retired under your roster rule; retirement date and qualifying service still require HR verification.';
   }
  }
  if(saved.action==='match'&&roster.has(saved.target)){
   row.status='Confirmed match';row.references=[roster.get(saved.target)];row.review=effectiveSaved;row.detail='Manually confirmed as the same person.';
  }else if(saved.action==='separated'&&!(result.roster_problems||[]).length){
   // A changed roster may now contain a direct match; ask for review again.
   if(!['Matched','TIN matched','Multiple roster entries','Multiple TIN matches'].includes(row.originalStatus)&&saved.rosterSignature===hash(result.roster.filter(ref=>!ref.source).map(ref=>ref.id).sort())){row.status='Confirmed separated';row.references=[];row.review=effectiveSaved;row.detail='Reviewed and confirmed absent / separated from the current PSIPOP.';}
  }
  row.eligibility=period.assess(result,row,periodIndex);
  markPreaudited(row);
 }
 return result;
}
function decision(result,payload,previous={}){
 const row=result.results.find(r=>r.id===payload.rowId);if(!row)throw Error('This payfile entry is no longer available. Compare the files again.');
 if(payload.action==='undo')return {key:row.id,value:null};
 if(!['match','separated','different','service'].includes(payload.action))throw Error('Choose a match, different people, or confirm separation.');
 if(['match','different'].includes(payload.action)&&!result.roster.some(ref=>ref.id===payload.target))throw Error('Select a person from the current PSIPOP.');
 if(payload.action==='match'&&row.tin){const target=result.roster.find(ref=>ref.id===payload.target);if(target.tin&&target.tin.slice(0,9)!==row.tin.slice(0,9)&&!String(payload.note||'').trim())throw Error('The TINs differ. Verify the source and add a review note before overriding this conflict.');}
 if(payload.action==='separated'&&(result.roster_problems||[]).length)throw Error('Resolve PSIPOP extraction issues before confirming separation.');
 if(payload.action==='separated'&&['Matched','TIN matched','Multiple roster entries','Multiple TIN matches'].includes(row.originalStatus))throw Error('This person appears in the current PSIPOP. Review its roster entries instead.');
 let rejected=previous.rejected||[];
 if(payload.action==='different')rejected=[...new Set([...rejected,payload.target])];
 if(payload.action==='match')rejected=rejected.filter(id=>id!==payload.target);
 const scope=payload.scope||previous.scope||row.scope||period.inferScope(row);
 if(payload.action==='match'&&!['school','office'].includes(scope))throw Error('Classify this employee as school-based or office-based first.');
 if(!['school','office'].includes(scope)&&payload.action==='service')throw Error('Classify this employee as school-based or office-based first.');
 const verified=payload.service_verified===true;
 if(verified&&!String(payload.note||'').trim())throw Error('Add the HR service record checked in the review note before marking service verified.');
 const shortReason=payload.short_service_reason||'';if(shortReason&&!validReasons.includes(shortReason))throw Error('Choose a recognized short-service reason.');
 return {key:row.id,value:{action:payload.action==='service'?(previous.action||'service'):payload.action,target:payload.action==='service'?(previous.target||null):payload.action==='match'?payload.target:null,scope,rejected,service_verified:verified,service_snapshot:serviceSignature(row),short_service_reason:shortReason,note:String(payload.note||'').trim().slice(0,2000),savedAt:new Date().toISOString(),rosterSignature:hash(result.roster.filter(ref=>!ref.source).map(ref=>ref.id).sort())}};
}
module.exports={prepare,applyReviews,decision,sourceId};
