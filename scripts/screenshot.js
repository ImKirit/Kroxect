// Renders the UI in hidden offscreen windows WITHOUT the preload script, so
// demo.js provides mock data, and captures PNGs into docs/ from paint events.
// Run: npx electron scripts/screenshot.js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeCapturer(win) {
  let last = null;
  win.webContents.on('paint', (e, dirty, image) => { last = image; });
  win.webContents.setFrameRate(10);
  return async (name) => {
    win.webContents.invalidate();
    await sleep(600);
    if (!last) throw new Error('no paint frame for ' + name);
    fs.writeFileSync(path.join(OUT, name), last.toPNG());
    console.log('wrote', name);
  };
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  // ---- main window: home grid, detail, files tab -------------------------
  const main = new BrowserWindow({
    width: 1360, height: 860, show: false,
    backgroundColor: '#0b0a10',
    webPreferences: { offscreen: true },
  });
  const capMain = makeCapturer(main);
  await main.loadFile(path.join(ROOT, 'src', 'renderer', 'index.html'));
  await sleep(900);
  await capMain('main-home.png');

  await main.webContents.executeJavaScript(`document.querySelector('.card').click()`);
  await sleep(700);
  await capMain('main-overview.png');

  await main.webContents.executeJavaScript(`document.querySelector('[data-tab="files"]').click()`);
  await sleep(500);
  await main.webContents.executeJavaScript(`
    (() => {
      const row = [...document.querySelectorAll('.frow')].find(r => r.dataset.rel === 'Footage');
      if (row) row.click();
    })()`);
  await sleep(500);
  await capMain('main-files.png');

  // ---- graph view --------------------------------------------------------
  await main.webContents.executeJavaScript(`document.getElementById('btnGraph').click()`);
  await sleep(2600); // let the force layout settle
  await capMain('main-graph.png');

  // ---- stats view --------------------------------------------------------
  await main.webContents.executeJavaScript(`document.getElementById('btnStats').click()`);
  await sleep(900);
  await capMain('main-stats.png');

  // ---- trash view --------------------------------------------------------
  await main.webContents.executeJavaScript(`document.getElementById('btnTrash').click()`);
  await sleep(700);
  await capMain('main-trash.png');

  // ---- AI panel (demo answer) -------------------------------------------
  await main.webContents.executeJavaScript(`
    document.getElementById('btnAi').click();
    document.getElementById('aiInput').value = 'Where is the main clip of my AMV?';
    document.getElementById('btnAiSend').click();`);
  await sleep(1200);
  await capMain('main-ai.png');
  await main.webContents.executeJavaScript(`
    document.getElementById('btnAiClose').click();
    document.querySelector('#statusNav .nav-item').click();`);
  await sleep(400);

  // ---- settings: visual template editor ---------------------------------
  await main.webContents.executeJavaScript(`
    document.getElementById('btnGraphBack').click();
    document.getElementById('btnSettings').click();`);
  await sleep(500);
  await main.webContents.executeJavaScript(`
    (() => { // scroll the modal down to the template tree editor
      const tree = document.getElementById('tplTree');
      if (tree) tree.scrollIntoView({ block: 'center' });
    })()`);
  await sleep(500);
  await capMain('main-settings.png');
  await main.webContents.executeJavaScript(`document.getElementById('modalBackdrop').hidden = true`);

  // ---- overlay: search results ------------------------------------------
  const overlay = new BrowserWindow({
    width: 720, height: 540, show: false, transparent: true, frame: false,
    webPreferences: { offscreen: true },
  });
  const capOverlay = makeCapturer(overlay);
  await overlay.loadFile(path.join(ROOT, 'src', 'overlay', 'overlay.html'));
  await sleep(600);
  await overlay.webContents.executeJavaScript(`
    const q = document.getElementById('q');
    q.value = 'clip';
    q.dispatchEvent(new Event('input'));`);
  await sleep(600);
  await capOverlay('overlay-search.png');

  app.quit();
}).catch((e) => { console.error(e); app.exit(1); });
