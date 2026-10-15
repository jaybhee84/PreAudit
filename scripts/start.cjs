const {spawn}=require('node:child_process');
const path=require('node:path');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(require('electron'),[path.resolve(__dirname,'..','desktop'),...process.argv.slice(2)],{stdio:'inherit',env,windowsHide:false});
child.on('error',error=>{console.error('Electron could not start:',error.message);process.exitCode=1;});
child.on('exit',code=>process.exitCode=code??1);
