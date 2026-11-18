/* SampledHead · Portal de apps · v11 (cada tarjeta abre sus versiones: web, Windows, Mac, Android y VST)
   Añadir una app: copia un bloque de APPS.
   Logos: cada vez que se abre el portal se lee el icono ACTUAL de cada app
   (su manifest.webmanifest o su archivo de logo). Si no se puede leer, se usa la
   copia guardada en icons/, y si tampoco, el emoji. */

const VERSION = "v12";
const BASE = "https://sampledhead-dot.github.io/";
const MAIN_LOGO = "logo.png";
const EYE_WHITE = "eye-white.png";
const EYE_PUPIL = "eye-pupil.png";
const EYE_LID = "eye-lid.png";
const LIVE_TIMEOUT_MS = 6000;
/* Descargas: se leen en directo de GitHub Releases. Si no se puede (sin red, límite de la API),
   se usan estos enlaces de reserva: actualiza DL_FALLBACK cuando cambie la versión de las apps. */
const GH = "https://github.com/sampledhead-dot/";
const GH_API = "https://api.github.com/repos/sampledhead-dot/";
const DL_FALLBACK = { tag: "apps-v1.1.0", version: "1.1.0" };

const APPS = [
  { name: "SampledHead App", dl: "SampledHead-App", url: BASE + "sampledhead-app/", manifest: "manifest.webmanifest", local: "icons/sampledhead-app.png",
    desc: "Sampler de pads en el navegador: graba, edita, haz loops y exporta a Koala, Ableton, MPC y SP-404.", emoji: "🥁" },
  { name: "CrazyHead", dl: "CrazyHead", url: BASE + "CrazyHead/", manifest: "manifest.webmanifest", local: "icons/crazyhead.png",
    desc: "Sampler con generador de secuencias aleatorias, cuatro pistas y efectos.", emoji: "🌀" },
  { name: "SampledHead Editor", dl: "SampledHead-Editor", url: BASE + "sampledhead-editor/", manifest: "manifest.webmanifest", local: "icons/editor.png",
    desc: "Editor de audio y masterización: recorta, limpia, separa stems con IA y exporta en WAV o MP3.", emoji: "🎚️" },
  { name: "Sample Pack Builder", dl: "Sample-Pack-Builder", url: BASE + "spb-head/", liveIcon: "logo.svg", local: "icons/spb.svg",
    desc: "Sube una canción, separa stems y obtén breaks, loops, golpes, notas y acordes en un ZIP.", emoji: "📦" },
  { name: "Pop!Pads", dl: "PopPads", url: BASE + "poppads/", manifest: "manifest.webmanifest", local: "icons/poppads.png",
    desc: "Beat maker de pads para el móvil: graba tu ritmo, cuantiza y toca con tu propia voz.", emoji: "🎤" },
  { name: "Chuleta Beat", dl: "Chuleta-Beat", url: BASE + "Chuleta-beat/", manifest: "manifest.webmanifest", local: "icons/chuleta-beat.png",
    desc: "Buscador de atajos en castellano para SP-404MKII, MPC Sample, Ableton Move y BOSS VE-22.", emoji: "📋" },
  { name: "SampledHead Tuner", dl: "SampledHead-Tuner", vst: { repo: "Sampledhead-tuner", tag: "vst-v1.0.0", file: "SampledHead-Tuner-VST-1.0.0-Windows.zip" }, url: BASE + "Sampledhead-tuner/", manifest: "manifest.webmanifest", local: "icons/tuner.png",
    desc: "Afinador y acordes para tu instrumento, listo para usar desde el móvil.", emoji: "🎸" },
  { name: "TonoPad", dl: "TonoPad", url: BASE + "Tono-Pad/", manifest: "manifest.webmanifest", local: "icons/tonopad.svg",
    desc: "Detecta el tono y la escala de un audio y genera bancos de 16 pads afinados para SP-404MKII, Move, MPC Sample y Live.", emoji: "🎹" },
  { name: "FuzzHead", dl: "FuzzHead", vst: { repo: "FuzzHead", tag: "vst-v1.0.1", file: "FuzzHead-VST-1.0.1-Windows.zip" }, url: BASE + "FuzzHead/", manifest: "manifest.webmanifest", local: "icons/fuzzhead.png",
    desc: "Convierte tu guitarra o bajo en sintetizador: 5 motores, distorsión, bitcrush, ring mod y gated reverb.", emoji: "🎛️" }
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

function createCard(app) {
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
  const p = document.createElement("p"); p.textContent = app.desc;
  info.append(h2, p);

  const arrow = document.createElement("span");
  arrow.className = "arrow"; arrow.textContent = "›"; arrow.setAttribute("aria-hidden", "true");

  a.append(fallback, info, arrow);
  loadIcon(app, img, fallback);
  app._img = img;
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
function cachedJSON(key, url) {
  try { const c = JSON.parse(sessionStorage.getItem(key) || "null"); if (c && Date.now() - c.t < 30 * 60 * 1000) return Promise.resolve(c.d); } catch (e) {}
  return fetchNoCache(url, "json").then(d => { try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), d })); } catch (e) {} return d; });
}
/* Lista de archivos de las apps de escritorio y Android: [{name, url, size}] */
function appsRelease() {
  if (!releaseP) releaseP = cachedJSON("sh-rel-apps", GH_API + "SH-apps/releases/latest")
    .then(r => ({ live: true, tag: r.tag_name, assets: (r.assets || []).map(a => ({ name: a.name, url: a.browser_download_url, size: a.size })) }))
    .catch(e => { console.warn("descargas: uso los enlaces de reserva (" + (e && e.message || e) + ")"); releaseP = null; return { live: false, tag: DL_FALLBACK.tag, assets: null }; });
  return releaseP;
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
  web.appendChild(optEl({ ico: "🌐", t: "Abrir versión web", s: "En el navegador, sin instalar nada. Funciona en móvil, tablet y ordenador.", url: app.url, primary: true, mine: OS === "ios" || OS === "linux" }));

  const list = document.getElementById("sh-dl"), state = document.getElementById("sh-state");
  list.innerHTML = ""; state.textContent = "Buscando las últimas versiones…"; state.hidden = false;
  document.getElementById("sh-vst").hidden = !app.vst;
  const vbox = document.getElementById("sh-vstlist"); vbox.innerHTML = "";
  document.getElementById("sh-all").href = GH + "SH-apps/releases/latest";
  location.hash = "app=" + slug(app);
  if (!dlg.open) { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", ""); }
  document.body.classList.add("sheet-open");

  const rel = await appsRelease();
  if (sheetApp !== app) return;
  const opts = [];
  KINDS.forEach(k => {
    let a = null;
    if (rel.assets) a = rel.assets.filter(x => x.name.indexOf(app.dl + "-") === 0 && k.re.test(x.name) && /^\d/.test(x.name.slice(app.dl.length + 1)))[0];
    else {
      const suf = { win: "Windows-Setup.exe", macA: "Mac-AppleSilicon.zip", macI: "Mac-Intel.zip", apk: "Android.apk" }[k.id];
      const n = app.dl + "-" + DL_FALLBACK.version + "-" + suf;
      a = { name: n, url: GH + "SH-apps/releases/download/" + DL_FALLBACK.tag + "/" + n, size: 0 };
    }
    if (a) opts.push({ ico: k.ico, t: k.t, s: k.s, url: a.url, download: true, meta: [verOf(a.name), fmtSize(a.size)].filter(Boolean).join(" · "), mine: k.os === OS, os: k.os });
  });
  opts.sort((x, y) => (y.mine ? 1 : 0) - (x.mine ? 1 : 0));
  opts.forEach(o => list.appendChild(optEl(o)));
  state.hidden = !!opts.length && rel.live;
  state.textContent = !opts.length ? "Esta app aún no tiene versión descargable. Usa la versión web." :
    "No he podido consultar GitHub ahora mismo: estos enlaces son de la última versión conocida (" + DL_FALLBACK.tag + ").";
  if (app.vst) {
    const v = await vstRelease(app);
    if (sheetApp !== app) return;
    v.forEach(a => {
      const plat = /Mac/i.test(a.name) ? "Mac" : /Linux/i.test(a.name) ? "Linux" : "Windows";
      vbox.appendChild(optEl({ ico: "🎛️", t: "Plugin VST3 + Standalone · " + plat, s: "Para tu DAW (Ableton, Reaper, FL…) y app de escritorio con baja latencia (.zip)", url: a.url, download: true,
        meta: [a.tag.replace("vst-", ""), fmtSize(a.size)].filter(Boolean).join(" · "), mine: false }));
    });
  }
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
    const app = m && APPS.filter(a => slug(a) === m[1].toLowerCase())[0];
    if (app && sheetApp !== app) openSheet(app);
  };
  window.addEventListener("hashchange", fromHash);
  fromHash();
}

try {
  step("pintando tarjetas");
  const grid = document.getElementById("apps");
  APPS.forEach(app => grid.appendChild(createCard(app)));
  step("logo principal");
  document.getElementById("main-logo").src = MAIN_LOGO;
  step("ojo animado");
  initEye();
  document.getElementById("year").textContent = new Date().getFullYear();
  document.getElementById("version").textContent = VERSION;
  document.getElementById("report-btn").addEventListener("click", () => downloadReport("botón manual"));
  step("hoja de descargas");
  initSheet();
  step("instalación");
  initInstall();
  step("listo");
} catch (err) { onFail("render", err); }
