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
