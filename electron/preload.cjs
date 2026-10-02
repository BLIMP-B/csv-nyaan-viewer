'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');
const on = (channel, callback) => { const handler = (_, value) => callback(value); ipcRenderer.on(channel, handler); return () => ipcRenderer.removeListener(channel, handler); };
// Startup file notifications can arrive before React subscribes.
const pathListeners = new Set(), pendingPaths = [];
ipcRenderer.on('csv:paths', (_, paths) => {
  if (!pathListeners.size) pendingPaths.push(paths);
  else for (const callback of pathListeners) callback(paths);
});
const onPaths = callback => {
  pathListeners.add(callback);
  for (const paths of pendingPaths.splice(0)) callback(paths);
  return () => { pathListeners.delete(callback); };
};
contextBridge.exposeInMainWorld('csv', {
  icon:()=>ipcRenderer.invoke('csv:icon'),
  chooseIcon:()=>ipcRenderer.invoke('csv:chooseIcon'),
  openExternal: url => ipcRenderer.invoke('csv:openExternal', url),
  connections: () => ipcRenderer.invoke('csv:connections'),
  configureConnection: (provider, config) => ipcRenderer.invoke('csv:configureConnection', { provider, config }),
  login: provider => ipcRenderer.invoke('csv:login', provider),
  cancelLogin: () => ipcRenderer.invoke('csv:cancelLogin'),
  logout: provider => ipcRenderer.invoke('csv:logout', provider),
  share: options => ipcRenderer.invoke('csv:share', options),
  shareBrowser: options => ipcRenderer.invoke('csv:shareBrowser', options),
  onAuth: callback => on('csv:auth', callback),
  dialog: () => ipcRenderer.invoke('csv:dialog'),
  openUrl: url => ipcRenderer.invoke('csv:openUrl',url),
  open: (path, options) => ipcRenderer.invoke('csv:open', { path, options }),
  saveDocument: blocks => ipcRenderer.invoke('csv:saveDocument',blocks),
  image: (id,url) => ipcRenderer.invoke('csv:image',{id,url}),
  saveTable: (table, format) => ipcRenderer.invoke('csv:saveTable', { table, format }),
  saveChart: (data, format) => ipcRenderer.invoke('csv:saveChart', { data, format }),
  export: (id, options) => ipcRenderer.invoke('csv:export', { id, options }),
  close: id => ipcRenderer.invoke('csv:close', id),
  cancel: () => ipcRenderer.invoke('csv:cancel'),
  request: (id, method, args) => ipcRenderer.invoke('csv:request', { id, method, args }),
  clipboard: text => ipcRenderer.invoke('csv:clipboard', text),
  preferences: patch => ipcRenderer.invoke('csv:preferences', patch),
  reveal: path => ipcRenderer.invoke('csv:reveal', path),
  filePath: file => webUtils.getPathForFile(file),
  onCommand: callback => on('csv:command', callback),
  onProgress: callback => on('csv:progress', callback),
  onPaths
});
