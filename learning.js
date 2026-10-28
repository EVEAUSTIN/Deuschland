/* Browser and Node share the same local-calendar scheduling rules. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.WortLearning=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const DAYS=[0,1,3,7,14,30,30];
 function startOfDay(timestamp){
  const date=new Date(timestamp);
  date.setHours(0,0,0,0);
  return date.getTime();
 }
 function nextDue(level,timestamp=Date.now()){
  if(!Number.isInteger(level)||level<0||level>6||!Number.isFinite(timestamp))throw Error('复习阶段或时间无效');
  if(level===0)return timestamp+10*60*1000;
  const date=new Date(timestamp);
  date.setHours(0,0,0,0);
  date.setDate(date.getDate()+DAYS[level]);
  return date.getTime();
 }
 function migrateDue(level,due){
  return level>0&&due>0?startOfDay(due):due;
 }
 return Object.freeze({DAYS,nextDue,startOfDay,migrateDue});
});
