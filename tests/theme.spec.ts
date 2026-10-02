import {test,expect,_electron as electron,type ElectronApplication,type Page} from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root=process.cwd(),profile=fs.mkdtempSync(path.join(os.tmpdir(),'csv-theme-ui-'));
let app:ElectronApplication,page:Page;
test.describe.configure({mode:'serial'});
test.beforeAll(async()=>{
  app=await electron.launch({args:['--no-sandbox','--user-data-dir='+profile,'.',path.join(root,'samples/sales.csv')],cwd:root,env:{...process.env,CSV_LENS_TEST:'1'}});
  page=await app.firstWindow();await expect(page.locator('[data-row="0"][data-col="1"]')).toHaveText('1200000');
});
test.afterAll(async()=>{await app.close();});

async function readableText(target:Page){
  const failures=await target.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d')!;
    const rgba=(color:string)=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return Array.from(ctx.getImageData(0,0,1,1).data);};
    const blend=(fg:number[],bg:number[])=>fg.slice(0,3).map((v,i)=>v*(fg[3]/255)+bg[i]*(1-fg[3]/255));
    const luminance=(rgb:number[])=>{const c=rgb.map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;});return c[0]*0.2126+c[1]*0.7152+c[2]*0.0722;};
    const failures:{text:string;contrast:number;foreground:string;background:number[]}[]=[];
    function check(el:Element,text:string,color?:string){
      if(!text.trim()||el.closest('option,optgroup,button:disabled,input:disabled,select:disabled,textarea:disabled'))return;
      const rect=el.getBoundingClientRect(),style=getComputedStyle(el);if(!rect.width||!rect.height||style.visibility!=='visible'||style.display==='none')return;
      const parents:Element[]=[];let current:Element|null=el,opacity=1;
      while(current){parents.unshift(current);opacity*=Number(getComputedStyle(current).opacity);current=current.parentElement;}
      let background=[255,255,255];for(const parent of parents)background=blend(rgba(getComputedStyle(parent).backgroundColor),background);
      const foreground=color||(el instanceof SVGElement?style.fill:style.color),fg=rgba(foreground);fg[3]*=opacity;
      const a=luminance(blend(fg,background)),b=luminance(background),contrast=(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
      const large=parseFloat(style.fontSize)>=24||(parseFloat(style.fontSize)>=18.67&&Number(style.fontWeight)>=700);
      if(contrast<(large?3:4.5)-0.02)failures.push({text:text.trim().slice(0,75),contrast:Math.round(contrast*100)/100,foreground,background});
    }
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node:Node|null;
    while((node=walker.nextNode()))if(node.parentElement&&!node.parentElement.closest('script,style,title'))check(node.parentElement,node.textContent||'');
    document.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('input:not([type=checkbox]):not([type=range]),textarea').forEach(el=>check(el,el.value||el.placeholder,el.value?undefined:getComputedStyle(el,'::placeholder').color));
    return failures;
  });
  expect(failures,JSON.stringify(failures.slice(0,12),null,2)).toEqual([]);
}

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
      await page.locator('.menubar').getByRole('button',{name:'ファイル',exact:true}).click();await readableText(page);await page.locator('.menu-shield').click({position:{x:800,y:400}});
    }
    for(const name of ['フィルター','並べ替え','エクスポート']){
      await page.getByRole('button',{name,exact:true}).click();await readableText(page);await page.getByLabel('ダイアログを閉じる').click();
    }
    await page.locator('.menubar').getByRole('button',{name:'ヘルプ',exact:true}).click();await readableText(page);await page.getByRole('button',{name:'このアプリについて',exact:true}).click();await readableText(page);await page.getByLabel('ダイアログを閉じる').click();
    await page.locator('.menubar').getByRole('button',{name:'共有',exact:true}).click();await expect(page.getByLabel('共有先')).toBeVisible();await readableText(page);
    await page.getByRole('button',{name:'接続設定',exact:true}).click();await expect(page.getByLabel('OAuthクライアントID')).toBeVisible();await readableText(page);await page.getByLabel('共有画面を閉じる').click();
    await page.getByLabel('グラフ種類').selectOption('column');
    const host=page.locator('.chart-area .echart-host'),rect=(await host.boundingBox())!;
    await host.hover({position:{x:70+(rect.width-95)/12,y:rect.height-70}});
    await expect(page.locator('.chart-tooltip')).toBeVisible();await expect(page.locator('.chart-tooltip')).toHaveCSS('opacity','1');await readableText(page);
    await page.getByLabel('設定',{exact:true}).hover();
    const popupPromise=app.waitForEvent('window');await page.getByLabel('グラフプレビューを別ウィンドウにする').click();const popup=await popupPromise;await expect(popup.locator('canvas')).toBeVisible();await readableText(popup);await popup.getByLabel('メインウィンドウに戻す').click();
  }
});

test('両テーマで警告・エラーと分析図を確認する',async()=>{
  const warning=path.join(profile,'warning.csv');fs.writeFileSync(warning,'名前,数値\nA,1\nB,2,3\n');
  for(const theme of ['light','dark'] as const){
    await page.getByLabel('設定',{exact:true}).click();await page.getByLabel('カラープロファイル').selectOption(theme);await page.getByRole('button',{name:'完了',exact:true}).click();
    await page.getByLabel('左サイドのモード').selectOption('multivariate');await expect(page.locator('.analysis-pca svg')).toBeVisible();
    await expect(page.locator('.analysis-pca line').first()).not.toHaveCSS('stroke','none');await readableText(page);
    await page.getByLabel('左サイドのモード').selectOption('workspace');
    await page.getByLabel('オンラインExcel・スプレッドシートURL').fill('invalid-url');await page.locator('.online-bar').getByRole('button',{name:'開く',exact:true}).click();await expect(page.locator('.error-banner')).toBeVisible();await readableText(page);await page.locator('.error-banner button').click();
    await page.locator('.tab').first().getByRole('button').first().click();
    await page.locator('.dock-slot.bottom').getByRole('button',{name:'Y軸を編集',exact:true}).click();await page.getByLabel('軸の最小値').fill('10');await page.getByLabel('軸の最大値').fill('1');await page.locator('.axis-editor').getByRole('button',{name:'適用',exact:true}).click();await expect(page.locator('.axis-error')).toBeVisible();await readableText(page);await page.getByLabel('軸編集を閉じる').click();
    await app.evaluate(({BrowserWindow},file)=>BrowserWindow.getAllWindows()[0].webContents.send('csv:paths',[file]),warning);await expect(page.locator('.warning')).toBeVisible();await readableText(page);
    await page.locator('.tab').first().getByRole('button').first().click();
  }
});
