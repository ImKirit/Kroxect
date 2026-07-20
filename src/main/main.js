const {
  app, BrowserWindow, ipcMain, dialog, shell, globalShortcut,
  screen, Tray, Menu, nativeImage, clipboard, Notification,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const store = require('./store');
const indexer = require('./indexer');
const ai = require('./ai');

// Portable mode: put a file named "krate-portable.txt" next to Krate.exe and
// all data (config, trash, template files) lives in a "data" folder beside it.
try {
  const exeDir = path.dirname(app.getPath('exe'));
  if (fs.existsSync(path.join(exeDir, 'krate-portable.txt'))) {
    app.setPath('userData', path.join(exeDir, 'data'));
  }
} catch { }

let mainWin = null;
let overlayWin = null;
let tray = null;
let isQuitting = false;
const SMOKE = process.argv.includes('--smoke');
const HIDDEN_START = process.argv.includes('--hidden');

// Smoke tests run against a throwaway profile so they never collide with a
// running Krate instance (single-instance lock is per userData path) and
// never touch the real config.
if (SMOKE) {
  app.setPath('userData', require('fs').mkdtempSync(path.join(require('os').tmpdir(), 'krate-smoke-')));
}
const ICON = path.join(__dirname, '..', '..', 'build', 'icon.png');

// ---------------------------------------------------------------- windows --
const THEME_BG = { light: '#f4f4f1', dark: '#0d0d0d', purple: '#0b0a10' };

function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 1280, height: 840, minWidth: 860, minHeight: 560,
    show: !HIDDEN_START,
    backgroundColor: THEME_BG[store.getConfig().theme] || THEME_BG.light,
    icon: ICON,
    title: 'Krate',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true, // AI panel embeds the provider's site in web mode
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

// ------------------------------------------------------------ auto-update --
// Checks GitHub Releases in the background. Downloads happen silently; when
// an update is ready the user picks "restart now" or it installs on quit.
let updaterRef = null;
let pendingUpdate = null; // {version} once a download has finished
let whatsNewInfo = null;  // {from, to} on the first run after an update

function initAutoUpdate() {
  if (!app.isPackaged) return;
  try { ({ autoUpdater: updaterRef } = require('electron-updater')); } catch { return; }
  updaterRef.autoDownload = true;
  updaterRef.autoInstallOnAppQuit = true;
  updaterRef.on('error', () => { /* offline or repo not reachable: try again next start */ });
  updaterRef.on('update-downloaded', (info) => {
    pendingUpdate = { version: info.version };
    if (tray) tray.setToolTip(`Krate (update ${info.version} ready)`);
    // show the sliding update bar in the main window instead of a native dialog
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('update-ready', pendingUpdate);
  });
  updaterRef.checkForUpdates().catch(() => { });
  // re-check every 6 hours while running in the tray
  setInterval(() => updaterRef.checkForUpdates().catch(() => { }), 6 * 60 * 60 * 1000);
}

// -------------------------------------------------------------- autostart --
// Launches Krate in the background on login (tray + hotkey only). Only
// meaningful in the packaged app; in dev it would register electron.exe.
function applyAutostart() {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({
    openAtLogin: store.getConfig().autostart !== false,
    args: ['--hidden'],
  });
}

// ----------------------------------------------------------- krate:// urls --
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function handleKrateUrl(raw) {
  const m = /^krate:\/\/([^/?#]+)/i.exec(raw || '');
  if (!m) return;
  const slug = decodeURIComponent(m[1]).toLowerCase();
  const projects = await store.listProjects();
  const hit = projects.find((p) => slugify(p.meta.title) === slug || p.meta.id === slug);
  showMain();
  if (hit) mainWin.webContents.send('goto-project', { path: hit.path, rel: '' });
}

function krateUrlFromArgv(argv) {
  return argv.find((a) => /^krate:\/\//i.test(a));
}

// ------------------------------------------------------------ watch folder --
// Watches one folder (default: Downloads) for new files and offers to sort
// them into a project. Off by default; toggle in Settings.
let watcher = null;
const watchPending = new Map(); // abs -> timer (stability debounce)

function stopWatcher() {
  if (watcher) { watcher.close(); watcher = null; }
  for (const t of watchPending.values()) clearTimeout(t);
  watchPending.clear();
}

function startWatcher() {
  stopWatcher();
  const cfg = store.getConfig();
  if (!cfg.watchEnabled) return;
  const dir = cfg.watchPath || app.getPath('downloads');
  if (!fs.existsSync(dir)) return;
  const IGNORE = /\.(crdownload|part|partial|tmp|download)$|^~|^\./i;
  try {
    watcher = fs.watch(dir, (event, name) => {
      if (!name || IGNORE.test(name)) return;
      const abs = path.join(dir, name);
      if (watchPending.has(abs)) clearTimeout(watchPending.get(abs));
      // wait until the file stops changing (download finished)
      watchPending.set(abs, setTimeout(() => {
        watchPending.delete(abs);
        fs.stat(abs, (err, st) => {
          if (err || !st.isFile()) return;
          const note = new Notification({
            title: 'Krate — new file',
            body: `${name}\nClick to sort it into a project.`,
            icon: ICON,
          });
          note.on('click', () => {
            showMain();
            mainWin.webContents.send('watch-file', { path: abs, name });
          });
          note.show();
        });
      }, 2500));
    });
  } catch { /* folder not watchable */ }
}

// -------------------------------------------------------------------- ipc --
function wireIpc() {
  ipcMain.handle('state:get', async () => ({
    config: store.getConfig(),
    projects: await store.listProjects(),
    version: app.getVersion(),
    whatsNew: whatsNewInfo,
    update: pendingUpdate,
  }));

  ipcMain.handle('update:status', () => pendingUpdate);
  ipcMain.handle('update:install', () => {
    if (updaterRef && pendingUpdate) {
      isQuitting = true;
      updaterRef.quitAndInstall();
    }
  });

  ipcMain.handle('config:save', (e, partial) => {
    const before = store.getConfig().hotkey;
    const cfg = store.saveConfig(partial);
    let hotkeyResult = { ok: true };
    if (partial.hotkey !== undefined && partial.hotkey !== before) {
      hotkeyResult = registerHotkey(cfg.hotkey);
      if (!hotkeyResult.ok) { store.saveConfig({ hotkey: before }); registerHotkey(before); }
    }
    if (partial.watchEnabled !== undefined || partial.watchPath !== undefined) startWatcher();
    if (partial.autostart !== undefined) applyAutostart();
    return { config: store.getConfig(), hotkey: hotkeyResult };
  });

  ipcMain.handle('projects:adoptExisting', () => store.adoptExisting());

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
      buttons: ['Cancel', 'Move to Trash'],
      defaultId: 0, cancelId: 0,
      title: 'Delete project',
      message: 'Move this project to the Krate trash?',
      detail: 'You can restore it from the Trash view. ' + p,
    });
    if (r.response !== 1) return false;
    await store.trashProject(p);
    return true;
  });

  ipcMain.handle('trash:list', () => store.listTrash());
  ipcMain.handle('trash:restore', (e, { id }) => store.restoreProject(id));
  ipcMain.handle('trash:purge', async (e, { id }) => {
    const r = await dialog.showMessageBox(mainWin, {
      type: 'warning',
      buttons: ['Cancel', 'Delete forever'],
      defaultId: 0, cancelId: 0,
      title: 'Delete forever',
      message: 'Move this project to the Windows Recycle Bin?',
    });
    if (r.response !== 1) return false;
    return store.purgeTrashEntry(id, shell);
  });

  ipcMain.handle('project:exportZip', async (e, { path: p, title }) => {
    const r = await dialog.showSaveDialog(mainWin, {
      title: 'Export project as ZIP',
      defaultPath: `${store.sanitizeName(title || path.basename(p))}.zip`,
      filters: [{ name: 'ZIP archive', extensions: ['zip'] }],
    });
    if (r.canceled || !r.filePath) return null;
    // Windows 10+ ships bsdtar, which writes zip when the name ends in .zip (-a)
    await new Promise((resolve, reject) => {
      const child = spawn('tar', ['-a', '-cf', r.filePath, '-C', p, '.'], { windowsHide: true });
      child.on('error', reject);
      child.on('close', (code) => (code === 0 ? resolve() : reject(new Error('tar exited with ' + code))));
    });
    shell.showItemInFolder(r.filePath);
    return r.filePath;
  });

  ipcMain.handle('stats:get', () => store.libraryStats());
  ipcMain.handle('dupes:find', () => store.findDuplicates());

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

  // Built-in agent: answers questions about the library using read-only tools.
  ipcMain.handle('ai:ask', async (e, { history }) => {
    try {
      const text = await ai.ask({
        config: store.getConfig(),
        history,
        onActivity: (t) => { try { e.sender.send('ai-activity', t); } catch { } },
      });
      return { text };
    } catch (err) {
      return { error: String(err.message || err) };
    }
  });

  ipcMain.handle('ai:context', (e, { path: p }) => store.buildContext(p));
  ipcMain.handle('ai:test', (e, opts) => ai.test(opts || {}));

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
  app.on('second-instance', (e, argv) => {
    const url = krateUrlFromArgv(argv || []);
    if (url) handleKrateUrl(url);
    else showMain();
  });

  app.whenReady().then(() => {
    store.init(app.getPath('userData'));

    // Detect the first run after an update: the renderer shows "What's new"
    // exactly once. A fresh install (no lastRunVersion yet) shows nothing.
    {
      const prev = store.getConfig().lastRunVersion;
      const cur = app.getVersion();
      if (prev && prev !== cur) whatsNewInfo = { from: prev, to: cur };
      if (prev !== cur) store.saveConfig({ lastRunVersion: cur });
    }
    wireIpc();
    createMainWindow();
    createOverlayWindow();
    createTray();
    registerHotkey(store.getConfig().hotkey);
    startWatcher();
    applyAutostart();
    initAutoUpdate();

    // krate://<project-title-slug> links open the project directly
    app.setAsDefaultProtocolClient('krate');
    const url = krateUrlFromArgv(process.argv);
    if (url) mainWin.webContents.once('did-finish-load', () => handleKrateUrl(url));

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
