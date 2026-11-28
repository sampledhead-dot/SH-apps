/* SampledHead · Portal de apps · v21: plugins para MPC Sample (Melodee): sección propia, ScratchHead y opción «MPC Sample» en CrazyHead, FuzzHead, GlitchHead y TapeHead · v20: nueva app PocketHead (presets por texto para Sonicake Pocket Master) · v18: la tarjeta «SampledHead» (todas las apps en una: Windows, Mac y Android) abre su hoja de descargas · v16 (cada tarjeta abre sus versiones: web, Windows, Mac, Android y VST)
   Añadir una app: copia un bloque de APPS.
   Logos: cada vez que se abre el portal se lee el icono ACTUAL de cada app
   (su manifest.webmanifest o su archivo de logo). Si no se puede leer, se usa la
   copia guardada en icons/, y si tampoco, el emoji. */

const VERSION = "v21";
const BASE = "https://sampledhead-dot.github.io/";
const MAIN_LOGO = "logo.png";
const EYE_WHITE = "eye-white.png";
const EYE_PUPIL = "eye-pupil.png";
const EYE_LID = "eye-lid.png";
const LIVE_TIMEOUT_MS = 6000;
/* Descargas: se leen en directo de GitHub Releases (las 3 últimas apps-v*, caché de 2 min). Si GitHub no responde,
   la hoja remite a la página de descargas de GitHub. */
const GH = "https://github.com/sampledhead-dot/";
const GH_API = "https://api.github.com/repos/sampledhead-dot/";
/* v21: plugins para la MPC Sample con el firmware Melodee (CLAP para su procesador ARM). Los zips están en este mismo
   repo, carpeta melodee/ (se sirven con GitHub Pages). Al publicar una versión nueva: copiar el zip a melodee/ y cambiar
   file/v/size del plugin en APPS. */
const MPC_BASE = BASE + "SH-apps/melodee/";

const APPS = [
  { name: "SampledHead App", dl: "SampledHead-App", url: BASE + "sampledhead-app/", manifest: "manifest.webmanifest", local: "icons/sampledhead-app.png",
    desc: "Sampler de pads en el navegador: graba, edita, haz loops y exporta a Koala, Ableton, MPC y SP-404.", emoji: "🥁" },
  { name: "CrazyHead", dl: "CrazyHead", mpc: { file: "CrazyHead-0.2.0-melodee.zip", v: "0.2.0", size: 681162, kind: "Instrumento", desc: "Trocea un loop de la tarjeta y toca un patrón al azar con el tempo de Melodee. Pads A01–A16 = trozos." }, vst: { repo: "CrazyHead-VST", tag: "vst-v1.0.0", file: "CrazyHead-VST-1.0.0-Windows.zip" }, url: BASE + "CrazyHead/", manifest: "manifest.webmanifest", local: "icons/crazyhead.png",
    desc: "Sampler con generador de secuencias aleatorias, cuatro pistas y efectos. También VST3/AU (una pista) para tu DAW.", emoji: "🌀" },
  { name: "SampledHead Editor", dl: "SampledHead-Editor", url: BASE + "sampledhead-editor/", manifest: "manifest.webmanifest", local: "icons/editor.png",
    desc: "Editor de audio y masterización: recorta, limpia, separa stems con IA y exporta en WAV o MP3.", emoji: "🎚️" },
  { name: "Sample Pack Builder", dl: "Sample-Pack-Builder", url: BASE + "spb-head/", liveIcon: "logo.svg", local: "icons/spb.svg",
    desc: "Sube una canción, separa stems y obtén breaks, loops, golpes, notas y acordes en un ZIP.", emoji: "📦" },
  { name: "Pop!Pads", dl: "PopPads", only: ["apk"], url: BASE + "poppads/", manifest: "manifest.webmanifest", local: "icons/poppads.png",
    desc: "Beat maker de pads para el móvil: graba tu ritmo, cuantiza y toca con tu propia voz.", emoji: "🎤" },
  { name: "Chuleta Beat", dl: "Chuleta-Beat", url: BASE + "Chuleta-beat/", manifest: "manifest.webmanifest", local: "icons/chuleta-beat.png",
    desc: "Buscador de atajos en castellano para SP-404MKII, MPC Sample (Akai y Melodee), Ableton Move, BOSS VE-22 y Sonicake Pocket Master.", emoji: "📋" },
  { name: "SampledHead Tuner", dl: "SampledHead-Tuner", vst: { repo: "Sampledhead-tuner", tag: "vst-v1.0.0", file: "SampledHead-Tuner-VST-1.0.0-Windows.zip" }, url: BASE + "Sampledhead-tuner/", manifest: "manifest.webmanifest", local: "icons/tuner.png",
    desc: "Afinador y acordes para tu instrumento, listo para usar desde el móvil.", emoji: "🎸" },
  { name: "TonoPad", dl: "TonoPad", url: BASE + "Tono-Pad/", manifest: "manifest.webmanifest", local: "icons/tonopad.svg",
    desc: "Detecta el tono y la escala de un audio y genera bancos de 16 pads afinados para SP-404MKII, Move, MPC Sample y Live.", emoji: "🎹" },
  { name: "FuzzHead", dl: "FuzzHead", mpc: { file: "FuzzHead-0.2.0-melodee.zip", v: "0.2.0", size: 206027, kind: "Efecto", desc: "Guitarra o bajo a sintetizador: 5 motores, distorsión, crush, ring y reverb. El más pesado: úsalo en una sola pista." }, vst: { repo: "FuzzHead", tag: "vst-v1.0.1", file: "FuzzHead-VST-1.0.1-Windows.zip" }, url: BASE + "FuzzHead/", manifest: "manifest.webmanifest", local: "icons/fuzzhead.png",
    desc: "Convierte tu guitarra o bajo en sintetizador: 5 motores, distorsión, bitcrush, ring mod y gated reverb.", emoji: "🎛️" },
  { name: "GlitchHead", dl: "GlitchHead", mpc: { file: "GlitchHead-0.2.0-melodee.zip", v: "0.2.0", size: 181355, kind: "Efecto", desc: "Shred, Haze y Split en cadena, con sus 20 presets." }, vst: { repo: "GlitchHead", tag: "vst-v1.0.0", file: "GlitchHead-VST-1.0.0-Windows.zip" }, url: BASE + "GlitchHead/", manifest: "manifest.webmanifest", local: "icons/glitchhead.png",
    desc: "Tres efectos salvajes en cadena: Shred trocea en wavesets, Haze crea texturas con memoria y Split parte la señal con una puerta. También VST3/AU.", emoji: "⚡" },
  { name: "PocketHead", dl: "PocketHead", url: BASE + "pockethead/", manifest: "manifest.webmanifest", local: "icons/pockethead.png",
    desc: "Presets para el Sonicake Pocket Master describiendo el sonido: IA Gemini gratis, tu afinación y tu biblioteca de presets (.prst).", emoji: "📟" },
  /* v15: TapeHead es solo plugin (sin web propia): la tarjeta abre la hoja con el VST y el enlace a TonoPad, que lo lleva dentro */
  { name: "TapeHead", dl: "TapeHead", vstOnly: true, mpc: { file: "TapeHead-0.2.0-melodee.zip", v: "0.2.0", size: 177502, kind: "Efecto", desc: "Previo de casete: satura y engorda pistas, buses o el master. 25 presets." }, vst: { repo: "TapeHead", tag: "vst-v1.0.0", file: "TapeHead-VST-1.0.0-Windows.zip" }, local: "icons/tapehead.png",
    alt: { url: BASE + "Tono-Pad/", t: "Probar en TonoPad (navegador)", s: "TapeHead va dentro de TonoPad como efecto de los pads. Sin instalar nada." },
    desc: "Plugin VST3/AU: la entrada de una multipista de casete de los 80. Satura y engorda guitarras, bajos y baterías (presets punk, post-punk, grunge, noise…).", emoji: "📼" },
  /* v21: ScratchHead es solo para la MPC Sample (Melodee): la tarjeta abre la hoja con su descarga */
  { name: "ScratchHead", dl: "ScratchHead", mpcOnly: true, local: "icons/scratchhead.png",
    mpc: { file: "ScratchHead-0.9.0-melodee.zip", v: "0.9.0", size: 34434060, kind: "Instrumento", desc: "Scratch de vinilo: el fader mueve el sonido del pad como un plato. Pad A04 = corte del crossfader. Trae sonidos de scratch." },
    alt: { url: BASE + "Chuleta-beat/", t: "Guía en Chuleta Beat", s: "Busca «ScratchHead» en la MPC Sample con firmware Melodee: instalar, scratch, pad de corte, recetas." },
    desc: "Plugin para la MPC Sample (firmware Melodee): scratch de vinilo con el fader, pad de corte tipo crossfader, preescucha y sonidos de scratch de serie.", emoji: "💿" }
];

/* ---------- Registro para el informe de error ---------- */
const LOG = [], STEPS = [], t0 = Date.now();
let stage = "inicio";
function step(msg) { stage = msg; STEPS.push(((Date.now() - t0) / 1000).toFixed(2) + "s  " + msg); }
["log", "info", "warn", "error"].forEach(k => {
  const orig = console[k].bind(console);
  console[k] = (...a) => {
    LOG.push("[" + k + "] " + a.map(x => { try { return typeof x === "string" ? x : JSON.stringify(x); } catch (e) { return String(x); } }).join(" "));
    if (LOG.length > 300) LOG.shift();
    orig(...a);
  };
});

function buildReport(where, err) {
  const n = navigator, s = screen;
  const mem = performance && performance.memory ? performance.memory : null;
  return [
    "INFORME DE ERROR · SampledHead Portal " + VERSION,
    "Fecha: " + new Date().toISOString(),
    "Dónde: " + where,
    "Etapa: " + stage,
    "Mensaje: " + (err && err.message ? err.message : String(err || "(informe manual)")),
    "Stack: " + (err && err.stack ? err.stack : "(sin stack)"),
    "",
    "Navegador/UA: " + n.userAgent,
    "Plataforma: " + (n.platform || "?"),
    "Núcleos: " + (n.hardwareConcurrency || "?"),
    "RAM (GB aprox.): " + (n.deviceMemory || "?"),
    "Pantalla: " + s.width + "x" + s.height + " @" + (window.devicePixelRatio || 1),
    "URL/protocolo: " + location.href + " (" + location.protocol + ")",
    "Contexto seguro: " + window.isSecureContext,
    "COOP/COEP (crossOriginIsolated): " + window.crossOriginIsolated,
    "WebGPU: " + ("gpu" in n),
    "Memoria JS: " + (mem ? Math.round(mem.usedJSHeapSize / 1048576) + " MB usados / " + Math.round(mem.jsHeapSizeLimit / 1048576) + " MB límite" : "no disponible"),
    "Opciones elegidas: ninguna (portal de enlaces)",
    "Archivo: ninguno",
    "Resultado parcial: " + document.querySelectorAll(".card").length + " tarjetas pintadas de " + APPS.length,
    "",
    "--- Cronología ---", ...STEPS,
    "",
    "--- Consola (últimas 300) ---", ...LOG
  ].join("\n");
}
function downloadReport(where, err) {
  const blob = new Blob([buildReport(where, err)], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "informe-error-portal-" + VERSION + "-" + new Date().toISOString().replace(/[:.]/g, "-") + ".txt";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
let autoDone = false;
function onFail(where, err) {
  console.error(where, err && err.message ? err.message : err);
  if (autoDone) return;
  autoDone = true;
  downloadReport(where, err);
}
window.addEventListener("error", e => { if (e.target === window) onFail("window.onerror", e.error || e.message); }, true);
window.addEventListener("unhandledrejection", e => onFail("unhandledrejection", e.reason));

/* ---------- Icono actual de cada app ---------- */
async function fetchNoCache(url, as) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), LIVE_TIMEOUT_MS);
  try {
    const r = await fetch(url, { cache: "no-cache", signal: ctl.signal });
    if (!r.ok) throw new Error("HTTP " + r.status + " en " + url);
    return as === "json" ? await r.json() : await r.blob();
  } finally { clearTimeout(timer); }
}

/* Devuelve una URL (blob: o data:) con el icono actual de la app, o lanza error. */
async function liveIconUrl(app) {
  if (app.manifest) {
    const mUrl = app.url + app.manifest;
    const m = await fetchNoCache(mUrl, "json");
    const icons = (m.icons || []).filter(i => !i.purpose || i.purpose.split(" ").includes("any"));
    if (!icons.length) throw new Error("manifest sin iconos");
    icons.sort((a, b) => parseInt((b.sizes || "0").split("x")[0]) - parseInt((a.sizes || "0").split("x")[0]));
    const src = icons[0].src;
    if (src.startsWith("data:")) return src;
    return URL.createObjectURL(await fetchNoCache(new URL(src, mUrl).href, "blob"));
  }
  if (!app.url) throw new Error("app sin web (solo plugin)");
  if (app.liveIcon) return URL.createObjectURL(await fetchNoCache(app.url + app.liveIcon, "blob"));
  throw new Error("sin origen de icono vivo");
}

function setImgSrc(img, src) {
  return new Promise((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("imagen no válida")); img.src = src; });
}

async function loadIcon(app, img, fallback) {
  let shown = false;
  try { await setImgSrc(img, app.local); fallback.replaceWith(img); shown = true; }
  catch (e) { console.warn("icono local no disponible: " + app.name); }
  try {
    const live = await liveIconUrl(app);
    const tmp = new Image();
    await setImgSrc(tmp, live);
    img.src = live;
    if (!shown) fallback.replaceWith(img);
    console.log("icono actualizado desde la app: " + app.name);
  } catch (e) {
    console.warn("icono vivo no disponible (" + app.name + "): " + (e && e.message ? e.message : e));
  }
}

/* ---------- Ojo animado del logo ----------
   El logo no se redibuja: se superponen tres recortes del original (blanco del ojo,
   pupila y párpado) en su posición exacta. Si algo falla, queda el logo fijo. */
const EYE = { cx: 632.5, cy: 390.5, restX: -30.5, restY: 7.5, reach: 31, logoW: 1285 };

function initEye() {
  const stage = document.getElementById("logo-stage");
  const eye = document.getElementById("eye");
  const pupil = document.getElementById("eye-pupil");
  const layers = [["eye-white", EYE_WHITE], ["eye-pupil", EYE_PUPIL], ["eye-lid", EYE_LID]];
  Promise.all(layers.map(([id, src]) => setImgSrc(document.getElementById(id), src)))
    .then(() => { eye.hidden = false; console.log("ojo animado activo"); start(); })
    .catch(e => console.warn("ojo animado no disponible, se deja el logo fijo: " + (e && e.message ? e.message : e)));

  /* x, y: posición de la pupila respecto al centro del ojo, en px del logo original */
  function look(x, y, slow) {
    const k = stage.clientWidth / EYE.logoW;
    pupil.classList.toggle("slow", !!slow);
    pupil.style.transform = "translate(" + ((x - EYE.restX) * k).toFixed(2) + "px," + ((y - EYE.restY) * k).toFixed(2) + "px)";
  }
  const rest = slow => look(EYE.restX, EYE.restY, slow);

  function start() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let lastMove = 0;
    window.addEventListener("pointermove", e => {
      if (e.pointerType === "touch") return;
      lastMove = Date.now();
      const r = eye.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1;
      const m = EYE.reach * Math.min(1, d / 220);
      look(dx / d * m, dy / d * m, false);
    }, { passive: true });

    /* Sin ratón (móvil) o con el ratón quieto: miradas sueltas y vuelta a la pose original */
    (function idle() {
      const wait = 2600 + Math.random() * 3200;
      setTimeout(() => {
        if (Date.now() - lastMove > 2500 && !document.hidden) {
          const ang = Math.random() * Math.PI * 2, m = EYE.reach * (0.35 + Math.random() * 0.65);
          look(Math.cos(ang) * m, Math.sin(ang) * m, true);
          setTimeout(() => { if (Date.now() - lastMove > 2500) rest(true); }, 1100 + Math.random() * 900);
        }
        idle();
      }, wait);
    })();

    stage.addEventListener("click", () => {
      eye.classList.remove("wink"); void eye.offsetWidth; eye.classList.add("wink");
    });
    window.addEventListener("resize", () => rest(false));
  }
}

/* ---------- Instalación como app (PWA) ---------- */
function initInstall() {
  const standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone;
  if (standalone || !/^https?:/.test(location.protocol)) return;     // ya instalada, o abierta como archivo local
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").then(() => console.log("service worker registrado"))
      .catch(e => console.warn("service worker no registrado: " + (e && e.message ? e.message : e)));
  }
  const box = document.getElementById("install");
  const btn = document.getElementById("install-btn");
  const ios = document.getElementById("install-ios");
  let deferred = null;
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault(); deferred = e;
    box.hidden = false; btn.hidden = false; ios.hidden = true;
    console.log("instalación disponible");
  });
  btn.addEventListener("click", async () => {
    if (!deferred) return;
    deferred.prompt();
    const r = await deferred.userChoice.catch(() => ({}));
    console.log("instalación: " + (r.outcome || "sin respuesta"));
    deferred = null; box.hidden = true;
  });
  window.addEventListener("appinstalled", () => { box.hidden = true; console.log("app instalada"); });
  if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent)) { box.hidden = false; ios.hidden = false; }
}

function createCard(app, mpc) {
  const a = document.createElement("button");
  a.type = "button"; a.className = "card";
  a.setAttribute("aria-label", app.name + ": abrir o descargar");
  a.addEventListener("click", () => openSheet(app));

  const fallback = document.createElement("div");
  fallback.className = "icon-fallback"; fallback.textContent = app.emoji;

  const img = new Image();
  img.className = "icon"; img.alt = "Logo " + app.name;

  const info = document.createElement("div"); info.className = "info";
  const h2 = document.createElement("h2"); h2.textContent = app.name;
  const p = document.createElement("p"); p.textContent = mpc ? app.mpc.kind + " · " + app.mpc.desc : app.desc;
  info.append(h2, p);

  const arrow = document.createElement("span");
  arrow.className = "arrow"; arrow.textContent = "›"; arrow.setAttribute("aria-hidden", "true");

  a.append(fallback, info, arrow);
  loadIcon(app, img, fallback);
  if (!app._img || !mpc) app._img = img;
  return a;
}

/* ---------- Hoja de versiones y descargas ---------- */
function slug(app) { return app.dl.toLowerCase(); }
function detectOS() {
  const ua = navigator.userAgent || "", pl = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua) || (pl === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  if (/win/i.test(pl) || /windows/i.test(ua)) return "windows";
  if (/mac/i.test(pl) || /mac os/i.test(ua)) return "mac";
  if (/linux/i.test(pl)) return "linux";
  return "otro";
}
const OS = detectOS();
const KINDS = [
  { id: "win", re: /-Windows-Setup\.exe$/i, os: "windows", ico: "🪟", t: "Windows", s: "Instalador (.exe) · Windows 10/11" },
  { id: "macA", re: /-Mac-AppleSilicon\.zip$/i, os: "mac", ico: "🍎", t: "Mac · Apple Silicon", s: "M1, M2, M3, M4… (.zip)" },
  { id: "macI", re: /-Mac-Intel\.zip$/i, os: "mac", ico: "🍏", t: "Mac · Intel", s: "Macs con procesador Intel (.zip)" },
  { id: "apk", re: /-Android\.apk$/i, os: "android", ico: "🤖", t: "Android", s: "App (.apk) · Android 10 o superior" }
];

let releaseP = null;
function cachedJSON(key, url, ttl) {
  try { const c = JSON.parse(sessionStorage.getItem(key) || "null"); if (c && Date.now() - c.t < (ttl || 10 * 60 * 1000)) return Promise.resolve(c.d); } catch (e) {}
  return fetchNoCache(url, "json").then(d => { try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), d })); } catch (e) {} return d; });
}
/* Lista de archivos de las apps de escritorio y Android: [{name, url, size}].
   v16: se consulta al abrir cada hoja (caché de 2 min) y se miran las 3 últimas releases apps-v*: si una descarga aún no
   está en la nueva (se está compilando o hubo que relanzarla) se ofrece la de la anterior. Antes se guardaba 30 min y, como
   las releases viejas se borran, los enlaces quedaban rotos. */
function appsRelease() {
  return cachedJSON("sh-rel-apps2", GH_API + "SH-apps/releases?per_page=6", 2 * 60 * 1000)
    .then(list => {
      const rels = (list || []).filter(r => /^apps-v/.test(r.tag_name) && !r.draft).slice(0, 3);
      if (!rels.length) throw new Error("sin releases apps-v*");
      const assets = [];
      rels.forEach((r, i) => (r.assets || []).forEach(a => assets.push({ name: a.name, url: a.browser_download_url, size: a.size, old: i > 0, tag: r.tag_name })));
      return { live: true, tag: rels[0].tag_name, assets };
    })
    .catch(e => { console.warn("descargas: no se pudo consultar GitHub (" + (e && e.message || e) + ")"); return { live: false, tag: "", assets: null }; });
}
function vstRelease(app) {
  return cachedJSON("sh-rel-vst-" + app.vst.repo, GH_API + app.vst.repo + "/releases?per_page=20")
    .then(list => {
      const r = (list || []).filter(x => /^vst-v/.test(x.tag_name) && !x.draft)[0];
      const a = r && (r.assets || []).filter(x => /VST.*\.zip$/i.test(x.name));
      if (!a || !a.length) throw new Error("sin release VST");
      return a.map(x => ({ name: x.name, url: x.browser_download_url, size: x.size, tag: r.tag_name }));
    })
    .catch(() => [{ name: app.vst.file, url: GH + app.vst.repo + "/releases/download/" + app.vst.tag + "/" + app.vst.file, size: 0, tag: app.vst.tag }]);
}
function fmtSize(b) { return !b ? "" : b >= 1e6 ? Math.round(b / 1e6) + " MB" : Math.max(1, Math.round(b / 1e3)) + " KB"; }
function verOf(name) { const m = name.match(/-(\d+\.\d+\.\d+)-/); return m ? "v" + m[1] : ""; }

function optEl(o) {
  const a = document.createElement("a");
  a.className = "opt" + (o.primary ? " primary" : "") + (o.mine ? " mine" : "");
  a.href = o.url; a.target = "_blank"; a.rel = "noopener";
  if (o.download) a.setAttribute("download", "");
  a.innerHTML = '<span class="o-ico" aria-hidden="true"></span><span class="o-txt"><b></b><small></small></span><span class="o-meta"></span>';
  a.querySelector(".o-ico").textContent = o.ico;
  a.querySelector("b").textContent = o.t;
  a.querySelector("small").textContent = o.s;
  a.querySelector(".o-meta").textContent = o.meta || "";
  if (o.mine) { const tag = document.createElement("em"); tag.textContent = "para tu dispositivo"; a.querySelector(".o-txt").appendChild(tag); }
  a.addEventListener("click", () => step("descarga/apertura: " + o.t + " · " + o.url));
  return a;
}

let sheetApp = null;
/* v18: la app que lleva todas las demás dentro (Windows y Mac: plataforma; Android: app única). Sus archivos se llaman
   SampledHead-<versión>-Windows-Setup.exe / -Mac-*.zip / -Android.apk. */
const SUITE = { name: "SampledHead (todas las apps)", dl: "SampledHead", emoji: "🎛️",
  desc: "Todas las apps en una sola: eliges cuáles tener, pasas de una a otra al momento y cada una se actualiza sola. En Windows y Mac también instala los plugins VST/AU. Pop!Pads va aparte." };
async function openSheet(app) {
  step("abrir hoja de " + app.name);
  sheetApp = app;
  const dlg = document.getElementById("sheet");
  document.getElementById("sh-name").textContent = app.name;
  document.getElementById("sh-desc").textContent = app.desc;
  const ic = document.getElementById("sh-icon");
  ic.innerHTML = "";
  if (app._img && app._img.complete && app._img.naturalWidth) { const im = new Image(); im.src = app._img.src; im.alt = ""; ic.appendChild(im); }
  else ic.textContent = app.emoji;

  const web = document.getElementById("sh-web"); web.innerHTML = "";
  if (app.url) web.appendChild(optEl({ ico: "🌐", t: "Abrir versión web", s: "En el navegador, sin instalar nada. Funciona en móvil, tablet y ordenador.", url: app.url, primary: true, mine: OS === "ios" || OS === "linux" }));
  else if (app.alt) web.appendChild(optEl({ ico: "🌐", t: app.alt.t, s: app.alt.s, url: app.alt.url, primary: true }));
  document.getElementById("sh-dlh").style.display = (app.vstOnly || app.mpcOnly) ? "none" : "";
  showMpc(app);

  const list = document.getElementById("sh-dl"), state = document.getElementById("sh-state");
  list.innerHTML = ""; state.textContent = "Buscando las últimas versiones…"; state.hidden = false;
  document.getElementById("sh-vst").hidden = !app.vst;
  const vbox = document.getElementById("sh-vstlist"); vbox.innerHTML = "";
  document.getElementById("sh-all").href = app.mpcOnly ? GH + "SH-apps/tree/main/melodee" : GH + (app.vstOnly ? app.vst.repo : "SH-apps") + "/releases/latest";
  location.hash = "app=" + slug(app);
  if (!dlg.open) { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", ""); }
  document.body.classList.add("sheet-open");

  const opts = [];
  if (app.vstOnly) { state.hidden = true; await showVst(app); return; }
  if (app.mpcOnly) { state.hidden = true; return; }
  const rel = await appsRelease();
  if (sheetApp !== app) return;
  KINDS.forEach(k => {
    if (app.only && !app.only.includes(k.id)) return;   // v14: Pop!Pads solo web y Android
    let a = null;
    if (rel.assets) a = rel.assets.filter(x => x.name.indexOf(app.dl + "-") === 0 && k.re.test(x.name) && /^\d/.test(x.name.slice(app.dl.length + 1)))[0];
    if (a) opts.push({ ico: k.ico, t: k.t, s: k.s, url: a.url, download: true, meta: [verOf(a.name), fmtSize(a.size)].filter(Boolean).join(" · "), mine: k.os === OS, os: k.os });
  });
  opts.sort((x, y) => (y.mine ? 1 : 0) - (x.mine ? 1 : 0));
  opts.forEach(o => list.appendChild(optEl(o)));
  state.hidden = rel.live && !!opts.length;
  state.textContent = !rel.live ? "No he podido consultar GitHub ahora mismo. Pulsa «Ver todas las descargas en GitHub» (abajo) o inténtalo en un momento." :
    "Esta app aún no tiene versión descargable. Usa la versión web.";
  if (app.vst) await showVst(app);
}
async function showVst(app) {
  const vbox = document.getElementById("sh-vstlist");
  const v = await vstRelease(app);
  if (sheetApp !== app) return;
  v.forEach(a => {
    const plat = /Mac/i.test(a.name) ? "Mac" : /Linux/i.test(a.name) ? "Linux" : "Windows";
    const os = plat === "Mac" ? "mac" : plat === "Windows" ? "windows" : "linux";
    vbox.appendChild(optEl({ ico: "🎛️", t: (plat === "Mac" ? "Plugin VST3 + AU + Standalone · " : "Plugin VST3 + Standalone · ") + plat,
      s: "Para tu DAW (Ableton, Logic, Reaper, FL…) y app de escritorio con baja latencia (.zip)", url: a.url, download: true,
      meta: [a.tag.replace("vst-", ""), fmtSize(a.size)].filter(Boolean).join(" · "), mine: !!app.vstOnly && os === OS }));
  });
}
/* v21: plugin para la MPC Sample (Melodee) */
function showMpc(app) {
  const box = document.getElementById("sh-mpc"), list = document.getElementById("sh-mpclist");
  list.innerHTML = ""; box.hidden = !app.mpc;
  if (!app.mpc) return;
  list.appendChild(optEl({ ico: "🎚️", t: app.mpc.kind + " para MPC Sample · Melodee", s: app.mpc.desc + " Copia el zip, sin descomprimir, en Melodee/Plugins de la tarjeta.",
    url: MPC_BASE + app.mpc.file, download: true, meta: ["v" + app.mpc.v, fmtSize(app.mpc.size)].filter(Boolean).join(" · "), primary: !!app.mpcOnly }));
}
function closeSheet() {
  const dlg = document.getElementById("sheet");
  sheetApp = null;
  if (dlg.open) { if (dlg.close) dlg.close(); else dlg.removeAttribute("open"); }
  document.body.classList.remove("sheet-open");
  if (/^#app=/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search);
}
function initSheet() {
  const dlg = document.getElementById("sheet");
  document.getElementById("sh-close").addEventListener("click", closeSheet);
  dlg.addEventListener("close", () => { if (sheetApp) closeSheet(); });
  dlg.addEventListener("click", e => { if (e.target === dlg) closeSheet(); });   // clic fuera
  const fromHash = () => {
    const m = location.hash.match(/^#app=([\w-]+)/);
    const app = m && APPS.concat([SUITE]).filter(a => slug(a) === m[1].toLowerCase())[0];
    if (app && sheetApp !== app) openSheet(app);
  };
  window.addEventListener("hashchange", fromHash);
  fromHash();
}

try {
  step("pintando tarjetas");
  const grid = document.getElementById("apps");
  APPS.forEach(app => grid.appendChild(createCard(app)));
  step("plugins MPC Sample");
  const mgrid = document.getElementById("mpc-apps");
  if (mgrid) APPS.filter(a => a.mpc).sort((a, b) => (b.mpcOnly ? 1 : 0) - (a.mpcOnly ? 1 : 0)).forEach(app => mgrid.appendChild(createCard(app, true)));
  step("logo principal");
  document.getElementById("main-logo").src = MAIN_LOGO;
  step("ojo animado");
  initEye();
  document.getElementById("year").textContent = new Date().getFullYear();
  document.getElementById("version").textContent = VERSION;
  document.getElementById("report-btn").addEventListener("click", () => downloadReport("botón manual"));
  const suiteLink = document.querySelector("a.suite");
  if (suiteLink) suiteLink.addEventListener("click", e => { e.preventDefault(); openSheet(SUITE); });
  step("hoja de descargas");
  initSheet();
  step("instalación");
  initInstall();
  step("listo");
} catch (err) { onFail("render", err); }
