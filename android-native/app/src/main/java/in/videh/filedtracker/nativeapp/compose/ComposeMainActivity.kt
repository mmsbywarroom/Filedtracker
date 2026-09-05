package `in`.videh.filedtracker.nativeapp.compose

import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import `in`.videh.filedtracker.nativeapp.LocaleHelper
import `in`.videh.filedtracker.nativeapp.SessionStore
import `in`.videh.filedtracker.nativeapp.WebShellActivity

/**
 * Compose login only. After OTP, open WebShell (web dashboard + client-side face punch).
 * Legacy HomeScreen / FaceScreen remain in the project but are not on the punch path.
 */
class ComposeMainActivity : AppCompatActivity() {

    override fun attachBaseContext(newBase: Context) {
        super.attachBaseContext(LocaleHelper.wrap(newBase))
    }

    private fun openWebDashboard() {
        val i = Intent(this, WebShellActivity::class.java)
        i.putExtra(WebShellActivity.EXTRA_PATH, "/dashboard")
        startActivity(i)
        finish()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (SessionStore.isLoggedIn(this)) {
            openWebDashboard()
            return
        }

        setContent {
            AapTheme {
                AapBackground {
                    val nav = rememberNavController()
                    NavHost(navController = nav, startDestination = Routes.LOGIN) {
                        composable(Routes.LOGIN) {
                            LoginScreen(onLoggedIn = { openWebDashboard() })
                        }
                    }
                }
            }
        }
    }
}

object Routes {
    const val LOGIN = "login"
    const val HOME = "home"
    const val MAP = "map"
    const val LEAVE = "leave"
    const val FOOTPRINTS = "footprints"
    const val FACE = "face/{mode}"

    /** [mode] is register / punch_in / punch_out / check. */
    fun face(mode: String) = "face/$mode"
}

/** Shared screen shell: brand header with back arrow, title and accent bar. */
@Composable
fun AapScreenScaffold(
    title: String,
    subtitle: String? = null,
    onBack: (() -> Unit)? = null,
    content: @Composable () -> Unit
) {
    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.statusBars)
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(start = 8.dp, end = 20.dp, top = 12.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            if (onBack != null) {
                IconButton(onClick = onBack) {
                    Icon(
                        Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = "Back",
                        tint = AapColors.TextPrimary
                    )
                }
            } else {
                Box(Modifier.size(12.dp))
            }
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.headlineSmall, color = AapColors.TextPrimary)
                if (subtitle != null) {
                    Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = AapColors.TextMuted)
                }
            }
            AapBrandMark(size = 38)
        }
        AapAccentBar(Modifier.padding(start = 20.dp, bottom = 10.dp))
        Box(Modifier.weight(1f)) { content() }
    }
}
