'use strict';
const {analyze}=require('./statistics.cjs');
const {role,identitySpec,rowKey}=require('./analysis-profile.cjs');
// All sources share the same relative row ordinals; unequal lengths stay blank.
function joinSamples(samples,ordinals,options={}){
  const seen=new Set(),shared=new Set();for(const sample of samples){for(const key of new Set((sample.rowLabels||[]).filter(v=>v!==null))){if(seen.has(key))shared.add(key);seen.add(key);}}
  const composite=samples.length>0&&samples.every(s=>s.keyColumns?.length>1),named=shared.size>0||composite||samples.some(s=>s.truncated&&s.keySchema),keys=[],keySet=new Set(),maps=samples.map((s,source)=>{const counts=new Map();return new Map(s.sampleOrdinals.map((ordinal,i)=>{const label=s.rowLabels?.[i],base=named&&label!==null&&label!==undefined?'name:'+label:composite?'missing:'+source+':'+ordinal:'row:'+ordinal,n=counts.get(base)||0;counts.set(base,n+1);const key=s.rowJoinKeys?.[i]||base+'#'+n;if(!keySet.has(key)){keys.push(key);keySet.add(key);}return [key,s.rows[i]];}));});
  let selected=named?keys:ordinals.map(r=>'row:'+r+'#0'),truncated=false;
  if(selected.length>ordinals.length&&ordinals.length){const all=selected;selected=Array.from({length:ordinals.length},(_,i)=>all[Math.floor(i*(all.length-1)/Math.max(1,ordinals.length-1))]);truncated=true;}
  const candidates=samples.flatMap((s,i)=>{const occurrences=new Map();return s.headers.map((h,c)=>{const n=occurrences.get(h)||0;occurrences.set(h,n+1);return {name:h,key:h+'#'+n,role:s.columnRoles?.[c]||role(h),source:i,values:selected.map(key=>maps[i].get(key)?.[c]??'')};});}),columns=[];let mergedColumns=0,conflictingColumns=0;
  for(const candidate of candidates){const canMerge=options.mergeColumns?.[candidate.name]??options.mergeSameName!==false,existing=canMerge&&columns.find(c=>c.key===candidate.key&&!samples[c.source].truncated&&!samples[candidate.source].truncated&&!c.values.some((v,r)=>v!==''&&candidate.values[r]!==''&&v!==candidate.values[r]));if(existing){existing.values=existing.values.map((v,r)=>v||candidate.values[r]);existing.sources.push(candidate.source);mergedColumns++;}else{if(canMerge&&columns.some(c=>c.key===candidate.key&&c.values.some((v,r)=>v!==''&&candidate.values[r]!==''&&v!==candidate.values[r])))conflictingColumns++;columns.push({...candidate,sources:[candidate.source]});}}
  return {headers:columns.map(c=>c.sources.length>1?c.name+'（合流）':`${c.source+1}. ${samples[c.source].name} | ${c.name}`),columnRoles:columns.map(c=>c.role),rows:selected.map((_,r)=>columns.map(c=>c.values[r])),sourceRows:selected.map((_,i)=>i+1),populationRows:named?Math.max(selected.length,...samples.map(s=>s.populationRows)):Math.max(0,...samples.map(s=>s.populationRows)),populationColumns:columns.length,truncated:truncated||samples.some(s=>s.truncated),alignment:{mode:composite?'識別子・期間の複合キーで対応':named?'行名で対応（重複は出現順）':'先頭からの行位置で対応',mergedColumns,conflictingColumns},diagnostics:{layout:'複数範囲の結合',mergeDecisions:[...new Set(candidates.map(c=>c.name))].map(name=>({name,count:candidates.filter(c=>c.name===name).length,enabled:options.mergeColumns?.[name]??options.mergeSameName!==false})).filter(c=>c.count>1),notes:samples.flatMap(s=>(s.diagnostics?.notes||[]).map(n=>s.name+'：'+n)),excludedColumns:[],keyColumns:[...new Set(samples.flatMap(s=>s.keyColumns||[]))]},sources:samples.map(s=>({name:s.name,populationRows:s.populationRows,populationColumns:s.populationColumns,sampledRows:s.rows.length,sampledColumns:s.headers.length}))};
}
async function aggregate(sources,read,options={}){
  if(!Array.isArray(sources)||!sources.length||sources.length>256)throw Error('集計元は1〜256個で指定してください。');
  const metadata=await Promise.all(sources.map(source=>read(source,{rows:0,cells:0})));
  const active=sources.map((source,i)=>({source,meta:metadata[i]})).filter(s=>s.meta.populationColumns&&s.meta.populationRows),groups=new Map();
  for(const entry of active){const schema=entry.meta.keySchema||'position';if(!groups.has(schema))groups.set(schema,[]);groups.get(schema).push(entry);}
  if(groups.size>1){const results=[];for(const [schema,entries]of groups)results.push({name:groupName(schema),result:await aggregateGroup(entries.map(e=>e.source),entries.map(e=>e.meta),read,options)});for(const group of results)group.result.diagnostics.notes.push('識別子・期間の単位が異なる集計元は別グループで分析します。月次・四半期・店舗・群平均を混合しません。');const excluded=sources.flatMap((source,i)=>metadata[i].populationColumns?[]:(metadata[i].diagnostics?.notes||['数値分析の対象がありません。']).map(n=>source.name+'：'+n));for(const g of results)g.result.diagnostics.notes.push(...excluded);return {...results[0].result,groups:results};}
  const result=await aggregateGroup(active.map(e=>e.source),active.map(e=>e.meta),read,options);
  result.diagnostics.notes.push(...sources.flatMap((source,i)=>metadata[i].populationColumns?[]:(metadata[i].diagnostics?.notes||['数値分析の対象がありません。']).map(n=>source.name+'：'+n)));
  return result;
}
async function aggregateGroup(sources,metadata,read,options){
  const totalColumns=metadata.reduce((n,s)=>n+s.populationColumns,0),maxRows=Math.max(0,...metadata.map(s=>s.populationRows));
  // Give each nonempty source one column, then distribute the remaining budget.
  const quotas=metadata.map(s=>s.populationColumns?1:0);let budget=256-quotas.reduce((n,c)=>n+c,0);
  while(budget>0){let assigned=false;for(let i=0;i<quotas.length&&budget>0;i++)if(quotas[i]<metadata[i].populationColumns){quotas[i]++;budget--;assigned=true;}if(!assigned)break;}
  const width=quotas.reduce((n,c)=>n+c,0),n=width?Math.min(maxRows,5000,Math.floor(250000/width)):0;
  let ordinals=Array.from({length:n},(_,i)=>n===1?0:Math.floor(i*(maxRows-1)/(n-1))),plans=metadata.map(()=>ordinals),joinIndexes=null,joinedPopulation=null;
  // Match the complete key indexes BEFORE sampling; reordered large sources
  // must not lose their counterpart just because row positions differ.
  if(metadata.length&&metadata.every(m=>m.rowKeys?.length===m.populationRows)&&metadata.every(m=>m.keySchema===metadata[0].keySchema)){
    const counts=metadata.map(()=>new Map()),indexes=metadata.map((m,source)=>new Map(m.rowKeys.map((label,r)=>{const base=label===null?'missing:'+source+':'+r:'name:'+label,occurrence=counts[source].get(base)||0;counts[source].set(base,occurrence+1);return [base+'#'+occurrence,r];}))),keys=[...new Set(indexes.flatMap(map=>[...map.keys()]))],shared=keys.some(k=>indexes.filter(map=>map.has(k)).length>1);
    if(shared||metadata.every(m=>m.keyColumns?.length>1)){const count=Math.min(keys.length,n),selected=Array.from({length:count},(_,i)=>keys[count===1?0:Math.floor(i*(keys.length-1)/(count-1))]);plans=indexes.map(map=>selected.map(k=>map.get(k)).filter(r=>r!==undefined).sort((a,b)=>a-b));ordinals=Array.from({length:count},(_,i)=>i);joinIndexes=indexes.map(map=>new Map([...map].map(([key,r])=>[r,key])));joinedPopulation=keys.length;}
  }
  const samples=await Promise.all(sources.map(async(source,i)=>{const sample=await read(source,{rows:n,columns:quotas[i],cells:250000,ordinals:plans[i]});return {...sample,name:source.name,...(joinIndexes?{rowJoinKeys:sample.sampleOrdinals.map(r=>joinIndexes[i].get(r))}:{})};}));
  const table=joinSamples(samples,ordinals,options);table.truncated ||= n<maxRows||width<totalColumns;
  if(joinedPopulation!==null)table.populationRows=joinedPopulation;
  if(samples.some(s=>s.truncated))table.diagnostics.notes.push('標本だけでは全データの値の一致を確認できないため、同名列を別系列に保持しました。');
  return analyze(table,true,{...options,correlatedOnly:sources.length>0&&sources.every(s=>s.all)});
}
function sampleTable(source,limits){
  const t=source.table;if(!t||!Array.isArray(t.headers)||!Array.isArray(t.rows)||t.headers.length*t.rows.length>100000)throw Error('テーブルが不正、または大きすぎます。');
  const cap=Math.min(t.headers.length,limits.columns??256),columns=cap===1?[0]:Array.from({length:cap},(_,i)=>Math.round(i*(t.headers.length-1)/Math.max(1,cap-1)));
  const ordinals=(limits.ordinals||[]).filter(r=>r<t.rows.length);const labels=t.rowLabels||t.rows.map(row=>{const named=t.headers.findIndex(h=>/^(?:ID|名前|名称|日付|日時|年月|月|行名|キー|name|date|time|key)$/i.test(h));if(named>=0)return row[named]||null;const {number}=require('./statistics.cjs');return row.find(v=>v&&number(v)===null)||null;});
  const spec=identitySpec(t.headers,t.rows.slice(0,50)),keys=t.rowLabels||t.rows.map((row,r)=>spec.keys.length?rowKey(row,spec):labels[r]);
  return {headers:columns.map(c=>String(t.headers[c])),columnRoles:columns.map(c=>t.columnRoles?.[c]||spec.roles[c]),keySchema:t.keySchema||spec.schema,keyColumns:t.keyColumns||spec.keys.map(c=>t.headers[c]),rows:ordinals.map(r=>columns.map(c=>String(t.rows[r]?.[c]??''))),sampleOrdinals:ordinals,rowLabels:ordinals.map(r=>keys[r]),...(limits.rows===0?{rowKeys:keys}:{}),populationRows:t.rows.length,populationColumns:t.headers.length,truncated:ordinals.length<t.rows.length||cap<t.headers.length};
}
module.exports={aggregate,joinSamples,sampleTable};

function groupName(schema){const [entity,time]=schema.split(':');return ({store:'店舗',group:'集計群',manager:'担当者',identifier:'識別子',position:'行位置'}[entity]||entity)+' / '+({period:'年月・期間',quarter:'四半期',date:'日付・日時',none:'期間なし'}[time]||time||'期間なし');}
