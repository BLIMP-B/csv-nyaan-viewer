import type {Tab,Selection} from './types';
import type {AnalysisSource,SheetView,SavedTable} from './analysis-types';
export function viewOf(tab:Tab):SheetView {
  const {filters,sorts,hidden,hiddenRows,excludedRows,deletedColumns,columnOrder,columnFilter,frozen,widths,selection,ranges,selectionExplicit,scrollTop,scrollLeft}=tab;
  return {filters,sorts,hidden,hiddenRows,excludedRows:excludedRows||tab.meta.excludedRows,deletedColumns,columnOrder,columnFilter,frozen,widths,selection,ranges,selectionExplicit,scrollTop,scrollLeft};
}
export function selectionSources(tabs:Tab[]):AnalysisSource[]{
  return tabs.filter(t=>['csv','excel'].includes(t.meta.kind)).flatMap(tab=>{
    const sheets={...tab.sheetViews,[tab.meta.sheet||'']:viewOf(tab)};
    return Object.entries(sheets).flatMap(([sheet,view])=>view.selectionExplicit&&view.selection?[{id:tab.meta.id,sheet:sheet||undefined,name:(tab.meta.name||tab.meta.path.split(/[\\/]/).pop()||'')+' | '+(sheet||'CSV'),view,selections:view.ranges?.length?view.ranges:[view.selection]}]:[]);
  });
}
export function allSources(tabs:Tab[]):AnalysisSource[]{return tabs.filter(t=>['csv','excel'].includes(t.meta.kind)).flatMap(t=>(t.meta.sheets||['']).map(sheet=>({id:t.meta.id,sheet:sheet||undefined,name:(t.meta.name||t.meta.path.split(/[\\/]/).pop()||'')+' | '+(sheet||'CSV'),all:true})));}
export function letters(c:number){let name='';for(c++;c;c=Math.floor((c-1)/26))name=String.fromCharCode(65+(c-1)%26)+name;return name;}
export function rangeAddress(ranges:Selection[],headerRows:number){return ranges.map(r=>letters(Math.min(r.col0,r.col1))+(Math.min(r.row0,r.row1)+headerRows+1)+':'+letters(Math.max(r.col0,r.col1))+(Math.max(r.row0,r.row1)+headerRows+1)).join(', ');}
export function tableColor(sequence:number){const hue=(sequence*137.508+205)%360,s=.66,l=.53,c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs(hue/60%2-1)),m=l-c/2,v=hue<60?[c,x,0]:hue<120?[x,c,0]:hue<180?[0,c,x]:hue<240?[0,x,c]:hue<300?[x,0,c]:[c,0,x];return '#'+v.map(n=>Math.round((n+m)*255).toString(16).padStart(2,'0')).join('');}
export function cellTables(tables:SavedTable[],fileId:string,sheet:string|undefined,source:number,column:number){return tables.filter(t=>{if(t.fileId!==fileId||t.sheet!==sheet)return false;const r=t.sourceRows.indexOf(source);return r>=0&&t.mask[r]?.includes(column);});}
