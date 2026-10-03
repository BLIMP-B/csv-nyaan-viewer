import {Docking} from './docking';
import {useDocking} from './use-docking';
import {Tutorial} from './tutorial';
import {useTutorial} from './use-tutorial';
import {panePosition,showPane,closePane,togglePane,type PaneId} from './dock-state';
import {chartPNG} from './chart-export';
import {ImageExportThemeContext,resolveImageTheme,type ImageExportTheme} from './export-theme';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { version } from '../package.json';
import { FileSpreadsheet, FolderOpen, Search, Filter as FilterIcon, ArrowDownUp, Download, Moon, Sun, X, Plus, ChevronDown, FileText, LockKeyhole, Pin, Eye, Copy, RotateCw, Settings, List, Check, PanelLeftClose, PanelLeftOpen, ArrowUpRight, ChevronLeft, ChevronRight, Info, BarChart3, Combine, Share2, ArrowUp, ArrowDown, RotateCcw, EyeOff, Trash2, FlaskConical } from 'lucide-react';
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
import type { Meta, Row, Filter, Sort, Selection, Tab, Preferences } from './types';
import { Sharing } from './sharing';
import {AccountIcons,SConnections,SSharing} from './s-sharing';
import { About } from './about';
import { AnalysisPanel } from './analysis-panel';
import { defaultChartSettings, cloneChartSpec } from './chart-settings';
import { Dashboard, MergePanel } from './panels';
import { GridHead } from './grid-head';
import { WorksheetTabs } from './worksheet-tabs';
import { TablePreview } from './table-preview';
import { viewOf,rangeAddress,tableColor } from './table-state';
import type {SavedTable} from './analysis-types';
import { moveSelection } from './grid-selection';
import { recommendChart } from './chart-recommendation';
import { chartData, selectionSize, mergeTables, type TableData, type MergeBlock } from './data';
import './style.css';

const nameOf = (path: string) => path.split(/[\\/]/).pop() || path;
const count = (n: number) => n.toLocaleString('ja-JP');
const bytes = (n: number) => n < 1024 ? n + ' B' : n < 1024 ** 2 ? (n / 1024).toFixed(1) + ' KB' : n < 1024 ** 3 ? (n / 1024 ** 2).toFixed(1) + ' MB' : (n / 1024 ** 3).toFixed(2) + ' GB';
const letter = (c: number) => { let value = ''; for (c++; c > 0; c = Math.floor((c - 1) / 26)) value = String.fromCharCode(65 + (c - 1) % 26) + value; return value; };
const ENCODINGS: [string, string][] = [['auto','自動判定'],['utf8','UTF-8'],['cp932','Shift_JIS / CP932'],['euc-jp','EUC-JP'],['utf16le','UTF-16 LE'],['utf16be','UTF-16 BE'],['utf32le','UTF-32 LE'],['utf32be','UTF-32 BE'],['windows1252','Windows-1252'],['latin1','ISO-8859-1']];
const MODES = [['contains','含む'],['notContains','含まない'],['equals','一致する'],['starts','で始まる'],['ends','で終わる'],['regex','正規表現'],['empty','空欄'],['notEmpty','空欄以外'],['gt','より大きい（数値）'],['gte','以上（数値）'],['lt','より小さい（数値）'],['lte','以下（数値）']];
const markdown = new MarkdownIt({ html: false, linkify: false, breaks: false });
// Remote media and navigation are disabled; content stays local.
markdown.renderer.rules.image = (tokens, i) => /^data:image\/(png|jpeg|gif|webp);base64,/.test(tokens[i].attrGet('src')||'') ? `<img alt="${markdown.utils.escapeHtml(tokens[i].content)}" src="${tokens[i].attrGet('src')}">` : `<span class="image-placeholder">[画像: ${markdown.utils.escapeHtml(tokens[i].content)}]</span>`;
markdown.renderer.rules.link_open = () => '<span class="md-link">';
markdown.renderer.rules.link_close = () => '</span>';

function App() {
  const [appIcon,setAppIcon]=useState<string|null>(null);
  const [savedTables,setSavedTables]=useState<SavedTable[]>([]),[tableMenu,setTableMenu]=useState<{ids:string[];x:number;y:number}|null>(null);
  const tableSequence=useRef(0);
  const [urlValue,setUrlValue]=useState('');
  const [headSelection,setHeadSelection]=useState<{axis:'row'|'column';indices:number[]}|null>(null);
  const [headMenu,setHeadMenu]=useState<{axis:'row'|'column';indices:number[];x:number;y:number}|null>(null),[headTools,setHeadTools]=useState(false),[headFilter,setHeadFilter]=useState('');
  const headerFocus=useRef<{row:number;column:number}|null>(null);
  const headDrag=useRef<{axis:'row'|'column';start:number;end:number;moved:boolean;add:boolean;base:Selection[]}|null>(null);
  const [chartSettings,setChartSettings]=useState(defaultChartSettings);
  const [chartType,setChartType]=useState('bar'),[mergeDirection,setMergeDirection]=useState<'rows'|'columns'>('rows'),[mergeAlign,setMergeAlign]=useState(true),[mergeFormat,setMergeFormat]=useState('csv');
  const [previewTable,setPreviewTable]=useState<TableData|null>(null),[blocks,setBlocks]=useState<MergeBlock[]>([]);
  const saveChartRef=useRef<(()=>void)|null>(null),captureChartRef=useRef<(()=>string|null)|null>(null);
  const [sharingDocument,setSharingDocument]=useState<MergeBlock[]|undefined>();
  const [mergeView,setMergeView]=useState<'preview'|'source'>('preview');
  const [markdownSelection,setMarkdownSelection]=useState<TableData|null>(null);
  const markdownAnchor=useRef<{table:HTMLTableElement;row:number;col:number}|null>(null);
  const [shareTable,setShareTable]=useState<TableData|null>(null);
  const [tabs, setTabs] = useState<Tab[]>([]), [activeId, setActiveId] = useState('');
  const [prefsReady,setPrefsReady]=useState(false);
  const [prefs, setPrefs] = useState<Preferences>({ theme: 'light', imageExportTheme:'light', fontSize: 13, fontFamily: 'Segoe UI', accent: '#0f6cbd' });
  const [busy, setBusy] = useState(''), [progress, setProgress] = useState(0), [error, setError] = useState(''), [toast, setToast] = useState('');
  const [fileMenu, setFileMenu] = useState(false), [modal, setModal] = useState('');
  const [rows, setRows] = useState<Row[]>([]), [top, setTop] = useState(0), [left, setLeft] = useState(0), [height, setHeight] = useState(500), [gridWidth, setGridWidth] = useState(900);
  const [cellValue, setCellValue] = useState(''), [showFind, setShowFind] = useState(false), [query, setQuery] = useState(''), [caseSensitive, setCaseSensitive] = useState(false), [regex, setRegex] = useState(false), [whole, setWhole] = useState(false);
  const [headerCellValue, setHeaderCellValue] = useState('');
  const [draftFilters, setDraftFilters] = useState<Filter[]>([]), [draftSorts, setDraftSorts] = useState<Sort[]>([]);
  const [encoding, setEncoding] = useState('auto'), [delimiter, setDelimiter] = useState('auto'), [customDelimiter, setCustomDelimiter] = useState(''), [kind, setKind] = useState('auto');
  const [exportFormat, setExportFormat] = useState('csv'), [exportScope, setExportScope] = useState('view'), [exportEncoding, setExportEncoding] = useState('utf8'), [exportBom, setExportBom] = useState(false), [markdownTable, setMarkdownTable] = useState(true);
  const [gotoRow, setGotoRow] = useState('1'), [gotoCol, setGotoCol] = useState('1'), [sourceText, setSourceText] = useState('');
  const [localImages,setLocalImages]=useState<Record<string,string>>({});
  const dragPoint=useRef({x:0,y:0});
  const restoredPreview=useRef<{id:string;selection:string}|null>(null);
  const gridRef = useRef<HTMLDivElement>(null), findRef = useRef<HTMLInputElement>(null), dragging = useRef(false), pageSequence = useRef(0), commands = useRef<(command: string) => void>(() => {});
  const selectedTab = tabs.find(t => t.meta.id === activeId), tabRef = useRef<Tab | undefined>(selectedTab); tabRef.current = selectedTab;
  const [dockLayout,setDockLayout,dockReady]=useDocking(setError);
  const sidebar=dockLayout.groups.left.length?dockLayout.groups.left.some(id=>dockLayout.open.includes(id)):dockLayout.open.includes('workspace');
  function setSidebar(value:boolean|((open:boolean)=>boolean)){setDockLayout(current=>{const position=current.groups.left.length?'left':panePosition(current,'workspace'),ids=current.groups[position],opened=ids.some(id=>current.open.includes(id)),next=typeof value==='function'?value(opened):value,id=current.active[position]||ids[0];return next?showPane(current,id):closePane(current,id);});}
  function setPreviewOpen(value:boolean){setDockLayout(current=>value?showPane(current,'chart',false):closePane(current,'chart'));}
  function setMergeOpen(value:boolean){setDockLayout(current=>value?showPane(current,'merge'):closePane(current,'merge'));}
  const toggleDock=(id:PaneId)=>setDockLayout(current=>togglePane(current,id));
  const setPreviewPage=(_value:'table')=>setDockLayout(current=>showPane(current,'table'));
  const meta = selectedTab?.meta, isCsv = meta?.kind === 'csv'||meta?.kind==='excel', rowHeight = Math.max(26, (prefs.fontSize || 13) + 14);
  // Keep raw heading records separate from the alphabet strip. A long heading
  // section scrolls independently so it cannot consume the whole data viewport.
  const headerRecordHeight = isCsv ? Math.min((meta?.headerRows || 0) * rowHeight, Math.max(rowHeight, Math.floor((height - 32) / 2 / rowHeight) * rowHeight)) : 0;
  const headerHeight = isCsv ? 32 + headerRecordHeight : 0;
  const columns = useMemo(() => meta ? (selectedTab?.columnOrder?.length?selectedTab.columnOrder:Array.from({ length: meta.columns }, (_, c) => c)).filter(c=>!selectedTab?.deletedColumns?.includes(c)&&(!selectedTab?.columnFilter||selectedTab.columnFilter.includes(c))) : [], [meta?.columns, selectedTab?.deletedColumns,selectedTab?.columnOrder,selectedTab?.columnFilter]);
  const tableIndex=useMemo(()=>{const index=new Map<number,Map<number,SavedTable[]>>();for(const table of savedTables){if(table.fileId!==meta?.id||table.sheet!==meta?.sheet)continue;table.sourceRows.forEach((source,r)=>{let row=index.get(source);if(!row){row=new Map();index.set(source,row);}for(const c of table.mask[r])row.set(c,[...(row.get(c)||[]),table]);});}return index;},[savedTables,meta?.id,meta?.sheet]);
  const tablesForCell=(source:number,column:number)=>tableIndex.get(source)?.get(column)||[];
  function showTableMenu(source:number,column:number,event:React.MouseEvent){const found=tablesForCell(source,column);if(found.length){event.preventDefault();setTableMenu({ids:found.map(t=>t.id),x:Math.min(event.clientX,window.innerWidth-260),y:Math.min(event.clientY,window.innerHeight-180)});}}
  const widthOf = (c: number) => selectedTab?.widths[c] || (isCsv ? 180 : 1400);
  const positions = useMemo(() => { let x = 54; return columns.map(c => { const p = { c, x, w: widthOf(c) }; x += p.w; return p; }); }, [columns, selectedTab?.widths, isCsv]);
  const totalWidth = positions.length ? positions[positions.length - 1].x + positions[positions.length - 1].w : 54;
  const frozenColumns = columns.slice(0, selectedTab?.frozen || 0), frozenWidth = frozenColumns.reduce((sum, c) => sum + widthOf(c), 54);
  const visibleColumns = positions.filter(p => frozenColumns.includes(p.c) || (p.x + p.w >= left && p.x <= left + gridWidth + 200));
  const start = Math.max(0, Math.floor(top / rowHeight) - 8), limit = Math.min(250, Math.ceil(height / rowHeight) + 20);
  const scrollScale=Math.max(1,((meta?.count||0)*rowHeight+headerHeight-height)/Math.max(1,24000000-height));
  const patchTab = (patch: Partial<Tab>, id = activeId) => setTabs(all => all.map(t => t.meta.id === id ? { ...t, ...patch } : t));
  const notify = (message: string) => { setToast(message); setTimeout(() => setToast(''), 4000); };
  const execute = async <T,>(label: string, task: () => Promise<T>): Promise<T | undefined> => { setBusy(label); setProgress(0); setError(''); try { return await task(); } catch (e) { setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : String(e)); } finally { setBusy(''); } };
  const savePrefs = (patch: Preferences) => { setPrefs(p => ({ ...p, ...patch })); window.csv.preferences(patch).catch(e => setError(String(e))); };
  async function openPaths(paths: string[], options: Record<string, unknown> = {}) {
    await execute('ファイルを読み込み中', async () => {
      for (const path of paths) {
        const loaded = await window.csv.open(path, options);
        setTabs(all => [...all, { meta: loaded, filters: [], sorts: [], hidden: [], frozen: 0, widths: {}, ranges: [], selection: loaded.count ? { row0: 0, row1: 0, col0: 0, col1: 0 } : null, scrollTop: 0, scrollLeft: 0, preview: loaded.kind === 'markdown' }]); setActiveId(loaded.id);
      }
      const settings = await window.csv.preferences(); setPrefs(p => ({ ...p, recent: settings.recent }));
    });
  }
  async function openUrl(url=urlValue){
    if(!url.trim())return;
    await execute('オンラインファイルを読み込み中',async()=>{const loaded=await window.csv.openUrl(url.trim());setTabs(all=>[...all,{meta:loaded,filters:[],sorts:[],hidden:[],frozen:0,widths:{},selection:loaded.count?{row0:0,row1:0,col0:0,col1:0}:null,ranges:[],scrollTop:0,scrollLeft:0,preview:false}]);setActiveId(loaded.id);setUrlValue('');});
  }
  const openDialog = async () => { setFileMenu(false); const paths = await window.csv.dialog(); if (paths.length) await openPaths(paths); };
  async function reload(options: Record<string, unknown> = {}) {
    const tab = tabRef.current; if (!tab) return;
    await execute('再読み込み中', async () => {
      const loaded = tab.meta.sourceUrl?await window.csv.openUrl(tab.meta.sourceUrl):await window.csv.open(tab.meta.path, { encoding: tab.meta.encoding, delimiter: tab.meta.delimiter, kind: tab.meta.kind,tutorial:tab.meta.tutorial, headerRows: tab.meta.requestedHeaderRows??tab.meta.headerRows,sheet:tab.meta.sheet, ...options });
      await window.csv.close(tab.meta.id);
      setTabs(all => all.map(t => t.meta.id === tab.meta.id ? { ...t,sheetViews:{},selectionExplicit:false, meta: loaded, filters: [], sorts: [], hidden:[],hiddenRows:[],deletedColumns:[],columnOrder:[],columnFilter:undefined,ranges: [], selection: loaded.count ? { row0: 0, row1: 0, col0: 0, col1: 0 } : null, scrollTop: 0, scrollLeft: 0, preview: loaded.kind === 'markdown' } : t)); setActiveId(loaded.id); setModal('');
    });
  }
  function close(id = activeId) { const next = tabs.filter(t => t.meta.id !== id); setTabs(next); if (activeId === id) setActiveId(next.at(-1)?.meta.id || ''); window.csv.close(id); }
  async function configure(patch: { filters?: Filter[]; sorts?: Sort[]; headerRows?: number; sheet?:string; excludedRows?:number[] }) {
    const tab = tabRef.current; if (!tab) return;
    await execute('表示条件を適用中', async () => {
      const savedView=patch.sheet?tab.sheetViews?.[patch.sheet]:undefined;
      const changed = await window.csv.request<Meta>(tab.meta.id, 'configure', {...patch,...(patch.sheet?{filters:savedView?.filters||[],sorts:savedView?.sorts||[],excludedRows:savedView?.excludedRows||[]}: {})});
      if (patch.sheet) { setRows([]); setHeadSelection(null); setTableMenu(null); setHeadMenu(null); headerFocus.current = null; }
      patchTab({ ...patch, meta: { ...tab.meta,...changed, id: tab.meta.id },excludedRows:changed.excludedRows,...(patch.headerRows!==undefined?{sheetViews:{}}:{}), ranges: [], selection: changed.count ? { row0: 0, row1: 0, col0: 0, col1: 0 } : null,selectionExplicit:false, scrollTop: 0,...(patch.sheet?{filters:[],sorts:[],hidden:[],hiddenRows:[],deletedColumns:[],columnOrder:[],columnFilter:undefined,frozen:0,widths:{},scrollLeft:0,...savedView,sheetViews:{...tab.sheetViews,[tab.meta.sheet||'']:viewOf(tab)}}:{}) }, tab.meta.id); setModal(''); gridRef.current?.scrollTo({ top: 0, left: patch.sheet ? 0 : gridRef.current.scrollLeft });
    });
  }
  async function copy(asCsv = false) {
    const tab = tabRef.current; if (!tab?.selection) return;
    await execute('選択範囲をコピー中', async () => { let text:string; if((tab.ranges?.length||0)>1){const table=await window.csv.request<TableData>(tab.meta.id,'selection',{selections:tab.ranges,maxCells:100000,columns});const separator=asCsv?',':'\t';text=table.rows.map(row=>row.map(v=>v.includes(separator)||/[\r\n"]/.test(v)?'"'+v.replaceAll('"','""')+'"':v).join(separator)).join('\r\n');}else text = await window.csv.request<string>(tab.meta.id, 'copy', { selection: tab.selection, delimiter: asCsv ? ',' : '\t',columns }); await window.csv.clipboard(text); notify('選択範囲をコピーしました'); });
  }
  const revealCell = (r: number, c: number) => {
    if (!meta?.count) return;
    const row = Math.max(0, Math.min(meta.count - 1, r)), col = Math.max(0, Math.min(meta.columns - 1, c));
    patchTab({ ranges: [], selection: { row0: row, row1: row, col0: col, col1: col }, hidden: selectedTab!.hidden.filter(v => v !== col), preview: false });
    if (gridRef.current) { gridRef.current.scrollTop = Math.min(row * rowHeight/scrollScale, Math.max(0, (meta.count * rowHeight - height + headerHeight)/scrollScale)); const p = positions.find(v => v.c === col); if (p && !frozenColumns.includes(col)) gridRef.current.scrollLeft = Math.max(0, p.x - frozenWidth); gridRef.current.focus(); }
  };
  async function find(backwards = false) {
    const tab = tabRef.current; if (!tab || !query) return;
    await execute('検索中', async () => { const result = await window.csv.request<{ row: number; column: number } | null>(tab.meta.id, 'find', { query: { value: query, caseSensitive, regex, whole }, after: { row: tab.selection?.row1 || 0, column: tab.selection?.col1 ?? -1 }, backwards }); if (result) revealCell(result.row, result.column); else notify('一致するセルはありません'); });
  }
  function showModal(value: string) {
    if (value === 'filters') setDraftFilters(selectedTab?.filters.length ? selectedTab.filters.map(f => ({ ...f })) : [{ column: -1, mode: 'contains', value: '' }]);
    if (value === 'sorts') setDraftSorts(selectedTab?.sorts.length ? selectedTab.sorts.map(s => ({ ...s })) : [{ column: selectedTab?.selection?.col1 || 0, direction: 'asc', mode: 'text' }]);
    if (value === 'reading') { setEncoding(meta?.encoding || 'auto'); setDelimiter(['auto', ',', '\t', ';', '|'].includes(meta?.delimiter || '') ? meta!.delimiter : 'custom'); setCustomDelimiter(meta?.delimiter || ''); setKind(meta?.kind || 'auto'); }
    if (value === 'export') { setExportFormat(isCsv ? 'csv' : meta?.kind === 'markdown' ? 'txt' : 'md'); }
    setModal(value); setFileMenu(false);
  }
  async function exportFile() {
    if (!meta) return;
    await execute('エクスポート中', async () => { const result = await window.csv.export(meta.id, { format: exportFormat, scope: exportScope, selection: selectedTab?.selection, selections: selectedTab?.ranges, encoding: exportEncoding, bom: exportBom, markdownTable,columns }); if (result) { setModal(''); notify(`${nameOf(result.path)} を出力しました`); } });
  }
  commands.current = command => {
    if (busy) return;
    switch (command) {
      case 'open': openDialog(); break; case 'reload': reload(); break; case 'close': close(); break;
      case 'copy': if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) document.execCommand('copy'); else copy(); break;
      case 'selectAll': if (meta?.count) patchTab({selectionExplicit:true, ranges: [], selection: { row0: 0, row1: meta.count - 1, col0: 0, col1: meta.columns - 1 } }); break;
      case 'find': setShowFind(true); setTimeout(() => findRef.current?.focus(), 20); break;
      case 'next': find(); break; case 'previous': find(true); break;
      case 'connections': setShareTable(null);setSharingDocument(undefined);setModal('share');break;
      case 'preview': toggleDock('chart'); break; case 'merge': toggleDock('merge'); break; case 'saveChart': saveChartRef.current?.(); break; case 'share': shareCurrent(); break;
      case 'sShare': prepareShare('sShare'); break; case 'sConnections': setModal('sConnections'); break;
      case 'goto': showModal('goto'); break; case 'export': if (meta) showModal('export'); break;
      case 'theme': savePrefs({ theme: prefs.theme === 'dark' ? 'light' : 'dark' }); break; case 'help': showModal('help'); break;
      case 'about': showModal('about'); break; case 'tutorial':tutorial.replay();break;
    }
  };
  useEffect(() => { window.csv.icon().then(setAppIcon).catch(()=>{});window.csv.preferences().then(p => {setPrefs(all => ({ ...all, ...p }));setPrefsReady(true);}).catch(e=>setError(String(e))); const a = window.csv.onCommand(c => commands.current(c)); const b = window.csv.onProgress(p => setProgress(p.value)); const c = window.csv.onPaths(paths => openPaths(paths)); return () => { a(); b(); c(); }; }, []);
  useEffect(() => { document.documentElement.dataset.theme = prefs.theme; document.documentElement.style.setProperty('--accent', prefs.accent || '#0f6cbd'); document.documentElement.style.setProperty('--cell-font', `${prefs.fontSize}px`); document.documentElement.style.setProperty('--cell-family', prefs.fontFamily || 'Segoe UI'); }, [prefs]);
  useLayoutEffect(() => { const grid = gridRef.current; if (!grid) return; const observer = new ResizeObserver(() => { setHeight(grid.clientHeight); setGridWidth(grid.clientWidth); }); observer.observe(grid); grid.scrollTop = selectedTab?.scrollTop || 0; grid.scrollLeft = selectedTab?.scrollLeft || 0; setTop(grid.scrollTop*scrollScale); setLeft(grid.scrollLeft); return () => observer.disconnect(); }, [activeId, selectedTab?.preview, dockLayout, prefs.dockSizes]);
  useEffect(() => { setRows([]); setSourceText('');setHeadSelection(null);setHeadMenu(null); setMarkdownSelection(null); setPreviewTable(null); pageSequence.current++; }, [activeId]);
  useEffect(() => {
    if (!meta || selectedTab?.preview) return;
    const sequence = ++pageSequence.current; let alive = true;
    const timer = setTimeout(() => window.csv.request<{ rows: Row[] }>(meta.id, 'page', { start, limit }).then(result => { if (alive && sequence === pageSequence.current) setRows(result.rows); }).catch(e => { if (alive) setError(String(e)); }), 30);
    return () => { alive = false; clearTimeout(timer); };
  }, [meta?.id, meta?.count, meta?.headers, start, limit, selectedTab?.preview]);
  useEffect(() => {
    if (!meta || !selectedTab?.preview) return;
    let alive = true;
    window.csv.request<string>(meta.id, 'text', {}).then(text => { if (alive) setSourceText(text); }).catch(e => { if (alive) { setError(String(e)); patchTab({ preview: false }, meta.id); } });
    return () => { alive = false; };
  }, [meta?.id, selectedTab?.preview]);
  useEffect(() => {
    if (!meta || !selectedTab?.selection) { setCellValue(''); return; }
    let alive = true; const selection = selectedTab.selection;
    window.csv.request<{ rows: Row[] }>(meta.id, 'page', { start: selection.row1, limit: 1 }).then(result => { if (alive) setCellValue(result.rows[0]?.cells[selection.col1] || ''); }).catch(() => {});
    return () => { alive = false; };
  }, [meta?.id, selectedTab?.selection, meta?.count]);
  useEffect(() => {const track=(e:PointerEvent)=>{dragPoint.current={x:e.clientX,y:e.clientY};};const timer=setInterval(()=>{const grid=gridRef.current;if(!dragging.current||!grid)return;const rect=grid.getBoundingClientRect(),{x,y}=dragPoint.current;if(x<rect.left||x>rect.right||y<rect.top-20||y>rect.bottom+20)return;const dy=y>rect.bottom-25?16:y<rect.top+headerHeight+25?-16:0,dx=x>rect.right-25?16:x<rect.left+35?-16:0;if(dx||dy)grid.scrollBy(dx,dy);},30);document.addEventListener('pointermove',track); const release = () => { dragging.current = false; }; document.addEventListener('pointerup', release); return () => {clearInterval(timer);document.removeEventListener('pointermove',track);document.removeEventListener('pointerup',release);}; }, [headerHeight]);
  useEffect(() => {
    const tab = selectedTab; if (!tab?.selection || tab.preview) return;
    let alive = true;
    const timer = setTimeout(() => window.csv.request<TableData>(tab.meta.id,'selection',{selection:tab.selection,selections:tab.ranges,maxCells:10000,sample:true,infer:true,columns}).then(table=>{if(alive){setPreviewTable(table);const restored=restoredPreview.current,skip=restored?.id===tab.meta.id&&restored.selection===JSON.stringify(tab.ranges?.length?tab.ranges:tab.selection);restoredPreview.current=null;if(!skip&&table.rows.length>=2&&chartData(table).series.length)setPreviewOpen(true);}}).catch(()=>{}),180);
    return ()=>{alive=false;clearTimeout(timer);};
  },[selectedTab?.selection,selectedTab?.ranges,meta?.id,meta?.count,selectedTab?.preview,columns]);
  async function addToMerge(all=false) {
    if(!meta)return;
    await execute('結合領域に追加中',async()=>{
      if(!all&&selectedTab?.preview&&markdownSelection){setBlocks(b=>[...b,{id:crypto.randomUUID(),tutorial:!!meta?.tutorial,name:nameOf(meta.path)+'（Markdown選択）',table:markdownSelection}]);setMergeOpen(true);return;}
      const selection=all?{row0:0,row1:meta.count-1,col0:0,col1:meta.columns-1}:selectedTab?.selection;
      if(!selection)return;
      const table=await window.csv.request<TableData>(meta.id,'selection',{selection,selections:all?undefined:selectedTab?.ranges,maxCells:100000,columns});
      if(blocks.reduce((sum,b)=>sum+b.table.rows.length*b.table.headers.length,0)+table.rows.length*table.headers.length>1000000)throw new Error('結合領域は合計100万セル以内です。');
      if(!['csv','excel'].includes(selectedTab?.meta.kind||'')){setBlocks(b=>[...b,{id:crypto.randomUUID(),tutorial:!!meta?.tutorial,kind:'text',content:table.rows.map(r=>r[0]||'').join('\n'),name:nameOf(meta.path)+(all?'（全体）':'（選択）'),table:{headers:[],rows:[]}}]);}else setBlocks(b=>[...b,{id:crypto.randomUUID(),tutorial:!!meta?.tutorial,kind:'table',name:nameOf(meta.path)+(all?'（全体）':'（選択）'),table}]);setMergeOpen(true);
    });
  }
  const shareCurrent=()=>prepareShare('share');
  async function prepareShare(target:'share'|'sShare') {
    setSharingDocument(undefined);
    if(!meta){if(blocks.length){setShareTable(mergeTables(blocks.filter(b=>!b.kind||b.kind==='table'),'rows',true));setSharingDocument(documentForExport());setModal(target);}return;}
    await execute('共有データを準備中',async()=>{if(selectedTab?.preview&&markdownSelection){setShareTable(markdownSelection);setModal(target);return;}const selection=selectedTab?.selection||{row0:0,row1:meta.count-1,col0:0,col1:meta.columns-1}; const table=await window.csv.request<TableData>(meta.id,'selection',{selection,selections:selectedTab?.ranges,maxCells:100000,columns});setShareTable(table);setModal(target);});
  }
  function exportMerged(table:TableData,format:string){execute('結合データを出力中',async()=>{const result=await window.csv.saveTable(table,format);if(result)notify(nameOf(result.path)+' を出力しました');});}

  function deleteSavedTable(id:string){setSavedTables(ts=>ts.filter(t=>t.id!==id));setTableMenu(null);}
  async function createSavedTable(id=activeId,sheet=selectedTab?.meta.sheet,address?:string){
    const tab=tabs.find(t=>t.meta.id===id);if(!tab||!['csv','excel'].includes(tab.meta.kind))throw Error('CSVまたはExcelの範囲を指定してください。');
    const view=sheet===tab.meta.sheet?viewOf(tab):tab.sheetViews?.[sheet||''];
    const ranges=view?.ranges?.length?view.ranges:view?.selection?[view.selection]:[];if(!address&&!ranges.length)throw Error('先に範囲を選択してください。');
    const table=await window.csv.request<Pick<SavedTable,'headers'|'rows'|'sourceRows'|'sourceColumns'|'mask'>>(id,'createTable',{sheet,address,selections:ranges,view,visibility:{hiddenRows:view?.hiddenRows||[],hiddenColumns:[...(view?.hidden||[]),...(view?.deletedColumns||[])],columns:view?.columnFilter}});
    const label=address?.trim().toUpperCase()||rangeAddress(ranges,tab.meta.headerRows),fileName=tab.meta.name||nameOf(tab.meta.path),name=[fileName,sheet||'CSV',label].join('|'),color=tableColor(tableSequence.current++);
    setSavedTables(ts=>{if(ts.length>=256||ts.reduce((n,t)=>n+t.rows.length*t.headers.length,0)+table.rows.length*table.headers.length>1000000){setError('一時テーブルは256個・合計100万セル以内です。');return ts;}return [...ts,{...table,id:crypto.randomUUID(),fileId:id,fileName,sheet,address:label,name,color}];});setPreviewPage('table');setPreviewOpen(true);
  }
  function selectionMarkdown(){if(selectedTab?.preview&&markdownSelection){exportMerged(markdownSelection,'md');return;}setExportFormat('md');setExportScope('selection');setModal('export');}
  function selectMarkdown(e:React.PointerEvent,extend=false){
    const element=(e.target as HTMLElement).closest('td,th') as HTMLTableCellElement|null;
    const table=element?.closest('table');if(!element||!table)return;
    const trs=Array.from(table.rows);const r=trs.indexOf(element.parentElement as HTMLTableRowElement),c=element.cellIndex;
    if(!extend||!markdownAnchor.current||markdownAnchor.current.table!==table)markdownAnchor.current={table,row:r,col:c};
    const anchor=markdownAnchor.current!;const r0=Math.min(anchor.row,r),r1=Math.max(anchor.row,r),c0=Math.min(anchor.col,c),c1=Math.max(anchor.col,c);
    const headers=Array.from(trs[0].cells).slice(c0,c1+1).map(cell=>cell.textContent||'');
    const body=trs.slice(Math.max(1,r0),r1+1).map(tr=>Array.from(tr.cells).slice(c0,c1+1).map(cell=>cell.textContent||''));
    table.querySelectorAll('td,th').forEach(cell=>cell.classList.remove('md-selected'));
    for(let row=r0;row<=r1;row++)for(let col=c0;col<=c1;col++)trs[row].cells[col]?.classList.add('md-selected');
    const data={headers,rows:body};setMarkdownSelection(data);setPreviewTable(data);if(body.length&&chartData(data).series.length)setPreviewOpen(true);
  }
  function addTextBlock(){if(blocks.length>=500){setError('文書は500ブロック以内です。');return;}setBlocks(all=>[...all,{id:crypto.randomUUID(),tutorial:!!meta?.tutorial,name:'テキスト '+(all.length+1),kind:'text',content:'ここにテキストを入力してください。',table:{headers:[],rows:[]}}]);}
  function addChartBlock(){const image=captureChartRef.current?.();if(!image){setError('数値範囲を選択してグラフを表示してください。');return;}setBlocks(all=>[...all,{id:crypto.randomUUID(),tutorial:!!meta?.tutorial,name:'グラフ '+(all.length+1),kind:'chart',image,chart:previewTable?cloneChartSpec(chartType,previewTable,chartSettings):undefined,table:{headers:[],rows:[]}}]);}
  const documentForExport=()=>blocks.map(block=>block.kind==='chart'&&block.chart?{...block,image:chartPNG(block.chart.table,block.chart.type,block.chart.settings,resolveImageTheme(prefs.imageExportTheme,prefs.theme))}:block);
  function exportDocument(){execute('Markdown文書を出力中',async()=>{const result=await window.csv.saveDocument(documentForExport());if(result)notify(nameOf(result.path)+' とグラフ画像を保存しました');});}
  useEffect(()=>{setChartSettings(previous=>({...defaultChartSettings(),palette:previous.palette}));if(previewTable)setChartType(recommendChart(previewTable).type);},[previewTable]);
  const paneContent=(id:PaneId)=>id==='workspace'?<div className="workspace-content"><button className="open-button" onClick={openDialog} disabled={!!busy}><FolderOpen size={17}/>ファイルを開く<Plus size={15}/></button><div className="section-label">開いているファイル <span>{tabs.length}</span></div><div className="file-list">{tabs.map(t => <button key={t.meta.id} title={t.meta.path} className={'file-item ' + (t.meta.id === activeId ? 'selected' : '')} onClick={() => setActiveId(t.meta.id)}>{['csv','excel'].includes(t.meta.kind) ? <FileSpreadsheet size={17}/> : <FileText size={17}/>}<span>{t.meta.name||nameOf(t.meta.path)}</span><small onClick={e => { e.stopPropagation(); close(t.meta.id); }}><X size={13}/></small></button>)}{!tabs.length && <p className="sidebar-empty">開いているファイルはありません</p>}</div>
      {meta && isCsv ? <><div className="section-label">列 <span>{columns.length}/{meta.columns}</span></div><div className="column-list">{meta.headers.map((h, c) => <label key={c} title={h}><input type="checkbox" checked={!selectedTab!.hidden.includes(c)} onChange={e => { const hidden = e.target.checked ? selectedTab!.hidden.filter(v => v !== c) : [...selectedTab!.hidden, c]; patchTab({ hidden }); }}/><span className="column-letter">{letter(c)}</span><span>{h}</span>{frozenColumns.includes(c) && <Pin size={11}/>}</label>)}</div></> : <><div className="section-label">最近開いたファイル</div><div className="recent-list">{prefs.recent?.slice(0, 8).map(path => <button key={path} title={path} onClick={() => openPaths([path])}><FileText size={14}/><span>{nameOf(path)}</span></button>)}</div></>}
</div>:id==='selection'||id==='multivariate'?<AnalysisPanel tab={selectedTab} tabs={tabs} tables={savedTables} all={id==='multivariate'} enabled={dockLayout.open.includes(id)&&dockLayout.active[panePosition(dockLayout,id)]===id}/>:id==='table'?<TablePreview tables={savedTables} tabs={tabs} onRename={(id,name)=>setSavedTables(ts=>ts.map(t=>t.id===id?{...t,name}:t))} onDelete={deleteSavedTable} onAdd={(id,sheet,address)=>createSavedTable(id,sheet,address)} onSelection={()=>createSavedTable().catch(e=>setError(String(e)))}/>:id==='chart'?<Dashboard settings={chartSettings} onSettingsChange={setChartSettings} type={chartType} setType={setChartType} table={previewTable} theme={prefs.theme||'light'} onSaveRef={saveChartRef} onCaptureRef={captureChartRef} onExport={selectionMarkdown} onError={setError}/>:<MergePanel theme={prefs.theme||'light'} view={mergeView} onAddText={addTextBlock} onAddChart={addChartBlock} onExportDocument={exportDocument} onShareDocument={()=>{setShareTable(mergeTables(blocks.filter(b=>!b.kind||b.kind==='table'),'rows',true));setSharingDocument(documentForExport());setModal('share');}} direction={mergeDirection} setDirection={setMergeDirection} align={mergeAlign} setAlign={setMergeAlign} format={mergeFormat} setFormat={setMergeFormat} blocks={blocks} setBlocks={setBlocks} onAdd={()=>addToMerge()} onAddFile={()=>addToMerge(true)} onExport={exportMerged} onShare={table=>{setSharingDocument(undefined);setShareTable(table);setModal('share');}}/>;
  const paneTools=(id:PaneId)=>id==='merge'?<div className="source-toggle" role="group" aria-label="結合文書の表示"><button aria-pressed={mergeView==='preview'} onClick={()=>setMergeView('preview')} className={mergeView==='preview'?'selected':''}>プレビュー</button><button aria-pressed={mergeView==='source'} onClick={()=>setMergeView('source')} className={mergeView==='source'?'selected':''}>.md原文</button></div>:null;
  const isSelected = (r: number,c: number) => (selectedTab?.ranges?.length?selectedTab.ranges:selectedTab?.selection?[selectedTab.selection]:[]).some(s=>r>=Math.min(s.row0,s.row1)&&r<=Math.max(s.row0,s.row1)&&c>=Math.min(s.col0,s.col1)&&c<=Math.max(s.col0,s.col1));
  function select(r:number,c:number,extend=false,add=false){
    headerFocus.current=null;setHeadSelection(null);setHeadMenu(null);
    setTabs(all=>all.map(t=>{if(t.meta.id!==activeId)return t;const changed=moveSelection(t.selection,t.ranges,r,c,extend,add);if(changed.ranges.length>100){setError('追加選択は100範囲以内です。');return t;}return {...t,...changed,selectionExplicit:true};}));
  }
  function selectHeads(axis:'row'|'column',indices:number[],add=false,base?:Selection[]){
    if(!meta||!indices.length)return;
    const ranges=axis==='row'?[{row0:Math.min(...indices),row1:Math.max(...indices),col0:0,col1:meta.columns-1}]:indices.map(c=>({row0:0,row1:meta.count-1,col0:c,col1:c}));
    const focus=headerFocus.current||{row:selectedTab?.selection?.row1||0,column:selectedTab?.selection?.col1||0};headerFocus.current={row:axis==='row'?indices[0]:focus.row,column:axis==='column'?indices[0]:focus.column};
    setHeadSelection({axis,indices});patchTab({selectionExplicit:true,selection:ranges.at(-1)!,ranges:add?[...(base||selectedTab?.ranges||[]),...ranges].slice(-100):ranges});
  }
  function beginHead(axis:'row'|'column',index:number,e:React.PointerEvent){
    if(e.button!==0)return;e.preventDefault();gridRef.current?.focus();setHeadMenu(null);dragging.current=false;
    const start=e.shiftKey&&headSelection?.axis===axis?headSelection.indices[0]:index;
    headDrag.current={axis,start,end:index,moved:start!==index,add:e.ctrlKey||e.metaKey,base:selectedTab?.ranges?.length?selectedTab.ranges:selectedTab?.selection?[selectedTab.selection]:[]};extendHead(index);
  }
  function extendHead(index:number){
    const drag=headDrag.current;if(!drag||!meta)return;drag.end=index;drag.moved=drag.moved||drag.start!==index;
    const first=drag.axis==='column'?columns.indexOf(drag.start):drag.start,last=drag.axis==='column'?columns.indexOf(index):index;
    const indices=drag.axis==='column'?columns.slice(Math.min(first,last),Math.max(first,last)+1):Array.from({length:Math.abs(last-first)+1},(_,i)=>Math.min(first,last)+i);
    selectHeads(drag.axis,indices,drag.add,drag.base);
  }
  useEffect(()=>{const finish=(event:PointerEvent)=>{const drag=headDrag.current;headDrag.current=null;if(drag?.moved){const first=drag.axis==='column'?columns.indexOf(drag.start):drag.start,last=drag.axis==='column'?columns.indexOf(drag.end):drag.end;const indices=drag.axis==='column'?columns.slice(Math.min(first,last),Math.max(first,last)+1):Array.from({length:Math.abs(last-first)+1},(_,i)=>Math.min(first,last)+i);setHeadMenu({axis:drag.axis,indices,x:Math.min(event.clientX,window.innerWidth-205),y:Math.min(event.clientY,window.innerHeight-260)});setHeadTools(false);}};document.addEventListener('pointerup',finish);return()=>document.removeEventListener('pointerup',finish);},[columns]);
  function headContext(axis:'row'|'column',index:number,event:React.MouseEvent){
    event.preventDefault();const indices=headSelection?.axis===axis&&headSelection.indices.includes(index)?headSelection.indices:[index];selectHeads(axis,indices);setHeadMenu({axis,indices,x:Math.min(event.clientX,window.innerWidth-205),y:Math.min(event.clientY,window.innerHeight-280)});setHeadTools(false);setHeadFilter('');
  }
  async function visibility(axis:'row'|'column',indices:number[],mode?:boolean){
    if(!selectedTab)return;
    const sources=axis==='row'?await window.csv.request<number[]>(selectedTab.meta.id,'selectedSources',{selections:indices.map(r=>({row0:r,row1:r,col0:0,col1:0}))}):indices;
    const old=axis==='row'?selectedTab.hiddenRows||[]:selectedTab.hidden;
    const hide=mode===undefined?!sources.every(i=>old.includes(i)):mode;
    const values=hide?[...new Set([...old,...sources])]:old.filter(i=>!sources.includes(i));patchTab(axis==='row'?{hiddenRows:values}:{hidden:values});setHeadMenu(null);
  }
  async function sortHead(axis:'row'|'column',index:number,direction:'asc'|'desc'|null){
    setHeadMenu(null);if(!meta)return;
    if(axis==='column')await configure({sorts:direction?[{column:index,direction,mode:'numeric'}]:[]});
    else if(!direction)patchTab({columnOrder:[],columnFilter:undefined});else {const order=await window.csv.request<number[]>(meta.id,'sortColumns',{row:index,direction,columns});patchTab({columnOrder:order});}
  }
  async function deleteHeads(){
    if(!headMenu||!meta)return;const {axis,indices}=headMenu;setHeadMenu(null);
    if(axis==='column'){patchTab({deletedColumns:[...new Set([...(selectedTab?.deletedColumns||[]),...indices])],ranges:[],selection:null});setHeadSelection(null);}
    else await execute('行を表示から削除中',async()=>{const changed=await window.csv.request<Meta>(meta.id,'excludeSelection',{selections:indices.map(r=>({row0:r,row1:r,col0:0,col1:0}))});patchTab({meta:{...meta,...changed,id:meta.id},excludedRows:changed.excludedRows,selection:null,ranges:[],scrollTop:0});setHeadSelection(null);gridRef.current?.scrollTo({top:0});});
  }
  async function filterHead(){
    if(!headMenu||!meta)return;const {axis,indices}=headMenu;
    if(axis==='column')await configure({filters:[...(selectedTab?.filters||[]),{column:indices[0],mode:'contains',value:headFilter}]});
    else {const result=await window.csv.request<{rows:Row[]}>(meta.id,'page',{start:indices[0],limit:1});patchTab({columnFilter:columns.filter(c=>(result.rows[0]?.cells[c]||'').includes(headFilter))});}
    setHeadMenu(null);
  }
  async function restoreView(){headerFocus.current=null;await configure({excludedRows:[],filters:[],sorts:[]});patchTab({hidden:[],hiddenRows:[],deletedColumns:[],columnOrder:[],columnFilter:undefined});setHeadSelection(null);}
  async function gridKey(e: React.KeyboardEvent) {
    if (!selectedTab || !meta?.count || !columns.length) return;
    const ctrl=e.ctrlKey||e.metaKey;
    if(ctrl&&e.key.toLowerCase()==='t'){e.preventDefault();await createSavedTable();return;}
    const s=selectedTab.selection||{row0:0,row1:0,col0:columns[0],col1:columns[0]};
    if(e.key==='Escape'){e.preventDefault();setHeadMenu(null);setHeadSelection(null);patchTab({ranges:[],selection:null,selectionExplicit:false});return;}
    if((e.code==='Space'||e.key===' ')&&(ctrl||e.shiftKey)){e.preventDefault();const focus=headerFocus.current||{row:s.row1,column:s.col1};selectHeads(ctrl?'column':'row',[ctrl?focus.column:focus.row]);return;}
    if(ctrl&&e.key.toLowerCase()==='a'){e.preventDefault();patchTab({selectionExplicit:true,selection:{row0:0,row1:meta.count-1,col0:0,col1:meta.columns-1},ranges:[]});return;}
    let r=headerFocus.current?.row??s.row1,c=headerFocus.current?.column??s.col1, ci=Math.max(0,columns.indexOf(c)),dr=0,dc=0;
    if(e.key==='ArrowDown')dr=1;else if(e.key==='ArrowUp')dr=-1;else if(e.key==='ArrowLeft')dc=-1;else if(e.key==='ArrowRight')dc=1;
    else if(e.key==='Tab')dc=e.shiftKey?-1:1;
    else if(e.key==='Enter')dr=e.shiftKey?-1:1;
    else if(e.key==='PageDown')r+=Math.floor(height/rowHeight);else if(e.key==='PageUp')r-=Math.floor(height/rowHeight);
    else if(e.key==='Home'){c=columns[0];if(ctrl)r=0;}else if(e.key==='End'){c=columns.at(-1)!;if(ctrl)r=meta.count-1;}else return;
    e.preventDefault();
    if(ctrl&&(dr||dc)){try{const next=await window.csv.request<{row:number;column:number}>(meta.id,'move',{row:r,column:c,dr,dc,columns});r=next.row;c=next.column;}catch(error){setError(String(error));return;}}
    else {r+=dr;if(dc)c=columns[Math.max(0,Math.min(columns.length-1,ci+dc))];}
    r=Math.max(0,Math.min(meta.count-1,r));select(r,c,e.shiftKey&&!['Tab','Enter'].includes(e.key));
    const grid=gridRef.current;if(grid){if(r*rowHeight<top)grid.scrollTop=r*rowHeight/scrollScale;else if((r+1)*rowHeight>top+height-headerHeight)grid.scrollTop=((r+1)*rowHeight-height+headerHeight)/scrollScale;const p=positions.find(v=>v.c===c);if(p&&!frozenColumns.includes(c)){if(p.x<left+frozenWidth)grid.scrollLeft=p.x-frozenWidth;else if(p.x+p.w>left+gridWidth)grid.scrollLeft=p.x+p.w-gridWidth;}}
  }
  function resizeColumn(c: number, e: React.PointerEvent) {
    e.preventDefault(); e.stopPropagation(); const startX = e.clientX, initial = widthOf(c), initialWidths = { ...selectedTab!.widths };
    const move = (event: PointerEvent) => patchTab({ widths: { ...initialWidths, [c]: Math.max(70, Math.min(1600, initial + event.clientX - startX)) } });
    const stop = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', stop); };
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', stop);
  }
  function autoFit(c: number) { const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d')!; ctx.font = `${prefs.fontSize}px ${prefs.fontFamily}`; const max = Math.max(...[meta!.headers[c], ...rows.map(row => row.cells[c] || '')].map(text => Math.max(...text.split('\n').map(line => ctx.measureText(line).width)))); patchTab({ widths: { ...selectedTab!.widths, [c]: Math.min(800, Math.max(90, max + 35)) } }); }
  const selectionCount=selectionSize(selectedTab?.ranges?.length?selectedTab.ranges:selectedTab?.selection?[selectedTab.selection]:[]);
  const mdHtml = useMemo(() => {const tokens=markdown.parse(sourceText,{});const visit=(items:typeof tokens)=>{for(const token of items){if(token.type==='image'){const src=token.attrGet('src')||'';if(localImages[src])token.attrSet('src',localImages[src]);}if(token.children)visit(token.children);}};visit(tokens);return DOMPurify.sanitize(markdown.renderer.render(tokens,markdown.options,{}));}, [sourceText,localImages]);
  useEffect(()=>{
    setLocalImages({});if(!meta||!selectedTab?.preview||!sourceText)return;
    let alive=true;const tokens=markdown.parse(sourceText,{}),urls=new Set<string>();
    const visit=(items:typeof tokens)=>{for(const token of items){if(token.type==='image'){const src=token.attrGet('src')||'';if(src&&!/^(?:[a-z]+:|[\\/])/i.test(src))urls.add(src);}if(token.children)visit(token.children);}};visit(tokens);
    Promise.all([...urls].slice(0,50).map(async url=>{try{return [url,await window.csv.image(meta.id,url)] as const;}catch{return [url,''] as const;}})).then(items=>{if(alive)setLocalImages(Object.fromEntries(items.filter(([,v])=>v)));});
    return ()=>{alive=false;};
  },[sourceText,meta?.id,selectedTab?.preview]);
  const tutorial=useTutorial({ready:prefsReady&&dockReady,busy:!!busy,prefs,tabs,activeId,layout:dockLayout,tables:savedTables,blocks,selectionCount,setTabs,setActiveId,setLayout:setDockLayout,setTables:setSavedTables,setBlocks,savePrefs,setModal,setFind:setShowFind,restoreFocus:id=>{const tab=tabs.find(t=>t.meta.id===id);restoredPreview.current=tab?{id,selection:JSON.stringify(tab.ranges?.length?tab.ranges:tab.selection)}:null;setActiveId(id);},selectRange:()=>{const selection={row0:0,row1:5,col0:1,col1:3};patchTab({selection,ranges:[selection],selectionExplicit:true});gridRef.current?.focus();},createTable:()=>createSavedTable(),addSelection:()=>addToMerge()});
  const columnSelect = (value: number, onChange: (n: number) => void, all = false) => <select value={value} onChange={e => onChange(Number(e.target.value))}>{all && <option value={-1}>すべての列</option>}{meta?.headers.map((h, c) => <option key={c} value={c}>{letter(c)} · {h.slice(0, 45)}</option>)}</select>;

  return <ImageExportThemeContext.Provider value={resolveImageTheme(prefs.imageExportTheme,prefs.theme)}><div className="app" onDragOver={e => e.preventDefault()} onDrop={e => {e.preventDefault();if(busy)return;const files=Array.from(e.dataTransfer.files).map(f=>window.csv.filePath(f)).filter(Boolean);if(files.length)openPaths(files);else {const url=(e.dataTransfer.getData('text/uri-list')||e.dataTransfer.getData('text/plain')).split(/\r?\n/).find(s=>!s.startsWith('#')&&s.trim());if(url)openUrl(url);}}}>
    <header className="titlebar compact-titlebar"><nav className="menubar"><button className="icon-btn workspace-toggle" title="左ペインを開閉" aria-label="左ペインを開閉" aria-pressed={sidebar} onClick={()=>setSidebar(v=>!v)}>{appIcon?<img className="app-icon" src={appIcon} alt=""/>:sidebar?<PanelLeftClose size={17}/>:<PanelLeftOpen size={17}/>}</button><div className="file-menu"><button className={fileMenu ? 'menu-button active' : 'menu-button'} onClick={() => setFileMenu(!fileMenu)}>ファイル<ChevronDown size={12}/></button>{fileMenu && <><div className="menu-shield" onClick={() => setFileMenu(false)}/><div className="dropdown"><button onClick={openDialog}><FolderOpen size={16}/>開く…<kbd>Ctrl+O</kbd></button><button disabled={!meta} onClick={() => { setFileMenu(false); reload(); }}><RotateCw size={16}/>再読み込み<kbd>Ctrl+R</kbd></button><button disabled={!meta||meta.kind==='excel'} onClick={() => showModal('reading')}><Settings size={16}/>読み込み設定…</button><hr/><button disabled={!meta} onClick={() => showModal('export')}><Download size={16}/>エクスポート…<kbd>Ctrl+Shift+E</kbd></button><hr/><button disabled={!meta} onClick={() => { close(); setFileMenu(false); }}><X size={16}/>タブを閉じる<kbd>Ctrl+W</kbd></button></div></>}</div><button className="menu-button" onClick={() => commands.current('find')}>検索</button><button className="menu-button" onClick={() => commands.current('goto')} disabled={!meta}>移動</button><button className="menu-button" onClick={() => showModal('help')}>ヘルプ</button><button className="menu-button" disabled={!meta&&!blocks.length} onClick={shareCurrent}>共有</button><button className="menu-button" onClick={()=>{setShareTable(null);setSharingDocument(undefined);setModal('share');}}>接続</button><button className="menu-button" disabled={!meta&&!blocks.length} onClick={()=>prepareShare('sShare')}>S共有</button><button className="menu-button" onClick={()=>setModal('sConnections')}>Sアカウント接続</button></nav><form className="online-bar" onSubmit={e=>{e.preventDefault();openUrl();}}><FileSpreadsheet size={14}/><input aria-label="オンラインExcel・スプレッドシートURL" value={urlValue} onChange={e=>setUrlValue(e.target.value)} placeholder="オンラインExcel / GoogleスプレッドシートのURLを入力・ドロップ"/><button disabled={!!busy||!urlValue.trim()} type="submit">開く</button></form><div className="titlebar-right"><AccountIcons/><button className="icon-btn" title="テーマを切り替え" aria-label="テーマを切り替え" onClick={()=>commands.current('theme')}>{prefs.theme==='dark'?<Sun size={16}/>:<Moon size={16}/>}</button><button className="icon-btn" aria-label="設定" title="設定" onClick={()=>showModal('settings')}><Settings size={16}/></button></div></header>
    <div className="workbench">

      <Docking layout={dockLayout} onChange={setDockLayout} prefs={prefs} ready={prefsReady&&dockReady} onPreferences={savePrefs} content={paneContent} tools={paneTools} editor={<main className="main-panel">
        <div className="tabbar">{tabs.map(t => <div key={t.meta.id} className={'tab ' + (t.meta.id === activeId ? 'active' : '')}><button title={t.meta.path} onClick={() => setActiveId(t.meta.id)}>{['csv','excel'].includes(t.meta.kind) ? <FileSpreadsheet size={15}/> : <FileText size={15}/>}<span>{t.meta.name||nameOf(t.meta.path)}</span></button><button aria-label={`${t.meta.name||nameOf(t.meta.path)}を閉じる`} className="tab-close" onClick={() => close(t.meta.id)}><X size={13}/></button></div>)}<button className="icon-btn add-tab" aria-label="ファイルを追加" onClick={openDialog}><Plus size={18}/></button></div>
        {meta ? <><div className="document-heading"><div><h1>{meta.name||nameOf(meta.path)}<span className="type-badge">{meta.kind === 'markdown' ? 'MARKDOWN' : meta.kind.toUpperCase()}</span></h1><p title={meta.sourceUrl||meta.path}>{meta.sourceUrl||meta.path}</p></div><button className="quiet-button" disabled={!!meta.sourceUrl} title="フォルダーで表示" onClick={() => window.csv.reveal(meta.path)}><ArrowUpRight size={15}/>フォルダーで表示</button></div>
        <div className="toolbar"><div className="toolgroup"><button onClick={() => commands.current('find')}><Search size={16}/>検索</button>{isCsv && <><button className={selectedTab!.filters.length ? 'applied' : ''} onClick={() => showModal('filters')}><FilterIcon size={16}/>フィルター{selectedTab!.filters.length > 0 && <b>{selectedTab!.filters.length}</b>}</button><button className={selectedTab!.sorts.length ? 'applied' : ''} onClick={() => showModal('sorts')}><ArrowDownUp size={16}/>並べ替え</button></>}<button title="グラフプレビュー" onClick={()=>toggleDock('chart')}><BarChart3 size={16}/></button><button title="ファイル結合" onClick={()=>toggleDock('merge')}><Combine size={16}/></button><button title="表示状態を復元" aria-label="表示状態を復元" onClick={restoreView}><RotateCcw size={15}/></button><button title="共有" onClick={shareCurrent}><Share2 size={16}/></button><button onClick={() => copy()} disabled={!selectedTab?.selection}><Copy size={16}/>コピー</button></div><div className="toolgroup">{isCsv ? <><label title="先頭の指定レコードを列見出しとして固定します">見出し<select aria-label="見出し行数" value={meta.headerRows} onChange={e => configure({ headerRows: Number(e.target.value) })}>{Array.from({ length: Math.min(30, meta.records) + 1 }, (_, n) => <option key={n} value={n}>{n}行</option>)}</select></label><label><Pin size={14}/><select aria-label="固定列数" value={selectedTab!.frozen} onChange={e => patchTab({ frozen: Number(e.target.value) })}>{Array.from({ length: Math.min(10, columns.length) + 1 }, (_, n) => <option key={n} value={n}>{n}列固定</option>)}</select></label></> : meta.kind === 'markdown' && <div className="segmented"><button className={selectedTab!.preview ? 'selected' : ''} onClick={() => patchTab({ preview: true })}><Eye size={14}/>プレビュー</button><button className={!selectedTab!.preview ? 'selected' : ''} onClick={() => patchTab({ preview: false })}><List size={14}/>ソース</button></div>}<button onClick={() => showModal('export')}><Download size={16}/>エクスポート</button></div></div>
        {showFind && <div className="findbar"><Search size={16}/><input ref={findRef} aria-label="検索語" placeholder="文字列を検索…" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') find(e.shiftKey); if (e.key === 'Escape') setShowFind(false); }}/><label><input type="checkbox" checked={caseSensitive} onChange={e => setCaseSensitive(e.target.checked)}/>大文字・小文字</label><label><input type="checkbox" checked={whole} onChange={e => setWhole(e.target.checked)}/>セル全体</label><label><input type="checkbox" checked={regex} onChange={e => setRegex(e.target.checked)}/>正規表現</label><button aria-label="前を検索" onClick={() => find(true)}><ChevronLeft size={16}/></button><button aria-label="次を検索" onClick={() => find()}><ChevronRight size={16}/></button><button aria-label="検索を閉じる" onClick={() => setShowFind(false)}><X size={16}/></button></div>}
        {selectedTab!.filters.length > 0 && <div className="filter-summary"><FilterIcon size={12}/>{count(meta.count)}件を表示（全{count(meta.records - meta.headerRows)}件）<button onClick={() => configure({ filters: [] })}>フィルターを解除<X size={12}/></button></div>}
        {meta.warnings.length > 0 && <div className="warning"><Info size={14}/>{meta.warnings.join(' ')}</div>}
        {selectedTab!.preview ? <div className="markdown-scroll"><article className="markdown-body" onPointerDown={e=>{dragging.current=true;selectMarkdown(e,e.shiftKey);}} onPointerOver={e=>{if(dragging.current)selectMarkdown(e,true);}} dangerouslySetInnerHTML={{ __html: mdHtml }}/></div> : <div className={'grid-scroll ' + (!isCsv ? 'text-view' : '')} ref={gridRef} id={'worksheet-grid-'+meta.id} tabIndex={0} role="grid" aria-label={isCsv ? 'CSVデータ' : 'テキストソース'} aria-rowcount={meta.count + (isCsv ? meta.headerRows + 1 : 0)} aria-colcount={meta.columns} onKeyDown={gridKey} onScroll={e => { const el = e.currentTarget; setTop(el.scrollTop*scrollScale); setLeft(el.scrollLeft); patchTab({ scrollTop: el.scrollTop, scrollLeft: el.scrollLeft }); }}>
          <div className="grid-canvas" style={{ width: Math.max(totalWidth, gridWidth), height: Math.max(height, Math.min(24000000,meta.count * rowHeight + headerHeight)) }}>
            {isCsv && <div className="grid-headers" role="row" aria-rowindex={1} style={{ width: Math.max(totalWidth, gridWidth), transform: `translateY(${top/scrollScale}px)` }}><div className="corner" style={{ transform: `translateX(${left}px)` }}>#</div>{visibleColumns.map(p => <div className={'column-header ' + (frozenColumns.includes(p.c) ? 'frozen' : '')} key={p.c} style={{ left: frozenColumns.includes(p.c) ? left + positions.slice(0,positions.indexOf(p)).filter(v=>frozenColumns.includes(v.c)).reduce((sum,v) => sum+v.w,54) : p.x, width: p.w }} title={meta.headers[p.c]}><GridHead axis="column" index={p.c} label={meta.headers[p.c]} letter={letter(p.c)} hidden={selectedTab!.hidden.includes(p.c)} selected={headSelection?.axis==='column'&&headSelection.indices.includes(p.c)||false} onStart={e=>beginHead('column',p.c,e)} onEnter={()=>{if(headDrag.current?.axis==='column')extendHead(p.c);}} onMenu={e=>headContext('column',p.c,e)} onVisibility={()=>visibility('column',[p.c])} onSort={direction=>sortHead('column',p.c,direction)}/><div className="resize-handle" onPointerDown={e => resizeColumn(p.c, e)} onDoubleClick={() => autoFit(p.c)}/></div>)}</div>}
            {isCsv && meta.headerRows > 0 && <div className="header-records" aria-label="ファイルの見出し行" style={{top:32 + top/scrollScale,left,width:gridWidth,height:headerRecordHeight}}>
              <div className="header-record-canvas" style={{width:Math.max(totalWidth,gridWidth),height:meta.headerRows*rowHeight,transform:`translateX(${-left}px)`}}>
                {meta.headerRecords.map((cells,r)=><div role="row" aria-rowindex={r+2} key={r} className="grid-row header-record" data-header-row={r} style={{top:r*rowHeight,height:rowHeight,width:Math.max(totalWidth,gridWidth)}}>
                  <div className="row-number header-record-number" role="rowheader" style={{left}}>{r+1}</div>
                  {visibleColumns.map(p=><div key={p.c} role="gridcell" className={'cell '+(tablesForCell(r,p.c).length?'table-cell ':'')+(selectedTab!.hidden.includes(p.c)?'cell-concealed ':'')+(frozenColumns.includes(p.c)?'frozen ':'')+(cells[p.c]===undefined?'missing':'')} data-header-col={p.c} onContextMenu={e=>showTableMenu(r,p.c,e)} style={{'--table-color':tablesForCell(r,p.c).at(-1)?.color,left:frozenColumns.includes(p.c)?left+positions.slice(0,positions.indexOf(p)).filter(v=>frozenColumns.includes(v.c)).reduce((sum,v)=>sum+v.w,54):p.x,width:p.w} as React.CSSProperties} title={cells[p.c]??''} onDoubleClick={()=>{setHeaderCellValue(cells[p.c]??'');setModal('headerCell');}}><span>{cells[p.c]?.replace(/\r?\n/g,' ↵ ')||''}</span></div>)}
                </div>)}
              </div>
            </div>}
            {rows.map(row => <div role="row" aria-rowindex={row.index+(isCsv?meta.headerRows+2:1)} key={row.index} className={'grid-row ' + (row.index % 2 ? 'alternate' : '')} style={{ top: row.index * rowHeight - top + top/scrollScale + headerHeight, height: rowHeight, width: Math.max(totalWidth, gridWidth) }}><div className="row-number" style={{left}}><GridHead axis="row" index={row.index} label={String(row.source+1)} hidden={selectedTab!.hiddenRows?.includes(row.source)||false} selected={headSelection?.axis==='row'&&headSelection.indices.includes(row.index)||false} onStart={e=>beginHead('row',row.index,e)} onEnter={()=>{if(headDrag.current?.axis==='row')extendHead(row.index);}} onMenu={e=>headContext('row',row.index,e)} onVisibility={()=>visibility('row',[row.index])} onSort={direction=>sortHead('row',row.index,direction)}/></div>{visibleColumns.map(p => <div key={p.c} role="gridcell" aria-selected={!!isSelected(row.index,p.c)} className={'cell ' + (tablesForCell(row.source,p.c).length?'table-cell ':'') + (selectedTab!.hidden.includes(p.c)||selectedTab!.hiddenRows?.includes(row.source)?'cell-concealed ':'') + (isSelected(row.index,p.c) ? 'selected ' : '') + (frozenColumns.includes(p.c) ? 'frozen ' : '') + (row.cells[p.c] === undefined ? 'missing' : '')} data-row={row.index} data-col={p.c} onContextMenu={e=>showTableMenu(row.source,p.c,e)} style={{'--table-color':tablesForCell(row.source,p.c).at(-1)?.color, left: frozenColumns.includes(p.c) ? left + positions.slice(0,positions.indexOf(p)).filter(v=>frozenColumns.includes(v.c)).reduce((sum,v) => sum+v.w,54) : p.x, width: p.w } as React.CSSProperties} onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); gridRef.current?.focus(); dragging.current = true; dragPoint.current={x:e.clientX,y:e.clientY}; select(row.index,p.c,e.shiftKey,e.ctrlKey||e.metaKey); }} onPointerEnter={() => { if (dragging.current) select(row.index,p.c,true); }} onDoubleClick={() => showModal('cell')} title={selectedTab!.hidden.includes(p.c)||selectedTab!.hiddenRows?.includes(row.source)?'非表示（グレー表示）: '+(row.cells[p.c]??''):row.cells[p.c]}><span>{row.cells[p.c]?.replace(/\r?\n/g,' ↵ ') || ''}</span></div>)}</div>)}
            {!meta.count && <div className="no-rows" style={{top:headerHeight+24}}>{meta.records ? '表示条件に一致するデータはありません' : '空のファイルです'}</div>}
          </div>
        </div>}
        {meta.kind==='excel' && (meta.sheets?.length||0)>1 && <WorksheetTabs key={meta.id} sheets={meta.sheets!} active={meta.sheet||meta.sheets![0]} disabled={!!busy} panelId={'worksheet-grid-'+meta.id} onSelect={sheet=>configure({sheet})}/>}
        <div className="inspector"><span className="cell-address">{selectedTab?.selection ? `${letter(selectedTab.selection.col1)}${selectedTab.selection.row1 + 1}` : '—'}</span><pre title="選択セルの内容（型変換なし）">{cellValue || ' '}</pre><button title="セルの全文を表示" aria-label="セルの全文を表示" className="icon-btn" onClick={() => showModal('cell')}><Eye size={16}/></button></div>
        <footer className="statusbar"><span><span className="status-dot"/>{count(meta.count)}{isCsv ? 'レコード' : '行'}</span>{isCsv && <span>{count(meta.columns)}列</span>}<span>{bytes(meta.size)}</span><button disabled={meta.kind==='excel'} onClick={() => showModal('reading')}>{meta.encoding==='workbook'?'Excelネイティブ':ENCODINGS.find(e => e[0] === meta.encoding)?.[1]}{meta.bom ? ' BOM' : ''}</button><span>{meta.lineEndings}</span><div className="status-right">{selectionCount > 0 && <span>{count(selectionCount)}セル選択</span>}<button onClick={() => savePrefs({ fontSize: Math.max(10,(prefs.fontSize || 13)-1) })}>−</button><span>{Math.round((prefs.fontSize || 13)/13*100)}%</span><button onClick={() => savePrefs({ fontSize: Math.min(24,(prefs.fontSize || 13)+1) })}>＋</button></div></footer></> : <div className="welcome"><div className="welcome-art"><div className="sheet"><div className="sheet-top"><FileSpreadsheet size={20}/><span>CSV nyaan Viewer</span><LockKeyhole size={12}/></div>{[0,1,2,3].map(r => <div className="sheet-row" key={r}>{[0,1,2].map(c => <span key={c} className={r === 2 && c === 1 ? 'blue' : ''}/>)}</div>)}</div></div><span className="eyebrow">さっくり分析、にゃーんと解決！</span><h1>CSV nyaan Viewer v{version}</h1><p>対応ファイル例：<br/>（よめる）.csv , .md , .txt<br/>（だいたいよめる）.xlsx , .xl～なんちゃら , .prn , .obs<br/>（きっとよめる）Googleスプレッドシート(URL) , MicrosoftExcelOnline(URL)</p><button className="primary large" onClick={openDialog}><FolderOpen size={18}/>ファイルを開く<span>Ctrl + O</span></button><div className="drop-hint">CSV・Excel・.md・.txt・オンラインファイルのURLをドラッグ＆ドロップ</div><div className="welcome-features"><span><LockKeyhole size={17}/>元ファイルを保持</span><span><Search size={17}/>検索・フィルター</span><span><Download size={17}/>必要な形式で出力</span></div></div>}
      </main>}/>
    </div>
    <Tutorial stage={tutorial.stage} busy={tutorial.busy} done={tutorial.done} error={tutorial.error||error} onStart={tutorial.start} onStep={tutorial.step} onAction={tutorial.action} onFinish={tutorial.finish}/>
    {tableMenu&&<><div className="head-menu-shield" onPointerDown={()=>setTableMenu(null)}/><div className="head-menu" role="menu" aria-label="テーブルの操作" style={{left:tableMenu.x,top:tableMenu.y}}>{savedTables.filter(t=>tableMenu.ids.includes(t.id)).map(t=><button role="menuitem" key={t.id} onClick={()=>deleteSavedTable(t.id)}><Trash2 size={14}/>{t.name}を削除</button>)}</div></>}
    {headMenu&&<><div className="head-menu-shield" onPointerDown={()=>setHeadMenu(null)}/><div className="head-menu" role="menu" aria-label="行列の操作" style={{left:headMenu.x,top:headMenu.y}}><small>{headMenu.indices.length}{headMenu.axis==='column'?'列':'行'}を選択</small><button role="menuitem" onClick={()=>visibility(headMenu.axis,headMenu.indices)}><Eye size={14}/>表示 / 非表示</button>{headMenu.indices.length===1&&<><button role="menuitem" aria-expanded={headTools} onClick={()=>setHeadTools(v=>!v)}><ArrowDownUp size={14}/>ソート / フィルター</button>{headTools&&<div className="head-menu-tools"><button onClick={()=>sortHead(headMenu.axis,headMenu.indices[0],'asc')}><ArrowUp size={13}/>昇順</button><button onClick={()=>sortHead(headMenu.axis,headMenu.indices[0],'desc')}><ArrowDown size={13}/>降順</button><button onClick={()=>sortHead(headMenu.axis,headMenu.indices[0],null)}><RotateCcw size={13}/>元の順序</button><input aria-label="行列フィルターの値" value={headFilter} onChange={e=>setHeadFilter(e.target.value)} placeholder="含む文字列"/><button onClick={filterHead}><FilterIcon size={13}/>フィルター適用</button></div>}</>}<button role="menuitem" onClick={deleteHeads}><Trash2 size={14}/>削除</button></div></>}
    {error && <div className="error-banner" role="alert"><Info size={18}/><span>{error}</span><button className="icon-btn" aria-label="エラーを閉じる" onClick={() => setError('')}><X size={16}/></button></div>}
    {toast && <div className="toast"><Check size={17}/>{toast}</div>}
    {busy && <div className="busy-overlay"><div className="busy-card"><div className="spinner"/><strong>{busy}</strong><progress value={progress} max={1}/><p>{Math.round(progress*100)}%</p></div></div>}
    {modal && <div className="modal-overlay" onClick={() => { if (!busy) setModal(''); }}><section className={'modal ' + (['filters','sorts','help'].includes(modal) ? 'wide' : '')} role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>{!['share','sShare','sConnections'].includes(modal) && <div className="modal-heading"><h2>{{ filters:'フィルター',sorts:'並べ替え',reading:'読み込み設定',export:'エクスポート',settings:'表示設定',goto:'行・列へ移動',help:'操作ガイド',cell:'セルの内容',headerCell:'セルの内容',about:'このアプリについて' }[modal]}</h2><button className="icon-btn" aria-label="ダイアログを閉じる" onClick={() => setModal('')}><X size={18}/></button></div>}
      {modal === 'share' && <Sharing table={shareTable} document={sharingDocument} onClose={()=>setModal('')}/>}
      {modal === 'sConnections' && <SConnections onClose={()=>setModal('')}/>}
      {modal === 'sShare' && <SSharing table={shareTable} document={sharingDocument} fileId={meta?.id} fileName={meta?.name||meta&&nameOf(meta.path)} hasDocument={!!blocks.length} onDocument={()=>setSharingDocument(documentForExport())} onClose={()=>setModal('')}/>}
      {modal === 'filters' && <><p className="modal-description">すべての条件に一致するレコードを表示します。元データは変更されません。</p><div className="rules">{draftFilters.map((f,i) => <div className="filter-rule" key={i}>{columnSelect(f.column,n => setDraftFilters(all => all.map((v,j) => j === i ? {...v,column:n}:v)),true)}<select value={f.mode} onChange={e => setDraftFilters(all => all.map((v,j) => j === i ? {...v,mode:e.target.value}:v))}>{MODES.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select><input aria-label={`条件${i+1}の値`} placeholder="比較する値" value={f.value} disabled={['empty','notEmpty'].includes(f.mode)} onChange={e => setDraftFilters(all => all.map((v,j) => j === i ? {...v,value:e.target.value}:v))}/><label title="大文字・小文字を区別"><input type="checkbox" checked={!!f.caseSensitive} onChange={e => setDraftFilters(all => all.map((v,j) => j === i ? {...v,caseSensitive:e.target.checked}:v))}/>Aa</label><button aria-label={`条件${i+1}を削除`} className="icon-btn" onClick={() => setDraftFilters(all => all.filter((_,j) => j !== i))}><X size={16}/></button></div>)}</div><button className="quiet-button" disabled={draftFilters.length >= 30} onClick={() => setDraftFilters(all => [...all,{column:-1,mode:'contains',value:''}])}><Plus size={15}/>条件を追加</button><div className="modal-actions"><button onClick={() => configure({filters:[]})}>解除</button><button className="primary" onClick={() => configure({filters:draftFilters})}>適用</button></div></>}
      {modal === 'sorts' && <><p className="modal-description">上の条件から順に並べ替えます。同じ値の順序は保持されます。</p><div className="rules">{draftSorts.map((s,i) => <div className="sort-rule" key={i}><span>{i+1}</span>{columnSelect(s.column,n => setDraftSorts(all => all.map((v,j) => j === i ? {...v,column:n}:v)))}<select value={s.direction} onChange={e => setDraftSorts(all => all.map((v,j) => j === i ? {...v,direction:e.target.value}:v))}><option value="asc">昇順 ↑</option><option value="desc">降順 ↓</option></select><select value={s.mode} onChange={e => setDraftSorts(all => all.map((v,j) => j === i ? {...v,mode:e.target.value}:v))}><option value="text">自然順（文字列）</option><option value="numeric">数値順（精度保持）</option></select><button className="icon-btn" onClick={() => setDraftSorts(all => all.filter((_,j) => j !== i))}><X size={16}/></button></div>)}</div><button className="quiet-button" disabled={draftSorts.length >= 8} onClick={() => setDraftSorts(all => [...all,{column:0,direction:'asc',mode:'text'}])}><Plus size={15}/>並べ替え列を追加</button><div className="modal-actions"><button onClick={() => configure({sorts:[]})}>元の順序に戻す</button><button className="primary" onClick={() => configure({sorts:draftSorts})}>適用</button></div></>}
      {modal === 'reading' && <><p className="modal-description">表示上の解釈を変更して再読み込みします。</p><label className="form-field">ファイルの扱い<select value={kind} onChange={e => setKind(e.target.value)}><option value="csv">CSV / 区切りテキスト</option><option value="markdown">Markdown</option><option value="text">プレーンテキスト</option></select></label><label className="form-field">文字コード<select value={encoding} onChange={e => setEncoding(e.target.value)}>{ENCODINGS.map(([v,l]) => <option value={v} key={v}>{l}</option>)}</select></label>{kind === 'csv' && <label className="form-field">区切り文字<select value={delimiter} onChange={e => setDelimiter(e.target.value)}>{[['auto','自動判定'],[',','カンマ (,)'],['\t','タブ'],[';','セミコロン (;)'],['|','パイプ (|)'],['custom','任意のASCII 1文字']].map(([v,l]) => <option value={v} key={v}>{l}</option>)}</select>{delimiter === 'custom' && <input maxLength={1} value={customDelimiter} onChange={e => setCustomDelimiter(e.target.value)}/>}</label>}<div className="modal-actions"><button onClick={() => setModal('')}>キャンセル</button><button className="primary" onClick={() => reload({encoding,delimiter:delimiter === 'custom' ? customDelimiter : delimiter,kind,headerRows:kind === 'csv' ? 1 : 0})}>再読み込み</button></div></>}
      {modal === 'export' && <><p className="modal-description">別のファイルに変換して出力します。保存先は次の画面で選択します。</p><label className="form-field">出力形式<select aria-label="出力形式" value={exportFormat} onChange={e => setExportFormat(e.target.value)}><option value="csv">CSV（カンマ区切り）</option><option value="tsv">TSV（タブ区切り）</option><option value="md">Markdown (.md)</option><option value="txt">テキスト (.txt)</option></select></label>{isCsv && <label className="form-field">出力範囲<select value={exportScope} onChange={e => setExportScope(e.target.value)}><option value="selection">選択範囲（見出しを含む）</option><option value="view">表示中のレコード（フィルター・並べ替えを適用）</option><option value="all">元ファイルの全レコード</option></select></label>}{meta?.kind === 'markdown' && ['csv','tsv'].includes(exportFormat) && <label className="form-field">表としての変換<select value={markdownTable?'table':'lines'} onChange={e => setMarkdownTable(e.target.value === 'table')}><option value="table">最初のMarkdown表を出力</option><option value="lines">ソースの各行を1セルとして出力</option></select></label>}<label className="form-field">出力文字コード<select value={exportEncoding} onChange={e => setExportEncoding(e.target.value)}><option value="utf8">UTF-8</option><option value="source">元ファイルと同じ文字コード</option></select></label><label className="check-field"><input type="checkbox" checked={exportBom} onChange={e => setExportBom(e.target.checked)}/>BOMを付ける</label><div className="export-note">{isCsv ? 'CSV・TSV・TXTは引用符付きの区切りテキスト、Markdownは表として出力します。非表示列も出力されます。Markdownの先頭レコードは見出しになります。' : ['md','txt'].includes(exportFormat) ? 'Markdown・TXTへの出力はソースの内容を保持します。' : meta?.kind === 'markdown' && markdownTable ? '最初の表だけを変換します。表以外の文章と後続の表は含まれません。' : '各ソース行を1列のデータとして出力します。'}<br/>変換時は改行・引用符・文字コードの表現が変わる場合があります。</div><div className="modal-actions"><button onClick={() => setModal('')}>キャンセル</button><button className="primary" onClick={exportFile}><Download size={15}/>保存先を選んで出力</button></div></>}
      {modal === 'settings' && <>{appIcon&&<img className="settings-app-icon" src={appIcon} alt="アプリアイコン"/>}<button className="quiet-button" onClick={()=>window.csv.chooseIcon().then(image=>{if(image)setAppIcon(image);}).catch(e=>setError(String(e)))}>アプリアイコンを選択（PNG / ICO）</button><button className="quiet-button" onClick={()=>{setShareTable(null);setSharingDocument(undefined);setModal('share');}}>アカウント・共有の接続設定を開く</button><p className="modal-description">Microsoft 365 / Fluentの配色を参考にしています。</p><label className="form-field">カラープロファイル<select value={prefs.theme} onChange={e => savePrefs({theme:e.target.value})}><option value="light">ライト</option><option value="dark">ダーク</option></select></label><label className="form-field">出力画像の配色<select value={prefs.imageExportTheme||'light'} onChange={e=>savePrefs({imageExportTheme:e.target.value as ImageExportTheme})}><option value="light">白基調（初期設定）</option><option value="dark">ダーク</option><option value="screen">画面に合わせる</option></select></label><label className="form-field">アクセントカラー<select value={prefs.accent} onChange={e => savePrefs({accent:e.target.value})}><option value="#0f6cbd">Office ブルー</option><option value="#107c41">Excel グリーン</option><option value="#5b5fc7">Teams パープル</option></select></label><label className="form-field">フォント<select value={prefs.fontFamily} onChange={e => savePrefs({fontFamily:e.target.value})}><option value="Segoe UI">Segoe UI</option><option value="Yu Gothic UI">游ゴシック UI</option><option value="Meiryo">メイリオ</option><option value="Consolas">Consolas</option></select></label><label className="form-field">文字サイズ<input type="number" min={10} max={24} value={prefs.fontSize} onChange={e => savePrefs({fontSize:Math.max(10,Math.min(24,Number(e.target.value)||13))})}/></label><div className="modal-actions"><button className="primary" onClick={() => setModal('')}>完了</button></div></>}
      {modal === 'goto' && <><p className="modal-description">現在表示されている順序の行と列へ移動します。</p><label className="form-field">行番号 (1〜{count(meta?.count||0)})<input autoFocus type="number" min={1} max={meta?.count} value={gotoRow} onChange={e => setGotoRow(e.target.value)}/></label><label className="form-field">列番号 (1〜{meta?.columns||0})<input type="number" min={1} max={meta?.columns} value={gotoCol} onChange={e => setGotoCol(e.target.value)}/></label><div className="modal-actions"><button className="primary" onClick={() => { revealCell((Number(gotoRow)||1)-1,(Number(gotoCol)||1)-1); setModal(''); }}>移動</button></div></>}
      {['cell','headerCell'].includes(modal) && <><p className="modal-description">表示上の省略がない元のセル内容です。</p><textarea className="cell-full" readOnly value={modal==='headerCell'?headerCellValue:cellValue}/><div className="modal-actions"><button onClick={() => window.csv.clipboard(modal==='headerCell'?headerCellValue:cellValue).then(() => notify('セルをコピーしました'))}><Copy size={15}/>コピー</button><button className="primary" onClick={() => setModal('')}>閉じる</button></div></>}
      {modal === 'about' && <About icon={appIcon} onError={setError}/> }
      {modal === 'help' && <div className="help-content"><button className="primary" disabled={!!busy} onClick={tutorial.replay}>クリックして学ぶチュートリアル</button><p>CSV nyaan ViewerはCSV・Markdown・TXTを直接読み込むWindows用ビューワーです。元ファイルを保存・更新する操作はありません。</p><table><tbody>{[['Ctrl+O','ファイルを開く（複数選択可）'],['Ctrl+F / F3 / Shift+F3','検索 / 次を検索 / 前を検索'],['Ctrl+G','行・列へ移動'],['Ctrl+C / Ctrl+A','選択範囲をコピー / 全選択'],['Shift+クリック・矢印','選択範囲を広げる'],['Ctrl+矢印 / Ctrl+Shift+矢印','連続データの端へ移動 / 範囲拡張'],['Ctrl+Space / Shift+Space','列選択 / 行選択'],['Home / End / Ctrl+Home / Ctrl+End','行端 / 表の先頭・末尾へ移動'],['Ctrl+R / Ctrl+W','再読み込み / タブを閉じる'],['Ctrl+Shift+E','ファイル → エクスポート'],['Ctrl+Shift+L','ライト／ダーク切り替え']].map(([key,value]) => <tr key={key}><td><kbd>{key}</kbd></td><td>{value}</td></tr>)}</tbody></table><p>見出し中央で行・列を選択し、ドラッグで複数選択します。見出しの左側で表示を切り替え、右側で昇順・降順・元の順序を選べます。右クリックで操作メニューを開けます。境界をドラッグすると幅を変更できます。境界のダブルクリックで、画面上の内容に幅を合わせます。セルのダブルクリックで全文を表示します。</p><p>文字化けや区切りの誤判定は「ファイル → 読み込み設定」で指定し直せます。自動文字コード判定はBOM・UTF-8・UTF-16を優先し、その他はCP932を候補とします。</p><p>大容量CSVはレコードの位置だけを保持して必要な部分を読みます。Markdownプレビューは16 MiB以内です。大きい文書はソース表示で閲覧できます。</p><button className="quiet-button" onClick={()=>showModal('about')}>このアプリについて</button></div>}
    </section></div>}
  </div></ImageExportThemeContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<App/>);
