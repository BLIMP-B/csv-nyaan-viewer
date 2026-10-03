import {launchWithoutTutorial} from './electron-profile';
import {test,expect,type ElectronApplication,type Page} from '@playwright/test';
import {readableText} from './ui-contrast';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const XLSX=require('@e965/xlsx'),root=process.cwd(),out=fs.mkdtempSync(path.join(os.tmpdir(),'csv-profile-ui-')),target=path.join(out,'Generic.xlsx');
const book=XLSX.utils.book_new(),rows=[['店舗コード','年月','分類','Temperature','Humidity'],...Array.from({length:12},(_,i)=>[4100+i,2401+i%3,i%2,i+1,(i+1)*2])];
XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),'Observations');XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),'Copy');XLSX.writeFile(book,target);
const original=fs.readFileSync(target);let app:ElectronApplication,page:Page;
test.describe.configure({mode:'serial'});
test.beforeAll(async()=>{app=await launchWithoutTutorial({args:['--no-sandbox','--user-data-dir='+path.join(out,'profile'),'.',target],cwd:root,env:{...process.env,CSV_LENS_TEST:'1'}});page=await app.firstWindow();await expect(page.locator('[data-row="0"][data-col="3"]')).toHaveText('1',{timeout:30000});await page.getByLabel('左ペインを開閉').click();await page.getByRole('tab',{name:'多変量分析（ファイル全域）',exact:true}).click();await expect(page.locator('.analysis-pca')).toBeVisible();});
test.afterAll(async()=>{await app.close();expect(fs.readFileSync(target)).toEqual(original);});
test('自動判断の除外理由を確認し、列別チェックで使用・除外を変更して出力する',async()=>{
 await page.locator('.analysis-decisions summary').click();const id=page.getByLabel('店舗コードを分析に含める',{exact:true});await expect(id).not.toBeChecked();await expect(page.getByLabel('Temperatureを分析に含める',{exact:true})).toBeChecked();await id.check();await expect(id).toBeChecked();await expect(page.locator('.analysis-decisions')).toContainText('ユーザー設定');
 await page.getByLabel('Humidityを分析に含める',{exact:true}).uncheck();await expect(page.getByLabel('Humidityを分析に含める',{exact:true})).not.toBeChecked();await expect(page.locator('.analysis-pca .pca-categories')).not.toContainText('Humidity');
 const md=path.join(out,'rules.md');await app.evaluate(({dialog},md)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:md});},md);await page.getByRole('button',{name:'分析を.md出力',exact:true}).click();await expect.poll(()=>fs.existsSync(md)).toBe(true);const text=fs.readFileSync(md,'utf8');expect(text).toContain('対象・除外・合流の判断結果');expect(text).toContain('ユーザー指定');expect(text).toContain('店舗コード');expect(text).toContain('照合キー');
 await page.locator('.analysis-settings summary').click();await page.getByRole('button',{name:'自動判断に戻す',exact:true}).click();await expect(page.getByLabel('店舗コードを分析に含める',{exact:true})).not.toBeChecked();await expect(page.getByLabel('Humidityを分析に含める',{exact:true})).toBeChecked();
});
test('複数表の同名列を列別または全体のチェックボックスで別系列にする',async()=>{
 await page.getByRole('radio',{name:'すべてを集計',exact:true}).check();await page.getByLabel('すべてを集計を実行').click();await expect(page.locator('.analysis-alignment')).toContainText('合流した列 5');
 const humidity=page.getByLabel('Humidityを同名列で合流',{exact:true});await humidity.uncheck();await expect(humidity).not.toBeChecked();await expect(page.locator('.analysis-alignment')).toContainText('合流した列 4');
 await page.getByLabel('同名列を自動合流',{exact:true}).uncheck();await expect(page.locator('.analysis-alignment')).toContainText('合流した列 0');await expect(page.locator('.analysis-decisions')).toContainText('別系列');
 const xlsx=path.join(out,'rules.xlsx');await app.evaluate(({dialog},xlsx)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:xlsx});},xlsx);await page.getByRole('button',{name:'分析を.xlsx出力',exact:true}).click();await expect.poll(()=>fs.existsSync(xlsx)).toBe(true);const result=XLSX.readFile(xlsx);expect(XLSX.utils.sheet_to_csv(result.Sheets['分析結果'])).toContain('同名列の自動合流：無効');
 for(const theme of ['light','dark'])for(const accent of ['#0f6cbd','#107c41','#5b5fc7']){await page.getByLabel('設定',{exact:true}).click();await page.getByLabel('カラープロファイル').selectOption(theme);await page.getByLabel('アクセントカラー').selectOption(accent);await page.getByRole('button',{name:'完了',exact:true}).click();await readableText(page);}
});
