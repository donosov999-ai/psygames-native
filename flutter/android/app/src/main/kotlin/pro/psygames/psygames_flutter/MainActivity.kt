package pro.psygames.psygames_flutter

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        // Вибросопровождение практик «Паузы»: удержание Кегеля, сигналы смены шага.
        PracticeHaptics.initialize(applicationContext)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "pro.psygames/practiceHaptics")
            .setMethodCallHandler { call, result -> PracticeHaptics.handle(call, result) }
    }

    override fun onResume() {
        super.onResume()
        PracticeHaptics.foreground(true)
    }

    override fun onPause() {
        PracticeHaptics.foreground(false)
        super.onPause()
    }
}
