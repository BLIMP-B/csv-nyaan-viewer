import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test.describe.configure({ mode: 'serial' });
const root = process.cwd(), out = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-nyaan-sheets-'));
const XLSX = require('@e965/xlsx');
const names = Array.from({ length: 20 }, (_, i) => `シート${String(i + 1).padStart(2, '0')}_売上と費用`);
const workbook = XLSX.utils.book_new(), file = path.join(out, 'Many.xlsx');
names.forEach((name, i) => XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(i === 19 ? [] : i === 0 ? [['ID', 'Value'], ['0001', 10], ['0002', 20]] : [['X', 'Y'], [i, i * 10]]), name));
XLSX.writeFile(workbook, file);
const original = fs.readFileSync(file);
let app: ElectronApplication, page: Page;
const errors: string[] = [];
const cell = (r: number, c: number) => page.locator(`[data-row="${r}"][data-col="${c}"]`);
const sheet = (i: number) => page.getByRole('tab', { name: names[i], exact: true });
test.beforeAll(async () => {
  app = await electron.launch({ args: ['--no-sandbox', '--user-data-dir=' + path.join(out, 'profile'), '.', file], cwd: root, env: { ...process.env, CSV_LENS_TEST: '1' } });
  page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  await expect(cell(0, 0)).toHaveText('0001', { timeout: 30000 });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1100, 640));
});
test.afterAll(async () => { await app.close(); expect(errors).toEqual([]); expect(fs.readFileSync(file)).toEqual(original); });

test('全シートを下部タブに並べ、クリック・キー・横スクロールで切り替える', async () => {
  const tabs = page.getByRole('tablist', { name: 'ワークシート' });
  await expect(tabs.getByRole('tab')).toHaveCount(20);
  await expect(tabs.getByRole('tab')).toHaveText(names);
  await expect(page.locator('.toolbar select[aria-label="ワークシート"]')).toHaveCount(0);
  const grid = (await page.locator('.grid-scroll').boundingBox())!, bar = (await page.locator('.worksheet-bar').boundingBox())!, inspector = (await page.locator('.inspector').boundingBox())!;
  expect(bar.y).toBeCloseTo(grid.y + grid.height, 0); expect(inspector.y).toBeCloseTo(bar.y + bar.height, 0); expect(bar.height).toBeLessThanOrEqual(34);
  await expect(sheet(0)).toHaveAttribute('aria-selected', 'true');
  await sheet(0).focus(); await sheet(0).press('ArrowRight');
  await expect(sheet(1)).toHaveAttribute('aria-selected', 'true'); await expect(sheet(1)).toBeFocused(); await expect(cell(0, 1)).toHaveText('10');
  await expect(page.locator('[data-header-row="0"] [data-header-col="0"]')).toHaveText('X');
  await sheet(1).press('End'); await expect(sheet(19)).toHaveAttribute('aria-selected', 'true'); await expect(sheet(19)).toBeInViewport();
  await expect(page.locator('.no-rows')).toHaveText('空のファイルです'); await expect(tabs.getByRole('tab')).toHaveCount(20);
  await sheet(19).press('Home'); await expect(sheet(0)).toHaveAttribute('aria-selected', 'true'); await expect(cell(0, 0)).toHaveText('0001');
  await page.getByLabel('シートタブを右にスクロール', { exact: true }).click(); await expect.poll(() => tabs.evaluate(el => el.scrollLeft)).toBeGreaterThan(100);
  await expect(sheet(0)).toHaveAttribute('aria-selected', 'true'); await page.getByLabel('シートタブを左にスクロール', { exact: true }).click(); await expect.poll(() => tabs.evaluate(el => el.scrollLeft)).toBe(0);
  await page.getByRole('button', { name: 'フィルター', exact: true }).click(); await page.getByLabel('条件1の値').fill('0001'); await page.getByRole('button', { name: '適用', exact: true }).click(); await expect(page.locator('.filter-summary')).toBeVisible();
  await page.locator('.column-head[data-head-index="1"] .header-eye-zone').hover(); await page.getByLabel('列Bを非表示', { exact: true }).click(); await expect(cell(0, 1)).toHaveClass(/cell-concealed/);
  await sheet(1).click(); await expect(cell(0, 0)).toHaveText('1'); await expect(cell(0, 1)).not.toHaveClass(/cell-concealed/); await expect(page.locator('.filter-summary')).toHaveCount(0); await expect(page.getByRole('button', { name: 'フィルター', exact: true })).not.toHaveClass(/applied/);
  await sheet(0).click(); await expect(cell(1, 0)).toHaveText('0002');
});

test('ファイル別のシート一覧、単一シートとCSV、全テーマの読みやすさを確認する', async () => {
  async function openWorkbook(name: string, sheets: string[]) {
    const book = XLSX.utils.book_new(), target = path.join(out, name);
    for (const title of sheets) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['名前', '値'], ['項目', 1]]), title);
    XLSX.writeFile(book, target); await app.evaluate(({ BrowserWindow }, target) => BrowserWindow.getAllWindows()[0].webContents.send('csv:paths', [target]), target);
    await expect(page.locator('.document-heading h1')).toContainText(name); await expect(cell(0, 0)).toHaveText('項目');
  }
  await openWorkbook('Single.xlsx', ['1枚だけ']); await expect(page.getByRole('tablist', { name: 'ワークシート' })).toHaveCount(0);
  await openWorkbook('Other.xlsx', ['営業 & 開発（Q1）', '集計']); await expect(page.getByRole('tablist').getByRole('tab')).toHaveText(['営業 & 開発（Q1）', '集計']);
  await page.locator('.tabbar').getByRole('button', { name: 'Many.xlsx', exact: true }).click(); await expect(page.getByRole('tablist').getByRole('tab')).toHaveText(names); await expect(cell(0, 0)).toHaveText('0001');
  for (const theme of ['light', 'dark']) {
    for (const accent of ['#0f6cbd', '#107c41', '#5b5fc7']) {
      await page.getByLabel('設定', { exact: true }).click(); await page.getByLabel('カラープロファイル').selectOption(theme); await page.getByLabel('アクセントカラー').selectOption(accent); await page.getByRole('button', { name: '完了', exact: true }).click();
      const contrasts = await page.locator('.worksheet-tab').evaluateAll(buttons => {
        const context = document.createElement('canvas').getContext('2d')!;
        function luminance(color: string) { context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1); const rgb = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3).map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722; }
        return buttons.map(button => { const style = getComputedStyle(button), bg = button.getAttribute('aria-selected') === 'true' ? style.backgroundColor : getComputedStyle(button.closest('.worksheet-bar')!).backgroundColor, a = luminance(style.color), b = luminance(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); });
      });
      expect(Math.min(...contrasts)).toBeGreaterThanOrEqual(4.5);
    }
    await page.locator('.main-panel').screenshot({ path: `docs/images/worksheet-tabs-${theme}.png` });
  }
  await app.evaluate(({ BrowserWindow }, sample) => BrowserWindow.getAllWindows()[0].webContents.send('csv:paths', [sample]), path.join(root, 'samples/sales.csv')); await expect(cell(0, 1)).toHaveText('1200000'); await expect(page.getByRole('tablist', { name: 'ワークシート' })).toHaveCount(0);
});
