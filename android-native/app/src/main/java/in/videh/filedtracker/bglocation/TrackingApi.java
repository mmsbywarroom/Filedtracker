package in.videh.filedtracker.bglocation;

import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

public final class TrackingApi {
    private static final String TAG = "FTTrackingApi";
    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");
    private static final ExecutorService IO = Executors.newFixedThreadPool(2);
    private static final OkHttpClient HTTP = in.videh.filedtracker.nativeapp.AppConfig.okHttpBuilder()
            .connectTimeout(12, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .writeTimeout(20, TimeUnit.SECONDS)
            .callTimeout(25, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build();

    private static Request.Builder req(String apiBase, String token, String path) {
        return new Request.Builder()
                .url(apiBase + path)
                .addHeader("Authorization", "Bearer " + token)
                .addHeader("X-Client-Source", "native")
                .addHeader("Content-Type", "application/json");
    }

    public static boolean postIntervalSnapshot(String apiBase, String token, int slot, double lat, double lng) {
        AtomicBoolean ok = new AtomicBoolean(false);
        try {
            java.util.concurrent.Future<?> f = IO.submit(() -> {
                try {
                    JSONObject body = new JSONObject();
                    body.put("slot", slot);
                    body.put("lat", lat);
                    body.put("lng", lng);
                    Request request = req(apiBase, token, "/api/attendance/interval-snapshot")
                            .post(RequestBody.create(body.toString(), JSON))
                            .build();
                    try (Response res = HTTP.newCall(request).execute()) {
                        ok.set(res.isSuccessful());
                        if (!res.isSuccessful()) {
                            String msg = res.body() != null ? res.body().string() : "";
                            Log.w(TAG, "interval-snapshot " + res.code() + " " + msg);
                        }
                    }
                } catch (Exception e) {
                    Log.e(TAG, "postIntervalSnapshot failed", e);
                }
            });
            f.get(20, TimeUnit.SECONDS);
        } catch (Exception e) {
            Log.e(TAG, "postIntervalSnapshot wait failed", e);
        }
        return ok.get();
    }

    public static void postHeartbeat(String apiBase, String token, double lat, double lng) {
        IO.execute(() -> {
            try {
                JSONObject hb = new JSONObject();
                hb.put("lat", lat);
                hb.put("lng", lng);
                JSONObject body = new JSONObject();
                body.put("points", new JSONArray());
                body.put("heartbeat", hb);
                Request request = req(apiBase, token, "/api/attendance/track")
                        .post(RequestBody.create(body.toString(), JSON))
                        .build();
                try (Response res = HTTP.newCall(request).execute()) {
                    if (!res.isSuccessful()) Log.w(TAG, "track heartbeat " + res.code());
                }
            } catch (Exception e) {
                Log.w(TAG, "postHeartbeat failed", e);
            }
        });
    }

    public static void postTrackBatch(
            String apiBase,
            String token,
            JSONArray points,
            JSONArray mapProbes,
            double mapSpreadM,
            double hbLat,
            double hbLng
    ) {
        IO.execute(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("points", points != null ? points : new JSONArray());
                if (mapProbes != null && mapProbes.length() > 0) body.put("mapProbes", mapProbes);
                if (mapSpreadM > 0) body.put("mapGpsSpreadM", mapSpreadM);
                JSONObject hb = new JSONObject();
                hb.put("lat", hbLat);
                hb.put("lng", hbLng);
                body.put("heartbeat", hb);
                Request request = req(apiBase, token, "/api/attendance/track")
                        .post(RequestBody.create(body.toString(), JSON))
                        .build();
                try (Response res = HTTP.newCall(request).execute()) {
                    if (!res.isSuccessful()) Log.w(TAG, "track batch " + res.code());
                }
            } catch (Exception e) {
                Log.w(TAG, "postTrackBatch failed", e);
            }
        });
    }

    public static void postGpsOff(String apiBase, String token, double lat, double lng) {
        IO.execute(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("lat", lat);
                body.put("lng", lng);
                body.put("address", "GPS turned off");
                body.put("accuracy", JSONObject.NULL);
                Request request = req(apiBase, token, "/api/attendance/gps-off")
                        .post(RequestBody.create(body.toString(), JSON))
                        .build();
                try (Response res = HTTP.newCall(request).execute()) {
                    if (!res.isSuccessful()) Log.w(TAG, "gps-off " + res.code());
                }
            } catch (Exception e) {
                Log.w(TAG, "postGpsOff failed", e);
            }
        });
    }
}
