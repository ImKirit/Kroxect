// store.js — config + project persistence. A "project" is a normal folder
// containing a krate.json; covers/assets managed by Krate live in <proj>/.krate/.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const IGNORED_DIRS = new Set(['.krate', '.git', 'node_modules', '__pycache__', '.gradle', '.idea', '.vs']);
const MAX_DEPTH = 10;
const MAX_ENTRIES = 6000;

let userData = null;
let config = null;
let version = 0; // bumped on any mutation, used by the search indexer cache

const DEFAULT_TAGS = [
  { name: 'Edit', color: '#a855f7' },
  { name: 'Video', color: '#ef4444' },
  { name: 'App', color: '#22c55e' },
  { name: 'Web', color: '#38bdf8' },
  { name: 'Design', color: '#f472b6' },
  { name: 'Game', color: '#10b981' },
  { name: 'Music', color: '#8b5cf6' },
  { name: 'School', color: '#f59e0b' },
  { name: 'Idea', color: '#eab308' },
  { name: 'Client', color: '#14b8a6' },
  { name: 'Archive', color: '#64748b' },
];

const DEFAULT_TEMPLATES = [
  {
    name: 'Video Edit',
    dirs: ['Footage/Raw', 'Footage/Selected', 'Audio/Music', 'Audio/SFX',
      'Assets/Overlays', 'Assets/Fonts', 'Project Files', 'Exports', 'References'],
  },
  { name: 'App / Code', dirs: ['src', 'assets', 'docs', 'builds', 'notes'] },
  { name: 'Design', dirs: ['Sources', 'Exports', 'Inspiration', 'Fonts'] },
  { name: 'Empty', dirs: [] },
];

const DEFAULT_CONFIG = {
  projectsRoot: null,     // first entry of projectsRoots, kept for compatibility
  projectsRoots: [],      // every folder whose subfolders are treated as projects
  lastRunVersion: null,
  externalProjects: [],
  hotkey: 'Control+Alt+K',
  tags: DEFAULT_TAGS,
  templates: DEFAULT_TEMPLATES,
  animations: true,
  autostart: true,
  onboarded: false,
  // look & feel: 'light' (white, black accents), 'dark' (black, white accents),
  // 'purple' (the original Krate look). accentColor overrides the theme accent.
  theme: 'light',
  accentColor: null,
  lang: 'en',
  thumbnails: false,
  watchEnabled: false,
  watchPath: null,
  dupFinder: false,
  // AI: 'web' embeds the provider's site (account login), 'api' runs the
  // built-in agent with an API key.
  aiMode: 'api',
  aiProvider: 'claude',
  aiApi: { provider: 'anthropic', apiKey: '', model: '', baseUrl: '' },
};

// ---------------------------------------------------------------- config --
function init(userDataPath) {
  userData = userDataPath;
  const file = path.join(userData, 'config.json');
  try {
    config = { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
  // migrate templates: stable ids + attached-files support
  for (const t of config.templates) {
    if (!t.id) t.id = crypto.randomUUID();
    if (!t.files) t.files = [];
  }
  if (!config.aiApi) config.aiApi = { ...DEFAULT_CONFIG.aiApi };
  normalizeRoots();
}

function getConfig() {
  return config;
}

// keeps the single projectsRoot (used all over as "the default spot") and the
// projectsRoots list (every folder whose subfolders count as projects) in sync
function normalizeRoots() {
  if (!Array.isArray(config.projectsRoots)) config.projectsRoots = [];
  config.projectsRoots = [...new Set(config.projectsRoots.filter(Boolean))];
  if (config.projectsRoot && !config.projectsRoots.some(
    (r) => path.resolve(r).toLowerCase() === path.resolve(config.projectsRoot).toLowerCase())) {
    config.projectsRoots.unshift(config.projectsRoot);
  }
  config.projectsRoot = config.projectsRoots[0] || null;
}

function saveConfig(partial) {
  config = { ...config, ...partial };
  normalizeRoots();
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify(config, null, 2));
  version++;
  return config;
}

function bump() { version++; }
function getVersion() { return version; }

// --------------------------------------------------------------- helpers --
function sanitizeName(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim().slice(0, 120) || 'Untitled';
}

function toRel(p) { return p.split(path.sep).join('/'); }

function metaPath(projectPath) { return path.join(projectPath, 'krate.json'); }

async function readMeta(projectPath) {
  const raw = await fsp.readFile(metaPath(projectPath), 'utf8');
  const meta = JSON.parse(raw);
  meta.notes = meta.notes || [];
  meta.nicknames = meta.nicknames || {};
  meta.tags = meta.tags || [];
  meta.links = meta.links || [];
  meta.related = meta.related || [];
  meta.favorite = !!meta.favorite;
  return meta;
}

async function writeMeta(projectPath, meta) {
  meta.modified = new Date().toISOString();
  await fsp.writeFile(metaPath(projectPath), JSON.stringify(meta, null, 2));
  version++;
  return meta;
}

// -------------------------------------------------------------- projects --
async function listProjects() {
  const seen = new Set();
  const projects = [];

  async function tryAdd(dir) {
    const key = path.resolve(dir).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    try {
      const meta = await readMeta(dir);
      projects.push({ path: dir, meta });
    } catch { /* not a krate project (or unreadable) — skip */ }
  }

  for (const root of config.projectsRoots || []) {
    try {
      const entries = await fsp.readdir(root, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) await tryAdd(path.join(root, e.name));
      }
    } catch { /* root missing */ }
  }
  for (const p of config.externalProjects) await tryAdd(p);
  return projects;
}

async function createProject({ name, location, tags = [], template = null, description = '' }) {
  const base = location || config.projectsRoot;
  if (!base) throw new Error('No projects folder set. Pick one in Settings first.');
  const dir = path.join(base, sanitizeName(name));
  if (fs.existsSync(metaPath(dir))) throw new Error('A Krate project already exists in that folder.');
  await fsp.mkdir(dir, { recursive: true });

  const tpl = template ? (config.templates.find(t => t.name === template) || null) : null;
  if (tpl) {
    for (const d of tpl.dirs) {
      await fsp.mkdir(path.join(dir, ...d.split('/')), { recursive: true });
    }
    // copy the template's attached starter files into the new project
    for (const f of tpl.files || []) {
      try {
        const dest = path.join(dir, ...f.rel.split('/'));
        await fsp.mkdir(path.dirname(dest), { recursive: true });
        await fsp.copyFile(f.src, dest);
      } catch { /* source file gone — skip */ }
    }
  }

  const now = new Date().toISOString();
  const meta = {
    id: crypto.randomUUID(),
    title: name.trim() || 'Untitled',
    description,
    tags,
    status: 'active',
    cover: null,
    color: '#a855f7',
    favorite: false,
    notes: [],
    links: [],
    related: [],
    nicknames: {},
    created: now,
    modified: now,
  };
  await writeMeta(dir, meta);

  // register projects living outside the default root
  const root = config.projectsRoot ? path.resolve(config.projectsRoot).toLowerCase() : null;
  const parent = path.resolve(path.dirname(dir)).toLowerCase();
  if (root !== parent && !config.externalProjects.some(p => path.resolve(p).toLowerCase() === path.resolve(dir).toLowerCase())) {
    saveConfig({ externalProjects: [...config.externalProjects, dir] });
  }
  return { path: dir, meta };
}

function unregisterProject(projectPath) {
  const key = path.resolve(projectPath).toLowerCase();
  saveConfig({
    externalProjects: config.externalProjects.filter(p => path.resolve(p).toLowerCase() !== key),
  });
}

// ------------------------------------------------------------- file tree --
async function readTree(projectPath) {
  let count = 0;
  async function walk(dir, rel, depth) {
    if (depth > MAX_DEPTH || count > MAX_ENTRIES) return [];
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch { return []; }
    const out = [];
    for (const e of entries) {
      if (e.name === 'krate.json' && depth === 0) continue;
      if (e.isDirectory() && IGNORED_DIRS.has(e.name)) continue;
      count++;
      if (count > MAX_ENTRIES) break;
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) {
        out.push({ name: e.name, rel: r, dir: true, children: await walk(path.join(dir, e.name), r, depth + 1) });
      } else {
        let size = 0;
        try { size = (await fsp.stat(path.join(dir, e.name))).size; } catch { }
        out.push({ name: e.name, rel: r, dir: false, size });
      }
    }
    out.sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name));
    return out;
  }
  return walk(projectPath, '', 0);
}

// flat listing of one directory level, nicknames resolved (overlay browse mode)
async function listDir(projectPath, rel) {
  const meta = await readMeta(projectPath).catch(() => null);
  const abs = rel ? path.join(projectPath, ...rel.split('/')) : projectPath;
  let entries;
  try {
    entries = await fsp.readdir(abs, { withFileTypes: true });
  } catch { return []; }
  const out = [];
  for (const e of entries) {
    if (e.name === 'krate.json' && !rel) continue;
    if (e.isDirectory() && IGNORED_DIRS.has(e.name)) continue;
    const r = rel ? rel + '/' + e.name : e.name;
    out.push({
      name: e.name,
      rel: r,
      abs: path.join(abs, e.name),
      dir: e.isDirectory(),
      nickname: meta ? meta.nicknames[r] || null : null,
    });
  }
  out.sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name));
  return out;
}

// ------------------------------------------------------------ mutations ---
async function importPaths(projectPath, targetRel, absPaths) {
  const targetDir = targetRel ? path.join(projectPath, ...targetRel.split('/')) : projectPath;
  await fsp.mkdir(targetDir, { recursive: true });
  let copied = 0;
  for (const src of absPaths) {
    try {
      const st = await fsp.stat(src);
      const dest = path.join(targetDir, path.basename(src));
      if (path.resolve(src) === path.resolve(dest)) continue;
      if (st.isDirectory()) {
        await fsp.cp(src, dest, { recursive: true, errorOnExist: false, force: false });
      } else {
        await fsp.copyFile(src, dest, fs.constants.COPYFILE_EXCL).catch(async (err) => {
          if (err.code !== 'EEXIST') throw err;
          // append " (2)" style suffix instead of overwriting
          const ext = path.extname(dest); const base = dest.slice(0, -ext.length || undefined);
          let i = 2;
          while (fs.existsSync(`${base} (${i})${ext}`)) i++;
          await fsp.copyFile(src, `${base} (${i})${ext}`);
        });
      }
      copied++;
    } catch { /* skip unreadable entries */ }
  }
  version++;
  return copied;
}

async function newFolder(projectPath, rel) {
  await fsp.mkdir(path.join(projectPath, ...rel.split('/')), { recursive: true });
  version++;
}

async function setCoverFromFile(projectPath, srcPath) {
  const meta = await readMeta(projectPath);
  const ext = (path.extname(srcPath) || '.png').toLowerCase();
  const assetDir = path.join(projectPath, '.krate');
  await fsp.mkdir(assetDir, { recursive: true });
  const rel = '.krate/cover' + ext;
  // clear old covers with other extensions
  for (const f of await fsp.readdir(assetDir).catch(() => [])) {
    if (f.startsWith('cover') && f !== 'cover' + ext) await fsp.rm(path.join(assetDir, f)).catch(() => { });
  }
  await fsp.copyFile(srcPath, path.join(projectPath, ...rel.split('/')));
  meta.cover = rel;
  await writeMeta(projectPath, meta);
  return meta;
}

// collect the directory structure of a project as template lines
async function structureOf(projectPath) {
  const dirs = [];
  async function walk(dir, rel, depth) {
    if (depth > 6) return;
    let entries;
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (!e.isDirectory() || IGNORED_DIRS.has(e.name)) continue;
      const r = rel ? rel + '/' + e.name : e.name;
      dirs.push(r);
      await walk(path.join(dir, e.name), r, depth + 1);
    }
  }
  await walk(projectPath, '', 0);
  return dirs;
}

// -------------------------------------------------------- adopt existing ---
// Turns every subfolder of projectsRoot that has no krate.json yet into a
// project (title = folder name). Used by the first-run wizard.
async function adoptExisting() {
  let adopted = 0;
  const dirs = [];
  for (const root of config.projectsRoots || []) {
    const entries = await fsp.readdir(root, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (!e.isDirectory() || IGNORED_DIRS.has(e.name) || e.name.startsWith('.')) continue;
      dirs.push(path.join(root, e.name));
    }
  }
  for (const dir of dirs) {
    if (fs.existsSync(path.join(dir, 'krate.json'))) continue;
    const now = new Date().toISOString();
    try {
      await writeMeta(dir, {
        id: crypto.randomUUID(), title: e.name, description: '',
        tags: [], status: 'active', cover: null, color: '#a855f7',
        favorite: false, notes: [], links: [], related: [], nicknames: {},
        created: now, modified: now,
      });
      adopted++;
    } catch { /* unwritable — skip */ }
  }
  version++;
  return adopted;
}

// ---------------------------------------------------------------- trash ---
// Krate-level trash: deleted projects are moved to userData/trash/ and can be
// restored from the Trash view. "Delete forever" sends them to the OS bin.
function trashRoot() { return path.join(userData, 'trash'); }
function trashIndexPath() { return path.join(trashRoot(), 'trash.json'); }

async function readTrashIndex() {
  try { return JSON.parse(await fsp.readFile(trashIndexPath(), 'utf8')); } catch { return []; }
}
async function writeTrashIndex(list) {
  await fsp.mkdir(trashRoot(), { recursive: true });
  await fsp.writeFile(trashIndexPath(), JSON.stringify(list, null, 2));
}

async function trashProject(projectPath) {
  const meta = await readMeta(projectPath).catch(() => null);
  await fsp.mkdir(trashRoot(), { recursive: true });
  const id = crypto.randomUUID().slice(0, 8);
  const dest = path.join(trashRoot(), `${id}_${path.basename(projectPath)}`);
  try {
    await fsp.rename(projectPath, dest); // fast same-drive move
  } catch {
    await fsp.cp(projectPath, dest, { recursive: true });
    await fsp.rm(projectPath, { recursive: true, force: true });
  }
  const list = await readTrashIndex();
  list.unshift({
    id,
    title: meta ? meta.title : path.basename(projectPath),
    origin: projectPath,
    stored: dest,
    deletedAt: new Date().toISOString(),
  });
  await writeTrashIndex(list);
  unregisterProject(projectPath);
  version++;
  return true;
}

async function listTrash() {
  const list = await readTrashIndex();
  const alive = [];
  for (const e of list) {
    if (fs.existsSync(e.stored)) alive.push(e);
  }
  if (alive.length !== list.length) await writeTrashIndex(alive);
  return alive;
}

async function restoreProject(id) {
  const list = await readTrashIndex();
  const e = list.find((x) => x.id === id);
  if (!e) throw new Error('Not found in trash.');
  let dest = e.origin;
  if (fs.existsSync(dest)) dest = `${dest} (restored)`;
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  try {
    await fsp.rename(e.stored, dest);
  } catch {
    await fsp.cp(e.stored, dest, { recursive: true });
    await fsp.rm(e.stored, { recursive: true, force: true });
  }
  await writeTrashIndex(list.filter((x) => x.id !== id));
  // re-register if it lives outside the projects root
  const root = config.projectsRoot ? path.resolve(config.projectsRoot).toLowerCase() : null;
  if (path.resolve(path.dirname(dest)).toLowerCase() !== root) {
    saveConfig({ externalProjects: [...config.externalProjects, dest] });
  }
  version++;
  return dest;
}

async function purgeTrashEntry(id, shell) {
  const list = await readTrashIndex();
  const e = list.find((x) => x.id === id);
  if (!e) return false;
  await shell.trashItem(e.stored).catch(() => fsp.rm(e.stored, { recursive: true, force: true }));
  await writeTrashIndex(list.filter((x) => x.id !== id));
  return true;
}

// ----------------------------------------------------- duplicate finder ---
// Groups identical files across all projects (same size + sha1 of first 256KB).
async function findDuplicates() {
  const cryptoMod = require('crypto');
  const projects = await listProjects();
  const bySize = new Map();
  let scanned = 0;

  for (const p of projects) {
    const tree = await readTree(p.path);
    const walk = (nodes) => {
      for (const n of nodes) {
        if (n.dir) { if (n.children) walk(n.children); continue; }
        if (n.size < 64 * 1024 || scanned > 20000) continue; // skip tiny files
        scanned++;
        const key = n.size;
        if (!bySize.has(key)) bySize.set(key, []);
        bySize.get(key).push({ project: p.meta.title, rel: n.rel, abs: path.join(p.path, ...n.rel.split('/')), size: n.size });
      }
    };
    walk(tree);
  }

  const groups = [];
  for (const files of bySize.values()) {
    if (files.length < 2) continue;
    const byHash = new Map();
    for (const f of files) {
      try {
        const fh = await fsp.open(f.abs, 'r');
        const buf = Buffer.alloc(Math.min(f.size, 256 * 1024));
        await fh.read(buf, 0, buf.length, 0);
        await fh.close();
        const h = cryptoMod.createHash('sha1').update(buf).digest('hex');
        if (!byHash.has(h)) byHash.set(h, []);
        byHash.get(h).push(f);
      } catch { }
    }
    for (const g of byHash.values()) {
      if (g.length > 1) groups.push({ size: g[0].size, files: g });
    }
  }
  groups.sort((a, b) => (b.size * b.files.length) - (a.size * a.files.length));
  return groups.slice(0, 60);
}

// ----------------------------------------------------------------- stats ---
async function libraryStats() {
  const projects = await listProjects();
  const byStatus = {};
  const byTag = {};
  const sizes = [];
  for (const p of projects) {
    byStatus[p.meta.status] = (byStatus[p.meta.status] || 0) + 1;
    for (const t of p.meta.tags) byTag[t] = (byTag[t] || 0) + 1;
    let total = 0, files = 0;
    const tree = await readTree(p.path);
    const walk = (nodes) => {
      for (const n of nodes) {
        if (n.dir) { if (n.children) walk(n.children); }
        else { total += n.size || 0; files++; }
      }
    };
    walk(tree);
    sizes.push({ title: p.meta.title, path: p.path, bytes: total, files, modified: p.meta.modified });
  }
  sizes.sort((a, b) => b.bytes - a.bytes);
  return {
    count: projects.length,
    favorites: projects.filter((p) => p.meta.favorite).length,
    totalBytes: sizes.reduce((s, x) => s + x.bytes, 0),
    totalFiles: sizes.reduce((s, x) => s + x.files, 0),
    byStatus, byTag,
    biggest: sizes.slice(0, 8),
  };
}

// ------------------------------------------------------ template files ---
// Files attached to a template are copied into userData/template-files/<tplId>/
// so they keep working even if the original source file is moved or deleted.
function templateFilesRoot() { return path.join(userData, 'template-files'); }

async function importTemplateFiles(tplId, absPaths) {
  const dir = path.join(templateFilesRoot(), String(tplId).replace(/[^a-z0-9-]/gi, ''));
  await fsp.mkdir(dir, { recursive: true });
  const out = [];
  for (const src of absPaths) {
    try {
      const st = await fsp.stat(src);
      if (!st.isFile()) continue;
      const name = path.basename(src);
      const stored = path.join(dir, crypto.randomUUID().slice(0, 8) + '_' + name);
      await fsp.copyFile(src, stored);
      out.push({ src: stored, name, size: st.size });
    } catch { /* unreadable — skip */ }
  }
  version++;
  return out;
}

async function deleteTemplateFiles(srcs) {
  const root = path.resolve(templateFilesRoot()).toLowerCase();
  for (const src of srcs || []) {
    const r = path.resolve(src).toLowerCase();
    if (r.startsWith(root)) await fsp.rm(src, { force: true }).catch(() => { });
  }
  version++;
}

// plain-text summary of a project, made to be pasted into an AI chat
async function buildContext(projectPath) {
  const meta = await readMeta(projectPath);
  const tree = await readTree(projectPath);
  const lines = [];
  lines.push(`# Project: ${meta.title}`);
  lines.push(`Status: ${meta.status} · Tags: ${meta.tags.join(', ') || '—'} · Folder: ${projectPath}`);
  if (meta.description) lines.push(`\n## Description\n${meta.description}`);
  if (meta.notes.length) {
    lines.push('\n## Notes');
    for (const n of meta.notes) lines.push(`- [${n.date.slice(0, 10)}] ${n.text}`);
  }
  if (meta.links.length) {
    lines.push('\n## Links');
    for (const l of meta.links) lines.push(`- ${l.title}: ${l.url}`);
  }
  lines.push('\n## File tree' + (Object.keys(meta.nicknames).length ? ' (nickname in [brackets])' : ''));
  const walk = (nodes, ind) => {
    for (const n of nodes) {
      const nick = meta.nicknames[n.rel];
      lines.push(`${'  '.repeat(ind)}${n.dir ? '📁' : '-'} ${n.name}${nick ? ` [${nick}]` : ''}`);
      if (n.children) walk(n.children, ind + 1);
    }
  };
  walk(tree, 0);
  lines.push('\nYou are helping me with this project. Answer questions about it, help me find files, and suggest how to organize it.');
  return lines.join('\n');
}

module.exports = {
  init, getConfig, saveConfig, getVersion, bump, buildContext,
  listProjects, createProject, unregisterProject,
  readMeta, writeMeta, readTree, listDir,
  importPaths, newFolder, setCoverFromFile, structureOf,
  importTemplateFiles, deleteTemplateFiles,
  adoptExisting,
  trashProject, listTrash, restoreProject, purgeTrashEntry,
  findDuplicates, libraryStats,
  toRel, sanitizeName,
};
