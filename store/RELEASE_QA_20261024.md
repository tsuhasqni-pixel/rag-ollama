# Microsoft Store MSIX — Windows候補と出荷HOLD

更新日: 2026-10-29 JST
ブランチ: codex/store-ollama-download-20261024（main/release直変更なし）
用途: QA_UNSIGNED / Store候補の内部テスト

## Partner Center表示に照合したIdentity
- Name: OkinawaDesktopTools.FolioAI
- Publisher: CN=46263F21-A700-41DB-8C9B-114C22FB82FC
- PublisherDisplayName: Okinawa Desktop Tools
- Version（今回の候補）: 1.0.2.1
- Architecture: x64
- 引用元: ユーザーが示したPartner Centerの製品Identity画面（2026-10-24）
- Partner Center APIによるストア関連付けとアップロード: 未実施

## Windowsアプリの構成
- store/windows_launcher.py がローカルPythonサーバーを起動し、WebView2の専用Windowsウィンドウを開く。
- ローカル固定ポートは127.0.0.1:8775。ポート競合時は安全のため起動停止。保存データのオリジンが切り替わらない。
- Daymarkの日記はブラウザのlocalStorage、Folioの登録資料はSQLite。Ollamaがなくても日記・資料検索は使える。
- Edge WebView2 EvergreenランタイムはWindows PCにインストールされている必要がある。本MSIXはWebView2を同梱しない。
- MakeAppx pack/unpack、manifest name/publisher/version/architecture確認、バンドルしたEXEの静的リソース起動セルフテストを行う。

## ビルド結果と使い方
- ワークフロー: .github/workflows/store-msix-candidate.yml（Windows 2022）
- 出力MSIX: FolioAI_1.0.2.1_x64_STORE_CANDIDATE_QA_UNSIGNED.msix
- 出力レポート: QA_UNSIGNED_BUILD_REPORT.json。バイト数とSHA-256はこのファイルで照合する。
- 1.0.2.1では実行ファイルにPerMonitorV2 DPIマニフェストを埋め込み、ローカル実機QA専用のテスト署名オプションを追加。既定のActions出力は従来どおりQA_UNSIGNED。
- 現在のMSIXはQA_UNSIGNED。未署名なので通常Windowsへ直接インストールできる完成版とはみなさない。
- GitHub Actionsの成功はStore掲載・WACK・署名済みMSIXの動作確認を意味しない。

## 販売前HOLD
1. 1.0.2.1を管理者権限でWACK再実行し、DPI警告の解消を確認する。1.0.2.0のWACKは警告終了。
2. 依存ライブラリのライセンス/脆弱性監査、プライバシーポリシーとサポート窓口を確認する。
3. 個人データ保護: Daymark localStorage / Folio SQLiteは現在非暗号化。バックアップ/復元と端末保護の説明を維持する。
4. 正式なStore署名、Partner Centerパッケージ検証、認定、公開は未実施。公開操作は別途承認があるまで行わない。

## Microsoft StoreとStripe
- Microsoft StoreへのMSIX提出にはCA証明書購入は不要。Storeが認定と公開の過程で署名する。
- Store外でStripe経由などMSIXを直接配布するときは、コード署名・配布URL・購入者認証・更新ルートを別途用意する。
- 今回第三者製品の実装コードを移植していない。Microsoft Storeにアップロードする前にpywebview等の依存ライセンスを確認する。
