package in.videh.filedtracker.nativeapp;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.appcompat.app.AppCompatActivity;

public class WebShellActivity extends AppCompatActivity {
    public static final String EXTRA_PATH = "path";
    public static final String EXTRA_TITLE = "title";

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        LocaleHelper.apply(this);
        super.onCreate(savedInstanceState);
        WebView webView = new WebView(this);
        setContentView(webView);
        String title = getIntent().getStringExtra(EXTRA_TITLE);
        if (title != null) setTitle(title);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient());

        String apiBase = SessionStore.apiBase(this);
        String token = SessionStore.token(this);
        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setCookie(apiBase, "ft_user_session=" + token + "; Path=/; Secure");
        CookieManager.getInstance().flush();

        String path = getIntent().getStringExtra(EXTRA_PATH);
        if (path == null) path = "/dashboard";
        webView.loadUrl(apiBase + path);
    }
}
