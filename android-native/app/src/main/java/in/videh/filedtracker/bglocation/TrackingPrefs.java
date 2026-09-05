package in.videh.filedtracker.bglocation;

import android.content.Context;
import android.content.SharedPreferences;

public final class TrackingPrefs {
    private static final String PREFS = "ft_bg_tracking";
    private static final String KEY_ACTIVE = "active";
    private static final String KEY_API = "api_base";
    private static final String KEY_TOKEN = "auth_token";
    private static final String KEY_PUNCH_IN = "punch_in_at";
    private static final String KEY_SENT_SLOTS = "sent_slots";

    private TrackingPrefs() {}

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static void saveSession(Context ctx, String apiBase, String token, String punchInAt) {
        String base = apiBase;
        if (base != null && base.contains("filed.videh.co.in")) {
            base = in.videh.filedtracker.nativeapp.AppConfig.API_BASE;
        }
        prefs(ctx).edit()
                .putBoolean(KEY_ACTIVE, true)
                .putString(KEY_API, base)
                .putString(KEY_TOKEN, token)
                .putString(KEY_PUNCH_IN, punchInAt)
                .putString(KEY_SENT_SLOTS, "")
                .apply();
    }

    public static void clear(Context ctx) {
        prefs(ctx).edit().clear().apply();
    }

    public static boolean isActive(Context ctx) {
        return prefs(ctx).getBoolean(KEY_ACTIVE, false);
    }

    public static String apiBase(Context ctx) {
        String base = prefs(ctx).getString(KEY_API, "");
        if (base != null && base.contains("filed.videh.co.in")) {
            return in.videh.filedtracker.nativeapp.AppConfig.API_BASE;
        }
        return base;
    }

    public static String token(Context ctx) {
        return prefs(ctx).getString(KEY_TOKEN, "");
    }

    public static long punchInMs(Context ctx) {
        String raw = prefs(ctx).getString(KEY_PUNCH_IN, "");
        if (raw == null || raw.isEmpty()) return 0L;
        try {
            java.time.Instant instant = java.time.Instant.parse(raw);
            return instant.toEpochMilli();
        } catch (Exception e) {
            return 0L;
        }
    }

    public static boolean hasSentSlot(Context ctx, int slot) {
        String sent = prefs(ctx).getString(KEY_SENT_SLOTS, "");
        if (sent == null || sent.isEmpty()) return false;
        String needle = "," + slot + ",";
        return ("," + sent + ",").contains(needle);
    }

    public static void markSlotSent(Context ctx, int slot) {
        String sent = prefs(ctx).getString(KEY_SENT_SLOTS, "");
        if (sent == null) sent = "";
        if (hasSentSlot(ctx, slot)) return;
        if (sent.isEmpty()) sent = String.valueOf(slot);
        else sent = sent + "," + slot;
        prefs(ctx).edit().putString(KEY_SENT_SLOTS, sent).apply();
    }
}
