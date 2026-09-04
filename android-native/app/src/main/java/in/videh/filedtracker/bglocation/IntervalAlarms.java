package in.videh.filedtracker.bglocation;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

/** Exact / while-idle alarms so 30-min FLAG checks still fire under Doze. */
public final class IntervalAlarms {
    private static final String TAG = "FTIntervalAlarms";
    public static final String ACTION = "in.videh.filedtracker.INTERVAL_CHECK";
    private static final int REQ = 41011;

    private IntervalAlarms() {}

    public static void cancel(Context ctx) {
        try {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            if (am != null) am.cancel(pending(ctx));
        } catch (Exception e) {
            Log.w(TAG, "cancel failed", e);
        }
    }

    public static void scheduleNext(Context ctx) {
        if (!TrackingPrefs.isActive(ctx)) {
            cancel(ctx);
            return;
        }
        long punch = TrackingPrefs.punchInMs(ctx);
        long now = System.currentTimeMillis();
        long fireAt = IntervalScheduler.nextAlarmAtMs(
                punch,
                slot -> TrackingPrefs.hasSentSlot(ctx, slot),
                now
        );
        if (fireAt <= 0) {
            cancel(ctx);
            return;
        }
        try {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            PendingIntent pi = pending(ctx);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                try {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAt, pi);
                } catch (SecurityException se) {
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAt, pi);
                }
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, fireAt, pi);
            }
            Log.i(TAG, "next interval alarm in " + Math.max(0, (fireAt - now) / 1000) + "s");
        } catch (Exception e) {
            Log.w(TAG, "scheduleNext failed", e);
        }
    }

    private static PendingIntent pending(Context ctx) {
        Intent i = new Intent(ctx, IntervalAlarmReceiver.class).setAction(ACTION);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getBroadcast(ctx, REQ, i, flags);
    }
}
