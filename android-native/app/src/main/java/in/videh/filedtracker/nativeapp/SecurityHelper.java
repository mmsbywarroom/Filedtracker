package in.videh.filedtracker.nativeapp;

import android.app.AppOpsManager;
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
import android.provider.Settings;
import android.util.Log;

import java.net.NetworkInterface;
import java.util.Collections;
import java.util.Enumeration;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

public final class SecurityHelper {
    private static final String TAG = "FTSecurity";

    /** Known Fake GPS / location-spoof packages (include Play + sideload variants). */
    private static final String[] MOCK_GPS_PACKAGES = {
            "com.lexa.fakegps",
            "com.incorporateapps.fakegps",
            "com.incorporateapps.fakegps.fre",
            "com.blogspot.newapphorizons.fakegps",
            "com.ninja.toolkit.pulse.fake.gps",
            "com.rosteam.gpsspoof",
            "com.evezzon.fakegps",
            "com.fakegps.mock",
            "com.gsmartstudio.fakegps",
            "com.locationchanger",
            "com.pe.fakegps",
            "com.fakegps.location",
            "com.just4fungames.fakegpslocation",
            "com.lkr.fakelocation",
            "com.divinesoftstech.fakegps",
            "com.theappninjas.fakegpsjoystick",
            "com.incorporateapps.fakegps.pro",
            "com.fake.gps.location.spoof",
            "com.blogspot.android_campus.fakegps",
            "com.location.changer.mock",
            "com.wifi.fake.gps",
            "com.modify.gps",
            "ru.gavrikov.mocklocations",
            "com.ltp.vpn.fakegps",
            "com.fake.gps.camera.go",
            "com.incorporateapps.fakegpsjoy",
            "com.github.marcosalis.gpsfaker",
            "org.hola.gpslocation",
            "com.fakegps.run",
    };

    private static final String[] MOCK_GPS_NAME_HINTS = {
            "fakegps",
            "fake.gps",
            "fake_gps",
            "fake gps",
            "fake location",
            "fakelocation",
            "mocklocation",
            "mock.location",
            "mock location",
            "gpsjoystick",
            "gps.spoof",
            "spoof.gps",
            "spoof location",
            "location spoof",
            "gps faker",
            "gpsfaker",
            "mock gps",
            "virtual gps",
            "location changer",
            "locationchanger",
            "gps emulator",
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
                    String n = name.toLowerCase(Locale.US);
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
        return LocationIntegrity.isMock(loc);
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

    /**
     * Detect Fake GPS apps even when mock is not currently active.
     * Android 11+ package visibility: probe known packages via getPackageInfo,
     * then scan launcher apps (MAIN/LAUNCHER query) by package + label.
     */
    public static String findMockGpsAppPackage(Context ctx) {
        String selected = selectedMockLocationApp(ctx);
        if (selected != null && !selected.isEmpty() && !selected.equals(ctx.getPackageName())) {
            return selected;
        }
        String viaExact = findInstalledExactPackage(ctx, MOCK_GPS_PACKAGES);
        if (viaExact != null) return viaExact;
        String viaOp = findAppWithMockLocationOp(ctx);
        if (viaOp != null) return viaOp;
        return findSuspiciousFromLauncher(ctx, MOCK_GPS_NAME_HINTS);
    }

    /**
     * Finds third-party VPN apps via VpnService intent (covers Turbo VPN etc.)
     * then falls back to known package list / name heuristics.
     */
    public static String findKnownVpnAppPackage(Context ctx) {
        String viaIntent = findVpnAppViaVpnService(ctx);
        if (viaIntent != null) return viaIntent;
        String viaExact = findInstalledExactPackage(ctx, VPN_PACKAGES);
        if (viaExact != null) return viaExact;
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

    private static String selectedMockLocationApp(Context ctx) {
        try {
            // Developer options → Select mock location app (API varies by OEM).
            String pkg = Settings.Secure.getString(ctx.getContentResolver(), "mock_location_app");
            if (pkg != null && !pkg.trim().isEmpty()) return pkg.trim();
        } catch (Exception ignored) {
        }
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
                int allow = Settings.Secure.getInt(ctx.getContentResolver(), Settings.Secure.ALLOW_MOCK_LOCATION, 0);
                if (allow == 1) return "mock_location_enabled";
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    /** Works on Android 11+ for packages listed in manifest &lt;queries&gt;. */
    private static String findInstalledExactPackage(Context ctx, String[] packages) {
        PackageManager pm = ctx.getPackageManager();
        for (String pkg : packages) {
            if (pkg == null || pkg.contains(" ")) continue;
            try {
                if (Build.VERSION.SDK_INT >= 33) {
                    pm.getPackageInfo(pkg, PackageManager.PackageInfoFlags.of(0));
                } else {
                    pm.getPackageInfo(pkg, 0);
                }
                return pkg;
            } catch (PackageManager.NameNotFoundException ignored) {
            } catch (Exception e) {
                Log.w(TAG, "getPackageInfo " + pkg, e);
            }
        }
        return null;
    }

    private static String findAppWithMockLocationOp(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return null;
        try {
            AppOpsManager ops = (AppOpsManager) ctx.getSystemService(Context.APP_OPS_SERVICE);
            if (ops == null) return null;
            PackageManager pm = ctx.getPackageManager();
            Set<String> seen = new HashSet<>();
            for (String pkg : collectVisiblePackages(ctx)) {
                if (!seen.add(pkg) || pkg.equals(ctx.getPackageName())) continue;
                try {
                    ApplicationInfo ai = pm.getApplicationInfo(pkg, 0);
                    if ((ai.flags & ApplicationInfo.FLAG_SYSTEM) != 0) continue;
                    int mode = ops.unsafeCheckOpNoThrow(
                            AppOpsManager.OPSTR_MOCK_LOCATION, ai.uid, pkg);
                    if (mode == AppOpsManager.MODE_ALLOWED) return pkg;
                } catch (Exception ignored) {
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "findAppWithMockLocationOp failed", e);
        }
        return null;
    }

    private static String findSuspiciousFromLauncher(Context ctx, String[] hints) {
        PackageManager pm = ctx.getPackageManager();
        for (String pkg : collectVisiblePackages(ctx)) {
            if (pkg.equals(ctx.getPackageName())) continue;
            String lower = pkg.toLowerCase(Locale.US);
            for (String hint : hints) {
                String h = hint.toLowerCase(Locale.US).replace(" ", "");
                if (lower.contains(h) || lower.contains(hint.toLowerCase(Locale.US).replace(' ', '.'))) {
                    try {
                        ApplicationInfo ai = pm.getApplicationInfo(pkg, 0);
                        if ((ai.flags & ApplicationInfo.FLAG_SYSTEM) == 0) return pkg;
                    } catch (Exception ignored) {
                        return pkg;
                    }
                }
            }
            try {
                ApplicationInfo ai = pm.getApplicationInfo(pkg, 0);
                if ((ai.flags & ApplicationInfo.FLAG_SYSTEM) != 0) continue;
                CharSequence label = pm.getApplicationLabel(ai);
                if (label == null) continue;
                String name = label.toString().toLowerCase(Locale.US);
                for (String hint : hints) {
                    if (name.contains(hint.toLowerCase(Locale.US))) return pkg;
                }
            } catch (Exception ignored) {
            }
        }
        return null;
    }

    private static Set<String> collectVisiblePackages(Context ctx) {
        Set<String> out = new HashSet<>();
        PackageManager pm = ctx.getPackageManager();
        try {
            Intent launch = new Intent(Intent.ACTION_MAIN);
            launch.addCategory(Intent.CATEGORY_LAUNCHER);
            List<ResolveInfo> activities = pm.queryIntentActivities(launch, 0);
            if (activities != null) {
                for (ResolveInfo ri : activities) {
                    if (ri.activityInfo != null && ri.activityInfo.packageName != null) {
                        out.add(ri.activityInfo.packageName);
                    }
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "queryIntentActivities failed", e);
        }
        try {
            List<ApplicationInfo> apps = pm.getInstalledApplications(0);
            if (apps != null) {
                for (ApplicationInfo info : apps) {
                    if (info.packageName != null) out.add(info.packageName);
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "getInstalledApplications failed", e);
        }
        Collections.addAll(out, MOCK_GPS_PACKAGES);
        Collections.addAll(out, VPN_PACKAGES);
        return out;
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
            for (String pkg : collectVisiblePackages(ctx)) {
                try {
                    ApplicationInfo info = ctx.getPackageManager().getApplicationInfo(pkg, 0);
                    if ((info.flags & ApplicationInfo.FLAG_SYSTEM) != 0) continue;
                } catch (Exception ignored) {
                    continue;
                }
                String lower = pkg.toLowerCase(Locale.US);
                for (String bad : exact) {
                    if (lower.equals(bad.toLowerCase(Locale.US))) return pkg;
                }
                for (String part : contains) {
                    if (lower.contains(part.toLowerCase(Locale.US))) return pkg;
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
                        + ". Confirmed device evidence — third-party app(s) on phone when using native app.";
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

    /** Report VPN / Fake GPS evidence and block punch-in / punch-out when present. */
    public static void assertSecureForPunch(Context ctx, Location loc) {
        reportPunchEvidence(ctx, loc);
        if (loc == null) {
            throw new SecurityException("Could not verify GPS location. Turn on Location and try again.");
        }
        boolean vpnActive = isVpnActive(ctx);
        String vpnPkg = findKnownVpnAppPackage(ctx);
        String spoofPkg = findMockGpsAppPackage(ctx);
        boolean mock = isMockLocation(loc);
        if (mock || spoofPkg != null) {
            String app = spoofPkg != null ? appDisplayName(ctx, spoofPkg) : "mock location";
            SecurityReporter.report(
                    ctx,
                    "mock_gps",
                    "blocked",
                    "Punch blocked: Fake GPS / mock location (" + app + ")",
                    locLat(loc),
                    locLng(loc)
            );
            throw new SecurityException(
                    "Punch blocked: Fake GPS / mock location detected. Uninstall Fake GPS apps, then try again."
            );
        }
        if (vpnActive || vpnPkg != null) {
            String app = vpnPkg != null ? appDisplayName(ctx, vpnPkg) : "VPN";
            SecurityReporter.report(
                    ctx,
                    "vpn",
                    "blocked",
                    "Punch blocked: VPN on device (" + app + ")",
                    locLat(loc),
                    locLng(loc)
            );
            throw new SecurityException(
                    "Punch blocked: VPN detected. Turn off VPN / uninstall VPN apps, then try again."
            );
        }
    }

    /**
     * Mid-session auto punch-out when Fake GPS app is installed, mock location is active,
     * VPN is connected, or a third-party VPN app is installed.
     */
    public static boolean shouldAutoPunchOutForSecurity(Context ctx, Location loc) {
        if (loc != null && isMockLocation(loc)) return true;
        if (findMockGpsAppPackage(ctx) != null) return true;
        if (isVpnActive(ctx)) return true;
        return findKnownVpnAppPackage(ctx) != null;
    }

    /** @deprecated use {@link #shouldAutoPunchOutForSecurity} */
    @Deprecated
    public static boolean shouldAutoPunchOutForFakeGps(Context ctx, Location loc) {
        return shouldAutoPunchOutForSecurity(ctx, loc);
    }

    /** "fake_gps" or "vpn" for security-punch-out API. */
    public static String autoPunchOutReason(Context ctx, Location loc) {
        if (loc != null && isMockLocation(loc)) return "fake_gps";
        if (findMockGpsAppPackage(ctx) != null) return "fake_gps";
        if (isVpnActive(ctx) || findKnownVpnAppPackage(ctx) != null) return "vpn";
        return "fake_gps";
    }
}
