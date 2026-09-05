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

    private static final OkHttpClient SHARED = AppConfig.okHttpBuilder()
            .connectTimeout(12, TimeUnit.SECONDS)
            .readTimeout(45, TimeUnit.SECONDS)
            .writeTimeout(45, TimeUnit.SECONDS)
            .callTimeout(50, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build();

    /** Shorter per-attempt timeout — failover to backup base quickly. */
    private static final OkHttpClient OTP = AppConfig.okHttpBuilder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .writeTimeout(20, TimeUnit.SECONDS)
            .callTimeout(22, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build();

    private static final OkHttpClient FACE = AppConfig.okHttpBuilder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(55, TimeUnit.SECONDS)
            .writeTimeout(55, TimeUnit.SECONDS)
            .callTimeout(65, TimeUnit.SECONDS)
            .build();

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
        this.http = SHARED;
    }

    private static boolean isTransportFailure(Exception e) {
        if (e instanceof ApiError) return false;
        if (e instanceof java.net.SocketTimeoutException) return true;
        if (e instanceof java.io.InterruptedIOException) return true;
        if (e instanceof IOException) return true;
        return false;
    }

    private static ApiError asNetworkError(Exception e, String fallback) {
        String m = e.getMessage() != null ? e.getMessage().toLowerCase() : "";
        if (e instanceof java.net.SocketTimeoutException
                || m.contains("timeout")
                || m.contains("timed out")) {
            return new ApiError(408, "Network timeout. Check internet and try again.");
        }
        if (m.contains("connection abort")
                || m.contains("connection reset")
                || m.contains("broken pipe")
                || m.contains("unreachable")
                || m.contains("failed to connect")) {
            return new ApiError(0, "Network interrupted. Check internet and try again.");
        }
        return new ApiError(0, fallback);
    }

    /** Try domain then Elastic IP (and any preferred base). */
    private static Response executeFailover(OkHttpClient client, String path, String method, RequestBody body)
            throws IOException, ApiError {
        Exception last = null;
        for (String base : AppConfig.apiBases(AppConfig.API_BASE)) {
            Request.Builder b = new Request.Builder()
                    .url(base + path)
                    .addHeader("X-Client-Source", "native")
                    .addHeader("Content-Type", "application/json")
                    .addHeader("User-Agent", "AAPAttendanceNative/1.4.0");
            if ("GET".equals(method)) b.get();
            else b.method(method, body);
            try {
                return client.newCall(b.build()).execute();
            } catch (Exception e) {
                last = e;
                if (!isTransportFailure(e)) break;
            }
        }
        throw asNetworkError(last != null ? last : new IOException("unreachable"), "Network error. Try again.");
    }

    private Response executeAuthFailover(String path, String method, RequestBody body)
            throws IOException, ApiError {
        Exception last = null;
        for (String base : AppConfig.apiBases(apiBase)) {
            Request.Builder b = new Request.Builder()
                    .url(base + path)
                    .addHeader("Authorization", "Bearer " + token)
                    .addHeader("X-Client-Source", "native")
                    .addHeader("Content-Type", "application/json")
                    .addHeader("User-Agent", "AAPAttendanceNative/1.4.0");
            if ("GET".equals(method)) b.get();
            else b.method(method, body);
            try {
                return http.newCall(b.build()).execute();
            } catch (Exception e) {
                last = e;
                if (!isTransportFailure(e)) break;
            }
        }
        throw asNetworkError(last != null ? last : new IOException("unreachable"), "Network error. Try again.");
    }

    public static JSONObject getAppVersion() throws IOException, ApiError {
        try (Response res = executeFailover(SHARED, "/api/app/version", "GET", null)) {
            String body = res.body() != null ? res.body().string() : "";
            if (!res.isSuccessful()) {
                throw new ApiError(res.code(), "Could not check for updates");
            }
            return new JSONObject(body);
        } catch (ApiError e) {
            throw e;
        } catch (JSONException e) {
            throw new IOException(e);
        }
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
            if (res.code() == 401) {
                throw new ApiError(401, "Session expired. Please log in again.");
            }
            throw new ApiError(res.code(), err.isEmpty() ? "Request failed (" + res.code() + ")" : err);
        }
        if (body.isEmpty()) return new JSONObject();
        return new JSONObject(body);
    }

    public static void requestOtp(String phone) throws IOException, ApiError {
        JSONObject body = new JSONObject();
        try {
            body.put("phone", phone);
        } catch (Exception e) {
            throw new IOException(e);
        }
        try (Response res =
                executeFailover(OTP, "/api/auth/otp/request", "POST", RequestBody.create(body.toString(), JSON))) {
            if (!res.isSuccessful()) {
                String msg = res.body() != null ? res.body().string() : "";
                try {
                    msg = new JSONObject(msg).optString("error", msg);
                } catch (Exception ignored) {
                }
                throw new ApiError(
                        res.code(), msg.isEmpty() ? "Could not send OTP. Check network and try again." : msg);
            }
        } catch (ApiError e) {
            throw e;
        }
    }

    public static JSONObject verifyOtp(String phone, String otp) throws IOException, ApiError, JSONException {
        JSONObject body = new JSONObject();
        try {
            body.put("phone", phone);
            body.put("otp", otp);
        } catch (Exception e) {
            throw new IOException(e);
        }
        try (Response res =
                executeFailover(OTP, "/api/auth/otp/verify", "POST", RequestBody.create(body.toString(), JSON))) {
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
        try (Response res = executeAuthFailover("/api/me", "GET", null)) {
            return readJson(res);
        } catch (ApiError e) {
            throw e;
        } catch (Exception e) {
            throw new IOException(e);
        }
    }

    public JSONObject getAttendance() throws IOException, ApiError {
        try (Response res = executeAuthFailover("/api/attendance", "GET", null)) {
            return readJson(res);
        } catch (ApiError e) {
            throw e;
        } catch (Exception e) {
            throw new IOException(e);
        }
    }

    public JSONObject punchIn(double lat, double lng, Double accuracy, JSONArray descriptor, String image)
            throws IOException, ApiError {
        JSONObject body = punchBody(lat, lng, accuracy, descriptor, image);
        try (Response res =
                executeAuthFailover("/api/attendance", "POST", RequestBody.create(body.toString(), JSON))) {
            return readJson(res);
        } catch (ApiError e) {
            throw e;
        } catch (java.net.SocketTimeoutException e) {
            throw new ApiError(408, "Punch timed out. Stay on this screen and try again.");
        } catch (Exception e) {
            throw new IOException(e);
        }
    }

    public JSONObject punchOut(double lat, double lng, Double accuracy, JSONArray descriptor, String image)
            throws IOException, ApiError {
        JSONObject body = punchBody(lat, lng, accuracy, descriptor, image);
        try (Response res = executeAuthFailover(
                "/api/attendance/punch-out", "POST", RequestBody.create(body.toString(), JSON))) {
            return readJson(res);
        } catch (ApiError e) {
            throw e;
        } catch (java.net.SocketTimeoutException e) {
            throw new ApiError(408, "Punch timed out. Stay on this screen and try again.");
        } catch (Exception e) {
            throw new IOException(e);
        }
    }

    private static JSONObject punchBody(double lat, double lng, Double accuracy, JSONArray descriptor, String image)
            throws IOException {
        JSONObject body = new JSONObject();
        try {
            body.put("lat", lat);
            body.put("lng", lng);
            if (accuracy != null) body.put("accuracy", accuracy);
            if (descriptor != null && descriptor.length() > 0) body.put("descriptor", descriptor);
            body.put("image", image);
        } catch (Exception e) {
            throw new IOException(e);
        }
        return body;
    }

    public JSONObject getLeave() throws IOException, ApiError {
        try (Response res = executeAuthFailover("/api/leave", "GET", null)) {
            return readJson(res);
        } catch (ApiError e) {
            throw e;
        } catch (Exception e) {
            throw new IOException(e);
        }
    }

    public JSONObject createLeave(String fromDate, String toDate, String reason) throws IOException, ApiError {
        JSONObject body = new JSONObject();
        try {
            body.put("fromDate", fromDate);
            body.put("toDate", toDate);
            body.put("reason", reason);
        } catch (Exception e) {
            throw new IOException(e);
        }
        try (Response res =
                executeAuthFailover("/api/leave", "POST", RequestBody.create(body.toString(), JSON))) {
            return readJson(res);
        } catch (ApiError e) {
            throw e;
        } catch (Exception e) {
            throw new IOException(e);
        }
    }

    public JSONObject getHistory() throws IOException, ApiError {
        try (Response res = executeAuthFailover("/api/attendance/history", "GET", null)) {
            return readJson(res);
        } catch (ApiError e) {
            throw e;
        } catch (Exception e) {
            throw new IOException(e);
        }
    }

    public JSONObject registerFace(JSONArray descriptor, JSONArray samples, String image, boolean coveredUpper)
            throws IOException, ApiError {
        JSONObject body = new JSONObject();
        try {
            body.put("descriptor", descriptor);
            body.put("samples", samples);
            body.put("image", image);
            body.put("usesTurban", coveredUpper);
        } catch (Exception e) {
            throw new IOException(e);
        }
        try (Response res = executeAuthFailover(
                "/api/face/register", "POST", RequestBody.create(body.toString(), JSON))) {
            return readJson(res);
        } catch (ApiError e) {
            throw e;
        } catch (Exception e) {
            throw new IOException(e);
        }
    }

    public JSONObject describeFace(String imageDataUrl) throws IOException, ApiError {
        JSONObject body = new JSONObject();
        try {
            body.put("image", imageDataUrl);
            body.put("relaxed", true);
            body.put("fast", true);
        } catch (Exception e) {
            throw new IOException(e);
        }
        Exception last = null;
        for (String base : AppConfig.apiBases(apiBase)) {
            Request req = new Request.Builder()
                    .url(base + "/api/face/describe")
                    .addHeader("Authorization", "Bearer " + token)
                    .addHeader("X-Client-Source", "native")
                    .addHeader("Content-Type", "application/json")
                    .addHeader("User-Agent", "AAPAttendanceNative/1.4.0")
                    .post(RequestBody.create(body.toString(), JSON))
                    .build();
            try (Response res = FACE.newCall(req).execute()) {
                return readJson(res);
            } catch (ApiError e) {
                throw e;
            } catch (Exception e) {
                last = e;
                if (!isTransportFailure(e)) break;
            }
        }
        if (last instanceof java.net.SocketTimeoutException) {
            throw new ApiError(408, "Face check timed out. Try again on a better network.");
        }
        throw asNetworkError(last != null ? last : new IOException("unreachable"), "Face check failed. Try again.");
    }

    public void reportLocationPermission(boolean foreground, boolean background) throws IOException, ApiError {
        JSONObject body = new JSONObject();
        try {
            body.put("foreground", foreground);
            body.put("background", background);
            body.put("platform", "android");
        } catch (Exception e) {
            throw new IOException(e);
        }
        try (Response res = executeAuthFailover(
                "/api/me/location-permission", "POST", RequestBody.create(body.toString(), JSON))) {
            readJson(res);
        } catch (ApiError e) {
            throw e;
        } catch (Exception e) {
            throw new IOException(e);
        }
    }
}
