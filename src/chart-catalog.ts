export interface ChartKind { id:string; name:string; family:string; horizontal?:boolean; stacked?:boolean; percent?:boolean; depth?:boolean; markers?:boolean; smooth?:boolean; shape?:string }
export const CHART_KINDS:ChartKind[]=[];
const add=(family:string,id:string,name:string,flags:Partial<ChartKind>={})=>CHART_KINDS.push({family,id,name,...flags});
for(const [prefix,family,horizontal] of [['column','縦棒',false],['horizontal','横棒',true]] as const){
  for(const [suffix,label,stacked,percent] of [['','集合',false,false],['-stacked','積み上げ',true,false],['-percent','100%積み上げ',true,true]] as const){
    add(family,prefix+suffix,label+family,{horizontal,stacked,percent});
    add(family,prefix+suffix+'-3d','3D '+label+family,{horizontal,stacked,percent,depth:true});
    for(const [shape,label2] of [['cylinder','円柱'],['cone','円錐'],['pyramid','角錐']] as const)add(family,prefix+suffix+'-'+shape,label2+' '+label+family,{horizontal,stacked,percent,depth:true,shape});
  }
}
add('縦棒','bar','棒グラフ');add('縦棒','column-3d','3D 縦棒（奥行き）',{depth:true});
for(const [prefix,family] of [['line','折れ線'],['area','面']] as const){
  for(const [suffix,label,stacked,percent] of [['','',false,false],['-stacked','積み上げ ',true,false],['-percent','100%積み上げ ',true,true]] as const){
    add(family,prefix+suffix,label+family,{stacked,percent});
    if(prefix==='line')add(family,prefix+suffix+'-markers',label+'マーカー付き折れ線',{stacked,percent,markers:true});
    add(family,prefix+suffix+'-3d','3D '+label+family,{stacked,percent,depth:true});
  }
}
for(const [id,name,depth] of [['pie','円',false],['pie-exploded','分割円',false],['pie-3d','3D 円',true],['pie-exploded-3d','3D 分割円',true],['pie-of-pie','補助円付き円',false],['bar-of-pie','補助棒付き円',false],['doughnut','ドーナツ',false],['doughnut-exploded','分割ドーナツ',false]] as const)add('円・ドーナツ',id,name,{depth});
for(const [id,name,markers,smooth] of [['scatter','散布図（マーカー）',true,false],['scatter-smooth-markers','平滑線とマーカー',true,true],['scatter-smooth','平滑線',false,true],['scatter-lines-markers','直線とマーカー',true,false],['scatter-lines','直線',false,false]] as const)add('散布図',id,name,{markers,smooth});
add('バブル','bubble','バブル');add('バブル','bubble-3d','3D 効果付きバブル',{depth:true});
for(const [id,name] of [['stock-hlc','高値・安値・終値'],['stock-ohlc','始値・高値・安値・終値'],['stock-volume-hlc','出来高・高値・安値・終値'],['stock-volume-ohlc','出来高・始値・高値・安値・終値']] as const)add('株価',id,name);
for(const [id,name,depth] of [['surface-3d','3D 等高線（サーフェス）',true],['surface-wireframe','3D ワイヤーフレーム',true],['surface-contour','等高線',false],['surface-contour-wireframe','等高線ワイヤーフレーム',false]] as const)add('等高線',id,name,{depth});
for(const [id,name] of [['radar','レーダー'],['radar-markers','マーカー付きレーダー'],['radar-filled','塗りつぶしレーダー']] as const)add('レーダー',id,name);
for(const [id,name,family] of [['treemap','ツリーマップ','階層'],['sunburst','サンバースト','階層'],['histogram','ヒストグラム','統計'],['pareto','パレート','統計'],['boxplot','箱ひげ図','統計'],['waterfall','ウォーターフォール','その他'],['funnel','ファネル','その他'],['map','塗り分け地図','地図'],['combo','集合縦棒・折れ線','組み合わせ'],['combo-secondary','集合縦棒・第2軸折れ線','組み合わせ'],['combo-stacked','積み上げ面・集合縦棒','組み合わせ']] as const)add(family,id,name);
// Keep stable identifiers while avoiding duplicate variants.
for(let i=CHART_KINDS.length-1;i>=0;i--)if(CHART_KINDS.findIndex(k=>k.id===CHART_KINDS[i].id)!==i)CHART_KINDS.splice(i,1);
export const CHART_FAMILIES=[...new Set(CHART_KINDS.map(k=>k.family))];
export const COLOR_SETS={
  office:{name:'Office',colors:['#4472c4','#ed7d31','#a5a5a5','#ffc000','#5b9bd5','#70ad47']},
  fluent:{name:'Fluent',colors:['#0f6cbd','#107c41','#5b5fc7','#d83b01','#c239b3','#038387','#ca5010','#8764b8']},
  vibrant:{name:'鮮やか',colors:['#0078d4','#e74856','#16c60c','#886ce4','#ffb900','#00b7c3']},
  pastel:{name:'パステル',colors:['#85b6d9','#f3b7a4','#a7cfb5','#c4b1dc','#edce82','#a4d3d8']},
  earth:{name:'アース',colors:['#577590','#90a955','#bc6c25','#9d8189','#6b705c','#d4a373']},
  accessible:{name:'色覚に配慮',colors:['#0072b2','#e69f00','#009e73','#cc79a7','#d55e00','#56b4e9']},
  mono:{name:'ブルー濃淡',colors:['#08306b','#08519c','#2171b5','#4292c6','#6baed6','#9ecae1']},
};
export type Palette=keyof typeof COLOR_SETS;
export const chartKind=(id:string)=>CHART_KINDS.find(k=>k.id===id)||CHART_KINDS.find(k=>k.id==='bar')!;
