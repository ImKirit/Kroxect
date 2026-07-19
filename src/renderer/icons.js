/* icons.js — Krate's hand-drawn SVG icon set (stroke-based, currentColor).
   Usage: KI.get('gear') or KI.get('star', 'extra-class') → svg string. */
'use strict';

(function () {
  const S = (body, vb = '0 0 24 24') =>
    `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

  const icons = {
    // ---- chrome ----
    gear: S('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.4M12 18.8v2.4M4.2 12H1.8M22.2 12h-2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7"/>'),
    plus: S('<path d="M12 5v14M5 12h14"/>'),
    search: S('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/>'),
    arrowLeft: S('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
    x: S('<path d="M6 6l12 12M18 6L6 18"/>'),
    chevron: S('<path d="M9 6l6 6-6 6"/>'),
    check: S('<path d="M5 13l4 4L19 7"/>'),
    dots: S('<circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/>'),

    // ---- objects ----
    folder: S('<path d="M3.5 6.5c0-1.1.9-2 2-2h4l2 2.5h7c1.1 0 2 .9 2 2v9c0 1.1-.9 2-2 2h-13c-1.1 0-2-.9-2-2v-11.5z"/>'),
    folderOpen: S('<path d="M3.5 9V6.5c0-1.1.9-2 2-2h4l2 2.5h7c1.1 0 2 .9 2 2V10"/><path d="M4.8 10.5h15.4c.9 0 1.5.9 1.2 1.7l-2 6.3c-.3.9-1.1 1.5-2 1.5H5.5c-1.1 0-2-.9-2-2v-6c0-.8.6-1.5 1.3-1.5z"/>'),
    file: S('<path d="M6 3.5h8l4 4v13a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 20.5v-15A1.5 1.5 0 0 1 6.5 3.5z"/><path d="M14 3.5V8h4.5"/>'),
    box: S('<path d="M3.5 8L12 3.5 20.5 8v8L12 20.5 3.5 16z"/><path d="M3.5 8L12 12.5 20.5 8M12 12.5v8"/>'),
    star: S('<path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L3.5 9.7l5.9-.9z"/>'),
    starFill: S('<path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L3.5 9.7l5.9-.9z" fill="currentColor"/>'),
    tag: S('<path d="M3.5 11V5c0-.8.7-1.5 1.5-1.5h6l9.5 9.5c.6.6.6 1.5 0 2.1l-5.4 5.4c-.6.6-1.5.6-2.1 0z"/><circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none"/>'),
    pencil: S('<path d="M4 20l.9-3.8L16.2 4.9a1.8 1.8 0 0 1 2.6 0l.3.3a1.8 1.8 0 0 1 0 2.6L7.8 19.1z"/><path d="M14.5 6.5l3 3"/>'),
    trash: S('<path d="M4.5 6.5h15M9.5 6V4.5c0-.6.4-1 1-1h3c.6 0 1 .4 1 1V6"/><path d="M6.5 6.5l1 13c0 .8.7 1.5 1.5 1.5h6c.8 0 1.5-.7 1.5-1.5l1-13"/><path d="M10 10.5v6M14 10.5v6"/>'),
    note: S('<path d="M5 4.5h14v12l-3 3H5z"/><path d="M16 19.5v-3h3M8.5 9h7M8.5 12.5h5"/>'),
    layout: S('<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 9.5h17M9.5 9.5V20"/>'),
    link: S('<path d="M10 14a4.2 4.2 0 0 0 6 0l3-3a4.24 4.24 0 0 0-6-6l-1.5 1.5"/><path d="M14 10a4.2 4.2 0 0 0-6 0l-3 3a4.24 4.24 0 0 0 6 6l1.5-1.5"/>'),
    graph: S('<circle cx="6" cy="6" r="2.4"/><circle cx="18" cy="8" r="2.4"/><circle cx="9" cy="18" r="2.4"/><path d="M8.2 7.1l7.4.7M7 8.2l1.4 7.5M16.3 9.8l-5.6 6.6"/>'),
    bot: S('<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 8V4.5M12 4.5a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6z"/><circle cx="9.5" cy="13" r="1.2" fill="currentColor" stroke="none"/><circle cx="14.5" cy="13" r="1.2" fill="currentColor" stroke="none"/><path d="M9.5 16.3c1.6 1 3.4 1 5 0"/>'),
    explorer: S('<path d="M3.5 6.5c0-1.1.9-2 2-2h4l2 2.5h7c1.1 0 2 .9 2 2v9c0 1.1-.9 2-2 2h-13c-1.1 0-2-.9-2-2v-11.5z"/><path d="M10.5 14.5h6M14 12l2.5 2.5L14 17"/>'),
    play: S('<path d="M8 5.5v13l10-6.5z" fill="currentColor" stroke="none"/>'),
    upload: S('<path d="M12 16V5M7.5 9.5L12 5l4.5 4.5"/><path d="M4.5 19.5h15"/>'),
    download: S('<path d="M12 5v11M7.5 11.5L12 16l4.5-4.5"/><path d="M4.5 19.5h15"/>'),
    home: S('<path d="M4.5 10.5L12 4l7.5 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-4v-5.5h-4v5.5H6A1.5 1.5 0 0 1 4.5 19z"/>'),
    chart: S('<path d="M4 20V10M9.5 20V4M15 20v-7M20.5 20V7"/>'),
    send: S('<path d="M4 12l16-7-4.5 14-3.5-5.5L4 12z"/><path d="M12 13.5L20 5"/>'),
    sparkle: S('<path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8z"/><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>'),
    restore: S('<path d="M4.5 9a8 8 0 1 1-.4 5"/><path d="M4.5 4.5V9H9"/>'),
    eye: S('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
    copy: S('<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5v-3a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>'),
    zip: S('<path d="M6 3.5h8l4 4v13a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 20.5v-15A1.5 1.5 0 0 1 6.5 3.5z"/><path d="M10 3.5v2h2v2h-2v2h2v2h-2"/>'),

    // ---- file types (filled accents) ----
    fImage: S('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M3.5 17l5-4.5 4 3.5 3.5-3 4.5 4"/>'),
    fVideo: S('<rect x="3.5" y="5.5" width="13" height="13" rx="2"/><path d="M16.5 10l4-2.5v9l-4-2.5"/><path d="M8.5 9.5v5l4-2.5z" fill="currentColor" stroke="none"/>'),
    fAudio: S('<path d="M4 14v-4M8 17V7M12 19V5M16 16V8M20 14v-4"/>'),
    fArchive: S('<rect x="3.5" y="4" width="17" height="5" rx="1.5"/><path d="M5 9v9.5c0 .8.7 1.5 1.5 1.5h11c.8 0 1.5-.7 1.5-1.5V9M10 13h4"/>'),
    fCode: S('<path d="M8.5 7.5L4 12l4.5 4.5M15.5 7.5L20 12l-4.5 4.5M13 5l-2.5 14"/>'),
    fDoc: S('<path d="M6 3.5h8l4 4v13a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 20.5v-15A1.5 1.5 0 0 1 6.5 3.5z"/><path d="M8.5 12h7M8.5 15.5h7M8.5 8.5h3"/>'),
    fProj: S('<rect x="3.5" y="6" width="17" height="14" rx="2"/><path d="M3.5 10h17M7.5 6l2 4M12.5 6l2 4M17.5 6l2 4"/><path d="M10.5 13.5v4l3.5-2z" fill="currentColor" stroke="none"/>'),

    // ---- link providers ----
    drive: S('<path d="M9 4h6l6 10.5-3 5H6l-3-5z"/><path d="M9 4L3 14.5M15 4l-5.8 10.2M21 14.5H9.2"/>'),
    dropbox: S('<path d="M7 3.5L2.5 6.8 7 10l5-3.2zM17 3.5l4.5 3.3L17 10l-5-3.2zM7 10l5 3.2L17 10l4.5 3.2L17 16.5l-5-3.2-5 3.2-4.5-3.3zM7.5 18l4.5 2.9 4.5-2.9"/>'),
    onedrive: S('<path d="M7 17.5a3.8 3.8 0 0 1-.4-7.6 5.2 5.2 0 0 1 10-1.3 4.4 4.4 0 0 1-.4 8.9z"/>'),
    github: S('<path d="M12 3a9 9 0 0 0-2.85 17.55c.45.08.62-.2.62-.44v-1.68c-2.5.55-3.03-1.08-3.03-1.08-.41-1.04-1-1.32-1-1.32-.82-.56.06-.55.06-.55.9.06 1.38.93 1.38.93.8 1.38 2.11.98 2.63.75.08-.58.31-.98.57-1.2-2-.23-4.1-1-4.1-4.45 0-.98.35-1.79.93-2.42-.1-.23-.4-1.15.08-2.4 0 0 .76-.24 2.48.92a8.6 8.6 0 0 1 4.52 0c1.72-1.16 2.47-.92 2.47-.92.49 1.25.19 2.17.1 2.4.58.63.92 1.44.92 2.42 0 3.47-2.1 4.22-4.11 4.44.32.28.61.83.61 1.67v2.48c0 .24.16.53.62.44A9 9 0 0 0 12 3z"/>'),
    globe: S('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.3 3.8 5.2 3.8 8.5s-1.3 6.2-3.8 8.5c-2.5-2.3-3.8-5.2-3.8-8.5s1.3-6.2 3.8-8.5z"/>'),
  };

  window.KI = {
    get(name, cls = '') {
      const svg = icons[name] || icons.file;
      return `<span class="ki ${cls}">${svg}</span>`;
    },
    forFile(name) {
      const ext = (name.split('.').pop() || '').toLowerCase();
      if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'psd', 'ico'].includes(ext)) return this.get('fImage', 'ft-image');
      if (['mp4', 'mov', 'mkv', 'avi', 'webm'].includes(ext)) return this.get('fVideo', 'ft-video');
      if (['mp3', 'wav', 'flac', 'ogg', 'm4a'].includes(ext)) return this.get('fAudio', 'ft-audio');
      if (['prproj', 'aep', 'veg', 'drp'].includes(ext)) return this.get('fProj', 'ft-proj');
      if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return this.get('fArchive', 'ft-archive');
      if (['js', 'ts', 'py', 'java', 'json', 'html', 'css', 'c', 'cpp', 'cs', 'sh', 'glsl'].includes(ext)) return this.get('fCode', 'ft-code');
      if (['txt', 'md', 'doc', 'docx', 'pdf', 'pptx', 'xlsx'].includes(ext)) return this.get('fDoc', 'ft-doc');
      return this.get('file', 'ft-file');
    },
    forUrl(url) {
      const u = (url || '').toLowerCase();
      if (u.includes('drive.google') || u.includes('docs.google')) return this.get('drive', 'lp-drive');
      if (u.includes('dropbox')) return this.get('dropbox', 'lp-dropbox');
      if (u.includes('onedrive') || u.includes('1drv.ms') || u.includes('sharepoint')) return this.get('onedrive', 'lp-onedrive');
      if (u.includes('github')) return this.get('github', 'lp-github');
      return this.get('globe', 'lp-globe');
    },
  };
})();
