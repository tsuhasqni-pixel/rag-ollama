# Folio AI Privacy Policy / プライバシーポリシー

Effective: 2026-11-05

## 日本語

Folio AIは、資料登録、検索、全文表示、削除を利用者のWindows PC内で処理します。登録資料は `%USERPROFILE%\.rag-ollama\library.sqlite3` に保存されます。開発者は、利用者の資料、検索語、AIへの質問を収集または保管しません。本製品にアカウント、広告、利用状況テレメトリ、開発者クラウドへの同期機能はありません。

AI機能は任意です。利用者が明示的に実行した場合だけ、選択された検索結果（最大3件）と質問を、同じPCの `127.0.0.1:11434` で動作するOllamaへ送ります。モデル取得時は、利用者の承認後にOllamaがモデル配布元とインターネット通信します。アプリはOllama本体を無断でインストールしません。

ローカルSQLiteはアプリ独自には暗号化されません。利用者はWindowsサインイン、BitLockerまたはデバイス暗号化、ファイルアクセス権などで端末を保護してください。資料はアプリ内で個別削除できます。全データを削除する場合はアプリを終了し、`.rag-ollama` フォルダーを削除してください。アンインストールだけでは利用者データを削除しません。

問い合わせ: https://github.com/tsuhasqni-pixel/rag-ollama/issues

## English

Folio AI processes document registration, search, full-text viewing, and deletion on the user's Windows PC. Records are stored in `%USERPROFILE%\.rag-ollama\library.sqlite3`. The developer does not collect or retain documents, search terms, or AI questions. The product has no account, advertising, usage telemetry, or developer-operated cloud sync.

AI is optional. Only after an explicit user action, the question and up to three selected search results are sent to Ollama at `127.0.0.1:11434` on the same PC. After the user approves a model download, Ollama connects to its model distribution service. Folio AI does not silently install Ollama.

The local SQLite database is not encrypted by the app. Users should protect the Windows account and device with appropriate Windows security features and permissions. Individual records can be deleted in the app. To remove all local data, close the app and delete the `.rag-ollama` folder. Uninstalling the app does not automatically remove user data.

Support: https://github.com/tsuhasqni-pixel/rag-ollama/issues

