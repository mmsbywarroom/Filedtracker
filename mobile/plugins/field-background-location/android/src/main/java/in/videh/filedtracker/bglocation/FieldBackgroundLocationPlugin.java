package in.videh.filedtracker.bglocation;

import android.Manifest;
import android.os.Build;

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

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                && getPermissionState("background") != PermissionState.GRANTED) {
            requestPermissionForAlias("background", call, "afterBackground");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "afterNotifications");
            return;
        }

        startService(apiBase, token, punchInAt, call);
    }

    @PermissionCallback
    private void afterForeground(PluginCall call) {
        startTracking(call);
    }

    @PermissionCallback
    private void afterBackground(PluginCall call) {
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
}
