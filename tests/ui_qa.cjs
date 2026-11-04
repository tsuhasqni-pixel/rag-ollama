const {chromium}=require('playwright');
const {spawn,spawnSync}=require('node:child_process');
const {once}=require('node:events');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),out=path.join(root,'qa-screenshots');
fs.mkdirSync(out,{recursive:true});
const storeShots=path.join(root,'store-assets','screenshots','ja-JP');
fs.mkdirSync(storeShots,{recursive:true});
const tmpDb=fs.mkdtempSync(path.join(os.tmpdir(),'rag-ollama-test-'));
let workerOutput='';
function startWorker(){
 const child=spawn('python',['server.py'],{cwd:root,stdio:'pipe',env:{...process.env,RAG_OLLAMA_DATA_DIR:tmpDb}});
 for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{
   workerOutput=(workerOutput+chunk.toString('utf8')).slice(-4000);
 });
 return child;
}
let worker=startWorker();
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
 throw Error('local RAG server did not start; exit='+worker.exitCode+'; '+workerOutput.trim());
}
(async()=>{
 await ready();const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
 for(const [w,h] of [[1920,1080],[1280,720],[1024,768],[720,750]]){
  const page=await browser.newPage({viewport:{width:w,height:h}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8775');
  // AI status is explicit: no Ollama request just to open the page.
  assert((await page.locator('#aiStatus').textContent()).includes('未確認'));
  const modelCatalog={
    available:true,ram_gb:8,disk_free_gb:10,recommended:'qwen3:1.7b',
    models:[
      {id:'qwen3:0.6b',label:'Qwen3 0.6B',description:'軽量・低メモリ向け',download_bytes:523000000,min_ram_gb:3,installed:true,fits:true,reason:'インストール済み'},
      {id:'qwen3:1.7b',label:'Qwen3 1.7B',description:'標準・おすすめ候補',download_bytes:1400000000,min_ram_gb:5,installed:false,fits:true,reason:'容量OK'},
      {id:'qwen3:8b',label:'Qwen3 8B',description:'高メモリPC向け',download_bytes:5200000000,min_ram_gb:14,installed:false,fits:false,reason:'メモリ容量が目安より少ない'}
    ]
  };
  await page.route('**/api/catalog',route=>route.fulfill({
    status:200,contentType:'application/json',body:JSON.stringify({...modelCatalog,available:false})
  }));
  await page.locator('#checkAi').click();
  await page.getByText('Ollamaが見つかりません',{exact:false}).waitFor();
  await page.unroute('**/api/catalog');
  let downloaded=false,pulledModel=null,pullFinished=false;
  await page.route('**/api/catalog',route=>route.fulfill({
    status:200,contentType:'application/json',body:JSON.stringify({...modelCatalog,
      models:modelCatalog.models.map(m=>m.id==='qwen3:1.7b'?{...m,installed:downloaded}:m)})
  }));
  await page.locator('#checkAi').click();
  await page.getByText('このPCにおすすめ：Qwen3 1.7B',{exact:false}).waitFor();
  assert((await page.locator('#pcCapacity').textContent()).includes('8GB'));
  assert.equal(await page.locator('#model option:disabled').count(),1);
  assert.equal(await page.locator('#model').inputValue(),'qwen3:1.7b');
  await page.screenshot({path:path.join(out,'ollama-model-selection-'+w+'x'+h+'.png'),fullPage:true});
  await page.route('**/api/pull',route=>{
    pulledModel=route.request().postDataJSON().model;downloaded=true;
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({state:'running',phase:'preparing',model:pulledModel,percent:0,busy:true})});
  });
  await page.route('**/api/pull/status',route=>route.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify(pullFinished?
      {state:'ready',phase:'complete',model:'qwen3:1.7b',percent:100,busy:false}:
      {state:'running',phase:'downloading',model:'qwen3:1.7b',status:'ダウンロード中',percent:42,busy:true})}));
  assert.equal(pulledModel,null,'selection alone must not start a large download');
  await page.locator('#downloadModel').click();
  await page.locator('#ollamaConfirmDialog').waitFor({state:'visible'});
  await page.screenshot({path:path.join(out,'ollama-download-confirm-'+w+'x'+h+'.png'),fullPage:true});
  await page.locator('#confirmModelDownload').click();
  await page.getByText('ダウンロード中：42%',{exact:false}).waitFor();
  await page.screenshot({path:path.join(out,'ollama-download-progress-'+w+'x'+h+'.png'),fullPage:true});
  assert.equal(pulledModel,'qwen3:1.7b');
  pullFinished=true;
  await page.getByText('インストール完了',{exact:false}).waitFor({timeout:5000});
  await page.screenshot({path:path.join(out,'ollama-download-complete-'+w+'x'+h+'.png'),fullPage:true});
  const unique='企画案'+w;
  await page.locator('#title').fill('作業メモ'+w);
  await page.locator('#category').selectOption('メモ・記録');
  await page.locator('#eventDate').fill('2026-10-20');
  await page.locator('#content').fill('会議で'+unique+'を確認したという記録。');
  if(w===1920)await page.screenshot({path:path.join(storeShots,'03-document-add.png')});
  await page.locator('#add').click();
  await page.getByText('資料を保存しました', {exact:false}).waitFor();
  await page.locator('#query').fill(unique);
  if(w===1920)await page.screenshot({path:path.join(storeShots,'01-document-search.png')});
  // One remembered word is enough; typing triggers a debounced search.
  await page.locator('.result').filter({hasText:unique}).first().waitFor();
  assert((await page.locator('.result .meta').first().textContent()).includes('該当語'));
  if(w===1920)await page.screenshot({path:path.join(storeShots,'02-search-results.png')});
  await page.locator('.result .result-actions button').first().click();
  await page.locator('#docDialog').waitFor({state:'visible'});
  assert((await page.locator('#docContent').textContent()).includes(unique));
  if(w===1920)await page.screenshot({path:path.join(storeShots,'04-full-document.png')});
  await page.locator('#closeDoc').click();
  assert.equal(await page.locator('#docDialog').isVisible(),false);
  assert.equal(await page.locator('#searchFilters').getAttribute('open'),null,'optional filters should be hidden initially');
  await page.locator('#searchFilters summary').click();
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
  await page.locator('#searchFilters summary').click();
  assert.equal(await page.locator('#searchFilters').getAttribute('open'),null);
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
  assert.equal(asked.model,'qwen3:1.7b');
  assert((await page.locator('#sourceList').textContent()).includes('2026-10-20'));
  if(w===1920)await page.screenshot({path:path.join(storeShots,'05-ai-answer.png')});
  await page.unroute('**/api/ask');
  // Deleting the record removes it from saved documents and from retrieval.
  await page.locator('#listCategory').selectOption('メモ・記録');
  await page.locator('#refreshRecords').click();
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#recordList .record-row').filter({hasText:'作業メモ'+w}).locator('.delete-record').click();
  await page.getByText('記録を削除しました', {exact:false}).waitFor();
  assert.equal(await page.locator('#recordList .record-row').filter({hasText:'作業メモ'+w}).count(),0);
  await page.locator('#query').fill(unique);
  await page.locator('#search').click();
  await page.getByText('一致する記録はありません', {exact:false}).waitFor();
  if(w===1920){
    await page.locator('#searchFilters').evaluate(element=>{element.open=true;});
    for(const sample of [
      {name:'format-check.txt',mimeType:'text/plain',word:'TXT形式確認'},
      {name:'format-check.csv',mimeType:'text/csv',word:'CSV形式確認'},
      {name:'format-check.md',mimeType:'text/markdown',word:'Markdown形式確認'},
      {name:'format-check.json',mimeType:'application/json',word:'JSON形式確認'}
    ]){
      await page.locator('#file').setInputFiles({
        name:sample.name,mimeType:sample.mimeType,
        buffer:Buffer.from(sample.word+' の模擬資料です。','utf8')
      });
      await page.waitForFunction(expected=>document.querySelector('#content').value.includes(expected),sample.word);
      assert.equal(await page.locator('#title').inputValue(),sample.name);
      assert((await page.locator('#content').inputValue()).includes(sample.word));
      await page.locator('#category').selectOption('資料・書類');
      await page.locator('#eventDate').fill('2026-10-23');
      await page.locator('#add').click();
      await page.getByText('資料を保存しました',{exact:false}).waitFor();
      await page.locator('#query').fill(sample.word);
      await page.locator('#searchCategory').selectOption('資料・書類');
      await page.locator('#search').click();
      await page.locator('.result').filter({hasText:sample.word}).first().waitFor();
    }
  }
  // File import remains generic; no other app's data schema is recognized.
  assert.equal(await page.locator('#importDaymark').count(),0);
  const genericWord='設計資料'+w;
  await page.locator('#file').setInputFiles({
    name:'my-notes.txt',mimeType:'text/plain',
    buffer:Buffer.from(genericWord+'について考えた。','utf8')
  });
  await page.waitForFunction(expected=>document.querySelector('#content').value.includes(expected),genericWord);
  assert.equal(await page.locator('#title').inputValue(),'my-notes.txt');
  await page.locator('#category').selectOption('資料・書類');
  await page.locator('#eventDate').fill('2026-10-22');
  await page.locator('#add').click();
  await page.getByText('資料を保存しました',{exact:false}).waitFor();
  await page.locator('#searchFilters').evaluate(element=>{element.open=true;});
  await page.locator('#searchCategory').selectOption('資料・書類');
  await page.locator('#query').fill(genericWord);
  await page.locator('#search').click();
  await page.locator('.result .meta').filter({hasText:'2026-10-22'}).first().waitFor();
  assert.equal(await page.locator('.result').count(),1);
  assert.deepEqual(errors,[],'browser JS error');
  await page.unroute('**/api/catalog');
  await page.unroute('**/api/pull');
  await page.unroute('**/api/pull/status');
  await page.close();
 }
 }finally{await browser.close();}
 worker.kill();
 await once(worker,'exit');
 const sqliteCheck=spawnSync('python',['-c',
   'import json,sqlite3,sys; c=sqlite3.connect(sys.argv[1]); print(json.dumps([c.execute("select count(*) from docs where instr(content,?)>0",(x,)).fetchone()[0] for x in sys.argv[2:]]))',
   path.join(tmpDb,'library.sqlite3'),'企画案1920','企画案1280','企画案1024','企画案720','設計資料1920'],{encoding:'utf8'});
 assert.equal(sqliteCheck.status,0,sqliteCheck.stderr);
 const persistedCounts=JSON.parse(sqliteCheck.stdout);
 assert.deepEqual(persistedCounts.slice(0,4),[0,0,0,0],'GUI-deleted row remains in SQLite');
 assert.equal(persistedCounts[4],1,'unrelated saved row was lost');
 workerOutput='';worker=startWorker();await ready();
 const response=await fetch('http://127.0.0.1:8775/api/search',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({query:'企画案1920'})
 });
 assert.equal(response.status,200);
 assert.deepEqual((await response.json()).results,[],'deleted row returned after server restart');
 console.log('RAG keyword search, GUI delete, SQLite persistence and browser screenshot QA PASS');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>worker.kill());
