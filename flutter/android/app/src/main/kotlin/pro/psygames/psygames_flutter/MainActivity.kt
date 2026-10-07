package pro.psygames.psygames_flutter

import android.Manifest
import android.content.pm.PackageManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

// Вибрация практик «Паузы» — плагин общего пакета practice_kit (PracticeKitPlugin):
// канал, фокус окна и арбитр мотора он ведёт сам.
//
// 🎤 Микрофон для голосовой заметки в отзыве (c092cd47): страница пишет сама (getUserMedia в WebView),
// а WebView получает микрофон, только если его выдали приложению. Спрашиваем по запросу страницы —
// то есть по нажатию «Записать голосом», не на старте (lib/shell/mic_permission.dart).
class MainActivity : FlutterActivity() {
    private var pendingMic: MethodChannel.Result? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "psygames/mic").setMethodCallHandler { call, result ->
            when (call.method) {
                "request" -> when {
                    checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED -> result.success(true)
                    pendingMic != null -> result.success(false) // окно уже открыто — второе не открываем
                    else -> {
                        pendingMic = result
                        requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), MIC_REQUEST)
                    }
                }
                else -> result.notImplemented()
            }
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != MIC_REQUEST) return
        val r = pendingMic ?: return
        pendingMic = null
        r.success(grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED)
    }

    private companion object {
        const val MIC_REQUEST = 4207
    }
}
