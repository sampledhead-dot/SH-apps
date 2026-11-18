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

import java.io.OutputStream;
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
    }
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
        "window.addEventListener('unhandledrejection',function(e){console.error('[unhandledrejection] '+(e.reason&&e.reason.stack||e.reason))});" +
        "})();";

    // ---------------------------------------------------------------- ciclo de vida
    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        Thread.setDefaultUncaughtExceptionHandler((t, e) -> { saveReport("excepción no capturada (" + t.getName() + ")", e, null, false); android.os.Process.killProcess(android.os.Process.myPid()); System.exit(10); });
        step("Arrancando " + getString(R.string.app_name) + " v" + versionName());

        web = new WebView(this);
        web.setBackgroundColor(getColor(R.color.app_bg));
        setContentView(web);
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
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT))
            WebViewCompat.addDocumentStartJavaScript(web, INJECT, Collections.singleton("https://" + HOST));

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain(HOST).addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();

        web.setWebViewClient(new androidx.webkit.WebViewClientCompat() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
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
            }
            @Override public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail d) {
                saveReport("proceso de la página", null, "El proceso de la página se cerró (" + (d.didCrash() ? "fallo" : "falta de memoria") + ")", true);
                recreate();
                return true;
            }
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
        step("Cargando " + START);
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
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); }
    @Override protected void onDestroy() { if (web != null) { web.destroy(); web = null; } super.onDestroy(); }
}
