'use strict';
const { shell, safeStorage, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { tableText, validateTable, documentText } = require('./tables.cjs');
const PROVIDERS = ['google','microsoft','github','slack','discord'];
let configPath, configs = {}, secrets = {};
function init(userData) {
  configPath = path.join(userData,'connections.json');
  try { const saved=JSON.parse(fs.readFileSync(configPath,'utf8'));configs=saved.configs||{}; if(saved.encrypted && secure())secrets=JSON.parse(safeStorage.decryptString(Buffer.from(saved.encrypted,'base64'))); } catch {}
}
function secure(){return safeStorage.isEncryptionAvailable() && (process.platform!=='linux'||safeStorage.getSelectedStorageBackend()!=='basic_text');}
function persist(){fs.mkdirSync(path.dirname(configPath),{recursive:true});fs.writeFileSync(configPath,JSON.stringify({configs,encrypted:secure()?safeStorage.encryptString(JSON.stringify(secrets)).toString('base64'):undefined},null,2));}
function status(){return {secureStorage:secure(),providers:Object.fromEntries(PROVIDERS.map(p=>[p,{...configs[p],connected:!!(secrets[p]?.access_token||secrets[p]?.webhook),hasSecret:!!secrets[p]?.clientSecret}]))};}
function configure(provider, value) {
  if(!PROVIDERS.includes(provider))throw new Error('未対応の接続先です。');
  configs[provider]={ clientId:String(value.clientId||'').trim(), tenant:String(value.tenant||'common').trim() };
  secrets[provider]||={};
  for(const key of ['clientSecret','access_token','webhook'])if(value[key])secrets[provider][key]=String(value[key]).trim();
  persist();return status();
}
async function api(url,options={}){
  const response=await net.fetch(url,{...options,signal:AbortSignal.timeout(60000)}),body=await response.text();let data;try{data=JSON.parse(body);}catch{data=body;}
  if(!response.ok)throw new Error(`接続先がエラーを返しました (${response.status}): ${typeof data==='string'?data.slice(0,250):data.error?.message||data.error_description||data.error||JSON.stringify(data).slice(0,250)}`);
  return data;
}
const form=data=>({method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(data).toString()});
function endpoints(provider){
  if(provider==='google')return {authorize:'https://accounts.google.com/o/oauth2/v2/auth',token:'https://oauth2.googleapis.com/token',scope:'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/chat.messages.create'};
  const tenant=encodeURIComponent(configs.microsoft?.tenant||'common');
  return {authorize:`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,token:`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,scope:'offline_access User.Read Files.ReadWrite Files.Read.All Mail.ReadWrite'};
}
let activeLogin;
async function login(provider,notify){
  if(activeLogin)throw new Error('別のログイン処理が進行中です。');
  if(!['google','microsoft','github'].includes(provider))throw new Error('Slack・DiscordはWebhookまたはBotトークンを接続設定に入力してください。');
  const clientId=configs[provider]?.clientId;if(!clientId)throw new Error('接続設定でOAuthクライアントIDを登録してください。');
  if(provider==='github'){
    const cancel={cancelled:false};activeLogin=cancel;
    try{
      const device=await api('https://github.com/login/device/code',{...form({client_id:clientId,scope:'gist'}),headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'}});
      notify({provider,code:device.user_code,url:device.verification_uri});await shell.openExternal(device.verification_uri);
      const expires=Date.now()+device.expires_in*1000;let interval=Math.max(5,device.interval||5);
      while(Date.now()<expires&&!cancel.cancelled){await new Promise(r=>setTimeout(r,interval*1000));if(cancel.cancelled)break;const response=await api('https://github.com/login/oauth/access_token',{...form({client_id:clientId,device_code:device.device_code,grant_type:'urn:ietf:params:oauth:grant-type:device_code'}),headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'}});if(response.access_token){secrets[provider]={...secrets[provider],...response};persist();return status();}if(response.error==='slow_down')interval+=5;else if(response.error!=='authorization_pending')throw new Error(response.error_description||response.error);}
      throw new Error('ログインがキャンセルされたか有効期限が切れました。');
    }finally{activeLogin=null;}
  }
  const state=crypto.randomBytes(24).toString('hex'),verifier=crypto.randomBytes(32).toString('base64url'),challenge=crypto.createHash('sha256').update(verifier).digest('base64url'),redirect='http://localhost:53682/oauth/callback';
  const endpoint=endpoints(provider);
  return new Promise((resolve,reject)=>{
    let done=false;let timer;
    const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);server.close();activeLogin=null;error?reject(error):resolve(result);};
    const server=http.createServer(async(req,res)=>{
      const callback=new URL(req.url,redirect);
      if(callback.pathname!=='/oauth/callback'){res.writeHead(404);res.end();return;}
      if(callback.searchParams.get('state')!==state){res.writeHead(400);res.end('Invalid state');return;}
      if(callback.searchParams.get('error')){res.writeHead(400);res.end('Login was not completed.');finish(new Error(callback.searchParams.get('error_description')||callback.searchParams.get('error')));return;}
      const code=callback.searchParams.get('code');if(!code){res.writeHead(400);res.end('Missing code');return;}
      try{
        const params={client_id:clientId,code,redirect_uri:redirect,grant_type:'authorization_code',code_verifier:verifier};
        if(secrets[provider]?.clientSecret)params.client_secret=secrets[provider].clientSecret;
        const token=await api(endpoint.token,form(params));secrets[provider]={...secrets[provider],...token,expires_at:Date.now()+(token.expires_in||3600)*1000};persist();res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<html lang="ja"><body><h2>CSV nyaan Viewerへの接続が完了しました。</h2><p>このタブを閉じてアプリへ戻ってください。</p></body></html>');finish(null,status());
      }catch(error){res.writeHead(500);res.end('Login failed. Return to CSV nyaan Viewer for details.');finish(error);}
    });
    server.on('error',error=>finish(error));activeLogin={cancelled:false,cancel:()=>finish(new Error('ログインをキャンセルしました。'))};
    server.listen(53682,'127.0.0.1',async()=>{const query=new URLSearchParams({client_id:clientId,redirect_uri:redirect,response_type:'code',scope:endpoint.scope,state,code_challenge:challenge,code_challenge_method:'S256'});if(provider==='google'){query.set('access_type','offline');query.set('prompt','consent');}try{await shell.openExternal(endpoint.authorize+'?'+query.toString());}catch(error){finish(error);}});
    timer=setTimeout(()=>finish(new Error('ログインの有効期限が切れました。')),5*60*1000);
  });
}
function cancelLogin(){if(activeLogin){activeLogin.cancelled=true;activeLogin.cancel?.();}}
function logout(provider){delete secrets[provider];persist();return status();}
async function token(provider){
  const secret=secrets[provider];if(!secret?.access_token)throw new Error('このサービスにログインしてください。');
  if(secret.refresh_token&&secret.expires_at&&secret.expires_at<Date.now()+60000){const params={client_id:configs[provider]?.clientId,refresh_token:secret.refresh_token,grant_type:'refresh_token'};if(secret.clientSecret)params.client_secret=secret.clientSecret;const updated=await api(endpoints(provider).token,form(params));secrets[provider]={...secret,...updated,expires_at:Date.now()+(updated.expires_in||3600)*1000};persist();}
  return secrets[provider].access_token;
}
function jsonRequest(access,data,method='POST'){return {method,headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},body:JSON.stringify(data)};}
async function uploadGoogle(access,name,content,mime='text/csv'){
  const boundary='csv-lens-'+crypto.randomBytes(8).toString('hex');
  const prefix=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({name,mimeType:mime})}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`;
  const body=Buffer.concat([Buffer.from(prefix),Buffer.isBuffer(content)?content:Buffer.from(content),Buffer.from(`\r\n--${boundary}--`)]);
  const file=await api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',{method:'POST',headers:{Authorization:'Bearer '+access,'Content-Type':'multipart/related; boundary='+boundary},body});return {url:file.webViewLink||'https://drive.google.com/file/d/'+file.id+'/view',id:file.id};
}
async function sheetGoogle(access,table,title){
  const sheet=await api('https://sheets.googleapis.com/v4/spreadsheets',jsonRequest(access,{properties:{title},sheets:[{properties:{title:'Data',gridProperties:{rowCount:Math.max(1000,table.rows.length+1),columnCount:Math.max(26,table.headers.length)}}}]}));
  const rows=[table.headers,...table.rows];
  for(let offset=0;offset<rows.length;offset+=5000){const range=encodeURIComponent('Data!A'+(offset+1));await api(`https://sheets.googleapis.com/v4/spreadsheets/${sheet.spreadsheetId}/values/${range}?valueInputOption=RAW`,jsonRequest(access,{values:rows.slice(offset,offset+5000)},'PUT'));}
  return {url:sheet.spreadsheetUrl,id:sheet.spreadsheetId};
}
async function share(options){
  const {service,table,recipient='',message='',title='CSV nyaan Viewer export',name:requestedName='csv-lens-export.csv'}=options;validateTable(table);
  let text=tableText(table,'csv'),payload=Buffer.from(text),name=requestedName,mime='text/csv';
  const document=options.document;
  if(document?.length&&!['sheets','excel'].includes(service)){
    text=documentText(document,'assets');
    if(service==='github'){name=name.replace(/\.[^.]+$/,'.md');payload=Buffer.from(text);mime='text/markdown';}
    else{const JSZip=require('jszip');const zip=new JSZip();zip.file('document.md',text);for(const b of document)if(b.kind==='chart'){if(!/^[a-zA-Z0-9-]+$/.test(b.id)||!/^data:image\/png;base64,/.test(b.image||''))throw new Error('グラフ画像が不正です。');zip.file('assets/chart-'+b.id+'.png',Buffer.from(b.image.split(',')[1],'base64'));}payload=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});name=name.replace(/\.[^.]+$/,'.zip');mime='application/zip';}
  }
  if(payload.length>8*1024*1024)throw new Error('直接共有は8 MiB以内です。ファイルにエクスポートして共有してください。');
  if(['drive','sheets','gmail','chat'].includes(service)){
    const access=await token('google');
    if(service==='drive')return uploadGoogle(access,name,payload,mime);
    if(service==='sheets')return sheetGoogle(access,table,title);
    if(service==='chat'){
      if(!/^spaces\/[A-Za-z0-9_-]+$/.test(recipient))throw new Error('共有先を spaces/xxxx 形式で指定してください。');
      const uploaded=await uploadGoogle(access,name,payload,mime);
      const result=await api('https://chat.googleapis.com/v1/'+recipient+'/messages',jsonRequest(access,{text:[message,uploaded.url].filter(Boolean).join('\n')}));return {url:'https://chat.google.com/',id:result.name,note:'Google ChatにDriveリンクを投稿しました。Driveのアクセス権は別途設定してください。'};
    }
    if(/[\r\n]/.test(recipient))throw new Error('メールアドレスの改行は使用できません。');
    const boundary='csv-lens-'+crypto.randomBytes(8).toString('hex'),subject='=?UTF-8?B?'+Buffer.from(title).toString('base64')+'?=';
    const raw=['To: '+recipient,'Subject: '+subject,'MIME-Version: 1.0','Content-Type: multipart/mixed; boundary="'+boundary+'"','','--'+boundary,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',Buffer.from(message).toString('base64'),'--'+boundary,'Content-Type: '+mime,'Content-Disposition: attachment; filename="'+(document?.length?'document.zip':'export.csv')+'"; filename*=UTF-8\'\''+encodeURIComponent(name),'Content-Transfer-Encoding: base64','',payload.toString('base64'),'--'+boundary+'--'].join('\r\n');
    const draft=await api('https://gmail.googleapis.com/gmail/v1/users/me/drafts',jsonRequest(access,{message:{raw:Buffer.from(raw).toString('base64url')}}));return {url:'https://mail.google.com/mail/u/0/#drafts',id:draft.id,note:'ファイルを添付した下書きを作成しました。Gmailで内容を確認して送信してください。'};
  }
  if(['onedrive','excel','outlook','teams'].includes(service)){
    const access=await token('microsoft');
    if(service==='outlook'){
      const recipients=recipient.split(/[;,]/).map(s=>s.trim()).filter(Boolean);if(!recipients.length)throw new Error('宛先を指定してください。');
      const draft=await api('https://graph.microsoft.com/v1.0/me/messages',jsonRequest(access,{subject:title,body:{contentType:'Text',content:message},toRecipients:recipients.map(address=>({emailAddress:{address}})),attachments:[{'@odata.type':'#microsoft.graph.fileAttachment',name,contentType:mime,contentBytes:payload.toString('base64')}]}));return {url:draft.webLink||'https://outlook.office.com/mail/drafts',id:draft.id,note:'ファイル添付の下書きを作成しました。Outlookで確認して送信してください。'};
    }
    if(service==='excel'){
      // Create native XLSX with every cell typed as a string, including formulas.
      const ExcelJS=require('exceljs');const workbook=new ExcelJS.Workbook();const sheet=workbook.addWorksheet('Data');sheet.addRows([table.headers,...table.rows]);const content=await workbook.xlsx.writeBuffer();
      const item=await api('https://graph.microsoft.com/v1.0/me/drive/root:/'+encodeURIComponent(name.replace(/\.csv$/i,'')+'-'+crypto.randomBytes(3).toString('hex')+'.xlsx')+':/content',{method:'PUT',headers:{Authorization:'Bearer '+access,'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},body:content});return {url:item.webUrl,id:item.id};
    }
    const item=await api('https://graph.microsoft.com/v1.0/me/drive/root:/'+encodeURIComponent(name.replace(/\.[^.]+$/,'')+'-'+crypto.randomBytes(3).toString('hex')+require('node:path').extname(name))+':/content',{method:'PUT',headers:{Authorization:'Bearer '+access,'Content-Type':mime},body:payload});
    if(service==='teams'){const link='https://teams.microsoft.com/l/chat/0/0?users='+encodeURIComponent(recipient)+'&message='+encodeURIComponent([message,item.webUrl].filter(Boolean).join('\n'));await shell.openExternal(link);return {url:item.webUrl,note:'Teamsの共有画面を開きました。ファイルのアクセス権と送信内容を確認してください。'};}
    return {url:item.webUrl,id:item.id};
  }
  if(service==='github'){
    const access=await token('github');const result=await api('https://api.github.com/gists',{...jsonRequest(access,{description:title,public:!!options.public,files:{[name]:{content:text}}}),headers:{Authorization:'Bearer '+access,'Content-Type':'application/json',Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});return {url:result.html_url,id:result.id,note:(options.public?'公開Gistを作成しました。':'非公開一覧のGistを作成しました。URLを知る人は閲覧できます。')+(document?.length?' .md本文を共有しました。Gistでは画像ファイルを添付できないため、グラフ画像は含まれません。':'')};
  }
  if(service==='slack'||service==='discord'){
    const secret=secrets[service]||{};const content=[message,'```csv\n'+text.slice(0,1400)+'\n```'].filter(Boolean).join('\n');
    if(service==='slack'&&secret.access_token){
      if(!recipient)throw new Error('SlackのチャンネルIDを指定してください。');
      const uploaded=await api('https://slack.com/api/files.getUploadURLExternal',{...form({filename:name,length:String(payload.length)}),headers:{Authorization:'Bearer '+secret.access_token,'Content-Type':'application/x-www-form-urlencoded'}});
      if(!uploaded.ok)throw new Error(uploaded.error);
      await api(uploaded.upload_url,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:payload});
      const result=await api('https://slack.com/api/files.completeUploadExternal',jsonRequest(secret.access_token,{files:[{id:uploaded.file_id,title}],channel_id:recipient,initial_comment:message}));
      if(!result.ok)throw new Error(result.error);return {url:'https://app.slack.com/',note:'ファイルを指定チャンネルに投稿しました。'};
    }
    if(service==='discord'&&secret.access_token){
      if(!/^\d+$/.test(recipient))throw new Error('DiscordのチャンネルIDを指定してください。');
      const data=new FormData();data.append('payload_json',JSON.stringify({content:message.slice(0,1900),allowed_mentions:{parse:[]},attachments:[{id:0,filename:name}]}));data.append('files[0]',new Blob([payload],{type:mime}),name);
      const posted=await api('https://discord.com/api/v10/channels/'+recipient+'/messages',{method:'POST',headers:{Authorization:'Bot '+secret.access_token},body:data});return {url:'https://discord.com/channels/@me/'+recipient+'/'+posted.id,note:'ファイルをBotで投稿しました。'};
    }
    const webhook=secret.webhook;
    if(!webhook)throw new Error('接続設定にWebhook URLまたはBotトークンを指定してください。');
    const url=new URL(webhook);if(url.protocol!=='https:' || (service==='slack'?url.hostname!=='hooks.slack.com':!['discord.com','discordapp.com'].includes(url.hostname)))throw new Error('公式Webhook URLを指定してください。');
    if(service==='discord'){const data=new FormData();data.append('payload_json',JSON.stringify({content:message.slice(0,1900),allowed_mentions:{parse:[]},attachments:[{id:0,filename:name}]}));data.append('files[0]',new Blob([payload],{type:mime}),name);await api(webhook,{method:'POST',body:data});return {url:'https://discord.com/app',note:'Webhookの設定先にファイルを投稿しました。'};}
    await api(webhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:content})});return {url:'https://app.slack.com/',note:'Webhookの設定先にテキストプレビューを投稿しました（最大1,400文字）。'};
  }
  throw new Error('未対応の共有先です。');
}
async function browser(options){
  const {service,recipient='',message='',title='CSV nyaan Viewer export'}=options;
  const body=message+(options.table?'\n\n'+tableText(options.table,'csv').slice(0,4000):'');
  const urls={gmail:'https://mail.google.com/mail/?view=cm&fs=1&to='+encodeURIComponent(recipient)+'&su='+encodeURIComponent(title)+'&body='+encodeURIComponent(body),chat:'https://chat.google.com/',drive:'https://drive.google.com/',sheets:'https://sheets.google.com/',onedrive:'https://onedrive.live.com/',excel:'https://www.microsoft365.com/launch/excel',outlook:'https://outlook.office.com/mail/deeplink/compose?to='+encodeURIComponent(recipient)+'&subject='+encodeURIComponent(title)+'&body='+encodeURIComponent(body),discord:'https://discord.com/app',slack:'https://app.slack.com/',github:'https://github.com/',teams:'https://teams.microsoft.com/'};
  const apps={outlook:'mailto:'+encodeURIComponent(recipient)+'?subject='+encodeURIComponent(title)+'&body='+encodeURIComponent(body),discord:'discord://',slack:'slack://open',github:/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(recipient)?'x-github-client://openRepo/https://github.com/'+recipient:null};
  const url=options.native?apps[service]:urls[service];if(!url)throw new Error('このサービスはブラウザで開いてください。');await shell.openExternal(url);return {note:'共有先を開きました。ファイルの自動添付・アップロードは行っていません。'};
}
module.exports={init,status,configure,login,cancelLogin,logout,share,browser,accessToken:token};
