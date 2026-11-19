#!/usr/bin/env node
/* Copia sh-core.js a cada app. Uso: node sh-core/sync.js [carpeta-que-contiene-los-repos]
 * Por defecto busca los repos junto a SH-apps (../sampledhead-app, ../FuzzHead, …). */
'use strict';
const fs = require('fs'), path = require('path');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..', '..'));
const src = path.join(__dirname, 'sh-core.js');
const REPOS = ['sampledhead-app', 'sampledhead-editor', 'CrazyHead', 'FuzzHead', 'spb-head', 'Sampledhead-tuner', 'Tono-Pad', 'poppads'];
const code = fs.readFileSync(src, 'utf8');
for (const r of REPOS) {
  const dir = path.join(root, r);
  if (!fs.existsSync(dir)) { console.log('  –  ' + r + ' (no está)'); continue; }
  fs.writeFileSync(path.join(dir, 'sh-core.js'), code);
  console.log('  ✔  ' + r + '/sh-core.js');
}
