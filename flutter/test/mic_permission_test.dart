import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/mic_permission.dart';
import 'package:webview_flutter_platform_interface/webview_flutter_platform_interface.dart';

/// 🎤 ГОЛОС В ОТЗЫВЕ ДОХОДИТ ДО СТРАНИЦЫ (задача c092cd47).
///
/// 📍 Замер 07.10.2026 на APK 2.56.15: в манифесте нет RECORD_AUDIO, запрос страницы к микрофону WebView
/// молча отклонял — с 2.56.0 голос в 0 отзывах из 13. Здесь:
///   · решение по запросу страницы: только микрофон; Android — сначала приложению, отказ человека —
///     отказ странице; iOS — окно показывает WebKit; камера и смешанные запросы — отказ без вопросов;
///   · сторож носителей: разрешения в манифесте, строка Info.plist, канал MainActivity, основной WebView
///     создаётся с выдачей (`MicPermission.pageController`).
class _Req extends PlatformWebViewPermissionRequest {
  _Req(Set<WebViewPermissionResourceType> types) : super(types: types);
  String? out;
  @override
  Future<void> grant() async => out = 'grant';
  @override
  Future<void> deny() async => out = 'deny';
}

void main() {
  late Future<bool> Function() realAsk;
  var asked = 0;
  setUpAll(() => realAsk = MicPermission.askApp);
  tearDown(() {
    MicPermission.askApp = realAsk;
    MicPermission.platform = () => defaultTargetPlatform;
    asked = 0;
  });
  void answer(bool v) => MicPermission.askApp = () async {
    asked++;
    return v;
  };
  const mic = WebViewPermissionResourceType.microphone;
  const cam = WebViewPermissionResourceType.camera;

  test('🔴 Android: микрофон — сначала приложению; выдал — странице, отказал — отказ', () async {
    MicPermission.platform = () => TargetPlatform.android;
    answer(true);
    final yes = _Req({mic});
    await MicPermission.onRequest(yes);
    expect((yes.out, asked), ('grant', 1));
    answer(false);
    final no = _Req({mic});
    await MicPermission.onRequest(no);
    expect(no.out, 'deny');
  });

  test('iOS: микрофон — странице, окно системы показывает WebKit (приложение не спрашиваем)', () async {
    MicPermission.platform = () => TargetPlatform.iOS;
    answer(false);
    final r = _Req({mic});
    await MicPermission.onRequest(r);
    expect((r.out, asked), ('grant', 0));
  });

  test('🔴 камера и смешанный запрос — отказ без вопросов: страница камеру не просит', () async {
    MicPermission.platform = () => TargetPlatform.android;
    answer(true);
    for (final types in [
      {cam},
      {cam, mic},
    ]) {
      final r = _Req(types);
      await MicPermission.onRequest(r);
      expect(r.out, 'deny', reason: '$types');
    }
    expect(asked, 0);
  });

  test('🔴 носители: разрешения манифеста, строка Info.plist, канал MainActivity, основной WebView с выдачей', () {
    final manifest = File('android/app/src/main/AndroidManifest.xml').readAsStringSync();
    expect(manifest, contains('<uses-permission android:name="android.permission.RECORD_AUDIO"/>'));
    expect(manifest, contains('<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS"/>'));
    final plist = File('ios/Runner/Info.plist').readAsStringSync();
    final usage = RegExp(r'<key>NSMicrophoneUsageDescription</key>\s*<string>([^<]{20,})</string>').firstMatch(plist);
    expect(usage, isNotNull, reason: 'без строки iOS не даст микрофон (а захват без неё роняет приложение)');
    expect(RegExp('[А-Яа-яЁё]').hasMatch(usage!.group(1)!), isFalse, reason: 'английский — основной язык');
    final activity = File('android/app/src/main/kotlin/pro/psygames/psygames_flutter/MainActivity.kt').readAsStringSync();
    expect(activity, contains('"psygames/mic"'));
    expect(activity, contains('Manifest.permission.RECORD_AUDIO'));
    final app = File('lib/shell/hybrid_app.dart').readAsStringSync();
    expect(app, contains('_c = MicPermission.pageController()'));
  });
}
