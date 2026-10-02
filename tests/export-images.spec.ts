import {test,expect,_electron as electron,type ElectronApplication,type Page} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const root=process.cwd(),folder=fs.mkdtempSync(path.join(os.tmpdir(),'csv-image-export-')),profile=path.join(folder,'profile');
let app:ElectronApplication,page:Page;
test.describe.configure({mode:'serial'});
test.beforeAll(async()=>{
  fs.mkdirSync(profile);fs.writeFileSync(path.join(profile,'preferences.json'),JSON.stringify({theme:'dark'}));
  const file=path.join(folder,'LongLabels.csv'),headers=['対象','長い名前の測定値（複数の期間と条件を比較した結果）'.repeat(2),'もう一つの長い名前の測定値（複数の条件を比較した結果）'.repeat(2),'成果スコア'];
  fs.writeFileSync(file,[headers.join(','),...Array.from({length:12},(_,i)=>['観測'+(i+1),i+1,i*3+7,i*i+2].join(','))].join('\n'));
  app=await electron.launch({args:['--no-sandbox','--user-data-dir='+profile,'.',file],cwd:root,env:{...process.env,CSV_LENS_TEST:'1'}});page=await app.firstWindow();
  await expect(page.locator('[data-row="0"][data-col="1"]')).toHaveText('1',{timeout:30000});await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.locator('[data-row="0"][data-col="1"]').click();await page.locator('[data-row="11"][data-col="3"]').click({modifiers:['Shift']});
});
test.afterAll(async()=>{await app.close();});
async function saveTo(file:string){await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);}
async function colors(setting:string){await page.getByLabel('設定',{exact:true}).click();await page.getByLabel('出力画像の配色').selectOption(setting);await page.getByRole('button',{name:'完了',exact:true}).click();}
async function corner(file:string){return app.evaluate(({nativeImage},file)=>[...nativeImage.createFromPath(file).getBitmap().subarray(0,4)],file);}
test('ダーク画面でもPNGは既定で白基調、出力設定と画面追従を保存する',async()=>{
  await expect(page.locator('.chart-area canvas')).toBeVisible();const save=page.locator('.dock-slot.bottom').getByRole('button',{name:'PNG保存',exact:true});
  const white=path.join(folder,'white.png');await saveTo(white);await save.click();await expect.poll(()=>fs.existsSync(white)).toBe(true);expect(await corner(white)).toEqual([255,255,255,255]);
  const screen=await page.locator('.chart-area canvas').evaluate((el:HTMLCanvasElement)=>[...el.getContext('2d')!.getImageData(0,0,1,1).data]);expect(screen).toEqual([41,41,41,255]);
  for(const setting of ['dark','screen']){await colors(setting);const file=path.join(folder,setting+'.png');await saveTo(file);await save.click();await expect.poll(()=>fs.existsSync(file)).toBe(true);expect(await corner(file)).toEqual([41,41,41,255]);expect(await page.evaluate(()=>window.csv.preferences())).toHaveProperty('imageExportTheme',setting);}
  await page.getByLabel('テーマを切り替え').click();const followed=path.join(folder,'followed.png');await saveTo(followed);await save.click();await expect.poll(()=>fs.existsSync(followed)).toBe(true);expect(await corner(followed)).toEqual([255,255,255,255]);
  await page.getByLabel('テーマを切り替え').click();await colors('light');await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
});
test('長い軸名の2D/3Dを白基調でPNG・MD・XLSX・GIFに出力し縦横比と画像間隔を維持する',async()=>{
  test.setTimeout(90000);await page.getByLabel('左ペインを開閉').click();await page.getByRole('tab',{name:'多変量分析（ファイル全域）',exact:true}).click();const pca=page.locator('.analysis-pca');await expect(pca.locator('.analysis-plot')).toBeVisible();
  const qa=path.join(root,'release','image-export-check');fs.mkdirSync(qa,{recursive:true});const png=path.join(qa,'pca-2d.png');fs.rmSync(png,{force:true});await saveTo(png);await pca.getByRole('button',{name:'PNG保存',exact:true}).click();await expect.poll(()=>fs.existsSync(png)).toBe(true);expect(await corner(png)).toEqual([255,255,255,255]);
  await page.getByLabel('分析の次元').selectOption('3');const xlsx=path.join(folder,'analysis.xlsx');await saveTo(xlsx);await page.getByRole('button',{name:'分析を.xlsx出力',exact:true}).click();await expect.poll(()=>fs.existsSync(xlsx)).toBe(true);
  const book=new (require('exceljs').Workbook)();await book.xlsx.readFile(xlsx);const sheet=book.getWorksheet('グラフ'),drawings=sheet.getImages();expect(drawings.length).toBeGreaterThan(3);
  for(let i=0;i<drawings.length;i++){
    const drawing=drawings[i],bytes=Buffer.from(book.getImage(drawing.imageId).buffer),width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
    expect(drawing.range.ext.width/drawing.range.ext.height).toBeCloseTo(width/height,7);
    const pixel=await app.evaluate(({nativeImage},data)=>[...nativeImage.createFromDataURL('data:image/png;base64,'+data).getBitmap().subarray(0,4)],bytes.toString('base64'));expect(pixel).toEqual([255,255,255,255]);
    if(i===0)fs.writeFileSync(path.join(qa,'pca-3d.png'),bytes);if(i===drawings.length-1)fs.writeFileSync(path.join(qa,'long-axis-pair.png'),bytes);
    let y=0;for(let r=1;r<=drawing.range.tl.nativeRow;r++)y+=(sheet.getRow(r).height||15)*96/72;
    if(i+1<drawings.length){let nextHeading=0;for(let r=1;r<drawings[i+1].range.tl.nativeRow;r++)nextHeading+=(sheet.getRow(r).height||15)*96/72;expect(y+drawing.range.ext.height).toBeLessThanOrEqual(nextHeading);}
  }
  const md=path.join(folder,'analysis.md');await saveTo(md);await page.getByRole('button',{name:'分析を.md出力',exact:true}).click();await expect.poll(()=>fs.existsSync(md)).toBe(true);const embedded=fs.readFileSync(md,'utf8').match(/data:image\/png;base64,[A-Za-z0-9+/=]+/g)!;expect(embedded.length).toBe(drawings.length);
  for(const image of embedded){expect(await app.evaluate(({nativeImage},data)=>[...nativeImage.createFromDataURL(data).getBitmap().subarray(0,4)],image)).toEqual([255,255,255,255]);}
  const gif=path.join(folder,'analysis.gif');await saveTo(gif);await pca.getByRole('button',{name:'.gif',exact:true}).click();await expect.poll(()=>fs.existsSync(gif),{timeout:45000}).toBe(true);const decoder=new (require('omggif').GifReader)(fs.readFileSync(gif)),pixels=new Uint8Array(decoder.width*decoder.height*4);decoder.decodeAndBlitFrameRGBA(0,pixels);expect([...pixels.subarray(0,4)]).toEqual([255,255,255,255]);expect(decoder.numFrames()).toBe(73);
});
