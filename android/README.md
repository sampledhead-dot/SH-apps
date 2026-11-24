# SampledHead Android

APK de cada app de Sampled Head (menos el portal SH-apps, que es solo web). Lo compila el workflow «apps»
(`.github/workflows/desktop.yml`) y lo publica en Releases junto a Windows y Mac.

Compilar en local (necesita JDK 17+ y el SDK de Android):
```bash
node android/scripts/prepare.js tuner ../Sampledhead-tuner /tmp/android-tuner
cd /tmp/android-tuner && echo "sdk.dir=$ANDROID_HOME" > local.properties
SH_KEYSTORE=$PWD/../../ruta/android/keystore/provisional.jks SH_KEYSTORE_PASSWORD=sampledhead-provisional ./gradlew assembleRelease
```
Detalles en `desktop/HOJA_DE_PROYECTO.md`.

## App única «SampledHead» (desde apps-v1.5.0)
Todas las apps (menos Pop!Pads) dentro de un solo APK, `com.sampledhead.suite`, como la plataforma de Windows y Mac.
```bash
bash desktop/scripts/clone-all.sh /tmp/srcs              # repos de las apps
node android/scripts/prepare-suite.js /tmp/srcs /tmp/android-suite
cd /tmp/android-suite && echo "sdk.dir=$ANDROID_HOME" > local.properties && ./gradlew assembleRelease
```
- Código propio en `android/suite/` (SuiteActivity, manifiesto, inicio `home/`); reutiliza Updater, KeepAlive y OutboxProvider de `template/`.
- Las apps se sirven en `https://appassets.androidplatform.net/apps/<id>/` (mismo origen para todas, como en GitHub Pages):
  bandeja web de sh-core al momento, `SHSuite.open(id)` para cambiar de app, datos compartidos con el inicio.
- Cada app se actualiza por su cuenta (Updater por app en `files/apps/<id>/contenido`); si está abierta, al pulsar «Actualizar» o al cerrarla.
- Traer datos de las apps sueltas: intent `com.sampledhead.EXPORTAR` (shell ≥ 1.5.0) → copia `.shdatos` de vuelta con
  `com.sampledhead.RECIBIR` + extra `kind=datos` → el inicio la suma con `SH.backup.restore`. También admite archivos .shdatos.
- Icono: `python3 android/scripts/make-icons.py suite` (desde `icon-512.png`).
