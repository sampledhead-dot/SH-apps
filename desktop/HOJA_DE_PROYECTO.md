# SampledHead Apps nativas (Windows · Mac · Android) — Hoja de proyecto

**Versión actual:** 1.6.0 (19-11-2026) · etiqueta de descargas `apps-v1.3.0` (paquetes 1.3.1) · plataforma SampledHead 1.0.1
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
- **Barras del sistema** (paquetes 1.1.2): con targetSdk 35, Android 15+ dibuja la app bajo la barra de estado y la de
  navegación e ignora `statusBarColor`. El WebView va dentro de un `FrameLayout` que recibe los *insets*
  (barras del sistema, recorte de cámara y teclado) como relleno, con el color de la app. La web puede preguntar
  `SHAndroid.insets()` (devuelve 1) para saber que el programa ya deja ese hueco.
- **APK nuevo del programa**: se busca en la release por `<productName>-<versión>-Android.apk` (y, si no, por el nombre
  visible). Hasta la 1.1.1 se buscaba solo por el nombre visible y en Pop!Pads («Pop-Pads-…» frente a «PopPads-…») se
  abría la página de GitHub en vez de descargar. El workflow publica además una copia con el nombre visible cuando no
  coincide, para que los APK ya instalados también descarguen directamente.

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

## Carpeta compartida y motor local de IA (1.5.0, paquetes 1.2.0)
Todas las apps de Windows y Mac comparten **Documentos/SampledHead/** (`app/shared.js`, expuesto a la página por
`app/preload.js` como `window.shDesktop`; la página lo usa a través de `sh-core.js`):
- `Bandeja/<app>/` — lo que una app manda a otra con «Enviar a…» (`<id>.json` + `<id>.wav`; el .json aparece de golpe con
  un renombrado, nunca a medias). La app de destino lo ve al instante (vigilancia de la carpeta) y lo borra al recogerlo.
- `Modelos/` — modelos de IA descargados una sola vez para todas las apps (htdemucs, RoFormer, Whisper, MuScriptor, SAM Audio…).
- `Motor/` — motor local de IA: `uv` + Python 3.11 + PyTorch (CUDA si hay NVIDIA en Windows; Metal en Mac Apple) y las partes
  `separar` (audio-separator: BS-RoFormer, Mel-RoFormer, htdemucs_ft/6s), `letra` (faster-whisper large-v3), `notas`
  (MuScriptor) y `sam` (SAM Audio; instala Git portátil en Windows si falta). Servidor `engine/server.py` en 127.0.0.1
  (puerto libre), un trabajo pesado cada vez, progreso por sondeo. Se instala desde la pestaña Extractor.
- `apps.json` — dónde está instalada cada app (cada una se registra al abrirse) para que «Enviar a…» pueda abrir la otra.
- MuScriptor y SAM Audio piden una cuenta gratuita de Hugging Face y aceptar su licencia: el token se guarda en
  `Motor/ajustes.json` (campo en la pestaña Extractor).
- Menú Ayuda → «Abrir la carpeta compartida». El informe de error incluye la carpeta y el estado del motor.
- Autoprueba: además de lo anterior, comprueba `shDesktop`, `sh-core` y una ida y vuelta por la bandeja; con
  `SH_TEST_ENGINE=1` y el motor instalado, separa 3 s de audio de prueba. Variables: `SH_SHARED_DIR` (otra carpeta compartida).
- Probado (19-11-2026, Linux + Xvfb): autoprueba OK, bandeja OK, motor local por CPU (htdemucs_ft: 3 s en 53 s; BS-RoFormer
  voz OK). **No probado:** Windows y Mac reales, GPU (CUDA/Metal), instalación del motor con uv en Windows/Mac,
  MuScriptor y SAM Audio con modelos reales (necesitan token), MinGit.
- Android: cada APK tiene su propio almacenamiento, así que la bandeja entre apps no cruza de una app a otra (sí en la web).

## Plataforma única «SampledHead» (1.6.0, plataforma 1.0.0)
Todas las apps de Windows/Mac en un solo programa (`desktop/suite/`). Las apps sueltas se siguen generando por ahora.
- **Qué entra:** las apps de `apps.json` con `windows` o `mac` en `platforms`. **Pop!Pads** tiene `platforms: ["android"]`:
  solo web y Android (ni plataforma ni instaladores de Windows/Mac).
- **Inicio** (`suite/home/index.html`, servido en `shapp://home/`): logo, una tarjeta por app elegida (abierta/cerrar,
  Ctrl/Cmd+n), plugins y ajustes (elegir apps y plugins, traer datos de las apps sueltas, carpeta compartida,
  actualizaciones, informe). Primera vez: «¿Qué quieres instalar?» con apps, plugins y la opción de importar.
- **Cada app** en su `WebContentsView` a pantalla completa, con partición propia `persist:<id>` y el mismo origen que la app
  suelta (`shapp://app/`). Sin pestañas: asa «SH» en el borde izquierdo (vuelve al inicio), Ctrl/Cmd+0 inicio,
  Ctrl/Cmd+1…9 apps, menú «Apps». Telón con el color y el icono de la app al cambiar. Las apps abiertas siguen vivas.
- **Actualizaciones:** un `updater.js` por app (`userData/apps/<id>/contenido`): cada app se actualiza sola desde su repo;
  si está a la vista se avisa y si no se recarga. Si una versión nueva no carga, vuelve a la anterior. El programa avisa
  si hay un instalador nuevo de la plataforma (versión sacada del nombre `SampledHead-X.Y.Z-…`).
- **Interconexión:** `shared.js` con `appOf(wc)` y `openApp` → «Enviar a…» cambia de vista dentro de la plataforma.
  `apps.json` de la carpeta compartida apunta las apps al programa con `--app=<id>` (las apps sueltas también la abren).
- **Importar de las apps sueltas:** copia `Local Storage`, `IndexedDB`, `databases` y `File System` de
  `appData/<productName>` a `userData/Partitions/<id>` al arrancar (antes de abrir ninguna app) y reinicia.
- **Traer datos de las versiones web (1.0.1):** cada app web guarda una copia `.shdatos` (sh-core `SH.backup`: solo sus
  claves de localStorage y sus bases IndexedDB). «Traer mis datos» → «Elegir archivos .shdatos» las deja en
  `userData/pendientes/<app>.shdatos`; al abrir la app, sh-core la pide (`shDesktop.backup.pending`), la aplica y recarga.
- **Plugins VST3/AU** (`apps.json → plugins`: FuzzHead y SampledHead Tuner): descarga el último `vst-v*` de su repo.
  Windows: `C:\Program Files\Common Files\VST3` (pide permiso de administrador una vez; si se rechaza, carpeta del usuario
  `%LOCALAPPDATA%\Programs\Common\VST3`). Mac: `~/Library/Audio/Plug-Ins/VST3` y `Components`, sin cuarentena.
- **Compilación:** `scripts/clone-all.sh` + `scripts/prepare-suite.js` + electron-builder (Windows) / `mac-zip.sh suite`
  (Mac). Jobs `build-suite-windows` / `build-suite-mac`; en el de Mac corre la autoprueba en Linux con Xvfb.
  Artefactos: `SampledHead-<versión>-Windows-Setup.exe`, `SampledHead-<versión>-Mac-AppleSilicon.zip` / `-Mac-Intel.zip`.
  `release.sh` conserva el prefijo `SampledHead-`.
- **Autoprueba** (`SH_SELFTEST`): inicio, cada app abierta (elementos, sh-core, appId), «Enviar a…» de SampledHead App a
  FuzzHead (cambia de vista y llega a su bandeja) y vuelta al inicio. Probado en Linux + Xvfb (19-11-2026): OK.
  **No probado:** Windows y Mac reales, instalación de plugins (permiso de administrador en Windows, ditto en Mac),
  importación con datos reales de las apps sueltas.

## Historial de versiones
- **1.6.1** (19-11-2026): plataforma 1.0.1 y paquetes 1.3.1: «Traer mis datos» acepta copias `.shdatos` de las versiones web.
- **1.6.0** (19-11-2026): plataforma única SampledHead 1.0.0; Pop!Pads solo web y Android; paquetes 1.3.0 (`shared.js` admite la plataforma y abrir apps con argumentos).
- **1.5.0** (19-11-2026): paquetes 1.2.0. Carpeta compartida Documentos/SampledHead (bandeja entre apps, modelos y motor local de IA), `preload.js` con `window.shDesktop`, abrir una app desde otra, autoprueba ampliada.
- **1.4.0** (19-11-2026): paquetes 1.1.2. Android: la app ya no queda tapada por la barra de estado (Android 15+) y el
  botón «Descargar» del aviso de programa nuevo descarga el APK directamente (antes, en Pop!Pads, abría la página de
  GitHub por no coincidir el nombre). Copia del APK con el nombre visible en la release y `release.sh` la conserva.
- **1.3.0** (19-11-2026): **iconos adaptativos en Android** (paquetes 1.1.1). Antes Android metía el icono en una placa blanca porque solo había un PNG. `android/scripts/make-icons.py` genera, desde `desktop/icons/<id>.png`, una capa de fondo (color liso del propio icono), el dibujo con un ajuste por tipo de icono (a sangre, redondeado, con marco, círculo) y la capa monocroma para los iconos temáticos de Android 13+. Comprobado con vista previa en círculo, squircle, cuadrado redondeado y gota, y con `aapt` en el APK. Si cambia un icono: `python3 android/scripts/make-icons.py --preview /tmp/iconos.png` y revisar la vista previa.
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
  El relleno de las barras del sistema (1.1.2) se ha compilado en GitHub Actions pero no se ha visto en un móvil real.
- Sin actualizaciones automáticas dentro del programa: las versiones nuevas se descargan de Releases.
- Iconos: copiados en `icons/`; si una app cambia de icono hay que regenerar el suyo.
- No es un plugin VST: las versiones VST/AU están pendientes (siguiente paso: Tuner).
