'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const G=require('../grammar');
const noun=(id,extra={})=>({id,category:'word',pos:'noun',nounKind:'regular',singular:'Buch',plural:'Bücher',...extra});
function rng(seed=123456){
 return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed+1)/4294967297;};
}
test('noun forms must be complete; unchanged plurals and multiple accepted forms work',()=>{
 assert(G.complete(noun('a')));assert(!G.complete(noun('a',{plural:'-er'})));
 assert(!G.complete(noun('a',{plural:'kein Plural'})));
 assert(G.complete(noun('a',{singular:'Mädchen',plural:'Mädchen'})));
 assert(G.matches('die Bücher','Bücher'));assert(!G.matches('Bucher','Bücher'));
 assert(!G.matches('bücher','Bücher'));assert(G.matches('Worte','Wörter; Worte'));
 assert(G.matches('Wörter / Worte','Wörter; Worte'));assert(!G.matches('Wörter; Mist','Wörter; Worte'));
 assert.equal(G.inferSingular('das Buch, Bücher'),'Buch');
});
test('uncountable, plural-only, missing forms, phrases and non-nouns are excluded',()=>{
 const mass=noun('m',{nounKind:'uncountable',singular:'Milch',plural:'无复数'});
 const pluralOnly=noun('p',{nounKind:'pluralOnly',singular:'',plural:'Eltern'});
 assert(G.complete(mass));assert(G.complete(pluralOnly));
 for(const word of [mass,pluralOnly,noun('a',{plural:''}),noun('a',{category:'phrase'}),noun('a',{pos:'verb'})])assert(!G.eligible(word));
 assert(G.eligible(noun('n')));
 assert.throws(()=>G.validate({pos:''}));assert.throws(()=>G.validate({pos:'noun',singular:'Buch',plural:'-er'}));
});
test('frequent draws reduce weight; recent errors increase it; later correct answers remove old boosts',()=>{
 const fresh=noun('n'),frequent=noun('f',{nounStats:{draws:100,recent:[]}});
 assert(G.weight(frequent)<G.weight(fresh));
 let bad={draws:20,attempts:8,errors:8,recent:Array(8).fill(false)};
 const good={...bad,errors:0,recent:Array(8).fill(true)};
 assert(G.weight(noun('bad',{nounStats:bad}))>G.weight(noun('good',{nounStats:good})));
 const initial=G.weight(noun('bad',{nounStats:bad}));
 for(let i=0;i<8;i++)bad=G.recordAttempt(bad,true);
 const recovered=G.weight(noun('bad',{nounStats:bad}));
 assert(recovered<initial);assert.equal(recovered,G.weight(noun('good',{nounStats:good})));
 assert.equal(bad.errors,8,'Lifetime errors remain available for sorting');
});
test('weighted random sampling changes observed frequency and never repeats within a round',()=>{
 const random=rng(),fresh=noun('new'),frequent=noun('often',{nounStats:{draws:100,recent:[]}});
 let count=0;
 for(let i=0;i<5000;i++)if(G.sample([fresh,frequent],1,random)[0].id==='new')count++;
 assert(count>4500,'Rarely practised words should appear more often');
 const error=noun('error',{nounStats:{draws:10,recent:Array(8).fill(false)}});
 const mastered=noun('mastered',{nounStats:{draws:10,recent:Array(8).fill(true)}});
 let errors=0;
 for(let i=0;i<5000;i++)if(G.sample([error,mastered],1,random)[0].id==='error')errors++;
 assert(errors>4000,'Recent mistakes should increase appearances');
 const selected=G.sample(Array.from({length:50},(_,i)=>noun(String(i))),20,random);
 assert.equal(selected.length,20);assert.equal(new Set(selected.map(x=>x.id)).size,20);
 assert.notDeepEqual(selected.map(x=>x.id),Array.from({length:20},(_,i)=>String(i)));
});
test('legacy metadata and practice statistics survive normalisation without changing content',()=>{
 assert.equal(G.metadata({}).pos,'');assert.deepEqual(G.metadata({}).nounStats,G.emptyStats());
 const m=G.metadata({...noun('book'),nounStats:{draws:9,attempts:12,errors:4,recent:[false,true]}});
 assert.equal(m.nounStats.draws,9);assert.equal(m.plural,'Bücher');
 assert.throws(()=>G.metadata({pos:'not-a-part-of-speech'}));
});
test('irrelevant noun fields on non-noun AI rows are ignored instead of preventing completion',()=>{
 const meta=G.validate({pos:'verb',nounKind:'none',singular:null,plural:null});
 assert.equal(meta.pos,'verb');assert.equal(meta.singular,'');assert.equal(meta.plural,'');
 assert.equal(meta.nounKind,'regular');
});
