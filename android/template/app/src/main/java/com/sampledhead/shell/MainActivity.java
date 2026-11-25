/*
 * SampledHead Android — envoltorio común para las apps web de Sampled Head.
 * Sirve la web desde dentro del APK en https://appassets.androidplatform.net/ (origen seguro: micrófono, workers, WASM
 * y localStorage funcionan), da permiso de micrófono, abre archivos del teléfono, guarda las descargas (WAV, ZIP, informes…)
 * en Descargas/<App>/ y genera un informe .txt si algo falla.
 */
package com.sampledhead.shell;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.widget.FrameLayout;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.window.OnBackInvokedDispatcher;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import java.io.File;
import java.io.FileInputStream;
import java.io.OutputStream;
import java.util.Arrays;
import java.text.SimpleDateFormat;
import java.util.ArrayDeque;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

public class MainActivity extends Activity {
    static final String TAG = "SampledHead";
    static final String HOST = "appassets.androidplatform.net";
    static final String START = "https://" + HOST + "/assets/web/index.html";
    static final int REQ_MIC = 11, REQ_FILE = 12;

    WebView web;
    PermissionRequest pendingPermission;
    ValueCallback<Uri[]> fileCallback;
    final ArrayDeque<String> log = new ArrayDeque<>();
    final ArrayDeque<String> steps = new ArrayDeque<>();
    String stage = "inicio";
    final Map<Integer, Download> downloads = new HashMap<>();
    int nextDownload = 1;
    final Handler ui = new Handler(Looper.getMainLooper());
    Updater upd;                 // actualización del contenido (la web) desde GitHub
    boolean startOk = false;      // la versión en uso ya ha arrancado bien
    boolean checking = false;
    boolean pageReady = false; String exportTo = null;   // 1.5.0: copia de datos pedida por la app única SampledHead

    static class Download { Uri uri; OutputStream out; String name; long bytes; }

    // ---------------------------------------------------------------- registro e informe
    synchronized void log(String kind, String msg) {
        String line = new SimpleDateFormat("HH:mm:ss.SSS", Locale.ROOT).format(new Date()) + " [" + kind + "] " + msg;
        log.addLast(line); while (log.size() > 300) log.removeFirst();
        Log.i(TAG, line);
    }
    void step(String s) { stage = s; synchronized (this) { steps.addLast(new SimpleDateFormat("HH:mm:ss", Locale.ROOT).format(new Date()) + "  " + s); while (steps.size() > 200) steps.removeFirst(); } log("paso", s); }

    String report(String where, Throwable err, String msg) {
        StringBuilder b = new StringBuilder();
        Runtime rt = Runtime.getRuntime();
        String ua = ""; try { ua = WebSettings.getDefaultUserAgent(this); } catch (Throwable ignored) {}
        String wv = ""; try { android.content.pm.PackageInfo p = WebViewCompat.getCurrentWebViewPackage(this); if (p != null) wv = p.packageName + " " + p.versionName; } catch (Throwable ignored) {}
        b.append("INFORME DE ERROR · ").append(getString(R.string.app_name)).append(" (Android)\n");
        b.append("Versión: ").append(versionName()).append("\n");
        b.append("Fecha: ").append(new Date()).append("\n");
        b.append("Dónde: ").append(where).append("\n");
        b.append("Etapa: ").append(stage).append("\n");
        b.append("Mensaje: ").append(err != null ? err.toString() : (msg != null ? msg : "(informe manual)")).append("\n");
        if (err != null) b.append("Stack: ").append(Log.getStackTraceString(err)).append("\n");
        b.append("\nNavegador/UA: ").append(ua).append("\nWebView: ").append(wv).append("\n");
        b.append("Plataforma: Android ").append(Build.VERSION.RELEASE).append(" (API ").append(Build.VERSION.SDK_INT).append(") · ").append(Build.MANUFACTURER).append(" ").append(Build.MODEL).append("\n");
        b.append("Núcleos: ").append(rt.availableProcessors()).append(" · Memoria Java: ").append(rt.totalMemory() / 1048576).append("/").append(rt.maxMemory() / 1048576).append(" MB\n");
        b.append("Pantalla: ").append(getResources().getDisplayMetrics().widthPixels).append("x").append(getResources().getDisplayMetrics().heightPixels).append(" @").append(getResources().getDisplayMetrics().density).append("x\n");
        b.append("URL: ").append(web != null ? web.getUrl() : START).append(" · contexto seguro: sí (https) · COOP/COEP: no\n");
        b.append("Opciones: id=").append(getString(R.string.app_id)).append(" web=").append(getString(R.string.web_url)).append("\n");
        b.append("Contenido: ").append(upd != null ? upd.describe() : "(sin iniciar)").append("\n");
        b.append("Archivo: (el audio se gestiona dentro de la app; aquí no se registra)\n");
        b.append("\n--- Cronología ---\n"); synchronized (this) { for (String s : steps) b.append(s).append("\n"); }
        b.append("\n--- Consola (últimas ").append(log.size()).append(" líneas) ---\n"); synchronized (this) { for (String s : log) b.append(s).append("\n"); }
        return b.toString();
    }
    String versionName() { try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return "?"; } }

    void saveReport(String where, Throwable err, String msg, boolean show) {
        try {
            String name = getString(R.string.app_id) + "-android-v" + versionName() + "-informe-" + new SimpleDateFormat("yyyy-MM-dd_HH-mm-ss", Locale.ROOT).format(new Date()) + ".txt";
            Download d = openDownload(name, "text/plain");
            d.out.write(report(where, err, msg).getBytes("UTF-8"));
            finishDownload(d);
            if (show) ui.post(() -> new AlertDialog.Builder(this).setTitle(err != null || msg != null ? "Ha ocurrido un error" : "Informe guardado")
                    .setMessage((msg != null ? msg + "\n\n" : "") + "Se ha guardado un informe en Descargas/" + folder() + ":\n" + name)
                    .setPositiveButton("Aceptar", null).show());
        } catch (Throwable t) { Log.e(TAG, "No se pudo guardar el informe", t); }
    }

    // ---------------------------------------------------------------- descargas a Descargas/<App>/
    String folder() { return getString(R.string.app_name).replaceAll("[^A-Za-z0-9 ._-]", "").trim(); }

    Download openDownload(String name, String mime) throws Exception {
        ContentValues v = new ContentValues();
        v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
        v.put(MediaStore.MediaColumns.MIME_TYPE, mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
        v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + folder());
        v.put(MediaStore.MediaColumns.IS_PENDING, 1);
        Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
        if (uri == null) throw new Exception("No se pudo crear el archivo en Descargas");
        Download d = new Download(); d.uri = uri; d.name = name; d.out = getContentResolver().openOutputStream(uri);
        return d;
    }
    void finishDownload(Download d) throws Exception {
        d.out.close();
        ContentValues v = new ContentValues(); v.put(MediaStore.MediaColumns.IS_PENDING, 0);
        getContentResolver().update(d.uri, v, null, null);
    }

    /** Puente JavaScript: la web envía cada descarga en trozos base64. */
    public class Bridge {
        @JavascriptInterface public int begin(String name, String mime) {
            try { Download d = openDownload(safeName(name), mime); synchronized (downloads) { int id = nextDownload++; downloads.put(id, d); return id; } }
            catch (Exception e) { log("error", "descarga: " + e); toast("No se pudo guardar: " + e.getMessage()); return -1; }
        }
        @JavascriptInterface public void chunk(int id, String b64) {
            Download d; synchronized (downloads) { d = downloads.get(id); } if (d == null) return;
            try { byte[] bytes = Base64.decode(b64, Base64.DEFAULT); d.out.write(bytes); d.bytes += bytes.length; } catch (Exception e) { log("error", "descarga trozo: " + e); }
        }
        @JavascriptInterface public void end(int id) {
            Download d; synchronized (downloads) { d = downloads.remove(id); } if (d == null) return;
            try { finishDownload(d); step("Descarga guardada: " + d.name + " (" + d.bytes + " bytes)"); toast("Guardado en Descargas/" + folder() + "/" + d.name); }
            catch (Exception e) { log("error", "descarga fin: " + e); toast("No se pudo guardar " + d.name); }
        }
        @JavascriptInterface public void error(String msg) { log("error", "descarga JS: " + msg); toast("No se pudo guardar el archivo"); }
        @JavascriptInterface public String platform() { return "android"; }
        @JavascriptInterface public void report() { saveReport("informe manual", null, null, true); }
        /** La web lo usa para saber que el programa ya deja el hueco de las barras del sistema (v1.1.2+). */
        @JavascriptInterface public int insets() { return 1; }

        // ---- Bandeja entre apps instaladas (1.4.0): la web deja cada elemento en cache/salida y se envía por intent ----
        @JavascriptInterface public int outBegin() {
            try { File f = new File(OutboxProvider.dir(MainActivity.this), "sh-" + System.currentTimeMillis() + "-" + (int) (Math.random() * 1e6) + ".shitem");
                Download d = new Download(); d.name = f.getName(); d.out = new java.io.FileOutputStream(f);
                synchronized (downloads) { int id = nextDownload++; downloads.put(id, d); return id; } }
            catch (Exception e) { log("error", "bandeja: " + e); return -1; }
        }
        @JavascriptInterface public String outEnd(int id) {
            Download d; synchronized (downloads) { d = downloads.remove(id); } if (d == null) return "";
            try { d.out.close(); return d.name; } catch (Exception e) { log("error", "bandeja fin: " + e); return ""; }
        }
        /** ¿Está instalada la app de Sampled Head con este id (sampler, crazyhead…)? */
        @JavascriptInterface public boolean hasApp(String appId) { return target(appId) != null; }
        /** Envía los elementos preparados a la otra app y la abre. */
        @JavascriptInterface public boolean sendTo(String appId, String names) {
            Intent i = target(appId); if (i == null) return false;
            try {
                android.content.ClipData clip = null;
                for (String n : names.split(",")) { if (n.trim().isEmpty()) continue;
                    Uri u = Uri.parse("content://" + getPackageName() + ".bandeja/" + n.trim());
                    if (clip == null) clip = android.content.ClipData.newRawUri("SampledHead", u); else clip.addItem(new android.content.ClipData.Item(u)); }
                if (clip != null) i.setClipData(clip);
                i.putExtra("from", getString(R.string.app_id));
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                step("Enviando a " + appId + ": " + names);
                ui.post(() -> { try { startActivity(i); } catch (Exception e) { log("error", "enviar: " + e); toast("No se pudo abrir la otra app"); } });
                return true;
            } catch (Exception e) { log("error", "enviar: " + e); return false; }
        }
        /** Abre otra app de Sampled Head instalada (sin enviarle nada). */
        @JavascriptInterface public boolean openApp(String appId) {
            Intent i = target(appId); if (i == null) return false;
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ui.post(() -> { try { startActivity(i); } catch (Exception e) { toast("No se pudo abrir la otra app"); } });
            return true;
        }
        /** Elementos recibidos de otras apps que la web aún no ha recogido (nombres; se leen en /__bandeja__/<nombre>). */
        @JavascriptInterface public String inboxList() {
            StringBuilder b = new StringBuilder("["); File[] fs = inboxDir().listFiles();
            if (fs != null) { Arrays.sort(fs); for (File f : fs) { if (!f.getName().endsWith(".shitem")) continue; if (b.length() > 1) b.append(','); b.append('"').append(f.getName()).append('"'); } }
            return b.append("]").toString();
        }
        /** 1.5.0: copia .shdatos lista (en la bandeja de salida) → a la app única que la pidió. */
        @JavascriptInterface public void dataSend(String name) { sendToSuite(name, null); }
        @JavascriptInterface public void dataError(String msg) { sendToSuite(null, msg); }
        @JavascriptInterface public void inboxDone(String names) { for (String n : names.split(",")) { n = n.trim(); if (n.isEmpty() || n.contains("/")) continue; new File(inboxDir(), n).delete(); } }
    }
    void sendToSuite(String name, String err) {
        String pkg = exportTo != null ? exportTo : "com.sampledhead.suite"; exportTo = null;
        Intent i = new Intent("com.sampledhead.RECIBIR").setPackage(pkg).addCategory(Intent.CATEGORY_DEFAULT);
        i.putExtra("kind", "datos"); i.putExtra("from", getString(R.string.app_id)); if (err != null) i.putExtra("error", err);
        if (name != null && !name.contains("/")) { i.setClipData(android.content.ClipData.newRawUri("SampledHead", Uri.parse("content://" + getPackageName() + ".bandeja/" + name))); i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION); }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        step(err == null ? "Copia de datos enviada a SampledHead" : "Copia de datos no enviada: " + err);
        ui.post(() -> { try { startActivity(i); } catch (Exception e) { log("error", "copia a SampledHead: " + e); toast("No se pudo devolver la copia a SampledHead"); } });
    }
    static final String EXPORT_JS = "(function(){var me='__ME__',t0=Date.now();function b64(u){var s='';for(var i=0;i<u.length;i+=32768)s+=String.fromCharCode.apply(null,u.subarray(i,i+32768));return btoa(s);}" +
        "function go(){if(!(window.SH&&SH.backup)){if(Date.now()-t0<15000)return setTimeout(go,300);return SHAndroid.dataError('esta versión no puede hacer copia de datos');}" +
        "if(!SH.backup.owned(me))return SHAndroid.dataError('esta app no guarda datos propios');" +
        "SH.backup.export(me).then(function(b){return b.arrayBuffer()}).then(function(ab){var u=new Uint8Array(ab),id=SHAndroid.outBegin();if(id<0)throw new Error('no se pudo preparar la copia');" +
        "for(var i=0;i<u.length;i+=393216)SHAndroid.chunk(id,b64(u.subarray(i,i+393216)));var nm=SHAndroid.outEnd(id);if(!nm)throw new Error('no se pudo preparar la copia');SHAndroid.dataSend(nm);})" +
        ".catch(function(e){SHAndroid.dataError(String(e&&e.message||e))});}go();})();";
    void maybeExport(Intent in) {
        if (in == null || !"com.sampledhead.EXPORTAR".equals(in.getAction())) return;
        String to = in.getStringExtra("to"); exportTo = to != null && to.startsWith("com.sampledhead.") ? to : "com.sampledhead.suite";
        step("La app única SampledHead pide la copia de datos"); toast("Preparando tus datos para SampledHead…");
        if (pageReady) runExport();
    }
    void runExport() { if (exportTo == null || web == null) return; web.evaluateJavascript(EXPORT_JS.replace("__ME__", getString(R.string.app_id)), null); }
    File inboxDir() { File d = new File(getFilesDir(), "bandeja"); d.mkdirs(); return d; }
    /** Intent para abrir la app de Sampled Head «appId» si está instalada. */
    Intent target(String appId) {
        if (appId == null || !appId.matches("[a-z0-9-]+")) return null;
        Intent i = new Intent("com.sampledhead.RECIBIR").setPackage("com.sampledhead." + appId).addCategory(Intent.CATEGORY_DEFAULT);
        if (getPackageManager().queryIntentActivities(i, 0).isEmpty()) {
            Intent l = getPackageManager().getLaunchIntentForPackage("com.sampledhead." + appId);   // APK antiguo (sin RECIBIR)
            return l;
        }
        return i;
    }
    /** Copia a la bandeja propia lo que llega de otra app y avisa a la web. */
    void receive(Intent in) {
        if (in == null || !"com.sampledhead.RECIBIR".equals(in.getAction()) || in.getClipData() == null) return;
        final android.content.ClipData clip = in.getClipData(); final String from = String.valueOf(in.getStringExtra("from"));
        new Thread(() -> {
            int n = 0;
            for (int k = 0; k < clip.getItemCount(); k++) {
                Uri u = clip.getItemAt(k).getUri(); if (u == null) continue;
                String name = u.getLastPathSegment(); if (name == null || !name.endsWith(".shitem") || name.contains("/")) continue;
                File dst = new File(inboxDir(), name);
                try (java.io.InputStream is = getContentResolver().openInputStream(u); java.io.OutputStream os = new java.io.FileOutputStream(dst)) {
                    byte[] buf = new byte[65536]; int r; while ((r = is.read(buf)) > 0) os.write(buf, 0, r); n++;
                } catch (Exception e) { log("error", "recibir " + name + ": " + e); dst.delete(); }
            }
            final int got = n; step("Recibido de " + from + ": " + got + " elemento(s)");
            ui.post(() -> { if (got > 0) toast("Recibido de otra app: " + got + (got == 1 ? " elemento" : " elementos"));
                if (web != null) web.evaluateJavascript("try{window.dispatchEvent(new Event('sh-bandeja'))}catch(e){}", null); });
        }).start();
    }
    @Override protected void onNewIntent(Intent i) { super.onNewIntent(i); setIntent(i); receive(i); maybeExport(i); }
    static String safeName(String n) { n = n == null || n.trim().isEmpty() ? "archivo" : n.trim(); return n.replaceAll("[\\\\/:*?\"<>|]", "_"); }
    void toast(String s) { ui.post(() -> Toast.makeText(this, s, Toast.LENGTH_LONG).show()); }

    // Se inyecta en cada página antes que su propio código
    static final String INJECT =
        "(function(){if(window.__shAndroid)return;window.__shAndroid=1;" +
        // los service workers no hacen falta (los archivos ya están en el APK) y podrían servir versiones viejas
        "try{if(navigator.serviceWorker){navigator.serviceWorker.getRegistrations().then(function(r){r.forEach(function(x){x.unregister()})}).catch(function(){});" +
        "navigator.serviceWorker.register=function(){return Promise.reject(new Error('Service worker no necesario en la app Android'))};}}catch(e){}" +
        "var CH=393216;function b64(u){var s='';for(var i=0;i<u.length;i+=32768){s+=String.fromCharCode.apply(null,u.subarray(i,i+32768));}return btoa(s);}" +
        "function save(href,name){fetch(href).then(function(r){return r.blob()}).then(function(b){return b.arrayBuffer().then(function(ab){" +
        "var u=new Uint8Array(ab);var id=SHAndroid.begin(name||'archivo',b.type||'application/octet-stream');if(id<0)return;" +
        "for(var i=0;i<u.length;i+=CH){SHAndroid.chunk(id,b64(u.subarray(i,i+CH)));}SHAndroid.end(id);})}).catch(function(e){SHAndroid.error(String(e))});}" +
        "function isFile(a){return a&&a.href&&/^(blob:|data:)/.test(a.href);}" +
        "var oc=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(isFile(this)){save(this.href,this.getAttribute('download')||this.download||'archivo');return;}return oc.call(this);};" +
        "document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a');if(isFile(a)){e.preventDefault();save(a.href,a.getAttribute('download')||'archivo');}},true);" +
        "var ow=window.open;window.open=function(u){if(u&&/^(blob:|data:)/.test(String(u))){save(String(u),'archivo');return null;}return ow.apply(window,arguments);};" +
        "window.addEventListener('error',function(e){console.error('[window.onerror] '+e.message+' '+(e.filename||'')+':'+(e.lineno||''))});" +
        "var __la='';document.addEventListener('pointerdown',function(e){try{var t=e.target&&e.target.closest&&e.target.closest('button,[role=button],a,input,select,label,canvas,[id]');__la=t?((t.id?'#'+t.id:t.tagName.toLowerCase())+(t.textContent&&t.textContent.trim()?' «'+t.textContent.trim().slice(0,24)+'»':'')):'';}catch(x){}},true);" +
        "try{new PerformanceObserver(function(l){l.getEntries().forEach(function(e){if(e.duration>=300)console.warn('[tarea larga] '+Math.round(e.duration)+' ms · última acción: '+(__la||'-'));});}).observe({type:'longtask'});}catch(e){}" +
        "window.addEventListener('unhandledrejection',function(e){console.error('[unhandledrejection] '+(e.reason&&e.reason.stack||e.reason))});" +
        "})();";

    // ---------------------------------------------------------------- ciclo de vida
    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        Thread.setDefaultUncaughtExceptionHandler((t, e) -> { saveReport("excepción no capturada (" + t.getName() + ")", e, null, false); android.os.Process.killProcess(android.os.Process.myPid()); System.exit(10); });
        step("Arrancando " + getString(R.string.app_name) + " v" + versionName());

        web = new WebView(this);
        web.setBackgroundColor(getColor(R.color.app_bg));
        // Desde Android 15 (targetSdk 35) la app se dibuja SIEMPRE bajo la barra de estado y la de navegación.
        // Se deja ese hueco con el color de la app para que nada quede tapado por la hora, la batería o los botones.
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(getColor(R.color.app_bg));
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.setOnApplyWindowInsetsListener((v, in) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets b = in.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                v.setPadding(b.left, b.top, b.right, b.bottom);
                return WindowInsets.CONSUMED;
            }
            v.setPadding(in.getSystemWindowInsetLeft(), in.getSystemWindowInsetTop(), in.getSystemWindowInsetRight(), in.getSystemWindowInsetBottom());
            return in.consumeSystemWindowInsets();
        });
        setContentView(root);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setSupportMultipleWindows(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        WebView.setWebContentsDebuggingEnabled(true);
        web.addJavascriptInterface(new Bridge(), "SHAndroid");
        // 1.4.0: que Android no cierre la página al pasar a otra app (antes se perdía lo que estabas haciendo)
        if (Build.VERSION.SDK_INT >= 26) web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        try { startForegroundService(new Intent(this, KeepAlive.class)); step("Servicio en segundo plano activo"); } catch (Throwable t) { log("aviso", "segundo plano: " + t); }
        // limpiar envíos antiguos (más de un día)
        try { File[] old = OutboxProvider.dir(this).listFiles(); if (old != null) for (File f : old) if (System.currentTimeMillis() - f.lastModified() > 86400000L) f.delete(); } catch (Throwable ignored) {}
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT))
            WebViewCompat.addDocumentStartJavaScript(web, INJECT, Collections.singleton("https://" + HOST));

        upd = new Updater(getString(R.string.repo), Arrays.asList(getString(R.string.exclude).isEmpty() ? new String[0] : getString(R.string.exclude).split(",")),
                rel -> getAssets().open("web/" + rel), getString(R.string.content_sha), getFilesDir(), this::log);
        step("Contenido " + Updater.short7(upd.sha()) + (upd.usingDownloaded() ? " (descargado)" : " (incluido en el APK)"));

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain(HOST).addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();

        web.setWebViewClient(new androidx.webkit.WebViewClientCompat() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                WebResourceResponse own = fromDownloaded(r.getUrl());
                if (own != null) return own;
                WebResourceResponse res = loader.shouldInterceptRequest(r.getUrl());
                if (res != null && r.getUrl().getPath() != null && r.getUrl().getPath().endsWith(".webmanifest")) res.setMimeType("application/manifest+json");
                return res;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (ActivityNotFoundException e) { toast("No hay ninguna app para abrir " + u); }
                return true;
            }
            @Override public void onPageFinished(WebView v, String url) {
                if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) v.evaluateJavascript(INJECT, null);
                step("Página cargada: " + v.getTitle());
                if (!pageReady) { pageReady = true; if (exportTo != null) ui.postDelayed(MainActivity.this::runExport, 600); }
                if (!startOk && upd.usingDownloaded()) ui.postDelayed(() -> { if (web == null || startOk) return;
                    web.evaluateJavascript("document.body?document.body.querySelectorAll('*').length:0", n -> { int k = 0; try { k = Integer.parseInt(n.replaceAll("[^0-9]", "")); } catch (Exception ignored) {}
                        if (k < 4) rollbackAndReload("la página sale vacía"); else startOk = true; }); }, 3500);
                else startOk = true;
            }
            @Override public void onReceivedError(WebView v, WebResourceRequest r, androidx.webkit.WebResourceErrorCompat e) {
                if (r.isForMainFrame() && !startOk && upd.usingDownloaded()) rollbackAndReload("no carga" + (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_RESOURCE_ERROR_GET_DESCRIPTION) ? ": " + e.getDescription() : ""));
            }
            @Override public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail d) {
                if (!startOk && upd.usingDownloaded()) upd.rollback("la página se cerró al arrancar");
                saveReport("proceso de la página", null, "El proceso de la página se cerró (" + (d.didCrash() ? "fallo" : "falta de memoria") + ")", true);
                recreate();
                return true;
            }
        });

        // 1.5.2: registrar cuándo la página se queda ocupada (la causa sale en el informe: tareas largas y la última acción)
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_VIEW_RENDERER_CLIENT_BASIC_USAGE))
            WebViewCompat.setWebViewRenderProcessClient(web, java.util.concurrent.Executors.newSingleThreadExecutor(), new androidx.webkit.WebViewRenderProcessClient() {
                long t0 = 0;
                @Override public void onRenderProcessUnresponsive(WebView v, androidx.webkit.WebViewRenderProcess r) { long n = System.currentTimeMillis(); if (t0 == 0) t0 = n - 5000; log("aviso", "La página no responde desde hace " + (n - t0) / 1000 + " s"); }
                @Override public void onRenderProcessResponsive(WebView v, androidx.webkit.WebViewRenderProcess r) { if (t0 > 0) log("aviso", "La página vuelve a responder tras ~" + (System.currentTimeMillis() - t0) / 1000 + " s"); t0 = 0; }
            });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest req) {
                boolean audio = false;
                for (String r : req.getResources()) if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) audio = true;
                if (!audio) { log("info", "permiso denegado: " + String.join(",", req.getResources())); req.deny(); return; }
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) { req.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE}); log("info", "micrófono concedido"); }
                else { pendingPermission = req; requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC); }
            }
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                String[] types = p.getAcceptTypes();
                java.util.List<String> mimes = new java.util.ArrayList<>();
                if (types != null) for (String t : types) for (String one : t.split(",")) {
                    one = one.trim(); if (one.isEmpty()) continue;
                    if (one.startsWith(".")) { String m = android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(one.substring(1).toLowerCase(Locale.ROOT)); if (m != null) mimes.add(m); }
                    else mimes.add(one);
                }
                if (!mimes.isEmpty()) i.putExtra(Intent.EXTRA_MIME_TYPES, mimes.toArray(new String[0]));
                i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                try { startActivityForResult(i, REQ_FILE); } catch (Exception e) { fileCallback = null; toast("No se pudo abrir el selector de archivos"); return false; }
                return true;
            }
            @Override public boolean onConsoleMessage(ConsoleMessage m) {
                log("consola:" + m.messageLevel().name().toLowerCase(Locale.ROOT), m.message() + "  (" + String.valueOf(m.sourceId()).replace("https://" + HOST + "/assets/web/", "") + ":" + m.lineNumber() + ")");
                return true;
            }
        });

        if (Build.VERSION.SDK_INT >= 33)
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::goBack);

        if (state != null) web.restoreState(state); else web.loadUrl(START);
        if (state == null) { receive(getIntent()); maybeExport(getIntent()); }
        step("Cargando " + START);
        ui.postDelayed(() -> checkUpdates(false), 8000);
    }

    // ---------------------------------------------------------------- actualizaciones
    static final Map<String, String> MIME = new HashMap<>();
    static {
        String[][] m = {{"html", "text/html"}, {"htm", "text/html"}, {"js", "text/javascript"}, {"mjs", "text/javascript"}, {"css", "text/css"}, {"json", "application/json"},
            {"webmanifest", "application/manifest+json"}, {"svg", "image/svg+xml"}, {"png", "image/png"}, {"jpg", "image/jpeg"}, {"jpeg", "image/jpeg"}, {"gif", "image/gif"},
            {"webp", "image/webp"}, {"ico", "image/x-icon"}, {"wasm", "application/wasm"}, {"wav", "audio/wav"}, {"mp3", "audio/mpeg"}, {"ogg", "audio/ogg"}, {"m4a", "audio/mp4"},
            {"txt", "text/plain"}, {"md", "text/markdown"}, {"woff", "font/woff"}, {"woff2", "font/woff2"}, {"ttf", "font/ttf"}, {"zip", "application/zip"}, {"pdf", "application/pdf"}};
        for (String[] x : m) MIME.put(x[0], x[1]);
    }
    /** Si hay una versión descargada, la web se sirve desde ella (misma dirección, así que los datos guardados se conservan). */
    WebResourceResponse fromDownloaded(Uri u) {
        File d = upd == null ? null : upd.dir();
        String p = u.getPath();
        if (p != null && HOST.equals(u.getHost()) && p.startsWith("/__bandeja__/")) {   // elementos recibidos de otras apps
            String n = p.substring("/__bandeja__/".length());
            File f = new File(inboxDir(), n);
            if (n.contains("/") || !f.isFile()) return null;
            try { WebResourceResponse r = new WebResourceResponse("application/octet-stream", null, new FileInputStream(f));
                Map<String, String> h = new HashMap<>(); h.put("Cache-Control", "no-store"); r.setResponseHeaders(h); return r; } catch (Exception e) { return null; }
        }
        if (d == null || p == null || !HOST.equals(u.getHost()) || !p.startsWith("/assets/web/")) return null;
        String rel = p.substring("/assets/web/".length()); if (rel.isEmpty() || rel.endsWith("/")) rel += "index.html";
        try {
            File f = new File(d, rel);
            if (!f.getCanonicalPath().startsWith(d.getCanonicalPath() + File.separator) || !f.isFile()) return null;
            String ext = rel.contains(".") ? rel.substring(rel.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT) : "";
            String mime = MIME.containsKey(ext) ? MIME.get(ext) : "application/octet-stream";
            WebResourceResponse res = new WebResourceResponse(mime, mime.startsWith("text/") || mime.contains("json") || mime.contains("svg") ? "utf-8" : null, new FileInputStream(f));
            Map<String, String> h = new HashMap<>(); h.put("Cache-Control", "no-cache"); h.put("Access-Control-Allow-Origin", "*"); res.setResponseHeaders(h);
            return res;
        } catch (Exception e) { log("aviso", "servir " + rel + ": " + e); return null; }
    }
    void rollbackAndReload(String reason) {
        if (upd.rollback(reason)) {
            saveReport("arranque de la versión actualizada", null, reason + " — se ha vuelto a la versión anterior", false);
            startOk = false; if (web != null) web.loadUrl(START);
        }
    }
    void checkUpdates(boolean manual) {
        if (checking || upd == null) return; checking = true;
        new Thread(() -> {
            Updater.Result r = upd.check();
            step("Búsqueda de actualizaciones: " + r);
            ui.post(() -> {
                checking = false;
                if (isFinishing() || web == null) return;
                if ("lista".equals(r.estado)) new AlertDialog.Builder(this).setTitle("Hay una versión nueva")
                        .setMessage("Ya está descargada (" + r.cambiados + " archivo" + (r.cambiados == 1 ? "" : "s") + " nuevo" + (r.cambiados == 1 ? "" : "s") + ").\n\nSi recargas ahora, guarda o exporta antes lo que estés haciendo. Si no, se usará la próxima vez que abras la app.")
                        .setPositiveButton("Recargar ahora", (dl, w) -> { if (upd.applyNow()) { step("Versión nueva activada: " + Updater.short7(upd.sha())); startOk = false; web.loadUrl(START); } })
                        .setNegativeButton("Al volver a abrir", null).show();
            });
            checkProgram();
        }).start();
    }
    /** ¿Hay un APK nuevo del propio programa? (solo hace falta cuando cambia el envoltorio, no la web) */
    void checkProgram() {
        try {
            // 1.5.1: la versión y el APK salen de la lista publicada (sin gastar la API de GitHub); si falla, de la API
            String name = getString(R.string.product_name).replaceAll("[^A-Za-z0-9]+", "-") + "-{v}-Android.apk";
            String[] lp = Updater.latestProgram(name); if (lp == null) return;
            String v = lp[0];
            if (!Updater.newer(versionName(), v)) return;
            android.content.SharedPreferences sp = getSharedPreferences("actualizaciones", MODE_PRIVATE);
            if (v.equals(sp.getString("avisado", ""))) return;
            String url = lp[1];
            final String go = url;
            ui.post(() -> { if (isFinishing()) return; sp.edit().putString("avisado", v).apply();
                new AlertDialog.Builder(this).setTitle("Versión nueva del programa (v" + v + ")")
                    .setMessage("Tienes la v" + versionName() + ". La app se actualiza sola, pero esta mejora es del propio programa: descarga el APK e instálalo encima (tus datos se conservan).")
                    .setPositiveButton("Descargar", (dl, w) -> { try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(go))); if (go.endsWith(".apk")) toast("Descargando el APK… ábrelo desde la notificación para instalarlo"); } catch (Exception e) { toast("No se pudo abrir el navegador"); } })
                    .setNegativeButton("Ahora no", null).show(); });
        } catch (Exception e) { log("aviso", "comprobación del programa: " + e.getMessage()); }
    }

    void goBack() { if (web != null && web.canGoBack()) web.goBack(); else finish(); }
    @Override @SuppressWarnings("deprecation") public void onBackPressed() { goBack(); }
    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); if (web != null) web.saveState(out); }

    @Override public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        super.onRequestPermissionsResult(code, perms, res);
        if (code == REQ_MIC && pendingPermission != null) {
            boolean ok = res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED;
            if (ok) pendingPermission.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE}); else { pendingPermission.deny(); toast("Sin permiso de micrófono no se puede grabar"); }
            log("info", "permiso de micrófono: " + ok);
            pendingPermission = null;
        }
    }

    @Override protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code != REQ_FILE || fileCallback == null) return;
        Uri[] uris = null;
        if (result == RESULT_OK && data != null) {
            if (data.getClipData() != null) { int n = data.getClipData().getItemCount(); uris = new Uri[n]; for (int i = 0; i < n; i++) uris[i] = data.getClipData().getItemAt(i).getUri(); }
            else if (data.getData() != null) uris = new Uri[]{data.getData()};
        }
        fileCallback.onReceiveValue(uris);
        fileCallback = null;
    }

    @Override protected void onPause() { super.onPause(); if (web != null) web.onPause(); }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); if (upd != null && upd.lastCheck() > 0 && System.currentTimeMillis() - upd.lastCheck() > 6 * 3600 * 1000L) checkUpdates(false); }
    @Override protected void onDestroy() { try { stopService(new Intent(this, KeepAlive.class)); } catch (Throwable ignored) {} if (web != null) { web.destroy(); web = null; } super.onDestroy(); }
}
