import {expect,type Page} from '@playwright/test';

export async function readableText(target:Page){
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

