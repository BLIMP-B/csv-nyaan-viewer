Windows 10 / 11（x64）向け CSV nyaan Viewer 1.1.3です。

「Assets」の `CSV-nyaan-Viewer-1.1.3-Windows-x64.zip` をすべて展開して `CSV nyaan Viewer.exe` を起動してください。Node.jsは不要です。

- URL入力欄を「接続」の右側、「読み取り専用」の左側へ統合し、独立した入力行をなくしました。
- 「ヘルプ → このアプリについて」にオブザーバー **BLINP_B(furoneko+)** を掲載。 https://github.com/yosu-yosu と https://yosuyosu.co.jp/ をブラウザで開けます。
- 検証環境向けの自己署名コード署名証明書で実行ファイルへSHA-256署名。公開証明書 `test-signing.cer` を同梱します。秘密鍵は配布しません。
- 配布前にAuthenticodeを検証し、実際の検証状態・署名者・実行ファイルのSHA-256を `SIGNATURE.json` に記録します。

前版の指定アイコン、Excel・オンライン読み取り、グラフ・配色・分析、範囲選択、ペイン調整機能を含みます。コア／API契約／Excel／分析／描画／署名設定テスト61件とElectron UIテスト16件を実行するWindows自動ビルドです。ソースZIP・SHA-256チェックサム・署名検証結果を添付しています。

自己署名は認証局による本人・組織確認を受けた証明書ではありません。他のWindows環境で署名を信頼する場合は、公開証明書の拇印を確認して検証用アカウントへ手動登録してください。手順は [Windowsコード署名](https://github.com/BLIMP-B/csv-nyaan-viewer/blob/main/docs/code-signing.md) を参照してください。

外部アカウントの実接続にはOAuthアプリ登録が必要で、実アカウントでの接続は未検証です。3Dは投影表示、地図は国単位です。Excel固有のグラフオブジェクト・ピボット等の完全互換はありません。Modern CSV無料版との完全な機能照合も未完了です。
