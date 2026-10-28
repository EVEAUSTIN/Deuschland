'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((request,response)=>{
  const name=new URL(request.url,'http://localhost').pathname;
  const target=path.resolve(ROOT,'.'+(name==='/'?'/index.html':name));
  if(!target.startsWith(ROOT+path.sep)||!fs.existsSync(target)||!fs.statSync(target).isFile()){
   response.writeHead(404);response.end();return;
  }
  const extension=path.extname(target);
  response.setHeader('Content-Type',extension==='.js'?'text/javascript':extension==='.css'?'text/css':'text/html');
  response.end(fs.readFileSync(target));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}`;
 let browser;
 try{
  browser=await chromium.launch({headless:true,
   ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),
   args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://api.deepseek.com/**',route=>{
   const messages=route.request().postDataJSON()?.messages||[];
   const isLookup=messages[0]?.content.includes('词典助手');
   const content=isLookup?JSON.stringify({de:'eine (Artikel)',zh:'一个',note:'eine Frau — 一位女士',category:'word'}):
    '### 2. `nicht`：否定\n- **Er arbeitet nicht.**\n  - 他不工作。\n\n| 时态 | 构成 | 例句 |\n|---|---|---|\n| **Präsens** | 现在时 | `Ich lese ein Buch.` |\n| Perfekt | haben / sein | 过去的动作 |';
   return route.fulfill({json:{choices:[{message:{content}}]}});
  });
  await page.goto(url);await page.locator('#appVersion').waitFor();
  await page.click('[data-page="ai"]');
  await page.fill('#apiKey','test-only-key');
  await page.fill('#chatQuestion','解释 nicht');await page.click('#sendChat');
  await page.locator('#chat .markdown table').waitFor();
  assert.equal(await page.locator('#chat .markdown h3').textContent(),'2. nicht：否定');
  assert.equal(await page.locator('#chat .markdown ul ul').count(),1);
  assert.equal(await page.locator('#chat .markdown tbody strong').textContent(),'Präsens');
  await page.locator('.answer-tools button').nth(1).click();
  assert((await page.locator('.raw-answer').textContent()).includes('**Präsens**'));
  await page.locator('.answer-tools button').nth(1).click();
  await page.click('[data-page="words"]');await page.locator('#lookupPanel summary').click();
  await page.fill('#lookupText','eine');await page.click('#lookupAI');
  await page.waitForFunction(()=>document.getElementById('lookupZh').value==='一个');
  await page.fill('#lookupText','eine');await page.fill('#lookupZh','一；一个');
  assert.equal(await page.inputValue('#lookupNote'),'eine Frau — 一位女士');
  await page.click('#collectLookup');
  await page.reload();await page.click('[data-page="words"]');
  assert.equal(await page.locator('.entry strong').textContent(),'eine');
  assert.equal(await page.locator('.entry p').first().textContent(),'一；一个');
  await page.click('[data-page="ai"]');
  await page.fill('#chatQuestion','解释时态');await page.click('#sendChat');
  await page.locator('#chat .markdown table').waitFor();
  fs.mkdirSync(path.join(ROOT,'.test-results'),{recursive:true});
  await page.screenshot({path:path.join(ROOT,'.test-results/markdown-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  const widths=await page.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:innerWidth,
   table:document.querySelector('.md-table').scrollWidth,wrap:document.querySelector('.md-table').clientWidth}));
  assert(widths.page<=widths.viewport+1,JSON.stringify(widths));
  assert(widths.table>widths.wrap,'Mobile table should scroll horizontally');
  await page.screenshot({path:path.join(ROOT,'.test-results/markdown-mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS: actual Chromium + CSP + local Markdown assets + lookup edits/persistence + responsive tables. Screenshots: .test-results/');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
