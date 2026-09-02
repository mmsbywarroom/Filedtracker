package in.videh.filedtracker.nativeapp;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Build;

import java.util.List;

public final class SecurityHelper {
    private static final String[] MOCK_GPS_PACKAGES = {
            "com.lexa.fakegps",
            "com.incorporateapps.fakegps",
            "com.blogspot.newapphorizons.fakegps",
            "com.ninja.toolkit.pulse.fake.gps",
            "com.rosteam.gpsspoof",
            "com.evezzon.fakegps",
            "com.fakegps.mock",
            "com.gsmartstudio.fakegps",
            "com.locationchanger",
            "com.pe.fakegps",
    };

    public interface BlockReason {
        String message();
    }

    private SecurityHelper() {}

    public static boolean isVpnActive(Context ctx) {
        ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return false;
        Network net = cm.getActiveNetwork();
        if (net == null) return false;
        NetworkCapabilities caps = cm.getNetworkCapabilities(net);
        return caps != null && caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN);
    }

    public static boolean isMockLocation(Location loc) {
        if (loc == null) return true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return loc.isMock();
        }
        return loc.isFromMockProvider();
    }

    public static boolean isGpsDisabled(Context ctx) {
        LocationManager lm = (LocationManager) ctx.getSystemService(Context.LOCATION_SERVICE);
        if (lm == null) return true;
        return !lm.isProviderEnabled(LocationManager.GPS_PROVIDER)
                && !lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
    }

    public static boolean hasKnownMockGpsApp(Context ctx) {
        PackageManager pm = ctx.getPackageManager();
        List<ApplicationInfo> apps = pm.getInstalledApplications(0);
        for (ApplicationInfo info : apps) {
            String pkg = info.packageName.toLowerCase();
            for (String bad : MOCK_GPS_PACKAGES) {
                if (pkg.equals(bad) || pkg.contains("fakegps") || pkg.contains("mocklocation") || pkg.contains("gpsjoystick")) {
                    if ((info.flags & ApplicationInfo.FLAG_SYSTEM) == 0) return true;
                }
            }
        }
        return false;
    }

    /** Throws with user message if punch should be blocked. */
    public static void assertSecureForPunch(Context ctx, Location loc) {
        if (isVpnActive(ctx)) {
            throw new SecurityException("Turn off VPN before punch in/out.");
        }
        if (hasKnownMockGpsApp(ctx)) {
            throw new SecurityException("Remove fake GPS / location changer apps from this phone.");
        }
        if (loc == null) {
            throw new SecurityException("Could not verify GPS location.");
        }
        if (isMockLocation(loc)) {
            throw new SecurityException("Fake GPS detected. Turn off mock location and use real GPS.");
        }
    }
}
