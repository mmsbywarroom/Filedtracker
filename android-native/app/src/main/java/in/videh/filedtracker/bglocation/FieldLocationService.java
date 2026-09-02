package in.videh.filedtracker.bglocation;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.google.android.gms.tasks.CancellationTokenSource;

public class FieldLocationService extends Service {
    private static final String TAG = "FTLocationService";
    private static final String CHANNEL_ID = "ft_field_tracking";
    private static final int NOTIFICATION_ID = 41001;
    private static final long TICK_MS = 60_000L;
    private static final long HEARTBEAT_MS = 120_000L;

    private Handler handler;
    private FusedLocationProviderClient fused;
    private long lastHeartbeatAt = 0L;

    private final Runnable tickRunnable = new Runnable() {
        @Override
        public void run() {
            if (!TrackingPrefs.isActive(FieldLocationService.this)) {
                stopSelf();
                return;
            }
            runTick();
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
        startForeground(NOTIFICATION_ID, buildNotification());
        handler.removeCallbacks(tickRunnable);
        handler.post(tickRunnable);
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(tickRunnable);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void runTick() {
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

        fetchLocation((lat, lng) -> {
            if (lat == null || lng == null) return;
            long ts = System.currentTimeMillis();
            if (ts - lastHeartbeatAt >= HEARTBEAT_MS) {
                lastHeartbeatAt = ts;
                TrackingApi.postHeartbeat(apiBase, token, lat, lng);
            }
            if (dueSlot > 0) {
                boolean ok = TrackingApi.postIntervalSnapshot(apiBase, token, dueSlot, lat, lng);
                if (ok) TrackingPrefs.markSlotSent(this, dueSlot);
            }
        });
    }

    private interface LocationCallback {
        void onResult(Double lat, Double lng);
    }

    private void fetchLocation(LocationCallback cb) {
        try {
            CancellationTokenSource cts = new CancellationTokenSource();
            fused.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cts.getToken())
                    .addOnSuccessListener(loc -> {
                        if (loc != null) cb.onResult(loc.getLatitude(), loc.getLongitude());
                        else cb.onResult(null, null);
                    })
                    .addOnFailureListener(e -> {
                        Log.w(TAG, "getCurrentLocation failed", e);
                        cb.onResult(null, null);
                    });
        } catch (SecurityException e) {
            Log.e(TAG, "location permission missing", e);
            cb.onResult(null, null);
        }
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
                .setContentTitle("Field Tracking active")
                .setContentText("Recording location every 30 minutes")
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setContentIntent(pi)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .build();
    }
}
