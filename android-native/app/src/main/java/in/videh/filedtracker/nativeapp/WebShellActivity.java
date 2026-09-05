package in.videh.filedtracker.nativeapp;

import android.annotation.SuppressLint;
import android.graphics.Color;
import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import java.util.ArrayList;
import java.util.List;

/** Full-screen WebView — loads the same web dashboard UI as filed.videh.co.in. */
public class WebShellActivity extends AppCompatActivity {
    public static final String EXTRA_PATH = "path";
    public static final String EXTRA_TITLE = "title";
    private static final int REQ_RUNTIME = 4100;
    private static final int REQ_BACKGROUND = 4101;

    private WebView webView;
    private String apiBase;
    private int statusBarPx = 0;
    private int navBarPx = 0;

    private GeolocationPermissions.Callback pendingGeoCallback;
    private String pendingGeoOrigin;
    private PermissionRequest pendingWebPermissionRequest;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        LocaleHelper.apply(this);
        super.onCreate(savedInstanceState);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.parseColor("#0A1628"));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            getWindow().getDecorView().setSystemUiVisibility(0);
        }

        FrameLayout root = new FrameLayout(this);
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));
        setContentView(root);

        ViewCompat.setOnApplyWindowInsetsListener(root, (v, windowInsets) -> {
            Insets bars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
            statusBarPx = bars.top;
            navBarPx = bars.bottom;
            webView.setPadding(0, 0, 0, bars.bottom);
            pushInsetsToWeb();
            return windowInsets;
        });

        // Always load public domain in WebView (TLS + cookie + same fast face-api as website).
        apiBase = AppConfig.API_BASE;
        injectSessionCookie();

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        String ua = settings.getUserAgentString();
        if (ua != null && !ua.contains("AAPNative/")) {
            settings.setUserAgentString(ua + " AAPNative/1");
        }

        webView.addJavascriptInterface(new NativeAppBridge(this), "NativeAppBridge");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                view.evaluateJavascript("window.__PURE_NATIVE_APP__=true;", null);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                view.evaluateJavascript("window.__PURE_NATIVE_APP__=true;", null);
                injectPunchSecurityHook(view);
                pushInsetsToWeb();
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(
                    String origin,
                    GeolocationPermissions.Callback callback
            ) {
                if (LocationHelper.hasFineLocation(WebShellActivity.this)) {
                    callback.invoke(origin, true, false);
                    maybeRequestBackgroundLocation();
                    return;
                }
                pendingGeoCallback = callback;
                pendingGeoOrigin = origin;
                LocationHelper.requestLocationPermissions(WebShellActivity.this);
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                if (hasCameraPermission()) {
                    runOnUiThread(() -> request.grant(request.getResources()));
                    return;
                }
                pendingWebPermissionRequest = request;
                ActivityCompat.requestPermissions(
                        WebShellActivity.this,
                        new String[]{Manifest.permission.CAMERA},
                        REQ_RUNTIME
                );
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

        requestInitialPermissions();

        String path = getIntent().getStringExtra(EXTRA_PATH);
        if (path == null || path.isEmpty()) path = "/dashboard";
        webView.loadUrl(apiBase + path);
    }

    /** Called from JS bridge — location + camera + notifications. */
    public void requestAllPermissions() {
        requestInitialPermissions();
    }

    private void requestInitialPermissions() {
        List<String> needed = new ArrayList<>();
        if (!LocationHelper.hasFineLocation(this)) {
            needed.add(Manifest.permission.ACCESS_FINE_LOCATION);
            needed.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        }
        if (!hasCameraPermission()) {
            needed.add(Manifest.permission.CAMERA);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.POST_NOTIFICATIONS);
        }
        if (!needed.isEmpty()) {
            ActivityCompat.requestPermissions(this, needed.toArray(new String[0]), REQ_RUNTIME);
        } else {
            maybeRequestBackgroundLocation();
        }
    }

    private void maybeRequestBackgroundLocation() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                && LocationHelper.hasFineLocation(this)
                && !LocationHelper.hasBackgroundLocation(this)) {
            LocationHelper.requestBackgroundLocation(this);
        }
    }

    private boolean hasCameraPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                == PackageManager.PERMISSION_GRANTED;
    }

    public int getStatusBarHeightPx() {
        return statusBarPx > 0 ? statusBarPx : dpToPx(28);
    }

    public int getNavigationBarHeightPx() {
        return navBarPx;
    }

    private int dpToPx(int dp) {
        return Math.round(dp * getResources().getDisplayMetrics().density);
    }

    private void pushInsetsToWeb() {
        if (webView == null) return;
        int top = getStatusBarHeightPx();
        int bottom = navBarPx;
        String js = "document.documentElement.style.setProperty('--status-bar-height','" + top + "px');"
                + "document.documentElement.style.setProperty('--navigation-bar-height','" + bottom + "px');"
                + "document.body.classList.add('pure-native-app');"
                + "window.__PURE_NATIVE_APP__=true;";
        webView.evaluateJavascript(js, null);
    }

    /**
     * One punch-evidence report (server upserts 1 row/user/day). Does not block punch.
     */
    private void injectPunchSecurityHook(WebView view) {
        if (view == null) return;
        String js =
                "(function(){"
                        + "if(window.__ftPunchSecurityHook)return;"
                        + "window.__ftPunchSecurityHook=1;"
                        + "function ftSecReport(){"
                        + "try{"
                        + "if(!window.NativeAppBridge||!NativeAppBridge.getSecurityStatus)return;"
                        + "var s=JSON.parse(NativeAppBridge.getSecurityStatus());"
                        + "if(!s)return;"
                        + "var apps=[];"
                        + "if(s.vpnPackage)apps.push('VPN app: '+s.vpnPackage+(s.vpnActive?' (connected)':''));"
                        + "else if(s.vpn||s.vpnActive)apps.push('VPN connected on device');"
                        + "if(s.spoofPackage)apps.push('Fake GPS / spoof app: '+s.spoofPackage);"
                        + "else if(s.spoofApp||s.mockLikely)apps.push('Fake GPS / spoof app detected');"
                        + "if(!apps.length)return;"
                        + "var d='Apps at native punch-in: '+apps.join('; ')+'. Pakka device evidence — third-party app(s) on phone when punching in native app.';"
                        + "try{NativeAppBridge.reportSecurityEvent('punch_evidence','punch_evidence',d);}catch(e){}"
                        + "try{fetch('/api/attendance/security-event',{method:'POST',credentials:'include',keepalive:true,headers:{'Content-Type':'application/json','X-Client-Source':'native'},body:JSON.stringify({type:'punch_evidence',action:'punch_evidence',detail:d})});}catch(e){}"
                        + "}catch(e){}"
                        + "}"
                        + "var origFetch=window.fetch;"
                        + "window.fetch=function(input,init){"
                        + "var url=typeof input==='string'?input:(input&&input.url)||'';"
                        + "var method=((init&&init.method)||(typeof input!=='string'&&input&&input.method)||'GET').toUpperCase();"
                        + "if(method==='POST'&&/\\/api\\/attendance(\\/punch-out)?(\\?|$)/.test(url)){ftSecReport();}"
                        + "return origFetch.apply(this,arguments);"
                        + "};"
                        + "})();";
        view.evaluateJavascript(js, null);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_RUNTIME || requestCode == LocationHelper.REQ_LOCATION) {
            if (pendingGeoCallback != null) {
                if (LocationHelper.hasFineLocation(this)) {
                    pendingGeoCallback.invoke(pendingGeoOrigin, true, false);
                } else {
                    pendingGeoCallback.invoke(pendingGeoOrigin, false, false);
                }
                pendingGeoCallback = null;
                pendingGeoOrigin = null;
            }
            if (pendingWebPermissionRequest != null) {
                if (hasCameraPermission()) {
                    pendingWebPermissionRequest.grant(pendingWebPermissionRequest.getResources());
                } else {
                    pendingWebPermissionRequest.deny();
                }
                pendingWebPermissionRequest = null;
            }
            maybeRequestBackgroundLocation();
            pushInsetsToWeb();
        }
        if (requestCode == LocationHelper.REQ_BACKGROUND) {
            pushInsetsToWeb();
        }
    }

    private void injectSessionCookie() {
        String token = SessionStore.token(this);
        if (token == null || token.isEmpty()) return;
        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(webView, true);
        // Domain cookie — never pin session to Elastic IP host.
        cm.setCookie(AppConfig.API_BASE, "ft_user_session=" + token + "; Path=/; Secure; SameSite=Lax");
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
