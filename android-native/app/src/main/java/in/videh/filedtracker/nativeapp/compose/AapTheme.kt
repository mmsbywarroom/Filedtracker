package `in`.videh.filedtracker.nativeapp.compose

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Surface
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import `in`.videh.filedtracker.nativeapp.R

/** AAP brand palette — navy base, yellow call-to-action, blue accents. */
object AapColors {
    val Navy = Color(0xFF0A1628)
    val NavyDeep = Color(0xFF060F1C)
    val NavySurface = Color(0xFF122340)
    val NavyCard = Color(0xFF16294A)
    val Yellow = Color(0xFFFFD100)
    val YellowDim = Color(0xFFE0B800)
    val Blue = Color(0xFF1A56C4)
    val BlueSoft = Color(0xFF2E6BE0)
    val TextPrimary = Color(0xFFF4F7FC)
    val TextMuted = Color(0xFF9BAAC4)
    val Success = Color(0xFF2ECC8F)
    val Danger = Color(0xFFFF5C5C)
    val Outline = Color(0x33FFFFFF)
}

private val AapDarkScheme = darkColorScheme(
    primary = AapColors.Yellow,
    onPrimary = AapColors.Navy,
    primaryContainer = AapColors.YellowDim,
    onPrimaryContainer = AapColors.Navy,
    secondary = AapColors.Blue,
    onSecondary = Color.White,
    secondaryContainer = AapColors.BlueSoft,
    onSecondaryContainer = Color.White,
    tertiary = AapColors.BlueSoft,
    onTertiary = Color.White,
    background = AapColors.Navy,
    onBackground = AapColors.TextPrimary,
    surface = AapColors.NavySurface,
    onSurface = AapColors.TextPrimary,
    surfaceVariant = AapColors.NavyCard,
    onSurfaceVariant = AapColors.TextMuted,
    outline = AapColors.Outline,
    error = AapColors.Danger,
    onError = Color.White
)

private val AapTypography = Typography(
    displaySmall = TextStyle(fontSize = 32.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.5).sp),
    headlineMedium = TextStyle(fontSize = 26.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.3).sp),
    headlineSmall = TextStyle(fontSize = 21.sp, fontWeight = FontWeight.SemiBold),
    titleLarge = TextStyle(fontSize = 19.sp, fontWeight = FontWeight.SemiBold),
    titleMedium = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 15.sp, fontWeight = FontWeight.Normal, lineHeight = 22.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.Normal, lineHeight = 20.sp),
    labelLarge = TextStyle(fontSize = 15.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.4.sp),
    labelMedium = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.6.sp)
)

private val AapShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(18.dp),
    large = RoundedCornerShape(24.dp),
    extraLarge = RoundedCornerShape(32.dp)
)

@Composable
fun AapTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = AapDarkScheme,
        typography = AapTypography,
        shapes = AapShapes,
        content = content
    )
}

/**
 * Full-bleed brand background: navy gradient plus two soft brand glows so screens
 * never read as an empty dark void.
 */
@Composable
fun AapBackground(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit
) {
    Surface(modifier = modifier.fillMaxSize(), color = AapColors.Navy) {
        Box(
            Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        listOf(AapColors.NavyDeep, AapColors.Navy, Color(0xFF0D1D35))
                    )
                )
        ) {
            Box(
                Modifier
                    .fillMaxSize()
                    .background(
                        Brush.radialGradient(
                            colors = listOf(AapColors.Blue.copy(alpha = 0.28f), Color.Transparent),
                            center = Offset(120f, 80f),
                            radius = 900f
                        )
                    )
            )
            Box(
                Modifier
                    .fillMaxSize()
                    .background(
                        Brush.radialGradient(
                            colors = listOf(AapColors.Yellow.copy(alpha = 0.10f), Color.Transparent),
                            center = Offset(1000f, 1900f),
                            radius = 800f
                        )
                    )
            )
            content()
        }
    }
}

/** Official AAP broom logo (drawable/aap_logo.png). Wide mark — not a square tile. */
@Composable
fun AapBrandMark(modifier: Modifier = Modifier, size: Int = 56) {
    val width = (size * 2.35f).dp
    val height = size.dp
    Image(
        painter = painterResource(id = R.drawable.aap_logo),
        contentDescription = "Aam Aadmi Party",
        modifier = modifier
            .width(width)
            .height(height),
        contentScale = ContentScale.Fit
    )
}

/** Yellow / blue / navy tri-bar used as a subtle brand accent. */
@Composable
fun AapAccentBar(modifier: Modifier = Modifier) {
    Row(
        modifier = modifier.clip(RoundedCornerShape(3.dp)),
        horizontalArrangement = Arrangement.spacedBy(3.dp)
    ) {
        Box(Modifier.size(width = 26.dp, height = 4.dp).background(AapColors.Yellow))
        Box(Modifier.size(width = 14.dp, height = 4.dp).background(AapColors.Blue))
        Box(Modifier.size(width = 8.dp, height = 4.dp).background(AapColors.TextMuted.copy(alpha = 0.5f)))
    }
}

/** Rounded 24dp brand card used across every screen. */
@Composable
fun AapCard(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(24.dp),
        color = AapColors.NavyCard.copy(alpha = 0.85f),
        tonalElevation = 2.dp,
        shadowElevation = 6.dp
    ) {
        Box(Modifier.padding(18.dp)) { content() }
    }
}
