package com.supujacreations.workspace;

import android.Manifest;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import androidx.core.content.ContextCompat;
import androidx.core.content.pm.PackageInfoCompat;
import androidx.core.location.LocationManagerCompat;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONArray;
import org.json.JSONObject;

/** Permission/connectivity diagnostics only. Never requests a fix or reads/writes the GPS queue. */
public final class FieldDeviceStatusReporter {
    private static final long HEARTBEAT_MS = 25000L;
    private static final long BACKGROUND_PERIOD_MS = 15 * 60 * 1000L;
    private static final int STATUS_JOB_ID = 9402;
    private static FieldDeviceStatusReporter instance;
    private final Context context;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean queued = new AtomicBoolean(false);
    private boolean foreground;
    private long lastSentMs;
    private String lastSignature = "";
    private String lastScope = "";

    public static synchronized FieldDeviceStatusReporter get(Context context) {
        if (instance == null) instance = new FieldDeviceStatusReporter(context.getApplicationContext());
        return instance;
    }

    private FieldDeviceStatusReporter(Context context) { this.context = context; }

    private SharedPreferences preferences() {
        return context.getSharedPreferences(FieldTrackingService.PREFS_NAME, Context.MODE_PRIVATE);
    }

    private boolean configured() {
        SharedPreferences prefs = preferences();
        return prefs.getBoolean("enabled", false) && !prefs.getString("userId", "").isEmpty()
            && !prefs.getString("token", "").isEmpty() && !prefs.getString("endpointUrl", "").isEmpty();
    }

    private String scope() {
        SharedPreferences prefs = preferences();
        return prefs.getString("userId", "") + ":" + prefs.getString("company", "") + ":" + prefs.getString("token", "");
    }

    private final Runnable foregroundTick = new Runnable() {
        @Override public void run() {
            if (!foreground) return;
            reportNow(false);
            main.postDelayed(this, HEARTBEAT_MS);
        }
    };

    public void onForeground() {
        foreground = true;
        main.removeCallbacks(foregroundTick);
        ensureScheduled();
        reportNow(true);
        main.postDelayed(foregroundTick, HEARTBEAT_MS);
    }

    public void onBackground() {
        foreground = false;
        main.removeCallbacks(foregroundTick);
        reportNow(true);
    }

    public void credentialsChanged() {
        ensureScheduled();
        reportNow(true);
    }

    public void ensureScheduled() {
        if (!configured()) return;
        try {
            JobScheduler scheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (scheduler == null) return;
            ComponentName service = new ComponentName(context, FieldDeviceStatusJobService.class);
            JobInfo pending = scheduler.getPendingJob(STATUS_JOB_ID);
            if (pending != null && service.equals(pending.getService()) && pending.isPeriodic()) return;
            scheduler.schedule(new JobInfo.Builder(STATUS_JOB_ID, service)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(BACKGROUND_PERIOD_MS)
                .setPersisted(true)
                .build());
        } catch (Exception ignored) { /* Foreground reporting remains independent of scheduler availability. */ }
    }

    public void stop() {
        foreground = false;
        main.removeCallbacks(foregroundTick);
        try {
            JobScheduler scheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (scheduler != null) scheduler.cancel(STATUS_JOB_ID);
        } catch (Exception ignored) {}
    }

    public JSONObject snapshot() throws Exception {
        boolean hasForeground = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean hasBackground = hasForeground && (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
            || ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED);
        LocationManager manager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        if (manager == null) throw new IllegalStateException("Location switch status unavailable");
        @SuppressWarnings("deprecation")
        PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
        JSONObject status = new JSONObject();
        status.put("capturedAtMs", System.currentTimeMillis());
        status.put("hasForegroundLocation", hasForeground);
        status.put("hasBackgroundLocation", hasBackground);
        status.put("gpsProviderEnabled", LocationManagerCompat.isLocationEnabled(manager));
        status.put("running", FieldTrackingService.isServiceRunning);
        status.put("appVersionCode", PackageInfoCompat.getLongVersionCode(info));
        status.put("appVersionName", info.versionName);
        return status;
    }

    private String signature(JSONObject status) {
        return status.optBoolean("hasForegroundLocation") + ":" + status.optBoolean("hasBackgroundLocation")
            + ":" + status.optBoolean("gpsProviderEnabled") + ":" + status.optBoolean("running");
    }

    public synchronized boolean statusDue(JSONObject status) {
        return !scope().equals(lastScope) || System.currentTimeMillis() - lastSentMs >= HEARTBEAT_MS
            || !signature(status).equals(lastSignature);
    }

    public synchronized void markAccepted(JSONObject status) {
        lastSentMs = System.currentTimeMillis();
        lastSignature = signature(status);
        lastScope = scope();
    }

    public void reportNow(boolean force) { reportNow(force, null); }

    // Completion is posted to the main thread so JobService never finishes before onStartJob returns.
    public void reportNow(boolean force, Runnable completion) {
        if (!queued.compareAndSet(false, true)) {
            if (completion != null) main.post(completion);
            return;
        }
        try {
            executor.execute(() -> {
                try { sendStatus(force); }
                finally {
                    queued.set(false);
                    if (completion != null) main.post(completion);
                }
            });
        } catch (Exception ignored) {
            queued.set(false);
            if (completion != null) main.post(completion);
        }
    }

    private boolean networkAvailable() {
        try {
            ConnectivityManager manager = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
            Network network = manager != null ? manager.getActiveNetwork() : null;
            NetworkCapabilities caps = network != null ? manager.getNetworkCapabilities(network) : null;
            return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        } catch (Exception ignored) { return false; }
    }

    private void sendStatus(boolean force) {
        HttpURLConnection connection = null;
        try {
            if (!configured() || !networkAvailable()) return;
            String requestScope = scope();
            JSONObject status = snapshot();
            if (!force && !statusDue(status)) return;
            SharedPreferences prefs = preferences();
            String token = prefs.getString("token", "");
            String endpoint = prefs.getString("endpointUrl", "");
            // stopTracking/account changes must not schedule new diagnostic uploads for the old identity.
            if (!configured() || !requestScope.equals(scope())) return;
            JSONObject body = new JSONObject();
            body.put("token", token);
            body.put("pings", new JSONArray());
            body.put("deviceStatus", status);
            connection = (HttpURLConnection) new URL(endpoint.replaceAll("/+$", "") + "/api/field-force/telemetry").openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(10000);
            connection.setReadTimeout(15000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
            connection.setRequestProperty("Authorization", "Bearer " + token);
            try (OutputStream stream = connection.getOutputStream()) {
                stream.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
            int code = connection.getResponseCode();
            if (code >= 200 && code < 300) {
                StringBuilder response = new StringBuilder();
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) response.append(line);
                }
                if (new JSONObject(response.toString()).optBoolean("statusAccepted", false) && requestScope.equals(scope())) markAccepted(status);
            }
        } catch (Exception ignored) { /* Retry current state on resume, the next tick or a scheduled job. */ }
        finally { if (connection != null) connection.disconnect(); }
    }
}
