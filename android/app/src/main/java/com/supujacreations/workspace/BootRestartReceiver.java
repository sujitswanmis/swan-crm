package com.supujacreations.workspace;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.content.ContextCompat;

/**
 * Automatically resumes FieldTrackingService after device reboot or APK upgrade
 * if the field executive was actively tracking before restart.
 */
public class BootRestartReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;
        String action = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
                && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
                && !"android.intent.action.QUICKBOOT_POWERON".equals(action)) {
            return;
        }

        try {
            FieldDeviceStatusReporter.get(context).ensureScheduled();
            SharedPreferences prefs = context.getSharedPreferences(FieldTrackingService.PREFS_NAME, Context.MODE_PRIVATE);
            boolean enabled = prefs.getBoolean("enabled", false);
            String userId = prefs.getString("userId", "");
            if (!enabled || userId == null || userId.trim().isEmpty()) {
                return;
            }

            boolean hasLocation = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                    || ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
            if (!hasLocation) {
                return;
            }

            Intent serviceIntent = new Intent(context, FieldTrackingService.class);
            serviceIntent.setAction(FieldTrackingService.ACTION_START);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }
        } catch (Exception ignored) {
            // Never crash on boot broadcast
        }
    }
}
