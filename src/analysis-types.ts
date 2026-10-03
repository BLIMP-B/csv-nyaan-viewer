import type {Tab, Selection} from './types';
export interface VariableSummary {
  name:string;column:number;plot:{row:number;order?:number;value:number|null}[];
  stats:{n:number;missing:number;mean:number|null;sd:number|null;variance:number|null;min:number|null;max:number|null;median:number|null;q1:number|null;q3:number|null;iqr:number|null;cv:number|null;skew:number|null;outliers:number;rule:string;trend:{r2:number|null;slope:number|null;intercept:number|null};lag1:number|null};
}
export interface PairSummary {x:string;y:string;xColumn:number;yColumn:number;n:number;r:number|null;r2:number|null;spearman:number|null;rule:string;slope:number|null;intercept:number|null;plot:{x:number;y:number;row:number}[]}
export interface ClusterCentroid {cluster:number;count:number;values:number[];standard:number[]}
export interface PrincipalComponents {dimensions:string[];completeRows:number;explained:number[];loadings:number[][];scores:{values:number[];standard:number[];original:number[];row:number;cluster:number}[];clusters:number[];centroids?:ClusterCentroid[]}
export interface AnalysisOptions {autoExclude?:boolean;mergeSameName?:boolean;columnOverrides?:Record<string,boolean>;mergeColumns?:Record<string,boolean>}
export interface AnalysisDiagnostics {layout?:string;headerRow?:number;address?:string;notes:string[];excludedColumns:string[];keyColumns?:string[];settings?:{autoExclude:boolean;mergeSameName:boolean};mergeDecisions?:{name:string;count:number;enabled:boolean}[];columnDecisions?:{name:string;role:string;included:boolean;automatic:boolean;reason:string}[]}
export interface AnalysisResult {sheets?:{name:string;result:AnalysisResult}[];groups?:{name:string;result:AnalysisResult}[];diagnostics?:AnalysisDiagnostics;populationRows:number;sampledRows:number;populationColumns:number;sampledColumns:number;columnSummaries:VariableSummary[];pairs:PairSummary[];pairColumns:number;insights:string[];truncated:boolean;precisionWarning:boolean;correlatedOnly?:boolean;numericColumns?:number;alignment?:{mode:string;mergedColumns:number;conflictingColumns:number};pca:PrincipalComponents|null;sources?:{name:string;populationRows:number;populationColumns:number;sampledRows:number;sampledColumns:number}[]}
export type SheetView = Pick<Tab,'filters'|'sorts'|'hidden'|'hiddenRows'|'excludedRows'|'deletedColumns'|'columnOrder'|'columnFilter'|'frozen'|'widths'|'selection'|'ranges'|'selectionExplicit'|'scrollTop'|'scrollLeft'>;
export interface AnalysisSource {id:string;sheet?:string;name:string;selections?:Selection[];view?:SheetView;all?:boolean}
export interface SavedTable {id:string;name:string;color:string;fileId:string;fileName:string;sheet?:string;address:string;headers:string[];rows:string[][];sourceRows:number[];sourceColumns:number[];mask:number[][];rowLabels?:(string|null)[];columnRoles?:string[];keySchema?:string;keyColumns?:string[]}
export interface ExportSection {title:string;paragraphs:string[];tables?:{headers:string[];rows:(string|number|null)[][]}[]}
export interface PlotAsset {title:string;image:string;headers:string[];rows:(number|string|null)[][]}
export interface AnalysisDocument {name:string;sections:ExportSection[];plots:PlotAsset[]}
export const formatNumber=(v:number|null|undefined)=>v===null||v===undefined||!Number.isFinite(v)?'—':new Intl.NumberFormat('ja-JP',{maximumSignificantDigits:5}).format(v);
