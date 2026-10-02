import type { Selection } from './types';
export function moveSelection(old:Selection|null,ranges:Selection[]|undefined,row:number,column:number,extend=false,add=false){
  const next=extend&&old?{...old,row1:row,col1:column}:{row0:row,row1:row,col0:column,col1:column};
  const previous=ranges?.length?ranges:old?[old]:[];
  return {selection:next,ranges:extend&&previous.length?[...previous.slice(0,-1),next]:add?[...previous,next]:[next]};
}
export function jumpIndex(values:string[],current:number,step:number){
  const present=(i:number)=>!!values[i]?.trim(), boundary=step>0?values.length-1:0;
  let next=current+step;if(next<0||next>=values.length)return boundary;
  if(present(current)&&present(next)){while(next+step>=0&&next+step<values.length&&present(next+step))next+=step;return next;}
  while(next>=0&&next<values.length&&!present(next))next+=step;
  return next<0||next>=values.length?boundary:next;
}
