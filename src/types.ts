export type Kind = 'csv' | 'text' | 'markdown' | 'excel';
export interface Meta { sheets?:string[];sheet?:string;requestedHeaderRows?:number;excludedRows?:number[];sourceUrl?:string;name?:string;id: string; kind: Kind; path: string; size: number; encoding: string; delimiter: string; bom: number; records: number; columns: number; headerRows: number; headerRecords: string[][]; headers: string[]; count: number; lineEndings: string; warnings: string[] }
export interface Row { index: number; source: number; cells: string[] }
export interface Filter { column: number; mode: string; value: string; caseSensitive?: boolean }
export interface Sort { column: number; direction: string; mode: string }
export interface Selection { row0: number; row1: number; col0: number; col1: number }
export interface Tab { sheetViews?:Record<string,import('./analysis-types').SheetView>; selectionExplicit?:boolean; meta: Meta; filters: Filter[]; sorts: Sort[]; hidden: number[]; hiddenRows?:number[]; excludedRows?:number[]; deletedColumns?:number[]; columnOrder?:number[]; columnFilter?:number[]; frozen: number; widths: Record<number, number>; selection: Selection | null; ranges?: Selection[]; scrollTop: number; scrollLeft: number; preview: boolean }
export interface PaneSize { width?: number; height?: number }
export interface Preferences { dockLayout?:import('./dock-state').DockLayout; imageExportTheme?:import('./export-theme').ImageExportTheme; theme?: string; fontSize?: number; fontFamily?: string; accent?: string; previewPosition?: string; mergePosition?: string; dockSizes?: Partial<Record<'top'|'bottom'|'left'|'right', PaneSize>>; sidebarWidth?:number; recent?: string[] }
declare global { interface Window { csv: {
  icon():Promise<string|null>;
  chooseIcon():Promise<string|null>;
  connections(): Promise<import('./sharing').ConnectionStatus>;
  sAccounts():Promise<import('./s-sharing').SAccount[]>;
  sServices():Promise<import('./s-sharing').SService[]>;
  sOpen(options:import('./s-sharing').SOpenOptions):Promise<import('./s-sharing').SOpenResult>;
  sLogout(provider:string):Promise<import('./s-sharing').SAccount[]>;
  onSAccounts(callback:(accounts:import('./s-sharing').SAccount[])=>void):()=>void;
  onConnectionsChanged(callback:(status:import('./sharing').ConnectionStatus)=>void):()=>void;
  configureConnection(provider:string, config: Record<string,string>): Promise<import('./sharing').ConnectionStatus>;
  login(provider:string): Promise<import('./sharing').ConnectionStatus>;
  cancelLogin(): Promise<void>;
  logout(provider:string): Promise<import('./sharing').ConnectionStatus>;
  share(options:unknown): Promise<import('./sharing').ShareResult>;
  shareBrowser(options:unknown): Promise<import('./sharing').ShareResult>;
  openExternal(url:string): Promise<void>;
  onAuth(callback:(info:{provider:string;code:string;url:string})=>void):()=>void;
  dialog(): Promise<string[]>;
  open(path: string, options?: Record<string, unknown>): Promise<Meta>;
  openUrl(url:string):Promise<Meta>;
  close(id: string): Promise<void>;
  cancel(): Promise<void>;
  request<T>(id: string, method: string, args: unknown): Promise<T>;
  saveDocument(blocks:import('./data').MergeBlock[]): Promise<{path:string;size:number;assets:number}|null>;
  image(id:string,url:string):Promise<string>;
  saveTable(table: import('./data').TableData, format: string): Promise<{path:string;size:number}|null>;
  analyzeMany(sources:(import('./analysis-types').AnalysisSource|{name:string;table:import('./analysis-types').SavedTable})[],options?:import('./analysis-types').AnalysisOptions):Promise<import('./analysis-types').AnalysisResult>;
  saveAnalysis(document:import('./analysis-types').AnalysisDocument,format:'md'|'xlsx'):Promise<string|null>;
  savePlot(data:string,format:'png'|'gif'|'obj',name:string):Promise<string|null>;
  saveChart(data:string, format:string): Promise<string|null>;
  export(id: string, options: Record<string, unknown>): Promise<{ path: string; size: number } | null>;
  clipboard(text: string): Promise<void>;
  preferences(patch?: Preferences): Promise<Preferences>;
  reveal(path: string): Promise<void>;
  filePath(file: File): string;
  onCommand(callback: (command: string) => void): () => void;
  onProgress(callback: (progress: { id: string; value: number }) => void): () => void;
  onPaths(callback: (paths: string[]) => void): () => void;
} } }
