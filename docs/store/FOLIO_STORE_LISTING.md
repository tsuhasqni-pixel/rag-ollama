# Folio AI — Microsoft Store listing

## 日本語

### 短い説明

PC内の資料を、覚えている言葉からすぐ探せるローカル資料検索アプリ。Ollamaによる回答生成は任意です。

### 製品説明

Folio AIは、テキスト、CSV、Markdown、JSONの資料をWindows PC内に保存し、本文に含まれる言葉から検索できる個人向け資料整理アプリです。資料名を覚えていなくても検索でき、検索結果から全文を開けます。分類と日付による絞り込み、個別削除にも対応します。

検索・登録・全文表示・削除はAIなしで利用できます。利用者が希望する場合だけ、PC内で動作するOllamaへ検索結果を渡し、資料に基づく回答を生成します。日記や資料を開発者のサーバーへ送信する機能、アカウント登録、クラウド同期、テレメトリはありません。

### 主な機能

- TXT / CSV / Markdown / JSONの登録
- 本文中の語による検索、複数語検索、古い資料の検索
- 分類・日付フィルター、全文表示、個別削除
- ローカルSQLite保存
- 任意のローカルOllamaによる資料根拠回答
- PCのRAMと空き容量を参考にしたモデル候補表示

### システム要件

- Windows 10またはWindows 11、x64
- Microsoft Edge WebView2 Runtime
- 基本機能はOllama不要
- AI回答を利用する場合のみOllamaとモデル保存用の空き容量が必要

### AI / Ollama

Ollama本体は自動インストールしません。未導入時は公式案内を表示します。モデル取得は、容量と通信の確認画面で利用者が承認した後だけ開始します。Ollamaとの通信先は `127.0.0.1` です。推奨はRAMとディスク容量に基づく概算で、GPU性能や実行速度の測定結果ではありません。

### ローカル保存とプライバシー

資料はWindowsユーザーの `%USERPROFILE%\.rag-ollama\library.sqlite3` に保存されます。現バージョンはアプリ独自の暗号化を行わないため、Windowsアカウント、端末暗号化、アクセス権を適切に管理してください。アンインストール後も利用者データは自動削除しません。不要な場合はアプリ内で各資料を削除し、残った保存フォルダーを利用者自身で削除してください。

### 既知の制限

- 1ファイル1.5MBまで
- 対応形式はTXT、CSV、Markdown、JSON（内容はテキストとして登録）
- ローカルデータのアプリ独自暗号化、クラウド同期、OCRには非対応
- AI回答の品質はOllamaモデルに依存し、重要な判断では参照資料の全文確認が必要

### サポート

不具合報告と問い合わせ: https://github.com/tsuhasqni-pixel/rag-ollama/issues

### スクリーンショット対応

1. `01-document-search.png` — 資料検索
2. `02-search-results.png` — 検索結果
3. `03-document-add.png` — 資料登録
4. `04-full-document.png` — 全文表示
5. `05-ai-answer.png` — ローカルAI回答と参照資料

## English

### Short description

Find locally stored documents by words you remember. Optional answers use your local Ollama installation.

### Description

Folio AI stores TXT, CSV, Markdown, and JSON documents on your Windows PC and searches the text inside them. Open the complete source, filter by category or date, and delete individual records. These core features work without AI.

If you opt in, Folio AI can send up to three selected search results to Ollama running on the same PC to generate a source-grounded answer. The app has no developer cloud, account registration, cloud sync, or telemetry.

### Features

- Local TXT, CSV, Markdown, and JSON import
- Body-text, multiword, category, and date search
- Full source view and individual deletion
- Local SQLite storage
- Optional source-grounded answers using local Ollama

### Requirements and limitations

Windows 10/11 x64 and Microsoft Edge WebView2 Runtime. Ollama is required only for AI answers. Files are limited to 1.5MB. Local records are not encrypted by the app; protect the Windows account and device. AI output depends on the selected model and should be checked against the displayed sources.

