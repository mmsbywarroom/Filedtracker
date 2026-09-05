package in.videh.filedtracker.nativeapp;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/**
 * Offline-capable silent evidence queue. Never surfaces errors to UI.
 * Dedupes by sampleId / event payloads on server.
 */
public final class SecurityEvidenceUploader {
    private static final String TAG = "FTSecurityEvidence";
    private static final String PREFS = "ft_security_evidence_queue";
    private static final String KEY_QUEUE = "queue_v1";
    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");
    private static final OkHttpClient HTTP = AppConfig.okHttpBuilder()
            .connectTimeout(12, java.util.concurrent.TimeUnit.SECONDS)
            .readTimeout(20, java.util.concurrent.TimeUnit.SECONDS)
            .writeTimeout(20, java.util.concurrent.TimeUnit.SECONDS)
            .build();

    private static final ExecutorService IO = Executors.newSingleThreadExecutor();
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    private SecurityEvidenceUploader() {}

    public static void enqueueSamples(Context ctx, JSONArray samples, String punchId, String attendanceId) {
        if (samples == null || samples.length() == 0) return;
        IO.execute(() -> {
            try {
                JSONObject item = new JSONObject();
                item.put("kind", "samples");
                item.put("punchId", punchId == null ? "" : punchId);
                item.put("attendanceId", attendanceId == null ? "" : attendanceId);
                item.put("samples", samples);
                item.put("device", LocationIntegrity.deviceMeta(ctx));
                append(ctx, item);
                flush(ctx);
            } catch (Exception e) {
                Log.w(TAG, "enqueueSamples", e);
            }
        });
    }

    public static void enqueueIntegrity(
            Context ctx,
            String punchId,
            String challenge,
            String punchType,
            String attendanceId,
            String integrityToken,
            boolean vpnActive
    ) {
        IO.execute(() -> {
            try {
                JSONObject item = new JSONObject();
                item.put("kind", "integrity");
                item.put("punchId", punchId == null ? "" : punchId);
                item.put("challenge", challenge == null ? "" : challenge);
                item.put("punchType", punchType == null ? "punch_in" : punchType);
                item.put("attendanceId", attendanceId == null ? "" : attendanceId);
                item.put("integrityToken", integrityToken == null ? "" : integrityToken);
                item.put("vpnActive", vpnActive);
                item.put("appInstallationId", LocationIntegrity.appInstallationId(ctx));
                append(ctx, item);
                flush(ctx);
            } catch (Exception e) {
                Log.w(TAG, "enqueueIntegrity", e);
            }
        });
    }

    public static void flushSoon(Context ctx) {
        MAIN.postDelayed(() -> IO.execute(() -> flush(ctx)), 400);
    }

    private static synchronized void append(Context ctx, JSONObject item) {
        try {
            SharedPreferences p = ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray q = new JSONArray(p.getString(KEY_QUEUE, "[]"));
            q.put(item);
            while (q.length() > 80) q.remove(0);
            p.edit().putString(KEY_QUEUE, q.toString()).apply();
        } catch (Exception e) {
            Log.w(TAG, "append", e);
        }
    }

    private static synchronized void flush(Context ctx) {
        SharedPreferences p = ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray q;
        try {
            q = new JSONArray(p.getString(KEY_QUEUE, "[]"));
        } catch (Exception e) {
            return;
        }
        if (q.length() == 0) return;

        String token = SessionStore.token(ctx);
        if (token == null || token.isEmpty()) return;

        List<JSONObject> remaining = new ArrayList<>();
        for (int i = 0; i < q.length(); i++) {
            JSONObject item = q.optJSONObject(i);
            if (item == null) continue;
            boolean ok = false;
            try {
                String kind = item.optString("kind", "");
                if ("samples".equals(kind)) {
                    ok = postSamples(ctx, token, item);
                } else if ("integrity".equals(kind)) {
                    ok = postIntegrity(ctx, token, item);
                } else {
                    ok = true;
                }
            } catch (Exception e) {
                Log.w(TAG, "flush item", e);
            }
            if (!ok) remaining.add(item);
        }
        JSONArray next = new JSONArray();
        for (JSONObject o : remaining) next.put(o);
        p.edit().putString(KEY_QUEUE, next.toString()).apply();
    }

    private static boolean postSamples(Context ctx, String token, JSONObject item) throws Exception {
        JSONObject body = new JSONObject();
        body.put("samples", item.optJSONArray("samples"));
        body.put("punchId", item.optString("punchId", ""));
        body.put("attendanceId", item.optString("attendanceId", ""));
        JSONObject device = item.optJSONObject("device");
        if (device != null) {
            body.put("appInstallationId", device.optString("appInstallationId", ""));
            body.put("appVersion", device.optString("appVersion", ""));
            body.put("versionCode", device.optInt("versionCode", 0));
            body.put("androidVersion", device.optString("androidVersion", ""));
            body.put("manufacturer", device.optString("manufacturer", ""));
            body.put("model", device.optString("model", ""));
        }
        return postJson(ctx, token, "/api/attendance/security/samples", body);
    }

    private static boolean postIntegrity(Context ctx, String token, JSONObject item) throws Exception {
        return postJson(ctx, token, "/api/attendance/security/integrity", item);
    }

    private static boolean postJson(Context ctx, String token, String path, JSONObject body) throws IOException {
        Exception last = null;
        for (String base : AppConfig.apiBases(SessionStore.apiBase(ctx))) {
            Request req = new Request.Builder()
                    .url(base.replaceAll("/$", "") + path)
                    .addHeader("Authorization", "Bearer " + token)
                    .addHeader("X-Client-Source", "native")
                    .addHeader("Content-Type", "application/json")
                    .post(RequestBody.create(body.toString(), JSON))
                    .build();
            try (Response res = HTTP.newCall(req).execute()) {
                if (res.isSuccessful()) return true;
            } catch (Exception e) {
                last = e;
            }
        }
        if (last != null) Log.w(TAG, "postJson failed", last);
        return false;
    }
}
