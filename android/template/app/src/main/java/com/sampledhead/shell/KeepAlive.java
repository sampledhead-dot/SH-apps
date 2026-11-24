/*
 * Mantiene la app viva mientras está abierta aunque pases a otra app (antes Android la cerraba en segundo plano y al volver
 * se recargaba desde cero). Es un servicio en primer plano de tipo «reproducción» con una notificación discreta; se para
 * al cerrar la app. Desde la notificación se vuelve a la app.
 */
package com.sampledhead.shell;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

public class KeepAlive extends Service {
    static final String CH = "abierta";
    @Override public IBinder onBind(Intent i) { return null; }
    @Override public int onStartCommand(Intent intent, int flags, int id) {
        try {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm.getNotificationChannel(CH) == null) {
                NotificationChannel c = new NotificationChannel(CH, "App abierta", NotificationManager.IMPORTANCE_MIN);
                c.setDescription("Mantiene la app abierta en segundo plano para que no se pierda lo que estás haciendo");
                c.setShowBadge(false); nm.createNotificationChannel(c);
            }
            Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            Notification n = new Notification.Builder(this, CH)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle(getString(R.string.app_name))
                .setContentText("Abierta en segundo plano · toca para volver")
                .setContentIntent(pi).setOngoing(true).setShowWhen(false).build();
            if (Build.VERSION.SDK_INT >= 29) startForeground(7, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            else startForeground(7, n);
        } catch (Throwable t) { android.util.Log.w("SampledHead", "KeepAlive: " + t); stopSelf(); }
        return START_NOT_STICKY;
    }
    @Override public void onTaskRemoved(Intent root) { stopSelf(); }
}
