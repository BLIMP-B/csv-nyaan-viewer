import React, { useLayoutEffect, useRef, useState } from 'react';
import type { Position } from './panels';
import type { PaneSize } from './types';

type Direction = 'width' | 'height' | 'both';
const names: Record<Position, string> = { top: '上', bottom: '下', left: '左', right: '右' };
function DotGrip({ vertical = false }: { vertical?: boolean }) {
  return <svg width={vertical ? 8 : 16} height={vertical ? 16 : 8} viewBox={vertical ? '0 0 8 16' : '0 0 16 8'} aria-hidden="true">
    {[0, 1, 2].flatMap(a => [0, 1].map(b => <circle key={`${a}-${b}`} cx={vertical ? 2 + b * 4 : 2 + a * 6} cy={vertical ? 2 + a * 6 : 2 + b * 4} r="1.4" fill="currentColor"/>))}
  </svg>;
}

export function DockSlot({ position, size = {}, onResize, children, controls, className='', boundaryLabel, onDragOver, onDrop }: { position: Position; size?: PaneSize; onResize(size: PaneSize): void; children: React.ReactNode; controls?: React.ReactNode;className?:string;boundaryLabel?:string;onDragOver?:React.DragEventHandler<HTMLDivElement>;onDrop?:React.DragEventHandler<HTMLDivElement> }) {
  const ref = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<PaneSize | null>(null);
  const [limits, setLimits] = useState({ width: 1600, height: 600 });
  const drag = useRef<{ x: number; y: number; width: number; height: number; direction: Direction; widthEdge: 'left'|'right'; heightEdge: 'top'|'bottom'; size: PaneSize; next: PaneSize; element: HTMLElement; previousCursor: string; previousSelect: string } | null>(null);
  const horizontal = position === 'top' || position === 'bottom';
  const widthEdge = position === 'right' ? 'left' : 'right';
  const heightEdge = position === 'bottom' ? 'top' : 'bottom';
  const label = names[position] + 'ペイン';
  const current = draft || size;
  const minWidth = Math.min(horizontal ? 360 : className.includes('sidebar')?190:280, limits.width);
  const minHeight = Math.min(180, limits.height);
  const clampWidth = (value: number) => Math.max(minWidth, Math.min(limits.width, value));
  const clampHeight = (value: number) => Math.max(minHeight, Math.min(limits.height, value));

  useLayoutEffect(() => {
    const slot = ref.current, layout = slot?.parentElement;
    if (!slot || !layout) return;
    const measure = () => {
      const opposite = layout.querySelector<HTMLElement>(`.dock-slot.${horizontal ? position === 'top' ? 'bottom' : 'top' : position === 'left' ? 'right' : 'left'}`);
      const center = layout.querySelector<HTMLElement>('.main-panel');
      const width = Math.max(180, layout.clientWidth - (horizontal ? 0 : (opposite?.getBoundingClientRect().width || 0) + 240));
      const height = Math.max(120, horizontal ? layout.clientHeight - (opposite?.getBoundingClientRect().height || 0) - 200 : center?.clientHeight || layout.clientHeight);
      setLimits(old => old.width === width && old.height === height ? old : { width, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(layout);
    Array.from(layout.children).filter(element => element !== slot).forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, [position, horizontal]);

  function restoreCursor() {
    const active = drag.current;
    if (active) {
      active.element.ownerDocument.body.style.cursor = active.previousCursor;
      active.element.ownerDocument.body.style.userSelect = active.previousSelect;
    }
  }
  useLayoutEffect(() => () => restoreCursor(), []);

  function begin(direction: Direction, event: React.PointerEvent<HTMLElement>, wEdge: 'left'|'right' = widthEdge, hEdge: 'top'|'bottom' = heightEdge) {
    if (event.button !== 0 || !ref.current) return;
    event.preventDefault(); event.stopPropagation();
    const rect = ref.current.getBoundingClientRect(), element = event.currentTarget, body = element.ownerDocument.body;
    drag.current = { x: event.clientX, y: event.clientY, width: rect.width, height: rect.height, direction, widthEdge:wEdge, heightEdge:hEdge, size: { ...size }, next: { ...size }, element, previousCursor: body.style.cursor, previousSelect: body.style.userSelect };
    body.style.cursor = direction === 'width' ? 'ew-resize' : direction === 'height' ? 'ns-resize' : (wEdge === 'left') === (hEdge === 'top') ? 'nwse-resize' : 'nesw-resize';
    body.style.userSelect = 'none';
    element.setPointerCapture(event.pointerId);
    setDraft({ ...size });
  }
  function move(event: React.PointerEvent<HTMLElement>) {
    const active = drag.current; if (!active) return;
    const next = { ...active.size };
    if (active.direction !== 'height') next.width = clampWidth(active.width + (event.clientX - active.x) * (active.widthEdge === 'left' ? -1 : 1));
    if (active.direction !== 'width') next.height = clampHeight(active.height + (event.clientY - active.y) * (active.heightEdge === 'top' ? -1 : 1));
    active.next = next; setDraft(next);
  }
  function finish(event: React.PointerEvent<HTMLElement>) {
    if (!drag.current) return;
    const next = drag.current.next;
    restoreCursor(); drag.current = null;
    onResize(next);
    setDraft(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function reset(direction: Direction) {
    const next = { ...size };
    if (direction !== 'height') delete next.width;
    if (direction !== 'width') delete next.height;
    onResize(next);
  }
  function keyboard(direction: Direction, event: React.KeyboardEvent<HTMLElement>, wEdge: 'left'|'right' = widthEdge, hEdge: 'top'|'bottom' = heightEdge) {
    if (event.key === 'Home') { event.preventDefault(); reset(direction); return; }
    const rect = ref.current?.getBoundingClientRect(); if (!rect) return;
    const step = event.shiftKey ? 48 : 16, next = { ...size };
    if (direction !== 'height' && ['ArrowLeft', 'ArrowRight'].includes(event.key)) next.width = clampWidth(rect.width + (event.key === 'ArrowRight' ? step : -step) * (wEdge === 'left' ? -1 : 1));
    else if (direction !== 'width' && ['ArrowUp', 'ArrowDown'].includes(event.key)) next.height = clampHeight(rect.height + (event.key === 'ArrowDown' ? step : -step) * (hEdge === 'top' ? -1 : 1));
    else return;
    event.preventDefault(); onResize(next);
  }
  const events = (direction: Direction, wEdge: 'left'|'right' = widthEdge, hEdge: 'top'|'bottom' = heightEdge) => ({ onPointerDown: (event: React.PointerEvent<HTMLElement>) => begin(direction, event, wEdge, hEdge), onPointerMove: move, onPointerUp: finish, onPointerCancel: finish, onLostPointerCapture: finish, onDoubleClick: () => reset(direction), onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => keyboard(direction, event, wEdge, hEdge) });
  const width = current.width === undefined ? horizontal ? '100%' : clampWidth(310) : clampWidth(current.width);
  const height = current.height === undefined ? horizontal ? clampHeight(300) : '100%' : clampHeight(current.height);
  return <div ref={ref} className={`dock-slot ${position}${draft ? ' resizing' : ''} ${className}`} style={{ width, height }} onDragOver={onDragOver} onDrop={onDrop}>
    {children}
    {controls}
    {(['top','bottom'] as const).map(edge=><div key={edge} className={`dock-grip grip-height edge-${edge}`} role="separator" tabIndex={0} aria-label={`${label}の高さを調整（${edge==='top'?'上':'下'}）`} aria-orientation="horizontal" aria-valuemin={minHeight} aria-valuemax={limits.height} aria-valuenow={typeof height==='number'?height:limits.height} title="上下にドラッグして高さを調整" {...events('height',widthEdge,edge)}><DotGrip/></div>)}
    {(['left','right'] as const).map(edge=><div key={edge} className={`dock-grip grip-width edge-${edge}`} role="separator" tabIndex={0} aria-label={`${label}の幅を調整（${edge==='left'?'左':'右'}）`} aria-orientation="vertical" aria-valuemin={minWidth} aria-valuemax={limits.width} aria-valuenow={typeof width==='number'?width:limits.width} title="左右にドラッグして幅を調整" {...events('width',edge,heightEdge)}><DotGrip vertical/></div>)}
    {([['top','left','左上'],['bottom','right','右下']] as const).map(([h,w,name])=><button key={name} className={`dock-grip grip-both edge-${h} edge-${w}`} aria-label={`${label}の幅と高さを調整（${name}）`} title="斜めにドラッグして幅と高さを調整" {...events('both',w,h)}><DotGrip vertical/></button>)}
    <div role="separator" tabIndex={0} aria-label={boundaryLabel||`${label}とデータの境界`} aria-orientation={horizontal?'horizontal':'vertical'} className={`dock-boundary edge-${horizontal?heightEdge:widthEdge} ${horizontal?'boundary-horizontal':'boundary-vertical'}`} {...events(horizontal?'height':'width')}/>

  </div>;
}
