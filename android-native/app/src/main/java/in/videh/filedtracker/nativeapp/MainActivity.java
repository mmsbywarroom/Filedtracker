package in.videh.filedtracker.nativeapp;

import android.content.Intent;
import android.os.Bundle;

import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        LocaleHelper.apply(this);
        super.onCreate(savedInstanceState);
        if (SessionStore.isLoggedIn(this)) {
            startActivity(new Intent(this, WebShellActivity.class)
                    .putExtra(WebShellActivity.EXTRA_PATH, "/dashboard"));
        } else {
            startActivity(new Intent(this, WebShellActivity.class)
                    .putExtra(WebShellActivity.EXTRA_PATH, "/"));
        }
        finish();
    }
}
