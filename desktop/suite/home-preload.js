/* home-preload.js — API «shHome» para el inicio y el asa de la plataforma SampledHead. */
'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const subs = {};
for (const ch of ['state', 'progress', 'update', 'curtain']) ipcRenderer.on(ch, (e, d) => (subs[ch] || []).forEach(f => { try { f(d); } catch (x) {} }));
const inv = (ch, ...a) => ipcRenderer.invoke('home:' + ch, ...a);
contextBridge.exposeInMainWorld('shHome', {
  state: () => inv('state'), open: id => inv('open', id), home: () => inv('home'), close: id => inv('close', id),
  choose: (apps, plugins) => inv('choose', apps, plugins), plugin: id => inv('plugin', id), importData: ids => inv('import', ids), importFiles: files => inv('importFiles', files), skipImport: () => inv('skipImport'),
  folder: () => inv('folder'), pluginFolder: () => inv('pluginFolder'), updates: () => inv('updates'), report: () => inv('report'), web: id => inv('web', id),
  mpcList: () => inv('mpcList'), mpc: (file, base, toCard) => inv('mpc', file, base, toCard),
  on: (ch, f) => { (subs[ch] = subs[ch] || []).push(f); }
});
