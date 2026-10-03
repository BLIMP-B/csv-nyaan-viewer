import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ArrowLeft,ArrowRight,Check,X} from 'lucide-react';
import {TUTORIAL_STEPS} from './tutorial-steps';
import './tutorial.css';
export type TutorialStage='intro'|'finished'|number|null;
interface Rect {x:number;y:number;width:number;height:number}
export function Tutorial({stage,busy,done,error,onStart,onStep,onAction,onFinish}:{stage:TutorialStage;busy:boolean;done:boolean;error:string;onStart():void;onStep(step:number):void;onAction(action?:'text'):void;onFinish(status:'completed'|'skipped'):void}){
  const card=useRef<HTMLElement>(null),previousFocus=useRef<HTMLElement|null>(null),[rect,setRect]=useState<Rect|null>(null),[viewport,setViewport]=useState({width:window.innerWidth,height:window.innerHeight}),[cardHeight,setCardHeight]=useState(340);
  const step=typeof stage==='number'?TUTORIAL_STEPS[stage]:null,modal=stage==='intro'||stage==='finished';
  useEffect(()=>{const resize=()=>setViewport({width:window.innerWidth,height:window.innerHeight});window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[]);
  useEffect(()=>{if(stage===null)return;previousFocus.current=document.activeElement as HTMLElement;return()=>{if(previousFocus.current?.isConnected)previousFocus.current.focus({preventScroll:true});};},[stage===null]);
  useLayoutEffect(()=>{if(stage===null)return;card.current?.querySelector<HTMLElement>('h2')?.focus({preventScroll:true});},[stage]);
  useEffect(()=>{if(!modal)return;const app=document.querySelector<HTMLElement>('.app');if(!app)return;const before=app.inert;app.inert=true;return()=>{app.inert=before;};},[modal]);
  useLayoutEffect(()=>{if(stage===null||!card.current)return;const observer=new ResizeObserver(()=>setCardHeight(card.current!.getBoundingClientRect().height));observer.observe(card.current);return()=>observer.disconnect();},[stage===null]);
  useLayoutEffect(()=>{
    if(!step){setRect(null);return;}let frame=0,observed:HTMLElement|null=null;const resize=new ResizeObserver(()=>schedule());
    const measure=()=>{frame=0;setViewport({width:window.innerWidth,height:window.innerHeight});let found:HTMLElement|null=null;for(const selector of step.targets){const el=document.querySelector<HTMLElement>(selector);if(el&&el.getBoundingClientRect().width>0&&el.getBoundingClientRect().height>0){found=el;break;}}if(found!==observed){if(observed)resize.unobserve(observed);observed=found;if(observed)resize.observe(observed);}if(!found){setRect(null);return;}const r=found.getBoundingClientRect(),x=Math.max(0,r.left-3),y=Math.max(0,r.top-3),next={x,y,width:Math.max(0,Math.min(window.innerWidth,r.right+3)-x),height:Math.max(0,Math.min(window.innerHeight,r.bottom+3)-y)};setRect(old=>old&&Object.keys(next).every(k=>Math.abs(old[k as keyof Rect]-next[k as keyof Rect])<.5)?old:next);};
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure);};measure();window.addEventListener('resize',schedule);document.addEventListener('scroll',schedule,true);
    const mutations=new MutationObserver(schedule);for(const selector of ['.workbench','.titlebar','.modal-overlay']){const el=document.querySelector(selector);if(el){resize.observe(el);mutations.observe(el,{childList:true,subtree:true});}}mutations.observe(document.querySelector('.app')!,{childList:true});
    return()=>{cancelAnimationFrame(frame);resize.disconnect();mutations.disconnect();window.removeEventListener('resize',schedule);document.removeEventListener('scroll',schedule,true);};
  },[step]);
  if(stage===null)return null;
  const width=Math.min(360,viewport.width-24),height=Math.min(cardHeight,viewport.height-24);
  let x=viewport.width-width-12,y=viewport.height-height-12;
  if(rect){if(rect.y>=height+24)y=rect.y-height-12;else if(viewport.height-rect.y-rect.height>=height+24)y=rect.y+rect.height+12;else if(viewport.width-rect.x-rect.width>=width+24){x=rect.x+rect.width+12;y=Math.max(12,Math.min(viewport.height-height-12,rect.y));}else if(rect.x>=width+24){x=rect.x-width-12;y=Math.max(12,Math.min(viewport.height-height-12,rect.y));}}
  const shields=rect&&!modal?[{left:0,top:0,width:viewport.width,height:rect.y},{left:0,top:rect.y+rect.height,width:viewport.width,height:Math.max(0,viewport.height-rect.y-rect.height)},{left:0,top:rect.y,width:rect.x,height:rect.height},{left:rect.x+rect.width,top:rect.y,width:Math.max(0,viewport.width-rect.x-rect.width),height:rect.height}]:[{left:0,top:0,width:viewport.width,height:viewport.height}];
  function key(e:React.KeyboardEvent){if(e.key==='Escape'){e.preventDefault();onFinish('skipped');return;}if(e.key==='Tab'&&modal){const buttons=Array.from(card.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')),first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&(!buttons.includes(document.activeElement as HTMLButtonElement)||document.activeElement===first)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&(!buttons.includes(document.activeElement as HTMLButtonElement)||document.activeElement===last)){e.preventDefault();first?.focus();}}}
  return createPortal(<div className="tutorial-layer" onKeyDown={key}>
    {shields.map((style,i)=><div key={i} className="tutorial-shield" style={style}/>)}
    {rect&&!modal&&<div className="tutorial-highlight" style={{left:rect.x,top:rect.y,width:rect.width,height:rect.height}} aria-hidden="true"/>}
    <section ref={card} className={'tutorial-card'+(modal?' tutorial-centered':'')} role="dialog" aria-modal={modal} aria-labelledby="tutorial-heading" aria-describedby="tutorial-description" style={modal?undefined:{left:Math.max(12,x),top:Math.max(12,y),width}}>
      <header><span>{step?'使い方 '+(Number(stage)+1)+' / '+TUTORIAL_STEPS.length:'はじめての使い方'}</span><button className="icon-btn" aria-label="チュートリアルを終了" disabled={busy} onClick={()=>onFinish(stage==='finished'?'completed':'skipped')}><X size={17}/></button></header>
      <h2 id="tutorial-heading" tabIndex={-1}>{stage==='intro'?'クリックして、さっくり覚える':stage==='finished'?'チュートリアルを完了しました':step!.title}</h2>
      <div id="tutorial-description">{stage==='intro'?<><p>練習用のCSVを使って、選択・グラフ・テーブル・分析・結合・共有の入口を順に確認します。明るく囲まれた部分を実際に操作しながら進められます。</p><p>元のファイルは変更しません。終了後は練習用データを片付け、元のファイルとペイン配置に戻ります。ヘルプからいつでも再実行できます。</p></>:stage==='finished'?<p>これで基本操作は一通り確認できました。「使い始める」で練習を終了します。困ったときはヘルプの操作ガイドと、このチュートリアルをご利用ください。</p>:step!.paragraphs.map((p,i)=><p key={i}>{p}</p>)}</div>
      {step?.action&&<div className="tutorial-exercise"><button disabled={busy||(step.required&&done)} onClick={()=>onAction()}>{step.action}</button>{step.id==='documents'&&<button disabled={busy} onClick={()=>onAction('text')}>TXTの練習文書を開く</button>}</div>}
      {step?.required&&<p className="tutorial-progress" role="status">{done?<><Check size={14}/>操作を確認しました</>:'明るく囲まれた領域を操作するか、練習ボタンを押してください。'}</p>}
      {error&&<p className="tutorial-error" role="alert">{error}</p>}
      <footer>{stage==='intro'?<><button disabled={busy} onClick={()=>onFinish('skipped')}>あとで</button><button className="primary" disabled={busy} onClick={onStart}>{busy?'練習データを準備中…':'チュートリアルを開始'}</button></>:stage==='finished'?<button className="primary" disabled={busy} onClick={()=>onFinish('completed')}>使い始める</button>:<><button disabled={busy} onClick={()=>onFinish('skipped')}>終了</button><button disabled={busy||stage===0} onClick={()=>onStep(Number(stage)-1)}><ArrowLeft size={14}/>戻る</button><button className="primary" disabled={busy||(step!.required&&!done)} onClick={()=>onStep(Number(stage)+1)}>{stage===TUTORIAL_STEPS.length-1?'完了へ':'次へ'}<ArrowRight size={14}/></button></>}</footer>
    </section>
  </div>,document.body);
}
