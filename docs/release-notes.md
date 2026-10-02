Windows 10 / 11（x64）向け CSV nyaan Viewer 1.2.2です。

Assetsの `CSV-nyaan-Viewer-1.2.2-Windows-x64.zip` をすべて展開して `CSV nyaan Viewer.exe` を起動してください。Node.jsは不要です。

起動直後の案内画面を変更しました。

- キャッチコピー：さっくり分析、にゃーんと解決！
- 見出し：CSV nyaan Viewerと実際のアプリバージョンを表示。将来の更新時もバージョンが自動で反映されます。
- 対応ファイル例を次の3行に変更しました。

```text
（よめる）.csv , .md , .txt
（だいたいよめる）.xlsx , .xl～なんちゃら , .prn , .obs
（きっとよめる）Googleスプレッドシート(URL) , MicrosoftExcelOnline(URL)
```

起動画面をライト／ダークで確認しています。Windowsではコア77件・UI24件の全101件を実行し、アイコンとAuthenticode署名を検証して配布します。

v1.2.1の境界でのペイン開閉を含む、読み取り専用閲覧・分析・テーブル管理・各種出力・共有・接続機能を含みます。操作と上限はREADMEを参照してください。

検証用の自己署名版です。公開証明書 `test-signing.cer` と検証結果 `SIGNATURE.json` を配布します。以前の証明書を登録している場合は新しい拇印を確認して更新してください。手順は [Windowsコード署名](https://github.com/BLIMP-B/csv-nyaan-viewer/blob/main/docs/code-signing.md) を参照してください。

外部アカウントの実接続にはOAuth登録が必要で、実接続は未検証です。Excel固有のチャート・ピボットの完全互換、およびModern CSV無料版の完全な機能照合は未完了です。
