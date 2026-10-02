import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ШАГ ЗАРЯДКИ НАЧИНАЕТСЯ САМ — БЕЗ «НАЧАТЬ».
///
/// Отчёт Дениса 01.10.2026, TestFlight 2.56.1: «утренняя зарядка почему сама не
/// запускается как раньше? каждое упражнение надо вручную». Живой прогон на
/// эмуляторе той же сборки: мост зарядки уводит на следующую игру сам («Starting
/// in 4…»), но «Объём цифр» открывается кнопкой «Начать» и стоит.
///
/// Причина — потеря при переносе. В вебе каждая такая игра на шаге зарядки
/// начинала сама: `const { autostart } = useGamePreset()` (digit-span, schulte,
/// stroop, flanker, corsi, simon, go-no-go, math-sprint, quick-count, picture-pairs
/// и другие). Перенос сохранил это у 17 нативных игр из 43 с кнопкой старта.
///
/// ⚠️ Мерится ПОВЕДЕНИЕ: экран поднимается так, как его открывает шаг зарядки
/// (`GamePreset` с `wu=1`, как ставит `_openNative`), и на нём не должно остаться
/// кнопки «Начать». Список игр — из самих составов зарядок
/// (`frontend/src/constants/defaultPlaylists.json`): новая игра в составе попадает
/// под пробу сама, держать список руками не нужно.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    await L.load('ru');
    // Игры со звуком («Объём на слух», #114) создают системный голос, а он — плеер just_audio.
    // Конструктор плеера сразу зовёт платформенный `disposeAllPlayers`; в пробе платформы нет,
    // и MissingPluginException прилетает АСИНХРОННО — валит пробу по времени, а не по делу.
    // На Linux CI она успевала уйти после конца пробы, на macOS-сборке TestFlight 2.56.5 — нет
    // (02.10.2026). Отвечаем пустым ответом: проба про кнопку «Начать», не про звук.
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
        const MethodChannel('com.ryanheise.just_audio.methods'),
        (call) async => call.method == 'init' ? null : <String, dynamic>{});
  });
  tearDown(GamePreset.clear);

  /// Адреса шагов зарядок — те, что ведут в нативную игру.
  Set<String> warmupRoutes() {
    final raw = File('${Directory.current.path}/../frontend/src/constants/defaultPlaylists.json').readAsStringSync();
    final out = <String>{};
    void walk(Object? x) {
      if (x is Map) {
        final r = x['game_route'];
        if (r is String) out.add(r.split('?').first);
        x.values.forEach(walk);
      } else if (x is List) {
        x.forEach(walk);
      }
    }

    walk(jsonDecode(raw));
    return out;
  }

  testWidgets('🔴 нативная игра на шаге зарядки начинает сама — кнопки «Начать» нет', (tester) async {
    SharedPreferences.setMockInitialValues({'psygames_active_profile': 'nzt48'});
    final state = await SharedState.open();
    final routes = warmupRoutes().where(HybridApp.native.containsKey).toList()..sort();
    expect(routes.length, greaterThan(40), reason: 'составы зарядок не прочитаны: ${routes.length}');

    final waits = <String>[];
    final broke = <String, String>{};
    for (final route in routes) {
      GamePreset.set({'wu': '1'});
      try {
        await tester.runAsync(() async {
          await tester.pumpWidget(MaterialApp(home: HybridApp.native[route]!(state)));
          // Экран грузит уровень из хранилища — даём ему подняться.
          for (var i = 0; i < 20; i++) {
            await tester.pump(const Duration(milliseconds: 30));
            await Future<void>.delayed(const Duration(milliseconds: 10));
          }
        });
        await tester.pump();
        final start = find.widgetWithText(FilledButton, L.t('start'));
        if (start.evaluate().isNotEmpty) waits.add(route);
      } catch (err) {
        broke[route] = '$err'.split('\n').first;
      }
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(seconds: 5));
      GamePreset.clear();
    }

    expect(broke, isEmpty, reason: 'экраны не поднялись: $broke');
    expect(waits, isEmpty,
        reason: 'на шаге зарядки ждут «Начать» (${waits.length} из ${routes.length}): ${waits.join(' ')}');
  });
}
