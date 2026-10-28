'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const learning=require('../learning');
function inTimezone(zone,code){
 const script=`const assert=require('node:assert/strict');const L=require(${JSON.stringify(require.resolve('../learning'))});${code}`;
 const result=spawnSync(process.execPath,['-e',script],{env:{...process.env,TZ:zone},encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
}
test('10-minute relearning uses elapsed time; midnight does not truncate it',()=>{
 const now=new Date(2026,9,28,23,58).getTime();
 assert.equal(learning.nextDue(0,now)-now,600000);
});
test('1/3/7/14/30 days are local calendar dates at midnight',()=>{
 inTimezone('Asia/Shanghai',`
  const now=new Date(2026,9,28,23,58).getTime();
  for(const [level,days] of [[1,1],[2,3],[3,7],[4,14],[5,30],[6,30]]){
   const expected=new Date(2026,9,28+days,0,0,0,0).getTime();
   assert.equal(L.nextDue(level,now),expected);
  }
  assert.equal(L.nextDue(1,now)-now,120000);
 `);
});
test('calendar dates survive DST transitions in both directions',()=>{
 inTimezone('Europe/Berlin',`
  for(const now of [new Date(2026,2,28,23,30),new Date(2026,9,24,23,30)]){
   const due=new Date(L.nextDue(2,now.getTime()));
   const expected=new Date(now);expected.setHours(0,0,0,0);expected.setDate(expected.getDate()+3);
   assert.equal(due.getTime(),expected.getTime());assert.equal(due.getHours(),0);
  }
 `);
});
test('legacy long intervals migrate to midnight while 10-minute due stays intact',()=>{
 const old=new Date(2026,9,30,21,45).getTime();
 assert.equal(learning.migrateDue(2,old),new Date(2026,9,30).getTime());
 assert.equal(learning.migrateDue(0,old),old);
 assert.throws(()=>learning.nextDue(9,old));
});
