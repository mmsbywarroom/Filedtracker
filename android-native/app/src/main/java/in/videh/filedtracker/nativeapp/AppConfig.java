package in.videh.filedtracker.nativeapp;

import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.HttpsURLConnection;

import okhttp3.OkHttpClient;

/**
 * Temporary Elastic IP base while Google DNS still caches the old EC2 public IP.
 * SSL cert is for filed.videh.co.in — hostname verifier accepts that name.
 */
public final class AppConfig {
    /** Canonical hostname (TLS cert SAN). */
    public static final String API_HOST = "filed.videh.co.in";
    /**
     * Direct Elastic IP — bypasses stale DNS so OTP/punch work during propagation.
     * Switch back to https://filed.videh.co.in once DNS is fully updated everywhere.
     */
    public static final String API_BASE = "https://13.234.95.134";

    /** Verify cert as filed.videh.co.in even when connecting via Elastic IP. */
    public static final HostnameVerifier HOSTNAME_VERIFIER =
            (hostname, session) ->
                    HttpsURLConnection.getDefaultHostnameVerifier().verify(API_HOST, session);

    public static OkHttpClient.Builder okHttpBuilder() {
        return new OkHttpClient.Builder().hostnameVerifier(HOSTNAME_VERIFIER);
    }

    private AppConfig() {}
}
