'use strict';
const { CsvFile } = require('./engine.cjs');
const fs = require('node:fs');
function validateTable(table) {
  if (!table || !Array.isArray(table.headers) || !Array.isArray(table.rows)) throw new Error('表データが必要です。');
  if (table.rows.length * Math.max(table.headers.length, 1) > 1000000) throw new Error('結合・共有は100万セル以内です。');
  if (table.headers.length > 10000) throw new Error('列が多すぎます。');
  for (const row of table.rows) if (!Array.isArray(row) || row.some(v => typeof v !== 'string')) throw new Error('セルは文字列で指定してください。');
  return table;
}
function tableText(table, format = 'csv') {
  validateTable(table);
  const delimiter = format === 'csv' ? ',' : '\t';
  const quote = s => s.includes(delimiter) || /["\r\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
  const md = s => s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\\','\\\\').replaceAll('|','\\|').replace(/\r\n|\r|\n/g,'<br>').replaceAll('`','\\`').replaceAll('*','\\*').replaceAll('_','\\_');
  const rows = [table.headers, ...table.rows];
  if (format === 'md') return rows.map((row, i) => '| ' + row.map(md).join(' | ') + ' |' + (i === 0 ? '\r\n| ' + row.map(() => '---').join(' | ') + ' |' : '')).join('\r\n') + '\r\n';
  return rows.map(row => row.map(quote).join(delimiter)).join('\r\n') + '\r\n';
}
function writeTable(table, target, format) {
  const text = tableText(table, format); const temp = target + '.csvlens-' + require('node:crypto').randomUUID() + '.tmp';
  try { fs.writeFileSync(temp, text, { encoding: 'utf8', flag: 'wx' }); fs.renameSync(temp,target); } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
  return { path: target, size: Buffer.byteLength(text) };
}
module.exports = { validateTable, tableText, writeTable };

function documentText(blocks,assetBase='merged-assets'){
  if(!Array.isArray(blocks)||blocks.length>500)throw new Error('文書は500ブロック以内です。');
  return blocks.map(block=>{
    if(block.kind==='chart')return '!['+String(block.name).replace(/[\[\]\r\n]/g,' ')+']('+encodeURIComponent(assetBase)+'/chart-'+block.id+'.png)';
    if(block.content!==undefined)return String(block.content);
    return block.kind==='text'?'':tableText(block.table,'md').replace(/\r\n/g,'\n').trimEnd();
  }).join('\n\n')+'\n';
}
module.exports.documentText=documentText;
