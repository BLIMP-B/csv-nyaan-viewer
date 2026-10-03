Windows 10 / 11（x64）向け CSV nyaan Viewer 1.5.7です。

Assetsの `CSV-nyaan-Viewer-1.5.7-Windows-x64.zip` をすべて展開して `CSV nyaan Viewer.exe` を起動してください。Node.jsは不要です。

- 多変量分析の2D・3Dグラフにクラスター中心を追加しました。通常の点より大きい菱形と群名で示し、カーソルを重ねると群の件数と座標を確認できます。
- 重心は描画の間引き前の完全な数値行から計算します。表示点に含まれない小さな群にも対応し、PC／標準化した元列の軸、各軸2項目の系列比較、3Dホイール・回転に追従します。軸を変更しても群分けは保持します。
- PNG・GIF・分析のMD・XLSX出力にも中心を表示します。分析資料には現在の軸に対応した重心・件数の表を含みます。OBJには通常点より大きい閉じた八面体と群名・件数を含めます。
- 中心ラベルが重なる場合は配置をずらし、ライト・ダーク両配色に対応しました。

コア129件・Electron UI42件の全171件をWindowsで実行し、アイコンとAuthenticode署名を検証して配布します。

検証用の自己署名版です。公開証明書 `test-signing.cer` と検証結果 `SIGNATURE.json` を配布します。以前の証明書を登録している場合は新しい拇印を確認して更新してください。手順は [Windowsコード署名](https://github.com/BLIMP-B/csv-nyaan-viewer/blob/main/docs/code-signing.md) を参照してください。
