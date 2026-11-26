/*
 * SampledHead para Android — app única con todas las apps de Sampled Head dentro (como la plataforma de Windows y Mac).
 *
 *  - Todas las apps se sirven desde el MISMO origen (https://appassets.androidplatform.net/apps/<id>/), igual que en
 *    GitHub Pages (sampledhead-dot.github.io/<repo>/): comparten almacenamiento, así que «Enviar a…» llega al momento por
 *    la bandeja web de sh-core (IndexedDB «sh-bridge») y SH.open(id) cambia de vista sin salir de la app (SHSuite.open).
 *  - Inicio propio (/home/index.html): elegir apps, abrirlas, cerrarlas, traer datos, actualizaciones por app.
 *  - Cada app abierta es un WebView que sigue vivo al pasar a otra (máximo configurable, 3 por defecto: se cierra la que
 *    lleve más tiempo sin usarse). Asa «SH» en el borde izquierdo para volver al inicio; «atrás» también vuelve.
 *  - Cada app se actualiza por su cuenta desde su repo (Updater, igual que las apps sueltas), sin reinstalar el APK.
 *  - Traer datos de las apps sueltas instaladas: intent com.sampledhead.EXPORTAR → la app suelta (shell ≥ 1.5.0) exporta
 *    su copia .shdatos y la devuelve con com.sampledhead.RECIBIR (extra kind=datos); el inicio la SUMA (sh-core restore).
 */
package com.sampledhead.shell;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
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
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;

import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public class SuiteActivity extends Activity {
    static final String TAG = "SampledHead";
    static final String HOST = "appassets.androidplatform.net";
    static final String HOME = "https://" + HOST + "/home/index.html";
    static final int REQ_MIC = 11, REQ_FILE = 12;

    static class AppInfo { String id, name, desc, repo, color, sha; List<String> exclude = new ArrayList<>(); }
    static class AppView { String id; WebView web; boolean startOk; long used; }
    final java.util.Map<WebView, UsbSerial> usbs = new java.util.HashMap<>();

    final Map<String, AppInfo> apps = new LinkedHashMap<>();
    final Map<String, Updater> upds = new HashMap<>();
    final Map<String, String> updState = new HashMap<>();          // id → al-dia / lista / nueva / error…
    final LinkedHashMap<String, AppView> views = new LinkedHashMap<>();
    FrameLayout stage; WebView home; TextView handle;
    String current = null;                                          // null = inicio
    SharedPreferences prefs;
    PermissionRequest pendingPermission; ValueCallback<Uri[]> fileCallback;
    final ArrayDeque<String> log = new ArrayDeque<>(), steps = new ArrayDeque<>();
    String stage_ = "inicio";
    final Map<Integer, Download> downloads = new HashMap<>(); int nextDownload = 1;
    final Handler ui = new Handler(Looper.getMainLooper());
    boolean checking = false;
    final ArrayDeque<String> legacyQueue = new ArrayDeque<>(); String legacyNow = null; long legacyT = 0; final List<String> legacyLog = new ArrayList<>();

    static class Download { Uri uri; OutputStream out; String name; long bytes; }

    // ---------------------------------------------------------------- registro e informe
    synchronized void log(String kind, String msg) {
        String line = new SimpleDateFormat("HH:mm:ss.SSS", Locale.ROOT).format(new Date()) + " [" + kind + "] " + msg;
        log.addLast(line); while (log.size() > 300) log.removeFirst(); Log.i(TAG, line);
    }
    void step(String s) { stage_ = s; synchronized (this) { steps.addLast(new SimpleDateFormat("HH:mm:ss", Locale.ROOT).format(new Date()) + "  " + s); while (steps.size() > 200) steps.removeFirst(); } log("paso", s); }
    String versionName() { try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return "?"; } }
    String report(String where, Throwable err, String msg) {
        StringBuilder b = new StringBuilder(); Runtime rt = Runtime.getRuntime();
        String ua = ""; try { ua = WebSettings.getDefaultUserAgent(this); } catch (Throwable ignored) {}
        String wv = ""; try { android.content.pm.PackageInfo p = WebViewCompat.getCurrentWebViewPackage(this); if (p != null) wv = p.packageName + " " + p.versionName; } catch (Throwable ignored) {}
        b.append("INFORME DE ERROR · SampledHead (Android, app única)\nVersión: ").append(versionName()).append("\nFecha: ").append(new Date())
         .append("\nDónde: ").append(where).append("\nEtapa: ").append(stage_).append("\nMensaje: ").append(err != null ? err.toString() : (msg != null ? msg : "(informe manual)")).append("\n");
        if (err != null) b.append("Stack: ").append(Log.getStackTraceString(err)).append("\n");
        b.append("\nNavegador/UA: ").append(ua).append("\nWebView: ").append(wv)
         .append("\nPlataforma: Android ").append(Build.VERSION.RELEASE).append(" (API ").append(Build.VERSION.SDK_INT).append(") · ").append(Build.MANUFACTURER).append(" ").append(Build.MODEL)
         .append("\nNúcleos: ").append(rt.availableProcessors()).append(" · Memoria Java: ").append(rt.totalMemory() / 1048576).append("/").append(rt.maxMemory() / 1048576).append(" MB")
         .append("\nPantalla: ").append(getResources().getDisplayMetrics().widthPixels).append("x").append(getResources().getDisplayMetrics().heightPixels).append(" @").append(getResources().getDisplayMetrics().density).append("x")
         .append("\nURL: ").append(current != null && views.get(current) != null ? views.get(current).web.getUrl() : HOME).append(" · contexto seguro: sí (https) · COOP/COEP: no")
         .append("\nOpciones: apps elegidas=").append(chosen()).append(" · abiertas=").append(views.keySet()).append(" · máximo=").append(maxOpen()).append("\nContenido:");
        for (String id : apps.keySet()) { Updater u = upds.get(id); b.append("\n  ").append(id).append(": ").append(u != null ? u.describe() : "-").append(" · ").append(updState.containsKey(id) ? updState.get(id) : ""); }
        b.append("\nArchivo: (el audio se gestiona dentro de cada app; aquí no se registra)\n\n--- Cronología ---\n");
        synchronized (this) { for (String s : steps) b.append(s).append("\n"); }
        b.append("\n--- Consola (últimas ").append(log.size()).append(" líneas) ---\n"); synchronized (this) { for (String s : log) b.append(s).append("\n"); }
        return b.toString();
    }
    void saveReport(String where, Throwable err, String msg, boolean show) {
        try {
            String name = "sampledhead-android-v" + versionName() + "-informe-" + new SimpleDateFormat("yyyy-MM-dd_HH-mm-ss", Locale.ROOT).format(new Date()) + ".txt";
            Download d = openDownload("SampledHead", name, "text/plain"); d.out.write(report(where, err, msg).getBytes(StandardCharsets.UTF_8)); finishDownload(d);
            if (show) ui.post(() -> new AlertDialog.Builder(this).setTitle(err != null || msg != null ? "Ha ocurrido un error" : "Informe guardado")
                .setMessage((msg != null ? msg + "\n\n" : "") + "Se ha guardado un informe en Descargas/SampledHead:\n" + name).setPositiveButton("Aceptar", null).show());
        } catch (Throwable t) { Log.e(TAG, "No se pudo guardar el informe", t); }
    }

    // ---------------------------------------------------------------- descargas a Descargas/SampledHead/<App>/
    String folderOf(String id) { AppInfo a = apps.get(id); return a == null ? "SampledHead" : "SampledHead/" + a.name.replaceAll("[^A-Za-z0-9 ._-]", "").trim(); }
    Download openDownload(String folder, String name, String mime) throws Exception {
        ContentValues v = new ContentValues();
        v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
        v.put(MediaStore.MediaColumns.MIME_TYPE, mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
        v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + folder);
        v.put(MediaStore.MediaColumns.IS_PENDING, 1);
        Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
        if (uri == null) throw new Exception("No se pudo crear el archivo en Descargas");
        Download d = new Download(); d.uri = uri; d.name = name; d.out = getContentResolver().openOutputStream(uri); return d;
    }
    void finishDownload(Download d) throws Exception { d.out.close(); ContentValues v = new ContentValues(); v.put(MediaStore.MediaColumns.IS_PENDING, 0); getContentResolver().update(d.uri, v, null, null); }
    static String safeName(String n) { n = n == null || n.trim().isEmpty() ? "archivo" : n.trim(); return n.replaceAll("[\\\\/:*?\"<>|]", "_"); }
    void toast(String s) { ui.post(() -> Toast.makeText(this, s, Toast.LENGTH_LONG).show()); }

    /** «SHAndroid» de cada vista: descargas (mismo protocolo que las apps sueltas) e informe. Sin outBegin: dentro de la app
     *  única la bandeja entre apps es la de la web (mismo origen), no la del programa. */
    public class Bridge {
        final String id; Bridge(String id) { this.id = id; }
        @JavascriptInterface public int begin(String name, String mime) {
            try { Download d = openDownload(folderOf(id), safeName(name), mime); synchronized (downloads) { int k = nextDownload++; downloads.put(k, d); return k; } }
            catch (Exception e) { log("error", "descarga: " + e); toast("No se pudo guardar: " + e.getMessage()); return -1; }
        }
        @JavascriptInterface public void chunk(int k, String b64) {
            Download d; synchronized (downloads) { d = downloads.get(k); } if (d == null) return;
            try { byte[] bytes = Base64.decode(b64, Base64.DEFAULT); d.out.write(bytes); d.bytes += bytes.length; } catch (Exception e) { log("error", "descarga trozo: " + e); }
        }
        @JavascriptInterface public void end(int k) {
            Download d; synchronized (downloads) { d = downloads.remove(k); } if (d == null) return;
            try { finishDownload(d); step("Descarga guardada (" + id + "): " + d.name + " (" + d.bytes + " bytes)"); toast("Guardado en Descargas/" + folderOf(id) + "/" + d.name); }
            catch (Exception e) { log("error", "descarga fin: " + e); toast("No se pudo guardar " + d.name); }
        }
        @JavascriptInterface public void error(String msg) { log("error", "descarga JS (" + id + "): " + msg); toast("No se pudo guardar el archivo"); }
        @JavascriptInterface public String platform() { return "android"; }
        @JavascriptInterface public void report() { saveReport("informe manual (" + id + ")", null, null, true); }
        @JavascriptInterface public int insets() { return 1; }
    }

    /** «SHSuite»: lo que las apps (sh-core ≥ 1.4.0) y el inicio piden a la app única. */
    public class Suite {
        final String me; Suite(String me) { this.me = me; }
        @JavascriptInterface public String me() { return me; }
        @JavascriptInterface public String version() { return versionName(); }
        @JavascriptInterface public boolean has(String id) { return apps.containsKey(id); }
        @JavascriptInterface public boolean open(String id) { if (!apps.containsKey(id)) return false; ui.post(() -> showApp(id)); return true; }
        @JavascriptInterface public void home() { ui.post(SuiteActivity.this::showHome); }
        /** Avisa a la app «to» (si está abierta) de que tiene algo nuevo en su bandeja. */
        @JavascriptInterface public void notify(String to) { ui.post(() -> { AppView v = views.get(to); if (v != null) v.web.evaluateJavascript("try{window.dispatchEvent(new Event('sh-bandeja'))}catch(e){}", null); }); }
        // ---- solo para el inicio
        @JavascriptInterface public String state() { return stateJson(); }
        @JavascriptInterface public void choose(String csv) { prefs.edit().putString("elegidas", csv).putBoolean("primera", false).apply(); step("Apps elegidas: " + csv); }
        @JavascriptInterface public void setMax(int n) { prefs.edit().putInt("maximo", Math.max(1, Math.min(6, n))).apply(); ui.post(() -> trim(null)); }
        @JavascriptInterface public void close(String id) { ui.post(() -> closeApp(id)); }
        @JavascriptInterface public void reload(String id) { ui.post(() -> { AppView v = views.get(id); if (v != null) { v.startOk = false; v.web.reload(); } }); }
        @JavascriptInterface public void updates() { ui.post(() -> checkUpdates(true)); }
        @JavascriptInterface public boolean applyUpdate(String id) {
            Updater u = upds.get(id); if (u == null || !u.applyNow()) return false;
            updState.put(id, "aplicada"); step("Actualización aplicada: " + id);
            ui.post(() -> { AppView v = views.get(id); if (v != null) { v.startOk = false; v.web.loadUrl(urlOf(id)); } }); return true;
        }
        @JavascriptInterface public void report() { saveReport("informe manual (inicio)", null, null, true); }
        @JavascriptInterface public void pullLegacy() { ui.post(SuiteActivity.this::startLegacy); }
        @JavascriptInterface public String datosList() {
            StringBuilder b = new StringBuilder("["); File[] fs = datosDir().listFiles();
            if (fs != null) { Arrays.sort(fs); for (File f : fs) { if (!f.getName().endsWith(".shdatos")) continue; if (b.length() > 1) b.append(','); b.append('"').append(f.getName()).append('"'); } }
            return b.append("]").toString();
        }
        @JavascriptInterface public void datosDone(String name) { if (name != null && !name.contains("/")) new File(datosDir(), name).delete(); }
        @JavascriptInterface public String legacyLog() { synchronized (legacyLog) { return jsonArr(legacyLog); } }
        @JavascriptInterface public void openUrl(String url) { ui.post(() -> { try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception e) { toast("No se pudo abrir " + url); } }); }
    }

    // ---------------------------------------------------------------- estado para el inicio
    int maxOpen() { return prefs.getInt("maximo", 3); }
    List<String> chosen() {
        String c = prefs.getString("elegidas", null); List<String> out = new ArrayList<>();
        if (c == null) { out.addAll(apps.keySet()); return out; }
        for (String x : c.split(",")) if (apps.containsKey(x.trim())) out.add(x.trim());
        return out;
    }
    static String js(String s) { return s == null ? "null" : "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n") + "\""; }
    static String jsonArr(List<String> l) { StringBuilder b = new StringBuilder("["); for (int i = 0; i < l.size(); i++) b.append(i > 0 ? "," : "").append(js(l.get(i))); return b.append("]").toString(); }
    boolean installed(String pkg) { try { getPackageManager().getPackageInfo(pkg, 0); return true; } catch (Exception e) { return false; } }
    boolean canExport(String id) { return !getPackageManager().queryIntentActivities(new Intent("com.sampledhead.EXPORTAR").setPackage("com.sampledhead." + id), 0).isEmpty(); }
    String stateJson() {
        StringBuilder b = new StringBuilder("{\"version\":").append(js(versionName())).append(",\"first\":").append(prefs.getBoolean("primera", true))
            .append(",\"max\":").append(maxOpen()).append(",\"current\":").append(js(current)).append(",\"apps\":[");
        List<String> ch = chosen(); boolean first = true;
        for (AppInfo a : apps.values()) {
            Updater u = upds.get(a.id);
            b.append(first ? "" : ",").append("{\"id\":").append(js(a.id)).append(",\"name\":").append(js(a.name)).append(",\"desc\":").append(js(a.desc))
             .append(",\"color\":").append(js(a.color)).append(",\"chosen\":").append(ch.contains(a.id)).append(",\"open\":").append(views.containsKey(a.id))
             .append(",\"sha\":").append(js(u != null ? Updater.short7(u.sha()) : "")).append(",\"downloaded\":").append(u != null && u.usingDownloaded())
             .append(",\"pending\":").append(u != null && u.pending() != null).append(",\"upd\":").append(js(updState.get(a.id)))
             .append(",\"loose\":").append(installed("com.sampledhead." + a.id)).append(",\"export\":").append(canExport(a.id)).append("}");
            first = false;
        }
        b.append("],\"legacyBusy\":").append(legacyNow != null || !legacyQueue.isEmpty()).append("}");
        return b.toString();
    }
    void homeEvent(String name) { if (home != null) home.evaluateJavascript("try{window.dispatchEvent(new Event('" + name + "'))}catch(e){}", null); }

    // ---------------------------------------------------------------- vistas
    String urlOf(String id) { return "https://" + HOST + "/apps/" + id + "/index.html"; }
    int dp(float v) { return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics())); }

    void showApp(String id) {
        AppView v = views.get(id);
        if (v == null) {
            v = new AppView(); v.id = id; v.web = makeWeb(id); views.put(id, v);
            stage.addView(v.web, 0, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            v.web.loadUrl(urlOf(id)); step("Abriendo " + id);
        }
        v.used = System.currentTimeMillis(); views.remove(id); views.put(id, v);   // la más reciente, al final
        current = id;
        for (AppView o : views.values()) { boolean on = o == v; o.web.setAlpha(on ? 1f : 0f); o.web.setFocusable(on); o.web.setFocusableInTouchMode(on); if (!on) o.web.clearFocus(); }
        v.web.bringToFront(); home.setVisibility(View.GONE); handle.setVisibility(View.VISIBLE); handle.bringToFront();
        v.web.requestFocus();
        v.web.evaluateJavascript("try{window.dispatchEvent(new Event('sh-bandeja'));window.dispatchEvent(new Event('focus'))}catch(e){}", null);
        trim(id);
    }
    /** Cierra las apps que sobran (las que llevan más tiempo sin usarse), nunca la que se está viendo. */
    void trim(String keep) {
        int max = maxOpen();
        while (views.size() > max) {
            String oldest = null; for (String k : views.keySet()) { if (!k.equals(keep) && !k.equals(current)) { oldest = k; break; } }
            if (oldest == null) break; step("Se cierra " + oldest + " (máximo " + max + " abiertas)"); closeApp(oldest);
        }
    }
    void closeApp(String id) {
        AppView v = views.remove(id); if (v == null) return;
        stage.removeView(v.web); { UsbSerial us = usbs.remove(v.web); if (us != null) us.destroy(); } v.web.destroy(); if (id.equals(current)) showHome();
        Updater u = upds.get(id); if (u != null && u.pending() != null && u.applyNow()) updState.put(id, "aplicada");   // actualización que esperaba a que se cerrara
        step("Cerrada " + id); homeEvent("sh-estado");
    }
    void showHome() {
        current = null; home.setVisibility(View.VISIBLE); home.bringToFront(); handle.setVisibility(View.GONE);
        for (AppView o : views.values()) o.web.setAlpha(0f);
        home.requestFocus(); homeEvent("sh-estado");
    }

    @SuppressLint("SetJavaScriptEnabled")
    WebView makeWeb(String id) {
        WebView w = new WebView(this);
        w.setBackgroundColor(Color.parseColor(id == null ? "#d65f00" : colorOf(id)));
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setDatabaseEnabled(true); s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false); s.setAllowContentAccess(true); s.setSupportMultipleWindows(false); s.setLoadWithOverviewMode(true); s.setUseWideViewPort(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        w.addJavascriptInterface(new Bridge(id == null ? "home" : id), "SHAndroid");
        w.addJavascriptInterface(new Suite(id == null ? "home" : id), "SHSuite");
        UsbSerial us = new UsbSerial(this, w, this::log); usbs.put(w, us); w.addJavascriptInterface(us, "SHUsb");   // puerto serie USB (SP-404MKII)
        if (Build.VERSION.SDK_INT >= 26) w.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) WebViewCompat.addDocumentStartJavaScript(w, INJECT, Collections.singleton("https://" + HOST));
        final String appId = id;
        w.setWebViewClient(new androidx.webkit.WebViewClientCompat() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) { return serve(r.getUrl()); }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (HOST.equals(u.getHost())) {   // enlace a otra app de dentro → se abre en su vista
                    String p = u.getPath(); if (p != null && p.startsWith("/apps/")) { String other = p.substring(6).split("/")[0]; if (appId != null && !other.equals(appId) && apps.containsKey(other)) { showApp(other); return true; } }
                    if (p != null && p.startsWith("/home/") && appId != null) { showHome(); return true; }
                    return false;
                }
                String other = appForWebUrl(u); if (other != null) { showApp(other); return true; }   // dirección de GitHub Pages de otra app
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (ActivityNotFoundException e) { toast("No hay ninguna app para abrir " + u); }
                return true;
            }
            @Override public void onPageFinished(WebView v, String url) {
                if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) v.evaluateJavascript(INJECT, null);
                step("Página cargada (" + (appId == null ? "inicio" : appId) + "): " + v.getTitle());
                if (appId == null) return;
                AppView av = views.get(appId); Updater u = upds.get(appId); if (av == null || av.startOk) return;
                if (u != null && u.usingDownloaded()) ui.postDelayed(() -> { AppView a2 = views.get(appId); if (a2 == null || a2.startOk) return;
                    a2.web.evaluateJavascript("document.body?document.body.querySelectorAll('*').length:0", n -> { int k = 0; try { k = Integer.parseInt(n.replaceAll("[^0-9]", "")); } catch (Exception ignored) {}
                        if (k < 4) rollback(appId, "la página sale vacía"); else a2.startOk = true; }); }, 3500);
                else av.startOk = true;
            }
            @Override public void onReceivedError(WebView v, WebResourceRequest r, androidx.webkit.WebResourceErrorCompat e) {
                if (appId != null && r.isForMainFrame()) { AppView av = views.get(appId); Updater u = upds.get(appId); if (av != null && !av.startOk && u != null && u.usingDownloaded()) rollback(appId, "no carga"); }
            }
            @Override public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail d) {
                // Todas las vistas comparten el proceso de la página: se cierran todas y se vuelve al inicio.
                // Todas las vistas reciben el aviso a la vez: solo la primera guarda informe y reinicia.
                if (goneHandled) return true; goneHandled = true;
                if (System.currentTimeMillis() - killedHung < 10000) step("Páginas reiniciadas tras el bloqueo");
                else saveReport("proceso de las páginas", null, "El proceso de las páginas se cerró (" + (d.didCrash() ? "fallo" : "falta de memoria") + "). Prueba a tener menos apps abiertas a la vez (Ajustes del inicio).", true);
                ui.post(SuiteActivity.this::recreate); return true;
            }
        });
        // 1.5.2: aviso cuando una página se queda ocupada (la causa queda en el informe: tareas largas y la última acción)
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_VIEW_RENDERER_CLIENT_BASIC_USAGE))
            WebViewCompat.setWebViewRenderProcessClient(w, hangExec, new androidx.webkit.WebViewRenderProcessClient() {
                @Override public void onRenderProcessUnresponsive(WebView v, androidx.webkit.WebViewRenderProcess r) { hung(appId, r); }
                @Override public void onRenderProcessResponsive(WebView v, androidx.webkit.WebViewRenderProcess r) { unhung(appId); }
            });
        w.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest req) {
                boolean audio = false; for (String r : req.getResources()) if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) audio = true;
                if (!audio) { req.deny(); return; }
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) req.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                else { pendingPermission = req; requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC); }
            }
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT); i.addCategory(Intent.CATEGORY_OPENABLE); i.setType("*/*");
                List<String> mimes = new ArrayList<>(); String[] types = p.getAcceptTypes();
                if (types != null) for (String t : types) for (String one : t.split(",")) { one = one.trim(); if (one.isEmpty()) continue;
                    if (one.startsWith(".")) { String m = android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(one.substring(1).toLowerCase(Locale.ROOT)); if (m != null) mimes.add(m); } else mimes.add(one); }
                // .shdatos, .shproj, .tonopad… no tienen tipo conocido: si se pide alguna extensión sin tipo, no se filtra
                boolean unknown = false; if (types != null) for (String t : types) for (String one : t.split(",")) { one = one.trim(); if (one.startsWith(".") && android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(one.substring(1).toLowerCase(Locale.ROOT)) == null) unknown = true; }
                if (!mimes.isEmpty() && !unknown) i.putExtra(Intent.EXTRA_MIME_TYPES, mimes.toArray(new String[0]));
                i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                try { startActivityForResult(i, REQ_FILE); } catch (Exception e) { fileCallback = null; toast("No se pudo abrir el selector de archivos"); return false; }
                return true;
            }
            @Override public boolean onConsoleMessage(ConsoleMessage m) {
                log("consola:" + (appId == null ? "inicio" : appId) + ":" + m.messageLevel().name().toLowerCase(Locale.ROOT), m.message() + "  (" + String.valueOf(m.sourceId()).replace("https://" + HOST + "/", "") + ":" + m.lineNumber() + ")");
                return true;
            }
        });
        return w;
    }
    final java.util.concurrent.Executor hangExec = java.util.concurrent.Executors.newSingleThreadExecutor();
    volatile long hangT = 0; volatile long killedHung = 0; boolean goneHandled = false; AlertDialog hangDlg;
    void hung(String id, androidx.webkit.WebViewRenderProcess r) {
        long now = System.currentTimeMillis(); if (hangT == 0) hangT = now - 5000;   // el aviso llega tras ~5 s sin responder
        final long secs = (now - hangT) / 1000; final String name = id == null ? "El inicio" : apps.containsKey(id) ? apps.get(id).name : id;
        log("aviso", "La página no responde (" + (id == null ? "inicio" : id) + ") desde hace " + secs + " s");
        if (secs < 8) return;
        ui.post(() -> {
            if (hangDlg != null && hangDlg.isShowing()) { hangDlg.setMessage(msgHang(name, (System.currentTimeMillis() - hangT) / 1000)); return; }
            hangDlg = new AlertDialog.Builder(this).setTitle(name + " está ocupada").setMessage(msgHang(name, secs)).setCancelable(false)
                .setNegativeButton("Esperar", null)
                .setPositiveButton("Reiniciar", (dl, w2) -> {
                    saveReport("página bloqueada (" + (id == null ? "inicio" : id) + ")", null, name + " dejó de responder " + (System.currentTimeMillis() - hangT) / 1000 + " s; se reinició", false);
                    killedHung = System.currentTimeMillis(); hangT = 0; try { if (!r.terminate()) { killedHung = 0; recreate(); } } catch (Throwable t) { killedHung = 0; recreate(); }
                }).show();
        });
    }
    static String msgHang(String name, long s) { return name + " lleva " + s + " s sin responder. Puedes esperar o reiniciar SampledHead (se cierran las apps abiertas; lo que tengas guardado no se pierde). Al reiniciar se guarda un informe en Descargas/SampledHead."; }
    void unhung(String id) {
        if (hangT == 0) return; long s = (System.currentTimeMillis() - hangT) / 1000; hangT = 0;
        log("aviso", "La página vuelve a responder (" + (id == null ? "inicio" : id) + ") tras ~" + s + " s");
        ui.post(() -> { if (hangDlg != null && hangDlg.isShowing()) hangDlg.dismiss(); hangDlg = null; });
    }
    String colorOf(String id) { AppInfo a = apps.get(id); String c = a != null && a.color != null ? a.color : "#111111"; return c.matches("#[0-9a-fA-F]{6}") ? c : "#111111"; }
    /** https://sampledhead-dot.github.io/<repo>/… → id de la app de dentro, si la hay. */
    String appForWebUrl(Uri u) {
        if (!"sampledhead-dot.github.io".equalsIgnoreCase(u.getHost()) || u.getPath() == null) return null;
        String seg = u.getPath().replaceFirst("^/", "").split("/")[0];
        for (AppInfo a : apps.values()) if (a.repo.equalsIgnoreCase(seg)) return a.id;
        return null;
    }
    void rollback(String id, String reason) {
        Updater u = upds.get(id); if (u == null || !u.rollback(reason)) return;
        saveReport("arranque de la versión actualizada de " + id, null, reason + " — se ha vuelto a la versión anterior", false);
        updState.put(id, "vuelta atrás"); AppView v = views.get(id); if (v != null) { v.startOk = false; v.web.loadUrl(urlOf(id)); }
    }

    // ---------------------------------------------------------------- archivos: /apps/<id>/…, /home/…, /__datos__/…
    static final Map<String, String> MIME = new HashMap<>();
    static {
        String[][] m = {{"html", "text/html"}, {"htm", "text/html"}, {"js", "text/javascript"}, {"mjs", "text/javascript"}, {"css", "text/css"}, {"json", "application/json"},
            {"webmanifest", "application/manifest+json"}, {"svg", "image/svg+xml"}, {"png", "image/png"}, {"jpg", "image/jpeg"}, {"jpeg", "image/jpeg"}, {"gif", "image/gif"},
            {"webp", "image/webp"}, {"ico", "image/x-icon"}, {"wasm", "application/wasm"}, {"wav", "audio/wav"}, {"mp3", "audio/mpeg"}, {"ogg", "audio/ogg"}, {"m4a", "audio/mp4"},
            {"txt", "text/plain"}, {"md", "text/markdown"}, {"woff", "font/woff"}, {"woff2", "font/woff2"}, {"ttf", "font/ttf"}, {"zip", "application/zip"}, {"pdf", "application/pdf"}, {"onnx", "application/octet-stream"}};
        for (String[] x : m) MIME.put(x[0], x[1]);
    }
    WebResourceResponse respond(String rel, InputStream in, boolean noStore) {
        String ext = rel.contains(".") ? rel.substring(rel.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT) : "";
        String mime = MIME.containsKey(ext) ? MIME.get(ext) : "application/octet-stream";
        WebResourceResponse r = new WebResourceResponse(mime, mime.startsWith("text/") || mime.contains("json") || mime.contains("svg") ? "utf-8" : null, in);
        Map<String, String> h = new HashMap<>(); h.put("Cache-Control", noStore ? "no-store" : "no-cache"); h.put("Access-Control-Allow-Origin", "*"); r.setResponseHeaders(h); return r;
    }
    WebResourceResponse serve(Uri u) {
        if (!HOST.equals(u.getHost())) return null;
        String p = u.getPath(); if (p == null) return null;
        try {
            if (p.startsWith("/__datos__/")) { String n = p.substring(11); File f = new File(datosDir(), n); if (n.contains("/") || !f.isFile()) return null; return respond(n, new FileInputStream(f), true); }
            if (p.startsWith("/home/")) { String rel = p.substring(6); if (rel.isEmpty() || rel.endsWith("/")) rel += "index.html"; if (rel.contains("..")) return null; return respond(rel, getAssets().open("home/" + rel), false); }
            if (p.startsWith("/apps/")) {
                String rest = p.substring(6); int sl = rest.indexOf('/'); if (sl < 0) return null;
                String id = rest.substring(0, sl), rel = rest.substring(sl + 1); if (rel.isEmpty() || rel.endsWith("/")) rel += "index.html";
                if (!apps.containsKey(id) || rel.contains("..")) return null;
                Updater up = upds.get(id); File d = up == null ? null : up.dir();
                if (d != null) { File f = new File(d, rel); if (f.getCanonicalPath().startsWith(d.getCanonicalPath() + File.separator) && f.isFile()) return respond(rel, new FileInputStream(f), false); }
                return respond(rel, getAssets().open("apps/" + id + "/" + rel), false);
            }
        } catch (Exception e) { log("aviso", "servir " + p + ": " + e.getMessage()); }
        return null;
    }
    File datosDir() { File d = new File(getFilesDir(), "datos"); d.mkdirs(); return d; }

    // Se inyecta en cada página antes que su propio código (igual que en las apps sueltas)
    static final String INJECT =
        "(function(){if(window.__shAndroid)return;window.__shAndroid=1;" +
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

    // ---------------------------------------------------------------- arranque
    @SuppressLint("ClickableViewAccessibility")
    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        Thread.setDefaultUncaughtExceptionHandler((t, e) -> { saveReport("excepción no capturada (" + t.getName() + ")", e, null, false); android.os.Process.killProcess(android.os.Process.myPid()); System.exit(10); });
        prefs = getSharedPreferences("suite", MODE_PRIVATE);
        step("Arrancando SampledHead (app única) v" + versionName());
        loadApps();
        for (AppInfo a : apps.values()) {
            final String id = a.id;
            upds.put(id, new Updater(a.repo, a.exclude, rel -> getAssets().open("apps/" + id + "/" + rel), a.sha, new File(getFilesDir(), "apps/" + id), (k, m) -> log(k, id + ": " + m)));
        }
        WebView.setWebContentsDebuggingEnabled(true);
        FrameLayout root = new FrameLayout(this); root.setBackgroundColor(Color.parseColor("#d65f00"));
        root.setOnApplyWindowInsetsListener((v, in) -> {
            if (Build.VERSION.SDK_INT >= 30) { android.graphics.Insets b = in.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime()); v.setPadding(b.left, b.top, b.right, b.bottom); return WindowInsets.CONSUMED; }
            v.setPadding(in.getSystemWindowInsetLeft(), in.getSystemWindowInsetTop(), in.getSystemWindowInsetRight(), in.getSystemWindowInsetBottom()); return in.consumeSystemWindowInsets();
        });
        stage = new FrameLayout(this); root.addView(stage, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        home = makeWeb(null); stage.addView(home, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        // asa «SH»: vuelve al inicio; se puede arrastrar arriba y abajo
        handle = new TextView(this); handle.setText("SH"); handle.setTextColor(Color.WHITE); handle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11); handle.setGravity(Gravity.CENTER);
        handle.setTypeface(android.graphics.Typeface.DEFAULT_BOLD); handle.setAlpha(0.78f); handle.setContentDescription("Volver al inicio de SampledHead");
        GradientDrawable bg = new GradientDrawable(); bg.setColor(Color.parseColor("#d65f00")); float r = dp(10); bg.setCornerRadii(new float[]{0, 0, r, r, r, r, 0, 0}); bg.setStroke(dp(2), Color.parseColor("#111111")); handle.setBackground(bg);
        FrameLayout.LayoutParams hl = new FrameLayout.LayoutParams(dp(26), dp(52), Gravity.START | Gravity.TOP); root.addView(handle, hl);
        handle.setY(prefs.getFloat("asa", getResources().getDisplayMetrics().heightPixels * 0.45f));
        handle.setOnTouchListener(new View.OnTouchListener() {
            float y0, ty0; boolean moved;
            @Override public boolean onTouch(View v, MotionEvent e) {
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN: y0 = e.getRawY(); ty0 = v.getY(); moved = false; return true;
                    case MotionEvent.ACTION_MOVE: float dy = e.getRawY() - y0; if (Math.abs(dy) > dp(6)) moved = true;
                        if (moved) v.setY(Math.max(0, Math.min(((View) v.getParent()).getHeight() - v.getHeight(), ty0 + dy))); return true;
                    case MotionEvent.ACTION_UP: if (moved) prefs.edit().putFloat("asa", v.getY()).apply(); else showHome(); return true;
                }
                return false;
            }
        });
        handle.setVisibility(View.GONE);
        setContentView(root);
        try { startForegroundService(new Intent(this, KeepAlive.class)); } catch (Throwable t) { log("aviso", "segundo plano: " + t); }
        try { File[] old = OutboxProvider.dir(this).listFiles(); if (old != null) for (File f : old) if (System.currentTimeMillis() - f.lastModified() > 86400000L) f.delete(); } catch (Throwable ignored) {}
        if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::goBack);
        home.loadUrl(HOME);
        receive(getIntent());
        ui.postDelayed(() -> checkUpdates(false), 10000);
    }
    void loadApps() {
        try (InputStream in = getAssets().open("suite.json")) {
            @SuppressWarnings("unchecked") Map<String, Object> m = (Map<String, Object>) Updater.Json.parse(new String(Updater.readAll(in), StandardCharsets.UTF_8));
            for (Object o : (List<?>) m.get("apps")) {
                @SuppressWarnings("unchecked") Map<String, Object> x = (Map<String, Object>) o; AppInfo a = new AppInfo();
                a.id = String.valueOf(x.get("id")); a.name = String.valueOf(x.get("name")); a.desc = String.valueOf(x.get("desc")); a.repo = String.valueOf(x.get("repo"));
                a.color = String.valueOf(x.get("color")); a.sha = x.get("contentSha") == null ? "" : String.valueOf(x.get("contentSha"));
                Object ex = x.get("exclude"); if (ex instanceof List) for (Object e : (List<?>) ex) a.exclude.add(String.valueOf(e));
                apps.put(a.id, a);
            }
            step("Apps incluidas: " + apps.keySet());
        } catch (Exception e) { saveReport("lista de apps", e, "No se pudo leer la lista de apps incluidas", true); }
    }

    // ---------------------------------------------------------------- actualizaciones (una por app)
    void checkUpdates(boolean manual) {
        if (checking) { if (manual) toast("Ya estoy buscando actualizaciones…"); return; }
        checking = true; final List<String> ids = chosen(); final java.util.Set<String> openNow = new java.util.HashSet<>(views.keySet());
        if (manual) for (String id : ids) updState.put(id, "buscando");
        homeEvent("sh-estado");
        new Thread(() -> {
            int nuevas = 0;
            for (String id : ids) {
                Updater u = upds.get(id); if (u == null) continue;
                Updater.Result r = u.check(); step("Actualización " + id + ": " + r);
                String st = r.estado;
                if ("lista".equals(st)) {
                    nuevas++;
                    if (!openNow.contains(id) && u.applyNow()) st = "aplicada"; else st = "lista";   // si está abierta, se aplica al pulsar «Actualizar» en el inicio
                }
                updState.put(id, st); ui.post(() -> homeEvent("sh-estado"));
            }
            final int n = nuevas;
            checkProgram();
            ui.post(() -> { checking = false; homeEvent("sh-estado"); if (manual) toast(n == 0 ? "Todas las apps están al día" : n + (n == 1 ? " app actualizada" : " apps actualizadas")); });
        }).start();
    }

    /** ¿Hay un APK nuevo de la propia app única? (solo cuando cambia el programa; las apps se actualizan solas) */
    void checkProgram() {
        try {
            String[] lp = Updater.latestProgram("SampledHead-{v}-Android.apk"); if (lp == null) return;
            String v = lp[0], url = lp[1];
            if (!Updater.newer(versionName(), v) || v.equals(prefs.getString("avisado", ""))) return;
            final String go = url;
            ui.post(() -> { if (isFinishing()) return; prefs.edit().putString("avisado", v).apply();
                new AlertDialog.Builder(this).setTitle("Versión nueva de SampledHead (v" + v + ")")
                    .setMessage("Tienes la v" + versionName() + ". Las apps de dentro se actualizan solas, pero esta mejora es del propio programa: descarga el APK e instálalo encima (tus datos se conservan).")
                    .setPositiveButton("Descargar", (dl, w) -> { try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(go))); } catch (Exception e) { toast("No se pudo abrir el navegador"); } })
                    .setNegativeButton("Ahora no", null).show(); });
        } catch (Exception e) { log("aviso", "comprobación del programa: " + e.getMessage()); }
    }

    // ---------------------------------------------------------------- traer datos de las apps sueltas
    void startLegacy() {
        if (legacyNow != null || !legacyQueue.isEmpty()) { toast("Ya estoy trayendo los datos…"); return; }
        synchronized (legacyLog) { legacyLog.clear(); }
        for (String id : apps.keySet()) {
            if (!installed("com.sampledhead." + id)) continue;
            if (canExport(id)) legacyQueue.add(id);
            else legLog(apps.get(id).name + ": la app suelta es antigua. Actualízala desde el portal o usa «Guardar copia» en ella y «Elegir copias .shdatos» aquí.");
        }
        if (legacyQueue.isEmpty()) { legLog("No hay apps sueltas que puedan pasar sus datos."); homeEvent("sh-datos"); return; }
        nextLegacy();
    }
    void legLog(String s) { synchronized (legacyLog) { legacyLog.add(s); } step("Datos: " + s); }
    void nextLegacy() {
        legacyNow = legacyQueue.poll();
        if (legacyNow == null) { legLog("Terminado."); homeEvent("sh-datos"); return; }
        legacyT = System.currentTimeMillis(); final String id = legacyNow;
        try {
            Intent i = new Intent("com.sampledhead.EXPORTAR").setPackage("com.sampledhead." + id).addCategory(Intent.CATEGORY_DEFAULT);
            i.putExtra("to", getPackageName()); i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i); step("Pidiendo datos a " + id);
        } catch (Exception e) { legLog(apps.get(id).name + ": no se pudo abrir (" + e.getMessage() + ")"); ui.post(this::nextLegacy); return; }
        ui.postDelayed(() -> { if (id.equals(legacyNow) && System.currentTimeMillis() - legacyT >= 44000) { legLog(apps.get(id).name + ": no ha respondido."); if (hasWindowFocus()) nextLegacy(); } }, 45000);
    }
    /** Llega algo de otra app: por ahora, solo las copias de datos de las apps sueltas (kind=datos). */
    void receive(Intent in) {
        if (in == null || !"com.sampledhead.RECIBIR".equals(in.getAction()) || !"datos".equals(in.getStringExtra("kind"))) return;
        final String from = String.valueOf(in.getStringExtra("from")), err = in.getStringExtra("error"); final android.content.ClipData clip = in.getClipData();
        final String name = apps.containsKey(from) ? apps.get(from).name : from;
        if (err != null || clip == null || clip.getItemCount() == 0) { legLog(name + ": " + (err != null ? err : "no ha enviado nada")); afterLegacy(from); return; }
        new Thread(() -> {
            Uri u = clip.getItemAt(0).getUri(); File dst = new File(datosDir(), from + "-" + System.currentTimeMillis() + ".shdatos"); long n = 0;
            try (InputStream is = getContentResolver().openInputStream(u); java.io.OutputStream os = new java.io.FileOutputStream(dst)) { byte[] buf = new byte[65536]; int r; while ((r = is.read(buf)) > 0) { os.write(buf, 0, r); n += r; } legLog(name + ": copia recibida (" + (n / 1024) + " KB)"); }
            catch (Exception e) { dst.delete(); legLog(name + ": no se pudo leer la copia (" + e.getMessage() + ")"); }
            ui.post(() -> afterLegacy(from));
        }).start();
    }
    void afterLegacy(String from) { homeEvent("sh-datos"); if (from.equals(legacyNow)) ui.postDelayed(this::nextLegacy, 500); }

    // ---------------------------------------------------------------- ciclo de vida
    @Override protected void onNewIntent(Intent i) { super.onNewIntent(i); setIntent(i); receive(i); }
    void goBack() {
        if (current != null) { AppView v = views.get(current); if (v != null && v.web.canGoBack()) v.web.goBack(); else showHome(); }
        else moveTaskToBack(true);
    }
    @Override @SuppressWarnings("deprecation") public void onBackPressed() { goBack(); }
    @Override public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        super.onRequestPermissionsResult(code, perms, res);
        if (code == REQ_MIC && pendingPermission != null) {
            boolean ok = res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED;
            if (ok) pendingPermission.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE}); else { pendingPermission.deny(); toast("Sin permiso de micrófono no se puede grabar"); }
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
        fileCallback.onReceiveValue(uris); fileCallback = null;
    }
    @Override protected void onPause() { super.onPause(); if (home != null) home.onPause(); for (AppView v : views.values()) v.web.onPause(); }
    @Override protected void onResume() {
        super.onResume(); if (home != null) home.onResume(); for (AppView v : views.values()) v.web.onResume();
        if (legacyNow != null && System.currentTimeMillis() - legacyT > 45000) { legLog(apps.get(legacyNow).name + ": no ha respondido."); nextLegacy(); }
        long last = 0; for (Updater u : upds.values()) last = Math.max(last, u.lastCheck());
        if (last > 0 && System.currentTimeMillis() - last > 6 * 3600 * 1000L) checkUpdates(false);
    }
    @Override protected void onDestroy() {
        try { stopService(new Intent(this, KeepAlive.class)); } catch (Throwable ignored) {}
        for (UsbSerial us : usbs.values()) us.destroy(); usbs.clear();
        for (AppView v : views.values()) v.web.destroy(); views.clear(); if (home != null) { home.destroy(); home = null; }
        super.onDestroy();
    }
}
