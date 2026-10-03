import React,{useEffect,useRef} from 'react';
import type {DockPosition} from './dock-state';
import type {PaneSize} from './types';
export type ResizeDirection='width'|'height'|'both';
export interface PaneLimits {minWidth:number;maxWidth:number;maxWidthLeft?:number;maxWidthRight?:number;minHeight:number;maxHeight:number}
export interface PaneResize {phase:'begin'|'draft'|'commit'|'cancel'|'reset';direction:ResizeDirection;width:number;height:number;widthEdge:'left'|'right';heightEdge:'top'|'bottom'}
const names:Record<DockPosition,string>={top:'上',bottom:'下',left:'左',right:'右'};
function DotGrip({vertical=false}:{vertical?:boolean}){
  return <svg width={vertical?8:16} height={vertical?16:8} viewBox={vertical?'0 0 8 16':'0 0 16 8'} aria-hidden="true">{[0,1,2].flatMap(a=>[0,1].map(b=><circle key={a+'-'+b} cx={vertical?2+b*4:2+a*6} cy={vertical?2+a*6:2+b*4} r="1.4" fill="currentColor"/>))}</svg>;
}
export function DockSlot({position,size,limits,onResize,children,className='',boundaryLabel,onDragOver,onDrop}:{position:DockPosition;size:Required<PaneSize>;limits:PaneLimits;onResize(request:PaneResize):void;children:React.ReactNode;className?:string;boundaryLabel?:string;onDragOver?:React.DragEventHandler<HTMLDivElement>;onDrop?:React.DragEventHandler<HTMLDivElement>}){
  const ref=useRef<HTMLDivElement>(null),drag=useRef<{x:number;y:number;request:PaneResize;next:PaneResize;element:HTMLElement;cursor:string;select:string}|null>(null),callback=useRef(onResize);callback.current=onResize;
  const horizontal=position==='top'||position==='bottom',widthEdge=position==='right'?'left':'right',heightEdge=position==='bottom'?'top':'bottom',label=names[position]+'ペイン';
  function release(){const active=drag.current;if(!active)return;drag.current=null;active.element.ownerDocument.body.style.cursor=active.cursor;active.element.ownerDocument.body.style.userSelect=active.select;}
  function cancel(){if(!drag.current)return;const request=drag.current.next;release();callback.current({...request,phase:'cancel'});}
  useEffect(()=>{window.addEventListener('resize',cancel);return()=>{window.removeEventListener('resize',cancel);release();};},[]);
  function begin(direction:ResizeDirection,e:React.PointerEvent<HTMLElement>,w:'left'|'right'=widthEdge,h:'top'|'bottom'=heightEdge){
    if(e.button!==0||!ref.current||(direction==='height'&&limits.minHeight===limits.maxHeight)||(direction==='width'&&limits.minWidth===limits.maxWidth))return;e.preventDefault();e.stopPropagation();
    const rect=ref.current.getBoundingClientRect(),element=e.currentTarget,body=element.ownerDocument.body,request:PaneResize={phase:'begin',direction,width:rect.width,height:rect.height,widthEdge:w,heightEdge:h};
    drag.current={x:e.clientX,y:e.clientY,request,next:request,element,cursor:body.style.cursor,select:body.style.userSelect};
    body.style.cursor=direction==='width'?'ew-resize':direction==='height'?'ns-resize':(w==='left')===(h==='top')?'nwse-resize':'nesw-resize';body.style.userSelect='none';element.setPointerCapture(e.pointerId);onResize(request);
  }
  function move(e:React.PointerEvent<HTMLElement>){const active=drag.current;if(!active)return;const request={...active.request,phase:'draft' as const};if(request.direction!=='height')request.width=Math.max(limits.minWidth,Math.min((request.widthEdge==='left'?limits.maxWidthLeft:limits.maxWidthRight)??limits.maxWidth,active.request.width+(e.clientX-active.x)*(request.widthEdge==='left'?-1:1)));if(request.direction!=='width')request.height=Math.max(limits.minHeight,Math.min(limits.maxHeight,active.request.height+(e.clientY-active.y)*(request.heightEdge==='top'?-1:1)));active.next=request;onResize(request);}
  function finish(e:React.PointerEvent<HTMLElement>){if(!drag.current)return;const request=drag.current.next;release();onResize({...request,phase:'commit'});if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}
  function reset(direction:ResizeDirection,w:'left'|'right'=widthEdge,h:'top'|'bottom'=heightEdge){onResize({phase:'reset',direction,...size,widthEdge:w,heightEdge:h});}
  function keyboard(direction:ResizeDirection,e:React.KeyboardEvent<HTMLElement>,w:'left'|'right'=widthEdge,h:'top'|'bottom'=heightEdge){
    if(e.key==='Home'){e.preventDefault();reset(direction,w,h);return;}
    const step=e.shiftKey?48:16,request:PaneResize={phase:'commit',direction,...size,widthEdge:w,heightEdge:h};
    if(direction!=='height'&&['ArrowLeft','ArrowRight'].includes(e.key))request.width=Math.max(limits.minWidth,Math.min((w==='left'?limits.maxWidthLeft:limits.maxWidthRight)??limits.maxWidth,size.width+(e.key==='ArrowRight'?step:-step)*(w==='left'?-1:1)));
    else if(direction!=='width'&&['ArrowUp','ArrowDown'].includes(e.key))request.height=Math.max(limits.minHeight,Math.min(limits.maxHeight,size.height+(e.key==='ArrowDown'?step:-step)*(h==='top'?-1:1)));
    else return;e.preventDefault();onResize(request);
  }
  const events=(direction:ResizeDirection,w:'left'|'right'=widthEdge,h:'top'|'bottom'=heightEdge)=>({onPointerDown:(e:React.PointerEvent<HTMLElement>)=>begin(direction,e,w,h),onPointerMove:move,onPointerUp:finish,onPointerCancel:cancel,onLostPointerCapture:cancel,onDoubleClick:()=>reset(direction,w,h),onKeyDown:(e:React.KeyboardEvent<HTMLElement>)=>keyboard(direction,e,w,h)});
  return <div ref={ref} className={`dock-slot ${position} ${className}`} onDragOver={onDragOver} onDrop={onDrop}>
    {children}
    {(['top','bottom'] as const).map(edge=><div key={edge} className={`dock-grip grip-height edge-${edge}`} role="separator" tabIndex={0} aria-label={label+'の高さを調整（'+(edge==='top'?'上':'下')+'）'} aria-orientation="horizontal" aria-valuemin={limits.minHeight} aria-valuemax={limits.maxHeight} aria-valuenow={size.height} aria-disabled={limits.minHeight===limits.maxHeight} title={horizontal?'上下にドラッグして高さを調整':'高さはウィンドウに合わせて自動調整'} {...events('height',widthEdge,edge)}><DotGrip/></div>)}
    {(['left','right'] as const).map(edge=><div key={edge} className={`dock-grip grip-width edge-${edge}`} role="separator" tabIndex={0} aria-label={label+'の幅を調整（'+(edge==='left'?'左':'右')+'）'} aria-orientation="vertical" aria-valuemin={limits.minWidth} aria-valuemax={(edge==='left'?limits.maxWidthLeft:limits.maxWidthRight)??limits.maxWidth} aria-valuenow={size.width} aria-disabled={limits.minWidth===limits.maxWidth} title={limits.minWidth===limits.maxWidth?'左右ペインを開くとデータ領域と横幅を調整できます':'左右にドラッグして幅を調整'} {...events('width',edge,heightEdge)}><DotGrip vertical/></div>)}
    {([['top','left','左上'],['bottom','right','右下']] as const).map(([h,w,name])=><button key={name} className={`dock-grip grip-both edge-${h} edge-${w}`} aria-label={label+'の幅と高さを調整（'+name+'）'} title="斜めにドラッグして共有領域のサイズを調整" {...events('both',w,h)}><DotGrip vertical/></button>)}
    <div role="separator" tabIndex={0} aria-label={boundaryLabel||label+'とデータの境界'} aria-orientation={horizontal?'horizontal':'vertical'} className={`dock-boundary edge-${horizontal?heightEdge:widthEdge} ${horizontal?'boundary-horizontal':'boundary-vertical'}`} {...events(horizontal?'height':'width')}/>
  </div>;
}
