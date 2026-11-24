// Prepara el proyecto Android de la app única «SampledHead» (todas las apps dentro):
//   node android/scripts/prepare-suite.js <carpeta-con-los-repos> <salida> [versionCode]
// <carpeta-con-los-repos> tiene una subcarpeta por repo (sampledhead-app, CrazyHead, …) con el nombre de desktop/apps.json
// (la descarga desktop/scripts/clone-all.sh). Entran las apps con Android en sus plataformas menos Pop!Pads, que sigue
// aparte (decisión del usuario: app para niños, sin conexión con las demás).
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const [srcs, outArg, codeArg] = process.argv.slice(2);
if (!srcs || !outArg) { console.error('Uso: node android/scripts/prepare-suite.js <carpeta-con-los-repos> <salida> [versionCode]'); process.exit(2); }
const ROOT = path.join(__dirname, '..'), REPO = path.join(ROOT, '..');
const LIST = JSON.parse(fs.readFileSync(path.join(REPO, 'desktop', 'apps.json'), 'utf8'));
const OUTSIDE = new Set(['poppads']);
const out = path.resolve(outArg);
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'template'), out, { recursive: true });

const MAIN = path.join(out, 'app', 'src', 'main'), JAVA = path.join(MAIN, 'java', 'com', 'sampledhead', 'shell'), ASSETS = path.join(MAIN, 'assets');
fs.rmSync(path.join(JAVA, 'MainActivity.java'));                       // la app única usa SuiteActivity
for (const f of fs.readdirSync(path.join(ROOT, 'suite', 'java', 'com', 'sampledhead', 'shell'))) fs.copyFileSync(path.join(ROOT, 'suite', 'java', 'com', 'sampledhead', 'shell', f), path.join(JAVA, f));

function copy(from, to, skip) {
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    if (name === '.git' || name === '.github' || name === 'node_modules' || name === '.gitignore' || name === '.gitattributes' || (skip && skip.has(name))) continue;
    const s = path.join(from, name), d = path.join(to, name);
    if (fs.statSync(s).isDirectory()) copy(s, d); else fs.copyFileSync(s, d);
  }
}
const apps = [], skipped = [];
for (const A of LIST.apps) {
  const pl = A.platforms || ['windows', 'mac', 'android'];
  if (!pl.includes('android') || OUTSIDE.has(A.id)) { skipped.push(A.id); continue; }
  const src = path.join(srcs, A.repo);
  if (!fs.existsSync(path.join(src, 'index.html'))) { skipped.push(A.id + ' (no está en ' + src + ')'); continue; }
  copy(src, path.join(ASSETS, 'apps', A.id), new Set(A.exclude || []));
  let sha = ''; try { sha = cp.execSync('git -C "' + src + '" rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) {}
  apps.push({ id: A.id, name: A.name, desc: A.desc || '', repo: A.repo, color: A.color || '#111111', exclude: A.exclude || [], contentSha: sha });
}
if (!apps.length) { console.error('No hay ninguna app en ' + srcs); process.exit(3); }
fs.writeFileSync(path.join(ASSETS, 'suite.json'), JSON.stringify({ apps }, null, 1));

// inicio: página, sh-core (para sumar las copias de datos), logo e iconos
copy(path.join(ROOT, 'suite', 'home'), path.join(ASSETS, 'home'));
fs.copyFileSync(path.join(REPO, 'sh-core', 'sh-core.js'), path.join(ASSETS, 'home', 'sh-core.js'));
fs.copyFileSync(path.join(REPO, 'logo.png'), path.join(ASSETS, 'home', 'logo.png'));
fs.mkdirSync(path.join(ASSETS, 'home', 'icons'), { recursive: true });
for (const a of apps) fs.copyFileSync(path.join(REPO, 'desktop', 'icons', a.id + '.png'), path.join(ASSETS, 'home', 'icons', a.id + '.png'));

// manifiesto (con la lista de apps sueltas que puede ver, para pedirles sus datos) e iconos del lanzador
const pk = apps.map(a => '        <package android:name="com.sampledhead.' + a.id + '" />').join('\n');
fs.writeFileSync(path.join(MAIN, 'AndroidManifest.xml'), fs.readFileSync(path.join(ROOT, 'suite', 'AndroidManifest.xml'), 'utf8').replace('<!--PAQUETES-->', pk));
fs.cpSync(path.join(ROOT, 'icons', 'suite'), path.join(MAIN, 'res'), { recursive: true });

const ver = LIST.androidVersion || LIST.wrapperVersion;
const p = [ver.split('.').map(Number)].map(([a, b, c]) => a * 10000 + b * 100 + c)[0];
const versionCode = String(codeArg ? Number(codeArg) : p);
let self = ''; try { self = cp.execSync('git -C "' + REPO + '" rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) {}
fs.writeFileSync(path.join(out, 'app', 'app.properties'), [
  'applicationId=com.sampledhead.suite', 'appId=suite', 'appName=SampledHead', 'productName=SampledHead',
  'versionName=' + ver, 'versionCode=' + versionCode, 'webUrl=https://sampledhead-dot.github.io/SH-apps/', 'repo=SH-apps', 'exclude=',
  'contentSha=' + self, 'color=#d65f00'
].join('\n') + '\n', 'utf8');
console.log(JSON.stringify({ out, versionName: ver, versionCode, apps: apps.map(a => a.id), skipped }));
