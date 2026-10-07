package pro.psygames.practice_kit

import android.app.Activity
import android.app.Application
import android.os.Bundle
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.embedding.engine.plugins.activity.ActivityAware
import io.flutter.embedding.engine.plugins.activity.ActivityPluginBinding
import io.flutter.plugin.common.MethodChannel

/** Канал вибрации практик: `pro.psygames.practice_kit/haptics`. Фокус окна ведёт сам. */
class PracticeKitPlugin : FlutterPlugin, ActivityAware {
    private var channel: MethodChannel? = null
    private var activity: Activity? = null
    private val lifecycle = object : Application.ActivityLifecycleCallbacks {
        override fun onActivityResumed(a: Activity) { if (a === activity) PracticeKitHaptics.foreground(true) }
        override fun onActivityPaused(a: Activity) { if (a === activity) PracticeKitHaptics.foreground(false) }
        override fun onActivityCreated(a: Activity, b: Bundle?) {}
        override fun onActivityStarted(a: Activity) {}
        override fun onActivityStopped(a: Activity) {}
        override fun onActivitySaveInstanceState(a: Activity, b: Bundle) {}
        override fun onActivityDestroyed(a: Activity) {}
    }

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        PracticeKitHaptics.initialize(binding.applicationContext)
        channel = MethodChannel(binding.binaryMessenger, "pro.psygames.practice_kit/haptics").also {
            it.setMethodCallHandler { call, result -> PracticeKitHaptics.handle(call, result) }
        }
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        channel?.setMethodCallHandler(null)
        channel = null
        PracticeKitHaptics.stop()
    }

    private fun attach(binding: ActivityPluginBinding) {
        activity = binding.activity
        binding.activity.application.registerActivityLifecycleCallbacks(lifecycle)
        PracticeKitHaptics.foreground(true)
    }

    private fun detach() {
        activity?.application?.unregisterActivityLifecycleCallbacks(lifecycle)
        activity = null
        PracticeKitHaptics.foreground(false)
    }

    override fun onAttachedToActivity(binding: ActivityPluginBinding) = attach(binding)
    override fun onReattachedToActivityForConfigChanges(binding: ActivityPluginBinding) = attach(binding)
    override fun onDetachedFromActivityForConfigChanges() = detach()
    override fun onDetachedFromActivity() = detach()
}
