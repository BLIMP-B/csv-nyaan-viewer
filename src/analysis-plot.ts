import {centerLabelLayout,plotLayout,wrapText,type TextMeasure} from './plot-layout';
import type {ImageTheme} from './export-theme';
import type {PairSummary,PrincipalComponents,VariableSummary} from './analysis-types';
export interface Point3 {x:number;y:number;z:number;row:number;cluster:number;series:number}
export interface PlotCenter {x:number;y:number;z:number;cluster:number;series:number;count:number;label:string}
export interface PlotModel {title:string;labels:[string,string,string];axisCaptions?:[string,string,string];points:Point3[];centers?:PlotCenter[];dimension:2|3;uniform?:boolean;lines:boolean;seriesNames:string[];regression?:{slope:number;intercept:number}}
export interface Orientation {yaw:number;pitch:number;roll:number}
export type AxisChoices=[string[],string[],string[]];
export const initialAxes=(pca:PrincipalComponents):AxisChoices=>[['pc:0'],['pc:1'],[pca.loadings.length>2?'pc:2':'zero']];
export function choiceName(pca:PrincipalComponents,key:string){if(key==='zero')return 'Z=0';const [kind,index]=key.split(':');return kind==='pc'?'PC'+(Number(index)+1):pca.dimensions[Number(index)]+'（標準化）';}
export function categoryName(pca:PrincipalComponents,key:string){if(!key.startsWith('pc:'))return choiceName(pca,key);const values=pca.loadings[Number(key.split(':')[1])]||[];return choiceName(pca,key)+'：'+values.map((v,i)=>({name:pca.dimensions[i],weight:v})).sort((a,b)=>Math.abs(b.weight)-Math.abs(a.weight)).slice(0,3).map(v=>v.name+' '+(v.weight>=0?'+':'')+v.weight.toFixed(2)).join(' / ');}
export function pcaPlot(pca:PrincipalComponents,axes:AxisChoices,dimension:2|3,lines:boolean):PlotModel {
  const count=Math.max(...axes.slice(0,dimension).map(a=>a.length)),points:Point3[]=[],centers:PlotCenter[]=[];
  function value(point:Pick<PrincipalComponents['scores'][number],'values'|'standard'>,key:string){const [kind,index]=key.split(':');return key==='zero'?0:kind==='pc'?point.values[Number(index)]??0:point.standard[Number(index)]??0;}
  for(let series=0;series<count;series++)for(const p of pca.scores){const keys=axes.map(a=>a[series]||a[0]);points.push({x:value(p,keys[0]),y:value(p,keys[1]),z:dimension===3?value(p,keys[2]):0,row:p.row,cluster:p.cluster,series});}
  for(let series=0;series<count;series++)for(const c of pca.centroids||[]){if(!c.count)continue;const keys=axes.map(a=>a[series]||a[0]);centers.push({x:value(c,keys[0]),y:value(c,keys[1]),z:dimension===3?value(c,keys[2]):0,cluster:c.cluster,series,count:c.count,label:(count>1?'系列'+(series+1)+' / ':'')+'群'+(c.cluster+1)+' 中心'});}
  const labels=axes.map((a,i)=>a.map(k=>choiceName(pca,k)).join(' / ')||(i===2?'Z=0':'')) as [string,string,string];
  const axisCaptions=axes.map(a=>a.map(key=>key.startsWith('column:')?(pca.dimensions[Number(key.split(':')[1])].split('|').at(-1)?.trim()||choiceName(pca,key)):choiceName(pca,key)).join(' / ')) as [string,string,string];
  return {title:'主成分の分布',labels,axisCaptions,points,centers,dimension,uniform:true,lines,seriesNames:Array.from({length:count},(_,i)=>'系列'+(i+1)+'：'+axes.slice(0,dimension).map(a=>choiceName(pca,a[i]||a[0])).join(' × '))};
}
export function variablePlot(c:VariableSummary):PlotModel {return {title:c.name+'：'+c.stats.rule,labels:['選択順',c.name,''],points:c.plot.filter(p=>p.value!==null).map(p=>({x:p.order??p.row,y:p.value!,z:0,row:p.row,cluster:0,series:0})),dimension:2,lines:true,seriesNames:[c.name]};}
export function pairPlot(p:PairSummary):PlotModel {return {title:p.x+' × '+p.y,labels:[p.x,p.y,''],points:p.plot.map(v=>({...v,z:0,cluster:0,series:0})),dimension:2,lines:false,seriesNames:[p.rule],...(p.slope!==null&&p.intercept!==null?{regression:{slope:p.slope,intercept:p.intercept}}:{})};}
export function rotate(point:{x:number;y:number;z:number},orientation:Orientation,angle:number){const yaw=(orientation.yaw+angle)*Math.PI/180,pitch=orientation.pitch*Math.PI/180,roll=orientation.roll*Math.PI/180;const x=point.x*Math.cos(yaw)-point.z*Math.sin(yaw),depth=point.x*Math.sin(yaw)+point.z*Math.cos(yaw),y=point.y*Math.cos(pitch)-depth*Math.sin(pitch),z=point.y*Math.sin(pitch)+depth*Math.cos(pitch);return {x:x*Math.cos(roll)-y*Math.sin(roll),y:x*Math.sin(roll)+y*Math.cos(roll),z};}
export function geometry(model:PlotModel,orientation:Orientation={yaw:0,pitch:0,roll:0},angle=0){
  const all=[...model.points,...model.centers||[]],bounds=['x','y','z'].map(axis=>{const values=all.map(p=>p[axis as 'x'|'y'|'z']);const min=Math.min(0,...values),max=Math.max(0,...values);return {min,max,span:max-min||1};});
  const extent=Math.max(1,...all.flatMap(p=>[Math.abs(p.x),Math.abs(p.y),Math.abs(p.z)]));
  const normalize=<T extends {x:number;y:number;z:number}>(p:T)=>model.uniform?{...p,x:p.x/extent,y:p.y/extent,z:model.dimension===3?p.z/extent:0}:{...p,x:(p.x-bounds[0].min)/bounds[0].span*2-1,y:(p.y-bounds[1].min)/bounds[1].span*2-1,z:model.dimension===3?(p.z-bounds[2].min)/bounds[2].span*2-1:0};
  const project=(p:{x:number;y:number;z:number})=>{const v=model.dimension===3?rotate(p,orientation,angle):p;return {x:240+v.x*132,y:160-v.y*106,z:'z' in v?v.z:0};};
  const origin=model.dimension===3||model.uniform?{x:0,y:0,z:0}:{x:-1,y:-1,z:0},axes=[{x:1.35,y:origin.y,z:origin.z},{x:origin.x,y:1.3,z:origin.z},{x:origin.x,y:origin.y,z:1.35}].slice(0,model.dimension).map((end,i)=>({start:project(origin),end:project(end),name:'XYZ'[i]+': '+model.labels[i],caption:'XYZ'[i]+': '+(model.axisCaptions?.[i]||model.labels[i])}));
  const points=model.points.map(p=>({...p,...project(normalize(p)),original:p})),centers=(model.centers||[]).map(p=>({...p,...project(normalize(p)),original:p}));
  const regression=model.regression?[bounds[0].min,bounds[0].max].map(x=>project({x:(x-bounds[0].min)/bounds[0].span*2-1,y:(model.regression!.slope*x+model.regression!.intercept-bounds[1].min)/bounds[1].span*2-1,z:0})):[];
  return {points,centers,axes,bounds,regression};
}
export interface PlotColors {bg:string;text:string;muted:string;series:string[]}
export function plotColors(theme:ImageTheme='light'):PlotColors {return theme==='dark'?{bg:'#292929',text:'#f0f0f0',muted:'#b3b3b3',series:['#479ef5','#54b054','#f7630c','#a6a7ff']}:{bg:'#ffffff',text:'#242424',muted:'#616161',series:['#0f6cbd','#107c41','#d83b01','#5b5fc7']};}
const font=(size:number)=>`${size}px "Segoe UI","Yu Gothic UI",sans-serif`;
function canvasMeasure(context:CanvasRenderingContext2D):TextMeasure{return (text,size)=>{context.font=font(size);return context.measureText(text).width;};}
export function plotCanvas(model:PlotModel,pixelRatio=1){const canvas=document.createElement('canvas'),context=canvas.getContext('2d')!;const layout=plotLayout(model,geometry(model),canvasMeasure(context));canvas.width=Math.round(layout.width*pixelRatio);canvas.height=Math.round(layout.height*pixelRatio);return canvas;}
export function drawPlot(canvas:HTMLCanvasElement,model:PlotModel,orientation:Orientation,angle:number,colors=plotColors()){
  const context=canvas.getContext('2d')!,g=plotLayout(model,geometry(model,orientation,angle),canvasMeasure(context));
  context.save();context.fillStyle=colors.bg;context.fillRect(0,0,canvas.width,canvas.height);
  const scale=Math.min(canvas.width/g.width,canvas.height/g.height);context.translate((canvas.width-g.width*scale)/2,(canvas.height-g.height*scale)/2);context.scale(scale,scale);
  context.strokeStyle=colors.muted;context.lineWidth=1;
  for(const axis of g.axes){context.beginPath();context.moveTo(axis.start.x,axis.start.y);context.lineTo(axis.end.x,axis.end.y);context.stroke();}
  for(const leader of g.leaders){context.beginPath();context.moveTo(leader.start.x,leader.start.y);context.lineTo(leader.end.x,leader.end.y);context.stroke();}
  context.save();context.beginPath();context.rect(g.plot.x,g.plot.y,g.plot.width,g.plot.height);context.clip();
  if(model.lines)for(let series=0;series<model.seriesNames.length;series++){const points=g.points.filter(p=>p.series===series);context.strokeStyle=colors.series[series%4];context.beginPath();points.forEach((p,i)=>i?context.lineTo(p.x,p.y):context.moveTo(p.x,p.y));context.stroke();}
  if(g.regression.length){context.strokeStyle=colors.series[1];context.setLineDash([5,4]);context.beginPath();context.moveTo(g.regression[0].x,g.regression[0].y);context.lineTo(g.regression[1].x,g.regression[1].y);context.stroke();context.setLineDash([]);}
  for(const p of [...g.points].sort((a,b)=>a.z-b.z)){context.fillStyle=colors.series[(model.seriesNames.length>1?p.series:p.cluster)%4];context.beginPath();context.arc(p.x,p.y,2.7,0,2*Math.PI);context.fill();}
  for(const c of g.centers){context.strokeStyle=colors.series[(model.seriesNames.length>1?c.series:c.cluster)%4];context.lineWidth=2;context.fillStyle=colors.bg;context.beginPath();context.moveTo(c.x,c.y-7);context.lineTo(c.x+7,c.y);context.lineTo(c.x,c.y+7);context.lineTo(c.x-7,c.y);context.closePath();context.fill();context.stroke();context.beginPath();context.moveTo(c.x-3,c.y);context.lineTo(c.x+3,c.y);context.moveTo(c.x,c.y-3);context.lineTo(c.x,c.y+3);context.stroke();}
  context.textAlign='left';context.textBaseline='top';
  for(const box of centerLabelLayout(g.centers,g.plot,canvasMeasure(context))){context.fillStyle=colors.bg;context.fillRect(box.x-2,box.y-1,box.width+4,box.height+2);context.fillStyle=colors.series[(model.seriesNames.length>1?box.center.series:box.center.cluster)%4];context.font=font(box.font);box.lines.forEach((line,i)=>context.fillText(line,box.x,box.y+i*box.lineHeight));}
  context.restore();context.fillStyle=colors.text;context.textAlign='left';context.textBaseline='top';
  for(const box of g.labels){context.font=font(box.font);box.lines.forEach((line,i)=>context.fillText(line,box.x,box.y+i*box.lineHeight));}
  context.restore();
}
export function plotPNG(model:PlotModel,orientation:Orientation={yaw:0,pitch:0,roll:0},angle=0,theme:ImageTheme='light'){const canvas=plotCanvas(model,1.5);drawPlot(canvas,model,orientation,angle,plotColors(theme));return canvas.toDataURL('image/png');}
export function plotFilename(model:PlotModel){return 'analysis_'+model.labels.slice(0,model.dimension).map((label,i)=>'XYZ'[i]+'-'+label.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,48)).join('_');}
export interface ObjLabelMask {width:number;height:number;runs:[x:number,y:number,width:number][]}
export type ObjLabelRasterizer=(text:string)=>ObjLabelMask;
function objLabelMask(text:string):ObjLabelMask {
  const canvas=document.createElement('canvas'),context=canvas.getContext('2d');if(!context)throw Error('OBJの軸名を描画できません。');
  const size=24,lineHeight=30,padding=3;context.font='600 '+font(size);
  const lines=wrapText(text,378,size,value=>context.measureText(value).width,12);
  canvas.width=Math.max(1,Math.ceil(Math.max(...lines.map(value=>context.measureText(value).width))+padding*2));canvas.height=Math.max(1,lines.length*lineHeight+padding*2);
  context.font='600 '+font(size);context.fillStyle='#fff';context.textBaseline='top';lines.forEach((line,i)=>context.fillText(line,padding,padding+i*lineHeight));
  const pixels=context.getImageData(0,0,canvas.width,canvas.height).data,runs:ObjLabelMask['runs']=[];
  for(let y=0;y<canvas.height;y++){let start=-1;for(let x=0;x<=canvas.width;x++){const ink=x<canvas.width&&pixels[(y*canvas.width+x)*4+3]>=96;if(ink&&start<0)start=x;if(!ink&&start>=0){runs.push([start,y,x-start]);start=-1;}}}
  return {width:canvas.width,height:canvas.height,runs};
}
// OBJ has no font or point-size primitive: export visible solid geometry in the
// original data coordinates, with text rendered into the same standalone file.
export function objText(model:PlotModel,rasterize:ObjLabelRasterizer=objLabelMask){
  const axisNames=model.labels.slice(0,model.dimension).map((label,i)=>'XYZ'[i]+': '+label.replace(/[\r\n]/g,' '));
  const all=[...model.points,...model.centers||[]],text=['# CSV nyaan Viewer',...axisNames.map(label=>'# '+label)],extent=Math.max(1,...all.flatMap(p=>[Math.abs(p.x),Math.abs(p.y),Math.abs(p.z)]));
  if(!Number.isFinite(extent)||all.some(p=>![p.x,p.y,p.z].every(Number.isFinite)))throw Error('OBJの座標が不正です。');
  const radius=extent*.025;let vertices=0;
  const vertex=(x:number,y:number,z:number)=>{text.push(`v ${x} ${y} ${z}`);return ++vertices;};
  const face=(...ids:number[])=>{for(let i=1;i<ids.length-1;i++)text.push(`f ${ids[0]} ${ids[i]} ${ids[i+1]}`);};
  function labelMesh(name:string,label:string,mask:ObjLabelMask,origin:number[],pixel:number){
    text.push('o '+name,'g '+name,'# '+label);const depth=extent*.008;
    for(const [x,y,width] of mask.runs){
      const left=origin[0]+x*pixel,right=left+width*pixel,bottom=origin[1]+(mask.height-y-1)*pixel,top=bottom+pixel,z=origin[2];
      const a=vertex(left,bottom,z),b=vertex(right,bottom,z),c=vertex(right,top,z),d=vertex(left,top,z),e=vertex(left,bottom,z+depth),f=vertex(right,bottom,z+depth),g=vertex(right,top,z+depth),h=vertex(left,top,z+depth);
      face(a,d,c,b);face(e,f,g,h);face(a,b,f,e);face(b,c,g,f);face(c,d,h,g);face(d,a,e,h);
    }
  }
  const centers=model.points.map(p=>vertex(p.x,p.y,p.z));text.push('# Point radius: '+radius,'s off');
  function sphere(p:Point3,index:number){
    text.push('g point_'+(index+1),'# Source row: '+p.row+'; cluster: '+p.cluster);const segments=12,rings=8;
    const top=vertex(p.x,p.y+radius,p.z),rows:number[][]=[];
    for(let ring=1;ring<rings;ring++){const theta=Math.PI*ring/rings;rows.push(Array.from({length:segments},(_,j)=>{const phi=2*Math.PI*j/segments;return vertex(p.x+radius*Math.sin(theta)*Math.cos(phi),p.y+radius*Math.cos(theta),p.z+radius*Math.sin(theta)*Math.sin(phi));}));}
    const bottom=vertex(p.x,p.y-radius,p.z);
    for(let j=0;j<segments;j++){const next=(j+1)%segments;face(top,rows[0][next],rows[0][j]);for(let r=0;r<rows.length-1;r++)face(rows[r][j],rows[r][next],rows[r+1][next],rows[r+1][j]);face(bottom,rows.at(-1)![j],rows.at(-1)![next]);}
  }
  for(let series=0;series<model.seriesNames.length;series++){
    text.push('o series_'+(series+1));const ids:number[]=[];
    model.points.forEach((p,i)=>{if(p.series===series){ids.push(centers[i]);sphere(p,i);}});
    if(model.lines&&ids.length>1){text.push('g series_'+(series+1)+'_connections','l '+ids.join(' '));}
  }
  for(const center of model.centers||[]){
    const name='cluster_center_'+(center.series+1)+'_'+(center.cluster+1),r=extent*.06;
    text.push('o '+name,'g '+name,'# '+center.label+'; count: '+center.count,'# Centroid: '+[center.x,center.y,center.z].join(' '));
    const xp=vertex(center.x+r,center.y,center.z),xn=vertex(center.x-r,center.y,center.z),yp=vertex(center.x,center.y+r,center.z),yn=vertex(center.x,center.y-r,center.z),zp=vertex(center.x,center.y,center.z+r),zn=vertex(center.x,center.y,center.z-r),ring=[xp,zn,xn,zp];
    for(let i=0;i<4;i++){const next=ring[(i+1)%4];face(yp,ring[i],next);face(yn,next,ring[i]);}
    const mask=rasterize(center.label+' ('+center.count+')');if(!mask.width||!mask.height||!mask.runs.length)throw Error('OBJのクラスター中心名を描画できません。');
    labelMesh('cluster_center_label_'+(center.series+1)+'_'+(center.cluster+1),center.label,mask,[center.x+r*1.3,center.y+r*1.3,center.z],Math.min(extent*.004,extent*.75/mask.width));
  }
  function axialVertex(axis:number,distance:number,r:number,angle:number){const coords=[0,0,0];coords[axis]=distance;coords[(axis+1)%3]=Math.cos(angle)*r;coords[(axis+2)%3]=Math.sin(angle)*r;return vertex(coords[0],coords[1],coords[2]);}
  for(let axis=0;axis<model.dimension;axis++){
    const values=all.map(p=>p[['x','y','z'][axis] as 'x'|'y'|'z']),min=Math.min(0,...values),start=min<0?min-extent*.1:0,end=extent*1.35,base=end-extent*.12,segments=12;
    text.push('o axis_'+'XYZ'[axis],'g axis_'+'XYZ'[axis],'# '+axisNames[axis]);
    const a=Array.from({length:segments},(_,j)=>axialVertex(axis,start,extent*.006,j*2*Math.PI/segments)),b=Array.from({length:segments},(_,j)=>axialVertex(axis,base,extent*.006,j*2*Math.PI/segments)),ca=axialVertex(axis,start,0,0),cb=axialVertex(axis,base,0,0);
    for(let j=0;j<segments;j++){const next=(j+1)%segments;face(a[j],a[next],b[next],b[j]);face(ca,a[next],a[j]);face(cb,b[j],b[next]);}
    const arrow=Array.from({length:segments},(_,j)=>axialVertex(axis,base,extent*.032,j*2*Math.PI/segments)),tip=axialVertex(axis,end,0,0),center=axialVertex(axis,base,0,0);
    for(let j=0;j<segments;j++){const next=(j+1)%segments;face(arrow[j],arrow[next],tip);face(center,arrow[next],arrow[j]);}
    const mask=rasterize(axisNames[axis]);if(!mask.width||!mask.height||!mask.runs.length)throw Error('OBJの軸名を描画できません。');
    const pixel=Math.min(extent*.006,extent*1.35/mask.width),w=mask.width*pixel;
    const origin=axis===0?[end+extent*.08,extent*.08,0]:axis===1?[-w/2,end+extent*.08,0]:[-w/2,extent*.08,end+extent*.08];
    labelMesh('axis_label_'+'XYZ'[axis],axisNames[axis],mask,origin,pixel);
  }
  return text.join('\n')+'\n';
}
export function seriesCorrelations(model:PlotModel){if(model.seriesNames.length<2)return [];const first=model.points.filter(p=>p.series===0),second=model.points.filter(p=>p.series===1);return ['x','y','z'].slice(0,model.dimension).map(key=>{const a=first.map(p=>p[key as 'x'|'y'|'z']),b=second.map(p=>p[key as 'x'|'y'|'z']);const ma=a.reduce((s,v)=>s+v,0)/a.length,mb=b.reduce((s,v)=>s+v,0)/b.length,cross=a.reduce((s,v,i)=>s+(v-ma)*(b[i]-mb),0),den=Math.sqrt(a.reduce((s,v)=>s+(v-ma)**2,0)*b.reduce((s,v)=>s+(v-mb)**2,0));return {axis:key.toUpperCase(),r:den?cross/den:null};});}
