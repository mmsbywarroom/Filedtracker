package in.videh.filedtracker.nativeapp;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.google.android.gms.tasks.CancellationTokenSource;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Silent multi-sample around punch. MUST NOT delay Punch In/Out UI.
 * Flow: punch already succeeded → background challenge → immediate T+0 upload →
 * async T+5..T+20 uploads → optional Play Integrity in parallel (sideload-safe; never blocks).
 */
public final class PunchLocationSampler {
    private static final String TAG = "FTPunchSampler";
    private static final long[] OFFSETS_MS = {0L, 5_000L, 10_000L, 15_000L, 20_000L};

    private PunchLocationSampler() {}

    /** Fire-and-forget after successful punch. Safe to call from UI thread. */
    public static void captureAfterPunch(Context ctx, String punchType, String attendanceId) {
        final Context app = ctx.getApplicationContext();
        new Thread(() -> runAsync(app, punchType, attendanceId), "ft-punch-sampler").start();
    }

    private static void runAsync(Context app, String punchType, String attendanceId) {
        try {
            JSONObject challengeRes = requestChallenge(app, punchType, attendanceId);
            final String punchId = challengeRes != null ? challengeRes.optString("punchId", "") : "";
            final String challengeStr = challengeRes != null ? challengeRes.optString("challenge", "") : "";
            // MUST use server-computed hash — do not invent a client-side hash.
            final String requestHash = challengeRes != null ? challengeRes.optString("requestHash", "") : "";

            final boolean vpn = SecurityHelper.isVpnActive(app);
            final Handler handler = new Handler(Looper.getMainLooper());
            final FusedLocationProviderClient fused = LocationServices.getFusedLocationProviderClient(app);

            // Play Integrity in parallel (does not wait for 20s samples).
            new Thread(() -> {
                String token = "";
                try {
                    token = PlayIntegrityHelper.requestToken(app, requestHash);
                } catch (Exception e) {
                    Log.w(TAG, "integrity token skipped", e);
                }
                SecurityEvidenceUploader.enqueueIntegrity(
                        app, punchId, challengeStr, punchType, attendanceId, token, vpn
                );
            }, "ft-integrity").start();

            // Capture samples asynchronously; upload each batch immediately (T+0 first).
            for (int i = 0; i < OFFSETS_MS.length; i++) {
                final int step = i;
                handler.postDelayed(() -> takeAndUpload(app, fused, punchId, attendanceId, vpn, step), OFFSETS_MS[i]);
            }
        } catch (Exception e) {
            Log.w(TAG, "captureAfterPunch", e);
        }
    }

    private static void takeAndUpload(
            Context app,
            FusedLocationProviderClient fused,
            String punchId,
            String attendanceId,
            boolean vpn,
            int step
    ) {
        try {
            CancellationTokenSource cts = new CancellationTokenSource();
            fused.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cts.getToken())
                    .addOnSuccessListener(loc -> {
                        if (loc == null) return;
                        try {
                            JSONArray batch = new JSONArray();
                            JSONObject sample = LocationIntegrity.sampleFrom(loc, "punch", vpn);
                            sample.put("sampleIndex", step);
                            batch.put(sample);
                            SecurityEvidenceUploader.enqueueSamples(app, batch, punchId, attendanceId);
                        } catch (Exception e) {
                            Log.w(TAG, "upload sample", e);
                        }
                    })
                    .addOnFailureListener(e -> Log.w(TAG, "sample fail step=" + step, e));
        } catch (SecurityException se) {
            Log.w(TAG, "location permission missing for sample", se);
        } catch (Exception e) {
            Log.w(TAG, "takeAndUpload", e);
        }
    }

    private static JSONObject requestChallenge(Context ctx, String punchType, String attendanceId) {
        try {
            okhttp3.OkHttpClient http = AppConfig.okHttpBuilder()
                    .connectTimeout(8, java.util.concurrent.TimeUnit.SECONDS)
                    .readTimeout(12, java.util.concurrent.TimeUnit.SECONDS)
                    .build();
            JSONObject body = new JSONObject();
            body.put("punchType", punchType);
            if (attendanceId != null && !attendanceId.isEmpty()) body.put("attendanceId", attendanceId);
            String token = SessionStore.token(ctx);
            for (String base : AppConfig.apiBases(SessionStore.apiBase(ctx))) {
                okhttp3.Request req = new okhttp3.Request.Builder()
                        .url(base.replaceAll("/$", "") + "/api/attendance/security/challenge")
                        .addHeader("Authorization", "Bearer " + token)
                        .addHeader("X-Client-Source", "native")
                        .post(okhttp3.RequestBody.create(
                                body.toString(),
                                okhttp3.MediaType.get("application/json; charset=utf-8")))
                        .build();
                try (okhttp3.Response res = http.newCall(req).execute()) {
                    if (!res.isSuccessful() || res.body() == null) continue;
                    return new JSONObject(res.body().string());
                } catch (Exception ignored) {
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "requestChallenge", e);
        }
        return null;
    }
}
