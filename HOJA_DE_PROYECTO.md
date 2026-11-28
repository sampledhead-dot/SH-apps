# Hoja de proyecto · SampledHead Portal

## Descripción
Página índice (GitHub Pages) con todas las apps de SampledHead: logo arriba, una tarjeta por app (logo, nombre, descripción) que abre cada una en pestaña nueva, y enlaces a Instagram, correo y Bandcamp en el pie.

## Arquitectura
- `index.html` — estructura, pie con enlaces, versión y botón de informe.
- `styles.css` — estética del logo: fondo naranja liso #d65f00, blanco roto, negro, tarjetas tipo sticker.
- `app.js` — lista `APPS`, tarjetas, carga de iconos, informe de error.
- `logo.png` — logo de SampledHead (720 px de ancho, fondo transparente).
- `eye-white.png`, `eye-pupil.png`, `eye-lid.png` — recortes del logo original para animar el ojo (blanco del ojo sin pupila, pupila y párpado).
- `icons/` — copia de seguridad del icono de cada app (se usa solo si no se puede leer el icono vivo).
- `portal-standalone.html` — todo en un solo archivo (con imágenes incrustadas) para probar en local/móvil. Se genera con `python3 scripts/build_standalone.py`.

## Hoja de versiones y descargas (v11)
Al pulsar una tarjeta se abre una hoja con todas las versiones de esa app:
- **Abrir versión web** (siempre la primera).
- **Descargar e instalar**: Windows (.exe), Mac Apple Silicon y Mac Intel (.zip) y Android (.apk). La lista se lee **en directo** de la última release de SH-apps (`api.github.com/repos/sampledhead-dot/SH-apps/releases/latest`), con versión y tamaño, y se guarda 30 min en `sessionStorage`. Cada app se reconoce por su prefijo `dl` en `APPS` (= `productName` de `desktop/apps.json` con guiones).
- **Plugin para tu DAW** (solo apps con `vst`: Tuner y FuzzHead): se lee la última release `vst-v*` de su propio repo (zip con VST3 + Standalone).
- Se marca «para tu dispositivo» la opción que corresponde al sistema detectado (Android → APK, Windows → .exe, Mac → los dos Mac, iPhone → web) y se pone arriba.
- Si GitHub no responde (sin red o límite de 60 consultas/hora), se usan enlaces de reserva: `DL_FALLBACK` (tag y versión de las apps) y `vst.tag`/`vst.file` de cada app. **Al publicar una nueva versión de las apps o de un VST, actualizar esos valores.**
- Enlace directo a la hoja de una app: `…/SH-apps/#app=fuzzhead` (`#app=` + prefijo `dl` en minúsculas).
- Desplegable «¿Cómo se instala?» con los avisos de Windows SmartScreen, Mac (clic derecho → Abrir), Android (apps desconocidas), iPhone (web) y VST.
- Cerrar: ✕, tecla Esc o tocar fuera. En móvil sale como hoja desde abajo.

## Plugins para MPC Sample · Melodee (v21, 28-11-2026)
- Petición del usuario: los plugins de Sampled Head para la MPC Sample (firmware Melodee) descargables desde el portal.
- Los zips están en este repo, carpeta `melodee/` (se sirven por GitHub Pages: `MPC_BASE` = `…/SH-apps/melodee/`).
  No se usan releases porque la sesión no puede crear releases por la API. Versiones actuales: ScratchHead 0.9.0,
  CrazyHead, FuzzHead, GlitchHead y TapeHead 0.2.0.
- `APPS[].mpc = { file, v, size, kind, desc }`: la hoja de la app muestra «Plugin para MPC Sample (Melodee)»
  (CrazyHead, FuzzHead, GlitchHead, TapeHead). **ScratchHead** tiene tarjeta propia (`mpcOnly`): su hoja abre la guía de
  Chuleta Beat y la descarga.
- Sección nueva «Plugins para MPC Sample» (`#mpc`, debajo de las apps) con una tarjeta por plugin (ScratchHead primero) y
  enlace «🎚️ Plugins para MPC Sample (Melodee)» encima de las apps. Enlace directo: `…/SH-apps/#app=scratchhead`.
- **Al publicar una versión nueva de un plugin de Melodee**: copiar el zip a `melodee/`, borrar el viejo y cambiar
  `file`, `v` y `size` en `APPS`; regenerar `portal-standalone.html`; subir `C` en `sw.js`.
- Código de los plugins: hojas `Plugins_Melodee_HOJA_DE_PROYECTO.md` y `ScratchHead_HOJA_DE_PROYECTO.md` (proyecto de Claude).
- No están en la app de escritorio/Android (`desktop/apps.json`): un plugin de la MPC no se instala en el ordenador.

## Iconos que se actualizan solos
Al abrir el portal, `app.js` lee en directo el `manifest.webmanifest` de cada app (o su `logo.svg` en el caso de Sample Pack Builder), toma el icono "any" más grande y lo muestra. Si cambias el icono en una app y la subes a GitHub Pages, el portal lo muestra sin tocar nada. Orden de preferencia: icono vivo → copia en `icons/` → emoji.
Requisitos: el portal debe estar en un dominio que pueda leer las apps (GitHub Pages envía CORS abierto, vale desde cualquier sitio). Si una app deja de declarar su icono en el manifest, el portal no se entera.

## Instalación en el móvil (PWA)
- `manifest.webmanifest`, `sw.js`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`.
- Todas las rutas son relativas: funciona en la raíz del sitio o en una subcarpeta (`/mi-repo/`).
- Requiere HTTPS (GitHub Pages lo es). No funciona abriendo el archivo en local (`file://`).
- Android/Chrome: aparece el botón "Instalar en el móvil" y también el menú del navegador. iPhone/Safari: Compartir → Añadir a pantalla de inicio.
- El service worker solo cachea los archivos del portal; no toca las demás apps ni la lectura en vivo de sus iconos. Al cambiar archivos del portal, subir el número de versión en `sw.js` (`C`) para forzar la actualización.

## Ojo animado
El logo no se redibuja. Encima del `logo.png` se colocan tres recortes del propio logo en su posición exacta: la pupila sigue al ratón, en móvil (o con el ratón quieto) lanza miradas sueltas y vuelve a la pose original, parpadea cada ~5,5 s y guiña al tocar el logo. El logo entero flota 7 px. Con "reducir movimiento" activado en el sistema, todo queda quieto. Si los recortes no cargan, se ve el logo fijo.
Si se cambia el logo, hay que volver a recortar las tres capas y revisar las medidas (`EYE` en `app.js` y `.eye` en `styles.css`).

## Historial de versiones
- **apps-v1.7.4 · plataforma 1.0.12 (28-11-2026): apps nuevas visibles solas y plugins de MPC Sample en los programas.** (1) PocketHead no salía en escritorio ni en Android porque los dos guardan la lista de «Elegir apps» y una app nueva quedaba fuera. Ahora guardan también las apps conocidas (escritorio: `known` en `eleccion.json`; Android: `conocidas` en las preferencias) y añaden solas a las elegidas las que trae una versión nueva. Migración: si no hay lista, todas menos `NEW_APPS` (`pockethead`). (2) Sección **«Plugins para MPC Sample (Melodee)»** en el inicio de los dos programas. Lista única en `melodee/plugins.json` (la leen en línea desde Pages y, si falla, usan la copia incluida al compilar), con iconos `mpc-<id>.png`. Escritorio: «Descargar» (Descargas/SampledHead/MPC Sample) y «Copiar a la tarjeta SD…» (elige la tarjeta, su carpeta Melodee o Plugins y deja el zip en Melodee/Plugins). Android: «Descargar» abre la descarga en el navegador. Regla: al publicar un plugin MPC nuevo, actualizar `melodee/plugins.json` además de `app.js` y `portal-standalone.html`.
- **apps-v1.7.3 · plataforma 1.0.11 · portal v22 (28-11-2026): iconos con el estilo del logo** (petición del usuario). Chuleta Beat, CrazyHead, Editor, PocketHead, Sample Pack Builder, TonoPad, Tuner y ScratchHead pasan al formato de FuzzHead/GlitchHead/TapeHead: círculo naranja `#d9600b` con sombra `#a94a07`, aparato en crema `#f3efe9` con huecos naranjas y negros, y pegatina negra inclinada (−4°) con el nombre en Fira Sans Black Italic. Generador: `android/scripts/iconos-logo-gen.py` (SVG 512 → PNG 1024 con Chrome). Copias en `desktop/icons/<id>.png`, `icons/` del portal (spb y tonopad pasan de .svg a .png; spb ya lee su icono del manifiesto) y Android (`make-icons.py`: estos usan fondo naranja y 72 dp, como FuzzHead). Sampler, FuzzHead, GlitchHead y TapeHead ya seguían el formato; Pop!Pads mantiene el suyo (app aparte).
- **v20 (28-11-2026): nueva app PocketHead** (`pockethead/`): presets por texto para el Sonicake Pocket Master con IA Gemini (clave gratuita del usuario), afinación y biblioteca. Icono en `icons/pockethead.png`. También en `desktop/apps.json` (paquetes 1.7.2, plataforma 1.0.10) y con iconos Android (`android/icons/pockethead`). Sin sh-core por ahora: no sale en «Enviar a…» ni en las copias de datos.
- **apps-v1.7.0 · plataforma 1.0.8 · sh-core 1.6.0 (27-11-2026): «Enviar a Melodee»** (MPC Sample con el firmware Melodee, conectada por USB-C). Melodee sirve una web en http://192.168.155.1 / http://melodee.local (`/status`, `/list`, `/mkdir`, `/upload`; código en keremimo/melodee-sample `src/melodee/web/web_app.cpp`) sin cifrar y sin CORS, así que la web de github.io no puede llamarla. Nuevo: `SH.melodee` en sh-core (status, list, mkdirs, upload, freeName, send; prueba 192.168.155.1 y luego melodee.local); en escritorio `shDesktop.net.req` (IPC `sh:net` → `localHttp` en `desktop/app/shared.js`, solo esos dos hosts); en Android `window.SHNet` (`LocalHttp.java`: begin/chunk/end en base64 → evento `__shNetEv`), en apps sueltas y app única, con `network_security_config.xml` que solo deja HTTP sin cifrar hacia esos dos hosts. Lo usan SampledHead App 1.81 (proyecto MPC en `MPC-Sample/Projects`) y TonoPad v15.01 (WAV + .sfz en `Melodee/Samples/TonoPad`). sh-core 1.6.0 solo en sampler, TonoPad y Chuleta (las demás siguen en 1.5.0; no lo necesitan). Sin probar con la MPC real.
- **v19 (25-11-2026): VST de CrazyHead**. La tarjeta de CrazyHead lleva ahora `vst` (repo `CrazyHead-VST`, release `vst-v*`): su hoja ofrece el plugin VST3/AU/Standalone (instrumento de una pista) además de la web y las apps. Plataforma 1.0.6: plugin `crazyhead-vst` en `desktop/apps.json`.
- **Plataforma 1.0.7 (25-11-2026): se actualiza sola.** Descarga en segundo plano el instalador de su sistema y lo instala (Windows: NSIS `/S --updated --force-run`; Mac: `ditto` + script que cambia el `.app` al cerrar). Pregunta «Reiniciar ahora / Al cerrar»; si no puede (sin permiso de escritura), vuelve al aviso «Descargar». `programa.json` deja solo la versión más nueva de cada instalador de la plataforma: hasta la 1.0.6 el programa cogía el primero de la lista (1.0.5) y no avisaba.
- **apps-v1.5.2 (25-11-2026): «SampledHead no responde»**. El usuario vio el aviso de Android (Esperar/Aceptar) en CrazyHead › Glitch dentro de la app única 1.5.1; con «Esperar» se recuperó. No se reproduce en Chrome de escritorio (ni con la CPU 10× más lenta y loops de 120 s: la tarea más larga fue ~0,9 s), así que el bloqueo es de la página (JavaScript ocupado) en el WebView del móvil y aún no se sabe qué acción lo causa. Cambios: (1) el informe apunta cada **tarea larga** de la página (≥ 300 ms) con la **última acción** que la provocó (botón/elemento tocado), en la app única y en las sueltas; (2) la app única vigila el proceso de las páginas (`WebViewRenderProcessClient`): apunta en el informe cuándo deja de responder y cuándo vuelve, y si pasan más de 8 s muestra un aviso propio «X está ocupada» con **Esperar** o **Reiniciar** (reinicia las páginas y guarda informe; lo guardado no se pierde); (3) al caerse el proceso de las páginas solo se guarda un informe y se reinicia una vez (antes cada vista abierta lo repetía). Pendiente: con el próximo informe del móvil, ver qué tarea larga fue y corregirla en la app.
- **sh-core 1.5.0 (24-11-2026): menú común «☰ Menú»** en las 9 apps (ver `sh-core/README.md`): Proyecto · Importar · Exportar · Otras apps · Copia de tus datos · Ajustes · Ayuda; informe .txt común (`SH.report`). Versiones: Sampler 1.80, CrazyHead 1.24, Editor 1.22, TonoPad v14.01, FuzzHead 1.0.4, GlitchHead 1.0.1, SPB v15, Tuner 1.04, Chuleta 1.3.4. Las apps instaladas lo reciben solas (listas de `actualizaciones`).
- **apps-v1.5.1 (24-11-2026)**: **actualizaciones sin la API de GitHub**. El informe de la app única dio «HTTP 403» en todas las apps (la API sin cuenta permite 60 consultas/hora por IP y en datos móviles se comparte IP). Nuevo workflow `actualizaciones` (`.github/workflows/manifest.yml`, cada 20 min y al cambiar `apps.json`) que con el token de Actions publica en la prerelease `actualizaciones` un `<repo>.json` por app (`{repo, sha, date, files:[[ruta, huella git, bytes]]}`) y `programa.json` (última `apps-v*` con sus archivos) — `desktop/scripts/manifest.js`. Android (Updater.java, sueltas y app única) y escritorio (`desktop/app/updater.js`, plataforma) leen primero esas listas (descarga de release, sin límite) y solo si fallan preguntan a la API; los archivos se siguen bajando de raw.githubusercontent.com fijados al commit. sh-core 1.4.1: al sumar una copia en una base recién creada se hace con la MISMA versión que la copia (antes la dejaba en la 2 y el sampler, que abría la 1, no veía nada); Sampler 1.79, Editor 1.21 y CrazyHead 1.23 abren sus bases sin versión fija.
- **apps-v1.5.0 (24-11-2026): app única «SampledHead» para Android** (petición del usuario: como en Mac/Windows, instalar solo una, elegir apps, conexión más fluida y actualizar cada una por separado; Pop!Pads sigue aparte; las apps sueltas se mantienen un tiempo). APK `SampledHead-<v>-Android.apk` (`com.sampledhead.suite`, job `build-android-suite`): todas las apps dentro (funciona sin internet), mismo origen → «Enviar a…» al momento por la bandeja web; inicio con elegir apps, abrir/cerrar, «Abiertas a la vez» (3 por defecto; se cierra la menos usada), «Traer mis datos» (de las apps sueltas con un toque o de copias .shdatos; SUMA), «Buscar actualizaciones» por app; asa «SH» arrastrable en el borde izquierdo. sh-core 1.4.0 (`SHSuite`: `SH.open` cambia de vista, `SH.isSuite`). Shell de las apps sueltas 1.5.0: responde a `com.sampledhead.EXPORTAR` con su copia de datos. Portal v18: la tarjeta «SampledHead» abre su hoja de descargas (Windows, Mac y Android).
- Android shell 1.4.0 + sh-core 1.3.0 (24-11-2026) — envío directo entre apps Android instaladas: `OutboxProvider` (sirve los `.shitem` salientes), intent `com.sampledhead.RECIBIR` (actividad `singleTask`, copia a `filesDir/bandeja`), métodos `outBegin/outEnd/hasApp/sendTo/openApp/inboxList/inboxDone` y ruta `/__bandeja__/`. Antes «Enviar a…» abría la web en Chrome y la otra app no recibía nada. Segundo plano: servicio en primer plano `KeepAlive` (notificación mínima «Abierta en segundo plano») y prioridad de renderizado importante para que Android no cierre la app al cambiar a otra. sh-core 1.3.0 repartido a las 9 apps; compilación `apps-v1.4.0`.
- sh-core 1.2.2 (21-11-2026) — la copia `.shdatos` del Editor incluye su biblioteca «Mis proyectos» (IndexedDB `shed-projects`; `OWN.editor.idb`). Repartido a todas las apps el mismo día (cachés de los sw.js subidas donde servían primero la caché) y compilado en `apps-v1.3.15` (Windows, Mac, Android y plataforma 1.0.5).
- v17 — tarjeta de **GlitchHead** (web + VST3/AU: Shred · Haze · Split). sh-core 1.2.1 (GlitchHead en «Enviar a…» y en las copias de datos).
- v16 — descargas siempre al día: la hoja consulta GitHub al abrirse (caché de 2 min, antes 30) y mira las 3 últimas releases `apps-v*`; si una descarga aún no está en la nueva, ofrece la de la anterior. Fuera los enlaces de reserva con nombres inventados (`DL_FALLBACK`): si GitHub no responde, remite a la página de descargas. `desktop/scripts/release.sh` conserva la release anterior (antes la borraba al publicar la nueva y los enlaces abiertos o guardados daban 404).
- v15 — tarjeta de **TapeHead** (solo plugin: `vstOnly: true` en `APPS`): la hoja no ofrece web ni instaladores; enseña «Probar en TonoPad» (`alt`) y los zips VST de Windows y Mac (VST3 + AU + Standalone) de su última release `vst-v*`; en el Mac/Windows del visitante se marca el suyo. Ayuda de instalación de VST con la ruta de Mac.
- v14 — enlace destacado a **SampledHead para Windows y Mac** (todas las apps en un programa); Pop!Pads solo ofrece web y Android (`only: ["apk"]` en `APPS`); `sh-core/` (base común de las apps) vive en este repo.
- v1 — primera versión (3 archivos).
- v2 — informe de error .txt, versión en pie, standalone, hoja de proyecto.
- v3 — estética del logo real, logo de SampledHead, iconos reales de las 8 apps (extraídos de sus zips), iconos que se actualizan solos, enlaces a Instagram/correo/Bandcamp.

- v4 — fondo naranja liso (sin cuadrícula), ojo del logo animado (mirada, parpadeo, flotación).
- v5 — descripción de CrazyHead corregida (sampler con generador de secuencias aleatorias, cuatro pistas y efectos).
- v6 — nueva app: TonoPad (`Tono-Pad/`, icono SVG en su manifest).
- v7 — el portal ya se puede instalar en el móvil (PWA): `manifest.webmanifest`, `sw.js`, iconos 192/512/maskable/apple-touch, botón "Instalar" y aviso para iPhone.
- v8 — nueva app: FuzzHead (`FuzzHead/`, sintetizador para guitarra y bajo; icono PNG en su manifest, copia en `icons/fuzzhead.png`).
- v13 — enlaces de reserva de descargas a la versión 1.1.1 de las apps (iconos adaptativos en Android).
- v12 — enlaces de reserva de descargas actualizados a la versión 1.1.0 de las apps (la primera que se actualiza sola).
- v11 — **cada tarjeta abre sus versiones**: web, Windows, Mac (Apple Silicon e Intel), Android y, en Tuner y FuzzHead, el VST. Descargas leídas en directo de GitHub Releases con reserva, opción «para tu dispositivo», ayuda de instalación y enlaces directos `#app=`. Script `scripts/build_standalone.py`.
- v10 — el enlace del pie pasa a «Descargar apps (Windows · Mac · Android)»: ahora hay también versiones Mac y Android. El portal sigue siendo solo web.
- v9 — versiones de escritorio (Windows/Mac) de las apps (el portal se queda solo como web, sin escritorio ni VST): carpeta `desktop/` + workflow `.github/workflows/desktop.yml` que las publica en Releases; enlace «Apps de escritorio (Windows / Mac)» en el pie. Detalles en `desktop/HOJA_DE_PROYECTO.md`.

## Reglas permanentes
- Entrega en `nombre-vN.zip` con carpeta `nombre-vN`, versión visible en el pie.
- Incluir siempre versión standalone de un solo archivo.
- Informe de error .txt automático y botón "Descargar informe (.txt)".
- Probar en navegador headless antes de entregar.

## Límites conocidos
- App única Android (1.5.0): sin probar en un móvil real. Se comprobó la compilación del Java, el inicio y sh-core en Chrome con un `SHSuite` simulado (elegir apps, abrir, actualizar, envío entre apps, sumar una copia .shdatos). Las apps abiertas que no se ven se dejan transparentes detrás de la actual (no ocultas) para que sigan sonando; puede gastar algo más de batería: bajar «Abiertas a la vez» si va justo. Traer datos de las apps sueltas solo funciona con apps sueltas 1.5.0 o posteriores (si no, usar «Guardar copia» en cada una).
- El envío entre apps Android solo funciona entre APK compilados con el shell 1.4.0 o posterior (instalar de nuevo todas desde el portal). No se pudo probar en un móvil real: se probó compilando el Java y con un `SHAndroid` simulado en el navegador.
- La hoja de descargas depende de la API pública de GitHub (60 consultas/hora por conexión; se hacen 1–2 por visita). Si se supera, salen los enlaces de reserva con un aviso.
- Los instaladores no tienen certificado de pago: Windows y Mac muestran un aviso la primera vez (explicado en la propia hoja).
- La carpeta `desktop/` también la publica GitHub Pages (son solo scripts e iconos; no afecta al portal).
- Si alguna app cambia de URL, hay que actualizar `APPS` en `app.js`.
- El Tuner usa `Sampledhead-tuner/` (T minúscula); GitHub Pages distingue mayúsculas.
- La lectura en vivo de iconos no se pudo probar contra GitHub desde el entorno de desarrollo (sin red); se probó simulando las respuestas.
