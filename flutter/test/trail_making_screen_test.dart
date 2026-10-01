import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/trail_making/model.dart';
import 'package:psygames_flutter/games/trail_making/screen.dart';
import 'package:psygames_flutter/shell/game_clock.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson_player.dart';
import 'package:psygames_flutter/shell/level_ladder.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_level_store.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// «СОЕДИНИ ЦЕПОЧКУ» НА FLUTTER ИГРАЕТСЯ ЦЕЛИКОМ — ТАПОМ И ПРОТЯЖКОЙ.
///
/// Правила сверены с живым TS в `trail_making_model_test.dart`; здесь — дошёл ли до них ВВОД и доехал
/// ли итог туда, куда обязан: лестница и статистика.
void main() {
  late SharedState state;
  final reports = <Map<String, dynamic>>[];

  setUp(() async {
    SharedPreferences.setMockInitialValues({'psygames_active_profile': 'nzt48'});
    state = await SharedState.open();
    await L.load('ru');
    reports.clear();
    SessionReport.sink = (json) async => reports.add(jsonDecode(json) as Map<String, dynamic>);
    GamePreset.clear();
  });

  tearDown(() {
    SessionReport.sink = null;
    GamePreset.clear();
  });

  var clock = 0.0;

  Future<void> open(WidgetTester tester, {Size window = const Size(390, 844), int seed = 1}) async {
    tester.view.physicalSize = window;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    clock = 0;
    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(
      MaterialApp(home: TrailMakingScreen(state: state, random: math.Random(seed), now: () => clock)),
    );
    await tester.pump();
    await tester.pump();
  }

  Future<void> press(WidgetTester tester, String key) async {
    final target = find.byKey(Key(key));
    await tester.ensureVisible(target);
    await tester.pump();
    await tester.tap(target);
    await tester.pump();
  }

  int nodeCount() => find.byType(TrailNodeDot).evaluate().length;
  Offset centerOf(WidgetTester tester, int i) => tester.getCenter(find.byKey(Key('trail-node-$i')));

  Future<int> storedLevel() async {
    final ladder = LevelLadder(gameId: 'trail_making', store: SharedLevelStore(state), maxLevel: trailLevels);
    await ladder.load();
    return ladder.level;
  }

  testWidgets('🔴 проход тапами: узлы по порядку в лимите — лестница шагнула, партия ушла в статистику',
      (tester) async {
    await open(tester);
    await press(tester, 'trail-start');
    final n = nodeCount();
    expect(n, trailLevelParams(1).totalNodes);
    for (var i = 0; i < n; i++) {
      clock += 1;
      await press(tester, 'trail-node-$i');
    }
    await tester.pump();
    expect(reports, hasLength(1));
    expect(reports.single['game_type'], 'trail_making');
    expect(reports.single['errors'], 0);
    expect(reports.single['mode'], '${n}n');
    expect(await storedLevel(), 2);
    expect(find.text(L.t('nextLabel')), findsOneWidget);
  });

  // ⚠️ Касание узла засчитывает и протяжка: без соперника она выигрывает спор жестов сразу на касании.
  // Тап у кружка нужен не пальцу, а ЧТЕЦУ ЭКРАНА: его действие «нажать» идёт только через тап.
  testWidgets('🔴 узел нажимается и чтецом экрана', (tester) async {
    final handle = tester.ensureSemantics();
    await open(tester);
    await press(tester, 'trail-start');
    await tester.pump();
    tester.semantics.tap(find.semantics.byLabel(RegExp(r'^1$')));
    await tester.pump();
    expect(find.text('1/${nodeCount()}'), findsOneWidget, reason: 'действие чтеца «нажать» засчитало узел');
    handle.dispose();
  });

  testWidgets('тап по узлу ДАЛЬШЕ по порядку — ошибка, по пройденному — нет', (tester) async {
    await open(tester);
    await press(tester, 'trail-start');
    final n = nodeCount();
    await press(tester, 'trail-node-2');
    await press(tester, 'trail-node-0');
    await press(tester, 'trail-node-0');
    for (var i = 1; i < n; i++) {
      await press(tester, 'trail-node-$i');
    }
    await tester.pump();
    expect(reports.single['errors'], 1, reason: 'дальний узел — ошибка, повторный тап по пройденному — нет');
  });

  testWidgets('🔴 протяжка ведёт через узлы, не отрывая пальца; неверный узел — одна ошибка на вход', (tester) async {
    await open(tester);
    await press(tester, 'trail-start');
    final n = nodeCount();
    final gesture = await tester.startGesture(centerOf(tester, 0));
    await tester.pump();
    // Сдвиг в 7 точек — за порогом протяжки 6: жест стал протяжкой, узел 1 засчитан от точки касания.
    await gesture.moveBy(const Offset(7, 0));
    await tester.pump();
    // Неверный узел: вход — ошибка, движение внутри — ничего, выход и повторный вход — ещё ошибка.
    await gesture.moveTo(centerOf(tester, 2));
    await gesture.moveTo(centerOf(tester, 2) + const Offset(3, 3));
    await tester.pump();
    final canvas = tester.getRect(find.byKey(const Key('trail-canvas')));
    await gesture.moveTo(canvas.topLeft + const Offset(1, 1));
    await gesture.moveTo(centerOf(tester, 2));
    await tester.pump();
    for (var i = 1; i < n; i++) {
      await gesture.moveTo(centerOf(tester, i));
      await tester.pump();
    }
    await gesture.up();
    await tester.pump();
    expect(reports, hasLength(1), reason: 'вся цепочка пройдена одной протяжкой');
    expect(reports.single['errors'], 2, reason: 'два входа в неверный узел — две ошибки, не больше');
  });

  testWidgets('🔴 короткая протяжка в 20 точек от текущего узла засчитывает его — порог 6, как у веба', (tester) async {
    // У Flutter по умолчанию протяжка начинается с 36 точек, а тап отменяется с 18: ведение на 20 точек
    // не было бы ни тапом, ни протяжкой и пропало бы молча.
    await open(tester);
    await press(tester, 'trail-start');
    final n = nodeCount();
    final gesture = await tester.startGesture(centerOf(tester, 0));
    await tester.pump();
    await gesture.moveBy(const Offset(10, 0));
    await gesture.moveBy(const Offset(10, 0));
    await tester.pump();
    await gesture.up();
    await tester.pump();
    expect(find.text('1/$n'), findsOneWidget, reason: 'узел 1 засчитан протяжкой в 20 точек');
  });

  testWidgets('разбор ДО раунда зачёт не отнимает', (tester) async {
    await open(tester);
    await press(tester, 'game-lesson');
    await tester.pump(const Duration(milliseconds: 400));
    tester.state<NavigatorState>(find.byType(Navigator).first).pop();
    // Плеер уходит анимацией: ждём, пока он действительно исчезнет, а не один кадр.
    for (var i = 0; i < 20 && find.byType(LessonPlayerScreen).evaluate().isNotEmpty; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    await press(tester, 'trail-start');
    for (var i = 0; i < nodeCount(); i++) {
      clock += 1;
      await press(tester, 'trail-node-$i');
    }
    await tester.pump();
    expect(await storedLevel(), 2, reason: 'разбор показывал ДРУГУЮ раскладку — партия засчитывается');
  });

  testWidgets('🔴 пауза каркаса не съедает лимит ступени: время партии идёт по игровым часам', (tester) async {
    // Без подставных часов `now`: экран берёт время сам, и проба держит НАСТЕННЫЕ часы игровых.
    // Десять минут паузы посреди партии при лимите первой ступени 16 с: по настенным часам —
    // провал, по игровым — проход. Так ловится и `Stopwatch`, которого храповик часов не видит.
    var wall = 1000000;
    resetGameClock();
    gameWallMs = () => wall;
    addTearDown(() {
      gameWallMs = () => DateTime.now().millisecondsSinceEpoch;
      resetGameClock();
    });
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(MaterialApp(home: TrailMakingScreen(state: state, random: math.Random(1))));
    await tester.pump();
    await tester.pump();
    await press(tester, 'trail-start');
    final n = nodeCount();
    for (var i = 0; i < n; i++) {
      if (i == 2) {
        final release = holdGame();
        wall += 600000;
        release();
      }
      wall += 1000;
      await press(tester, 'trail-node-$i');
    }
    await tester.pump();
    expect(reports, hasLength(1));
    expect(await storedLevel(), 2, reason: 'пауза в 10 минут не вошла во время партии — ступень пройдена');
  });

  testWidgets('время вышло — ступень не пройдена, лестница стоит, партия всё равно в статистике', (tester) async {
    await open(tester);
    await press(tester, 'trail-start');
    final n = nodeCount();
    for (var i = 0; i < n; i++) {
      clock += 5;
      await press(tester, 'trail-node-$i');
    }
    await tester.pump();
    expect(reports, hasLength(1));
    expect(await storedLevel(), 1);
    expect(find.text(L.t('retry')), findsOneWidget);
  });

  testWidgets('🔴 шаг зарядки: вид и число из адреса, но не больше освоенного плюс шаг; лестница не движется',
      (tester) async {
    GamePreset.set({'wu': '1', 'mode': 'A', 'count': '20'});
    await open(tester);
    await tester.pump();
    // Шаг зарядки начинается САМ, как в вебе (useAutostartWhenReady): кнопки «Начать» нет.
    expect(find.byKey(const Key('trail-start')), findsNothing, reason: 'шаг зарядки не ждёт «Начать»');
    expect(nodeCount(), trailLevelParams(1).count + 1, reason: 'просили 20, освоено 6 — даётся 7');
    for (var i = 0; i < nodeCount(); i++) {
      await press(tester, 'trail-node-$i');
    }
    await tester.pump();
    expect(reports, hasLength(1));
    expect(await storedLevel(), 1);
  });

  testWidgets('🔴 разбор: два приёма названы словами, стимул — узлы самой игры', (tester) async {
    await open(tester);
    expect(find.byKey(const Key('game-lesson')), findsOneWidget, reason: 'кнопка разбора — до партии');
    final trials = trailLessonTrials('ru');
    expect(trials, hasLength(2));
    for (final t in trials) {
      expect(t.rule!.startsWith('teachTrail'), isFalse, reason: 'приём назван словами: ${t.rule}');
      expect(t.art, isNotNull);
      expect(t.answer, startsWith('1 → '));
    }
    expect(trials[1].answer, contains('А'), reason: 'в режиме B по-русски буквы кириллицей, как в игре');
    await press(tester, 'game-lesson');
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.byType(LessonPlayerScreen), findsOneWidget);
  });

  testWidgets('🔴 без переполнения на 360×640, 390×844 и набоку; канва целиком в поле', (tester) async {
    for (final window in const [Size(360, 640), Size(390, 844), Size(740, 360)]) {
      for (final level in const [1, 7, 15]) {
        SharedPreferences.setMockInitialValues({
          'psygames_active_profile': 'nzt48',
          'psygames_trail_making_level_nzt48': '$level',
        });
        state = await SharedState.open();
        await open(tester, window: window);
        expect(tester.takeException(), isNull, reason: 'до старта, ур.$level, $window');
        await press(tester, 'trail-start');
        expect(tester.takeException(), isNull, reason: 'партия, ур.$level, $window');
        final field = tester.getRect(find.byKey(const Key('game-field')));
        final canvas = tester.getRect(find.byKey(const Key('trail-canvas')));
        expect(field.contains(canvas.topLeft) && field.contains(canvas.bottomRight - const Offset(0.5, 0.5)), isTrue,
            reason: 'канва за краем поля, ур.$level, $window: $canvas против $field');
        for (var i = 0; i < nodeCount(); i++) {
          final r = tester.getRect(find.byKey(Key('trail-node-$i')));
          expect(canvas.inflate(0.5).contains(r.topLeft) && canvas.inflate(0.5).contains(r.bottomRight), isTrue,
              reason: 'узел $i за краем канвы, ур.$level, $window');
        }
      }
    }
  });

  testWidgets('двенадцать языков: ни до партии, ни в ней не показан голый ключ', (tester) async {
    const keys = ['trailLvlParamsA', 'trailLvlParamsB', 'trailNodes', 'trailPass', 'trailCrossOk', 'nextLabel', 'hud_point'];
    List<String> texts() => tester
        .widgetList<Text>(find.byType(Text))
        .map((t) => t.data ?? t.textSpan?.toPlainText() ?? '')
        .toList();
    for (final code in L.locales) {
      await tester.runAsync(() => L.load(code));
      await open(tester);
      final seen = [...texts()];
      await press(tester, 'trail-start');
      seen.addAll(texts());
      final raw = seen.where((t) => keys.any((k) => t.contains(k))).toList();
      expect(raw, isEmpty, reason: '$code: на экране ключ вместо текста');
    }
    await tester.runAsync(() => L.load('ru'));
  });
}
