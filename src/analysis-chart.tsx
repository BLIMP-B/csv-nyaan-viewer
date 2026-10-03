import React from 'react';
import {geometry,type Orientation,type PlotModel} from './analysis-plot';
import {centerLabelLayout} from './plot-layout';
import {formatNumber as fmt} from './analysis-types';
export function AnalysisChart({model,orientation={yaw:0,pitch:0,roll:0},angle=0}:{model:PlotModel;orientation?:Orientation;angle?:number}){
  const g=geometry(model,orientation,angle),color=(p:{series:number;cluster:number})=>'var(--plot-'+((model.seriesNames.length>1?p.series:p.cluster)%4+1)+')',short=(text:string)=>text.length>18?text.slice(0,17)+'…':text;
  return <svg className="analysis-plot" viewBox="0 0 480 340" role="img" aria-label={model.title==='主成分の分布'?`${model.dimension}次元主成分分布`:model.title}>
    {g.axes.map((axis,i)=><g key={i}><line x1={axis.start.x} y1={axis.start.y} x2={axis.end.x} y2={axis.end.y} stroke="var(--muted)"/><text x={Math.max(10,Math.min(465,axis.end.x+(axis.end.x>=300?-6:6)))} y={Math.max(30,Math.min(294,axis.end.y))} fontSize="22" textAnchor={axis.end.x>=300?'end':'start'} fill="var(--text)">{short(axis.caption)}<title>{axis.name}</title></text></g>)}
    {model.lines&&model.seriesNames.map((_,series)=><polyline key={series} points={g.points.filter(p=>p.series===series).map(p=>p.x+','+p.y).join(' ')} fill="none" stroke={'var(--plot-'+(series%4+1)+')'} strokeWidth="1.2"/>)}
    {!!g.regression.length&&<line x1={g.regression[0].x} y1={g.regression[0].y} x2={g.regression[1].x} y2={g.regression[1].y} stroke="var(--plot-2)" strokeDasharray="5 4"/>}
    {[...g.points].sort((a,b)=>a.z-b.z).map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={2.7} fill={color(p)} opacity=".9"><title>元行 {p.row} / 系列 {p.series+1} / 群 {p.cluster+1}{'\nX: '+p.original.x+' / Y: '+p.original.y+(model.dimension===3?' / Z: '+p.original.z:'')}</title></circle>)}
    {g.centers.map(c=><g className="cluster-center" key={c.series+'-'+c.cluster} data-cluster={c.cluster} data-series={c.series} data-count={c.count} role="img" aria-label={c.label+'：'+c.count+'件'}><title>{c.label+' · '+c.count+'件\nX: '+fmt(c.original.x)+' / Y: '+fmt(c.original.y)+(model.dimension===3?' / Z: '+fmt(c.original.z):'')}</title><path d={`M ${c.x} ${c.y-7} l 7 7 l -7 7 l -7 -7 Z`} fill="var(--bg)" stroke={color(c)} strokeWidth="2"/><path d={`M ${c.x-3} ${c.y} h 6 M ${c.x} ${c.y-3} v 6`} fill="none" stroke={color(c)} strokeWidth="2"/></g>)}
    {centerLabelLayout(g.centers,{x:10,y:14,width:460,height:288},(value,font)=>[...value].reduce((n,c)=>n+(c.charCodeAt(0)>255?font:font*.6),0)).map(box=><text className="cluster-center-label" key={box.center.series+'-'+box.center.cluster} x={box.x} y={box.y+11} fontSize={box.font} fontWeight="600" fill={color(box.center)} stroke="var(--bg)" strokeWidth="3" paintOrder="stroke" pointerEvents="none">{box.lines.map((line,i)=><tspan key={i} x={box.x} dy={i?box.lineHeight:0}>{line}</tspan>)}</text>)}
    {model.seriesNames.slice(0,2).map((name,i)=><text key={i} x="10" y={316+i*16} fontSize="18" fill="var(--text)">{name.length>55?name.slice(0,54)+'…':name}<title>{name}</title></text>)}
  </svg>;
}
