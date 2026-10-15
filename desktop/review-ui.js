let reviewingId=null,selectedPerson=null,contextRow=null,reviewBusy=false,reviewQueue=[];
const normalizeSearch=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function setupSubmissionFilters(){
 const previousMonth=$('month-filter').value;$('month-filter').innerHTML='<option value="">Any month</option>'+(data.required_months||[]).map(month=>'<option value="'+month+'">'+monthLabel(month)+'</option>').join('');$('month-filter').value=previousMonth;const previous=$('file-filter').value,group=$('group-filter').value;
 const files=data.payfiles.filter(f=>f.role==='Payfile'&&(!group||submissionGroup(f)===group));
 $('file-filter').innerHTML='<option value="">All payfiles in this group</option>'+files.map(f=>`<option value="${escape(f.file)}">${submissionGroup(f)==='IU'?'IU':'SDO'} - ${escape(f.file.split(/[\\/]/).pop())}</option>`).join('');
 if(files.some(f=>f.file===previous))$('file-filter').value=previous;setupUnitFilters();
}
function setupUnitFilters(){
 const previous=$('unit-filter').value;
 const rows=data.results.filter(row=>(!$('group-filter').value||submissionGroup(row)===$('group-filter').value)&&(!$('file-filter').value||row.file===$('file-filter').value)&&(!$('personnel-filter').value||(row.scope||'unspecified')===$('personnel-filter').value));
 const units=[...new Set(rows.map(row=>row.unit).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
 $('unit-filter').innerHTML='<option value="">All schools / offices</option>'+units.map(unit=>`<option value="${escape(unit)}">${escape(unit)}</option>`).join('');
 if(units.includes(previous))$('unit-filter').value=previous;
}
function reviewMessage(text,error=false){$('review-message').textContent=text;$('review-message').className=error?'error':'';}
function currentReview(){return data?.results.find(row=>row.id===reviewingId);}
function openReview(id,continuing=false){
 const row=data.results.find(r=>r.id===id);if(!row||reviewBusy&&!continuing)return;
 if(!continuing){
  const visible=filtered.map(entry=>entry.id);const start=visible.indexOf(id);
  const ordered=start>=0?[...visible.slice(start+1),...visible.slice(0,start)]:visible;
  reviewQueue=ordered.filter(key=>{const entry=data.results.find(r=>r.id===key);return entry&&isReview(entry)&&entry.review?.action!=='match';});
 }
 reviewingId=id;selectedPerson=null;
 $('review-name').textContent=row.name;$('review-unit').textContent=row.unit;
 $('review-source').textContent=`${row.file}\n${row.sheet}!${row.cell}`;
 $('review-current').textContent=`Current status: ${row.status}\nDeclared FY 2024 service: ${row.service_label||'not available'} (${row.service_cell||'source cell unavailable'})${row.tin?'\nPayfile reference TIN ending '+row.tin.slice(-4):''}`;
 $('review-note').value=row.review?.note||'';$('verify-service').checked=row.review?.service_verified===true;$('short-reason').value=row.review?.short_service_reason||((row.eligibility?.retirement||row.roster_retired)?'Retirement':'');$('person-scope').value=row.scope||'unspecified';$('candidate-scope').value=row.references.some(ref=>ref.source)?'all':'current';$('roster-search').value='';$('confirm-match').disabled=true;
 $('undo-review').hidden=!row.review;$('confirm-separated').hidden=['Matched','TIN matched','Multiple roster entries','Multiple TIN matches'].includes(row.originalStatus)||!!data.roster_problems?.length;
 reviewMessage('Choose a PSIPOP person, then confirm only if they are the same person.');renderCandidates();
 if(!$('review-dialog').open)$('review-dialog').showModal();
 document.querySelector('#review-dialog .review-grid').scrollTop=0;$('candidates').scrollTop=0;$('roster-search').focus();
}
function renderCandidates(){
 const row=currentReview();if(!row)return;
 const q=normalizeSearch($('roster-search').value).trim();let people;const scope=$('candidate-scope').value;const sourcePeople=data.roster.filter(ref=>scope==='all'||(scope==='history'?ref.source==='history':scope==='retirement'?ref.source==='retirement':!ref.source));
 if(q){const words=q.split(/\s+/);people=sourcePeople.filter(ref=>{const text=normalizeSearch([ref.name,ref.file,ref.item,ref.position,ref.tin].join(' '));return words.every(word=>text.includes(word));});}
 else people=row.references.filter(ref=>sourcePeople.some(person=>person.id===ref.id));
 const rejected=row.review?.rejected||[];
 $('candidate-summary').textContent=q?`${people.length} results in the selected source${people.length>60?' - showing first 60; refine your search':''}`:people.length?`${people.length} suggested or confirmed matches. Search above to find someone else.`:'No remaining suggestions. Search the full PSIPOP above.';
 $('candidates').innerHTML=people.slice(0,60).map(ref=>`<article class="candidate ${selectedPerson===ref.id?'selected':''} ${rejected.includes(ref.id)?'rejected':''}"><label class="candidate-select"><input type="radio" name="person" value="${ref.id}" ${selectedPerson===ref.id?'checked':''}><div><strong>${escape(ref.name)}</strong><small>${escape(ref.position)}<br>${escape(ref.file)}${ref.page?' - page '+ref.page:' / '+escape(ref.sheet||'')+'!'+escape(ref.cell||'')}<br>${escape(ref.item)}${ref.tin?'<br>TIN ending '+escape(ref.tin.slice(0,9).slice(-4)):''}</small>${rejected.includes(ref.id)?'<span class="repeat">Previously marked as different people</span>':''}</div></label><div class="candidate-actions"><button class="quiet" data-open-roster="${ref.id}">${ref.source==='retirement'?'Open retirement order':'Open PDF - page '+ref.page}</button><button class="different" data-different="${ref.id}" ${rejected.includes(ref.id)?'disabled':''}>Different people</button></div></article>`).join('')||'<div class="candidate-empty">Search by surname, given name, or item number. You can leave this entry unresolved.</div>';
 $('confirm-match').disabled=!selectedPerson||reviewBusy;
}
function replaceRow(row){const index=data.results.findIndex(r=>r.id===row.id);if(index>=0)data.results[index]=row;render(false);}
async function saveReview(action,target){
 if(reviewBusy)return;const row=currentReview();if(!row)return;
 const nextIds=[...reviewQueue];
 reviewBusy=true;$('save-service').disabled=true;$('confirm-match').disabled=true;$('confirm-separated').disabled=true;$('undo-review').disabled=true;reviewMessage('Saving review…');
 try{
  const updated=await window.preAudit.saveReview({rowId:row.id,action,target,note:$('review-note').value,scope:$('person-scope').value,service_verified:$('verify-service').checked,short_service_reason:$('short-reason').value});replaceRow(updated);
  if(action==='different'){
   selectedPerson=null;$('review-current').textContent=`Current status: ${updated.status}`;$('undo-review').hidden=false;renderCandidates();reviewMessage(updated.roster_retired?'No matching person remains. Classified as retired per your roster rule; verify HR service for PBB proration.':'Marked as different people. This entry is still open for review.');
  }else if(action==='service'){
   openReview(updated.id,true);reviewMessage('Service review saved. '+updated.eligibility.reason);
  }else if(action==='undo'){
   openReview(updated.id,true);reviewMessage('Saved decision removed. The automatic comparison is restored.');
  }else{
   status(action==='match'?`${updated.status}: ${updated.name}`:`Confirmed absent / separated: ${updated.name}`);
   const next=nextIds.find(id=>data.results.some(r=>r.id===id&&isReview(r)));
   if($('next-review').checked&&next){reviewQueue=reviewQueue.filter(id=>id!==next);openReview(next,true);reviewMessage('Previous decision saved. Review this next employee and choose the matching person.');}
   else{$('review-dialog').close();if($('next-review').checked)status('Saved. No more unresolved entries in this review list.');}
  }
 }catch(error){reviewMessage(error.message,true);}finally{reviewBusy=false;$('save-service').disabled=false;$('confirm-separated').disabled=false;$('undo-review').disabled=false;$('confirm-match').disabled=!selectedPerson;}
}
$('rows').addEventListener('click',event=>{const button=event.target.closest('[data-review]');if(button)openReview(button.dataset.review);});
$('rows').addEventListener('dblclick',event=>{const row=event.target.closest('[data-row-id]');if(row)openReview(row.dataset.rowId);});
$('rows').addEventListener('contextmenu',event=>{
 const row=event.target.closest('[data-row-id]');if(!row)return;event.preventDefault();contextRow=row.dataset.rowId;
 const menu=$('row-menu');$('context-undo').hidden=!data.results.find(r=>r.id===contextRow)?.review;menu.hidden=false;
 menu.style.left=Math.min(event.clientX,innerWidth-235)+'px';menu.style.top=Math.min(event.clientY,innerHeight-145)+'px';$('show-matches').focus();
});
document.addEventListener('click',event=>{if(!event.target.closest('#row-menu'))$('row-menu').hidden=true;});
document.addEventListener('keydown',event=>{if(event.key==='Escape')$('row-menu').hidden=true;});
document.addEventListener('scroll',()=>$('row-menu').hidden=true,true);
$('show-matches').onclick=()=>{$('row-menu').hidden=true;openReview(contextRow);};
$('context-open-pay').onclick=async()=>{$('row-menu').hidden=true;try{await window.preAudit.openSource({kind:'payfile',id:contextRow});}catch(error){status(error.message,true);}};
$('context-undo').onclick=()=>{$('row-menu').hidden=true;openReview(contextRow);saveReview('undo');};
$('rows').addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.matches('[data-row-id]'))openReview(event.target.dataset.rowId);});
$('candidates').addEventListener('change',event=>{if(event.target.name==='person'){selectedPerson=event.target.value;renderCandidates();}});
$('candidates').addEventListener('click',async event=>{
 const different=event.target.closest('[data-different]');if(different){await saveReview('different',different.dataset.different);return;}
 const open=event.target.closest('[data-open-roster]');if(open)try{await window.preAudit.openSource({kind:'roster',id:open.dataset.openRoster});}catch(error){reviewMessage(error.message,true);}
});
$('candidate-scope').onchange=()=>{selectedPerson=null;renderCandidates();};$('roster-search').oninput=()=>{selectedPerson=null;renderCandidates();};
$('close-review').onclick=()=>{if(!reviewBusy)$('review-dialog').close();};
$('review-dialog').addEventListener('cancel',event=>{if(reviewBusy)event.preventDefault();});
$('save-service').onclick=()=>saveReview('service');
$('confirm-match').onclick=()=>selectedPerson&&saveReview('match',selectedPerson);
$('confirm-separated').onclick=()=>saveReview('separated');$('undo-review').onclick=()=>saveReview('undo');
$('open-pay').onclick=async()=>{try{await window.preAudit.openSource({kind:'payfile',id:reviewingId});}catch(error){reviewMessage(error.message,true);}};

$('browse-tin').onclick=async()=>{try{const file=await window.preAudit.chooseTinFile();if(file){$('tin-file').value=file;invalidateResults();}}catch(error){status(error.message,true);}};
$('clear-tin').onclick=()=>{$('tin-file').value='';invalidateResults();};

$('browse-history').onclick=()=>browse('history');
function monthLabel(value){const [year,month]=value.split('-');return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(month)-1]+' '+year;}
function periodRemarks(row){
 const check=row.eligibility;if(!check)return 'Period check not loaded.';
 const rosterRuleText=row.roster_retired?'Retired per your roster rule: all suggested current-roster matches were rejected; date and actual service need HR verification. ':'';
 const retirementText=rosterRuleText+(check.retirement?`Retirement record: ${check.retirement.date}; ${check.retirement.file} / ${check.retirement.sheet}!${check.retirement.cell}. `:'');
 if(row.scope==='office')return retirementText+'Office-based: school-based monthly snapshot coverage is not required.';
 if(row.scope!=='school')return retirementText+'Classify as school-based or office-based.';
 const remarks=[];if(check.not_found.length)remarks.push('Not found: '+check.not_found.map(monthLabel).join(', ')+'.');
 if(check.source_missing.length)remarks.push('Source missing / unverified: '+check.source_missing.map(monthLabel).join(', ')+'.');
 if(!remarks.length)remarks.push('All seven monthly snapshots are listed.');return retirementText+remarks.join(' ');
}
function showHistoryCoverage(){
 const history=data.history;if(!history){$('history-status').textContent='No historical PSIPOP data loaded.';return;}
 $('history-status').textContent=`${history.available_months.length}/7 months loaded from ${history.files.length} PDFs. ${history.missing_months.length?'Missing source months: '+history.missing_months.map(monthLabel).join(', ')+'.':'All required source months are present.'} ${history.problems.length?'Extraction notes: '+history.problems.length+'.':''}`;
 const checked=history.files.reduce((total,file)=>total+file.pages,0);$('history-coverage').innerHTML=`<summary>Historical extraction coverage - ${checked} pages</summary><div>${(data.required_months||[]).map(month=>`<p><strong>${monthLabel(month)}</strong>: ${history.files.filter(f=>f.month===month).length} PDFs - ${history.complete_months.includes(month)?'available page subtotals agree':'missing or unverified source records'}</p>`).join('')}${history.problems.map(text=>`<p>${escape(text)}</p>`).join('')}</div>`;
}
let reasonRowId=null;
function openReason(id){
 const row=data.results.find(r=>r.id===id);if(!row?.eligibility)return;reasonRowId=id;
 const check=row.eligibility;$('reason-title').textContent=check.result+' - PBB service pre-check';$('reason-name').textContent=row.name;$('reason-detail').textContent=check.reason+' '+periodRemarks(row)+(check.service_factor!==null?' Service factor: '+Math.round(check.service_factor*100)+'%.':'')+(check.indicative_pbb!==null?' Indicative PBB using the payfile salary and 48.75% agency rate: PHP '+check.indicative_pbb.toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})+'.':'');
 const money=value=>typeof value==='number'&&Number.isFinite(value)?'PHP '+value.toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2}):'Not available';
 $('reason-calculation').innerHTML=check.grant_type==='Pro-rated'?`<h3>Proration details</h3><dl><dt>Declared qualifying service</dt><dd>${escape(check.service_months)} months</dd><dt>Reason for short service</dt><dd>${escape(check.short_service_reason||'Needs HR confirmation')}</dd><dt>Service verified by HR</dt><dd>${check.service_verified?'Yes':'No - pending verification'}</dd><dt>Monthly salary from payfile</dt><dd>${money(row.salary)}</dd><dt>Agency PBB rate</dt><dd>${Math.round(check.agency_rate*10000)/100}%</dd><dt>Proration factor</dt><dd>${Math.round(check.service_factor*100)}%</dd><dt>Indicative PBB</dt><dd>${money(row.salary)} ? ${Math.round(check.agency_rate*10000)/100}% ? ${Math.round(check.service_factor*100)}% = <strong>${money(check.indicative_pbb)}</strong></dd><dt>PBB amount in payfile</dt><dd>${money(row.payfile_pbb)}${check.amount_mismatch?' - differs from calculation; review required':''}</dd></dl><p class="note">Indicative calculation only. Confirm qualifying service, salary basis, and the remaining eligibility requirements before payment.</p>`:'';
 $('reason-months').innerHTML=check.months.map(month=>`<div class="month-reason"><strong>${monthLabel(month.month)}</strong><span class="${month.status==='Listed'?'listed':month.status==='Not found'?'not-listed':'source-missing'}">${escape(month.status)}</span>${month.references[0]?`<button class="quiet" data-month-source="${month.references[0].id}">View PDF - page ${month.references[0].page}</button>`:'<small>No supporting personnel entry verified.</small>'}</div>`).join('');
 $('reason-dialog').showModal();
}
$('rows').addEventListener('click',event=>{const button=event.target.closest('[data-reason]');if(button)openReason(button.dataset.reason);});
$('close-reason').onclick=()=>$('reason-dialog').close();$('reason-review').onclick=()=>{$('reason-dialog').close();openReview(reasonRowId);};
$('reason-months').onclick=async event=>{const button=event.target.closest('[data-month-source]');if(!button)return;try{await window.preAudit.openSource({kind:'roster',id:button.dataset.monthSource});}catch(error){$('reason-detail').textContent=error.message;}};

function matchesMonthFilter(row){const month=$('month-filter').value,state=$('month-state').value;if(!month&&!state)return true;const entries=row.eligibility?.months||[];return entries.some(entry=>(!month||entry.month===month)&&(!state||entry.status===state));}
