package in.videh.filedtracker.nativeapp;

import android.content.Intent;
import android.os.Bundle;

import androidx.appcompat.app.AppCompatActivity;

import in.videh.filedtracker.nativeapp.compose.ComposeMainActivity;

/** Launcher → native Compose app (home + fast on-device face punch). */
public class MainActivity extends AppCompatActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        LocaleHelper.apply(this);
        super.onCreate(savedInstanceState);
        startActivity(new Intent(this, ComposeMainActivity.class));
        finish();
    }
}
