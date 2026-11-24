/* SampledHead — plataforma de escritorio con todas las apps de Sampled Head en un solo programa.
 *
 * - Una ventana. El inicio (shapp://home/) es como el portal SH-apps: logo, una tarjeta por app, ajustes.
 * - Cada app ocupa toda la ventana en su propia vista (WebContentsView), con su diseño y su identidad. No hay pestañas:
 *   se cambia de app con el asa «SH» del borde izquierdo (vuelve al inicio), con Ctrl/Cmd+1…9 o Ctrl/Cmd+0 (inicio).
 *   Al cambiar sale un telón con el color y el icono de la app.
 * - Las apps abiertas siguen vivas en segundo plano (el audio y los procesos no se cortan).
 * - Cada app tiene su almacenamiento (partición persist:<id>) y se sirve en shapp://app/, el mismo origen que las apps
 *   sueltas, así sus proyectos, kits y ajustes se pueden importar copiando sus carpetas.
 * - Cada app se actualiza sola y por separado desde su repositorio (updater.js), sin reinstalar el programa.
 * - Al instalar se eligen las apps y los plugins VST/AU (Tuner, FuzzHead y TapeHead). Se puede cambiar después desde el inicio.
 * - Comparte con las apps sueltas la carpeta Documentos/SampledHead (bandeja, modelos, motor de IA) vía shared.js.
 */
'use strict';
const { app, BrowserWindow, WebContentsView, protocol, session, shell, dialog, Menu, ipcMain, net, screen, systemPreferences } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const CFG = require('./config.json');     // { version, buildId, apps:[{id,name,productName,color,repo,exclude,contentSha,webUrl,desc}], plugins:[…] }
const { createUpdater, newer } = require('./updater');
const SHARED = require('./shared');
const SCHEME = 'shapp';
const SELFTEST = process.env.SH_SELFTEST || '';
const HANDLE_W = 18, HANDLE_H = 64;

/* ---------------- registro e informe ---------------- */
const LOG = [], STEPS = [], T0 = Date.now();
let stage = 'inicio';
function log(kind, msg) { LOG.push(new Date().toISOString().slice(11, 23) + ' [' + kind + '] ' + msg); if (LOG.length > 300) LOG.shift(); }
function step(msg) { stage = msg; STEPS.push(((Date.now() - T0) / 1000).toFixed(2) + 's  ' + msg); log('paso', msg); }
function report(where, err) {
  let disp = '?'; try { const d = screen.getPrimaryDisplay(); disp = d.size.width + 'x' + d.size.height + ' @' + d.scaleFactor + 'x'; } catch (e) {}
  return ['INFORME DE ERROR · SampledHead (plataforma de escritorio)', 'Versión: v' + CFG.version + ' · build ' + CFG.buildId,
    'Fecha: ' + new Date().toString(), 'Dónde: ' + where, 'Etapa: ' + stage, 'App visible: ' + (cur || 'inicio'),
    'Mensaje: ' + (err && err.message ? err.message : String(err || '(informe manual)')), 'Stack: ' + (err && err.stack ? err.stack : '(sin stack)'), '',
    'Electron ' + process.versions.electron + ' · Chromium ' + process.versions.chrome + ' · Node ' + process.versions.node,
    'Plataforma: ' + os.platform() + ' ' + os.release() + ' (' + os.arch() + ')', 'Núcleos: ' + os.cpus().length + ' · RAM: ' + (os.totalmem() / 1073741824).toFixed(1) + ' GB',
    'Pantalla: ' + disp, 'Contexto seguro: sí (shapp:) · COOP/COEP: no', 'Memoria (principal): ' + Math.round(process.memoryUsage().heapUsed / 1048576) + ' MB',
    'Apps elegidas: ' + JSON.stringify(PREF.apps) + ' · abiertas: ' + Object.keys(VIEWS).join(', '),
    'Contenido: ' + JSON.stringify(Object.fromEntries(Object.entries(UPD).map(([k, u]) => [k, u.sha().slice(0, 7) + (u.usingDownloaded() ? '*' : '')]))),
    'Carpeta compartida: ' + SHARED.paths().ROOT + ' · Motor: ' + (() => { try { return JSON.stringify(SHARED.engineStatus()); } catch (e) { return e.message; } })(),
    'Archivo: (el audio se gestiona dentro de cada app)', '', '--- Cronología ---', ...STEPS, '', '--- Consola (últimas ' + LOG.length + ' líneas) ---', ...LOG].join('\n');
}
function saveReport(where, err, ask) {
  try {
    const file = path.join(app.getPath('downloads'), 'sampledhead-v' + CFG.version + '-informe-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.txt');
    fs.writeFileSync(file, report(where, err), 'utf8');
    if (!SELFTEST && win) dialog.showMessageBox(win, { type: ask ? 'info' : 'error', title: 'SampledHead', message: ask ? 'Informe guardado' : 'Ha ocurrido un error',
      detail: (ask ? '' : (err && err.message || String(err)) + '\n\n') + 'Se ha guardado un informe en Descargas:\n' + path.basename(file), buttons: ['Aceptar', 'Mostrar'] })
      .then(r => { if (r.response === 1) shell.showItemInFolder(file); }).catch(() => {});
    return file;
  } catch (e) { return null; }
}
let lastAuto = 0;
function onFail(where, err) { log('error', where + ': ' + (err && err.stack || err)); if (Date.now() - lastAuto > 5000) { lastAuto = Date.now(); saveReport(where, err, false); } }
process.on('uncaughtException', e => onFail('proceso principal', e));
process.on('unhandledRejection', e => onFail('proceso principal (promesa)', e));

/* ---------------- preferencias: apps y plugins elegidos ---------------- */
const PREF_FILE = () => path.join(app.getPath('userData'), 'eleccion.json');
let PREF = { apps: null, plugins: [], imported: false, lastApp: null };
function loadPref() { try { PREF = Object.assign(PREF, JSON.parse(fs.readFileSync(PREF_FILE(), 'utf8'))); } catch (e) {} }
function savePref() { try { fs.writeFileSync(PREF_FILE(), JSON.stringify(PREF, null, 1)); } catch (e) {} }
const appCfg = id => CFG.apps.find(a => a.id === id);
const chosen = () => CFG.apps.filter(a => !PREF.apps || PREF.apps.includes(a.id));

/* ---------------- servir cada app desde su carpeta ---------------- */
protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, allowServiceWorkers: true, codeCache: true } }]);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.onnx': 'application/octet-stream', '.zip': 'application/zip' };
function serveFrom(rootFn) {
  return request => {
    try {
      const u = new URL(request.url); let rel = decodeURIComponent(u.pathname); if (rel.endsWith('/')) rel += 'index.html';
      const ROOTDIR = rootFn(u.host), file = path.normalize(path.join(ROOTDIR, rel));
      if (!file.startsWith(ROOTDIR + path.sep)) return new Response('Prohibido', { status: 403 });
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { log('aviso', '404 ' + u.host + rel); return new Response('No encontrado', { status: 404 }); }
      return new Response(fs.readFileSync(file), { status: 200, headers: { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache', 'access-control-allow-origin': '*' } });
    } catch (e) { onFail('servir ' + request.url, e); return new Response('Error', { status: 500 }); }
  };
}

/* ---------------- actualización de cada app por separado ---------------- */
const UPD = {};
function makeUpdaters() {
  for (const a of CFG.apps) {
    UPD[a.id] = createUpdater({ repo: a.repo, exclude: a.exclude || [], bundledDir: path.join(__dirname, 'web', a.id), bundledSha: a.contentSha || '',
      dataDir: path.join(app.getPath('userData'), 'apps', a.id), fetch: (u, o) => net.fetch(u, o), log: (k, m) => log(k, '[' + a.id + '] ' + m) });
  }
}
async function checkUpdates(manual) {
  const res = [];
  for (const a of chosen()) {
    try {
      const r = await UPD[a.id].check(); res.push(a.name + ': ' + r.estado);
      if (r.estado === 'lista') {
        UPD[a.id].applyNow(); step('Versión nueva de ' + a.id + ': ' + UPD[a.id].sha().slice(0, 7));
        const v = VIEWS[a.id];
        if (v && cur !== a.id) { v.webContents.session.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] }).catch(() => {}).then(() => v.webContents.reloadIgnoringCache()); }
        else if (v) homeSend('update', { id: a.id });       // está a la vista: se avisa y se recarga al volver al inicio
      }
    } catch (e) { res.push(a.name + ': error'); }
  }
  checkProgram(manual);
  if (manual && win) dialog.showMessageBox(win, { type: 'info', title: 'SampledHead', message: 'Apps comprobadas', detail: res.join('\n') }).catch(() => {});
}
/* Última release del programa: primero la lista publicada por GitHub Actions (release «actualizaciones», sin límite de
   consultas); si falla, la API de GitHub (60 consultas/hora por IP sin cuenta). */
async function latestRel() {
  try {
    const r = await net.fetch('https://github.com/sampledhead-dot/SH-apps/releases/download/actualizaciones/programa.json');
    if (r.ok) { const p = await r.json(); if (p && p.tag) return { tag_name: p.tag, html_url: p.url, assets: (p.assets || []).map(a => ({ name: a[0], browser_download_url: a[1] })) }; }
  } catch (e) {}
  try { const r = await net.fetch('https://api.github.com/repos/sampledhead-dot/SH-apps/releases/latest', { headers: { Accept: 'application/vnd.github+json' } }); if (r.ok) return await r.json(); } catch (e) {}
  return null;
}
async function checkProgram(manual) {
  try {
    const rel = await latestRel(); if (!rel) return;
    // la versión de la plataforma va en el nombre de sus instaladores (SampledHead-X.Y.Z-…), no en la etiqueta de la release
    const want = process.platform === 'win32' ? 'Windows-Setup.exe' : (process.arch === 'arm64' ? 'Mac-AppleSilicon.zip' : 'Mac-Intel.zip');
    const asset = (rel.assets || []).find(x => /^SampledHead-[\d.]+-/.test(x.name) && x.name.endsWith(want)); if (!asset) return;
    const v = asset.name.match(/^SampledHead-([\d.]+)-/)[1];
    if (!newer(CFG.version, v)) return;
    const seen = path.join(app.getPath('userData'), 'aviso-programa.txt'); let last = ''; try { last = fs.readFileSync(seen, 'utf8'); } catch (e) {}
    if (last === v && !manual) return;
    const q = await dialog.showMessageBox(win, { type: 'info', title: 'SampledHead', buttons: ['Descargar', 'Ahora no'], defaultId: 0, cancelId: 1,
      message: 'Hay una versión nueva de la plataforma (v' + v + ')', detail: 'Tienes la v' + CFG.version + '. Las apps se actualizan solas; esta mejora es del propio programa y hay que instalarla una vez.' });
    try { fs.writeFileSync(seen, v); } catch (e) {}
    if (q.response === 0) shell.openExternal(asset.browser_download_url);
  } catch (e) { log('aviso', 'comprobación del programa: ' + e.message); }
}

/* ---------------- ventana, inicio, apps y asa ---------------- */
let win = null, home = null, handle = null, cur = null;
const VIEWS = {}, WC2APP = new Map(), SESS = {};
function bounds() { const b = win.getContentBounds(); return { x: 0, y: 0, width: b.width, height: b.height }; }
function layout() {
  if (!win) return; const b = bounds();
  home.setBounds(b); for (const v of Object.values(VIEWS)) v.setBounds(b);
  if (handle && !handle._curtain) handle.setBounds({ x: 0, y: Math.round(b.height / 2 - HANDLE_H / 2), width: HANDLE_W, height: HANDLE_H });
  else if (handle) handle.setBounds(b);
}
function sessFor(id) {
  if (SESS[id]) return SESS[id];
  const ses = session.fromPartition('persist:' + id);
  ses.protocol.handle(SCHEME, serveFrom(() => UPD[id].dir()));
  const ALLOWED = new Set(['media', 'midi', 'midiSysex', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'notifications', 'speaker-selection']);
  ses.setPermissionRequestHandler(async (wc, perm, cb, d) => {
    const ok = ALLOWED.has(perm) && String(d.requestingUrl || wc.getURL()).startsWith(SCHEME + '://');
    if (ok && perm === 'media' && process.platform === 'darwin') { try { cb(await systemPreferences.askForMediaAccess('microphone')); return; } catch (e) {} }
    cb(ok);
  });
  ses.setPermissionCheckHandler((wc, perm, origin) => ALLOWED.has(perm) && String(origin || '').startsWith(SCHEME + '://'));
  ses.on('will-download', (e, item) => {
    if (SELFTEST) item.setSavePath(path.join(os.tmpdir(), 'sh-suite-dl-' + item.getFilename()));
    else item.setSaveDialogOptions({ defaultPath: path.join(app.getPath('downloads'), item.getFilename()) });
    step('Descarga (' + id + '): ' + item.getFilename());
  });
  return (SESS[id] = ses);
}
function makeView(id) {
  if (VIEWS[id]) return VIEWS[id];
  const a = appCfg(id); if (!a) return null;
  const v = new WebContentsView({ webPreferences: { partition: 'persist:' + id, contextIsolation: true, sandbox: true, spellcheck: false, backgroundThrottling: false, preload: path.join(__dirname, 'preload.js') } });
  v.setBackgroundColor(a.color || '#111111');
  const wc = v.webContents; WC2APP.set(wc.id, id); sessFor(id);
  wc.setWindowOpenHandler(({ url }) => { if (/^(https?|mailto):/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  wc.on('will-navigate', (e, url) => { if (!url.startsWith(SCHEME + '://app/')) { e.preventDefault(); if (/^(https?|mailto):/i.test(url)) shell.openExternal(url); } });
  wc.on('console-message', e => log('consola:' + id + ':' + (e.level != null ? e.level : ''), String(e.message || '').slice(0, 300)));
  wc.on('render-process-gone', (e, d) => onFail('app ' + id, new Error('La app se cerró: ' + d.reason)));
  wc.on('did-fail-load', (e, code, desc, url, main) => {
    if (!main || code === -3) return;
    if (UPD[id].usingDownloaded() && UPD[id].rollback('no carga: ' + desc)) { step(id + ': vuelta a la versión anterior'); wc.loadURL(SCHEME + '://app/index.html'); }
    else onFail('carga de ' + id, new Error(desc + ' (' + code + ')'));
  });
  wc.on('before-input-event', (e, inp) => shortcut(e, inp));
  win.contentView.addChildView(v); v.setBounds(bounds()); v.setVisible(false);
  wc.loadURL(SCHEME + '://app/index.html');
  VIEWS[id] = v; step('App abierta: ' + id);
  return v;
}
function curtain(id) {   // telón con el color y el icono de la app, mientras cambia
  if (!handle) return;
  const a = id ? appCfg(id) : null;
  handle._curtain = true; layout(); win.contentView.addChildView(handle);
  handle.webContents.send('curtain', a ? { name: a.name, color: a.color, icon: 'shapp://home/icons/' + a.id + '.png' } : { name: 'SampledHead', color: '#d65f00', icon: 'shapp://home/logo.png' });
  setTimeout(() => { if (!handle) return; handle._curtain = false; layout(); handle.webContents.send('curtain', null); }, SELFTEST ? 50 : 380);
}
function show(id) {
  if (id && !appCfg(id)) return false;
  if (id === cur) return true;
  curtain(id);
  setTimeout(() => {
    if (id) { const v = makeView(id); for (const [k, x] of Object.entries(VIEWS)) x.setVisible(k === id); home.setVisible(false); v.webContents.focus(); PREF.lastApp = id; }
    else { for (const x of Object.values(VIEWS)) x.setVisible(false); home.setVisible(true); home.webContents.focus(); PREF.lastApp = null; }
    cur = id || null; savePref();
    win.contentView.addChildView(handle);                 // el asa siempre encima
    handle.setVisible(!!id);
    win.setTitle(id ? appCfg(id).name + ' · SampledHead' : 'SampledHead');
    homeSend('state', state());
    step('Vista: ' + (id || 'inicio'));
  }, SELFTEST ? 0 : 120);
  return true;
}
function closeApp(id) { const v = VIEWS[id]; if (!v) return; if (cur === id) show(null); win.contentView.removeChildView(v); WC2APP.delete(v.webContents.id); v.webContents.close(); delete VIEWS[id]; homeSend('state', state()); }
function shortcut(e, inp) {
  if (inp.type !== 'keyDown' || !(inp.control || inp.meta) || inp.alt) return;
  if (inp.key === '0') { e.preventDefault(); show(null); return; }
  const n = parseInt(inp.key, 10);
  if (n >= 1 && n <= 9) { const a = chosen()[n - 1]; if (a) { e.preventDefault(); show(a.id); } }
}
function state() {
  return { version: CFG.version, current: cur, platform: process.platform, arch: process.arch, apps: CFG.apps.map(a => ({ id: a.id, name: a.name, desc: a.desc, color: a.color, chosen: !PREF.apps || PREF.apps.includes(a.id), open: !!VIEWS[a.id],
    content: UPD[a.id] ? UPD[a.id].sha().slice(0, 7) : '' })), plugins: CFG.plugins.map(p => Object.assign({}, p, { installed: pluginInstalled(p) })),
    firstRun: !PREF.apps, imported: PREF.imported, legacy: legacyApps(), folder: SHARED.paths().ROOT };
}
const homeSend = (ch, d) => { try { if (home && !home.webContents.isDestroyed()) home.webContents.send(ch, d); } catch (e) {} };

/* ---------------- importar los datos de las apps sueltas ---------------- */
function legacyDir(a) { return path.join(app.getPath('appData'), a.productName); }
function legacyApps() { return CFG.apps.filter(a => fs.existsSync(path.join(legacyDir(a), 'Local Storage')) || fs.existsSync(path.join(legacyDir(a), 'IndexedDB'))).map(a => a.id); }
function copyDir(s, d) { fs.mkdirSync(d, { recursive: true }); for (const n of fs.readdirSync(s)) { const a = path.join(s, n), b = path.join(d, n); if (fs.statSync(a).isDirectory()) copyDir(a, b); else { try { fs.copyFileSync(a, b); } catch (e) { log('aviso', 'no se pudo copiar ' + a + ': ' + e.message); } } } }
/* Se hace al arrancar, antes de abrir ninguna app (los archivos de la partición no pueden estar en uso). */
function importPending() {
  const flag = path.join(app.getPath('userData'), 'importar.json'); let ids = null;
  try { ids = JSON.parse(fs.readFileSync(flag, 'utf8')); } catch (e) { return; }
  const done = [];
  for (const id of ids) {
    const a = appCfg(id); if (!a) continue;
    const src = legacyDir(a), dst = path.join(app.getPath('userData'), 'Partitions', id);
    for (const sub of ['Local Storage', 'IndexedDB', 'databases', 'File System']) {
      // no se sobrescribe nunca: si la app de la plataforma ya tiene datos, se deja como está (para sumar, usar una copia .shdatos)
      if (fs.existsSync(path.join(src, sub)) && !fs.existsSync(path.join(dst, sub))) copyDir(path.join(src, sub), path.join(dst, sub));
    }
    done.push(id);
  }
  try { fs.unlinkSync(flag); } catch (e) {}
  PREF.imported = true; PREF.importedApps = done; savePref(); step('Importado de las apps sueltas: ' + done.join(', '));
}

/* Copias .shdatos de las versiones web: se dejan en userData/pendientes/<app>.shdatos y la app las aplica al abrirse (sh-core) */
const PEND = () => path.join(app.getPath('userData'), 'pendientes');
function shdatosApp(buf) {
  const b = Buffer.from(buf); if (b.slice(0, 6).toString('latin1') !== 'SHDAT1') throw new Error('No es una copia .shdatos');
  const n = b.readUInt32LE(6); return JSON.parse(b.slice(10, 10 + n).toString('utf8')).app;
}
function importFiles(files) {
  fs.mkdirSync(PEND(), { recursive: true });
  return (files || []).map(f => {
    try {
      const id = shdatosApp(f.data); if (!appCfg(id)) return { name: f.name, ok: false, error: 'Es de una app que no está en SampledHead (' + id + ')' };
      fs.writeFileSync(path.join(PEND(), id + '--' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) + '.shdatos'), Buffer.from(f.data));   // varias copias por app (web, móvil…): se suman todas
      if (PREF.apps && !PREF.apps.includes(id)) { PREF.apps.push(id); savePref(); }
      if (VIEWS[id]) VIEWS[id].webContents.reload();      // se aplica al recargar
      step('Copia web preparada para ' + id);
      return { name: f.name, ok: true, app: id, appName: appCfg(id).name };
    } catch (e) { return { name: f.name, ok: false, error: e.message }; }
  });
}
function pendingBackup(id) {
  let list = []; try { list = fs.readdirSync(PEND()).filter(n => n === id + '.shdatos' || n.startsWith(id + '--')).sort(); } catch (e) {}
  if (!list.length) return null; const f = path.join(PEND(), list[0]);
  const b = fs.readFileSync(f); try { fs.unlinkSync(f); } catch (e) {}
  step('Aplicando la copia web en ' + id);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

/* ---------------- plugins VST3 / AU ---------------- */
function pluginDirs() {
  if (process.platform === 'darwin') return { vst3: path.join(os.homedir(), 'Library', 'Audio', 'Plug-Ins', 'VST3'), au: path.join(os.homedir(), 'Library', 'Audio', 'Plug-Ins', 'Components') };
  return { vst3: 'C:\\Program Files\\Common Files\\VST3', vst3User: path.join(process.env.LOCALAPPDATA || os.homedir(), 'Programs', 'Common', 'VST3') };
}
function pluginInstalled(p) {
  const d = pluginDirs(); return [d.vst3, d.vst3User].filter(Boolean).some(dir => { try { return fs.readdirSync(dir).some(n => n.toLowerCase().startsWith(p.bundle.toLowerCase()) && n.endsWith('.vst3')); } catch (e) { return false; } });
}
function findBundles(dir, ext, out) { out = out || []; for (const n of fs.readdirSync(dir)) { const p = path.join(dir, n); if (n.toLowerCase().endsWith(ext)) out.push(p); else if (fs.statSync(p).isDirectory()) findBundles(p, ext, out); } return out; }
async function installPlugin(p, prog) {
  prog({ stage: 'Buscando la última versión de ' + p.name, frac: 0.05 });
  const r = await net.fetch('https://api.github.com/repos/sampledhead-dot/' + p.repo + '/releases', { headers: { Accept: 'application/vnd.github+json' } });
  const rels = await r.json(), sys = process.platform === 'darwin' ? 'Mac' : 'Windows';
  const rel = (rels || []).find(x => /^vst-v/.test(x.tag_name) && (x.assets || []).some(a => a.name.endsWith('-' + sys + '.zip')));
  if (!rel) throw new Error('No hay versión de ' + p.name + ' para ' + sys);
  const asset = rel.assets.find(a => a.name.endsWith('-' + sys + '.zip'));
  const tmp = path.join(os.tmpdir(), 'sh-plugin-' + Date.now()); fs.mkdirSync(tmp, { recursive: true });
  const zip = path.join(tmp, asset.name);
  await SHARED.download(asset.browser_download_url, zip, q => prog({ stage: 'Descargando ' + p.name, frac: 0.1 + 0.6 * (q.frac || 0) }));
  prog({ stage: 'Instalando ' + p.name, frac: 0.75 });
  const ex = path.join(tmp, 'x'); fs.mkdirSync(ex);
  if (process.platform === 'darwin') await SHARED.run('ditto', ['-x', '-k', zip, ex]);
  else await SHARED.run('powershell.exe', ['-NoProfile', '-Command', 'Expand-Archive -Force -LiteralPath "' + zip + '" -DestinationPath "' + ex + '"']);
  const d = pluginDirs(), vst3 = findBundles(ex, '.vst3').filter(x => !path.dirname(x).toLowerCase().endsWith('.vst3') && !/[\\/]contents[\\/]/i.test(path.relative(ex, x)));
  const au = process.platform === 'darwin' ? findBundles(ex, '.component') : [];
  if (!vst3.length && !au.length) throw new Error('El zip de ' + p.name + ' no trae plugins');
  let where = '';
  if (process.platform === 'darwin') {
    fs.mkdirSync(d.vst3, { recursive: true }); fs.mkdirSync(d.au, { recursive: true });
    for (const b of vst3) { const t = path.join(d.vst3, path.basename(b)); fs.rmSync(t, { recursive: true, force: true }); await SHARED.run('ditto', [b, t]); await SHARED.run('xattr', ['-dr', 'com.apple.quarantine', t]).catch(() => {}); }
    for (const b of au) { const t = path.join(d.au, path.basename(b)); fs.rmSync(t, { recursive: true, force: true }); await SHARED.run('ditto', [b, t]); await SHARED.run('xattr', ['-dr', 'com.apple.quarantine', t]).catch(() => {}); }
    where = 'Biblioteca/Audio/Plug-Ins (VST3' + (au.length ? ' y Components' : '') + ')';
  } else {
    // Carpeta estándar (la que miran todos los DAW): pide permiso de administrador una vez. Si se rechaza, carpeta del usuario.
    const cmd = vst3.map(b => 'Copy-Item -Recurse -Force -LiteralPath \'' + b.replace(/'/g, "''") + '\' -Destination \'' + d.vst3 + '\'').join('; ');
    try {
      await SHARED.run('powershell.exe', ['-NoProfile', '-Command', 'Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList \'-NoProfile -Command "New-Item -ItemType Directory -Force -Path \'\'' + d.vst3 + '\'\' | Out-Null; ' + cmd.replace(/'/g, "''") + '"\'']);
      if (!pluginInstalled(p)) throw new Error('sin permiso');
      where = d.vst3;
    } catch (e) {
      fs.mkdirSync(d.vst3User, { recursive: true });
      for (const b of vst3) copyDir(b, path.join(d.vst3User, path.basename(b)));
      where = d.vst3User + ' (añade esta carpeta en los ajustes de plugins de tu DAW)';
    }
  }
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  prog({ stage: 'Listo', frac: 1 });
  step('Plugin instalado: ' + p.id + ' en ' + where);
  return { version: rel.tag_name.replace(/^vst-v/, ''), where };
}

/* ---------------- IPC del inicio ---------------- */
function homeIpc() {
  const h = (ch, fn) => ipcMain.handle(ch, (e, ...a) => { if (!home || e.sender.id !== home.webContents.id) { if (!(handle && e.sender.id === handle.webContents.id)) throw new Error('no permitido'); } return fn(e.sender, ...a); });
  h('home:state', () => state());
  h('home:open', (wc, id) => show(id));
  h('home:home', () => show(null));
  h('home:close', (wc, id) => closeApp(id));
  h('home:choose', (wc, apps, plugins) => { PREF.apps = (apps || []).filter(id => appCfg(id)); PREF.plugins = plugins || []; savePref(); for (const id of Object.keys(VIEWS)) if (!PREF.apps.includes(id)) closeApp(id); return state(); });
  h('home:plugin', async (wc, id) => { const p = CFG.plugins.find(x => x.id === id); if (!p) throw new Error('Plugin desconocido'); return installPlugin(p, q => homeSend('progress', Object.assign({ id }, q))); });
  h('home:import', (wc, ids) => { fs.writeFileSync(path.join(app.getPath('userData'), 'importar.json'), JSON.stringify(ids || legacyApps())); if (SELFTEST) { importPending(); return true; } app.relaunch(); app.exit(0); return true; });
  h('home:skipImport', () => { PREF.imported = true; savePref(); return true; });
  h('home:importFiles', (wc, files) => importFiles(files));
  h('home:folder', () => { shell.openPath(SHARED.paths().ROOT); return true; });
  h('home:pluginFolder', () => { const d = pluginDirs(); shell.openPath(fs.existsSync(d.vst3) ? d.vst3 : (d.vst3User || d.vst3)); return true; });
  h('home:updates', () => checkUpdates(true));
  h('home:report', () => saveReport('informe manual (inicio)', null, true));
  h('home:web', (wc, id) => { const a = appCfg(id); shell.openExternal(a ? a.webUrl : 'https://sampledhead-dot.github.io/SH-apps/'); return true; });
}

/* ---------------- menú ---------------- */
function buildMenu() {
  const isMac = process.platform === 'darwin', mod = isMac ? 'Cmd' : 'Ctrl';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(isMac ? [{ role: 'appMenu', label: 'SampledHead' }] : []),
    { label: 'Apps', submenu: [{ label: 'Inicio', accelerator: 'CmdOrCtrl+0', click: () => show(null) }, { type: 'separator' },
      ...chosen().slice(0, 9).map((a, i) => ({ label: a.name, accelerator: 'CmdOrCtrl+' + (i + 1), click: () => show(a.id) })),
      { type: 'separator' }, { label: 'Recargar la app actual', accelerator: 'CmdOrCtrl+R', click: () => { if (cur && VIEWS[cur]) VIEWS[cur].webContents.reload(); else home.webContents.reload(); } },
      { label: 'Cerrar la app actual', click: () => cur && closeApp(cur) }, { type: 'separator' }, isMac ? { role: 'close', label: 'Cerrar ventana' } : { role: 'quit', label: 'Salir' }] },
    { label: 'Edición', submenu: [{ role: 'undo', label: 'Deshacer' }, { role: 'redo', label: 'Rehacer' }, { type: 'separator' }, { role: 'cut', label: 'Cortar' }, { role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Pegar' }, { role: 'selectAll', label: 'Seleccionar todo' }] },
    { label: 'Ver', submenu: [{ role: 'togglefullscreen', label: 'Pantalla completa' }, { label: 'Herramientas de desarrollo', accelerator: isMac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I', click: () => (cur && VIEWS[cur] ? VIEWS[cur].webContents : home.webContents).toggleDevTools() }] },
    { label: 'Ayuda', submenu: [{ label: 'Buscar actualizaciones', click: () => checkUpdates(true) }, { label: 'Abrir la carpeta compartida (Documentos/SampledHead)', click: () => shell.openPath(SHARED.paths().ROOT) },
      { label: 'Guardar informe (.txt)', click: () => saveReport('informe manual (menú Ayuda)', null, true) }, { label: 'Todas las apps en la web', click: () => shell.openExternal('https://sampledhead-dot.github.io/SH-apps/') },
      { type: 'separator' }, { label: 'Atajos: ' + mod + '+0 inicio · ' + mod + '+1…9 apps', enabled: false },
      { label: 'Acerca de SampledHead', click: () => dialog.showMessageBox(win, { type: 'info', title: 'SampledHead', message: 'SampledHead v' + CFG.version, detail: 'Build ' + CFG.buildId + '\nElectron ' + process.versions.electron + '\n\nSampled Head' }) }] }
  ]));
}

/* ---------------- arranque ---------------- */
function reveal() {   // mostrar la ventana, dentro de una pantalla visible y delante
  if (!win || win.isDestroyed()) return;
  try {
    const b = win.getBounds();
    const ok = screen.getAllDisplays().some(d => { const a = d.workArea; return b.x < a.x + a.width - 40 && b.x + b.width > a.x + 40 && b.y < a.y + a.height - 40 && b.y + b.height > a.y; });
    if (!ok) win.center();
  } catch (e) {}
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) { win.show(); step('Ventana visible'); }
  win.focus();
}
async function createWindow() {
  step('Creando ventana');
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({ width: Math.min(1360, width), height: Math.min(900, height), minWidth: 380, minHeight: 500, show: false, title: 'SampledHead', backgroundColor: '#d65f00', icon: path.join(__dirname, 'icon.png') });
  /* 1.0.3: no depender solo de 'ready-to-show' (la ventana no carga nada propio: todo va en WebContentsView y en algunos
     Mac con Electron 43 no llegaba a mostrarse). Se muestra al cargar el inicio y, si no, a los 2,5 s. */
  win.once('ready-to-show', reveal); setTimeout(reveal, 2500); if (SELFTEST) win.show();
  session.defaultSession.protocol.handle(SCHEME, serveFrom(host => path.join(__dirname, host === 'handle' ? 'home' : 'home')));
  home = new WebContentsView({ webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'home-preload.js') } });
  home.setBackgroundColor('#d65f00');
  handle = new WebContentsView({ webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'home-preload.js'), transparent: true } });
  handle.setBackgroundColor('#00000000');
  win.contentView.addChildView(home); win.contentView.addChildView(handle);
  home.webContents.on('before-input-event', (e, i) => shortcut(e, i)); handle.webContents.on('before-input-event', (e, i) => shortcut(e, i));
  home.webContents.on('console-message', e => log('consola:inicio', String(e.message || '').slice(0, 300)));
  home.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.on('resize', layout); layout();
  homeIpc(); buildMenu();
  await home.webContents.loadURL(SCHEME + '://home/index.html');
  reveal();
  await handle.webContents.loadURL(SCHEME + '://home/handle.html');
  handle.setVisible(false);
  const start = process.argv.find(a => a.startsWith('--app='));
  if (start) show(start.slice(6));
  if (SELFTEST) return selftest();
  setTimeout(() => checkUpdates(false), 8000); setInterval(() => checkUpdates(false), 6 * 3600 * 1000);
}
async function selftest() {
  const out = { ok: false, apps: {}, errors: [] };
  try {
    await new Promise(r => setTimeout(r, 1500));
    out.home = await home.webContents.executeJavaScript('document.querySelectorAll(".card").length');
    if (process.env.SH_TEST_SHDATOS) out.importFiles = importFiles([{ name: path.basename(process.env.SH_TEST_SHDATOS), data: fs.readFileSync(process.env.SH_TEST_SHDATOS) }]);
    for (const a of chosen()) {
      show(a.id); await new Promise(r => setTimeout(r, 3500));
      const wc = VIEWS[a.id].webContents;
      out.apps[a.id] = await wc.executeJavaScript(`(async()=>({els:document.body?document.body.querySelectorAll('*').length:0,title:document.title,sh:!!(window.SH&&SH.isDesktop),info:window.shDesktop?await shDesktop.info():null,origin:location.origin}))()`).catch(e => ({ error: e.message }));
    }
    // «Enviar a…» del sampler a FuzzHead: debe cambiar a FuzzHead y dejarlo en su bandeja
    if (VIEWS.sampler && appCfg('fuzzhead')) {
      show('sampler'); await new Promise(r => setTimeout(r, 400));
      out.send = await VIEWS.sampler.webContents.executeJavaScript(`(async()=>{await SH.bridge.send('fuzzhead',[{name:'prueba',kind:'stem',wav:new Uint8Array([82,73,70,70]).buffer}],'sampler');return await SH.open('fuzzhead')})()`);
      await new Promise(r => setTimeout(r, 800)); out.afterSend = cur;
      out.inbox = await VIEWS.fuzzhead.webContents.executeJavaScript(`SH.bridge.inbox('fuzzhead').then(l=>l.length)`);
      await VIEWS.fuzzhead.webContents.executeJavaScript(`SH.bridge.remove('fuzzhead',null)`);
    }
    if (process.env.SH_TEST_SHDATOS && VIEWS.fuzzhead) { await new Promise(r => setTimeout(r, 2500)); out.shdatos = await VIEWS.fuzzhead.webContents.executeJavaScript("localStorage.getItem('fuzzhead-test')"); }
    show(null); await new Promise(r => setTimeout(r, 400));
    out.backHome = cur === null && home.getVisible();
    out.state = state();
    try {
      fs.writeFileSync(path.join(os.tmpdir(), 'sh-suite-home.png'), (await home.webContents.capturePage()).toPNG());
      if (VIEWS.fuzzhead) { show('fuzzhead'); await new Promise(r => setTimeout(r, 700)); fs.writeFileSync(path.join(os.tmpdir(), 'sh-suite-app.png'), (await VIEWS.fuzzhead.webContents.capturePage()).toPNG());
        fs.writeFileSync(path.join(os.tmpdir(), 'sh-suite-handle.png'), (await handle.webContents.capturePage()).toPNG()); show(null); await new Promise(r => setTimeout(r, 300)); }
    } catch (e) { out.shotError = e.message; }
    out.consoleErrors = LOG.filter(l => /\[consola:[^\]]*:(3|error)\]/.test(l)).slice(0, 20);
    out.http404 = LOG.filter(l => /\[aviso\] 404/.test(l));
    out.ok = out.home > 0 && Object.entries(out.apps).every(([k, x]) => x && x.els > 5 && (x.sh || k === 'chuleta')) && (out.inbox === undefined || out.inbox === 1) && out.backHome;
  } catch (e) { out.error = String(e && e.stack || e); }
  fs.writeFileSync(SELFTEST, JSON.stringify(out, null, 2)); app.exit(0);
}

if (!SELFTEST && !app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', (e, argv) => { if (!win) return; reveal(); const a = argv.find(x => x.startsWith('--app=')); if (a) show(a.slice(6)); });
app.setName('SampledHead');
if (SELFTEST) { app.commandLine.appendSwitch('use-fake-device-for-media-stream'); app.commandLine.appendSwitch('use-fake-ui-for-media-stream'); app.setPath('userData', process.env.SH_USERDATA || path.join(os.tmpdir(), 'sh-suite-test-' + process.pid)); }
app.whenReady().then(() => {
  step('Arrancando SampledHead v' + CFG.version);
  loadPref(); if (SELFTEST && !PREF.apps) PREF.apps = CFG.apps.map(a => a.id);
  importPending();
  makeUpdaters();
  SHARED.setup({ cfg: { id: 'suite', name: 'SampledHead', productName: 'SampledHead', wrapperVersion: CFG.version }, log, step,
    appOf: wc => (wc && WC2APP.get(wc.id)) || 'suite',
    openApp: id => (appCfg(id) && (!PREF.apps || PREF.apps.includes(id))) ? show(id) : false,
    pendingBackup,
    register: f => {   // todas las apps de la plataforma se abren con este programa (las apps sueltas también la encuentran)
      if (!app.isPackaged) return; const reg = SHARED.readJson(f, {});
      let exe = process.execPath; if (process.platform === 'darwin') { const m = exe.match(/^(.*?\.app)\//); if (m) exe = m[1]; }
      for (const a of chosen()) reg[a.id] = { exe, args: ['--app=' + a.id], name: 'SampledHead · ' + a.name, version: CFG.version, ts: Date.now(), suite: true };
      fs.writeFileSync(f, JSON.stringify(reg, null, 1));
    } });
  return createWindow();
}).catch(e => onFail('arranque', e));
app.on('window-all-closed', () => { savePref(); app.quit(); });
app.on('activate', () => reveal());   // Mac: clic en el Dock o abrirla otra vez desde el Finder
