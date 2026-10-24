/* Shared Daymark/Folio Ollama setup. Optional: no model download without user confirmation. */
(function(global){
'use strict';
function setup(config){
  const by=id=>document.getElementById(id);
  const select=by(config.select), button=by(config.button), info=by(config.info),
        system=by(config.system), progress=by(config.progress),
        progressText=by(config.progressText);
  const api=config.api;
  const base=config.base;
  let catalog=null, timer=null, readyModel='';
  function say(message){info.textContent=message;}
  function currentModel(){return readyModel;}
  function reset(){select.replaceChildren();const opt=document.createElement('option');opt.value='';opt.textContent='モデルを選択してください';select.append(opt);}
  function stopPolling(){if(timer!==null){clearInterval(timer);timer=null;}}
  async function refresh(){
    button.disabled=true;say('このPCの容量とOllamaを確認中…');
    try{
      const data=await api(base+'/catalog',{});
      catalog=data;reset();readyModel='';
      const ram=data.ram_gb==null?'未確認':data.ram_gb+'GB';
      const disk=data.disk_free_gb==null?'未確認':data.disk_free_gb+'GB';
      system.textContent='PCのRAM: '+ram+' ／ Ollama保存先の空き容量: '+disk+
        '。推奨は概算です（GPU/CPUの性能は未測定）。';
      if(!data.available){
        say('Ollamaが起動していません。先に公式サイトから導入・起動してください。検索や日記はAIなしで利用できます。');
        return;
      }
      for(const m of data.models){
        const opt=document.createElement('option');
        opt.value=m.id;
        const size=m.download_bytes?(' 約'+(m.download_bytes/1e9).toFixed(1)+'GB'):'';
        const label=m.installed?'（インストール済）':m.fits?'（選択後に取得）':'（容量不足・選択不可）';
        opt.textContent=m.id+size+' '+label;
        opt.disabled=!m.installed && !m.fits;
        select.append(opt);
      }
      if(data.recommended){
        say('おすすめは '+data.recommended+' です。モデルを選ぶと未取得の場合は確認後に自動ダウンロードします。');
      }else{
        say('このPCに合うモデルを確定できませんでした。RAMとディスク空き容量を確認してください。');
      }
    }catch(e){
      catalog=null;reset();
      say('接続確認に失敗しました。AI以外の機能はそのまま利用できます。');
    }finally{button.disabled=false;}
  }
  async function updateProgress(){
    try{
      const state=await api(base+'/pull/status',{});
      if(state.model && select.value!==state.model)return;
      if(state.state==='running'){
        progress.hidden=false;progress.value=state.percent||0;
        progressText.textContent='ダウンロード中: '+(state.percent||0)+'% — '+(state.status||'転送中')+
          '。通信環境やモデルのサイズにより数分～数十分以上かかる場合があります。';
      }else if(state.state==='ready'){
        stopPolling();progress.value=100;
        readyModel=state.model;
        say(state.model+' の取得が完了しました。AI補助を利用できます。');
        progressText.textContent='100% — モデルを利用できます。';
        await refresh();
        select.value=readyModel; // only if still listed after fetching installed tags
      }else if(state.state==='error'){
        stopPolling();progress.hidden=true;readyModel='';
        say(state.status||'取得に失敗しました。空き容量とネット接続を確認してください。');
      }
    }catch(e){
      stopPolling();say('ダウンロード状況を確認できません。Ollamaが起動しているか確認してください。');
    }
  }
  async function choose(){
    stopPolling();
    const id=select.value;
    const row=catalog?.models?.find(m=>m.id===id);
    if(!row){readyModel='';return;}
    if(row.installed){readyModel=id;progress.hidden=true;say(id+' はインストール済みです。AI補助に利用できます。');return;}
    readyModel='';
    if(!row.fits){say('このPCの容量には推奨しないモデルです。小さいモデルを選んでください。');select.value='';return;}
    const size=(row.download_bytes/1e9).toFixed(1);
    const ok=confirm(
      id+' をOllama経由でダウンロードしますか？\n\n'+
      'モデル本体: 約'+size+'GB（追加データや作業用領域が必要な場合があります）\n'+
      '目安のRAM: '+row.min_ram_gb+'GB以上\n\n'+
      'ダウンロードは数分から数十分以上かかる場合があります。\n'+
      '通信量が発生します。PCの電源・ネット接続と空き容量を確認してください。\n'+
      '「OK」でこのPCのOllamaへ取得を開始します。'
    );
    if(!ok){select.value='';say('取得は開始していません。別のモデルを選べます。');return;}
    try{
      const state=await api(base+'/pull',{model:id});
      if(state.state==='ready'){readyModel=id;say('すでにインストール済みです。');return;}
      progress.hidden=false;progress.value=0;
      progressText.textContent='ダウンロードを開始しました。サイズによって時間がかかります。';
      say('取得中も日記・資料検索の基本機能は利用できます。');
      await updateProgress();
      if(timer===null)timer=setInterval(updateProgress,1200);
    }catch(e){select.value='';say('取得を開始できませんでした: '+e.message);}
  }
  button.addEventListener('click',refresh);
  select.addEventListener('change',choose);
  window.addEventListener('beforeunload',stopPolling);
  reset();
  return {refresh,selectedModel:currentModel};
}
global.OllamaSetup={setup};
})(window);
