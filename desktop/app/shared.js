/* shared.js — lo que comparten todas las apps de escritorio de Sampled Head (proceso principal).
 *
 * Carpeta común: Documentos/SampledHead/
 *   Bandeja/<app>/<id>.json + <id>.wav   lo que una app manda a otra (sh-core SH.bridge)
 *   Modelos/                              modelos de IA descargados una sola vez (sh-core SH.models)
 *   Motor/                                motor local de IA en Python (uv, PyTorch, GPU)
 *   apps.json                             dónde está instalada cada app (para abrirla desde otra)
 */
'use strict';
const { app, ipcMain, net, shell, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFile } = require('child_process');

let ROOT = '', BANDEJA = '', MODELOS = '', MOTOR = '';
let CFG = null, log = () => {}, step = () => {}, OPTS = {};

function ensureDirs() {
  ROOT = process.env.SH_SHARED_DIR || path.join(app.getPath('documents'), 'SampledHead');
  BANDEJA = path.join(ROOT, 'Bandeja'); MODELOS = path.join(ROOT, 'Modelos'); MOTOR = path.join(ROOT, 'Motor');
  for (const d of [ROOT, BANDEJA, MODELOS, MOTOR]) fs.mkdirSync(d, { recursive: true });
  const leeme = path.join(ROOT, 'LEEME.txt');
  if (!fs.existsSync(leeme)) fs.writeFileSync(leeme,
    'Carpeta compartida de las apps de Sampled Head (Windows y Mac).\r\n\r\n' +
    'Bandeja  - lo que una app envía a otra con «Enviar a…». Se vacía al recogerlo.\r\n' +
    'Modelos  - modelos de IA. Se descargan una vez y los usan todas las apps.\r\n' +
    'Motor    - motor local de IA (Python). Se puede borrar: se vuelve a instalar al pedirlo.\r\n' +
    'apps.json - dónde está instalada cada app, para poder abrirla desde otra.\r\n', 'utf8');
}
const safe = s => String(s || '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120) || 'x';
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const toAB = buf => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

/* ---------------- Registro de apps instaladas ---------------- */
function registerSelf() {
  if (OPTS.register) { try { OPTS.register(path.join(ROOT, 'apps.json')); } catch (e) {} return; }   // la plataforma registra todas sus apps
  const f = path.join(ROOT, 'apps.json'), reg = readJson(f, {});
  let target = process.execPath;
  if (process.platform === 'darwin') { const m = target.match(/^(.*?\.app)\//); if (m) target = m[1]; }
  if (!app.isPackaged) return;                  // en desarrollo no se registra
  reg[CFG.id] = { exe: target, name: CFG.productName, version: CFG.wrapperVersion, ts: Date.now() };
  try { fs.writeFileSync(f, JSON.stringify(reg, null, 1)); } catch (e) { log('aviso', 'apps.json: ' + e.message); }
}
function openApp(id, wc) {
  if (OPTS.openApp) { const r = OPTS.openApp(id, wc); if (r) return true; }
  if (id === (OPTS.appOf ? OPTS.appOf(wc) : CFG.id)) return true;
  const reg = readJson(path.join(ROOT, 'apps.json'), {}), a = reg[id];
  if (!a || !a.exe || !fs.existsSync(a.exe)) return false;
  const args = a.args || [];
  try {
    if (process.platform === 'darwin') spawn('open', [a.exe].concat(args.length ? ['--args'].concat(args) : []), { detached: true, stdio: 'ignore' }).unref();
    else spawn(a.exe, args, { detached: true, stdio: 'ignore' }).unref();
    step('Abriendo ' + id + ' (' + a.exe + ')');
    return true;
  } catch (e) { log('aviso', 'no se pudo abrir ' + id + ': ' + e.message); return false; }
}

/* ---------------- Bandeja en disco ---------------- */
function boxDir(id) { const d = path.join(BANDEJA, safe(id)); fs.mkdirSync(d, { recursive: true }); return d; }
function bridgePut(to, items) {
  const d = boxDir(to);
  for (const it of items || []) {
    const id = safe(it.id || Date.now().toString(36)), meta = Object.assign({}, it);
    if (it.wav) { fs.writeFileSync(path.join(d, id + '.wav'), Buffer.from(it.wav)); meta.wav = id + '.wav'; }
    fs.writeFileSync(path.join(d, id + '.tmp'), JSON.stringify(meta));
    fs.renameSync(path.join(d, id + '.tmp'), path.join(d, id + '.json'));     // aparece de golpe, nunca a medias
  }
  return (items || []).length;
}
function bridgeList(me) {
  const d = boxDir(me), out = [];
  for (const f of fs.readdirSync(d).filter(x => x.endsWith('.json')).sort()) {
    const m = readJson(path.join(d, f), null); if (!m) continue;
    if (typeof m.wav === 'string') { const wf = path.join(d, m.wav); m.wav = fs.existsSync(wf) ? toAB(fs.readFileSync(wf)) : null; }
    out.push(m);
  }
  return out.sort((a, b) => (a.ts || 0) - (b.ts || 0));
}
function bridgeRemove(me, ids) {
  const d = boxDir(me);
  for (const f of fs.readdirSync(d)) {
    const id = f.replace(/\.(json|wav|tmp)$/, '');
    if (!ids || ids.map(safe).includes(id)) { try { fs.unlinkSync(path.join(d, f)); } catch (e) {} }
  }
  return true;
}
const watchers = new Map();
function bridgeWatch(wc, me) {
  const key = wc.id + ':' + me; if (watchers.has(key)) return;
  let t = null;
  try {
    const w = fs.watch(boxDir(me), () => { clearTimeout(t); t = setTimeout(() => { if (!wc.isDestroyed()) wc.send('sh:arrive', me); }, 300); });
    watchers.set(key, w); wc.once('destroyed', () => { try { w.close(); } catch (e) {} watchers.delete(key); });
  } catch (e) { log('aviso', 'vigilar bandeja: ' + e.message); }
}

/* ---------------- Modelos compartidos ---------------- */
function modelFile(url, name) { return path.join(MODELOS, safe(name || url.split('/').pop())); }
async function download(url, file, onProg) {
  const r = await net.fetch(url); if (!r.ok) throw new Error('Descarga fallida (' + r.status + '): ' + url);
  const total = +r.headers.get('content-length') || 0, tmp = file + '.part', out = fs.createWriteStream(tmp);
  const rd = r.body.getReader(); let got = 0, last = 0;
  try {
    for (;;) {
      const { done, value } = await rd.read(); if (done) break;
      if (!out.write(Buffer.from(value))) await new Promise(res => out.once('drain', res));
      got += value.length; if (Date.now() - last > 250) { last = Date.now(); onProg && onProg({ frac: total ? got / total : 0, bytes: got, total }); }
    }
  } finally { await new Promise(res => out.end(res)); }
  fs.renameSync(tmp, file); onProg && onProg({ frac: 1, bytes: got, total: got });
  return file;
}
async function modelGet(wc, url, name, reqId) {
  const f = modelFile(url, name);
  if (!fs.existsSync(f)) { step('Descargando modelo ' + path.basename(f)); await download(url, f, p => { if (!wc.isDestroyed()) wc.send('sh:progress', reqId, p); }); }
  return toAB(fs.readFileSync(f));
}

/* ---------------- Motor local de IA ---------------- */
const ENG = { proc: null, port: 0, starting: null, lastErr: '' };
const isWin = process.platform === 'win32', isMac = process.platform === 'darwin';
const UV = () => path.join(MOTOR, 'uv', isWin ? 'uv.exe' : 'uv');
const PY = () => path.join(MOTOR, 'venv', isWin ? 'Scripts' : 'bin', isWin ? 'python.exe' : 'python');
const STATE = () => path.join(MOTOR, 'estado.json');
const SRC = path.join(__dirname, 'engine');

function siteDir() {
  const v = path.join(MOTOR, 'venv');
  if (isWin) return path.join(v, 'Lib', 'site-packages');
  try { const lib = path.join(v, 'lib'), py = fs.readdirSync(lib).find(d => /^python3/.test(d)); return py ? path.join(lib, py, 'site-packages') : ''; } catch (e) { return ''; }
}
function detectParts() {   // lo que de verdad hay instalado (por si estado.json no está al día)
  const sp = siteDir(), has = m => { try { return !!sp && fs.existsSync(path.join(sp, m)); } catch (e) { return false; } };
  const out = [];
  if (has('audio_separator')) out.push('separar');
  if (has('faster_whisper')) out.push('letra');
  if (has('muscriptor')) out.push('notas');
  if (has('sam_audio') && (has('sam_audio_infer') || fs.existsSync(path.join(MOTOR, 'venv', isWin ? 'Scripts' : 'bin', isWin ? 'sam-audio-infer.exe' : 'sam-audio-infer')))) out.push('sam');
  return out;
}
function engineStatus() {
  const st = readJson(STATE(), {}), inst = fs.existsSync(PY());
  return { available: isWin || isMac || !!process.env.SH_TEST_ENGINE, installed: inst, parts: inst ? detectParts() : [], gpu: st.gpu || '?', running: !!(ENG.proc && ENG.port),
    folder: MOTOR, error: ENG.lastErr || st.error || '', torch: st.torch || '' };
}
function run(cmd, args, opts, onLine) {
  return new Promise((ok, ko) => {
    const p = spawn(cmd, args, Object.assign({ windowsHide: true }, opts || {}));
    let tail = '';
    const take = d => { const s = d.toString(); tail = (tail + s).slice(-4000); s.split(/\r?\n/).forEach(l => { if (l.trim()) { log('motor', l.slice(0, 300)); onLine && onLine(l); } }); };
    p.stdout.on('data', take); p.stderr.on('data', take);
    p.on('error', ko); p.on('close', c => c === 0 ? ok(tail) : ko(new Error(cmd.split(/[\\/]/).pop() + ' terminó con código ' + c + '\n' + tail.slice(-1500))));
  });
}
function hasNvidia() { return new Promise(res => execFile(isWin ? 'nvidia-smi.exe' : 'nvidia-smi', ['-L'], { windowsHide: true }, (e, out) => res(!e && /GPU/.test(out || '')))); }

async function getUv(prog) {
  if (fs.existsSync(UV())) return UV();
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
  const asset = isWin ? 'uv-' + arch + '-pc-windows-msvc.zip' : 'uv-' + arch + '-apple-darwin.tar.gz';
  const url = 'https://github.com/astral-sh/uv/releases/latest/download/' + asset, dir = path.join(MOTOR, 'uv'), arc = path.join(MOTOR, asset);
  fs.mkdirSync(dir, { recursive: true });
  prog({ stage: 'Descargando el instalador (uv)', frac: 0.02 });
  await download(url, arc);
  if (isWin) await run('powershell.exe', ['-NoProfile', '-Command', 'Expand-Archive -Force -LiteralPath "' + arc + '" -DestinationPath "' + dir + '"']);
  else await run('tar', ['-xzf', arc, '-C', dir, '--strip-components=1']);
  try { fs.unlinkSync(arc); } catch (e) {}
  if (!fs.existsSync(UV())) { const f = findFile(dir, isWin ? 'uv.exe' : 'uv'); if (f) fs.copyFileSync(f, UV()); }
  if (!isWin) fs.chmodSync(UV(), 0o755);
  return UV();
}
function findFile(dir, name) { for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f); if (fs.statSync(p).isDirectory()) { const r = findFile(p, name); if (r) return r; } else if (f === name) return p; } return null; }

/* Git: SAM Audio y sus dependencias se instalan desde GitHub. En Windows, si no hay Git, se baja MinGit (portátil). */
function which(cmd) { return new Promise(res => execFile(isWin ? 'where' : 'which', [cmd], { windowsHide: true }, (e, out) => res(!e && String(out || '').trim() ? String(out).trim().split(/\r?\n/)[0] : ''))); }
async function getGit(prog) {
  const own = path.join(MOTOR, 'git', 'cmd', 'git.exe');
  if (isWin && fs.existsSync(own)) return path.dirname(own);
  const sys = await which('git'); if (sys) return path.dirname(sys);
  if (!isWin) throw new Error('Falta Git. En Mac se instala con «xcode-select --install» en el Terminal (o desde git-scm.com) y luego se vuelve a pulsar Instalar.');
  prog({ stage: 'Descargando Git portátil (MinGit)', frac: 0.3 });
  const r = await net.fetch('https://api.github.com/repos/git-for-windows/git/releases/latest', { headers: { Accept: 'application/vnd.github+json' } });
  const rel = await r.json(), a = (rel.assets || []).find(x => /^MinGit-[\d.]+-64-bit\.zip$/.test(x.name));
  if (!a) throw new Error('No se encontró MinGit en GitHub');
  const zip = path.join(MOTOR, a.name), dir = path.join(MOTOR, 'git');
  await download(a.browser_download_url, zip); fs.mkdirSync(dir, { recursive: true });
  await run('powershell.exe', ['-NoProfile', '-Command', 'Expand-Archive -Force -LiteralPath "' + zip + '" -DestinationPath "' + dir + '"']);
  try { fs.unlinkSync(zip); } catch (e) {}
  return path.dirname(own);
}

/* Partes que se pueden instalar. 'base' siempre. */
const PARTS = {
  base: { label: 'Base (PyTorch y audio)', pkgs: ['numpy<2.3', 'soundfile', 'mido'] },
  separar: { label: 'Separación (BS-RoFormer, Mel-RoFormer, htdemucs)', pkgs: ['audio-separator'] },
  letra: { label: 'Letra (Whisper large-v3)', pkgs: ['faster-whisper'] },
  notas: { label: 'Notas (MuScriptor)', pkgs: ['muscriptor'] },
  sam: { label: 'Instrumentos por texto (SAM Audio)', pkgs: ['sam-audio-infer', 'git+https://github.com/facebookresearch/sam-audio.git'], needsGit: true }
};
async function engineInstall(parts, prog) {
  ENG.lastErr = '';
  const st = readJson(STATE(), {}); st.parts = st.parts || [];
  const want = ['base'].concat((parts && parts.length ? parts : ['separar', 'letra', 'notas', 'sam']).filter(p => PARTS[p]));
  try {
    const uv = await getUv(prog), env = Object.assign({}, process.env, { UV_CACHE_DIR: path.join(MOTOR, 'cache'), UV_PYTHON_INSTALL_DIR: path.join(MOTOR, 'python') });
    if (!fs.existsSync(PY())) {
      prog({ stage: 'Instalando Python 3.11', frac: 0.06 });
      await run(uv, ['python', 'install', '3.11'], { env });
      await run(uv, ['venv', '--python', '3.11', path.join(MOTOR, 'venv')], { env });
    }
    const pip = (args, label, frac) => { prog({ stage: label, frac }); return run(uv, ['pip', 'install', '--python', PY()].concat(args), { env }, l => prog({ stage: label, frac, line: l.slice(0, 160) })); };
    if (!st.torch) {
      const nv = isWin && await hasNvidia();
      st.gpu = isMac ? (process.arch === 'arm64' ? 'Apple (Metal)' : 'CPU (Mac Intel)') : nv ? 'NVIDIA (CUDA)' : 'CPU';
      await pip(nv ? ['torch', 'torchaudio', '--index-url', 'https://download.pytorch.org/whl/cu126'] : ['torch', 'torchaudio'], 'Instalando PyTorch (' + st.gpu + ')', 0.12);
      st.torch = 'ok'; fs.writeFileSync(STATE(), JSON.stringify(st, null, 1));
    }
    let i = 0;
    for (const p of want) {
      i++; const P = PARTS[p], frac = 0.3 + 0.65 * i / want.length;
      if (st.parts.includes(p) && p !== 'base') continue;
      try {
        let pkgs = P.pkgs.slice();
        if (p === 'separar' && st.gpu === 'NVIDIA (CUDA)') pkgs = ['audio-separator[gpu]'];
        if (p === 'separar' && st.gpu !== 'NVIDIA (CUDA)') pkgs = ['audio-separator[cpu]'];
        if (P.needsGit) { const g = await getGit(prog); env.PATH = g + path.delimiter + (env.PATH || env.Path || ''); if (isWin) env.Path = env.PATH; }
        await pip(pkgs, 'Instalando ' + P.label, frac);
        if (!st.parts.includes(p)) st.parts.push(p);
      } catch (e) {
        const msg = P.label + ': ' + e.message.split('\n')[0];
        st.error = msg; ENG.lastErr = msg; log('error', msg);
        if (p === 'base') throw e;
      }
      fs.writeFileSync(STATE(), JSON.stringify(st, null, 1));
    }
    fs.copyFileSync(path.join(SRC, 'server.py'), path.join(MOTOR, 'server.py'));
    st.installedAt = new Date().toISOString(); if (!ENG.lastErr) delete st.error;
    fs.writeFileSync(STATE(), JSON.stringify(st, null, 1));
    prog({ stage: 'Listo', frac: 1 });
    return engineStatus();
  } catch (e) { ENG.lastErr = e.message.split('\n')[0]; st.error = ENG.lastErr; try { fs.writeFileSync(STATE(), JSON.stringify(st, null, 1)); } catch (x) {} throw e; }
}
function engineStart() {
  if (ENG.proc && ENG.port) return Promise.resolve(ENG.port);
  if (ENG.starting) return ENG.starting;
  if (!fs.existsSync(PY())) return Promise.reject(new Error('El motor local no está instalado'));
  fs.copyFileSync(path.join(SRC, 'server.py'), path.join(MOTOR, 'server.py'));     // siempre la versión del programa
  ENG.starting = new Promise((ok, ko) => {
    const env = Object.assign({}, process.env, { SH_MODELS: MODELOS, HF_HOME: path.join(MODELOS, 'huggingface'), PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' });
    const tok = readJson(path.join(MOTOR, 'ajustes.json'), {}).hfToken; if (tok) env.HF_TOKEN = tok;
    const p = spawn(PY(), [path.join(MOTOR, 'server.py'), '--port', '0'], { env, windowsHide: true, cwd: MOTOR });
    ENG.proc = p; let done = false;
    const onOut = d => d.toString().split(/\r?\n/).forEach(l => {
      if (!l.trim()) return; log('motor', l.slice(0, 300));
      const m = l.match(/^SH_ENGINE_PORT (\d+)/); if (m && !done) { done = true; ENG.port = +m[1]; ENG.starting = null; step('Motor local en el puerto ' + ENG.port); ok(ENG.port); }
    });
    p.stdout.on('data', onOut); p.stderr.on('data', onOut);
    p.on('error', e => { if (!done) { done = true; ENG.starting = null; ko(e); } });
    p.on('close', c => { ENG.proc = null; ENG.port = 0; ENG.starting = null; if (!done) { done = true; ko(new Error('El motor se cerró al arrancar (código ' + c + ')')); } });
    setTimeout(() => { if (!done) { done = true; ENG.starting = null; ko(new Error('El motor no arrancó en 120 s')); } }, 120000);
  });
  return ENG.starting;
}
async function engineCall(pathq, body) {
  const port = await engineStart();
  const r = await net.fetch('http://127.0.0.1:' + port + pathq, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status)); return j;
}
async function engineRun(wc, reqId, task, input, params) {
  const jid = Date.now().toString(36) + Math.random().toString(36).slice(2, 6), dir = path.join(MOTOR, 'trabajos', jid);
  fs.mkdirSync(dir, { recursive: true });
  let inPath = input && input.path;
  if (input && input.wav) { inPath = path.join(dir, 'entrada.wav'); fs.writeFileSync(inPath, Buffer.from(input.wav)); }
  const send = p => { if (!wc.isDestroyed()) wc.send('sh:progress', reqId, p); };
  send({ stage: 'Arrancando el motor local', frac: 0 });
  const j = await engineCall('/run', { task, input: inPath, out_dir: dir, params: params || {} });
  for (;;) {
    await new Promise(r => setTimeout(r, 700));
    const s = await engineCall('/job/' + j.id);
    send({ stage: s.stage || '', frac: s.progress || 0 });
    if (s.status === 'error') throw new Error(s.error || 'Error del motor');
    if (s.status === 'done') {
      const files = (s.result.files || []).map(f => ({ name: f.name, stem: f.stem || '', wav: fs.existsSync(f.path) ? toAB(fs.readFileSync(f.path)) : null }));
      if (!params || !params.keep) setTimeout(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }, 60000);
      return { files, data: s.result.data || {}, device: s.device || '' };
    }
  }
}

/* ---------------- Conexión con la página (IPC) ---------------- */
function setup(opts) {
  CFG = opts.cfg; log = opts.log; step = opts.step; OPTS = opts;
  ensureDirs(); registerSelf();
  const h = (ch, fn) => ipcMain.handle(ch, async (e, ...a) => fn(e.sender, ...a));
  h('sh:info', wc => ({ appId: OPTS.appOf ? OPTS.appOf(wc) : CFG.id, platform: process.platform, folder: ROOT, version: CFG.wrapperVersion, suite: !!OPTS.appOf }));
  h('sh:bridge:put', (wc, to, items) => bridgePut(to, items));
  h('sh:bridge:list', (wc, me) => bridgeList(me));
  h('sh:bridge:remove', (wc, me, ids) => bridgeRemove(me, ids));
  h('sh:bridge:watch', (wc, me) => bridgeWatch(wc, me));
  h('sh:open', (wc, id) => openApp(id, wc));
  h('sh:models:get', (wc, url, name, reqId) => modelGet(wc, url, name, reqId));
  h('sh:models:has', (wc, url, name) => fs.existsSync(modelFile(url, name)));
  h('sh:engine:status', () => engineStatus());
  h('sh:engine:install', (wc, parts, reqId) => engineInstall(parts, p => { if (!wc.isDestroyed()) wc.send('sh:progress', reqId, p); }));
  h('sh:engine:run', (wc, reqId, task, input, params) => engineRun(wc, reqId, task, input, params));
  h('sh:engine:token', (wc, tok) => { const f = path.join(MOTOR, 'ajustes.json'), a = readJson(f, {}); a.hfToken = String(tok || '').trim(); fs.writeFileSync(f, JSON.stringify(a)); if (ENG.proc) { ENG.proc.kill(); } return true; });
  h('sh:folder', () => { shell.openPath(ROOT); return ROOT; });
  h('sh:backup:pending', wc => OPTS.pendingBackup ? OPTS.pendingBackup(OPTS.appOf ? OPTS.appOf(wc) : CFG.id) : null);
  app.on('before-quit', () => { if (ENG.proc) try { ENG.proc.kill(); } catch (e) {} });
}
module.exports = { setup, paths: () => ({ ROOT, BANDEJA, MODELOS, MOTOR }), engineStatus, download, run, readJson };
