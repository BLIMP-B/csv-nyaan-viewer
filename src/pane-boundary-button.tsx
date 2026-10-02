import React from 'react';
import { PanelBottomClose, PanelBottomOpen, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, PanelTopClose, PanelTopOpen } from 'lucide-react';
import type { Position } from './panels';

const icons = {
  top: [PanelTopOpen, PanelTopClose], bottom: [PanelBottomOpen, PanelBottomClose],
  left: [PanelLeftOpen, PanelLeftClose], right: [PanelRightOpen, PanelRightClose],
};

export function PaneBoundaryButton({ position, expanded, label, children, index = 0, className = '', onClick, draggable, onDragStart, onDragEnd, onPointerDown }: {
  position: Position; expanded: boolean; label: string; children: React.ReactNode; index?: number; className?: string; onClick(): void; draggable?:boolean; onDragStart?:React.DragEventHandler<HTMLButtonElement>;onDragEnd?:React.DragEventHandler<HTMLButtonElement>;onPointerDown?:React.PointerEventHandler<HTMLButtonElement>;
}) {
  const Icon = icons[position][expanded ? 1 : 0];
  return <button type="button" draggable={draggable} onPointerDown={onPointerDown} onDragStart={onDragStart} onDragEnd={onDragEnd} className={`pane-reopen pane-boundary-button ${expanded ? 'pane-close close-' : 'reopen-'}${position} ${className}`} style={{ '--pane-button-offset': index ? '70px' : '-70px', '--pane-button-position': index ? '75%' : '25%' } as React.CSSProperties} aria-label={label} title={label} aria-expanded={expanded} onClick={onClick}><Icon size={14}/><span>{children}</span></button>;
}
