const validReasons=['Retirement','Newly hired','Resignation','Rehabilitation leave','Maternity / paternity leave','Special leave for women','Special emergency leave','Vacation / sick leave','Scholarship / study leave','Sabbatical leave','Other non-disciplinary interruption'];
function factorForMonths(months){if(typeof months!=='number'||!Number.isFinite(months)||months<0||months>12)return null;if(months<3)return 0;if(months>=9)return 1;return (Math.floor(months)+1)/10;}
function assessBenefit(row,{retirement,identityConflict,notFound,missing}){
 const months=row.service_months,factor=factorForMonths(months),verified=row.review?.service_verified===true;
 const shortReason=(retirement||row.roster_retired)?'Retirement':validReasons.includes(row.review?.short_service_reason)?row.review.short_service_reason:null;
 const rate=.4875;let result='Pending',reason;
 let dateConflict=false;
 if(retirement?.date?.startsWith('2024-')){const maximum=Number(retirement.date.slice(5,7));dateConflict=typeof months==='number'&&months>maximum;}
 if(identityConflict)reason='Identity needs confirmation before assessing service and PBB eligibility.';
 else if(factor===null)reason='Qualifying service months are missing or invalid in the payfile. Verify the service period and correct the source Form 1.0.';
 else if(months<3){result='Not eligible';reason='The payfile reports less than three months of qualifying service. MC No. 2026-1 item 7.11 requires at least three months for a prorated grant. Verify or correct this service entry.';}
 else if(dateConflict)reason=`Payfile declares ${months} months, but the retirement record ends on ${retirement.date}. Verify the applicable FY 2024 service period and correct the payfile. Retirement itself is not a disqualification.`;
 else if(retirement?.date<'2024-01-01'&&!verified)reason='A pre-2024 retirement record conflicts with declared FY 2024 service. Verify any reappointment or service record. Retirement date alone is not an eligibility decision.';
 else if(row.scope==='unspecified'||!row.scope)reason='Classify this employee as school-based or office-based to apply the appropriate supporting-record review.';
 else if(months<9&&!shortReason)reason=`The payfile declares ${months} months (${factor*100}% factor). Verify an authorized short-service reason under MC No. 2026-1 item 7.11; short service alone does not establish eligibility.`;
 else if((retirement||months<9)&&!verified)reason=`${retirement?'Retirement is a valid proration reason, not a disqualification. ':''}Verify the declared ${months} qualifying months against HR records. Applicable service factor would be ${factor*100}%, subject to the other PBB conditions.`;
 else if(row.scope==='school'&&(notFound.length||missing.length)&&!verified)reason='Monthly PSIPOP evidence is incomplete or the person was not found in one or more snapshots. Verify actual service or a valid interruption; snapshot absence alone does not prove ineligibility.';
 else{result='Eligible';reason=`Service-based pre-check: ${months} declared qualifying months; ${factor===1?'full-grant':'prorated'} factor ${factor*100}% under MC No. 2026-1 items 7.10–7.11${shortReason?' ('+shortReason+')':''}. Very Satisfactory performance, SALN, cash-advance, case/leave, and isolation requirements still need validation.`;}
 const amount=factor!==null&&!dateConflict&&typeof row.salary==='number'&&row.salary>0?Math.round((row.salary*rate*factor+Number.EPSILON)*100)/100:null;
 const amountMismatch=amount!==null&&typeof row.payfile_pbb==='number'&&Math.abs(row.payfile_pbb-amount)>.02;
 if(result==='Eligible'&&amount===null){result='Pending';reason='The service pre-check passed, but the payfile salary is missing or invalid. Verify the salary basis before calculating the PBB.';}
 else if(result==='Eligible'&&amountMismatch){result='Pending';reason=`Payfile PBB amount ${row.payfile_pbb.toFixed(2)} differs from salary × 48.75% × service factor (${amount.toFixed(2)}). Verify the service factor and salary basis; the app does not overwrite the source.`;}
 return {result,reason,service_months:months??null,service_factor:dateConflict?null:factor,service_verified:verified,short_service_reason:shortReason,grant_type:dateConflict?'Service count conflict':factor===null?'Unverified':factor===0?'Below minimum':factor===1?'Full':'Pro-rated',indicative_pbb:amount,agency_rate:rate,date_conflict:dateConflict,amount_mismatch:amountMismatch};
}
module.exports={factorForMonths,assessBenefit,validReasons};
