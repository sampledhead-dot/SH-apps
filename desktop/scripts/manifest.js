// Lista de archivos de cada app para las actualizaciones (Android y escritorio), sin gastar la API de GitHub en los
// dispositivos: la API sin cuenta permite 60 consultas por hora y por IP, y en datos móviles muchas personas comparten IP
// (24-11-2026: la app única de Android daba «HTTP 403» en todas las apps). Este script corre en GitHub Actions (con su
// token, 1000 consultas/hora) y deja un JSON por repo como archivo de la release «actualizaciones»:
//   https://github.com/sampledhead-dot/SH-apps/releases/download/actualizaciones/<repo>.json
//   { repo, sha, date, files: [[ruta, huella git, bytes], …] }   y   programa.json { tag, assets: [nombres] }
// Uso: GH_TOKEN=… node desktop/scripts/manifest.js <carpeta de salida>
'use strict';
const fs = require('fs'), path = require('path');
const out = process.argv[2] || 'manifest-out';
const OWNER = 'sampledhead-dot', API = 'https://api.github.com';
const LIST = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'apps.json'), 'utf8'));
const H = { Accept: 'application/vnd.github+json', 'User-Agent': 'SampledHead-manifest' };
if (process.env.GH_TOKEN) H.Authorization = 'Bearer ' + process.env.GH_TOKEN;
async function get(u) { const r = await fetch(u, { headers: H }); if (!r.ok) throw new Error('HTTP ' + r.status + ' en ' + u); return r.json(); }
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const repos = [...new Set(LIST.apps.map(a => a.repo))];
  let bad = 0;
  for (const repo of repos) {
    try {
      const c = await get(API + '/repos/' + OWNER + '/' + repo + '/commits/HEAD');
      const t = await get(API + '/repos/' + OWNER + '/' + repo + '/git/trees/' + c.commit.tree.sha + '?recursive=1');
      if (t.truncated) throw new Error('lista truncada');
      const files = t.tree.filter(e => e.type === 'blob').map(e => [e.path, e.sha, e.size || 0]);
      fs.writeFileSync(path.join(out, repo + '.json'), JSON.stringify({ repo, sha: c.sha, date: c.commit.committer && c.commit.committer.date, files }));
      console.log(repo, c.sha.slice(0, 7), files.length + ' archivos');
    } catch (e) { bad++; console.error('✕', repo, e.message); }
  }
  try {
    const r = await get(API + '/repos/' + OWNER + '/SH-apps/releases/latest');
    fs.writeFileSync(path.join(out, 'programa.json'), JSON.stringify({ tag: r.tag_name, url: r.html_url, assets: (r.assets || []).map(a => [a.name, a.browser_download_url]) }));
  } catch (e) { bad++; console.error('✕ programa', e.message); }
  if (bad === repos.length + 1) process.exit(1);
})();
