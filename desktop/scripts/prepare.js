// Prepara la carpeta de una app para empaquetarla:  node scripts/prepare.js <id> <carpeta-del-repo> [carpeta-salida]
// Copia la web (sin .git ni archivos de desarrollo), el envoltorio, el icono y genera package.json para electron-builder.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const [id, src, outArg] = process.argv.slice(2);
if (!id || !src) { console.error('Uso: node scripts/prepare.js <id> <carpeta-del-repo> [salida]'); process.exit(2); }
const ROOT = path.join(__dirname, '..');
const LIST = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps.json'), 'utf8'));
const A = LIST.apps.find(a => a.id === id);
if (!A) { console.error('App desconocida: ' + id); process.exit(2); }
if (!fs.existsSync(path.join(src, 'index.html'))) { console.error('No hay index.html en ' + src); process.exit(3); }
const out = path.resolve(outArg || path.join(ROOT, 'build', id));
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'web'), { recursive: true });

const SKIP = new Set(['.git', '.github', '.gitignore', 'node_modules', ...A.exclude]);
function copy(from, to) {
  for (const name of fs.readdirSync(from)) {
    if (SKIP.has(name) && from === src) continue;
    if (name === '.git' || name === '.github' || name === 'node_modules') continue;
    const s = path.join(from, name), d = path.join(to, name), st = fs.statSync(s);
    if (st.isDirectory()) { fs.mkdirSync(d, { recursive: true }); copy(s, d); } else fs.copyFileSync(s, d);
  }
}
copy(src, path.join(out, 'web'));

let commit = 'local';
try { commit = cp.execSync('git -C "' + src + '" rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) {}
const buildId = LIST.wrapperVersion + '+' + commit;
const webUrl = 'https://sampledhead-dot.github.io/' + A.repo + '/';
fs.copyFileSync(path.join(ROOT, 'app', 'main.js'), path.join(out, 'main.js'));
fs.copyFileSync(path.join(ROOT, 'icons', id + '.png'), path.join(out, 'icon.png'));
fs.writeFileSync(path.join(out, 'config.json'), JSON.stringify({
  id, name: A.name, productName: A.productName, wrapperVersion: LIST.wrapperVersion, buildId, webUrl, color: A.color
}, null, 2));

const art = A.productName.replace(/[^A-Za-z0-9]+/g, '-') + '-' + LIST.wrapperVersion;
fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify({
  name: 'sh-' + id, productName: A.productName, version: LIST.wrapperVersion, main: 'main.js',
  description: A.name + ' (escritorio) · Sampled Head', repository: 'https://github.com/sampledhead-dot/SH-apps', author: 'Sampled Head', license: 'UNLICENSED',
  build: {
    appId: 'com.sampledhead.' + id, publish: null, productName: A.productName, electronVersion: LIST.electronVersion,
    directories: { output: 'dist', buildResources: '.' },
    files: ['main.js', 'config.json', 'icon.png', 'web/**/*'],
    asar: true,
    mac: {
      target: [{ target: 'dmg', arch: ['universal'] }], category: 'public.app-category.music', icon: 'icon.png',
      identity: '-', hardenedRuntime: false, artifactName: art + '-Mac.${ext}',
      extendInfo: { NSMicrophoneUsageDescription: A.name + ' usa el micrófono o tu interfaz de audio para grabar.' }
    },
    dmg: { title: A.productName },
    win: { target: [{ target: 'nsis', arch: ['x64'] }], icon: 'icon.png', artifactName: art + '-Windows-Setup.${ext}' },
    nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, createDesktopShortcut: true, shortcutName: A.productName },
    linux: { target: ['dir'], icon: 'icon.png', category: 'Audio' }
  }
}, null, 2));
console.log(JSON.stringify({ id, out, buildId, files: fs.readdirSync(path.join(out, 'web')).length }));
