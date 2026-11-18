/* SampledHead Desktop — envoltorio de escritorio común para las apps web de Sampled Head.
 * Sirve los archivos de la app desde dentro del programa (sin servidor, funciona sin conexión salvo las
 * funciones que ya necesitaban internet en la web, como los modelos de IA), con un origen propio y seguro
 * (shapp://app/) para que micrófono, MIDI, localStorage, workers y WASM funcionen igual que en GitHub Pages.
 */
'use strict';
const { app, BrowserWindow, protocol, shell, session, dialog, Menu, systemPreferences, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CFG = require('./config.json');            // { id, name, productName, wrapperVersion, buildId, webUrl, color }
const WEB = path.join(__dirname, 'web');
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
    'Archivo: (los archivos de audio se gestionan dentro de la app; aquí no se registran)',
    'Resultado parcial: ' + (lastPartial || '(ninguno)'),
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
    const file = path.normalize(path.join(WEB, rel));
    if (!file.startsWith(WEB + path.sep) && file !== WEB) return new Response('Prohibido', { status: 403 });
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
  app.setPath('userData', path.join(os.tmpdir(), 'sh-selftest-' + CFG.id + '-' + process.pid));
}

function isInternal(url) { return url.startsWith(SCHEME + '://app/'); }

async function clearOldServiceWorkers(ses) {
  // Si cambia la versión instalada, se borran el service worker y su caché (nunca localStorage: presets y ajustes se conservan)
  const marker = path.join(app.getPath('userData'), 'build-id.txt');
  let prev = '';
  try { prev = fs.readFileSync(marker, 'utf8'); } catch (e) {}
  if (prev !== CFG.buildId) {
    await ses.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] });
    try { fs.writeFileSync(marker, CFG.buildId); } catch (e) {}
    step('Caché de service worker renovada (' + (prev || 'primera vez') + ' → ' + CFG.buildId + ')');
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
      { label: 'Guardar informe (.txt)', click: () => saveReport('informe manual (menú Ayuda)', null, true) },
      { label: 'Abrir la versión web', click: () => shell.openExternal(CFG.webUrl) },
      { label: 'Todas las apps de Sampled Head', click: () => shell.openExternal('https://sampledhead-dot.github.io/SH-apps/') },
      { type: 'separator' },
      { label: 'Acerca de ' + CFG.name, click: () => dialog.showMessageBox({ type: 'info', title: CFG.name,
        message: CFG.name, detail: 'Versión de escritorio v' + CFG.wrapperVersion + ' (build ' + CFG.buildId + ')\n' +
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
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false, backgroundThrottling: false }
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
  step('Cargando ' + START_URL);
  await win.loadURL(START_URL);
  if (SELFTEST) runSelfTest(wc);
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
  protocol.handle(SCHEME, serve);
  return createWindow();
}).catch(e => onFail('arranque', e));
app.on('window-all-closed', () => app.quit());
