import {launchWithoutTutorial} from './electron-profile';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
test.describe.configure({mode:'serial'});
let app:ElectronApplication,page:Page;
const errors:string[]=[], root=process.cwd(),output=fs.mkdtempSync(path.join(os.tmpdir(),'csv-lens-ui-'));
test.beforeAll(async()=>{
  app=await launchWithoutTutorial({args:['--no-sandbox','--user-data-dir='+path.join(output,'profile'),'.',path.join(root,'samples/sales.csv')],cwd:root,env:{...process.env,CSV_LENS_TEST:'1'}});
  page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));
  await expect(page.locator('.document-heading h1')).toContainText('sales.csv',{timeout:30000});
  await expect(page.locator('[data-row="0"][data-col="1"]')).toHaveText('1200000',{timeout:30000});
});
test.afterAll(async()=>{await app.close();expect(errors).toEqual([]);});
test('最上段のメニュー・左ペイン開閉・コンパクトなファイル情報',async()=>{
  const bundledIcon=fs.readFileSync(path.join(root,'assets/icon.png'));
  const actualIcon=await page.evaluate(()=>window.csv.icon());
  expect(Buffer.from(actualIcon!.split(',')[1],'base64').subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(await app.evaluate(({nativeImage},p)=>nativeImage.createFromPath(p).toDataURL(),path.join(root,'assets/icon.png'))).toBe(actualIcon);
  await expect(page.locator('.workspace-toggle .app-icon')).toBeVisible();
  expect(await page.locator('.app-icon').evaluate((el:HTMLImageElement)=>({width:el.naturalWidth,height:el.naturalHeight}))).toEqual({width:200,height:200});
  expect(bundledIcon.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
  await expect(page.locator('.compact-titlebar')).not.toContainText('CSV nyaan Viewer');await expect(page.locator('.subtitle')).toHaveCount(0);await expect(page.locator('.sidebar')).toHaveCount(0);
  for(const label of ['ファイル','検索','移動','ヘルプ','共有','接続'])await expect(page.locator('.menubar').getByRole('button',{name:label,exact:true})).toBeVisible();
  await expect(page.locator('.compact-titlebar .online-bar')).toBeVisible();
  for(const width of [1000,1440]){
    await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setContentSize(width,940),width);
    await expect.poll(async()=>(await page.locator('.compact-titlebar').boundingBox())!.width).toBe(width);
    const connect=(await page.locator('.menubar').getByRole('button',{name:'接続',exact:true}).boundingBox())!,url=(await page.locator('.online-bar').boundingBox())!,controls=(await page.locator('.titlebar-right').boundingBox())!,header=(await page.locator('.compact-titlebar').boundingBox())!;
    expect(url.x).toBeGreaterThanOrEqual(connect.x+connect.width);expect(url.x+url.width).toBeLessThanOrEqual(controls.x);expect(url.width).toBeGreaterThan(100);expect(url.y).toBeGreaterThanOrEqual(header.y);expect(url.y+url.height).toBeLessThanOrEqual(header.y+header.height);expect(header.height).toBe(34);
  }
  await page.getByLabel('左ペインを開閉').click();await expect(page.locator('.sidebar')).toBeVisible();await page.getByLabel('左ペインを開閉').click();await expect(page.locator('.sidebar')).toHaveCount(0);
  expect((await page.locator('.document-heading').boundingBox())!.height).toBeLessThanOrEqual(40);
  await page.locator('.menubar').getByRole('button',{name:'ヘルプ',exact:true}).click();await page.getByRole('button',{name:'このアプリについて',exact:true}).click();
  const about=page.getByRole('dialog');await expect(about).toContainText('BLINP_B(furoneko+)');await expect(about.getByRole('link',{name:/GitHub/})).toHaveAttribute('href','https://github.com/yosu-yosu');await expect(about.getByRole('link',{name:/ウェブサイト/})).toHaveCount(0);await expect(about.getByRole('link')).toHaveCount(1);
  await app.evaluate(({shell})=>{(globalThis as any).aboutUrls=[];shell.openExternal=async url=>{(globalThis as any).aboutUrls.push(url);};});
  await about.getByRole('link',{name:/GitHub/}).click();await expect.poll(()=>app.evaluate(()=>(globalThis as any).aboutUrls)).toEqual(['https://github.com/yosu-yosu']);
  await page.getByLabel('ダイアログを閉じる').click();
});
test('検索・フィルター・自然順ソート・非破壊読み込み',async()=>{
  await page.getByRole('button',{name:'フィルター',exact:true}).click();
  await page.getByLabel('条件1の値').fill('2月');await page.getByRole('button',{name:'適用',exact:true}).click();
  await expect(page.locator('.filter-summary')).toContainText('1件を表示');
  await page.getByRole('button',{name:'フィルターを解除'}).click();
  await expect(page.locator('.statusbar')).toContainText('6レコード');
  await page.getByRole('button',{name:'検索',exact:true}).first().click();await page.getByLabel('検索語').fill('6月');await page.getByLabel('検索語').press('Enter');
  await expect(page.locator('.inspector pre')).toHaveText('6月');await page.getByLabel('検索を閉じる').click();
});
test('飛び飛び選択、見出し推定、グラフ自動展開・PNG・選択Markdown',async()=>{
  await page.locator('[data-row="0"][data-col="1"]').click();
  await page.locator('[data-row="3"][data-col="1"]').click({modifiers:['Shift']});
  await page.locator('[data-row="0"][data-col="3"]').click({modifiers:['Control']});
  await page.locator('[data-row="3"][data-col="3"]').click({modifiers:['Shift']});
  await expect(page.locator('.dock-slot.bottom canvas')).toBeVisible();
  await expect(page.locator('[data-row="1"][data-col="2"]')).toHaveAttribute('aria-selected','false');
  await expect(page.locator('[data-row="1"][data-col="3"]')).toHaveAttribute('aria-selected','true');
  await expect(page.locator('.dock-pane .pane-note').filter({hasText:'見出しを推定'})).toContainText('行ラベル');
  await page.getByLabel('グラフ種類').selectOption('line');
  await app.evaluate(({dialog},target)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:target});},path.join(output,'chart.png'));
  await page.locator('.chart-area').click({button:'right',position:{x:250,y:25}});await page.getByRole('button',{name:'画像として保存（PNG）'}).click();
  await expect.poll(()=>fs.existsSync(path.join(output,'chart.png'))).toBe(true);
  expect(fs.readFileSync(path.join(output,'chart.png')).subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
  await app.evaluate(({dialog},target)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:target});},path.join(output,'selected.md'));
  await page.getByRole('button',{name:'選択を.md出力'}).click();await page.getByRole('button',{name:'保存先を選んで出力'}).click();
  await expect.poll(()=>fs.existsSync(path.join(output,'selected.md'))).toBe(true);
  expect(fs.readFileSync(path.join(output,'selected.md'),'utf8')).toContain('| 売上 | 利益 |');
  await page.locator('.toast').waitFor({state:'hidden'});await page.screenshot({path:'docs/images/dashboard-light.png'});
});
test('下段の軸をホバーで選択し、クリックで編集・出力・移動後も保持',async()=>{
  const bottom=page.locator('.dock-slot.bottom');
  await bottom.getByRole('button',{name:'Y軸を編集',exact:true}).hover();await expect(bottom.locator('.axis-hit.axis-hover')).toHaveAttribute('aria-label','Y軸を編集');
  await bottom.getByRole('button',{name:'Y軸を編集',exact:true}).click();
  const editor=page.getByRole('dialog',{name:'Y軸の編集'});
  await editor.getByLabel('軸名',{exact:true}).fill('金額（円）');await editor.getByLabel('軸の最小値').fill('0');await editor.getByLabel('軸の最大値').fill('100');await editor.getByLabel('軸の最小値').fill('200');
  await editor.getByRole('button',{name:'適用',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('最大値は最小値より大きく');
  await editor.getByLabel('軸の最小値').fill('0');await editor.getByLabel('軸の最大値').fill('2500000');await editor.getByLabel('目盛りの小数桁').selectOption('1');await editor.getByLabel('系列名',{exact:true}).fill('売上高\n営業利益');await editor.getByRole('button',{name:'適用',exact:true}).click();await expect(editor).toHaveCount(0);
  await bottom.getByRole('button',{name:'X軸を編集',exact:true}).click();const xEditor=page.getByRole('dialog',{name:'X軸の編集'});await xEditor.getByLabel('軸名',{exact:true}).fill('対象月');await xEditor.getByLabel('行ラベル',{exact:true}).fill('Jan\nFeb\nMar\nApr');await xEditor.getByRole('button',{name:'適用',exact:true}).click();
  await page.getByLabel('グラフプレビューの位置').selectOption('top');await page.getByLabel('グラフプレビューの位置').selectOption('bottom');await bottom.getByRole('button',{name:'Y軸を編集',exact:true}).click();await expect(page.getByLabel('軸名',{exact:true})).toHaveValue('金額（円）');await expect(page.getByLabel('軸の最大値')).toHaveValue('2500000');await page.getByLabel('軸編集を閉じる').click();
  await app.evaluate(({dialog},target)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:target});},path.join(output,'axes.png'));await bottom.getByRole('button',{name:'PNG保存',exact:true}).click();await expect.poll(()=>fs.existsSync(path.join(output,'axes.png'))).toBe(true);
  expect(fs.readFileSync(path.join(output,'axes.png')).equals(fs.readFileSync(path.join(output,'chart.png')))).toBe(false);
});
test('グラフ内のドット型つまみだけで描画サイズを変更し、ペインとデータ領域を変えず再表示・移動でも保持',async()=>{
  const bottom=page.locator('.dock-slot.bottom');await expect(page.locator('.dock-grip')).toHaveCount(0);
  const boundary=bottom.getByRole('separator',{name:'下ペインとデータの境界',exact:true});await boundary.focus();await boundary.press('Shift+ArrowUp');await boundary.press('Shift+ArrowUp');await boundary.press('Shift+ArrowUp');
  const plot=bottom.locator('.chart-resizable'),heightGrip=plot.getByRole('separator',{name:'グラフの高さを調整（上）',exact:true}),widthGrip=plot.getByRole('separator',{name:'グラフの幅を調整（右）',exact:true}),corner=plot.getByRole('button',{name:'グラフの幅と高さを調整（左上）',exact:true});
  async function dragGrip(grip:ReturnType<Page['locator']>,dx:number,dy:number){const rect=(await grip.boundingBox())!;await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();await page.mouse.move(rect.x+rect.width/2+dx,rect.y+rect.height/2+dy,{steps:10});await page.mouse.up();}
  await expect(plot.locator('.chart-grip')).toHaveCount(6);await expect(heightGrip.locator('circle')).toHaveCount(6);await expect(widthGrip.locator('circle')).toHaveCount(6);
  const initial=(await plot.boundingBox())!,pane=(await bottom.boundingBox())!,data=(await page.locator('.docking-editor').boundingBox())!;await expect.poll(()=>page.evaluate(()=>window.csv.preferences().then(p=>p.dockSizes?.bottom?.height))).toBeCloseTo(pane.height,0);const prefs=await page.evaluate(()=>window.csv.preferences());
  await dragGrip(heightGrip,0,60);await expect.poll(async()=>(await plot.boundingBox())!.height).toBeCloseTo(initial.height-60,0);
  await dragGrip(widthGrip,-180,0);await expect.poll(async()=>(await plot.boundingBox())!.width).toBeCloseTo(initial.width-180,0);
  await dragGrip(corner,-60,-40);await expect.poll(async()=>(await plot.boundingBox())!.width).toBeCloseTo(initial.width-120,0);await expect.poll(async()=>(await plot.boundingBox())!.height).toBeCloseTo(initial.height-20,0);
  expect(await bottom.boundingBox()).toEqual(pane);expect(await page.locator('.docking-editor').boundingBox()).toEqual(data);expect(await page.evaluate(()=>window.csv.preferences().then(p=>p.dockRatios))).toEqual(prefs.dockRatios);
  await expect.poll(async()=>{const canvas=(await bottom.locator('canvas').boundingBox())!,host=(await bottom.locator('.echart-host').boundingBox())!;return Math.max(Math.abs(canvas.height-host.height),Math.abs(canvas.width-host.width));}).toBeLessThan(1);
  const resized=(await plot.boundingBox())!;await page.getByLabel('グラフプレビューを閉じる').click();await page.locator('#dock-tab-chart').click();await expect.poll(async()=>(await plot.boundingBox())!.height).toBeCloseTo(resized.height,0);await expect.poll(async()=>(await plot.boundingBox())!.width).toBeCloseTo(resized.width,0);
  await bottom.getByRole('button',{name:'Y軸を編集',exact:true}).click();await expect(page.getByLabel('軸名',{exact:true})).toHaveValue('金額（円）');await page.getByLabel('軸編集を閉じる').click();
  await corner.hover();await page.screenshot({path:'docs/images/dot-resize-grips.png'});
  await dragGrip(heightGrip,0,2000);await expect.poll(async()=>(await plot.boundingBox())!.height).toBeCloseTo(140,0);await dragGrip(widthGrip,-2000,0);await expect.poll(async()=>(await plot.boundingBox())!.width).toBeCloseTo(220,0);
  await corner.dblclick();await expect.poll(async()=>(await plot.boundingBox())!.width).toBeCloseTo(initial.width,0);await expect.poll(async()=>(await plot.boundingBox())!.height).toBeCloseTo(initial.height,0);
  await heightGrip.focus();await heightGrip.press('ArrowDown');await expect.poll(async()=>(await plot.boundingBox())!.height).toBeCloseTo(initial.height-16,0);await heightGrip.press('Home');await expect.poll(async()=>(await plot.boundingBox())!.height).toBeCloseTo(initial.height,0);
  const box=(await widthGrip.boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x-80,box.y+box.height/2);await page.keyboard.press('Escape');await page.mouse.up();await expect.poll(async()=>(await plot.boundingBox())!.width).toBeCloseTo(initial.width,0);
});
test('結合ペイン・縦横結合・書き出し',async()=>{
  await page.getByTitle('ファイル結合',{exact:true}).click();await expect(page.locator('.dock-slot.right')).toBeVisible();
  await page.getByRole('button',{name:'選択',exact:true}).click();await expect(page.locator('.merge-block')).toHaveCount(1);
  await page.locator('.document-tools').getByRole('button',{name:'ファイル',exact:true}).click();await expect(page.locator('.merge-block')).toHaveCount(2);
  await page.locator('.table-merge-details summary').click();await page.getByLabel('結合方向').selectOption('columns');await expect(page.locator('.merge-summary')).toContainText('7列');
  await app.evaluate(({dialog},target)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:target});},path.join(output,'merged.csv'));
  await page.getByRole('button',{name:'出力',exact:true}).click();await expect.poll(()=>fs.existsSync(path.join(output,'merged.csv'))).toBe(true);
});
test('ペインの配置変更と別ウィンドウ・テーマ切り替え',async()=>{
  async function expectReadableOptions(target:Page,theme:'light'|'dark'){
    await expect(target.locator('html')).toHaveAttribute('data-theme',theme);
    const colors=await target.locator('select option,select optgroup').evaluateAll(items=>items.map(el=>({foreground:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor})));
    expect(colors.length).toBeGreaterThan(0);
    function luminance(color:string){
      const channels=color.match(/[\d.]+/g)!.map(Number);expect(channels[3]??1).toBe(1);
      const linear=channels.slice(0,3).map(value=>{const v=value/255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;});
      return linear[0]*0.2126+linear[1]*0.7152+linear[2]*0.0722;
    }
    for(const {foreground,background} of colors){
      const fg=luminance(foreground),bg=luminance(background);
      expect((Math.max(fg,bg)+0.05)/(Math.min(fg,bg)+0.05)).toBeGreaterThanOrEqual(4.5);
      if(theme==='dark')expect(bg).toBeLessThan(0.1);else expect(bg).toBeGreaterThan(0.9);
    }
  }
  await expectReadableOptions(page,'light');
  await page.getByLabel('グラフプレビューの位置').selectOption('top');await expect(page.locator('.dock-slot.top canvas')).toBeVisible();
  await page.getByLabel('グラフプレビューの位置').selectOption('bottom');
  const popupPromise=app.waitForEvent('window');await page.getByLabel('グラフプレビューを別ウィンドウにする').click();const popup=await popupPromise;
  await expect(popup.locator('canvas')).toBeVisible();await expectReadableOptions(popup,'light');
  await page.getByLabel('テーマを切り替え').click();await expectReadableOptions(page,'dark');await expectReadableOptions(popup,'dark');
  await page.getByLabel('テーマを切り替え').click();await expectReadableOptions(page,'light');await expectReadableOptions(popup,'light');
  await popup.getByLabel('メインウィンドウに戻す').click();await expect(page.locator('.dock-slot.bottom canvas')).toBeVisible();
  await page.getByLabel('テーマを切り替え').click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await expectReadableOptions(page,'dark');
  await page.locator('.toast').waitFor({state:'hidden'});await page.screenshot({path:'docs/images/dashboard-dark.png'});
  await page.getByLabel('ファイル結合を閉じる').click();await page.getByLabel('グラフプレビューを閉じる').click();
});
test('右側のグラフ軸・ブロック直接編集・別ウィンドウ・Markdown出力',async()=>{
  await page.getByTitle('ファイル結合',{exact:true}).click();
  await page.getByLabel('テキストブロックを追加').click();
  const textBlock=page.locator('.document-block').last();await textBlock.locator('.block-actions-wrap').hover();await textBlock.getByTitle('編集',{exact:true}).click();await page.getByLabel('ブロックの編集内容').fill('# 概要\n\nテキスト・表・グラフをまとめます。');await textBlock.getByRole('button',{name:'保存',exact:true}).click();
  await expect(textBlock.locator('h1')).toHaveText('概要');
  await textBlock.getByRole('button',{name:'テキスト 3を直接編集',exact:true}).hover();await textBlock.getByRole('button',{name:'テキスト 3を直接編集',exact:true}).click();await page.getByLabel('ブロックの編集内容').fill('# 概要\n\n直接クリックでも編集できます。');await textBlock.getByRole('button',{name:'保存',exact:true}).click();await expect(textBlock.locator('p')).toContainText('直接クリックでも');

  await page.getByTitle('グラフプレビュー',{exact:true}).click();await expect(page.locator('canvas')).toBeVisible();await page.getByLabel('グラフブロックを追加').click();await expect(page.locator('.document-chart canvas')).toBeVisible();
  const rightChart=page.locator('.document-chart').last();await rightChart.getByRole('button',{name:'Y軸を編集',exact:true}).hover();await expect(rightChart.locator('.axis-hit.axis-hover')).toHaveAttribute('aria-label','Y軸を編集');await rightChart.getByRole('button',{name:'Y軸を編集',exact:true}).click();const axisEditor=page.getByRole('dialog',{name:'Y軸の編集'});await expect(axisEditor.getByLabel('軸名',{exact:true})).toHaveValue('金額（円）');await axisEditor.getByLabel('軸名',{exact:true}).fill('結合グラフの金額');await axisEditor.getByRole('button',{name:'適用',exact:true}).click();
  await rightChart.getByRole('button',{name:'Y軸を編集',exact:true}).click();await expect(page.getByLabel('軸名',{exact:true})).toHaveValue('結合グラフの金額');await page.screenshot({path:'docs/images/direct-axis-edit.png'});await page.getByLabel('軸編集を閉じる').click();
  await page.locator('.dock-slot.bottom').getByRole('button',{name:'Y軸を編集',exact:true}).click();await expect(page.getByLabel('軸名',{exact:true})).toHaveValue('金額（円）');await page.getByLabel('軸編集を閉じる').click();

  const rightPopupPromise=app.waitForEvent('window');await page.getByLabel('ファイル結合を別ウィンドウにする').click();const rightPopup=await rightPopupPromise;await rightPopup.getByRole('button',{name:'Y軸を編集',exact:true}).click();await expect(rightPopup.getByLabel('軸名',{exact:true})).toHaveValue('結合グラフの金額');await rightPopup.getByLabel('軸編集を閉じる').click();await rightPopup.getByLabel('メインウィンドウに戻す').click();
  await page.getByRole('button',{name:'.md原文',exact:true}).click();await expect(page.getByLabel('結合文書のMarkdown原文')).toContainText('');expect(await page.getByLabel('結合文書のMarkdown原文').inputValue()).toContain('merged-assets/chart-');
  await page.locator('.source-toggle').getByRole('button',{name:'プレビュー',exact:true}).click();
  await app.evaluate(({dialog},target)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:target});},path.join(output,'report.md'));await page.getByRole('button',{name:'.mdを保存',exact:true}).click();await expect.poll(()=>fs.existsSync(path.join(output,'report.md'))).toBe(true);expect(fs.readFileSync(path.join(output,'report.md'),'utf8')).toContain('# 概要');expect(fs.readdirSync(path.join(output,'report-assets')).length).toBe(1);const assetPath=path.join(output,'report-assets',fs.readdirSync(path.join(output,'report-assets'))[0]);const exportedImage=await app.evaluate(({nativeImage},target)=>({size:nativeImage.createFromPath(target).getSize(),corner:[...nativeImage.createFromPath(target).getBitmap().subarray(0,4)]}),assetPath);expect(exportedImage.size).toEqual({width:1200,height:810});expect(exportedImage.corner).toEqual([255,255,255,255]);
  const before=await page.locator('.document-block').count();await page.locator('.document-block').last().locator('.block-actions-wrap').hover();await page.locator('.document-block').last().getByTitle('削除',{exact:true}).click();await expect(page.locator('.document-block')).toHaveCount(before-1);
  await page.locator('.toast').waitFor({state:'hidden'});await page.screenshot({path:'docs/images/markdown-blocks.png'});
  await page.getByLabel('ファイル結合を閉じる').click();await page.getByLabel('グラフプレビューを閉じる').click();
  await app.evaluate(({BrowserWindow},paths)=>{BrowserWindow.getAllWindows()[0].webContents.send('csv:paths',paths);},[path.join(output,'report.md')]);await expect(page.locator('.markdown-body img')).toBeVisible();
});
test('Markdown・TXTのネイティブ閲覧と接続設定' ,async()=>{
  await app.evaluate(({BrowserWindow},paths)=>{BrowserWindow.getAllWindows()[0].webContents.send('csv:paths',paths);},[path.join(root,'samples/notes.md')]);
  await expect(page.locator('.markdown-body h1')).toHaveText('月次レポート');await expect(page.locator('.markdown-body table')).toBeVisible();
  await page.locator('.markdown-body tbody tr').first().locator('td').nth(1).click();await page.locator('.markdown-body tbody tr').last().locator('td').nth(2).click({modifiers:['Shift']});await expect(page.locator('.dock-slot.bottom canvas')).toBeVisible();
  await page.getByRole('button',{name:'ソース',exact:true}).click();await expect(page.locator('[data-row="0"][data-col="0"]')).toHaveText('# 月次レポート');
  await app.evaluate(({BrowserWindow},paths)=>{BrowserWindow.getAllWindows()[0].webContents.send('csv:paths',paths);},[path.join(root,'samples/text.txt')]);
  await expect(page.locator('.document-heading h1')).toContainText('text.txt');await expect(page.locator('[data-row="3"][data-col="0"]')).toHaveText('"引用符はそのままです');
  await page.getByTitle('共有',{exact:true}).click();await expect(page.getByLabel('共有先')).toBeVisible();
  expect(await page.getByLabel('共有先').locator('option').count()).toBe(11);
  await page.getByRole('button',{name:'接続設定',exact:true}).click();await expect(page.getByLabel('OAuthクライアントID')).toBeVisible();
  await page.getByLabel('共有画面を閉じる').click();
});
