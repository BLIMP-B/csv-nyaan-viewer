import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Chart, registerables, type Plugin } from 'chart.js';
import { Pencil, X } from 'lucide-react';
import { chartData, type TableData } from './data';
import { validateAxis, type Axis, type AxisSettings, type ChartSettings } from './chart-settings';
Chart.register(...registerables);
interface AxisBox { axis: Axis; left: number; top: number; width: number; height: number }
interface ChartHandle { png(): string | null }
export function EditableChart({ table, type, settings, onSettingsChange, theme, handleRef, onImage, compact = false }: {
  table: TableData; type: string; settings: ChartSettings; onSettingsChange(value: ChartSettings): void; theme: string;
  handleRef?: React.MutableRefObject<ChartHandle | null>; onImage?(image: string): void; compact?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null), chart = useRef<Chart | null>(null), imageCallback = useRef(onImage);
  imageCallback.current = onImage;
  const [boxes,setBoxes] = useState<AxisBox[]>([]), [hovered,setHovered] = useState<Axis | null>(null);
  const [editing,setEditing] = useState<{ axis: Axis; left: number; top: number } | null>(null), [draft,setDraft] = useState<AxisSettings | null>(null), [labels,setLabels] = useState(''), [error,setError] = useState('');
  const model = useMemo(() => chartData(table), [table]), pie = ['pie','doughnut'].includes(type);
  if (handleRef) handleRef.current = { png: () => chart.current?.toBase64Image('image/png',1) || null };
  useEffect(() => {
    if (!canvas.current || !model.series.length) { setBoxes([]); return; }
    const scatter = type === 'scatter', dark = theme === 'dark';
    const colors = ['#0f6cbd','#107c41','#5b5fc7','#d83b01','#c239b3','#038387','#ca5010','#8764b8'];
    const text = dark ? '#dedede' : '#424242', bg = dark ? '#292929' : '#ffffff';
    const datasets = (pie ? model.series.slice(0,1) : model.series).map((series,i) => ({
      label: settings.y.labels?.[i] ?? series.label,
      data: scatter ? series.values.map((y,x) => ({ x:x+1,y })) : series.values,
      borderColor: colors[i%colors.length], backgroundColor: pie ? model.labels.map((_,j) => colors[j%colors.length]) : type === 'area' ? colors[i%colors.length]+'40' : colors[i%colors.length],
      fill: type === 'area', tension:.15, pointRadius:model.labels.length > 100 ? 0 : 2, borderWidth:2,
    }));
    const scale = (axis: Axis) => {
      const value = settings[axis], numerical = axis === 'y' || scatter;
      const formatter = value.digits === 'auto' ? null : new Intl.NumberFormat('ja-JP',{minimumFractionDigits:Number(value.digits),maximumFractionDigits:Number(value.digits)});
      return {
        ...(numerical && value.min.trim() ? { min:Number(value.min) } : {}), ...(numerical && value.max.trim() ? { max:Number(value.max) } : {}),
        title: { display:!!value.title, text:value.title, color:text, font:{size:compact?9:11} },
        ticks: { color:text, font:{size:compact?8:10}, maxTicksLimit:axis==='x'?15:undefined,
          ...(numerical && formatter ? { callback:(value:string|number)=>formatter.format(Number(value)) } : {}),
        }, grid:{color:dark?'#ffffff12':'#00000008'},
      };
    };
    const overlay: Plugin = { id:'editableAxes', afterRender(instance) {
      const next: AxisBox[] = pie ? [] : (['x','y'] as Axis[]).map(axis => {
        const s = instance.scales[axis];return {axis,left:s.left,top:s.top,width:s.width,height:s.height};
      });
      setBoxes(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      imageCallback.current?.(instance.toBase64Image('image/png',1));
    } };
    chart.current = new Chart(canvas.current,{
      type:type==='area'?'line':type as 'bar', data:{labels:settings.x.labels ?? model.labels,datasets},
      options:{responsive:true,maintainAspectRatio:false,animation:false,color:text,plugins:{legend:{position:'bottom',labels:{color:text,font:{size:compact?8:10},boxWidth:10}},tooltip:{enabled:true}},scales:pie?{}:{x:scale('x'),y:scale('y')}},
      plugins:[{id:'canvasBackground',beforeDraw:c=>{const ctx=c.ctx;ctx.save();ctx.globalCompositeOperation='destination-over';ctx.fillStyle=bg;ctx.fillRect(0,0,c.width,c.height);ctx.restore();}},overlay],
    });
    return () => { chart.current?.destroy();chart.current=null; };
  },[model,type,settings,theme,compact,pie]);
  useEffect(() => { setEditing(null);setHovered(null); },[table,type]);
  function openAxis(axis:Axis,target:HTMLElement) {
    const rect=target.getBoundingClientRect(), owner=target.ownerDocument.defaultView;
    const width=Math.min(330,(owner?.innerWidth||800)-24), editorHeight=Math.min(480,(owner?.innerHeight||600)-24);
    setEditing({axis,left:Math.max(12,Math.min(rect.left,(owner?.innerWidth||800)-width-12)),top:Math.max(12,Math.min(rect.bottom+4,(owner?.innerHeight||600)-editorHeight-12))});
    setDraft({...settings[axis]});setLabels((settings[axis].labels ?? (axis==='x'?model.labels:model.series.map(s=>s.label))).join('\n'));setError('');
  }
  function apply() {
    if(!editing||!draft)return;
    const numerical=editing.axis==='y'||type==='scatter', next={...draft, ...(editing.axis==='x'&&type!=='scatter'||editing.axis==='y'?{labels:labels.replace(/\r\n/g,'\n').split('\n')}:{})};
    const validation=validateAxis(next,numerical,editing.axis==='x'?model.labels.length:model.series.length);
    if(validation){setError(validation);return;}
    onSettingsChange({...settings,[editing.axis]:next});setEditing(null);
  }
  return <div className={'editable-chart '+(compact?'compact-chart':'')}>
    <canvas ref={canvas} aria-label="数値グラフ"/>
    {boxes.map(box=><button key={box.axis} className={'axis-hit '+(hovered===box.axis?'axis-hover':'')} style={{left:box.left,top:box.top,width:Math.max(box.width,12),height:Math.max(box.height,12)}} aria-label={`${box.axis.toUpperCase()}軸を編集`} title={`${box.axis.toUpperCase()}軸をクリックして編集`} onMouseEnter={()=>setHovered(box.axis)} onMouseLeave={()=>setHovered(null)} onFocus={()=>setHovered(box.axis)} onBlur={()=>setHovered(null)} onClick={e=>{e.stopPropagation();openAxis(box.axis,e.currentTarget);}}><span className="axis-edit-hint"><Pencil size={10}/>{box.axis.toUpperCase()}軸を編集</span></button>)}
    {editing&&draft&&<div className="axis-editor" role="dialog" aria-modal="false" aria-label={`${editing.axis.toUpperCase()}軸の編集`} style={{left:editing.left,top:editing.top}} onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape'){setEditing(null);e.stopPropagation();}}}>
      <header><strong>{editing.axis.toUpperCase()}軸の編集</strong><button className="icon-btn" aria-label="軸編集を閉じる" onClick={()=>setEditing(null)}><X size={15}/></button></header>
      <label>軸名<input aria-label="軸名" autoFocus value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} placeholder="空欄で軸名を非表示"/></label>
      {(editing.axis==='y'||type==='scatter')&&<><div className="axis-limits"><label>最小値<input aria-label="軸の最小値" value={draft.min} placeholder="自動" onChange={e=>setDraft({...draft,min:e.target.value})}/></label><label>最大値<input aria-label="軸の最大値" value={draft.max} placeholder="自動" onChange={e=>setDraft({...draft,max:e.target.value})}/></label></div><label>目盛りの小数桁<select aria-label="目盛りの小数桁" value={draft.digits} onChange={e=>setDraft({...draft,digits:e.target.value})}><option value="auto">自動</option>{Array.from({length:9},(_,n)=><option value={n} key={n}>{n}桁</option>)}</select></label></>}
      {(editing.axis==='x'&&type!=='scatter'||editing.axis==='y')&&<label>{editing.axis==='x'?'行ラベル（1行ずつ）':'系列名（1行ずつ）'}<textarea aria-label={editing.axis==='x'?'行ラベル':'系列名'} value={labels} onChange={e=>setLabels(e.target.value)} rows={Math.min(4,Math.max(2,editing.axis==='x'?model.labels.length:model.series.length))}/></label>}
      {error&&<p className="axis-error" role="alert">{error}</p>}<footer><button onClick={()=>setEditing(null)}>キャンセル</button><button className="primary" onClick={apply}>適用</button></footer>
    </div>}
  </div>;
}
