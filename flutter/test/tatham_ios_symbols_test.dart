import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// КАЖДЫЙ ЭКСПОРТ ДВИЖКА ПЕРЕЧИСЛЕН В ЛИНКОВКЕ iOS.
///
/// 🔴 ЧТО ЛОВИТ И ПОЧЕМУ ЭТОГО НЕ ВИДНО ИНАЧЕ. На iOS движок Тэтхэма вшивается
/// статически, а Dart ищет его символы ПО ИМЕНИ уже в рантайме
/// (`DynamicLibrary.process()`). Линкер про это не знает: на символы никто не
/// ссылается из Swift, и `DEAD_CODE_STRIPPING` выбрасывает их обратно даже при
/// `-force_load`. Лечится флагом `-Wl,-u,<символ>` на КАЖДЫЙ экспорт — он делает
/// символ корнем линковки.
///
/// Отсюда беда: забыл дописать флаг для нового экспорта — сборка ЗЕЛЁНАЯ,
/// размер правдоподобный, и пропадает не всё приложение, а отдельные режимы из
/// сорока двух. Увидеть это можно только на устройстве, открыв именно тот режим.
///
/// 📍 Замер чата «Шахматы» 23.09.2026 на том же классе дефекта: `-force_load`
/// стоял, `.a` содержал символ, бинарник вышел 294 КБ вообще без движка. С
/// флагами `-u` тот же бинарник — 993 КБ.
///
/// ⚠️ ЧЕГО ПРОБА НЕ ЛОВИТ. Она сверяет СПИСОК с исходником моста, а не с готовым
/// бинарником: на бегунке без Xcode и без сборки под устройство иначе нельзя.
/// Готовый `.app` проверяет `tool/check_ios_engine.sh` — его гоняют после
/// `flutter build ipa`, и он смотрит настоящую таблицу символов.
void main() {
  test('🔴 все экспорты psy_* моста перечислены в -Wl,-u обоих xcconfig', () {
    // 🔴 СПИСОК БЕРЁТСЯ ИЗ ТОГО, ЧТО РЕАЛЬНО ИЩЕТ DART, а не из моста.
    // Замер 23.09.2026: в мосте 26 экспортов, а Dart зовёт 15 — среди остальных
    // `psy_midend_statepos`, служебная заплата канона, которую никто не ищет по
    // имени. Сверять с мостом значило бы требовать флаги для символов, без
    // которых приложение прекрасно живёт, и приучать обходить пробу.
    // Договор здесь — `lookupFunction` в engine.dart: что Dart ищет, то и
    // обязано пережить линковку.
    final engine = File('lib/games/puzzles/engine.dart');
    if (!engine.existsSync()) {
      markTestSkipped('нет engine.dart — прогон вне дерева');
      return;
    }
    // ⚠️ Ищем просто строковые литералы `'psy_…'`, а не разбираем вызов целиком:
    // `lookupFunction` пишется в несколько строк, и шаблон по одной строке нашёл
    // 9 символов из 15 — то есть тихо разрешил бы шести пропасть. Имена psy_* в
    // этом файле встречаются ТОЛЬКО как имена для поиска, так что проще — точнее.
    final exports = RegExp(r"'(psy_[a-z_0-9]+)'")
        .allMatches(engine.readAsStringSync())
        .map((m) => m.group(1)!)
        .toSet();
    expect(exports.length, greaterThan(10),
        reason: 'символов, которые ищет Dart, нашлось подозрительно мало — '
            'сломался разбор, а не движок');

    for (final name in ['ios/Flutter/Release.xcconfig', 'ios/Flutter/Debug.xcconfig']) {
      final cfg = File(name);
      expect(cfg.existsSync(), isTrue, reason: '$name пропал — линковка движка не описана');
      final text = cfg.readAsStringSync();
      final listed = RegExp(r'-Wl,-u,_(psy_[a-z_0-9]+)')
          .allMatches(text)
          .map((m) => m.group(1)!)
          .toSet();
      final missing = exports.difference(listed);
      expect(
        missing,
        isEmpty,
        reason: '$name: у этих экспортов нет флага -Wl,-u — на устройстве пропадут '
            'соответствующие режимы, а сборка останется зелёной:\n  ${missing.join(", ")}',
      );
    }
  });

  test('обе сборки — устройство и симулятор — грузят архив', () {
    final text = File('ios/Flutter/Release.xcconfig').readAsStringSync();
    expect(text, contains('sdk=iphoneos*'), reason: 'устройство');
    expect(text, contains('sdk=iphonesimulator*'), reason: 'симулятор');
    expect(text, contains('-force_load'));
    // Без non-global релиз зачистит таблицу символов, и lookup по имени не найдёт ничего.
    expect(text, contains('STRIP_STYLE=non-global'));
  });
}
