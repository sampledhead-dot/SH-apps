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
| Bandeja entre apps (`SH.bridge`) | IndexedDB `sh-bridge`, buzón `v2:in:<app>` | Carpeta `Documentos/SampledHead/Bandeja/<app>/` |
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
