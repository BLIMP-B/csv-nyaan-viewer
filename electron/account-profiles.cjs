'use strict';
const fs=require('node:fs'),path=require('node:path');

// Only account controls are inspected. Avatars in posts, messages and member
// lists must never become the signed-in user's application icon.
const ACCOUNT_SELECTORS={
  google:['a[aria-label*="Google Account"] img','a[aria-label*="Google アカウント"] img','button[aria-label*="Google Account"] img','button[aria-label*="Google アカウント"] img','a[href*="accounts.google.com/SignOutOptions"] img','a[href*="accounts.google.com/AccountChooser"] img'],
  microsoft:['img[data-tid="me-control-avatar"]','[data-tid="me-control-avatar"] img','[data-tid="me-control"] img','button[data-tid="me-control-trigger"] img','#mectrl_main_trigger img','#mectrl_headerPicture','#O365_MainLink_MePhoto img','img#O365_MainLink_MePhoto','button[aria-label*="Account manager"] img','button[aria-label*="アカウント マネージャー"] img'],
  github:['[data-testid="user-menu-button"] img','button[aria-label*="Open user navigation menu"] img','button[aria-label*="ユーザーナビゲーション"] img','summary[aria-label*="View profile"] img.avatar','header summary img.avatar','[data-testid="avatar-menu-button"] img'],
  slack:['button[data-qa="user-button"] img','button[data-qa="user-button"] .c-avatar__image','[data-qa="self-avatar"] .c-avatar__image','[data-qa="self-avatar"] img','[data-qa="user-menu"] img','[data-qa="user_menu"] img'],
  discord:['[data-testid="account-avatar"] img','[aria-label="User area"] img','[aria-label="ユーザーエリア"] img','section[class*="panels"] [class*="avatarWrapper"] img']
};
const MAX_BYTES=1024*1024;
function validAvatar(value){return typeof value==='string'&&value.length<=MAX_BYTES&&/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)&&Buffer.from(value.split(',')[1],'base64').subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));}
function png(image){if(!image||image.isEmpty())throw Error('プロフィール画像を取得できませんでした。');const size=image.getSize();if(size.width<1||size.height<1||size.width*size.height>16000000)throw Error('プロフィール画像のサイズが不正です。');const result=image.resize({width:64,height:64,quality:'best'}).toDataURL();if(!validAvatar(result))throw Error('プロフィール画像の形式が不正です。');return result;}
function avatarRect(selectors){
  for(const selector of selectors)for(const el of document.querySelectorAll(selector)){
    const r=el.getBoundingClientRect(),style=getComputedStyle(el);
    if(r.width<12||r.height<12||r.width>128||r.height>128||r.x<0||r.y<0||r.right>innerWidth||r.bottom>innerHeight||style.visibility!=='visible'||style.display==='none'||Number(style.opacity)===0)continue;
    if(el.tagName==='IMG'?!el.complete||el.naturalWidth===0:!style.backgroundImage.startsWith('url('))continue;
    const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);if(!top||!(top===el||el.contains(top)||top.contains(el)))continue;
    return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)};
  }
  return null;
}
async function browserAvatar(wc,provider){
  const selectors=ACCOUNT_SELECTORS[provider];if(!selectors||wc.isDestroyed())return undefined;
  const url=wc.getURL();
  try{const rect=await wc.executeJavaScript('('+avatarRect.toString()+')('+JSON.stringify(selectors)+')');if(!rect||!['x','y','width','height'].every(key=>Number.isSafeInteger(rect[key]))||rect.x<0||rect.y<0||rect.width<12||rect.height<12||rect.width>128||rect.height>128||wc.isDestroyed()||wc.getURL()!==url)return undefined;const image=await wc.capturePage(rect);if(wc.isDestroyed()||wc.getURL()!==url)return undefined;return png(image);}catch{return undefined;}
}
const IMAGE_HOSTS={google:['googleusercontent.com','ggpht.com'],github:['avatars.githubusercontent.com'],slack:['slack-edge.com']};
function imageURL(provider,value){const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.port||!IMAGE_HOSTS[provider]?.some(host=>url.hostname===host||url.hostname.endsWith('.'+host)))throw Error('プロフィール画像のURLが不正です。');return url.href;}
async function bytes(response){if(!response.ok)throw Error('プロフィール画像を取得できませんでした。');if(Number(response.headers.get('content-length'))>MAX_BYTES)throw Error('プロフィール画像が大きすぎます。');const reader=response.body.getReader(),chunks=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BYTES)throw Error('プロフィール画像が大きすぎます。');chunks.push(Buffer.from(value));}return Buffer.concat(chunks);}finally{await reader.cancel().catch(()=>{});}}
async function apiProfile(provider,{accessToken,fetch,nativeImage}){
  // Discord's configured Bot/Webhook represents an application, not a user.
  if(!['google','microsoft','github','slack'].includes(provider))return undefined;
  const access=await accessToken(provider),signal=AbortSignal.timeout(8000);
  async function json(url){const response=await fetch(url,{headers:{Authorization:'Bearer '+access,Accept:'application/json'},credentials:'omit',redirect:'error',signal});return JSON.parse((await bytes(response)).toString('utf8'));}
  async function photo(url){let target=imageURL(provider,url);for(let i=0;i<4;i++){const response=await fetch(target,{credentials:'omit',redirect:'manual',signal});if(response.status>=300&&response.status<400){await response.body?.cancel();target=imageURL(provider,new URL(response.headers.get('location'),target).href);continue;}return png(nativeImage.createFromBuffer(await bytes(response)));}throw Error('プロフィール画像のリダイレクトが多すぎます。');}
  if(provider==='google'){const data=await json('https://www.googleapis.com/drive/v3/about?fields=user(displayName,photoLink)');return {name:data.user?.displayName,avatar:await photo(data.user?.photoLink)};}
  if(provider==='github'){const data=await json('https://api.github.com/user');return {name:data.name||data.login,avatar:await photo(data.avatar_url)};}
  if(provider==='microsoft'){const data=await json('https://graph.microsoft.com/v1.0/me?$select=displayName,id'),response=await fetch('https://graph.microsoft.com/v1.0/me/photos/48x48/$value',{headers:{Authorization:'Bearer '+access},credentials:'omit',redirect:'error',signal});return {name:data.displayName,avatar:png(nativeImage.createFromBuffer(await bytes(response)))};}
  const auth=await json('https://slack.com/api/auth.test');if(!auth.ok||auth.bot_id||!auth.user_id)return undefined;
  const data=await json('https://slack.com/api/users.info?user='+encodeURIComponent(auth.user_id));if(!data.ok||data.user?.is_bot||data.user?.id!==auth.user_id)return undefined;
  return {name:data.user.real_name||data.user.name,avatar:await photo(data.user.profile?.image_72||data.user.profile?.image_48)};
}
function createApiProfiles({userData,accessToken,fetch,nativeImage,connected,notify}){
  const target=path.join(userData,'account-profiles.json'),profiles={},versions=new Map(),pending=new Map(),attempted=new Map();
  try{const saved=JSON.parse(fs.readFileSync(target,'utf8'));for(const id of Object.keys(ACCOUNT_SELECTORS))if(validAvatar(saved[id]?.avatar))profiles[id]={avatar:saved[id].avatar,name:String(saved[id].name||'').slice(0,100)};}catch{}
  function persist(){fs.mkdirSync(userData,{recursive:true});fs.writeFileSync(target+'.tmp',JSON.stringify(profiles));fs.renameSync(target+'.tmp',target);notify();}
  function clear(id){versions.set(id,(versions.get(id)||0)+1);delete profiles[id];pending.delete(id);attempted.delete(id);persist();}
  function get(id){return connected(id)?profiles[id]:undefined;}
  function refresh(id){if(!connected(id)||pending.has(id)||Date.now()-(attempted.get(id)||0)<60000)return;attempted.set(id,Date.now());const version=versions.get(id)||0;
    const task=apiProfile(id,{accessToken,fetch,nativeImage}).then(profile=>{if(profile&&(versions.get(id)||0)===version&&connected(id)){profiles[id]={avatar:profile.avatar,name:String(profile.name||'').slice(0,100)};persist();}}).catch(()=>{}).finally(()=>{if(pending.get(id)===task)pending.delete(id);});pending.set(id,task);
  }
  return {get,refresh,clear};
}
module.exports={browserAvatar,apiProfile,createApiProfiles,validAvatar,imageURL};
