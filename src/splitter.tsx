import React, { useRef } from 'react';
export function SidebarBoundary({ width, onChange }: { width:number; onChange(width:number):void }) {
  const start=useRef<{x:number;width:number}|null>(null);
  const clamp=(value:number)=>Math.max(190,Math.min(window.innerWidth-400,value));
  return <div className="sidebar-boundary" role="separator" tabIndex={0} aria-label="左サイドとデータの境界" aria-orientation="vertical" aria-valuenow={width} onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();start.current={x:e.clientX,width};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(start.current)onChange(clamp(start.current.width+e.clientX-start.current.x));}} onPointerUp={e=>{start.current=null;e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>{start.current=null;}} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();onChange(clamp(width+(e.key==='ArrowRight'?16:-16)));}if(e.key==='Home')onChange(260);}} onDoubleClick={()=>onChange(260)}/>;
}
