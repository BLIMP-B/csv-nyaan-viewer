'use strict';
const PROVIDERS={google:{name:'Google',domains:['google.com']},microsoft:{name:'Microsoft',domains:['microsoft.com','microsoftonline.com','live.com','office.com','office365.com','microsoft365.com','sharepoint.com']},github:{name:'GitHub',domains:['github.com']},slack:{name:'Slack',domains:['slack.com']},discord:{name:'Discord',domains:['discord.com']}};
const SERVICES=[
  {id:'gmail',name:'Gmail',provider:'google',url:'https://mail.google.com/'},
  {id:'chat',name:'Google Chat',provider:'google',url:'https://chat.google.com/'},
  {id:'sheets',name:'Google スプレッドシート',provider:'google',url:'https://docs.google.com/spreadsheets/'},
  {id:'drive',name:'Google Drive',provider:'google',url:'https://drive.google.com/'},
  {id:'onedrive',name:'OneDrive',provider:'microsoft',url:'https://onedrive.live.com/'},
  {id:'excel',name:'Excel オンライン',provider:'microsoft',url:'https://www.microsoft365.com/launch/excel'},
  {id:'outlook',name:'Outlook メール',provider:'microsoft',url:'https://outlook.office.com/mail/'},
  {id:'teams',name:'Microsoft Teams',provider:'microsoft',url:'https://teams.microsoft.com/',native:true},
  {id:'discord',name:'Discord',provider:'discord',url:'https://discord.com/app',native:true},
  {id:'slack',name:'Slack',provider:'slack',url:'https://app.slack.com/',native:true},
  {id:'github',name:'GitHub / Gist',provider:'github',url:'https://gist.github.com/'}
];
function service(id){const found=SERVICES.find(s=>s.id===id);if(!found)throw Error('未対応のS共有先です。');return found;}
function provider(id){if(!Object.hasOwn(PROVIDERS,id))throw Error('未対応のSアカウントです。');return PROVIDERS[id];}
function browserURL(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password)throw Error('内部ブラウザは認証情報を含まないHTTPS URLを使用します。');return u.href;}
function onProviderSite(id,url){try{const u=new URL(browserURL(url));return provider(id).domains.some(d=>u.hostname===d||u.hostname.endsWith('.'+d));}catch{return false;}}
const partitionFor=id=>{provider(id);return 'persist:csv-nyaan-s-'+id;};
function destination(id,{recipient='',title='',message='',text=''}={}){
  const s=service(id),body=[message,text?text.slice(0,4000):''].filter(Boolean).join('\n\n');
  if(id==='gmail')return 'https://mail.google.com/mail/?'+new URLSearchParams({view:'cm',fs:'1',to:recipient,su:title,body});
  if(id==='outlook')return 'https://outlook.office.com/mail/deeplink/compose?'+new URLSearchParams({to:recipient,subject:title,body});
  if(id==='teams'&&(recipient||message))return 'https://teams.microsoft.com/l/chat/0/0?'+new URLSearchParams({users:recipient,message});
  if(id==='github'&&text)return 'https://gist.github.com/';
  return s.url;
}
function nativeDestination(id,options={}){
  service(id);if(id==='teams')return destination(id,options).replace(/^https:/,'msteams:');
  if(id==='discord')return 'discord://';if(id==='slack')return 'slack://open';throw Error('このS接続先は内部ブラウザで開いてください。');
}
function safeFileName(value,extension){let name=String(value||'CSV nyaan Viewer export').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'').slice(0,90)||'export';name=name.replace(/\.(?:csv|xlsx|md|txt|zip)$/i,'');if(/^(?:con|prn|aux|nul|com\d|lpt\d)$/i.test(name))name='_'+name;return name+'.'+extension;}
module.exports={PROVIDERS,SERVICES,service,provider,browserURL,onProviderSite,partitionFor,destination,nativeDestination,safeFileName};
