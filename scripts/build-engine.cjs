const {spawnSync}=require('node:child_process');
const path=require('node:path');
const result=spawnSync(process.env.PYTHON||'python',['-m','PyInstaller','--noconfirm','--clean','--onedir','--console','--name','roster-engine','--distpath','build-engine','--workpath','tmp/pyinstaller','--specpath','tmp','roster.py'],{cwd:path.resolve(__dirname,'..'),stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status??1;
