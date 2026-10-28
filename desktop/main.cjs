'use strict';
const {app,BrowserWindow,protocol,net,ipcMain,shell,dialog,safeStorage}=require('electron');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {LocalStore}=require('./store.cjs');
const {validateRequest,readLimited}=require('./network.cjs');
const ROOT=path.resolve(__dirname,'..');
const APP_URL='wort://app/index.html';
app.setName('Wort');
app.setPath('userData',process.env.WORT_TEST_DATA_DIR||path.join(app.getPath('appData'),'Wort'));
protocol.registerSchemesAsPrivileged([{scheme:'wort',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
const smoke=process.argv.includes('--wort-smoke-test');
let store,mainWindow,updateTimer,updateInterval;
let updateState={status:'idle',message:'尚未检查更新。'};
const requests=new Map();
function trusted(event){
 const frame=event.senderFrame;
 if(!frame||frame!==event.sender.mainFrame)return false;
 try{const url=new URL(frame.url);return url.protocol==='wort:'&&url.host==='app'&&url.pathname==='/index.html';}catch{return false;}
}
function windows(){return BrowserWindow.getAllWindows();}
function sendAll(channel,value,except){
 for(const window of windows())if(!window.isDestroyed()&&window.webContents.id!==except)window.webContents.send(channel,value);
}
function setUpdate(status,message,extra={}){
 updateState={status,message,...extra};sendAll('wort:update:changed',updateState);
}
function external(url){
 try{
  const parsed=new URL(url);
  if(['https:','http:'].includes(parsed.protocol)&&!parsed.username&&!parsed.password)shell.openExternal(parsed.href);
 }catch{}
}
function createWindow(){
 const window=new BrowserWindow({
  width:1180,height:860,minWidth:750,minHeight:600,show:!smoke,
  backgroundColor:'#f4f7f1',autoHideMenuBar:true,
  webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}
 });
 window.webContents.setWindowOpenHandler(({url})=>{external(url);return {action:'deny'};});
 window.webContents.on('will-navigate',(event,url)=>{
  if(!url.startsWith(APP_URL+'#')&&url!==APP_URL){event.preventDefault();external(url);}
 });
 window.webContents.on('will-attach-webview',event=>event.preventDefault());
 window.on('close',()=>{
  for(const [id,request]of requests)if(request.sender===window.webContents.id){request.controller.abort();requests.delete(id);}
 });
 return window;
}
function registerStorage(){
 const sync=(channel,handler)=>ipcMain.on(channel,(event,...args)=>{
  try{
   if(!trusted(event))throw Error('不允许的调用来源');
   event.returnValue={ok:true,value:handler(event,...args)};
  }catch(error){event.returnValue={ok:false,error:error.message};}
 });
 sync('wort:info',()=>({version:app.getVersion(),dataPath:app.getPath('userData'),packaged:app.isPackaged}));
 sync('wort:storage:get',(_event,key)=>store.get(key));
 sync('wort:storage:set',(event,key,value)=>{
  store.set(key,value);sendAll('wort:storage:changed',{key},event.sender.id);
 });
 sync('wort:storage:remove',(event,key)=>{
  store.remove(key);sendAll('wort:storage:changed',{key},event.sender.id);
 });
 ipcMain.handle('wort:data:open',event=>{
  if(!trusted(event))throw Error('不允许的调用来源');
  return shell.openPath(app.getPath('userData'));
 });
}
function registerNetwork(){
 ipcMain.handle('wort:ai:request',async(event,request)=>{
  if(!trusted(event))throw Error('不允许的调用来源');
  const config=validateRequest(request,store.get('wort-ai-settings-v2'));
  const id=event.sender.id+':'+request.requestId;
  if(requests.has(id)||[...requests.values()].filter(r=>r.sender===event.sender.id).length>=4)throw Error('请求过多');
  const controller=new AbortController();
  requests.set(id,{controller,sender:event.sender.id});
  const timer=setTimeout(()=>controller.abort(),config.timeout);
  try{
   const response=await net.fetch(config.url,{
    method:config.method,redirect:'error',signal:controller.signal,
    headers:{Authorization:'Bearer '+request.key,...(request.body?{'Content-Type':'application/json'}:{})},
    ...(request.body?{body:JSON.stringify(request.body)}:{})
   });
   return {status:response.status,text:await readLimited(response)};
  }catch(error){
   if(error.name==='AbortError')throw Error('请求已停止或超时。');
   // Do not expose headers, request payloads or credentials in error messages.
   throw Error('API 网络请求失败，请检查连接、地址和服务状态。');
  }finally{clearTimeout(timer);requests.delete(id);}
 });
 ipcMain.on('wort:ai:cancel',(event,requestId)=>{
  if(trusted(event)&&typeof requestId==='string')requests.get(event.sender.id+':'+requestId)?.controller.abort();
 });
}
function registerUpdates(){
 const {autoUpdater}=require('electron-updater');
 autoUpdater.autoDownload=false;
 autoUpdater.autoInstallOnAppQuit=false;
 autoUpdater.allowDowngrade=false;
 autoUpdater.allowPrerelease=false;
 autoUpdater.disableWebInstaller=true;
 autoUpdater.logger=null;
 autoUpdater.on('checking-for-update',()=>setUpdate('checking','正在检查 GitHub Releases…'));
 autoUpdater.on('update-available',info=>setUpdate('available',`发现新版本 ${info.version}，可选择下载。`,{version:info.version}));
 autoUpdater.on('update-not-available',()=>setUpdate('current','当前已是最新版本。'));
 autoUpdater.on('download-progress',progress=>setUpdate('downloading',`正在下载更新：${Math.floor(progress.percent)}%`,{percent:progress.percent}));
 autoUpdater.on('update-downloaded',info=>setUpdate('downloaded',`版本 ${info.version} 已下载，保存数据后可确认重启安装。`,{version:info.version}));
 autoUpdater.on('error',()=>setUpdate('error','检查或下载更新失败，可稍后重试；当前版本和本地数据不受影响。'));
 let checking=false,downloading=false;
 async function check(){
  if(!app.isPackaged){setUpdate('development','开发模式不安装更新；正式安装版会自动检查。');return;}
  if(checking||downloading||['available','downloaded','installing'].includes(updateState.status))return;
  checking=true;
  try{await autoUpdater.checkForUpdates();}
  catch{setUpdate('error','暂时无法连接 GitHub 更新服务，请稍后重试。');}
  finally{checking=false;}
 }
 ipcMain.handle('wort:update:state',event=>{if(!trusted(event))throw Error('不允许的来源');return updateState;});
 ipcMain.handle('wort:update:check',async event=>{if(!trusted(event))throw Error('不允许的来源');await check();return updateState;});
 ipcMain.handle('wort:update:download',async event=>{
  if(!trusted(event))throw Error('不允许的来源');
  if(!app.isPackaged||downloading||updateState.status!=='available')return;
  downloading=true;
  try{await autoUpdater.downloadUpdate();}
  catch{setUpdate('error','下载未完成，请重新检查后再试。');}
  finally{downloading=false;}
 });
 ipcMain.handle('wort:update:install',event=>{
  if(!trusted(event))throw Error('不允许的来源');
  if(updateState.status!=='downloaded')return false;
  // Persist a recoverable snapshot before handing control to the NSIS installer.
  store.write(store.values);
  setUpdate('installing','正在退出并安装更新…');
  setImmediate(()=>autoUpdater.quitAndInstall(false,true));
  return true;
 });
 if(!smoke){updateTimer=setTimeout(check,8000);updateInterval=setInterval(check,4*60*60*1000);}
}
function registerProtocol(){
 const allowed=new Set(['/index.html','/app.js','/styles.css','/learning.js','/grammar.js','/library-context.js','/vendor/marked.umd.js','/vendor/purify.min.js']);
 protocol.handle('wort',async request=>{
  const url=new URL(request.url),pathname=url.pathname==='/'?'/index.html':url.pathname;
  if(url.host!=='app'||!allowed.has(pathname))return new Response('Not found',{status:404});
  const response=await net.fetch(pathToFileURL(path.join(ROOT,pathname.slice(1))).href);
  const headers=new Headers(response.headers);headers.set('Cache-Control','no-store');
  return new Response(response.body,{status:response.status,headers});
 });
}
if(!app.requestSingleInstanceLock())app.quit();
else{
 app.on('second-instance',()=>{if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.focus();}});
 app.whenReady().then(async()=>{
  store=new LocalStore(app.getPath('userData'),{
   available:()=>safeStorage.isEncryptionAvailable()&&(process.platform!=='linux'||safeStorage.getSelectedStorageBackend()!=='basic_text'),
   encrypt:value=>safeStorage.encryptString(value),decrypt:value=>safeStorage.decryptString(value)
  });
  registerProtocol();registerStorage();registerNetwork();registerUpdates();
  mainWindow=createWindow();
  if(smoke){
   mainWindow.webContents.on('console-message',details=>console.log('[renderer]',details.message));
   mainWindow.webContents.on('did-finish-load',async()=>{
    try{
     const report=await mainWindow.webContents.executeJavaScript(`(async()=>{
      const desktop=window.wortDesktop;
      if(!desktop||typeof require!=='undefined')throw Error('Isolation/preload failed');
      const restored=desktop.storage.getItem('wort-ai-judge')==='true';
      desktop.storage.setItem('wort-ai-judge','true');
      if(desktop.storage.getItem('wort-ai-judge')!=='true')throw Error('Disk storage failed');
      const node=document.createElement('div');renderMarkdown(node,'**成功**\\n\\n| A | B |\\n|---|---|\\n|1|2|');
      if(!node.querySelector('table')||!node.querySelector('strong'))throw Error('Offline Markdown failed');
      if(!window.WortGrammar||!WortGrammar.POS.noun)throw Error('Offline noun grammar module failed');
      if(!window.WortLibraryContext||WortLibraryContext.build([]).total!==0)throw Error('Offline word-library context failed');
      desktop.storage.setItem('wort-ai-library-enabled-v1','false');
      if(desktop.storage.getItem('wort-ai-library-enabled-v1')!=='false')throw Error('Library preference persistence failed');
      return {version:desktop.info.version,restored,storage:true,markdown:true,isolation:true};
     })()`);
     if(process.platform==='win32'){
      const secret='smoke-key-not-a-real-credential';
      store.set('wort-api-key-v1',JSON.stringify({key:secret}));
      if(JSON.parse(store.get('wort-api-key-v1')).key!==secret)throw Error('Windows key decryption failed');
      const disk=require('node:fs').readFileSync(store.file,'utf8');
      if(disk.includes(secret))throw Error('Key was written as plaintext');
      report.windowsKeyEncryption=true;
     }
     console.log('WORT_SMOKE_PASS '+JSON.stringify(report));app.exit(0);
    }catch(error){console.error(error.message);app.exit(1);}
   });
  }
  await mainWindow.loadURL(APP_URL);
 }).catch(error=>{
  if(smoke){console.error(error.message);app.exit(1);}
  else{dialog.showErrorBox('Wort 无法启动','本地数据未被覆盖。请保留数据文件夹并检查备份。\n'+error.message);app.quit();}
 });
 app.on('activate',()=>{if(!windows().length){mainWindow=createWindow();mainWindow.loadURL(APP_URL);}});
 app.on('window-all-closed',()=>app.quit());
 app.on('before-quit',()=>{clearTimeout(updateTimer);clearInterval(updateInterval);for(const r of requests.values())r.controller.abort();});
}
