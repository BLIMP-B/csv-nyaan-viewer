'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {apiProfile,browserAvatar,createApiProfiles,validAvatar,imageURL}=require('../electron/account-profiles.cjs');
const fixture=fs.readFileSync(path.join(__dirname,'../assets/icon.png')),avatar='data:image/png;base64,'+fixture.toString('base64');
const image={isEmpty:()=>false,getSize:()=>({width:64,height:64}),resize:()=>image,toDataURL:()=>avatar},nativeImage={createFromBuffer:b=>b.equals(fixture)?image:{isEmpty:()=>true}};
const json=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}}),photo=()=>new Response(fixture);
function setup(handler){const calls=[];return {calls,options:{accessToken:async()=> 'test-user-token',nativeImage,fetch:async(url,options)=>{calls.push({url,options});return handler(url,options);}}};}
test('Google/GitHubの本人APIを利用し、画像CDNへ認証ヘッダーを送らない',async()=>{
  for(const [id,url,data] of [['google','https://lh3.googleusercontent.com/a/own',{user:{displayName:'本人',photoLink:'https://lh3.googleusercontent.com/a/own'}}],['github','https://avatars.githubusercontent.com/u/123',{login:'own-user',avatar_url:'https://avatars.githubusercontent.com/u/123'}]]){
    const {calls,options}=setup(address=>address===url?photo():json(data)),profile=await apiProfile(id,options);assert.ok(validAvatar(profile.avatar));assert.ok(profile.name);assert.equal(calls[0].options.headers.Authorization,'Bearer test-user-token');assert.equal(calls[1].options.headers,undefined);assert.equal(calls[1].options.redirect,'manual');
  }
});
test('Microsoftの本人画像はGraph User.Readの範囲で取得する',async()=>{
  const {calls,options}=setup(url=>url.endsWith('$value')?photo():json({displayName:'MS本人',id:'me'})),profile=await apiProfile('microsoft',options);assert.equal(profile.name,'MS本人');assert.equal(calls.length,2);assert.ok(calls.every(c=>c.url.startsWith('https://graph.microsoft.com/v1.0/me')&&c.options.headers.Authorization==='Bearer test-user-token'));
});
test('Slackは本人のみ、BotとDiscord APIのBot画像はユーザー画像として扱わない',async()=>{
  const {options}=setup(url=>url.includes('auth.test')?json({ok:true,user_id:'U1'}):url.includes('users.info')?json({ok:true,user:{id:'U1',real_name:'本人',profile:{image_72:'https://avatars.slack-edge.com/own.png'}}}):photo());assert.equal((await apiProfile('slack',options)).name,'本人');
  for(const data of [{ok:true,user_id:'U1',bot_id:'B1'},{ok:false}]){const s=setup(()=>json(data));assert.equal(await apiProfile('slack',s.options),undefined);assert.equal(s.calls.length,1);}
  const d=setup(()=>{throw Error('呼び出してはいけない');});assert.equal(await apiProfile('discord',d.options),undefined);assert.equal(d.calls.length,0);
});
test('許可外の画像URLとリダイレクトを通信前に拒否する',async()=>{
  for(const value of ['http://avatars.githubusercontent.com/a','https://avatars.githubusercontent.com.evil.test/a','https://user:password@avatars.githubusercontent.com/a','https://127.0.0.1/a','https://avatars.githubusercontent.com:8443/a'])assert.throws(()=>imageURL('github',value));
  const s=setup(url=>url.includes('api.github.com')?json({login:'own',avatar_url:'https://avatars.githubusercontent.com/own.png'}):new Response(null,{status:302,headers:{Location:'https://127.0.0.1/private'}}));await assert.rejects(apiProfile('github',s.options));assert.equal(s.calls.length,2);assert.equal(s.calls[1].options.headers,undefined);
});
test('大きすぎる画像・デコードできない画像・PNGでないキャッシュを採用しない',async()=>{
  for(const response of [()=>new Response('oversized',{headers:{'content-length':String(2*1024*1024)}}),()=>new Response(new Uint8Array(1024*1024+1)),()=>new Response('invalid image')]){const s=setup(url=>url.includes('api.github.com')?json({avatar_url:'https://avatars.githubusercontent.com/own'}):response());await assert.rejects(apiProfile('github',s.options));}
  assert.equal(validAvatar('https://avatars.githubusercontent.com/own'),false);assert.equal(validAvatar('data:image/svg+xml;base64,PHN2Zy8+'),false);assert.equal(validAvatar('data:image/png;base64,YmFk'),false);
});
test('ブラウザの画像取得は本人コントロールだけを対象とし、遷移・不正な矩形では失敗する',async()=>{
  let url='https://github.com/',script='';const wc={isDestroyed:()=>false,getURL:()=>url,executeJavaScript:async code=>{script=code;return {x:10,y:10,width:24,height:24};},capturePage:async()=>image};assert.equal(await browserAvatar(wc,'github'),avatar);assert.ok(script.includes('user-menu-button'));assert.ok(!script.includes('querySelectorAll("img")'));
  wc.executeJavaScript=async()=>({x:0,y:0,width:10000,height:10000});wc.capturePage=async()=>{throw Error('呼び出してはいけない');};assert.equal(await browserAvatar(wc,'github'),undefined);
  wc.executeJavaScript=async()=>{url='https://other.test/';return {x:10,y:10,width:24,height:24};};assert.equal(await browserAvatar(wc,'github'),undefined);
});
test('画像だけをキャッシュし、再起動で復元、ログアウト後の遅い取得で復活しない',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'csv-profile-test-'));let active=true,notify=0,release;
  try{const s=setup(url=>url.includes('api.github.com')?json({name:'本人',avatar_url:'https://avatars.githubusercontent.com/own'}):photo()),config={userData:dir,...s.options,connected:()=>active,notify:()=>notify++},manager=createApiProfiles(config);manager.refresh('github');await new Promise(resolve=>setTimeout(resolve,30));assert.equal(manager.get('github').avatar,avatar);assert.equal(notify,1);const saved=fs.readFileSync(path.join(dir,'account-profiles.json'),'utf8');assert.ok(!saved.includes('test-user-token'));assert.ok(!saved.includes('Authorization'));assert.equal(createApiProfiles(config).get('github').name,'本人');
    manager.clear('github');const delayed=createApiProfiles({...config,fetch:async url=>url.includes('api.github.com')?json({avatar_url:'https://avatars.githubusercontent.com/own'}):new Promise(resolve=>release=resolve)});delayed.refresh('github');await new Promise(resolve=>setTimeout(resolve,10));active=false;delayed.clear('github');release(photo());await new Promise(resolve=>setTimeout(resolve,20));active=true;assert.equal(delayed.get('github'),undefined);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'account-profiles.json'),'utf8')),{});
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('画像取得の権限不足・失敗は接続を解除せず、画像なしで返す',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'csv-profile-fallback-'));try{const manager=createApiProfiles({userData:dir,accessToken:async()=>{throw Error('権限なし');},fetch:async()=>{throw Error('未到達');},nativeImage,connected:()=>true,notify:()=>{throw Error('更新してはいけない');}});manager.refresh('google');await new Promise(resolve=>setTimeout(resolve,10));assert.equal(manager.get('google'),undefined);assert.equal(fs.existsSync(path.join(dir,'account-profiles.json')),false);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
