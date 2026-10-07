package pro.psygames.practice_kit

import android.content.Context
import android.media.AudioAttributes
import android.os.Build
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

/**
 * Вибрация практик — общая для PsyGames и «Умного будильника» (пакет practice_kit).
 * Арбитр: практика не имеет права гасить или перебивать звонящий будильник —
 * будильник зовёт [alarmStarted] / [alarmStopped].
 */
object PracticeKitHaptics {
    private var vibrator: Vibrator? = null
    private var ownedUntil = 0L
    private var alarm = false
    private var foreground = false

    fun initialize(context: Context) {
        @Suppress("DEPRECATION")
        vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }

    fun foreground(value: Boolean) {
        foreground = value
        if (!value) stop()
    }

    fun alarmStarted() {
        stop() // Before the alarm claims the motor.
        alarm = true
    }

    fun alarmStopped() { alarm = false }

    fun stop() {
        if (!alarm && SystemClock.uptimeMillis() < ownedUntil) vibrator?.cancel()
        ownedUntil = 0L
    }

    fun handle(call: MethodCall, result: MethodChannel.Result) {
        val target = vibrator
        val supported = target?.hasVibrator() == true
        val amplitude = supported && Build.VERSION.SDK_INT >= 26 && target!!.hasAmplitudeControl()
        if (call.method == "capabilities") {
            result.success(mapOf("supported" to supported, "continuous" to amplitude)); return
        }
        if (call.method == "stop") { stop(); result.success(null); return }
        if (call.method != "play") { result.notImplemented(); return }
        stop()
        if (!supported || alarm || !foreground) { result.success(null); return }
        val continuous = call.argument<Boolean>("continuous") == true && amplitude
        val duration = if (continuous) (call.argument<Number>("durationMs")?.toLong() ?: 60L).coerceIn(1, 30000) else 35L
        val strength = (call.argument<Number>("strength")?.toDouble() ?: .8).coerceIn(.1, 1.0)
        val doubleCue = !continuous && call.argument<Number>("count")?.toInt() == 2
        try {
            val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION).build()
            if (Build.VERSION.SDK_INT >= 26) {
                val effect = if (doubleCue) {
                    val amp = if (amplitude) (strength * 255).toInt().coerceAtLeast(1) else VibrationEffect.DEFAULT_AMPLITUDE
                    VibrationEffect.createWaveform(longArrayOf(0, 35, 125, 35), intArrayOf(0, amp, 0, amp), -1)
                } else if (!amplitude && Build.VERSION.SDK_INT >= 29) {
                    VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK)
                } else VibrationEffect.createOneShot(duration,
                    if (amplitude) (strength * 255).toInt().coerceAtLeast(1) else VibrationEffect.DEFAULT_AMPLITUDE)
                target!!.vibrate(effect, attributes)
            } else {
                @Suppress("DEPRECATION")
                if (doubleCue) target!!.vibrate(longArrayOf(0, 35, 125, 35), -1, attributes)
                else target!!.vibrate(duration, attributes)
            }
            ownedUntil = SystemClock.uptimeMillis() + if (doubleCue) 250L else if (amplitude) duration else 100L
            result.success(null)
        } catch (e: RuntimeException) {
            ownedUntil = 0L
            result.error("haptics_unavailable", "Haptics unavailable", null)
        }
    }
}
