'use strict';
const { app, BrowserWindow, ipcMain, dialog, clipboard, Menu, shell, net, nativeImage, nativeTheme } = require('electron');
const { Worker } = require('node:worker_threads');
const path = require('node:path');
const fs = require('node:fs');
const sharing=require('./sharing.cjs');
const {openOnline}=require('./online.cjs');
let onlineCache;
let sBrowser;
let apiProfiles;
function connectionStatus(){const result=sharing.status();for(const [id,value] of Object.entries(result.providers)){const profile=apiProfiles?.get(id);if(profile)Object.assign(value,{avatar:profile.avatar,profileName:profile.name});}return result;}
let window, nextId = 0, nextRequest = 0;
const files = new Map();
const profilePath=app.commandLine.getSwitchValue('user-data-dir');if(profilePath)app.setPath('userData',path.resolve(profilePath));
const settingsPath = () => path.join(app.getPath('userData'), 'preferences.json');
function readSettings() { try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); } catch { return {}; } }
function writeSettings(settings) { fs.mkdirSync(app.getPath('userData'), { recursive: true }); fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2)); }
function request(entry, method, args) {
  return new Promise((resolve, reject) => { const requestId = ++nextRequest; entry.pending.set(requestId, { resolve, reject }); entry.worker.postMessage({ requestId, method, args }); });
}
function closeFile(id) { const entry = files.get(id); if (!entry) return; for (const p of entry.pending.values()) p.reject(new Error('処理がキャンセルされました。')); files.delete(id); entry.worker.terminate().finally(()=>{if(entry.online){try{fs.unlinkSync(entry.path);}catch{}}}); }
function emit(command, payload) { if(window&&!window.isDestroyed())window.webContents.send(command, payload); }
async function openFile(filePath, options = {}) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new Error('ファイルの絶対パスが必要です。');
  const id = String(++nextId), worker = new Worker(path.join(__dirname, 'worker.cjs'));
  const entry = { worker, path: filePath, pending: new Map(),online:options.online,source:options.source }; files.set(id, entry);
  worker.on('message', msg => {
    if (typeof msg.progress === 'number') { emit('csv:progress', { id, value: msg.progress }); return; }
    const p = entry.pending.get(msg.requestId); if (!p) return;
    entry.pending.delete(msg.requestId); msg.error ? p.reject(new Error(msg.error)) : p.resolve(msg.result);
  });
  worker.on('error', error => { for (const p of entry.pending.values()) p.reject(error); entry.pending.clear(); });
  worker.on('exit', code => { for (const p of entry.pending.values()) p.reject(new Error(`読み込み処理が終了しました (${code})。`)); entry.pending.clear(); });
  try {
    const meta = await request(entry, 'open', { path: filePath, options });
    const prefs = readSettings(); if(!options.online)prefs.recent = [filePath, ...(prefs.recent || []).filter(p => p !== filePath)].slice(0, 15); writeSettings(prefs);
    return { id, ...meta,...(entry.source?{sourceUrl:entry.source.sourceUrl,name:entry.source.name}:{}) };
  } catch (error) { closeFile(id); throw error; }
}
app.whenReady().then(() => {
  nativeTheme.themeSource = readSettings().theme === 'dark' ? 'dark' : 'light';
  sharing.init(app.getPath('userData'));onlineCache=fs.mkdtempSync(path.join(app.getPath('temp'),'csv-nyaan-online-'));
  apiProfiles=require('./account-profiles.cjs').createApiProfiles({userData:app.getPath('userData'),accessToken:sharing.accessToken,fetch:net.fetch,nativeImage,connected:id=>!!sharing.status().providers[id]?.connected,notify:()=>emit('csv:connectionsChanged',connectionStatus())});
  sBrowser=require('./s-browser.cjs').createBrowserManager({electron:require('electron'),userData:app.getPath('userData'),tempDir:onlineCache,mainWindow:()=>window,resolveFile:id=>files.get(id),protectFile:protectSources,notify:accounts=>emit('csv:sAccounts',accounts)});
  const customIcon=path.join(app.getPath('userData'),'app-icon.png'),bundledIcon=path.join(__dirname,'../assets/icon.png');
  window = new BrowserWindow({ icon:fs.existsSync(customIcon)?customIcon:fs.existsSync(bundledIcon)?bundledIcon:undefined,width: 1440, height: 940, minWidth: 1000, minHeight: 560, titleBarStyle:'hidden', titleBarOverlay:{color:readSettings().theme==='dark'?'#242424':'#f5f5f5',symbolColor:readSettings().theme==='dark'?'#dedede':'#424242',height:34}, autoHideMenuBar:true, title: 'CSV nyaan Viewer', backgroundColor: nativeTheme.shouldUseDarkColors ? '#292929' : '#ffffff', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(({ url }) => url === 'about:blank' ? { action: 'allow', overrideBrowserWindowOptions: { width: 900, height: 550, minWidth: 420, minHeight: 280, autoHideMenuBar: true, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } } } : { action: 'deny' });
  window.webContents.on('will-navigate', event => event.preventDefault());
  const send = command => () => emit('csv:command', command);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'ファイル', submenu: [{ label: '開く…', accelerator: 'CmdOrCtrl+O', click: send('open') }, { label: '共有…', click: send('share') }, { label: 'エクスポート…', accelerator: 'CmdOrCtrl+Shift+E', click: send('export') }, { label: '再読み込み', accelerator: 'CmdOrCtrl+R', click: send('reload') }, { label: 'タブを閉じる', accelerator: 'CmdOrCtrl+W', click: send('close') }, { type: 'separator' }, { role: 'quit', label: '終了' }] },
    { label: '操作', submenu: [{ label: 'コピー', accelerator: 'CmdOrCtrl+C', click: send('copy') }, { label: '全選択', accelerator: 'CmdOrCtrl+A', click: send('selectAll') }, { label: '検索', accelerator: 'CmdOrCtrl+F', click: send('find') }, { label: '次を検索', accelerator: 'F3', click: send('next') }, { label: '前を検索', accelerator: 'Shift+F3', click: send('previous') }, { label: '行・列へ移動', accelerator: 'CmdOrCtrl+G', click: send('goto') }] },
    { label: '表示', submenu: [{ label: 'グラフプレビュー', click: send('preview') }, { label: 'ファイル結合ペイン', click: send('merge') }, { label: 'グラフを画像として保存', click: send('saveChart') }, { label: 'テーマを切り替え', accelerator: 'CmdOrCtrl+Shift+L', click: send('theme') }, { role: 'togglefullscreen', label: '全画面' }] },
    { label:'共有',submenu:[{label:'選択・文書を共有',click:send('share')}]},{label:'接続',submenu:[{label:'アカウント接続設定',click:send('connections')}]},
    {label:'S共有',submenu:[{label:'内部ブラウザで共有',click:send('sShare')}]},{label:'Sアカウント接続',submenu:[{label:'内部ブラウザのアカウント',click:send('sConnections')}]},
    { label: 'ヘルプ', submenu: [{ label: '操作ガイド', accelerator: 'F1', click: send('help') }, { label: 'CSV nyaan Viewerについて', click: send('about') }] }
  ]));
  window.loadFile(path.join(__dirname, '../dist/index.html'));
  window.webContents.once('did-finish-load', () => {
    const paths = process.argv.slice(1).filter(arg => !arg.startsWith('-') && /\.(csv|tsv|txt|psv|md|xlsx|xls|xlsm|xlsb|xltx|xltm|xlt|xlam|xla|ods|fods|xml)$/i.test(arg));
    if (paths.length) emit('csv:paths', paths.map(p => path.resolve(p)));
  });
  window.on('closed', () => { for (const id of files.keys()) closeFile(id); window = null; });
});
ipcMain.handle('csv:dialog', async () => (await dialog.showOpenDialog(window, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'CSV / Excel / Markdown / Text', extensions: ['csv','tsv','txt','psv','md','xlsx','xls','xlsm','xlsb','xltx','xltm','xlt','xlam','xla','ods','fods','xml'] }, { name: 'すべてのファイル', extensions: ['*'] }] })).filePaths);
ipcMain.handle('csv:openUrl',async(_,url)=>{const source=await openOnline(url,{fetch:net.fetch,accessToken:sharing.accessToken,cacheDir:onlineCache});try{return await openFile(source.path,{...source.options,online:true,source});}catch(error){try{fs.unlinkSync(source.path);}catch{}throw error;}});
ipcMain.handle('csv:open', (_, args) => openFile(args.path, args.options));
ipcMain.handle('csv:close', (_, id) => closeFile(id));
ipcMain.handle('csv:cancel', () => { for (const id of files.keys()) if (files.get(id).pending.size) closeFile(id); });
ipcMain.handle('csv:request', (_, { id, method, args }) => { if (!['configure','page','find','copy','text','selection','excludeSelection','selectedSources','sortColumns','move','analyze','analysisSampleSheet','createTable'].includes(method)) throw new Error('未対応の操作です。'); const entry = files.get(id); if (!entry) throw new Error('ファイルが閉じられています。再度開いてください。'); return request(entry, method, args); });
ipcMain.handle('csv:clipboard', (_, text) => { if (typeof text === 'string') clipboard.writeText(text); });
ipcMain.handle('csv:preferences', (_, patch) => { const settings = readSettings(); if (patch && typeof patch === 'object') { if(patch.theme){nativeTheme.themeSource=patch.theme==='dark'?'dark':'light';window?.setBackgroundColor(nativeTheme.shouldUseDarkColors?'#292929':'#ffffff');} if(patch.theme&&window?.setTitleBarOverlay)window.setTitleBarOverlay({color:patch.theme==='dark'?'#242424':'#f5f5f5',symbolColor:patch.theme==='dark'?'#dedede':'#424242',height:34}); for (const key of ['theme','imageExportTheme','fontSize','fontFamily','accent','previewPosition','mergePosition','dockLayout','dockSizes','sidebarWidth']) if (key in patch) settings[key] = patch[key]; writeSettings(settings); } return settings; });
ipcMain.handle('csv:reveal', (_, filePath) => shell.showItemInFolder(filePath));
app.on('window-all-closed', () => app.quit());
app.on('will-quit',()=>{sBrowser?.dispose();if(onlineCache)try{fs.rmSync(onlineCache,{recursive:true,force:true});}catch{}});

ipcMain.handle('csv:export', async (_, { id, options }) => {
  const entry = files.get(id); if (!entry) throw new Error('ファイルが閉じられています。');
  const { canceled, filePath } = await dialog.showSaveDialog(window, { title: 'エクスポート（元ファイルは変更しません）', defaultPath: entry.path.replace(/\.[^.]+$/, '') + '-export.' + options.format, filters: [{ name: options.format.toUpperCase(), extensions: [options.format] }] });
  if (canceled || !filePath) return null;
  for (const opened of files.values()) {
    const norm = p => process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p);
    if (norm(opened.path) === norm(filePath)) throw new Error('開いている元ファイルへの出力はできません。別の名前を指定してください。');
    if (fs.existsSync(filePath)) { const a = fs.statSync(opened.path), b = fs.statSync(filePath); if (a.dev === b.dev && a.ino === b.ino) throw new Error('開いている元ファイルへの出力はできません。'); }
  }
  return request(entry, 'export', { ...options, path: filePath });
});

const { writeTable } = require('./tables.cjs');
function protectSources(filePath) {
  for (const entry of files.values()) {
    const norm = p => process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p);
    if (norm(entry.path) === norm(filePath)) throw new Error('開いている元ファイルには保存できません。');
    if (fs.existsSync(filePath)) { const a=fs.statSync(entry.path), b=fs.statSync(filePath); if(a.ino===b.ino && a.dev===b.dev) throw new Error('元ファイルへの保存はできません。'); }
  }
}
ipcMain.handle('csv:saveTable', async (_, { table, format }) => {
  const result = await dialog.showSaveDialog(window, { title: '結合データをエクスポート', defaultPath: 'merged.'+format, filters: [{ name: format.toUpperCase(), extensions: [format] }] });
  if (result.canceled || !result.filePath) return null;
  protectSources(result.filePath); return writeTable(table, result.filePath, format);
});
ipcMain.handle('csv:saveChart', async (_, { data, format }) => {
  if (!['png','svg'].includes(format)) throw new Error('未対応の画像形式です。');
  const result = await dialog.showSaveDialog(window, { title: 'グラフを画像として保存', defaultPath: 'chart.'+format, filters: [{ name: format.toUpperCase(), extensions: [format] }] });
  if (result.canceled || !result.filePath) return null;
  protectSources(result.filePath);
  if (format === 'png') { if (!/^data:image\/png;base64,/.test(data) || data.length > 32*1024*1024) throw new Error('画像データが不正です。'); fs.writeFileSync(result.filePath,Buffer.from(data.split(',')[1],'base64')); }
  else throw new Error('SVG保存は未対応です。');
  return result.filePath;
});

ipcMain.handle('csv:connections',()=>{const result=connectionStatus();for(const id of Object.keys(result.providers))apiProfiles?.refresh(id);return result;});
ipcMain.handle('csv:configureConnection',(_, {provider,config})=>{sharing.configure(provider,config);if(config.access_token||config.webhook)apiProfiles?.clear(provider);const result=connectionStatus();emit('csv:connectionsChanged',result);apiProfiles?.refresh(provider);return result;});
ipcMain.handle('csv:login',async(_,provider)=>{await sharing.login(provider,info=>emit('csv:auth',info));apiProfiles?.clear(provider);const result=connectionStatus();emit('csv:connectionsChanged',result);apiProfiles?.refresh(provider);return result;});
ipcMain.handle('csv:cancelLogin',()=>sharing.cancelLogin());
ipcMain.handle('csv:logout',(_,provider)=>{sharing.logout(provider);apiProfiles?.clear(provider);const result=connectionStatus();emit('csv:connectionsChanged',result);return result;});
ipcMain.handle('csv:share',(_,options)=>sharing.share(options));
ipcMain.handle('csv:shareBrowser',(_,options)=>sharing.browser(options));

ipcMain.handle('csv:openExternal',(_,url)=>{const u=new URL(url);if(u.protocol!=='https:'||!['google.com','googleusercontent.com','microsoft.com','live.com','office.com','github.com','slack.com','discord.com'].some(domain=>u.hostname===domain||u.hostname.endsWith('.'+domain)))throw new Error('未対応のURLです。');return shell.openExternal(url);});

ipcMain.handle('csv:saveDocument',async(_,blocks)=>{
  const {documentText}=require('./tables.cjs');
  if(!Array.isArray(blocks)||blocks.length>500)throw new Error('500ブロック以内で指定してください。');
  const result=await dialog.showSaveDialog(window,{title:'Markdown文書を保存',defaultPath:'merged.md',filters:[{name:'Markdown',extensions:['md']}]});if(result.canceled||!result.filePath)return null;
  const target=result.filePath;protectSources(target);const base=path.basename(target,path.extname(target))+'-assets',dir=path.join(path.dirname(target),base);const assets=[];
  for(const b of blocks)if(b.kind==='chart'){
    if(!/^[a-zA-Z0-9-]+$/.test(b.id)||typeof b.image!=='string'||!/^data:image\/png;base64,/.test(b.image)||b.image.length>32*1024*1024)throw new Error('グラフ画像が不正です。');
    const asset=path.join(dir,'chart-'+b.id+'.png');protectSources(asset);assets.push({path:asset,data:Buffer.from(b.image.split(',')[1],'base64')});
  }
  const source=documentText(blocks,base);if(Buffer.byteLength(source)>32*1024*1024)throw new Error('文書が32 MiBを超えています。');
  // Each graph is written to its own stable UUID filename; source is committed last.
  if(assets.length)fs.mkdirSync(dir,{recursive:true});for(const asset of assets)fs.writeFileSync(asset.path,asset.data);
  const temporary=target+'.csvlens-'+require('node:crypto').randomUUID()+'.tmp';try{fs.writeFileSync(temporary,source);fs.renameSync(temporary,target);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
  return {path:target,size:Buffer.byteLength(source),assets:assets.length};
});
ipcMain.handle('csv:image',(_, {id,url})=>{
  const entry=files.get(id);if(!entry)throw new Error('元のMarkdownが閉じられています。');
  if(typeof url!=='string'||/^(?:[a-z]+:|[\\/])/i.test(url))throw new Error('相対パスの画像のみ表示できます。');
  const root=fs.realpathSync(path.dirname(entry.path)),target=fs.realpathSync(path.resolve(root,decodeURIComponent(url)));
  if(!target.startsWith(root+path.sep)||!/^\.(png|jpe?g|gif|webp)$/i.test(path.extname(target))||fs.statSync(target).size>16*1024*1024)throw new Error('この画像は表示できません。');
  const type={'.png':'png','.jpg':'jpeg','.jpeg':'jpeg','.gif':'gif','.webp':'webp'}[path.extname(target).toLowerCase()];return 'data:image/'+type+';base64,'+fs.readFileSync(target).toString('base64');
});

ipcMain.handle('csv:chooseIcon',async()=>{
  const result=await dialog.showOpenDialog(window,{title:'アプリアイコンを選択',properties:['openFile'],filters:[{name:'PNG / ICO',extensions:['png','ico']}]});if(result.canceled||!result.filePaths[0])return null;
  const source=result.filePaths[0];if(fs.statSync(source).size>16*1024*1024)throw Error('アイコン画像は16 MiB以内です。');const image=nativeImage.createFromPath(source);if(image.isEmpty())throw Error('アイコン画像を読み込めませんでした。');const resized=image.resize({width:256,height:256,quality:'best'}),target=path.join(app.getPath('userData'),'app-icon.png');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,resized.toPNG());window.setIcon(resized);return resized.toDataURL();
});
ipcMain.handle('csv:icon',()=>{const target=path.join(app.getPath('userData'),'app-icon.png'),bundled=path.join(__dirname,'../assets/icon.png');const source=fs.existsSync(target)?target:bundled;return fs.existsSync(source)?nativeImage.createFromPath(source).toDataURL():null;});

// Analysis exports use the same original-file protection as ordinary exports.
ipcMain.handle('csv:analyzeMany',async(_,sources,options={})=>{
  const {aggregate,sampleTable}=require('./analysis-aggregation.cjs');
  return aggregate(sources,async(source,limits)=>{
    if(source.table)return sampleTable(source,limits);
    const entry=files.get(source.id);if(!entry)throw Error('集計元のファイルが閉じられています。');
    const visibility=source.all?{}:{hiddenRows:source.view?.hiddenRows||[],hiddenColumns:[...(source.view?.hidden||[]),...(source.view?.deletedColumns||[])],columns:source.view?.columnFilter};
    return request(entry,'analysisSampleSheet',{...source,visibility,limits});
  },options);
});
ipcMain.handle('csv:saveAnalysis',async(_, {document,format})=>{
  const {safeName,writeAnalysis}=require('./analysis-export.cjs');if(!['md','xlsx'].includes(format))throw Error('分析出力形式が不正です。');
  const result=await dialog.showSaveDialog(window,{title:'分析結果を出力',defaultPath:safeName(document.name)+'.'+format,filters:[{name:format.toUpperCase(),extensions:[format]}]});if(result.canceled||!result.filePath)return null;
  protectSources(result.filePath);return writeAnalysis(document,result.filePath,format);
});
ipcMain.handle('csv:savePlot',async(_, {data,format,name})=>{
  const {safeName,plotData}=require('./analysis-export.cjs');const bytes=plotData(data,format);
  const result=await dialog.showSaveDialog(window,{title:'分析グラフを保存',defaultPath:safeName(name)+'.'+format,filters:[{name:format.toUpperCase(),extensions:[format]}]});if(result.canceled||!result.filePath)return null;
  protectSources(result.filePath);fs.writeFileSync(result.filePath,bytes);return result.filePath;
});
