package com.supujacreations.workspace;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.pm.PackageInfoCompat;
import androidx.core.location.LocationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "FieldTracker",
    permissions = {
        @Permission(
            strings = {
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            },
            alias = "location"
        )
    }
)
public class FieldTrackerPlugin extends Plugin {

    private static final int BG_PERM_REQ_CODE = 1002;

    @Override public void load() {
        FieldDeviceStatusReporter.get(getContext()).ensureScheduled();
        FieldDeviceStatusReporter.get(getContext()).reportNow(true);
    }

    @Override protected void handleOnResume() {
        FieldDeviceStatusReporter.get(getContext()).onForeground();
    }

    @Override protected void handleOnPause() {
        FieldDeviceStatusReporter.get(getContext()).onBackground();
    }

    @Override protected void handleOnDestroy() {
        FieldDeviceStatusReporter.get(getContext()).onBackground();
    }

    @PluginMethod
    public void startTracking(PluginCall call) {
        String userId = call.getString("userId", "");
        if (userId == null || userId.trim().isEmpty()) {
            call.reject("userId is required");
            return;
        }
        String company = call.getString("company", "TNT00001");
        String branchCode = call.getString("branchCode", "");
        String endpointUrl = call.getString("endpointUrl", "https://app.supujacreations.com");
        String token = call.getString("token", "");

        Context ctx = getContext();
        SharedPreferences prefs = ctx.getSharedPreferences(FieldTrackingService.PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit()
            .putBoolean("enabled", true)
            .putString("userId", userId.trim())
            .putString("company", company != null ? company.trim() : "TNT00001")
            .putString("branchCode", branchCode != null ? branchCode.trim() : "")
            .putString("endpointUrl", endpointUrl != null ? endpointUrl.trim() : "https://app.supujacreations.com")
            .putString("token", token != null ? token.trim() : "")
            .apply();

        // Persisted credentials and diagnostics are available even if the GPS prompt is denied/pending.
        FieldDeviceStatusReporter.get(ctx).credentialsChanged();

        if (!hasLocationPermission()) {
            requestPermissionForAlias("location", call, "locationPermissionCallback");
            return;
        }

        boolean started = launchService(FieldTrackingService.ACTION_START);
        maybeRequestBackgroundPermissionOnce(prefs);

        JSObject res = new JSObject();
        res.put("started", started);
        res.put("running", FieldTrackingService.isServiceRunning || started);
        call.resolve(res);
    }

    @PermissionCallback
    private void locationPermissionCallback(PluginCall call) {
        FieldDeviceStatusReporter.get(getContext()).reportNow(true);
        if (getPermissionState("location") == PermissionState.GRANTED || hasLocationPermission()) {
            boolean started = launchService(FieldTrackingService.ACTION_START);
            SharedPreferences prefs = getContext().getSharedPreferences(FieldTrackingService.PREFS_NAME, Context.MODE_PRIVATE);
            maybeRequestBackgroundPermissionOnce(prefs);

            JSObject res = new JSObject();
            res.put("started", started);
            res.put("running", FieldTrackingService.isServiceRunning || started);
            call.resolve(res);
        } else {
            JSObject res = new JSObject();
            res.put("started", false);
            res.put("permissionDenied", true);
            call.resolve(res);
        }
    }

    private void appendExtendedDiagnostics(JSObject res, Context ctx, boolean hasFg, boolean hasBg) {
        String locationMode = !hasFg ? "denied" : (hasBg ? "all_the_time" : "while_using");
        res.put("locationMode", locationMode);

        long versionCode = -1L;
        String versionName = "";
        try {
            @SuppressWarnings("deprecation")
            PackageInfo pInfo = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
            if (pInfo != null) {
                versionCode = PackageInfoCompat.getLongVersionCode(pInfo);
                versionName = pInfo.versionName != null ? pInfo.versionName : "";
            }
        } catch (Exception ignored) {}
        if (versionCode > 0) {
            res.put("appVersionCode", (int) versionCode);
        }
        res.put("appVersionName", versionName);
        res.put("osVersion", Build.VERSION.RELEASE != null ? Build.VERSION.RELEASE : "");
        res.put("sdkInt", Build.VERSION.SDK_INT);
        res.put("deviceManufacturer", Build.MANUFACTURER != null ? Build.MANUFACTURER : "");
        res.put("deviceModel", Build.MODEL != null ? Build.MODEL : "");

        boolean batteryUnrestricted = true;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    batteryUnrestricted = pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
                }
            }
        } catch (Exception ignored) {}
        res.put("batteryUnrestricted", batteryUnrestricted);

        boolean notificationsEnabled = true;
        try {
            notificationsEnabled = NotificationManagerCompat.from(ctx).areNotificationsEnabled();
        } catch (Exception ignored) {}
        res.put("notificationsEnabled", notificationsEnabled);

        boolean gpsProviderEnabled = true;
        try {
            LocationManager lm = (LocationManager) ctx.getSystemService(Context.LOCATION_SERVICE);
            if (lm != null) {
                gpsProviderEnabled = LocationManagerCompat.isLocationEnabled(lm);
            }
        } catch (Exception ignored) {}
        res.put("gpsProviderEnabled", gpsProviderEnabled);
    }

    private boolean openIntentSafely(Intent intent) {
        try {
            Activity act = getActivity();
            if (act != null && !act.isFinishing()) {
                act.startActivity(intent);
                return true;
            }
            Context ctx = getContext();
            if (ctx != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(intent);
                return true;
            }
        } catch (Exception ignored) {}
        return false;
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Context ctx = getContext();
        boolean opened = false;
        if (ctx != null) {
            Intent intent = new Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.fromParts("package", ctx.getPackageName(), null)
            );
            opened = openIntentSafely(intent);
            if (!opened) {
                opened = openIntentSafely(new Intent(Settings.ACTION_SETTINGS));
            }
        }
        JSObject res = new JSObject();
        res.put("opened", opened);
        call.resolve(res);
    }

    @PluginMethod
    public void requestBatteryExemption(PluginCall call) {
        Context ctx = getContext();
        if (ctx == null) {
            JSObject res = new JSObject();
            res.put("opened", false);
            res.put("batteryUnrestricted", false);
            call.resolve(res);
            return;
        }

        boolean alreadyUnrestricted = false;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
                alreadyUnrestricted = pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
            } else {
                alreadyUnrestricted = true;
            }
        } catch (Exception ignored) {}

        boolean opened = false;
        if (!alreadyUnrestricted && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            opened = openIntentSafely(new Intent(
                Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                Uri.parse("package:" + ctx.getPackageName())
            ));
            if (!opened) {
                opened = openIntentSafely(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
            }
            if (!opened) {
                opened = openIntentSafely(new Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.fromParts("package", ctx.getPackageName(), null)
                ));
            }
        }

        JSObject res = new JSObject();
        res.put("alreadyUnrestricted", alreadyUnrestricted);
        res.put("opened", opened);
        res.put("batteryUnrestricted", alreadyUnrestricted);
        call.resolve(res);
    }

    @PluginMethod
    public void openLocationSettings(PluginCall call) {
        boolean opened = openIntentSafely(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS));
        if (!opened) {
            opened = openIntentSafely(new Intent(Settings.ACTION_SETTINGS));
        }
        JSObject res = new JSObject();
        res.put("opened", opened);
        call.resolve(res);
    }

    @PluginMethod
    public void stopTracking(PluginCall call) {
        Context ctx = getContext();
        SharedPreferences prefs = ctx.getSharedPreferences(FieldTrackingService.PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putBoolean("enabled", false).apply();
        FieldDeviceStatusReporter.get(ctx).stop();

        try {
            Intent stopIntent = new Intent(ctx, FieldTrackingService.class);
            stopIntent.setAction(FieldTrackingService.ACTION_STOP);
            ctx.startService(stopIntent);
        } catch (Exception ignored) {}

        JSObject res = new JSObject();
        res.put("stopped", true);
        call.resolve(res);
    }

    @PluginMethod
    public void flushNow(PluginCall call) {
        FieldDeviceStatusReporter.get(getContext()).reportNow(true);
        boolean triggered = false;
        if (hasLocationPermission()) {
            triggered = launchService(FieldTrackingService.ACTION_FLUSH);
        }
        JSObject res = new JSObject();
        res.put("triggered", triggered);
        call.resolve(res);
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        Context ctx = getContext();
        OfflinePingDbHelper helper = new OfflinePingDbHelper(ctx);
        long pendingCount = helper.getPendingCount();
        boolean hasFg = hasLocationPermission();
        boolean hasBg = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
            || ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED;

        JSObject res = new JSObject();
        res.put("running", FieldTrackingService.isServiceRunning);
        res.put("pendingCount", pendingCount);
        res.put("hasForegroundLocation", hasFg);
        res.put("hasBackgroundLocation", hasBg);
        appendExtendedDiagnostics(res, ctx, hasFg, hasBg);
        call.resolve(res);
    }

    private boolean hasLocationPermission() {
        Context ctx = getContext();
        return ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean launchService(String action) {
        try {
            Context ctx = getContext();
            Intent intent = new Intent(ctx, FieldTrackingService.class);
            intent.setAction(action);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(intent);
            } else {
                ctx.startService(intent);
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private void maybeRequestBackgroundPermissionOnce(SharedPreferences prefs) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R || getActivity() == null) return;
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            return;
        }
        if (prefs.getBoolean("bg_perm_prompted", false)) return;
        prefs.edit().putBoolean("bg_perm_prompted", true).apply();
        try {
            ActivityCompat.requestPermissions(
                getActivity(),
                new String[]{ Manifest.permission.ACCESS_BACKGROUND_LOCATION },
                BG_PERM_REQ_CODE
            );
        } catch (Exception ignored) {}
    }
}
