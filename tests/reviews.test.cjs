const test=require('node:test');const assert=require('node:assert/strict');
const {prepare,applyReviews,decision}=require('../desktop/reviews.cjs');
function fixture(){const result=prepare({pay_folder:'C:/pay',roster_folder:'C:/roster',roster_problems:[],roster:[{name:'DELOS REYES, JAIME ROWEL TULO',file:'psipop.pdf',page:1,item:'ITEM-1'}],results:[{name:'DELOS REYES, JAIME ROWEL',service_months:12,service_label:'12 months',salary:30000,file:'pay.xlsx',sheet:'Form',cell:'F23',status:'Possible name variant',detail:'Review',references:[{name:'DELOS REYES, JAIME ROWEL TULO',file:'psipop.pdf',page:1,item:'ITEM-1'}]}]});result.results[0].scope='office';return result;}
test('confirm match persists across a fresh comparison and can be undone',()=>{
 let result=fixture();const id=result.results[0].id,target=result.roster[0].id;const change=decision(result,{rowId:id,action:'match',target,note:'Verified service record'});const store={[id]:change.value};
 result=applyReviews(fixture(),JSON.parse(JSON.stringify(store)));assert.equal(result.results[0].status,'Pre-audited');assert.equal(result.results[0].review.note,'Verified service record');
 delete store[decision(result,{rowId:id,action:'undo'}).key];assert.equal(applyReviews(result,store).results[0].status,'Possible name variant');
});
test('rejecting the last suggestion classifies retirement under the user roster rule',()=>{
 const result=fixture(),row=result.results[0];const change=decision(result,{rowId:row.id,action:'different',target:result.roster[0].id});applyReviews(result,{[row.id]:change.value});
 assert.equal(row.status,'Retired - per roster rule');assert.equal(row.roster_retired,true);assert.equal(row.references.length,0);assert.equal(row.review.action,'different');
 const accepted=decision(result,{rowId:row.id,action:'match',target:result.roster[0].id},change.value);assert.equal(accepted.value.rejected.length,0);
});
test('review cannot select a missing roster person',()=>{const result=fixture();assert.throws(()=>decision(result,{rowId:result.results[0].id,action:'match',target:'wrong'}));});
test('rejecting an automatic match returns it to review',()=>{const result=fixture();result.results[0].originalStatus='Matched';const row=result.results[0];const change=decision(result,{rowId:row.id,action:'different',target:result.roster[0].id});applyReviews(result,{[row.id]:change.value});assert.equal(row.status,'Needs manual match');});
test('a missing target invalidates a previously confirmed match',()=>{
 const result=fixture(),row=result.results[0];const change=decision(result,{rowId:row.id,action:'match',target:result.roster[0].id});result.roster=[];applyReviews(result,{[row.id]:change.value});assert.notEqual(row.status,'Pre-audited');
});
test('an altered payfile name gets a different review key',()=>{const first=fixture();const raw={pay_folder:'C:/pay',roster_folder:'C:/roster',roster:[],results:[{name:'OTHER PERSON',file:'pay.xlsx',sheet:'Form',cell:'F23',status:'Review',references:[]}]};assert.notEqual(prepare(raw).results[0].id,first.results[0].id);});
test('changing service inputs invalidates HR verification while retaining the identity match',()=>{
 const result=fixture(),row=result.results[0];const change=decision(result,{rowId:row.id,action:'match',target:result.roster[0].id,service_verified:true,note:'Service record checked'});const store={[row.id]:change.value};applyReviews(result,store);assert.equal(row.review.service_verified,true);row.service_months=7;applyReviews(result,store);assert.equal(row.review.service_verified,false);assert.equal(row.review.service_verification_stale,true);assert.ok(row.review.target);
});

test('incomplete roster extraction does not classify a rejected suggestion as retired',()=>{
 const result=fixture(),row=result.results[0];result.roster_problems=['Unreadable PDF'];const change=decision(result,{rowId:row.id,action:'different',target:result.roster[0].id});applyReviews(result,{[row.id]:change.value});assert.equal(row.status,'Needs manual match');assert.equal(row.roster_retired,undefined);
});
test('retirement classification is cleared on undo',()=>{
 const result=fixture(),row=result.results[0];const change=decision(result,{rowId:row.id,action:'different',target:result.roster[0].id});applyReviews(result,{[row.id]:change.value});assert.equal(row.roster_retired,true);applyReviews(result,{});assert.equal(row.roster_retired,undefined);assert.equal(row.status,'Possible name variant');
});

function automaticFixture(){
 const name='CRUZ, ANA MARIA';const person={name,file:'current.pdf',page:1,item:'ITEM',position:'Teacher'};
 const months=require('../desktop/period.cjs').requiredMonths;
 return prepare({pay_folder:'C:/pay',roster_folder:'C:/roster',roster_problems:[],roster:[person],history:{complete_months:months,people:months.map(month=>({...person,file:month+'.pdf',month}))},results:[{name,service_months:12,salary:30000,file:'Elementary.xlsx',sheet:'Form',cell:'F23',status:'Matched',detail:'Exact name',references:[person]}]});
}
test('exact automatic match passing all service checks is pre-audited without manual clicks',()=>{
 const result=applyReviews(automaticFixture(),{}),row=result.results[0];assert.equal(row.status,'Pre-audited');assert.equal(row.audit_method,'Automatic match');assert.equal(row.review,undefined);assert.equal(row.eligibility.result,'Eligible');
 applyReviews(result,{});assert.equal(row.status,'Pre-audited');
});
test('automatic match with missing monthly evidence remains pending',()=>{
 const result=automaticFixture();result.history.people.pop();applyReviews(result,{});assert.equal(result.results[0].status,'Matched');assert.equal(result.results[0].eligibility.result,'Pending');
});
test('unconfirmed similar names are never automatically pre-audited',()=>{
 const result=automaticFixture();result.results[0].originalStatus='Possible name variant';applyReviews(result,{});assert.equal(result.results[0].status,'Possible name variant');assert.equal(result.results[0].eligibility.result,'Pending');
});

test('service review preserves a saved identity match and rejected suggestions',()=>{
 const result=fixture(),row=result.results[0];const first=decision(result,{rowId:row.id,action:'match',target:result.roster[0].id});first.value.rejected=['other-person'];
 const saved=decision(result,{rowId:row.id,action:'service',scope:'office',service_verified:true,note:'HR records checked'},first.value);
 assert.equal(saved.value.action,'match');assert.equal(saved.value.target,first.value.target);assert.deepEqual(saved.value.rejected,['other-person']);applyReviews(result,{[row.id]:saved.value});assert.equal(row.status,'Pre-audited');
});
test('retired roster-rule employee can save HR verification without selecting a different person',()=>{
 const result=fixture(),row=result.results[0];row.service_months=7;
 const rejected=decision(result,{rowId:row.id,action:'different',target:result.roster[0].id});applyReviews(result,{[row.id]:rejected.value});assert.equal(row.eligibility.result,'Pending');
 const saved=decision(result,{rowId:row.id,action:'service',scope:'school',service_verified:true,note:'HR retirement service checked',short_service_reason:'Retirement'},rejected.value);applyReviews(result,{[row.id]:saved.value});assert.equal(row.status,'Retired - per roster rule');assert.equal(row.eligibility.result,'Eligible');assert.equal(row.eligibility.service_factor,.8);
});
test('saving service verification requires a supporting HR note',()=>{
 const result=fixture();assert.throws(()=>decision(result,{rowId:result.results[0].id,action:'service',scope:'school',service_verified:true,note:''}),/HR service record/);
});
