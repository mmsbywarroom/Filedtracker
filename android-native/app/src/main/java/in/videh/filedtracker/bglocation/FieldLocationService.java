package in.videh.filedtracker.bglocation;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.location.Location;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.google.android.gms.tasks.CancellationTokenSource;

import org.json.JSONArray;
import org.json.JSONObject;

import in.videh.filedtracker.nativeapp.SecurityHelper;
import in.videh.filedtracker.nativeapp.SecurityReporter;

public class FieldLocationService extends Service {
    private static final String TAG = "FTLocationService";
    private static final String CHANNEL_ID = "ft_field_tracking";
    private static final int NOTIFICATION_ID = 41001;
    public static final String ACTION_INTERVAL_CHECK = "in.videh.filedtracker.ACTION_INTERVAL_CHECK";
    private static final long TICK_MS = 60_000L;
    private static final long TRACK_MS = 15_000L;
    private static final long HEARTBEAT_MS = 120_000L;
    private static final long LOC_INTERVAL_MS = 20_000L;
    private static final long HOURLY_SECURITY_MS = 60 * 60 * 1000L;

    private Handler handler;
    private FusedLocationProviderClient fused;
    private LocationCallback locationCallback;
    private volatile Location lastLoc;
    private long lastHeartbeatAt = 0L;
    private long lastHourlySecurityAt = 0L;
    private int gpsFailStreak = 0;
    private PowerManager.WakeLock wakeLock;
    private final JSONArray mapProbes = new JSONArray();
    private boolean startedFg = false;

    private final Runnable trackRunnable = new Runnable() {
        @Override
        public void run() {
            try {
                if (!TrackingPrefs.isActive(FieldLocationService.this)) {
                    stopSelf();
                    return;
                }
                runTrackTick();
            } catch (Exception e) {
                Log.e(TAG, "trackRunnable", e);
            }
            handler.postDelayed(this, TRACK_MS);
        }
    };

    private final Runnable tickRunnable = new Runnable() {
        @Override
        public void run() {
            try {
                if (!TrackingPrefs.isActive(FieldLocationService.this)) {
                    stopSelf();
                    return;
                }
                runIntervalTick();
            } catch (Exception e) {
                Log.e(TAG, "tickRunnable", e);
            }
            handler.postDelayed(this, TICK_MS);
        }
    };

    public static void start(Context ctx, String apiBase, String token, String punchInAt) {
        try {
            TrackingPrefs.saveSession(ctx, apiBase, token, punchInAt);
            startExisting(ctx);
            IntervalAlarms.scheduleNext(ctx);
        } catch (Exception e) {
            Log.e(TAG, "FieldLocationService.start failed", e);
        }
    }

    /** Resume the foreground service without resetting punch-in time or 30-min slots. */
    public static void startExisting(Context ctx) {
        try {
            if (!TrackingPrefs.isActive(ctx)) return;
            Intent intent = new Intent(ctx, FieldLocationService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(intent);
            } else {
                ctx.startService(intent);
            }
            IntervalAlarms.scheduleNext(ctx);
        } catch (Exception e) {
            Log.e(TAG, "FieldLocationService.startExisting failed", e);
        }
    }

    /** Alarm / boot asks for an immediate 30-min slot attempt. */
    public static void requestIntervalCheck(Context ctx) {
        try {
            if (!TrackingPrefs.isActive(ctx)) return;
            Intent intent = new Intent(ctx, FieldLocationService.class);
            intent.setAction(ACTION_INTERVAL_CHECK);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(intent);
            } else {
                ctx.startService(intent);
            }
        } catch (Exception e) {
            Log.e(TAG, "requestIntervalCheck failed", e);
        }
    }

    public static void stop(Context ctx) {
        try {
            IntervalAlarms.cancel(ctx);
            TrackingPrefs.clear(ctx);
            ctx.stopService(new Intent(ctx, FieldLocationService.class));
        } catch (Exception e) {
            Log.e(TAG, "FieldLocationService.stop failed", e);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        handler = new Handler(Looper.getMainLooper());
        fused = LocationServices.getFusedLocationProviderClient(this);
        createNotificationChannel();
        // Must promote to foreground ASAP to avoid crash on Android 8+
        try {
            startForeground(NOTIFICATION_ID, buildNotification());
            startedFg = true;
        } catch (Exception e) {
            Log.e(TAG, "startForeground in onCreate failed", e);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            if (!startedFg) {
                startForeground(NOTIFICATION_ID, buildNotification());
                startedFg = true;
            }
        } catch (Exception e) {
            Log.e(TAG, "startForeground failed", e);
            stopSelf();
            return START_NOT_STICKY;
        }

        if (!TrackingPrefs.isActive(this)) {
            stopSelf();
            return START_NOT_STICKY;
        }

        try {
            acquireWakeLock();
            startLocationUpdates();
            handler.removeCallbacks(tickRunnable);
            handler.removeCallbacks(trackRunnable);
            handler.post(trackRunnable);
            handler.post(tickRunnable);
            IntervalAlarms.scheduleNext(this);
            if (intent != null && ACTION_INTERVAL_CHECK.equals(intent.getAction())) {
                handler.post(this::runIntervalTick);
            }
        } catch (Exception e) {
            Log.e(TAG, "onStartCommand setup failed", e);
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        try {
            handler.removeCallbacks(tickRunnable);
            handler.removeCallbacks(trackRunnable);
            stopLocationUpdates();
            releaseWakeLock();
        } catch (Exception e) {
            Log.w(TAG, "onDestroy cleanup", e);
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void startLocationUpdates() {
        if (locationCallback != null) return;
        try {
            LocationRequest req = new LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, LOC_INTERVAL_MS)
                    .setMinUpdateIntervalMillis(10_000L)
                    .setMaxUpdateDelayMillis(60_000L)
                    .setWaitForAccurateLocation(false)
                    .build();
            locationCallback = new LocationCallback() {
                @Override
                public void onLocationResult(LocationResult result) {
                    if (result == null) return;
                    Location loc = result.getLastLocation();
                    if (loc != null) lastLoc = loc;
                }
            };
            fused.requestLocationUpdates(req, locationCallback, Looper.getMainLooper());
        } catch (SecurityException e) {
            Log.e(TAG, "location updates permission missing", e);
        } catch (Exception e) {
            Log.e(TAG, "startLocationUpdates failed", e);
        }
    }

    private void stopLocationUpdates() {
        if (locationCallback == null) return;
        try {
            fused.removeLocationUpdates(locationCallback);
        } catch (Exception ignored) {
        }
        locationCallback = null;
    }

    private void runTrackTick() {
        String apiBase = TrackingPrefs.apiBase(this);
        String token = TrackingPrefs.token(this);
        if (apiBase == null || token == null || token.isEmpty()) return;

        if (SecurityHelper.isGpsDisabled(this)) {
            gpsFailStreak++;
            if (gpsFailStreak >= 5) {
                TrackingApi.postGpsOff(apiBase, token, 0, 0);
                stop(this);
            }
            return;
        }

        withLocation(loc -> {
            if (loc == null) {
                gpsFailStreak++;
                return;
            }
            gpsFailStreak = 0;
            if (SecurityHelper.isMockLocation(loc)) {
                SecurityHelper.reportPunchEvidence(this, loc);
                // Do not stop — keep recording so Attendance FLAG can catch fixed fake GPS.
            }
            maybeHourlySecurityCheck(loc);
            try {
                JSONObject probe = new JSONObject();
                probe.put("lat", loc.getLatitude());
                probe.put("lng", loc.getLongitude());
                probe.put("accuracy", loc.getAccuracy());
                probe.put("at", loc.getTime());
                synchronized (mapProbes) {
                    mapProbes.put(probe);
                    while (mapProbes.length() > 40) mapProbes.remove(0);
                }
                JSONObject point = new JSONObject();
                point.put("lat", loc.getLatitude());
                point.put("lng", loc.getLongitude());
                point.put(
                        "recordedAt",
                        new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
                                .format(new java.util.Date(loc.getTime()))
                );
                point.put("accuracy", loc.getAccuracy());
                JSONArray points = new JSONArray();
                points.put(point);
                JSONArray probesCopy;
                synchronized (mapProbes) {
                    probesCopy = new JSONArray(mapProbes.toString());
                }
                TrackingApi.postTrackBatch(
                        apiBase,
                        token,
                        points,
                        probesCopy,
                        computeSpread(probesCopy),
                        loc.getLatitude(),
                        loc.getLongitude()
                );
            } catch (Exception e) {
                Log.w(TAG, "track tick failed", e);
            }
        });
    }

    private void runIntervalTick() {
        String apiBase = TrackingPrefs.apiBase(this);
        String token = TrackingPrefs.token(this);
        long punchInMs = TrackingPrefs.punchInMs(this);
        if (apiBase == null || apiBase.isEmpty() || token == null || token.isEmpty() || punchInMs <= 0) {
            return;
        }

        // 30-min FLAG snapshots (native/iOS). VPN security logs are separate (hourly).
        long now = System.currentTimeMillis();
        int dueSlot = IntervalScheduler.findDueSlot(
                punchInMs,
                slot -> TrackingPrefs.hasSentSlot(this, slot),
                now
        );

        withLocation(loc -> {
            if (loc == null) return;
            if (SecurityHelper.isMockLocation(loc)) {
                SecurityHelper.reportPunchEvidence(this, loc);
                // Continue — 30-min snapshots still record so FLAG can catch fixed coords.
            }
            long ts = System.currentTimeMillis();
            maybeHourlySecurityCheck(loc);
            if (ts - lastHeartbeatAt >= HEARTBEAT_MS) {
                lastHeartbeatAt = ts;
                TrackingApi.postHeartbeat(apiBase, token, loc.getLatitude(), loc.getLongitude());
            }
            if (dueSlot > 0) {
                boolean ok = TrackingApi.postIntervalSnapshot(apiBase, token, dueSlot, loc.getLatitude(), loc.getLongitude());
                if (ok) {
                    TrackingPrefs.markSlotSent(this, dueSlot);
                    Log.i(TAG, "interval snapshot slot=" + dueSlot);
                    IntervalAlarms.scheduleNext(this);
                }
            } else {
                IntervalAlarms.scheduleNext(this);
            }
        });
    }

    /** Once per hour while punched in: log VPN / fake-GPS app names for admin. */
    private void maybeHourlySecurityCheck(Location loc) {
        long now = System.currentTimeMillis();
        if (now - lastHourlySecurityAt < HOURLY_SECURITY_MS) return;
        lastHourlySecurityAt = now;
        SecurityHelper.reportViolations(this, loc, "detected");
    }

    private interface LocationCallbackFn {
        void onResult(Location loc);
    }

    private void withLocation(LocationCallbackFn cb) {
        Location cached = lastLoc;
        if (cached != null && System.currentTimeMillis() - cached.getTime() < 90_000L) {
            cb.onResult(cached);
            return;
        }
        try {
            CancellationTokenSource cts = new CancellationTokenSource();
            fused.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cts.getToken())
                    .addOnSuccessListener(loc -> {
                        if (loc != null) lastLoc = loc;
                        cb.onResult(loc != null ? loc : lastLoc);
                    })
                    .addOnFailureListener(e -> {
                        Log.w(TAG, "getCurrentLocation failed", e);
                        cb.onResult(lastLoc);
                    });
        } catch (SecurityException e) {
            Log.e(TAG, "location permission missing", e);
            cb.onResult(lastLoc);
        } catch (Exception e) {
            Log.e(TAG, "withLocation failed", e);
            cb.onResult(lastLoc);
        }
    }

    private static double computeSpread(JSONArray probes) {
        if (probes.length() < 2) return 0;
        double max = 0;
        try {
            for (int i = 0; i < probes.length(); i++) {
                JSONObject a = probes.getJSONObject(i);
                for (int j = i + 1; j < probes.length(); j++) {
                    JSONObject b = probes.getJSONObject(j);
                    double d = haversine(a.getDouble("lat"), a.getDouble("lng"), b.getDouble("lat"), b.getDouble("lng"));
                    if (d > max) max = d;
                }
            }
        } catch (Exception ignored) {
        }
        return max;
    }

    private static double haversine(double lat1, double lng1, double lat2, double lng2) {
        double r = 6371000;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    private void acquireWakeLock() {
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AAPAttendance:GPS");
                wakeLock.setReferenceCounted(false);
                if (!wakeLock.isHeld()) wakeLock.acquire(12 * 60 * 60 * 1000L);
            }
        } catch (Exception e) {
            Log.w(TAG, "wake lock failed", e);
        }
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Exception ignored) {
        }
        wakeLock = null;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Field tracking",
                NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("GPS active while you are punched in");
        NotificationManager mgr = getSystemService(NotificationManager.class);
        if (mgr != null) mgr.createNotificationChannel(channel);
    }

    private Notification buildNotification() {
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pi = null;
        if (launch != null) {
            pi = PendingIntent.getActivity(
                    this,
                    0,
                    launch,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
        }
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("AAP Attendance active")
                .setContentText("Recording route and 30-min GPS checks")
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_LOW);
        if (pi != null) b.setContentIntent(pi);
        return b.build();
    }
}
