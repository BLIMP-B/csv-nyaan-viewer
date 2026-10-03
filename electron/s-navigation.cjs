'use strict';
const {browserURL,service}=require('./s-services.cjs');
function aborted(error){return error?.errno===-3||error?.code==='ERR_ABORTED'||/\bERR_ABORTED\b/.test(String(error));}
function failureMessage(code,description=''){
  let reason='通信が完了しませんでした。ネットワーク接続を確認して再試行してください。';
  if([-111,-130,-131,-140,-170,-171,-127].includes(code)||/PROXY|TUNNEL/.test(description))reason='プロキシへの接続に失敗しました。Windowsのプロキシ・VPN設定と接続先の許可を確認してください。';
  else if([-105,-106,-118,-102].includes(code)||/NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|TIMED_OUT|CONNECTION_REFUSED/.test(description))reason='接続先に到達できませんでした。インターネット接続・DNS・ファイアウォールの設定を確認してください。';
  else if(code<=-200&&code>=-299||/CERT_|SSL_/.test(description))reason='HTTPSの証明書を検証できませんでした。PCの日時と、組織の証明書・ネットワーク設定を確認してください。';
  else if(code===-20||/BLOCKED_BY/.test(description))reason='ページへの接続がブロックされました。ネットワークや組織の設定を確認してください。';
  else if(code===-1000)reason='ページの描画処理が停止しました。再試行でページを開き直してください。';
  const detail=String(description).replace(/[\r\n]/g,' ').slice(0,120);
  return {title:'サービスのページを開けませんでした',message:reason,detail:(detail?detail+' ':'')+'('+code+')'};
}
function entryURL(entry){try{return browserURL(entry.view.webContents.getURL());}catch{return entry.targetURL||service(entry.service.id).url;}}
// Present the actual Chromium engine as a web browser. Electron-specific tokens
// can make web apps expect their own native desktop bridge, which is absent here.
function browserAgent(value){const match=String(value).match(/^(.+?\(KHTML, like Gecko\))\s+.*?(Chrome\/[\d.]+)\s+.*?(Safari\/[\d.]+).*$/);return match?match[1]+' '+match[2]+' '+match[3]:value;}
const visiblePageScript=`(()=>{if(!document.body)return false;if(document.body.innerText.trim())return true;return [...document.querySelectorAll('img,svg,canvas,iframe,input,button,video')].some(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility==='visible'&&(el.tagName!=='IMG'||el.complete&&el.naturalWidth>0);});})()`;
module.exports={aborted,failureMessage,entryURL,browserAgent,visiblePageScript};
