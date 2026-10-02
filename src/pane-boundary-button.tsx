import React from 'react';
import { PanelBottomClose, PanelBottomOpen, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, PanelTopClose, PanelTopOpen } from 'lucide-react';
import type { Position } from './panels';
import {PANE_INFO,type PaneId} from './dock-state';
const icons={top:[PanelTopOpen,PanelTopClose],bottom:[PanelBottomOpen,PanelBottomClose],left:[PanelLeftOpen,PanelLeftClose],right:[PanelRightOpen,PanelRightClose]},names={top:'上',bottom:'下',left:'左',right:'右'};
export function PaneBoundaryToggle({position,expanded,onClick}:{position:Position;expanded:boolean;onClick():void}){
  const Icon=icons[position][expanded?1:0],label=names[position]+'ペイン全体を'+(expanded?'最小化':'展開');
  return <button type="button" className="pane-boundary-button boundary-toggle" aria-expanded={expanded} aria-label={label} title={label} onClick={onClick}><Icon size={14}/></button>;
}
export function PaneBoundaryTab({id,selected,onSelect,onKeyDown,onPointerDown,onDragStart,onDragEnd,onDragOver,onDrop}:{
  id:PaneId;selected:boolean;onSelect():void;onKeyDown:React.KeyboardEventHandler<HTMLButtonElement>;
  onPointerDown:React.PointerEventHandler<HTMLButtonElement>;onDragStart:React.DragEventHandler<HTMLButtonElement>;onDragEnd:React.DragEventHandler<HTMLButtonElement>;onDragOver:React.DragEventHandler<HTMLButtonElement>;onDrop:React.DragEventHandler<HTMLButtonElement>;
}){
  const info=PANE_INFO[id];
  return <button type="button" className={'dock-edge-tab boundary-tab-label'+(selected?' selected':'')} data-dock-pane={id} draggable onPointerDown={onPointerDown} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragOver={onDragOver} onDrop={onDrop} role="tab" id={'dock-tab-'+id} aria-controls={'dock-panel-'+id} aria-selected={selected} aria-label={info.name} tabIndex={selected?0:-1} title={info.name+' — 切り替え、ドラッグで移動・結合'} onClick={onSelect} onKeyDown={onKeyDown}><span>{info.label}</span></button>;
}
