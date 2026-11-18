/* Actualización del contenido de la app (la web) sin reinstalar.
 *
 * - Pregunta a GitHub por el último commit del repo de la app (1 consulta) y, si cambió, por su lista de archivos (1 más).
 * - Solo descarga los archivos que cambiaron (de raw.githubusercontent.com, fijados a ese commit) y verifica cada uno
 *   con su huella de git (SHA-1 de «blob <tamaño>\0<datos>»). Los que no cambiaron se copian de la versión actual.
 * - Lo prepara en una carpeta aparte y solo la activa cuando está completa y verificada (nunca queda a medias).
 * - Se sirve con el mismo origen (shapp://app/), así que proyectos, ajustes y presets guardados se conservan.
 * - Si la versión nueva no arranca, se vuelve a la anterior (o a la incluida en el programa) y no se reintenta.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const API = process.env.SH_UPDATE_API || 'https://api.github.com';
const RAW = process.env.SH_UPDATE_RAW || 'https://raw.githubusercontent.com';
const OWNER = 'sampledhead-dot';
const MAX_BYTES = 300 * 1024 * 1024;

function blobSha(buf) { return crypto.createHash('sha1').update('blob ' + buf.length + '\0').update(buf).digest('hex'); }

/** Archivos del repo que forman la app (mismas reglas que scripts/prepare.js al empaquetar). */
function wanted(p, exclude) {
  const parts = p.split('/');
  if (parts.some(x => x === '.git' || x === '.github' || x === 'node_modules')) return false;
  if (parts.length === 1 && (p === '.gitignore' || p === '.gitattributes')) return false;
  return !exclude.includes(parts[0]);
}

function createUpdater(o) {
  // o: { repo, exclude, bundledDir, bundledSha, dataDir, fetch (Request→Response), log }
  const base = path.join(o.dataDir, 'contenido');
  const stateFile = path.join(base, 'estado.json');
  const log = o.log || (() => {});
  fs.mkdirSync(base, { recursive: true });

  let S = { active: null, prev: null, ready: null, bad: [], checked: 0, bundled: o.bundledSha || '' };
  try { S = Object.assign(S, JSON.parse(fs.readFileSync(stateFile, 'utf8'))); } catch (e) {}
  const dirOf = sha => path.join(base, sha);
  const valid = sha => sha && fs.existsSync(path.join(dirOf(sha), 'index.html')) && fs.existsSync(path.join(dirOf(sha), '.completo'));
  function save() { try { fs.writeFileSync(stateFile + '.tmp', JSON.stringify(S, null, 1)); fs.renameSync(stateFile + '.tmp', stateFile); } catch (e) { log('aviso', 'no se pudo guardar el estado de actualización: ' + e.message); } }

  // Si se instala un programa nuevo con una web incluida más reciente, manda la incluida
  if (o.bundledSha && S.bundled !== o.bundledSha) { log('info', 'programa nuevo: se usa la versión incluida ' + o.bundledSha.slice(0, 7)); S = { active: null, prev: null, ready: null, bad: S.bad || [], checked: 0, bundled: o.bundledSha }; save(); }
  // Lo descargado se activa al arrancar
  if (S.ready && valid(S.ready) && S.ready !== S.active) { S.prev = S.active; S.active = S.ready; S.ready = null; save(); log('info', 'activada la versión descargada ' + S.active.slice(0, 7)); }
  if (S.active && !valid(S.active)) { log('aviso', 'la versión ' + S.active + ' está incompleta: se usa la incluida'); S.active = null; save(); }

  function cleanup() {
    const keep = new Set([S.active, S.prev, S.ready].filter(Boolean));
    for (const n of fs.readdirSync(base)) {
      if (n === 'estado.json' || keep.has(n)) continue;
      try { fs.rmSync(path.join(base, n), { recursive: true, force: true }); } catch (e) {}
    }
  }
  cleanup();

  async function getJson(url) {
    const r = await o.fetch(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'SampledHead-app' } });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' en ' + url);
    return r.json();
  }
  async function getBuf(url) {
    const r = await o.fetch(url, { headers: { 'User-Agent': 'SampledHead-app' } });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' en ' + url);
    return Buffer.from(await r.arrayBuffer());
  }
  function localCopy(rel, sha) {
    for (const d of [S.active && dirOf(S.active), o.bundledDir]) {
      if (!d) continue;
      try { const b = fs.readFileSync(path.join(d, rel)); if (blobSha(b) === sha) return b; } catch (e) {}
    }
    return null;
  }

  let busy = null;
  /** Busca y descarga una versión nueva. Devuelve { estado: 'al-dia' | 'lista' | 'error', sha, cambiados, bytes, mensaje } */
  function check() {
    if (busy) return busy;
    busy = (async () => {
      try {
        const c = await getJson(API + '/repos/' + OWNER + '/' + o.repo + '/commits/HEAD');
        const sha = c.sha, tree = c.commit && c.commit.tree && c.commit.tree.sha;
        S.checked = Date.now(); save();
        const current = S.ready || S.active || o.bundledSha;
        if (!sha || sha === current) return { estado: 'al-dia', sha };
        if ((S.bad || []).includes(sha)) return { estado: 'al-dia', sha, mensaje: 'esta versión falló antes al arrancar; se espera a la siguiente' };
        const t = await getJson(API + '/repos/' + OWNER + '/' + o.repo + '/git/trees/' + tree + '?recursive=1');
        if (t.truncated) throw new Error('la lista de archivos del repo está incompleta (demasiados archivos)');
        const files = (t.tree || []).filter(e => e.type === 'blob' && wanted(e.path, o.exclude || []));
        if (!files.some(f => f.path === 'index.html')) throw new Error('el repo no tiene index.html');
        const total = files.reduce((a, f) => a + (f.size || 0), 0);
        if (total > MAX_BYTES) throw new Error('la app ocupa demasiado para actualizarla así (' + Math.round(total / 1048576) + ' MB)');
        const tmp = dirOf(sha + '.descargando');
        fs.rmSync(tmp, { recursive: true, force: true });
        let changed = 0, bytes = 0;
        for (const f of files) {
          const rel = f.path, dest = path.join(tmp, rel);
          if (!path.normalize(dest).startsWith(tmp + path.sep)) throw new Error('ruta no válida: ' + rel);
          let buf = localCopy(rel, f.sha);
          if (!buf) {
            const url = RAW + '/' + OWNER + '/' + o.repo + '/' + sha + '/' + rel.split('/').map(encodeURIComponent).join('/');
            buf = await getBuf(url);
            if (blobSha(buf) !== f.sha) throw new Error('el archivo ' + rel + ' no coincide con su huella (descarga dañada)');
            changed++; bytes += buf.length;
          }
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, buf);
        }
        fs.writeFileSync(path.join(tmp, '.completo'), sha);
        fs.rmSync(dirOf(sha), { recursive: true, force: true });
        fs.renameSync(tmp, dirOf(sha));
        S.ready = sha; save(); cleanup();
        log('info', 'versión nueva lista: ' + sha.slice(0, 7) + ' (' + changed + ' archivos cambiados, ' + Math.round(bytes / 1024) + ' KB descargados)');
        return { estado: 'lista', sha, cambiados: changed, bytes, fecha: c.commit && c.commit.committer && c.commit.committer.date, mensaje: c.commit && c.commit.message };
      } catch (e) {
        log('aviso', 'actualización: ' + (e && e.message || e));
        return { estado: 'error', mensaje: String(e && e.message || e) };
      } finally { busy = null; }
    })();
    return busy;
  }

  return {
    /** Carpeta desde la que se sirve la app ahora mismo. */
    dir() { return S.active ? dirOf(S.active) : o.bundledDir; },
    /** Identificador de la versión que se está usando (commit). */
    sha() { return S.active || o.bundledSha || ''; },
    usingDownloaded() { return !!S.active; },
    pending() { return S.ready; },
    check,
    /** Activa ya la versión descargada (la app recarga la página después). */
    applyNow() { if (!S.ready || !valid(S.ready)) return false; S.prev = S.active; S.active = S.ready; S.ready = null; save(); return true; },
    /** La versión activa no arranca: se marca como mala y se vuelve a la anterior o a la incluida. */
    rollback(reason) {
      if (!S.active) return false;
      log('aviso', 'la versión ' + S.active.slice(0, 7) + ' no arranca (' + reason + '): se vuelve a la anterior');
      S.bad = (S.bad || []).concat(S.active).slice(-10);
      S.active = valid(S.prev) ? S.prev : null; S.prev = null; save(); return true;
    },
    /** Volver a la versión incluida en el programa (menú Ayuda). */
    reset() { S.active = null; S.prev = null; S.ready = null; save(); cleanup(); },
    state() { return JSON.parse(JSON.stringify(S)); }
  };
}

/** ¿b es una versión más nueva que a? (1.2.10 > 1.2.9) */
function newer(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0), pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) { if ((pb[i] || 0) !== (pa[i] || 0)) return (pb[i] || 0) > (pa[i] || 0); }
  return false;
}

module.exports = { createUpdater, blobSha, wanted, newer, API, OWNER };
