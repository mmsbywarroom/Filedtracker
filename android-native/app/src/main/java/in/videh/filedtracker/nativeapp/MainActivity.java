package in.videh.filedtracker.nativeapp;

import android.content.Intent;
import android.os.Bundle;

import androidx.appcompat.app.AppCompatActivity;

import in.videh.filedtracker.nativeapp.compose.ComposeMainActivity;

public class MainActivity extends AppCompatActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        LocaleHelper.apply(this);
        super.onCreate(savedInstanceState);
        // Jetpack Compose owns login, dashboard, map, leave and footprints — no WebView.
        startActivity(new Intent(this, ComposeMainActivity.class));
        finish();
    }
}
