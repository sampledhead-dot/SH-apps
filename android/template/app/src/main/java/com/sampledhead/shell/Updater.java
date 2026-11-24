/*
 * Actualización del contenido de la app (la web) sin reinstalar el APK. Mismo funcionamiento que en escritorio
 * (desktop/app/updater.js):
 *  - 1 consulta a GitHub por el último commit del repo de la app y, si cambió, 1 más por su lista de archivos;
 *  - solo se descargan los archivos que cambiaron (raw.githubusercontent.com, fijados a ese commit) y cada uno se
 *    verifica con su huella de git (SHA-1 de «blob <tamaño>\0<datos>»);
 *  - se prepara en una carpeta aparte y se activa solo si está completa (al volver a abrir o al pulsar «Recargar»);
 *  - mismo origen (https://appassets.androidplatform.net), así que los datos guardados se conservan;
 *  - si la versión nueva no arranca, se vuelve a la anterior o a la incluida en el APK y no se reintenta.
 * Java puro (sin clases de Android) para poder probarlo también fuera del teléfono.
 */
package com.sampledhead.shell;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class Updater {
    public interface Bundled { InputStream open(String rel) throws IOException; }
    public interface Logger { void log(String kind, String msg); }
    public static class Result {
        public String estado = "error", sha, mensaje; public int cambiados; public long bytes;
        public String toString() { return estado + (sha != null ? " " + sha.substring(0, Math.min(7, sha.length())) : "") + (mensaje != null ? " · " + mensaje : "") + (cambiados > 0 ? " · " + cambiados + " archivos, " + (bytes / 1024) + " KB" : ""); }
    }

    static String API = "https://api.github.com", RAW = "https://raw.githubusercontent.com";
    /** 1.5.1: lista de archivos de cada repo que publica GitHub Actions (desktop/scripts/manifest.js). Se usa antes que la
     *  API, que sin cuenta solo admite 60 consultas/hora por IP y en datos móviles daba «HTTP 403». */
    static String MANIFEST = "https://github.com/sampledhead-dot/SH-apps/releases/download/actualizaciones/";
    static final String OWNER = "sampledhead-dot";
    static final long MAX_BYTES = 300L * 1024 * 1024;

    final String repo, bundledSha; final List<String> exclude; final Bundled bundled; final File base, stateFile; final Logger log;
    // estado
    String active, prev, ready, bundledSeen = ""; List<String> bad = new ArrayList<>(); long checked;

    public Updater(String repo, List<String> exclude, Bundled bundled, String bundledSha, File dataDir, Logger log) {
        this.repo = repo; this.exclude = exclude; this.bundled = bundled; this.bundledSha = bundledSha == null ? "" : bundledSha;
        this.base = new File(dataDir, "contenido"); this.stateFile = new File(base, "estado.json");
        this.log = log != null ? log : (k, m) -> {};
        base.mkdirs();
        load();
        if (!this.bundledSha.isEmpty() && !this.bundledSha.equals(bundledSeen)) {
            this.log.log("info", "programa nuevo: se usa la versión incluida " + short7(this.bundledSha));
            active = prev = ready = null; checked = 0; bundledSeen = this.bundledSha; save();
        }
        if (ready != null && valid(ready) && !ready.equals(active)) { prev = active; active = ready; ready = null; save(); this.log.log("info", "activada la versión descargada " + short7(active)); }
        if (active != null && !valid(active)) { this.log.log("aviso", "la versión " + active + " está incompleta: se usa la incluida"); active = null; save(); }
        cleanup();
    }

    static String short7(String s) { return s == null ? "-" : s.substring(0, Math.min(7, s.length())); }
    File dirOf(String sha) { return new File(base, sha); }
    boolean valid(String sha) { return sha != null && new File(dirOf(sha), "index.html").isFile() && new File(dirOf(sha), ".completo").isFile(); }

    // ---------------------------------------------------------------- API pública
    /** Carpeta de la versión descargada en uso, o null si se usa la incluida en el APK. */
    public synchronized File dir() { return active != null ? dirOf(active) : null; }
    public synchronized String sha() { return active != null ? active : bundledSha; }
    public synchronized boolean usingDownloaded() { return active != null; }
    public synchronized String pending() { return ready; }
    public synchronized long lastCheck() { return checked; }
    public synchronized boolean applyNow() { if (ready == null || !valid(ready)) return false; prev = active; active = ready; ready = null; save(); return true; }
    public synchronized boolean rollback(String reason) {
        if (active == null) return false;
        log.log("aviso", "la versión " + short7(active) + " no arranca (" + reason + "): se vuelve a la anterior");
        bad.add(active); while (bad.size() > 10) bad.remove(0);
        active = valid(prev) ? prev : null; prev = null; save(); return true;
    }
    public synchronized void reset() { active = prev = ready = null; save(); cleanup(); }
    public synchronized String describe() { return "{usando:" + short7(sha()) + ", descargada:" + (active != null) + ", activa:" + short7(active) + ", anterior:" + short7(prev) + ", lista:" + short7(ready) + ", malas:" + bad + ", incluida:" + short7(bundledSha) + "}"; }

    /** Busca y descarga una versión nueva (llamar fuera del hilo principal). */
    public Result check() {
        Result r = new Result();
        try {
            // 1) lista publicada por GitHub Actions (sin límite de consultas); 2) si falla, la API de GitHub como antes
            String sha = null; List<Object[]> raw = null;
            try {
                @SuppressWarnings("unchecked") Map<String, Object> m = (Map<String, Object>) Json.parse(getText(MANIFEST + repo + ".json"));
                sha = (String) m.get("sha"); raw = new ArrayList<>();
                for (Object o : (List<?>) m.get("files")) { List<?> f = (List<?>) o; raw.add(new Object[]{String.valueOf(f.get(0)), String.valueOf(f.get(1)), f.get(2)}); }
            } catch (Exception e) { log.log("aviso", "lista de actualizaciones: " + e.getMessage() + " · se pregunta a la API"); sha = null; raw = null; }
            String tree = null;
            if (sha == null) {
                @SuppressWarnings("unchecked") Map<String, Object> c = (Map<String, Object>) Json.parse(getText(API + "/repos/" + OWNER + "/" + repo + "/commits/HEAD"));
                sha = (String) c.get("sha");
                @SuppressWarnings("unchecked") Map<String, Object> commit = (Map<String, Object>) c.get("commit");
                @SuppressWarnings("unchecked") String tr = commit == null ? null : (String) ((Map<String, Object>) commit.get("tree")).get("sha"); tree = tr;
            }
            synchronized (this) { checked = System.currentTimeMillis(); save(); }
            r.sha = sha;
            String current; synchronized (this) { current = ready != null ? ready : active != null ? active : bundledSha; }
            if (sha == null || sha.equals(current)) { r.estado = "al-dia"; return r; }
            synchronized (this) { if (bad.contains(sha)) { r.estado = "al-dia"; r.mensaje = "esta versión falló antes al arrancar; se espera a la siguiente"; return r; } }
            if (raw == null) {
                @SuppressWarnings("unchecked") Map<String, Object> t = (Map<String, Object>) Json.parse(getText(API + "/repos/" + OWNER + "/" + repo + "/git/trees/" + tree + "?recursive=1"));
                if (Boolean.TRUE.equals(t.get("truncated"))) throw new IOException("la lista de archivos del repo está incompleta");
                raw = new ArrayList<>();
                for (Object o : (List<?>) t.get("tree")) { @SuppressWarnings("unchecked") Map<String, Object> e = (Map<String, Object>) o; if ("blob".equals(e.get("type"))) raw.add(new Object[]{e.get("path"), e.get("sha"), e.get("size")}); }
            }
            List<String[]> files = new ArrayList<>(); long total = 0; boolean hasIndex = false;
            for (Object[] e : raw) {
                String p = (String) e[0];
                if (!wanted(p, exclude)) continue;
                files.add(new String[]{p, (String) e[1]});
                if (e[2] instanceof Number) total += ((Number) e[2]).longValue();
                if ("index.html".equals(p)) hasIndex = true;
            }
            if (!hasIndex) throw new IOException("el repo no tiene index.html");
            if (total > MAX_BYTES) throw new IOException("la app ocupa demasiado para actualizarla así (" + (total / 1048576) + " MB)");
            File tmp = new File(base, sha + ".descargando"); deleteTree(tmp);
            String tmpPath = tmp.getCanonicalPath() + File.separator;
            for (String[] f : files) {
                File dest = new File(tmp, f[0]);
                if (!dest.getCanonicalPath().startsWith(tmpPath)) throw new IOException("ruta no válida: " + f[0]);
                byte[] buf = localCopy(f[0], f[1]);
                if (buf == null) {
                    StringBuilder u = new StringBuilder(RAW + "/" + OWNER + "/" + repo + "/" + sha);
                    for (String seg : f[0].split("/")) u.append('/').append(URLEncoder.encode(seg, "UTF-8").replace("+", "%20"));
                    buf = getBytes(u.toString());
                    if (!blobSha(buf).equals(f[1])) throw new IOException("el archivo " + f[0] + " no coincide con su huella (descarga dañada)");
                    r.cambiados++; r.bytes += buf.length;
                }
                dest.getParentFile().mkdirs();
                try (FileOutputStream os = new FileOutputStream(dest)) { os.write(buf); }
            }
            try (FileOutputStream os = new FileOutputStream(new File(tmp, ".completo"))) { os.write(sha.getBytes(StandardCharsets.UTF_8)); }
            deleteTree(dirOf(sha));
            if (!tmp.renameTo(dirOf(sha))) throw new IOException("no se pudo activar la carpeta descargada");
            synchronized (this) { ready = sha; save(); cleanup(); }
            log.log("info", "versión nueva lista: " + short7(sha) + " (" + r.cambiados + " archivos cambiados, " + (r.bytes / 1024) + " KB descargados)");
            r.estado = "lista"; return r;
        } catch (Exception e) {
            log.log("aviso", "actualización: " + e.getMessage());
            r.estado = "error"; r.mensaje = String.valueOf(e.getMessage()); return r;
        }
    }

    // ---------------------------------------------------------------- utilidades
    static boolean wanted(String p, List<String> exclude) {
        String[] parts = p.split("/");
        for (String x : parts) if (x.equals(".git") || x.equals(".github") || x.equals("node_modules")) return false;
        if (parts.length == 1 && (p.equals(".gitignore") || p.equals(".gitattributes"))) return false;
        return !exclude.contains(parts[0]);
    }
    public static String blobSha(byte[] b) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-1");
        md.update(("blob " + b.length + "\0").getBytes(StandardCharsets.UTF_8)); md.update(b);
        StringBuilder s = new StringBuilder(); for (byte x : md.digest()) s.append(String.format("%02x", x)); return s.toString();
    }
    byte[] localCopy(String rel, String sha) {
        String a; synchronized (this) { a = active; }
        if (a != null) { try (InputStream in = new FileInputStream(new File(dirOf(a), rel))) { byte[] b = readAll(in); if (blobSha(b).equals(sha)) return b; } catch (Exception ignored) {} }
        try (InputStream in = bundled.open(rel)) { byte[] b = readAll(in); if (blobSha(b).equals(sha)) return b; } catch (Exception ignored) {}
        return null;
    }
    static byte[] readAll(InputStream in) throws IOException { ByteArrayOutputStream o = new ByteArrayOutputStream(); byte[] b = new byte[65536]; int n; while ((n = in.read(b)) > 0) o.write(b, 0, n); return o.toByteArray(); }
    static HttpURLConnection open(String url) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000); c.setReadTimeout(30000);
        c.setRequestProperty("User-Agent", "SampledHead-app"); if (url.startsWith(API)) c.setRequestProperty("Accept", "application/vnd.github+json");
        c.setInstanceFollowRedirects(true);
        int code = c.getResponseCode(); if (code != 200) { c.disconnect(); throw new IOException("HTTP " + code + " en " + url); }
        return c;
    }
    static byte[] getBytes(String url) throws IOException { HttpURLConnection c = open(url); try (InputStream in = c.getInputStream()) { return readAll(in); } finally { c.disconnect(); } }
    /** Última release del programa (apps-v*): {tag, url del APK o de la release}. Primero la lista publicada; si falla, la API. */
    static String[] latestProgram(String apkName) {
        try {
            @SuppressWarnings("unchecked") Map<String, Object> m = (Map<String, Object>) Json.parse(getText(MANIFEST + "programa.json"));
            String tag = String.valueOf(m.get("tag")).replaceFirst("^apps-v", ""), url = String.valueOf(m.get("url"));
            Object a = m.get("assets"); if (a instanceof List) for (Object o : (List<?>) a) { List<?> x = (List<?>) o; if (String.valueOf(x.get(0)).equalsIgnoreCase(apkName.replace("{v}", tag))) url = String.valueOf(x.get(1)); }
            return new String[]{tag, url};
        } catch (Exception e) {
            try {
                @SuppressWarnings("unchecked") Map<String, Object> rel = (Map<String, Object>) Json.parse(getText(API + "/repos/sampledhead-dot/SH-apps/releases/latest"));
                String tag = String.valueOf(rel.get("tag_name")).replaceFirst("^apps-v", ""), url = String.valueOf(rel.get("html_url"));
                Object a = rel.get("assets"); if (a instanceof List) for (Object o : (List<?>) a) { @SuppressWarnings("unchecked") Map<String, Object> x = (Map<String, Object>) o; if (String.valueOf(x.get("name")).equalsIgnoreCase(apkName.replace("{v}", tag))) url = String.valueOf(x.get("browser_download_url")); }
                return new String[]{tag, url};
            } catch (Exception e2) { return null; }
        }
    }
    static String getText(String url) throws IOException { return new String(getBytes(url), StandardCharsets.UTF_8); }
    static void deleteTree(File f) { File[] k = f.listFiles(); if (k != null) for (File x : k) deleteTree(x); f.delete(); }

    synchronized void cleanup() {
        Set<String> keep = new HashSet<>(Arrays.asList("estado.json", String.valueOf(active), String.valueOf(prev), String.valueOf(ready)));
        File[] k = base.listFiles(); if (k != null) for (File x : k) if (!keep.contains(x.getName())) deleteTree(x);
    }
    synchronized void load() {
        try (InputStream in = new FileInputStream(stateFile)) {
            @SuppressWarnings("unchecked") Map<String, Object> m = (Map<String, Object>) Json.parse(new String(readAll(in), StandardCharsets.UTF_8));
            active = (String) m.get("active"); prev = (String) m.get("prev"); ready = (String) m.get("ready");
            bundledSeen = m.get("bundled") == null ? "" : (String) m.get("bundled");
            Object c = m.get("checked"); checked = c instanceof Number ? ((Number) c).longValue() : 0;
            bad = new ArrayList<>(); Object b = m.get("bad"); if (b instanceof List) for (Object x : (List<?>) b) bad.add(String.valueOf(x));
        } catch (Exception ignored) {}
    }
    synchronized void save() {
        StringBuilder s = new StringBuilder("{\"active\":").append(q(active)).append(",\"prev\":").append(q(prev)).append(",\"ready\":").append(q(ready))
            .append(",\"bundled\":").append(q(bundledSeen)).append(",\"checked\":").append(checked).append(",\"bad\":[");
        for (int i = 0; i < bad.size(); i++) s.append(i > 0 ? "," : "").append(q(bad.get(i)));
        s.append("]}");
        File tmp = new File(base, "estado.json.tmp");
        try (FileOutputStream os = new FileOutputStream(tmp)) { os.write(s.toString().getBytes(StandardCharsets.UTF_8)); } catch (IOException e) { log.log("aviso", "no se pudo guardar el estado: " + e.getMessage()); return; }
        if (!tmp.renameTo(stateFile)) { stateFile.delete(); tmp.renameTo(stateFile); }
    }
    static String q(String v) { return v == null ? "null" : "\"" + v.replace("\\", "\\\\").replace("\"", "\\\"") + "\""; }

    /** ¿b es una versión más nueva que a? */
    public static boolean newer(String a, String b) {
        String[] pa = a.split("\\."), pb = b.split("\\.");
        for (int i = 0; i < 3; i++) { int x = i < pa.length ? num(pa[i]) : 0, y = i < pb.length ? num(pb[i]) : 0; if (x != y) return y > x; }
        return false;
    }
    static int num(String s) { try { return Integer.parseInt(s.replaceAll("[^0-9].*$", "")); } catch (Exception e) { return 0; } }

    /** Lector JSON mínimo (objetos, listas, textos, números, true/false/null). */
    static final class Json {
        final String s; int i;
        Json(String s) { this.s = s; }
        static Object parse(String s) { Json j = new Json(s); j.ws(); Object v = j.val(); return v; }
        void ws() { while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++; }
        Object val() {
            ws(); char c = s.charAt(i);
            if (c == '{') { i++; Map<String, Object> m = new LinkedHashMap<>(); ws(); if (s.charAt(i) == '}') { i++; return m; }
                while (true) { ws(); String k = str(); ws(); i++; m.put(k, val()); ws(); char d = s.charAt(i++); if (d == '}') return m; } }
            if (c == '[') { i++; List<Object> l = new ArrayList<>(); ws(); if (s.charAt(i) == ']') { i++; return l; }
                while (true) { l.add(val()); ws(); char d = s.charAt(i++); if (d == ']') return l; } }
            if (c == '"') return str();
            if (s.startsWith("true", i)) { i += 4; return Boolean.TRUE; }
            if (s.startsWith("false", i)) { i += 5; return Boolean.FALSE; }
            if (s.startsWith("null", i)) { i += 4; return null; }
            int st = i; while (i < s.length() && "+-0123456789.eE".indexOf(s.charAt(i)) >= 0) i++;
            return Double.parseDouble(s.substring(st, i));
        }
        String str() {
            StringBuilder b = new StringBuilder(); i++;
            while (true) { char c = s.charAt(i++);
                if (c == '"') return b.toString();
                if (c == '\\') { char e = s.charAt(i++);
                    switch (e) { case 'n': b.append('\n'); break; case 't': b.append('\t'); break; case 'r': b.append('\r'); break; case 'b': b.append('\b'); break; case 'f': b.append('\f'); break;
                        case 'u': b.append((char) Integer.parseInt(s.substring(i, i + 4), 16)); i += 4; break; default: b.append(e); }
                } else b.append(c); }
        }
    }
}
