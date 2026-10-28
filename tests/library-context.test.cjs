'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {build}=require('../library-context');
function word(i){return {id:'internal-id-'+i,de:'Wort '+i,zh:'含义 '+i,note:'Ein Beispiel.',category:'word',
 addedOn:'2026-10-28',dz:{level:2},zd:{level:4},mistakes:i,createdAt:i,apiKey:'never-send-this'};}
test('a normal 105-word library is fully included with only learning fields',()=>{
 const words=Array.from({length:105},(_,i)=>word(i));
 const context=build(words,'请用我的词库出语法题');
 assert.equal(context.total,105);assert.equal(context.included,105);assert.equal(context.omitted,0);
 assert.equal(context.entries[0].level,3);
 assert(!context.text.includes('internal-id-'));assert(!context.text.includes('never-send-this'));
 assert(!context.text.includes('apiKey'));
 assert.equal(words[0].note,'Ein Beispiel.');
});
test('an oversized library is bounded and reports omissions; question-related words rank first',()=>{
 const words=Array.from({length:1000},(_,i)=>({...word(i),note:'长例句'.repeat(250)}));
 words[0].de='die Entscheidung';
 const context=build(words,'请用 Entscheidung 出题',3000);
 assert(context.text.length<=3000);assert(context.omitted>0);assert(context.notesShortened);
 assert.equal(context.entries[0].de,'die Entscheidung');
 assert(context.entries.every(entry=>!entry.note||entry.note.length<=300));
 assert.equal(context.total,context.included+context.omitted);
 assert.equal(words[0].note.length,750);
});
test('German and Chinese main meanings stay intact, even when notes are shortened',()=>{
 const entry={...word(0),de:'Ein langer Satz '.repeat(40),zh:'完整释义'.repeat(100),note:'长笔记'.repeat(200)};
 const context=build([entry]);
 assert.equal(context.entries[0].de,entry.de);assert.equal(context.entries[0].zh,entry.zh);
 assert.equal(context.entries[0].noteTruncated,true);
});
test('an empty library is explicit and the payload is valid JSON',()=>{
 const context=build([]);assert.deepEqual(JSON.parse(context.text).entries,[]);
 assert.equal(context.total,0);assert.equal(context.included,0);assert.equal(context.omitted,0);
 assert.throws(()=>build(null));
});
