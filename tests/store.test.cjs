'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {LocalStore,SECRET}=require('../desktop/store.cjs');
// Test adapter deliberately differs from production OS encryption.
const encryption={available:()=>true,encrypt:s=>Buffer.from(s).reverse(),decrypt:b=>Buffer.from(b).reverse().toString()};
function temp(){return fs.mkdtempSync(path.join(os.tmpdir(),'wort-store-test-'));}
test('disk data survives restart; keys are encrypted and a prior-state backup exists',t=>{
 const dir=temp();t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const store=new LocalStore(dir,encryption);
 const value=JSON.stringify({words:[{de:'das Buch'}],history:[]});
 store.set('wort-simple-v1',value);
 store.set(SECRET,JSON.stringify({key:'test-secret-never-plaintext'}));
 assert(!fs.readFileSync(store.file,'utf8').includes('test-secret-never-plaintext'));
 const restarted=new LocalStore(dir,encryption);
 assert.equal(restarted.get('wort-simple-v1'),value);
 assert.equal(JSON.parse(restarted.get(SECRET)).key,'test-secret-never-plaintext');
 assert.equal(fs.readdirSync(path.join(dir,'backups')).length,1);
 assert.throws(()=>store.set('__proto__','bad'));
 restarted.remove(SECRET);assert.equal(restarted.get(SECRET),null);
});
test('corrupt disk data and unavailable encryption fail closed without overwrite',t=>{
 const dir=temp();t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'wort-store.json');fs.writeFileSync(file,'broken');
 assert.throws(()=>new LocalStore(dir,encryption));assert.equal(fs.readFileSync(file,'utf8'),'broken');
 fs.unlinkSync(file);
 const store=new LocalStore(dir,{available:()=>false});
 assert.throws(()=>store.set(SECRET,'secret'));
 assert.equal(fs.existsSync(file),false);
});
