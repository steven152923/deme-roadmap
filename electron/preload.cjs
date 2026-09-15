const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('demeRoadmap', {
  load: (fallback) => ipcRenderer.invoke('roadmap:load', fallback),
  save: (data) => ipcRenderer.invoke('roadmap:save', data),
  exportBackup: (data) => ipcRenderer.invoke('roadmap:export', data),
  importBackup: () => ipcRenderer.invoke('roadmap:import'),
  dataPath: () => ipcRenderer.invoke('roadmap:data-path'),
});
