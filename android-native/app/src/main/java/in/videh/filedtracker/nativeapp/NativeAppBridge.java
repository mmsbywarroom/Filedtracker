package in.videh.filedtracker.nativeapp;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.util.Log;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

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
        String base = apiBase != null && !apiBase.isEmpty() ? apiBase : AppConfig.API_BASE;
        SessionStore.save(activity, token, base, phone != null ? phone : SessionStore.phone(activity), "");
        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setCookie(base, "ft_user_session=" + token + "; Path=/; Secure; SameSite=Lax");
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
            o.put("vpnActive", vpnActive);
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
