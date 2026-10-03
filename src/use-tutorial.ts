import {useEffect,useRef,useState,type Dispatch,type SetStateAction} from 'react';
import {defaultDockLayout,showPane,movePane,type DockLayout,type PaneId} from './dock-state';
import {TUTORIAL_STEPS} from './tutorial-steps';
import type {TutorialStage} from './tutorial';
import type {Preferences,Tab,TutorialRestore} from './types';
import type {SavedTable} from './analysis-types';
import type {MergeBlock} from './data';
interface TutorialContext {
  ready:boolean;busy:boolean;prefs:Preferences;tabs:Tab[];activeId:string;layout:DockLayout;tables:SavedTable[];blocks:MergeBlock[];selectionCount:number;
  setTabs:Dispatch<SetStateAction<Tab[]>>;setActiveId(id:string):void;setLayout:Dispatch<SetStateAction<DockLayout>>;setTables:Dispatch<SetStateAction<SavedTable[]>>;setBlocks:Dispatch<SetStateAction<MergeBlock[]>>;
  savePrefs(patch:Preferences):void;setModal(modal:string):void;setFind(open:boolean):void;restoreFocus(id:string):void;selectRange():void;createTable():Promise<void>;addSelection():Promise<void>;
}
export function useTutorial(c:TutorialContext){
  const [stage,setStage]=useState<TutorialStage>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),seen=useRef(false),snapshot=useRef<{activeId:string;prefs:TutorialRestore}|null>(null),practiceIds=useRef(new Set<string>()),current=useRef(c);current.current=c;
  useEffect(()=>{if(c.ready&&!seen.current){seen.current=true;if(!c.prefs.tutorialStatus)setStage('intro');}},[c.ready,c.prefs.tutorialStatus]);
  function replay(){if(c.busy||busy||stage!==null)return;c.setModal('');setError('');setStage('intro');}
  async function sample(kind:'csv'|'markdown'|'text'){
    const existing=current.current.tabs.find(t=>t.meta.tutorial&&t.meta.kind===kind);if(existing){c.setActiveId(existing.meta.id);return existing.meta.id;}
    const meta=await window.csv.tutorialSample(kind);practiceIds.current.add(meta.id);c.setTabs(tabs=>[...tabs,{meta,filters:[],sorts:[],hidden:[],frozen:0,widths:{},ranges:[],selection:meta.count?{row0:0,row1:0,col0:0,col1:0}:null,scrollTop:0,scrollLeft:0,preview:meta.kind==='markdown'}]);c.setActiveId(meta.id);return meta.id;
  }
  async function start(){
    if(busy||c.busy)return;setBusy(true);setError('');
    try{if(!snapshot.current){const prefs:TutorialRestore=structuredClone({dockLayout:c.layout,dockRatios:c.prefs.dockRatios||{},dockSizes:c.prefs.dockSizes||{},sidebarWidth:c.prefs.sidebarWidth||260});snapshot.current={activeId:c.activeId,prefs};}await window.csv.preferences({tutorialRestore:snapshot.current.prefs});c.setLayout(defaultDockLayout(c.prefs));await sample('csv');setStage(0);}catch(e){setError(String(e));}finally{setBusy(false);}
  }
  async function step(index:number){
    if(busy||c.busy)return;setBusy(true);setError('');c.setModal('');c.setFind(false);
    try{
      if(index>=TUTORIAL_STEPS.length){setStage('finished');return;}
      if(index<0)return;await sample('csv');const id=TUTORIAL_STEPS[index].id,panes:Record<string,PaneId>={chart:'chart',table:'table',variable:'selection',multivariate:'multivariate',merge:'merge',panes:'chart'};
      if(panes[id])c.setLayout(layout=>showPane(layout,panes[id]));setStage(index);
    }catch(e){setError(String(e));}finally{setBusy(false);}
  }
  async function action(kind?:'text'){
    if(busy||c.busy||typeof stage!=='number')return;setBusy(true);setError('');
    try{switch(TUTORIAL_STEPS[stage].id){
      case 'selection':c.selectRange();break;
      case 'table':await c.createTable();break;
      case 'merge':await c.addSelection();break;
      case 'panes':c.setLayout(layout=>movePane(layout,'chart','right'));break;
      case 'search':c.setFind(true);break;
      case 'documents':await sample(kind==='text'?'text':'markdown');break;
      case 'export':c.setModal('export');break;
      case 'settings':c.setModal('settings');break;
    }}catch(e){setError(String(e));}finally{setBusy(false);}
  }
  async function finish(status:'completed'|'skipped'){
    if(busy||c.busy)return;setBusy(true);setError('');
    try{
      const ids=new Set([...practiceIds.current,...c.tabs.filter(t=>t.meta.tutorial).map(t=>t.meta.id)]),remaining=c.tabs.filter(t=>!ids.has(t.meta.id));
      const results=await Promise.allSettled([...ids].map(id=>window.csv.close(id)));const failure=results.find(r=>r.status==='rejected');if(failure?.status==='rejected')throw failure.reason;
      c.setTabs(tabs=>tabs.filter(t=>!ids.has(t.meta.id)));c.setTables(tables=>tables.filter(t=>!ids.has(t.fileId)));c.setBlocks(blocks=>blocks.filter(b=>!b.tutorial));
      if(snapshot.current){c.setLayout(snapshot.current.prefs.dockLayout!);c.restoreFocus(remaining.some(t=>t.meta.id===snapshot.current!.activeId)?snapshot.current.activeId:remaining.at(-1)?.meta.id||'');}
      c.setModal('');c.setFind(false);c.savePrefs({...snapshot.current?.prefs,tutorialRestore:null,tutorialStatus:status});snapshot.current=null;practiceIds.current.clear();setStage(null);
    }catch(e){setError(String(e));}finally{setBusy(false);}
  }
  const id=typeof stage==='number'?TUTORIAL_STEPS[stage].id:null,tab=c.tabs.find(t=>t.meta.id===c.activeId);
  const done=id==='selection'?!!tab?.meta.tutorial&&c.selectionCount>1:id==='table'?c.tables.some(t=>c.tabs.some(tab=>tab.meta.tutorial&&tab.meta.id===t.fileId)):id==='merge'?c.blocks.some(b=>b.tutorial&&(!b.kind||b.kind==='table')):true;
  return {stage,busy:busy||c.busy,error,done,replay,start,step,action,finish};
}
