/*
 * Bandeja entre apps de Sampled Head en Android: cada APK tiene su propio almacenamiento, así que para pasar audio de
 * una app a otra la que envía deja los elementos en cache/salida/ y la que recibe los lee por este proveedor (solo con
 * el permiso de lectura que concede el propio intent de envío). No es accesible por otras apps sin ese permiso.
 */
package com.sampledhead.shell;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

public class OutboxProvider extends ContentProvider {
    static File dir(android.content.Context c) { File d = new File(c.getCacheDir(), "salida"); d.mkdirs(); return d; }
    File file(Uri u) throws FileNotFoundException {
        String n = u.getLastPathSegment();
        if (n == null || n.contains("/") || n.contains("..")) throw new FileNotFoundException("nombre no válido");
        File f = new File(dir(getContext()), n);
        if (!f.isFile()) throw new FileNotFoundException(n);
        return f;
    }
    @Override public boolean onCreate() { return true; }
    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        return ParcelFileDescriptor.open(file(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }
    @Override public Cursor query(Uri uri, String[] p, String s, String[] a, String o) {
        MatrixCursor c = new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE});
        try { File f = file(uri); c.addRow(new Object[]{f.getName(), f.length()}); } catch (Exception ignored) {}
        return c;
    }
    @Override public String getType(Uri uri) { return "application/octet-stream"; }
    @Override public Uri insert(Uri uri, ContentValues v) { return null; }
    @Override public int delete(Uri uri, String s, String[] a) { return 0; }
    @Override public int update(Uri uri, ContentValues v, String s, String[] a) { return 0; }
}
