import type {Preferences} from './types';
export const POSITIONS=['top','bottom','left','right'] as const;
export type DockPosition=typeof POSITIONS[number];
export const PANES=['workspace','selection','multivariate','chart','table','merge'] as const;
export type PaneId=typeof PANES[number];
export const PANE_INFO:Record<PaneId,{name:string;label:string;scope?:string}>={
  workspace:{name:'ワークスペース',label:'ワークスペース'},selection:{name:'変量分析（選択範囲）',label:'変量分析',scope:'選択範囲'},
  multivariate:{name:'多変量分析（ファイル全域）',label:'多変量分析',scope:'ファイル全域'},chart:{name:'グラフプレビュー',label:'グラフプレビュー'},
  table:{name:'テーブルプレビュー',label:'テーブルプレビュー'},merge:{name:'ファイル結合',label:'ファイル結合'}
};
export interface DockLayout {groups:Record<DockPosition,PaneId[]>;active:Partial<Record<DockPosition,PaneId>>;open:PaneId[]}
export const isPane=(id:unknown):id is PaneId=>typeof id==='string'&&(PANES as readonly string[]).includes(id);
export const isPosition=(value:unknown):value is DockPosition=>typeof value==='string'&&(POSITIONS as readonly string[]).includes(value);
export function defaultDockLayout(prefs:Preferences={}):DockLayout {
  const groups:DockLayout['groups']={top:[],bottom:[],left:['workspace','selection','multivariate'],right:[]};
  groups[isPosition(prefs.previewPosition)?prefs.previewPosition:'bottom'].push('chart','table');
  groups[isPosition(prefs.mergePosition)?prefs.mergePosition:'right'].push('merge');
  return {groups,active:Object.fromEntries(POSITIONS.filter(p=>groups[p].length).map(p=>[p,groups[p][0]])),open:[]};
}
export function normalizeDockLayout(value:unknown,prefs:Preferences={}):DockLayout {
  const fallback=defaultDockLayout(prefs);if(!value||typeof value!=='object')return fallback;
  const input=value as Partial<DockLayout>,groups:DockLayout['groups']={top:[],bottom:[],left:[],right:[]},seen=new Set<PaneId>();
  for(const p of POSITIONS)for(const id of Array.isArray(input.groups?.[p])?input.groups![p]:[])if(isPane(id)&&!seen.has(id)){groups[p].push(id);seen.add(id);}
  for(const p of POSITIONS)for(const id of fallback.groups[p])if(!seen.has(id)){groups[p].push(id);seen.add(id);}
  const open=Array.isArray(input.open)?[...new Set(input.open.filter(isPane))]:[];
  const active:DockLayout['active']={};for(const p of POSITIONS){const id=input.active?.[p];active[p]=id&&groups[p].includes(id)?id:groups[p].find(id=>open.includes(id))||groups[p][0];}
  return {groups,active,open};
}
export const panePosition=(layout:DockLayout,id:PaneId):DockPosition=>POSITIONS.find(p=>layout.groups[p].includes(id))!;
export function showPane(layout:DockLayout,id:PaneId,focus=true):DockLayout {
  const position=panePosition(layout,id),open=layout.open.includes(id)?layout.open:[...layout.open,id];
  return {...layout,open,active:focus||!layout.active[position]||!open.includes(layout.active[position]!)?{...layout.active,[position]:id}:layout.active};
}
export function closePane(layout:DockLayout,id:PaneId):DockLayout {
  const open=layout.open.filter(p=>p!==id),position=panePosition(layout,id),active={...layout.active};
  if(active[position]===id)active[position]=layout.groups[position].find(p=>open.includes(p))||id;
  return {...layout,open,active};
}
export const togglePane=(layout:DockLayout,id:PaneId)=>layout.open.includes(id)&&layout.active[panePosition(layout,id)]===id?closePane(layout,id):showPane(layout,id);
export function movePane(layout:DockLayout,id:PaneId,position:DockPosition,before?:PaneId):DockLayout {
  if(before===id&&panePosition(layout,id)===position)return showPane(layout,id);
  const source=panePosition(layout,id),groups={...layout.groups};for(const p of POSITIONS)groups[p]=groups[p].filter(pane=>pane!==id);
  const index=before?groups[position].indexOf(before):-1;groups[position].splice(index<0?groups[position].length:index,0,id);
  const active={...layout.active,[position]:id};if(source!==position&&active[source]===id)active[source]=groups[source].find(p=>layout.open.includes(p))||groups[source][0];
  return {...layout,groups,active,open:layout.open.includes(id)?layout.open:[...layout.open,id]};
}
