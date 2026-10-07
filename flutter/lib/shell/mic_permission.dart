import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:webview_flutter_wkwebview/webview_flutter_wkwebview.dart';

/// 🎤 МИКРОФОН ДЛЯ ГОЛОСОВОЙ ЗАМЕТКИ В ОТЗЫВЕ (задача c092cd47, 07.10.2026).
///
/// Записывает страница (`services/voiceNote.ts`: getUserMedia + MediaRecorder), а WebView отдаёт ей
/// микрофон, только если оболочка это разрешила. 📍 Замер на APK 2.56.15: разрешения не было ни у
/// приложения (в манифесте нет RECORD_AUDIO), ни у WebView (запрос страницы молча отклонялся) — с
/// 2.56.0 голос пришёл в 0 отзывах из 13, на 2.54.22 — в 2 из 25.
///
/// Правила выдачи:
///   · только микрофон — запрос с камерой или чем-то ещё отклоняется целиком: страница камеру не просит;
///   · Android: сначала приложению (RECORD_AUDIO, окно системы — по нажатию «Записать голосом»,
///     не на старте), потом странице; отказ человека — отказ странице, она скажет «нет доступа»;
///   · iOS: окно системы показывает WebKit сам при захвате (нужна строка NSMicrophoneUsageDescription).
class MicPermission {
  MicPermission._();

  static const _channel = MethodChannel('psygames/mic');

  /// Спросить приложение (Android). Пробы подменяют.
  static Future<bool> Function() askApp = () async {
    try {
      return await _channel.invokeMethod<bool>('request') ?? false;
    } catch (_) {
      return false;
    }
  };

  /// Платформа запроса. Пробы подменяют.
  @visibleForTesting
  static TargetPlatform Function() platform = () => defaultTargetPlatform;

  /// Решение по запросу страницы.
  static Future<void> onRequest(PlatformWebViewPermissionRequest request) async {
    final types = request.types;
    if (types.length != 1 || !types.contains(WebViewPermissionResourceType.microphone)) {
      await request.deny();
      return;
    }
    final ok = platform() == TargetPlatform.android ? await askApp() : true;
    if (ok) {
      await request.grant();
    } else {
      await request.deny();
    }
  }

  /// Основная страница с голосом: микрофон по запросу страницы, звук и `AudioContext` без жеста —
  /// нажатия формы приходят из оболочки (`runJavaScript`), а не пальцем по странице, и без этого
  /// «Прослушать» и живая полоска уровня молчали бы. Чужая платформа (пробы) — обычный контроллер.
  static WebViewController pageController() {
    final PlatformWebViewControllerCreationParams params = WebViewPlatform.instance is WebKitWebViewPlatform
        ? WebKitWebViewControllerCreationParams(
            allowsInlineMediaPlayback: true,
            mediaTypesRequiringUserAction: const <PlaybackMediaTypes>{},
          )
        : const PlatformWebViewControllerCreationParams();
    final c = WebViewController.fromPlatformCreationParams(params);
    final p = c.platform;
    if (p is AndroidWebViewController) {
      p.setMediaPlaybackRequiresUserGesture(false);
      p.setOnPlatformPermissionRequest(onRequest);
    } else if (p is WebKitWebViewController) {
      p.setOnPlatformPermissionRequest(onRequest);
    }
    return c;
  }
}
