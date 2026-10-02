Windows 10 / 11（x64）向け CSV nyaan Viewer 1.1.5です。

「Assets」の `CSV-nyaan-Viewer-1.1.5-Windows-x64.zip` をすべて展開して `CSV nyaan Viewer.exe` を起動してください。Node.jsは不要です。

- 非表示の行・列はグレーアウトしながら値を表示するように変更しました。背景と文字の色差を小さくし、ライト／ダーク両方で控えめに値を確認できます。
- セルにマウスを重ねると、グレー表示でも値の全文を確認できます。
- 行・列の交差部分も表示し、表示へ戻すと通常の配色に復元します。全3アクセントと両テーマのUIテストで確認します。
- 検証用の自己署名コード署名を継続。公開証明書 `test-signing.cer` と署名検証結果 `SIGNATURE.json` を配布します。

前版のURL欄配置・オブザーバー表示・指定アイコン、Excel・オンライン読み取り、グラフ・分析、範囲選択、ペイン調整機能を含みます。コア／API契約／Excel／分析／描画／署名設定テスト61件とElectron UIテスト18件を実行するWindows自動ビルドです。ソースZIP・SHA-256チェックサム・署名検証結果を添付しています。[テーマ配色の確認](https://github.com/BLIMP-B/csv-nyaan-viewer/blob/main/docs/theme-audit.md) に確認対象と検証方法を記載しています。

自己署名は認証局による本人・組織確認を受けた証明書ではありません。他のWindows環境で署名を信頼する場合は、公開証明書の拇印を確認して検証用アカウントへ手動登録してください。手順は [Windowsコード署名](https://github.com/BLIMP-B/csv-nyaan-viewer/blob/main/docs/code-signing.md) を参照してください。

外部アカウントの実接続にはOAuthアプリ登録が必要で、実アカウントでの接続は未検証です。3Dは投影表示、地図は国単位です。Excel固有のグラフオブジェクト・ピボット等の完全互換はありません。Modern CSV無料版との完全な機能照合も未完了です。
