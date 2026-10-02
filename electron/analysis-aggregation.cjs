'use strict';
const {analyze}=require('./statistics.cjs');
// All sources share the same relative row ordinals; unequal lengths stay blank.
function joinSamples(samples,ordinals){
  const seen=new Set(),shared=new Set();for(const sample of samples){for(const key of new Set((sample.rowLabels||[]).filter(v=>v!==null))){if(seen.has(key))shared.add(key);seen.add(key);}}
  const named=shared.size>0,keys=[],keySet=new Set(),maps=samples.map(s=>{const counts=new Map();return new Map(s.sampleOrdinals.map((ordinal,i)=>{const label=s.rowLabels?.[i],base=named&&label!==null&&label!==undefined?'name:'+label:'row:'+ordinal,n=counts.get(base)||0;counts.set(base,n+1);const key=base+'#'+n;if(!keySet.has(key)){keys.push(key);keySet.add(key);}return [key,s.rows[i]];}));});
  let selected=named?keys:ordinals.map(r=>'row:'+r+'#0'),truncated=false;
  if(selected.length>ordinals.length&&ordinals.length){const all=selected;selected=Array.from({length:ordinals.length},(_,i)=>all[Math.floor(i*(all.length-1)/Math.max(1,ordinals.length-1))]);truncated=true;}
  const candidates=samples.flatMap((s,i)=>{const occurrences=new Map();return s.headers.map((h,c)=>{const n=occurrences.get(h)||0;occurrences.set(h,n+1);return {name:h,key:h+'#'+n,source:i,values:selected.map(key=>maps[i].get(key)?.[c]??'')};});}),columns=[];let mergedColumns=0,conflictingColumns=0;
  for(const candidate of candidates){const existing=columns.find(c=>c.key===candidate.key&&!c.values.some((v,r)=>v!==''&&candidate.values[r]!==''&&v!==candidate.values[r]));if(existing){existing.values=existing.values.map((v,r)=>v||candidate.values[r]);existing.sources.push(candidate.source);mergedColumns++;}else{if(columns.some(c=>c.key===candidate.key))conflictingColumns++;columns.push({...candidate,sources:[candidate.source]});}}
  return {headers:columns.map(c=>c.sources.length>1?c.name+'（合流）':`${c.source+1}. ${samples[c.source].name} | ${c.name}`),rows:selected.map((_,r)=>columns.map(c=>c.values[r])),sourceRows:selected.map((_,i)=>i+1),populationRows:named?Math.max(selected.length,...samples.map(s=>s.populationRows)):Math.max(0,...samples.map(s=>s.populationRows)),populationColumns:columns.length,truncated:truncated||samples.some(s=>s.truncated),alignment:{mode:named?'行名で対応（重複は出現順）':'先頭からの行位置で対応',mergedColumns,conflictingColumns},sources:samples.map(s=>({name:s.name,populationRows:s.populationRows,populationColumns:s.populationColumns,sampledRows:s.rows.length,sampledColumns:s.headers.length}))};
}
async function aggregate(sources,read){
  if(!Array.isArray(sources)||!sources.length||sources.length>256)throw Error('集計元は1〜256個で指定してください。');
  const metadata=await Promise.all(sources.map(source=>read(source,{rows:0,cells:0})));
  const totalColumns=metadata.reduce((n,s)=>n+s.populationColumns,0),maxRows=Math.max(0,...metadata.map(s=>s.populationRows));
  // Give each nonempty source one column, then distribute the remaining budget.
  const quotas=metadata.map(s=>s.populationColumns?1:0);let budget=256-quotas.reduce((n,c)=>n+c,0);
  while(budget>0){let assigned=false;for(let i=0;i<quotas.length&&budget>0;i++)if(quotas[i]<metadata[i].populationColumns){quotas[i]++;budget--;assigned=true;}if(!assigned)break;}
  const width=quotas.reduce((n,c)=>n+c,0),n=width?Math.min(maxRows,5000,Math.floor(250000/width)):0;
  const ordinals=Array.from({length:n},(_,i)=>n===1?0:Math.floor(i*(maxRows-1)/(n-1)));
  const samples=await Promise.all(sources.map(async(source,i)=>({...await read(source,{rows:n,columns:quotas[i],cells:250000,ordinals}),name:source.name})));
  const table=joinSamples(samples,ordinals);table.truncated ||= n<maxRows||width<totalColumns;
  return analyze(table,true,{correlatedOnly:sources.every(s=>s.all)});
}
function sampleTable(source,limits){
  const t=source.table;if(!t||!Array.isArray(t.headers)||!Array.isArray(t.rows)||t.headers.length*t.rows.length>100000)throw Error('テーブルが不正、または大きすぎます。');
  const cap=Math.min(t.headers.length,limits.columns??256),columns=cap===1?[0]:Array.from({length:cap},(_,i)=>Math.round(i*(t.headers.length-1)/Math.max(1,cap-1)));
  const ordinals=(limits.ordinals||[]).filter(r=>r<t.rows.length);const labels=t.rowLabels||t.rows.map(row=>{const named=t.headers.findIndex(h=>/^(?:ID|名前|名称|日付|日時|年月|月|行名|キー|name|date|time|key)$/i.test(h));if(named>=0)return row[named]||null;const {number}=require('./statistics.cjs');return row.find(v=>v&&number(v)===null)||null;});
  return {headers:columns.map(c=>String(t.headers[c])),rows:ordinals.map(r=>columns.map(c=>String(t.rows[r]?.[c]??''))),sampleOrdinals:ordinals,rowLabels:ordinals.map(r=>labels[r]),populationRows:t.rows.length,populationColumns:t.headers.length,truncated:ordinals.length<t.rows.length||cap<t.headers.length};
}
module.exports={aggregate,joinSamples,sampleTable};
