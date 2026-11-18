// Prepara el proyecto Android de una app:  node android/scripts/prepare.js <id> <carpeta-del-repo> <salida> [versionCode]
// Usa la misma lista de apps que el escritorio (desktop/apps.json).
'use strict';
const fs = require('fs'), path = require('path');
const [id, src, outArg, codeArg] = process.argv.slice(2);
if (!id || !src || !outArg) { console.error('Uso: node scripts/prepare.js <id> <repo> <salida> [versionCode]'); process.exit(2); }
const ROOT = path.join(__dirname, '..');
const LIST = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'desktop', 'apps.json'), 'utf8'));
const A = LIST.apps.find(a => a.id === id);
if (!A) { console.error('App desconocida: ' + id); process.exit(2); }
if (!fs.existsSync(path.join(src, 'index.html'))) { console.error('No hay index.html en ' + src); process.exit(3); }
const out = path.resolve(outArg);
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'template'), out, { recursive: true });

const SKIP = new Set(['.git', '.github', '.gitignore', 'node_modules', ...A.exclude]);
const webOut = path.join(out, 'app', 'src', 'main', 'assets', 'web');
fs.mkdirSync(webOut, { recursive: true });
for (const name of fs.readdirSync(src)) {
  if (SKIP.has(name)) continue;
  fs.cpSync(path.join(src, name), path.join(webOut, name), { recursive: true, filter: s => !/[\\/](\.git|\.github|node_modules)([\\/]|$)/.test(s) });
}
const res = path.join(out, 'app', 'src', 'main', 'res');
fs.cpSync(path.join(ROOT, 'icons', id), res, { recursive: true });

const ver = LIST.androidVersion || LIST.wrapperVersion;
const p = [ver.split('.').map(Number)].map(([a, b, c]) => a * 10000 + b * 100 + c)[0];
const versionCode = String(codeArg ? Number(codeArg) : p);
const esc = s => String(s).replace(/\\/g, '\\\\').replace(/\n/g, ' ');
fs.writeFileSync(path.join(out, 'app', 'app.properties'), [
  'applicationId=com.sampledhead.' + id,
  'appId=' + id,
  'appName=' + esc(A.name),
  'versionName=' + ver,
  'versionCode=' + versionCode,
  'webUrl=https://sampledhead-dot.github.io/' + A.repo + '/',
  'color=' + (A.color || '#111111')
].join('\n') + '\n', 'utf8');
console.log(JSON.stringify({ id, out, versionName: ver, versionCode, files: fs.readdirSync(webOut).length }));
