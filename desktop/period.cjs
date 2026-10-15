const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().match(/[A-Z0-9]+/g)?.join(' ')||'';
const {assessBenefit}=require('./benefit.cjs');
const requiredMonths=['2024-12','2025-01','2025-02','2025-03','2025-04','2025-05','2025-06'];
function inferScope(row){if(/Schools Division Office/i.test(row.file)){return (row.originalReferences||row.references||[]).some(ref=>/\bTEACHER\b|\bPRINCIPAL\b/i.test(ref.position||''))?'school':'unspecified';}return /Elementary|Secondary|Basilan NHS|Begang NHS/i.test(row.file)?'school':'unspecified';}
function indices(result){
 const byName=new Map(),byTin=new Map();
 for(const person of result.history?.people||[]){const name=normalize(person.name);if(!byName.has(name))byName.set(name,[]);byName.get(name).push(person);if(person.tin){const key=person.tin.slice(0,9);if(!byTin.has(key))byTin.set(key,[]);byTin.get(key).push(person);}}
 return {byName,byTin};
}
function retirementMatch(record,anchors,items){
 for(const anchor of anchors){
  if(!anchor?.includes(','))continue;const [last,given]=anchor.split(',',2);const surname=normalize(last),source=normalize(record.name);
  const recordGiven=record.name.includes(',')?normalize(record.name.split(',',2)[1]):source.endsWith(' '+surname)?source.slice(0,-surname.length).trim():'';
  if(record.name.includes(',')&&normalize(record.name.split(',')[0])!==surname)continue;
  if(!recordGiven)continue;const a=normalize(given).split(' '),b=recordGiven.split(' ');
  if(a[0]!==b[0]||!a.every((word,i)=>!b[i]||word===b[i]||(word.length===1&&b[i].startsWith(word))||(b[i].length===1&&word.startsWith(b[i]))))continue;
  if(normalize(given)===recordGiven||(record.items||[]).some(item=>items.has(normalize(item))))return true;
 }
 return false;
}
function assess(result,row,index){
 const required=result.required_months||requiredMonths,history=result.history||{},complete=new Set(history.complete_months||[]);
 const confirmed=row.review?.action==='match';const uniqueAuto=['Matched','TIN matched'].includes(row.originalStatus)&&row.originalReferences.length===1;
 const target=(confirmed||uniqueAuto)?row.references[0]:null;
 const payMatches=index.byName.get(normalize(row.name))||[];
 const ambiguous=new Set(payMatches.filter(p=>p.tin).map(p=>p.tin.slice(0,9))).size>1&&!target?.tin&&!row.tin;
 const tin=target?.tin?.slice(0,9)||(!['TIN/name conflict','TIN needs review','Multiple TIN matches'].includes(row.originalStatus)?row.tin:'')||(!ambiguous?payMatches.find(p=>p.tin)?.tin?.slice(0,9):'');
 let hits=tin?index.byTin.get(tin)||[]:payMatches;
 if(target&&!tin)hits=[...hits,...index.byName.get(normalize(target.name))||[]];
 const months=required.map(month=>{const refs=hits.filter(ref=>ref.month===month);return {month,status:refs.length?'Listed':complete.has(month)?'Not found':'Source missing / unverified',references:refs};});
 const notFound=months.filter(m=>m.status==='Not found').map(m=>m.month),missing=months.filter(m=>m.status==='Source missing / unverified').map(m=>m.month);
 const rejected=new Set(row.review?.rejected||[]);
 const retirement=target?.source==='retirement'?target:(result.retirements||[]).find(record=>!rejected.has(record.id)&&retirementMatch(record,[row.name,target?.name],new Set([...hits.map(ref=>normalize(ref.item)),normalize(target?.item)])));
 const verifiedRosterRetirement=row.roster_retired&&row.review?.service_verified===true;
 const tinConflict=['TIN/name conflict','TIN needs review','Multiple TIN matches'].includes(row.originalStatus)&&!confirmed;
 const nameConflict=(['Possible name variant','Name format review','Multiple roster entries','Needs manual match'].includes(row.originalStatus)||row.status==='Needs manual match')&&!confirmed&&!verifiedRosterRetirement;
 const identityConflict=ambiguous||tinConflict||nameConflict||(row.review?.action==='different'&&!verifiedRosterRetirement);
 const benefit=assessBenefit(row,{retirement,identityConflict,notFound,missing});
 return {...benefit,months,found:months.filter(m=>m.status==='Listed').length,not_found:notFound,source_missing:missing,retirement:retirement||null};
}
module.exports={inferScope,indices,assess,requiredMonths};
