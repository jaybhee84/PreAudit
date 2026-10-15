const {requiredMonths}=require('./period.cjs');
const monthLabel=month=>{const [year,m]=month.split('-');return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m)-1]+' '+year;};
function resultCsv(rows,months=requiredMonths){
 const cell=value=>{let text=String(value??'');if(/^[\s]*[=+\-@]|^[\t\r\n]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
 const headers=['Result (PBB service pre-check)','Identity status','Audit method','Payfile employee','Selected PSIPOP names','Classification','Submission group','Delivery unit','Payfile','Sheet','Cell','Repeated payfile name','Remarks','Declared service months','Service factor','Grant type','Indicative PBB (payfile salary basis)','HR service verified','Months listed',...months.map(monthLabel),'Not found months','Missing / unverified source months','PSIPOP references','Review note','Review saved at'];
 const body=rows.map(row=>{
  const check=row.eligibility||{};const remarks=[row.roster_retired?row.detail:'',check.reason||row.detail||'',check.not_found?.length?'Not found: '+check.not_found.map(monthLabel).join(', ')+'.':'',check.source_missing?.length?'Source missing / unverified: '+check.source_missing.map(monthLabel).join(', ')+'.':''].filter(Boolean).join(' ');
  return [check.result||'Pending',row.status,row.audit_method||'',row.name,(row.references||[]).map(ref=>ref.name).join('; '),row.scope,/SDO PBB/i.test(row.file)?'SDO':'IU',row.unit,row.file,row.sheet,row.cell,row.duplicate?'Yes':'No',remarks,check.service_months??'',check.service_factor??'',check.grant_type||'',check.indicative_pbb??'',check.service_verified?'Yes':'No',check.found??'',...months.map(month=>check.months?.find(m=>m.month===month)?.status||'Not checked'),(check.not_found||[]).map(monthLabel).join('; '),(check.source_missing||[]).map(monthLabel).join('; '),(row.references||[]).map(ref=>`${ref.file}${ref.page?', page '+ref.page:' / '+(ref.sheet||'')+'!'+(ref.cell||'')}, ${ref.item}`).join('; '),row.review?.note||'',row.review?.savedAt||''];
 });
 return '\ufeff'+[headers,...body].map(row=>row.map(cell).join(',')).join('\r\n');
}
module.exports={resultCsv};
