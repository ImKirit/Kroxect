/* Krate — main window renderer */
'use strict';

if (!window.krate) {
  document.body.innerHTML = '<div style="display:grid;place-items:center;height:100vh;color:#8d88a3;font-family:Segoe UI">Krate must be run inside Electron (npm start).</div>';
  throw new Error('no preload');
}

const $ = (id) => document.getElementById(id);

const state = {
  config: null,
  projects: [],
  // filters
  status: '',
  fav: false,
  tag: null,
  query: '',
  sort: 'modified',
  // detail
  current: null, // { path, meta, tree }
  currentTab: 'overview',
  expanded: new Set(),
  selectedRel: '', // selected folder ('' = project root)
  highlightRel: null,
};

/* ------------------------------------------------------------ helpers --- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

function fileUrl(abs) {
  return encodeURI('file:///' + abs.replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F');
}

// <img> for a project cover with the user's framing (pan via object-position,
// zoom via a focal scale). projPath is the project folder.
function coverStyleVars(meta) {
  const pos = meta.coverPos || { x: 50, y: 50 };
  const z = typeof meta.coverZoom === 'number' ? meta.coverZoom : 1;
  return `--cx:${pos.x}%;--cy:${pos.y}%;--cz:${z}`;
}
function coverImgHtml(meta, projPath) {
  const abs = projPath + '\\' + meta.cover.split('/').join('\\');
  return `<img class="cover-img" src="${fileUrl(abs)}" alt="" style="${coverStyleVars(meta)}">`;
}

function absOf(rel) {
  return state.current.path + (rel ? '\\' + rel.split('/').join('\\') : '');
}

function tagColor(name) {
  const t = state.config.tags.find((t) => t.name === name);
  return t ? t.color : '#a855f7';
}

function chipHtml(name, removable = false) {
  const c = tagColor(name);
  return `<span class="chip" data-tag="${esc(name)}" style="color:${c};border-color:${c}55;background:${c}22">${esc(name)}${removable ? '<span class="x" data-untag="' + esc(name) + '">✕</span>' : ''}</span>`;
}

function timeAgo(iso) {
  if (!iso) return '';
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' h ago';
  const days = Math.floor(h / 24);
  if (days < 30) return days + ' d ago';
  return new Date(iso).toLocaleDateString();
}

function fmtSize(n) {
  if (n == null) return '';
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
  return (n / 1073741824).toFixed(2) + ' GB';
}

const debounce = (fn, ms) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

/* fill every <span class="ico" data-icon="…"> with its SVG */
function injectIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    el.innerHTML = window.KI.get(el.dataset.icon).replace(/^<span[^>]*>|<\/span>$/g, '');
  });
}

let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* clicky ripple on press (only when animations are on) */
document.addEventListener('pointerdown', (e) => {
  if (!document.body.classList.contains('anim')) return;
  const host = e.target.closest('.btn, .card, .frow, .link-row, .rrow');
  if (!host) return;
  const r = host.getBoundingClientRect();
  const ink = document.createElement('span');
  ink.className = 'ripple-ink';
  ink.style.left = (e.clientX - r.left) + 'px';
  ink.style.top = (e.clientY - r.top) + 'px';
  host.appendChild(ink);
  setTimeout(() => ink.remove(), 600);
});

/* theme, accent color, language and animation flags from config */
function hexAlpha(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
function accentFg(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 150 ? '#141414' : '#ffffff';
}

function applyLook(cfg) {
  document.body.dataset.theme = cfg.theme || 'light';
  document.body.classList.toggle('anim', cfg.animations !== false);
  window.I18N.set(cfg.lang || 'en');
  window.I18N.apply();
  const st = document.body.style;
  if (cfg.accentColor) {
    st.setProperty('--accent', cfg.accentColor);
    st.setProperty('--accent-fg', accentFg(cfg.accentColor));
    st.setProperty('--accent-soft', hexAlpha(cfg.accentColor, 0.12));
    st.setProperty('--accent-border', hexAlpha(cfg.accentColor, 0.55));
    st.setProperty('--border-strong', cfg.accentColor);
  } else {
    for (const v of ['--accent', '--accent-fg', '--accent-soft', '--accent-border', '--border-strong']) st.removeProperty(v);
  }
}

async function refresh() {
  const s = await window.krate.getState();
  state.config = s.config;
  state.projects = s.projects;
  applyLook(s.config);
  renderSidebar();
  if (!state.current) renderGrid();
}

/* all main views live in #content; this hides everything except one */
function showView(id) {
  window.KGraph.stop();
  for (const v of ['homeView', 'detailView', 'graphView', 'statsView', 'trashView']) {
    $(v).hidden = v !== id;
  }
}

/* -------------------------------------------------------------- modal --- */
function openModal(html) {
  const box = $('modalBox');
  box.className = ''; // clear any drag state from a previous modal
  box.style.left = box.style.top = '';
  box.innerHTML = html;
  injectIcons(box);
  $('modalBackdrop').hidden = false;
  makeModalDraggable(box);
  const first = box.querySelector('input[type="text"],textarea');
  if (first) setTimeout(() => first.focus(), 30);
  return box;
}
function closeModal() {
  $('modalBackdrop').hidden = true;
  $('modalBox').innerHTML = '';
}

// drag a modal around by its <h2> title bar
function makeModalDraggable(box) {
  const handle = box.querySelector('h2');
  if (!handle) return;
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const rect = box.getBoundingClientRect();
    box.classList.add('dragged', 'dragging');
    box.style.left = rect.left + 'px';
    box.style.top = rect.top + 'px';
    const offX = e.clientX - rect.left;
    const offY = e.clientY - rect.top;
    handle.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const x = Math.max(0, Math.min(window.innerWidth - 60, ev.clientX - offX));
      const y = Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - offY));
      box.style.left = x + 'px';
      box.style.top = y + 'px';
    };
    const up = () => {
      box.classList.remove('dragging');
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  });
}
$('modalBackdrop').addEventListener('mousedown', (e) => {
  if (e.target === $('modalBackdrop')) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('modalBackdrop').hidden) closeModal();
  if (e.key === 'f' && e.ctrlKey && !$('homeView').hidden) { e.preventDefault(); $('searchInput').focus(); }
});

/* ------------------------------------------------------------ sidebar --- */
function renderSidebar() {
  $('countAll').textContent = state.projects.length;
  const favCount = state.projects.filter((p) => p.meta.favorite).length;
  $('countFav').textContent = favCount || '';
  document.querySelectorAll('#statusNav .nav-item').forEach((el) => {
    const isFav = el.dataset.fav === '1';
    el.classList.toggle('active',
      isFav ? (state.fav && !state.tag)
        : (el.dataset.status === state.status && !state.tag && !state.fav));
  });

  const counts = {};
  for (const p of state.projects) for (const t of p.meta.tags) counts[t] = (counts[t] || 0) + 1;

  $('tagList').innerHTML = state.config.tags.map((t) => `
    <div class="tag-item ${state.tag === t.name ? 'active' : ''}" data-tag="${esc(t.name)}">
      <span class="tag-swatch" style="background:${t.color}"></span>
      <span class="tag-name">${esc(t.name)}</span>
      <span class="count">${counts[t.name] || ''}</span>
    </div>`).join('');

  $('tagList').querySelectorAll('.tag-item').forEach((el) => {
    el.onclick = () => {
      state.tag = state.tag === el.dataset.tag ? null : el.dataset.tag;
      goHome();
    };
  });
}

document.querySelectorAll('#statusNav .nav-item').forEach((el) => {
  el.onclick = () => {
    if (el.dataset.fav === '1') { state.fav = true; state.status = ''; }
    else { state.fav = false; state.status = el.dataset.status; }
    state.tag = null;
    goHome();
  };
});

/* --------------------------------------------------------------- grid --- */
function filteredProjects() {
  let list = [...state.projects];
  if (state.fav) list = list.filter((p) => p.meta.favorite);
  if (state.status) list = list.filter((p) => (p.meta.status || 'active') === state.status);
  if (state.tag) list = list.filter((p) => p.meta.tags.includes(state.tag));
  if (state.query) {
    const q = state.query.toLowerCase();
    list = list.filter((p) =>
      p.meta.title.toLowerCase().includes(q) ||
      (p.meta.description || '').toLowerCase().includes(q) ||
      p.meta.tags.some((t) => t.toLowerCase().includes(q)));
  }
  const sorters = {
    modified: (a, b) => new Date(b.meta.modified) - new Date(a.meta.modified),
    created: (a, b) => new Date(b.meta.created) - new Date(a.meta.created),
    name: (a, b) => a.meta.title.localeCompare(b.meta.title),
  };
  // pinned favorites always float to the top
  list.sort((a, b) => (b.meta.favorite - a.meta.favorite) || sorters[state.sort](a, b));
  return list;
}

function renderGrid() {
  const list = filteredProjects();
  if (!list.length) {
    $('projectGrid').innerHTML = `
      <div class="empty-state">
        <div class="big" style="color:#a855f7">${window.KI.get('box', 'big-ico')}</div>
        <div>${state.projects.length ? 'Nothing matches your filter.' : 'No projects yet. Create your first one!'}</div>
      </div>`;
    return;
  }
  $('projectGrid').innerHTML = list.map((p, i) => {
    const cover = p.meta.cover
      ? coverImgHtml(p.meta, p.path)
      : esc((p.meta.title[0] || '?').toUpperCase());
    const coverStyle = p.meta.cover ? `--i:${i}` : `--i:${i};background:${p.meta.color || 'var(--accent)'}`;
    return `
      <div class="card" data-path="${esc(p.path)}" style="--i:${i}">
        <div class="card-star ${p.meta.favorite ? 'on' : ''}" title="Pin to favorites">${window.KI.get(p.meta.favorite ? 'starFill' : 'star')}</div>
        <div class="card-cover" style="${coverStyle}">${cover}</div>
        <div class="card-body">
          <div class="card-title">${esc(p.meta.title)}</div>
          <div class="card-sub"><span class="dot dot-${esc(p.meta.status || 'active')}"></span>${timeAgo(p.meta.modified)}</div>
          <div class="card-chips">${p.meta.tags.map((t) => chipHtml(t)).join('')}</div>
        </div>
      </div>`;
  }).join('');
  $('projectGrid').querySelectorAll('.card').forEach((el) => {
    el.onclick = (e) => {
      if (e.target.closest('.card-star')) return;
      openProject(el.dataset.path);
    };
    el.querySelector('.card-star').onclick = async () => {
      const p = state.projects.find((x) => x.path === el.dataset.path);
      p.meta.favorite = !p.meta.favorite;
      await window.krate.saveMeta({ path: p.path, meta: p.meta });
      renderSidebar();
      renderGrid();
    };
  });
}

$('searchInput').addEventListener('input', debounce((e) => {
  state.query = e.target.value; renderGrid();
}, 120));
$('sortSelect').onchange = (e) => { state.sort = e.target.value; renderGrid(); };

function goHome() {
  state.current = null;
  showView('homeView');
  renderSidebar();
  renderGrid();
}

/* collapsible TAGS section (closed by default, remembered locally) */
{
  const open = localStorage.getItem('krate-tags-open') === '1';
  $('tagHead').classList.toggle('collapsed', !open);
  $('tagList').classList.toggle('collapsed', !open);
  $('tagHead').onclick = () => {
    const nowOpen = $('tagList').classList.contains('collapsed');
    $('tagHead').classList.toggle('collapsed', !nowOpen);
    $('tagList').classList.toggle('collapsed', !nowOpen);
    localStorage.setItem('krate-tags-open', nowOpen ? '1' : '0');
  };
}

/* ------------------------------------------------------------- detail --- */
async function openProject(path, opts = {}) {
  const { meta, tree } = await window.krate.loadProject(path);
  state.current = { path, meta, tree };
  state.expanded = new Set(tree.filter((n) => n.dir).map((n) => n.rel)); // root level open
  state.selectedRel = '';
  state.highlightRel = opts.highlightRel || null;
  state.currentTab = opts.tab || 'overview';
  showView('detailView');
  renderDetail();
}

function renderDetail() {
  const { meta, path } = state.current;
  $('detTitle').value = meta.title;
  $('detStatus').value = meta.status || 'active';
  $('detPath').textContent = path;
  $('detDesc').value = meta.description || '';

  const cover = $('detCover');
  if (meta.cover) {
    cover.style.background = '';
    cover.innerHTML = coverImgHtml(meta, path);
  } else {
    cover.style.background = meta.color || 'var(--accent)';
    cover.textContent = (meta.title[0] || '?').toUpperCase();
  }

  const favBtn = $('btnFav');
  favBtn.className = 'star-btn' + (meta.favorite ? ' on' : '');
  favBtn.innerHTML = window.KI.get(meta.favorite ? 'starFill' : 'star');
  favBtn.onclick = () => {
    meta.favorite = !meta.favorite;
    saveMetaNow().then(() => { renderSidebar(); renderDetail(); });
  };

  $('detTags').innerHTML = meta.tags.map((t) => chipHtml(t, true)).join('') +
    '<span class="chip chip-add" id="chipAdd">＋ tag</span>';
  $('detTags').querySelectorAll('.x').forEach((x) => {
    x.onclick = (e) => {
      e.stopPropagation();
      meta.tags = meta.tags.filter((t) => t !== x.dataset.untag);
      saveMetaNow();
      renderDetail();
    };
  });
  $('chipAdd').onclick = openTagPicker;

  document.querySelectorAll('#detTabs .tab').forEach((el) => {
    el.classList.toggle('active', el.dataset.tab === state.currentTab);
  });
  $('tabOverview').hidden = state.currentTab !== 'overview';
  $('tabFiles').hidden = state.currentTab !== 'files';
  $('tabPsettings').hidden = state.currentTab !== 'psettings';

  if (state.currentTab === 'overview') { renderNotes(); renderLinks(); renderRelated(); }
  if (state.currentTab === 'files') renderTree();
  if (state.currentTab === 'psettings') renderPSettings();
}

document.querySelectorAll('#detTabs .tab').forEach((el) => {
  el.onclick = () => { state.currentTab = el.dataset.tab; renderDetail(); };
});

$('btnBack').onclick = () => { goHome(); refresh(); };
$('btnRevealProject').onclick = () => window.krate.reveal(state.current.path);
$('btnAiProject').onclick = async () => {
  const title = state.current.meta.title;
  if ((state.config.aiMode || 'api') === 'api') {
    openAiPanel();
    $('aiInput').value = `Give me a quick overview of the project "${title}" and what's inside it.`;
    sendAi();
  } else {
    const r = await window.krate.aiOpen({ provider: state.config.aiProvider, projectPath: state.current.path });
    if (r.copied) toast(window.T('Project context copied. Paste it into the chat (Ctrl+V)'));
  }
};
$('detCover').onclick = async () => {
  if (state.current.meta.cover) openCoverEditor();
  else {
    const meta = await window.krate.setCover(state.current.path);
    if (meta) { state.current.meta = meta; renderDetail(); openCoverEditor(); }
  }
};

// Frame a cover after upload: drag to move, wheel or slider to zoom. The
// framing (object-position + focal zoom) is saved into krate.json.
function openCoverEditor() {
  const meta = state.current.meta;
  if (!meta.cover) return;
  const pos = { x: (meta.coverPos || {}).x ?? 50, y: (meta.coverPos || {}).y ?? 50 };
  let zoom = typeof meta.coverZoom === 'number' ? meta.coverZoom : 1;
  const src = fileUrl(absOf(meta.cover));

  const box = openModal(`
    <h2>Cover image</h2>
    <div class="hint" style="margin-bottom:10px">Drag the image to move it, scroll or use the slider to zoom.</div>
    <div class="cover-edit" id="covEdit">
      <img class="cover-img" id="covImg" src="${src}" alt="">
    </div>
    <div class="modal-row" style="margin-top:12px;align-items:center;gap:10px">
      <span class="muted small">Zoom</span>
      <input type="range" id="covZoom" min="1" max="3" step="0.01" value="${zoom}" style="flex:1">
      <button class="btn" id="covReset">Reset</button>
    </div>
    <div class="modal-actions">
      <button class="btn" id="covChange">Change image</button>
      <button class="btn btn-primary" id="covSave">Save</button>
    </div>`);

  const img = box.querySelector('#covImg');
  const apply = () => {
    img.style.cssText = `--cx:${pos.x}%;--cy:${pos.y}%;--cz:${zoom}`;
  };
  apply();

  const frame = box.querySelector('#covEdit');
  let dragging = false, lastX = 0, lastY = 0;
  frame.addEventListener('pointerdown', (e) => {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    frame.setPointerCapture(e.pointerId);
    frame.classList.add('grabbing');
  });
  frame.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const r = frame.getBoundingClientRect();
    // move the focal point opposite to the drag; slower when zoomed in
    pos.x = Math.max(0, Math.min(100, pos.x - (e.clientX - lastX) / r.width * 100 / zoom));
    pos.y = Math.max(0, Math.min(100, pos.y - (e.clientY - lastY) / r.height * 100 / zoom));
    lastX = e.clientX; lastY = e.clientY;
    apply();
  });
  const endDrag = () => { dragging = false; frame.classList.remove('grabbing'); };
  frame.addEventListener('pointerup', endDrag);
  frame.addEventListener('pointercancel', endDrag);
  frame.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoom = Math.max(1, Math.min(3, zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)));
    box.querySelector('#covZoom').value = zoom;
    apply();
  }, { passive: false });
  box.querySelector('#covZoom').oninput = (e) => { zoom = +e.target.value; apply(); };
  box.querySelector('#covReset').onclick = () => {
    pos.x = 50; pos.y = 50; zoom = 1;
    box.querySelector('#covZoom').value = 1; apply();
  };
  box.querySelector('#covChange').onclick = async () => {
    const m = await window.krate.setCover(state.current.path);
    if (m) {
      state.current.meta = m;
      pos.x = 50; pos.y = 50; zoom = 1;
      img.src = fileUrl(absOf(m.cover)) + '?t=' + Date.now();
      box.querySelector('#covZoom').value = 1; apply();
    }
  };
  box.querySelector('#covSave').onclick = async () => {
    meta.coverPos = { x: Math.round(pos.x), y: Math.round(pos.y) };
    meta.coverZoom = Math.round(zoom * 100) / 100;
    await saveMetaNow();
    closeModal();
    renderDetail();
    if (!state.current) renderGrid();
  };
}

async function saveMetaNow() {
  state.current.meta = await window.krate.saveMeta({
    path: state.current.path,
    meta: state.current.meta,
  });
}
const saveMetaSoon = debounce(saveMetaNow, 500);

$('detTitle').addEventListener('input', () => {
  state.current.meta.title = $('detTitle').value;
  saveMetaSoon();
});
$('detStatus').onchange = () => {
  state.current.meta.status = $('detStatus').value;
  saveMetaNow();
};
$('detDesc').addEventListener('input', () => {
  state.current.meta.description = $('detDesc').value;
  saveMetaSoon();
});

function openTagPicker() {
  const meta = state.current.meta;
  const box = openModal(`
    <h2>Tags</h2>
    <div class="tagpick">
      ${state.config.tags.map((t) => `
        <span class="chip ${meta.tags.includes(t.name) ? 'on' : ''}" data-t="${esc(t.name)}"
          style="color:${t.color};border-color:${t.color}55;background:${t.color}22">${esc(t.name)}</span>`).join('')}
    </div>
    <div class="modal-row" style="margin-top:14px">
      <input type="text" id="newTagName" placeholder="New custom tag…">
      <input type="color" id="newTagColor" value="#a855f7">
      <button class="btn" id="btnAddTag">Add</button>
    </div>
    <div class="modal-actions"><button class="btn btn-primary" id="btnTagDone">Done</button></div>
  `);
  box.querySelectorAll('.tagpick .chip').forEach((c) => {
    c.onclick = () => {
      const t = c.dataset.t;
      if (meta.tags.includes(t)) meta.tags = meta.tags.filter((x) => x !== t);
      else meta.tags.push(t);
      c.classList.toggle('on');
    };
  });
  box.querySelector('#btnAddTag').onclick = async () => {
    const name = box.querySelector('#newTagName').value.trim();
    if (!name) return;
    if (!state.config.tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      const tags = [...state.config.tags, { name, color: box.querySelector('#newTagColor').value }];
      const r = await window.krate.saveConfig({ tags });
      state.config = r.config;
    }
    if (!meta.tags.includes(name)) meta.tags.push(name);
    closeModal();
    saveMetaNow().then(() => { renderSidebar(); renderDetail(); });
    openTagPicker();
  };
  box.querySelector('#btnTagDone').onclick = () => {
    closeModal();
    saveMetaNow().then(() => { renderSidebar(); renderDetail(); });
  };
}

/* -------------------------------------------------------------- notes --- */
function renderNotes() {
  const notes = [...state.current.meta.notes].reverse();
  $('noteList').innerHTML = notes.length ? notes.map((n) => `
    <div class="note">
      <div class="note-date">${new Date(n.date).toLocaleString()}</div>
      <div class="note-text">${esc(n.text)}</div>
      <button class="note-del" data-id="${esc(n.id)}" title="Delete note">✕</button>
    </div>`).join('') : '<div class="muted small">No notes yet.</div>';
  $('noteList').querySelectorAll('.note-del').forEach((b) => {
    b.onclick = () => {
      state.current.meta.notes = state.current.meta.notes.filter((n) => n.id !== b.dataset.id);
      saveMetaNow();
      renderNotes();
    };
  });
}

function addNote() {
  const text = $('noteInput').value.trim();
  if (!text) return;
  state.current.meta.notes.push({ id: crypto.randomUUID(), text, date: new Date().toISOString() });
  $('noteInput').value = '';
  saveMetaNow();
  renderNotes();
}
$('btnAddNote').onclick = addNote;
$('noteInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); addNote(); }
});

/* -------------------------------------------------------------- links --- */
function renderLinks() {
  const links = state.current.meta.links || [];
  $('linkList').innerHTML = links.length ? links.map((l) => `
    <div class="link-row" data-id="${esc(l.id)}" title="${esc(l.url)}">
      ${window.KI.forUrl(l.url)}
      <span class="l-title">${esc(l.title || l.url)}</span>
      <span class="l-url">${esc(l.url)}</span>
      <button class="l-del" title="Remove link">${window.KI.get('x')}</button>
    </div>`).join('') : '<div class="muted small">No links yet. Connect your Google Drive folders, Dropbox shares or repos.</div>';
  $('linkList').querySelectorAll('.link-row').forEach((row) => {
    const link = links.find((l) => l.id === row.dataset.id);
    row.onclick = (e) => {
      if (e.target.closest('.l-del')) return;
      window.krate.openExternal(link.url);
    };
    row.querySelector('.l-del').onclick = () => {
      state.current.meta.links = links.filter((l) => l.id !== link.id);
      saveMetaNow();
      renderLinks();
    };
  });
}

function addLink() {
  let url = $('linkUrl').value.trim();
  const title = $('linkTitle').value.trim();
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  state.current.meta.links.push({ id: crypto.randomUUID(), title: title || url.replace(/^https?:\/\//, '').slice(0, 60), url });
  $('linkUrl').value = '';
  $('linkTitle').value = '';
  saveMetaNow();
  renderLinks();
}
$('btnAddLink').onclick = addLink;
$('linkUrl').addEventListener('keydown', (e) => { if (e.key === 'Enter') addLink(); });

/* ------------------------------------------------------------ related --- */
function renderRelated() {
  const ids = state.current.meta.related || [];
  const byId = new Map(state.projects.map((p) => [p.meta.id, p]));
  const rows = ids.map((id) => ({ id, p: byId.get(id) })).filter((x) => x.p);
  $('relatedList').innerHTML = rows.length ? rows.map(({ id, p }) => `
    <div class="link-row" data-rid="${esc(id)}">
      ${window.KI.get('box', 'ri-proj')}
      <span class="l-title">${esc(p.meta.title)}</span>
      <span class="l-url">${esc(p.meta.tags.join(', '))}</span>
      <button class="l-del" title="Remove link">${window.KI.get('x')}</button>
    </div>`).join('') : `<div class="muted small">${window.T('Related projects')}: none yet.</div>`;
  $('relatedList').querySelectorAll('.link-row').forEach((row) => {
    const target = byId.get(row.dataset.rid);
    row.onclick = (e) => {
      if (e.target.closest('.l-del')) return;
      openProject(target.path);
    };
    row.querySelector('.l-del').onclick = () => {
      state.current.meta.related = ids.filter((x) => x !== row.dataset.rid);
      saveMetaNow();
      renderRelated();
    };
  });
}

$('btnAddRelated').onclick = () => {
  const meta = state.current.meta;
  const others = state.projects.filter((p) => p.path !== state.current.path && !(meta.related || []).includes(p.meta.id));
  if (!others.length) { toast('No other projects to link.'); return; }
  const box = openModal(`
    <h2>${window.T('Related projects')}</h2>
    <div style="display:flex;flex-direction:column;gap:6px;max-height:300px;overflow-y:auto">
      ${others.map((p) => `
        <div class="link-row" data-rid="${esc(p.meta.id)}">
          ${window.KI.get('box', 'ri-proj')}
          <span class="l-title">${esc(p.meta.title)}</span>
          <span class="l-url">${esc(p.meta.tags.join(', '))}</span>
        </div>`).join('')}
    </div>
  `);
  box.querySelectorAll('.link-row').forEach((row) => {
    row.onclick = () => {
      meta.related = [...(meta.related || []), row.dataset.rid];
      saveMetaNow();
      closeModal();
      renderRelated();
    };
  });
};

/* -------------------------------------------------------------- files --- */
async function reloadTree() {
  const { meta, tree } = await window.krate.loadProject(state.current.path);
  state.current.meta = meta;
  state.current.tree = tree;
  renderTree();
}

function renderTree() {
  const { tree, meta } = state.current;
  $('dropTarget').textContent = 'Target: /' + state.selectedRel;

  function rows(nodes) {
    return nodes.map((n) => {
      const nick = meta.nicknames[n.rel];
      const isOpen = state.expanded.has(n.rel);
      const hl = state.highlightRel === n.rel ? ' highlighted' : '';
      const sel = n.dir && state.selectedRel === n.rel ? ' selected' : '';
      const isImg = !n.dir && /\.(png|jpe?g|gif|webp|bmp)$/i.test(n.name);
      const icon = (state.config.thumbnails && isImg)
        ? `<img class="fthumb" loading="lazy" src="${fileUrl(absOf(n.rel))}">`
        : `<span class="ficon">${n.dir ? window.KI.get(isOpen ? 'folderOpen' : 'folder', 'fold-ico') : window.KI.forFile(n.name)}</span>`;
      return `
        <div class="frow${sel}${hl}" data-rel="${esc(n.rel)}" data-dir="${n.dir ? 1 : 0}" draggable="true">
          ${icon}
          <span class="fname">${esc(n.name)}</span>
          ${nick ? `<span class="fnick">${esc(nick)}</span>` : ''}
          <span class="fsize">${n.dir ? '' : fmtSize(n.size)}</span>
          <span class="factions">
            <button class="fbtn" data-act="nick" title="Set nickname">${window.KI.get('pencil')}</button>
            ${n.dir ? '' : `<button class="fbtn" data-act="open" title="Open">${window.KI.get('play')}</button>`}
            <button class="fbtn" data-act="reveal" title="Show in Explorer">${window.KI.get('explorer')}</button>
          </span>
        </div>
        ${n.dir && isOpen && n.children.length ? `<div class="fchildren">${rows(n.children)}</div>` : ''}`;
    }).join('');
  }

  $('fileTree').innerHTML = tree.length
    ? rows(tree)
    : '<div class="drop-hint">Empty project. Add files with the button above or drop them here.</div>';

  $('fileTree').querySelectorAll('.frow').forEach((row) => {
    const rel = row.dataset.rel;
    const isDir = row.dataset.dir === '1';

    row.onclick = (e) => {
      if (e.target.closest('.fbtn')) return;
      if (isDir) {
        if (state.expanded.has(rel)) state.expanded.delete(rel);
        else state.expanded.add(rel);
        state.selectedRel = rel;
      } else {
        state.selectedRel = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
      }
      renderTree();
    };
    row.ondblclick = () => { if (!isDir) window.krate.open(absOf(rel)); };

    row.querySelectorAll('.fbtn').forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        if (b.dataset.act === 'open') window.krate.open(absOf(rel));
        if (b.dataset.act === 'reveal') window.krate.reveal(absOf(rel));
        if (b.dataset.act === 'nick') openNicknameModal(rel);
      };
    });

    row.addEventListener('dragstart', (e) => {
      e.preventDefault();
      internalDrag = true;
      window.krate.startDrag(absOf(rel));
      setTimeout(() => { internalDrag = false; }, 400);
    });
  });

  if (state.highlightRel) {
    const el = $('fileTree').querySelector('.frow.highlighted');
    if (el) el.scrollIntoView({ block: 'center' });
    state.highlightRel = null;
  }
}

function openNicknameModal(rel) {
  const cur = state.current.meta.nicknames[rel] || '';
  const box = openModal(`
    <h2>Nickname</h2>
    <div class="muted small" style="margin-bottom:8px">${esc(rel)}</div>
    <input type="text" id="nickInput" value="${esc(cur)}" placeholder="e.g. main clip, thumbnail, final render…">
    <div class="hint">Nicknames make files easy to find in the quick-search overlay (${esc(state.config.hotkey)}).</div>
    <div class="modal-actions">
      <button class="btn" id="nickClear">Clear</button>
      <button class="btn btn-primary" id="nickSave">Save</button>
    </div>
  `);
  const save = (val) => {
    if (val) state.current.meta.nicknames[rel] = val;
    else delete state.current.meta.nicknames[rel];
    closeModal();
    saveMetaNow().then(renderTree);
  };
  box.querySelector('#nickSave').onclick = () => save(box.querySelector('#nickInput').value.trim());
  box.querySelector('#nickClear').onclick = () => save('');
  box.querySelector('#nickInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') save(box.querySelector('#nickInput').value.trim());
  });
}

$('btnAddFiles').onclick = async () => {
  const n = await window.krate.addFiles({ path: state.current.path, targetRel: state.selectedRel });
  if (n) reloadTree();
};

$('btnNewFolder').onclick = () => {
  const box = openModal(`
    <h2>New Folder</h2>
    <div class="muted small" style="margin-bottom:8px">in /${esc(state.selectedRel)}</div>
    <input type="text" id="nfName" placeholder="Folder name">
    <div class="modal-actions"><button class="btn btn-primary" id="nfCreate">Create</button></div>
  `);
  const create = async () => {
    const name = box.querySelector('#nfName').value.trim();
    if (!name) return;
    const rel = (state.selectedRel ? state.selectedRel + '/' : '') + name;
    await window.krate.newFolder({ path: state.current.path, rel });
    if (state.selectedRel) state.expanded.add(state.selectedRel);
    closeModal();
    reloadTree();
  };
  box.querySelector('#nfCreate').onclick = create;
  box.querySelector('#nfName').addEventListener('keydown', (e) => { if (e.key === 'Enter') create(); });
};

$('btnSaveTpl').onclick = () => {
  const box = openModal(`
    <h2>Save structure as template</h2>
    <input type="text" id="tplName" placeholder="Template name" value="${esc(state.current.meta.title)} structure">
    <div class="hint">Saves the folder layout (not the files) of this project as a reusable template.</div>
    <div class="modal-actions"><button class="btn btn-primary" id="tplSave">Save</button></div>
  `);
  box.querySelector('#tplSave').onclick = async () => {
    const name = box.querySelector('#tplName').value.trim();
    if (!name) return;
    await window.krate.saveTemplateFromProject({ path: state.current.path, name });
    await refresh();
    closeModal();
  };
};

/* drag & drop INTO the project */
let internalDrag = false;
const treeEl = $('fileTree');
treeEl.addEventListener('dragover', (e) => {
  if (internalDrag) return;
  e.preventDefault();
  treeEl.classList.add('dragover');
});
treeEl.addEventListener('dragleave', () => treeEl.classList.remove('dragover'));
treeEl.addEventListener('drop', async (e) => {
  e.preventDefault();
  treeEl.classList.remove('dragover');
  if (internalDrag) return;
  const paths = [...e.dataTransfer.files].map((f) => window.krate.pathForFile(f)).filter(Boolean);
  if (!paths.length) return;
  await window.krate.importPaths({ path: state.current.path, targetRel: state.selectedRel, paths });
  reloadTree();
});

/* --------------------------------------------------- project settings --- */
function renderPSettings() {
  const { path, meta } = state.current;
  $('psLocation').textContent = path;
  $('psColor').value = meta.color || '#a855f7';
  const external = state.config.externalProjects.some(
    (p) => p.toLowerCase() === path.toLowerCase());
  $('btnUnregister').hidden = !external;
}

$('psColor').onchange = () => {
  state.current.meta.color = $('psColor').value;
  saveMetaNow();
};

$('btnExportZip').onclick = async () => {
  try {
    const out = await window.krate.exportZip({ path: state.current.path, title: state.current.meta.title });
    if (out) toast(window.T('Exported') + ' ✓');
  } catch {
    toast('ZIP export failed.');
  }
};

$('btnUnregister').onclick = async () => {
  await window.krate.unregisterProject({ path: state.current.path });
  goHome();
  refresh();
};

$('btnDeleteProject').onclick = async () => {
  const ok = await window.krate.deleteProject({ path: state.current.path });
  if (ok) { goHome(); refresh(); }
};

/* ---------------------------------------------------------- new proj --- */
$('btnNew').onclick = () => {
  let customLocation = null;
  const box = openModal(`
    <h2>New Project</h2>
    <label>Name</label>
    <input type="text" id="npName" placeholder="My awesome edit">
    <label>Tags</label>
    <div class="tagpick" id="npTags">
      ${state.config.tags.map((t) => `
        <span class="chip" data-t="${esc(t.name)}"
          style="color:${t.color};border-color:${t.color}55;background:${t.color}22">${esc(t.name)}</span>`).join('')}
    </div>
    <label>Folder template</label>
    <select id="npTpl">
      <option value="">none</option>
      ${state.config.templates.map((t) => `<option value="${esc(t.name)}">${esc(t.name)} (${t.dirs.length} folders${(t.files || []).length ? `, ${t.files.length} files` : ''})</option>`).join('')}
    </select>
    <label>Location</label>
    <div class="modal-row" id="npRootRow" ${(state.config.projectsRoots || []).length > 1 ? '' : 'hidden'}>
      <select id="npRoot" style="flex:1">
        ${(state.config.projectsRoots || []).map((r, i) => `<option value="${esc(r)}" ${i === 0 ? 'selected' : ''}>${esc(r)}</option>`).join('')}
        <option value="__custom__">Choose another folder…</option>
      </select>
    </div>
    <div class="modal-row" id="npCustomRow" ${(state.config.projectsRoots || []).length > 1 ? 'hidden' : ''}>
      <input type="text" id="npLoc" value="${esc(state.config.projectsRoot || '')}" readonly>
      <button class="btn" id="npBrowse">Browse</button>
    </div>
    <div class="error-text" id="npErr" hidden></div>
    <div class="modal-actions">
      <button class="btn" id="npCancel">Cancel</button>
      <button class="btn btn-primary" id="npCreate">Create</button>
    </div>
  `);
  box.querySelectorAll('#npTags .chip').forEach((c) => {
    c.onclick = () => c.classList.toggle('on');
  });
  const npRoot = box.querySelector('#npRoot');
  if (npRoot) npRoot.onchange = () => {
    if (npRoot.value === '__custom__') {
      box.querySelector('#npCustomRow').hidden = false;
      box.querySelector('#npLoc').value = customLocation || '';
    } else {
      box.querySelector('#npCustomRow').hidden = true;
      customLocation = null;
    }
  };
  box.querySelector('#npBrowse').onclick = async () => {
    const dir = await window.krate.pickFolder();
    if (dir) { customLocation = dir; box.querySelector('#npLoc').value = dir; }
  };
  box.querySelector('#npCancel').onclick = closeModal;
  const create = async () => {
    const name = box.querySelector('#npName').value.trim();
    if (!name) return;
    const tags = [...box.querySelectorAll('#npTags .chip.on')].map((c) => c.dataset.t);
    const template = box.querySelector('#npTpl').value || null;
    // pick the chosen default spot, a custom folder, or the single root
    let location = customLocation;
    if (!location && npRoot && npRoot.value && npRoot.value !== '__custom__') location = npRoot.value;
    try {
      const { path } = await window.krate.createProject({ name, tags, template, location });
      closeModal();
      await refresh();
      openProject(path);
    } catch (err) {
      const el = box.querySelector('#npErr');
      el.textContent = String(err.message || err).replace(/^.*Error:\s*/, '');
      el.hidden = false;
    }
  };
  box.querySelector('#npCreate').onclick = create;
  box.querySelector('#npName').addEventListener('keydown', (e) => { if (e.key === 'Enter') create(); });
};

/* ----------------------------------------------------------- settings --- */
$('btnSettings').onclick = openSettings;

function openSettings() {
  const cfg = state.config;
  const box = openModal(`
    <h2>Settings</h2>

    <label>Default project folders <span class="muted" style="font-weight:400;letter-spacing:0">— every subfolder counts as a project</span></label>
    <div id="rootList"></div>
    <button class="btn" id="setRootAdd" style="margin-top:6px"><span class="ico" data-icon="plus"></span> Add folder</button>

    <label>Quick-search hotkey</label>
    <div class="modal-row">
      <input type="text" id="setHotkey" value="${esc(cfg.hotkey)}" spellcheck="false">
      <button class="btn" id="setHotkeyApply">Apply</button>
    </div>
    <div class="hint">Electron accelerator format, e.g. <b>Control+Alt+K</b>, <b>Control+Shift+Space</b>, <b>Alt+F1</b></div>
    <div class="error-text" id="hotkeyErr" hidden></div>

    <label>Theme</label>
    <div class="modal-row">
      <select id="setTheme" style="flex:1">
        <option value="light" ${cfg.theme === 'light' ? 'selected' : ''}>Light (white, black accents)</option>
        <option value="dark" ${cfg.theme === 'dark' ? 'selected' : ''}>Dark (black, white accents)</option>
        <option value="purple" ${cfg.theme === 'purple' ? 'selected' : ''}>Krate Purple (classic)</option>
      </select>
      <input type="color" id="setAccent" value="${esc(cfg.accentColor || '#15151a')}" title="Custom accent color">
      <button class="btn" id="setAccentReset" title="Use the theme's default accent">Reset</button>
    </div>
    <div class="hint">Theme and accent apply instantly. The accent picker is a test feature and overrides the theme's accent everywhere.</div>

    <label>Language</label>
    <select id="setLang">
      <option value="en" ${cfg.lang !== 'de' ? 'selected' : ''}>English</option>
      <option value="de" ${cfg.lang === 'de' ? 'selected' : ''}>Deutsch</option>
    </select>

    <label>Look &amp; feel</label>
    <div class="modal-row" style="gap:10px">
      <input type="checkbox" id="setAnim" ${cfg.animations !== false ? 'checked' : ''} style="width:16px;height:16px">
      <span style="font-size:13.5px">Smooth animations</span>
    </div>
    <div class="modal-row" style="gap:10px;margin-top:6px">
      <input type="checkbox" id="setThumbs" ${cfg.thumbnails ? 'checked' : ''} style="width:16px;height:16px">
      <span style="font-size:13.5px">Image thumbnails in the file tree</span>
    </div>
    <div class="modal-row" style="gap:10px;margin-top:6px">
      <input type="checkbox" id="setDup" ${cfg.dupFinder ? 'checked' : ''} style="width:16px;height:16px">
      <span style="font-size:13.5px">Duplicate finder (adds a scan button to Stats)</span>
    </div>

    <label>Startup</label>
    <div class="modal-row" style="gap:10px">
      <input type="checkbox" id="setAutostart" ${cfg.autostart !== false ? 'checked' : ''} style="width:16px;height:16px">
      <span style="font-size:13.5px">Start with Windows <span class="muted">(in the background, so the search hotkey always works)</span></span>
    </div>

    <label>Watch folder</label>
    <div class="modal-row" style="gap:10px">
      <input type="checkbox" id="setWatch" ${cfg.watchEnabled ? 'checked' : ''} style="width:16px;height:16px">
      <span style="font-size:13.5px">Watch a folder for new files and offer to sort them</span>
    </div>
    <div class="modal-row" style="margin-top:6px">
      <input type="text" id="setWatchPath" value="${esc(cfg.watchPath || '')}" readonly placeholder="Downloads (default)">
      <button class="btn" id="setWatchBrowse">Browse</button>
    </div>

    <label>AI assistant</label>
    <select id="setAiMode">
      <option value="api" ${(cfg.aiMode || 'api') === 'api' ? 'selected' : ''}>Built-in agent (API key, can search your projects)</option>
      <option value="web" ${cfg.aiMode === 'web' ? 'selected' : ''}>Embedded website (sign in with your account)</option>
    </select>
    <div id="setAiApiRows">
      <div class="modal-row" style="margin-top:8px">
        <select id="setAiApiProvider" style="flex:0 0 150px">
          <option value="anthropic" ${cfg.aiApi.provider === 'anthropic' ? 'selected' : ''}>Claude (API)</option>
          <option value="groq" ${cfg.aiApi.provider === 'groq' ? 'selected' : ''}>Groq</option>
          <option value="custom" ${cfg.aiApi.provider === 'custom' ? 'selected' : ''}>Custom (OpenAI-style)</option>
        </select>
        <input type="password" id="setAiKey" value="${esc(cfg.aiApi.apiKey || '')}" placeholder="API key" spellcheck="false">
      </div>
      <div class="modal-row" style="margin-top:6px">
        <input type="text" id="setAiModel" value="${esc(cfg.aiApi.model || '')}" placeholder="Model (blank = default)" spellcheck="false">
        <input type="text" id="setAiBase" value="${esc(cfg.aiApi.baseUrl || '')}" placeholder="Base URL (custom only)" spellcheck="false">
        <button class="btn" id="setAiTest">Test</button>
      </div>
      <div class="hint" id="setAiTestOut">The agent can list, search and read your projects to answer questions. Keys are stored locally in config.json. Defaults: claude-opus-4-8 (Claude), llama-3.3-70b-versatile (Groq).</div>
    </div>
    <div id="setAiWebRows" hidden>
      <select id="setAi" style="margin-top:8px">
        <option value="claude" ${cfg.aiProvider === 'claude' ? 'selected' : ''}>Claude (claude.ai)</option>
        <option value="chatgpt" ${cfg.aiProvider === 'chatgpt' ? 'selected' : ''}>ChatGPT (chatgpt.com)</option>
        <option value="gemini" ${cfg.aiProvider === 'gemini' ? 'selected' : ''}>Google Gemini</option>
        <option value="copilot" ${cfg.aiProvider === 'copilot' ? 'selected' : ''}>Microsoft Copilot</option>
      </select>
      <div class="hint">Opens inside the AI panel. Sign in once with your own account; the login is remembered. "Ask AI" on a project copies its context to paste into the chat.</div>
    </div>

    <label>Tags</label>
    <div id="tagMgr"></div>
    <div class="modal-row">
      <input type="text" id="tagNewName" placeholder="New tag name">
      <input type="color" id="tagNewColor" value="#a855f7">
      <button class="btn" id="tagNewAdd">Add</button>
    </div>

    <label>Folder templates</label>
    <div class="modal-row">
      <select id="tplSelect" style="flex:0 1 200px;min-width:130px"></select>
      <input type="text" id="tplNameIn" placeholder="Template name" spellcheck="false" style="flex:1;min-width:110px">
      <button class="btn" id="tplNew"><span class="ico" data-icon="plus"></span> New</button>
      <button class="btn mgr-del" id="tplDelete" title="Delete template"><span class="ico" data-icon="trash"></span></button>
    </div>
    <div id="tplTree" class="tpl-tree"></div>
    <div class="hint">Build the folder structure visually, hover a folder for actions. Attached files are copied into every new project created from this template.</div>

    <div class="modal-actions">
      <button class="btn btn-primary" id="setDone">Save & Close</button>
    </div>
  `);

  // project-folder roots: list, add, remove. The first one is the default spot.
  const renderRoots = () => {
    const roots = state.config.projectsRoots || [];
    const el = box.querySelector('#rootList');
    el.innerHTML = roots.length ? roots.map((r, i) => `
      <div class="mgr-row root-row" data-root="${esc(r)}">
        <span class="root-path" title="${esc(r)}">${esc(r)}</span>
        ${i === 0 ? '<span class="root-badge">default</span>' : `<button class="btn btn-ghost root-def" title="Make default">${window.KI.get('star')}</button>`}
        <button class="mgr-del root-del" title="Remove">${window.KI.get('x')}</button>
      </div>`).join('') : '<div class="muted small" style="padding:6px 2px">No folders yet.</div>';
    el.querySelectorAll('.root-row').forEach((row) => {
      const r = row.dataset.root;
      const def = row.querySelector('.root-def');
      if (def) def.onclick = async () => {
        const rest = state.config.projectsRoots.filter((x) => x !== r);
        const res = await window.krate.saveConfig({ projectsRoots: [r, ...rest] });
        state.config = res.config; renderRoots(); refresh();
      };
      row.querySelector('.root-del').onclick = async () => {
        const res = await window.krate.saveConfig({ projectsRoots: state.config.projectsRoots.filter((x) => x !== r) });
        state.config = res.config; renderRoots(); refresh();
      };
    });
  };
  renderRoots();
  box.querySelector('#setRootAdd').onclick = async () => {
    const dir = await window.krate.pickFolder();
    if (!dir) return;
    const roots = state.config.projectsRoots || [];
    if (roots.some((x) => x.toLowerCase() === dir.toLowerCase())) return;
    const res = await window.krate.saveConfig({ projectsRoots: [...roots, dir] });
    state.config = res.config; renderRoots(); refresh();
  };

  // hotkey
  box.querySelector('#setHotkeyApply').onclick = async () => {
    const r = await window.krate.saveConfig({ hotkey: box.querySelector('#setHotkey').value.trim() });
    state.config = r.config;
    const err = box.querySelector('#hotkeyErr');
    err.hidden = r.hotkey.ok;
    if (!r.hotkey.ok) err.textContent = r.hotkey.error;
    else err.hidden = true;
  };

  // tag manager
  let tags = [...cfg.tags];
  const renderTagMgr = () => {
    box.querySelector('#tagMgr').innerHTML = tags.map((t, i) => `
      <div class="mgr-row">
        <input type="color" value="${t.color}" data-i="${i}" class="tagColorIn">
        <input type="text" value="${esc(t.name)}" data-i="${i}" class="tagNameIn">
        <button class="mgr-del" data-i="${i}" title="Delete tag">${window.KI.get('x')}</button>
      </div>`).join('');
    box.querySelectorAll('#tagMgr .mgr-del').forEach((b) => {
      b.onclick = () => { tags.splice(+b.dataset.i, 1); renderTagMgr(); };
    });
    box.querySelectorAll('.tagColorIn').forEach((inp) => {
      inp.onchange = () => { tags[+inp.dataset.i].color = inp.value; };
    });
    box.querySelectorAll('.tagNameIn').forEach((inp) => {
      inp.onchange = () => { tags[+inp.dataset.i].name = inp.value.trim() || tags[+inp.dataset.i].name; };
    });
  };
  renderTagMgr();
  box.querySelector('#tagNewAdd').onclick = () => {
    const name = box.querySelector('#tagNewName').value.trim();
    if (!name || tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) return;
    tags.push({ name, color: box.querySelector('#tagNewColor').value });
    box.querySelector('#tagNewName').value = '';
    renderTagMgr();
  };

  // ------- template manager: visual folder tree + attached starter files ---
  let templates = cfg.templates.map((t) => ({
    ...t,
    id: t.id || crypto.randomUUID(),
    dirs: [...(t.dirs || [])],
    files: (t.files || []).map((f) => ({ ...f })),
  }));
  let tplIdx = 0;
  let pendingAdd = null;   // rel of the folder currently getting a new-subfolder input ('' = project root)
  const removedSrcs = [];  // stored template files to purge on Save

  const tplSelect = box.querySelector('#tplSelect');
  const tplNameIn = box.querySelector('#tplNameIn');
  const tplTree = box.querySelector('#tplTree');

  const renderTplSelect = () => {
    tplSelect.innerHTML = templates.map((t, i) =>
      `<option value="${i}" ${i === tplIdx ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
    tplNameIn.value = templates[tplIdx] ? templates[tplIdx].name : '';
    renderTplTree();
  };

  // dirs[] + files[] → nested view model
  const tplNested = (t) => {
    const root = { rel: '', dirs: new Map(), files: [] };
    const ensure = (rel) => {
      let node = root;
      if (!rel) return node;
      let acc = '';
      for (const part of rel.split('/')) {
        acc = acc ? `${acc}/${part}` : part;
        if (!node.dirs.has(part)) node.dirs.set(part, { rel: acc, dirs: new Map(), files: [] });
        node = node.dirs.get(part);
      }
      return node;
    };
    for (const d of t.dirs) ensure(d);
    for (const f of t.files) {
      const parts = f.rel.split('/');
      const name = parts.pop();
      ensure(parts.join('/')).files.push({ ...f, name });
    }
    return root;
  };

  function renderTplTree() {
    const t = templates[tplIdx];
    if (!t) {
      tplTree.innerHTML = '<div class="muted small" style="padding:10px">No templates yet. Create one with “New”.</div>';
      return;
    }
    const rows = [];
    const inputRow = (depth) => rows.push(`
      <div class="trow t-add" style="--d:${depth}">
        ${window.KI.get('folder', 'fold-ico')}
        <input type="text" id="tplAddIn" placeholder="folder name" spellcheck="false">
      </div>`);
    const walk = (node, depth) => {
      const dirs = [...node.dirs.values()].sort((a, b) => a.rel.localeCompare(b.rel));
      for (const d of dirs) {
        rows.push(`
          <div class="trow" style="--d:${depth}" data-rel="${esc(d.rel)}">
            ${window.KI.get('folder', 'fold-ico')}
            <span class="tname">${esc(d.rel.split('/').pop())}</span>
            <span class="tacts">
              <button class="tbtn" data-act="adddir" title="Add subfolder">${window.KI.get('plus')}</button>
              <button class="tbtn" data-act="addfile" title="Attach files">${window.KI.get('upload')}</button>
              <button class="tbtn tbtn-del" data-act="del" title="Delete folder">${window.KI.get('x')}</button>
            </span>
          </div>`);
        if (pendingAdd === d.rel) inputRow(depth + 1);
        walk(d, depth + 1);
      }
      for (const f of [...node.files].sort((a, b) => a.name.localeCompare(b.name))) {
        rows.push(`
          <div class="trow t-file" style="--d:${depth}" data-src="${esc(f.src)}">
            ${window.KI.forFile(f.name)}
            <span class="tname">${esc(f.name)}</span>
            <span class="tacts">
              <button class="tbtn tbtn-del" data-act="delfile" title="Remove file">${window.KI.get('x')}</button>
            </span>
          </div>`);
      }
    };
    rows.push(`
      <div class="trow t-root" style="--d:0">
        ${window.KI.get('box', 'ri-proj')}
        <span class="tname">Project root</span>
        <span class="tacts">
          <button class="tbtn" data-act="adddir-root" title="Add folder">${window.KI.get('plus')}</button>
          <button class="tbtn" data-act="addfile-root" title="Attach files">${window.KI.get('upload')}</button>
        </span>
      </div>`);
    if (pendingAdd === '') inputRow(1);
    walk(tplNested(t), 1);
    tplTree.innerHTML = rows.join('');

    tplTree.querySelectorAll('.tbtn').forEach((b) => {
      const row = b.closest('.trow');
      const rel = row.dataset.rel || '';
      b.onclick = async () => {
        const act = b.dataset.act;
        if (act === 'adddir' || act === 'adddir-root') {
          pendingAdd = act === 'adddir' ? rel : '';
          renderTplTree();
        } else if (act === 'addfile' || act === 'addfile-root') {
          const picked = await window.krate.tplImportFiles({ tplId: t.id });
          for (const p of picked) {
            let r = (act === 'addfile' && rel) ? `${rel}/${p.name}` : p.name;
            const ext = r.includes('.') ? '.' + r.split('.').pop() : '';
            const base = ext ? r.slice(0, -ext.length) : r;
            let i = 2;
            while (t.files.some((f) => f.rel === r)) r = `${base} (${i++})${ext}`;
            t.files.push({ rel: r, src: p.src });
          }
          renderTplTree();
        } else if (act === 'del') {
          const doomed = t.files.filter((f) => f.rel === rel || f.rel.startsWith(rel + '/'));
          removedSrcs.push(...doomed.map((f) => f.src));
          t.files = t.files.filter((f) => !doomed.includes(f));
          t.dirs = t.dirs.filter((d) => d !== rel && !d.startsWith(rel + '/'));
          renderTplTree();
        } else if (act === 'delfile') {
          const f = t.files.find((x) => x.src === row.dataset.src);
          if (f) { removedSrcs.push(f.src); t.files = t.files.filter((x) => x !== f); }
          renderTplTree();
        }
      };
    });

    const addIn = tplTree.querySelector('#tplAddIn');
    if (addIn) {
      addIn.focus();
      let done = false;
      const commit = () => {
        if (done || pendingAdd === null) return;
        done = true;
        const name = addIn.value.trim().replace(/[<>:"/\\|?*]/g, '');
        const parent = pendingAdd;
        pendingAdd = null;
        if (name) {
          const rel = parent ? `${parent}/${name}` : name;
          if (!t.dirs.includes(rel)) t.dirs.push(rel);
        }
        renderTplTree();
      };
      addIn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') { done = true; pendingAdd = null; renderTplTree(); }
      });
      addIn.addEventListener('blur', commit);
    }
  }

  renderTplSelect();
  tplSelect.onchange = () => { tplIdx = +tplSelect.value; pendingAdd = null; renderTplSelect(); };
  tplNameIn.oninput = () => {
    if (!templates[tplIdx]) return;
    templates[tplIdx].name = tplNameIn.value.trim() || 'Untitled';
    tplSelect.options[tplIdx].textContent = templates[tplIdx].name;
  };
  box.querySelector('#tplNew').onclick = () => {
    templates.push({ id: crypto.randomUUID(), name: 'New Template', dirs: [], files: [] });
    tplIdx = templates.length - 1;
    pendingAdd = '';
    renderTplSelect();
    tplNameIn.focus();
    tplNameIn.select();
  };
  box.querySelector('#tplDelete').onclick = () => {
    if (!templates[tplIdx]) return;
    removedSrcs.push(...templates[tplIdx].files.map((f) => f.src));
    templates.splice(tplIdx, 1);
    tplIdx = Math.max(0, tplIdx - 1);
    renderTplSelect();
  };

  // look & feel controls apply live so changes can be compared instantly
  const liveSave = async (partial) => {
    const r = await window.krate.saveConfig(partial);
    state.config = r.config;
    applyLook(state.config);
  };
  box.querySelector('#setAnim').onchange = (e) => liveSave({ animations: e.target.checked });
  box.querySelector('#setTheme').onchange = (e) => liveSave({ theme: e.target.value });
  box.querySelector('#setAccent').oninput = (e) => liveSave({ accentColor: e.target.value });
  box.querySelector('#setAccentReset').onclick = () => liveSave({ accentColor: null });
  box.querySelector('#setLang').onchange = (e) => liveSave({ lang: e.target.value });

  box.querySelector('#setWatchBrowse').onclick = async () => {
    const dir = await window.krate.pickFolder();
    if (dir) box.querySelector('#setWatchPath').value = dir;
  };

  const aiModeSel = box.querySelector('#setAiMode');
  const syncAiRows = () => {
    box.querySelector('#setAiApiRows').hidden = aiModeSel.value !== 'api';
    box.querySelector('#setAiWebRows').hidden = aiModeSel.value !== 'web';
  };
  aiModeSel.onchange = syncAiRows;
  syncAiRows();

  // connection check with the values currently in the fields (pre-save)
  box.querySelector('#setAiTest').onclick = async () => {
    const out = box.querySelector('#setAiTestOut');
    out.style.color = '';
    out.textContent = window.T('Testing connection…');
    const r = await window.krate.aiTest({
      provider: box.querySelector('#setAiApiProvider').value,
      apiKey: box.querySelector('#setAiKey').value.trim(),
      model: box.querySelector('#setAiModel').value.trim(),
      baseUrl: box.querySelector('#setAiBase').value.trim(),
    });
    if (r.ok) {
      out.style.color = 'var(--dot-ok, #1fa855)';
      out.textContent = `${window.T('Connection works')} (${r.model}). ${window.T('Remember to hit Save & Close.')}`;
    } else {
      out.style.color = 'var(--danger)';
      out.textContent = r.error;
    }
  };

  box.querySelector('#setDone').onclick = async () => {
    if (removedSrcs.length) await window.krate.tplDeleteFiles({ srcs: removedSrcs });
    const r = await window.krate.saveConfig({
      tags, templates,
      thumbnails: box.querySelector('#setThumbs').checked,
      dupFinder: box.querySelector('#setDup').checked,
      autostart: box.querySelector('#setAutostart').checked,
      watchEnabled: box.querySelector('#setWatch').checked,
      watchPath: box.querySelector('#setWatchPath').value || null,
      aiMode: aiModeSel.value,
      aiProvider: box.querySelector('#setAi').value,
      aiApi: {
        provider: box.querySelector('#setAiApiProvider').value,
        apiKey: box.querySelector('#setAiKey').value.trim(),
        model: box.querySelector('#setAiModel').value.trim(),
        baseUrl: box.querySelector('#setAiBase').value.trim(),
      },
    });
    state.config = r.config;
    closeModal();
    refresh();
    if (state.current) renderDetail();
  };
}

/* -------------------------------------------------------------- graph --- */
async function openGraph(scopePath = '') {
  const wasCurrent = state.current;
  state.current = null;
  showView('graphView');

  const sel = $('graphScope');
  sel.innerHTML = '<option value="">All projects</option>' +
    state.projects.map((p) => `<option value="${esc(p.path)}" ${p.path === scopePath ? 'selected' : ''}>${esc(p.meta.title)}</option>`).join('');
  sel.onchange = () => buildGraph(sel.value);

  window.KGraph.bind();
  syncGraphHud();
  await buildGraph(scopePath || (wasCurrent ? wasCurrent.path : ''));
  if (wasCurrent) sel.value = wasCurrent.path;
}

async function buildGraph(scopePath) {
  const nodes = [], edges = [];
  const colorOf = (tags, fallback) => {
    const t = state.config.tags.find((t) => tags.includes(t.name));
    return t ? t.color : (fallback || '#a855f7');
  };

  // folders are yellow like the logo, files are white with an outline
  const cFolder = '#f5b301';
  const cFile = '#ffffff';
  const cLink = '#0e7fc0';

  // walks a tree to full depth, sizes folders by how many files live inside
  // them (bigger folders also pull toward the center), returns the file count
  const addTree = (list, parentId, meta, basePath, idPrefix, cap) => {
    let files = 0;
    for (const n of list) {
      if (cap.left <= 0) return files;
      cap.left--;
      const id = idPrefix + n.rel;
      const nick = meta.nicknames[n.rel];
      const node = {
        id, label: nick || n.name, type: n.dir ? 'folder' : 'file',
        color: n.dir ? cFolder : cFile,
        r: n.dir ? 6 : 4,
        outline: !n.dir,
        nick: !!nick && !n.dir,
        abs: basePath + '\\' + n.rel.split('/').join('\\'),
        dir: n.dir,
      };
      nodes.push(node);
      edges.push({ a: parentId, b: id, kind: 'tree' });
      if (n.dir) {
        const sub = n.children ? addTree(n.children, id, meta, basePath, idPrefix, cap) : 0;
        node.r = 5.5 + Math.min(9, Math.sqrt(sub) * 1.7);
        node.g = 1 + (node.r - 5.5) * 0.1; // bigger folders sit closer to the center
        files += sub;
      } else {
        files += 1;
      }
    }
    return files;
  };

  loadBar.start();

  if (!scopePath) {
    // whole library: every project with its complete folder and file
    // structure, tags, links, and dashed edges between related projects
    const usedTags = new Set();
    const perProject = Math.max(80, Math.min(280, Math.floor(1400 / Math.max(1, state.projects.length))));

    let done = 0;
    for (const p of state.projects) {
      nodes.push({
        id: 'p:' + p.path, label: p.meta.title, type: 'project',
        color: p.meta.color || colorOf(p.meta.tags),
        r: 12, g: 1.6, favorite: p.meta.favorite, path: p.path,
      });
      for (const t of p.meta.tags) {
        usedTags.add(t);
        edges.push({ a: 'p:' + p.path, b: 't:' + t });
      }
      for (const l of p.meta.links || []) {
        nodes.push({ id: 'l:' + l.id, label: l.title, type: 'link', color: cLink, r: 4.5, url: l.url });
        edges.push({ a: 'p:' + p.path, b: 'l:' + l.id });
      }
      const { meta, tree } = await window.krate.loadProject(p.path);
      addTree(tree, 'p:' + p.path, meta, p.path, `f:${p.path}:`, { left: perProject });
      // fetching the trees is the first 30% of the bar
      loadBar.progress(0.3 * (++done / state.projects.length));
    }
    for (const t of usedTags) {
      const cfg = state.config.tags.find((x) => x.name === t);
      nodes.push({ id: 't:' + t, label: '#' + t, type: 'tag', color: cfg ? cfg.color : cFolder, r: 7.5 });
    }
    const byMetaId = new Map(state.projects.map((p) => [p.meta.id, p]));
    for (const p of state.projects) {
      for (const rid of p.meta.related || []) {
        const other = byMetaId.get(rid);
        if (other) edges.push({ a: 'p:' + p.path, b: 'p:' + other.path, kind: 'related' });
      }
    }
  } else {
    // one project: full depth folders + files + tags + links
    const p = state.projects.find((x) => x.path === scopePath);
    if (!p) return;
    const { meta, tree } = await window.krate.loadProject(scopePath);
    nodes.push({ id: 'root', label: meta.title, type: 'project', color: meta.color || '#a855f7', r: 13, g: 1.6, favorite: meta.favorite, path: scopePath });
    for (const t of meta.tags) {
      nodes.push({ id: 't:' + t, label: '#' + t, type: 'tag', color: colorOf([t]), r: 7 });
      edges.push({ a: 'root', b: 't:' + t });
    }
    for (const l of meta.links || []) {
      nodes.push({ id: 'l:' + l.id, label: l.title, type: 'link', color: cLink, r: 5, url: l.url });
      edges.push({ a: 'root', b: 'l:' + l.id });
    }
    addTree(tree, 'root', meta, scopePath, 'f:', { left: 700 });
  }

  // pinned nodes are remembered per view (all projects vs a single project)
  const pinKey = 'krate.graph.pins:' + (scopePath || '::all');
  let pins = {};
  try { pins = JSON.parse(localStorage.getItem(pinKey) || '{}'); } catch { }

  window.KGraph.setData({ nodes, edges }, {
    pins,
    incremental: true,
    // revealing the nodes is the remaining 70%; the graph itself shows progress
    onProgress: (rev, tot) => loadBar.progress(0.3 + 0.7 * (rev / Math.max(1, tot))),
    onDone: () => loadBar.done(),
    onPin: (map) => {
      try { localStorage.setItem(pinKey, JSON.stringify(map)); } catch { }
    },
    onClick: (n) => {
      if (n.type === 'project') openProject(n.path);
      else if (n.type === 'tag') { state.tag = n.label.slice(1); state.fav = false; state.status = ''; goHome(); }
      else if (n.type === 'link') window.krate.openExternal(n.url);
      else if (n.type === 'file') window.krate.reveal(n.abs);
      else if (n.type === 'folder') window.krate.reveal(n.abs);
    },
  });
  // tag visibility persists across graph opens
  window.KGraph.setTypeHidden('tag', localStorage.getItem('krate.graph.hideTags') === '1');
  window.KGraph.start();
}

$('btnGraph').onclick = () => openGraph();
$('btnGraphBack').onclick = () => { goHome(); refresh(); };

// label mode for folder and file names: on -> transparent -> off
function syncGraphHud() {
  const mode = window.KGraph.getLabelMode();
  const names = { on: 'Labels: on', dim: 'Labels: faint', off: 'Labels: off' };
  $('graphLabelsState').textContent = names[mode] || 'Labels';
  const hidden = localStorage.getItem('krate.graph.hideTags') === '1';
  $('graphTagsState').textContent = hidden ? 'Tags: off' : 'Tags: on';
}
$('btnGraphLabels').onclick = () => {
  const next = { on: 'dim', dim: 'off', off: 'on' };
  window.KGraph.setLabelMode(next[window.KGraph.getLabelMode()] || 'on');
  syncGraphHud();
};
$('btnGraphTags').onclick = () => {
  const hide = !(localStorage.getItem('krate.graph.hideTags') === '1');
  localStorage.setItem('krate.graph.hideTags', hide ? '1' : '0');
  window.KGraph.setTypeHidden('tag', hide);
  syncGraphHud();
};
$('btnGraphUnpin').onclick = () => window.KGraph.unpinAll();

/* ------------------------------------------------------------ ai panel --- */
const AI_URLS = {
  claude: 'https://claude.ai/new',
  chatgpt: 'https://chatgpt.com/',
  gemini: 'https://gemini.google.com/app',
  copilot: 'https://copilot.microsoft.com/',
};
const aiChat = []; // [{role, content}]
let aiBusy = false;

function openAiPanel() {
  const mode = state.config.aiMode || 'api';
  $('aiPanel').hidden = false;
  if (mode === 'web') {
    $('aiMessages').hidden = true;
    $('aiInputRow').hidden = true;
    $('aiWeb').hidden = false;
    const url = AI_URLS[state.config.aiProvider] || AI_URLS.claude;
    let wv = $('aiWeb').querySelector('webview');
    if (!wv) {
      wv = document.createElement('webview');
      wv.setAttribute('partition', 'persist:krate-ai');
      wv.setAttribute('useragent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36');
      wv.setAttribute('allowpopups', '');
      wv.src = url;
      $('aiWeb').appendChild(wv);
    } else if (wv.dataset.provider !== state.config.aiProvider) {
      wv.src = url;
    }
    wv.dataset.provider = state.config.aiProvider;
    $('aiSub').textContent = state.config.aiProvider;
  } else {
    $('aiMessages').hidden = false;
    $('aiInputRow').hidden = false;
    $('aiWeb').hidden = true;
    const api = state.config.aiApi || {};
    $('aiSub').textContent = api.provider || 'anthropic';
    renderAiChat();
    $('aiInput').focus();
  }
}

function renderAiChat() {
  const box = $('aiMessages');
  if (!aiChat.length) {
    box.innerHTML = `<div class="ai-empty">${(state.config.aiApi && state.config.aiApi.apiKey)
      ? 'Ask anything about your projects.<br>The agent can list, search and read them.'
      : 'No API key yet.<br>Add one in Settings, or switch to web mode to sign in with your account.'}</div>`;
    return;
  }
  box.innerHTML = aiChat.map((m) => {
    if (m.role === 'activity') return `<div class="ai-activity">→ ${esc(m.content)}</div>`;
    if (m.role === 'error') return `<div class="aim err">${esc(m.content)}</div>`;
    return `<div class="aim ${m.role === 'user' ? 'user' : 'bot'}">${esc(m.content)}</div>`;
  }).join('');
  box.scrollTop = box.scrollHeight;
}

async function sendAi() {
  if (aiBusy) return;
  const text = $('aiInput').value.trim();
  if (!text) return;
  $('aiInput').value = '';
  aiChat.push({ role: 'user', content: text });
  aiChat.push({ role: 'activity', content: window.T('Thinking…') });
  renderAiChat();
  aiBusy = true;
  const history = aiChat.filter((m) => m.role === 'user' || m.role === 'assistant');
  const r = await window.krate.aiAsk({ history });
  aiBusy = false;
  // drop the transient activity lines from this turn
  for (let i = aiChat.length - 1; i >= 0 && aiChat[i].role === 'activity'; i--) aiChat.splice(i, 1);
  if (r.error) aiChat.push({ role: 'error', content: r.error });
  else aiChat.push({ role: 'assistant', content: r.text });
  renderAiChat();
}

window.krate.on('ai-activity', (text) => {
  if (!aiBusy) return;
  aiChat.push({ role: 'activity', content: text });
  renderAiChat();
});

$('btnAi').onclick = () => {
  if ($('aiPanel').hidden) openAiPanel();
  else $('aiPanel').hidden = true;
};
$('btnAiClose').onclick = () => { $('aiPanel').hidden = true; };
$('btnAiSend').onclick = sendAi;
$('aiInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAi(); }
});

/* ---------------------------------------------------------------- stats --- */
async function openStats() {
  state.current = null;
  showView('statsView');
  $('statsView').innerHTML = `<div class="view-title">${window.KI.get('chart')} <span>${window.T('Library stats')}</span></div><div class="view-sub">${window.T('Scanning…')}</div>`;
  const s = await window.krate.statsGet();
  const bar = (label, val, max) => `
    <div class="bar-row">
      <span class="bl">${esc(label)}</span>
      <span class="bar"><i style="width:${max ? Math.round((val / max) * 100) : 0}%"></i></span>
      <span class="bv">${val}</span>
    </div>`;
  const maxStatus = Math.max(1, ...Object.values(s.byStatus));
  const maxTag = Math.max(1, ...Object.values(s.byTag));
  const cards = [
    [s.count, window.T('Projects')],
    [s.favorites, window.T('Favorites')],
    [s.totalFiles, window.T('Files')],
    [fmtSize(s.totalBytes), window.T('Total size')],
  ];
  $('statsView').innerHTML = `
    <div class="view-title">${window.KI.get('chart')} <span>${window.T('Library stats')}</span></div>
    <div class="view-sub">&nbsp;</div>
    <div class="stats-grid">
      ${cards.map(([n, l], i) => `<div class="stat-card" style="--i:${i}"><div class="num">${n}</div><div class="lbl">${l}</div></div>`).join('')}
    </div>
    <div class="stats-cols">
      <div class="stats-col">
        <h3 class="view-h3">${window.T('By status')}</h3>
        ${Object.entries(s.byStatus).map(([k, v]) => bar(k, v, maxStatus)).join('') || '<div class="muted small">–</div>'}
        <h3 class="view-h3" style="margin-top:16px">${window.T('By tag')}</h3>
        ${Object.entries(s.byTag).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => bar(k, v, maxTag)).join('') || '<div class="muted small">–</div>'}
      </div>
      <div class="stats-col">
        <h3 class="view-h3">${window.T('Biggest projects')}</h3>
        <div class="big-list">
          ${s.biggest.map((b) => `
            <div class="big-row" data-path="${esc(b.path)}">
              ${window.KI.get('box', 'ri-proj')} <span>${esc(b.title)}</span>
              <span class="sz">${fmtSize(b.bytes)} · ${b.files} files</span>
            </div>`).join('')}
        </div>
        ${state.config.dupFinder ? `<button class="btn" id="btnDupes" style="margin-top:12px">${window.KI.get('copy')} ${window.T('Find duplicate files')}</button><div id="dupList" style="margin-top:12px"></div>` : ''}
      </div>
    </div>`;
  $('statsView').querySelectorAll('.big-row').forEach((el) => {
    el.onclick = () => openProject(el.dataset.path);
  });
  const dupBtn = $('statsView').querySelector('#btnDupes');
  if (dupBtn) {
    dupBtn.onclick = async () => {
      const list = $('statsView').querySelector('#dupList');
      list.innerHTML = `<div class="muted small">${window.T('Scanning…')}</div>`;
      const groups = await window.krate.dupesFind();
      list.innerHTML = groups.length ? groups.map((g) => `
        <div class="dup-group">
          <div class="dg-head">${g.files.length} × ${fmtSize(g.size)}: ${esc(g.files[0].rel.split('/').pop())}</div>
          ${g.files.map((f) => `<div class="dup-file" data-abs="${esc(f.abs)}">${window.KI.get('file')} ${esc(f.project)} / ${esc(f.rel)}</div>`).join('')}
        </div>`).join('') : `<div class="muted small">${window.T('No duplicates found.')}</div>`;
      list.querySelectorAll('.dup-file').forEach((el) => {
        el.onclick = () => window.krate.reveal(el.dataset.abs);
      });
    };
  }
}
$('btnStats').onclick = openStats;

/* ---------------------------------------------------------------- trash --- */
async function openTrash() {
  state.current = null;
  showView('trashView');
  const list = await window.krate.trashList();
  $('trashView').innerHTML = `
    <div class="view-title">${window.KI.get('trash')} <span>${window.T('Trash')}</span></div>
    <div class="view-sub">${list.length || window.T('Trash is empty.')}</div>
    ${list.map((e) => `
      <div class="trash-row" data-id="${esc(e.id)}">
        ${window.KI.get('box', 'ri-proj')}
        <div>
          <div class="t-title">${esc(e.title)}</div>
          <div class="t-sub">${window.T('deleted')} ${timeAgo(e.deletedAt)} · ${esc(e.origin)}</div>
        </div>
        <div class="t-acts">
          <button class="btn" data-act="restore">${window.KI.get('restore')} ${window.T('Restore')}</button>
          <button class="btn btn-danger" data-act="purge">${window.KI.get('trash')} ${window.T('Delete forever')}</button>
        </div>
      </div>`).join('')}`;
  $('trashView').querySelectorAll('.trash-row').forEach((row) => {
    row.querySelector('[data-act="restore"]').onclick = async () => {
      await window.krate.trashRestore({ id: row.dataset.id });
      await refresh();
      openTrash();
      toast(window.T('Restore') + ' ✓');
    };
    row.querySelector('[data-act="purge"]').onclick = async () => {
      await window.krate.trashPurge({ id: row.dataset.id });
      openTrash();
    };
  });
}
$('btnTrash').onclick = openTrash;

/* ----------------------------------------------------- watch folder sort --- */
window.krate.on('watch-file', ({ path: absPath, name }) => {
  const box = openModal(`
    <h2>${window.T('Sort into project')}</h2>
    <div class="muted small" style="margin-bottom:10px">${esc(name)}</div>
    <label>${window.T('Projects')}</label>
    <select id="wfProject">
      ${state.projects.map((p) => `<option value="${esc(p.path)}">${esc(p.meta.title)}</option>`).join('')}
    </select>
    <label>Subfolder (optional)</label>
    <input type="text" id="wfSub" placeholder="e.g. Footage/Raw" spellcheck="false">
    <div class="modal-actions">
      <button class="btn" id="wfCancel">Cancel</button>
      <button class="btn btn-primary" id="wfMove">${window.T('Sort into project')}</button>
    </div>
  `);
  box.querySelector('#wfCancel').onclick = closeModal;
  box.querySelector('#wfMove').onclick = async () => {
    const project = box.querySelector('#wfProject').value;
    const sub = box.querySelector('#wfSub').value.trim().replace(/^\/+|\/+$/g, '');
    await window.krate.importPaths({ path: project, targetRel: sub, paths: [absPath] });
    closeModal();
    toast('✓ ' + name);
  };
});

/* ---------------------------------------------------------- first run --- */
/* ----------------------------------------------------- first-run wizard --- */
// Multi-step setup: folder (+ adopt existing), look, AI, extras, quick tour.
// The wizard itself always starts in the light theme; the user picks theirs
// in the Look step and it applies live.
function openWizard() {
  const w = {
    dir: state.config.projectsRoot || null,
    adopt: true,
    theme: 'light',
    accent: null,
    aiChoice: 'skip', aiProvider: 'anthropic', aiKey: '', aiModel: '',
    watch: false, autostart: true,
  };
  applyLook({ theme: 'light', accentColor: null });
  let step = 0;

  const dots = () => `<div class="wiz-dots">${[0, 1, 2, 3, 4, 5].map((i) =>
    `<span class="wiz-dot ${i === step ? 'on' : ''}"></span>`).join('')}</div>`;
  const foot = (nextLabel = 'Next', nextOk = true) => `
    <div class="modal-actions" style="justify-content:space-between">
      <button class="btn btn-ghost" id="wBack" ${step === 0 ? 'style="visibility:hidden"' : ''}>Back</button>
      ${dots()}
      <button class="btn btn-primary" id="wNext" ${nextOk ? '' : 'disabled'} style="margin-left:0">${nextLabel}</button>
    </div>`;

  const steps = [
    // 0 — welcome
    () => `
      <div class="wiz-hero"><img class="wiz-mark" src="logo.png" alt=""></div>
      <h2 style="text-align:center">Hey ${esc(window.krate.username || 'there')}, welcome to Krate</h2>
      <p class="muted" style="line-height:1.6;text-align:center">
        Every project, from edits to apps to designs, in one organized place:
        tagged, searchable and one hotkey away.<br>Let's set things up. Takes about a minute.
      </p>
      ${foot('Get started')}`,

    // 1 — projects folder
    () => `
      <h2>Where do your projects live?</h2>
      <p class="muted" style="line-height:1.6">New projects are created here by default. You can pick a different place per project later.</p>
      <div class="modal-row" style="margin-top:12px">
        <input type="text" id="wDir" value="${esc(w.dir || '')}" readonly placeholder="No folder chosen yet">
        <button class="btn" id="wPick"><span class="ico" data-icon="folder"></span> Browse</button>
      </div>
      <div class="modal-row" style="gap:10px;margin-top:12px">
        <input type="checkbox" id="wAdopt" ${w.adopt ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--accent)">
        <span style="font-size:13.5px">Treat folders already inside as projects <span class="muted">(adds a krate.json to each)</span></span>
      </div>
      ${foot('Next', !!w.dir)}`,

    // 2 — look
    () => `
      <h2>Pick your look</h2>
      <p class="muted">Applies instantly. You can change it any time in Settings.</p>
      <div class="wiz-themes">
        <div class="wtheme ${w.theme === 'light' ? 'on' : ''}" data-t="light">
          <div class="wt-prev" style="background:#f4f4f1;border-color:#dcdcd3"><i style="background:#15151a"></i><b style="background:#ffffff;border-color:#dcdcd3"></b></div>
          <span>Light</span>
        </div>
        <div class="wtheme ${w.theme === 'dark' ? 'on' : ''}" data-t="dark">
          <div class="wt-prev" style="background:#0d0d0d;border-color:#2b2b2b"><i style="background:#f2f2f2"></i><b style="background:#191919;border-color:#2b2b2b"></b></div>
          <span>Dark</span>
        </div>
        <div class="wtheme ${w.theme === 'purple' ? 'on' : ''}" data-t="purple">
          <div class="wt-prev" style="background:#0b0a10;border-color:#262130"><i style="background:#a855f7"></i><b style="background:#16131f;border-color:#262130"></b></div>
          <span>Purple</span>
        </div>
      </div>
      <div class="modal-row" style="margin-top:14px;gap:10px">
        <span class="muted small">Custom accent (optional)</span>
        <input type="color" id="wAccent" value="${w.accent || '#15151a'}">
        <button class="btn btn-ghost" id="wAccentReset">Reset</button>
      </div>
      ${foot()}`,

    // 3 — AI
    () => `
      <h2>AI assistant</h2>
      <p class="muted" style="line-height:1.6">Optional. The built-in agent can list, search and read your projects to answer questions.</p>
      <select id="wAiChoice" style="margin-top:10px;width:100%">
        <option value="skip" ${w.aiChoice === 'skip' ? 'selected' : ''}>Skip for now</option>
        <option value="api" ${w.aiChoice === 'api' ? 'selected' : ''}>Built-in agent (API key)</option>
        <option value="web" ${w.aiChoice === 'web' ? 'selected' : ''}>Embedded website (sign in with account)</option>
      </select>
      <div id="wAiRows" ${w.aiChoice !== 'api' ? 'hidden' : ''}>
        <div class="modal-row" style="margin-top:10px">
          <select id="wAiProvider" style="flex:0 0 140px">
            <option value="anthropic" ${w.aiProvider === 'anthropic' ? 'selected' : ''}>Claude (API)</option>
            <option value="groq" ${w.aiProvider === 'groq' ? 'selected' : ''}>Groq</option>
          </select>
          <input type="password" id="wAiKey" value="${esc(w.aiKey)}" placeholder="API key" spellcheck="false">
          <button class="btn" id="wAiTest">Test</button>
        </div>
        <div class="hint" id="wAiOut">The key is stored locally, in config.json on this PC.</div>
      </div>
      ${foot()}`,

    // 4 — extras
    () => `
      <h2>Two more things</h2>
      <div class="modal-row" style="gap:10px;margin-top:14px">
        <input type="checkbox" id="wAuto" ${w.autostart ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--accent)">
        <span style="font-size:13.5px">Start Krate with Windows <span class="muted">(in the background, so the search hotkey always works)</span></span>
      </div>
      <div class="modal-row" style="gap:10px;margin-top:12px">
        <input type="checkbox" id="wWatch" ${w.watch ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--accent)">
        <span style="font-size:13.5px">Watch my Downloads folder <span class="muted">(offers to sort new files into a project)</span></span>
      </div>
      ${foot()}`,

    // 5 — tour
    () => `
      <h2>You're set. The 20-second tour:</h2>
      <div class="wiz-list">
        <div>${window.KI.get('search')} <span><b>Ctrl+Alt+K</b> anywhere in Windows: search every project, file and nickname. Drag results into any app.</span></div>
        <div>${window.KI.get('plus')} <span><b>New Project</b> creates a folder from a template, with structure and starter files included.</span></div>
        <div>${window.KI.get('pencil')} <span>Give files <b>nicknames</b> ("main clip") in the Files tab so you find them without knowing the real name.</span></div>
        <div>${window.KI.get('graph')} <span><b>Graph View</b> shows your whole library as a map. Click a node to jump there.</span></div>
        <div>${window.KI.get('bot')} <span>The <b>AI panel</b> answers questions like "where is the render of my last edit?"</span></div>
      </div>
      ${foot('Finish')}`,
  ];

  const render = () => {
    const box = openModal(steps[step]());
    injectIcons(box);

    box.querySelector('#wBack').onclick = () => { step = Math.max(0, step - 1); render(); };
    box.querySelector('#wNext').onclick = async () => {
      if (step === steps.length - 1) { await finish(); return; }
      step++;
      render();
    };

    if (step === 1) {
      box.querySelector('#wPick').onclick = async () => {
        const dir = await window.krate.pickFolder();
        if (!dir) return;
        w.dir = dir;
        render();
      };
      box.querySelector('#wAdopt').onchange = (e) => { w.adopt = e.target.checked; };
    }

    if (step === 2) {
      box.querySelectorAll('.wtheme').forEach((el) => {
        el.onclick = () => {
          w.theme = el.dataset.t;
          applyLook({ theme: w.theme, accentColor: w.accent });
          render();
        };
      });
      box.querySelector('#wAccent').oninput = (e) => {
        w.accent = e.target.value;
        applyLook({ theme: w.theme, accentColor: w.accent });
      };
      box.querySelector('#wAccentReset').onclick = () => {
        w.accent = null;
        applyLook({ theme: w.theme, accentColor: null });
      };
    }

    if (step === 3) {
      const choice = box.querySelector('#wAiChoice');
      choice.onchange = () => { w.aiChoice = choice.value; box.querySelector('#wAiRows').hidden = choice.value !== 'api'; };
      const prov = box.querySelector('#wAiProvider');
      prov.onchange = () => { w.aiProvider = prov.value; };
      box.querySelector('#wAiKey').oninput = (e) => { w.aiKey = e.target.value; };
      box.querySelector('#wAiTest').onclick = async () => {
        const out = box.querySelector('#wAiOut');
        out.style.color = '';
        out.textContent = 'Testing…';
        const r = await window.krate.aiTest({ provider: w.aiProvider, apiKey: w.aiKey.trim(), model: '', baseUrl: '' });
        out.style.color = r.ok ? '#1fa855' : 'var(--danger)';
        out.textContent = r.ok ? `Connection works (${r.model}).` : r.error;
      };
    }

    if (step === 4) {
      box.querySelector('#wAuto').onchange = (e) => { w.autostart = e.target.checked; };
      box.querySelector('#wWatch').onchange = (e) => { w.watch = e.target.checked; };
    }
  };

  const finish = async () => {
    const partial = {
      projectsRoot: w.dir,
      theme: w.theme,
      accentColor: w.accent,
      autostart: w.autostart,
      watchEnabled: w.watch,
      onboarded: true,
    };
    if (w.aiChoice === 'api') {
      partial.aiMode = 'api';
      partial.aiApi = { provider: w.aiProvider, apiKey: w.aiKey.trim(), model: '', baseUrl: '' };
    } else if (w.aiChoice === 'web') {
      partial.aiMode = 'web';
    }
    const r = await window.krate.saveConfig(partial);
    state.config = r.config;
    if (w.adopt) {
      const n = await window.krate.adoptExisting();
      if (n) toast(`${n} ${window.T('existing folders added as projects')}`);
    }
    closeModal();
    await refresh();
  };

  render();
}

/* -------------------------------------------------------------- boot ---- */
window.krate.on('goto-project', ({ path, rel }) => {
  openProject(path, rel ? { tab: 'files', highlightRel: rel } : {});
});

window.addEventListener('focus', () => { if (!state.current) refresh(); });

/* ------------------------------------------------------ panel resizers --- */
// Sidebar and AI panel widths are draggable; sizes persist per machine.
function initResizers() {
  const defs = [
    { grip: 'rszSidebar', panel: 'sidebar', key: 'krate.w.sidebar', min: 176, max: 360, dir: 1, def: 236 },
    { grip: 'rszAi', panel: 'aiPanel', key: 'krate.w.ai', min: 300, max: 680, dir: -1, def: 400 },
  ];
  for (const d of defs) {
    const grip = $(d.grip);
    const panel = $(d.panel);
    if (!grip || !panel) continue;
    const saved = +localStorage.getItem(d.key);
    if (saved) panel.style.width = Math.min(d.max, Math.max(d.min, saved)) + 'px';

    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      grip.classList.add('dragging');
      document.body.classList.add('resizing');
      const startX = e.clientX;
      const startW = panel.getBoundingClientRect().width;
      const move = (ev) => {
        const w = Math.min(d.max, Math.max(d.min, startW + (ev.clientX - startX) * d.dir));
        panel.style.width = w + 'px';
        if (!$('graphView').hidden) window.KGraph.start(); // keep canvas in sync
      };
      const up = () => {
        grip.classList.remove('dragging');
        document.body.classList.remove('resizing');
        localStorage.setItem(d.key, Math.round(panel.getBoundingClientRect().width));
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
    });
    grip.addEventListener('dblclick', () => {
      panel.style.width = d.def + 'px';
      localStorage.removeItem(d.key);
    });
  }
}

/* ------------------------------------------------------- top load bar --- */
// A thin, determinate bar with a moving shine. No numbers: the graph builds up
// piece by piece, which is the visible progress. loadBar.start() ->
// loadBar.progress(0..1) -> loadBar.done().
const loadBar = {
  _t: null, _cur: 0,
  start() {
    clearTimeout(this._t);
    const el = $('loadBar');
    el.hidden = false;
    el.classList.remove('fade');
    el.classList.add('working');
    this._cur = 0;
    $('loadBarFill').style.width = '4%';
  },
  progress(frac) {
    // only move forward, so the bar never jumps backwards between phases
    const pct = Math.max(4, Math.min(100, Math.round(frac * 100)));
    if (pct <= this._cur) return;
    this._cur = pct;
    $('loadBarFill').style.width = pct + '%';
  },
  done() {
    const el = $('loadBar');
    el.classList.remove('working');
    $('loadBarFill').style.width = '100%';
    el.classList.add('fade');
    this._t = setTimeout(() => { el.hidden = true; el.classList.remove('fade'); }, 400);
  },
};

/* --------------------------------------------------------- update bar --- */
function showUpdateBar(info) {
  if (!info || !info.version) return;
  document.body.classList.add('has-update');
  const bar = $('updateBar');
  bar.hidden = false;
  const ver = esc(info.version);
  const rel = `https://github.com/ImKirit/Krate/releases/tag/v${ver}`;
  // one item, duplicated so the loop is seamless
  const item = `<span class="ub-item">
      <span class="ub-dot"></span>
      <b>${window.T('New update available')}</b>
      <span class="ub-ver">v${ver}</span>
      <span class="ub-gh" data-rel="${rel}">${window.T('View on GitHub')}</span>
    </span>`;
  $('ubTrack').innerHTML = `<span class="ub-flow">${item.repeat(4)}</span>`;
  injectIcons(bar);
  $('ubTrack').querySelectorAll('.ub-gh').forEach((a) => {
    a.onclick = () => window.krate.openExternal(a.dataset.rel);
  });
  $('ubInstall').onclick = async () => {
    $('ubInstall').disabled = true;
    $('ubInstall').innerHTML = window.T('Restarting…');
    await window.krate.updateInstall();
  };
  $('ubClose').onclick = () => {
    bar.hidden = true;
    document.body.classList.remove('has-update');
  };
}
window.krate.on('update-ready', (info) => showUpdateBar(info));

/* --------------------------------------------------------- what's new --- */
function showWhatsNew(info) {
  const cl = (window.KRATE_CHANGELOG || {})[info.to];
  if (!cl) return;

  // one bullet, optionally with indented sub-bullets, tinted to its category
  const bullet = (item, color) => {
    const text = typeof item === 'string' ? item : item.text;
    const sub = (typeof item === 'object' && item.sub) || [];
    return `<div class="wn-item">
        <span class="wn-dot" style="background:${color}"></span>
        <div class="wn-body">
          <div>${esc(text)}</div>
          ${sub.length ? `<div class="wn-sub">${sub.map((s) =>
            `<div><span class="wn-tick" style="border-color:${color}"></span><span>${esc(s)}</span></div>`).join('')}</div>` : ''}
        </div>
      </div>`;
  };

  let body;
  if (cl.groups) {
    body = cl.groups.map((g) => `
      <div class="wn-group" style="--cat:${g.color}">
        <div class="wn-cat"><span class="wn-cat-dot"></span>${esc(g.name)}</div>
        ${g.items.map((it) => bullet(it, g.color)).join('')}
      </div>`).join('');
  } else {
    body = `<div class="wn-group" style="--cat:#f5b301">${(cl.items || []).map((it) => bullet(it, '#f5b301')).join('')}</div>`;
  }

  const box = openModal(`
    <div class="wn-hero"><img class="wn-mark" src="logo.png" alt=""></div>
    <h2 style="text-align:center;cursor:grab">${esc(cl.title)}</h2>
    <div class="wn-scroll">${body}</div>
    <div class="modal-actions">
      <button class="btn btn-primary" id="wnDone" style="margin-left:0">${window.T('Got it')}</button>
    </div>`);
  box.querySelector('#wnDone').onclick = closeModal;
}

(async function boot() {
  injectIcons();
  initResizers();
  await refresh();
  const s = await window.krate.getState();
  if (s.update) showUpdateBar(s.update);
  if (!state.config.onboarded || !state.config.projectsRoot) openWizard();
  else if (s.whatsNew) showWhatsNew(s.whatsNew);
})();
