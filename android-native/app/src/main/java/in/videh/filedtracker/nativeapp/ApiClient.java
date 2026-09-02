package in.videh.filedtracker.nativeapp;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.util.concurrent.TimeUnit;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

public final class ApiClient {
    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");

    public static class ApiError extends Exception {
        public final int statusCode;

        ApiError(int statusCode, String message) {
            super(message);
            this.statusCode = statusCode;
        }
    }

    private final OkHttpClient http;
    private final String apiBase;
    private final String token;

    public ApiClient(Context ctx) {
        this.apiBase = SessionStore.apiBase(ctx);
        this.token = SessionStore.token(ctx);
        this.http = new OkHttpClient.Builder()
                .connectTimeout(25, TimeUnit.SECONDS)
                .readTimeout(35, TimeUnit.SECONDS)
                .writeTimeout(35, TimeUnit.SECONDS)
                .build();
    }

    private Request.Builder authReq(String path) {
        return new Request.Builder()
                .url(apiBase + path)
                .addHeader("Authorization", "Bearer " + token)
                .addHeader("Content-Type", "application/json");
    }

    private JSONObject readJson(Response res) throws IOException, ApiError, JSONException {
        String body = res.body() != null ? res.body().string() : "";
        if (!res.isSuccessful()) {
            String err = body;
            try {
                JSONObject o = new JSONObject(body);
                err = o.optString("error", body);
            } catch (Exception ignored) {
            }
            throw new ApiError(res.code(), err.isEmpty() ? "Request failed (" + res.code() + ")" : err);
        }
        if (body.isEmpty()) return new JSONObject();
        return new JSONObject(body);
    }

    public static void requestOtp(String phone) throws IOException, ApiError {
        OkHttpClient c = new OkHttpClient();
        JSONObject body = new JSONObject();
        try {
            body.put("phone", phone);
        } catch (Exception e) {
            throw new IOException(e);
        }
        Request req = new Request.Builder()
                .url(AppConfig.API_BASE + "/api/auth/otp/request")
                .post(RequestBody.create(body.toString(), JSON))
                .build();
        try (Response res = c.newCall(req).execute()) {
            if (!res.isSuccessful()) {
                String msg = res.body() != null ? res.body().string() : "";
                try {
                    msg = new JSONObject(msg).optString("error", msg);
                } catch (Exception ignored) {
                }
                throw new ApiError(res.code(), msg.isEmpty() ? "Could not send OTP" : msg);
            }
        }
    }

    public static JSONObject verifyOtp(String phone, String otp) throws IOException, ApiError, JSONException {
        OkHttpClient c = new OkHttpClient();
        JSONObject body = new JSONObject();
        try {
            body.put("phone", phone);
            body.put("otp", otp);
        } catch (Exception e) {
            throw new IOException(e);
        }
        Request req = new Request.Builder()
                .url(AppConfig.API_BASE + "/api/auth/otp/verify")
                .post(RequestBody.create(body.toString(), JSON))
                .build();
        try (Response res = c.newCall(req).execute()) {
            String raw = res.body() != null ? res.body().string() : "";
            if (!res.isSuccessful()) {
                String msg = raw;
                try {
                    msg = new JSONObject(raw).optString("error", raw);
                } catch (Exception ignored) {
                }
                throw new ApiError(res.code(), msg.isEmpty() ? "OTP verification failed" : msg);
            }
            return new JSONObject(raw);
        }
    }

    public JSONObject getMe() throws IOException, ApiError {
        Request req = authReq("/api/me").get().build();
        try (Response res = http.newCall(req).execute()) {
            return readJson(res);
        } catch (ApiError e) {
            throw e;
        } catch (Exception e) {
            throw new IOException(e);
        }
    }

    public JSONObject getAttendance() throws IOException, ApiError {
        Request req = authReq("/api/attendance").get().build();
        try (Response res = http.newCall(req).execute()) {
            return readJson(res);
        } catch (ApiError e) {
            throw e;
        } catch (Exception e) {
            throw new IOException(e);
        }
    }

    public JSONObject punchIn(double lat, double lng, Double accuracy, JSONArray descriptor, String image)
            throws IOException, ApiError {
        JSONObject body = new JSONObject();
        try {
            body.put("lat", lat);
            body.put("lng", lng);
            if (accuracy != null) body.put("accuracy", accuracy);
            body.put("descriptor", descriptor);
            body.put("image", image);
        } catch (Exception e) {
            throw new IOException(e);
        }
        Request req = authReq("/api/attendance").post(RequestBody.create(body.toString(), JSON)).build();
        try (Response res = http.newCall(req).execute()) {
            return readJson(res);
        } catch (ApiError e) {
            throw e;
        } catch (Exception e) {
            throw new IOException(e);
        }
    }

    public JSONObject punchOut(double lat, double lng, Double accuracy, JSONArray descriptor, String image)
            throws IOException, ApiError {
        JSONObject body = new JSONObject();
        try {
            body.put("lat", lat);
            body.put("lng", lng);
            if (accuracy != null) body.put("accuracy", accuracy);
            body.put("descriptor", descriptor);
            body.put("image", image);
        } catch (Exception e) {
            throw new IOException(e);
        }
        Request req = authReq("/api/attendance/punch-out").post(RequestBody.create(body.toString(), JSON)).build();
        try (Response res = http.newCall(req).execute()) {
            return readJson(res);
        } catch (ApiError e) {
            throw e;
        } catch (Exception e) {
            throw new IOException(e);
        }
    }

    public JSONObject registerFace(JSONArray descriptor, JSONArray samples, String image, boolean turban)
            throws IOException, ApiError {
        JSONObject body = new JSONObject();
        try {
            body.put("descriptor", descriptor);
            body.put("samples", samples);
            body.put("image", image);
            body.put("usesTurban", turban);
        } catch (Exception e) {
            throw new IOException(e);
        }
        Request req = authReq("/api/face/register").post(RequestBody.create(body.toString(), JSON)).build();
        try (Response res = http.newCall(req).execute()) {
            return readJson(res);
        } catch (ApiError e) {
            throw e;
        } catch (Exception e) {
            throw new IOException(e);
        }
    }
}
