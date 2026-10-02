import React from 'react';
import { ArrowUp, ArrowDown, RotateCcw, Eye, EyeOff } from 'lucide-react';
export function GridHead({axis,index,label,letter,hidden,selected,onStart,onEnter,onMenu,onVisibility,onSort}: {axis:'row'|'column';index:number;label:string;letter?:string;hidden:boolean;selected:boolean;onStart(e:React.PointerEvent):void;onEnter():void;onMenu(e:React.MouseEvent):void;onVisibility():void;onSort(direction:'asc'|'desc'|null):void}) {
  const name=(axis==='column'?'列':'行')+(letter||label);
  return <div className={`grid-head ${axis}-head${selected?' head-selected':''}${hidden?' head-hidden':''}`} role={axis==='column'?'columnheader':'rowheader'} aria-selected={selected} data-head-index={index} onContextMenu={onMenu}>
    <div className="header-eye-zone"><button className="header-action visibility-action" aria-label={`${name}を${hidden?'表示':'非表示'}`} title={hidden?'表示する':'非表示にする'} onClick={onVisibility}>{hidden?<EyeOff size={13}/>:<Eye size={13}/>}</button></div>
    <button className="header-center" aria-label={`${name}を選択`} onPointerDown={onStart} onPointerEnter={onEnter}><span>{letter || label}</span></button>
    <div className="header-sort-zone"><div className="header-sort-actions"><button className="header-action" aria-label={`${name}を昇順`} title="昇順" onClick={()=>onSort('asc')}><ArrowUp size={12}/></button><button className="header-action" aria-label={`${name}を降順`} title="降順" onClick={()=>onSort('desc')}><ArrowDown size={12}/></button><button className="header-action" aria-label={`${name}を元の順序へ`} title="元の順序に戻す" onClick={()=>onSort(null)}><RotateCcw size={12}/></button></div></div>
  </div>;
}
