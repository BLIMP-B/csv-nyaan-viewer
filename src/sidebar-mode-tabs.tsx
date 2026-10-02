import React, { useRef } from 'react';

const modes = [
  { id: 'workspace', label: 'ワークスペース', scope: '', name: 'ワークスペース' },
  { id: 'selection', label: '変量分析', scope: '選択範囲', name: '変量分析（選択範囲）' },
  { id: 'multivariate', label: '多変量分析', scope: 'ファイル全域', name: '多変量分析（ファイル全域）' },
] as const;
export type SidebarMode = typeof modes[number]['id'];

export function SidebarModeTabs({ active, onChange }: { active: SidebarMode; onChange(mode: SidebarMode): void }) {
  const buttons = useRef(new Map<SidebarMode, HTMLButtonElement>());
  function navigate(event: React.KeyboardEvent, index: number) {
    let next: number;
    switch (event.key) {
      case 'ArrowLeft': next = (index + modes.length - 1) % modes.length; break;
      case 'ArrowRight': next = (index + 1) % modes.length; break;
      case 'Home': next = 0; break;
      case 'End': next = modes.length - 1; break;
      default: return;
    }
    event.preventDefault();
    onChange(modes[next].id);
    buttons.current.get(modes[next].id)?.focus();
  }
  return <div className="sidebar-mode-tabs" role="tablist" aria-label="左サイドのモード" aria-orientation="horizontal">
    {modes.map((mode, index) => <button key={mode.id} type="button" role="tab" id={'sidebar-mode-' + mode.id} aria-label={mode.name} title={mode.name} aria-selected={mode.id === active} aria-controls={'sidebar-panel-' + mode.id} tabIndex={mode.id === active ? 0 : -1} className={'sidebar-mode-tab' + (mode.id === active ? ' active' : '')} ref={button => { if (button) buttons.current.set(mode.id, button); else buttons.current.delete(mode.id); }} onClick={() => onChange(mode.id)} onKeyDown={event => navigate(event, index)}><span>{mode.label}</span>{mode.scope && <small>{mode.scope}</small>}</button>)}
  </div>;
}
