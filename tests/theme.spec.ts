import {launchWithoutTutorial} from './electron-profile';
import {test,expect,type ElectronApplication,type Page} from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readableText} from './ui-contrast';

const root=process.cwd(),profile=fs.mkdtempSync(path.join(os.tmpdir(),'csv-theme-ui-'));
let app:ElectronApplication,page:Page;
test.describe.configure({mode:'serial'});
test.beforeAll(async()=>{
  app=await launchWithoutTutorial({args:['--no-sandbox','--user-data-dir='+profile,'.',path.join(root,'samples/sales.csv')],cwd:root,env:{...process.env,CSV_LENS_TEST:'1'}});
  page=await app.firstWindow();await expect(page.locator('[data-row="0"][data-col="1"]')).toHaveText('1200000',{timeout:30000});
});
test.afterAll(async()=>{await app.close();});

test('ライト・ダークの全アクセントでメニュー・設定・共有・表の文字が読める',async()=>{
  await page.getByLabel('左ペインを開閉').click();
  await page.locator('[data-row="0"][data-col="1"]').click();await page.locator('[data-row="5"][data-col="3"]').click({modifiers:['Shift']});
  await expect(page.locator('.chart-area canvas')).toBeVisible();await page.getByTitle('ファイル結合',{exact:true}).click();await page.getByRole('button',{name:'選択',exact:true}).click();
  for(const theme of ['light','dark'] as const){
    for(const accent of ['#0f6cbd','#107c41','#5b5fc7']){
      await page.getByLabel('設定',{exact:true}).click();await page.getByLabel('カラープロファイル').selectOption(theme);await page.getByLabel('アクセントカラー').selectOption(accent);
      await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
      await expect.poll(()=>app.evaluate(({nativeTheme})=>nativeTheme.themeSource)).toBe(theme);
      await readableText(page);await page.getByRole('button',{name:'完了',exact:true}).click();await readableText(page);
      for(const mode of ['変量分析（選択範囲）','多変量分析（ファイル全域）','ワークスペース']){await page.getByRole('tab',{name:mode,exact:true}).click();if(mode!=='ワークスペース')await expect(page.locator('.analysis-variable')).not.toHaveCount(0);await readableText(page);}
      const columnCell=page.locator('[data-row="0"][data-col="1"]'),rowCell=page.locator('[data-row="0"][data-col="0"]');
      const normalColor=await columnCell.evaluate(el=>getComputedStyle(el).color);
      await page.locator('.column-head[data-head-index="1"] .header-eye-zone').hover();await page.getByLabel('列Bを非表示',{exact:true}).click();
      const rowHead=page.locator('.row-head[data-head-index="0"]');await rowHead.locator('.header-eye-zone').hover();await rowHead.getByTitle('非表示にする',{exact:true}).click();
      await expect(columnCell.locator('span')).toBeVisible();await expect(columnCell.locator('span')).toHaveText('1200000');await expect(columnCell).toHaveAttribute('title',/1200000/);
      await expect(rowCell.locator('span')).toBeVisible();await expect(rowCell.locator('span')).toHaveText('1月');
      expect(await columnCell.evaluate(el=>getComputedStyle(el).color)).not.toBe(normalColor);await readableText(page);
      await page.getByLabel('列Bを表示',{exact:true}).click();await expect(columnCell).toHaveClass(/cell-concealed/);
      await rowHead.getByTitle('表示する',{exact:true}).click();await expect(columnCell).not.toHaveClass(/cell-concealed/);await expect(rowCell).not.toHaveClass(/cell-concealed/);
      await expect(columnCell).toHaveCSS('color',normalColor);
      await page.locator('.menubar').getByRole('button',{name:'ファイル',exact:true}).click();await readableText(page);await page.locator('.menu-shield').click({position:{x:800,y:400}});
    }
    await page.getByRole('tab',{name:'変量分析（選択範囲）',exact:true}).click();
    const sidebar=(await page.locator('.sidebar').boundingBox())!;await page.screenshot({path:'docs/images/sidebar-mode-tabs-'+theme+'.png',clip:{x:sidebar.x,y:sidebar.y,width:sidebar.width,height:220}});
    await page.getByRole('tab',{name:'ワークスペース',exact:true}).click();
    for(const name of ['フィルター','並べ替え','エクスポート']){
      await page.getByRole('button',{name,exact:true}).click();await readableText(page);await page.getByLabel('ダイアログを閉じる').click();
    }
    await page.locator('.menubar').getByRole('button',{name:'ヘルプ',exact:true}).click();await readableText(page);await page.getByRole('button',{name:'このアプリについて',exact:true}).click();await readableText(page);await page.getByLabel('ダイアログを閉じる').click();
    await page.locator('.menubar').getByRole('button',{name:'共有',exact:true}).click();await expect(page.getByLabel('共有先')).toBeVisible();await readableText(page);
    await page.getByRole('button',{name:'接続設定',exact:true}).click();await expect(page.getByLabel('OAuthクライアントID')).toBeVisible();await readableText(page);await page.getByLabel('共有画面を閉じる').click();
    await page.getByLabel('グラフ種類').selectOption('column');
    const chart=page.locator('.chart-area'),xAxis=(await chart.getByRole('button',{name:'X軸を編集',exact:true}).boundingBox())!,yAxis=(await chart.getByRole('button',{name:'Y軸を編集',exact:true}).boundingBox())!;
    await page.mouse.move(xAxis.x+xAxis.width/12,yAxis.y+yAxis.height*.97);
    await expect(page.locator('.chart-tooltip')).toBeVisible();await expect(page.locator('.chart-tooltip')).toHaveCSS('opacity','1');await readableText(page);
    await page.getByLabel('設定',{exact:true}).hover();
    const popupPromise=app.waitForEvent('window');await page.getByLabel('グラフプレビューを別ウィンドウにする').click();const popup=await popupPromise;await expect(popup.locator('canvas')).toBeVisible();await readableText(popup);await popup.getByLabel('メインウィンドウに戻す').click();
  }
});

test('両テーマで警告・エラーと分析図を確認する',async()=>{
  const warning=path.join(profile,'warning.csv');fs.writeFileSync(warning,'名前,数値\nA,1\nB,2,3\n');
  for(const theme of ['light','dark'] as const){
    await page.getByLabel('設定',{exact:true}).click();await page.getByLabel('カラープロファイル').selectOption(theme);await page.getByRole('button',{name:'完了',exact:true}).click();
    await page.getByRole('tab',{name:'多変量分析（ファイル全域）',exact:true}).click();await expect(page.locator('.analysis-pca .analysis-plot')).toBeVisible();
    await expect(page.locator('.analysis-pca line').first()).not.toHaveCSS('stroke','none');await readableText(page);
    await page.getByRole('tab',{name:'ワークスペース',exact:true}).click();
    await page.getByLabel('オンラインExcel・スプレッドシートURL').fill('invalid-url');await page.locator('.online-bar').getByRole('button',{name:'開く',exact:true}).click();await expect(page.locator('.error-banner')).toBeVisible();await readableText(page);await page.locator('.error-banner button').click();
    await page.locator('.tab').first().getByRole('button').first().click();
    await page.locator('.dock-slot.bottom').getByRole('button',{name:'Y軸を編集',exact:true}).click();await page.getByLabel('軸の最小値').fill('10');await page.getByLabel('軸の最大値').fill('1');await page.locator('.axis-editor').getByRole('button',{name:'適用',exact:true}).click();await expect(page.locator('.axis-error')).toBeVisible();await readableText(page);await page.getByLabel('軸編集を閉じる').click();
    await app.evaluate(({BrowserWindow},file)=>BrowserWindow.getAllWindows()[0].webContents.send('csv:paths',[file]),warning);await expect(page.locator('.warning')).toBeVisible();await readableText(page);
    await page.locator('.tab').first().getByRole('button').first().click();
  }
});
