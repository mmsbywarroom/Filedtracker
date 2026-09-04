package in.videh.filedtracker.bglocation;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/** Wakes FieldLocationService at each 30-min FLAG slot (and after reboot via BootCompleted). */
public class IntervalAlarmReceiver extends BroadcastReceiver {
    private static final String TAG = "FTIntervalAlarm";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!TrackingPrefs.isActive(context)) return;
        Log.i(TAG, "interval alarm fired — starting location service");
        FieldLocationService.startExisting(context);
        FieldLocationService.requestIntervalCheck(context);
        IntervalAlarms.scheduleNext(context);
    }
}
