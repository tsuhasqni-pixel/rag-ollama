const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),out=path.join(root,'qa-screenshots');
fs.mkdirSync(out,{recursive:true});
const worker=spawn('python',['server.py'],{cwd:root,stdio:'pipe',env:{...process.env,RAG_OLLAMA_DATA_DIR:path.join(out,'private-db')}});
async function ready(){for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:8775')).ok)return}catch(e){}await new Promise(r=>setTimeout(r,150));}throw Error('local RAG server did not start');}
(async()=>{
 await ready();const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
 for(const [w,h] of [[1280,720],[1024,768],[720,750]]){
  const page=await browser.newPage({viewport:{width:w,height:h}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8775');
  await page.locator('#title').fill('2026会議資料');
  await page.locator('#content').fill('本日の会議では2026年の売上を確認しました。');
  await page.locator('#add').click();
  await page.getByText('資料を保存しました', {exact:false}).waitFor();
  await page.locator('#query').fill('売上');
  await page.locator('#search').click();
  await page.locator('.result').first().waitFor();
  assert((await page.locator('.result').count())>=1);
  const overscroll=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2);
  assert(!overscroll,'width overflow at '+w);
  await page.screenshot({path:path.join(out,'rag-'+w+'x'+h+'.png'),fullPage:true});
  assert.deepEqual(errors,[],'browser JS error');
  await page.close();
 }
 console.log('RAG keyword search and browser screenshot QA PASS');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>worker.kill());
