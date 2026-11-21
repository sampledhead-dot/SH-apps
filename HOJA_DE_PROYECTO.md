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
- La hoja de descargas depende de la API pública de GitHub (60 consultas/hora por conexión; se hacen 1–2 por visita). Si se supera, salen los enlaces de reserva con un aviso.
- Los instaladores no tienen certificado de pago: Windows y Mac muestran un aviso la primera vez (explicado en la propia hoja).
- La carpeta `desktop/` también la publica GitHub Pages (son solo scripts e iconos; no afecta al portal).
- Si alguna app cambia de URL, hay que actualizar `APPS` en `app.js`.
- El Tuner usa `Sampledhead-tuner/` (T minúscula); GitHub Pages distingue mayúsculas.
- La lectura en vivo de iconos no se pudo probar contra GitHub desde el entorno de desarrollo (sin red); se probó simulando las respuestas.
