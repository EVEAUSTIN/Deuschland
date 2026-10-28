'use strict';
const fs=require('node:fs');
const path=require('node:path');
const KEYS=new Set(['wort-simple-v1','wort-data-v1','wort-last-summary-v1',
 'wort-ai-settings-v2','wort-api-key-v1','wort-ai-judge','wort-group-dates']);
const SECRET='wort-api-key-v1';
class LocalStore{
 constructor(directory,encryption){
  this.directory=directory;this.encryption=encryption;
  this.file=path.join(directory,'wort-store.json');
  fs.mkdirSync(directory,{recursive:true});
  this.values=Object.create(null);
  if(fs.existsSync(this.file)){
   const parsed=JSON.parse(fs.readFileSync(this.file,'utf8'));
   if(parsed.version!==1||!parsed.values||typeof parsed.values!=='object'||Array.isArray(parsed.values)){
    throw Error('本地数据库格式异常。原文件未修改，请从备份恢复。');
   }
   for(const [key,value]of Object.entries(parsed.values)){
    if(KEYS.has(key)&&typeof value==='string')this.values[key]=value;
   }
  }
 }
 validate(key){if(!KEYS.has(key))throw Error('不允许访问此存储项');}
 get(key){
  this.validate(key);
  const value=this.values[key];
  if(value===undefined)return null;
  if(key!==SECRET)return value;
  if(!value.startsWith('encrypted:'))throw Error('密钥格式异常，请重新设置密钥。');
  if(!this.encryption.available())throw Error('当前系统无法解密密钥，请在原 Windows 用户账户运行。');
  return this.encryption.decrypt(Buffer.from(value.slice(10),'base64'));
 }
 set(key,value){
  this.validate(key);
  if(typeof value!=='string'||Buffer.byteLength(value,'utf8')>25*1024*1024)throw Error('存储内容过大或无效');
  let stored=value;
  if(key===SECRET){
   if(!this.encryption.available())throw Error('系统密钥加密不可用，未以明文保存。');
   stored='encrypted:'+this.encryption.encrypt(value).toString('base64');
  }
  const next=Object.assign(Object.create(null),this.values,{[key]:stored});
  this.write(next);this.values=next;
 }
 remove(key){
  this.validate(key);
  const next=Object.assign(Object.create(null),this.values);delete next[key];
  this.write(next);this.values=next;
 }
 write(values){
  const payload=JSON.stringify({version:1,values},null,2);
  if(Buffer.byteLength(payload)>50*1024*1024)throw Error('本地数据库超过 50 MB，请导出归档。');
  const backups=path.join(this.directory,'backups');
  fs.mkdirSync(backups,{recursive:true});
  const date=new Date(),pad=n=>String(n).padStart(2,'0');
  const day=`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
  const backup=path.join(backups,`wort-${day}.json`);
  // Keep the previous on-disk state once per local day; never back up plaintext keys.
  if(fs.existsSync(this.file)&&!fs.existsSync(backup))fs.copyFileSync(this.file,backup,fs.constants.COPYFILE_EXCL);
  const temp=path.join(this.directory,'wort-store.tmp');
  const fd=fs.openSync(temp,'w',0o600);
  try{fs.writeFileSync(fd,payload,'utf8');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  fs.renameSync(temp,this.file);
  const old=fs.readdirSync(backups).filter(f=>/^wort-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  for(const name of old.slice(0,Math.max(0,old.length-30)))fs.unlinkSync(path.join(backups,name));
 }
}
module.exports={LocalStore,KEYS,SECRET};
