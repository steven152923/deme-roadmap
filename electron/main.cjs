const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { startLanServer } = require('./lan-server.cjs');

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const gotSingleInstanceLock = app.requestSingleInstanceLock();
let mainWindow = null;
let sessionUnlocked = false;
let lanServer = null;
let backendFailure = '';
let roadmapRevision = 1;
let quitting = false;
let roadmapQueue = Promise.resolve();
const rendererRevisions = new Map();

if (!gotSingleInstanceLock) app.quit();

function roadmapPath() { return path.join(app.getPath('userData'), 'roadmap.json'); }
function securityPath() { return path.join(app.getPath('userData'), 'security.json'); }
function startupLogPath() { return path.join(app.getPath('userData'), 'startup.log'); }
function backendLogPath() { return path.join(app.getPath('userData'), 'backend.log'); }

async function appendLog(filePath, message) {
  try {
    await fs.mkdir(app.getPath('userData'), { recursive: true });
    await fs.appendFile(filePath, `[${new Date().toISOString()}] ${message}\n`, 'utf8');
  } catch { /* diagnostics must never become a startup failure */ }
}
function logStartup(message) { return appendLog(startupLogPath(), message); }
function logBackend(message) { return appendLog(backendLogPath(), message); }

function defaultSecurity() {
  return { version: 1, configured: false, algorithm: 'scrypt-v1', salt: '', hash: '', autoLockMinutes: 15, corrupt: false };
}
async function readSecurity() {
  try {
    const parsed = JSON.parse(await fs.readFile(securityPath(), 'utf8'));
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid security file.');
    const configured = parsed.configured === true;
    if (configured && (typeof parsed.salt !== 'string' || typeof parsed.hash !== 'string' || !parsed.salt || !parsed.hash)) throw new Error('Security verifier is incomplete.');
    const autoLockMinutes = [0, 5, 15, 30, 60].includes(Number(parsed.autoLockMinutes)) ? Number(parsed.autoLockMinutes) : 15;
    return { version: 1, configured, algorithm: 'scrypt-v1', salt: parsed.salt || '', hash: parsed.hash || '', autoLockMinutes, corrupt: false };
  } catch (error) {
    if (error && error.code === 'ENOENT') return defaultSecurity();
    await logStartup(`Security file error: ${error.message || String(error)}`);
    return { ...defaultSecurity(), configured: true, corrupt: true };
  }
}
async function writeSecurity(config) {
  const target = securityPath();
  const temp = `${target}.tmp`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  const persisted = {
    version: 1,
    configured: Boolean(config.configured),
    algorithm: 'scrypt-v1',
    salt: config.salt || '',
    hash: config.hash || '',
    autoLockMinutes: [0, 5, 15, 30, 60].includes(Number(config.autoLockMinutes)) ? Number(config.autoLockMinutes) : 15,
  };
  await fs.writeFile(temp, JSON.stringify(persisted, null, 2), 'utf8');
  await fs.rename(temp, target);
  return persisted;
}
function validPasscode(passcode) { return typeof passcode === 'string' && /^\d{4,12}$/.test(passcode); }
function derivePasscode(passcode, salt) {
  return new Promise((resolve, reject) => crypto.scrypt(passcode, salt, 64, (error, key) => error ? reject(error) : resolve(key)));
}
async function verifyPasscode(passcode, config) {
  if (!validPasscode(passcode) || !config.configured || config.corrupt) return false;
  try {
    const expected = Buffer.from(config.hash, 'hex');
    const actual = await derivePasscode(passcode, Buffer.from(config.salt, 'hex'));
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch { return false; }
}
function requireUnlocked() {
  if (!sessionUnlocked) {
    const error = new Error('Deme Roadmap is locked.');
    error.code = 'ROADMAP_LOCKED';
    throw error;
  }
}
function enqueueRoadmap(task) {
  const operation = roadmapQueue.then(task, task);
  roadmapQueue = operation.catch(() => undefined);
  return operation;
}
async function writeRoadmapFile(data, source = 'system') {
  const target = roadmapPath();
  const temp = `${target}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(temp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(temp, target);
  roadmapRevision += 1;
  if (source === 'companion') await logBackend(`Canonical roadmap updated from a paired companion; revision ${roadmapRevision}.`);
  return target;
}
async function readRoadmapFile(fallback) {
  try {
    const raw = await fs.readFile(roadmapPath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.cards)) throw new Error('Roadmap file has an invalid shape.');
    return parsed;
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      const brokenPath = `${roadmapPath()}.broken-${Date.now()}`;
      try { await fs.copyFile(roadmapPath(), brokenPath); } catch { /* best effort */ }
      await logStartup(`Recovered an unreadable roadmap file: ${error.message || String(error)}`);
    }
    await writeRoadmapFile(fallback, 'recovery');
    return fallback;
  }
}
async function readRoadmap(fallback) {
  return enqueueRoadmap(() => readRoadmapFile(fallback));
}
async function writeRoadmap(data, source = 'system', expectedRevision = null) {
  return enqueueRoadmap(async () => {
    if (typeof expectedRevision === 'number' && expectedRevision !== roadmapRevision) {
      const error = new Error('Roadmap changed before this save. Reload the canonical copy and try again.');
      error.code = 'STALE_ROADMAP_REVISION';
      throw error;
    }
    return writeRoadmapFile(data, source);
  });
}
async function mutateRoadmap(mutator, source = 'companion') {
  return enqueueRoadmap(async () => {
    const current = await readRoadmapFile(BACKEND_FALLBACK);
    const result = await mutator(current);
    await writeRoadmapFile(current, source);
    return result;
  });
}

const BACKEND_FALLBACK = {
  version: 5, cards: [], releases: [], settings: { areas: ['Core'], themePreset: 'candy' }, activity: [], inbox: [], notes: [], decisions: [], launchPlans: [], focusSessions: [],
};

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isVisible()) return;
  mainWindow.show();
}
async function reportRendererFailure(title, detail) {
  await logStartup(`${title}: ${detail}`);
  showWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  dialog.showMessageBox(mainWindow, { type: 'error', title: 'Deme Roadmap could not finish starting', message: title, detail: `${detail}\n\nA diagnostic log was saved to:\n${startupLogPath()}`, buttons: ['OK'] }).catch(() => undefined);
}
const WINDOW_THEMES = {
  candy: { background: '#f8edf7', overlay: '#f8edf7', symbols: '#7f6887' },
  night: { background: '#171322', overlay: '#171322', symbols: '#d7c9e9' },
  paper: { background: '#f4eadb', overlay: '#f4eadb', symbols: '#715f58' },
};
function applyWindowTheme(theme) {
  const choice = WINDOW_THEMES[theme] || WINDOW_THEMES.candy;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setBackgroundColor(choice.background);
  if (typeof mainWindow.setTitleBarOverlay === 'function') mainWindow.setTitleBarOverlay({ color: choice.overlay, symbolColor: choice.symbols, height: 44 });
}
function sendToRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
}
async function lockFromCompanion() {
  sessionUnlocked = false;
  lanServer?.broadcast('desktop-locked');
  sendToRenderer('security:locked-remotely');
  await logBackend('Workspace locked from a paired companion.');
}
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500, height: 930, minWidth: 1120, minHeight: 700, backgroundColor: WINDOW_THEMES.candy.background, title: 'Deme Roadmap', show: false, autoHideMenuBar: true,
    titleBarStyle: 'hidden', titleBarOverlay: { color: WINDOW_THEMES.candy.overlay, symbolColor: WINDOW_THEMES.candy.symbols, height: 44 },
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  let startupSettled = false;
  const reveal = () => { startupSettled = true; showWindow(); };
  mainWindow.once('ready-to-show', reveal);
  mainWindow.webContents.once('did-finish-load', reveal);
  const visibilityFallback = setTimeout(() => { if (!startupSettled) { logStartup('Renderer did not emit ready-to-show within 4 seconds; forcing the window visible.'); showWindow(); } }, 4000);
  visibilityFallback.unref?.();
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => { if (isMainFrame) reportRendererFailure('The Roadmap page failed to load.', `${errorCode}: ${errorDescription}${validatedURL ? `\n${validatedURL}` : ''}`); });
  mainWindow.webContents.on('render-process-gone', (_event, details) => reportRendererFailure('The Roadmap renderer stopped unexpectedly.', `${details.reason}${typeof details.exitCode === 'number' ? ` (exit ${details.exitCode})` : ''}`));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url); return { action: 'deny' }; });
  mainWindow.webContents.on('will-navigate', (event, url) => { if (!isDev && url !== mainWindow.webContents.getURL()) event.preventDefault(); });
  const rendererId = mainWindow.webContents.id;
  mainWindow.webContents.on('destroyed', () => rendererRevisions.delete(rendererId));
  const loadPromise = isDev ? mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL) : mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  loadPromise.catch((error) => reportRendererFailure('Deme Roadmap could not load its interface.', error.message || String(error)));
}
function requireLanServer() {
  if (!lanServer) {
    const error = new Error(backendFailure || 'The Connected Workspace backend is not running.');
    error.code = 'LAN_BACKEND_OFFLINE';
    throw error;
  }
  return lanServer;
}
function offlineNetworkStatus() {
  return { running: false, port: 0, addresses: [], primaryUrl: '', loopbackUrl: '', webhookUrl: '', pairedDevices: 0, devices: [], pendingPairings: [], monitors: [], eventsTotal: 0, eventsUnread: 0, attachmentsCount: 0, attachmentBytes: 0, activeConnections: 0, liveStreams: 0, startedAt: '', uptimeSeconds: 0, lastError: backendFailure, backendLogPath: backendLogPath() };
}
async function startConnectedBackend() {
  backendFailure = '';
  try {
    lanServer = await startLanServer({
      app, dialog, shell,
      isUnlocked: () => sessionUnlocked,
      readRoadmap: () => readRoadmap(BACKEND_FALLBACK),
      writeRoadmap,
      mutateRoadmap: (mutator) => mutateRoadmap(mutator, 'companion'),
      getRoadmapRevision: () => roadmapRevision,
      notifyRoadmapChanged: () => sendToRenderer('roadmap:external-change', { revision: roadmapRevision }),
      notifyNetworkChanged: () => sendToRenderer('network:changed'),
      lockSession: lockFromCompanion,
      log: logBackend,
      backendLogPath: backendLogPath(),
    });
    sendToRenderer('network:changed');
    return { ok: true };
  } catch (error) {
    backendFailure = error?.message || String(error);
    lanServer = null;
    await logBackend(`Connected Workspace backend failed to start: ${error.stack || error.message || String(error)}`);
    sendToRenderer('network:changed');
    return { ok: false, error: backendFailure };
  }
}
async function restartConnectedBackend() {
  requireUnlocked();
  if (lanServer) {
    try { await lanServer.stop(); } catch (error) { await logBackend(`Backend stop during restart failed: ${error.message || error}`); }
    lanServer = null;
  }
  return startConnectedBackend();
}

ipcMain.handle('security:status', async () => {
  const config = await readSecurity();
  return { configured: config.configured, unlocked: config.configured ? sessionUnlocked : false, autoLockMinutes: config.autoLockMinutes };
});
ipcMain.handle('security:setup', async (_event, passcode) => {
  const current = await readSecurity();
  if (current.configured) return { ok: false, error: current.corrupt ? 'The local security file is damaged. Delete security.json from the Deme Roadmap app-data folder to reset the lock.' : 'A passcode is already configured.' };
  if (!validPasscode(passcode)) return { ok: false, error: 'Use a 4–12 digit passcode.' };
  const salt = crypto.randomBytes(16); const hash = await derivePasscode(passcode, salt);
  await writeSecurity({ version: 1, configured: true, salt: salt.toString('hex'), hash: hash.toString('hex'), autoLockMinutes: 15 });
  sessionUnlocked = true; lanServer?.broadcast('desktop-unlocked'); await logStartup('Roadmap passcode configured.'); return { ok: true };
});
ipcMain.handle('security:verify', async (_event, passcode) => {
  const config = await readSecurity();
  if (config.corrupt) return { ok: false, error: 'The local security file is damaged. Check startup.log for details.' };
  if (!config.configured) return { ok: false, error: 'No passcode has been configured yet.' };
  const ok = await verifyPasscode(passcode, config); sessionUnlocked = ok; if (ok) lanServer?.broadcast('desktop-unlocked'); return ok ? { ok: true } : { ok: false, error: 'That passcode is not correct.' };
});
ipcMain.handle('security:lock', async () => { sessionUnlocked = false; lanServer?.broadcast('desktop-locked'); return { ok: true }; });
ipcMain.handle('security:change', async (_event, currentPasscode, nextPasscode) => {
  requireUnlocked(); const config = await readSecurity();
  if (!await verifyPasscode(currentPasscode, config)) return { ok: false, error: 'Current passcode is not correct.' };
  if (!validPasscode(nextPasscode)) return { ok: false, error: 'New passcode must be 4–12 digits.' };
  const salt = crypto.randomBytes(16); const hash = await derivePasscode(nextPasscode, salt); await writeSecurity({ ...config, salt: salt.toString('hex'), hash: hash.toString('hex') }); return { ok: true };
});
ipcMain.handle('security:auto-lock', async (_event, minutes) => {
  requireUnlocked(); const value = Number(minutes); if (![0, 5, 15, 30, 60].includes(value)) return { ok: false, error: 'Unsupported auto-lock interval.' };
  const config = await readSecurity(); if (config.corrupt) return { ok: false, error: 'Security settings are unavailable.' }; await writeSecurity({ ...config, autoLockMinutes: value }); return { ok: true };
});
ipcMain.handle('window:set-theme', (_event, theme) => { applyWindowTheme(theme); return { ok: true }; });

ipcMain.handle('roadmap:load', async (event, fallback) => {
  requireUnlocked(); const data = await readRoadmap(fallback); rendererRevisions.set(event.sender.id, roadmapRevision); return data;
});
ipcMain.handle('roadmap:save', async (event, data) => {
  requireUnlocked();
  const rendererRevision = rendererRevisions.get(event.sender.id);
  if (typeof rendererRevision === 'number' && rendererRevision !== roadmapRevision) {
    const error = new Error('Roadmap changed from a companion before this desktop save. Reloading the canonical copy is required.');
    error.code = 'STALE_ROADMAP_REVISION'; throw error;
  }
  await writeRoadmap(data, 'desktop', rendererRevision); rendererRevisions.set(event.sender.id, roadmapRevision); lanServer?.broadcast('roadmap-changed', { source: 'desktop', revision: roadmapRevision }); return { ok: true, revision: roadmapRevision };
});
ipcMain.handle('roadmap:export', async (_event, data) => {
  requireUnlocked(); const result = await dialog.showSaveDialog(mainWindow, { title: 'Back up Deme Roadmap', defaultPath: `deme-roadmap-backup-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (result.canceled || !result.filePath) return { canceled: true }; await fs.writeFile(result.filePath, JSON.stringify(data, null, 2), 'utf8'); return { canceled: false, filePath: result.filePath };
});
ipcMain.handle('roadmap:import', async (event) => {
  requireUnlocked(); const result = await dialog.showOpenDialog(mainWindow, { title: 'Restore Deme Roadmap backup', properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  const parsed = JSON.parse(await fs.readFile(result.filePaths[0], 'utf8')); if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.cards)) throw new Error('That file is not a Deme Roadmap backup.');
  await writeRoadmap(parsed, 'restore'); rendererRevisions.set(event.sender.id, roadmapRevision); lanServer?.broadcast('roadmap-changed', { source: 'restore', revision: roadmapRevision }); return { canceled: false, data: parsed };
});
ipcMain.handle('roadmap:data-path', () => { requireUnlocked(); return roadmapPath(); });
ipcMain.handle('roadmap:reveal-data', () => { requireUnlocked(); shell.showItemInFolder(roadmapPath()); return { ok: true }; });

ipcMain.handle('network:status', () => lanServer ? lanServer.status() : offlineNetworkStatus());
ipcMain.handle('network:restart', () => restartConnectedBackend());
ipcMain.handle('network:create-pairing', async () => { requireUnlocked(); return requireLanServer().createPairing(); });
ipcMain.handle('network:pending-pairings', () => { requireUnlocked(); return requireLanServer().listPendingPairings(); });
ipcMain.handle('network:approve-pairing', async (_event, requestId) => { requireUnlocked(); return requireLanServer().approvePairing(String(requestId || '')); });
ipcMain.handle('network:reject-pairing', async (_event, requestId) => { requireUnlocked(); return requireLanServer().rejectPairing(String(requestId || '')); });
ipcMain.handle('network:list-devices', () => { requireUnlocked(); return requireLanServer().listDevices(); });
ipcMain.handle('network:revoke-device', async (_event, deviceId) => { requireUnlocked(); return requireLanServer().revokeDevice(String(deviceId || '')); });
ipcMain.handle('network:revoke-all-devices', async () => { requireUnlocked(); return requireLanServer().revokeAllDevices(); });
ipcMain.handle('network:webhook-secret', () => { requireUnlocked(); return { secret: requireLanServer().webhookSecret() }; });
ipcMain.handle('network:regenerate-webhook', async () => { requireUnlocked(); return requireLanServer().regenerateWebhookSecret(); });
ipcMain.handle('network:send-test-event', async () => { requireUnlocked(); const event = await requireLanServer().addIncomingEvent({ source: 'Deme Roadmap', eventType: 'test', title: 'Connected Workspace test event', summary: 'The local incoming event pipeline is working.', severity: 'info', metadata: { test: true } }, 'Deme Roadmap'); return { ok: true, event }; });
ipcMain.handle('network:events', () => { requireUnlocked(); return requireLanServer().listEvents(); });
ipcMain.handle('network:update-event', async (_event, eventId, patch) => { requireUnlocked(); return requireLanServer().updateEvent(String(eventId || ''), patch || {}); });
ipcMain.handle('network:delete-event', async (_event, eventId) => { requireUnlocked(); return requireLanServer().deleteEvent(String(eventId || '')); });
ipcMain.handle('network:convert-event', async (_event, eventId, kind) => { requireUnlocked(); return requireLanServer().convertEvent(String(eventId || ''), kind === 'bug' ? 'bug' : 'work'); });
ipcMain.handle('network:attachments', () => { requireUnlocked(); return requireLanServer().listAttachments(); });
ipcMain.handle('network:attachment-targets', () => { requireUnlocked(); return requireLanServer().attachmentTargets(); });
ipcMain.handle('network:choose-attachment', async (_event, ownerType, ownerId) => { requireUnlocked(); return requireLanServer().chooseAttachment(mainWindow, ownerType, ownerId); });
ipcMain.handle('network:add-attachment', async (_event, input) => { requireUnlocked(); return { attachment: await requireLanServer().addAttachmentFromBase64({ ...(input || {}), source: 'desktop' }) }; });
ipcMain.handle('network:delete-attachment', async (_event, attachmentId) => { requireUnlocked(); return requireLanServer().deleteAttachment(String(attachmentId || '')); });
ipcMain.handle('network:reveal-attachment', async (_event, attachmentId) => { requireUnlocked(); return requireLanServer().revealAttachment(String(attachmentId || '')); });
ipcMain.handle('network:open-attachment', async (_event, attachmentId) => { requireUnlocked(); return requireLanServer().openAttachment(String(attachmentId || '')); });
ipcMain.handle('network:attachment-preview', async (_event, attachmentId) => { requireUnlocked(); return requireLanServer().attachmentPreview(String(attachmentId || '')); });
ipcMain.handle('network:monitors', () => { requireUnlocked(); return requireLanServer().listMonitors(); });
ipcMain.handle('network:add-monitor', async (_event, name, url) => { requireUnlocked(); return requireLanServer().addMonitor(name, url); });
ipcMain.handle('network:remove-monitor', async (_event, monitorId) => { requireUnlocked(); return requireLanServer().removeMonitor(String(monitorId || '')); });
ipcMain.handle('network:check-monitors', async () => { requireUnlocked(); return requireLanServer().checkMonitors(); });
ipcMain.handle('network:open-companion', async () => { requireUnlocked(); return requireLanServer().openCompanion(); });

process.on('uncaughtException', (error) => logStartup(`Main-process uncaught exception: ${error.stack || error.message || String(error)}`));
process.on('unhandledRejection', (reason) => logStartup(`Main-process unhandled rejection: ${reason instanceof Error ? reason.stack || reason.message : String(reason)}`));

if (gotSingleInstanceLock) {
  app.on('second-instance', () => { if (!mainWindow || mainWindow.isDestroyed()) return; if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); });
  app.whenReady().then(async () => {
    app.setAppUserModelId('com.demeapp.roadmap');
    await logStartup(`Starting Deme Roadmap ${app.getVersion()} on ${process.platform} ${process.arch}`);
    createWindow();
    await startConnectedBackend();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
}
app.on('before-quit', (event) => {
  if (quitting) return;
  event.preventDefault(); quitting = true;
  Promise.resolve(lanServer?.stop()).catch(() => undefined).finally(() => app.quit());
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
