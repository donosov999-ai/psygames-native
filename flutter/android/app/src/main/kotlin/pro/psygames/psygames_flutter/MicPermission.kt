package pro.psygames.psygames_flutter

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

// 🎤 Микрофон для голосовой заметки в отзыве (c092cd47): страница пишет сама (getUserMedia в WebView),
// а WebView получает микрофон, только если его выдали приложению. Спрашиваем по запросу страницы —
// то есть по нажатию «Записать голосом», не на старте (lib/shell/mic_permission.dart).
//
// Отдельным файлом, а не в MainActivity: канал к вибрации отношения не имеет, а сторож
// haptics_felt_strength_test держит MainActivity без своих каналов — копия вибрации живёт
// только в пакете practice_kit.
class MicPermission(private val activity: Activity) {
    private var pending: MethodChannel.Result? = null

    fun attach(engine: FlutterEngine) {
        MethodChannel(engine.dartExecutor.binaryMessenger, "psygames/mic").setMethodCallHandler { call, result ->
            when (call.method) {
                "request" -> when {
                    activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED -> result.success(true)
                    pending != null -> result.success(false) // окно уже открыто — второе не открываем
                    else -> {
                        pending = result
                        activity.requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQUEST)
                    }
                }
                else -> result.notImplemented()
            }
        }
    }

    /** Ответ окна разрешений; чужой запрос — мимо. */
    fun onResult(requestCode: Int, grantResults: IntArray) {
        if (requestCode != REQUEST) return
        val r = pending ?: return
        pending = null
        r.success(grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED)
    }

    private companion object {
        const val REQUEST = 4207
    }
}
