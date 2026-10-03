import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import './chart-viewport.css';
type Direction='width'|'height'|'both';
type EdgeX='left'|'right';type EdgeY='top'|'bottom';
interface Size {width:number;height:number}
const MINIMUM={width:220,height:140};
function Dots({vertical=false}:{vertical?:boolean}){return <svg width={vertical?8:16} height={vertical?16:8} viewBox={vertical?'0 0 8 16':'0 0 16 8'} aria-hidden="true">{[0,1,2].flatMap(a=>[0,1].map(b=><circle key={a+'-'+b} cx={vertical?2+b*4:2+a*6} cy={vertical?2+a*6:2+b*4} r="1.4" fill="currentColor"/>))}</svg>;}
export function ChartViewport({children,onContextMenu}:{children:React.ReactNode;onContextMenu:React.MouseEventHandler<HTMLDivElement>}){
  const viewport=useRef<HTMLDivElement>(null),[available,setAvailable]=useState<Size>(MINIMUM),[ratios,setRatios]=useState<Size>({width:1,height:1}),[draft,setDraft]=useState<Size|null>(null);
  const drag=useRef<{x:number;y:number;size:Size;next:Size;direction:Direction;w:EdgeX;h:EdgeY;element:HTMLElement;pointer:number;cursor:string;select:string}|null>(null);
  const size=draft||{width:Math.max(MINIMUM.width,available.width*ratios.width),height:Math.max(MINIMUM.height,available.height*ratios.height)};
  function release(){const d=drag.current;if(!d)return;drag.current=null;const body=d.element.ownerDocument.body;body.style.cursor=d.cursor;body.style.userSelect=d.select;if(d.element.hasPointerCapture(d.pointer))d.element.releasePointerCapture(d.pointer);}
  function cancel(){release();setDraft(null);}
  useLayoutEffect(()=>{const el=viewport.current!;const measure=()=>{cancel();setAvailable({width:Math.max(MINIMUM.width,el.clientWidth-18),height:Math.max(MINIMUM.height,el.clientHeight-18)});};measure();const observer=new ResizeObserver(measure);observer.observe(el);return()=>observer.disconnect();},[]);
  useEffect(()=>{const doc=viewport.current!.ownerDocument;const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&drag.current){e.preventDefault();cancel();}};doc.addEventListener('keydown',escape);return()=>{release();doc.removeEventListener('keydown',escape);};},[available]);
  const clamp=(v:number,axis:keyof Size)=>Math.max(MINIMUM[axis],Math.min(available[axis],v));
  function begin(direction:Direction,w:EdgeX,h:EdgeY,e:React.PointerEvent<HTMLElement>){if(e.button!==0)return;e.preventDefault();e.stopPropagation();const el=e.currentTarget,body=el.ownerDocument.body;drag.current={x:e.clientX,y:e.clientY,size:{...size},next:{...size},direction,w,h,element:el,pointer:e.pointerId,cursor:body.style.cursor,select:body.style.userSelect};body.style.cursor=direction==='width'?'ew-resize':direction==='height'?'ns-resize':'nwse-resize';body.style.userSelect='none';el.setPointerCapture(e.pointerId);}
  function move(e:React.PointerEvent<HTMLElement>){const d=drag.current;if(!d||e.pointerId!==d.pointer)return;const next={...d.size};if(d.direction!=='height')next.width=clamp(d.size.width+(e.clientX-d.x)*(d.w==='left'?-1:1),'width');if(d.direction!=='width')next.height=clamp(d.size.height+(e.clientY-d.y)*(d.h==='top'?-1:1),'height');d.next=next;setDraft(next);}
  function finish(){const d=drag.current;if(!d)return;setRatios(old=>({...old,...(d.direction!=='height'?{width:d.next.width/available.width}:{}),...(d.direction!=='width'?{height:d.next.height/available.height}:{})}));release();setDraft(null);}
  function reset(direction:Direction){cancel();setRatios(old=>({...old,...(direction!=='height'?{width:1}:{}),...(direction!=='width'?{height:1}:{})}));}
  function key(direction:Direction,w:EdgeX,h:EdgeY,e:React.KeyboardEvent<HTMLElement>){if(e.key==='Home'){e.preventDefault();reset(direction);return;}const step=e.shiftKey?48:16;if(direction!=='height'&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();setRatios(old=>({...old,width:clamp(size.width+(e.key==='ArrowRight'?step:-step)*(w==='left'?-1:1),'width')/available.width}));}else if(direction!=='width'&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();setRatios(old=>({...old,height:clamp(size.height+(e.key==='ArrowDown'?step:-step)*(h==='top'?-1:1),'height')/available.height}));}}
  const events=(direction:Direction,w:EdgeX,h:EdgeY)=>({onPointerDown:(e:React.PointerEvent<HTMLElement>)=>begin(direction,w,h,e),onPointerMove:move,onPointerUp:finish,onPointerCancel:cancel,onLostPointerCapture:cancel,onDoubleClick:()=>reset(direction),onKeyDown:(e:React.KeyboardEvent<HTMLElement>)=>key(direction,w,h,e)});
  return <div ref={viewport} className="chart-viewport"><div className="chart-resizable" style={size}>
    <div className="chart-area" onContextMenu={onContextMenu}>{children}</div>
    {(['top','bottom'] as const).map(h=><div key={h} className={'chart-grip resize-height edge-'+h} role="separator" tabIndex={0} aria-orientation="horizontal" aria-label={'グラフの高さを調整（'+(h==='top'?'上':'下')+'）'} aria-valuemin={MINIMUM.height} aria-valuemax={available.height} aria-valuenow={size.height} title="ドラッグしてグラフの高さを調整" {...events('height','right',h)}><Dots/></div>)}
    {(['left','right'] as const).map(w=><div key={w} className={'chart-grip resize-width edge-'+w} role="separator" tabIndex={0} aria-orientation="vertical" aria-label={'グラフの幅を調整（'+(w==='left'?'左':'右')+'）'} aria-valuemin={MINIMUM.width} aria-valuemax={available.width} aria-valuenow={size.width} title="ドラッグしてグラフの幅を調整" {...events('width',w,'bottom')}><Dots vertical/></div>)}
    {([['top','left','左上'],['bottom','right','右下']] as const).map(([h,w,label])=><button key={label} className={'chart-grip resize-both edge-'+h+' edge-'+w} aria-label={'グラフの幅と高さを調整（'+label+'）'} title="ドラッグしてグラフの幅と高さを調整" {...events('both',w,h)}><Dots vertical/></button>)}
  </div></div>;
}
