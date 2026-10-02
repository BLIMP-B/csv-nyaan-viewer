import { numeric, type TableData } from './data';
import type { Palette } from './chart-catalog';
export type Axis = 'x' | 'y';
export interface AxisSettings { title: string; min: string; max: string; digits: string; labels?: string[] }
export interface ChartSettings { x: AxisSettings; y: AxisSettings; palette?:Palette }
export interface ChartSpec { type: string; table: TableData; settings: ChartSettings }
export function defaultChartSettings(): ChartSettings {
  return { x: { title: '', min: '', max: '', digits: 'auto' }, y: { title: '', min: '', max: '', digits: 'auto' },palette:'fluent' };
}
export function validateAxis(settings: AxisSettings, numerical: boolean, labelCount: number): string | null {
  if (numerical) {
    const min = settings.min.trim() ? numeric(settings.min) : null, max = settings.max.trim() ? numeric(settings.max) : null;
    if (settings.min.trim() && min === null || settings.max.trim() && max === null) return '目盛りの最小値・最大値には有限の数値を入力してください。';
    if (min !== null && max !== null && min >= max) return '最大値は最小値より大きくしてください。';
  }
  if (!['auto','0','1','2','3','4','5','6','7','8'].includes(settings.digits)) return '小数桁は自動、または0〜8を指定してください。';
  if (settings.labels && settings.labels.length !== labelCount) return `ラベルは${labelCount}行で指定してください。`;
  return null;
}
export function cloneChartSpec(type: string, table: TableData, settings: ChartSettings): ChartSpec {
  return structuredClone({ type, table, settings });
}
