package in.videh.filedtracker.nativeapp;

import android.annotation.SuppressLint;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;

/** Full-screen WebView — loads the same web dashboard UI as filed.videh.co.in. */
public class WebShellActivity extends AppCompatActivity {
    public static final String EXTRA_PATH = "path";
    public static final String EXTRA_TITLE = "title";

    private WebView webView;
    private String apiBase;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        LocaleHelper.apply(this);
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        setContentView(webView);

        apiBase = SessionStore.apiBase(this);
        injectSessionCookie();

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        webView.addJavascriptInterface(new NativeAppBridge(this), "NativeAppBridge");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                view.evaluateJavascript("window.__PURE_NATIVE_APP__=true;", null);
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(
                    String origin,
                    GeolocationPermissions.Callback callback
            ) {
                callback.invoke(origin, true, false);
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> request.grant(request.getResources()));
            }
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                String url = webView.getUrl();
                if (url != null && isAppRoot(url)) {
                    finishAffinity();
                    return;
                }
                if (webView.canGoBack()) {
                    webView.goBack();
                } else {
                    finishAffinity();
                }
            }
        });

        String path = getIntent().getStringExtra(EXTRA_PATH);
        if (path == null || path.isEmpty()) path = "/dashboard";
        webView.loadUrl(apiBase + path);
    }

    private void injectSessionCookie() {
        String token = SessionStore.token(this);
        if (token == null || token.isEmpty()) return;
        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(webView, true);
        cm.setCookie(apiBase, "ft_user_session=" + token + "; Path=/; Secure; SameSite=Lax");
        cm.flush();
    }

    private boolean isAppRoot(String url) {
        if (url == null) return false;
        String path = url.replace(apiBase, "").replaceAll("\\?.*", "");
        if (path.endsWith("/")) path = path.substring(0, path.length() - 1);
        return path.isEmpty() || path.equals("/dashboard") || path.equals("/rally");
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
