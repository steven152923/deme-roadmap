const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
let mainWindow = null;

function roadmapPath() {
  return path.join(app.getPath('userData'), 'roadmap.json');
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
    }
    await writeRoadmap(fallback);
    return fallback;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 930,
    minWidth: 1120,
    minHeight: 700,
    backgroundColor: '#09080c',
    title: 'Deme Roadmap',
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#09080c',
      symbolColor: '#aaa4b7',
      height: 44,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isDev && url !== mainWindow.webContents.getURL()) event.preventDefault();
  });

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
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

app.whenReady().then(() => {
  app.setAppUserModelId('com.demeapp.roadmap');
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
