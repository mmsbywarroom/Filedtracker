package in.videh.filedtracker.nativeapp;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/** Fire-and-forget reports to /api/attendance/security-event (admin audit log). */
public final class SecurityReporter {
    private static final String TAG = "FTSecurityReporter";
    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");
    private static final long THROTTLE_MS = 15 * 60 * 1000;
    private static final ExecutorService IO = Executors.newSingleThreadExecutor();

    private SecurityReporter() {}

    public static void report(Context ctx, String type, String action, String detail, Double lat, Double lng) {
        String token = SessionStore.token(ctx);
        String apiBase = SessionStore.apiBase(ctx);
        if (token == null || token.isEmpty() || apiBase == null || apiBase.isEmpty()) return;
        if (isThrottled(ctx, type)) return;
        markThrottled(ctx, type);

        IO.execute(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("type", type);
                body.put("action", action != null && !action.isEmpty() ? action : "blocked");
                if (detail != null && !detail.isEmpty()) body.put("detail", detail);
                if (lat != null) body.put("lat", lat);
                if (lng != null) body.put("lng", lng);
                Request req = new Request.Builder()
                        .url(apiBase + "/api/attendance/security-event")
                        .addHeader("Authorization", "Bearer " + token)
                        .addHeader("X-Client-Source", "native")
                        .addHeader("Content-Type", "application/json")
                        .post(RequestBody.create(body.toString(), JSON))
                        .build();
                OkHttpClient c = new OkHttpClient();
                try (Response res = c.newCall(req).execute()) {
                    if (!res.isSuccessful()) Log.w(TAG, "security-event " + res.code());
                }
            } catch (Exception e) {
                Log.w(TAG, "report failed", e);
            }
        });
    }

    private static boolean isThrottled(Context ctx, String type) {
        SharedPreferences p = ctx.getSharedPreferences("security_report", Context.MODE_PRIVATE);
        long last = p.getLong("last_" + type, 0);
        return System.currentTimeMillis() - last < THROTTLE_MS;
    }

    private static void markThrottled(Context ctx, String type) {
        ctx.getSharedPreferences("security_report", Context.MODE_PRIVATE)
                .edit()
                .putLong("last_" + type, System.currentTimeMillis())
                .apply();
    }
}
