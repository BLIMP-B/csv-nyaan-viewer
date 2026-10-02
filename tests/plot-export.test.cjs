'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
function read(file,modules={}){const scope={exports:{},require:name=>modules[name]??require(name)};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,scope);return scope.exports;}
const layout=read('src/plot-layout.ts'),plots=read('src/analysis-plot.ts',{'./plot-layout':layout}),themes=read('src/export-theme.ts');
const measure=(text,font)=>[...text].reduce((n,c)=>n+(c.charCodeAt(0)>255?font:font*.6),0);
const model={title:'長い名前の測定値どうしの相関と分析結果（複数の期間と条件を比較した結果）'.repeat(3),labels:['長い名前の測定値：一番目の項目と比較対象'.repeat(4),'長い名前の測定値：二番目の項目と比較対象'.repeat(4),'PC3 / 長い名前の三番目の項目'.repeat(4)],points:[{x:1,y:0,z:0,row:1,cluster:0,series:0},{x:0,y:1,z:0,row:2,cluster:1,series:0},{x:0,y:0,z:1,row:3,cluster:2,series:0}],dimension:2,uniform:true,lines:false,seriesNames:['最初の系列と長い分析結果の説明'.repeat(5),'比較する系列と長い分析結果の説明'.repeat(5)]};
test('長い日本語のタイトル・軸名・凡例は2D/3Dの全方向で重ならず画像に収まる',()=>{
  for(const dimension of [2,3])for(const yaw of [0,45,90,180])for(const pitch of [-89,0,89]){
    const m={...model,dimension},g=layout.plotLayout(m,plots.geometry(m,{yaw,pitch,roll:30},15),measure);
    for(const box of g.labels){assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=g.width&&box.y+box.height<=g.height);assert.ok(box.lines.every(line=>measure(line,box.font)<=box.width));}
    for(let i=0;i<g.labels.length;i++)for(let j=i+1;j<g.labels.length;j++){const a=g.labels[i],b=g.labels[j];assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,'text boxes overlap');}
    if(dimension===3)assert.equal(g.leaders.length,3);
  }
});
test('主成分の単位長さとCanvasの縦横スケールを等しく保持し、白基調を既定にする',()=>{
  const m={...model,title:'PCA',labels:['PC1','PC2','PC3'],seriesNames:['系列1']},g=layout.plotLayout(m,plots.geometry(m),measure);
  assert.ok(Math.abs((g.points[0].x-g.points[2].x)-(g.points[2].y-g.points[1].y))<1e-10);
  const scales=[],context={save(){},restore(){},fillRect(){},translate(){},scale(x,y){scales.push([x,y]);},beginPath(){},rect(){},clip(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){},fillText(){},measureText(text){return {width:measure(text,parseFloat(this.font))};}};
  plots.drawPlot({width:960,height:360,getContext:()=>context},m,{yaw:0,pitch:0,roll:0},0);assert.equal(scales[0][0],scales[0][1]);
  assert.equal(plots.plotColors().bg,'#ffffff');assert.equal(themes.resolveImageTheme(undefined,'dark'),'light');assert.equal(themes.resolveImageTheme('screen','dark'),'dark');assert.equal(themes.resolveImageTheme('dark','light'),'dark');
});
function png(width,height){
  const signature=Buffer.from('89504e470d0a1a0a','hex');
  const chunk=(type,data)=>{const name=Buffer.from(type),bytes=Buffer.concat([name,data]);let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}const size=Buffer.alloc(4),sum=Buffer.alloc(4);size.writeUInt32BE(data.length);sum.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([size,bytes,sum]);};
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  const scanlines=Buffer.alloc((width*4+1)*height,255);for(let y=0;y<height;y++)scanlines[y*(width*4+1)]=0;
  return 'data:image/png;base64,'+Buffer.concat([signature,chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(scanlines)),chunk('IEND',Buffer.alloc(0))]).toString('base64');
}
test('XLSXは異なる画像比率を保持し、次の見出しまで画像の高さに応じて行を確保する',async()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'csv-plot-export-')),file=path.join(folder,'test.xlsx');
  const {writeAnalysis,plotData}=require('../electron/analysis-export.cjs'),ExcelJS=require('exceljs');
  const images=[[3,2],[1,2],[4,1]].map(([w,h],i)=>({title:('長いタイトル'+i).repeat(20),image:png(w,h),headers:['X','Y'],rows:[[1,2]]}));
  try{await writeAnalysis({name:'test',sections:[],plots:images},file,'xlsx');const book=new ExcelJS.Workbook();await book.xlsx.readFile(file);const sheet=book.getWorksheet('グラフ'),drawings=sheet.getImages();assert.equal(drawings.length,3);
    for(let i=0;i<drawings.length;i++){const d=drawings[i],data=plotData(images[i].image,'png');assert.ok(Math.abs(d.range.ext.width/d.range.ext.height-data.readUInt32BE(16)/data.readUInt32BE(20))<1e-8);let y=0;for(let row=1;row<=d.range.tl.nativeRow;row++)y+=(sheet.getRow(row).height||15)*96/72;
      if(i+1<drawings.length){let nextHeading=0;for(let row=1;row<drawings[i+1].range.tl.nativeRow;row++)nextHeading+=(sheet.getRow(row).height||15)*96/72;assert.ok(y+d.range.ext.height<=nextHeading);}}
    const invalid=Buffer.from(images[0].image.split(',')[1],'base64');invalid.writeUInt32BE(0,16);assert.throws(()=>plotData('data:image/png;base64,'+invalid.toString('base64'),'png'),/サイズ/);
  }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
