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

    /** Shared client — connection reuse keeps punch / OTP fast. */
    private static final OkHttpClient SHARED = new OkHttpClient.Builder()
            .connectTimeout(12, TimeUnit.SECONDS)
            .readTimeout(45, TimeUnit.SECONDS)
            .writeTimeout(45, TimeUnit.SECONDS)
            .callTimeout(55, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build();

    private static final OkHttpClient OTP = SHARED.newBuilder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .writeTimeout(20, TimeUnit.SECONDS)
            .callTimeout(25, TimeUnit.SECONDS)
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

    private Request.Builder authReq(String path) {
        return new Request.Builder()
                .url(apiBase + path)
                .addHeader("Authorization", "Bearer " + token)
                .addHeader("X-Client-Source", "native")
                .addHeader("Content-Type", "application/json")
                .addHeader("User-Agent", "AAPAttendanceNative/1.3.4");
    }

    /** Public — no auth. Used for force-update gate. */
    public static JSONObject getAppVersion() throws IOException, ApiError {
        Request req = new Request.Builder()
                .url(AppConfig.API_BASE + "/api/app/version")
                .get()
                .build();
        try (Response res = SHARED.newCall(req).execute()) {
            String body = res.body() != null ? res.body().string() : "";
            if (!res.isSuccessful()) {
                throw new ApiError(res.code(), "Could not check for updates");
            }
            return new JSONObject(body);
        } catch (ApiError e) {
            throw e;
        } catch (Exception e) {
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
        Request req = new Request.Builder()
                .url(AppConfig.API_BASE + "/api/auth/otp/request")
                .post(RequestBody.create(body.toString(), JSON))
                .build();
        try (Response res = OTP.newCall(req).execute()) {
            if (!res.isSuccessful()) {
                String msg = res.body() != null ? res.body().string() : "";
                try {
                    msg = new JSONObject(msg).optString("error", msg);
                } catch (Exception ignored) {
                }
                throw new ApiError(res.code(), msg.isEmpty() ? "Could not send OTP. Check network and try again." : msg);
            }
        } catch (java.net.SocketTimeoutException e) {
            throw new ApiError(408, "Network timeout. Check internet and try again.");
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
        Request req = new Request.Builder()
                .url(AppConfig.API_BASE + "/api/auth/otp/verify")
                .post(RequestBody.create(body.toString(), JSON))
                .build();
        try (Response res = OTP.newCall(req).execute()) {
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
        } catch (java.net.SocketTimeoutException e) {
            throw new ApiError(408, "Network timeout. Check internet and try again.");
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
        JSONObject body = punchBody(lat, lng, accuracy, descriptor, image);
        Request req = authReq("/api/attendance").post(RequestBody.create(body.toString(), JSON)).build();
        try (Response res = http.newCall(req).execute()) {
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
        Request req = authReq("/api/attendance/punch-out").post(RequestBody.create(body.toString(), JSON)).build();
        try (Response res = http.newCall(req).execute()) {
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
            // Native may omit descriptor — server describes the photo once and matches registered face.
            if (descriptor != null && descriptor.length() > 0) body.put("descriptor", descriptor);
            body.put("image", image);
        } catch (Exception e) {
            throw new IOException(e);
        }
        return body;
    }

    public JSONObject getLeave() throws IOException, ApiError {
        Request req = authReq("/api/leave").get().build();
        try (Response res = http.newCall(req).execute()) {
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
        Request req = authReq("/api/leave").post(RequestBody.create(body.toString(), JSON)).build();
        try (Response res = http.newCall(req).execute()) {
            return readJson(res);
        } catch (ApiError e) {
            throw e;
        } catch (Exception e) {
            throw new IOException(e);
        }
    }

    public JSONObject getHistory() throws IOException, ApiError {
        Request req = authReq("/api/attendance/history").get().build();
        try (Response res = http.newCall(req).execute()) {
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
        Request req = authReq("/api/face/register").post(RequestBody.create(body.toString(), JSON)).build();
        try (Response res = http.newCall(req).execute()) {
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
        } catch (Exception e) {
            throw new IOException(e);
        }
        Request req = authReq("/api/face/describe").post(RequestBody.create(body.toString(), JSON)).build();
        try (Response res = http.newCall(req).execute()) {
            return readJson(res);
        } catch (ApiError e) {
            throw e;
        } catch (java.net.SocketTimeoutException e) {
            throw new ApiError(408, "Face check timed out. Try again on a better network.");
        } catch (Exception e) {
            throw new IOException(e);
        }
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
        Request req = authReq("/api/me/location-permission")
                .post(RequestBody.create(body.toString(), JSON))
                .build();
        try (Response res = http.newCall(req).execute()) {
            readJson(res);
        } catch (ApiError e) {
            throw e;
        } catch (Exception e) {
            throw new IOException(e);
        }
    }
}
