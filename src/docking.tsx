import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import './docking.css';
import {createPortal} from 'react-dom';
import {DockPane} from './panels';
import {DockSlot,type PaneLimits,type PaneResize} from './dock-slot';
import {initialDockRatios,dockGeometry,geometryFromTracks,ratiosFromGeometry,centerMinimum,dockWindowMinimum,crossWidthDonor,horizontal,type DockBounds,type DockRatios,type DockGeometry} from './dock-geometry';
import {PaneBoundaryTab,PaneBoundaryToggle} from './pane-boundary-button';
import {PANES,POSITIONS,PANE_INFO,isPane,movePane,showPane,closePane,toggleGroup,type DockLayout,type DockPosition,type PaneId} from './dock-state';
import type {Preferences} from './types';
export const PANE_DRAG_TYPE='application/x-csv-nyaan-pane';
const positionNames={top:'上',bottom:'下',left:'左',right:'右'};
function ContentHost({container}:{container:HTMLDivElement}) {
  const ref=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{const host=ref.current!;host.appendChild(container);return()=>{if(container.parentElement===host)host.removeChild(container);};},[container]);
  return <div className="dock-content-host" ref={ref}/>;
}
export function Docking({layout,onChange,prefs,ready,onPreferences,content,tools,editor}:{layout:DockLayout;onChange:React.Dispatch<React.SetStateAction<DockLayout>>;prefs:Preferences;ready:boolean;onPreferences(patch:Preferences):void;content(id:PaneId):React.ReactNode;tools?(id:PaneId):React.ReactNode;editor:React.ReactNode}) {
  const containers=useMemo(()=>Object.fromEntries(PANES.map(id=>{const div=document.createElement('div');div.className='dock-tab-content';div.dataset.pane=id;return [id,div];})) as Record<PaneId,HTMLDivElement>,[]),visited=useRef(new Set<PaneId>());
  const [dragging,setDragging]=useState<PaneId|null>(null),[target,setTarget]=useState<DockPosition|null>(null);
  const root=useRef<HTMLDivElement>(null),cancelPointer=useRef<(()=>void)|null>(null),ignoreClick=useRef(false);
  const [bounds,setBounds]=useState<DockBounds>({width:0,height:0}),[initial,setInitial]=useState<DockRatios|null>(null),[draft,setDraft]=useState<DockGeometry|null>(null),resizeStart=useRef<DockGeometry|null>(null);
  useLayoutEffect(()=>{const element=root.current!;const measure=()=>{const rect=element.getBoundingClientRect();setBounds(old=>Math.abs(old.width-rect.width)<.1&&Math.abs(old.height-rect.height)<.1?old:{width:rect.width,height:rect.height});};measure();const observer=new ResizeObserver(measure);observer.observe(element);return()=>observer.disconnect();},[]);
  useLayoutEffect(()=>{if(!ready||!bounds.width||!bounds.height||initial)return;const seed=initialDockRatios(bounds,layout,prefs);setInitial(seed);onPreferences({dockRatios:seed});},[ready,bounds.width,bounds.height,initial]);
  const ratios:DockRatios={...(initial||initialDockRatios(bounds,layout,prefs)),...prefs.dockRatios},calculated=dockGeometry(bounds,layout,ratios),geometry=draft||calculated,minCenter=centerMinimum(layout);
  const windowMinimum=dockWindowMinimum(layout);
  useEffect(()=>{if(ready)window.csv.dockMinimum(windowMinimum).catch(()=>{});},[ready,windowMinimum.width,windowMinimum.height,bounds.width,bounds.height]);
  function limits(position:DockPosition):PaneLimits {
    if(horizontal(position)){const donor=crossWidthDonor(geometry,'right'),other=position==='top'?'bottom':'top',maximum=(edge:'left'|'right')=>{const id=crossWidthDonor(geometry,edge);return id?geometry.centerWidth+geometry.tracks[id]-geometry.minimums[id]:geometry.centerWidth;};return {minWidth:donor?minCenter.width:geometry.centerWidth,maxWidth:maximum('right'),maxWidthLeft:maximum('left'),maxWidthRight:maximum('right'),minHeight:geometry.minimums[position],maxHeight:geometry.height-geometry.tracks[other]-minCenter.height};}
    const other=position==='left'?'right':'left';return {minWidth:geometry.minimums[position],maxWidth:geometry.width-geometry.tracks[other]-minCenter.width,minHeight:geometry.height,maxHeight:geometry.height};
  }
  function resize(position:DockPosition,request:PaneResize){
    if(request.phase==='begin'){resizeStart.current=geometry;return;}
    if(request.phase==='cancel'){resizeStart.current=null;setDraft(null);return;}
    const start=resizeStart.current||geometry,tracks={...start.tracks},affected=new Set<DockPosition>(),h=horizontal(position),clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
    if(request.direction!=='width'&&h){const other=position==='top'?'bottom':'top';tracks[position]=clamp(request.height,start.minimums[position],start.height-tracks[other]-minCenter.height);affected.add('top');affected.add('bottom');}
    if(request.direction!=='height'){
      if(!h){const other=position==='left'?'right':'left';tracks[position]=clamp(request.width,start.minimums[position],start.width-tracks[other]-minCenter.width);affected.add('left');affected.add('right');}
      else {const donor=crossWidthDonor(start,request.widthEdge);if(donor){const other=donor==='left'?'right':'left';tracks[donor]=clamp(start.tracks[donor]+start.centerWidth-request.width,start.minimums[donor],start.width-tracks[other]-minCenter.width);affected.add('left');affected.add('right');}}
    }
    if(!affected.size){resizeStart.current=null;setDraft(null);return;}
    if(request.phase==='reset'){
      const reset={...ratios};if(h&&request.direction!=='width')reset[position]=initial![position];if(request.direction!=='height'){const donor=h?crossWidthDonor(start,request.widthEdge):position;if(donor)reset[donor]=initial![donor];}const restored=dockGeometry(bounds,layout,reset);persist(restored,reset);return;
    }
    const next=geometryFromTracks(start,tracks,start.minimums);if(request.phase==='draft'){setDraft(next);return;}
    const resolved=ratiosFromGeometry(next,ratios),nextRatios={...ratios};for(const p of affected)nextRatios[p]=resolved[p];persist(next,nextRatios);
  }
  function persist(g:DockGeometry,nextRatios:DockRatios){
    const sizes={...prefs.dockSizes};for(const p of POSITIONS)if(g.tracks[p])sizes[p]=horizontal(p)?{width:g.centerWidth,height:g.tracks[p]}:{width:g.tracks[p],height:g.height};
    resizeStart.current=null;setDraft(null);onPreferences({dockRatios:nextRatios,dockSizes:sizes,...(g.tracks.left?{sidebarWidth:g.tracks.left}:{})});
  }
  for(const p of POSITIONS){const id=layout.active[p];if(id&&layout.open.includes(id))visited.current.add(id);}
  const endDrag=()=>{setDragging(null);setTarget(null);};
  useEffect(()=>()=>cancelPointer.current?.(),[]);
  useEffect(()=>{const cancel=(e:KeyboardEvent)=>{if(e.key==='Escape'){cancelPointer.current?.();endDrag();}};window.addEventListener('keydown',cancel);return()=>window.removeEventListener('keydown',cancel);},[]);
  function drag(id:PaneId,e:React.DragEvent){e.stopPropagation();e.dataTransfer.setData(PANE_DRAG_TYPE,id);e.dataTransfer.effectAllowed='move';setDragging(id);}
  function over(position:DockPosition,e:React.DragEvent){if(!e.dataTransfer.types.includes(PANE_DRAG_TYPE))return;e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='move';setTarget(position);}
  function paneUnder(doc:Document,x:number,y:number,position:DockPosition){for(const el of doc.elementsFromPoint(x,y)){const id=el.closest<HTMLElement>('[data-dock-pane]')?.dataset.dockPane;if(isPane(id)&&layout.groups[position].includes(id))return id;}}
  function drop(position:DockPosition,e:React.DragEvent,before?:PaneId){if(!e.dataTransfer.types.includes(PANE_DRAG_TYPE))return;e.preventDefault();e.stopPropagation();const id=e.dataTransfer.getData(PANE_DRAG_TYPE),destination=before||paneUnder(e.currentTarget.ownerDocument,e.clientX,e.clientY,position);if(isPane(id))onChange(current=>movePane(current,id,position,destination));endDrag();}
  const open=(id:PaneId)=>onChange(current=>showPane(current,id));
  const close=(id:PaneId)=>onChange(current=>closePane(current,id));
  function nearestEdge(point:{clientX:number;clientY:number}):DockPosition {const rect=root.current!.getBoundingClientRect(),x=point.clientX-rect.left,y=point.clientY-rect.top;return (Object.entries({top:y/rect.height,bottom:(rect.height-y)/rect.height,left:x/rect.width,right:(rect.width-x)/rect.width}) as [DockPosition,number][]).sort((a,b)=>a[1]-b[1])[0][0];}
  // Pointer capture avoids Electron's native drag loop, while retaining HTML5 drops
  // for integrations. Only a movement beyond the threshold starts a pane move.
  function pointerDrag(id:PaneId,event:React.PointerEvent<HTMLButtonElement>){
    if(event.button!==0)return;event.preventDefault();event.stopPropagation();cancelPointer.current?.();
    const element=event.currentTarget,doc=element.ownerDocument,start={x:event.clientX,y:event.clientY},body=doc.body,previousSelect=body.style.userSelect,previousCursor=body.style.cursor;let moved=false;
    ignoreClick.current=false;element.focus({preventScroll:true});element.setPointerCapture(event.pointerId);
    const destination=(e:PointerEvent)=>{const hit=doc.elementFromPoint(e.clientX,e.clientY);if(!hit?.closest('.docking-layout,.popout-root'))return null;const slot=hit.closest('.dock-slot'),popup=hit.closest<HTMLElement>('.popout-group'),zone=hit.closest<HTMLElement>('[data-dock-position]'),position=zone?.dataset.dockPosition as DockPosition|undefined||POSITIONS.find(p=>slot?.classList.contains(p))||(popup?.dataset.dockPosition as DockPosition|undefined)||nearestEdge(e);return {position,before:paneUnder(doc,e.clientX,e.clientY,position)};};
    const cleanup=()=>{doc.removeEventListener('pointermove',move);doc.removeEventListener('pointerup',up);doc.removeEventListener('pointercancel',cancel);doc.removeEventListener('keydown',key);if(element.hasPointerCapture(event.pointerId))element.releasePointerCapture(event.pointerId);body.style.userSelect=previousSelect;body.style.cursor=previousCursor;cancelPointer.current=null;endDrag();};
    const move=(e:PointerEvent)=>{if(e.pointerId!==event.pointerId)return;if(!moved&&Math.hypot(e.clientX-start.x,e.clientY-start.y)<6)return;if(!moved){moved=true;ignoreClick.current=true;body.style.userSelect='none';body.style.cursor='grabbing';setDragging(id);}setTarget(destination(e)?.position||null);};
    const cancel=()=>{if(moved)ignoreClick.current=true;cleanup();};
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape')cancel();};
    const up=(e:PointerEvent)=>{if(e.pointerId!==event.pointerId)return;const result=moved?destination(e):null;if(result)onChange(current=>movePane(current,id,result.position,result.before));cleanup();};
    cancelPointer.current=cancel;doc.addEventListener('pointermove',move);doc.addEventListener('pointerup',up);doc.addEventListener('pointercancel',cancel);doc.addEventListener('keydown',key);
  }
  const click=(action:()=>void)=>{if(ignoreClick.current){ignoreClick.current=false;return;}action();};
  function boundaryTabs(position:DockPosition,expanded:boolean){
    const ids=layout.groups[position],active=layout.active[position]||ids[0];
    function tab(id:PaneId){const index=ids.indexOf(id);return <PaneBoundaryTab key={id} id={id} selected={id===active} onSelect={()=>click(()=>open(id))} onPointerDown={e=>pointerDrag(id,e)} onDragStart={e=>drag(id,e)} onDragEnd={endDrag} onDragOver={e=>over(position,e)} onDrop={e=>drop(position,e,id)} onKeyDown={e=>{let next=index;if(['ArrowRight','ArrowDown'].includes(e.key))next=(index+1)%ids.length;else if(['ArrowLeft','ArrowUp'].includes(e.key))next=(index+ids.length-1)%ids.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=ids.length-1;else return;e.preventDefault();open(ids[next]);e.currentTarget.ownerDocument.getElementById('dock-tab-'+ids[next])?.focus();}}/>;}
    return <div className={'dock-rail rail-'+position+(expanded?' expanded':' minimized')} role="tablist" aria-orientation={position==='left'||position==='right'?'vertical':'horizontal'} aria-label={positionNames[position]+'ペインのタブ'} data-dock-position={position} onDragOver={e=>over(position,e)} onDrop={e=>drop(position,e)}><div className="rail-section"><PaneBoundaryToggle position={position} expanded={expanded} onClick={()=>onChange(current=>toggleGroup(current,active))}/>{ids.map(tab)}</div></div>;
  }
  return <div ref={root} className={'editor-layout docking-layout'+(dragging?' pane-dragging':'')} style={{gridTemplateColumns:geometry.tracks.left+'px minmax('+minCenter.width+'px,1fr) '+geometry.tracks.right+'px',gridTemplateRows:geometry.tracks.top+'px minmax('+minCenter.height+'px,1fr) '+geometry.tracks.bottom+'px'}} onDragOver={e=>over(nearestEdge(e),e)} onDrop={e=>drop(nearestEdge(e),e)}>
    <div className={'docking-editor'+POSITIONS.filter(p=>layout.groups[p].length&&!layout.groups[p].some(id=>layout.open.includes(id))).map(p=>' has-rail-'+p).join('')}>{editor}{POSITIONS.map(position=>layout.groups[position].length&&!layout.groups[position].some(id=>layout.open.includes(id))?<React.Fragment key={position}>{boundaryTabs(position,false)}</React.Fragment>:null)}</div>
    {POSITIONS.map(position=>{
      const ids=layout.groups[position],opened=ids.filter(id=>layout.open.includes(id));if(!opened.length)return null;
      const active=layout.active[position]&&opened.includes(layout.active[position]!)?layout.active[position]!:opened[0],info=PANE_INFO[active],sidebar=position==='left'&&ids.some(id=>['workspace','selection','multivariate'].includes(id));
      return <DockSlot key={position} position={position} size={horizontal(position)?{width:geometry.centerWidth,height:geometry.tracks[position]}:{width:geometry.tracks[position],height:geometry.height}} limits={limits(position)} className={(sidebar?'sidebar ':'')+(target===position?'drop-target':'')} boundaryLabel={sidebar?'左サイドとデータの境界':undefined} onResize={request=>resize(position,request)} onDragOver={e=>over(position,e)} onDrop={e=>drop(position,e)}>
        <DockPane title={info.name} boundary={boundaryTabs(position,true)} tools={tools?.(active)} position={position} onPosition={p=>onChange(current=>movePane(current,active,p))} onClose={()=>close(active)}><ContentHost container={containers[active]}/></DockPane>
      </DockSlot>;
    })}
    {PANES.filter(id=>visited.current.has(id)).map(id=>createPortal(<div id={'dock-panel-'+id} role="tabpanel" aria-labelledby={'dock-tab-'+id} className="pane-content">{content(id)}</div>,containers[id],id))}
    {dragging&&<div className="dock-drop-zones" aria-label="タブの結合先">{POSITIONS.map(position=><div key={position} className={'dock-drop-zone drop-'+position+(target===position?' targeted':'')} data-dock-position={position} aria-label={positionNames[position]+'にタブを結合'} onDragOver={e=>over(position,e)} onDrop={e=>drop(position,e)}>{positionNames[position]}に結合</div>)}</div>}
  </div>;
}
