'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validateRequest,readLimited}=require('../desktop/network.cjs');
const settings=JSON.stringify({endpoint:'https://api.deepseek.com/chat/completions'});
const request={requestId:'123',url:'https://api.deepseek.com/chat/completions',key:'test-key',timeout:900000,
 body:{model:'deepseek-chat',messages:[{role:'user',content:'Hallo'}],stream:false}};
test('native request is constrained to the configured HTTPS provider',()=>{
 assert.equal(validateRequest(request,settings).timeout,180000);
 assert.throws(()=>validateRequest({...request,url:'http://api.deepseek.com/chat/completions'},settings));
 assert.throws(()=>validateRequest({...request,url:'https://other.example/chat/completions'},settings));
 assert.throws(()=>validateRequest({...request,key:'secret\r\nInjected: header'},settings));
 assert.equal(validateRequest({...request,url:'https://api.deepseek.com/models',body:null},settings).method,'GET');
});
test('native response reader enforces size limits',async()=>{
 assert.equal(await readLimited(new Response('{"ok":true}')),'{"ok":true}');
 await assert.rejects(readLimited(new Response('123456789'),4),/8 MB/);
});
