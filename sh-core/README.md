# sh-core — base común de las apps de Sampled Head

Un solo archivo, `sh-core.js`, que llevan todas las apps. Se edita **solo aquí** y se reparte con:

```bash
node sh-core/sync.js        # copia sh-core.js a cada repo que esté junto a SH-apps
```

Cada app lo carga con `<script src="sh-core.js"></script>` antes de su propio código y lo añade a la lista de
archivos de su `sw.js`. En las versiones standalone de un solo archivo va incrustado.

## Qué hace
| Pieza | Web | Windows y Mac |
| --- | --- | --- |
| Bandeja entre apps (`SH.bridge`) | IndexedDB `sh-bridge`, buzón `v2:in:<app>` · en las apps Android instaladas (1.3.0): archivo `.shitem` que se pasa a la otra app con un intent `com.sampledhead.RECIBIR` | Carpeta `Documentos/SampledHead/Bandeja/<app>/` |
| Aviso de llegada | BroadcastChannel + al volver a la pestaña | Vigilancia de la carpeta |
| Abrir otra app (`SH.open`) | Pestaña nueva en GitHub Pages | El programa instalado; si no está, la web |
| Modelos de IA (`SH.models`) | Caché `sh-models-v1` (reaprovecha `spb-models-v1`) | Carpeta `Documentos/SampledHead/Modelos/` |
| Motor local (`SH.engine`) | — | `Documentos/SampledHead/Motor/` (Python, GPU) |
| Hojas «Enviar a…» y «Recibido» (`SH.ui`) | Sí | Sí |

## Formato de un elemento de la bandeja
```js
{ id, name, from, ts, kind: 'pad'|'loop'|'stem'|'phrase'|'notes'|'kit',
  wav: ArrayBuffer (WAV 24 bits) | null, sr, secs, bpm?, key?, notes?: [{t, d, p, v}], meta?: {} }
```
Para enviar se puede pasar `audio: AudioBuffer` en lugar de `wav` y sh-core lo convierte.

## Apps y lo que reciben
| id | App | Recibe |
| --- | --- | --- |
| sampler | SampledHead App | pad, loop, stem, frase, kit, notas |
| editor | SampledHead Editor | pad, loop, stem, frase |
| crazyhead | CrazyHead | loop, stem, pad, frase |
| fuzzhead | FuzzHead | stem, loop, frase, pad |
| glitchhead | GlitchHead | loop, stem, pad, frase |
| spb | Sample Pack Builder | stem, loop |
| tuner | SampledHead Tuner | stem, loop, notas |
| tonopad | TonoPad | stem, loop, pad, notas |

Las claves antiguas (`toEditor`, `toSampler`, `toCrazyHead`, `fromCrazyHead`) se siguen leyendo en las apps
que ya las usaban, para no romper nada.

Pop!Pads es independiente (pensada para niños): no lleva sh-core ni aparece en «Enviar a…».

## Copia de datos (`SH.backup`, desde 1.1.0)
Cada app exporta solo lo suyo a un archivo `.shdatos` («SHDAT1» + JSON + binarios): sus claves de localStorage y sus bases
IndexedDB (tabla `OWN`). `SH.backup.sheet(me)` = hoja «Guardar copia / Recuperar copia»; está en el botón «⇄ Apps» de cada
app (Chuleta Beat: «💾 Datos»; SampledHead App: menú Más). En la plataforma de escritorio, la copia que deja
«Traer mis datos» se aplica sola al abrir la app.

## Copias de datos (.shdatos) — sh-core 1.2.0 (19-11-2026)
«Añadir una copia» **suma**, no sustituye (decisión del usuario: no sobrescribir nunca). `SH.backup.restore(me, ab)`:
- lo que no existe se añade; lo idéntico se salta; si hay algo con la misma clave pero distinto se guarda como
  «Nombre (copia)» (y «(copia 2)»…); importar dos veces la misma copia no duplica nada;
- en almacenes con `keyPath` (p. ej. proyectos de TonoPad con `id`) el id nuevo arrastra lo que cuelga de él en los otros
  almacenes (audio `id` y `id#s`);
- estado de trabajo (`OWN[app].state`: autoguardado y huecos del generador del sampler, loops cargados de CrazyHead) y
  ajustes sueltos: manda el dispositivo donde se importa;
- en localStorage, las listas y colecciones de objetos (escenas, presets propios, afinaciones…) se suman;
- `{ replace: true }` hace lo de antes (sustituir); no se usa en la interfaz.

## Apps Android instaladas — sh-core 1.3.0 (24-11-2026)
Cada APK tiene su propio almacenamiento, así que la bandeja web (IndexedDB) no llega de una app a otra.
Desde la 1.3.0, si existe `SHAndroid.outBegin` (shell Android ≥ 1.4.0):
1. `SH.bridge.send` empaqueta cada elemento como `.shitem` (`"SHI1"` + longitud JSON u32 LE + JSON + WAV) y lo escribe en `cacheDir/salida` en trozos base64.
2. `SHAndroid.sendTo(appId, nombres)` abre la otra app con el intent `com.sampledhead.RECIBIR` y le da permiso de lectura (ContentProvider `<paquete>.bandeja`).
3. La app destino copia los archivos a `filesDir/bandeja`, avisa con el evento `sh-bandeja` y `SH.bridge.inbox` los mete en su buzón (`/__bandeja__/<nombre>` → IndexedDB) y los borra.
Si la app destino no está instalada, el envío avisa y las hojas «Enviar a…» la muestran como «No instalada». Las apps web y de escritorio siguen igual.

## App única SampledHead para Android — sh-core 1.4.0 (24-11-2026)
Si existe `window.SHSuite` (APK `com.sampledhead.suite`), todas las apps comparten origen: la bandeja es la de la web
(IndexedDB, como en el navegador) y además `SHSuite.notify(to)` avisa a la app destino si está abierta; `SH.open(id)` llama a
`SHSuite.open(id)` (cambia de vista dentro de la app). `SH.isSuite` = true y `SH.isAndroid` = true.

## Menú común «☰ Menú» — sh-core 1.5.0 (24-11-2026)
Petición del usuario: el menú «Más» del sampler estaba desordenado y cada app ordenaba a su manera guardar, exportar y
proyectos. `SH.ui.menu(opts)` pinta el mismo menú lateral en todas las apps, con secciones desplegables siempre en este orden:
**Proyecto · Importar · Exportar · Otras apps · Copia de tus datos · Ajustes · Ayuda**. Cada app pasa sus elementos
(`click: '#botón'` pulsa un botón que ya existía, `run: fn`, `node: '#bloque'` mueve un bloque tal cual, `title: '…'` separador);
«Otras apps» (enviar, recibido con su número, abrir otra app) y «Copia de tus datos» los pone sh-core. Si la app usa
`SH.ui.dock`, sus opciones pasan al menú y no sale el botón flotante «⇄ Apps». `SH.report` = informe .txt común
(`install({me, version, options})`, `download()`). Botón: el de la app (`button: '#id'`) o `button: 'auto'` (☰ fijo arriba a la derecha).
