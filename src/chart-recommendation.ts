import {chartData,type TableData} from './data';
export function recommendChart(table:TableData){
  const model=chartData(table),headers=table.headers.join(' '),series=model.series,n=table.rows.length;
  const choose=(type:string,reason:string,confidence:number)=>({type,reason,confidence});
  if(/(?:高値|high)/i.test(headers)&&/(?:安値|low)/i.test(headers)&&/(?:終値|close)/i.test(headers))return choose(/(?:出来高|volume)/i.test(headers)?/始値|open/i.test(headers)?'stock-volume-ohlc':'stock-volume-hlc':/始値|open/i.test(headers)?'stock-ohlc':'stock-hlc','高値・安値・終値の列名を検出',.95);
  if(/(?:国|country|地域|region)/i.test(headers)&&series.length)return choose('map','地域を表す列名と数値列を検出',.8);
  if(/(?:階層|path|親|parent)/i.test(headers))return choose('treemap','階層を表す列名を検出',.8);
  if(series.length>=2&&/(?:^|[\s_])x(?:$|[\s_])|横軸|経度|longitude/i.test(headers)&&/(?:^|[\s_])y(?:$|[\s_])|縦軸|緯度|latitude/i.test(headers))return choose(series.length>=3&&/size|大きさ|規模/i.test(headers)?'bubble':'scatter','X/Y座標を表す列名を検出',.93);
  const values=series[0]?.values.filter((v):v is number=>v!==null)||[],mean=values.reduce((a,b)=>a+b,0)/Math.max(values.length,1),sd=Math.sqrt(values.reduce((s,v)=>s+(v-mean)**2,0)/Math.max(values.length,1));
  if(series.length===1&&/割合|比率|share|percent|%/i.test(headers)&&values.every(v=>v>=0)&&n<=10)return choose('doughnut','割合を表す数値列と少数のカテゴリ',.86);
  const temporal=/日付|日時|年月|時間|month|date|time|年|月/i.test(table.headers[0]||'')||model.labels.filter(l=>/^\d{4}[-/]|\d+月$|^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(l)).length>=n*.75;
  if(temporal&&n>=3)return choose('line','時間・月のラベルと連続する複数の観測値',.88);
  if(series.length===1&&(table.headers.length===1||table.headers[0]==='行ラベル（推定）'&&model.labels.every(l=>/^\d+$/.test(l)))&&n>=15)return choose('histogram',`ラベルのない数値列の分布（変動係数 ${mean?Math.abs(sd/mean).toFixed(2):'—'}）`,.8);
  if(series.length>=2&&/index|step|連番|観測番号/i.test(series[0].label)&&n>=4){const x=series[0].values.filter((v):v is number=>v!==null),steps=x.slice(1).map((v,i)=>v-x[i]),average=steps.reduce((s,v)=>s+v,0)/Math.max(steps.length,1);if(average>0&&steps.every(v=>Math.abs(v-average)<Math.max(1e-8,Math.abs(average)*.02)))return choose('line','規則的な観測間隔と連続した数値系列',.82);}
  if(series.length>=2&&table.headers.length===series.length&&n>=3)return choose('scatter','複数の数値変量の関係を確認',.72);
  if(n>12&&series.length<=3)return choose('horizontal','カテゴリ数が多いため横棒でラベルを表示',.72);
  if(series.length>=2){const magnitudes=series.map(s=>Math.max(...s.values.map(v=>Math.abs(v||0))));if(Math.max(...magnitudes)>Math.max(Math.min(...magnitudes.filter(v=>v>0)),1)*20)return choose('combo-secondary','系列の規模が大きく異なるため第2軸を使用',.75);}
  return choose('column','カテゴリごとの大小と系列の比較',.65);
}
