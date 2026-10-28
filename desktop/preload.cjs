'use strict';
const {contextBridge,ipcRenderer}=require('electron');
function sync(channel,...args){
 const response=ipcRenderer.sendSync(channel,...args);
 if(!response?.ok)throw Error(response?.error||'本地存储操作失败');
 return response.value;
}
function subscribe(channel,listener){
 if(typeof listener!=='function')return ()=>{};
 const handler=(_event,value)=>listener(value);
 ipcRenderer.on(channel,handler);
 return ()=>ipcRenderer.removeListener(channel,handler);
}
contextBridge.exposeInMainWorld('wortDesktop',{
 info:sync('wort:info'),
 storage:{
  getItem:key=>sync('wort:storage:get',key),
  setItem:(key,value)=>sync('wort:storage:set',key,String(value)),
  removeItem:key=>sync('wort:storage:remove',key)
 },
 onStorageChange:listener=>subscribe('wort:storage:changed',listener),
 requestAI:request=>ipcRenderer.invoke('wort:ai:request',request),
 cancelAI:requestId=>ipcRenderer.send('wort:ai:cancel',requestId),
 openDataFolder:()=>ipcRenderer.invoke('wort:data:open'),
 getUpdateState:()=>ipcRenderer.invoke('wort:update:state'),
 checkUpdate:()=>ipcRenderer.invoke('wort:update:check'),
 downloadUpdate:()=>ipcRenderer.invoke('wort:update:download'),
 installUpdate:()=>ipcRenderer.invoke('wort:update:install'),
 onUpdate:listener=>subscribe('wort:update:changed',listener)
});
