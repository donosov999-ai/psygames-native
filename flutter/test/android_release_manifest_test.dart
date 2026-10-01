import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// 🔴 РЕЛИЗНЫЙ МАНИФЕСТ ANDROID ДАЁТ ПРИЛОЖЕНИЮ СЕТЬ — ИНАЧЕ ПУСТОЙ ЭКРАН НА СТАРТЕ.
///
/// Веб-часть гибрида отдаётся своим сервером на 127.0.0.1 (lib/shell/asset_server.dart).
/// Android без `android.permission.INTERNET` запрещает и петлевой сокет. Разрешение стояло
/// только в src/debug и src/profile: `flutter run` работал, релиз 2.56.0 во внутреннем треке
/// Play падал «Failed to create server socket, errno = 1» (01.10.2026, раздел «Поиск»).
/// Итоговый манифест релиза = src/main + сборка, поэтому проверяем именно src/main.
void main() {
  test('src/main/AndroidManifest.xml объявляет INTERNET — сервер веб-части на 127.0.0.1', () {
    final manifest = File('android/app/src/main/AndroidManifest.xml').readAsStringSync();
    final code = manifest.replaceAll(RegExp(r'<!--.*?-->', dotAll: true), '');
    expect(code, contains('<uses-permission android:name="android.permission.INTERNET"/>'),
        reason: 'без INTERNET релизная сборка не поднимет AssetServer и стартует пустой');
  });

  test('каркас действительно слушает сокет — иначе проба выше сторожит пустое место', () {
    final server = File('lib/shell/asset_server.dart').readAsStringSync();
    expect(server, contains('HttpServer.bind'));
  });
}
