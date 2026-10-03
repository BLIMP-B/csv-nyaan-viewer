import {POSITIONS,type DockLayout,type DockPosition} from './dock-state';
import type {Preferences} from './types';

export type DockRatios=Record<DockPosition,number>;
export type DockTracks=Record<DockPosition,number>;
export interface DockBounds {width:number;height:number}
export interface DockGeometry extends DockBounds {tracks:DockTracks;centerWidth:number;centerHeight:number;minimums:DockTracks}
export const horizontal=(p:DockPosition)=>p==='top'||p==='bottom';
export const opened=(layout:DockLayout,p:DockPosition)=>layout.groups[p].some(id=>layout.open.includes(id));
export function dockMinimums(layout:DockLayout):DockTracks {
  return {top:180,bottom:180,left:layout.groups.left.some(id=>['workspace','selection','multivariate'].includes(id))?190:280,right:280};
}
export const centerMinimum=(layout:DockLayout)=>({width:opened(layout,'top')||opened(layout,'bottom')?360:240,height:320});
export function dockWindowMinimum(layout:DockLayout){const m=dockMinimums(layout),center=centerMinimum(layout);return {width:Math.max(1000,center.width+['left','right'].reduce((n,p)=>n+(opened(layout,p as DockPosition)?m[p as DockPosition]:0),0)),height:Math.max(560,34+center.height+['top','bottom'].reduce((n,p)=>n+(opened(layout,p as DockPosition)?m[p as DockPosition]:0),0))};}
const validRatio=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=100;
const pixels=(value:unknown,fallback:number)=>typeof value==='number'&&Number.isFinite(value)&&value>0?value:fallback;
// Legacy pixels are converted once at the measured viewport. Cross-axis sizes
// belong to the shared grid track, so they cannot leave an unoccupied rectangle.
export function initialDockRatios(bounds:DockBounds,layout:DockLayout,prefs:Preferences):DockRatios {
  const desired:DockTracks={top:pixels(prefs.dockSizes?.top?.height,300),bottom:pixels(prefs.dockSizes?.bottom?.height,300),left:pixels(prefs.dockSizes?.left?.width,pixels(prefs.sidebarWidth,260)),right:pixels(prefs.dockSizes?.right?.width,310)};
  const result={} as DockRatios;
  for(const p of POSITIONS){
    const axis=horizontal(p)?['top','bottom'] as const:['left','right'] as const,extent=horizontal(p)?bounds.height:bounds.width;
    const center=Math.max(horizontal(p)?320:240,extent-axis.reduce((sum,id)=>sum+(opened(layout,id)?desired[id]:0),0));
    result[p]=validRatio(prefs.dockRatios?.[p])?prefs.dockRatios![p]!:Math.min(100,desired[p]/(opened(layout,p)?center:Math.max(horizontal(p)?320:240,extent-desired[p])));
  }
  return result;
}
function allocate(extent:number,ids:DockPosition[],ratios:DockRatios,minimums:DockTracks,centerMin:number):{values:Partial<DockTracks>;center:number;extent:number} {
  const total=Math.max(extent,centerMin+ids.reduce((n,p)=>n+minimums[p],0)),values:Partial<DockTracks>={},free=[...ids];let remaining=total;
  // Fix undersized tracks, then redistribute the remainder by the original
  // pane-to-data ratio. The preferred ratio survives a minimum-size clamp.
  for(;;){const scale=remaining/(1+free.reduce((n,p)=>n+ratios[p],0)),small=free.filter(p=>ratios[p]*scale<minimums[p]);if(!small.length)break;for(const p of small){values[p]=minimums[p];remaining-=minimums[p];free.splice(free.indexOf(p),1);}}
  let center=remaining/(1+free.reduce((n,p)=>n+ratios[p],0));
  if(center<centerMin){center=centerMin;const spare=remaining-center-free.reduce((n,p)=>n+minimums[p],0),weight=free.reduce((n,p)=>n+Math.max(0,ratios[p]*center-minimums[p]),0);for(const p of free)values[p]=minimums[p]+(weight?spare*Math.max(0,ratios[p]*center-minimums[p])/weight:spare/Math.max(1,free.length));}
  else for(const p of free)values[p]=ratios[p]*center;
  return {values,center,extent:total};
}
export function dockGeometry(bounds:DockBounds,layout:DockLayout,ratios:DockRatios):DockGeometry {
  const minimums=dockMinimums(layout),min=centerMinimum(layout),safe=Object.fromEntries(POSITIONS.map(p=>[p,validRatio(ratios[p])?ratios[p]:.4])) as DockRatios;
  const x=allocate(bounds.width,['left','right'].filter(p=>opened(layout,p as DockPosition)) as DockPosition[],safe,minimums,min.width),y=allocate(bounds.height,['top','bottom'].filter(p=>opened(layout,p as DockPosition)) as DockPosition[],safe,minimums,min.height);
  return {width:x.extent,height:y.extent,tracks:{top:0,bottom:0,left:0,right:0,...x.values,...y.values},centerWidth:x.center,centerHeight:y.center,minimums};
}
export function geometryFromTracks(bounds:DockBounds,tracks:DockTracks,minimums:DockTracks):DockGeometry {
  return {...bounds,tracks,minimums,centerWidth:bounds.width-tracks.left-tracks.right,centerHeight:bounds.height-tracks.top-tracks.bottom};
}
export function ratiosFromGeometry(g:DockGeometry,previous:DockRatios):DockRatios {
  const ratios={...previous};for(const p of POSITIONS)if(g.tracks[p]>0)ratios[p]=g.tracks[p]/(horizontal(p)?g.centerHeight:g.centerWidth);return ratios;
}
export const crossWidthDonor=(g:DockGeometry,edge:'left'|'right'):DockPosition|null=>g.tracks[edge]?edge:g.tracks[edge==='left'?'right':'left']?edge==='left'?'right':'left':null;
