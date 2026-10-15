const {app,BrowserWindow,ipcMain,dialog,shell}=require('electron');
const {spawn}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs/promises');
const reviews=require('./reviews.cjs');
const {resultCsv,workbookSheets}=require('./csv.cjs');
if(!app.isPackaged){
 const developmentData=path.join(app.getPath('appData'),process.argv.includes('--smoke-test')?'PBB PreAudit Test':'PBB PreAudit Development');
 app.setPath('userData',developmentData);
 app.setPath('sessionData',path.join(developmentData,'session'));
}
let window,worker,compareBusy=false,latestResult,decisions={},reviewQueue=Promise.resolve();
const reviewFile=()=>path.join(app.getPath('appData'),'PBB PreAudit Reviews',process.argv.includes('--smoke-test')?'smoke-decisions.json':'decisions.json');
async function loadDecisions(){try{const saved=JSON.parse(await fs.readFile(reviewFile(),'utf8'));if(saved.version!==1||!saved.decisions||Array.isArray(saved.decisions)||typeof saved.decisions!=='object')throw Error('Invalid review data');decisions=saved.decisions;}catch(error){if(error.code!=='ENOENT')throw Error('Saved reviews could not be read: '+error.message);decisions={};}}
async function saveDecisions(next){const file=reviewFile();await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file+'.tmp',JSON.stringify({version:1,decisions:next},null,2),'utf8');await fs.rename(file+'.tmp',file);decisions=next;}
const backend=()=>app.isPackaged?path.join(process.resourcesPath,'backend',process.platform==='win32'?'roster-engine.exe':'roster-engine'):null;
const defaults={pay_folder:'C:\\Users\\DepEd\\Downloads\\PBB 2024 WITH IUs',roster_folder:'C:\\Users\\DepEd\\Desktop\\Psipop\\Current\\09 SEPTEMBER 2026',history_folder:'C:\\Users\\DepEd\\Desktop\\Psipop\\Previous Year'};
function trusted(event){if(event.sender!==window.webContents)throw Error('Unknown sender');}
ipcMain.handle('defaults',event=>{trusted(event);return process.platform==='win32'?defaults:{pay_folder:app.getPath('documents'),roster_folder:app.getPath('documents'),history_folder:''};});
ipcMain.handle('choose-folder',async(event,current)=>{trusted(event);const result=await dialog.showOpenDialog(window,{title:'Select source folder',defaultPath:typeof current==='string'?current:undefined,properties:['openDirectory']});return result.canceled?null:result.filePaths[0];});
ipcMain.handle('choose-tin-file',async event=>{trusted(event);const result=await dialog.showOpenDialog(window,{title:'Select employee name / TIN reference',filters:[{name:'Excel or CSV',extensions:['xlsx','xlsm','csv']}],properties:['openFile']});return result.canceled?null:result.filePaths[0];});
ipcMain.handle('compare',async(event,options)=>{
 trusted(event);if(compareBusy)throw Error('A comparison is already running.');
 if(!options||typeof options.pay_folder!=='string'||typeof options.roster_folder!=='string')throw Error('Choose both source folders.');
 compareBusy=true;
 return new Promise((resolve,reject)=>{
  let child;try{const executable=backend();child=spawn(executable||'python',executable?[]:[path.join(__dirname,'..','roster.py')],{windowsHide:true,stdio:['pipe','pipe','pipe']});worker=child;}catch(error){compareBusy=false;reject(error);return;}
  let output='',errors='',settled=false,timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;child.kill();},180000);
  const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);if(worker===child)worker=null;compareBusy=false;if(error)reject(error);else resolve(result);};
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{errors+=chunk;});
  child.on('error',error=>finish(Error('Could not start the matching engine: '+error.message)));
  child.on('close',async code=>{if(settled)return;try{if(timedOut)throw Error('Comparison exceeded three minutes. Check the source files and try again.');if(!output.trim())throw Error('Matching engine stopped without a result. '+errors.slice(-600));const result=JSON.parse(output);if(result.error)throw Error(result.error);if(code!==0)throw Error('Matching engine stopped unexpectedly.');await reviewQueue;await loadDecisions();const prepared=reviews.applyReviews(reviews.prepare(result),decisions);latestResult=prepared;finish(null,prepared);}catch(error){finish(error);}});
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(options));
 });
});
ipcMain.handle('save-review',(event,payload)=>{
 trusted(event);const operation=reviewQueue.then(async()=>{
  if(compareBusy)throw Error('Wait for the comparison to finish.');if(!latestResult)throw Error('Compare the files first.');
  await loadDecisions();
  const change=reviews.decision(latestResult,payload,decisions[payload.rowId]);const next={...decisions};if(change.value)next[change.key]=change.value;else delete next[change.key];
  await saveDecisions(next);reviews.applyReviews(latestResult,decisions);return latestResult.results.find(row=>row.id===change.key);
 });reviewQueue=operation.catch(()=>{});return operation;
});
ipcMain.handle('open-source',async(event,payload)=>{
 trusted(event);if(!latestResult)throw Error('Compare the files first.');let root,relative;
 if(payload.kind==='roster'){const ref=latestResult.roster.find(r=>r.id===payload.id);if(!ref)throw Error('PSIPOP entry unavailable.');root=ref.source==='history'?latestResult.history_folder:ref.source==='retirement'?latestResult.pay_folder:latestResult.roster_folder;relative=ref.file;}
 else if(payload.kind==='payfile'){const row=latestResult.results.find(r=>r.id===payload.id);if(!row)throw Error('Payfile entry unavailable.');root=latestResult.pay_folder;relative=row.file;}
 else if(payload.kind==='retirement'){const record=latestResult.retirements.find(r=>r.id===payload.id);if(!record)throw Error('Retirement record unavailable.');root=latestResult.pay_folder;relative=record.file;}
 else throw Error('Unknown source.');
 const target=path.resolve(root,relative);if(!target.toLowerCase().startsWith(path.resolve(root).toLowerCase()+path.sep))throw Error('Source is outside the selected folder.');
 const error=await shell.openPath(target);if(error)throw Error(error);
});
ipcMain.handle('export',async(event,rows)=>{
 trusted(event);if(!Array.isArray(rows))throw Error('No rows to export.');
 if(compareBusy||!latestResult)throw Error('Complete the comparison before downloading CSV.');
 const current=new Map(latestResult.results.map(row=>[row.id,row]));const selected=rows.map(row=>current.get(row.id));if(selected.some(row=>!row))throw Error('These results are stale. Rerun the comparison before exporting.');
 const result=await dialog.showSaveDialog(window,{title:'Download filtered PSIPOP results',defaultPath:'PBB-PSIPOP-results.csv',filters:[{name:'CSV for Excel',extensions:['csv']}]});
 if(result.canceled)return null;
 await fs.writeFile(result.filePath,resultCsv(selected,latestResult.required_months),'utf8');return result.filePath;
});
ipcMain.handle('export-workbook',async event=>{
 trusted(event);if(compareBusy||!latestResult)throw Error('Complete the comparison before downloading Excel.');
 const rows=latestResult.results;
 const sheets=workbookSheets(rows,latestResult.required_months);
 const result=process.argv.includes('--smoke-test')?{filePath:path.join(app.getPath('temp'),'preaudit-workbook-smoke.xlsx')}:await dialog.showSaveDialog(window,{title:'Download all results by sheet',defaultPath:'PBB-PreAudit-by-sheet.xlsx',filters:[{name:'Excel workbook',extensions:['xlsx']}]});
 if(result.canceled)return null;
 await new Promise((resolve,reject)=>{
  const executable=backend();const child=spawn(executable||'python',executable?[]:[path.join(__dirname,'..','roster.py')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let output='',errors='',settled=false;
  const timer=setTimeout(()=>{child.kill();finish(Error('Workbook export timed out.'));},120000);
  function finish(error){if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve();}
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>errors+=chunk);child.on('error',finish);
  child.on('close',code=>{try{const response=JSON.parse(output);if(code!==0||response.error)throw Error(response.error||errors||'Workbook export failed.');finish();}catch(error){finish(error);}});
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({mode:'export_workbook',file:result.filePath,sheets}));
 });return result.filePath;
});
ipcMain.handle('open-memo',async event=>{
 trusted(event);const memo=app.isPackaged?path.join(process.resourcesPath,'memo.pdf'):process.env.PREAUDIT_MEMO;
 if(memo){try{await fs.access(memo);const error=await shell.openPath(memo);if(error)throw Error(error);return;}catch(error){if(error.code!=='ENOENT')throw error;}}
 await shell.openExternal('https://www.dbm.gov.ph/wp-content/uploads/Issuances/2026/Resolution/RESOLUTION-NO.-2026-1-and-MEMORANDUM-CIRCULAR-NO.-2026-1-updated.pdf');
});
app.whenReady().then(()=>{
 window=new BrowserWindow({show:false,width:1390,height:940,minWidth:940,minHeight:680,title:'PBB PreAudit',icon:path.join(__dirname,'assets',process.platform==='win32'?'app.ico':'logo.png'),backgroundColor:'#f3f6fa',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 window.once('ready-to-show',()=>{window.show();window.focus();});
 window.setMenuBarVisibility(false);window.loadFile(path.join(__dirname,'index.html'));
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());
 if(process.argv.includes('--smoke-test')){window.webContents.once('did-finish-load',async()=>{
  try{
   await fs.rm(reviewFile(),{force:true});
   const state=await window.webContents.executeJavaScript(`(async()=>{
    const assert=(ok,message)=>{if(!ok)throw Error(message);};
    const wait=async(test)=>{const start=Date.now();while(!test()&&Date.now()-start<180000)await new Promise(r=>setTimeout(r,100));assert(test(),'Timed out waiting for UI operation');};
    const defaults=await window.preAudit.defaults();document.getElementById('pay').value=defaults.pay_folder;document.getElementById('roster').value=defaults.roster_folder;document.getElementById('history').value=defaults.history_folder;document.getElementById('compare').click();
    await wait(()=>!document.getElementById('compare').disabled);assert(data,'Comparison failed');assert(document.querySelector('.brand-logo').naturalWidth>0,'Logo image must load');
    assert(data.history.missing_months.length===0,'All seven December-June source months should be present');
    $('month-filter').value='2025-03';$('month-state').value='Not found';render();assert(filtered.length>0&&filtered.every(row=>row.eligibility.months.some(month=>month.month==='2025-03'&&month.status==='Not found')),'Month filtering failed');assert($('export').textContent.includes(filtered.length.toLocaleString()),'CSV download count must reflect filtered entries');$('month-filter').value='';$('month-state').value='';
    $('result-filter').value=data.results.some(row=>row.eligibility.result==='Not eligible')?'Not eligible':'Pending';render();assert(filtered.length>0,'Expected reviewable service results');
    document.querySelector('[data-reason]').click();assert($('reason-dialog').open,'Clickable result did not open reason window');assert($('reason-months').children.length===7,'Reason window must show all seven months');$('reason-dialog').close();$('result-filter').value='';
    $('result-filter').value='Eligible';document.querySelector('[data-filter="review"]').click();assert($('result-filter').value===''&&filtered.length>0&&filtered.every(isReview),'Summary card must clear conflicting result filters');$('clear-filters').click();assert(filtered.length===data.results.length,'Clear filters must restore all entries');
    const prorated=data.results.find(row=>row.eligibility.grant_type==='Pro-rated');assert(prorated,'Expected a prorated entry');openReason(prorated.id);assert($('reason-dialog').open&&$('reason-calculation').textContent.includes('Proration factor')&&$('reason-calculation').textContent.includes(String(Math.round(prorated.eligibility.service_factor*100))+'%'),'Proration modal must show its calculation');$('reason-dialog').close();
    $('personnel-filter').value='school';$('personnel-filter').dispatchEvent(new Event('change'));assert(filtered.length>0&&filtered.every(row=>row.scope==='school'),'School-based filter failed');
    const chosenUnit=$('unit-filter').options[1]?.value;assert(chosenUnit,'Expected a school option');$('unit-filter').value=chosenUnit;$('unit-filter').dispatchEvent(new Event('change'));assert(filtered.length>0&&filtered.every(row=>row.unit===chosenUnit&&row.scope==='school'),'Individual school filter failed');assert($('export').textContent.includes(filtered.length.toLocaleString()),'Filtered CSV count must include personnel and school filters');resetFilters();
    $('group-filter').value='IU';$('group-filter').dispatchEvent(new Event('change'));assert(filtered.length===303,'IU filter must show 303 entries');
    $('file-filter').value=data.payfiles.find(f=>f.file.includes('Basilan NHS')).file;render();assert(filtered.length===251,'Basilan filter must show 251 entries');
    $('filter').value='review';render();assert(filtered.length>0,'Review list is empty');
    const first=filtered.find(row=>row.references.length);assert(first,'No suggestion available');
    const reviewed=()=>{const row=data.results.find(row=>row.id===first.id);assert(row,'Reviewed row disappeared after operation: '+first.id+'; total='+data.results.length);return row;};
    const element=document.querySelector('[data-row-id="'+first.id+'"]');element.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:400,clientY:400}));
    assert(!$('row-menu').hidden,'Right-click menu did not open');$('show-matches').click();assert($('review-dialog').open,'Review dialog did not open');
    let radio=$('candidates').querySelector('input[type=radio]');assert(radio,'No suggested person');const target=radio.value;
    $('candidates').querySelector('[data-different]').click();await wait(()=>!reviewBusy);
    assert(reviewed().status!=='Pre-audited','Different people must not pre-audit');
    $('undo-review').click();await wait(()=>!reviewBusy);
    radio=$('candidates').querySelector('input[type=radio]');radio.checked=true;radio.dispatchEvent(new Event('change',{bubbles:true}));
    const expectedNext=reviewQueue.find(id=>data.results.some(row=>row.id===id&&isReview(row)));assert(expectedNext,'Expected another unresolved review');$('next-review').checked=true;$('verify-service').checked=true;$('review-note').value='Automated UI test: temporary review only';$('confirm-match').click();await wait(()=>!reviewBusy);
    assert(reviewed().status==='Pre-audited','Verified seven-month presence and confirmed identity should become pre-audited: '+reviewed().status+'; '+$('review-message').textContent);
    assert($('review-dialog').open&&reviewingId===expectedNext,'Confirmation must open the next unresolved employee');assert(!selectedPerson,'Next employee must require its own explicit selection');$('review-dialog').close();
    $('compare').click();await wait(()=>!$('compare').disabled);
    assert(reviewed().status==='Pre-audited','Saved identity review did not persist across rerun');
    $('export-workbook').click();await wait(()=>!$('export-workbook').disabled);assert($('status').textContent.startsWith('Excel saved:'),'Workbook export failed: '+$('status').textContent);
    $('filter').value='Pre-audited';render();openReview(first.id);
    const savedTarget=reviewed().review.target;$('save-service').click();await wait(()=>!reviewBusy);assert(reviewed().review.target===savedTarget&&reviewed().status==='Pre-audited','Saving service must preserve identity and pre-audit status');
    await new Promise(resolve=>setTimeout(resolve,400));
    return {title:document.title,entries:$('total').textContent,matched:$('matched').textContent,review:$('review').textContent,absent:$('absent').textContent,preaudited:$('preaudited').textContent,rosterTins:data.roster_tins,rows:document.querySelectorAll('#rows tr').length,historyMonths:data.history.available_months,missingMonths:data.history.missing_months,eligibilityCounts:data.results.reduce((counts,row)=>(counts[row.eligibility.result]=(counts[row.eligibility.result]||0)+1,counts),{}),checks:'IU filter, payfile filter, right-click, different people, undo, identity confirmation, saved review, 7-month rule, missing sources stay pending, clickable reasons'};
   })()`);
   await fs.writeFile(path.join(app.getPath('temp'),'preaudit-electron-smoke.json'),JSON.stringify(state));
   const screenshot=await window.webContents.capturePage();await fs.writeFile(path.join(app.getPath('temp'),'preaudit-electron.png'),screenshot.toPNG());
   await window.webContents.executeJavaScript(`(async()=>{$('review-dialog').close();openReason((data.results.find(row=>row.eligibility.result==='Not eligible')||data.results.find(row=>row.eligibility.result==='Pending')).id);await new Promise(resolve=>setTimeout(resolve,400));})()`);
   const reasonScreenshot=await window.webContents.capturePage();await fs.writeFile(path.join(app.getPath('temp'),'preaudit-reason.png'),reasonScreenshot.toPNG());
   await fs.rm(reviewFile(),{force:true});
   app.exit(state.entries==='1,705'&&state.rows>0?0:1);
  }catch(error){await fs.writeFile(path.join(app.getPath('temp'),'preaudit-electron-smoke.json'),JSON.stringify({error:error.message,stack:error.stack}));app.exit(1);}
 });}
});
app.on('window-all-closed',()=>app.quit());app.on('before-quit',()=>worker?.kill());
