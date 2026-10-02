'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const s=require('../electron/s-services.cjs'),{payload,MAX_BYTES}=require('../electron/s-payload.cjs');
const table={headers:['ID','値'],rows:[['000001','=1+1'],['12345678901234567890','文字列']]};
test('内部ブラウザはHTTPSに限定し、偽のサービスドメインや認証情報埋め込みを拒否する',()=>{
  for(const url of ['file:///secret','javascript:alert(1)','data:text/html,x','http://example.com','https://name:password@github.com/'])assert.throws(()=>s.browserURL(url));
  assert.equal(s.browserURL('https://github.com/'),'https://github.com/');assert.equal(s.onProviderSite('google','https://mail.google.com/'),true);assert.equal(s.onProviderSite('google','https://google.com.example.org/'),false);assert.equal(s.onProviderSite('github','https://google.com/'),false);assert.throws(()=>s.partitionFor('../escape'));
});
test('サービス別の接続先と独立セッション、TeamsのWeb・アプリURLを用意する',()=>{
  assert.equal(new Set(Object.keys(s.PROVIDERS).map(s.partitionFor)).size,5);for(const service of s.SERVICES)assert.equal(new URL(s.destination(service.id)).protocol,'https:');
  assert.equal(s.service('teams').provider,'microsoft');assert.match(s.nativeDestination('teams',{recipient:'test@example.com',message:'確認してください'}),/^msteams:\/\/teams\.microsoft\.com\/l\/chat/);assert.throws(()=>s.nativeDestination('drive'));assert.throws(()=>s.service('unknown'));
});
test('メール・Teamsの宛先と本文はURLとしてエスケープし、本文プレビューを制限する',()=>{
  const url=new URL(s.destination('gmail',{recipient:'a@example.com&x=1',title:'日本語 ?#',message:'先頭',text:'あ'.repeat(5000)}));assert.equal(url.searchParams.get('to'),'a@example.com&x=1');assert.equal(url.searchParams.get('su'),'日本語 ?#');assert.equal(url.searchParams.get('body').length,4004);assert.equal(new URL(s.destination('teams',{message:'a&b'})).searchParams.get('message'),'a&b');
});
test('S共有XLSXは先頭ゼロ・長い整数・式文字列を文字列セルとして保持する',async()=>{
  const result=await payload({service:'sheets',table,title:'データ'});assert.equal(result.name,'データ.xlsx');const book=new (require('exceljs')).Workbook();await book.xlsx.load(result.bytes);const sheet=book.getWorksheet('Data');assert.equal(sheet.getCell('A2').value,'000001');assert.equal(sheet.getCell('B2').value,'=1+1');assert.equal(sheet.getCell('A3').value,'12345678901234567890');
});
test('S共有文書はMarkdownとグラフを一つのZIPへまとめ、危険な画像名を拒否する',async()=>{
  const document=[{id:'text',kind:'text',content:'# 内容',name:'本文'},{id:'plot-1',kind:'chart',name:'グラフ',image:'data:image/png;base64,iVBORw0KGgo='}];const result=await payload({service:'drive',title:'まとめ',document});const zip=await require('jszip').loadAsync(result.bytes);assert.equal(result.name,'まとめ.zip');assert.match(await zip.file('document.md').async('string'),/assets\/chart-plot-1\.png/);assert.ok(zip.file('assets/chart-plot-1.png'));await assert.rejects(payload({service:'drive',document:[{...document[1],id:'../../escape'}]}));
});
test('ファイル全体のS共有は元のバイトを保持し、サイズ・形式・ファイル名を検証する',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'s-payload-')),file=path.join(dir,'source.txt'),bytes=Buffer.from([0xff,0xfe,0x41,0,0x0d,0,0x0a,0]);try{fs.writeFileSync(file,bytes);const result=await payload({service:'drive'},{path:file});assert.deepEqual(result.bytes,bytes);assert.equal(result.name,'source.txt');assert.equal(result.text,'A\r\n');const large=path.join(dir,'large.txt');fs.writeFileSync(large,'');fs.truncateSync(large,MAX_BYTES+1);await assert.rejects(payload({service:'drive'},{path:large}),/32 MiB/);await assert.rejects(payload({service:'drive',table,format:'exe'}));assert.equal(s.safeFileName('CON.csv','csv'),'_CON.csv');assert.equal(s.safeFileName('../test:*','md'),'.._test__.md');}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
