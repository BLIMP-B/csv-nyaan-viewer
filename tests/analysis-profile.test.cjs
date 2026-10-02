'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),XLSX=require('@e965/xlsx');
const {WorkbookFile}=require('../electron/workbook.cjs'),{role,annotate,sampleProfile}=require('../electron/analysis-profile.cjs'),{analyze}=require('../electron/statistics.cjs'),{aggregate,joinSamples,sampleTable}=require('../electron/analysis-aggregation.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'csv-profile-'));let sequence=0;
function workbook(rows,name='Arbitrary',edit=()=>{}){const book=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet(rows);edit(sheet);XLSX.utils.book_append_sheet(book,sheet,name);const target=path.join(dir,`${++sequence}.xlsx`);XLSX.writeFile(book,target);return new WorkbookFile(target);}
function labelled(name,rows){return {...annotate({name,headers:['店舗コード','年月','測定値'],rows:rows.map(row=>row.map(String)),sampleOrdinals:rows.map((_,i)=>i),populationRows:rows.length,populationColumns:3}),truncated:false};}
test('連番の測定値は保持し、識別子・年月・分類コードを相関とPCAから除外する',()=>{
 const table={headers:['店舗コード','年月','分類','X','Acid','Fluid'],rows:Array.from({length:12},(_,i)=>[4100+i,2401+i%4,i%3,i+1,(i+1)*2,(i+1)*3])};const r=analyze(table,true);assert.equal(r.numericColumns,3);assert.deepEqual(r.pca.dimensions,['X','Acid','Fluid']);assert.deepEqual(r.diagnostics.columnDecisions.filter(c=>!c.included).map(c=>c.name),table.headers.slice(0,3));assert.equal(role('分類確率'),'measure');
});
test('自動除外は全体または列単位で変更でき、明示的な除外も保持する',()=>{
 const table={headers:['ID','X','Y'],rows:Array.from({length:12},(_,i)=>[i+100,i+1,2*i+2])};const automatic=analyze(table,true),manual=analyze(table,true,{columnOverrides:{ID:true,Y:false}}),all=analyze(table,true,{autoExclude:false});assert.equal(automatic.numericColumns,2);assert.equal(manual.numericColumns,2);assert.ok(manual.columnSummaries.some(c=>c.name==='ID'));assert.ok(!manual.columnSummaries.some(c=>c.name==='Y'));assert.equal(all.numericColumns,3);assert.equal(manual.diagnostics.columnDecisions.find(c=>c.name==='ID').automatic,false);
});
test('文章が大半を占める混在列は自動除外し、ユーザー指定で数値だけを使用できる',()=>{
 const t={headers:['Mixed','Value'],rows:Array.from({length:12},(_,i)=>[i<3?i:'説明文',i])};assert.equal(analyze(t,true).numericColumns,1);assert.equal(analyze(t,true,{columnOverrides:{Mixed:true}}).numericColumns,2);assert.match(analyze(t,true).diagnostics.columnDecisions[0].reason,/混在/);
});
test('同名列は合流を全体・列別に切り替えられ、衝突する数値は保持する',()=>{
 const a=labelled('A',[[1,2401,10],[2,2401,20]]),b=labelled('B',[[2,2401,20],[1,2401,10]]);assert.equal(joinSamples([a,b],[0,1]).alignment.mergedColumns,3);assert.equal(joinSamples([a,b],[0,1],{mergeSameName:false}).alignment.mergedColumns,0);assert.equal(joinSamples([a,b],[0,1],{mergeColumns:{測定値:false}}).alignment.mergedColumns,2);b.rows[0][2]='99';const r=joinSamples([a,b],[0,1]);assert.equal(r.alignment.conflictingColumns,1);assert.ok(r.rows.some(row=>row.includes('99')));
});
test('店舗と期間を複合照合し、並べ替えた月次行と空のキーを誤結合しない',()=>{
 const a=labelled('A',[[1,2401,10],[1,2402,20],[2,2401,30],['',2401,40]]),b=labelled('B',[[2,2401,30],[1,2402,20],[1,2401,10],['',2401,50]]),r=joinSamples([a,b],[0,1,2,3,4]);assert.match(r.alignment.mode,/複合キー/);assert.equal(r.rows.length,5);assert.ok(!r.rows.some(row=>row.includes('40')&&row.includes('50')));assert.equal(r.alignment.conflictingColumns,0);
});
test('複合キーが一致しない観測を行位置で無理に対応させない',()=>{
 const r=joinSamples([labelled('A',[[1,2401,10]]),labelled('B',[[1,2402,20]])],[0,1]);assert.equal(r.rows.length,2);assert.ok(!r.rows.some(row=>row.includes('10')&&row.includes('20')));
});
test('大きな並び替え済みテーブルでもキーを先に照合してから標本を抽出する',async()=>{
 const rows=Array.from({length:7000},(_,i)=>['row'+i,String(i)]),sources=[{name:'A',table:{headers:['ID','X'],rows}},{name:'B',table:{headers:['ID','Y'],rows:[...rows].reverse().map(([id,v])=>[id,String(Number(v)*3+7)])}}];const r=await aggregate(sources,sampleTable);assert.equal(r.sampledRows,5000);assert.equal(r.populationRows,7000);assert.ok(Math.abs(r.pairs[0].r-1)<1e-12);assert.ok(Math.abs(r.pairs[0].slope-3)<1e-10);assert.equal(r.pairs[0].n,5000);
});
test('月次と四半期を自動で別グループに分け、同じ店舗だけで混合しない',async()=>{
 const rows=Array.from({length:12},(_,i)=>[String(i+1),'2401',String(i)]),r=await aggregate([{name:'Month',table:{headers:['店舗コード','年月','X'],rows}},{name:'Quarter',table:{headers:['店舗コード','四半期タグ','Y'],rows}}],sampleTable);assert.equal(r.groups.length,2);assert.ok(r.groups.every(g=>g.result.sources.length===1));assert.ok(r.groups.every(g=>g.result.pairs.length===0));
});
test('書式だけの巨大な範囲を除き、見出し・主表・数式の保存値を検出する',()=>{
 const f=workbook([['Title'],[],['店舗コード','年月','X','Y',null,'別表'],[1,2401,10,20,null,999],[2,2401,20,40,null,998],[3,2401,30,60,null,997]],'Any',s=>{s['!ref']='A1:XFD30';s.C4={t:'n',v:10,f:'5+5'};s.D4={t:'n',v:20,f:'10+10'};});try{assert.equal(f.columns,6);assert.equal(f.starts.length,6);const sample=f.analysisSample(null,true);assert.deepEqual(sample.headers,['店舗コード','年月','X','Y']);assert.equal(sample.rows.length,3);assert.equal(sample.rows[0][2],'10');assert.equal(f.analysisProfile().headerRow,2);}finally{f.close();}
});
test('横持ちの店舗・期間・測定項目を観測単位に展開し、項目の尺度を混ぜない',()=>{
 const f=workbook([['店舗コード','店舗名','データ項目',2401,2402,2403],[1,'A','温度',1,2,3],[1,'A','湿度',10,20,30],[2,'B','温度',4,5,6],[2,'B','湿度',40,50,60]],'Generic');try{const t=f.analysisProfile().tables[0];assert.deepEqual(t.headers,['店舗コード','四半期タグ','温度','湿度']);assert.equal(t.rows.length,6);assert.deepEqual(t.rows[0],['1','quarter:2401','1','10']);assert.equal(f.row(1)[2],'温度');}finally{f.close();}
});
test('ネイティブの日付書式と複数段見出しを持つ月次表を店舗別観測にする',()=>{
 const f=workbook([[null,null,new Date(2024,0,1),new Date(2024,1,1),new Date(2024,2,1)],['店舗コード','店舗名','客数','客数','客数'],[1,'A',10,20,30],[2,'B',40,50,60]],'Monthly');try{const t=f.analysisProfile().tables[0];assert.equal(t.rows.length,6);assert.deepEqual(t.headers,['店舗コード','年月','客数']);assert.equal(t.rows[0][1],'month:2024-01');}finally{f.close();}
});
test('数式エラー・未計算の数式は0として捏造せず欠損として扱う',()=>{
 const f=workbook([['X','Y'],[1,2],[2,4],[3,6]],'Cache',s=>{s.A3={t:'e',v:7};s.B3={t:'n',f:'2+2'};});try{const r=analyze(f.analysisSample(null,true),true);assert.equal(r.columnSummaries[0].stats.n,2);assert.equal(r.columnSummaries[1].stats.n,2);assert.equal(r.columnSummaries[0].stats.missing,1);}finally{f.close();}
});
test('測定項目が縦に並んだ比較表は項目別に分けて集計する',()=>{
 const f=workbook([['店舗コード','店舗名','データ項目','前','後'],[1,'A','温度',1,2],[1,'A','湿度',10,20],[2,'B','温度',3,6],[2,'B','湿度',30,60]]);try{const p=f.analysisProfile();assert.equal(p.tables.length,2);assert.deepEqual(p.tables.map(t=>t.groupName),['温度','湿度']);assert.equal(p.tables[0].rows.length,2);}finally{f.close();}
});
test('ファイル名・シート名を変えても同じ値と構造なら同じ自動判断になる',()=>{
 const rows=[['ID','X','Y'],...Array.from({length:12},(_,i)=>['r'+i,i,i*2])],a=workbook(rows,'設定'),b=workbook(rows,'Measurements');try{const x=a.analysisSample(null,true),y=b.analysisSample(null,true);assert.deepEqual(x.headers,y.headers);assert.deepEqual(x.rows,y.rows);assert.deepEqual(analyze(x,true).diagnostics.columnDecisions,analyze(y,true).diagnostics.columnDecisions);}finally{a.close();b.close();}
});
test('小標本の相関は表示を維持し、参考値であることを判断結果で説明する',()=>{
 const t={headers:['X','Y'],rows:Array.from({length:5},(_,i)=>[i,i*2])};const r=analyze(t,true,{correlatedOnly:true});assert.equal(r.pairs.length,1);assert.match(r.diagnostics.notes.join(' '),/少数データ.*参考値/);assert.equal(analyze(t,true).pairs.length,1);
});
test('横持ちの文字履歴の一部に0や番号があっても測定値の表に誤変換しない',()=>{
 const f=workbook([['店舗コード','店舗名','直営FC',2401,2402,2403],[1,'A','直営','Alpha','Beta','Gamma'],[2,'B','FC','Delta','Epsilon',0]]);try{assert.equal(analyze(f.analysisSample(null,true),true).numericColumns,0);}finally{f.close();}
});
