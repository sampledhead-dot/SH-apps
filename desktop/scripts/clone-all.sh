#!/usr/bin/env bash
# Descarga los repos de las apps de Windows/Mac (según desktop/apps.json) en <carpeta>/<repo>, para la plataforma única.
set -uo pipefail
DEST="$1"; mkdir -p "$DEST"
for repo in $(node -e 'const l=require("./desktop/apps.json");console.log(l.apps.filter(a=>(a.platforms||["windows","mac"]).some(p=>p==="windows"||p==="mac")).map(a=>a.repo).join(" "))'); do
  git clone --depth 1 "https://github.com/sampledhead-dot/$repo.git" "$DEST/$repo" || echo "::warning title=$repo::No se pudo descargar; la plataforma sale sin esta app."
done
ls "$DEST"
