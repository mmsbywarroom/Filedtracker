package in.videh.filedtracker.nativeapp;

import android.content.Context;
import android.content.res.Configuration;
import android.content.res.Resources;

import java.util.Locale;

public final class LocaleHelper {
    private static final String PREFS = "aap_locale";
    private static final String KEY = "lang";

    private LocaleHelper() {}

    public static void apply(Context ctx) {
        String lang = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "en");
        Locale locale = "pa".equals(lang) ? new Locale("pa") : Locale.ENGLISH;
        Locale.setDefault(locale);
        Resources res = ctx.getResources();
        Configuration cfg = new Configuration(res.getConfiguration());
        cfg.setLocale(locale);
        res.updateConfiguration(cfg, res.getDisplayMetrics());
    }

    public static void setLanguage(Context ctx, String lang) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, lang).apply();
        apply(ctx);
    }

    public static String currentLang(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "en");
    }
}
