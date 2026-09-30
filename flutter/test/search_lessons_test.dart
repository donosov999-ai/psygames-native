/// РАЗБОР ПЯТИ ЭКРАНОВ РАЗДЕЛА НЕ УЧИТ НЕПРАВДЕ И НЕ ЗАМОРАЖИВАЕТ ЛЕСТНИЦУ.
///
/// Гейт `lesson_census_test.dart` проверяет, что кнопка разбора ЕСТЬ. Здесь —
/// две вещи, которые он не видит:
///  · показанное в разборе верно: у «Собери сумму» клетки дают цель, у SET
///    тройка — действительно сет (там стоит запасной вариант, который сетом
///    быть не обязан);
///  · отметку «разбор смотрели» снимает новая партия. Отметка общая на всё
///    приложение, и замер 30.09.2026 показал, что снимает её одно место из
///    сорока: без сброса один открытый разбор выключал рост уровня навсегда.
library;

import 'dart:math' as math;

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
import 'package:psygames_flutter/games/set_game/model.dart' as set_model;
import 'package:psygames_flutter/games/set_game/screen.dart';
import 'package:psygames_flutter/games/visual_search/screen.dart';
import 'package:psygames_flutter/shell/js_compat.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await L.load('ru');
  });
  tearDown(LessonUsed.reset);

  testWidgets('🔴 разбор «Собери сумму»: показанные клетки ДАЮТ цель', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(home: CounterScreen(state: state, rnd: createRng('probe'))));
    await tester.pump();
    await tester.pump();
    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pumpAndSettle();
    // Цель — крупный стимул карточки, слагаемые — подпись под ним «a + b».
    final goal = int.parse(tester.widget<Text>(find.byKey(const Key('demo-stimulus'))).data!);
    final sub = find.textContaining(' + ');
    expect(sub, findsOneWidget, reason: 'в разборе не показано, из чего собрана цель');
    final parts = tester.widget<Text>(sub).data!.split(' + ').map(int.parse).toList();
    expect(parts.fold<int>(0, (a, b) => a + b), goal,
        reason: 'разбор учит неправде: ${parts.join(' + ')} ≠ $goal');
    expect(LessonUsed.inRound, isTrue, reason: 'открытый разбор обязан снять зачёт партии');
  });

  test('🔴 разбор SET: на доске разбора сет ЕСТЬ, и запасной вариант не срабатывает', () {
    // Тот же генератор и то же зерно, что у экрана разбора.
    final board = set_model.buildBoard(createRng('lesson'));
    final found = set_model.findAnySet(board);
    expect(found, isNotNull, reason: 'на доске разбора нет сета — показались бы три случайные карты');
    expect(set_model.isSet(board[found![0]], board[found[1]], board[found[2]]), isTrue);
  });

  testWidgets('🔴 новая партия снимает отметку разбора — у ВСЕХ 14 экранов раздела', (tester) async {
    // Замер 30.09.2026: кнопка разбора есть у 53 экранов, а снимали отметку шесть.
    // Отметка общая на всё приложение — один открытый разбор в любой игре
    // выключал рост уровня во всех. Здесь проверяется каждый экран раздела.
    final screens = <String, Widget Function(SharedState)>{
      'schulte': (s) => SchulteScreen(state: s),
      'mahjong': (s) => MahjongScreen(state: s, rnd: math.Random(7)),
      'math_slider': (s) => MathSliderScreen(state: s),
      'object_tracker': (s) => ObjectTrackerScreen(state: s),
      'quick_count': (s) => QuickCountScreen(state: s, rnd: math.Random(7)),
      'pattern': (s) => PatternScreen(state: s, rnd: createRng('probe')),
      'math_sprint': (s) => MathSprintScreen(state: s, rnd: createRng('probe')),
      'number_bonds': (s) => NumberBondsScreen(state: s, rnd: createRng('probe')),
      'ospan': (s) => OspanScreen(state: s, rnd: createRng('probe')),
      'sdmt': (s) => SdmtScreen(state: s, rnd: createRng('probe')),
      'set_game': (s) => SetGameScreen(state: s, rnd: createRng('probe')),
      'find_differences': (s) => FindDifferencesScreen(state: s, rnd: createRng('probe')),
      'counter': (s) => CounterScreen(state: s, rnd: createRng('probe')),
      'visual_search': (s) => VisualSearchScreen(state: s, rnd: createRng('probe')),
    };
    final stuck = <String>[];
    for (final e in screens.entries) {
      SharedPreferences.setMockInitialValues({});
      final state = await SharedState.open();
      LessonUsed.mark();   // разбор открыли раньше, в любой игре
      await tester.runAsync(() async {
        await tester.pumpWidget(MaterialApp(home: KeyedSubtree(key: ValueKey(e.key), child: e.value(state))));
        for (var i = 0; i < 40; i += 1) {
          await tester.pump(const Duration(milliseconds: 50));
          await Future<void>.delayed(const Duration(milliseconds: 20));
          if (find.byKey(const Key('game-field')).evaluate().isNotEmpty) break;
        }
      });
      await tester.pump();
      if (LessonUsed.inRound) stuck.add(e.key);
      LessonUsed.reset();
    }
    expect(stuck, isEmpty,
        reason: 'новая партия не сняла отметку разбора — рост уровня выключен навсегда: ${stuck.join(', ')}');
  });
}
