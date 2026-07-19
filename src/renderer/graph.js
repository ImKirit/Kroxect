/* graph.js — Obsidian-style force-directed graph on <canvas>.
   window.KGraph: setData({nodes, edges}, onClick) / start() / stop().
   Node: { id, label, type: 'project'|'tag'|'folder'|'file'|'link',
           color, r, meta? }  Edge: { a, b } (node ids) */
'use strict';

(function () {
  const canvas = () => document.getElementById('graphCanvas');
  let ctx = null;
  let nodes = [], edges = [], byId = new Map();
  let running = false, raf = 0;
  let onClick = null;

  // camera
  let cam = { x: 0, y: 0, z: 1 };
  // interaction
  let dragNode = null, panning = false, moved = false;
  let last = { x: 0, y: 0 };
  let hover = null;
  let alpha = 1; // simulation heat

  function setData(data, clickCb) {
    nodes = data.nodes.map((n) => ({
      vx: 0, vy: 0,
      x: (Math.random() - 0.5) * 60,
      y: (Math.random() - 0.5) * 60,
      ...n,
    }));
    byId = new Map(nodes.map((n) => [n.id, n]));
    edges = data.edges.filter((e) => byId.has(e.a) && byId.has(e.b));
    // seed positions: ring per type for faster settling
    let i = 0;
    for (const n of nodes) {
      const ang = (i / nodes.length) * Math.PI * 2;
      const rad = n.type === 'project' ? 60 : n.type === 'tag' ? 180 : 140 + (i % 5) * 30;
      n.x = Math.cos(ang) * rad + (Math.random() - 0.5) * 30;
      n.y = Math.sin(ang) * rad + (Math.random() - 0.5) * 30;
      i++;
    }
    cam = { x: 0, y: 0, z: nodes.length > 120 ? 0.75 : 1 };
    alpha = 1;
    onClick = clickCb;
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
  function step() {
    const repulse = 1600, springLen = 70, springK = 0.06, damp = 0.86, gravity = 0.012;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { d2 = 1; dx = Math.random() - 0.5; dy = Math.random() - 0.5; }
        if (d2 > 90000) continue;
        const f = repulse / d2 * alpha;
        const d = Math.sqrt(d2);
        dx /= d; dy /= d;
        a.vx += dx * f; a.vy += dy * f;
        b.vx -= dx * f; b.vy -= dy * f;
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
      if (n === dragNode) { n.vx = 0; n.vy = 0; continue; }
      n.vx -= n.x * gravity * alpha;
      n.vy -= n.y * gravity * alpha;
      n.vx *= damp; n.vy *= damp;
      n.x += n.vx; n.y += n.vy;
    }
    if (alpha > 0.03) alpha *= 0.995;
  }

  // ------------------------------------------------------------- render --
  function draw() {
    const c = canvas();
    if (!c || !ctx) return;
    const rect = c.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    ctx.save();
    ctx.translate(rect.width / 2, rect.height / 2);
    ctx.scale(cam.z, cam.z);
    ctx.translate(-cam.x, -cam.y);

    // edges
    ctx.lineWidth = 1 / cam.z;
    for (const e of edges) {
      const a = byId.get(e.a), b = byId.get(e.b);
      const hovered = hover && (a === hover || b === hover);
      ctx.strokeStyle = hovered ? 'rgba(168,85,247,0.55)' : 'rgba(255,255,255,0.10)';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // nodes
    for (const n of nodes) {
      const r = n.r || 6;
      const isHover = n === hover;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = n.color || '#a855f7';
      ctx.shadowColor = n.color || '#a855f7';
      ctx.shadowBlur = isHover ? 22 : n.type === 'project' ? 12 : 5;
      ctx.globalAlpha = hover && !isHover && !connected(n, hover) ? 0.25 : 1;
      ctx.fill();
      ctx.shadowBlur = 0;
      if (n.favorite) {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1.6 / cam.z;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 3 / cam.z, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // labels
    const showAll = cam.z > 0.9 || nodes.length < 60;
    ctx.textAlign = 'center';
    ctx.font = `${11 / cam.z}px "Segoe UI"`;
    for (const n of nodes) {
      const isHover = n === hover;
      if (!showAll && !isHover && n.type !== 'project' && n.type !== 'tag') continue;
      if (hover && !isHover && !connected(n, hover)) continue;
      ctx.fillStyle = isHover ? '#eae7f4' : 'rgba(234,231,244,0.62)';
      ctx.fillText(n.label, n.x, n.y + (n.r || 6) + 13 / cam.z);
    }
    ctx.restore();
  }

  const adj = () => {
    const m = new Map();
    for (const e of edges) {
      if (!m.has(e.a)) m.set(e.a, new Set());
      if (!m.has(e.b)) m.set(e.b, new Set());
      m.get(e.a).add(e.b);
      m.get(e.b).add(e.a);
    }
    return m;
  };
  let adjCache = null;
  function connected(a, b) {
    if (!adjCache) adjCache = adj();
    const s = adjCache.get(a.id);
    return s && s.has(b.id);
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
      const rect = c.getBoundingClientRect();
      const w = toWorld(e.clientX - rect.left, e.clientY - rect.top);
      dragNode = hitTest(w.x, w.y);
      panning = !dragNode;
      moved = false;
      last = { x: e.clientX, y: e.clientY };
      c.classList.add('grabbing');
      alpha = Math.max(alpha, 0.25);
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
        hover = hitTest(w.x, w.y);
        c.style.cursor = hover ? 'pointer' : 'grab';
      }
    });

    window.addEventListener('mouseup', () => {
      if (dragNode && !moved && onClick) onClick(dragNode);
      dragNode = null;
      panning = false;
      c.classList.remove('grabbing');
    });

    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      cam.z = Math.min(3.5, Math.max(0.25, cam.z * f));
    }, { passive: false });

    window.addEventListener('resize', () => { if (running) resize(); });
  }

  window.KGraph = { setData, start, stop, bind };
})();
