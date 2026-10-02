import {test,expect,_electron as electron,type ElectronApplication,type Page} from '@playwright/test';
import {readableText} from './ui-contrast';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const root=process.cwd(),out=fs.mkdtempSync(path.join(os.tmpdir(),'csv-nyaan-ui-v11-'));let app:ElectronApplication,page:Page;const errors:string[]=[];
test.describe.configure({mode:'serial'});
test.beforeAll(async()=>{app=await electron.launch({args:['--no-sandbox','--user-data-dir='+path.join(out,'profile'),'.',path.join(root,'samples/sales.csv')],cwd:root,env:{...process.env,CSV_LENS_TEST:'1'}});page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await expect(page.locator('[data-row="0"][data-col="1"]')).toHaveText('1200000',{timeout:30000});});
test.afterAll(async()=>{await app.close();expect(errors).toEqual([]);});
test.beforeEach(async()=>{for(const name of ['グラフプレビューを閉じる','ファイル結合を閉じる'])if(await page.getByLabel(name,{exact:true}).count())await page.getByLabel(name,{exact:true}).click();await page.getByLabel('表示状態を復元',{exact:true}).click();await expect(page.locator('.busy-overlay')).toHaveCount(0);});
const cell=(r:number,c:number)=>page.locator(`[data-row="${r}"][data-col="${c}"]`);
async function drag(from:ReturnType<Page['locator']>,to:ReturnType<Page['locator']>){const a=(await from.boundingBox())!,b=(await to.boundingBox())!;await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:8});await page.mouse.up();}
test('列記号だけの最上段と元の見出し行を分離し、固定・スクロール・見出し行数を保つ',async()=>{
  const headings=Array.from({length:30},(_,c)=>['A','対象：','店長\n署名',''][c]??'項目'+c);headings[26]='0001';
  const quote=(v:string)=>/[",\n]/.test(v)?'"'+v.replaceAll('"','""')+'"':v;
  const target=path.join(out,'headings.csv'),source=[headings,...Array.from({length:80},(_,r)=>Array.from({length:30},(_,c)=>String((r+1)*100+c)))].map(row=>row.map(quote).join(',')).join('\n')+'\n';fs.writeFileSync(target,source);
  await app.evaluate(({BrowserWindow},p)=>BrowserWindow.getAllWindows()[0].webContents.send('csv:paths',[p]),target);
  await expect(cell(0,1)).toHaveText('101');
  const raw=(r:number,c:number)=>page.locator(`[data-header-row="${r}"] [data-header-col="${c}"]`);
  await expect(page.getByLabel('列Aを選択',{exact:true})).toHaveText('A');await expect(page.getByLabel('列Bを選択',{exact:true})).toHaveText('B');
  await expect(raw(0,0)).toHaveText('A');await expect(raw(0,1)).toHaveText('対象：');await expect(raw(0,2)).toHaveText('店長 ↵ 署名');await expect(raw(0,3)).toHaveText('');
  await expect(page.locator('[data-header-row="0"] .row-number')).toHaveText('1');expect(await page.locator('.header-records').evaluate(el=>el.scrollHeight===el.clientHeight)).toBe(true);await expect(page.getByLabel('行2を選択',{exact:true})).toBeVisible();
  const strip=(await page.locator('.grid-headers').boundingBox())!,heading=(await raw(0,1).boundingBox())!,data=(await cell(0,1).boundingBox())!;expect(heading.y).toBeCloseTo(strip.y+strip.height,0);const headerRow=(await page.locator('[data-header-row="0"]').boundingBox())!;expect(data.y).toBeCloseTo(headerRow.y+headerRow.height,0);
  await raw(0,2).dblclick();await expect(page.locator('.cell-full')).toHaveValue('店長\n署名');await page.getByRole('dialog').getByRole('button',{name:'コピー',exact:true}).click();expect(await app.evaluate(({clipboard})=>clipboard.readText())).toBe('店長\n署名');await page.getByLabel('ダイアログを閉じる').click();
  await page.locator('.column-head[data-head-index="1"] .header-sort-zone').hover();await page.getByLabel('列Bを降順',{exact:true}).click();await expect(cell(0,1)).toHaveText('8001');await expect(raw(0,1)).toHaveText('対象：');await expect(page.getByLabel('列Bを選択',{exact:true})).toHaveText('B');
  await page.getByLabel('表示状態を復元',{exact:true}).click();await expect(cell(0,1)).toHaveText('101');
  await page.getByLabel('固定列数').selectOption('1');const pinned=(await raw(0,0).boundingBox())!;
  await page.locator('.grid-scroll').evaluate(el=>el.scrollTo({left:4400,top:800}));await expect(page.getByLabel('列AAを選択',{exact:true})).toHaveText('AA');await expect(raw(0,26)).toHaveText('0001');expect((await raw(0,0).boundingBox())!.x).toBeCloseTo(pinned.x,0);expect((await raw(0,26).boundingBox())!.y).toBeCloseTo(heading.y,0);
  await page.locator('.grid-scroll').evaluate(el=>el.scrollTo({left:0,top:0}));await page.getByLabel('見出し行数').selectOption('2');await expect(raw(1,1)).toHaveText('101');await expect(cell(0,1)).toHaveText('201');await expect(page.getByLabel('列Bを選択',{exact:true})).toHaveText('B');
  await page.getByLabel('見出し行数').selectOption('30');await expect(page.locator('[data-header-row]')).toHaveCount(30);const grid=(await page.locator('.grid-scroll').boundingBox())!,records=(await page.locator('.header-records').boundingBox())!;expect(records.height).toBeLessThan(grid.height/2);await page.locator('.header-records').evaluate(el=>el.scrollTop=el.scrollHeight);await expect(raw(29,1)).toBeVisible();await expect(cell(0,1)).toHaveText('3001');
  await page.getByLabel('見出し行数').selectOption('0');await expect(page.locator('.header-records')).toHaveCount(0);await expect(cell(0,1)).toHaveText('対象：');await expect(page.getByLabel('行1を選択',{exact:true})).toBeVisible();await expect(page.getByLabel('列Bを選択',{exact:true})).toHaveText('B');
  expect(fs.readFileSync(target,'utf8')).toBe(source);await page.getByLabel('headings.csvを閉じる').click();await expect(cell(0,1)).toHaveText('1200000');const capture=(await page.locator('.grid-scroll').boundingBox())!;await page.screenshot({path:'docs/images/separate-grid-headings.png',clip:{x:capture.x,y:capture.y,width:Math.min(960,capture.width),height:Math.min(220,capture.height)}});
});
test('セルのCtrl/Shift/矢印と行列ショートカット',async()=>{await cell(0,1).click();await page.locator('.grid-scroll').press('Shift+ArrowDown');await page.locator('.grid-scroll').press('Shift+ArrowRight');await expect(cell(1,2)).toHaveAttribute('aria-selected','true');await expect(cell(0,1)).toHaveAttribute('aria-selected','true');await page.locator('.grid-scroll').press('Control+ArrowDown');await expect(page.locator('.inspector .cell-address')).toHaveText('C6');await page.locator('.grid-scroll').press('Control+Home');await expect(page.locator('.cell-address')).toHaveText('A1');await page.locator('.grid-scroll').press('Control+Space');await expect(cell(5,0)).toHaveAttribute('aria-selected','true');await page.locator('.grid-scroll').press('Shift+Space');await expect(cell(0,4)).toHaveAttribute('aria-selected','true');await cell(3,3).click({modifiers:['Control']});await expect(cell(0,0)).toHaveAttribute('aria-selected','true');await expect(cell(3,3)).toHaveAttribute('aria-selected','true');});
test('列のホバー選択、左右のアイコン、ドラッグ複数列のメニュー、表示削除と復元',async()=>{const b=page.getByLabel('列Bを選択',{exact:true}),d=page.getByLabel('列Dを選択',{exact:true});await b.hover();await expect(b).toHaveCSS('background-color','rgb(232, 242, 251)');await b.click();await expect(cell(5,1)).toHaveAttribute('aria-selected','true');await page.locator('.column-head[data-head-index="1"] .header-eye-zone').hover();await page.getByLabel('列Bを非表示',{exact:true}).click();await expect(cell(0,1)).toHaveClass(/cell-concealed/);await expect(cell(0,1).locator('span')).toBeVisible();await expect(cell(0,1).locator('span')).toHaveText('1200000');await page.getByLabel('列Bを表示',{exact:true}).click();await expect(cell(0,1)).not.toHaveClass(/cell-concealed/);await page.locator('.column-head[data-head-index="1"] .header-sort-zone').hover();await page.getByLabel('列Bを降順',{exact:true}).click();await expect(cell(0,1)).toHaveText('1980000');await page.locator('.column-head[data-head-index="1"] .header-sort-zone').hover();await page.getByLabel('列Bを元の順序へ',{exact:true}).click();await expect(cell(0,1)).toHaveText('1200000');await drag(b,d);const menu=page.getByRole('menu',{name:'行列の操作'});await expect(menu).toBeVisible();await expect(menu.getByRole('menuitem')).toHaveCount(2);await expect(cell(4,2)).toHaveAttribute('aria-selected','true');await menu.getByRole('menuitem',{name:'削除',exact:true}).click();await expect(cell(0,1)).toHaveCount(0);await page.getByLabel('表示状態を復元').click();await expect(cell(0,1)).toHaveText('1200000');await b.click({button:'right'});await expect(menu.getByRole('menuitem')).toHaveCount(3);await page.locator('.head-menu-shield').click({position:{x:900,y:700}});});
test('行も複数ドラッグ・グレーアウト・削除・横方向ソート',async()=>{const r0=page.locator('.row-head[data-head-index="0"] .header-center'),r2=page.locator('.row-head[data-head-index="2"] .header-center');await drag(r0,r2);const menu=page.getByRole('menu',{name:'行列の操作'});await expect(menu.getByRole('menuitem')).toHaveCount(2);await menu.getByRole('menuitem',{name:'表示 / 非表示'}).click();await expect(cell(0,4)).toHaveClass(/cell-concealed/);await expect(cell(2,0)).toHaveClass(/cell-concealed/);await expect(cell(0,4).locator('span')).toBeVisible();await expect(cell(2,0).locator('span')).toBeVisible();await expect(cell(0,4).locator('span')).toHaveText('000001');await expect(cell(2,0).locator('span')).toHaveText('3月');await page.getByLabel('表示状態を復元').click();await r0.click({button:'right'});await expect(menu.getByRole('menuitem')).toHaveCount(3);await menu.getByRole('menuitem',{name:'ソート / フィルター'}).click();await menu.getByRole('button',{name:'昇順',exact:true}).click();await expect(page.locator('.column-head').first()).not.toHaveAttribute('data-head-index','0');await page.getByLabel('表示状態を復元').click();await drag(r0,r2);await menu.getByRole('menuitem',{name:'削除',exact:true}).click();await expect(page.locator('.statusbar')).toContainText('3レコード');await page.getByLabel('表示状態を復元').click();await expect(page.locator('.statusbar')).toContainText('6レコード');});
test('境界ボタンの開閉・位置変更・共存と、境界ドラッグ、6箇所のつまみ',async()=>{
  await page.locator('#dock-tab-chart').click();const bottom=page.locator('.dock-slot.bottom');
  await expect(bottom.locator('.dock-grip')).toHaveCount(6);const initial=(await bottom.boundingBox())!;
  const boundary=bottom.getByRole('separator',{name:'下ペインとデータの境界'}),b=(await boundary.boundingBox())!;
  await page.mouse.move(b.x+80,b.y+3);await page.mouse.down();await page.mouse.move(b.x+80,b.y-47,{steps:8});await page.mouse.up();
  await expect.poll(async()=>(await bottom.boundingBox())!.height).toBeCloseTo(initial.height+50,0);
  await page.locator('#dock-tab-merge').click();const right=page.locator('.dock-slot.right'),r=(await right.boundingBox())!;
  const edge=(await right.getByRole('separator',{name:'右ペインとデータの境界'}).boundingBox())!;
  await page.mouse.move(edge.x+3,edge.y+75);await page.mouse.down();await page.mouse.move(edge.x-37,edge.y+75,{steps:8});await page.mouse.up();
  await expect.poll(async()=>(await right.boundingBox())!.width).toBeCloseTo(r.width+40,0);
  await page.locator('#dock-tab-workspace').click();const sidebar=page.locator('.sidebar'),s=(await sidebar.boundingBox())!;
  const se=(await page.getByRole('separator',{name:'左サイドとデータの境界'}).boundingBox())!;
  await page.mouse.move(se.x+3,se.y+75);await page.mouse.down();await page.mouse.move(se.x+43,se.y+75,{steps:8});await page.mouse.up();
  await expect.poll(async()=>(await sidebar.boundingBox())!.width).toBeCloseTo(s.width+40,0);
  async function touches(panel:ReturnType<Page['locator']>,name:string,side:'top'|'bottom'|'left'|'right'){
    const button=panel.getByRole('button',{name,exact:true});await expect(button).toBeVisible();await expect(button).toHaveAttribute('aria-expanded','true');
    const a=(await panel.boundingBox())!,c=(await button.boundingBox())!;
    expect(c.x).toBeGreaterThanOrEqual(a.x-1);expect(c.y).toBeGreaterThanOrEqual(a.y-1);
    expect(c.x+c.width).toBeLessThanOrEqual(a.x+a.width+1);expect(c.y+c.height).toBeLessThanOrEqual(a.y+a.height+1);
    const gap=side==='top'?c.y-a.y:side==='bottom'?a.y+a.height-c.y-c.height:side==='left'?c.x-a.x:a.x+a.width-c.x-c.width;
    expect(Math.abs(gap)).toBeLessThanOrEqual(1);
    for(const grip of await panel.locator('.dock-grip').all()){
      const g=(await grip.boundingBox())!;const overlapX=Math.min(c.x+c.width,g.x+g.width)-Math.max(c.x,g.x),overlapY=Math.min(c.y+c.height,g.y+g.height)-Math.max(c.y,g.y);
      expect(overlapX<=0||overlapY<=0).toBe(true);
    }
    return button;
  }
  const leftClose='左ペイン全体を最小化',rightClose='右ペイン全体を最小化',previewClose='下ペイン全体を最小化';
  await touches(sidebar,leftClose,'right');await touches(right,rightClose,'left');await touches(bottom,previewClose,'top');
  await expect(page.getByLabel('ファイル結合を閉じる',{exact:true})).toBeVisible();await expect(page.getByLabel('グラフプレビューを閉じる',{exact:true})).toBeVisible();
  await readableText(page);await page.screenshot({path:'docs/images/pane-boundary-buttons-light.png'});
  await page.getByLabel('テーマを切り替え').click();await readableText(page);await page.screenshot({path:'docs/images/pane-boundary-buttons-dark.png'});await page.getByLabel('テーマを切り替え').click();
  const dimensions=[(await sidebar.boundingBox())!.width,(await right.boundingBox())!.width,(await bottom.boundingBox())!.height];
  await page.getByLabel(leftClose,{exact:true}).click();await expect(sidebar).toHaveCount(0);await page.locator('#dock-tab-workspace').click();await expect.poll(async()=>(await sidebar.boundingBox())!.width).toBeCloseTo(dimensions[0],0);
  await page.getByLabel(rightClose,{exact:true}).click();await expect(right).toHaveCount(0);await page.locator('#dock-tab-merge').click();await expect.poll(async()=>(await right.boundingBox())!.width).toBeCloseTo(dimensions[1],0);
  await page.getByLabel(previewClose,{exact:true}).click();await expect(bottom).toHaveCount(0);await page.locator('#dock-tab-chart').click();await expect.poll(async()=>(await bottom.boundingBox())!.height).toBeCloseTo(dimensions[2],0);
  for(const [position,side] of [['top','bottom'],['left','right'],['right','left'],['bottom','top']] as const){
    await page.getByLabel('グラフプレビューの位置').selectOption(position);const dock=page.locator('.dock-slot.'+position);
    const closeName=({top:'上',bottom:'下',left:'左',right:'右'}[position])+'ペイン全体を最小化';await touches(dock,closeName,side);
    if(position==='right'){
      await expect(dock.getByRole('tab',{name:'グラフプレビュー',exact:true})).toHaveAttribute('aria-selected','true');
      await expect(dock.getByRole('tab',{name:'ファイル結合',exact:true})).toHaveAttribute('aria-selected','false');
    }
    await dock.getByLabel(closeName,{exact:true}).click();await expect(page.getByLabel('グラフプレビューの位置')).toHaveCount(0);
    if(position==='right')await expect(page.getByLabel('ファイル結合の位置')).toHaveCount(0);await page.locator('#dock-tab-chart').click();await touches(page.locator('.dock-slot.'+position),closeName,side);
  }
  if(await page.getByLabel(leftClose,{exact:true}).count())await page.getByLabel(leftClose,{exact:true}).click();
});
test('グラフの全種を描画、パレット変更、自動推薦とPNG保存',async()=>{await cell(0,1).click();await cell(5,3).click({modifiers:['Shift']});await expect(page.locator('.dock-slot.bottom canvas')).toBeVisible();await page.getByLabel('グラフ種類').selectOption('column');const first=await page.locator('.chart-area canvas').evaluate((el:HTMLCanvasElement)=>el.toDataURL());await page.getByLabel('グラフのカラーセット').selectOption('pastel');await expect.poll(()=>page.locator('.chart-area canvas').evaluate((el:HTMLCanvasElement)=>el.toDataURL())).not.toBe(first);const options=await page.getByLabel('グラフ種類').locator('option').evaluateAll(nodes=>nodes.map(n=>(n as HTMLOptionElement).value));expect(options.length).toBeGreaterThanOrEqual(75);for(const kind of options){await page.getByLabel('グラフ種類').selectOption(kind);await expect(page.locator('.chart-area canvas')).toBeVisible();}await page.locator('.pane-toolbar').getByRole('button',{name:'自動',exact:true}).click();await expect(page.getByLabel('グラフ種類')).toHaveValue('line');await app.evaluate(({dialog},target)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:target});},path.join(out,'all-charts.png'));await page.getByRole('button',{name:'PNG保存',exact:true}).click();await expect.poll(()=>fs.existsSync(path.join(out,'all-charts.png'))).toBe(true);await page.screenshot({path:'docs/images/expanded-charts.png'});});
test('左サイドのタブ切り替え・幅変更と変量・多変量分析',async()=>{
  await cell(0,1).click();await cell(5,3).click({modifiers:['Shift']});
  if(!await page.locator('.sidebar').count())await page.getByLabel('左ペインを開閉').click();
  const tabs=page.getByRole('tablist',{name:'左ペインのタブ'}),workspace=tabs.getByRole('tab',{name:'ワークスペース',exact:true}),selection=tabs.getByRole('tab',{name:'変量分析（選択範囲）',exact:true}),multivariate=tabs.getByRole('tab',{name:'多変量分析（ファイル全域）',exact:true});
  await expect(tabs.getByRole('tab')).toHaveCount(3);await expect(workspace).toHaveAttribute('aria-selected','true');
  await selection.click();await expect(selection).toHaveAttribute('aria-selected','true');await expect(page.locator('.analysis-variable')).toHaveCount(3);await expect(page.locator('.analysis-pairs')).toContainText('売上');
  await multivariate.click();await expect(page.locator('.analysis-pca')).toBeVisible();await page.getByLabel('分析の次元').selectOption('3');await expect(page.getByRole('img',{name:'3次元主成分分布'})).toBeVisible();await page.getByLabel('3D分析の回転').fill('90');await expect(page.locator('.analysis-pca')).toContainText('寄与率');
  await page.screenshot({path:'docs/images/multivariate-analysis.png'});
  const sidebar=page.locator('.sidebar'),boundary=page.getByRole('separator',{name:'左サイドとデータの境界'});
  for(const width of [190,520,260]){
    const current=(await sidebar.boundingBox())!,edge=(await boundary.boundingBox())!;
    await page.mouse.move(edge.x+3,edge.y+75);await page.mouse.down();await page.mouse.move(edge.x+3+width-current.width,edge.y+75,{steps:6});await page.mouse.up();
    await expect.poll(async()=>(await sidebar.boundingBox())!.width).toBeCloseTo(width,0);
    const bounds=(await sidebar.boundingBox())!;
    for(const tab of [workspace,selection,multivariate]){await expect(tab).toBeVisible();const box=(await tab.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(bounds.x-1);expect(box.x+box.width).toBeLessThanOrEqual(bounds.x+bounds.width+1);}
  }
  await page.getByLabel('左ペインを開閉').click();await expect(sidebar).toHaveCount(0);await page.getByLabel('左ペインを開閉').click();await expect(multivariate).toHaveAttribute('aria-selected','true');
  await multivariate.press('ArrowRight');await expect(workspace).toBeFocused();await expect(workspace).toHaveAttribute('aria-selected','true');await expect(page.locator('.open-button')).toBeVisible();
  await workspace.press('ArrowLeft');await expect(multivariate).toBeFocused();await multivariate.press('Home');await expect(workspace).toBeFocused();await workspace.press('ArrowRight');await expect(selection).toBeFocused();await expect(page.locator('.analysis-variable')).toHaveCount(3);await selection.press('End');await expect(multivariate).toBeFocused();await expect(page.locator('.analysis-pca')).toBeVisible();
  await page.getByLabel('左ペインを開閉').click();
});
test('Excelのシート切り替えとURLドロップ・入力のIPCを確認',async()=>{const XLSX=require('@e965/xlsx'),p=path.join(out,'Book.xlsx'),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['ID','Value'],['0001',12]]),'First');XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['X','Y'],[2,4],[3,6]]),'Second');XLSX.writeFile(wb,p);await app.evaluate(({BrowserWindow},p)=>{BrowserWindow.getAllWindows()[0].webContents.send('csv:paths',[p]);},p);await expect(page.getByRole('tab',{name:'First',exact:true})).toHaveAttribute('aria-selected','true');await expect(cell(0,0)).toHaveText('0001');await expect(page.locator('[data-header-row="0"] [data-header-col="0"]')).toHaveText('ID');await expect(page.getByLabel('列Aを選択',{exact:true})).toHaveText('A');await page.getByRole('tab',{name:'Second',exact:true}).click();await expect(cell(0,0)).toHaveText('2');await expect(cell(1,1)).toHaveText('6');await expect(page.locator('[data-header-row="0"] [data-header-col="0"]')).toHaveText('X');await expect(page.getByLabel('列Aを選択',{exact:true})).toHaveText('A');await app.evaluate(({ipcMain},p)=>{ipcMain.removeHandler('csv:openUrl');ipcMain.handle('csv:openUrl',async(_,url)=>{const meta=await (ipcMain as any)._invokeHandlers.get('csv:open')({}, {path:p,options:{}});return {...meta,name:'Online.xlsx',sourceUrl:url};});},p);const url='https://docs.google.com/spreadsheets/d/fake/edit';await page.getByLabel('オンラインExcel・スプレッドシートURL').fill(url);await page.locator('.online-bar').getByRole('button',{name:'開く',exact:true}).click();await expect(page.locator('.document-heading h1')).toContainText('Online.xlsx');await expect(page.locator('.document-heading p')).toHaveText(url);await page.locator('.app').evaluate(el=>{const d=new DataTransfer();d.setData('text/uri-list','https://1drv.ms/x/s/fake');el.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:d}));});await expect(page.locator('.document-heading p')).toHaveText('https://1drv.ms/x/s/fake');});
