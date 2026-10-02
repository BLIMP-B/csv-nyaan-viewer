import type {ImageTheme} from './export-theme';
import {GIFEncoder,quantize,applyPalette} from 'gifenc';
import {drawPlot,plotColors,plotCanvas,type Orientation,type PlotModel} from './analysis-plot';
export async function rotatingGIF(model:PlotModel,orientation:Orientation,angle:number,onProgress:(n:number)=>void,theme:ImageTheme='light'){
  const canvas=plotCanvas(model),context=canvas.getContext('2d')!,gif=GIFEncoder(),colors=plotColors(theme);let palette:number[][]=[];
  // A finite animation: 72 ten-degree steps, followed by the starting pose.
  for(let i=0;i<=72;i++){drawPlot(canvas,model,orientation,angle+i*10,colors);const rgba=context.getImageData(0,0,canvas.width,canvas.height).data;if(!i)palette=quantize(rgba,128);const index=applyPalette(rgba,palette);gif.writeFrame(index,canvas.width,canvas.height,{palette,delay:80,...(!i?{repeat:-1}:{})});onProgress(Math.round(i/72*100));await new Promise<void>(resolve=>setTimeout(resolve,0));}
  gif.finish();let binary='';const bytes=gif.bytesView();for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return 'data:image/gif;base64,'+btoa(binary);
}
