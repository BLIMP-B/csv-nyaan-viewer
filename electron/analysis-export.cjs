'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const {tableText}=require('./tables.cjs');
function parseAddress(address){
  const match=/^\s*\$?([A-Z]{1,4})\$?([1-9]\d*)(?:\s*:\s*\$?([A-Z]{1,4})\$?([1-9]\d*))?\s*$/i.exec(String(address));if(!match)throw Error('セル番地を A2:D20 の形式で指定してください。');
  const column=s=>[...s.toUpperCase()].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;
  const result={row0:Number(match[2])-1,row1:Number(match[4]||match[2])-1,col0:column(match[1]),col1:column(match[3]||match[1])};if(!Object.values(result).every(Number.isSafeInteger))throw Error('セル番地が大きすぎます。');return result;
}
const safeName=name=>String(name||'analysis').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'').slice(0,180)||'analysis';
function pngData(image){if(typeof image!=='string'||!/^data:image\/png;base64,/.test(image)||image.length>8*1024*1024)throw Error('分析画像が不正です。');const data=Buffer.from(image.split(',')[1],'base64');if(data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('PNG画像が不正です。');return data;}
function validateDocument(doc){
  if(!doc||!Array.isArray(doc.sections)||doc.sections.length>400||!Array.isArray(doc.plots)||doc.plots.length>300)throw Error('分析文書が不正です。');
  if(Buffer.byteLength(JSON.stringify(doc))>64*1024*1024)throw Error('分析文書は64 MiB以内です。');
  for(const s of doc.sections){if(typeof s.title!=='string'||!Array.isArray(s.paragraphs)||s.paragraphs.some(v=>typeof v!=='string'))throw Error('分析本文が不正です。');for(const t of s.tables||[]){if(!Array.isArray(t.headers)||!Array.isArray(t.rows)||t.headers.length*t.rows.length>250000)throw Error('分析表が大きすぎます。');}}
  for(const plot of doc.plots)pngData(plot.image);return doc;
}
const escaped=s=>String(s).replace(/[\\`*_[\]<>#]/g,'\\$&').replace(/\r?\n/g,' ');
function markdownDocument(doc){
  validateDocument(doc);return '# '+escaped(doc.name)+'\n\n'+doc.sections.map(s=>'## '+escaped(s.title)+'\n\n'+s.paragraphs.map(escaped).join('\n\n')+'\n\n'+(s.tables||[]).map(t=>tableText({headers:t.headers.map(String),rows:t.rows.map(row=>row.map(v=>v===null?'—':String(v)))},'md')).join('\n')).join('\n')+'\n'+doc.plots.map(p=>'## '+escaped(p.title)+'\n\n!['+escaped(p.title)+']('+p.image+')\n').join('\n');
}
async function writeAnalysis(doc,target,format){
  validateDocument(doc);const temporary=target+'.csvnyaan-'+crypto.randomUUID()+'.tmp';
  try{
    if(format==='md')fs.writeFileSync(temporary,markdownDocument(doc),{flag:'wx'});
    else if(format==='xlsx'){
      const ExcelJS=require('exceljs'),book=new ExcelJS.Workbook();book.creator='CSV nyaan Viewer';book.created=new Date();
      const summary=book.addWorksheet('分析結果');summary.columns=[{width:34},{width:26},{width:24},{width:24},{width:24},{width:24},{width:24}];
      for(const section of doc.sections){const heading=summary.addRow([section.title]);heading.font={bold:true,color:{argb:'FF0F6CBD'},size:14};for(const text of section.paragraphs){const r=summary.addRow([text]);summary.mergeCells(r.number,1,r.number,7);r.getCell(1).alignment={wrapText:true,vertical:'top'};r.height=Math.max(32,Math.min(120,Math.ceil(text.length/95)*18));}for(const t of section.tables||[]){const r=summary.addRow(t.headers);r.font={bold:true};r.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE8F2FB'}};for(const row of t.rows)summary.addRow(row.map(v=>typeof v==='number'&&Number.isFinite(v)?v:v===null?'—':String(v)));}summary.addRow([]);}
      summary.views=[{state:'frozen',ySplit:1}];
      const graphs=book.addWorksheet('グラフ'),data=book.addWorksheet('描画データ');graphs.getColumn(1).width=30;let top=1;
      for(const plot of doc.plots){graphs.getCell(top,1).value=plot.title;graphs.getCell(top,1).font={bold:true};const id=book.addImage({buffer:pngData(plot.image),extension:'png'});graphs.addImage(id,{tl:{col:0,row:top},ext:{width:640,height:360},editAs:'oneCell'});top+=21;data.addRow([plot.title]);data.addRow(plot.headers).font={bold:true};for(const row of plot.rows)data.addRow(row.map(v=>typeof v==='number'&&Number.isFinite(v)?v:v===null?'':String(v)));data.addRow([]);}
      data.columns=Array.from({length:8},()=>({width:25}));await book.xlsx.writeFile(temporary);
    }else throw Error('分析出力形式が不正です。');
    fs.renameSync(temporary,target);return target;
  }finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
}
function plotData(data,format){
  if(typeof data!=='string'||data.length>64*1024*1024)throw Error('出力データが大きすぎます。');
  if(format==='png')return pngData(data);
  if(format==='gif'){if(!/^data:image\/gif;base64,/.test(data))throw Error('GIFデータが不正です。');const bytes=Buffer.from(data.split(',')[1],'base64');if(!/^GIF8[79]a$/.test(bytes.subarray(0,6).toString()))throw Error('GIF形式が不正です。');return bytes;}
  if(format==='obj'){if(!/^# CSV nyaan Viewer\n/.test(data)||!/^v [-+\d.e]+ [-+\d.e]+ [-+\d.e]+$/m.test(data))throw Error('OBJデータが不正です。');return Buffer.from(data);}
  throw Error('出力形式が不正です。');
}
module.exports={parseAddress,safeName,markdownDocument,writeAnalysis,plotData};
