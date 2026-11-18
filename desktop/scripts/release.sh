#!/usr/bin/env bash
# Publica los instaladores de out/ en la release $TAG (la crea si no existe) y retira las descargas
# de apps que ya no están en desktop/apps.json. Uso (en GitHub Actions): bash repo/desktop/scripts/release.sh "*.exe"
set -euo pipefail
GLOB="$1"
REPO="$GITHUB_REPOSITORY"
shopt -s nullglob
FILES=(out/$GLOB)
[ ${#FILES[@]} -gt 0 ] || { echo "No hay instaladores ($GLOB) que publicar"; exit 1; }
ls -la "${FILES[@]}"
VER="${TAG#escritorio-v}"
NOTES="Versiones de escritorio de las apps de Sampled Head (envoltorio v$VER).

- **Windows**: descarga el \`-Windows-Setup.exe\` de la app. Si aparece «Windows protegió su PC», pulsa *Más información → Ejecutar de todas formas* (los instaladores no están firmados).
- **Mac** (Intel y Apple Silicon): abre el \`-Mac.dmg\` y arrastra la app a Aplicaciones. La primera vez, clic derecho sobre la app → *Abrir*. Si dice que está dañada: \`xattr -cr \"/Applications/Nombre.app\"\` en Terminal.

Se recompilan cada lunes con la última versión de cada app. El portal SH-apps sigue siendo solo web: https://sampledhead-dot.github.io/SH-apps/"
if ! gh release view "$TAG" -R "$REPO" >/dev/null 2>&1; then
  gh release create "$TAG" -R "$REPO" --title "Apps de escritorio v$VER" --notes "$NOTES" --latest \
    || echo "La release ya existía (creada en paralelo); se actualiza."
fi
gh release edit "$TAG" -R "$REPO" --notes "$NOTES" --latest
for i in 1 2 3; do gh release upload "$TAG" "${FILES[@]}" -R "$REPO" --clobber && break || sleep 10; done

# Retirar descargas de apps que ya no están en la lista
node -e 'const l = require("./repo/desktop/apps.json"); console.log(l.apps.map(a => a.productName.replace(/[^A-Za-z0-9]+/g, "-") + "-" + l.wrapperVersion + "-").join("\n"))' > keep.txt
gh release view "$TAG" -R "$REPO" --json assets --jq '.assets[].name' | while read -r n; do
  keep=0
  while read -r p; do case "$n" in "$p"*) keep=1 ;; esac; done < keep.txt
  if [ "$keep" = 0 ]; then echo "Quitando $n"; gh release delete-asset "$TAG" "$n" -R "$REPO" -y; fi
done
