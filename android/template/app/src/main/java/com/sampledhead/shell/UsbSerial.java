/*
 * SampledHead Android — puerto serie USB (CDC-ACM) para la web: window.SHUsb.
 * Lo usa TonoPad para hablar con la Roland SP-404MKII por cable (su puerto USB 0582:02E7, 921600 baudios),
 * igual que la app oficial de Roland y SparkyMK2. Sirve para cualquier aparato CDC-ACM.
 *
 * JS:  SHUsb.list() → JSON [{vid,pid,name}] · SHUsb.open(vid, pid, baud) · SHUsb.write(base64) → true/false · SHUsb.close()
 * Eventos: window.__shUsbEv(tipo, texto)  —  'open' ("ok" o el error), 'data' (base64), 'closed' (motivo).
 * Una sola conexión a la vez en todo el APK (la app única tiene varias vistas).
 */
package com.sampledhead.shell;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

public class UsbSerial {
    public interface Log { void log(String kind, String msg); }

    static final String ACTION = "com.sampledhead.USB_PERMISO";
    static final Object LOCK = new Object();
    static UsbSerial owner;            // quién tiene abierto el puerto (una vista)

    final Activity act;
    final WebView web;
    final Log log;
    UsbDeviceConnection conn;
    UsbInterface ifComm, ifData;
    UsbEndpoint epIn, epOut;
    Thread reader;
    int devVid, devPid;
    volatile boolean running;
    BroadcastReceiver pending;

    public UsbSerial(Activity act, WebView web, Log log) { this.act = act; this.web = web; this.log = log; }

    UsbManager mgr() { return (UsbManager) act.getSystemService(Context.USB_SERVICE); }

    void emit(String type, String text) {
        final String js = "try{window.__shUsbEv&&window.__shUsbEv(" + JSONObject.quote(type) + "," + JSONObject.quote(text == null ? "" : text) + ")}catch(e){}";
        act.runOnUiThread(() -> { try { web.evaluateJavascript(js, null); } catch (Throwable ignored) {} });
    }

    UsbDevice find(int vid, int pid) {
        for (UsbDevice d : mgr().getDeviceList().values()) if (d.getVendorId() == vid && d.getProductId() == pid) return d;
        return null;
    }

    @JavascriptInterface public String list() {
        JSONArray a = new JSONArray();
        try {
            for (UsbDevice d : mgr().getDeviceList().values()) {
                JSONObject o = new JSONObject();
                o.put("vid", d.getVendorId()); o.put("pid", d.getProductId());
                String n = null; try { n = d.getProductName(); } catch (Throwable ignored) {}
                o.put("name", n == null ? d.getDeviceName() : n);
                a.put(o);
            }
        } catch (Throwable t) { log.log("aviso", "usb list: " + t); }
        return a.toString();
    }

    @JavascriptInterface public boolean isOpen() { return conn != null && running; }

    @JavascriptInterface public void open(int vid, int pid, int baud) {
        act.runOnUiThread(() -> {
            try {
                synchronized (LOCK) { if (owner != null && owner != this) { emit("open", "El cable USB ya lo está usando otra app de SampledHead. Desconéctala allí primero."); return; } }
                if (conn != null) { emit("open", "ok"); return; }
                UsbDevice d = find(vid, pid);
                if (d == null) { emit("open", "No se encuentra el aparato. ¿Está encendido y conectado con un cable de datos (USB-C a USB-C, u OTG)?"); return; }
                UsbManager m = mgr();
                if (m.hasPermission(d)) { connect(d, baud); return; }
                if (pending != null) { try { act.unregisterReceiver(pending); } catch (Throwable ignored) {} pending = null; }
                pending = new BroadcastReceiver() {
                    @Override public void onReceive(Context c, Intent i) {
                        if (!ACTION.equals(i.getAction())) return;
                        try { act.unregisterReceiver(this); } catch (Throwable ignored) {}
                        pending = null;
                        UsbDevice dd = find(vid, pid);
                        if (dd != null && mgr().hasPermission(dd)) connect(dd, baud);
                        else emit("open", "Sin permiso para usar el aparato USB (pulsa «Aceptar» en el aviso de Android).");
                    }
                };
                IntentFilter f = new IntentFilter(ACTION);
                if (Build.VERSION.SDK_INT >= 33) act.registerReceiver(pending, f, Context.RECEIVER_NOT_EXPORTED);
                else act.registerReceiver(pending, f);
                int fl = Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0;
                PendingIntent pi = PendingIntent.getBroadcast(act, 404, new Intent(ACTION).setPackage(act.getPackageName()), fl);
                log.log("paso", "USB: pido permiso para " + Integer.toHexString(vid) + ":" + Integer.toHexString(pid));
                m.requestPermission(d, pi);
            } catch (Throwable t) { log.log("error", "usb open: " + t); emit("open", "Error al abrir el USB: " + t); }
        });
    }

    void connect(UsbDevice d, int baud) {
        try {
            UsbInterface comm = null, data = null;
            for (int i = 0; i < d.getInterfaceCount(); i++) {
                UsbInterface it = d.getInterface(i);
                if (it.getInterfaceClass() == UsbConstants.USB_CLASS_COMM && comm == null) comm = it;
                else if (it.getInterfaceClass() == UsbConstants.USB_CLASS_CDC_DATA && data == null) data = it;
            }
            if (data == null) { emit("open", "El aparato no tiene puerto serie USB (interfaz de datos CDC)."); return; }
            UsbEndpoint in = null, out = null;
            for (int i = 0; i < data.getEndpointCount(); i++) {
                UsbEndpoint e = data.getEndpoint(i);
                if (e.getType() != UsbConstants.USB_ENDPOINT_XFER_BULK) continue;
                if (e.getDirection() == UsbConstants.USB_DIR_IN) in = e; else out = e;
            }
            if (in == null || out == null) { emit("open", "No se encuentran las vías de datos del puerto USB."); return; }
            UsbDeviceConnection c = mgr().openDevice(d);
            if (c == null) { emit("open", "Android no deja abrir el aparato USB."); return; }
            if (comm != null) c.claimInterface(comm, true);
            if (!c.claimInterface(data, true)) { c.close(); emit("open", "El puerto USB está ocupado por otra app."); return; }
            int idx = comm != null ? comm.getId() : 0;
            byte[] lc = { (byte) baud, (byte) (baud >> 8), (byte) (baud >> 16), (byte) (baud >> 24), 0, 0, 8 };   // 8N1
            c.controlTransfer(0x21, 0x20, 0, idx, lc, 7, 1000);      // SET_LINE_CODING
            c.controlTransfer(0x21, 0x22, 0x03, idx, null, 0, 1000); // SET_CONTROL_LINE_STATE: DTR + RTS
            synchronized (LOCK) { owner = this; }
            devVid = d.getVendorId(); devPid = d.getProductId();
            conn = c; ifComm = comm; ifData = data; epIn = in; epOut = out; running = true;
            reader = new Thread(this::readLoop, "sh-usb-in"); reader.start();
            log.log("paso", "USB abierto " + Integer.toHexString(d.getVendorId()) + ":" + Integer.toHexString(d.getProductId()) + " a " + baud + " baudios");
            emit("open", "ok");
        } catch (Throwable t) { log.log("error", "usb connect: " + t); release(); emit("open", "Error al conectar: " + t); }
    }

    void readLoop() {
        byte[] buf = new byte[16384];
        int errors = 0;
        while (running) {
            UsbDeviceConnection c = conn; UsbEndpoint e = epIn;
            if (c == null || e == null) break;
            int n = c.bulkTransfer(e, buf, buf.length, 200);
            if (n > 0) { errors = 0; emit("data", Base64.encodeToString(buf, 0, n, Base64.NO_WRAP)); }
            else if (n < 0) {
                // −1 también es «sin datos» al vencer la espera; si el aparato ya no está, se acaba
                UsbDevice still = null; try { still = find(devVid, devPid); } catch (Throwable ignored) {}
                if (still == null && ++errors > 2) { running = false; release(); emit("closed", "Se ha desconectado el aparato USB."); return; }
            }
        }
    }

    @JavascriptInterface public boolean write(String b64) {
        UsbDeviceConnection c = conn; UsbEndpoint e = epOut;
        if (c == null || e == null) return false;
        try {
            byte[] d = Base64.decode(b64, Base64.DEFAULT);
            int off = 0;
            while (off < d.length) {
                int len = Math.min(16384, d.length - off);
                int n = c.bulkTransfer(e, d, off, len, 5000);
                if (n <= 0) { log.log("error", "usb write: " + n); return false; }
                off += n;
            }
            return true;
        } catch (Throwable t) { log.log("error", "usb write: " + t); return false; }
    }

    @JavascriptInterface public void close() { boolean was = conn != null; release(); if (was) emit("closed", "Desconectado."); }

    void release() {
        running = false;
        UsbDeviceConnection c = conn; conn = null;
        if (c != null) {
            try { if (ifComm != null) c.controlTransfer(0x21, 0x22, 0, ifComm.getId(), null, 0, 300); } catch (Throwable ignored) {}
            try { if (ifData != null) c.releaseInterface(ifData); } catch (Throwable ignored) {}
            try { if (ifComm != null) c.releaseInterface(ifComm); } catch (Throwable ignored) {}
            try { c.close(); } catch (Throwable ignored) {}
        }
        epIn = epOut = null; ifComm = ifData = null;
        synchronized (LOCK) { if (owner == this) owner = null; }
    }

    /** Al cerrar la vista o la actividad. */
    public void destroy() {
        if (pending != null) { try { act.unregisterReceiver(pending); } catch (Throwable ignored) {} pending = null; }
        release();
    }
}
