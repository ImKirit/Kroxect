const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('krate', {
  getState: invoke('state:get'),
  saveConfig: invoke('config:save'),
  pickFolder: invoke('dialog:pickFolder'),

  createProject: invoke('project:create'),
  loadProject: invoke('project:load'),
  saveMeta: invoke('project:saveMeta'),
  setCover: invoke('project:setCover'),
  addFiles: invoke('project:addFiles'),
  importPaths: invoke('project:importPaths'),
  newFolder: invoke('project:newFolder'),
  deleteProject: invoke('project:delete'),
  unregisterProject: invoke('project:unregister'),
  saveTemplateFromProject: invoke('template:saveFromProject'),
  tplImportFiles: invoke('template:importFiles'),
  tplDeleteFiles: invoke('template:deleteFiles'),

  open: invoke('fs:open'),
  reveal: invoke('fs:reveal'),
  openExternal: invoke('fs:openExternal'),
  aiOpen: invoke('ai:open'),
  aiAsk: invoke('ai:ask'),
  aiContext: invoke('ai:context'),
  aiTest: invoke('ai:test'),
  adoptExisting: invoke('projects:adoptExisting'),
  username: process.env.USERNAME || process.env.USER || 'user',
  trashList: invoke('trash:list'),
  trashRestore: invoke('trash:restore'),
  trashPurge: invoke('trash:purge'),
  exportZip: invoke('project:exportZip'),
  statsGet: invoke('stats:get'),
  dupesFind: invoke('dupes:find'),
  updateStatus: invoke('update:status'),
  updateInstall: invoke('update:install'),

  search: invoke('search:query'),
  browse: invoke('overlay:browse'),
  hideOverlay: invoke('overlay:hide'),
  openInMain: invoke('overlay:openInMain'),

  startDrag: (absPath) => ipcRenderer.send('start-drag', absPath),
  pathForFile: (file) => webUtils.getPathForFile(file),

  on: (channel, cb) => {
    const allowed = ['overlay-shown', 'overlay-blur', 'goto-project', 'ai-activity', 'watch-file', 'update-ready'];
    if (allowed.includes(channel)) ipcRenderer.on(channel, (e, ...args) => cb(...args));
  },
});
