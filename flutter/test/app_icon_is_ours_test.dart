import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;

/// 🔴 ЗНАЧОК ПРИЛОЖЕНИЯ — НАШ МОЗГ, А НЕ ЛОГОТИП FLUTTER (задача 28848838).
///
/// 📍 Замер 01.10.2026: с переезда пилота в репозиторий (63049fd49, 23.09) в ios/, android/ и
/// macos/ лежал стандартный логотип Flutter — iOS 1024 байт в байт шаблон SDK (md5 c785f893).
/// С ним уехали 2.56.x в TestFlight и Google Play: сборка значки не создаёт, она берёт то, что
/// лежит в репозитории. Утверждённый значок (решение Дениса 18.09.2026) лежал рядом,
/// в `store/appstore/icon-1024-noalpha.png`, и в сборку не попадал.
///
/// Сторож сравнивает КАЖДЫЙ значок с исходником, уменьшенным до того же размера: средняя
/// разница по каналу ≤ 12 из 255. Логотип Flutter на белом даёт > 150 — промахнуться нельзя.
/// Пересобрать значки: `flutter/tool/gen_app_icons.sh`.
const _source = '../store/appstore/icon-1024-noalpha.png';
const _maxMeanDiff = 12.0;

double _meanDiff(img.Image a, img.Image b) {
  var sum = 0;
  for (var y = 0; y < a.height; y += 1) {
    for (var x = 0; x < a.width; x += 1) {
      final p = a.getPixel(x, y), q = b.getPixel(x, y);
      sum += (p.r - q.r).abs().toInt() + (p.g - q.g).abs().toInt() + (p.b - q.b).abs().toInt();
    }
  }
  return sum / (a.width * a.height * 3);
}

img.Image _read(String path) => img.decodePng(File(path).readAsBytesSync())!;

/// Значок обязан быть исходником в своём размере.
void _expectOurs(img.Image source, String path, {int? size}) {
  expect(File(path).existsSync(), isTrue, reason: '$path: значка нет');
  final icon = _read(path);
  if (size != null) expect([icon.width, icon.height], [size, size], reason: '$path: размер');
  final ref = img.copyResize(source, width: icon.width, height: icon.height, interpolation: img.Interpolation.average);
  final diff = _meanDiff(icon, ref);
  expect(diff, lessThanOrEqualTo(_maxMeanDiff),
      reason: '$path: не наш значок (средняя разница $diff из 255) — запусти flutter/tool/gen_app_icons.sh');
}

void main() {
  final source = _read(_source);

  test('исходник — утверждённый 1024×1024 без прозрачности (App Store не берёт альфу)', () {
    expect([source.width, source.height], [1024, 1024]);
    expect(source.hasAlpha, isFalse);
  });

  test('🔴 iOS: каждый значок набора AppIcon — наш', () {
    const dir = 'ios/Runner/Assets.xcassets/AppIcon.appiconset';
    final images = (jsonDecode(File('$dir/Contents.json').readAsStringSync())['images'] as List).cast<Map>();
    expect(images, isNotEmpty);
    for (final i in images) {
      final side = double.parse((i['size'] as String).split('x').first);
      final scale = int.parse((i['scale'] as String).replaceAll('x', ''));
      _expectOurs(source, '$dir/${i['filename']}', size: (side * scale).round());
    }
  });

  test('🔴 Android: значок лаунчера во всех плотностях и адаптивный слой — наши', () {
    const res = 'android/app/src/main/res';
    final manifest = File('android/app/src/main/AndroidManifest.xml').readAsStringSync();
    expect(manifest, contains('android:icon="@mipmap/ic_launcher"'));
    const dpi = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192};
    for (final e in dpi.entries) {
      _expectOurs(source, '$res/mipmap-${e.key}/ic_launcher.png', size: e.value);
      _expectOurs(source, '$res/drawable-${e.key}/ic_launcher_foreground.png');
    }
    // Android 8+: без адаптивного значка лаунчер кладёт квадрат в белый круг.
    final adaptive = File('$res/mipmap-anydpi-v26/ic_launcher.xml').readAsStringSync();
    expect(adaptive, contains('@drawable/ic_launcher_foreground'));
    expect(adaptive, contains('@color/ic_launcher_background'));
  });

  test('macOS: каждый значок набора AppIcon — наш', () {
    const dir = 'macos/Runner/Assets.xcassets/AppIcon.appiconset';
    final images = (jsonDecode(File('$dir/Contents.json').readAsStringSync())['images'] as List).cast<Map>();
    expect(images, isNotEmpty);
    for (final f in images.map((i) => i['filename'] as String).toSet()) {
      _expectOurs(source, '$dir/$f');
    }
  });
}
