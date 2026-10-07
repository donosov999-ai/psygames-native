/// ПРЕСЕТ ЗАРЯДКИ ДОЕЗЖАЕТ ДО ШЕСТИ ЭКРАНОВ РАЗДЕЛА — ТАК ЖЕ, КАК В ВЕБЕ.
///
/// Замер 30.09.2026 по 1983 шагам плейлистов с играми раздела: из параметров шага
/// реально приходят `trials` (SET — 153 шага, «Паттерны» — 146), `level` по правилу
/// «освоенный минус 20 %» (веб применяет его у «Шкалы» и «Трекера»), `calm` вечером
/// и ночью и автостарт. `size`, `duration`, `diffCount` не передаёт ни один шаг — но веб их
/// читает, и с 07.10 натив тоже (задача 50139f1d): их пробы — `search_address_params_test.dart`
/// и `find_differences_screen_test.dart`. `mode` (подписи старых тиров «5x5», «60s») веб не
/// читает вовсе.
///
/// Каждая проба стоит там, где правило работает: у SET лимит времени включается
/// только с 11-го уровня — на первом снятие лимита не видно, поэтому меряется там.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/find_differences/screen.dart';
import 'package:psygames_flutter/games/math_slider/screen.dart';
import 'package:psygames_flutter/games/object_tracker/screen.dart';
import 'package:psygames_flutter/games/pattern/screen.dart';
import 'package:psygames_flutter/games/sdmt/screen.dart';
import 'package:psygames_flutter/games/set_game/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/js_compat.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await L.load('ru');
  });
  tearDown(GamePreset.clear);

  Future<void> open(WidgetTester tester, Widget Function(SharedState) build,
      {Map<String, String> levels = const {}}) async {
    SharedPreferences.setMockInitialValues({
      for (final e in levels.entries) '${SharedState.prefix}${e.key}_level_nzt48': e.value,
    });
    final state = await SharedState.open();
    // ⚠️ БЕЗ runAsync. Таймер, созданный внутри runAsync, живёт в НАСТОЯЩЕМ
    // времени, и `pump(60 с)` его не двигает: проба «таймера в тихом шаге нет»
    // оставалась зелёной даже с включённым таймером (замер мутацией 30.09.2026).
    await tester.pumpWidget(MaterialApp(home: build(state)));
    for (var i = 0; i < 6; i += 1) {
      await tester.pump(const Duration(milliseconds: 50));
    }
  }

  /// Значение показателя рядом с его значком.
  String hud(WidgetTester tester, IconData icon) {
    final row = find.ancestor(of: find.byIcon(icon), matching: find.byType(Row)).first;
    return tester.widget<Text>(find.descendant(of: row, matching: find.byType(Text))).data!;
  }

  testWidgets('🔴 SET в шаге зарядки: число раскладов из шага и БЕЗ лимита времени', (tester) async {
    // Вне зарядки на 12-м уровне лимит есть — иначе проба снятия ничего не мерит.
    await open(tester, (s) => SetGameScreen(state: s, rnd: createRng('probe')), levels: {'set_game': '12'});
    expect(find.byIcon(Icons.timer_outlined), findsOneWidget, reason: 'на L12 без зарядки лимит обязан быть');

    GamePreset.set({'wu': '1', 'trials': '3'});
    await open(tester, (s) => SetGameScreen(key: const ValueKey('preset'), state: s, rnd: createRng('probe')),
        levels: {'set_game': '12'});
    expect(hud(tester, Icons.repeat), '1/3', reason: 'число раскладов не взято из шага');
    expect(find.byIcon(Icons.timer_outlined), findsNothing, reason: 'в шаге зарядки лимит времени на сет не снят');
  });

  testWidgets('🔴 «Паттерны» в шаге зарядки: число проб из шага', (tester) async {
    GamePreset.set({'wu': '1', 'trials': '4'});
    await open(tester, (s) => PatternScreen(state: s, rnd: createRng('probe')));
    expect(hud(tester, Icons.repeat), '1/4', reason: 'число проб не взято из шага');
  });

  testWidgets('🔴 «Шкала»: уровень шага (−20 %) вместо личного', (tester) async {
    GamePreset.set({'wu': '1', 'level': '7'});
    await open(tester, (s) => MathSliderScreen(state: s), levels: {'math_slider': '10'});
    expect(hud(tester, Icons.flag_outlined), '7', reason: 'партия пошла с личного 10, а не с уровня шага 7');
  });

  testWidgets('🔴 «Трекер»: уровень шага, но не выше потолка лестницы', (tester) async {
    GamePreset.set({'wu': '1', 'level': '99'});
    await open(tester, (s) => ObjectTrackerScreen(state: s), levels: {'object_tracker': '5'});
    expect(hud(tester, Icons.flag_outlined), '41', reason: 'уровень шага не обрезан потолком 41');
  });

  testWidgets('🔴 SDMT в шаге зарядки стартует сам, без кнопки «Начать»', (tester) async {
    await open(tester, (s) => SdmtScreen(state: s, rnd: createRng('probe')));
    expect(find.text('Начать'), findsWidgets, reason: 'вне зарядки кнопка запуска обязана быть');

    GamePreset.set({'wu': '1'});
    await open(tester, (s) => SdmtScreen(key: const ValueKey('preset'), state: s, rnd: createRng('probe')));
    expect(find.text('Начать'), findsNothing, reason: 'шаг зарядки упёрся в кнопку «Начать»');
  });

  testWidgets('🔴 «Найди отличия» в тихом шаге: таймера нет, и раунд не кончается по времени', (tester) async {
    GamePreset.set({'wu': '1', 'calm': '1'});
    await open(tester, (s) => FindDifferencesScreen(state: s, rnd: createRng('probe')));
    expect(find.byIcon(Icons.timer_outlined), findsNothing, reason: 'в тихом шаге показатель времени виден');
    final round = hud(tester, Icons.repeat);
    // Дольше самого длинного окна раунда (40 с на первом уровне).
    await tester.pump(const Duration(seconds: 60));
    await tester.pump(const Duration(seconds: 1));
    expect(hud(tester, Icons.repeat), round, reason: 'раунд закончился по времени, хотя таймера быть не должно');
  });
}
