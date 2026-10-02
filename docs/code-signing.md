# Windowsコード署名

現在は検証環境向けの **自己署名コード署名証明書** を使用します。署名者のテスト名とオブザーバー表示は **BLINP_B(furoneko+)** です。関連リンクは https://github.com/yosu-yosu と https://yosuyosu.co.jp/ です。アプリの「ヘルプ → このアプリについて」にも掲載しています。

自己署名は認証局による本人・組織確認を受けた証明書ではありません。関連リンクやオブザーバー表示も第三者認証を示しません。コード署名は実行ファイルの署名者と改変を確認するもので、アプリの安全性全般を認証するものではありません。

## 今回の検証用署名

GitHub ActionsのWindows runnerでRSA 3072 / SHA-256のコード署名証明書を作り、実行ファイルにSHA-256で署名します。有効期間は90日です。秘密鍵はエクスポート不可としてrunnerの個人証明書ストアに作成し、公開証明書 `test-signing.cer` だけを配布します。秘密鍵・PFX・パスワードはソースやZIPに含めません。ビルドの終了時にrunnerから証明書と鍵を削除します。

署名後に `Get-AuthenticodeSignature` の `Valid` を確認し、署名・公開証明書・ZIPに同梱する証明書の拇印と内容が一致することも検証します。この `Valid` は、自己署名証明書を一時的に信頼登録したビルド環境での結果です。他のWindows環境には自動的に信頼されません。

公開証明書をZIPの実行ファイルと同じフォルダーに同梱し、Releasesにも添付します。`SIGNATURE.json` には実行ファイルのSHA-256、署名者・発行者・拇印・有効期限と `self-signed-test` の検証条件を記録します。証明書と検証結果も `SHA256SUMS.txt` の対象です。

毎回の自己署名ビルドで新しい鍵を作ります。次回配布物では拇印が変わり、検証環境での信頼登録も更新が必要です。固定の署名者鍵を継続利用する場合は、後述の証明書方式へ切り替えて安全な署名基盤を設定してください。

## 検証用Windowsでの利用

アプリ起動時に証明書を自動登録する処理はありません。まず展開フォルダーで次のコマンドを実行し、証明書の拇印がReleasesの `SIGNATURE.json` と一致することを確認します。

```powershell
certutil -dump .\test-signing.cer
Get-AuthenticodeSignature -LiteralPath '.\CSV nyaan Viewer.exe' | Format-List Status,StatusMessage,SignerCertificate
```

この証明書を信頼する検証用アカウントに限って、手動で登録できます。

```powershell
Import-Certificate -FilePath .\test-signing.cer -CertStoreLocation Cert:\CurrentUser\Root
Import-Certificate -FilePath .\test-signing.cer -CertStoreLocation Cert:\CurrentUser\TrustedPublisher
Get-AuthenticodeSignature -LiteralPath '.\CSV nyaan Viewer.exe' | Format-List Status,StatusMessage,SignerCertificate
```

未登録の環境では信頼されない署名として扱われます。自己署名だけではSmartScreenの警告が消えることを保証しません。検証を終えたら、この拇印の証明書を対象のストアから削除できます。

## ローカルで検証用にビルド

WindowsのPowerShellで証明書作成スクリプトをドットソースし、同じプロセスからビルドします。

```powershell
. .\scripts\new-test-certificate.ps1
npm run dist:win -- --publish never
.\scripts\verify-windows-signature.ps1
```

この操作は自分のWindowsアカウントの個人・信頼ルートストアに検証用証明書を登録します。個人ストアの鍵はエクスポート不可です。GitHub Actionsでは後処理で削除しますが、ローカルでは検証後に自分で削除してください。

## 将来、認証局の証明書へ切り替える場合

Windows Authenticode対応のコード署名証明書を認証局へ申請します。発行には本人・組織確認と契約が必要です。署名者名は発行証明書のSubjectで決まり、アプリのオブザーバー表示とは別です。

PFX方式ならGitHubの「Settings → Secrets and variables → Actions」に `WINDOWS_CSC_LINK`（PFXのBase64など）と `WINDOWS_CSC_KEY_PASSWORD` を登録し、Actionsの手動実行で `signing_mode=certificate` を選びます。証明書・秘密鍵・パスワードをソースコードやチャットへ貼り付けないでください。USBトークン・HSM・クラウド署名は、提供元に応じた専用設定が必要です。

証明書方式も署名必須として検証します。署名や検証に失敗した場合は公開しません。`signing_mode=unsigned` は未署名のビルドを明示的に選ぶ場合だけ使用します。
