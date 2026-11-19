#!/usr/bin/env bash
# Publica los archivos de out/ (Windows .exe, Mac .zip o Android .apk) en la release $TAG (la crea si no existe),
# retira las descargas de apps que ya no están en desktop/apps.json y borra la release antigua "escritorio-v*".
# Uso (en GitHub Actions): bash repo/desktop/scripts/release.sh "*.exe"
set -euo pipefail
GLOB="$1"
REPO="$GITHUB_REPOSITORY"
shopt -s nullglob
FILES=(out/$GLOB)
[ ${#FILES[@]} -gt 0 ] || { echo "No hay archivos ($GLOB) que publicar"; exit 1; }
ls -la "${FILES[@]}"
VER="${TAG#apps-v}"
NOTES="Apps de Sampled Head v$VER para **Windows, Mac y Android** (el portal SH-apps sigue siendo solo web: https://sampledhead-dot.github.io/SH-apps/).

**Windows**: descarga el \`-Windows-Setup.exe\` de la app. Si aparece «Windows protegió su PC»: *Más información → Ejecutar de todas formas*.

**Mac**: descarga el \`-Mac-AppleSilicon.zip\` (Mac con chip M1/M2/M3/M4) o el \`-Mac-Intel.zip\` (Mac con Intel), descomprímelo y arrastra la app a Aplicaciones. La primera vez: clic derecho sobre la app → *Abrir*. Si dice que está dañada o no se puede abrir, en Terminal:
\`xattr -cr \"/Applications/Nombre de la app.app\"\`

**Android** (Android 10 o superior): descarga el \`-Android.apk\` en el móvil y ábrelo. Android pedirá permiso para *instalar apps de origen desconocido* (navegador o Archivos). Las exportaciones (WAV, ZIP…) se guardan en *Descargas/Nombre de la app*.

**Actualizaciones**: desde la v1.1.0 las apps se actualizan solas. Al abrirlas comprueban si hay cambios en la web de la app, descargan solo lo nuevo y lo aplican al pulsar «Recargar ahora» o la próxima vez que se abran. Tus proyectos y ajustes se conservan. Si alguna vez cambia el propio programa, la app avisa con un botón para descargarlo.

Los instaladores no están firmados con certificados de pago (Apple / Microsoft / Google Play), por eso aparecen esos avisos. Se recompilan cada lunes con la última versión de cada app."

# La release antigua con otro nombre ya no se usa
for old in $(gh release list -R "$REPO" --limit 50 --json tagName --jq '.[].tagName' | grep '^escritorio-v' || true); do
  echo "Borrando release antigua $old"; gh release delete "$old" -R "$REPO" --cleanup-tag -y || true
done

if ! gh release view "$TAG" -R "$REPO" >/dev/null 2>&1; then
  gh release create "$TAG" -R "$REPO" --title "Apps de Sampled Head v$VER (Windows · Mac · Android)" --notes "$NOTES" --latest \
    || echo "La release ya existía (creada en paralelo); se actualiza."
fi
gh release edit "$TAG" -R "$REPO" --notes "$NOTES" --latest
for i in 1 2 3; do gh release upload "$TAG" "${FILES[@]}" -R "$REPO" --clobber && break || sleep 15; done

# Las releases de versiones anteriores del programa (apps-v*) se retiran: solo queda la última para descargar
for old in $(gh release list -R "$REPO" --limit 50 --json tagName --jq '.[].tagName' | grep '^apps-v' | grep -vx "$TAG" || true); do
  echo "Retirando la release anterior $old"; gh release delete "$old" -R "$REPO" --cleanup-tag -y || true
done

# Retirar descargas de apps que ya no están en la lista
# (también el nombre visible, p. ej. «Pop-Pads-…»: es la copia que buscan los APK v1.1.1 y anteriores)
node -e 'const l = require("./repo/desktop/apps.json"); console.log([...new Set(l.apps.flatMap(a => [a.productName, a.name]).map(n => n.replace(/[^A-Za-z0-9]+/g, "-") + "-"))].join("\n"))' > keep.txt
gh release view "$TAG" -R "$REPO" --json assets --jq '.assets[].name' | while read -r n; do
  keep=0
  while read -r p; do case "$n" in "$p"[0-9]*) keep=1 ;; esac; done < keep.txt
  if [ "$keep" = 0 ]; then echo "Quitando $n"; gh release delete-asset "$TAG" "$n" -R "$REPO" -y; fi
done
