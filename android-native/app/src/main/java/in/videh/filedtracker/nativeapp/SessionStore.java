package in.videh.filedtracker.nativeapp;

import android.content.Context;
import android.content.SharedPreferences;

public final class SessionStore {
    private static final String PREFS = "aap_native_session";
    private static final String KEY_TOKEN = "token";
    private static final String KEY_API_BASE = "api_base";
    private static final String KEY_PHONE = "phone";
    private static final String KEY_NAME = "name";

    private SessionStore() {}

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static void save(Context ctx, String token, String apiBase, String phone, String name) {
        prefs(ctx).edit()
                .putString(KEY_TOKEN, token)
                .putString(KEY_API_BASE, apiBase != null && !apiBase.isEmpty() ? apiBase : AppConfig.API_BASE)
                .putString(KEY_PHONE, phone)
                .putString(KEY_NAME, name)
                .apply();
    }

    public static boolean isLoggedIn(Context ctx) {
        String t = prefs(ctx).getString(KEY_TOKEN, "");
        return t != null && !t.isEmpty();
    }

    public static String token(Context ctx) {
        return prefs(ctx).getString(KEY_TOKEN, "");
    }

    public static String apiBase(Context ctx) {
        String base = prefs(ctx).getString(KEY_API_BASE, AppConfig.API_BASE);
        if (base == null || base.isEmpty()) return AppConfig.API_BASE;
        // Prefer public domain; keep Elastic IP only if explicitly stored as IP.
        if (base.contains("13.234.95.134")) return base;
        if (base.contains("filed.videh.co.in")) return AppConfig.API_BASE;
        return base;
    }

    public static String phone(Context ctx) {
        return prefs(ctx).getString(KEY_PHONE, "");
    }

    public static void clear(Context ctx) {
        prefs(ctx).edit().clear().apply();
    }
}
