/* Krate — quick-search overlay renderer */
'use strict';

if (!window.krate) throw new Error('no preload');

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

let mode = 'search';        // 'search' | 'browse' | 'ai'
let results = [];           // rows currently shown
let sel = 0;                // keyboard cursor
let selected = new Set();   // multi-selection (indices)
let anchor = 0;             // shift-range anchor
let dragging = false;
let keepOpen = false;       // once a drag happened, only Escape closes the bar
let aiConvo = [];
let aiBusy = false;
let aiFiles = [];           // files the agent surfaced this session (draggable)

let browseLoc = null;
let browseCache = [];

const IMG = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif'];
const VID = ['mp4', 'webm', 'mov', 'mkv', 'm4v', 'ogv'];
const CODE = ['txt', 'md', 'js', 'ts', 'jsx', 'tsx', 'json', 'html', 'htm', 'css', 'xml', 'yml', 'yaml',
  'py', 'java', 'c', 'cpp', 'cs', 'sh', 'bat', 'glsl', 'ini', 'cfg', 'toml', 'csv', 'log', 'srt'];
const extOf = (n) => (n.split('.').pop() || '').toLowerCase();
const previewable = (r) => r && !r.dir && r.type !== 'project' && r.type !== 'link'
  && [...IMG, ...VID, ...CODE].includes(extOf(r.name));

/* ------------------------------------------------------------- render --- */
function iconFor(r) {
  if (r.type === 'project') return window.KI.get('box', 'ri-proj');
  if (r.type === 'link') return window.KI.forUrl(r.url);
  if (r.dir) return window.KI.get('folder', 'fold-ico');
  return window.KI.forFile(r.name);
}

function rowHtml(r, i, extra = '') {
  return `
    <div class="rrow${i === sel ? ' sel' : ''}${selected.has(i) ? ' picked' : ''}" data-i="${i}" draggable="true" style="--i:${Math.min(i, 12)}">
      <span class="ricon">${iconFor(r)}</span>
      <div class="rmain">
        <div class="rname">${esc(r.nickname || r.name)}</div>
        <div class="rsub">${r.type === 'project' ? esc(r.abs) : r.type === 'link' ? esc(r.url) : esc((r.rel || '').split('/').slice(0, -1).join(' / ') || '/')}</div>
      </div>
      ${previewable(r) ? `<button class="rplay" data-play="${i}" title="Quick look">${window.KI.get(VID.includes(extOf(r.name)) || IMG.includes(extOf(r.name)) ? 'play' : 'eye')}</button>` : ''}
      ${r.nickname ? `<span class="rnick">${esc(r.name)}</span>` : ''}
      ${r.type !== 'project' && extra !== 'ai' ? `<span class="rchip" style="color:${r.tagColor};background:${r.tagColor}26">${esc(r.projectTitle)}</span>` : ''}
    </div>`;
}

function render() {
  $('btnMode').classList.toggle('on', mode === 'browse');
  $('btnAiMode').classList.toggle('on', mode === 'ai');
  $('crumbs').hidden = mode !== 'browse';
  $('q').placeholder = mode === 'ai' ? 'Ask the AI about your projects…' : 'Search projects, files, nicknames…';
  document.body.classList.toggle('compact',
    mode === 'search' && !results.length && !$('q').value.trim());
  if (mode === 'browse') {
    $('crumbs').innerHTML = browseLoc
      ? `<b>${esc(browseLoc.projectTitle)}</b>${browseLoc.rel ? ' / ' + esc(browseLoc.rel.split('/').join(' / ')) : ''}`
      : '<b>Projects</b>';
  }

  if (mode === 'ai') {
    const convo = aiConvo.length ? aiConvo.map((m) => {
      if (m.role === 'activity') return `<div class="ai-act">→ ${esc(m.content)}</div>`;
      if (m.role === 'error') return `<div class="ai-block ai-err">${esc(m.content)}</div>`;
      if (m.role === 'user') return `<div class="ai-block ai-q">${esc(m.content)}</div>`;
      return `<div class="ai-block ai-a">${esc(m.content)}</div>`;
    }).join('') : '<div class="rempty">Ask anything. The agent can list, search and read your projects.</div>';
    // files the agent found, shown as draggable rows
    results = aiFiles;
    const files = aiFiles.length
      ? `<div class="ai-files-h">Found files (drag them out):</div>${aiFiles.map((r, i) => rowHtml(r, i, 'ai')).join('')}`
      : '';
    $('results').innerHTML = convo + files;
    wireRows();
    $('results').scrollTop = $('results').scrollHeight;
    return;
  }

  if (!results.length) {
    $('results').innerHTML = `<div class="rempty">${mode === 'search' ? 'Type to search all your projects and files' : 'Empty folder'}</div>`;
    return;
  }
  $('results').innerHTML = results.map((r, i) => rowHtml(r, i)).join('');
  wireRows();
  markSel();
}

function wireRows() {
  $('results').querySelectorAll('.rrow').forEach((row) => {
    const i = +row.dataset.i;
    row.onmousemove = () => { if (sel !== i && !dragging) { sel = i; markSel(); } };
    row.onclick = (e) => {
      if (e.target.closest('.rplay')) return;
      clickSelect(i, e);
    };
    row.ondblclick = (e) => {
      if (e.target.closest('.rplay')) return;
      sel = i; activate({});
    };
    row.addEventListener('dragstart', (e) => {
      e.preventDefault();
      const r = results[i];
      if (!r || r.type === 'link') return;
      // drag the whole selection if this row is part of it, else just this row
      let paths;
      if (selected.has(i) && selected.size > 1) {
        paths = [...selected].map((k) => results[k]).filter((x) => x && x.type !== 'link').map((x) => x.abs);
      } else {
        selected = new Set([i]); markSel();
        paths = [r.abs];
      }
      dragging = true;
      keepOpen = true; // dragging out no longer closes the bar
      window.krate.startDrag(paths.length > 1 ? paths : paths[0]);
      setTimeout(() => { dragging = false; }, 600);
    });
  });
  $('results').querySelectorAll('.rplay').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const r = results[+btn.dataset.play];
      if (r) window.krate.openViewer(r.abs);
    };
  });
}

function clickSelect(i, e) {
  sel = i;
  if (e.ctrlKey || e.metaKey) {
    if (selected.has(i)) selected.delete(i); else selected.add(i);
  } else if (e.shiftKey) {
    selected = new Set();
    const [a, b] = anchor <= i ? [anchor, i] : [i, anchor];
    for (let k = a; k <= b; k++) selected.add(k);
  } else {
    selected = new Set([i]);
    anchor = i;
  }
  markSel();
}

function markSel() {
  $('results').querySelectorAll('.rrow').forEach((row) => {
    const i = +row.dataset.i;
    row.classList.toggle('sel', i === sel);
    row.classList.toggle('picked', selected.has(i));
  });
  const el = $('results').querySelector('.rrow.sel');
  if (el) el.scrollIntoView({ block: 'nearest' });
}

function resetSel() { selected = new Set(); sel = 0; anchor = 0; }

/* ------------------------------------------------------------- search --- */
let searchSeq = 0;
async function runSearch() {
  const q = $('q').value.trim();
  const seq = ++searchSeq;
  if (!q) { results = []; resetSel(); render(); return; }
  const r = await window.krate.search(q);
  if (seq !== searchSeq) return;
  results = r;
  resetSel();
  render();
}
const debouncedSearch = (() => {
  let t;
  return () => { clearTimeout(t); t = setTimeout(runSearch, 90); };
})();

/* ------------------------------------------------------------- browse --- */
async function loadBrowse() {
  if (!browseLoc) {
    const s = await window.krate.getState();
    const colorOf = (tags) => {
      const t = s.config.tags.find((t) => tags.includes(t.name));
      return t ? t.color : '#a855f7';
    };
    browseCache = s.projects.map((p) => ({
      type: 'project', dir: true,
      name: p.meta.title, nickname: null,
      abs: p.path, rel: '',
      projectPath: p.path, projectTitle: p.meta.title,
      tagColor: colorOf(p.meta.tags),
    }));
  } else {
    const entries = await window.krate.browse({ projectPath: browseLoc.projectPath, rel: browseLoc.rel });
    browseCache = entries.map((e) => ({
      type: e.dir ? 'folder' : 'file', dir: e.dir,
      name: e.name, nickname: e.nickname,
      abs: e.abs, rel: e.rel,
      projectPath: browseLoc.projectPath, projectTitle: browseLoc.projectTitle,
      tagColor: browseLoc.tagColor,
    }));
  }
  filterBrowse();
}

function filterBrowse() {
  const q = $('q').value.trim().toLowerCase();
  results = q
    ? browseCache.filter((e) => (e.nickname || '').toLowerCase().includes(q) || e.name.toLowerCase().includes(q))
    : [...browseCache];
  resetSel();
  render();
}

function enter(r) {
  if (r.type === 'project') {
    // clicking a project in search jumps into browse mode inside it
    if (mode !== 'browse') mode = 'browse';
    browseLoc = { projectPath: r.projectPath, projectTitle: r.projectTitle, rel: '', tagColor: r.tagColor };
  } else if (r.dir) {
    if (mode !== 'browse') mode = 'browse';
    browseLoc = r.type === 'folder' && r.projectPath
      ? { projectPath: r.projectPath, projectTitle: r.projectTitle, rel: r.rel, tagColor: r.tagColor }
      : { ...browseLoc, rel: r.rel };
  } else return false;
  $('q').value = '';
  loadBrowse();
  return true;
}

function up() {
  if (!browseLoc) return;
  if (!browseLoc.rel) browseLoc = null;
  else {
    const parts = browseLoc.rel.split('/');
    parts.pop();
    browseLoc = { ...browseLoc, rel: parts.join('/') };
  }
  $('q').value = '';
  loadBrowse();
}

/* ------------------------------------------------------------ actions --- */
// activate = open (double-click or Enter). Folders and projects enter/browse,
// files open in their default app, links open externally.
function activate({ ctrl = false, shift = false }) {
  const r = results[sel];
  if (!r) return;
  if (r.type === 'link') { window.krate.openExternal(r.url); return; }
  if (shift) {
    window.krate.openInMain({ projectPath: r.projectPath, rel: r.type === 'project' ? '' : r.rel });
    return;
  }
  if (ctrl) { window.krate.reveal(r.abs); return; }
  if (r.type === 'project' || r.dir) { enter(r); return; } // show content, never OS Explorer
  window.krate.open(r.abs);
  // opening a file keeps the bar open; Escape closes it
}

function setMode(m) {
  mode = m;
  keepOpen = false;
  if (mode === 'browse') { browseLoc = null; $('q').value = ''; loadBrowse(); }
  else { $('q').value = ''; results = []; resetSel(); render(); }
  $('q').focus();
}

/* ------------------------------------------------------------ ai mode --- */
async function sendAiOverlay() {
  if (aiBusy) return;
  const q = $('q').value.trim();
  if (!q) return;
  $('q').value = '';
  aiConvo.push({ role: 'user', content: q });
  aiConvo.push({ role: 'activity', content: 'thinking…' });
  aiBusy = true;
  render();
  const history = aiConvo.filter((m) => m.role === 'user' || m.role === 'assistant');
  const r = await window.krate.aiAsk({ history });
  aiBusy = false;
  for (let i = aiConvo.length - 1; i >= 0 && aiConvo[i].role === 'activity'; i--) aiConvo.splice(i, 1);
  if (r.error) aiConvo.push({ role: 'error', content: r.error });
  else {
    aiConvo.push({ role: 'assistant', content: r.text });
    if (Array.isArray(r.files) && r.files.length) {
      // dedupe against what's already shown, keep newest first
      const have = new Set(aiFiles.map((f) => f.abs));
      const fresh = r.files.filter((f) => !have.has(f.abs)).map((f) => ({
        type: f.dir ? 'folder' : 'file', dir: !!f.dir,
        name: f.name, nickname: f.nickname || null, abs: f.abs, rel: f.rel || '',
        projectPath: f.projectPath || '', projectTitle: f.projectTitle || '', tagColor: f.tagColor || '#8d88a3',
      }));
      aiFiles = [...fresh, ...aiFiles].slice(0, 30);
    }
  }
  resetSel();
  render();
}

window.krate.on('ai-activity', (text) => {
  if (!aiBusy || mode !== 'ai') return;
  aiConvo.push({ role: 'activity', content: text });
  render();
});

/* -------------------------------------------------------------- input --- */
$('q').addEventListener('input', () => {
  if (mode === 'search') debouncedSearch();
  else if (mode === 'browse') filterBrowse();
  else render();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { window.krate.hideOverlay(); return; }
  if (e.key === ' ' && e.ctrlKey) { e.preventDefault(); setMode(mode === 'ai' ? 'search' : 'ai'); return; }
  if (e.key === 'a' && e.ctrlKey && mode !== 'ai') {
    e.preventDefault();
    selected = new Set(results.map((_, i) => i)); markSel(); return;
  }
  if (mode === 'ai') {
    if (e.key === 'Enter') { e.preventDefault(); sendAiOverlay(); }
    if (e.key === 'Tab') { e.preventDefault(); setMode('search'); }
    return;
  }
  if (e.key === 'Tab') { e.preventDefault(); setMode(mode === 'search' ? 'browse' : 'search'); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, results.length - 1); if (!e.shiftKey) { selected = new Set([sel]); anchor = sel; } markSel(); return; }
  if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); if (!e.shiftKey) { selected = new Set([sel]); anchor = sel; } markSel(); return; }
  if (e.key === 'Enter') { e.preventDefault(); activate({ ctrl: e.ctrlKey, shift: e.shiftKey }); return; }
  if (mode === 'browse') {
    if (e.key === 'ArrowRight') {
      const r = results[sel];
      if (r && r.dir) { e.preventDefault(); enter(r); }
      return;
    }
    if (e.key === 'ArrowLeft' || (e.key === 'Backspace' && !$('q').value)) {
      e.preventDefault(); up();
    }
  }
});

$('btnMode').onclick = () => setMode(mode === 'search' ? 'browse' : 'search');

/* ----------------------------------------------------- rubber-band select --- */
// drag a box over empty result space to select rows, like Explorer
(() => {
  const rc = $('results');
  let box = null, startX = 0, startY = 0, active = false;
  rc.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.rrow')) return;
    active = true;
    const r = rc.getBoundingClientRect();
    startX = e.clientX; startY = e.clientY;
    box = document.createElement('div');
    box.className = 'rband';
    rc.appendChild(box);
    if (!(e.ctrlKey || e.metaKey)) { selected = new Set(); markSel(); }
  });
  window.addEventListener('pointermove', (e) => {
    if (!active) return;
    const r = rc.getBoundingClientRect();
    const x1 = Math.min(startX, e.clientX), y1 = Math.min(startY, e.clientY);
    const x2 = Math.max(startX, e.clientX), y2 = Math.max(startY, e.clientY);
    box.style.left = (x1 - r.left) + 'px';
    box.style.top = (y1 - r.top + rc.scrollTop) + 'px';
    box.style.width = (x2 - x1) + 'px';
    box.style.height = (y2 - y1) + 'px';
    rc.querySelectorAll('.rrow').forEach((row) => {
      const rr = row.getBoundingClientRect();
      const hit = rr.bottom > y1 && rr.top < y2;
      const i = +row.dataset.i;
      if (hit) selected.add(i); else if (!(e.ctrlKey || e.metaKey)) selected.delete(i);
    });
    markSel();
  });
  window.addEventListener('pointerup', () => {
    if (!active) return;
    active = false;
    if (box) { box.remove(); box = null; }
  });
})();

/* ------------------------------------------------------------- events --- */
window.krate.on('overlay-shown', () => {
  mode = 'search';
  browseLoc = null;
  aiConvo = [];
  aiFiles = [];
  aiBusy = false;
  keepOpen = false;
  $('q').value = '';
  results = [];
  resetSel();
  render();
  $('q').focus();
  window.krate.getState().then((s) => {
    document.body.dataset.theme = s.config.theme || 'light';
    document.body.classList.toggle('anim', s.config.animations !== false);
    const p = $('panel');
    p.classList.remove('pop');
    void p.offsetWidth;
    p.classList.add('pop');
  });
});

$('qIco').innerHTML = window.KI.get('search');
$('btnMode').innerHTML = window.KI.get('folder');
$('btnAiMode').innerHTML = window.KI.get('sparkle');
$('btnAiMode').onclick = () => setMode(mode === 'ai' ? 'search' : 'ai');
document.body.classList.add('compact');

window.krate.on('overlay-blur', () => {
  // once the user has dragged a file out, only Escape closes the bar
  if (!dragging && !keepOpen) window.krate.hideOverlay();
});

render();
