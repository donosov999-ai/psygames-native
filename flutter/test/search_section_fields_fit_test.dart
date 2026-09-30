/// ГЕЙТ РАЗДЕЛА «ПОИСК И СЧЁТ»: ДОСКА ВПИСАНА В ПОЛЕ, А НЕ РИСУЕТСЯ ПОВЕРХ ПОЛОС.
///
/// 🔴 ЗАЧЕМ ОТДЕЛЬНЫЙ ГЕЙТ НА ВЕСЬ РАЗДЕЛ. Жалоба Дениса (отчёт e5bfc2f0,
/// задача a3f77fbe) звучала как «всё ещё ездят игры, не прибито жёстко», и
/// правил её каждый экран сам. В нативной половине высота поля приходит ЧИСЛОМ,
/// поэтому «уехать» можно ровно одним способом: нарисовать доску больше, чем
/// поле, и `Wrap`, `Stack` или `Positioned` сделают это МОЛЧА — переполнение
/// ловит только `Flex`. Два таких дефекта за один день (сетка «Собери сумму»
/// торчала на 8 px, предмет «Зрительного поиска» — на 1,24) нашлись лишь после
/// того, как замер перевели с края экрана на границу поля.
///
/// Здесь это меряется сразу у всех четырнадцати экранов раздела: каждая
/// нарисованная коробка под полем обязана лежать ВНУТРИ поля.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/counter/screen.dart';
import 'package:psygames_flutter/games/find_differences/screen.dart';
import 'package:psygames_flutter/games/mahjong/screen.dart';
import 'package:psygames_flutter/games/math_slider/screen.dart';
import 'package:psygames_flutter/games/math_sprint/screen.dart';
import 'package:psygames_flutter/games/number_bonds/screen.dart';
import 'package:psygames_flutter/games/object_tracker/screen.dart';
import 'package:psygames_flutter/games/ospan/screen.dart';
import 'package:psygames_flutter/games/pattern/screen.dart';
import 'package:psygames_flutter/games/quick_count/screen.dart';
import 'package:psygames_flutter/games/schulte/screen.dart';
import 'package:psygames_flutter/games/sdmt/screen.dart';
import 'package:psygames_flutter/games/set_game/screen.dart';
import 'package:psygames_flutter/games/visual_search/screen.dart';
import 'dart:math' as math;

import 'package:psygames_flutter/shell/js_compat.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Экраны раздела и уровень, на котором доска самая тесная: на первом уровне
/// поле полупустое, и гейт, стоящий только на нём, не измерит ничего.
final screens = <String, ({String levelKey, int level, Widget Function(SharedState) build})>{
  'Шульте': (levelKey: 'schulte_table', level: 18, build: (s) => SchulteScreen(state: s)),
  'маджонг': (levelKey: 'mahjong', level: 30, build: (s) => MahjongScreen(state: s, rnd: math.Random(7))),
  'шкала': (levelKey: 'math_slider', level: 30, build: (s) => MathSliderScreen(state: s)),
  'трекер': (levelKey: 'object_tracker', level: 41, build: (s) => ObjectTrackerScreen(state: s)),
  'быстрый счёт': (levelKey: 'quick_count', level: 30, build: (s) => QuickCountScreen(state: s, rnd: math.Random(7))),
  'паттерны': (levelKey: 'pattern', level: 26, build: (s) => PatternScreen(state: s, rnd: createRng('гейт'))),
  'спринт': (levelKey: 'math_sprint', level: 20, build: (s) => MathSprintScreen(state: s, rnd: createRng('гейт'))),
  'состав числа': (levelKey: 'number_bonds', level: 20, build: (s) => NumberBondsScreen(state: s, rnd: createRng('гейт'))),
  'OSpan': (levelKey: 'ospan', level: 20, build: (s) => OspanScreen(state: s, rnd: createRng('гейт'))),
  'SDMT': (levelKey: 'sdmt', level: 20, build: (s) => SdmtScreen(state: s, rnd: createRng('гейт'))),
  'SET': (levelKey: 'set_game', level: 20, build: (s) => SetGameScreen(state: s, rnd: createRng('гейт'))),
  'найди отличия': (levelKey: 'find_differences', level: 31, build: (s) => FindDifferencesScreen(state: s, rnd: createRng('гейт'))),
  'собери сумму': (levelKey: 'counter', level: 15, build: (s) => CounterScreen(state: s, rnd: createRng('гейт'))),
  'зрительный поиск': (levelKey: 'visual_search', level: 25, build: (s) => VisualSearchScreen(state: s, rnd: createRng('гейт'))),
};

/// Все нарисованные коробки под полем — в мировых точках.
///
/// ⚠️ БЕРЁМ ПОЛНОЕ ПРЕОБРАЗОВАНИЕ, А НЕ `localToGlobal` + `size`. Под `FittedBox`
/// и `Transform` собственный размер коробки НЕ равен нарисованному: шапка поля
/// «Собери сумму» ужимается в свой бюджет, и наивный замер объявлял её вылезшей
/// на сотню точек. Первый прогон этого гейта дал три таких ложных срабатывания —
/// проверено тем, что после перехода на матрицу они исчезли, а настоящее
/// переполнение «шкалы» (8 px) осталось.
List<(Rect, String)> boxesUnder(WidgetTester tester, Finder root) {
  final out = <(Rect, String)>[];
  void walk(Element el) {
    final ro = el.renderObject;
    if (ro is RenderBox && ro.attached && ro.hasSize && !ro.size.isEmpty) {
      final rect = MatrixUtils.transformRect(ro.getTransformTo(null), Offset.zero & ro.size);
      out.add((rect, el.widget.runtimeType.toString()));
    }
    el.visitChildren(walk);
  }

  tester.element(root).visitChildren(walk);
  return out;
}

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await L.load('ru');
  });

  for (final size in [const Size(360, 640), const Size(390, 844)]) {
    testWidgets('доска каждого экрана раздела вписана в поле на ${size.width.toInt()}×${size.height.toInt()}',
        (tester) async {
      tester.view.devicePixelRatio = 1.0;
      tester.view.physicalSize = size;
      addTearDown(tester.view.reset);

      final broken = <String>[];
      final tops = <String, double>{};
      for (final entry in screens.entries) {
        final cfg = entry.value;
        SharedPreferences.setMockInitialValues({
          '${SharedState.prefix}${cfg.levelKey}_level_nzt48': '${cfg.level}',
        });
        final state = await SharedState.open();
        await tester.runAsync(() async {
          await tester.pumpWidget(MaterialApp(
            home: KeyedSubtree(key: ValueKey('${entry.key}-${size.width}'), child: cfg.build(state)),
          ));
          // Экранам с ассетами и лестницей нужно время: ждём, пока появится поле.
          for (var i = 0; i < 40; i += 1) {
            await tester.pump(const Duration(milliseconds: 50));
            await Future<void>.delayed(const Duration(milliseconds: 20));
            if (find.byKey(const Key('game-field')).evaluate().isNotEmpty) break;
          }
        });
        await tester.pump();

        final fieldFinder = find.byKey(const Key('game-field'));
        if (fieldFinder.evaluate().isEmpty) {
          broken.add('${entry.key}: поля нет вовсе');
          continue;
        }
        final field = tester.getRect(fieldFinder);
        tops[entry.key] = field.top;
        var worst = 0.0;
        var who = '';
        for (final (box, name) in boxesUnder(tester, fieldFinder)) {
          final sides = {
            'вниз': box.bottom - field.bottom,
            'вверх': field.top - box.top,
            'вправо': box.right - field.right,
            'влево': field.left - box.left,
          };
          for (final side in sides.entries) {
            if (side.value > worst) {
              worst = side.value;
              who = '$name ${side.key}';
            }
          }
        }
        // Полточки — запас на округление размеров в мировых координатах.
        if (worst > 0.5) {
          broken.add('${entry.key}: $who вылезает из поля на ${worst.toStringAsFixed(1)} px');
        }
      }
      expect(broken, isEmpty, reason: 'на ${size.width.toInt()}×${size.height.toInt()}:\n${broken.join('\n')}');
      // 🔴 ЕДИНЫЙ ВЕРХ ПОЛЯ — канон SPEC_SCREEN_GEOMETRY (допуск 40). В вебе
      // маджонг выбивался на +54, потому что служебный ряд стоял НАД полем
      // (задача 8d60d3e1). Нативно верх даёт каркас, и разброс остаётся один:
      // полоса показателей переносится на вторую строку там, где значков больше
      // (замер 23.09.2026 — 92 либо 124, то есть ровно одна строка, 32 точки).
      final spread = tops.values.reduce((a, b) => a > b ? a : b) -
          tops.values.reduce((a, b) => a < b ? a : b);
      expect(spread, lessThanOrEqualTo(40),
          reason: 'верх поля разъехался на $spread: ${tops.entries.map((e) => '${e.key} ${e.value.toStringAsFixed(0)}').join(' · ')}');
    });
  }
}
