function conciseRemarks(row){
 const c=row.eligibility||{},reason=c.reason||'';
 if(row.roster_retired||c.retirement)return c.service_verified?'Retired; service verified':'Retired - verify service';
 if(c.date_conflict)return 'Service/date conflict';
 if(c.amount_mismatch)return 'PBB amount mismatch';
 if(/Identity needs confirmation/.test(reason))return 'Confirm identity';
 if(/salary.*missing|salary.*invalid/i.test(reason))return 'Verify salary';
 if(/PBB amount is invalid/.test(reason))return 'Invalid PBB amount';
 if(c.service_months==null||c.service_factor==null)return 'Verify service months';
 if(c.result==='Not eligible')return 'Below 3 months service';
 if(!row.scope||row.scope==='unspecified')return 'Classify employee';
 if(c.service_months<9&&!c.short_service_reason)return 'Verify short-service reason';
 if(c.service_months<9&&!c.service_verified)return 'Verify HR service';
 const findings=[];
 if(c.not_found?.length) findings.push(c.not_found.length===7?'Not listed: all 7 months':'Missing: '+c.not_found.map(shortMonth).join(', '));
 if(c.source_missing?.length)findings.push('Unverified source: '+c.source_missing.map(shortMonth).join(', '));
 if(findings.length)return findings.join('; ')+(c.service_verified?'; HR verified':'');
 if(c.result==='Pending')return 'Needs review';
 if(c.service_factor>0&&c.service_factor<1)return 'Prorated '+Math.round(c.service_factor*100)+'%; service verified';
 return row.scope==='office'?'Office-based; service checked':c.service_verified?'HR service verified':(c.found||0)+'/7 months listed';
}
function shortMonth(month){const [year,m]=month.split('-');return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m)-1]+' '+year.slice(-2);}
if(typeof module==='object'&&module.exports)module.exports={conciseRemarks};else globalThis.preAuditRemarks={conciseRemarks};
