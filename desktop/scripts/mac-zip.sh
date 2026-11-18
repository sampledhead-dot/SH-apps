#!/usr/bin/env bash
# Empaqueta una app para Mac DESDE LINUX (las máquinas Mac de GitHub no están disponibles para esta cuenta):
# dos .app (Apple Silicon e Intel), firma ad-hoc con rcodesign si está instalado, y un .zip de cada una.
# Uso (desde desktop/):  bash scripts/mac-zip.sh <id>
set -euo pipefail
ID="$1"; DIR="build/$ID"
npx electron-builder --projectDir "$DIR" --mac dir --arm64 --x64 --publish never -c.mac.identity=null
NAME=$(node -p "require('./$DIR/package.json').build.productName")
ART=$(node -p "const p=require('./$DIR/package.json'); p.productName.replace(/[^A-Za-z0-9]+/g,'-')+'-'+p.version")
for pair in "mac-arm64:AppleSilicon" "mac:Intel"; do
  d="${pair%%:*}"; tag="${pair##*:}"
  app="$DIR/dist/$d/$NAME.app"
  [ -d "$app" ] || { echo "No se encontró $app"; exit 1; }
  if command -v rcodesign >/dev/null 2>&1; then
    rcodesign sign "$app" >/dev/null && echo "Firmado (ad-hoc): $tag" || echo "::warning title=$ID::rcodesign no pudo firmar la versión $tag"
  else
    echo "::warning title=$ID::rcodesign no está instalado; la versión $tag va sin firmar"
  fi
  (cd "$DIR/dist/$d" && rm -f "../$ART-Mac-$tag.zip" && zip -qry "../$ART-Mac-$tag.zip" "$NAME.app")
done
ls -la "$DIR"/dist/*.zip
