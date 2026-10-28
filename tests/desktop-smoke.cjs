'use strict';
const {spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const electron=process.env.WORT_TEST_EXECUTABLE?path.resolve(process.env.WORT_TEST_EXECUTABLE):require('electron');
const ROOT=path.resolve(__dirname,'..');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'wort-desktop-smoke-'));
async function launch(){
 const env={...process.env,WORT_TEST_DATA_DIR:path.join(directory,'data'),XDG_CACHE_HOME:path.join(directory,'cache'),XDG_CONFIG_HOME:path.join(directory,'config')};
 delete env.ELECTRON_RUN_AS_NODE;
 const args=process.env.WORT_TEST_EXECUTABLE?['--wort-smoke-test']:[ROOT,'--wort-smoke-test'];
 if(process.platform==='linux')args.push('--no-sandbox','--disable-gpu','--ozone-platform=headless');
 return new Promise((resolve,reject)=>{
  const child=spawn(electron,args,{cwd:ROOT,env,stdio:['ignore','pipe','pipe']});
  let output='';const collect=data=>{output+=data.toString();};
  child.stdout.on('data',collect);child.stderr.on('data',collect);
  const timer=setTimeout(()=>{child.kill();reject(Error('Desktop smoke timeout\n'+output.slice(-4000)));},45000);
  child.on('error',error=>{clearTimeout(timer);reject(error);});
  child.on('exit',code=>{
   clearTimeout(timer);
   if(code!==0||!output.includes('WORT_SMOKE_PASS'))return reject(Error('Electron smoke failed\n'+output.slice(-5000)));
   resolve(output);
  });
 });
}
(async()=>{
 try{
  await launch();
  const store=JSON.parse(fs.readFileSync(path.join(directory,'data/wort-store.json'),'utf8'));
  assert.equal(store.values['wort-ai-judge'],'true');
  const restarted=await launch();
  assert(restarted.includes('\"restored\":true'),'Preference did not survive restart');
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'data/wort-store.json'),'utf8')).values['wort-ai-judge'],'true');
  console.log('PASS: actual Electron protocol, isolated preload, native disk storage across restarts, offline Markdown.');
 }finally{fs.rmSync(directory,{recursive:true,force:true,maxRetries:20,retryDelay:150});}
})().catch(error=>{console.error(error);process.exitCode=1;});
