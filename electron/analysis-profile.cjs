'use strict';
// Workbook layout inference is separate from the viewer: original cells and
// sheet-specific display settings are never changed by analysis.
const {number}=require('./statistics.cjs');
const clean=v=>String(v??'').normalize('NFKC').trim().replace(/\s+/g,' ');
const token=v=>clean(v).replace(/\s/g,'').toLowerCase();
function role(name){
  const s=token(name);
  if(/四半期|quarter/.test(s))return 'quarter';
  if(/^(日付|日時|date|time)$/.test(s))return 'date';
  if(/^(年月|月|開始月|終了月|年度|年|month|year)$/.test(s))return 'period';
  if(/^(店舗|店舗名|店舗名称|店舗コード|店舗id|store|storeid|storename)$/.test(s))return /コード|id/.test(s)?'store-id':'store-name';
  if(/^(店長|店長名|前店長|後店長|manager|managername)$/.test(s))return 'manager';
  if(/^(データ項目|測定項目|metric|measure)$/.test(s))return 'metric';
  if(/^(id|no\.?|番号|コード|名前|名称|行名|キー|name|key|誘因用|対象ファイル|セグメント|セグメン)$/.test(s)||/(?:コード|[^\x00-\x7f]id|[_-]id)$/.test(s))return 'identifier';
  if(/^(?:分類|クラスター(?:番号|id)?|cluster(?:_?id)?|group|カテゴリ|カテゴリー|category|直営(?:fc)?|range)$/.test(s)||/クラスター$/.test(s))return 'category';
  return 'measure';
}
function period(value,kind='period'){
  const s=clean(value).replace(/\.0+$/,'');let m;
  if(/^(month|quarter|date):/.test(s))return s;
  if(kind==='date'&&(m=s.match(/^(\d{4})[年/.-](\d{1,2})[月/.-](\d{1,2})日?(.*)$/)))return `date:${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}${m[4]}`;
  if(kind==='quarter'&&/^\d{4,6}$/.test(s)&&/[1-4]$/.test(s)&&/0[1-4]$/.test(s))return 'quarter:'+s;
  if((m=s.match(/^(\d{4})[年/.-](\d{1,2})(?:月|[/.\-]\d{1,2}.*)?$/))&&+m[2]>=1&&+m[2]<=12)return `month:${m[1]}-${m[2].padStart(2,'0')}`;
  if((m=s.match(/^(\d{2}|\d{4})(\d{2})$/))&&+m[2]>=1&&+m[2]<=12)return `month:${m[1].length===2?'20'+m[1]:m[1]}-${m[2]}`;
  return s?kind+':'+s:null;
}
function identitySpec(headers,rows=[]){
  const roles=headers.map(role),find=r=>roles.indexOf(r);let entity=find('store-id');if(entity<0)entity=find('store-name');
  let entityKind='store';
  if(entity>=0&&rows.length){const names=find('store-name')>=0?find('store-name'):entity+1;if(rows.slice(0,50).some(r=>/上位|下位|全体|平均|合計|群\d/.test(clean(r[names]))))entityKind='group';}
  if(entity<0){entity=find('manager');entityKind='manager';}
  if(entity<0){entity=find('identifier');entityKind='identifier';const segment=headers.findIndex(h=>/^セグメン(?:ト)?$/.test(clean(h))&&rows.slice(0,30).filter(r=>r[headers.indexOf(h)]).every(r=>/^\d{3,8}(?:\.0+)?$/.test(clean(r[headers.indexOf(h)]))));if(segment>=0){entity=segment;entityKind='store';}}
  const quarter=find('quarter'),month=find('period'),date=find('date'),time=date>=0?date:month>=0?month:quarter;
  const keys=[...(entity>=0?[entity]:[]),...(time>=0?[time]:[])];
  const kind=time===date&&date>=0?'date':time===quarter&&quarter>=0?'quarter':'period';
  return {roles,keys,entity,entityKind,time,kind,schema:keys.length?entityKind+':'+(time>=0?kind:'none'):null};
}
function rowKey(row,spec){
  if(!spec.keys.length)return null;
  const parts=spec.keys.map(c=>c===spec.time?period(row[c],spec.kind):clean(row[c]));
  return parts.every(Boolean)?JSON.stringify(parts):null;
}
function annotate(sample){
  const spec=identitySpec(sample.headers,sample.rows);
  return {...sample,columnRoles:sample.columnRoles||spec.roles,keySchema:sample.keySchema||spec.schema,rowLabels:sample.keySchema?sample.rowLabels:spec.keys.length?sample.rows.map(r=>rowKey(r,spec)):sample.rowLabels,keyColumns:sample.keyColumns||spec.keys.map(c=>sample.headers[c])};
}
function meaningfulBounds(sheet,XLSX){
  let r=-1,c=-1;for(const [address,cell]of Object.entries(sheet))if(address[0]!=='!'&&cell&&(cell.v!==undefined&&cell.v!==null&&cell.v!==''||cell.f)){const p=XLSX.utils.decode_cell(address);r=Math.max(r,p.r);c=Math.max(c,p.c);}
  return {height:r+1,width:c+1};
}
function workbookProfile(file){
  const rows=file.cells,notes=[],name=file.sheet;
  const excluded=reason=>({tables:[],headers:[],headerRow:-1,columns:[],diagnostics:{layout:'対象外',notes:[reason],excludedColumns:[],keyColumns:[]}});
  if(!rows.length||!file.columns)return excluded('値のあるセルがありません。');
  const top=rows.slice(0,30),candidate=top.map((row,r)=>{
    const labels=row.map(clean),text=labels.filter((v,c)=>v&&number(v)===null&&v.length<180&&!nativePeriod(file,r,c)).length,keys=labels.filter(v=>role(v)!=='measure').length;
    return {r,score:text+keys*20};
  }).sort((a,b)=>b.score-a.score||a.r-b.r)[0];
  const headerRow=candidate.r;
  const original=rows[headerRow].map(clean),first=original.findIndex(Boolean);
  if(first<0)return excluded('列見出しを推定できませんでした。範囲またはテーブルを指定してください。');
  let end=file.columns;
  // A gap or a numeric annotation after named columns starts a separate table.
  for(let c=first+1;c<original.length;c++){
    if(!original[c]){end=c;break;}
    if(c>first+2&&number(original[c])!==null&&(period(original[c])?.startsWith('period:')||original.slice(first,c).some(v=>v&&number(v)===null&&role(v)==='measure'))){end=c;break;}
  }
  // Repeated monthly measure names use a preceding row of dates.
  let periodRow=-1,periodColumns=[],periodKind='period',periodLabels=[];
  for(let r=0;r<=headerRow;r++){
    const labels=rows[r].map((v,c)=>nativePeriod(file,r,c)||period(v)),cols=labels.flatMap((v,c)=>c>=first&&v?.startsWith('month:')?[c]:[]);
    if(cols.length>=3&&cols.length>periodColumns.length){periodRow=r;periodColumns=cols;periodLabels=labels;}
  }
  const metricCol=original.findIndex(v=>role(v)==='metric');
  if(metricCol>=0){const cols=original.flatMap((v,c)=>c>metricCol&&/^\d{4,6}$/.test(v)&&/0[1-4]$/.test(v)?[c]:[]);if(cols.length>=3){periodRow=headerRow;periodColumns=cols;periodKind='quarter';periodLabels=original.map(v=>period(v,periodKind));}}
  const columns=Array.from({length:Math.max(0,end-first)},(_,i)=>first+i),headers=columns.map(c=>original[c]||String.fromCharCode(65+c));
  if(first>0&&/店舗/.test(original[first])&&rows.slice(headerRow+1,headerRow+5).some(r=>number(r[first-1])!==null)){columns.unshift(first-1);headers.unshift('店舗コード（推定）');}
  const normalizedHeaders=headers.map(h=>h==='店舗コード（推定）'?'店舗コード':h);
  const data=[];for(let r=headerRow+1;r<rows.length;r++)if(columns.some(c=>rows[r][c]?.trim()))data.push({source:r+1,values:columns.map(c=>value(file,r,c,role(normalizedHeaders[columns.indexOf(c)])))});
  const spec=identitySpec(normalizedHeaders,data.map(d=>d.values));
  const diagnostic={layout:'行形式',headerRow:headerRow+1,address:columns.length?`${columnName(columns[0])}${headerRow+1}:${columnName(columns.at(-1))}${rows.length}`:'',notes,excludedColumns:normalizedHeaders.filter((_,i)=>spec.roles[i]!=='measure'),keyColumns:spec.keys.map(c=>normalizedHeaders[c])};
  if(headerRow>0)notes.push(`${headerRow+1}行目を列見出しとして推定しました。`);
  if(end<file.columns)notes.push('主表の右側にある空列・別表・注記を全域分析から除外しました。');
  if(spec.keys.length>1)notes.push('店舗などの識別子と期間を組み合わせて行を照合します。年月と四半期は別の観測単位です。');
  notes.push('数式はブックに保存された値を使用します。再計算は行いません。');
  if(spec.entityKind==='group')notes.push('集計済みの群の平均です。店舗単位の結果とは別に扱います。');
  const hasNamedMeasuresBeforePeriods=periodColumns.length&&columns.some(c=>c<periodColumns[0]&&role(original[c])==='measure'&&original[c]&&number(original[c])===null);
  let numericPeriodValues=0,periodValues=0;for(let r=headerRow+1;r<rows.length;r++)for(const c of periodColumns){const v=value(file,r,c,'measure');if(!v||/^#/.test(v)||v[0]==='=')continue;periodValues++;if(number(v)!==null)numericPeriodValues++;}
  if(periodColumns.length>=3&&spec.entity>=0&&numericPeriodValues/Math.max(1,periodValues)>=.8&&(metricCol>=0||!hasNamedMeasuresBeforePeriods)){
    const entityColumn=columns[spec.entity],records=new Map(),measures=[],measureSet=new Set(),itemColumn=metricCol;
    for(let r=headerRow+1;r<rows.length;r++){
      const entity=clean(rows[r][entityColumn]);if(!entity)continue;
      const item=itemColumn>=0?clean(rows[r][itemColumn]):clean(original[periodColumns[0]])||name;
      if(!item||/店長名|店舗名|店舗コード/.test(item))continue;
      for(const c of periodColumns){const v=value(file,r,c,'measure');if(number(v)===null)continue;const p=periodLabels[c],key=JSON.stringify([entity,p]);if(!records.has(key))records.set(key,{entity,p,source:r+1,values:new Map()});const record=records.get(key);
        if(record.values.has(item)&&record.values.get(item)!==v){notes.push('同じ店舗・期間・項目の重複値があり、横持ち表の自動展開を中止しました。範囲を指定してください。');return {tables:[],headers:normalizedHeaders,headerRow,columns,diagnostics:diagnostic};}
        record.values.set(item,v);if(!measureSet.has(item)){measureSet.add(item);measures.push(item);}
      }
    }
    const output=[...records.values()].map(d=>({source:d.source,values:[d.entity,d.p,...measures.map(m=>d.values.get(m)||'')]})),hs=[normalizedHeaders[spec.entity],periodKind==='quarter'?'四半期タグ':'年月',...measures];
    const ids=identitySpec(hs,output.map(d=>d.values));diagnostic.layout='横持ち表 → 店舗・期間ごとの観測';diagnostic.keyColumns=hs.slice(0,2);diagnostic.excludedColumns=hs.slice(0,2);notes.push('分析時だけ横持ちの期間列を展開します。セル表示と元ファイルは変更しません。');
    return {tables:[makeTable(hs,output,ids,diagnostic)],headers:normalizedHeaders,headerRow,columns,diagnostics:diagnostic};
  }
  if(metricCol>=0&&columns.includes(metricCol)){
    const index=columns.indexOf(metricCol),groups=new Map();for(const d of data){const key=clean(d.values[index]);if(!key||/店長名/.test(key))continue;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(d);}
    if(groups.size>1){diagnostic.layout='項目別の表';notes.push('測定項目ごとに分けて比較します。異なる項目を同じ変量に混ぜません。');return {tables:[...groups].map(([label,ds])=>({...makeTable(normalizedHeaders,ds,spec,{...diagnostic,notes:[...notes]}),groupName:label,keySchema:'item:'+label})),headers:normalizedHeaders,headerRow,columns,diagnostics:diagnostic};}
  }
  const table=makeTable(normalizedHeaders,data,spec,diagnostic);
  if(!table.rows.some(r=>r.some((v,c)=>spec.roles[c]==='measure'&&number(v)!==null)))return excluded('数値の測定項目が見つかりません。識別子や履歴だけの表は数値分析から除外しました。');
  return {tables:[table],headers:normalizedHeaders,headerRow,columns,diagnostics:diagnostic};
}
function makeTable(headers,data,spec,diagnostics){return {headers,rows:data.map(d=>d.values),sourceRows:data.map(d=>d.source),rowLabels:data.map(d=>rowKey(d.values,spec)),columnRoles:spec.roles,keySchema:spec.schema,keyColumns:spec.keys.map(c=>headers[c]),diagnostics};}
function value(file,r,c,kind){const cell=file.workbook.Sheets[file.sheet][columnName(c)+(r+1)];if(kind==='measure'&&cell?.t==='n'&&Number.isFinite(cell.v)&&!require('@e965/xlsx').SSF.is_date(cell.z||''))return String(cell.v);return file.cells[r]?.[c]||'';}
function nativePeriod(file,r,c){const cell=file.workbook.Sheets[file.sheet][columnName(c)+(r+1)],SSF=require('@e965/xlsx').SSF;if(cell?.t!=='n'||!SSF.is_date(cell.z||''))return null;const d=SSF.parse_date_code(cell.v,{date1904:!!file.workbook.Workbook?.WBProps?.date1904});if(!d)return null;const month=d.d===1&&!d.H&&!d.M&&!d.S;return `${month?'month':'date'}:${d.y}-${String(d.m).padStart(2,'0')}${month?'':'-'+String(d.d).padStart(2,'0')}`;}
function columnName(c){let s='';for(c++;c;c=Math.floor((c-1)/26))s=String.fromCharCode(65+(c-1)%26)+s;return s;}
function sampleProfile(table,limits={}){
  const cap=Math.max(0,Math.min(256,limits.columns??256)),cols=Array.from({length:Math.min(cap,table.headers.length)},(_,i)=>i),n=cols.length?Math.min(table.rows.length,limits.rows??5000,Math.floor((limits.cells??250000)/cols.length)):0;
  const ordinals=(limits.ordinals||Array.from({length:n},(_,i)=>n===1?0:Math.floor(i*(table.rows.length-1)/(n-1)))).filter(r=>Number.isInteger(r)&&r>=0&&r<table.rows.length);
  return {...table,headers:cols.map(c=>table.headers[c]),columnRoles:cols.map(c=>table.columnRoles[c]),rows:ordinals.map(r=>cols.map(c=>table.rows[r][c])),sourceRows:ordinals.map(r=>table.sourceRows[r]),rowLabels:ordinals.map(r=>table.rowLabels[r]),sampleOrdinals:ordinals,populationRows:table.rows.length,populationColumns:table.headers.length,truncated:ordinals.length<table.rows.length||cols.length<table.headers.length,...(limits.rows===0?{rowKeys:table.rowLabels}: {})};
}
module.exports={role,period,identitySpec,rowKey,annotate,meaningfulBounds,workbookProfile,sampleProfile,columnName};
