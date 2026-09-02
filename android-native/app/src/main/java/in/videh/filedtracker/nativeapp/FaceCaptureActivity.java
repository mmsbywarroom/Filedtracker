package in.videh.filedtracker.nativeapp;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.appcompat.app.AppCompatActivity;

public class FaceCaptureActivity extends AppCompatActivity {
    public static final String EXTRA_MODE = "mode";
    public static final String EXTRA_DESCRIPTOR_JSON = "descriptor_json";
    public static final String EXTRA_IMAGE = "image";

    private WebView webView;
    private String mode = DashboardActivity.MODE_PUNCH_IN;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_face_capture);

        mode = getIntent().getStringExtra(EXTRA_MODE);
        if (mode == null) mode = DashboardActivity.MODE_PUNCH_IN;

        webView = findViewById(R.id.faceWebView);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient());
        webView.addJavascriptInterface(new NativeFaceBridge(), "NativeFaceBridge");

        String apiBase = SessionStore.apiBase(this);
        String token = SessionStore.token(this);
        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setCookie(apiBase, "ft_user_session=" + token + "; Path=/; Secure");
        CookieManager.getInstance().flush();

        String url = apiBase + "/native-face?mode=" + (DashboardActivity.MODE_REGISTER.equals(mode) ? "register" : "verify");
        webView.loadUrl(url);
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
}
