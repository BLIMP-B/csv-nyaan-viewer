import React, { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function WorksheetTabs({ sheets, active, disabled, panelId, onSelect }: {
  sheets: string[];
  active: string;
  disabled: boolean;
  panelId: string;
  onSelect(sheet: string): void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const focusAfterChange = useRef(false);

  useEffect(() => {
    buttons.current.get(active)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);

  useEffect(() => {
    // Native disabled buttons lose focus while the sheet request is running.
    // Return focus when it finishes so consecutive arrow keys keep working.
    if (!disabled && focusAfterChange.current) {
      buttons.current.get(active)?.focus();
      focusAfterChange.current = false;
    }
  }, [active, disabled]);

  function select(sheet: string) {
    if (disabled || sheet === active) return;
    focusAfterChange.current = true;
    onSelect(sheet);
  }

  function navigate(event: React.KeyboardEvent, index: number) {
    if (disabled) return;
    let next: number;
    switch (event.key) {
      case 'ArrowLeft': next = Math.max(0, index - 1); break;
      case 'ArrowRight': next = Math.min(sheets.length - 1, index + 1); break;
      case 'Home': next = 0; break;
      case 'End': next = sheets.length - 1; break;
      default: return;
    }
    event.preventDefault();
    buttons.current.get(sheets[next])?.focus();
    select(sheets[next]);
  }

  return <div className="worksheet-bar">
    <div className="worksheet-navigation">
      <button type="button" className="icon-btn" aria-label="シートタブを左にスクロール" onClick={() => list.current?.scrollBy({ left: -Math.max(160, list.current.clientWidth * 0.7), behavior: 'smooth' })}><ChevronLeft size={14}/></button>
      <button type="button" className="icon-btn" aria-label="シートタブを右にスクロール" onClick={() => list.current?.scrollBy({ left: Math.max(160, list.current.clientWidth * 0.7), behavior: 'smooth' })}><ChevronRight size={14}/></button>
    </div>
    <div className="worksheet-tabs" ref={list} role="tablist" aria-label="ワークシート" aria-orientation="horizontal">
      {sheets.map((sheet, index) => <button key={sheet} type="button" role="tab" aria-selected={sheet === active} aria-controls={panelId} tabIndex={sheet === active ? 0 : -1} disabled={disabled} className={'worksheet-tab' + (sheet === active ? ' active' : '')} title={sheet} ref={button => { if (button) buttons.current.set(sheet, button); else buttons.current.delete(sheet); }} onClick={() => select(sheet)} onKeyDown={event => navigate(event, index)}>{sheet}</button>)}
    </div>
  </div>;
}
