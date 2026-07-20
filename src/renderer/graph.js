/* graph.js — Obsidian-style force-directed graph on <canvas>.
   window.KGraph:
     setData({nodes, edges}, {onClick, onPin, pins}) / start() / stop() / bind()
     setLabelMode('on'|'dim'|'off') / getLabelMode() / unpinAll()
   Node: { id, label, type: 'project'|'tag'|'folder'|'file'|'link',
           color, r, g (gravity mult), nick, favorite, outline }
   Edge: { a, b, kind?: 'tree'|'related' }
   Right-click a node to pin it in place (red pin, persisted via onPin). */
'use strict';

(function () {
  const canvas = () => document.getElementById('graphCanvas');
  let ctx = null;
  let nodes = [], edges = [], byId = new Map();
  let running = false, raf = 0;
  let onClick = null;
  let onPin = null;
  let labelMode = localStorage.getItem('krate.graph.labels') || 'on';

  // camera
  let cam = { x: 0, y: 0, z: 1 };
  // interaction
  let dragNode = null, panning = false, moved = false;
  let last = { x: 0, y: 0 };
  let hover = null;
  let reach = null;          // Set of node ids highlighted for the hovered node
  let alpha = 1;             // simulation heat

  function setData(data, opts) {
    if (typeof opts === 'function') opts = { onClick: opts };
    opts = opts || {};
    onClick = opts.onClick || null;
    onPin = opts.onPin || null;
    const pins = opts.pins || {};

    nodes = data.nodes.map((n) => ({ vx: 0, vy: 0, x: 0, y: 0, pinned: false, ...n }));
    byId = new Map(nodes.map((n) => [n.id, n]));
    edges = data.edges.filter((e) => byId.has(e.a) && byId.has(e.b));

    // seed positions: ring per type for faster settling
    let i = 0;
    for (const n of nodes) {
      const ang = (i / nodes.length) * Math.PI * 2;
      const rad = n.type === 'project' ? 70 : n.type === 'tag' ? 200 : 150 + (i % 6) * 32;
      n.x = Math.cos(ang) * rad + (Math.random() - 0.5) * 30;
      n.y = Math.sin(ang) * rad + (Math.random() - 0.5) * 30;
      i++;
    }
    // restore pinned nodes exactly where the user left them
    for (const n of nodes) {
      const p = pins[n.id];
      if (p) { n.pinned = true; n.x = p[0]; n.y = p[1]; }
    }

    cam = { x: 0, y: 0, z: nodes.length > 400 ? 0.55 : nodes.length > 120 ? 0.75 : 1 };
    alpha = 1;
    hover = null;
    reach = null;
    adjCache = null;
    treeAdjCache = null;
  }

  function savePins() {
    if (!onPin) return;
    const map = {};
    for (const n of nodes) {
      if (n.pinned) map[n.id] = [Math.round(n.x), Math.round(n.y)];
    }
    onPin(map);
  }

  function resize() {
    const c = canvas();
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * dpr;
    c.height = rect.height * dpr;
    ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function toWorld(px, py) {
    const c = canvas().getBoundingClientRect();
    return {
      x: (px - c.width / 2) / cam.z + cam.x,
      y: (py - c.height / 2) / cam.z + cam.y,
    };
  }

  // ------------------------------------------------------------ physics --
  // Repulsion uses a spatial hash so graphs with 1000+ nodes stay smooth.
  const CELL = 100;

  function step() {
    const repulse = 1500, springLen = 62, springK = 0.06, damp = 0.86, gravity = 0.016;

    const grid = new Map();
    for (const n of nodes) {
      const key = ((n.x / CELL) | 0) + ':' + ((n.y / CELL) | 0);
      let cell = grid.get(key);
      if (!cell) { cell = []; grid.set(key, cell); }
      cell.push(n);
    }

    for (const n of nodes) {
      const cx = (n.x / CELL) | 0, cy = (n.y / CELL) | 0;
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          const cell = grid.get(gx + ':' + gy);
          if (!cell) continue;
          for (const b of cell) {
            if (b === n) continue;
            let dx = n.x - b.x, dy = n.y - b.y;
            let d2 = dx * dx + dy * dy;
            if (d2 < 1) { d2 = 1; dx = Math.random() - 0.5; dy = Math.random() - 0.5; }
            if (d2 > CELL * CELL * 2.6) continue;
            const f = repulse / d2 * alpha;
            const d = Math.sqrt(d2);
            n.vx += (dx / d) * f;
            n.vy += (dy / d) * f;
          }
        }
      }
    }

    for (const e of edges) {
      const a = byId.get(e.a), b = byId.get(e.b);
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const f = (d - springLen) * springK * alpha;
      const fx = (dx / d) * f, fy = (dy / d) * f;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    }

    for (const n of nodes) {
      if (n === dragNode || n.pinned) { n.vx = 0; n.vy = 0; continue; }
      const g = gravity * (n.g || 1) * alpha;
      n.vx -= n.x * g;
      n.vy -= n.y * g;
      n.vx *= damp; n.vy *= damp;
      n.x += n.vx; n.y += n.vy;
    }
    if (alpha > 0.03) alpha *= 0.995;
  }

  // ------------------------------------------------------------- render --
  function themeColors() {
    const cs = getComputedStyle(document.body);
    const text = cs.getPropertyValue('--text').trim() || '#17171c';
    const muted = cs.getPropertyValue('--muted').trim() || '#70706a';
    const accent = cs.getPropertyValue('--accent').trim() || '#15151a';
    const dark = document.body.dataset.theme !== 'light';
    return {
      text, muted, accent,
      edge: dark ? 'rgba(255,255,255,0.13)' : 'rgba(20,20,20,0.14)',
      edgeHover: accent,
      labelDim: dark ? 'rgba(240,240,240,0.6)' : 'rgba(20,20,20,0.55)',
      outline: dark ? 'rgba(255,255,255,0.45)' : 'rgba(20,20,20,0.4)',
      ring: dark ? '#e8b40f' : '#b8860b',
      pin: '#e5484d',
    };
  }

  function drawPin(n, th) {
    const r = n.r || 6;
    const px = n.x + r * 0.75, py = n.y - r * 0.75;
    ctx.strokeStyle = th.pin;
    ctx.lineWidth = 1.6 / cam.z;
    ctx.beginPath();
    ctx.moveTo(px + 4 / cam.z, py - 4 / cam.z);
    ctx.lineTo(px, py);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px + 5.5 / cam.z, py - 5.5 / cam.z, 3.4 / cam.z, 0, Math.PI * 2);
    ctx.fillStyle = th.pin;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px + 4.6 / cam.z, py - 6.4 / cam.z, 1 / cam.z, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fill();
  }

  function draw() {
    const c = canvas();
    if (!c || !ctx) return;
    const th = themeColors();
    const rect = c.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    ctx.save();
    ctx.translate(rect.width / 2, rect.height / 2);
    ctx.scale(cam.z, cam.z);
    ctx.translate(-cam.x, -cam.y);

    // edges
    for (const e of edges) {
      const a = byId.get(e.a), b = byId.get(e.b);
      const lit = reach && reach.has(a.id) && reach.has(b.id);
      ctx.lineWidth = ((e.kind === 'related' ? 2 : 1) + (lit ? 0.8 : 0)) / cam.z;
      ctx.strokeStyle = lit ? th.edgeHover : th.edge;
      ctx.globalAlpha = reach && !lit ? 0.25 : 1;
      ctx.setLineDash(e.kind === 'related' ? [5 / cam.z, 4 / cam.z] : []);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // nodes: flat fills; files always get an outline so white stays visible
    for (const n of nodes) {
      const r = n.r || 6;
      const isHover = n === hover;
      ctx.globalAlpha = reach && !reach.has(n.id) ? 0.2 : 1;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = n.color || th.accent;
      ctx.fill();
      if (isHover || n.type === 'project' || n.outline) {
        ctx.strokeStyle = isHover ? th.text : n.outline ? th.outline : th.edge;
        ctx.lineWidth = (isHover ? 2.2 : 1.1) / cam.z;
        ctx.stroke();
      }
      if (n.favorite || n.nick) {
        ctx.strokeStyle = th.ring;
        ctx.lineWidth = (n.favorite ? 1.8 : 1.2) / cam.z;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 3.2 / cam.z, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (n.pinned) drawPin(n, th);
    }

    // labels: project/tag/link always follow the old rules; folder and file
    // labels obey the label mode button (on / transparent / off)
    const smallType = (n) => n.type === 'folder' || n.type === 'file';
    const showAll = cam.z > 0.9 || nodes.length < 60;
    ctx.textAlign = 'center';
    ctx.font = `600 ${11 / cam.z}px "Segoe UI"`;
    for (const n of nodes) {
      const isHover = n === hover;
      if (!isHover) {
        if (smallType(n)) {
          if (labelMode === 'off') continue;
          if (!showAll) continue;
        } else if (!showAll && n.type === 'link') continue;
        if (reach && !reach.has(n.id)) continue;
      }
      let a = 1;
      if (smallType(n) && labelMode === 'dim' && !isHover) a = 0.3;
      ctx.globalAlpha = a;
      ctx.fillStyle = isHover ? th.text : th.labelDim;
      ctx.fillText(n.label, n.x, n.y + (n.r || 6) + 13 / cam.z);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // ------------------------------------------------- adjacency + reach ----
  let adjCache = null;
  let treeAdjCache = null;

  function buildAdj() {
    adjCache = new Map();
    treeAdjCache = new Map();
    const add = (m, a, b) => {
      if (!m.has(a)) m.set(a, new Set());
      m.get(a).add(b);
    };
    for (const e of edges) {
      add(adjCache, e.a, e.b);
      add(adjCache, e.b, e.a);
      if (e.kind === 'tree') {
        add(treeAdjCache, e.a, e.b);
        add(treeAdjCache, e.b, e.a);
      }
    }
  }

  // The highlighted set for a hovered node: the whole tree branch it belongs
  // to (ancestors and descendants, unlimited depth) plus direct neighbors of
  // any other edge kind. This makes long folder chains traceable end to end.
  function computeReach(n) {
    if (!adjCache) buildAdj();
    const set = new Set([n.id]);
    const queue = [n.id];
    while (queue.length) {
      const id = queue.pop();
      const t = treeAdjCache.get(id);
      if (!t) continue;
      for (const next of t) {
        if (!set.has(next)) { set.add(next); queue.push(next); }
      }
    }
    const direct = adjCache.get(n.id);
    if (direct) for (const d of direct) set.add(d);
    return set;
  }

  function loop() {
    if (!running) return;
    step();
    draw();
    raf = requestAnimationFrame(loop);
  }

  function start() {
    resize();
    adjCache = null;
    treeAdjCache = null;
    running = true;
    alpha = Math.max(alpha, 0.6);
    cancelAnimationFrame(raf);
    loop();
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  // -------------------------------------------------------- interaction --
  function hitTest(wx, wy) {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const r = (n.r || 6) + 4;
      if ((n.x - wx) ** 2 + (n.y - wy) ** 2 < r * r) return n;
    }
    return null;
  }

  function bind() {
    const c = canvas();
    if (!c || c._kgBound) return;
    c._kgBound = true;

    c.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const rect = c.getBoundingClientRect();
      const w = toWorld(e.clientX - rect.left, e.clientY - rect.top);
      dragNode = hitTest(w.x, w.y);
      panning = !dragNode;
      moved = false;
      last = { x: e.clientX, y: e.clientY };
      c.classList.add('grabbing');
      alpha = Math.max(alpha, 0.25);
    });

    // right-click pins the node (or the one being dragged) exactly in place
    c.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      const w = toWorld(e.clientX - rect.left, e.clientY - rect.top);
      const n = dragNode || hitTest(w.x, w.y);
      if (!n) return;
      n.pinned = !n.pinned;
      if (n.pinned) { n.vx = 0; n.vy = 0; }
      savePins();
    });

    window.addEventListener('mousemove', (e) => {
      const rect = c.getBoundingClientRect();
      if (dragNode) {
        const w = toWorld(e.clientX - rect.left, e.clientY - rect.top);
        dragNode.x = w.x; dragNode.y = w.y;
        moved = true;
        alpha = Math.max(alpha, 0.3);
      } else if (panning) {
        cam.x -= (e.clientX - last.x) / cam.z;
        cam.y -= (e.clientY - last.y) / cam.z;
        last = { x: e.clientX, y: e.clientY };
        moved = true;
      } else if (running) {
        const w = toWorld(e.clientX - rect.left, e.clientY - rect.top);
        const h = hitTest(w.x, w.y);
        if (h !== hover) {
          hover = h;
          reach = h ? computeReach(h) : null;
        }
        c.style.cursor = hover ? 'pointer' : 'grab';
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button !== 0) return;
      if (dragNode) {
        if (!moved && onClick) onClick(dragNode);
        else if (dragNode.pinned) savePins(); // pinned node moved: remember the new spot
      }
      dragNode = null;
      panning = false;
      c.classList.remove('grabbing');
    });

    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      cam.z = Math.min(3.5, Math.max(0.2, cam.z * f));
    }, { passive: false });

    window.addEventListener('resize', () => { if (running) resize(); });
  }

  window.KGraph = {
    setData, start, stop, bind,
    setLabelMode(m) {
      labelMode = ['on', 'dim', 'off'].includes(m) ? m : 'on';
      localStorage.setItem('krate.graph.labels', labelMode);
    },
    getLabelMode() { return labelMode; },
    unpinAll() {
      for (const n of nodes) n.pinned = false;
      savePins();
      alpha = Math.max(alpha, 0.5);
    },
  };
})();
