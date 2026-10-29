"""Packaged Windows desktop host. Local data and optional Ollama stay on 127.0.0.1.

Windows Store packaging:
  pyinstaller --noconfirm --clean --windowed --onedir --name <Name> ...
MSIX may be submitted UNSIGNED to Store; never label it a signed installable build.

The fixed origin is intentional: Daymark's localStorage is scoped to host+port.
Changing the port would hide existing diary data on the next app launch.
"""
from __future__ import annotations

import ctypes
import os
import sys
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

# The bundled server.py is the only backend. No user data is baked into MSIX.
from server import Handler as LocalHandler

APP_NAME = "FolioAI"
PORT = 8775


def friendly_error(message: str) -> None:
    try:
        ctypes.windll.user32.MessageBoxW(
            None, message, APP_NAME + " - 起動できません", 0x10
        )
    except (AttributeError, OSError):
        print(message, file=sys.stderr)


def run_self_test(base: str) -> None:
    for path in (('/', '/index.html', '/model_picker.js')):
        with urllib.request.urlopen(base + path, timeout=5) as response:
            body = response.read()
            if response.status != 200 or not body:
                raise RuntimeError("ローカルアプリの起動確認に失敗: " + path)
    print(APP_NAME + " packaged static runtime self-test: PASS")


def main() -> int:
    try:
        # Bind strictly to loopback. The fixed port keeps the desktop origin stable.
        server = ThreadingHTTPServer(("127.0.0.1", PORT), LocalHandler)
    except OSError as exc:
        friendly_error(
            "このアプリのローカルポート " + str(PORT) +
            " はすでに使用されています。\n同じアプリが開いていないか確認してください。\n"
            "他のプロセスには接続せず、安全のため起動を停止します。"
        )
        return 2
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        url = "http://127.0.0.1:" + str(PORT)
        if "--self-test" in sys.argv:
            run_self_test(url)
            return 0

        # Use the Windows user's app data, not the MSIX immutable install folder.
        data = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "OkinawaDesktopTools" / APP_NAME / "WebView2"
        data.mkdir(parents=True, exist_ok=True)
        import webview
        webview.create_window(
            APP_NAME.replace("AI", " AI"), url,
            width=1100, height=830, min_size=(800, 600)
        )
        # The installed Microsoft Edge WebView2 runtime is required.
        # No fallback to obsolete IE/Trident, to avoid incompatible localStorage.
        webview.start(gui="edgechromium", private_mode=False, storage_path=str(data), debug=False)
        return 0
    except Exception as exc:
        friendly_error(
            "WindowsのWebView2実行環境、またはアプリの起動を確認してください。\n"
            "このMSIXはまだ内部QA段階です。\n" + str(exc)[:900]
        )
        return 3
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    raise SystemExit(main())
