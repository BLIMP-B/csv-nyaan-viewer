'use strict';
const fs=require('node:fs'),path=require('node:path');
const {validateTable,tableText,documentText}=require('./tables.cjs');
const {safeFileName,service}=require('./s-services.cjs');
const MAX_BYTES=32*1024*1024;
async function payload(options,originalFile){
  service(options.service);const name=options.title||'CSV nyaan Viewer export';
  if(originalFile){const stat=fs.statSync(originalFile.path);if(!stat.isFile()||stat.size>MAX_BYTES)throw Error('S共有ファイルは32 MiB以内です。');const bytes=fs.readFileSync(originalFile.path);let text='';if(/\.(csv|tsv|txt|md)$/i.test(originalFile.path)){const {encoding,bom}=require('./engine.cjs').detectEncoding(bytes.subarray(0,65536));text=require('iconv-lite').decode(bytes.subarray(bom),encoding);}return {name:path.basename(originalFile.path),bytes,text};}
  let bytes,text='',extension=options.format||(['sheets','excel'].includes(options.service)?'xlsx':'csv');
  if(options.document?.length){
    if(options.document.length>500)throw Error('文書は500ブロック以内です。');
    const zip=new (require('jszip'))();text=documentText(options.document,'assets');let total=Buffer.byteLength(text);if(total>MAX_BYTES)throw Error('S共有文書は32 MiB以内です。');zip.file('document.md',text);
    for(const block of options.document)if(block.kind==='chart'){
      if(!/^[a-zA-Z0-9-]+$/.test(block.id)||typeof block.image!=='string'||!/^data:image\/png;base64,/.test(block.image)||block.image.length>MAX_BYTES)throw Error('文書のグラフ画像が不正です。');
      const image=Buffer.from(block.image.split(',')[1],'base64');total+=image.length;if(total>MAX_BYTES)throw Error('S共有文書は32 MiB以内です。');zip.file('assets/chart-'+block.id+'.png',image);
    }
    bytes=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});extension='zip';
  }else{
    const table=validateTable(options.table);if(table.headers.some(v=>typeof v!=='string'))throw Error('列名は文字列で指定してください。');
    if(!['csv','xlsx','md','txt'].includes(extension))throw Error('S共有の出力形式が不正です。');
    text=tableText(table,extension==='xlsx'?'csv':extension);if(Buffer.byteLength(text)>MAX_BYTES)throw Error('S共有データは32 MiB以内です。');
    if(extension==='xlsx'){const workbook=new (require('exceljs')).Workbook();workbook.addWorksheet('Data').addRows([table.headers,...table.rows]);bytes=Buffer.from(await workbook.xlsx.writeBuffer());}
    else bytes=Buffer.from(text,'utf8');
  }
  if(bytes.length>MAX_BYTES)throw Error('S共有データは32 MiB以内です。');
  return {name:safeFileName(name,extension),bytes,text};
}
module.exports={payload,MAX_BYTES};
