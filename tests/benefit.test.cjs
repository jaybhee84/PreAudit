const test=require('node:test'),assert=require('node:assert/strict');const {factorForMonths,assessBenefit}=require('../desktop/benefit.cjs');
const options={retirement:null,identityConflict:false,notFound:[],missing:[]};
const person={scope:'school',service_months:12,salary:30000};
test('official service factor thresholds include fractions and reject invalid counts',()=>{
 for(const [months,expected] of [[0,0],[2.99,0],[3,.4],[3.99,.4],[4,.5],[5,.6],[6,.7],[7,.8],[8,.9],[8.99,.9],[9,1],[12,1],[12.1,null],[null,null],[NaN,null]])assert.equal(factorForMonths(months),expected,'months='+months);
});
test('a July 2024 retiree with seven HR-verified service months may receive 80 percent',()=>{
 const row={...person,service_months:7,review:{service_verified:true}};const check=assessBenefit(row,{...options,retirement:{date:'2024-07-31'},notFound:['2025-01']});assert.equal(check.result,'Eligible');assert.equal(check.service_factor,.8);assert.equal(check.indicative_pbb,11700);
});
test('a September 2024 retiree with nine verified months may receive the full grant',()=>{
 const check=assessBenefit({...person,service_months:9,review:{service_verified:true}},{...options,retirement:{date:'2024-09-30'}});assert.equal(check.result,'Eligible');assert.equal(check.service_factor,1);
});
test('retirement does not validate an impossible declared service duration',()=>{
 const check=assessBenefit({...person,review:{service_verified:true}},{...options,retirement:{date:'2024-07-31'}});assert.equal(check.result,'Pending');assert.equal(check.date_conflict,true);assert.equal(check.indicative_pbb,null);
});
test('short service needs a valid reason and HR verification',()=>{
 const row={...person,service_months:3};assert.equal(assessBenefit(row,options).result,'Pending');row.review={short_service_reason:'Newly hired',service_verified:true};assert.equal(assessBenefit(row,options).result,'Eligible');assert.equal(assessBenefit(row,options).service_factor,.4);
});
test('no service value is unavailable rather than zero',()=>{const check=assessBenefit({...person,service_months:null},options);assert.equal(check.result,'Pending');assert.equal(check.service_factor,null);assert.equal(check.indicative_pbb,null);});
test('snapshot absence alone does not reject a qualifying retiree',()=>{const check=assessBenefit({...person,review:{service_verified:true}},{...options,retirement:{date:'2024-12-31'},notFound:['2025-01','2025-02']});assert.equal(check.result,'Eligible');});
test('an inconsistent payfile amount is flagged without changing the source',()=>{const row={...person,payfile_pbb:100};const check=assessBenefit(row,options);assert.equal(check.result,'Pending');assert.equal(check.amount_mismatch,true);assert.equal(row.payfile_pbb,100);});
