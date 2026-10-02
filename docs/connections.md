# 接続・共有ガイド

最上段の「接続」から設定します。

アプリから各サービスへアクセスするための登録情報は、利用者または組織で用意してください。各APIを使用する実装は同梱していますが、製品アカウント・OAuthアプリは登録されていません。

WindowsではElectronのsafeStorageにより秘密情報をOSの保護機構で暗号化し、ユーザープロファイル内に保存します。OSの安全な保存機構が利用できない場合、秘密情報は起動中のメモリにだけ保持します。公開情報のクライアントID・テナントは設定ファイルに保存します。

## Google

1. Google CloudでプロジェクトとOAuth同意画面を設定します。
2. Drive API、Sheets API、Gmail API、Google Chat APIを有効にします。
3. 「デスクトップアプリ」用のOAuthクライアントを作成します。
4. クライアントIDと登録画面のクライアントシークレットを接続設定に入力・保存します。配布済みデスクトップアプリのシークレットはサーバーの秘密鍵と同等の機密性を持ちません。
5. 「ログイン」でシステムブラウザを開き、アクセス権を認可します。

PKCEとstateを使用し、コールバックは `http://localhost:53682/oauth/callback` で受けます。ポート使用中はログインできません。認証は5分で期限切れになります。

要求する権限は `drive.file`、`drive.readonly`、`spreadsheets`、`gmail.compose`、`chat.messages.create` です。Gmailの権限やChat構成は、組織管理者の許可、OAuthアプリ検証、テストユーザー登録等が必要になる場合があります。Google Chatは利用するChatアプリ設定とユーザーによる認可が必要です。

| 共有先 | 直接共有の動作 |
| --- | --- |
| Drive | 新しいCSVを作成 |
| Sheets | スプレッドシートを作成し、RAWでセル文字列を設定 |
| Gmail | CSV添付付き下書きを作成。自動送信はしない |
| Chat | CSVをDriveに作成し、指定した `spaces/xxxx` にリンクを投稿 |

Chatへのリンク投稿はDriveファイルのアクセス権を変更しません。共有先に閲覧権限があるか確認してください。

## Microsoft

1. Microsoft Entraでアプリを登録します。個人アカウントも使用する場合はサポートするアカウント種類を合わせます。
2. モバイル／デスクトップ用のパブリッククライアントとして、`http://localhost:53682/oauth/callback` を登録します。秘密鍵を配布するWebアプリとして登録しないでください。
3. 委任アクセス許可 `User.Read`、`Files.ReadWrite`、`Files.Read.All`、`Mail.ReadWrite`、`offline_access` を設定します。
4. クライアントIDとテナントを入力して保存し、ログインします。既定テナントは `common` です。

| 共有先 | 動作 |
| --- | --- |
| OneDrive | 識別子付きのCSVファイルを作成 |
| Excelオンライン | 全セルを文字列としてXLSXを作り、OneDriveにアップロード |
| Outlook | CSV添付付き下書きを作成。Webの下書きから送信可 |
| Teams | CSVをOneDriveに作成し、ユーザー指定の共有画面を開く |

Teamsでは利用者が送信を確定します。OneDriveファイルのアクセス権は自動で変更しません。Outlookのアプリ起動は既定メールクライアントの `mailto:` で、ブラウザ起動と異なりファイルの自動添付はできません。

## GitHub

GitHub OAuth Appを登録し、Device Flowを有効にします。クライアントIDを入力して保存します。ログイン時にはブラウザでアプリに表示されたコードを入力します。要求権限は `gist` です。

選択または結合したデータをCSVのGistとして作成します。既定は `public: false` ですが、URLを知る人は閲覧できるため、アクセス制御された非公開リポジトリの代わりにはなりません。公開Gistは共有画面で明示的に選択します。

既存のアクセストークンでも接続できます。アプリで開く方式はGitHub Desktop用で、宛先に `owner/repository` を指定してください。GitHub DesktopはGist自体を開く機能を提供しないため、Gistはブラウザで開きます。

## Slack

Slack Appを作り、Botに `files:write` と投稿対象チャンネルへのアクセスを付与し、ワークスペースへインストールします。Bot OAuthトークンを接続設定に入力します。共有時にチャンネルIDを指定します。

Bot接続は `files.getUploadURLExternal` → アップロード → `files.completeUploadExternal` によりCSVを添付します。チャンネルにBotが参加している必要があります。

Incoming Webhookも設定できます。Webhookでは添付ファイルの送信ができないため、先頭1,400文字のCSVプレビューを設定先チャンネルに投稿します。共有画面にもこの違いを表示します。宛先の入力でWebhookの固定チャンネルは変更できません。

## Discord

DiscordのBotトークン、または対象チャンネルで作成したWebhook URLを設定します。ユーザーアカウントのトークンは使用しません。Botの場合、共有時にチャンネルIDを指定し、Botにメッセージ送信・ファイル添付権限を付与します。

どちらもCSVファイルを添付します。自動mentionは無効化しています。WebhookはURLの設定先へ送信し、宛先欄でチャンネルを変更できません。

## ブラウザ／アプリで開く

ブラウザでGmail、Chat、Sheets、Drive、OneDrive、Excel、Outlook、Discord、Slack、GitHub、Teamsを開けます。対応アプリがインストールされていればOutlook（既定メールクライアント）、Discord、Slack、GitHub Desktopを開けます。

これらは画面を開く操作です。ログイン済みAPIによる直接共有と同じではなく、自動アップロード・ファイル添付は行いません。メール作成URLの本文にはCSVの先頭4,000文字までを挿入します。その他の画面では出力済みファイルを利用者が添付してください。

## 検証状況

各共有先のリクエスト形式、SheetsのRAW、Excelの文字列セル、添付付き下書き、Slack・Discord添付、PKCEログインのローカルコールバックは自動テストで確認しています。実アカウントへのログイン・送信は未検証です。環境や契約によるAPI利用可否・認可は利用者側で確認してください。

## Markdownブロック文書の共有

結合ペイン下部の「共有」から、文書内の.md本文とグラフPNGをZIPにまとめて共有できます。Drive、OneDrive、メール下書き、Slack Bot、DiscordはZIPファイルを扱います。Google ChatはZIPのDriveリンクを投稿します。TeamsはOneDriveのZIPを使って共有画面を開きます。

Sheets／Excelオンラインは文書内の表だけを縦結合して共有します。説明文・グラフをセルに変換しません。GitHub Gistは.md本文を共有し、PNG添付は含みません。Slack Webhookは本文の先頭1,400文字までのプレビューです。共有画面に違いを明記しています。

## オンラインファイルの閲覧

Google SheetsはSheets APIの書式付き値を取得し、DriveのExcelはDrive読み取り権限で取得します。Microsoftの共有ExcelはGraphの共有リンク解決とファイル取得を使います。1.0.xで接続済みの場合は追加の読み取り権限のために再ログインしてください。組織の認可・共有権限により開けない場合があります。これらの読み取り要求はAPI契約テストで確認し、実アカウントでの接続は未検証です。
