import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import './docking.css';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
import {DockPane} from './panels';
import {DockSlot} from './dock-slot';
import {PaneBoundaryButton} from './pane-boundary-button';
import {PANES,POSITIONS,PANE_INFO,isPane,movePane,showPane,closePane,type DockLayout,type DockPosition,type PaneId} from './dock-state';
import type {Preferences,PaneSize} from './types';
export const PANE_DRAG_TYPE='application/x-csv-nyaan-pane';
const positionNames={top:'上',bottom:'下',left:'左',right:'右'};
function ContentHost({container}:{container:HTMLDivElement}) {
  const ref=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{const host=ref.current!;host.appendChild(container);return()=>{if(container.parentElement===host)host.removeChild(container);};},[container]);
  return <div className="dock-content-host" ref={ref}/>;
}
export function Docking({layout,onChange,prefs,onResize,content,tools,editor}:{layout:DockLayout;onChange:React.Dispatch<React.SetStateAction<DockLayout>>;prefs:Preferences;onResize(position:DockPosition,size:PaneSize):void;content(id:PaneId):React.ReactNode;tools?(id:PaneId):React.ReactNode;editor:React.ReactNode}) {
  const containers=useMemo(()=>Object.fromEntries(PANES.map(id=>{const div=document.createElement('div');div.className='dock-tab-content';div.dataset.pane=id;return [id,div];})) as Record<PaneId,HTMLDivElement>,[]),visited=useRef(new Set<PaneId>());
  const [dragging,setDragging]=useState<PaneId|null>(null),[target,setTarget]=useState<DockPosition|null>(null);
  const root=useRef<HTMLDivElement>(null),cancelPointer=useRef<(()=>void)|null>(null),ignoreClick=useRef(false);
  for(const id of layout.open)visited.current.add(id);
  const endDrag=()=>{setDragging(null);setTarget(null);};
  useEffect(()=>()=>cancelPointer.current?.(),[]);
  useEffect(()=>{const cancel=(e:KeyboardEvent)=>{if(e.key==='Escape'){cancelPointer.current?.();endDrag();}};window.addEventListener('keydown',cancel);return()=>window.removeEventListener('keydown',cancel);},[]);
  function drag(id:PaneId,e:React.DragEvent){e.stopPropagation();e.dataTransfer.setData(PANE_DRAG_TYPE,id);e.dataTransfer.effectAllowed='move';setDragging(id);}
  function over(position:DockPosition,e:React.DragEvent){if(!e.dataTransfer.types.includes(PANE_DRAG_TYPE))return;e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='move';setTarget(position);}
  function drop(position:DockPosition,e:React.DragEvent,before?:PaneId){if(!e.dataTransfer.types.includes(PANE_DRAG_TYPE))return;e.preventDefault();e.stopPropagation();const id=e.dataTransfer.getData(PANE_DRAG_TYPE);if(isPane(id))onChange(current=>movePane(current,id,position,before));endDrag();}
  const open=(id:PaneId)=>onChange(current=>showPane(current,id));
  const close=(id:PaneId)=>onChange(current=>closePane(current,id));
  function nearestEdge(point:{clientX:number;clientY:number}):DockPosition {const rect=root.current!.getBoundingClientRect(),x=point.clientX-rect.left,y=point.clientY-rect.top;return (Object.entries({top:y/rect.height,bottom:(rect.height-y)/rect.height,left:x/rect.width,right:(rect.width-x)/rect.width}) as [DockPosition,number][]).sort((a,b)=>a[1]-b[1])[0][0];}
  // Pointer capture avoids Electron's native drag loop, while retaining HTML5 drops
  // for integrations. Only a movement beyond the threshold starts a pane move.
  function pointerDrag(id:PaneId,event:React.PointerEvent<HTMLButtonElement>){
    if(event.button!==0)return;event.preventDefault();event.stopPropagation();cancelPointer.current?.();
    const element=event.currentTarget,doc=element.ownerDocument,start={x:event.clientX,y:event.clientY},body=doc.body,previousSelect=body.style.userSelect,previousCursor=body.style.cursor;let moved=false;
    ignoreClick.current=false;element.focus({preventScroll:true});element.setPointerCapture(event.pointerId);
    const destination=(e:PointerEvent)=>{const hit=doc.elementFromPoint(e.clientX,e.clientY);if(!hit?.closest('.docking-layout,.popout-root'))return null;const slot=hit.closest('.dock-slot'),zone=hit.closest<HTMLElement>('[data-dock-position]'),position=zone?.dataset.dockPosition as DockPosition|undefined||POSITIONS.find(p=>slot?.classList.contains(p))||nearestEdge(e),tab=hit.closest('[role=tab]')?.id.replace('dock-tab-','');return {position,before:isPane(tab)?tab:undefined};};
    const cleanup=()=>{doc.removeEventListener('pointermove',move);doc.removeEventListener('pointerup',up);doc.removeEventListener('pointercancel',cancel);doc.removeEventListener('keydown',key);if(element.hasPointerCapture(event.pointerId))element.releasePointerCapture(event.pointerId);body.style.userSelect=previousSelect;body.style.cursor=previousCursor;cancelPointer.current=null;endDrag();};
    const move=(e:PointerEvent)=>{if(e.pointerId!==event.pointerId)return;if(!moved&&Math.hypot(e.clientX-start.x,e.clientY-start.y)<6)return;if(!moved){moved=true;ignoreClick.current=true;body.style.userSelect='none';body.style.cursor='grabbing';setDragging(id);}setTarget(destination(e)?.position||null);};
    const cancel=()=>{if(moved)ignoreClick.current=true;cleanup();};
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape')cancel();};
    const up=(e:PointerEvent)=>{if(e.pointerId!==event.pointerId)return;const result=moved?destination(e):null;if(result)onChange(current=>movePane(current,id,result.position,result.before));cleanup();};
    cancelPointer.current=cancel;doc.addEventListener('pointermove',move);doc.addEventListener('pointerup',up);doc.addEventListener('pointercancel',cancel);doc.addEventListener('keydown',key);
  }
  const click=(action:()=>void)=>{if(ignoreClick.current){ignoreClick.current=false;return;}action();};
  return <div ref={root} className={'editor-layout docking-layout'+(dragging?' pane-dragging':'')} onDragOver={e=>over(nearestEdge(e),e)} onDrop={e=>drop(nearestEdge(e),e)}>
    <div className={'docking-editor'+POSITIONS.filter(p=>layout.groups[p].some(id=>!layout.open.includes(id))).map(p=>' has-rail-'+p).join('')}>{editor}{POSITIONS.map(position=>{
      const closed=layout.groups[position].filter(id=>!layout.open.includes(id));
      return closed.length?<div key={position} className={'dock-rail rail-'+position} aria-label={positionNames[position]+'側の閉じたタブ'}>{closed.map(id=><PaneBoundaryButton key={id} position={position} expanded={false} className="tab-reopen" label={PANE_INFO[id].name+'を開く'} draggable onPointerDown={e=>pointerDrag(id,e)} onDragStart={e=>drag(id,e)} onDragEnd={endDrag} onClick={()=>click(()=>open(id))}>{PANE_INFO[id].label}</PaneBoundaryButton>)}</div>:null;
    })}</div>
    {POSITIONS.map(position=>{
      const ids=layout.groups[position],opened=ids.filter(id=>layout.open.includes(id));if(!opened.length)return null;
      const active=layout.active[position]&&opened.includes(layout.active[position]!)?layout.active[position]!:opened[0],info=PANE_INFO[active],sidebar=position==='left'&&ids.some(id=>['workspace','selection','multivariate'].includes(id));
      const tabs=<div className={'dock-tabs'+(ids.length>3?' many-tabs':'')} role="tablist" aria-label={positionNames[position]+'ペインのタブ'} onDragOver={e=>over(position,e)} onDrop={e=>drop(position,e)}>
        {ids.map((id,index)=><div key={id} className={'dock-tab'+(id===active?' selected':'')+(!layout.open.includes(id)?' collapsed':'')}>
          <button role="tab" id={'dock-tab-'+id} aria-controls={'dock-panel-'+id} aria-selected={id===active} aria-label={PANE_INFO[id].name} tabIndex={id===active?0:-1} title={PANE_INFO[id].name+' — ドラッグで移動・結合'} draggable onPointerDown={e=>pointerDrag(id,e)} onDragStart={e=>drag(id,e)} onDragEnd={endDrag} onDragOver={e=>over(position,e)} onDrop={e=>drop(position,e,id)} onClick={()=>click(()=>open(id))} onKeyDown={e=>{let next=index;if(e.key==='ArrowRight')next=(index+1)%ids.length;else if(e.key==='ArrowLeft')next=(index+ids.length-1)%ids.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=ids.length-1;else return;e.preventDefault();open(ids[next]);e.currentTarget.ownerDocument.getElementById('dock-tab-'+ids[next])?.focus();}}><span>{PANE_INFO[id].label}</span>{PANE_INFO[id].scope&&<small>{PANE_INFO[id].scope}</small>}</button>
          {layout.open.includes(id)&&<button className="dock-tab-close icon-btn" title={PANE_INFO[id].name+'のタブを閉じる'} aria-label={PANE_INFO[id].name+'のタブを閉じる'} onClick={()=>close(id)}><X size={11}/></button>}
        </div>)}
      </div>;
      return <DockSlot key={position} position={position} size={prefs.dockSizes?.[position]||(sidebar?{width:prefs.sidebarWidth||260}:undefined)} className={(sidebar?'sidebar ':'')+(target===position?'drop-target':'')} boundaryLabel={sidebar?'左サイドとデータの境界':undefined} onResize={size=>onResize(position,size)} onDragOver={e=>over(position,e)} onDrop={e=>drop(position,e)} controls={<PaneBoundaryButton position={position} expanded label={info.name+'の境界ボタンで閉じる'} draggable onPointerDown={e=>pointerDrag(active,e)} onDragStart={e=>drag(active,e)} onDragEnd={endDrag} onClick={()=>click(()=>close(active))}>{info.label}</PaneBoundaryButton>}>
        <DockPane title={info.name} tools={tools?.(active)} position={position} onPosition={p=>onChange(current=>movePane(current,active,p))} onClose={()=>close(active)}>{tabs}<ContentHost container={containers[active]}/></DockPane>
      </DockSlot>;
    })}
    {PANES.filter(id=>visited.current.has(id)).map(id=>createPortal(<div id={'dock-panel-'+id} role="tabpanel" aria-labelledby={'dock-tab-'+id} className="pane-content">{content(id)}</div>,containers[id],id))}
    {dragging&&<div className="dock-drop-zones" aria-label="タブの結合先">{POSITIONS.map(position=><div key={position} className={'dock-drop-zone drop-'+position+(target===position?' targeted':'')} data-dock-position={position} aria-label={positionNames[position]+'にタブを結合'} onDragOver={e=>over(position,e)} onDrop={e=>drop(position,e)}>{positionNames[position]}に結合</div>)}</div>}
  </div>;
}
