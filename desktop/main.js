const { app, BrowserWindow, shell, session, Tray, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Set official application name
app.name = 'SPC Workspace';

// Target Hosted Workspace URL
const TARGET_URL = process.env.CRM_DESKTOP_URL || 'https://app.supujacreations.com';

let mainWindow = null;
let tray = null;
let isQuitting = false;
let ses = null;

// Window State & Zoom persistence file
function getStateFilePath() {
  try {
    return path.join(app.getPath('userData'), 'window-state.json');
  } catch (_e) {
    return path.join(__dirname, 'window-state.json');
  }
}

let windowState = {
  width: 1400,
  height: 860,
  isMaximized: false,
  zoomFactor: 1.0
};

// Load saved state from disk
try {
  const stateFile = getStateFilePath();
  if (fs.existsSync(stateFile)) {
    const raw = fs.readFileSync(stateFile, 'utf8');
    windowState = Object.assign(windowState, JSON.parse(raw));
  }
} catch (_err) {}

// Debounced state saver
let saveTimer = null;
function saveWindowState() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!mainWindow) return;
    try {
      const isMax = mainWindow.isMaximized();
      if (!isMax) {
        const bounds = mainWindow.getBounds();
        windowState.x = bounds.x;
        windowState.y = bounds.y;
        windowState.width = bounds.width;
        windowState.height = bounds.height;
      }
      windowState.isMaximized = isMax;
      windowState.zoomFactor = mainWindow.webContents.getZoomFactor();
      fs.writeFileSync(getStateFilePath(), JSON.stringify(windowState, null, 2), 'utf8');
    } catch (_e) {}
  }, 250);
}

// Flush cookies and session state to disk permanently
async function flushSessionStorage() {
  try {
    if (ses?.cookies?.flushStore) {
      await ses.cookies.flushStore();
    }
    if (session.defaultSession?.cookies?.flushStore) {
      await session.defaultSession.cookies.flushStore();
    }
  } catch (_err) {}
}

// Enforce Single Instance Lock
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  const iconPath = path.join(__dirname, 'icon.png');

  // Dedicated persistent session for IndexedDB / LocalDB / Cookies
  ses = session.fromPartition('persist:spc_crm_session', { cache: true });

  // Automatically approve media (microphone/audio for softphone) and geolocation (for GPS attendance)
  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['media', 'geolocation', 'notifications', 'fullscreen', 'audio-capture', 'pointerLock'];
    callback(allowed.includes(permission));
  });

  const windowOptions = {
    width: windowState.width || 1400,
    height: windowState.height || 860,
    minWidth: 1024,
    minHeight: 650,
    title: 'SPC Workspace',
    icon: iconPath,
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#0f172a',
    webPreferences: {
      partition: 'persist:spc_crm_session',
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
      backgroundThrottling: false // Keeps delta sync active when minimized!
    }
  };

  if (Number.isInteger(windowState.x) && Number.isInteger(windowState.y)) {
    windowOptions.x = windowState.x;
    windowOptions.y = windowState.y;
  }

  mainWindow = new BrowserWindow(windowOptions);

  // Load live hosted cloud CRM
  mainWindow.loadURL(TARGET_URL);

  mainWindow.once('ready-to-show', () => {
    // Apply saved zoom factor
    const zoom = Math.max(0.5, Math.min(2.0, windowState.zoomFactor || 1.0));
    mainWindow.webContents.setZoomFactor(zoom);

    if (windowState.isMaximized) {
      mainWindow.maximize();
    }
    mainWindow.show();
  });

  // Track window resizing, moving, maximizing
  mainWindow.on('resize', saveWindowState);
  mainWindow.on('move', saveWindowState);
  mainWindow.on('maximize', saveWindowState);
  mainWindow.on('unmaximize', saveWindowState);

  // Keyboard zoom shortcuts (Ctrl +, Ctrl -, Ctrl 0)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.type === 'keyDown') {
      if (input.key === '=' || input.key === '+') {
        event.preventDefault();
        const current = mainWindow.webContents.getZoomFactor();
        const next = Math.min(1.6, Math.round((current + 0.1) * 10) / 10);
        mainWindow.webContents.setZoomFactor(next);
        mainWindow.webContents.send('zoom-changed', Math.round(next * 100));
        saveWindowState();
      } else if (input.key === '-') {
        event.preventDefault();
        const current = mainWindow.webContents.getZoomFactor();
        const next = Math.max(0.6, Math.round((current - 0.1) * 10) / 10);
        mainWindow.webContents.setZoomFactor(next);
        mainWindow.webContents.send('zoom-changed', Math.round(next * 100));
        saveWindowState();
      } else if (input.key === '0') {
        event.preventDefault();
        mainWindow.webContents.setZoomFactor(1.0);
        mainWindow.webContents.send('zoom-changed', 100);
        saveWindowState();
      }
    }
  });

  // Handle external links safely
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://app.supujacreations.com') || url.startsWith('http://localhost')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', async () => {
    saveWindowState();
    await flushSessionStorage();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Custom Application Menu (Reload, Fullscreen, DevTools, Zoom)
  const menuTemplate = [
    {
      label: 'File',
      submenu: [
        { label: 'Reload CRM', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.reload() },
        { label: 'Hard Refresh (Clear Cache)', accelerator: 'CmdOrCtrl+Shift+R', click: () => mainWindow?.webContents.reloadIgnoringCache() },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'Alt+F4', click: () => { isQuitting = true; app.quit(); } }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+=',
          click: () => {
            if (!mainWindow) return;
            const current = mainWindow.webContents.getZoomFactor();
            const next = Math.min(1.6, Math.round((current + 0.1) * 10) / 10);
            mainWindow.webContents.setZoomFactor(next);
            mainWindow.webContents.send('zoom-changed', Math.round(next * 100));
            saveWindowState();
          }
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => {
            if (!mainWindow) return;
            const current = mainWindow.webContents.getZoomFactor();
            const next = Math.max(0.6, Math.round((current - 0.1) * 10) / 10);
            mainWindow.webContents.setZoomFactor(next);
            mainWindow.webContents.send('zoom-changed', Math.round(next * 100));
            saveWindowState();
          }
        },
        {
          label: 'Reset Zoom (100%)',
          accelerator: 'CmdOrCtrl+0',
          click: () => {
            if (!mainWindow) return;
            mainWindow.webContents.setZoomFactor(1.0);
            mainWindow.webContents.send('zoom-changed', 100);
            saveWindowState();
          }
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools', label: 'Developer Tools' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
}

// System Tray setup
function createTray() {
  const iconPath = path.join(__dirname, 'icon.png');
  try {
    tray = new Tray(iconPath);
    const trayMenu = Menu.buildFromTemplate([
      { label: 'Open SPC Workspace', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
      { label: 'Reload', click: () => mainWindow?.reload() },
      { type: 'separator' },
      { label: 'Exit', click: () => { isQuitting = true; app.quit(); } }
    ]);
    tray.setToolTip('SPC Workspace');
    tray.setContextMenu(trayMenu);
    tray.on('double-click', () => {
      mainWindow?.show();
      mainWindow?.focus();
    });
  } catch (err) {
    console.warn('Tray icon setup notice:', err.message);
  }
}

// IPC Handlers from Preload
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());

ipcMain.handle('get-zoom-factor', () => {
  return Math.round((mainWindow?.webContents.getZoomFactor() || 1.0) * 100);
});

ipcMain.on('set-zoom-factor', (_event, percent) => {
  if (mainWindow && typeof percent === 'number') {
    const factor = Math.max(0.5, Math.min(2.0, percent / 100));
    mainWindow.webContents.setZoomFactor(factor);
    mainWindow.webContents.send('zoom-changed', Math.round(factor * 100));
    saveWindowState();
  }
});

app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', async () => {
  isQuitting = true;
  saveWindowState();
  await flushSessionStorage();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
