// Prepara la plataforma única SampledHead para empaquetarla:
//   node scripts/prepare-suite.js <carpeta-con-los-repos> [salida]
// <carpeta-con-los-repos> tiene una subcarpeta por repo (sampledhead-app, CrazyHead, …), con el nombre de apps.json.
// Entran las apps con «windows» o «mac» en sus plataformas (Pop!Pads no: solo web y Android).
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const [srcs, outArg] = process.argv.slice(2);
if (!srcs) { console.error('Uso: node scripts/prepare-suite.js <carpeta-con-los-repos> [salida]'); process.exit(2); }
const ROOT = path.join(__dirname, '..');
const LIST = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps.json'), 'utf8'));
const out = path.resolve(outArg || path.join(ROOT, 'build', 'suite'));
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'web'), { recursive: true }); fs.mkdirSync(path.join(out, 'home', 'icons'), { recursive: true });

function copy(from, to, skip) {
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    if (name === '.git' || name === '.github' || name === 'node_modules' || name === '.gitignore' || (skip && skip.has(name))) continue;
    const s = path.join(from, name), d = path.join(to, name);
    if (fs.statSync(s).isDirectory()) copy(s, d); else fs.copyFileSync(s, d);
  }
}
const apps = [], skipped = [];
for (const A of LIST.apps) {
  const pl = A.platforms || ['windows', 'mac', 'android'];
  if (!pl.includes('windows') && !pl.includes('mac')) { skipped.push(A.id + ' (solo ' + pl.join('/') + ')'); continue; }
  const src = path.join(srcs, A.repo);
  if (!fs.existsSync(path.join(src, 'index.html'))) { skipped.push(A.id + ' (no está ' + src + ')'); continue; }
  copy(src, path.join(out, 'web', A.id), new Set(A.exclude || []));
  let sha = ''; try { sha = cp.execSync('git -C "' + src + '" rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) {}
  fs.copyFileSync(path.join(ROOT, 'icons', A.id + '.png'), path.join(out, 'home', 'icons', A.id + '.png'));
  apps.push({ id: A.id, name: A.name, productName: A.productName, color: A.color, repo: A.repo, exclude: A.exclude || [], contentSha: sha, desc: A.desc || '',
    webUrl: 'https://sampledhead-dot.github.io/' + A.repo + '/' });
}
const version = LIST.suiteVersion || '1.0.0';
let self = ''; try { self = cp.execSync('git -C "' + ROOT + '" rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) {}
for (const f of ['main.js', 'home-preload.js']) fs.copyFileSync(path.join(ROOT, 'suite', f), path.join(out, f));
copy(path.join(ROOT, 'suite', 'home'), path.join(out, 'home'));
for (const f of ['updater.js', 'shared.js', 'preload.js']) fs.copyFileSync(path.join(ROOT, 'app', f), path.join(out, f));
copy(path.join(ROOT, 'app', 'engine'), path.join(out, 'engine'));
fs.copyFileSync(path.join(ROOT, '..', 'logo.png'), path.join(out, 'home', 'logo.png'));
fs.copyFileSync(path.join(ROOT, '..', 'icon-512.png'), path.join(out, 'icon.png'));
fs.writeFileSync(path.join(out, 'config.json'), JSON.stringify({ version, buildId: version + '+' + (self || 'local'), apps, plugins: LIST.plugins || [] }, null, 2));
const art = 'SampledHead-' + version;
fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify({
  name: 'sampledhead', productName: 'SampledHead', version, main: 'main.js', description: 'Todas las apps de Sampled Head en un solo programa',
  repository: 'https://github.com/sampledhead-dot/SH-apps', author: 'Sampled Head', license: 'UNLICENSED',
  build: {
    appId: 'com.sampledhead.suite', publish: null, productName: 'SampledHead', electronVersion: LIST.electronVersion,
    directories: { output: 'dist', buildResources: '.' },
    files: ['main.js', 'home-preload.js', 'updater.js', 'shared.js', 'preload.js', 'engine/**/*', 'home/**/*', 'config.json', 'icon.png', 'web/**/*'],
    asarUnpack: ['engine/**/*'], asar: true,
    mac: { target: [{ target: 'dmg', arch: ['universal'] }], category: 'public.app-category.music', icon: 'icon.png', identity: '-', hardenedRuntime: false, artifactName: art + '-Mac.${ext}',
      extendInfo: { NSMicrophoneUsageDescription: 'Las apps de SampledHead usan el micrófono o tu interfaz de audio para grabar.' } },
    dmg: { title: 'SampledHead' },
    win: { target: [{ target: 'nsis', arch: ['x64'] }], icon: 'icon.png', artifactName: art + '-Windows-Setup.${ext}' },
    nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, createDesktopShortcut: true, shortcutName: 'SampledHead' },
    linux: { target: ['dir'], icon: 'icon.png', category: 'Audio' }
  }
}, null, 2));
console.log(JSON.stringify({ out, version, apps: apps.map(a => a.id), skipped }));
