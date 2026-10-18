import { app, BrowserWindow, dialog, shell } from 'electron';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const config = JSON.parse(readFileSync(join(import.meta.dirname, 'config.json'), 'utf8'));
let appUrl;

// Reads KEY=VALUE lines (e.g. ANTHROPIC_API_KEY=...) without overriding real env vars.
function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
}

// Without a hosted server URL, Raken runs its server inside the app.
// Its data and settings live in the app's user data folder: ~/Library/Application
// Support/Raken on Mac, %APPDATA%\Raken on Windows.
async function startLocalServer() {
  const dataDir = app.getPath('userData');
  loadEnvFile(join(dataDir, 'raken.env'));
  process.env.RAKEN_DATA_DIR ??= dataDir;
  const { createApp } = await import('./app/server.js');
  const server = createApp();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 760,
    minHeight: 560,
    title: 'Raken',
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });

  const isInApp = (url) => new URL(url).origin === new URL(appUrl).origin;
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!isInApp(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
  win.loadURL(`${appUrl}/app.html`);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      appUrl = config.serverUrl?.replace(/\/$/, '') || (await startLocalServer());
    } catch (err) {
      dialog.showErrorBox('Raken could not start', String(err?.stack ?? err));
      app.quit();
      return;
    }
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
