// Autoprueba de una app ya preparada: node scripts/selftest.js <carpeta-preparada> [ejecutable-electron]
'use strict';
const cp = require('child_process'), path = require('path'), fs = require('fs'), os = require('os');
const dir = path.resolve(process.argv[2]);
const electron = process.argv[3] || require('electron');
const out = path.join(os.tmpdir(), 'sh-selftest-' + path.basename(dir) + '.json');
fs.rmSync(out, { force: true });
const args = process.platform === 'linux' ? ['--no-sandbox', '--disable-gpu', dir] : [dir];
const r = cp.spawnSync(electron, args, { env: { ...process.env, SH_SELFTEST: out, NODE_OPTIONS: '' }, timeout: 60000, encoding: 'utf8' });
if (!fs.existsSync(out)) { console.log(JSON.stringify({ app: path.basename(dir), ok: false, error: 'sin resultado', stderr: (r.stderr || '').slice(-1500) })); process.exit(1); }
const res = JSON.parse(fs.readFileSync(out, 'utf8'));
console.log(JSON.stringify(res));
process.exit(res.ok ? 0 : 1);
