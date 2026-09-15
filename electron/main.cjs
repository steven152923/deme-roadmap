const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
let mainWindow = null;

function roadmapPath() {
  return path.join(app.getPath('userData'), 'roadmap.json');
}

function startupLogPath() {
  return path.join(app.getPath('userData'), 'startup.log');
}

async function logStartup(message) {
  try {
    await fs.mkdir(app.getPath('userData'), { recursive: true });
    await fs.appendFile(startupLogPath(), `[${new Date().toISOString()}] ${message}\n`, 'utf8');
  } catch {
    // Logging must never become another startup failure.
  }
}

async function writeRoadmap(data) {
  const target = roadmapPath();
  const temp = `${target}.tmp`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(temp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(temp, target);
  return target;
}

async function readRoadmap(fallback) {
  try {
    const raw = await fs.readFile(roadmapPath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.cards)) {
      throw new Error('Roadmap file has an invalid shape.');
    }
    return parsed;
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      const brokenPath = `${roadmapPath()}.broken-${Date.now()}`;
      try {
        await fs.copyFile(roadmapPath(), brokenPath);
      } catch {
        // Startup should remain resilient even if the recovery copy cannot be written.
      }
      await logStartup(`Recovered an unreadable roadmap file: ${error.message || String(error)}`);
    }
    await writeRoadmap(fallback);
    return fallback;
  }
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isVisible()) return;
  mainWindow.show();
}

async function reportRendererFailure(title, detail) {
  await logStartup(`${title}: ${detail}`);
  showWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  dialog.showMessageBox(mainWindow, {
    type: 'error',
    title: 'Deme Roadmap could not finish starting',
    message: title,
    detail: `${detail}\n\nA diagnostic log was saved to:\n${startupLogPath()}`,
    buttons: ['OK'],
  }).catch(() => undefined);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 930,
    minWidth: 1120,
    minHeight: 700,
    backgroundColor: '#f8edf7',
    title: 'Deme Roadmap',
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#f8edf7',
      symbolColor: '#7f6887',
      height: 44,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  let startupSettled = false;
  const reveal = () => {
    startupSettled = true;
    showWindow();
  };

  mainWindow.once('ready-to-show', reveal);
  mainWindow.webContents.once('did-finish-load', reveal);

  const visibilityFallback = setTimeout(() => {
    if (!startupSettled) {
      logStartup('Renderer did not emit ready-to-show within 4 seconds; forcing the window visible.');
      showWindow();
    }
  }, 4000);
  visibilityFallback.unref?.();

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    reportRendererFailure('The Roadmap page failed to load.', `${errorCode}: ${errorDescription}${validatedURL ? `\n${validatedURL}` : ''}`);
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    reportRendererFailure('The Roadmap renderer stopped unexpectedly.', `${details.reason}${typeof details.exitCode === 'number' ? ` (exit ${details.exitCode})` : ''}`);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isDev && url !== mainWindow.webContents.getURL()) event.preventDefault();
  });

  const loadPromise = isDev
    ? mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    : mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  loadPromise.catch((error) => {
    reportRendererFailure('Deme Roadmap could not load its interface.', error.message || String(error));
  });
}

ipcMain.handle('roadmap:load', async (_event, fallback) => readRoadmap(fallback));
ipcMain.handle('roadmap:save', async (_event, data) => {
  await writeRoadmap(data);
  return { ok: true };
});
ipcMain.handle('roadmap:export', async (_event, data) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Back up Deme Roadmap',
    defaultPath: `deme-roadmap-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  await fs.writeFile(result.filePath, JSON.stringify(data, null, 2), 'utf8');
  return { canceled: false, filePath: result.filePath };
});
ipcMain.handle('roadmap:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Restore Deme Roadmap backup',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  const raw = await fs.readFile(result.filePaths[0], 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.cards)) {
    throw new Error('That file is not a Deme Roadmap backup.');
  }
  await writeRoadmap(parsed);
  return { canceled: false, data: parsed };
});
ipcMain.handle('roadmap:data-path', () => roadmapPath());
ipcMain.handle('roadmap:reveal-data', () => {
  shell.showItemInFolder(roadmapPath());
  return { ok: true };
});

process.on('uncaughtException', (error) => {
  logStartup(`Main-process uncaught exception: ${error.stack || error.message || String(error)}`);
});
process.on('unhandledRejection', (reason) => {
  logStartup(`Main-process unhandled rejection: ${reason instanceof Error ? reason.stack || reason.message : String(reason)}`);
});

app.whenReady().then(() => {
  app.setAppUserModelId('com.demeapp.roadmap');
  logStartup(`Starting Deme Roadmap ${app.getVersion()} on ${process.platform} ${process.arch}`);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
