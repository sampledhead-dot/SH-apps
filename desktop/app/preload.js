/* preload.js — da a la página la API «shDesktop» que usa sh-core.js (carpeta compartida, abrir apps, modelos y
 * motor local). Solo expone funciones concretas; la página no tiene acceso libre a los archivos. */
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const prog = new Map();     // id de petición → función de progreso
ipcRenderer.on('sh:progress', (e, id, p) => { const f = prog.get(id); if (f) try { f(p); } catch (x) {} });
const arrive = new Map();   // buzón → [funciones]
ipcRenderer.on('sh:arrive', (e, me) => (arrive.get(me) || []).forEach(f => { try { f(); } catch (x) {} }));
let n = 0;
function withProg(fn, cb) {
  const id = 'p' + (++n) + '-' + Date.now();
  if (cb) prog.set(id, cb);
  return fn(id).finally(() => prog.delete(id));
}

contextBridge.exposeInMainWorld('shDesktop', {
  platform: process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'windows' : process.platform,
  info: () => ipcRenderer.invoke('sh:info'),
  openFolder: () => ipcRenderer.invoke('sh:folder'),
  openApp: id => ipcRenderer.invoke('sh:open', id),
  bridge: {
    put: (to, items) => ipcRenderer.invoke('sh:bridge:put', to, items),
    list: me => ipcRenderer.invoke('sh:bridge:list', me),
    remove: (me, ids) => ipcRenderer.invoke('sh:bridge:remove', me, ids),
    onArrive: (me, cb) => { if (!arrive.has(me)) arrive.set(me, []); arrive.get(me).push(cb); ipcRenderer.invoke('sh:bridge:watch', me); }
  },
  models: {
    get: (url, name, cb) => withProg(id => ipcRenderer.invoke('sh:models:get', url, name, id), cb),
    has: (url, name) => ipcRenderer.invoke('sh:models:has', url, name)
  },
  engine: {
    status: () => ipcRenderer.invoke('sh:engine:status'),
    install: (parts, cb) => withProg(id => ipcRenderer.invoke('sh:engine:install', parts, id), cb),
    run: (task, input, params, cb) => withProg(id => ipcRenderer.invoke('sh:engine:run', id, task, input, params), cb),
    setToken: tok => ipcRenderer.invoke('sh:engine:token', tok)
  }
});
