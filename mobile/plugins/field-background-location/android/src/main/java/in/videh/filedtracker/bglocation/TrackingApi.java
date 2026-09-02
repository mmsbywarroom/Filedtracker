package in.videh.filedtracker.bglocation;

import android.util.Log;

import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

public final class TrackingApi {
    private static final String TAG = "FTTrackingApi";
    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");

    private static OkHttpClient client() {
        return new OkHttpClient.Builder()
                .connectTimeout(20, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .writeTimeout(30, TimeUnit.SECONDS)
                .build();
    }

    public static boolean postIntervalSnapshot(String apiBase, String token, int slot, double lat, double lng) {
        try {
            JSONObject body = new JSONObject();
            body.put("slot", slot);
            body.put("lat", lat);
            body.put("lng", lng);
            Request req = new Request.Builder()
                    .url(apiBase + "/api/attendance/interval-snapshot")
                    .addHeader("Authorization", "Bearer " + token)
                    .addHeader("Content-Type", "application/json")
                    .post(RequestBody.create(body.toString(), JSON))
                    .build();
            try (Response res = client().newCall(req).execute()) {
                if (res.isSuccessful()) return true;
                String msg = res.body() != null ? res.body().string() : "";
                Log.w(TAG, "interval-snapshot " + res.code() + " " + msg);
                return res.code() == 429 || msg.contains("alreadyRecorded");
            }
        } catch (Exception e) {
            Log.e(TAG, "postIntervalSnapshot failed", e);
            return false;
        }
    }

    public static void postHeartbeat(String apiBase, String token, double lat, double lng) {
        try {
            JSONObject hb = new JSONObject();
            hb.put("lat", lat);
            hb.put("lng", lng);
            JSONObject body = new JSONObject();
            body.put("points", new org.json.JSONArray());
            body.put("heartbeat", hb);
            Request req = new Request.Builder()
                    .url(apiBase + "/api/attendance/track")
                    .addHeader("Authorization", "Bearer " + token)
                    .addHeader("Content-Type", "application/json")
                    .post(RequestBody.create(body.toString(), JSON))
                    .build();
            try (Response res = client().newCall(req).execute()) {
                if (!res.isSuccessful()) {
                    Log.w(TAG, "track heartbeat " + res.code());
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "postHeartbeat failed", e);
        }
    }
}
