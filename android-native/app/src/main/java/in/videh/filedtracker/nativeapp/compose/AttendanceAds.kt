package `in`.videh.filedtracker.nativeapp.compose

import android.app.Activity
import android.content.Context
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.AdSize
import com.google.android.gms.ads.AdView
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.MobileAds
import com.google.android.gms.ads.appopen.AppOpenAd
import com.google.android.gms.ads.interstitial.InterstitialAd
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback

/**
 * AdMob placements. Attendance location, face photos, and phone numbers are not sent to ads.
 */
object AttendanceAds {
    const val APP_OPEN = "ca-app-pub-4202216262080559/5210739237"
    const val PUNCH_IN = "ca-app-pub-4202216262080559/7342078556"
    const val PUNCH_OUT = "ca-app-pub-4202216262080559/5274318411"
    const val BANNER = "ca-app-pub-4202216262080559/7645330882"

    @Volatile
    var punchFlow = false

    private var started = false
    private var resumedActivity: Activity? = null
    private var appOpenAd: AppOpenAd? = null
    private var appOpenLoading = false
    private var appOpenShown = false
    private var fullScreenVisible = false
    private var punchInAd: InterstitialAd? = null
    private var punchOutAd: InterstitialAd? = null
    private var punchInLoading = false
    private var punchOutLoading = false

    fun start(context: Context) {
        if (started) return
        started = true
        val app = context.applicationContext
        MobileAds.initialize(app)
        loadAppOpen(app)
        loadPunch(app, punchIn = true)
        loadPunch(app, punchIn = false)
    }

    fun onActivityStarted(activity: Activity) {
        resumedActivity = activity
        showAppOpen(activity)
    }

    fun onActivityStopped(activity: Activity) {
        if (resumedActivity == activity) resumedActivity = null
    }

    /** One video when the app is opened. Skipped during punch so it does not stack on the punch video. */
    fun showAppOpen(activity: Activity) {
        if (appOpenShown || punchFlow || fullScreenVisible) return
        val ad = appOpenAd
        if (ad == null) {
            loadAppOpen(activity.applicationContext)
            return
        }
        appOpenAd = null
        fullScreenVisible = true
        ad.fullScreenContentCallback = object : FullScreenContentCallback() {
            override fun onAdDismissedFullScreenContent() {
                fullScreenVisible = false
                appOpenShown = true
                loadAppOpen(activity.applicationContext)
            }

            override fun onAdFailedToShowFullScreenContent(error: com.google.android.gms.ads.AdError) {
                fullScreenVisible = false
                appOpenShown = true
                loadAppOpen(activity.applicationContext)
            }

            override fun onAdShowedFullScreenContent() {
                appOpenShown = true
            }
        }
        ad.show(activity)
    }

    fun showPunch(activity: Activity?, punchIn: Boolean, onFinished: () -> Unit) {
        val ad = if (punchIn) punchInAd else punchOutAd
        if (activity == null || ad == null || fullScreenVisible) {
            if (punchIn) punchInAd = null else punchOutAd = null
            loadPunch(activity?.applicationContext, punchIn)
            onFinished()
            return
        }
        if (punchIn) punchInAd = null else punchOutAd = null
        fullScreenVisible = true
        ad.fullScreenContentCallback = object : FullScreenContentCallback() {
            override fun onAdDismissedFullScreenContent() {
                fullScreenVisible = false
                loadPunch(activity.applicationContext, punchIn)
                onFinished()
            }

            override fun onAdFailedToShowFullScreenContent(error: com.google.android.gms.ads.AdError) {
                fullScreenVisible = false
                loadPunch(activity.applicationContext, punchIn)
                onFinished()
            }
        }
        ad.show(activity)
    }

    private fun loadAppOpen(context: Context?) {
        if (context == null || appOpenLoading || appOpenAd != null) return
        appOpenLoading = true
        AppOpenAd.load(
            context,
            APP_OPEN,
            AdRequest.Builder().build(),
            object : AppOpenAd.AppOpenAdLoadCallback() {
                override fun onAdLoaded(ad: AppOpenAd) {
                    appOpenLoading = false
                    appOpenAd = ad
                    resumedActivity?.let { showAppOpen(it) }
                }

                override fun onAdFailedToLoad(error: LoadAdError) {
                    appOpenLoading = false
                }
            }
        )
    }

    private fun loadPunch(context: Context?, punchIn: Boolean) {
        if (context == null) return
        if (punchIn) {
            if (punchInLoading || punchInAd != null) return
            punchInLoading = true
        } else {
            if (punchOutLoading || punchOutAd != null) return
            punchOutLoading = true
        }
        InterstitialAd.load(
            context,
            if (punchIn) PUNCH_IN else PUNCH_OUT,
            AdRequest.Builder().build(),
            object : InterstitialAdLoadCallback() {
                override fun onAdLoaded(ad: InterstitialAd) {
                    if (punchIn) {
                        punchInLoading = false
                        punchInAd = ad
                    } else {
                        punchOutLoading = false
                        punchOutAd = ad
                    }
                }

                override fun onAdFailedToLoad(error: LoadAdError) {
                    if (punchIn) punchInLoading = false else punchOutLoading = false
                }
            }
        )
    }
}

@Composable
fun ScreenBanner(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    AndroidView(
        modifier = modifier.fillMaxWidth().navigationBarsPadding(),
        factory = { ctx ->
            val widthDp = (ctx.resources.displayMetrics.widthPixels / ctx.resources.displayMetrics.density).toInt()
            AdView(ctx).apply {
                setAdSize(AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(ctx, widthDp))
                adUnitId = AttendanceAds.BANNER
                loadAd(AdRequest.Builder().build())
            }
        }
    )
}
