# SampledHead Apps nativas (Windows · Mac · Android) — Hoja de proyecto

**Versión actual:** 1.2.0 (18-11-2026) · etiqueta de descargas `apps-v1.1.0` (versión de los paquetes 1.1.0)
**Descargas:** https://github.com/sampledhead-dot/SH-apps/releases/latest

## Descripción
Versión de escritorio (Standalone) para Windows y Mac de las apps de Sampled Head, a partir de su web.
El portal **SH-apps** (la página que reúne todas las apps) se queda solo como web: sin versión de escritorio ni plugin.
Cada app es un programa independiente con su icono, que abre sin navegador, guarda sus ajustes y presets,
usa el micrófono o la interfaz de audio, MIDI y descargas (WAV, ZIP…) igual que en la web.

| id | App | Repositorio |
|---|---|---|
| `sampler` | SampledHead App | sampledhead-app |
| `crazyhead` | CrazyHead | CrazyHead |
| `editor` | SampledHead Editor | sampledhead-editor |
| `spb` | Sample Pack Builder | spb-head |
| `poppads` | Pop!Pads | poppads |
| `chuleta` | Chuleta Beat | Chuleta-beat |
| `tuner` | SampledHead Tuner | Sampledhead-tuner |
| `tonopad` | TonoPad | Tono-Pad |
| `fuzzhead` | FuzzHead | FuzzHead *(se compila en cuanto exista el repositorio)* |

## Qué versión tiene cada app (decisión del 18-11-2026)
| App | Web | Windows / Mac / Android | Plugin VST3/AU |
|---|---|---|---|
| SH-apps (portal) | ✔ | — (siempre solo web, hasta nuevo aviso) | — |
| SampledHead App | ✔ | ✔ | — |
| CrazyHead | ✔ | ✔ | — |
| Pop!Pads | ✔ | ✔ | — |
| SampledHead Editor | ✔ | ✔ | — |
| TonoPad | ✔ | ✔ | — |
| SampledHead Tuner | ✔ | ✔ | ✔ (repo Sampledhead-tuner, `vst/`) |
| FuzzHead | ✔ | ✔ | ✔ (repo FuzzHead, `vst/`; el zip del plugin trae además su Standalone en tiempo real) |
| Sample Pack Builder | ✔ | ✔ | — |
| Chuleta Beat | ✔ | ✔ | — |

## Android
- `android/template/` — proyecto Gradle (Java, sin Kotlin) con un WebView que sirve la web desde el APK en
  `https://appassets.androidplatform.net/assets/web/` (origen seguro). Android 10+ (minSdk 29), targetSdk 35.
- `MainActivity.java`: permiso de micrófono (getUserMedia), selector de archivos del teléfono (`<input type=file>`),
  **descargas** (las apps descargan con `<a download>` + `blob:`; un script inyectado al inicio de cada página
  intercepta esos clics y envía el archivo en trozos a Android, que lo guarda en *Descargas/<App>/*), enlaces externos
  al navegador, botón Atrás, service workers desactivados (los archivos ya están en el APK) e **informe de error**
  (.txt en Descargas/<App>/) si se cae la página o la app.
- `android/scripts/prepare.js` — copia la web, iconos (`android/icons/<id>/mipmap-*`) y datos de la app.
- Firma: secretos `SH_ANDROID_KEYSTORE` (keystore en base64) y `SH_ANDROID_PASSWORD`; sin ellos, clave provisional
  `android/keystore/provisional.jks` (contraseña pública `sampledhead-provisional`). **Importante**: Android solo actualiza
  una app si la nueva está firmada con la misma clave; cambiar de la provisional a la permanente obliga a desinstalar una vez.
- `versionCode` = 1.000.000 + número de ejecución (siempre sube, para que se pueda actualizar encima).

## Mac sin máquinas Mac
Las máquinas Mac con chip Apple de GitHub (`macos-15`, arm64) no llegaban a asignarse: los trabajos se cancelaban tras 15-30 min y llegaban correos de error. La anotación de GitHub en cada trabajo lo explica: «The job was not acquired by Runner of type hosted even after multiple attempts · Due to capacity constraints, jobs targeting macOS arm64 runners may experience longer queue times». Es decir, era falta de capacidad de GitHub y no un problema de la cuenta.
Las apps de escritorio para Mac se generan **en Linux** (`desktop/scripts/mac-zip.sh`): electron-builder crea la app para Apple Silicon y para Intel por separado (la «universal» y el DMG solo se pueden hacer en un Mac) y `rcodesign` les pone firma ad-hoc.
Los **plugins** (JUCE) sí necesitan un Mac para compilarse: desde el 19-11-2026 usan las máquinas **Intel** de GitHub (`macos-15-intel`), que sí se asignan, y generan un binario universal (VST3, AU y Standalone).

## Actualizaciones automáticas (desde los paquetes 1.1.0)
Las apps de Windows, Mac y Android **se actualizan solas** cuando cambia la web de la app en GitHub; no hace falta recompilar ni reinstalar.
- **Contenido (la web):** `desktop/app/updater.js` en escritorio y `android/.../Updater.java` en Android funcionan igual:
  1. Al abrir la app (a los 8 s) y cada 6 h, se consulta a GitHub el último commit del repo de la app: 1 consulta a la API pública; el límite es de 60 por hora y conexión.
  2. Si cambió, se pide su lista de archivos (1 consulta más) y **solo se descargan los que cambiaron**, de `raw.githubusercontent.com`, fijados a ese commit. Los demás se copian de la versión actual. Cada archivo se verifica con su huella de git (SHA-1 del blob).
  3. Se prepara en `<datos de la app>/contenido/<commit>/` y solo se activa si está completo. Entonces aparece «Hay una versión nueva · Recargar ahora / Al volver a abrir».
  4. Se sirve con **el mismo origen** (`shapp://app/` o `https://appassets.androidplatform.net/`), así que proyectos, ajustes y presets se conservan.
  5. **Vuelta atrás automática:** si la versión nueva no carga, se cae o la página sale vacía, se vuelve a la anterior (o a la incluida), se guarda un informe y ese commit no se vuelve a descargar.
  6. Al instalar un programa nuevo (con una web incluida más reciente), manda la incluida.
  7. Se aplican las mismas exclusiones que al empaquetar (`exclude` de `apps.json`, `.git`, `.github`, `node_modules`). Tope: 300 MB.
- **Programa (el envoltorio):** al buscar contenido, también se mira la última release `apps-vX.Y.Z`. Si es más nueva que la instalada, la app avisa una vez con «Descargar», que abre el instalador o APK de su sistema. Solo hace falta cuando cambia el envoltorio: subir `wrapperVersion` en `apps.json`.
- Escritorio: menú **Ayuda → Buscar actualizaciones** y **Volver a la versión incluida en el programa**. «Acerca de» muestra el commit en uso.
- El informe de error incluye el estado (`Contenido: …`).
- Pruebas: `SH_UPDATE_API`/`SH_UPDATE_RAW` apuntan a un servidor de prueba y `SH_USERDATA` fija la carpeta de datos con `SH_SELFTEST`.

## Arquitectura
- **Electron** (Chromium, el mismo motor con el que se prueban las webs) + **electron-builder**.
- `app/main.js` — envoltorio común:
  - Sirve los archivos de la app desde dentro del programa con un protocolo propio `shapp://app/` (origen seguro):
    funcionan micrófono, MIDI, localStorage, workers, WASM y service workers sin servidor.
  - Permisos concedidos solo a la propia app: micrófono/entrada de audio, MIDI, portapapeles, pantalla completa.
    En Mac pide el permiso de micrófono del sistema.
  - Descargas con diálogo «Guardar como» en Descargas. Enlaces externos y `target=_blank` → navegador del sistema.
  - Al instalar una versión nueva borra el service worker y su caché (nunca localStorage: presets y ajustes se conservan).
  - Menú en español: Recargar, Edición, Zoom, Pantalla completa, Herramientas de desarrollo, Ayuda
    (Guardar informe (.txt), Abrir la versión web, Todas las apps, Acerca de con versión).
  - **Informe de error**: ante un fallo del programa (proceso principal, carga de la página, cierre del proceso de la página)
    guarda automáticamente un `.txt` en Descargas (versión, fecha, dónde, etapa, mensaje y stack, UA, Electron/Chromium,
    sistema, núcleos, RAM, pantalla, URL, opciones, cronología y últimas 300 líneas de consola) y avisa. También desde
    Ayuda → Guardar informe (.txt). Los errores dentro de cada app siguen generando su propio informe.
  - **Autoprueba** (`SH_SELFTEST=resultado.json`): carga, localStorage, AudioContext, micrófono (simulado), MIDI,
    manifest, worker, WASM, descarga y captura de pantalla.
- `apps.json` — lista de apps (nombre, repositorio, color, archivos a excluir), versión del envoltorio y de Electron.
- `scripts/prepare.js` — copia la web de una app (sin `.git` ni archivos de desarrollo), el envoltorio y el icono, y genera
  el `package.json` de electron-builder (Windows: instalador NSIS x64; Mac: DMG universal Intel + Apple Silicon).
- `scripts/selftest.js` — lanza la autoprueba de una app preparada o empaquetada.
- `icons/<id>.png` — icono 1024 px de cada app (sacado de su manifest/logo en el momento de crear esta versión).
- `../.github/workflows/desktop.yml` (workflow «apps») — compila las 9 apps para Windows, Mac (en Linux) y Android
  **por separado** (cada sistema publica en cuanto termina) y lo sube todo a la release `apps-vX.Y.Z` con
  `scripts/release.sh`, que además retira las descargas de apps que ya no estén en la lista. Se lanza al cambiar `desktop/`, cada lunes (recoge las novedades de cada app) o a mano
  (Actions → desktop → Run workflow; se puede indicar qué apps).

## Reglas permanentes
- Versionado semántico del envoltorio en `apps.json` (`wrapperVersion`); la etiqueta de Releases es `escritorio-vX.Y.Z`.
  Cada app conserva su propia versión dentro (la que muestra su pie).
- El portal SH-apps **no** lleva versión de escritorio ni VST: no añadirlo a `apps.json`.
- Las apps no se modifican para el escritorio: el envoltorio se adapta a ellas. Si una app nueva se añade al portal,
  añadirla también a `apps.json` y crear `icons/<id>.png`.
- Probar antes de entregar: autoprueba de todas las apps de la lista (`node scripts/selftest.js build/<id>`) y empaquetado de al menos una.
- Informe de error .txt automático y opción manual en el menú Ayuda.

## Historial de versiones
- **1.2.0** (18-11-2026): **actualizaciones automáticas** del contenido y aviso de programa nuevo (paquetes 1.1.0, release `apps-v1.1.0`; la anterior se retira).
  Probado con un servidor que imita a GitHub y el historial real de Pop!Pads (v1.13 incluida → v1.14 descargada): solo baja los 3 archivos cambiados (232 KB, 2 consultas). Probado con Electron real: dos arranques y vuelta atrás con una versión estropeada. El APK compila y se firma; **no se ha probado en un móvil**.
- **1.1.0** (18-11-2026): versiones **Android (APK)**; **Mac generado en Linux** (zip Apple Silicon + Intel con firma ad-hoc);
  una sola release `apps-vX.Y.Z` para las tres plataformas (se borra la antigua `escritorio-v1.0.0`).
- **1.0.0** (18-11-2026): primera versión. 9 apps (el portal SH-apps queda fuera por decisión: solo web), Windows (instalador) y Mac (DMG universal), publicación en Releases,
  enlace en el portal (portal v9).

## Límites conocidos
- **Actualizaciones:** necesitan internet al abrir la app (sin conexión se sigue usando la última versión descargada o la incluida). Si GitHub limita las consultas (60/h por conexión), se reintenta más tarde. La versión 1.1.0 hay que instalarla a mano una vez; las anteriores (1.0.0) no saben actualizarse. En Mac, el programa nuevo (no el contenido) se sustituye a mano en Aplicaciones.
- **Sin firma de código**: Windows muestra «Windows protegió su PC» (Más información → Ejecutar de todas formas) y Mac pide
  clic derecho → Abrir la primera vez (o `xattr -cr "/Applications/App.app"`). Firmar requiere certificados de pago
  (Apple Developer y uno de Windows).
- **Probado solo en Linux** (autoprueba de las apps con Electron real, empaquetado Linux y montaje de la app de Windows).
  Los instaladores de Windows y Mac se generan en GitHub Actions; no se han podido abrir en un Windows o Mac reales.
- Las funciones que en la web descargan modelos o librerías de internet (separación de stems con IA en Editor, CrazyHead y
  Sample Pack Builder, MP3 del Editor) **siguen necesitando conexión** en escritorio.
- MIDI: el permiso se concede; no se ha podido probar con un dispositivo MIDI real.
- Cada app ocupa unos 100 MB (Windows) / 250 MB (Mac universal) porque incluye su propio Chromium.
- **Mac**: generado en Linux, sin DMG ni app universal; firma ad-hoc (no de Apple): hay que abrir con clic derecho → Abrir
  o `xattr -cr`. No se ha podido abrir en un Mac real.
- **Android**: probado el empaquetado, la firma y el código de descargas (en Chrome con el puente simulado); no se ha
  podido arrancar en un emulador (este entorno no tiene KVM) ni en un móvil real. Web MIDI no existe en Android WebView.
- Sin actualizaciones automáticas dentro del programa: las versiones nuevas se descargan de Releases.
- Iconos: copiados en `icons/`; si una app cambia de icono hay que regenerar el suyo.
- No es un plugin VST: las versiones VST/AU están pendientes (siguiente paso: Tuner).
