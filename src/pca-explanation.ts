import type {AnalysisResult,PrincipalComponents} from './analysis-types';
import type {PlotModel} from './analysis-plot';

export interface PcaLegendItem {label:string;detail:string;colorIndex:number}
export interface PcaExplanation {
  introduction:string;
  observations:string;
  components:{name:string;text:string}[];
  steps:{title:string;text:string}[];
  colorMeaning:string;
  legend:PcaLegendItem[];
  notes:string[];
}
type Context=Pick<AnalysisResult,'correlatedOnly'|'diagnostics'|'truncated'|'alignment'>;
export function pcaExplanation(pca:PrincipalComponents,model:PlotModel,context?:Context):PcaExplanation {
  const comparing=model.seriesNames.length>1,settings=context?.diagnostics?.settings;
  const components=[
    '標準化した数値を組み合わせ、観測行のばらつきを最も多く説明する方向です。',
    'PC1と直交し、PC1では説明できないばらつきを最も多く説明する方向です。',
    'PC1・PC2の両方と直交し、残りのばらつきを最も多く説明する方向です。',
  ].map((text,i)=>({name:'PC'+(i+1),text:text+(i<pca.loadings.length?` 今回の寄与率は${((pca.explained[i]||0)*100).toFixed(1)}%です。`:' 今回は2変量のため算出されていません。3D表示の既定のZ軸は0です。')}));
  const legend=comparing?model.seriesNames.map((name,i)=>({label:'系列'+(i+1),detail:name.replace(/^系列\d+：/,''),colorIndex:i})):pca.clusters.length?pca.clusters.map((count,i)=>({label:'群'+(i+1),detail:count+'件（計算対象）',colorIndex:i})):[{label:'全観測',detail:'群分けなし',colorIndex:0}];
  const groupMethod=pca.clusters.length?`完全な数値行が6行以上の場合、最初の最大3主成分の座標でk-means法を実行します。群数k = min(3, floor(√(行数 / 2)))で、今回は${pca.clusters.length}群です。最初の行と、既存の中心から最も遠い点で中心を初期化し、最も近い中心への割り当てと中心の平均値への更新を、割り当てが変わらなくなるか50回まで繰り返します。`:'完全な数値行が6行未満のため、今回は群分けを行いません。';
  const steps=[
    {title:'ファイル・範囲の読み取りと対応付け',text:'選択した分析シート・範囲・テーブルから観測と数値項目を推定します。Excelの数式は保存済みの値を参照し、再計算・マクロ実行は行いません。複数範囲では照合キーや行名で対応付けできる場合は名前で、できない場合は各範囲の先頭から同じ行位置で対応付けます。同名列は自動合流が有効で、値の一致を確認できた場合に合流し、値が異なる場合や標本だけでは確認できない場合は別の項目として保持します。'+(context?.alignment?' 今回の対応：'+context.alignment.mode+'。':'')},
    {title:'数値項目の採用・除外',text:'初期設定では識別子・期間・分類と推定した項目や、数値と文章の混在で数値が80%未満の項目を除外します。「自動判断・ユーザー設定」と列ごとのチェックボックスで変更できます。'+(settings?` 現在、識別子・期間・分類の自動除外は${settings.autoExclude?'有効':'無効'}、同名列の自動合流は${settings.mergeSameName?'有効':'無効'}です。`:'')+(context?.correlatedOnly?' 現在は3組以上でPearson相関またはSpearman順位相関の絶対値が0.7以上の組合せに含まれる変量を採用しています。':' 相関の強さによる候補の絞り込みは行わず、指定対象の数値項目を比較します。')+' 定数列を除き、3行以上数値がある最大64変量を相関の候補にし、その列順で先頭の最大16変量を主成分に使用します。64変量を超える場合は欠損の少ない列を優先します。'},
    {title:'数値の解釈と欠損行の除外',text:'通貨記号・桁区切り・末尾の%を除いて数値として読める値を使用します。文字列の12%は12として扱い、0.12への換算は行いません。主成分では採用した全変量が数値の行だけを使用し、空欄・非数値を0で補完しません。計算には2変量以上・完全な数値行3行以上が必要です。今回は'+pca.completeRows+'行・'+pca.dimensions.length+'変量です。'},
    {title:'標準化と共分散行列',text:'完全な数値行だけで各変量の平均と標本標準偏差（分母は行数−1）を求め、Z = (値−平均) / 標準偏差に標準化します。これにより単位や桁の違いの影響を抑えます。標準偏差が0の場合の標準化値は0です。共分散行列の各要素は、対応するZの積の合計 / (行数−1)です。'},
    {title:'PCの係数・座標・寄与率',text:'対称な共分散行列をJacobi法で固有値分解し、固有値の大きい順にPC1・PC2・PC3とします。計算は非対角要素の最大絶対値が10⁻¹⁰未満、または80×変量数²回で終了します。各点のPC座標は「標準化値×対応する係数」の合計です。この画面の「負荷量」はその係数（固有ベクトル）で、絶対値が大きい項目を軸の説明に表示します。寄与率は「そのPCの固有値 / 全PCの固有値の合計」で、表示中の2〜3軸がどの程度のばらつきを説明するかを示します。'},
    {title:'群分けと描画',text:groupMethod+' 分析用の標本は各観測・項目につき最大5,000行・250,000セル・256列です。上限を超える行は等間隔に抽出します。'+(context?.truncated?'今回は上限により対象の一部を分析しています。':'')+'計算後の描画は最大500点/系列に間引きます。群の件数は描画点数ではなく、完全な数値行全体の件数です。'},
  ];
  return {
    introduction:'PC1・PC2・PC3は複数の数値項目をまとめた新しい軸です。ばらつきを多く説明する順に並び、元の列名や順位を表しません。',
    observations:'1点は分析用の1観測行です。複数範囲の集計では対応付け後の1行を表します。'+(comparing?' 2系列比較では同じ観測行を系列ごとに描きます。':''),
    components,steps,legend,
    colorMeaning:comparing?'現在の色は比較する系列を表します。同じ色の点が同じ軸の項目の組合せで、推定した群の色分けにはなりません。':(pca.clusters.length?'現在の色は、最大3主成分の座標で似た傾向と推定した群を表します。ファイル・シートや元データの分類を表す色ではありません。':'現在は群分けを行っていないため、全観測を同じ色で表示します。'),
    notes:[
      '群の番号・色に優劣や大小の意味はありません。PC3が算出されている場合、2Dで重なる点もPC3の違いにより別の群になる場合があります。軸の切り替えや回転では群分けを再計算しません。',
      '軸を元データの列へ変更した場合も、標準化した値を表示します。各軸の2項目目を選ぶと2系列の比較に切り替わります。線は観測行の順番を結び、群の境界や回帰線を表しません。3DホイールのX・Y・Zの色は方向の目印で、点の群・系列とは別です。',
      '主成分の正負の向きは反転しても同じ構造を表します。寄与率は予測の正解率ではなく、群分けも推定です。相関は因果関係や将来の結果を保証しません。分析は元のセル文字列を変更しません。',
    ],
  };
}
export function pcaExplanationParagraphs(explanation:PcaExplanation):string[] {
  const colorNames=['青系','緑系','オレンジ系','紫系'];
  return [explanation.introduction,explanation.observations,...explanation.components.map(c=>c.name+'：'+c.text),...explanation.steps.map(s=>s.title+'：'+s.text),explanation.colorMeaning,...explanation.legend.map(l=>`${colorNames[l.colorIndex%4]}：${l.label} · ${l.detail}`),...explanation.notes];
}
