package com.supujacreations.workspace;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.BroadcastReceiver;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

public class FieldTrackingService extends Service {

    public static final String PREFS_NAME = "spc_field_tracker_prefs";
    public static final String ACTION_START = "com.supujacreations.workspace.ACTION_START_TRACKING";
    public static final String ACTION_STOP = "com.supujacreations.workspace.ACTION_STOP_TRACKING";
    public static final String ACTION_FLUSH = "com.supujacreations.workspace.ACTION_FLUSH_TRACKING";

    private static final String CHANNEL_ID = "spc_field_tracking_channel";
    private static final int NOTIFICATION_ID = 9401;
    private static final long HEARTBEAT_INTERVAL_MS = 25000L;
    private static final long MIN_TIME_THRESHOLD_MS = 22000L;
    private static final float MIN_DISTANCE_METERS = 15.0f;
    private static final float MAX_ACCURACY_METERS = 250.0f;

    public static volatile boolean isServiceRunning = false;

    private LocationManager locationManager;
    private OfflinePingDbHelper dbHelper;
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private Handler mainHandler;
    private ExecutorService uploadExecutor;

    private final Object stateLock = new Object();
    private boolean hasLastSaved = false;
    private double lastSavedLat = 0.0;
    private double lastSavedLng = 0.0;
    private long lastSavedTimeMs = 0L;
    private long lastGpsFixMs = 0L;
    private float lastGpsAcc = 9999f;
    private volatile boolean isUploading = false;
    private boolean providerReceiverRegistered = false;
    private final BroadcastReceiver providerReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            scheduleStatusHeartbeat(true);
        }
    };

    private final LocationListener locationListener = new LocationListener() {
        @Override
        public void onLocationChanged(@NonNull Location location) {
            handleIncomingLocation(location, false);
        }

        @Override
        public void onStatusChanged(String provider, int status, Bundle extras) {}

        @Override
        public void onProviderEnabled(@NonNull String provider) {
            scheduleStatusHeartbeat(true);
            pollSingleLocationFix(true);
        }

        @Override
        public void onProviderDisabled(@NonNull String provider) {
            scheduleStatusHeartbeat(true);
        }
    };

    private final Runnable heartbeatRunnable = new Runnable() {
        @Override
        public void run() {
            if (!isServiceRunning) return;
            long now = System.currentTimeMillis();
            boolean needsHeartbeat;
            synchronized (stateLock) {
                needsHeartbeat = !hasLastSaved || (now - lastSavedTimeMs >= MIN_TIME_THRESHOLD_MS);
            }
            if (needsHeartbeat) {
                pollSingleLocationFix(false);
            }
            if (isNetworkAvailable() && dbHelper != null && dbHelper.getPendingCount() > 0) {
                scheduleFlush(0L);
            }
            // Connectivity and permission reporting must not depend on a location fix.
            scheduleStatusHeartbeat(false);
            if (mainHandler != null) {
                mainHandler.postDelayed(this, HEARTBEAT_INTERVAL_MS);
            }
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        dbHelper = new OfflinePingDbHelper(this);
        mainHandler = new Handler(Looper.getMainLooper());
        uploadExecutor = Executors.newSingleThreadExecutor();
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        createNotificationChannel();
        FieldDeviceStatusReporter.get(this).ensureScheduled();
        registerConnectivityListener();
        try {
            ContextCompat.registerReceiver(this, providerReceiver,
                new IntentFilter(LocationManager.PROVIDERS_CHANGED_ACTION), ContextCompat.RECEIVER_NOT_EXPORTED);
            providerReceiverRegistered = true;
        } catch (Exception ignored) {}
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : ACTION_START;

        if (ACTION_STOP.equals(action)) {
            stopServiceCleanly();
            return START_NOT_STICKY;
        }

        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        if (!prefs.getBoolean("enabled", false) || !hasForegroundLocationPermission()) {
            FieldDeviceStatusReporter.get(this).reportNow(true);
            stopServiceCleanly();
            return START_NOT_STICKY;
        }

        if (!promoteToForeground()) {
            stopServiceCleanly();
            return START_NOT_STICKY;
        }

        isServiceRunning = true;
        scheduleStatusHeartbeat(false);

        if (ACTION_FLUSH.equals(action)) {
            scheduleFlush(0L);
            pollSingleLocationFix(true);
            return START_STICKY;
        }

        startLocationListeners();
        pollSingleLocationFix(true);
        mainHandler.removeCallbacks(heartbeatRunnable);
        mainHandler.postDelayed(heartbeatRunnable, HEARTBEAT_INTERVAL_MS);
        scheduleFlush(500L);
        return START_STICKY;
    }

    private boolean promoteToForeground() {
        try {
            Notification notif = buildNotification("Active • Live GPS & Offline SQLite Sync");
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            } else {
                startForeground(NOTIFICATION_ID, notif);
            }
            return true;
        } catch (SecurityException se) {
            return false;
        } catch (Exception e) {
            return false;
        }
    }

    private void stopServiceCleanly() {
        isServiceRunning = false;
        if (mainHandler != null) {
            mainHandler.removeCallbacksAndMessages(null);
        }
        if (locationManager != null) {
            try {
                locationManager.removeUpdates(locationListener);
            } catch (Exception ignored) {}
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
        stopSelf();
    }

    private boolean hasForegroundLocationPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void startLocationListeners() {
        if (locationManager == null || !hasForegroundLocationPermission()) return;
        try {
            locationManager.removeUpdates(locationListener);
        } catch (Exception ignored) {}

        try {
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(
                    LocationManager.GPS_PROVIDER,
                    15000L,
                    15.0f,
                    locationListener,
                    Looper.getMainLooper()
                );
            }
        } catch (SecurityException | IllegalArgumentException ignored) {}

        try {
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(
                    LocationManager.NETWORK_PROVIDER,
                    20000L,
                    20.0f,
                    locationListener,
                    Looper.getMainLooper()
                );
            }
        } catch (SecurityException | IllegalArgumentException ignored) {}
    }

    @SuppressWarnings("deprecation")
    private void pollSingleLocationFix(boolean forceSend) {
        if (locationManager == null || !hasForegroundLocationPermission()) return;
        try {
            boolean gpsEnabled = locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER);
            boolean netEnabled = locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
            String primaryProvider = gpsEnabled ? LocationManager.GPS_PROVIDER : (netEnabled ? LocationManager.NETWORK_PROVIDER : null);

            if (primaryProvider == null) return;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                locationManager.getCurrentLocation(
                    primaryProvider,
                    null,
                    ContextCompat.getMainExecutor(this),
                    loc -> {
                        if (loc != null) {
                            handleIncomingLocation(loc, forceSend);
                        } else if (LocationManager.GPS_PROVIDER.equals(primaryProvider) && netEnabled) {
                            try {
                                locationManager.getCurrentLocation(
                                    LocationManager.NETWORK_PROVIDER,
                                    null,
                                    ContextCompat.getMainExecutor(this),
                                    netLoc -> {
                                        if (netLoc != null) {
                                            handleIncomingLocation(netLoc, forceSend);
                                        } else {
                                            fallbackLastKnownFix(forceSend);
                                        }
                                    }
                                );
                            } catch (SecurityException ignored) {
                                fallbackLastKnownFix(forceSend);
                            }
                        } else {
                            fallbackLastKnownFix(forceSend);
                        }
                    }
                );
            } else {
                locationManager.requestSingleUpdate(primaryProvider, new LocationListener() {
                    @Override
                    public void onLocationChanged(@NonNull Location loc) {
                        handleIncomingLocation(loc, forceSend);
                    }
                    @Override public void onStatusChanged(String p, int s, Bundle e) {}
                    @Override public void onProviderEnabled(@NonNull String p) {}
                    @Override public void onProviderDisabled(@NonNull String p) {}
                }, Looper.getMainLooper());
            }
        } catch (SecurityException | IllegalArgumentException ignored) {
            fallbackLastKnownFix(forceSend);
        } catch (Exception ignored) {}
    }

    private void fallbackLastKnownFix(boolean forceSend) {
        if (locationManager == null || !hasForegroundLocationPermission()) return;
        try {
            long now = System.currentTimeMillis();
            Location gps = locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)
                ? locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER)
                : null;
            Location net = locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
                ? locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
                : null;

            Location best = null;
            if (gps != null && (now - gps.getTime() <= 45000L)) {
                best = gps;
            } else if (net != null && (now - net.getTime() <= 45000L)) {
                best = net;
            }
            if (best != null) {
                handleIncomingLocation(best, forceSend);
            }
        } catch (SecurityException ignored) {}
    }

    private void handleIncomingLocation(Location location, boolean forceSend) {
        if (location == null || dbHelper == null) return;

        double lat = location.getLatitude();
        double lng = location.getLongitude();
        if (Double.isNaN(lat) || Double.isNaN(lng) || (Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01)) {
            return;
        }

        float acc = location.hasAccuracy() ? location.getAccuracy() : 35f;
        if (acc > MAX_ACCURACY_METERS) return;

        long now = System.currentTimeMillis();
        String provider = location.getProvider() != null ? location.getProvider() : "";

        synchronized (stateLock) {
            if (LocationManager.GPS_PROVIDER.equals(provider)) {
                lastGpsFixMs = now;
                lastGpsAcc = acc;
            } else if (LocationManager.NETWORK_PROVIDER.equals(provider)) {
                // Reject coarse cell/Wi-Fi fixes whenever GPS had a crisp lock in the last 5 minutes,
                // and block blurry >80m network jumps for 15 minutes after any GPS fix.
                if ((now - lastGpsFixMs <= 300000L) && lastGpsAcc <= 35f && acc > 30f) {
                    return;
                }
                if ((now - lastGpsFixMs <= 900000L) && acc > 80f) {
                    return;
                }
            }

            float movedMeters = 0f;
            if (hasLastSaved) {
                float[] results = new float[1];
                Location.distanceBetween(lastSavedLat, lastSavedLng, lat, lng, results);
                movedMeters = results[0];
            }

            boolean shouldRecord = forceSend
                || !hasLastSaved
                || movedMeters >= MIN_DISTANCE_METERS
                || (now - lastSavedTimeMs >= MIN_TIME_THRESHOLD_MS);

            if (!shouldRecord) return;

            hasLastSaved = true;
            lastSavedLat = lat;
            lastSavedLng = lng;
            lastSavedTimeMs = now;

            persistPing(location, movedMeters, now);
        }
    }

    private void persistPing(Location loc, float movedMeters, long nowMs) {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String userId = prefs.getString("userId", "");
        String company = prefs.getString("company", "TNT00001");
        String branchCode = prefs.getString("branchCode", "");
        if (userId == null || userId.isEmpty()) return;

        boolean onlineAtCapture = isNetworkAvailable();

        int[] battery = readBatteryState();
        int speedKmh = loc.hasSpeed() ? Math.min(Math.round(loc.getSpeed() * 3.6f), 999) : 0;
        Integer heading = loc.hasBearing() ? Math.min(Math.round(loc.getBearing()), 360) : null;
        int accMeters = loc.hasAccuracy() ? Math.min(Math.round(loc.getAccuracy()), 9999) : 35;

        boolean isMock = false;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                isMock = loc.isMock();
            } else {
                isMock = isFromMockLegacy(loc);
            }
        } catch (Exception ignored) {}

        SimpleDateFormat isoFmt = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        isoFmt.setTimeZone(TimeZone.getTimeZone("UTC"));
        String recordedAtIso = isoFmt.format(new Date(nowMs));

        try {
            JSONObject obj = new JSONObject();
            obj.put("user_id", userId);
            obj.put("company", company);
            if (!branchCode.isEmpty()) {
                obj.put("branch_code", branchCode);
            } else {
                obj.put("branch_code", JSONObject.NULL);
            }
            obj.put("latitude", loc.getLatitude());
            obj.put("longitude", loc.getLongitude());
            obj.put("accuracy_meters", accMeters);
            obj.put("speed_kmh", speedKmh);
            if (heading != null) {
                obj.put("heading", heading);
            } else {
                obj.put("heading", JSONObject.NULL);
            }
            if (battery[0] >= 0) {
                obj.put("battery_pct", battery[0]);
            } else {
                obj.put("battery_pct", JSONObject.NULL);
            }
            obj.put("is_charging", battery[1] == 1);
            obj.put("is_moving", speedKmh > 2 || movedMeters >= 20f);
            obj.put("is_mock_gps", isMock);
            obj.put("is_offline_synced", !onlineAtCapture);
            obj.put("recorded_at", recordedAtIso);

            dbHelper.insertPing(obj.toString(), nowMs, !onlineAtCapture);
            if (onlineAtCapture) {
                scheduleFlush(0L);
            }
        } catch (Exception ignored) {}
    }

    @SuppressWarnings("deprecation")
    private boolean isFromMockLegacy(Location loc) {
        return loc.isFromMockProvider();
    }

    private int[] readBatteryState() {
        int pct = -1;
        int charging = 0;
        try {
            Intent batIntent = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (batIntent != null) {
                int level = batIntent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
                int scale = batIntent.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
                if (level >= 0 && scale > 0) {
                    pct = Math.round((level * 100f) / scale);
                }
                int status = batIntent.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
                if (status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL) {
                    charging = 1;
                }
            }
        } catch (Exception ignored) {}
        return new int[]{ pct, charging };
    }

    private boolean isNetworkAvailable() {
        if (connectivityManager == null) return false;
        try {
            Network net = connectivityManager.getActiveNetwork();
            if (net == null) return false;
            NetworkCapabilities caps = connectivityManager.getNetworkCapabilities(net);
            return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        } catch (Exception e) {
            return false;
        }
    }

    private void registerConnectivityListener() {
        if (connectivityManager == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return;
        try {
            networkCallback = new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(@NonNull Network network) {
                    scheduleStatusHeartbeat(true);
                    scheduleFlush(700L);
                    if (mainHandler != null) {
                        mainHandler.postDelayed(() -> pollSingleLocationFix(true), 400L);
                    }
                }
            };
            connectivityManager.registerDefaultNetworkCallback(networkCallback);
        } catch (Exception ignored) {}
    }

    private void scheduleFlush(long delayMs) {
        if (uploadExecutor == null || uploadExecutor.isShutdown()) return;
        if (delayMs <= 0L) {
            uploadExecutor.execute(this::flushPendingQueue);
        } else if (mainHandler != null) {
            mainHandler.postDelayed(() -> {
                if (uploadExecutor != null && !uploadExecutor.isShutdown()) {
                    uploadExecutor.execute(this::flushPendingQueue);
                }
            }, delayMs);
        }
    }

    private JSONObject buildDeviceStatus() throws Exception {
        JSONObject status = FieldDeviceStatusReporter.get(this).snapshot();
        status.put("pendingCount", dbHelper != null ? dbHelper.getPendingCount() : 0);
        return status;
    }

    private boolean statusDue(JSONObject status) {
        return FieldDeviceStatusReporter.get(this).statusDue(status);
    }

    private void markStatusAccepted(JSONObject status) {
        FieldDeviceStatusReporter.get(this).markAccepted(status);
    }

    private void scheduleStatusHeartbeat(boolean force) {
        FieldDeviceStatusReporter.get(this).reportNow(force);
    }

    private void flushPendingQueue() {
        if (isUploading || dbHelper == null || !isNetworkAvailable()) return;
        isUploading = true;
        try {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            String endpointUrl = prefs.getString("endpointUrl", "");
            String token = prefs.getString("token", "");
            if (endpointUrl == null || endpointUrl.isEmpty() || token == null || token.isEmpty()) {
                return;
            }

            String targetUrl = endpointUrl.replaceAll("/+$", "") + "/api/field-force/telemetry";

            while (isNetworkAvailable()) {
                List<OfflinePingDbHelper.QueuedPing> batch = dbHelper.fetchBatch(40);
                if (batch.isEmpty()) break;

                JSONArray pingsArray = new JSONArray();
                List<Long> idsToDelete = new ArrayList<>();
                long nowMs = System.currentTimeMillis();

                for (OfflinePingDbHelper.QueuedPing item : batch) {
                    try {
                        JSONObject pingJson = new JSONObject(item.payloadJson);
                        boolean delayed = item.isOfflineSynced || (nowMs - item.recordedAtMs > 30000L);
                        pingJson.put("is_offline_synced", delayed);
                        pingsArray.put(pingJson);
                        idsToDelete.add(item.id);
                    } catch (Exception parseErr) {
                        idsToDelete.add(item.id);
                    }
                }

                if (pingsArray.length() == 0) {
                    dbHelper.deleteByIds(idsToDelete);
                    continue;
                }

                JSONObject requestBody = new JSONObject();
                requestBody.put("token", token);
                requestBody.put("pings", pingsArray);
                JSONObject deviceStatus = null;
                boolean includeStatus = false;
                try {
                    deviceStatus = buildDeviceStatus();
                    includeStatus = statusDue(deviceStatus);
                } catch (Exception ignored) { /* Diagnostics must not block queued GPS uploads. */ }
                if (includeStatus) requestBody.put("deviceStatus", deviceStatus);

                HttpURLConnection conn = null;
                try {
                    URL url = new URL(targetUrl);
                    conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setConnectTimeout(10000);
                    conn.setReadTimeout(15000);
                    conn.setDoOutput(true);
                    conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
                    conn.setRequestProperty("Authorization", "Bearer " + token);

                    byte[] bytes = requestBody.toString().getBytes(StandardCharsets.UTF_8);
                    try (OutputStream os = conn.getOutputStream()) {
                        os.write(bytes);
                    }

                    int code = conn.getResponseCode();
                    if (code >= 200 && code < 300) {
                        StringBuilder sb = new StringBuilder();
                        try (BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                            String line;
                            while ((line = br.readLine()) != null) sb.append(line);
                        }
                        JSONObject resp = new JSONObject(sb.toString());
                        if (includeStatus && resp.optBoolean("statusAccepted", false)) markStatusAccepted(deviceStatus);
                        if (resp.optBoolean("success", true)) {
                            dbHelper.deleteByIds(idsToDelete);
                        } else {
                            break;
                        }
                    } else {
                        break;
                    }
                } catch (Exception netErr) {
                    break;
                } finally {
                    if (conn != null) conn.disconnect();
                }

                if (batch.size() < 40) break;
            }
        } catch (Exception ignored) {
        } finally {
            isUploading = false;
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Field Live GPS Tracking",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Keeps field GPS & offline breadcrumb sync active while on duty.");
            channel.setShowBadge(false);
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private Notification buildNotification(String text) {
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int piFlags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
            ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            : PendingIntent.FLAG_UPDATE_CURRENT;
        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, openIntent, piFlags);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("SPC Workspace Field Tracking")
            .setContentText(text)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setContentIntent(pendingIntent)
            .build();
    }

    @Override
    public void onDestroy() {
        isServiceRunning = false;
        if (providerReceiverRegistered) {
            try { unregisterReceiver(providerReceiver); } catch (Exception ignored) {}
            providerReceiverRegistered = false;
        }
        if (mainHandler != null) {
            mainHandler.removeCallbacksAndMessages(null);
        }
        if (locationManager != null) {
            try {
                locationManager.removeUpdates(locationListener);
            } catch (Exception ignored) {}
        }
        if (connectivityManager != null && networkCallback != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            try {
                connectivityManager.unregisterNetworkCallback(networkCallback);
            } catch (Exception ignored) {}
        }
        if (uploadExecutor != null) {
            uploadExecutor.shutdownNow();
        }
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
