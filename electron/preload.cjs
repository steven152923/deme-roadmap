const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  if (typeof callback !== 'function') return () => undefined;
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

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

  networkStatus: () => ipcRenderer.invoke('network:status'),
  networkCreatePairing: () => ipcRenderer.invoke('network:create-pairing'),
  networkDevices: () => ipcRenderer.invoke('network:list-devices'),
  networkRevokeDevice: (deviceId) => ipcRenderer.invoke('network:revoke-device', deviceId),
  networkEvents: () => ipcRenderer.invoke('network:events'),
  networkResolveEvent: (eventId, resolved = true) => ipcRenderer.invoke('network:resolve-event', eventId, resolved),
  networkDeleteEvent: (eventId) => ipcRenderer.invoke('network:delete-event', eventId),
  networkAttachments: () => ipcRenderer.invoke('network:attachments'),
  networkChooseAttachment: () => ipcRenderer.invoke('network:choose-attachment'),
  networkDeleteAttachment: (attachmentId) => ipcRenderer.invoke('network:delete-attachment', attachmentId),
  networkRevealAttachment: (attachmentId) => ipcRenderer.invoke('network:reveal-attachment', attachmentId),
  networkMonitors: () => ipcRenderer.invoke('network:monitors'),
  networkAddMonitor: (name, url) => ipcRenderer.invoke('network:add-monitor', name, url),
  networkRemoveMonitor: (monitorId) => ipcRenderer.invoke('network:remove-monitor', monitorId),
  networkCheckMonitors: () => ipcRenderer.invoke('network:check-monitors'),
  networkOpenCompanion: () => ipcRenderer.invoke('network:open-companion'),

  onNetworkChanged: (callback) => subscribe('network:changed', callback),
  onRoadmapExternalChange: (callback) => subscribe('roadmap:external-change', callback),
  onRemoteLock: (callback) => subscribe('security:locked-remotely', callback),
});
