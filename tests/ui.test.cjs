'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM,requestInterceptor,VirtualConsole}=require('jsdom');
const ROOT=path.resolve(__dirname,'..');
const word=(id,de='das Buch',zh='书')=>({id,de,zh,note:'例句',category:'word',addedOn:null,
 dz:{level:0,due:0},zd:{level:0,due:0},aliases:'',createdAt:0,order:1,mistakes:0,attempts:0,lastError:0});
async function dom(t,words=[],preferences={}){
 const errors=[];
 const virtualConsole=new VirtualConsole();
 virtualConsole.on('jsdomError',e=>errors.push(e.message));
 const window=new JSDOM(fs.readFileSync(path.join(ROOT,'index.html'),'utf8'),{
  url:'https://example.org/index.html',runScripts:'dangerously',resources:{interceptors:[requestInterceptor(request=>{
   const target=path.join(ROOT,new URL(request.url).pathname);
   return new Response(fs.readFileSync(target),{headers:{'Content-Type':target.endsWith('.css')?'text/css':'text/javascript'}});
  })]},virtualConsole,
  beforeParse(w){
   w.alert=()=>{};w.confirm=()=>true;w.HTMLElement.prototype.scrollIntoView=()=>{};
   w.localStorage.setItem('wort-simple-v1',JSON.stringify({words,history:[]}));
   for(const [key,value]of Object.entries(preferences))w.localStorage.setItem(key,value);
  }
 });
 await new Promise((resolve,reject)=>{
  window.window.addEventListener('load',resolve,{once:true});setTimeout(()=>reject(Error('DOM load timeout')),5000).unref();
 });
 t.after(()=>{window.window.close();assert.deepEqual(errors,[]);});
 return window.window;
}
function config(w){w.document.getElementById('apiKey').value='test-only-key';}
function reply(text){return {ok:true,json:async()=>({choices:[{message:{content:text}}]})};}
test('lookup edits preserve Chinese, examples, classification and date before saving',async t=>{
 const w=await dom(t),$=id=>w.document.getElementById(id);config(w);
 w.fetch=async()=>reply(JSON.stringify({de:'eine (Artikel)',zh:'一个',note:'eine Frau — 一位女士',category:'word'}));
 $('lookupText').value='eine';await $('lookupForm').onsubmit({preventDefault(){}});
 $('lookupText').value='eine';$('lookupText').dispatchEvent(new w.Event('input'));
 assert.equal($('lookupZh').value,'一个');assert.equal($('lookupNote').value,'eine Frau — 一位女士');
 $('lookupZh').value='一；一个';$('collectLookup').click();
 const stored=JSON.parse(w.localStorage.getItem('wort-simple-v1'));
 assert.equal(stored.words[0].de,'eine');assert.equal(stored.words[0].zh,'一；一个');
});
test('an AI result cannot overwrite a draft edited while the request is pending',async t=>{
 const w=await dom(t),$=id=>w.document.getElementById(id);config(w);let resolve;
 w.fetch=()=>new Promise(r=>resolve=r);
 $('lookupText').value='Hallo';
 const running=$('lookupForm').onsubmit({preventDefault(){}});
 $('lookupZh').value='我正在修改的释义';$('lookupZh').dispatchEvent(new w.Event('input'));
 resolve(reply(JSON.stringify({de:'Hallo',zh:'你好',note:'例句',category:'word'})));
 await running;
 assert.equal($('lookupZh').value,'我正在修改的释义');
 assert(!$('applyLookupResponse').classList.contains('hide'));
 $('applyLookupResponse').click();assert.equal($('lookupZh').value,'你好');
});
test('GFM headings, nested lists, tables, emphasis and code render without unsafe HTML',async t=>{
 const w=await dom(t),box=w.document.createElement('div');
 w.renderMarkdown(box,'```markdown\n### 2. `nicht`：否定\n- **Er arbeitet nicht.**\n  - 他不工作。\n\n| 时态 | 例句 |\n|---|---|\n| **Präsens** | `Ich lese ein Buch.` |\n\n> 每天一点\n```');
 assert.equal(box.querySelector('h3').textContent,'2. nicht：否定');
 assert.equal(box.querySelectorAll('ul').length,2);
 assert.equal(box.querySelector('th').textContent,'时态');
 assert.equal(box.querySelector('tbody strong').textContent,'Präsens');
 assert(box.querySelector('.md-table'));assert(box.querySelector('blockquote'));
 w.renderMarkdown(box,'<script>alert(1)</script><img src=x onerror=alert(1)>\n\n[恶意](javascript:alert(1))\n\n[词典](https://www.dwds.de/)');
 assert.equal(box.querySelectorAll('script,img,iframe,style').length,0);
 assert.equal(box.querySelector('a[href^="javascript:"]'),null);
 assert.equal(box.querySelector('a[href^="https:"]').rel,'noopener noreferrer');
});
test('real chat handler renders a mocked DeepSeek response and toggles raw text',async t=>{
 const w=await dom(t),$=id=>w.document.getElementById(id);config(w);
 w.fetch=async()=>reply('### 语法\n**正确**\n\n| A | B |\n|---|---|\n| a | b |');
 $('chatQuestion').value='解释语法';await $('chatForm').onsubmit({preventDefault(){}});
 assert($('chat').querySelector('.markdown h3'));assert($('chat').querySelector('table'));
 const toggle=$('chat').querySelectorAll('.answer-tools button')[1];
 toggle.click();assert($('chat').querySelector('.raw-answer').textContent.includes('**正确**'));
 toggle.click();assert($('chat').querySelector('table'));
});
test('legacy imports migrate long due dates while preserving unknown dates and counts',async t=>{
 const entry=word('old');entry.dz={level:2,due:new Date(2026,9,30,21,30).getTime()};
 const w=await dom(t,[entry]);
 const current=w.eval('data.words[0]');
 assert.equal(new Date(current.dz.due).getHours(),0);
 assert.equal(current.addedOn,null);assert.equal(current.id,'old');
});
test('random rounds use 1–2 distinct modes per word; wrong tasks return until passed',async t=>{
 const entries=Array.from({length:25},(_,i)=>word('id'+i,['der Baum','die Katze','das Buch'][i%3],'含义'+i));
 const w=await dom(t,entries);w.beginSession('random');
 const initial=w.eval('round');assert.equal(initial.totalWords,20);
 for(const p of initial.plans.values())assert(p.required.size>=1&&p.required.size<=2);
 w.eval('answerLocked=true');w.grade(false);
 let remaining=100;
 while(w.eval('round')&&remaining--){w.eval('answerLocked=true');w.grade(true);}
 assert(remaining>0);const summary=w.eval('lastSummary');
 assert.equal(summary.finished,true);assert.equal(summary.errors.length,1);
 assert.equal(summary.errors[0].count,1);assert.equal(summary.completedWords,20);
 assert(w.eval('data.words.every(w=>w.dz.due===0&&w.zd.due===0)'));
});
test('new-word review first waits 10 minutes, then uses the next local midnight',async t=>{
 const w=await dom(t,[word('new')]);
 const now=new Date(2026,9,28,23,45).getTime();
 w.eval(`Date.now=()=>${now}`);
 w.document.getElementById('practiceMode').value='dz';
 w.beginSession('review');w.eval('answerLocked=true');w.grade(true);
 assert.equal(w.eval('data.words[0].dz.due'),now+600000);
 assert.equal(w.eval('data.words[0].shortReviewPending'),false);
 w.eval(`Date.now=()=>${now+600000}`);
 w.beginSession('review');w.eval('answerLocked=true');w.grade(true);
 assert.equal(w.eval('data.words[0].dz.level'),1);
 assert.equal(w.eval('data.words[0].dz.due'),new Date(2026,9,29).getTime());
});
test('chat sends a fresh word-library snapshot each time, not stale snapshots in history',async t=>{
 const w=await dom(t,[word('first','das Buch','书')]),$=id=>w.document.getElementById(id);config(w);
 const requests=[];
 w.fetch=async(_url,options)=>{requests.push(JSON.parse(options.body));return reply('请翻译：Ich lese ein Buch.');};
 $('chatQuestion').value='用我的词库出语法题';await $('chatForm').onsubmit({preventDefault(){}});
 let messages=requests[0].messages;
 assert(messages.some(message=>message.content.includes('"de":"das Buch"')));
 assert(!w.eval('JSON.stringify(chat)').includes('最新词库快照'));
 // Simulate another window editing/deleting/importing while the old in-memory library is unchanged.
 w.localStorage.setItem('wort-simple-v1',JSON.stringify({words:[word('second','die Katze','猫')],history:[]}));
 $('chatQuestion').value='现在用我最新的词库出题';await $('chatForm').onsubmit({preventDefault(){}});
 const snapshots=requests[1].messages.filter(message=>message.content.includes('以下为本次请求的最新词库快照 JSON'));
 assert.equal(snapshots.length,1);assert(snapshots[0].content.includes('die Katze'));
 assert(!snapshots[0].content.includes('das Buch'));
 assert($('libraryContextStatus').textContent.includes('1 条'));
 assert.equal(requests[1].messages.at(-1).content,'现在用我最新的词库出题');
});
test('turning library sharing off omits snapshots and persists across restarts',async t=>{
 const w=await dom(t,[word('first','das Buch','书')]),$=id=>w.document.getElementById(id);config(w);
 let request;
 w.fetch=async(_url,options)=>{request=JSON.parse(options.body);return reply('普通语法回答');};
 $('shareLibrary').checked=false;$('shareLibrary').dispatchEvent(new w.Event('change'));
 assert.equal(w.localStorage.getItem('wort-ai-library-enabled-v1'),'false');
 $('chatQuestion').value='解释第三格';await $('chatForm').onsubmit({preventDefault(){}});
 assert(!request.messages.some(message=>message.content.includes('"de":"das Buch"')));
 assert(!request.messages.some(message=>message.content.includes('以下为本次请求的最新词库快照 JSON')));
 assert($('libraryContextStatus').textContent.includes('已关闭'));
 const restarted=await dom(t,[word('first')],{'wort-ai-library-enabled-v1':'false'});
 assert.equal(restarted.document.getElementById('shareLibrary').checked,false);
});
test('empty and truncated library states are visible, and quick grammar prompt does not auto-send',async t=>{
 const w=await dom(t),$=id=>w.document.getElementById(id);
 assert($('libraryContextStatus').textContent.includes('为空'));
 $('grammarFromLibrary').click();
 assert($('chatQuestion').value.includes('先出题'));assert.equal($('chat').children.length,0);
 const words=Array.from({length:600},(_,i)=>({...word('id'+i,'Wort '+i,'含义'+i),note:'很长的例句'.repeat(100)}));
 w.localStorage.setItem('wort-simple-v1',JSON.stringify({words,history:[]}));w.updateLibraryContextStatus();
 assert($('libraryContextStatus').textContent.includes('未附带'));assert($('libraryContextStatus').textContent.includes('截短'));
});
