package `in`.videh.filedtracker.nativeapp.compose

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
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import `in`.videh.filedtracker.nativeapp.LocaleHelper
import `in`.videh.filedtracker.nativeapp.SessionStore

/** Single Compose host for the whole field app — no WebView anywhere in this graph. */
class ComposeMainActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        LocaleHelper.apply(this)
        super.onCreate(savedInstanceState)

        val startDestination = if (SessionStore.isLoggedIn(this)) Routes.HOME else Routes.LOGIN

        setContent {
            AapTheme {
                AapBackground {
                    val nav = rememberNavController()
                    NavHost(navController = nav, startDestination = startDestination) {
                        composable(Routes.LOGIN) {
                            LoginScreen(
                                onLoggedIn = {
                                    nav.navigate(Routes.HOME) {
                                        popUpTo(Routes.LOGIN) { inclusive = true }
                                    }
                                }
                            )
                        }
                        composable(Routes.HOME) {
                            HomeScreen(
                                onOpen = { route -> nav.navigate(route) },
                                onLoggedOut = {
                                    nav.navigate(Routes.LOGIN) {
                                        popUpTo(0) { inclusive = true }
                                    }
                                }
                            )
                        }
                        composable(Routes.MAP) { MapScreen(onBack = { nav.popBackStack() }) }
                        composable(Routes.LEAVE) { LeaveScreen(onBack = { nav.popBackStack() }) }
                        composable(Routes.FOOTPRINTS) { FootprintsScreen(onBack = { nav.popBackStack() }) }
                        composable(
                            Routes.FACE,
                            arguments = listOf(navArgument("mode") { type = NavType.StringType })
                        ) { entry ->
                            FaceScreen(
                                mode = entry.arguments?.getString("mode") ?: FACE_MODE_CHECK,
                                onBack = { nav.popBackStack() },
                                onFinished = { descriptorJson, image, mode ->
                                    FaceResultBus.pending = FaceResult(descriptorJson, image, mode)
                                    nav.popBackStack()
                                }
                            )
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
