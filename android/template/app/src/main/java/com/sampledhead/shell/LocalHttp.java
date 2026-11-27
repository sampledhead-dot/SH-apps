/*
 * SampledHead Android — HTTP hacia Melodee (firmware alternativo de la Akai MPC Sample) conectada por USB-C: window.SHNet.
 * La web no puede llamarla directamente (http sin cifrar y sin CORS); esto lo hace la app. Solo deja hablar con
 * melodee.local y 192.168.155.1.
 *
 * JS:  id = SHNet.begin(método, url) · SHNet.chunk(id, base64) (cuerpo, en trozos) · SHNet.end(id)
 * Evento: window.__shNetEv(id, estado, base64 de la respuesta)  — estado −1 = no se pudo conectar (el texto es el motivo).
 */
package com.sampledhead.shell;

import android.app.Activity;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class LocalHttp {
    static final ExecutorService EX = Executors.newFixedThreadPool(2);
    final Activity act; final WebView web; final UsbSerial.Log log;
    final Map<Integer, Req> reqs = new HashMap<>(); int next = 1;
    static class Req { String method; URL url; ByteArrayOutputStream body = new ByteArrayOutputStream(); }

    public LocalHttp(Activity act, WebView web, UsbSerial.Log log) { this.act = act; this.web = web; this.log = log; }

    static boolean allowed(URL u) {
        String h = u.getHost() == null ? "" : u.getHost().toLowerCase(java.util.Locale.ROOT);
        return "http".equals(u.getProtocol()) && (h.equals("melodee.local") || h.equals("192.168.155.1"));
    }

    @JavascriptInterface public synchronized int begin(String method, String url) {
        try {
            URL u = new URL(url); if (!allowed(u)) return -1;
            String m = "POST".equalsIgnoreCase(method) ? "POST" : "GET";
            Req r = new Req(); r.method = m; r.url = u; int id = next++; reqs.put(id, r); return id;
        } catch (Exception e) { return -1; }
    }
    @JavascriptInterface public boolean chunk(int id, String b64) {
        Req r; synchronized (this) { r = reqs.get(id); } if (r == null) return false;
        try { byte[] b = Base64.decode(b64, Base64.DEFAULT); synchronized (r) { r.body.write(b, 0, b.length); } return true; } catch (Exception e) { return false; }
    }
    @JavascriptInterface public void end(int id) {
        Req r; synchronized (this) { r = reqs.remove(id); } if (r == null) { emit(id, -1, "petición desconocida"); return; }
        EX.submit(() -> run(id, r));
    }

    void run(int id, Req r) {
        HttpURLConnection c = null;
        try {
            byte[] body = r.body.toByteArray();
            c = (HttpURLConnection) r.url.openConnection();
            c.setConnectTimeout(3500); c.setReadTimeout(120000); c.setRequestMethod(r.method); c.setUseCaches(false);
            if ("POST".equals(r.method)) {
                c.setDoOutput(true); c.setFixedLengthStreamingMode(body.length);
                c.setRequestProperty("Content-Type", "application/octet-stream");
                try (OutputStream o = c.getOutputStream()) { o.write(body); }
            }
            int code = c.getResponseCode();
            InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
            ByteArrayOutputStream res = new ByteArrayOutputStream();
            if (in != null) { byte[] buf = new byte[16384]; int n; while ((n = in.read(buf)) > 0 && res.size() < (8 << 20)) res.write(buf, 0, n); in.close(); }
            if (log != null) log.log("melodee", r.method + " " + r.url.getPath() + " → " + code + (body.length > 0 ? " (" + body.length + " bytes)" : ""));
            emit(id, code, Base64.encodeToString(res.toByteArray(), Base64.NO_WRAP));
        } catch (Exception e) {
            String why = e.getClass().getSimpleName() + ": " + e.getMessage();
            if (log != null) log.log("melodee", r.method + " " + r.url + " · " + why);
            emit(id, -1, Base64.encodeToString(why.getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP));
        } finally { if (c != null) c.disconnect(); }
    }

    void emit(int id, int status, String b64) {
        final String js = "try{window.__shNetEv&&window.__shNetEv(" + id + "," + status + "," + JSONObject.quote(b64) + ")}catch(e){}";
        act.runOnUiThread(() -> { try { web.evaluateJavascript(js, null); } catch (Throwable ignored) {} });
    }
}
