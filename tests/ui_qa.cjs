const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),out=path.join(root,'qa-screenshots');
fs.mkdirSync(out,{recursive:true});
const tmpDb=fs.mkdtempSync(path.join(os.tmpdir(),'rag-ollama-test-'));
const worker=spawn('python',['server.py'],{cwd:root,stdio:'pipe',env:{...process.env,RAG_OLLAMA_DATA_DIR:tmpDb}});
async function ready(){for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:8775')).ok)return}catch(e){}await new Promise(r=>setTimeout(r,150));}throw Error('local RAG server did not start');}
(async()=>{
 await ready();const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
 for(const [w,h] of [[1280,720],[1024,768],[720,750]]){
  const page=await browser.newPage({viewport:{width:w,height:h}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8775');
  const unique='遠足'+w;
  await page.locator('#title').fill('秋の遠足'+w);
  await page.locator('#category').selectOption('子どもの記録');
  await page.locator('#eventDate').fill('2026-10-20');
  await page.locator('#content').fill('公園で'+unique+'を楽しんだという記録。');
  await page.locator('#add').click();
  await page.getByText('資料を保存しました', {exact:false}).waitFor();
  await page.locator('#query').fill(unique);
  await page.locator('#searchCategory').selectOption('子どもの記録');
  await page.locator('#dateFrom').fill('2026-10-01');
  await page.locator('#dateTo').fill('2026-10-31');
  await page.locator('#search').click();
  await page.locator('.result').first().waitFor();
  assert.equal(await page.locator('.result').count(),1);
  assert((await page.locator('.result .meta').first().textContent()).includes('2026-10-20'));
  await page.locator('#searchCategory').selectOption('家計簿');
  await page.locator('#search').click();
  await page.getByText('一致する記録はありません', {exact:false}).waitFor();
  assert.equal(await page.locator('.result').count(),0);
  await page.locator('#searchCategory').selectOption('子どもの記録');
  await page.locator('#search').click();
  await page.locator('.result').first().waitFor();
  const overscroll=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2);
  assert(!overscroll,'width overflow at '+w);
  await page.screenshot({path:path.join(out,'rag-'+w+'x'+h+'.png'),fullPage:true});
  // AI prompt is optional and user-initiated; verify source display via mock.
  let asked=null;
  await page.route('**/api/ask',route=>{
    asked=route.request().postDataJSON();
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      answer:'この記録では公園で遠足を楽しんだとあります。',
      sources:[{id:asked.ids[0],category:'子どもの記録',event_date:'2026-10-20',title:'秋の遠足'}]
    })});
  });
  await page.locator('#ask').click();
  await page.locator('#sourceList .source').first().waitFor();
  assert.equal(asked.ids.length,1);
  assert((await page.locator('#sourceList').textContent()).includes('2026-10-20'));
  await page.unroute('**/api/ask');
  // Deleting the record removes it from saved documents and from retrieval.
  await page.locator('#listCategory').selectOption('子どもの記録');
  await page.locator('#refreshRecords').click();
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#recordList .record-row').filter({hasText:'秋の遠足'+w}).locator('.delete-record').click();
  await page.getByText('記録を削除しました', {exact:false}).waitFor();
  // Import an EXPLICIT test Daymark backup as per-day records; no Ollama call.
  const diaryWord='図書館'+w;
  const backup={version:1,habits:[{id:'h1',name:'読書',active:true}],entries:{
    '2026-10-22':{wake:'07:00',sleep:'22:30',mood:4,
       text:diaryWord+'で資料を読んだ。',wellbeingNote:'落ち着いた',
       checks:{h1:true},habitNames:{h1:'読書'}}
  }};
  await page.locator('#importDaymark').setInputFiles({
    name:'synthetic-daymark-backup.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify(backup),'utf8')
  });
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#importDaymarkBtn').click();
  await page.getByText('Daymarkの記録を取り込みました', {exact:false}).waitFor();
  await page.locator('#searchCategory').selectOption('日記');
  await page.locator('#dateFrom').fill('2026-10-01');
  await page.locator('#dateTo').fill('2026-10-31');
  await page.locator('#query').fill(diaryWord);
  await page.locator('#search').click();
  await page.locator('.result .meta').filter({hasText:'2026-10-22'}).first().waitFor();
  assert.equal(await page.locator('.result').count(),1);
  assert((await page.locator('.result .meta').first().textContent()).includes('2026-10-22'));
  await page.locator('#searchCategory').selectOption('子どもの記録');
  await page.locator('#query').fill(unique);
  await page.locator('#search').click();
  await page.getByText('一致する記録はありません', {exact:false}).waitFor();
  assert.equal(await page.locator('.result').count(),0);
  assert.deepEqual(errors,[],'browser JS error');
  await page.close();
 }
 console.log('RAG keyword search and browser screenshot QA PASS');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>worker.kill());
