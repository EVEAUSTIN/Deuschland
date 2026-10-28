'use strict';
function validateRequest(request,settingsText){
 if(!request||typeof request.requestId!=='string'||request.requestId.length>100)throw Error('请求标识无效');
 if(typeof request.key!=='string'||request.key.length>8192||/[\r\n]/.test(request.key))throw Error('密钥格式无效');
 let url,settings,endpoint;
 try{
  settings=JSON.parse(settingsText);
  url=new URL(request.url);endpoint=new URL(settings.endpoint);
 }catch{throw Error('请先保存 API 服务设置。');}
 for(const value of [url,endpoint]){
  if(value.protocol!=='https:'||value.username||value.password||value.hash||value.search)throw Error('只允许无查询参数的 HTTPS API 地址。');
 }
 const method=request.body?'POST':'GET';
 const models=new URL(endpoint.href);
 models.pathname=models.pathname.replace(/\/chat\/completions\/?$/,'/models');
 if(url.href!==(method==='POST'?endpoint.href:models.href))throw Error('API 地址与已保存服务不一致，请先保存设置。');
 if(request.body&&(typeof request.body!=='object'||typeof request.body.model!=='string'
  ||!Array.isArray(request.body.messages)||request.body.stream!==false))throw Error('AI 请求格式无效');
 if(request.body&&Buffer.byteLength(JSON.stringify(request.body))>2*1024*1024)throw Error('请求内容过大');
 return {url:url.href,method,timeout:Math.min(180000,Math.max(1000,Number(request.timeout)||180000))};
}
async function readLimited(response,limit=8*1024*1024){
 if(!response.body)return '';
 const reader=response.body.getReader();const chunks=[];let count=0;
 try{
  while(true){
   const {done,value}=await reader.read();if(done)break;
   count+=value.byteLength;
   if(count>limit){await reader.cancel();throw Error('API 回答超过 8 MB 限制');}
   chunks.push(Buffer.from(value));
  }
 }finally{reader.releaseLock();}
 return Buffer.concat(chunks).toString('utf8');
}
module.exports={validateRequest,readLimited};
