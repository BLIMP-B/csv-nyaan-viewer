'use strict';
const fs=require('node:fs'),path=require('node:path');
const {PROVIDERS,SERVICES,service,provider,browserURL,onProviderSite,partitionFor,destination,nativeDestination}=require('./s-services.cjs');
const {payload}=require('./s-payload.cjs');
const CHROME_HEIGHT=164;
function createBrowserManager({electron,userData,tempDir,mainWindow,resolveFile,protectFile,notify}){
  const {BrowserWindow,WebContentsView,session,ipcMain,dialog,clipboard,shell,nativeTheme}=electron;
  const statePath=path.join(userData,'s-accounts.json'),entries=new Map(),resources=new Set(),clearing=new Set(),initializedSessions=new Set();let accounts={};
  try{const saved=JSON.parse(fs.readFileSync(statePath,'utf8'));for(const id of Object.keys(PROVIDERS)){const a=saved[id];if(a?.connected===true&&typeof a.label==='string')accounts[id]={provider:id,label:a.label.slice(0,60),connected:true,service:SERVICES.some(s=>s.id===a.service&&s.provider===id)?a.service:SERVICES.find(s=>s.provider===id).id,confirmedAt:typeof a.confirmedAt==='string'?a.confirmedAt:''};}}catch{}
  const list=()=>Object.keys(PROVIDERS).map(id=>accounts[id]||{provider:id,label:provider(id).name,connected:false});
  function persist(){fs.mkdirSync(userData,{recursive:true});const temporary=statePath+'.tmp';fs.writeFileSync(temporary,JSON.stringify(accounts,null,2));fs.renameSync(temporary,statePath);notify(list());for(const entry of entries.values())sendState(entry);}
  function browserSession(id){const ses=session.fromPartition(partitionFor(id));if(!initializedSessions.has(id)){initializedSessions.add(id);ses.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));ses.setPermissionCheckHandler(()=>false);ses.on('will-download',(_event,item)=>item.setSaveDialogOptions({title:'内部ブラウザからダウンロード',defaultPath:path.basename(item.getFilename())}));}return ses;}
  function browserState(entry){const wc=entry.view.webContents,url=wc.isDestroyed()?'':wc.getURL(),location=new URL(url||entry.service.url);return {service:entry.service.id,serviceName:entry.service.name,provider:entry.service.provider,url,canBack:!wc.isDestroyed()&&wc.navigationHistory.canGoBack(),canForward:!wc.isDestroyed()&&wc.navigationHistory.canGoForward(),busy:entry.busy,canConfirm:!entry.busy&&onProviderSite(entry.service.provider,url)&&!/^accounts\.|^login\./i.test(location.hostname)&&!/(?:^|\/)(?:login|signin|oauth2?|authorize|sso|signout|logout|accountchooser)(?:\/|$)/i.test(location.pathname),account:accounts[entry.service.provider]||null,fileName:entry.resource?.name||'',native:!!entry.service.native,theme:nativeTheme.shouldUseDarkColors?'dark':'light',error:entry.error};}
  function sendState(entry){if(!entry.window.isDestroyed())entry.window.webContents.send('s-browser:state',browserState(entry));}
  function report(entry,error){entry.error=String(error).replace(/^Error: /,'').slice(0,400);sendState(entry);}
  function releaseResource(resource){if(resource&&--resource.refs<=0){resources.delete(resource);fs.rmSync(resource.dir,{recursive:true,force:true});}}
  function create(s,resource,options={},popupOptions){
    if(clearing.has(s.provider))throw Error('このSアカウントはログアウト処理中です。');
    const customIcon=path.join(userData,'app-icon.png'),icon=fs.existsSync(customIcon)?customIcon:path.join(__dirname,'../assets/icon.png');
    const win=new BrowserWindow({icon,width:1120,height:780,minWidth:820,minHeight:520,title:s.name+' — S内部ブラウザ',autoHideMenuBar:true,backgroundColor:nativeTheme.shouldUseDarkColors?'#242424':'#f5f5f5',webPreferences:{preload:path.join(__dirname,'s-browser-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    const view=new WebContentsView({...(popupOptions?.webContents?{webContents:popupOptions.webContents}:{}),webPreferences:{...popupOptions?.webPreferences,preload:undefined,session:browserSession(s.provider),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,allowRunningInsecureContent:false}});
    const entry={window:win,view,service:s,resource,options,busy:false,error:''},chromeId=win.webContents.id;entries.set(chromeId,entry);if(resource)resource.refs++;
    win.setMenu(null);win.contentView.addChildView(view);
    const resize=()=>{const b=win.getContentBounds();view.setBounds({x:0,y:CHROME_HEIGHT,width:b.width,height:Math.max(0,b.height-CHROME_HEIGHT)});};win.on('resize',resize);resize();
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());win.webContents.once('did-finish-load',()=>sendState(entry));win.loadFile(path.join(__dirname,'s-browser.html'));
    const wc=view.webContents;
    const navigation=(event,url)=>{try{browserURL(url);}catch(error){event.preventDefault();report(entry,error);}};
    wc.on('will-navigate',navigation);wc.on('will-redirect',navigation);
    wc.setWindowOpenHandler(({url})=>{try{if(url!=='about:blank')browserURL(url);}catch(error){report(entry,error);return {action:'deny'};}return {action:'allow',overrideBrowserWindowOptions:{webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}},createWindow:popupOptions=>create(s,resource,options,{...popupOptions,initialURL:url}).view.webContents};});
    wc.on('did-start-loading',()=>{entry.busy=true;entry.error='';sendState(entry);});wc.on('did-stop-loading',()=>{entry.busy=false;sendState(entry);});wc.on('did-navigate',()=>sendState(entry));wc.on('did-navigate-in-page',()=>sendState(entry));
    wc.on('did-fail-load',(_e,code,description,_url,isMainFrame)=>{if(isMainFrame&&code!==-3){entry.busy=false;report(entry,'ページを開けませんでした（'+code+'）。'+description+'。認証制限の場合は既存の「接続」または外部ブラウザを利用してください。');}});
    // Chromium's chooser interception supplies the actual input node. Remote pages
    // receive a file only after the user confirms it in a native application dialog.
    wc.debugger.on('message',async(_event,method,params,sessionId)=>{
      if(method!=='Page.fileChooserOpened'||entry.choosing)return;entry.choosing=true;
      try{let files=[];
        if(resource){const answer=await dialog.showMessageBox(win,{type:'question',title:'共有ファイルを添付',message:s.name+'へ添付するファイルを選択してください。',detail:resource.name,buttons:['この共有ファイルを使う','別のファイルを選ぶ','キャンセル'],defaultId:0,cancelId:2});if(answer.response===0)files=[resource.path];else if(answer.response!==1)return;}
        if(!files.length){const answer=await dialog.showOpenDialog(win,{title:'添付・アップロードするファイルを選択',defaultPath:resource?.path,properties:params.mode==='selectMultiple'?['openFile','multiSelections']:['openFile']});if(answer.canceled)return;files=answer.filePaths;}
        if(!win.isDestroyed()&&!wc.isDestroyed()){const input={backendNodeId:params.backendNodeId,files};if(sessionId)await wc.debugger.sendCommand('DOM.setFileInputFiles',input,sessionId);else await wc.debugger.sendCommand('DOM.setFileInputFiles',input);}
      }catch(error){if(!win.isDestroyed())report(entry,error);}finally{entry.choosing=false;}
    });
    const prepareChooser=async()=>{try{if(!wc.debugger.isAttached())wc.debugger.attach('1.3');await wc.debugger.sendCommand('Page.enable');await wc.debugger.sendCommand('Page.setInterceptFileChooserDialog',{enabled:true});}catch{if(!win.isDestroyed())report(entry,'共有ファイルを保存してから、サービス画面で添付してください。');}};
    wc.on('did-finish-load',prepareChooser);
    wc.on('close',()=>{if(!win.isDestroyed())win.close();});wc.on('destroyed',()=>{if(!win.isDestroyed())win.close();});
    win.on('closed',()=>{entries.delete(chromeId);if(!wc.isDestroyed())wc.close();releaseResource(resource);});
    if(!popupOptions?.webContents){const url=popupOptions?.initialURL||destination(s.id,{...options,text:resource?.text||''});if(url!=='about:blank')wc.loadURL(browserURL(url)).catch(error=>{if(!win.isDestroyed())report(entry,error);});}
    return entry;
  }
  async function open(options={}){
    const s=service(options.service);if(clearing.has(s.provider))throw Error('ログアウトの完了後に接続してください。');
    for(const name of ['title','recipient','message'])if(options[name]!==undefined&&(typeof options[name]!=='string'||options[name].length>(name==='message'?8000:300)))throw Error('S共有の入力が長すぎるか不正です。');
    if(options.native){await shell.openExternal(nativeDestination(s.id,options));return {note:s.name+'アプリを開きました。アプリ側でログイン・添付・送信してください。S内部ブラウザのログインとは別に管理されます。'};}
    let resource;
    if(options.table||options.document?.length||options.fileId){const original=options.fileId?resolveFile(options.fileId):undefined;if(options.fileId&&!original)throw Error('共有元のファイルが閉じられています。');const data=await payload(options,original),dir=fs.mkdtempSync(path.join(tempDir,'s-share-'));try{const target=path.join(dir,data.name);fs.writeFileSync(target,data.bytes,{flag:'wx'});resource={...data,path:target,dir,refs:0};resources.add(resource);}catch(error){fs.rmSync(dir,{recursive:true,force:true});throw error;}}
    try{const entry=create(s,resource,options);return {browserId:entry.window.id,fileName:resource?.name,note:'S内部ブラウザを開きました。サービスの画面で添付・送信を確認してください。'};}catch(error){if(resource&&resource.refs===0){resources.delete(resource);fs.rmSync(resource.dir,{recursive:true,force:true});}throw error;}
  }
  async function logout(id){provider(id);if(clearing.has(id))throw Error('ログアウト処理中です。');clearing.add(id);try{for(const entry of [...entries.values()])if(entry.service.provider===id)entry.window.destroy();const ses=browserSession(id);await ses.clearStorageData();await ses.clearCache();await ses.clearAuthCache();ses.flushStorageData();delete accounts[id];persist();return list();}finally{clearing.delete(id);}}
  function mainSender(event){const main=mainWindow();if(!main||event.sender!==main.webContents||event.senderFrame!==event.sender.mainFrame)throw Error('S共有の操作元が不正です。');}
  function chromeSender(event){const entry=entries.get(event.sender.id);if(!entry||event.sender!==entry.window.webContents||event.senderFrame!==event.sender.mainFrame)throw Error('内部ブラウザの操作元が不正です。');return entry;}
  ipcMain.handle('csv:sAccounts',event=>{mainSender(event);return list();});ipcMain.handle('csv:sServices',event=>{mainSender(event);return SERVICES;});ipcMain.handle('csv:sOpen',(event,options)=>{mainSender(event);return open(options);});ipcMain.handle('csv:sLogout',(event,id)=>{mainSender(event);return logout(id);});
  ipcMain.handle('s-browser:state',event=>browserState(chromeSender(event)));
  ipcMain.handle('s-browser:command',async(event,{command,value}={})=>{
    const entry=chromeSender(event),wc=entry.view.webContents;
    switch(command){
      case 'back':if(wc.navigationHistory.canGoBack())wc.navigationHistory.goBack();break;
      case 'forward':if(wc.navigationHistory.canGoForward())wc.navigationHistory.goForward();break;
      case 'reload':wc.reload();break;
      case 'navigate':await wc.loadURL(browserURL(value));break;
      case 'external':await shell.openExternal(browserURL(wc.getURL()));return {note:'外部ブラウザはS内部ブラウザとは別のログインを使用します。'};
      case 'confirm':{if(clearing.has(entry.service.provider)||!browserState(entry).canConfirm)throw Error('ログイン完了後、接続先のサービス画面で確認してください。');if(typeof value!=='string'||value.length>60)throw Error('表示名は60文字以内です。');accounts[entry.service.provider]={provider:entry.service.provider,label:value.trim()||provider(entry.service.provider).name,connected:true,service:entry.service.id,confirmedAt:new Date().toISOString()};entry.view.webContents.session.flushStorageData();persist();return {note:'Sアカウントを登録しました。ログインの有効性はサービス画面で確認してください。'};}
      case 'logout':{const answer=await dialog.showMessageBox(entry.window,{type:'question',message:provider(entry.service.provider).name+'のS接続からログアウトしますか？',detail:'S内部ブラウザのログイン情報を消去します。既存の「接続」と、他のブラウザ・アプリのログインは保持されます。',buttons:['ログアウト','キャンセル'],defaultId:1,cancelId:1});if(answer.response===0)await logout(entry.service.provider);break;}
      case 'copy':if(!entry.resource)throw Error('共有データがありません。');clipboard.writeText(entry.resource.text.slice(0,4*1024*1024));return {note:'本文をコピーしました。サービス画面へ貼り付けてください（最大4 Mi文字）。'};
      case 'save':{if(!entry.resource)throw Error('共有ファイルがありません。');const answer=await dialog.showSaveDialog(entry.window,{title:'共有ファイルを保存',defaultPath:entry.resource.name});if(!answer.canceled&&answer.filePath){protectFile(answer.filePath);fs.copyFileSync(entry.resource.path,answer.filePath);return {note:'共有ファイルを保存しました。'};}break;}
      case 'native':await shell.openExternal(nativeDestination(entry.service.id,entry.options));return {note:'アプリを開きました。共有ファイルを保存し、アプリ側で添付・送信してください。'};
      default:throw Error('未対応の内部ブラウザ操作です。');
    }
    return {note:''};
  });
  const themeChanged=()=>{for(const entry of entries.values())sendState(entry);};nativeTheme.on('updated',themeChanged);
  function dispose(){nativeTheme.removeListener('updated',themeChanged);for(const entry of [...entries.values()])entry.window.destroy();for(const resource of resources)fs.rmSync(resource.dir,{recursive:true,force:true});resources.clear();}
  return {open,logout,list,dispose};
}
module.exports={createBrowserManager,CHROME_HEIGHT};
