package in.videh.filedtracker.bglocation;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/** Restart GPS tracking after reboot / APK update if the user is still punched in. */
public class BootCompletedReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        if (!TrackingPrefs.isActive(context)) return;
        String api = TrackingPrefs.apiBase(context);
        String token = TrackingPrefs.token(context);
        if (api == null || api.isEmpty() || token == null || token.isEmpty()) return;
        Log.i("FTBoot", "Restarting field tracking after " + intent.getAction());
        FieldLocationService.startExisting(context);
    }
}
