/* Krate — quick-search overlay renderer */
'use strict';

if (!window.krate) throw new Error('no preload');

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

let mode = 'search';        // 'search' | 'browse'
let results = [];           // rows currently shown
let sel = 0;
let dragging = false;

// browse state: null = project list, else { projectPath, projectTitle, rel }
let browseLoc = null;
let browseCache = [];       // unfiltered entries of current browse level

/* ------------------------------------------------------------- render --- */
function iconFor(r) {
  if (r.type === 'project') return window.KI.get('box', 'ri-proj');
  if (r.type === 'link') return window.KI.forUrl(r.url);
  if (r.dir) return window.KI.get('folder', 'fold-ico');
  return window.KI.forFile(r.name);
}

function render() {
  $('btnMode').classList.toggle('on', mode === 'browse');
  $('crumbs').hidden = mode !== 'browse';
  if (mode === 'browse') {
    $('crumbs').innerHTML = browseLoc
      ? `<b>${esc(browseLoc.projectTitle)}</b>${browseLoc.rel ? ' / ' + esc(browseLoc.rel.split('/').join(' / ')) : ''}`
      : '<b>Projects</b>';
  }

  if (!results.length) {
    $('results').innerHTML = `<div class="rempty">${mode === 'search' ? 'Type to search all your projects and files' : 'Empty folder'}</div>`;
    return;
  }
  $('results').innerHTML = results.map((r, i) => `
    <div class="rrow ${i === sel ? 'sel' : ''}" data-i="${i}" draggable="true" style="--i:${Math.min(i, 12)}">
      <span class="ricon">${iconFor(r)}</span>
      <div class="rmain">
        <div class="rname">${esc(r.nickname || r.name)}</div>
        <div class="rsub">${r.type === 'project' ? esc(r.abs) : r.type === 'link' ? esc(r.url) : esc((r.rel || '').split('/').slice(0, -1).join(' / ') || '/')}</div>
      </div>
      ${r.nickname ? `<span class="rnick">${esc(r.name)}</span>` : ''}
      ${r.type !== 'project' ? `<span class="rchip" style="color:${r.tagColor};background:${r.tagColor}26">${esc(r.projectTitle)}</span>` : ''}
    </div>`).join('');

  $('results').querySelectorAll('.rrow').forEach((row) => {
    const i = +row.dataset.i;
    row.onmousemove = () => { if (sel !== i && !dragging) { sel = i; markSel(); } };
    row.onclick = () => { sel = i; activate({ }); };
    row.addEventListener('dragstart', (e) => {
      e.preventDefault();
      if (results[i].type === 'link') return;
      dragging = true;
      window.krate.startDrag(results[i].abs);
      setTimeout(() => { dragging = false; }, 600);
    });
  });
  markSel();
}

function markSel() {
  $('results').querySelectorAll('.rrow').forEach((row) => {
    row.classList.toggle('sel', +row.dataset.i === sel);
  });
  const el = $('results').querySelector('.rrow.sel');
  if (el) el.scrollIntoView({ block: 'nearest' });
}

/* ------------------------------------------------------------- search --- */
let searchSeq = 0;
async function runSearch() {
  const q = $('q').value.trim();
  const seq = ++searchSeq;
  if (!q) { results = []; sel = 0; render(); return; }
  const r = await window.krate.search(q);
  if (seq !== searchSeq) return; // stale response
  results = r;
  sel = 0;
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
  sel = 0;
  render();
}

function enter(r) {
  if (r.type === 'project') {
    browseLoc = { projectPath: r.projectPath, projectTitle: r.projectTitle, rel: '', tagColor: r.tagColor };
  } else if (r.dir) {
    browseLoc = { ...browseLoc, rel: r.rel };
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
function activate({ ctrl = false, shift = false }) {
  const r = results[sel];
  if (!r) return;
  if (r.type === 'link') {
    window.krate.openExternal(r.url);
    window.krate.hideOverlay();
    return;
  }
  if (shift) {
    window.krate.openInMain({ projectPath: r.projectPath, rel: r.type === 'project' ? '' : r.rel });
    return;
  }
  if (ctrl) {
    window.krate.reveal(r.abs);
    window.krate.hideOverlay();
    return;
  }
  if (mode === 'browse' && r.dir) { enter(r); return; }
  if (r.type === 'project') {
    window.krate.openInMain({ projectPath: r.projectPath, rel: '' });
    return;
  }
  if (r.dir) { window.krate.reveal(r.abs); window.krate.hideOverlay(); return; }
  window.krate.open(r.abs);
  window.krate.hideOverlay();
}

function setMode(m) {
  mode = m;
  if (mode === 'browse') { browseLoc = null; $('q').value = ''; loadBrowse(); }
  else { $('q').value = ''; results = []; sel = 0; render(); }
  $('q').focus();
}

/* -------------------------------------------------------------- input --- */
$('q').addEventListener('input', () => {
  if (mode === 'search') debouncedSearch();
  else filterBrowse();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { window.krate.hideOverlay(); return; }
  if (e.key === 'Tab') { e.preventDefault(); setMode(mode === 'search' ? 'browse' : 'search'); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, results.length - 1); markSel(); return; }
  if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); markSel(); return; }
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

/* ------------------------------------------------------------- events --- */
window.krate.on('overlay-shown', () => {
  mode = 'search';
  browseLoc = null;
  $('q').value = '';
  results = [];
  sel = 0;
  render();
  $('q').focus();
  // re-trigger the entrance animation (only when animations are enabled)
  window.krate.getState().then((s) => {
    document.body.classList.toggle('anim', s.config.animations !== false);
    const p = $('panel');
    p.classList.remove('pop');
    void p.offsetWidth;
    p.classList.add('pop');
  });
});

$('qIco').innerHTML = window.KI.get('search');
$('btnMode').innerHTML = window.KI.get('layout');

window.krate.on('overlay-blur', () => {
  if (!dragging) window.krate.hideOverlay();
});

render();
