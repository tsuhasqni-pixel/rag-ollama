/* Shared Daymark/Folio Ollama setup. Optional: no model download without user confirmation. */
(function(global){
'use strict';
function setup(config){
  const by=id=>document.getElementById(id);
  const select=by(config.select), button=by(config.button), download=by(config.download),
        info=by(config.info), system=by(config.system), detail=by(config.detail),
        progress=by(config.progress), progressText=by(config.progressText),
        dialog=by(config.dialog), dialogModel=by(config.dialogModel),
        dialogSize=by(config.dialogSize), dialogRam=by(config.dialogRam),
        confirmDownload=by(config.confirmDownload), cancelDownload=by(config.cancelDownload);
  const api=config.api;
  const base=config.base;
  let catalog=null, timer=null, readyModel='', pendingModel='';
  function say(message){info.textContent=message;}
  function currentModel(){return readyModel;}
  function reset(){
    select.replaceChildren();const opt=document.createElement('option');
    opt.value='';opt.textContent='モデルを選択してください';select.append(opt);
    select.disabled=true;download.disabled=true;download.textContent='ダウンロードする';
    detail.textContent='「AIを使ってみる」を押すと、このPCに合う候補を表示します。';
  }
  function stopPolling(){if(timer!==null){clearInterval(timer);timer=null;}}
  function rowFor(id){return catalog?.models?.find(model=>model.id===id);}
  function optionLabel(model){
    const size=model.download_bytes?('・約'+(model.download_bytes/1e9).toFixed(1)+'GB'):'';
    const state=model.installed?'インストール済み':model.fits?'ダウンロード可能':model.reason;
    return (model.label||model.id)+'｜'+model.description+size+'｜'+state;
  }
  async function refresh(preferred=''){
    button.disabled=true;say('このPCの容量とOllamaを確認中…');
    try{
      const data=await api(base+'/catalog',{});
      catalog=data;reset();readyModel='';
      const ram=data.ram_gb==null?'未確認':data.ram_gb+'GB';
      const disk=data.disk_free_gb==null?'未確認':data.disk_free_gb+'GB';
      system.textContent='PCのRAM: '+ram+' ／ Ollama保存先の空き容量: '+disk+
        '。推奨は概算です（GPU/CPUの性能や実行速度は未測定）。';
      if(!data.available){
        say('Ollamaが見つかりません。公式サイトからインストールして起動してください。AIなしでも基本機能はすべて利用できます。');
        return;
      }
      select.disabled=false;
      const ordered=[...data.models].sort((a,b)=>
        Number(b.id===data.recommended)-Number(a.id===data.recommended) ||
        Number(b.installed)-Number(a.installed));
      for(const m of ordered){
        const opt=document.createElement('option');
        opt.value=m.id;
        opt.textContent=optionLabel(m);
        opt.disabled=!m.installed && !m.fits;
        select.append(opt);
      }
      const target=[preferred,data.recommended].find(id=>id&&rowFor(id));
      if(target)select.value=target;
      choose();
      if(data.recommended){
        const recommended=rowFor(data.recommended);
        say('このPCにおすすめ：'+(recommended?.label||data.recommended)+
          '。モデルを確認し、未導入の場合だけ「ダウンロードする」を押してください。');
      }else{
        say('安全に自動取得できるモデルを確定できませんでした。RAMとOllama保存先の空き容量を確認してください。');
      }
    }catch(e){
      catalog=null;reset();
      say('接続確認に失敗しました。AI以外の機能はそのまま利用できます。');
    }finally{button.disabled=false;}
  }
  async function updateProgress(){
    try{
      const state=await api(base+'/pull/status',{});
      if(state.state==='running'){
        progress.hidden=false;progress.value=state.percent||0;
        const heading=state.phase==='verifying'?'検証中':
          state.phase==='preparing'?'ダウンロード準備中':'ダウンロード中';
        progressText.textContent=heading+(state.phase==='downloading'?'：'+(state.percent||0)+'%':'')+
          ' — '+(state.status||heading)+'。基本機能は引き続き利用できます。';
      }else if(state.state==='ready'){
        stopPolling();progress.hidden=false;progress.value=100;
        const completed=state.model;
        await refresh(completed);
        progress.hidden=false;progress.value=100;
        progressText.textContent='インストール完了 — 100%。モデルを利用できます。';
        say((rowFor(completed)?.label||completed)+' の取得が完了しました。AI補助を利用できます。');
      }else if(state.state==='error'){
        stopPolling();readyModel='';select.disabled=false;download.disabled=false;button.disabled=false;
        progress.hidden=false;progress.value=0;
        progressText.textContent=state.status||'エラー発生：Ollama、ネット接続、空き容量を確認してください。';
        say(progressText.textContent);
      }
      return state.state;
    }catch(e){
      stopPolling();readyModel='';select.disabled=false;download.disabled=false;button.disabled=false;
      say('ダウンロード状況を確認できません。Ollamaを起動し直して、もう一度お試しください。');
      return 'error';
    }
  }
  function choose(){
    const id=select.value;
    const row=rowFor(id);readyModel='';pendingModel='';
    if(!row){download.disabled=true;detail.textContent='モデルを選んでください。';return;}
    if(row.installed){readyModel=id;download.disabled=true;download.textContent='インストール済み';detail.textContent=(row.label||id)+' は導入済みです。下の「AIを使う」操作ですぐ利用できます。';say((row.label||id)+' はインストール済みです。AI補助に利用できます。');return;}
    download.textContent='ダウンロードする';
    if(!row.fits){download.disabled=true;detail.textContent=(row.label||id)+'：'+row.reason+'。小さいモデルを選んでください。';return;}
    pendingModel=id;download.disabled=false;detail.textContent=(row.label||id)+' — '+row.description+'。必要RAMの目安 '+row.min_ram_gb+'GB、ダウンロード約'+(row.download_bytes/1e9).toFixed(1)+'GB。';
  }
  function showConfirmation(){
    const row=rowFor(pendingModel);if(!row||row.installed||!row.fits)return;
    dialogModel.textContent=row.label||row.id;dialogSize.textContent='約'+(row.download_bytes/1e9).toFixed(1)+'GB（追加の作業領域が必要な場合があります）';dialogRam.textContent=row.min_ram_gb+'GB以上';dialog.showModal();
  }
  async function startDownload(){
    const id=pendingModel;dialog.close();if(!id)return;
    select.disabled=true;download.disabled=true;button.disabled=true;progress.hidden=false;progress.value=0;
    progressText.textContent='ダウンロード準備中 — Ollamaへ取得を依頼しています。';say('取得中も日記・資料検索などの基本機能は利用できます。');
    try{
      const state=await api(base+'/pull',{model:id});
      if(state.state==='ready'){await refresh(id);return;}
      const stateNow=await updateProgress();
      if(stateNow==='running' && timer===null)timer=setInterval(updateProgress,1200);
    }catch(e){select.disabled=false;download.disabled=false;button.disabled=false;say('取得を開始できませんでした：'+e.message);}
  }
  button.addEventListener('click',()=>refresh());
  select.addEventListener('change',choose);
  download.addEventListener('click',showConfirmation);
  confirmDownload.addEventListener('click',startDownload);
  cancelDownload.addEventListener('click',()=>{dialog.close();say('ダウンロードは開始していません。');});
  dialog.addEventListener('cancel',()=>say('ダウンロードは開始していません。'));
  window.addEventListener('beforeunload',stopPolling);
  reset();
  return {refresh,selectedModel:currentModel};
}
global.OllamaSetup={setup};
})(window);
