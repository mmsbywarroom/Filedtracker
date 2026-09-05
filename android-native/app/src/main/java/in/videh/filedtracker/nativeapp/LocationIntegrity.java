package in.videh.filedtracker.nativeapp;

import android.content.Context;
import android.content.SharedPreferences;
import android.location.Location;
import android.os.Build;
import android.provider.Settings;

import androidx.core.location.LocationCompat;

import org.json.JSONObject;

import java.util.UUID;

/** Official OS mock-location signal + installation identity for silent evidence. */
public final class LocationIntegrity {
    private static final String PREFS = "ft_location_integrity";
    private static final String KEY_INSTALL = "app_installation_id";

    private LocationIntegrity() {}

    /** Prefer LocationCompat / isMock — direct Android OS signal. */
    public static boolean isMock(Location loc) {
        if (loc == null) return false;
        try {
            return LocationCompat.isMock(loc);
        } catch (Throwable t) {
            if (Build.VERSION.SDK_INT >= 31) {
                return loc.isMock();
            }
            //noinspection deprecation
            return loc.isFromMockProvider();
        }
    }

    public static String appInstallationId(Context ctx) {
        SharedPreferences p = ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String id = p.getString(KEY_INSTALL, null);
        if (id == null || id.isEmpty()) {
            id = "ai_" + UUID.randomUUID().toString().replace("-", "");
            p.edit().putString(KEY_INSTALL, id).apply();
        }
        return id;
    }

    public static JSONObject deviceMeta(Context ctx) {
        JSONObject o = new JSONObject();
        try {
            o.put("appInstallationId", appInstallationId(ctx));
            o.put("appVersion", BuildConfigSafe.versionName(ctx));
            o.put("versionCode", BuildConfigSafe.versionCode(ctx));
            o.put("androidVersion", String.valueOf(Build.VERSION.SDK_INT));
            o.put("manufacturer", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER);
            o.put("model", Build.MODEL == null ? "" : Build.MODEL);
            o.put("androidId", Settings.Secure.getString(ctx.getContentResolver(), Settings.Secure.ANDROID_ID));
        } catch (Exception ignored) {
        }
        return o;
    }

    public static JSONObject sampleFrom(Location loc, String source, boolean vpnActive) {
        JSONObject o = new JSONObject();
        try {
            o.put("sampleId", "s_" + UUID.randomUUID().toString().replace("-", ""));
            o.put("source", source == null ? "background" : source);
            o.put("lat", loc.getLatitude());
            o.put("lng", loc.getLongitude());
            o.put("accuracy", loc.hasAccuracy() ? loc.getAccuracy() : JSONObject.NULL);
            o.put("altitude", loc.hasAltitude() ? loc.getAltitude() : JSONObject.NULL);
            o.put("speed", loc.hasSpeed() ? loc.getSpeed() : JSONObject.NULL);
            o.put("bearing", loc.hasBearing() ? loc.getBearing() : JSONObject.NULL);
            o.put("provider", loc.getProvider() == null ? "" : loc.getProvider());
            o.put("isMock", isMock(loc));
            o.put("locationTimestamp", loc.getTime() > 0 ? loc.getTime() : System.currentTimeMillis());
            o.put("elapsedRealtimeNanos", String.valueOf(loc.getElapsedRealtimeNanos()));
            o.put("vpnActive", vpnActive);
        } catch (Exception ignored) {
        }
        return o;
    }

    /** Avoid PackageManager reflection issues in library code. */
    static final class BuildConfigSafe {
        static String versionName(Context ctx) {
            try {
                return ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "";
            }
        }

        static int versionCode(Context ctx) {
            try {
                if (Build.VERSION.SDK_INT >= 28) {
                    return (int) ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0).getLongVersionCode();
                }
                //noinspection deprecation
                return ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0).versionCode;
            } catch (Exception e) {
                return 0;
            }
        }
    }
}
