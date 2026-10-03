'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{aborted,failureMessage,entryURL}=require('../electron/s-navigation.cjs');
test('失敗直後の空URL・about:blankでもHTTPSの接続先を復元し、再試行で内部URLを開かない',()=>{
  for(const url of ['', 'about:blank','chrome-error://chromewebdata/','file:///secret','https://user:secret@github.com/']){const entry={view:{webContents:{getURL:()=>url}},targetURL:'https://gist.github.com/',service:{id:'github'}};assert.equal(entryURL(entry),'https://gist.github.com/');delete entry.targetURL;assert.equal(entryURL(entry),'https://gist.github.com/');}assert.equal(entryURL({view:{webContents:{getURL:()=> 'https://gist.github.com/next'}},targetURL:'https://gist.github.com/',service:{id:'github'}}),'https://gist.github.com/next');
});
test('正常なナビゲーション中断はエラー扱いせず、ネットワーク・プロキシ・TLS・描画障害を区別する',()=>{
  for(const error of [{errno:-3},{code:'ERR_ABORTED'},new Error("ERR_ABORTED loading 'https://gist.github.com/'")])assert.equal(aborted(error),true);assert.equal(aborted({code:'ERR_NAME_NOT_RESOLVED'}),false);assert.equal(aborted({errno:-111}),false);
  assert.match(failureMessage(-111,'ERR_TUNNEL_CONNECTION_FAILED').message,/プロキシ/);assert.match(failureMessage(-105,'ERR_NAME_NOT_RESOLVED').message,/DNS/);assert.match(failureMessage(-202,'ERR_CERT_AUTHORITY_INVALID').message,/証明書/);assert.match(failureMessage(-20,'ERR_BLOCKED_BY_CLIENT').message,/ブロック/);assert.match(failureMessage(-1000,'RENDER_PROCESS_CRASHED').message,/描画/);assert.ok(!failureMessage(-2,'ERR_FAILED').detail.includes('undefined'));
});
