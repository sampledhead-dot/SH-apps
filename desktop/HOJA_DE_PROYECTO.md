# SampledHead Desktop — Hoja de proyecto

**Versión actual:** 1.0.0 (18-11-2026) · etiqueta de descargas `escritorio-v1.0.0`
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
- `../.github/workflows/desktop.yml` — compila en GitHub Actions las 9 apps para Windows y para Mac **por separado**
  (cada sistema publica en cuanto termina) y las sube a Releases con `scripts/release.sh`, que además retira
  las descargas de apps que ya no estén en la lista. Se lanza al cambiar `desktop/`, cada lunes (recoge las novedades de cada app) o a mano
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
- **1.0.0** (18-11-2026): primera versión. 9 apps (el portal SH-apps queda fuera por decisión: solo web), Windows (instalador) y Mac (DMG universal), publicación en Releases,
  enlace en el portal (portal v9).

## Límites conocidos
- **Sin firma de código**: Windows muestra «Windows protegió su PC» (Más información → Ejecutar de todas formas) y Mac pide
  clic derecho → Abrir la primera vez (o `xattr -cr "/Applications/App.app"`). Firmar requiere certificados de pago
  (Apple Developer y uno de Windows).
- **Probado solo en Linux** (autoprueba de las apps con Electron real, empaquetado Linux y montaje de la app de Windows).
  Los instaladores de Windows y Mac se generan en GitHub Actions; no se han podido abrir en un Windows o Mac reales.
- Las funciones que en la web descargan modelos o librerías de internet (separación de stems con IA en Editor, CrazyHead y
  Sample Pack Builder, MP3 del Editor) **siguen necesitando conexión** en escritorio.
- MIDI: el permiso se concede; no se ha podido probar con un dispositivo MIDI real.
- Cada app ocupa unos 100 MB (Windows) / 250 MB (Mac universal) porque incluye su propio Chromium.
- **Mac**: las máquinas Mac de GitHub (`macos-latest` y `macos-15`) no se han asignado a esta cuenta el 18-11-2026
  (los trabajos se quedan en cola). Los DMG se publicarán solos en cuanto GitHub asigne Macs; si no ocurre, revisar
  Settings → Actions de la cuenta o compilar en un Mac propio (`desktop/README.md`).
- Sin actualizaciones automáticas dentro del programa: las versiones nuevas se descargan de Releases.
- Iconos: copiados en `icons/`; si una app cambia de icono hay que regenerar el suyo.
- No es un plugin VST: las versiones VST/AU están pendientes (siguiente paso: Tuner).
