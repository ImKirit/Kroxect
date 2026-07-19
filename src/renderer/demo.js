/* demo.js — mock API when the UI runs outside Electron (screenshots, web demo).
   In the real app the preload script defines window.krate first, so this is a no-op. */
'use strict';

if (!window.krate) {
  const now = Date.now();
  const iso = (minAgo) => new Date(now - minAgo * 60000).toISOString();

  const config = {
    projectsRoot: 'D:\\Projects',
    externalProjects: [],
    hotkey: 'Control+Alt+K',
    animations: true,
    theme: 'light',
    accentColor: null,
    lang: 'en',
    thumbnails: false,
    watchEnabled: false,
    watchPath: null,
    dupFinder: true,
    aiMode: 'api',
    aiProvider: 'claude',
    aiApi: { provider: 'anthropic', apiKey: 'demo', model: '', baseUrl: '' },
    tags: [
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
    ],
    templates: [
      { name: 'Video Edit', dirs: ['Footage/Raw', 'Footage/Selected', 'Audio/Music', 'Audio/SFX', 'Assets/Overlays', 'Project Files', 'Exports'] },
      { name: 'App / Code', dirs: ['src', 'assets', 'docs', 'builds'] },
      { name: 'Empty', dirs: [] },
    ],
  };

  const F = (name, rel, size) => ({ name, rel, dir: false, size });
  const D = (name, rel, children = []) => ({ name, rel, dir: true, children });

  const projects = [
    {
      path: 'D:\\Projects\\Neon Skies AMV',
      meta: {
        id: '1', title: 'Neon Skies AMV', description: 'Anime edit for the summer collab.\n\nDeadline: end of month. Style: fast flow + glow transitions, 24 fps interpolated to 60.',
        tags: ['Edit', 'Video'], status: 'active', cover: null, color: '#a855f7', favorite: true,
        links: [
          { id: 'l1', title: 'Footage on Drive', url: 'https://drive.google.com/drive/folders/abc123' },
          { id: 'l2', title: 'Collab GitHub repo', url: 'https://github.com/imkirit/neon-skies' },
        ],
        notes: [
          { id: 'n1', text: 'Beat drop at 0:42 — sync the katana slash there', date: iso(90) },
          { id: 'n2', text: 'Rendered v2 preview, colors too crushed. Lift shadows next pass.', date: iso(1500) },
        ],
        nicknames: { 'Footage/Selected/fight_scene_4k.mp4': 'main clip', 'Audio/Music/track_final.wav': 'the track', 'Exports/preview_v2.mp4': 'latest render' },
        created: iso(14000), modified: iso(90),
      },
      tree: [
        D('Assets', 'Assets', [D('Overlays', 'Assets/Overlays', [F('glow_pack.zip', 'Assets/Overlays/glow_pack.zip', 92274688)])]),
        D('Audio', 'Audio', [
          D('Music', 'Audio/Music', [F('track_final.wav', 'Audio/Music/track_final.wav', 52428800)]),
          D('SFX', 'Audio/SFX', [F('riser_01.wav', 'Audio/SFX/riser_01.wav', 2097152), F('whoosh_heavy.wav', 'Audio/SFX/whoosh_heavy.wav', 1048576)]),
        ]),
        D('Exports', 'Exports', [F('preview_v2.mp4', 'Exports/preview_v2.mp4', 209715200)]),
        D('Footage', 'Footage', [
          D('Raw', 'Footage/Raw', [F('ep12_full.mkv', 'Footage/Raw/ep12_full.mkv', 1073741824)]),
          D('Selected', 'Footage/Selected', [F('fight_scene_4k.mp4', 'Footage/Selected/fight_scene_4k.mp4', 524288000)]),
        ]),
        D('Project Files', 'Project Files', [F('neon_skies.prproj', 'Project Files/neon_skies.prproj', 15728640)]),
      ],
    },
    {
      path: 'D:\\Projects\\KiritSMP Trailer',
      meta: {
        id: '2', title: 'KiritSMP Trailer', description: 'Cinematic server trailer, 60s cut.',
        tags: ['Video', 'Game'], status: 'paused', cover: null, color: '#ef4444',
        notes: [{ id: 'n3', text: 'Need shots of the new spawn build', date: iso(4000) }],
        nicknames: {}, created: iso(30000), modified: iso(2800),
      },
      tree: [D('Recordings', 'Recordings', []), D('Exports', 'Exports', [])],
    },
    {
      path: 'D:\\Projects\\Portfolio v3',
      meta: {
        id: '3', title: 'Portfolio v3', description: 'New portfolio — Astro + custom shader background.',
        tags: ['Web', 'Design'], status: 'active', cover: null, color: '#38bdf8', favorite: true,
        links: [{ id: 'l3', title: 'Inspiration board', url: 'https://www.dropbox.com/sh/portfolio-refs' }],
        notes: [], nicknames: { 'src/shader/bg.glsl': 'the shader' }, created: iso(20000), modified: iso(600),
      },
      tree: [D('src', 'src', [D('shader', 'src/shader', [F('bg.glsl', 'src/shader/bg.glsl', 4096)])]), D('assets', 'assets', [])],
    },
    {
      path: 'D:\\Projects\\Chaos Mod',
      meta: {
        id: '4', title: 'Chaos Mod', description: '2-player chaos mod: life link, death swap, shared XP.',
        tags: ['Game', 'App'], status: 'done', cover: null, color: '#10b981',
        notes: [], nicknames: {}, created: iso(60000), modified: iso(10000),
      },
      tree: [D('src', 'src', []), D('builds', 'builds', [F('chaosmod-1.0.jar', 'builds/chaosmod-1.0.jar', 3145728)])],
    },
    {
      path: 'D:\\Projects\\Beat Pack 01',
      meta: {
        id: '5', title: 'Beat Pack 01', description: 'First sample pack — 12 loops, 140 BPM.',
        tags: ['Music'], status: 'idea', cover: null, color: '#8b5cf6',
        notes: [], nicknames: {}, created: iso(3000), modified: iso(3000),
      },
      tree: [D('Loops', 'Loops', []), D('Stems', 'Stems', [])],
    },
    {
      path: 'D:\\Projects\\History Presentation',
      meta: {
        id: '6', title: 'History Presentation', description: 'Weimar Republic — 15 slides + notes.',
        tags: ['School'], status: 'done', cover: null, color: '#f59e0b',
        notes: [], nicknames: {}, created: iso(50000), modified: iso(40000),
      },
      tree: [F('slides_final.pptx', 'slides_final.pptx', 8388608)],
    },
  ];

  for (const p of projects) {
    p.meta.favorite = !!p.meta.favorite;
    p.meta.links = p.meta.links || [];
    p.meta.related = p.meta.related || [];
  }
  projects[0].meta.related = ['5']; // Neon Skies uses sounds from Beat Pack 01

  const flat = [];
  for (const p of projects) {
    const tagColor = (config.tags.find((t) => p.meta.tags.includes(t.name)) || { color: '#a855f7' }).color;
    flat.push({ type: 'project', projectPath: p.path, projectTitle: p.meta.title, tagColor, rel: '', abs: p.path, name: p.meta.title, nickname: null, dir: true });
    for (const l of p.meta.links) {
      flat.push({ type: 'link', projectPath: p.path, projectTitle: p.meta.title, tagColor, rel: '', abs: l.url, url: l.url, name: l.title, nickname: null, dir: false });
    }
    const walk = (nodes) => {
      for (const n of nodes) {
        flat.push({
          type: n.dir ? 'folder' : 'file', projectPath: p.path, projectTitle: p.meta.title, tagColor,
          rel: n.rel, abs: p.path + '\\' + n.rel.split('/').join('\\'), name: n.name,
          nickname: p.meta.nicknames[n.rel] || null, dir: !!n.dir,
        });
        if (n.children) walk(n.children);
      }
    };
    walk(p.tree);
  }

  const find = (path) => projects.find((p) => p.path === path);

  window.krate = {
    getState: async () => ({ config, projects: projects.map((p) => ({ path: p.path, meta: p.meta })), version: 'demo' }),
    saveConfig: async (partial) => { Object.assign(config, partial); return { config, hotkey: { ok: true } }; },
    pickFolder: async () => null,
    createProject: async () => { throw new Error('Demo mode — download Krate to create real projects.'); },
    loadProject: async (path) => ({ meta: find(path).meta, tree: find(path).tree }),
    saveMeta: async ({ path, meta }) => { const p = find(path); p.meta = { ...meta, modified: new Date().toISOString() }; return p.meta; },
    setCover: async () => null,
    addFiles: async () => 0,
    importPaths: async () => 0,
    newFolder: async () => { },
    deleteProject: async () => false,
    unregisterProject: async () => true,
    saveTemplateFromProject: async () => config.templates,
    tplImportFiles: async () => [],
    tplDeleteFiles: async () => { },
    open: async () => { }, reveal: async () => { },
    search: async (q) => {
      const s = (t) => {
        if (!t) return 0;
        t = t.toLowerCase(); const qq = q.toLowerCase();
        if (t === qq) return 100; if (t.startsWith(qq)) return 70;
        return t.includes(qq) ? 50 : 0;
      };
      return flat
        .map((e) => ({ ...e, score: Math.max(s(e.nickname) * 3, s(e.name) * 2) }))
        .filter((e) => e.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 60);
    },
    browse: async ({ projectPath, rel }) => {
      let nodes = find(projectPath).tree;
      if (rel) for (const part of rel.split('/')) nodes = nodes.find((n) => n.name === part).children;
      return nodes.map((n) => ({
        name: n.name, rel: n.rel, abs: projectPath + '\\' + n.rel.split('/').join('\\'),
        dir: !!n.dir, nickname: find(projectPath).meta.nicknames[n.rel] || null,
      }));
    },
    hideOverlay: async () => { }, openInMain: async () => { },
    startDrag: () => { }, pathForFile: () => '',
    openExternal: async () => { },
    aiOpen: async () => ({ copied: true }),
    aiAsk: async ({ history }) => {
      await new Promise((r) => setTimeout(r, 400));
      const q = history[history.length - 1]?.content || '';
      return { text: `Demo mode: the built-in agent would now search your library to answer "${q.slice(0, 60)}". Install Krate and add an API key in Settings to use it for real.` };
    },
    aiContext: async () => 'demo context',
    trashList: async () => [
      { id: 'demo1', title: 'Old Intro Sequence', origin: 'D:\\Projects\\Old Intro Sequence', deletedAt: iso(4000) },
    ],
    trashRestore: async () => 'D:\\Projects\\Old Intro Sequence',
    trashPurge: async () => true,
    exportZip: async () => null,
    statsGet: async () => ({
      count: 6, favorites: 2, totalBytes: 2147483648 + 734003200, totalFiles: 18,
      byStatus: { active: 2, paused: 1, done: 2, idea: 1 },
      byTag: { Video: 2, Edit: 1, Game: 2, Web: 1, Design: 1, App: 1, Music: 1, School: 1 },
      biggest: [
        { title: 'Neon Skies AMV', path: 'D:\\Projects\\Neon Skies AMV', bytes: 1932735283, files: 8, modified: iso(90) },
        { title: 'KiritSMP Trailer', path: 'D:\\Projects\\KiritSMP Trailer', bytes: 536870912, files: 2, modified: iso(2800) },
        { title: 'Chaos Mod', path: 'D:\\Projects\\Chaos Mod', bytes: 314572800, files: 4, modified: iso(10000) },
      ],
    }),
    dupesFind: async () => [],
    on: () => { },
  };
}
