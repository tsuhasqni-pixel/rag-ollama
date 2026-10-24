"""Optional local Ollama model installer and conservative Windows PC-fit catalog.

Runs inside the existing desktop Python server; never installs Ollama itself.
A user-selected model is downloaded only after a separate explicit UI approval.
No cloud account, API key, background telemetry, hardware driver, or GPU probe.
"""
from __future__ import annotations

import ctypes
import json
import os
import shutil
import threading
import urllib.error
import urllib.request
from pathlib import Path

GB = 1_000_000_000
# Ollama library published model download sizes; approximate, not runtime RAM.
CATALOG = (
    ("qwen3:0.6b", 523_000_000, 3.0, "軽量：短い文章の整理向け"),
    ("qwen3:1.7b", 1_400_000_000, 5.0, "標準：普段の文章補助向け"),
    ("qwen3:4b", 2_500_000_000, 8.0, "高めの品質：メモリに余裕があるPC向け"),
    ("qwen3:8b", 5_200_000_000, 14.0, "大きめ：高メモリのPC向け"),
)
API = "http://127.0.0.1:11434"
_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def total_ram_bytes() -> int | None:
    if os.name != "nt":
        return None
    class MEMORYSTATUSEX(ctypes.Structure):
        _fields_ = [
            ("dwLength",ctypes.c_ulong),("dwMemoryLoad",ctypes.c_ulong),
            ("ullTotalPhys",ctypes.c_ulonglong),("ullAvailPhys",ctypes.c_ulonglong),
            ("ullTotalPageFile",ctypes.c_ulonglong),("ullAvailPageFile",ctypes.c_ulonglong),
            ("ullTotalVirtual",ctypes.c_ulonglong),("ullAvailVirtual",ctypes.c_ulonglong),
            ("ullAvailExtendedVirtual",ctypes.c_ulonglong),
        ]
    stat = MEMORYSTATUSEX()
    stat.dwLength = ctypes.sizeof(stat)
    try:
        if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat)):
            return None
        return int(stat.ullTotalPhys)
    except (OSError, AttributeError, ValueError):
        return None


def free_model_disk_bytes() -> int | None:
    # Respect Ollama's custom model storage location if set.
    raw = os.getenv("OLLAMA_MODELS")
    target = Path(raw).expanduser() if raw else Path.home() / ".ollama" / "models"
    try:
        existing = target
        while not existing.exists() and existing != existing.parent:
            existing = existing.parent
        return shutil.disk_usage(existing).free
    except (OSError, ValueError):
        return None


def request_json(path: str, *, timeout: int = 3) -> dict:
    req = urllib.request.Request(API+path, method="GET")
    with _OPENER.open(req, timeout=timeout) as response:
        data = json.loads(response.read(250_000))
    if not isinstance(data, dict):
        raise ValueError("Invalid local Ollama response")
    return data


def installed_models() -> list[str]:
    try:
        data = request_json("/api/tags")
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        return []
    return [m["name"] for m in data.get("models",[])[:300]
            if isinstance(m,dict) and isinstance(m.get("name"),str)]


class ModelManager:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._job: dict = {"state":"idle","model":"","status":"","percent":0,"busy":False}
        self._thread: threading.Thread | None = None

    def catalog(self) -> dict:
        ram = total_ram_bytes()
        free = free_model_disk_bytes()
        connected = True
        try:
            tags = request_json("/api/tags")
            installed = {m.get("name") for m in tags.get("models",[])
                         if isinstance(m,dict) and isinstance(m.get("name"),str)}
        except (urllib.error.URLError, TimeoutError, OSError, ValueError):
            connected, installed = False, set()
        rows = []
        for name,size,min_ram,summary in CATALOG:
            present=name in installed
            enough_ram = ram is None or ram >= min_ram*GB
            enough_disk = free is None or free >= int(size*1.35+300_000_000)
            fits=enough_ram and (enough_disk or present)
            reason = ("インストール済み" if present else
                      "メモリ容量が目安より少ない" if not enough_ram else
                      "空き容量が不足" if not enough_disk else
                      "容量の目安を満たしています" if ram is not None and free is not None else
                      "一部容量を確認できません。手動で確認してください")
            rows.append({"id":name,"download_bytes":size,"min_ram_gb":min_ram,
                         "description":summary,"installed":present,
                         "fits":fits,"reason":reason})
        candidates=[m for m in rows if m["fits"]]
        recommendation=(candidates[-1]["id"] if candidates else None)
        return {"available":connected,
                "ram_gb":round(ram/GB,1) if ram is not None else None,
                "disk_free_gb":round(free/GB,1) if free is not None else None,
                "recommended":recommendation,
                "models":rows,
                "caution":"推奨はRAM総量とモデル保存先の空き容量からの概算です。GPU、CPU速度、他アプリ使用量や実測速度は判定していません。"}

    def status(self) -> dict:
        with self._lock:
            return dict(self._job)

    def start(self, model: str) -> dict:
        spec=next((m for m in CATALOG if m[0]==model),None)
        if spec is None:
            raise ValueError("自動取得できるモデルではありません。")
        catalog=self.catalog()
        if not catalog["available"]:
            raise RuntimeError("Ollamaが見つかりません。先にOllamaをインストール・起動してください。")
        entry=next(m for m in catalog["models"] if m["id"]==model)
        if entry["installed"]:
            return {"state":"ready","model":model,"status":"すでにインストール済みです。","percent":100,"busy":False}
        if not entry["fits"]:
            raise ValueError("このPCのメモリまたは空き容量が不足しています。小さいモデルを選んでください。")
        with self._lock:
            if self._job["busy"]:
                raise RuntimeError("モデルを取得中です。完了を確認してから次を選んでください。")
            self._job={"state":"running","model":model,"status":"ダウンロード準備中",
                       "percent":0,"busy":True}
            self._thread=threading.Thread(target=self._pull,args=(model,),daemon=True)
            self._thread.start()
            return dict(self._job)

    def _change(self, **updates) -> None:
        with self._lock:
            self._job.update(updates)

    def _pull(self, model: str) -> None:
        # Ollama downloads to its own configured model directory.
        # A streaming thread prevents freezing diary and search interactions.
        try:
            payload=json.dumps({"model":model,"stream":True,"insecure":False}).encode("utf-8")
            req=urllib.request.Request(API+"/api/pull",data=payload,
                headers={"Content-Type":"application/json"},method="POST")
            success=False
            with _OPENER.open(req,timeout=180) as response:
                for line in response:
                    if len(line)>100_000:
                        raise RuntimeError("Ollamaからの進捗が大きすぎます。")
                    if not line.strip():
                        continue
                    event=json.loads(line)
                    if not isinstance(event,dict):
                        continue
                    if event.get("error"):
                        raise RuntimeError(str(event["error"])[:240])
                    status=str(event.get("status") or "ダウンロード中")[:120]
                    total=event.get("total")
                    done=event.get("completed")
                    updates={"status":status}
                    if isinstance(total,(int,float)) and not isinstance(total,bool) and total>0 and isinstance(done,(int,float)) and not isinstance(done,bool):
                        updates["percent"]=min(99,max(0,int(100*done/total)))
                    self._change(**updates)
                    if status=="success":
                        success=True
            if not success:
                raise RuntimeError("取得の完了通知を受け取れませんでした。モデル一覧を再確認してください。")
            self._change(state="ready",status="取得完了。AI補助を利用できます。",percent=100,busy=False)
        except (OSError, urllib.error.URLError, TimeoutError, RuntimeError, ValueError) as exc:
            self._change(state="error",status="取得に失敗: "+str(exc)[:250],busy=False)


MANAGER = ModelManager()
