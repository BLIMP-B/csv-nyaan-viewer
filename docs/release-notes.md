Windows 10 / 11（x64）向け CSV nyaan Viewer 1.5.0です。

Assetsの `CSV-nyaan-Viewer-1.5.0-Windows-x64.zip` をすべて展開して `CSV nyaan Viewer.exe` を起動してください。Node.jsは不要です。

- 最上段に「S共有」「Sアカウント接続」を追加しました。既存の「共有」「接続」は引き続き利用できます。
- アプリ内のブラウザでGoogle・Microsoft・GitHub・Slack・Discordへログインし、サービス画面で確認後にアカウントを登録できます。Gmail、Google Chat、Sheets、Drive、OneDrive、Excelオンライン、Outlook、Teams、Discord、Slack、GitHub／Gistを用意しました。
- 選択範囲はCSV／XLSX／Markdown／TXT、元ファイル全体は内容を変えず、結合文書はMarkdown＋グラフPNGのZIPとして共有用ファイルを用意します。サービスの添付・アップロードから確認して選択し、送信・公開はサービス画面で確定します。
- テーマ切り替えの左にアカウントアイコンを表示し、クリックでログアウト確認を開きます。S接続と従来のAPI接続を選んで解除でき、Sログアウトは対象サービス群のブラウザ保存情報を消去します。
- Teamsのウェブ／アプリ接続を追加しました。Slack・Discordもアプリを開けます。外部アプリでは保存した共有ファイルを手動で添付し、そのアプリ側でログイン・ログアウトします。

コア106件・Electron UI34件の全140件をWindowsで実行し、アイコンとAuthenticode署名を検証して配布します。S内部ブラウザの検証には架空のHTTPSサービスを使用します。実サービスのログイン・送信は未検証です。Googleなどが組み込みブラウザの認証を制限する場合は、従来の「接続」を利用してください。Sアイコンは利用者によるログイン確認の記録で、サービスの有効な認証を自動検出したものではありません。

検証用の自己署名版です。公開証明書 `test-signing.cer` と検証結果 `SIGNATURE.json` を配布します。以前の証明書を登録している場合は新しい拇印を確認して更新してください。手順は [Windowsコード署名](https://github.com/BLIMP-B/csv-nyaan-viewer/blob/main/docs/code-signing.md) を参照してください。

操作・共有先ごとの差・保存範囲・上限は [接続ガイド](https://github.com/BLIMP-B/csv-nyaan-viewer/blob/main/docs/connections.md) とREADMEを参照してください。従来の閲覧・ペイン移動・分析・グラフ・出力機能を含みます。提出資料とその内容はリポジトリ・配布物に含めません。
