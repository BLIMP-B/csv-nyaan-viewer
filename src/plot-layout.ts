import type {geometry,PlotModel} from './analysis-plot';
export interface TextBox {lines:string[];x:number;y:number;width:number;height:number;font:number;lineHeight:number}
export type TextMeasure=(text:string,font:number)=>number;
export function wrapText(text:string,width:number,font:number,measure:TextMeasure,maxLines=3):string[] {
  const chars=[...text.replace(/\s+/g,' ').trim()],lines:string[]=[];let line='';
  for(let i=0;i<chars.length;i++) {
    if(line&&measure(line+chars[i],font)>width) {
      if(lines.length===maxLines-1) {while(line&&measure(line+'…',font)>width)line=[...line].slice(0,-1).join('');lines.push(line+'…');return lines;}
      lines.push(line);line='';
    }
    line+=chars[i];
  }
  if(line)lines.push(line);return lines;
}
export function plotLayout(model:PlotModel,g:ReturnType<typeof geometry>,measure:TextMeasure) {
  const labels:TextBox[]=[];
  const text=(value:string,x:number,y:number,width:number,font:number,lineHeight:number,maxLines=3)=>{
    const lines=wrapText(value,width,font,measure,maxLines),box={lines,x,y,width,height:lines.length*lineHeight,font,lineHeight};labels.push(box);return box;
  };
  const title=text(model.title,18,18,604,18,24),captions=model.labels.map((name,i)=>'XYZ'[i]+': '+(model.axisCaptions?.[i]||name));
  let top=title.y+title.height+18;
  if(model.dimension===2){const y=text(captions[1],86,top,530,14,20);top=y.y+y.height+16;}
  const plot=model.dimension===3?{x:170,y:top,width:300,height:300}:{x:86,y:top,width:530,height:300};
  const normalized=g.points.map(p=>({x:(p.x-240)/132,y:(160-p.y)/106,z:p.z}));
  const bounds=['x','y'].map(axis=>{const values=normalized.map(p=>p[axis as 'x'|'y']);return {min:Math.min(0,...values),max:Math.max(0,...values)};});
  const uniformScale=Math.min((plot.width-24)/(bounds[0].max-bounds[0].min||2),(plot.height-24)/(bounds[1].max-bounds[1].min||2));
  const origin={x:plot.x+plot.width/2-(bounds[0].max+bounds[0].min)*uniformScale/2,y:top+plot.height/2+(bounds[1].max+bounds[1].min)*uniformScale/2};
  const scale3D=138/Math.max(1.35,...normalized.map(p=>Math.hypot(p.x,p.y,p.z)));
  const project=<T extends {x:number;y:number;z?:number}>(p:T)=>{
    const nx=(p.x-240)/132,ny=(160-p.y)/106;
    if(model.dimension===3)return {...p,x:320+nx*scale3D,y:top+150-ny*scale3D};
    return {...p,x:model.uniform?origin.x+nx*uniformScale:plot.x+7+(nx+1)*(plot.width-14)/2,y:model.uniform?origin.y-ny*uniformScale:top+7+(1-ny)*(plot.height-14)/2};
  };
  const axes=model.dimension===3?g.axes.map(axis=>({...axis,start:project(axis.start),end:project(axis.end)})):[
    {start:{x:plot.x+7,y:model.uniform?origin.y:top+plot.height-7},end:{x:plot.x+plot.width-7,y:model.uniform?origin.y:top+plot.height-7}},
    {start:{x:model.uniform?origin.x:plot.x+7,y:top+plot.height-7},end:{x:model.uniform?origin.x:plot.x+7,y:top+7}}
  ];
  const leaders:{start:{x:number;y:number};end:{x:number;y:number}}[]=[];
  if(model.dimension===3) {
    const slots=[0,1].flatMap(side=>[0,1,2].map(row=>({x:side?474:18,y:top+row*100,side})));
    for(let i=0;i<axes.length;i++) {
      const end=axes[i].end;slots.sort((a,b)=>Math.hypot((a.side?474:166)-end.x,a.y+50-end.y)-Math.hypot((b.side?474:166)-end.x,b.y+50-end.y));
      const slot=slots.shift()!,box=text(captions[i],slot.x,slot.y,148,13,18,4);box.y+=(100-box.height)/2;
      leaders.push({start:end,end:{x:slot.side?box.x-6:box.x+box.width+6,y:box.y+box.height/2}});
    }
  }
  let bottom=top+plot.height+18;
  if(model.dimension===2){const x=text(captions[0],86,bottom,530,14,20);bottom=x.y+x.height+14;}
  for(const name of model.seriesNames.slice(0,2)){const legend=text(name,18,bottom,604,12,18);bottom+=legend.height+6;}
  return {width:640,height:Math.ceil(bottom+12),labels,plot,axes,leaders,points:g.points.map(project),regression:g.regression.map(project)};
}
