/* SampledHead Desktop — envoltorio de escritorio común para las apps web de Sampled Head.
 * Sirve los archivos de la app desde dentro del programa (sin servidor, funciona sin conexión salvo las
 * funciones que ya necesitaban internet en la web, como los modelos de IA), con un origen propio y seguro
 * (shapp://app/) para que micrófono, MIDI, localStorage, workers y WASM funcionen igual que en GitHub Pages.
 */
'use strict';
const { app, BrowserWindow, protocol, shell, session, dialog, Menu, systemPreferences, screen, net } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CFG = require('./config.json');            // { id, name, productName, wrapperVersion, buildId, webUrl, color, repo, exclude, contentSha }
const WEB = path.join(__dirname, 'web');
const { createUpdater, newer } = require('./updater');
const SHARED = require('./shared');   // carpeta compartida Documentos/SampledHead, bandeja, modelos y motor local
let UPD = null;   // actualización del contenido (se crea al arrancar)
const SCHEME = 'shapp';
const START_URL = SCHEME + '://app/index.html';
const SELFTEST = process.env.SH_SELFTEST || '';

/* ---------------- Registro para el informe de error ---------------- */
const LOG = [], STEPS = [], T0 = Date.now();
let stage = 'inicio', lastPartial = '';
function log(kind, msg) {
  LOG.push(new Date().toISOString().slice(11, 23) + ' [' + kind + '] ' + msg);
  if (LOG.length > 300) LOG.shift();
}
function step(msg) { stage = msg; STEPS.push(((Date.now() - T0) / 1000).toFixed(2) + 's  ' + msg); log('paso', msg); }

function buildReport(where, err) {
  let disp = '?';
  try { const d = screen.getPrimaryDisplay(); disp = d.size.width + 'x' + d.size.height + ' @' + d.scaleFactor + 'x'; } catch (e) {}
  const mem = process.memoryUsage();
  return [
    'INFORME DE ERROR · ' + CFG.name + ' (escritorio)',
    'Versión del envoltorio: v' + CFG.wrapperVersion + ' · build ' + CFG.buildId,
    'Fecha: ' + new Date().toString(),
    'Dónde: ' + where,
    'Etapa: ' + stage,
    'Mensaje: ' + (err && err.message ? err.message : String(err || '(informe manual)')),
    'Stack: ' + (err && err.stack ? err.stack : '(sin stack)'),
    '',
    'Navegador/UA: ' + (win && !win.isDestroyed() ? win.webContents.getUserAgent() : '?'),
    'Electron ' + process.versions.electron + ' · Chromium ' + process.versions.chrome + ' · Node ' + process.versions.node,
    'Plataforma: ' + os.platform() + ' ' + os.release() + ' (' + os.arch() + ')',
    'Núcleos: ' + os.cpus().length + ' · RAM: ' + (os.totalmem() / 1073741824).toFixed(1) + ' GB',
    'Pantalla: ' + disp,
    'URL/protocolo: ' + (win && !win.isDestroyed() ? win.webContents.getURL() : START_URL) + ' (' + SCHEME + ':, origen seguro)',
    'Contexto seguro: sí · COOP/COEP: no (igual que GitHub Pages)',
    'WebGPU: depende del equipo (ver el informe propio de la app)',
    'Memoria JS (proceso principal): ' + Math.round(mem.heapUsed / 1048576) + ' MB',
    'Opciones: ' + JSON.stringify(CFG),
    'Contenido: ' + (UPD ? JSON.stringify(Object.assign({ usando: UPD.sha().slice(0, 7), descargada: UPD.usingDownloaded() }, UPD.state())) : '(sin iniciar)'),
    'Archivo: (los archivos de audio se gestionan dentro de la app; aquí no se registran)',
    'Resultado parcial: ' + (lastPartial || '(ninguno)'),
    'Carpeta compartida: ' + (SHARED.paths().ROOT || '?') + ' · Motor local: ' + JSON.stringify(SHARED.engineStatus ? (()=>{try{return SHARED.engineStatus()}catch(e){return e.message}})() : '?'),
    '',
    '--- Cronología ---', ...STEPS,
    '',
    '--- Consola (últimas ' + LOG.length + ' líneas) ---', ...LOG
  ].join('\n');
}
function saveReport(where, err, ask) {
  try {
    const name = CFG.id + '-escritorio-v' + CFG.wrapperVersion + '-informe-' +
      new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.txt';
    const file = path.join(app.getPath('downloads'), name);
    fs.writeFileSync(file, buildReport(where, err), 'utf8');
    log('info', 'Informe guardado en ' + file);
    if (!SELFTEST) {
      dialog.showMessageBox({
        type: ask ? 'info' : 'error', title: CFG.name,
        message: ask ? 'Informe guardado' : 'Ha ocurrido un error',
        detail: (ask ? '' : (err && err.message ? err.message : String(err)) + '\n\n') +
                'Se ha guardado un informe en tu carpeta de Descargas:\n' + name, buttons: ['Aceptar', 'Mostrar']
      }).then(r => { if (r.response === 1) shell.showItemInFolder(file); }).catch(() => {});
    }
    return file;
  } catch (e) { console.error('No se pudo guardar el informe', e); return null; }
}
let autoReported = 0;
function onFail(where, err) {
  log('error', where + ': ' + (err && err.stack ? err.stack : err));
  if (Date.now() - autoReported < 5000) return;
  autoReported = Date.now();
  saveReport(where, err, false);
}
process.on('uncaughtException', e => onFail('proceso principal (uncaughtException)', e));
process.on('unhandledRejection', e => onFail('proceso principal (unhandledRejection)', e));

/* ---------------- Protocolo propio: shapp://app/… ---------------- */
protocol.registerSchemesAsPrivileged([{
  scheme: SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, allowServiceWorkers: true, codeCache: true }
}]);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.wasm': 'application/wasm', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.onnx': 'application/octet-stream', '.zip': 'application/zip', '.pdf': 'application/pdf'
};
function serve(request) {
  try {
    const u = new URL(request.url);
    let rel = decodeURIComponent(u.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const ROOTDIR = UPD ? UPD.dir() : WEB;
    const file = path.normalize(path.join(ROOTDIR, rel));
    if (!file.startsWith(ROOTDIR + path.sep) && file !== ROOTDIR) return new Response('Prohibido', { status: 403 });
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { log('aviso', '404 ' + rel); return new Response('No encontrado', { status: 404 }); }
    const body = fs.readFileSync(file);
    return new Response(body, { status: 200, headers: {
      'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache', 'access-control-allow-origin': '*'
    } });
  } catch (e) { onFail('servir ' + request.url, e); return new Response('Error', { status: 500 }); }
}

/* ---------------- Ventana ---------------- */
let win = null;
if (!SELFTEST && !app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.setName(CFG.productName);
if (SELFTEST) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
  app.setPath('userData', process.env.SH_USERDATA || path.join(os.tmpdir(), 'sh-selftest-' + CFG.id + '-' + process.pid));
}

function isInternal(url) { return url.startsWith(SCHEME + '://app/'); }

async function clearOldServiceWorkers(ses) {
  // Si cambia la versión instalada, se borran el service worker y su caché (nunca localStorage: presets y ajustes se conservan)
  const marker = path.join(app.getPath('userData'), 'build-id.txt');
  let prev = '';
  try { prev = fs.readFileSync(marker, 'utf8'); } catch (e) {}
  const now = CFG.buildId + '|' + (UPD ? UPD.sha() : '');
  if (prev !== now) {
    await ses.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] });
    try { fs.writeFileSync(marker, now); } catch (e) {}
    step('Caché de service worker renovada (' + (prev || 'primera vez') + ' → ' + now + ')');
  }
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const tpl = [
    ...(isMac ? [{ role: 'appMenu', label: CFG.productName }] : []),
    { label: 'Archivo', submenu: [
      { label: 'Recargar', accelerator: 'CmdOrCtrl+R', click: () => win && win.reload() },
      { type: 'separator' },
      isMac ? { role: 'close', label: 'Cerrar ventana' } : { role: 'quit', label: 'Salir' }
    ] },
    { label: 'Edición', submenu: [
      { role: 'undo', label: 'Deshacer' }, { role: 'redo', label: 'Rehacer' }, { type: 'separator' },
      { role: 'cut', label: 'Cortar' }, { role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Pegar' },
      { role: 'selectAll', label: 'Seleccionar todo' }
    ] },
    { label: 'Ver', submenu: [
      { role: 'resetZoom', label: 'Tamaño real' }, { role: 'zoomIn', label: 'Ampliar' }, { role: 'zoomOut', label: 'Reducir' },
      { type: 'separator' }, { role: 'togglefullscreen', label: 'Pantalla completa' },
      { role: 'toggleDevTools', label: 'Herramientas de desarrollo' }
    ] },
    { label: 'Ayuda', submenu: [
      { label: 'Buscar actualizaciones', click: () => checkUpdates(true) },
      { label: 'Volver a la versión incluida en el programa', click: () => resetContent() },
      { type: 'separator' },
      { label: 'Guardar informe (.txt)', click: () => saveReport('informe manual (menú Ayuda)', null, true) },
      { label: 'Abrir la carpeta compartida (Documentos/SampledHead)', click: () => shell.openPath(SHARED.paths().ROOT) },
      { label: 'Abrir la versión web', click: () => shell.openExternal(CFG.webUrl) },
      { label: 'Todas las apps de Sampled Head', click: () => shell.openExternal('https://sampledhead-dot.github.io/SH-apps/') },
      { type: 'separator' },
      { label: 'Acerca de ' + CFG.name, click: () => dialog.showMessageBox({ type: 'info', title: CFG.name,
        message: CFG.name, detail: 'Versión de escritorio v' + CFG.wrapperVersion + ' (build ' + CFG.buildId + ')\n' +
          'Contenido: ' + (UPD && UPD.sha() ? UPD.sha().slice(0, 7) : '?') + (UPD && UPD.usingDownloaded() ? ' (actualizado desde GitHub)' : ' (incluido en el programa)') + '\n' +
          'Electron ' + process.versions.electron + ' · Chromium ' + process.versions.chrome + '\n\nSampled Head' }) }
    ] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

async function createWindow() {
  step('Creando ventana');
  const ses = session.defaultSession;
  await clearOldServiceWorkers(ses);

  // Permisos: micrófono/entrada de audio, MIDI, portapapeles y pantalla completa para la propia app
  const ALLOWED = new Set(['media', 'midi', 'midiSysex', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'notifications', 'speaker-selection']);
  ses.setPermissionRequestHandler(async (wc, perm, cb, details) => {
    const ok = ALLOWED.has(perm) && isInternal(details.requestingUrl || wc.getURL());
    if (ok && perm === 'media' && process.platform === 'darwin' && (!details.mediaTypes || details.mediaTypes.includes('audio'))) {
      try { const granted = await systemPreferences.askForMediaAccess('microphone'); log('info', 'Permiso de micrófono macOS: ' + granted); cb(granted); return; }
      catch (e) { log('aviso', 'askForMediaAccess: ' + e.message); }
    }
    log('info', 'Permiso ' + perm + ': ' + (ok ? 'concedido' : 'denegado'));
    cb(ok);
  });
  ses.setPermissionCheckHandler((wc, perm, origin) => ALLOWED.has(perm) && (origin || '').startsWith(SCHEME + '://'));

  // Descargas (WAV, ZIP, informes…): diálogo "Guardar como" en Descargas
  ses.on('will-download', (e, item) => {
    const target = path.join(app.getPath('downloads'), item.getFilename());
    if (SELFTEST) item.setSavePath(path.join(os.tmpdir(), 'sh-selftest-dl-' + item.getFilename()));
    else item.setSaveDialogOptions({ defaultPath: target });
    step('Descarga: ' + item.getFilename() + ' (' + item.getTotalBytes() + ' bytes)');
    item.once('done', (ev, state) => { log('info', 'Descarga ' + item.getFilename() + ': ' + state); lastPartial = 'descarga ' + state; });
  });

  win = new BrowserWindow({
    width: 1280, height: 880, minWidth: 360, minHeight: 480, show: false,
    title: CFG.name, backgroundColor: CFG.color || '#111111',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false, backgroundThrottling: false, preload: path.join(__dirname, 'preload.js') }
  });
  const wc = win.webContents;
  win.once('ready-to-show', () => win.show());
  if (SELFTEST) win.show();

  // Enlaces a otras webs y ventanas nuevas → navegador del sistema
  wc.setWindowOpenHandler(({ url }) => {
    if (isInternal(url)) return { action: 'allow' };
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e, url) => { if (!isInternal(url)) { e.preventDefault(); if (/^(https?|mailto):/i.test(url)) shell.openExternal(url); } });

  wc.on('console-message', (e) => {
    const lv = e.level !== undefined ? e.level : 'info';
    log('consola:' + lv, (e.message || '') + (e.sourceId ? '  (' + e.sourceId.replace(SCHEME + '://app/', '') + ':' + e.lineNumber + ')' : ''));
  });
  wc.on('did-fail-load', (e, code, desc, url, isMain) => { if (isMain && code !== -3) onFail('carga de la página', new Error(desc + ' (' + code + ') ' + url)); });
  wc.on('render-process-gone', (e, d) => onFail('proceso de la página', new Error('El proceso de la página terminó: ' + d.reason + ' (código ' + d.exitCode + ')')));
  wc.on('preload-error', (e, p, err) => onFail('preload', err));
  win.on('unresponsive', () => log('aviso', 'La ventana no responde'));
  wc.on('did-finish-load', () => { step('Página cargada: ' + wc.getTitle()); lastPartial = 'página cargada'; });

  buildMenu();
  step('Cargando ' + START_URL + ' (contenido ' + (UPD.sha() ? UPD.sha().slice(0, 7) : '?') + (UPD.usingDownloaded() ? ', descargado' : ', incluido') + ')');
  watchStart(wc);
  await win.loadURL(START_URL);
  if (SELFTEST) runSelfTest(wc);
  if (!SELFTEST || process.env.SH_UPDATE_API) {
    setTimeout(() => checkUpdates(false), SELFTEST ? 1500 : 8000);
    setInterval(() => checkUpdates(false), 6 * 3600 * 1000);
  }
}

/* ---------------- Actualizaciones ---------------- */
/* Si una versión descargada no arranca (no carga, se cae o la página sale vacía), se vuelve a la anterior. */
function watchStart(wc) {
  if (!UPD.usingDownloaded()) return;
  let done = false;
  const fail = reason => {
    if (done) return; done = true;
    if (UPD.rollback(reason)) {
      onFail('arranque de la versión actualizada', new Error(reason + ' — se ha vuelto a la versión anterior'));
      session.defaultSession.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] }).catch(() => {}).then(() => { if (win && !win.isDestroyed()) win.loadURL(START_URL); });
    }
  };
  wc.once('did-fail-load', (e, code, desc, url, isMain) => { if (isMain && code !== -3) fail('no carga: ' + desc); });
  wc.once('render-process-gone', (e, d) => fail('la página se cerró: ' + d.reason));
  wc.once('did-finish-load', () => setTimeout(() => {
    if (done || !win || win.isDestroyed()) return;
    wc.executeJavaScript('document.body ? document.body.querySelectorAll("*").length : 0').then(n => { if (n < 4) fail('la página sale vacía'); else done = true; }).catch(() => {});
  }, 3500));
  setTimeout(() => { if (!done && wc.isLoading()) fail('no termina de cargar'); }, 30000);
}
async function reloadContent() {
  await session.defaultSession.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] }).catch(() => {});
  try { fs.writeFileSync(path.join(app.getPath('userData'), 'build-id.txt'), CFG.buildId + '|' + UPD.sha()); } catch (e) {}
  if (win && !win.isDestroyed()) { watchStart(win.webContents); win.loadURL(START_URL); }
}
let asking = false;
async function checkUpdates(manual) {
  if (!UPD || asking) return;
  const r = await UPD.check();
  step('Búsqueda de actualizaciones: ' + r.estado + (r.sha ? ' ' + r.sha.slice(0, 7) : '') + (r.mensaje ? ' · ' + String(r.mensaje).split('\n')[0] : ''));
  if (SELFTEST) { try { fs.writeFileSync(SELFTEST + '.update.json', JSON.stringify({ r, state: UPD.state(), dir: UPD.dir() }, null, 1)); } catch (e) {} }
  if (r.estado === 'lista') {
    if (SELFTEST) { UPD.applyNow(); await reloadContent(); return; }
    asking = true;
    const res = await dialog.showMessageBox(win, { type: 'info', title: CFG.name, buttons: ['Recargar ahora', 'Al volver a abrir'], defaultId: 0, cancelId: 1,
      message: 'Hay una versión nueva de ' + CFG.name,
      detail: 'Ya está descargada (' + r.cambiados + ' archivo' + (r.cambiados === 1 ? '' : 's') + ' nuevo' + (r.cambiados === 1 ? '' : 's') + ').\n\n' +
        'Si recargas ahora, guarda o exporta antes lo que estés haciendo. Si no, se usará la próxima vez que abras la app.' }).catch(() => ({ response: 1 }));
    asking = false;
    if (res.response === 0 && UPD.applyNow()) { step('Versión nueva activada: ' + UPD.sha().slice(0, 7)); reloadContent(); }
  } else if (manual) {
    dialog.showMessageBox(win, { type: r.estado === 'error' ? 'warning' : 'info', title: CFG.name,
      message: r.estado === 'error' ? 'No se ha podido comprobar' : (UPD.pending() ? 'Hay una versión nueva descargada' : 'Tienes la última versión'),
      detail: r.estado === 'error' ? r.mensaje + '\n\n¿Hay conexión a internet? La app sigue funcionando con la versión que tienes.' :
        (UPD.pending() ? 'Se usará la próxima vez que abras la app.' : 'Contenido ' + (UPD.sha() ? UPD.sha().slice(0, 7) : '?') + '.') }).catch(() => {});
  }
  checkProgram(manual);
}
/* ¿Hay un instalador nuevo del propio programa? (solo hace falta cuando cambia el envoltorio, no la web) */
async function checkProgram(manual) {
  try {
    const r = await net.fetch('https://api.github.com/repos/sampledhead-dot/SH-apps/releases/latest', { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) return;
    const rel = await r.json(), v = String(rel.tag_name || '').replace(/^apps-v/, '');
    if (!newer(CFG.wrapperVersion, v)) return;
    const seen = path.join(app.getPath('userData'), 'aviso-programa.txt');
    let last = ''; try { last = fs.readFileSync(seen, 'utf8'); } catch (e) {}
    if (last === v && !manual) return;
    const prefix = CFG.productName.replace(/[^A-Za-z0-9]+/g, '-') + '-' + v + '-';
    const want = process.platform === 'win32' ? 'Windows-Setup.exe' : process.platform === 'darwin' ? (process.arch === 'arm64' ? 'Mac-AppleSilicon.zip' : 'Mac-Intel.zip') : '';
    const asset = want && (rel.assets || []).find(a => a.name === prefix + want);
    const res = await dialog.showMessageBox(win, { type: 'info', title: CFG.name, buttons: ['Descargar', 'Ahora no'], defaultId: 0, cancelId: 1,
      message: 'Hay una versión nueva del programa (v' + v + ')',
      detail: 'Tienes la v' + CFG.wrapperVersion + '. La app se actualiza sola, pero esta mejora es del propio programa y hay que instalarla una vez.' +
        (process.platform === 'darwin' ? '\n\nEn Mac: descomprime el .zip y sustituye la app en Aplicaciones.' : '') });
    try { fs.writeFileSync(seen, v); } catch (e) {}
    if (res.response === 0) shell.openExternal(asset ? asset.browser_download_url : rel.html_url);
  } catch (e) { log('aviso', 'comprobación del programa: ' + e.message); }
}
async function resetContent() {
  const r = await dialog.showMessageBox(win, { type: 'question', title: CFG.name, buttons: ['Volver a la incluida', 'Cancelar'], defaultId: 1, cancelId: 1,
    message: '¿Usar la versión incluida en el programa?', detail: 'Se dejan de usar las actualizaciones descargadas hasta que haya otra nueva. Tus proyectos y ajustes no se borran.' });
  if (r.response !== 0) return;
  UPD.reset(); step('Vuelta a la versión incluida'); reloadContent();
}

/* ---------------- Autoprueba (solo para desarrollo/CI: SH_SELFTEST=archivo.json) ---------------- */
async function runSelfTest(wc) {
  const out = { app: CFG.id, ok: false, checks: {}, consoleErrors: [], http404: [] };
  try {
    await new Promise(r => setTimeout(r, 4000));
    out.title = wc.getTitle();
    out.checks = await wc.executeJavaScript(`(async () => {
      const r = {};
      r.bodyElements = document.body ? document.body.querySelectorAll('*').length : 0;
      r.secureContext = window.isSecureContext;
      r.origin = location.origin;
      try { localStorage.setItem('__sh_test', '1'); r.localStorage = localStorage.getItem('__sh_test') === '1'; localStorage.removeItem('__sh_test'); } catch (e) { r.localStorage = 'error: ' + e.message; }
      try { const ac = new (window.AudioContext || window.webkitAudioContext)(); r.audioContext = ac.sampleRate; await ac.close(); } catch (e) { r.audioContext = 'error: ' + e.message; }
      try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); r.microphone = s.getAudioTracks().length; s.getTracks().forEach(t => t.stop()); } catch (e) { r.microphone = 'error: ' + e.message; }
      try { r.midi = !!(navigator.requestMIDIAccess && await navigator.requestMIDIAccess()); } catch (e) { r.midi = 'error: ' + e.message; }
      try { const m = document.querySelector('link[rel=manifest]'); r.manifest = m ? (await fetch(m.href)).status : 'sin manifest'; } catch (e) { r.manifest = 'error: ' + e.message; }
      try { const w = new Worker(URL.createObjectURL(new Blob(['postMessage(2+2)'], { type: 'text/javascript' }))); r.worker = await new Promise(res => { w.onmessage = e => res(e.data); setTimeout(() => res('timeout'), 3000); }); } catch (e) { r.worker = 'error: ' + e.message; }
      try { r.wasm = WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0])); } catch (e) { r.wasm = 'error: ' + e.message; }
      try {   // carpeta compartida y sh-core (Documentos/SampledHead)
        r.shDesktop = !!window.shDesktop; r.shCore = !!(window.SH && SH.isDesktop);
        if (window.shDesktop) {
          r.info = await shDesktop.info();
          await shDesktop.bridge.put('selftest', [{ id: 'x1', name: 'prueba', kind: 'pad', wav: new Uint8Array([82,73,70,70]).buffer, ts: Date.now() }]);
          const l = await shDesktop.bridge.list('selftest'); r.bridge = l.length === 1 && l[0].wav && l[0].wav.byteLength === 4;
          await shDesktop.bridge.remove('selftest', null); r.bridgeEmpty = (await shDesktop.bridge.list('selftest')).length === 0;
          r.engine = await shDesktop.engine.status();
          if (r.engine.installed && ${JSON.stringify(!!process.env.SH_TEST_ENGINE)}) {   // prueba del motor local (solo si se pide)
            const sr = 44100, n = sr * 3, b = new Float32Array(n); for (let i = 0; i < n; i++) b[i] = 0.3 * Math.sin(2 * Math.PI * 55 * i / sr) + (i % 22050 < 900 ? 0.5 * Math.sin(i / 3) : 0);
            const wav = SH.wav.encode({ channels: [b, b], sampleRate: sr }, 16), t0 = Date.now();
            const res = await shDesktop.engine.run('separate', { wav }, { stems: ['bajo', 'bateria'] });
            r.engineRun = { ms: Date.now() - t0, files: res.files.map(f => f.stem + ':' + (f.wav ? f.wav.byteLength : 0)), device: res.device };
          }
        }
      } catch (e) { r.shDesktop = 'error: ' + e.message; }
      try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['hola'], { type: 'text/plain' })); a.download = 'prueba-descarga.txt'; document.body.appendChild(a); a.click(); a.remove(); r.downloadClick = true; } catch (e) { r.downloadClick = 'error: ' + e.message; }
      return r;
    })()`);
    await new Promise(r => setTimeout(r, 1500));
    try { const img = await wc.capturePage(); out.screenshot = path.join(os.tmpdir(), 'sh-selftest-' + CFG.id + '.png'); fs.writeFileSync(out.screenshot, img.toPNG()); } catch (e) { out.screenshot = 'error: ' + e.message; }
    out.download = fs.existsSync(path.join(os.tmpdir(), 'sh-selftest-dl-prueba-descarga.txt'));
    out.consoleErrors = LOG.filter(l => /\[consola:(error|3)\]/.test(l));
    out.http404 = LOG.filter(l => /\[aviso\] 404/.test(l));
    out.reportFile = saveReport('autoprueba', null, true);
    const c = out.checks;
    out.ok = c.bodyElements > 5 && c.secureContext === true && c.localStorage === true && typeof c.audioContext === 'number' &&
             c.microphone === 1 && c.worker === 4 && c.wasm === true && out.download;
  } catch (e) { out.error = String(e && e.stack || e); }
  fs.writeFileSync(SELFTEST, JSON.stringify(out, null, 2));
  app.exit(0);
}

app.whenReady().then(() => {
  step('Arrancando ' + CFG.name + ' v' + CFG.wrapperVersion);
  UPD = createUpdater({ repo: CFG.repo, exclude: CFG.exclude || [], bundledDir: WEB, bundledSha: CFG.contentSha || '',
    dataDir: app.getPath('userData'), fetch: (u, opt) => net.fetch(u, opt), log });
  protocol.handle(SCHEME, serve);
  try { SHARED.setup({ cfg: CFG, log, step }); step('Carpeta compartida: ' + SHARED.paths().ROOT); } catch (e) { onFail('carpeta compartida', e); }
  return createWindow();
}).catch(e => onFail('arranque', e));
app.on('window-all-closed', () => app.quit());
