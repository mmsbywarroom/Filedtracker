package in.videh.filedtracker.nativeapp;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.os.Build;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import in.videh.filedtracker.bglocation.FieldLocationService;

/** JS bridge for the pure-native WebView shell (same dashboard UI as web). */
public class NativeAppBridge {
    private final Activity activity;

    public NativeAppBridge(Activity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public void startTracking(String apiBase, String token, String punchInAt) {
        activity.runOnUiThread(() -> {
            if (token == null || token.isEmpty() || punchInAt == null || punchInAt.isEmpty()) return;
            String base = apiBase != null && !apiBase.isEmpty() ? apiBase : SessionStore.apiBase(activity);
            FieldLocationService.start(activity, base, token, punchInAt);
        });
    }

    @JavascriptInterface
    public void stopTracking() {
        activity.runOnUiThread(() -> FieldLocationService.stop(activity));
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
            FieldLocationService.stop(activity);
            SessionStore.clear(activity);
            CookieManager cm = CookieManager.getInstance();
            cm.removeAllCookies(null);
            cm.flush();
        });
    }

    @JavascriptInterface
    public void exitApp() {
        activity.runOnUiThread(() -> {
            activity.finishAffinity();
            System.exit(0);
        });
    }

    @JavascriptInterface
    public boolean isPureNative() {
        return true;
    }
}
