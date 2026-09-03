package in.videh.filedtracker.nativeapp;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import in.videh.filedtracker.bglocation.TrackingPrefs;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/** Fire-and-forget reports to /api/attendance/security-event (admin audit log). */
public final class SecurityReporter {
    private static final String TAG = "FTSecurityReporter";
    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");
    private static final long HOURLY_MS = 60 * 60 * 1000;
    private static final long BLOCK_THROTTLE_MS = 2 * 60 * 1000;
    private static final ExecutorService IO = Executors.newSingleThreadExecutor();

    private SecurityReporter() {}

    public static void report(Context ctx, String type, String action, String detail, Double lat, Double lng) {
        String token = SessionStore.token(ctx);
        String apiBase = SessionStore.apiBase(ctx);
        if (token == null || token.isEmpty()) {
            token = TrackingPrefs.token(ctx);
        }
        if (apiBase == null || apiBase.isEmpty()) {
            apiBase = TrackingPrefs.apiBase(ctx);
        }
        if (apiBase == null || apiBase.isEmpty()) {
            apiBase = AppConfig.API_BASE;
        }
        if (token == null || token.isEmpty()) {
            Log.w(TAG, "skip report — no auth token");
            return;
        }
        if (isThrottled(ctx, type, action)) return;
        markThrottled(ctx, type, action);

        final String t = token;
        final String base = apiBase;
        IO.execute(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("type", type);
                body.put("action", action != null && !action.isEmpty() ? action : "blocked");
                if (detail != null && !detail.isEmpty()) body.put("detail", detail);
                if (lat != null) body.put("lat", lat);
                if (lng != null) body.put("lng", lng);
                Request req = new Request.Builder()
                        .url(base + "/api/attendance/security-event")
                        .addHeader("Authorization", "Bearer " + t)
                        .addHeader("X-Client-Source", "native")
                        .addHeader("Content-Type", "application/json")
                        .post(RequestBody.create(body.toString(), JSON))
                        .build();
                OkHttpClient c = new OkHttpClient.Builder()
                        .connectTimeout(20, TimeUnit.SECONDS)
                        .readTimeout(20, TimeUnit.SECONDS)
                        .build();
                try (Response res = c.newCall(req).execute()) {
                    if (!res.isSuccessful()) Log.w(TAG, "security-event " + res.code());
                    else Log.i(TAG, "security-event ok type=" + type);
                }
            } catch (Exception e) {
                Log.w(TAG, "report failed", e);
            }
        });
    }

    private static boolean isThrottled(Context ctx, String type, String action) {
        SharedPreferences p = ctx.getSharedPreferences("security_report", Context.MODE_PRIVATE);
        long last = p.getLong(throttleKey(type, action), 0);
        long window;
        if ("punch_evidence".equals(type) || "punch_evidence".equals(action)) {
            window = 60 * 1000; // allow same-day merge updates via API upsert
        } else if ("blocked".equals(action)) {
            window = BLOCK_THROTTLE_MS;
        } else {
            window = HOURLY_MS;
        }
        return System.currentTimeMillis() - last < window;
    }

    private static void markThrottled(Context ctx, String type, String action) {
        ctx.getSharedPreferences("security_report", Context.MODE_PRIVATE)
                .edit()
                .putLong(throttleKey(type, action), System.currentTimeMillis())
                .apply();
    }

    private static String throttleKey(String type, String action) {
        String a = action != null && !action.isEmpty() ? action : "blocked";
        return "last_" + type + "_" + a;
    }
}
