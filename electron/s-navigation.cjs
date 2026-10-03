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
module.exports={aborted,failureMessage,entryURL};
