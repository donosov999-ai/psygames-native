package pro.psygames.psygames_flutter

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine

// Вибрация практик «Паузы» — плагин общего пакета practice_kit (PracticeKitPlugin):
// канал, фокус окна и арбитр мотора он ведёт сам.
//
// 🎤 Микрофон для голосовой заметки в отзыве — MicPermission.kt.
class MainActivity : FlutterActivity() {
    private val mic = MicPermission(this)

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        mic.attach(flutterEngine)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        mic.onResult(requestCode, grantResults)
    }
}
