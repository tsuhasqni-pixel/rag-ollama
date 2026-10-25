# Microsoft Store MSIX — Windows候補と出荷HOLD

更新日: 2026-10-24 JST
ブランチ: codex/store-ollama-download-20261024（main/release直変更なし）
用途: QA_UNSIGNED / Store候補の内部テスト

## Partner Center表示に照合したIdentity
- Name: OkinawaDesktopTools.FolioAI
- Publisher: CN=46263F21-A700-41DB-8C9B-114C22FB82FC
- PublisherDisplayName: Okinawa Desktop Tools
- Version（今回の候補）: 1.0.2.0
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
- 出力MSIX: FolioAI_1.0.2.0_x64_STORE_CANDIDATE_QA_UNSIGNED.msix
- 出力レポート: QA_UNSIGNED_BUILD_REPORT.json。バイト数とSHA-256はこのファイルで照合する。
- 現在のMSIXはQA_UNSIGNED。未署名なので通常Windowsへ直接インストールできる完成版とはみなさない。
- GitHub Actionsの成功はStore掲載・WACK・署名済みMSIXの動作確認を意味しない。

## 販売前HOLD
1. MSIXをWindows実機にインストールして起動・終了・再起動後の記録復元を確認。WebView2有無、複数起動、IMEも確認する。
2. 1280x720、1024x768の画面表示と実アプリからのStore用スクリーンショットを取得。
3. Ollama接続、モデル導入、長文応答、AIが存在しない日付の事実を創作しないかの実機QA。
4. 個人データ保護: Daymark localStorage / Folio SQLiteは現在非暗号化。バックアップ/復元、誤削除対策、個人情報の説明を整える。
5. Windows App Certification Kit、依存ライブラリのライセンス/脆弱性監査、プライバシーポリシーとサポート窓口を確認。
6. パッケージ版を固定してPartner Center登録→認定→公開。これらの操作は未実施。

## Microsoft StoreとStripe
- Microsoft StoreへのMSIX提出にはCA証明書購入は不要。Storeが認定と公開の過程で署名する。
- Store外でStripe経由などMSIXを直接配布するときは、コード署名・配布URL・購入者認証・更新ルートを別途用意する。
- 今回第三者製品の実装コードを移植していない。Microsoft Storeにアップロードする前にpywebview等の依存ライセンスを確認する。
