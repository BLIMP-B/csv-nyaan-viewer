import type { ChartSpec } from './chart-settings';
export interface TableData { headers: string[]; rows: string[][]; total?: number; truncated?: boolean; inferred?: string[] }
export interface MergeBlock { tutorial?:boolean;id: string; name: string; kind?: 'text'|'table'|'chart'; table: TableData; content?: string; image?: string; chart?: ChartSpec }
export function numeric(value: string): number | null {
  const raw=value.trim().replace(/^[￥¥$€£]\s*/, '').replace(/%$/,'').trim();
  const text=/^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(raw)?raw.replaceAll(',',''):raw; if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) return null;
  const n = Number(text); return Number.isFinite(n) ? n : null;
}
export function chartData(table: TableData) {
  const columns = table.headers.map((_, c) => c).filter(c => table.rows.some(r => numeric(r[c] || '') !== null) && table.rows.every(r => !r[c]?.trim() || numeric(r[c]) !== null));
  const labelColumn = table.headers.map((_,c)=>c).find(c => !columns.includes(c));
  const labels = table.rows.map((r,i) => labelColumn === undefined ? String(i+1) : r[labelColumn] || String(i+1));
  return { labels, series: columns.map(c => ({ label: table.headers[c] || `列${c+1}`, values: table.rows.map(row => numeric(row[c] || '')) })), precisionWarning: table.rows.some(r => r.some(v => numeric(v) !== null && v.replace(/[^0-9]/g,'').length > 15)) };
}
export function mergeTables(blocks: MergeBlock[], direction: 'rows' | 'columns', alignHeaders: boolean): TableData {
  if (!blocks.length) return { headers: [], rows: [] };
  if (direction === 'columns') {
    const length = Math.max(...blocks.map(b => b.table.rows.length));
    const headers = blocks.flatMap(b => b.table.headers);
    return { headers, rows: Array.from({ length }, (_, r) => blocks.flatMap(b => b.table.headers.map((_,c) => b.table.rows[r]?.[c] || ''))) };
  }
  if (alignHeaders) {
    // Duplicate header names remain distinct by occurrence, not collapsed.
    const keyFor = (headers: string[]) => { const seen = new Map<string,number>(); return headers.map(h => { const n = seen.get(h) || 0; seen.set(h,n+1); return h+'\u0000'+n; }); };
    const keys: string[] = [], labels = new Map<string,string>();
    for (const block of blocks) keyFor(block.table.headers).forEach((key,c) => { if (!labels.has(key)) { keys.push(key); labels.set(key,block.table.headers[c]); } });
    return { headers: keys.map(k=>labels.get(k)!), rows: blocks.flatMap(b => { const source = keyFor(b.table.headers); return b.table.rows.map(row => keys.map(key => { const c = source.indexOf(key); return c < 0 ? '' : row[c] || ''; })); }) };
  }
  const width = Math.max(...blocks.map(b => b.table.headers.length));
  const headers = Array.from({length:width},(_,c) => blocks[0].table.headers[c] || `列${c+1}`);
  return { headers, rows: blocks.flatMap(b => b.table.rows.map(row => headers.map((_,c) => row[c] || ''))) };
}

export function selectionSize(ranges: {row0:number;row1:number;col0:number;col1:number}[]) {
  const points=[...new Set(ranges.flatMap(s=>[Math.min(s.row0,s.row1),Math.max(s.row0,s.row1)+1]))].sort((a,b)=>a-b);
  let count=0;
  for(let i=0;i<points.length-1;i++){
    const r=points[i],intervals=ranges.filter(s=>r>=Math.min(s.row0,s.row1)&&r<=Math.max(s.row0,s.row1)).map(s=>[Math.min(s.col0,s.col1),Math.max(s.col0,s.col1)+1]).sort((a,b)=>a[0]-b[0]);
    let start=-1,end=-1,width=0;for(const interval of intervals){if(interval[0]>end){if(start>=0)width+=end-start;[start,end]=interval;}else end=Math.max(end,interval[1]);}if(start>=0)width+=end-start;count+=(points[i+1]-r)*width;
  }
  return count;
}

export function tableMarkdown(table:TableData){
  const esc=(v:string)=>v.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\\','\\\\').replaceAll('|','\\|').replace(/\r\n|\r|\n/g,'<br>').replaceAll('`','\\`').replaceAll('*','\\*').replaceAll('_','\\_');
  return [table.headers,...table.rows].map((row,i)=>'| '+row.map(esc).join(' | ')+' |'+(i===0?'\n| '+row.map(()=>'---').join(' | ')+' |':'')).join('\n');
}
export function blockMarkdown(block:MergeBlock,assetBase='merged-assets'){
  if(block.kind==='chart')return '!['+block.name.replace(/[\[\]\r\n]/g,' ')+']('+encodeURIComponent(assetBase)+'/chart-'+block.id+'.png)';
  return block.content!==undefined?block.content:block.kind==='text'?'':tableMarkdown(block.table);
}
export function documentMarkdown(blocks:MergeBlock[],assetBase='merged-assets'){return blocks.map(b=>blockMarkdown(b,assetBase)).join('\n\n')+'\n';}
