import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { buildChartOption } from './chart-options';
import { chartKind } from './chart-catalog';
import { Pencil, X } from 'lucide-react';
import { chartData, type TableData } from './data';
import { validateAxis, type Axis, type AxisSettings, type ChartSettings } from './chart-settings';

interface AxisBox { axis: Axis; left: number; top: number; width: number; height: number }
interface ChartHandle { png(): string | null }
export function EditableChart({ table, type, settings, onSettingsChange, theme, handleRef, onImage, compact = false }: {
  table: TableData; type: string; settings: ChartSettings; onSettingsChange(value: ChartSettings): void; theme: string;
  handleRef?: React.MutableRefObject<ChartHandle | null>; onImage?(image: string): void; compact?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null), chart = useRef<echarts.ECharts | null>(null), imageCallback = useRef(onImage);
  imageCallback.current = onImage;
  const [boxes,setBoxes] = useState<AxisBox[]>([]), [hovered,setHovered] = useState<Axis | null>(null);
  const [editing,setEditing] = useState<{ axis: Axis; left: number; top: number } | null>(null), [draft,setDraft] = useState<AxisSettings | null>(null), [labels,setLabels] = useState(''), [error,setError] = useState('');
  const model = useMemo(() => chartData(table), [table]);
  const kind=chartKind(type), hasAxes=!['pie','pie-exploded','pie-3d','pie-exploded-3d','pie-of-pie','bar-of-pie','doughnut','doughnut-exploded','radar','radar-markers','radar-filled','treemap','sunburst','funnel','map','surface-3d','surface-wireframe'].includes(type);
  const numerical=(axis:Axis)=>axis==='x'?kind.horizontal||['散布図','バブル'].includes(kind.family):!kind.horizontal;
  const categoryAxis:Axis=kind.horizontal?'y':'x';
  const hasLabels=(axis:Axis)=>!['散布図','バブル','等高線'].includes(kind.family)&&!(axis===categoryAxis&&['histogram','boxplot'].includes(type));
  const labelCount=(axis:Axis)=>axis===categoryAxis?model.labels.length:model.series.length;
  if (handleRef) handleRef.current = { png: () => chart.current&&chart.current.getWidth()>0&&chart.current.getHeight()>0?chart.current.getDataURL({type:'png',pixelRatio:1}):null };
  useEffect(() => {
    if(!host.current||!model.series.length){setBoxes([]);return;}
    const instance=echarts.init(host.current,undefined,{renderer:'canvas'});chart.current=instance;
    const report=()=>{
      if(instance.isDisposed()||instance.getWidth()<=0||instance.getHeight()<=0)return;
      const rect=(instance as any).getModel().getComponent('grid')?.coordinateSystem?.getRect();
      const next:AxisBox[]=hasAxes&&rect?[
        {axis:'x',left:rect.x,top:rect.y+rect.height,width:rect.width,height:Math.max(20,instance.getHeight()-rect.y-rect.height-24)},
        {axis:'y',left:0,top:rect.y,width:Math.max(30,rect.x),height:rect.height}
      ]:[];
      setBoxes(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);
      imageCallback.current?.(instance.getDataURL({type:'png',pixelRatio:1}));
    };
    instance.on('finished',report);instance.setOption(buildChartOption(table,type,settings,theme,compact),true);report();
    const observer=new ResizeObserver(()=>{if(host.current&&host.current.clientWidth>0&&host.current.clientHeight>0){instance.resize();report();}});observer.observe(host.current);
    return ()=>{observer.disconnect();instance.dispose();if(chart.current===instance)chart.current=null;};
  },[model,table,type,settings,theme,compact,hasAxes]);
  useEffect(() => { setEditing(null);setHovered(null); },[table,type]);
  function openAxis(axis:Axis,target:HTMLElement) {
    const rect=target.getBoundingClientRect(), owner=target.ownerDocument.defaultView;
    const width=Math.min(330,(owner?.innerWidth||800)-24), editorHeight=Math.min(480,(owner?.innerHeight||600)-24);
    setEditing({axis,left:Math.max(12,Math.min(rect.left,(owner?.innerWidth||800)-width-12)),top:Math.max(12,Math.min(rect.bottom+4,(owner?.innerHeight||600)-editorHeight-12))});
    setDraft({...settings[axis]});setLabels((settings[axis].labels?.length===labelCount(axis)?settings[axis].labels!:(axis===categoryAxis?model.labels:model.series.map(s=>s.label))).join('\n'));setError('');
  }
  function apply() {
    if(!editing||!draft)return;
    const next={...draft, ...(hasLabels(editing.axis)?{labels:labels.replace(/\r\n/g,'\n').split('\n')}:{labels:undefined})};
    const validation=validateAxis(next,numerical(editing.axis),labelCount(editing.axis));
    if(validation){setError(validation);return;}
    onSettingsChange({...settings,[editing.axis]:next});setEditing(null);
  }
  return <div className={'editable-chart '+(compact?'compact-chart':'')}>
    <div ref={host} className="echart-host" role="img" aria-label="数値グラフ"/>
    {boxes.map(box=><button key={box.axis} className={'axis-hit '+(hovered===box.axis?'axis-hover':'')} style={{left:box.left,top:box.top,width:Math.max(box.width,12),height:Math.max(box.height,12)}} aria-label={`${box.axis.toUpperCase()}軸を編集`} title={`${box.axis.toUpperCase()}軸をクリックして編集`} onMouseEnter={()=>setHovered(box.axis)} onMouseLeave={()=>setHovered(null)} onFocus={()=>setHovered(box.axis)} onBlur={()=>setHovered(null)} onClick={e=>{e.stopPropagation();openAxis(box.axis,e.currentTarget);}}><span className="axis-edit-hint"><Pencil size={10}/>{box.axis.toUpperCase()}軸を編集</span></button>)}
    {editing&&draft&&<div className="axis-editor" role="dialog" aria-modal="false" aria-label={`${editing.axis.toUpperCase()}軸の編集`} style={{left:editing.left,top:editing.top}} onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape'){setEditing(null);e.stopPropagation();}}}>
      <header><strong>{editing.axis.toUpperCase()}軸の編集</strong><button className="icon-btn" aria-label="軸編集を閉じる" onClick={()=>setEditing(null)}><X size={15}/></button></header>
      <label>軸名<input aria-label="軸名" autoFocus value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} placeholder="空欄で軸名を非表示"/></label>
      {numerical(editing.axis)&&<><div className="axis-limits"><label>最小値<input aria-label="軸の最小値" value={draft.min} placeholder="自動" onChange={e=>setDraft({...draft,min:e.target.value})}/></label><label>最大値<input aria-label="軸の最大値" value={draft.max} placeholder="自動" onChange={e=>setDraft({...draft,max:e.target.value})}/></label></div><label>目盛りの小数桁<select aria-label="目盛りの小数桁" value={draft.digits} onChange={e=>setDraft({...draft,digits:e.target.value})}><option value="auto">自動</option>{Array.from({length:9},(_,n)=><option value={n} key={n}>{n}桁</option>)}</select></label></>}
      {hasLabels(editing.axis)&&<label>{editing.axis===categoryAxis?'行ラベル（1行ずつ）':'系列名（1行ずつ）'}<textarea aria-label={editing.axis===categoryAxis?'行ラベル':'系列名'} value={labels} onChange={e=>setLabels(e.target.value)} rows={Math.min(4,Math.max(2,labelCount(editing.axis)))}/></label>}
      {error&&<p className="axis-error" role="alert">{error}</p>}<footer><button onClick={()=>setEditing(null)}>キャンセル</button><button className="primary" onClick={apply}>適用</button></footer>
    </div>}
  </div>;
}
