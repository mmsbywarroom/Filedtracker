package in.videh.filedtracker.nativeapp;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.util.Log;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import in.videh.filedtracker.nativeapp.compose.ComposeMainActivity;

import org.json.JSONObject;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import in.videh.filedtracker.bglocation.FieldLocationService;
import in.videh.filedtracker.bglocation.TrackingPrefs;

/** JS bridge for the pure-native WebView shell (same dashboard UI as web). */
public class NativeAppBridge {
    private static final String TAG = "FTNativeBridge";
    private final Activity activity;

    public NativeAppBridge(Activity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public void saveSession(String token, String apiBase, String phone) {
        if (token == null || token.isEmpty()) return;
        SessionStore.save(activity, token, AppConfig.API_BASE, phone != null ? phone : SessionStore.phone(activity), "");
        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setCookie(AppConfig.API_BASE, "ft_user_session=" + token + "; Path=/; Secure; SameSite=Lax");
        cm.flush();
    }

    @JavascriptInterface
    public void startTracking(String apiBase, String token, String punchInAt) {
        activity.runOnUiThread(() -> {
            try {
                if (token == null || token.isEmpty() || punchInAt == null || punchInAt.isEmpty()) return;
                String base = apiBase != null && !apiBase.isEmpty() ? apiBase : SessionStore.apiBase(activity);
                // Keep SessionStore in sync so SecurityReporter works
                SessionStore.save(
                        activity,
                        token,
                        base,
                        SessionStore.phone(activity),
                        ""
                );
                if (!LocationHelper.hasFineLocation(activity)) {
                    Log.w(TAG, "startTracking skipped — no location permission");
                    LocationHelper.requestLocationPermissions(activity);
                    return;
                }
                FieldLocationService.start(activity, base, token, punchInAt);
            } catch (Exception e) {
                Log.e(TAG, "startTracking failed", e);
            }
        });
    }

    @JavascriptInterface
    public void stopTracking() {
        activity.runOnUiThread(() -> {
            try {
                FieldLocationService.stop(activity);
            } catch (Exception e) {
                Log.e(TAG, "stopTracking failed", e);
            }
        });
    }

    /** JSON: { vpn, spoofApp, spoofPackage, vpnPackage, mockLikely, detail } */
    @JavascriptInterface
    public String getSecurityStatus() {
        try {
            boolean vpnActive = SecurityHelper.isVpnActive(activity);
            String spoofPkg = SecurityHelper.findMockGpsAppPackage(activity);
            String vpnPkg = SecurityHelper.findKnownVpnAppPackage(activity);
            boolean vpn = vpnActive || vpnPkg != null;
            JSONObject o = new JSONObject();
            o.put("vpn", vpn);
            o.put("vpnActive", vpn);
            o.put("spoofApp", spoofPkg != null);
            o.put("spoofPackage", spoofPkg != null ? spoofPkg : "");
            o.put("vpnPackage", vpnPkg != null ? vpnPkg : "");
            o.put("mockLikely", spoofPkg != null);
            String detail = "";
            if (vpnActive && vpnPkg != null) {
                detail = "VPN connected · app: " + SecurityHelper.appDisplayName(activity, vpnPkg);
            } else if (vpnActive) {
                detail = "VPN connected on device";
            } else if (vpnPkg != null) {
                detail = "VPN app installed: " + SecurityHelper.appDisplayName(activity, vpnPkg);
            }
            if (spoofPkg != null) {
                String spoofDetail = "Spoof / fake GPS app: " + SecurityHelper.appDisplayName(activity, spoofPkg);
                detail = detail.isEmpty() ? spoofDetail : (detail + " · " + spoofDetail);
            }
            o.put("detail", detail);
            return o.toString();
        } catch (Exception e) {
            return "{\"vpn\":false,\"vpnActive\":false,\"spoofApp\":false,\"spoofPackage\":\"\",\"vpnPackage\":\"\",\"mockLikely\":false,\"detail\":\"\"}";
        }
    }

    @JavascriptInterface
    public void reportSecurityEvent(String type, String action, String detail) {
        SecurityReporter.report(activity, type, action, detail, null, null);
    }

    /** Blocks briefly on the bridge thread and returns {"ok":true,"lat":..,"lng":..} or {"ok":false}. */
    @JavascriptInterface
    public String getCurrentLocationJson() {
        if (!LocationHelper.hasFineLocation(activity)) {
            activity.runOnUiThread(() -> {
                if (activity instanceof WebShellActivity) {
                    ((WebShellActivity) activity).requestAllPermissions();
                } else {
                    LocationHelper.requestLocationPermissions(activity);
                }
            });
            return "{\"ok\":false,\"error\":\"permission\"}";
        }
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> out = new AtomicReference<>("{\"ok\":false,\"error\":\"timeout\"}");
        LocationHelper.getCurrentLocation(activity, new LocationHelper.Callback() {
            @Override
            public void onResult(Location loc) {
                out.set("{\"ok\":true,\"lat\":" + loc.getLatitude() + ",\"lng\":" + loc.getLongitude() + "}");
                latch.countDown();
            }

            @Override
            public void onError(String message) {
                try {
                    JSONObject o = new JSONObject();
                    o.put("ok", false);
                    o.put("error", message == null ? "GPS failed" : message);
                    out.set(o.toString());
                } catch (Exception ignored) {
                    out.set("{\"ok\":false,\"error\":\"GPS failed\"}");
                }
                latch.countDown();
            }
        });
        try {
            latch.await(12, TimeUnit.SECONDS);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
        return out.get();
    }

    @JavascriptInterface
    public String getLocationPermissionStatus() {
        return LocationHelper.permissionStatusJson(activity);
    }

    @JavascriptInterface
    public String requestLocationPermissions() {
        activity.runOnUiThread(() -> {
            if (activity instanceof WebShellActivity) {
                ((WebShellActivity) activity).requestAllPermissions();
            } else {
                LocationHelper.requestLocationPermissions(activity);
                LocationHelper.requestNotifications(activity);
            }
        });
        return LocationHelper.permissionStatusJson(activity);
    }

    @JavascriptInterface
    public void requestCameraPermission() {
        activity.runOnUiThread(() -> {
            if (activity instanceof WebShellActivity) {
                ((WebShellActivity) activity).requestAllPermissions();
            } else if (ContextCompat.checkSelfPermission(activity, Manifest.permission.CAMERA)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(activity, new String[]{Manifest.permission.CAMERA}, 4100);
            }
        });
    }

    @JavascriptInterface
    public int getStatusBarHeightPx() {
        if (activity instanceof WebShellActivity) {
            return ((WebShellActivity) activity).getStatusBarHeightPx();
        }
        int id = activity.getResources().getIdentifier("status_bar_height", "dimen", "android");
        if (id > 0) return activity.getResources().getDimensionPixelSize(id);
        return (int) (28 * activity.getResources().getDisplayMetrics().density);
    }

    @JavascriptInterface
    public int getNavigationBarHeightPx() {
        if (activity instanceof WebShellActivity) {
            return ((WebShellActivity) activity).getNavigationBarHeightPx();
        }
        return 0;
    }

    @JavascriptInterface
    public void openLocationSettings() {
        activity.runOnUiThread(() -> LocationHelper.openAppSettings(activity));
    }

    @JavascriptInterface
    public void clearSessionAndCookies() {
        activity.runOnUiThread(() -> {
            try {
                FieldLocationService.stop(activity);
                TrackingPrefs.clear(activity);
                SessionStore.clear(activity);
                CookieManager cm = CookieManager.getInstance();
                cm.removeAllCookies(null);
                cm.flush();
                Intent i = new Intent(activity, ComposeMainActivity.class);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
                activity.startActivity(i);
                activity.finish();
            } catch (Exception e) {
                Log.e(TAG, "clearSession failed", e);
            }
        });
    }

    @JavascriptInterface
    public void exitApp() {
        activity.runOnUiThread(() -> {
            try {
                activity.finishAffinity();
            } catch (Exception ignored) {
            }
        });
    }

    @JavascriptInterface
    public boolean isPureNative() {
        return true;
    }
}
