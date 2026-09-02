package in.videh.filedtracker.bglocation;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import android.webkit.CookieManager;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
        name = "FieldBackgroundLocation",
        permissions = {
                @Permission(strings = { Manifest.permission.ACCESS_FINE_LOCATION }, alias = "location"),
                @Permission(strings = { Manifest.permission.ACCESS_COARSE_LOCATION }, alias = "coarse"),
                @Permission(
                        strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION },
                        alias = "background"
                ),
                @Permission(
                        strings = { Manifest.permission.POST_NOTIFICATIONS },
                        alias = "notifications"
                )
        }
)
public class FieldBackgroundLocationPlugin extends Plugin {

    private PluginCall pendingSettingsCall;

    @PluginMethod
    public void startTracking(PluginCall call) {
        String apiBase = call.getString("apiBaseUrl");
        String token = call.getString("authToken");
        String punchInAt = call.getString("punchInAt");
        if (apiBase == null || apiBase.isEmpty() || token == null || token.isEmpty() || punchInAt == null) {
            call.reject("apiBaseUrl, authToken, and punchInAt are required");
            return;
        }

        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "afterForeground");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && !hasBackgroundLocation()) {
            pendingSettingsCall = call;
            openLocationSettingsInternal();
            JSObject ret = new JSObject();
            ret.put("ok", false);
            ret.put("needsSettings", true);
            ret.put("message", "Open Settings → Permissions → Location → Allow all the time");
            call.resolve(ret);
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "afterNotifications");
            return;
        }

        startService(apiBase, token, punchInAt, call);
    }

    @PluginMethod
    public void requestLocationPermissions(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "afterLocationPermRequest");
            return;
        }
        continueBackgroundLocationRequest(call);
    }

    @PermissionCallback
    private void afterLocationPermRequest(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            call.reject("Choose \"While using the app\" to continue.");
            return;
        }
        continueBackgroundLocationRequest(call);
    }

    private void continueBackgroundLocationRequest(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && !hasBackgroundLocation()) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                requestPermissionForAlias("background", call, "afterBackgroundPermRequest");
                return;
            }
            requestPermissionForAlias("background", call, "afterBackgroundPermRequest");
            return;
        }
        JSObject ret = new JSObject();
        ret.put("foreground", true);
        ret.put("background", hasBackgroundLocation());
        call.resolve(ret);
    }

    @PermissionCallback
    private void afterBackgroundPermRequest(PluginCall call) {
        if (!hasBackgroundLocation() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            openLocationSettingsInternal();
        }
        JSObject ret = new JSObject();
        ret.put("foreground", getPermissionState("location") == PermissionState.GRANTED);
        ret.put("background", hasBackgroundLocation());
        ret.put("needsSettings", !hasBackgroundLocation());
        call.resolve(ret);
    }

    @PluginMethod
    public void getLocationPermissionStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("foreground", getPermissionState("location") == PermissionState.GRANTED);
        ret.put("background", hasBackgroundLocation());
        ret.put("needsSettings", getPermissionState("location") == PermissionState.GRANTED && !hasBackgroundLocation());
        call.resolve(ret);
    }

    @PluginMethod
    public void clearAppCookies(PluginCall call) {
        CookieManager cm = CookieManager.getInstance();
        cm.removeAllCookies(value -> {});
        cm.flush();
        call.resolve();
    }

    @PluginMethod
    public void openLocationSettings(PluginCall call) {
        openLocationSettingsInternal();
        call.resolve();
    }

    @PermissionCallback
    private void afterForeground(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            call.reject("Location permission denied. Choose \"While using the app\" first.");
            return;
        }
        startTracking(call);
    }

    @PermissionCallback
    private void afterNotifications(PluginCall call) {
        startTracking(call);
    }

    @PluginMethod
    public void stopTracking(PluginCall call) {
        FieldLocationService.stop(getContext());
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void isTracking(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("active", TrackingPrefs.isActive(getContext()));
        call.resolve(ret);
    }

    private void startService(String apiBase, String token, String punchInAt, PluginCall call) {
        FieldLocationService.start(getContext(), apiBase.replaceAll("/+$", ""), token, punchInAt);
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    private boolean hasBackgroundLocation() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true;
        return ContextCompat.checkSelfPermission(
                        getContext(), Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    private void openLocationSettingsInternal() {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.fromParts("package", getContext().getPackageName(), null));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getActivity().startActivity(intent);
    }
}
