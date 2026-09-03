package in.videh.filedtracker.nativeapp;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.location.Location;
import android.location.LocationManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.VpnService;
import android.os.Build;
import android.util.Log;

import java.net.NetworkInterface;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;

public final class SecurityHelper {
    private static final String TAG = "FTSecurity";

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
            "com.incorporateapps.fakegps.fre",
            "com.fakegps.location",
            "com.just4fungames.fakegpslocation",
            "com.lkr.fakelocation",
    };

    /** Common third-party VPN apps (including Turbo VPN). */
    private static final String[] VPN_PACKAGES = {
            "free.vpn.unblock.proxy.turbovpn",
            "free.vpn.proxy.unblock.turbovpn.pro",
            "com.turbovpn.vpn",
            "com.fast.free.unblock.secure.vpn",
            "com.vpn.secure.proxy",
            "com.northghost.touchvpn",
            "com.expressvpn.vpn",
            "com.nordvpn.android",
            "com.surfshark.vpnclient",
            "com.protonvpn.android",
            "com.privateinternetaccess.android",
            "hotspotshield.android.vpn",
            "com.windscribe.vpn",
            "org.outline.android.client",
            "com.v2ray.ang",
            "com.github.shadowsocks",
            "com.psiphon3.subscription",
            "com.psiphon3",
            "org.strongswan.android",
            "de.blinkt.openvpn",
            "com.ultrasurf.vpn",
            "com.free.vpn.proxy.master.app",
            "com.fast.free.vpn.proxy",
            "vpn.free.hotspot.secure.vpnify",
    };

    private SecurityHelper() {}

    /** VPN tunnel currently up (status-bar key icon typically). */
    public static boolean isVpnActive(Context ctx) {
        try {
            if (hasVpnTransport(ctx)) return true;
        } catch (Exception e) {
            Log.w(TAG, "hasVpnTransport failed", e);
        }
        try {
            if (hasVpnNetworkInterface()) return true;
        } catch (Exception e) {
            Log.w(TAG, "hasVpnNetworkInterface failed", e);
        }
        return false;
    }

    /** Any third-party VPN app installed OR VPN currently connected. */
    public static boolean shouldBlockVpn(Context ctx) {
        return isVpnActive(ctx) || findKnownVpnAppPackage(ctx) != null;
    }

    private static boolean hasVpnTransport(Context ctx) {
        ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return false;

        Network active = cm.getActiveNetwork();
        if (active != null) {
            NetworkCapabilities caps = cm.getNetworkCapabilities(active);
            if (caps != null) {
                if (caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) return true;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                        && !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN)) {
                    return true;
                }
            }
        }

        Network[] all = cm.getAllNetworks();
        if (all == null) return false;
        for (Network net : all) {
            NetworkCapabilities caps = cm.getNetworkCapabilities(net);
            if (caps != null && caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) {
                return true;
            }
        }
        return false;
    }

    private static boolean hasVpnNetworkInterface() {
        try {
            Enumeration<NetworkInterface> list = NetworkInterface.getNetworkInterfaces();
            if (list == null) return false;
            for (NetworkInterface nif : Collections.list(list)) {
                try {
                    if (!nif.isUp()) continue;
                    String name = nif.getName();
                    if (name == null) continue;
                    String n = name.toLowerCase();
                    if (n.contains("tun")
                            || n.startsWith("ppp")
                            || n.startsWith("tap")
                            || n.startsWith("wg")
                            || n.contains("ipsec")
                            || n.contains("utun")) {
                        return true;
                    }
                } catch (Exception ignored) {
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "hasVpnNetworkInterface failed", e);
        }
        return false;
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
        return findMockGpsAppPackage(ctx) != null;
    }

    public static String findMockGpsAppPackage(Context ctx) {
        return findPackageMatch(
                ctx,
                MOCK_GPS_PACKAGES,
                new String[]{"fakegps", "fake.gps", "fake_gps", "mocklocation", "mock.location", "gpsjoystick", "gps.spoof", "spoof.gps"}
        );
    }

    /**
     * Finds third-party VPN apps via VpnService intent (covers Turbo VPN etc.)
     * then falls back to known package list / name heuristics.
     */
    public static String findKnownVpnAppPackage(Context ctx) {
        String viaIntent = findVpnAppViaVpnService(ctx);
        if (viaIntent != null) return viaIntent;
        return findPackageMatch(
                ctx,
                VPN_PACKAGES,
                new String[]{"turbovpn", "vpn.proxy", "openvpn", "shadowsocks", "v2ray", "psiphon", "hotspotshield"}
        );
    }

    /** Human-readable "App Name (package)" for admin security logs. */
    public static String appDisplayName(Context ctx, String packageName) {
        if (packageName == null || packageName.isEmpty()) return "";
        try {
            PackageManager pm = ctx.getPackageManager();
            ApplicationInfo ai = pm.getApplicationInfo(packageName, 0);
            CharSequence label = pm.getApplicationLabel(ai);
            if (label != null && label.length() > 0) {
                return label + " (" + packageName + ")";
            }
        } catch (Exception ignored) {
        }
        return packageName;
    }

    private static String findVpnAppViaVpnService(Context ctx) {
        try {
            PackageManager pm = ctx.getPackageManager();
            Intent intent = new Intent(VpnService.SERVICE_INTERFACE);
            List<ResolveInfo> list = pm.queryIntentServices(intent, PackageManager.MATCH_DEFAULT_ONLY);
            if (list == null || list.isEmpty()) {
                list = pm.queryIntentServices(intent, 0);
            }
            if (list == null) return null;
            String self = ctx.getPackageName();
            for (ResolveInfo ri : list) {
                if (ri.serviceInfo == null) continue;
                String pkg = ri.serviceInfo.packageName;
                if (pkg == null || pkg.equals(self)) continue;
                try {
                    ApplicationInfo ai = pm.getApplicationInfo(pkg, 0);
                    if ((ai.flags & ApplicationInfo.FLAG_SYSTEM) != 0) continue;
                } catch (Exception ignored) {
                    continue;
                }
                return pkg;
            }
        } catch (Exception e) {
            Log.w(TAG, "findVpnAppViaVpnService failed", e);
        }
        return null;
    }

    private static String findPackageMatch(Context ctx, String[] exact, String[] contains) {
        try {
            PackageManager pm = ctx.getPackageManager();
            List<ApplicationInfo> apps = pm.getInstalledApplications(PackageManager.GET_META_DATA);
            for (ApplicationInfo info : apps) {
                if ((info.flags & ApplicationInfo.FLAG_SYSTEM) != 0) continue;
                String pkg = info.packageName.toLowerCase();
                for (String bad : exact) {
                    if (pkg.equals(bad.toLowerCase())) return info.packageName;
                }
                for (String part : contains) {
                    if (pkg.contains(part.toLowerCase())) return info.packageName;
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "findPackageMatch failed", e);
        }
        return null;
    }

    public static void reportViolations(Context ctx, Location loc, String action) {
        reportPunchEvidence(ctx, loc);
    }

    /** One consolidated evidence row per day (server upserts). */
    public static void reportPunchEvidence(Context ctx, Location loc) {
        boolean vpnActive = isVpnActive(ctx);
        String vpnPkg = findKnownVpnAppPackage(ctx);
        String spoofPkg = findMockGpsAppPackage(ctx);
        boolean mock = loc != null && isMockLocation(loc);
        if (!vpnActive && vpnPkg == null && spoofPkg == null && !mock) return;

        StringBuilder apps = new StringBuilder();
        if (vpnPkg != null) {
            apps.append("VPN app: ").append(appDisplayName(ctx, vpnPkg));
            if (vpnActive) apps.append(" (connected)");
        } else if (vpnActive) {
            apps.append("VPN connected on device");
        }
        if (spoofPkg != null) {
            if (apps.length() > 0) apps.append("; ");
            apps.append("Fake GPS / spoof app: ").append(appDisplayName(ctx, spoofPkg));
        }
        if (mock) {
            if (apps.length() > 0) apps.append("; ");
            apps.append("Mock location flag on GPS fix");
        }
        String detail =
                "Apps at native punch-in: "
                        + apps
                        + ". Pakka device evidence — third-party app(s) on phone when using native app.";
        SecurityReporter.report(
                ctx,
                "punch_evidence",
                "punch_evidence",
                detail,
                locLat(loc),
                locLng(loc)
        );
    }

    private static Double locLat(Location loc) {
        return loc != null ? loc.getLatitude() : null;
    }

    private static Double locLng(Location loc) {
        return loc != null ? loc.getLongitude() : null;
    }

    /** Report VPN / spoof evidence — do not block punch. */
    public static void assertSecureForPunch(Context ctx, Location loc) {
        reportPunchEvidence(ctx, loc);
        if (loc == null) {
            throw new SecurityException("Could not verify GPS location.");
        }
    }
}
