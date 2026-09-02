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
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.google.android.gms.tasks.CancellationTokenSource;

import org.json.JSONArray;
import org.json.JSONObject;

import in.videh.filedtracker.nativeapp.SecurityHelper;

public class FieldLocationService extends Service {
    private static final String TAG = "FTLocationService";
    private static final String CHANNEL_ID = "ft_field_tracking";
    private static final int NOTIFICATION_ID = 41001;
    private static final long TICK_MS = 60_000L;
    private static final long TRACK_MS = 8_000L;
    private static final long HEARTBEAT_MS = 120_000L;

    private Handler handler;
    private FusedLocationProviderClient fused;
    private long lastHeartbeatAt = 0L;
    private int gpsFailStreak = 0;
    private PowerManager.WakeLock wakeLock;
    private final JSONArray mapProbes = new JSONArray();

    private final Runnable trackRunnable = new Runnable() {
        @Override
        public void run() {
            if (!TrackingPrefs.isActive(FieldLocationService.this)) {
                stopSelf();
                return;
            }
            runTrackTick();
            handler.postDelayed(this, TRACK_MS);
        }
    };

    private final Runnable tickRunnable = new Runnable() {
        @Override
        public void run() {
            if (!TrackingPrefs.isActive(FieldLocationService.this)) {
                stopSelf();
                return;
            }
            runIntervalTick();
            handler.postDelayed(this, TICK_MS);
        }
    };

    public static void start(Context ctx, String apiBase, String token, String punchInAt) {
        TrackingPrefs.saveSession(ctx, apiBase, token, punchInAt);
        Intent intent = new Intent(ctx, FieldLocationService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(intent);
        } else {
            ctx.startService(intent);
        }
    }

    public static void stop(Context ctx) {
        TrackingPrefs.clear(ctx);
        ctx.stopService(new Intent(ctx, FieldLocationService.class));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        handler = new Handler(Looper.getMainLooper());
        fused = LocationServices.getFusedLocationProviderClient(this);
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!TrackingPrefs.isActive(this)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        acquireWakeLock();
        startForeground(NOTIFICATION_ID, buildNotification());
        handler.removeCallbacks(tickRunnable);
        handler.removeCallbacks(trackRunnable);
        handler.post(trackRunnable);
        handler.post(tickRunnable);
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(tickRunnable);
        handler.removeCallbacks(trackRunnable);
        releaseWakeLock();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void runTrackTick() {
        String apiBase = TrackingPrefs.apiBase(this);
        String token = TrackingPrefs.token(this);
        if (apiBase == null || token == null || token.isEmpty()) return;

        if (SecurityHelper.isVpnActive(this)) {
            Log.w(TAG, "VPN active — skipping track upload");
            return;
        }
        if (SecurityHelper.isGpsDisabled(this)) {
            gpsFailStreak++;
            if (gpsFailStreak >= 3) {
                TrackingApi.postGpsOff(apiBase, token, 0, 0);
                stop(this);
            }
            return;
        }

        fetchLocation(loc -> {
            if (loc == null) {
                gpsFailStreak++;
                return;
            }
            gpsFailStreak = 0;
            if (SecurityHelper.isMockLocation(loc)) {
                TrackingApi.postGpsOff(apiBase, token, loc.getLatitude(), loc.getLongitude());
                stop(this);
                return;
            }
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
                point.put("recordedAt", new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).format(new java.util.Date(loc.getTime())));
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

        long now = System.currentTimeMillis();
        int dueSlot = IntervalScheduler.findDueSlot(
                punchInMs,
                slot -> TrackingPrefs.hasSentSlot(this, slot),
                now
        );

        fetchLocation(loc -> {
            if (loc == null) return;
            if (SecurityHelper.isMockLocation(loc)) {
                TrackingApi.postGpsOff(apiBase, token, loc.getLatitude(), loc.getLongitude());
                stop(this);
                return;
            }
            long ts = System.currentTimeMillis();
            if (ts - lastHeartbeatAt >= HEARTBEAT_MS) {
                lastHeartbeatAt = ts;
                TrackingApi.postHeartbeat(apiBase, token, loc.getLatitude(), loc.getLongitude());
            }
            if (dueSlot > 0) {
                boolean ok = TrackingApi.postIntervalSnapshot(apiBase, token, dueSlot, loc.getLatitude(), loc.getLongitude());
                if (ok) TrackingPrefs.markSlotSent(this, dueSlot);
            }
        });
    }

    private interface LocationCallback {
        void onResult(Location loc);
    }

    private void fetchLocation(LocationCallback cb) {
        try {
            CancellationTokenSource cts = new CancellationTokenSource();
            fused.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cts.getToken())
                    .addOnSuccessListener(cb::onResult)
                    .addOnFailureListener(e -> {
                        Log.w(TAG, "getCurrentLocation failed", e);
                        cb.onResult(null);
                    });
        } catch (SecurityException e) {
            Log.e(TAG, "location permission missing", e);
            cb.onResult(null);
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
                wakeLock.acquire(12 * 60 * 60 * 1000L);
            }
        } catch (Exception e) {
            Log.w(TAG, "wake lock failed", e);
        }
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
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
        PendingIntent pi = PendingIntent.getActivity(
                this,
                0,
                launch,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("AAP Attendance active")
                .setContentText("Recording route and 30-min GPS checks")
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setContentIntent(pi)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .build();
    }
}
