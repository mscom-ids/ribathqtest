package `in`.ribath.mentor.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val PortalBlue = Color(0xFF2563EB)
val PortalIndigo = Color(0xFF4F46E5)
val AdminGreen = Color(0xFF1A3D2A)
val PortalBackground = Color(0xFFF5F8F5)
val MentorBackground = Color(0xFFF8FAFC)
val Slate900 = Color(0xFF0F172A)
val Slate600 = Color(0xFF475569)

private val LightColors = lightColorScheme(
    primary = PortalBlue, onPrimary = Color.White, secondary = PortalIndigo,
    background = MentorBackground, surface = Color.White, surfaceVariant = Color(0xFFF1F5F9),
    onSurface = Slate900, onSurfaceVariant = Slate600, outline = Color(0xFFE2E8F0),
)

@Composable
fun RibathTheme(content: @Composable () -> Unit) {
    // The current web portal ships a light responsive shell. Keep native colors
    // deterministic until the web dark palette is ported surface-by-surface.
    MaterialTheme(colorScheme = LightColors, content = content)
}
