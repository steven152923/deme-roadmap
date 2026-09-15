const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('demeRoadmap', {
  load: (fallback) => ipcRenderer.invoke('roadmap:load', fallback),
  save: (data) => ipcRenderer.invoke('roadmap:save', data),
  exportBackup: (data) => ipcRenderer.invoke('roadmap:export', data),
  importBackup: () => ipcRenderer.invoke('roadmap:import'),
  dataPath: () => ipcRenderer.invoke('roadmap:data-path'),
  revealData: () => ipcRenderer.invoke('roadmap:reveal-data'),
  securityStatus: () => ipcRenderer.invoke('security:status'),
  securitySetup: (passcode) => ipcRenderer.invoke('security:setup', passcode),
  securityVerify: (passcode) => ipcRenderer.invoke('security:verify', passcode),
  securityLock: () => ipcRenderer.invoke('security:lock'),
  securityChange: (currentPasscode, nextPasscode) => ipcRenderer.invoke('security:change', currentPasscode, nextPasscode),
  securitySetAutoLock: (minutes) => ipcRenderer.invoke('security:auto-lock', minutes),
  setWindowTheme: (theme) => ipcRenderer.invoke('window:set-theme', theme),
});
