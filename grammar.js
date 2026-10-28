/* Noun metadata, answer checks and frequency/accuracy-weighted sampling. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.WortGrammar=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const POS={noun:'名词',verb:'动词',adjective:'形容词',adverb:'副词',pronoun:'代词',
  article:'冠词',preposition:'介词',conjunction:'连词',numeral:'数词',interjection:'感叹词',particle:'小品词',other:'其他／固定表达'};
 const KINDS={regular:'普通名词（有单复数）',uncountable:'无复数形式',pluralOnly:'仅复数（无单数）'};
 function clean(text){
  return String(text||'').normalize('NFC').trim().replace(/\s+/g,' ').replace(/[。.!?！？]+$/u,'');
 }
 function bare(text){return clean(text).replace(/^(?:der|die|das|ein|eine)\s+/i,'').trim();}
 function forms(text){return String(text||'').split(/[,;/；、\n]+/).map(bare).filter(Boolean);}
 function inferSingular(text){return bare(String(text||'').split(/[,;（(]/)[0]);}
 function fullForms(text){
  const list=forms(text);
  return list.length>0&&list.every(form=>/[a-zäöüß]/i.test(form)&&!/^[-+¨̈]/u.test(form)
   &&!/^(?:kein(?:e[nr]?)?\s+(?:Plural|Mehrzahl)|ohne\s+Plural|nur\s+Plural|no\s+plural|nicht\s+vorhanden)$/i.test(form)
   &&!['unknown','n/a','none','null'].includes(form.toLowerCase()));
 }
 function emptyStats(){return {draws:0,attempts:0,errors:0,recent:[]};}
 function normalizeStats(raw){
  if(raw===undefined||raw===null)return emptyStats();
  if(typeof raw!=='object')throw Error('名词练习统计格式无效');
  const result=emptyStats();
  for(const key of ['draws','attempts','errors']){
   if(raw[key]!==undefined&&(!Number.isSafeInteger(raw[key])||raw[key]<0))throw Error('名词练习次数无效');
   result[key]=raw[key]||0;
  }
  if(raw.recent!==undefined&&(!Array.isArray(raw.recent)||!raw.recent.every(x=>typeof x==='boolean')))throw Error('名词练习正确率格式无效');
  result.recent=(raw.recent||[]).slice(-8);
  return result;
 }
 function metadata(raw){
  const pos=raw.pos===undefined?'':raw.pos;
  if(typeof pos!=='string'||(pos&&!Object.hasOwn(POS,pos)))throw Error('词性格式无效');
  const nounKind=pos==='noun'?(raw.nounKind||'regular'):'regular';
  if(!Object.hasOwn(KINDS,nounKind))throw Error('名词类型无效');
  for(const key of ['singular','plural']){
   if(pos==='noun'&&raw[key]!=null&&(typeof raw[key]!=='string'||raw[key].length>2000))throw Error('名词单复数格式无效');
  }
  return {pos,nounKind:pos==='noun'?nounKind:'regular',
   singular:pos==='noun'?clean(raw.singular):'',plural:pos==='noun'?clean(raw.plural):'',
   nounStats:normalizeStats(raw.nounStats)};
 }
 function complete(raw){
  try{
   const m=metadata(raw);
   if(!m.pos)return false;
   if(m.pos!=='noun')return true;
   if(m.nounKind==='uncountable')return fullForms(m.singular)&&m.plural==='无复数';
   if(m.nounKind==='pluralOnly')return !m.singular&&fullForms(m.plural);
   return fullForms(m.singular)&&fullForms(m.plural);
  }catch{return false;}
 }
 function validate(raw){
  const m=metadata(raw);
  if(!m.pos)throw Error('请选择词性。');
  if(!complete(m))throw Error('请补全名词的完整单数和复数（如 Buch / Bücher，不要只填 -er）。无复数或仅复数名词请选择相应类型。');
  return m;
 }
 function eligible(word){
  return word.category==='word'&&word.pos==='noun'&&(word.nounKind||'regular')==='regular'&&complete(word);
 }
 function matches(answer,expected){
  const submitted=forms(answer),accepted=forms(expected);
  return submitted.length>0&&submitted.every(value=>accepted.includes(value));
 }
 function weight(word){
  const stats=normalizeStats(word.nounStats);
  const recent=stats.recent;
  // More recent answers matter more. Eight later correct attempts remove old error boosts.
  let failures=0,total=0;
  recent.forEach((correct,index)=>{const w=index+1;total+=w;if(!correct)failures+=w;});
  const rate=total?failures/total:0;
  return (1+5*rate)/Math.pow(1+stats.draws,0.7);
 }
 function randomUnit(){
  const a=new Uint32Array(1);globalThis.crypto.getRandomValues(a);
  return (a[0]+1)/4294967297;
 }
 function sample(words,count=20,random=randomUnit){
  return words.map(word=>{
   const value=random();
   if(!(value>0&&value<1))throw Error('随机数必须在 0 和 1 之间');
   // Exponential-race sampling: weighted, without replacement, not input-order sampling.
   return {word,key:-Math.log(value)/weight(word)};
  }).sort((a,b)=>a.key-b.key).slice(0,Math.max(0,count)).map(item=>item.word);
 }
 function recordAttempt(raw,correct){
  const stats=normalizeStats(raw);stats.attempts++;if(!correct)stats.errors++;
  stats.recent=[...stats.recent,!!correct].slice(-8);return stats;
 }
 function signature(word){
  return JSON.stringify([word.de,word.zh,word.category,word.note,word.pos||'',word.nounKind||'regular',word.singular||'',word.plural||'']);
 }
 return Object.freeze({POS,KINDS,clean,bare,forms,inferSingular,emptyStats,normalizeStats,metadata,
  complete,validate,eligible,matches,weight,sample,recordAttempt,signature});
});
