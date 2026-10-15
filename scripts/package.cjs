const path=require('node:path');
const fs=require('node:fs/promises');
(async()=>{
 const {packager}=await import('@electron/packager');
 const root=path.resolve(__dirname,'..');
 if(!['win32','darwin'].includes(process.platform))throw Error('Build on Windows or macOS.');
 const engine=path.join(root,'build-engine','roster-engine');
 await fs.access(path.join(engine,process.platform==='win32'?'roster-engine.exe':'roster-engine'));
 const extraResource=[engine];
 if(process.env.PREAUDIT_MEMO){const memo=path.join(root,'tmp','memo.pdf');await fs.mkdir(path.dirname(memo),{recursive:true});await fs.copyFile(process.env.PREAUDIT_MEMO,memo);extraResource.push(memo);}
 const output=await packager({dir:path.join(root,'desktop'),out:path.join(root,'release'),name:'PBB PreAudit',platform:process.platform,arch:process.arch,asar:true,overwrite:true,extraResource,electronVersion:require('electron/package.json').version,appBundleId:'com.jaybhee84.pbbpreaudit',appCategoryType:'public.app-category.finance',win32metadata:{CompanyName:'PreAudit',FileDescription:'PBB PSIPOP Name Verification',ProductName:'PBB PreAudit'}});
 for(const folder of output){const resources=process.platform==='darwin'?path.join(folder,'PBB PreAudit.app','Contents','Resources'):path.join(folder,'resources');await fs.rename(path.join(resources,'roster-engine'),path.join(resources,'backend'));}
 console.log(output.join('\n'));
})().catch(error=>{console.error(error);process.exitCode=1;});
