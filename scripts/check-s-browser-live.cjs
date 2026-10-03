'use strict';
// Anonymous public-page smoke check. Uses an empty profile, does not confirm
// accounts, attach files, or submit messages. Results contain no URL query data.
const {_electron:electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {SERVICES}=require('../electron/s-services.cjs');
const packaged=process.argv.includes('--packaged'),fixture=process.argv.includes('--fixture-only');
async function main(){
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'csv-s-live-')),report={checkedAt:new Date().toISOString(),authenticated:false,packaged,fixture,services:[]};let app;
  try{
    fs.writeFileSync(path.join(profile,'preferences.json'),JSON.stringify({tutorialStatus:'skipped'}));
    app=await electron.launch({...(packaged?{executablePath:path.join(__dirname,'../release/win-unpacked/CSV nyaan Viewer.exe')}:{}),args:['--no-sandbox','--user-data-dir='+profile,...(packaged?[]:['.'])],cwd:path.join(__dirname,'..'),env:{...process.env}});const page=await app.firstWindow();await page.waitForLoadState();
    if(fixture)await app.evaluate(({session})=>{for(const id of ['google','microsoft','github','slack','discord'])session.fromPartition('persist:csv-nyaan-s-'+id).protocol.handle('https',()=>new Response('<!doctype html><html><body style="margin:0;min-height:100vh;background:rgb(30,170,85)"><h1>Packaged internal browser rendering</h1></body></html>',{headers:{'Content-Type':'text/html'}}));});
    for(const service of SERVICES){
      const before=new Set(app.context().pages());await page.evaluate(service=>window.csv.sOpen({service,table:{headers:['Smoke'],rows:[['public-page-check']]}}),service.id);
      const deadline=Date.now()+20000;let chrome,state;
      while(Date.now()<deadline){chrome=app.context().pages().find(p=>!before.has(p)&&p.url().includes('s-browser.html'));if(chrome){try{state=await chrome.evaluate(()=>window.sBrowser.state());if(state.phase!=='loading')break;}catch{}}await new Promise(r=>setTimeout(r,250));}
      const safeURL=value=>{try{const u=new URL(value);return u.origin+u.pathname;}catch{return '';}};
      const result={service:service.id,phase:state?.phase||'unavailable',url:safeURL(state?.url),error:state?.pageError?.detail||'',visible:false,textLength:0,rendered:false};
      if(chrome&&state?.phase==='ready'){
        const pixels=await app.evaluate(async({BrowserWindow},chromeURL)=>{const win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()===chromeURL),view=win?.contentView.children.find(v=>v.webContents?.getURL().startsWith('https://'));if(!view)return {visible:false,textLength:0,rendered:false};const wc=view.webContents;await new Promise(r=>setTimeout(r,250));let textLength=0;try{textLength=await wc.executeJavaScript('document.body?.innerText?.trim().length||0');}catch{}const image=await wc.capturePage(),size=image.getSize(),bytes=image.toBitmap(),colors=new Set();for(let y=0;y<8;y++)for(let x=0;x<8;x++){const at=(Math.floor(size.height*(y+.5)/8)*size.width+Math.floor(size.width*(x+.5)/8))*4;if(at+3<bytes.length)colors.add([bytes[at],bytes[at+1],bytes[at+2]].join(','));}return {visible:view.getVisible()&&size.width>0&&size.height>0,textLength,rendered:textLength>0||colors.size>1};},chrome.url());Object.assign(result,pixels);
      }
      report.services.push(result);console.log(JSON.stringify(result));if(fixture&&!(result.phase==='ready'&&result.visible&&result.rendered))throw Error('Packaged browser did not render: '+service.id);await app.evaluate(({BrowserWindow})=>{for(const w of BrowserWindow.getAllWindows())if(w.webContents.getURL().includes('s-browser.html'))w.destroy();});
    }
  }finally{if(app)await app.close();fs.rmSync(profile,{recursive:true,force:true});fs.mkdirSync(path.join(__dirname,'../release'),{recursive:true});fs.writeFileSync(path.join(__dirname,'../release/'+(fixture?'S-BROWSER-PACKAGED-RENDERING.json':'S-BROWSER-PUBLIC-PAGES.json')),JSON.stringify(report,null,2));}
  // Availability and authentication policies are external; report every result
  // separately from deterministic tests rather than treating them as login proof.
}
main().catch(error=>{console.error(String(error));process.exitCode=1;});
