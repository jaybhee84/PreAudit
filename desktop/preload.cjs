const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('preAudit',{
 defaults:()=>ipcRenderer.invoke('defaults'),
 chooseFolder:current=>ipcRenderer.invoke('choose-folder',current),
 chooseTinFile:()=>ipcRenderer.invoke('choose-tin-file'),
 compare:options=>ipcRenderer.invoke('compare',options),
 saveReview:payload=>ipcRenderer.invoke('save-review',payload),
 openSource:payload=>ipcRenderer.invoke('open-source',payload),
 exportWorkbook:()=>ipcRenderer.invoke('export-workbook'),
 export:rows=>ipcRenderer.invoke('export',rows),
 openMemo:()=>ipcRenderer.invoke('open-memo')
});
