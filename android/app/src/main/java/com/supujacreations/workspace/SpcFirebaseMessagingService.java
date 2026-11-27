package com.supujacreations.workspace;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/**
 * Handles Firebase Cloud Messaging (FCM) push notifications when the app is in
 * foreground, background, or completely swipe-killed.
 */
public class SpcFirebaseMessagingService extends FirebaseMessagingService {

    public static final String CHANNEL_ID = "spc_workspace_alerts";
    public static final String PREF_FCM_TOKEN = "fcm_device_token";

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        try {
            SharedPreferences prefs = getSharedPreferences(FieldTrackingService.PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().putString(PREF_FCM_TOKEN, token).apply();
        } catch (Exception ignored) {}
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        try {
            Map<String, String> data = remoteMessage.getData();
            String title = remoteMessage.getNotification() != null && remoteMessage.getNotification().getTitle() != null
                ? remoteMessage.getNotification().getTitle()
                : (data != null && data.containsKey("title") ? data.get("title") : "SPC Workspace");
            String body = remoteMessage.getNotification() != null && remoteMessage.getNotification().getBody() != null
                ? remoteMessage.getNotification().getBody()
                : (data != null && data.containsKey("body") ? data.get("body") : "");
            String route = data != null && data.containsKey("route") ? data.get("route") : "";

            showAlertNotification(title, body, route);
        } catch (Exception ignored) {}
    }

    private void showAlertNotification(String title, String message, String route) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "SPC Operational Alerts",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("SPC Workspace Tasks, Broadcasts, Interviews & Complaints Alerts");
            channel.enableVibration(true);
            channel.setShowBadge(true);
            nm.createNotificationChannel(channel);
        }

        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (route != null && !route.trim().isEmpty()) {
            intent.putExtra("spc_route", route.trim());
        }
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        int notifId = (int) ((System.currentTimeMillis() % 900000L) + 100000L);
        PendingIntent pi = PendingIntent.getActivity(this, notifId, intent, flags);

        int smallIconRes = getApplicationInfo().icon;
        if (smallIconRes == 0) {
            smallIconRes = android.R.drawable.ic_dialog_info;
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(smallIconRes)
            .setContentTitle(title != null && !title.isEmpty() ? title : "SPC Workspace")
            .setContentText(message != null ? message : "")
            .setStyle(new NotificationCompat.BigTextStyle().bigText(message != null ? message : ""))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setAutoCancel(true)
            .setContentIntent(pi);

        nm.notify(notifId, builder.build());
    }
}
