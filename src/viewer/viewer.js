/* viewer.js — basic preview window: image, video, or a small code editor
   with optional HTML preview. Driven by the 'viewer-open' event (abs path). */
'use strict';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const ext = (p) => (p.split('.').pop() || '').toLowerCase();
const baseName = (p) => p.split(/[\\/]/).pop();
const fileUrl = (abs) => encodeURI('file:///' + abs.replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F');

const IMAGE = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif'];
const VIDEO = ['mp4', 'webm', 'mov', 'mkv', 'm4v', 'ogv'];
const CODE = ['txt', 'md', 'js', 'ts', 'jsx', 'tsx', 'json', 'html', 'htm', 'css', 'xml', 'yml', 'yaml',
  'py', 'java', 'c', 'cpp', 'cs', 'sh', 'bat', 'glsl', 'ini', 'cfg', 'toml', 'csv', 'log', 'srt'];

let current = null;   // { path }
let dirty = false;
let previewOn = false;

function setStatus(t) { $('vStatus').textContent = t || ''; }

async function open(absPath) {
  current = { path: absPath };
  dirty = false;
  previewOn = false;
  $('vName').textContent = baseName(absPath);
  document.title = 'Krate — ' + baseName(absPath);
  $('vSave').hidden = true;
  $('vPreview').hidden = true;
  $('vPreview').classList.remove('on');
  setStatus('');
  const e = ext(absPath);

  if (IMAGE.includes(e)) {
    stage.innerHTML = `<div class="v-media"><img src="${fileUrl(absPath)}" alt=""></div>`;
    return;
  }
  if (VIDEO.includes(e)) {
    stage.innerHTML = `<div class="v-media"><video src="${fileUrl(absPath)}" controls autoplay></video></div>`;
    return;
  }
  if (CODE.includes(e)) {
    const r = await window.krate.readFile(absPath);
    if (r.error) { stage.innerHTML = `<div class="v-msg">${r.error}</div>`; return; }
    renderCode(r.text, e);
    return;
  }
  stage.innerHTML = `<div class="v-msg">No built-in preview for .${e} files.<br>Open it in Explorer instead.</div>`;
}

function renderCode(text, e) {
  const isHtml = e === 'html' || e === 'htm';
  stage.innerHTML = `<div class="v-code">
      <textarea id="vCode" spellcheck="false"></textarea>
      <div class="v-preview" id="vPrev" hidden><iframe id="vFrame" sandbox="allow-same-origin"></iframe></div>
    </div>`;
  const ta = $('vCode');
  ta.value = text;
  $('vSave').hidden = false;
  $('vPreview').hidden = !isHtml;

  ta.addEventListener('input', () => { dirty = true; setStatus('unsaved'); if (previewOn) updatePreview(); });
  // basic editor niceties (Ctrl+Z/Y are native to textarea)
  ta.addEventListener('keydown', (ev) => {
    if (ev.key === 'Tab') {
      ev.preventDefault();
      const s = ta.selectionStart, en = ta.selectionEnd;
      ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(en);
      ta.selectionStart = ta.selectionEnd = s + 2;
      dirty = true; setStatus('unsaved');
    }
    if (ev.key === 's' && ev.ctrlKey) { ev.preventDefault(); save(); }
  });
  ta.focus();
}

function updatePreview() {
  const frame = $('vFrame');
  if (frame) frame.srcdoc = $('vCode').value;
}

async function save() {
  if (!current || $('vCode') == null) return;
  setStatus('saving…');
  const r = await window.krate.saveFile({ path: current.path, text: $('vCode').value });
  if (r.error) { setStatus(r.error); return; }
  dirty = false; setStatus('saved');
  setTimeout(() => { if (!dirty) setStatus(''); }, 1500);
}

$('vSave').onclick = save;
$('vPreview').onclick = () => {
  previewOn = !previewOn;
  $('vPreview').classList.toggle('on', previewOn);
  $('vPrev').hidden = !previewOn;
  if (previewOn) updatePreview();
};

window.addEventListener('keydown', (e) => {
  if (e.key === 's' && e.ctrlKey) { e.preventDefault(); save(); }
});

window.krate.on('viewer-open', (absPath) => open(absPath));

// theme
window.krate.getState().then((s) => {
  document.body.dataset.theme = (s.config && s.config.theme) || 'light';
}).catch(() => { });
