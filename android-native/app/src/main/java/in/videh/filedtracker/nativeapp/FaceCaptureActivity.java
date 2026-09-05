package in.videh.filedtracker.nativeapp;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

/**
 * On-device face-api (same as website) — returns descriptor to native punch/register.
 * Avoids slow server /api/face/describe.
 */
public class FaceCaptureActivity extends AppCompatActivity {
    public static final String EXTRA_MODE = "mode";
    public static final String EXTRA_DESCRIPTOR_JSON = "descriptor_json";
    public static final String EXTRA_IMAGE = "image";
    private static final int REQ_CAMERA = 4201;

    private WebView webView;
    private String mode = DashboardActivity.MODE_PUNCH_IN;
    private PermissionRequest pendingCameraRequest;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_face_capture);

        mode = getIntent().getStringExtra(EXTRA_MODE);
        if (mode == null) mode = DashboardActivity.MODE_PUNCH_IN;

        webView = findViewById(R.id.faceWebView);
        webView.setBackgroundColor(Color.parseColor("#0A1628"));
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        String ua = settings.getUserAgentString();
        if (ua != null && !ua.contains("AAPNative/")) {
            settings.setUserAgentString(ua + " AAPNative/1");
        }
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                if (hasCamera()) {
                    runOnUiThread(() -> request.grant(request.getResources()));
                    return;
                }
                pendingCameraRequest = request;
                ActivityCompat.requestPermissions(
                        FaceCaptureActivity.this,
                        new String[]{Manifest.permission.CAMERA},
                        REQ_CAMERA
                );
            }
        });
        webView.addJavascriptInterface(new NativeFaceBridge(), "NativeFaceBridge");

        String apiBase = AppConfig.API_BASE;
        String token = SessionStore.token(this);
        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(webView, true);
        if (token != null && !token.isEmpty()) {
            cm.setCookie(apiBase, "ft_user_session=" + token + "; Path=/; Secure; SameSite=Lax");
            cm.flush();
        }

        if (!hasCamera()) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
        }

        String faceMode = DashboardActivity.MODE_REGISTER.equals(mode) ? "register" : "verify";
        webView.loadUrl(apiBase + "/native-face?mode=" + faceMode);
    }

    private boolean hasCamera() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQ_CAMERA) return;
        boolean ok = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        if (pendingCameraRequest != null) {
            if (ok) pendingCameraRequest.grant(pendingCameraRequest.getResources());
            else pendingCameraRequest.deny();
            pendingCameraRequest = null;
        }
        if (ok && webView != null) {
            webView.reload();
        }
    }

    private class NativeFaceBridge {
        @JavascriptInterface
        public void onFaceCaptured(String descriptorJson, String image) {
            runOnUiThread(() -> {
                Intent data = new Intent();
                data.putExtra(EXTRA_MODE, mode);
                data.putExtra(EXTRA_DESCRIPTOR_JSON, descriptorJson);
                data.putExtra(EXTRA_IMAGE, image);
                setResult(RESULT_OK, data);
                finish();
            });
        }

        @JavascriptInterface
        public void onFaceCancel() {
            runOnUiThread(() -> {
                setResult(RESULT_CANCELED);
                finish();
            });
        }

        @JavascriptInterface
        public void onFaceError(String message) {
            runOnUiThread(() -> {
                setResult(RESULT_CANCELED);
                finish();
            });
        }
    }

    @Override
    public void onBackPressed() {
        setResult(RESULT_CANCELED);
        finish();
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
