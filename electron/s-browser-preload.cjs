'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('sBrowser',{
  state:()=>ipcRenderer.invoke('s-browser:state'),
  command:(command,value)=>ipcRenderer.invoke('s-browser:command',{command,value}),
  onState:callback=>{const handler=(_,state)=>callback(state);ipcRenderer.on('s-browser:state',handler);return()=>ipcRenderer.removeListener('s-browser:state',handler);}
});
