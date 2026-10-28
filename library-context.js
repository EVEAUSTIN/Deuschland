/* Shared browser/desktop helper: build a fresh, bounded, data-only word-library snapshot. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.WortLibraryContext=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const DEFAULT_LIMIT=60000;
 const NOTE_LIMIT=300;
 function score(word,question){
  const query=String(question||'').normalize('NFKC').toLocaleLowerCase();
  const german=word.de.normalize('NFKC').toLocaleLowerCase();
  const base=german.replace(/^(der|die|das)\s+/,'').split(/[,;（(]/)[0].trim();
  let result=0;
  if(base.length>1&&query.includes(base))result+=20;
  if(word.zh.length>1&&query.includes(word.zh.toLocaleLowerCase()))result+=10;
  for(const token of query.match(/[\p{L}]{3,}/gu)||[]){
   if(german.includes(token)||word.zh.includes(token))result+=2;
  }
  return result;
 }
 function build(words,question='',maxCharacters=DEFAULT_LIMIT){
  if(!Array.isArray(words)||!Number.isInteger(maxCharacters)||maxCharacters<512)throw Error('词库上下文参数无效');
  // Whitelist learning fields only: API settings, keys, identifiers and history are not sent.
  const candidates=words.map((word,index)=>({word,index,score:score(word,question)}))
   .sort((a,b)=>b.score-a.score||(b.word.mistakes||0)-(a.word.mistakes||0)
    ||(b.word.createdAt||0)-(a.word.createdAt||0)||a.index-b.index);
  const entries=[];let used=512;
  for(const {word}of candidates){
   const note=String(word.note||'');
   const entry={de:word.de,zh:word.zh,category:word.category||'word',
    date:word.addedOn||null,level:((word.dz?.level||0)+(word.zd?.level||0))/2,
    mistakes:word.mistakes||0};
   if(word.pos)entry.pos=word.pos;
   if(word.pos==='noun'){entry.singular=word.singular||'';entry.plural=word.plural||'';entry.nounKind=word.nounKind||'regular';}
   if(note){entry.note=note.slice(0,NOTE_LIMIT);if(note.length>NOTE_LIMIT)entry.noteTruncated=true;}
   const length=JSON.stringify(entry).length+1;
   if(used+length>maxCharacters)continue;
   entries.push(entry);used+=length;
  }
  const payload={total:words.length,included:entries.length,omitted:words.length-entries.length,
   notesShortened:entries.some(entry=>entry.noteTruncated),entries};
  // Keep the advertised bound even if counts grow to many digits.
  let text=JSON.stringify(payload);
  while(text.length>maxCharacters&&entries.length){
   entries.pop();payload.included=entries.length;payload.omitted=words.length-entries.length;
   payload.notesShortened=entries.some(entry=>entry.noteTruncated);text=JSON.stringify(payload);
  }
  return {...payload,text};
 }
 return Object.freeze({build,DEFAULT_LIMIT,NOTE_LIMIT});
});
