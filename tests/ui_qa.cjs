const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),out=path.join(root,'qa-screenshots');
fs.mkdirSync(out,{recursive:true});
const tmpDb=fs.mkdtempSync(path.join(os.tmpdir(),'rag-ollama-test-'));
const worker=spawn('python',['server.py'],{cwd:root,stdio:'pipe',env:{...process.env,RAG_OLLAMA_DATA_DIR:tmpDb}});
async function ready(){
 for(let i=0;i<60;i++){
   const ok=await new Promise(resolve=>{
     const req=http.get('http://127.0.0.1:8775/',res=>{res.resume();resolve(res.statusCode===200);});
     req.on('error',()=>resolve(false));
     req.setTimeout(1200,()=>{req.destroy();resolve(false);});
   });
   if(ok)return;
   await new Promise(r=>setTimeout(r,150));
 }
 throw Error('local RAG server did not start');
}
(async()=>{
 await ready();const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
 for(const [w,h] of [[1280,720],[1024,768],[720,750]]){
  const page=await browser.newPage({viewport:{width:w,height:h}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8775');
  // AI status is explicit: no Ollama request just to open the page.
  assert((await page.locator('#aiStatus').textContent()).includes('未確認'));
  await page.route('**/api/status',route=>route.fulfill({status:200,contentType:'application/json',
     body:JSON.stringify({available:false,models:[]})}));
  await page.locator('#checkAi').click();
  await page.getByText('Ollama：未接続', {exact:false}).waitFor();
  await page.unroute('**/api/status');
  // Optional local Ollama model selector can be used without entering model IDs.
  await page.route('**/api/status',route=>route.fulfill({status:200,contentType:'application/json',
     body:JSON.stringify({available:true,models:['qwen3:4b','gemma3:1b']})}));
  await page.locator('#checkAi').click();
  await page.getByText('Ollama：接続できました', {exact:false}).waitFor();
  await page.locator('#model').selectOption('gemma3:1b');
  assert.equal(await page.locator('#model').inputValue(),'gemma3:1b');
  await page.screenshot({path:path.join(out,'ai-model-setup-'+w+'x'+h+'.png'),fullPage:true});
  await page.unroute('**/api/status');
  const unique='企画案'+w;
  await page.locator('#title').fill('作業メモ'+w);
  await page.locator('#category').selectOption('メモ・記録');
  await page.locator('#eventDate').fill('2026-10-20');
  await page.locator('#content').fill('会議で'+unique+'を確認したという記録。');
  await page.locator('#add').click();
  await page.getByText('資料を保存しました', {exact:false}).waitFor();
  await page.locator('#query').fill(unique);
  // One remembered word is enough; typing triggers a debounced search.
  await page.locator('.result').filter({hasText:unique}).first().waitFor();
  assert((await page.locator('.result .meta').first().textContent()).includes('該当語'));
  await page.locator('#searchCategory').selectOption('メモ・記録');
  await page.locator('#dateFrom').fill('2026-10-01');
  await page.locator('#dateTo').fill('2026-10-31');
  await page.locator('#search').click();
  await page.locator('.result').first().waitFor();
  assert.equal(await page.locator('.result').count(),1);
  assert((await page.locator('.result .meta').first().textContent()).includes('2026-10-20'));
  await page.locator('#searchCategory').selectOption('数値・表');
  await page.locator('#search').click();
  await page.getByText('一致する記録はありません', {exact:false}).waitFor();
  assert.equal(await page.locator('.result').count(),0);
  await page.locator('#searchCategory').selectOption('メモ・記録');
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
      answer:'この記録では会議で企画案を楽しんだとあります。',
      sources:[{id:asked.ids[0],category:'メモ・記録',event_date:'2026-10-20',title:'作業メモ'}]
    })});
  });
  await page.locator('#ask').click();
  await page.locator('#sourceList .source').first().waitFor();
  assert.equal(asked.ids.length,1);
  assert.equal(asked.model,'gemma3:1b');
  assert((await page.locator('#sourceList').textContent()).includes('2026-10-20'));
  await page.unroute('**/api/ask');
  // Deleting the record removes it from saved documents and from retrieval.
  await page.locator('#listCategory').selectOption('メモ・記録');
  await page.locator('#refreshRecords').click();
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#recordList .record-row').filter({hasText:'作業メモ'+w}).locator('.delete-record').click();
  await page.getByText('記録を削除しました', {exact:false}).waitFor();
  // File import remains generic; no other app's data schema is recognized.
  assert.equal(await page.locator('#importDaymark').count(),0);
  const genericWord='設計資料'+w;
  await page.locator('#file').setInputFiles({
    name:'my-notes.txt',mimeType:'text/plain',
    buffer:Buffer.from(genericWord+'について考えた。','utf8')
  });
  assert.equal(await page.locator('#title').inputValue(),'my-notes.txt');
  await page.locator('#category').selectOption('資料・書類');
  await page.locator('#eventDate').fill('2026-10-22');
  await page.locator('#add').click();
  await page.getByText('資料を保存しました',{exact:false}).waitFor();
  await page.locator('#searchCategory').selectOption('資料・書類');
  await page.locator('#query').fill(genericWord);
  await page.locator('#search').click();
  await page.locator('.result .meta').filter({hasText:'2026-10-22'}).first().waitFor();
  assert.equal(await page.locator('.result').count(),1);
  assert.deepEqual(errors,[],'browser JS error');
  await page.close();
 }
 console.log('RAG keyword search and browser screenshot QA PASS');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>worker.kill());
