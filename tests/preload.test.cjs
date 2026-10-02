'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{EventEmitter}=require('node:events');
function preload(){
  const ipc=new EventEmitter();let api;
  vm.runInNewContext(fs.readFileSync('electron/preload.cjs','utf8'),{require:name=>{
    assert.equal(name,'electron');return {ipcRenderer:ipc,contextBridge:{exposeInMainWorld:(name,value)=>{assert.equal(name,'csv');api=value;}},webUtils:{}};
  }});
  return {ipc,api};
}
test('画面準備より早い起動ファイル通知も順序を保ち一度だけ届ける',()=>{
  const {ipc,api}=preload(),received=[];
  ipc.emit('csv:paths',{},['first.csv']);ipc.emit('csv:paths',{},['second.xlsx']);
  const stop=api.onPaths(paths=>received.push(paths));
  assert.deepEqual(received,[['first.csv'],['second.xlsx']]);
  ipc.emit('csv:paths',{},['third.md']);assert.deepEqual(received,[['first.csv'],['second.xlsx'],['third.md']]);
  stop();const next=[];api.onPaths(paths=>next.push(paths));assert.deepEqual(next,[]);
});
test('購読解除後のファイル通知は古い画面へ送らず次の画面へ届ける',()=>{
  const {ipc,api}=preload(),old=[],next=[];
  const stop=api.onPaths(paths=>old.push(paths));stop();stop();
  ipc.emit('csv:paths',{},['queued.txt']);assert.deepEqual(old,[]);
  api.onPaths(paths=>next.push(paths));ipc.emit('csv:paths',{},['live.csv']);
  assert.deepEqual(next,[['queued.txt'],['live.csv']]);assert.deepEqual(old,[]);
});
