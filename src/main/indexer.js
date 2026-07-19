// indexer.js — flat search index over all projects for the quick-search
// overlay: project titles, file/folder names and user-given nicknames.
const path = require('path');
const store = require('./store');

let cache = null;        // [{type, projectPath, projectTitle, tagColor, rel, abs, name, nickname, dir}]
let cacheVersion = -1;
let cacheTime = 0;
const TTL = 15000;

async function buildIndex() {
  const config = store.getConfig();
  const tagColor = (tags) => {
    const t = config.tags.find(t => tags.includes(t.name));
    return t ? t.color : '#a855f7';
  };
  const projects = await store.listProjects();
  const out = [];
  for (const p of projects) {
    out.push({
      type: 'project',
      projectPath: p.path, projectTitle: p.meta.title,
      tagColor: tagColor(p.meta.tags),
      rel: '', abs: p.path, name: p.meta.title, nickname: null, dir: true,
    });
    for (const l of p.meta.links || []) {
      out.push({
        type: 'link',
        projectPath: p.path, projectTitle: p.meta.title,
        tagColor: tagColor(p.meta.tags),
        rel: '', abs: l.url, url: l.url, name: l.title || l.url, nickname: null, dir: false,
      });
    }
    const tree = await store.readTree(p.path);
    const walk = (nodes) => {
      for (const n of nodes) {
        out.push({
          type: n.dir ? 'folder' : 'file',
          projectPath: p.path, projectTitle: p.meta.title,
          tagColor: tagColor(p.meta.tags),
          rel: n.rel,
          abs: path.join(p.path, ...n.rel.split('/')),
          name: n.name,
          nickname: p.meta.nicknames[n.rel] || null,
          dir: !!n.dir,
        });
        if (n.children) walk(n.children);
      }
    };
    walk(tree);
  }
  return out;
}

async function getIndex() {
  const v = store.getVersion();
  if (!cache || v !== cacheVersion || Date.now() - cacheTime > TTL) {
    cache = await buildIndex();
    cacheVersion = v;
    cacheTime = Date.now();
  }
  return cache;
}

// ------------------------------------------------------------- matching ---
function matchScore(query, text) {
  if (!text) return 0;
  const q = query.toLowerCase(), t = text.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 70;
  const idx = t.indexOf(q);
  if (idx >= 0) return 50 - Math.min(idx, 20) * 0.5;
  // fuzzy subsequence
  let i = 0;
  for (const c of t) { if (c === q[i]) i++; if (i === q.length) break; }
  return i === q.length ? 18 : 0;
}

async function search(query) {
  const q = (query || '').trim();
  if (!q) return [];
  const index = await getIndex();
  const results = [];
  for (const e of index) {
    const s = Math.max(
      matchScore(q, e.nickname) * 3,
      matchScore(q, e.name) * 2,
      e.type === 'project' ? matchScore(q, e.projectTitle) * 2.5 : 0,
      e.type === 'link' ? matchScore(q, e.url) * 1.2 : 0,
    );
    if (s > 0) {
      const depth = e.rel ? e.rel.split('/').length : 0;
      results.push({ ...e, score: s - depth * 0.5 + (e.type === 'project' ? 5 : 0) });
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 60);
}

module.exports = { search };
