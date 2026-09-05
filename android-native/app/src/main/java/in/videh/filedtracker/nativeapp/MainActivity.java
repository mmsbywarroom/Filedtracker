package in.videh.filedtracker.nativeapp;

import android.content.Intent;
import android.os.Bundle;

import androidx.appcompat.app.AppCompatActivity;

import in.videh.filedtracker.nativeapp.compose.ComposeMainActivity;

/**
 * Launcher: logged-in → WebShell (same fast web punch as the website).
 * Logged-out → Compose login only.
 */
public class MainActivity extends AppCompatActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        LocaleHelper.apply(this);
        super.onCreate(savedInstanceState);
        if (SessionStore.isLoggedIn(this)) {
            Intent i = new Intent(this, WebShellActivity.class);
            i.putExtra(WebShellActivity.EXTRA_PATH, "/dashboard");
            startActivity(i);
        } else {
            startActivity(new Intent(this, ComposeMainActivity.class));
        }
        finish();
    }
}
