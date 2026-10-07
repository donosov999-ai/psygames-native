/// ПАРАМЕТР АДРЕСА ДОЕЗЖАЕТ ДО НАТИВНОГО ЭКРАНА — ТЕМ ЖЕ ИМЕНЕМ, ЧТО ЧИТАЕТ ВЕБ.
///
/// Сторож каркаса 44f7e4e0 (PR #273, замер 07.10.2026) нашёл: веб-экран читает параметр из
/// адреса, а нативный двойник — нет, и `HybridApp.routeOf` молча открывает голый экран.
/// У раздела «Поиск» таких было четыре (задача 50139f1d). «Найди отличия» `?diffCount=` —
/// в PR #185 со своей пробой (`find_differences_screen_test.dart`); здесь три остальных:
/// · `schulte?size` — веб `schulte.tsx:249` и `:470–481`: шаг зарядки играет ПРОСТУЮ таблицу
///   (числа, по порядку, без цвета) размером из шага, но не больше «уровень + 1»;
/// · `sdmt?duration` — веб `sdmt.tsx:166`, `:203–207`: у шага своя длительность, классические
///   9 символов и нет цели по попаданиям;
/// · `math-sprint?duration` — веб `math-sprint.tsx:112`, `:178`: длительность раунда из адреса.
///
/// Каждая проба сперва показывает экран БЕЗ параметра на том же уровне: иначе совпадение
/// значений «по уровню» и «из шага» прошло бы за чтение параметра.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/math_sprint/screen.dart';
import 'package:psygames_flutter/games/schulte/screen.dart';
import 'package:psygames_flutter/games/sdmt/screen.dart';
import 'package:psygames_flutter/shell/game_clock.dart';
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
    gameWallMs = () => tester.binding.clock.now().millisecondsSinceEpoch;
    addTearDown(() => gameWallMs = () => DateTime.now().millisecondsSinceEpoch);
    SharedPreferences.setMockInitialValues({
      for (final e in levels.entries) '${SharedState.prefix}${e.key}_level_nzt48': e.value,
      '${SharedState.prefix}language': 'ru',
    });
    final state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(key: UniqueKey(), home: build(state)));
    for (var i = 0; i < 6; i += 1) {
      await tester.pump(const Duration(milliseconds: 50));
    }
  }

  /// Значение показателя рядом с его значком.
  String hud(WidgetTester tester, IconData icon) {
    final row = find.ancestor(of: find.byIcon(icon), matching: find.byType(Row)).first;
    return tester.widget<Text>(find.descendant(of: row, matching: find.byType(Text))).data!;
  }

  /// Сколько клеток на поле (ключи `клетка0…`, `легенда0…` идут подряд).
  int countKeys(String prefix) {
    var n = 0;
    while (find.byKey(Key('$prefix$n')).evaluate().isNotEmpty) {
      n += 1;
    }
    return n;
  }

  /// Вне зарядки Шульте ждёт «Начать» — поле рисуется после нажатия.
  Future<void> start(WidgetTester tester) async {
    await tester.tap(find.text(L.t('start')).first);
    await tester.pump(const Duration(milliseconds: 50));
  }

  String schulteTarget(WidgetTester tester) =>
      (tester.widget<Text>(find.byKey(const Key('цель'))).data ?? '').replaceFirst('Ищи: ', '');

  group('«Таблица Шульте» ?size', () {
    testWidgets('🔴 шаг зарядки: таблица размером из шага — простая, числа по порядку', (tester) async {
      // Уровень 7 — буквы в обратном порядке, 5×5. Шаг обязан сыграть ЧИСЛА с единицы.
      await open(tester, (s) => SchulteScreen(state: s), levels: {'schulte_table': '7'});
      await start(tester);
      final atLevel = countKeys('клетка');
      expect(atLevel, 25, reason: 'L7 без шага — 5×5');

      GamePreset.set({'wu': '1', 'size': '6'});
      await open(tester, (s) => SchulteScreen(state: s), levels: {'schulte_table': '7'});
      expect(countKeys('клетка'), 36, reason: 'размер шага 6 не доехал до поля');
      expect(schulteTarget(tester), '1', reason: 'шаг зарядки играет не простую таблицу чисел с единицы');
    });

    testWidgets('🔴 размер шага — потолок желания: не больше «уровень + 1»', (tester) async {
      // Первый уровень — 5×5; шаг просит 9×9 — получает 6×6 (веб `capPresetByLevel`).
      GamePreset.set({'wu': '1', 'size': '9'});
      await open(tester, (s) => SchulteScreen(state: s));
      expect(countKeys('клетка'), 36, reason: 'шаг размера 9 на первом уровне не обрезан до 6×6');
    });

    testWidgets('🔴 у шага зарядки нет лимита времени уровня', (tester) async {
      // С 19-го уровня у таблицы лимит времени (ось роста, 7f81fbc6); шаг играет простую таблицу.
      // Лимит виден в показателе ещё до «Начать» (на L20 кнопку закрывает карточка нового правила).
      await open(tester, (s) => SchulteScreen(state: s), levels: {'schulte_table': '20'});
      expect(hud(tester, Icons.timer_outlined), contains('/'), reason: 'на L20 без шага лимит обязан быть');

      GamePreset.set({'wu': '1', 'size': '5'});
      await open(tester, (s) => SchulteScreen(state: s), levels: {'schulte_table': '20'});
      expect(hud(tester, Icons.timer_outlined), isNot(contains('/')), reason: 'лимит уровня перенёсся в шаг зарядки');
    });
  });

  group('SDMT ?duration', () {
    testWidgets('🔴 шаг зарядки: своя длительность, 9 символов, без цели по попаданиям', (tester) async {
      // Восьмой уровень: 50 с, 7 символов, цель 21.
      await open(tester, (s) => SdmtScreen(state: s, rnd: createRng('probe')), levels: {'sdmt': '8'});
      await start(tester);
      expect(hud(tester, Icons.timer_outlined), '50', reason: 'L8 без шага — 50 с');
      expect(countKeys('легенда'), 7, reason: 'L8 без шага — 7 символов');
      expect(hud(tester, Icons.check_circle_outline), '0/21', reason: 'L8 без шага — цель 21');

      GamePreset.set({'wu': '1', 'duration': '40'});
      await open(tester, (s) => SdmtScreen(state: s, rnd: createRng('probe')), levels: {'sdmt': '8'});
      expect(hud(tester, Icons.timer_outlined), '40', reason: 'длительность шага не доехала');
      expect(countKeys('легенда'), 9, reason: 'у шага зарядки не классические 9 символов');
      expect(hud(tester, Icons.check_circle_outline), '0', reason: 'у шага зарядки нет цели — «/21» лишнее');
    });

    testWidgets('шаг без длительности — 60 с, как веб', (tester) async {
      GamePreset.set({'wu': '1'});
      await open(tester, (s) => SdmtScreen(state: s, rnd: createRng('probe')), levels: {'sdmt': '12'});
      expect(hud(tester, Icons.timer_outlined), '60');
    });
  });

  group('«Спринт» ?duration', () {
    testWidgets('🔴 длительность раунда из адреса — и в шаге зарядки, и без него', (tester) async {
      await open(tester, (s) => MathSprintScreen(state: s, rnd: createRng('probe')));
      await tester.tap(find.byKey(const Key('начать')));
      await tester.pump(const Duration(milliseconds: 50));
      expect(hud(tester, Icons.timer_outlined), '60 ${L.t('secShort')}', reason: 'без адреса — 60 с');

      GamePreset.set({'wu': '1', 'duration': '30'});
      await open(tester, (s) => MathSprintScreen(state: s, rnd: createRng('probe')));
      expect(hud(tester, Icons.timer_outlined), '30 ${L.t('secShort')}', reason: 'длительность шага не доехала');

      // Веб читает `duration` и вне зарядки: это начальное значение выбора «Длительность».
      GamePreset.set({'duration': '90'});
      await open(tester, (s) => MathSprintScreen(state: s, rnd: createRng('probe')));
      await tester.tap(find.byKey(const Key('начать')));
      await tester.pump(const Duration(milliseconds: 50));
      expect(hud(tester, Icons.timer_outlined), '90 ${L.t('secShort')}', reason: 'адрес без шага потерял длительность');
    });
  });
}
