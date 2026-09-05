package in.videh.filedtracker.nativeapp;

import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.HttpsURLConnection;

import okhttp3.OkHttpClient;

/**
 * Primary = public domain (works on all mobile networks).
 * Fallback = Elastic IP (works if DNS is stale or domain briefly unreachable).
 */
public final class AppConfig {
    public static final String API_HOST = "filed.videh.co.in";
    /** Preferred — same as the website. */
    public static final String API_BASE = "https://filed.videh.co.in";
    /** Stable Elastic IP — permanent backup when DNS/domain fails. */
    public static final String API_BASE_FALLBACK = "https://13.234.95.134";

    public static final HostnameVerifier HOSTNAME_VERIFIER =
            (hostname, session) ->
                    HttpsURLConnection.getDefaultHostnameVerifier().verify(API_HOST, session)
                            || "13.234.95.134".equals(hostname)
                            || API_HOST.equals(hostname);

    public static OkHttpClient.Builder okHttpBuilder() {
        return new OkHttpClient.Builder().hostnameVerifier(HOSTNAME_VERIFIER);
    }

    /** Ordered bases to try: preferred first, then fallback (deduped). */
    public static String[] apiBases(String preferred) {
        String primary =
                preferred != null && !preferred.isEmpty() ? preferred.replaceAll("/$", "") : API_BASE;
        if (primary.equals(API_BASE_FALLBACK)) {
            return new String[] {API_BASE_FALLBACK, API_BASE};
        }
        if (primary.equals(API_BASE)) {
            return new String[] {API_BASE, API_BASE_FALLBACK};
        }
        return new String[] {primary, API_BASE, API_BASE_FALLBACK};
    }

    private AppConfig() {}
}
