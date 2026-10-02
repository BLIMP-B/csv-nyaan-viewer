import {useEffect,useState} from 'react';
import {defaultDockLayout,normalizeDockLayout,type DockLayout} from './dock-state';
export function useDocking(onError:(text:string)=>void) {
  const [layout,setLayout]=useState<DockLayout>(defaultDockLayout),[loaded,setLoaded]=useState(false);
  useEffect(()=>{let alive=true;window.csv.preferences().then(p=>{if(alive){setLayout(normalizeDockLayout(p.dockLayout,p));setLoaded(true);}}).catch(e=>{if(alive){onError(String(e));setLoaded(true);}});return()=>{alive=false;};},[]);
  useEffect(()=>{if(!loaded)return;const timer=setTimeout(()=>window.csv.preferences({dockLayout:layout}).catch(e=>onError(String(e))),80);return()=>clearTimeout(timer);},[layout,loaded]);
  return [layout,setLayout] as const;
}
