const {
  app, BrowserWindow, ipcMain, dialog, shell, globalShortcut,
  screen, Tray, Menu, nativeImage, clipboard,
} = require('electron');
const path = require('path');
const store = require('./store');
const indexer = require('./indexer');

let mainWin = null;
let overlayWin = null;
let tray = null;
let isQuitting = false;
const SMOKE = process.argv.includes('--smoke');
const ICON = path.join(__dirname, '..', '..', 'build', 'icon.png');

// ---------------------------------------------------------------- windows --
function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 1280, height: 840, minWidth: 960, minHeight: 620,
    backgroundColor: '#0b0a10',
    icon: ICON,
    title: 'Krate',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWin.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWin.on('close', (e) => {
    if (!isQuitting) { e.preventDefault(); mainWin.hide(); } // keep hotkey alive in tray
  });
}

function createOverlayWindow() {
  overlayWin = new BrowserWindow({
    width: 720, height: 540,
    show: false, frame: false, transparent: true, resizable: false,
    skipTaskbar: true, alwaysOnTop: true, fullscreenable: false,
    icon: ICON,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  overlayWin.loadFile(path.join(__dirname, '..', 'overlay', 'overlay.html'));
  overlayWin.on('blur', () => {
    // renderer suppresses this while a drag is in flight
    overlayWin.webContents.send('overlay-blur');
  });
}

function toggleOverlay() {
  if (!overlayWin) return;
  if (overlayWin.isVisible()) { overlayWin.hide(); return; }
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { x, y, width, height } = display.workArea;
  const [w, h] = overlayWin.getSize();
  overlayWin.setPosition(Math.round(x + (width - w) / 2), Math.round(y + height * 0.16));
  overlayWin.show();
  overlayWin.focus();
  overlayWin.webContents.send('overlay-shown');
}

function hideOverlay() {
  if (overlayWin && overlayWin.isVisible()) overlayWin.hide();
}

function showMain() {
  if (!mainWin) return;
  if (!mainWin.isVisible()) mainWin.show();
  if (mainWin.isMinimized()) mainWin.restore();
  mainWin.focus();
}

// ---------------------------------------------------------------- hotkey ---
function registerHotkey(accel) {
  globalShortcut.unregisterAll();
  if (!accel) return { ok: true };
  try {
    const ok = globalShortcut.register(accel, toggleOverlay);
    return ok ? { ok: true } : { ok: false, error: 'Shortcut is taken by another app.' };
  } catch {
    return { ok: false, error: 'Invalid shortcut format.' };
  }
}

// ------------------------------------------------------------------- tray --
function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.setToolTip('Krate');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Krate', click: showMain },
    { label: 'Quick Search', click: toggleOverlay },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on('click', showMain);
}

// --------------------------------------------------------------- ai window --
// Embedded browser window where the user signs in to their own AI account
// (no API keys). A Chrome UA is used so provider logins behave like a normal
// browser; the session persists between launches.
const AI_PROVIDERS = {
  claude: 'https://claude.ai/new',
  chatgpt: 'https://chatgpt.com/',
  gemini: 'https://gemini.google.com/app',
  copilot: 'https://copilot.microsoft.com/',
};
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';
let aiWin = null;

function openAiWindow(provider) {
  const url = AI_PROVIDERS[provider] || AI_PROVIDERS.claude;
  if (aiWin && !aiWin.isDestroyed()) {
    aiWin.show();
    aiWin.focus();
    if (aiWin._provider !== provider) aiWin.loadURL(url, { userAgent: CHROME_UA });
    aiWin._provider = provider;
    return;
  }
  aiWin = new BrowserWindow({
    width: 1100, height: 800, minWidth: 700, minHeight: 500,
    backgroundColor: '#0b0a10',
    icon: ICON,
    title: 'Krate — AI Assistant',
    autoHideMenuBar: true,
    webPreferences: {
      partition: 'persist:krate-ai',
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  aiWin._provider = provider;
  aiWin.webContents.setUserAgent(CHROME_UA);
  // keep sign-in popups (Google/Microsoft OAuth) inside the same session
  aiWin.webContents.setWindowOpenHandler(({ url: u }) => {
    if (/^https:/.test(u)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          webPreferences: { partition: 'persist:krate-ai' },
        },
      };
    }
    return { action: 'deny' };
  });
  aiWin.on('closed', () => { aiWin = null; });
  aiWin.loadURL(url, { userAgent: CHROME_UA });
}

// -------------------------------------------------------------------- ipc --
function wireIpc() {
  ipcMain.handle('state:get', async () => ({
    config: store.getConfig(),
    projects: await store.listProjects(),
    version: app.getVersion(),
  }));

  ipcMain.handle('config:save', (e, partial) => {
    const before = store.getConfig().hotkey;
    const cfg = store.saveConfig(partial);
    let hotkeyResult = { ok: true };
    if (partial.hotkey !== undefined && partial.hotkey !== before) {
      hotkeyResult = registerHotkey(cfg.hotkey);
      if (!hotkeyResult.ok) { store.saveConfig({ hotkey: before }); registerHotkey(before); }
    }
    return { config: store.getConfig(), hotkey: hotkeyResult };
  });

  ipcMain.handle('dialog:pickFolder', async () => {
    const r = await dialog.showOpenDialog(mainWin, { properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle('project:create', (e, opts) => store.createProject(opts));
  ipcMain.handle('project:load', async (e, p) => ({
    meta: await store.readMeta(p),
    tree: await store.readTree(p),
  }));
  ipcMain.handle('project:saveMeta', (e, { path: p, meta }) => store.writeMeta(p, meta));

  ipcMain.handle('project:setCover', async (e, p) => {
    const r = await dialog.showOpenDialog(mainWin, {
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }],
    });
    if (r.canceled) return null;
    return store.setCoverFromFile(p, r.filePaths[0]);
  });

  ipcMain.handle('project:addFiles', async (e, { path: p, targetRel }) => {
    const r = await dialog.showOpenDialog(mainWin, { properties: ['openFile', 'multiSelections'] });
    if (r.canceled) return 0;
    return store.importPaths(p, targetRel, r.filePaths);
  });

  ipcMain.handle('project:importPaths', (e, { path: p, targetRel, paths }) =>
    store.importPaths(p, targetRel, paths));

  ipcMain.handle('project:newFolder', (e, { path: p, rel }) => store.newFolder(p, rel));

  ipcMain.handle('project:delete', async (e, { path: p }) => {
    const r = await dialog.showMessageBox(mainWin, {
      type: 'warning',
      buttons: ['Cancel', 'Move to Recycle Bin'],
      defaultId: 0, cancelId: 0,
      title: 'Delete project',
      message: 'Move this project folder to the Recycle Bin?',
      detail: p,
    });
    if (r.response !== 1) return false;
    await shell.trashItem(p);
    store.unregisterProject(p);
    store.bump();
    return true;
  });

  ipcMain.handle('project:unregister', (e, { path: p }) => { store.unregisterProject(p); return true; });

  ipcMain.handle('template:saveFromProject', async (e, { path: p, name }) => {
    const dirs = await store.structureOf(p);
    const cfg = store.getConfig();
    const templates = cfg.templates.filter(t => t.name !== name);
    templates.push({ id: require('crypto').randomUUID(), name, dirs, files: [] });
    return store.saveConfig({ templates }).templates;
  });

  ipcMain.handle('template:importFiles', async (e, { tplId }) => {
    const r = await dialog.showOpenDialog(mainWin, {
      properties: ['openFile', 'multiSelections'],
      title: 'Attach files to template',
    });
    if (r.canceled) return [];
    return store.importTemplateFiles(tplId, r.filePaths);
  });

  ipcMain.handle('template:deleteFiles', (e, { srcs }) => store.deleteTemplateFiles(srcs));

  ipcMain.handle('fs:open', (e, abs) => shell.openPath(abs));
  ipcMain.handle('fs:reveal', (e, abs) => { shell.showItemInFolder(abs); });
  ipcMain.handle('fs:openExternal', (e, url) => {
    if (/^https?:\/\//i.test(url)) return shell.openExternal(url);
  });

  ipcMain.handle('ai:open', async (e, { provider, projectPath }) => {
    let copied = false;
    if (projectPath) {
      try {
        clipboard.writeText(await store.buildContext(projectPath));
        copied = true;
      } catch { }
    }
    openAiWindow(provider || store.getConfig().aiProvider);
    return { copied };
  });

  ipcMain.handle('search:query', (e, q) => indexer.search(q));
  ipcMain.handle('overlay:browse', (e, { projectPath, rel }) => store.listDir(projectPath, rel));
  ipcMain.handle('overlay:hide', () => hideOverlay());
  ipcMain.handle('overlay:openInMain', (e, { projectPath, rel }) => {
    hideOverlay();
    showMain();
    mainWin.webContents.send('goto-project', { path: projectPath, rel: rel || '' });
  });

  ipcMain.on('start-drag', (e, absPath) => {
    e.sender.startDrag({ file: absPath, icon: nativeImage.createFromPath(ICON).resize({ width: 24, height: 24 }) });
  });
}

// -------------------------------------------------------------- lifecycle --
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', showMain);

  app.whenReady().then(() => {
    store.init(app.getPath('userData'));
    wireIpc();
    createMainWindow();
    createOverlayWindow();
    createTray();
    registerHotkey(store.getConfig().hotkey);

    if (SMOKE) {
      let errors = 0;
      for (const wc of [mainWin.webContents, overlayWin.webContents]) {
        wc.on('console-message', (e) => {
          if (e.level === 'error') { errors++; console.log('RENDERER_ERROR:', e.message); }
        });
      }
      let loaded = 0;
      const done = () => {
        loaded++;
        if (loaded === 2) {
          setTimeout(() => {
            console.log(errors ? 'SMOKE_FAIL' : 'SMOKE_OK');
            isQuitting = true;
            app.quit();
          }, 1200);
        }
      };
      mainWin.webContents.once('did-finish-load', done);
      overlayWin.webContents.once('did-finish-load', done);
      setTimeout(() => { console.log('SMOKE_TIMEOUT'); isQuitting = true; app.quit(); }, 20000);
    }
  });

  app.on('before-quit', () => { isQuitting = true; });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => { /* stay alive in tray */ });
}
