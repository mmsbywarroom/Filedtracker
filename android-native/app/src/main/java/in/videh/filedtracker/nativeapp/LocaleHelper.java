package in.videh.filedtracker.nativeapp;

import android.content.Context;
import android.content.res.Configuration;
import android.content.res.Resources;
import android.os.Build;

import java.util.Locale;

public final class LocaleHelper {
    private static final String PREFS = "aap_locale";
    private static final String KEY = "lang";

    private LocaleHelper() {}

    /** Wrap activity/application context so stringResource / layouts pick EN or PA. */
    public static Context wrap(Context ctx) {
        String lang = currentLang(ctx);
        Locale locale = "pa".equals(lang) ? new Locale("pa") : Locale.ENGLISH;
        Locale.setDefault(locale);
        Configuration cfg = new Configuration(ctx.getResources().getConfiguration());
        cfg.setLocale(locale);
        return ctx.createConfigurationContext(cfg);
    }

    /** Legacy path for older activities that still call this in onCreate. */
    public static void apply(Context ctx) {
        String lang = currentLang(ctx);
        Locale locale = "pa".equals(lang) ? new Locale("pa") : Locale.ENGLISH;
        Locale.setDefault(locale);
        Resources res = ctx.getResources();
        Configuration cfg = new Configuration(res.getConfiguration());
        cfg.setLocale(locale);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            ctx.createConfigurationContext(cfg);
        }
        // Still update so non-wrapped callers see the change after recreate().
        //noinspection deprecation
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
