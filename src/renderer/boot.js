/* boot.js — startup animation control. The animation itself is pure CSS
   (folders packed into the K logo, wordmark, loading bar). This script only
   decides whether to show it and when to remove it. Click skips. */
'use strict';

(async function bootScreen() {
  const el = document.getElementById('bootScreen');
  if (!el) return;

  const kill = () => {
    if (el._dead) return;
    el._dead = true;
    el.classList.add('boot-out');
    setTimeout(() => el.remove(), 380);
  };

  if (window.krate.demo) { el.remove(); return; }
  try {
    const cfg = (await window.krate.getState()).config;
    if (cfg && cfg.animations === false) { el.remove(); return; }
  } catch { }

  el.addEventListener('click', kill);
  setTimeout(kill, 1750);
})();
