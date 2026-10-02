import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/quick_count/model.dart';
import 'package:psygames_flutter/games/quick_count/screen.dart';
import 'package:psygames_flutter/shell/game_clock.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/level_rules.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/boss_probe.dart';
import 'support/game_clock_fake.dart';

/// ПАРТИЯ ИГРАЕТСЯ НАЖАТИЯМИ, а число точек проба СЧИТАЕТ С ЭКРАНА — как человек.
///
/// ⚠️ Подписи «точек N» на экране НЕТ и быть не должно: она выдала бы ответ
/// любому, кто слушает экран чтецом. Поэтому проба считает нарисованные точки,
/// а не читает готовое число.
void main() {
  setUpAll(() async {
    // Подписи — из общего словаря, как в приложении (экран переведён на L.t, задача 4b6f863e).
    TestWidgetsFlutterBinding.ensureInitialized();
    await L.load('ru');
  });

  late SharedState state;
  var opens = 0;

  Future<void> open(WidgetTester tester, {int level = 1, Size? screen, int seed = 5, bool ruleSeen = true}) async {
    // Таймеры пробы — на часах партии (shell/game_clock.dart): в пробе они идут с поддельным временем.
    useFakeGameClock(tester);
    if (screen != null) {
      tester.view.devicePixelRatio = 1.0;
      tester.view.physicalSize = screen;
      addTearDown(tester.view.reset);
    }
    SharedPreferences.setMockInitialValues({
      if (level != 1) '${SharedState.prefix}quick_count_level_nzt48': '$level',
      // Карточка «Вспышки-приманки» на 42-м перехватывала бы нажатия — её проверяет своя проба.
      if (ruleSeen) LevelRules.seenKey('quick_count', 'decoys'): '1',
    });
    state = await SharedState.open();
    // ⚠️ КЛЮЧ ОБЯЗАТЕЛЕН. Без него повторный pumpWidget переиспользует СТАРОЕ
    // состояние экрана: проба «открывала уровень 8», а меряла недоигранную
    // партию первого уровня — и находила не те кнопки.
    await tester.pumpWidget(MaterialApp(
      home: QuickCountScreen(key: ValueKey('открытие${opens += 1}'), state: state, rnd: math.Random(seed)),
    ));
    await tester.pump();
    await tester.pump();
  }

  int dotsOnScreen(WidgetTester tester) {
    var count = 0;
    for (var i = 0; i < maxDots + 5; i += 1) {
      if (find.byKey(Key('точка$i')).evaluate().isNotEmpty) count += 1;
    }
    return count;
  }

  /// Проходит одну пробу: смотрит, сколько точек, ждёт показ и задержку, отвечает.
  Future<int> playTrial(WidgetTester tester, LevelParams p, {bool correct = true}) async {
    final n = dotsOnScreen(tester);
    expect(n >= p.minN && n <= p.maxN, isTrue, reason: 'точек $n — внутри границ уровня ${p.minN}..${p.maxN}');
    await tester.pump(Duration(milliseconds: p.exposureMs + 10));
    if (p.holdMs > 0) {
      expect(find.byKey(Key('ответ$n')).evaluate().isEmpty, isTrue,
          reason: 'пока идёт задержка, кнопок ещё нет');
      await tester.pump(Duration(milliseconds: p.holdMs + 10));
    }
    final answer = correct ? n : (find.byKey(Key('ответ${n + 1}')).evaluate().isNotEmpty ? n + 1 : n - 1);
    await tester.tap(find.byKey(Key('ответ$answer')));
    await tester.pump();
    return n;
  }

  testWidgets('🔴 партия из двенадцати проб играется нажатиями и берёт уровень', (tester) async {
    final p = levelParams(1);
    await open(tester);
    expect(find.text(L.t('quickCount')), findsOneWidget);
    await tester.tap(find.byKey(const Key('начать')));
    await tester.pump();

    for (var i = 0; i < trialsPerRound; i += 1) {
      expect(find.text('${i + 1}/$trialsPerRound'), findsOneWidget, reason: 'проба ${i + 1}');
      await playTrial(tester, p);
    }
    expect(find.text(L.t('nextLabel')), findsOneWidget, reason: 'двенадцать из двенадцати — уровень взят');
  });

  testWidgets('🔴 верный ответ ВСЕГДА есть среди кнопок, и их не больше шести', (tester) async {
    for (final level in [1, 8, 20, 33]) {
      final p = levelParams(level);
      await open(tester, level: level, seed: level);
      await tester.tap(find.byKey(const Key('начать')));
      await tester.pump();
      for (var i = 0; i < 4; i += 1) {
        final n = dotsOnScreen(tester);
        await tester.pump(Duration(milliseconds: p.exposureMs + p.holdMs + 20));
        expect(find.byKey(Key('ответ$n')), findsOneWidget, reason: 'L$level: кнопка с ответом $n на экране');
        var buttons = 0;
        for (var v = 0; v <= maxDots + 4; v += 1) {
          if (find.byKey(Key('ответ$v')).evaluate().isNotEmpty) buttons += 1;
        }
        expect(buttons <= answerMax, isTrue, reason: 'L$level: кнопок $buttons, не больше шести');
        await tester.tap(find.byKey(Key('ответ$n')));
        await tester.pump();
      }
    }
  });

  testWidgets('🔴 три ошибки из двенадцати уровень не берут — порог 80%', (tester) async {
    final p = levelParams(1);
    await open(tester);
    await tester.tap(find.byKey(const Key('начать')));
    await tester.pump();
    // Девять верных и три мимо — это 75 %, порога 80 % не хватает.
    for (var i = 0; i < trialsPerRound; i += 1) {
      await playTrial(tester, p, correct: i >= 3);
    }
    expect(find.text(L.t('retry')), findsOneWidget, reason: '75% — уровень не взят');
    expect(find.textContaining('нужно 80%'), findsOneWidget);
  });

  testWidgets('🔴 РАСКЛАДКА: точки внутри поля и не слипаются, ряд ответов 3×2 на 360 и 390', (tester) async {
    for (final screen in [const Size(360, 640), const Size(390, 844)]) {
      final p = levelParams(31);   // 18..20 точек — самая плотная раздача
      await open(tester, level: 31, screen: screen, seed: 3);
      await tester.tap(find.byKey(const Key('начать')));
      await tester.pump();

      final field = tester.getRect(find.byKey(const Key('поле')));
      final n = dotsOnScreen(tester);
      expect(n >= p.minN, isTrue);
      final centers = <Offset>[];
      for (var i = 0; i < n; i += 1) {
        final dot = tester.getRect(find.byKey(Key('точка$i')));
        expect(dot.left >= field.left - 0.01 && dot.right <= field.right + 0.01, isTrue,
            reason: '$screen точка $i вылезла вбок: $dot против $field');
        expect(dot.top >= field.top - 0.01 && dot.bottom <= field.bottom + 0.01, isTrue,
            reason: '$screen точка $i вылезла по высоте: $dot против $field');
        centers.add(dot.center);
      }
      var tooClose = 0;
      for (var i = 0; i < centers.length; i += 1) {
        for (var j = i + 1; j < centers.length; j += 1) {
          if ((centers[i] - centers[j]).distance < 16 * 2.4) tooClose += 1;
        }
      }
      expect(tooClose, 0, reason: '$screen: слипшихся пар $tooClose — поле должно быть достаточным');

      await tester.pump(Duration(milliseconds: p.exposureMs + p.holdMs + 20));
      final row = tester.getRect(find.byKey(const Key('ряд-ответов')));
      final grid = answerGrid(answerMax, screen.width);
      expect(grid.cols, 3, reason: '$screen: три столбца на любом телефоне');
      expect(grid.rows, 2, reason: '$screen: два ряда');
      expect(row.height, closeTo(grid.rows * grid.size + (grid.rows - 1) * btnGap, 0.5),
          reason: '$screen: высота ряда — та, что считает правило, а не та, что вышла');
      expect(row.width <= screen.width, isTrue, reason: '$screen: ряд ответов помещается по ширине');
    }
  });

  testWidgets('🔴 веха: победа на 3-м уровне открывает бой «тапни только зелёный», на 2-м — нет', (tester) async {
    // В вебе этот экран зовёт BossRound каждые три уровня; при переносе бой пропал молча.
    await expectBossAfterWin(tester, won: find.text(L.t('nextLabel')), hudKey: 'bossHudGonogo', play: (level) async {
      final p = levelParams(level);
      await open(tester, level: level, seed: level);
      await tester.tap(find.byKey(const Key('начать')));
      await tester.pump();
      for (var i = 0; i < trialsPerRound; i += 1) {
        await playTrial(tester, p);
      }
    });
  });

  // ─────── С 42-го: серия вспышек с приманками (задача 7f81fbc6, правило «потолков нет») ───────

  int keysOnScreen(WidgetTester tester, String prefix) {
    var count = 0;
    for (var i = 0; i < maxDots + 5; i += 1) {
      if (find.byKey(Key('$prefix$i')).evaluate().isNotEmpty) count += 1;
    }
    return count;
  }

  Color colorOf(WidgetTester tester, Finder f) {
    final box = tester.widget<Container>(find.descendant(of: f, matching: find.byType(Container), matchRoot: true).first);
    return (box.decoration! as BoxDecoration).color!;
  }

  /// Самая большая разница по каналу между двумя цветами, 0…255.
  int channelGap(Color a, Color b) =>
      [16, 8, 0].map((s) => (((a.toARGB32() >> s) & 0xFF) - ((b.toARGB32() >> s) & 0xFF)).abs()).reduce(math.max);

  /// Смотрит серию вспышек ГЛАЗАМИ, как человек: по одной, считая точки каждого цвета.
  /// Возвращается в начале задержки — ответ ещё не открыт.
  Future<({int own, int ownAt, List<int> decoys, Color ownColor, Color? lureColor})> watchSeries(
      WidgetTester tester, LevelParams p) async {
    int? own, ownAt;
    Color? ownColor, lureColor;
    final decoys = <int>[];
    for (var flash = 0; flash < 60; flash += 1) {
      final mine = keysOnScreen(tester, 'точка');
      final lure = keysOnScreen(tester, 'чужая');
      expect(mine == 0 || lure == 0, isTrue, reason: 'в одной вспышке точки одного цвета: $mine и $lure');
      expect(mine + lure, greaterThan(0), reason: 'вспышка ${flash + 1} не пуста');
      if (mine > 0) {
        expect(own, isNull, reason: 'своя вспышка в серии ровно одна');
        own = mine;
        ownAt = flash;
        ownColor = colorOf(tester, find.byKey(const Key('точка0')));
      } else {
        decoys.add(lure);
        lureColor = colorOf(tester, find.byKey(const Key('чужая0')));
      }
      await tester.pump(Duration(milliseconds: p.exposureMs + 1));
      expect(keysOnScreen(tester, 'точка') + keysOnScreen(tester, 'чужая'), 0, reason: 'вспышка погасла');
      if (find.byIcon(Icons.hourglass_empty).evaluate().isNotEmpty) break;   // серия кончилась — задержка
      await tester.pump(const Duration(milliseconds: qcFlashGapMs + 1));
    }
    expect(own, isNotNull, reason: 'своя вспышка была');
    return (own: own!, ownAt: ownAt!, decoys: decoys, ownColor: ownColor!, lureColor: lureColor);
  }

  testWidgets('🔴 ПОТОЛКА НЕТ: победа на 41-м открывает 42-й, а до 42-го приманок нет', (tester) async {
    // Правило Дениса 06.09.2026. Прежде лестница стояла на 41-м: выше номер не рос вовсе.
    final p = levelParams(41);
    await open(tester, level: 41, seed: 41);
    expect(find.byKey(const Key('образец')), findsNothing, reason: 'до 42-го образца цвета нет');
    await tester.tap(find.byKey(const Key('начать')));
    await tester.pump();
    for (var i = 0; i < trialsPerRound; i += 1) {
      expect(keysOnScreen(tester, 'чужая'), 0, reason: 'проба ${i + 1}: до 42-го приманок нет');
      await playTrial(tester, p);
    }
    expect(find.text(L.t('nextLabel')), findsOneWidget, reason: 'уровень взят');
    expect(state.get('${SharedState.prefix}quick_count_level_nzt48'), '42', reason: 'лестница не упирается в 41-й');
  });

  testWidgets('🔴 с 42-го серия: своя вспышка одна и цвета образца, приманки другого; счёт — по своим', (tester) async {
    final p = levelParams(44);
    await open(tester, level: 44, seed: 44);
    expect(find.text(L.t('qcOwnColorHint')), findsOneWidget, reason: 'подсказка — считать только свой цвет');
    final sample = colorOf(tester, find.byKey(const Key('образец')));
    await tester.tap(find.byKey(const Key('начать')));
    await tester.pump();
    final primary = Theme.of(tester.element(find.byKey(const Key('поле')))).colorScheme.primary;
    expect(sample, primary, reason: 'образец — того же цвета, что свои точки');
    var longest = 0;
    final places = <int>{};
    for (var i = 0; i < trialsPerRound; i += 1) {
      final seen = await watchSeries(tester, p);
      places.add(seen.ownAt);
      expect(seen.decoys, isNotEmpty, reason: 'проба ${i + 1}: хотя бы одна приманка');
      expect(seen.ownColor, primary, reason: 'проба ${i + 1}: свои — цвета образца');
      expect(channelGap(seen.lureColor!, primary), greaterThan(20), reason: 'проба ${i + 1}: приманки другого цвета');
      longest = math.max(longest, seen.decoys.length + 1);
      await tester.pump(Duration(milliseconds: p.holdMs + 1));
      await tester.tap(find.byKey(Key('ответ${seen.own}')));
      await tester.pump();
    }
    expect(longest, 3, reason: 'на 44-м приманок в среднем 1,25 — в части проб их две');
    expect(places.length, greaterThan(1), reason: 'своя вспышка стоит в серии на разных местах: $places');
    expect(find.text(L.t('nextLabel')), findsOneWidget, reason: 'все ответы по своим — уровень взят');
    expect(state.get('${SharedState.prefix}quick_count_level_nzt48'), '45');
  });

  testWidgets('🔴 ответ по приманке — ошибка: так уровень не взять', (tester) async {
    final p = levelParams(44);
    await open(tester, level: 44, seed: 7);
    await tester.tap(find.byKey(const Key('начать')));
    await tester.pump();
    var byLure = 0;
    for (var i = 0; i < trialsPerRound; i += 1) {
      final seen = await watchSeries(tester, p);
      await tester.pump(Duration(milliseconds: p.holdMs + 1));
      final lure = seen.decoys.first;
      final canLure = lure != seen.own && find.byKey(Key('ответ$lure')).evaluate().isNotEmpty;
      if (canLure) byLure += 1;
      await tester.tap(find.byKey(Key('ответ${canLure ? lure : seen.own}')));
      await tester.pump();
    }
    expect(byLure, greaterThanOrEqualTo(3), reason: 'проба осмысленна: по приманке отвечено $byLure раз');
    expect(find.text(L.t('retry')), findsOneWidget, reason: 'ответы по приманке засчитаны ошибками');
    expect(state.get('${SharedState.prefix}quick_count_level_nzt48'), '44', reason: 'лестница не шагнула');
  });

  testWidgets('🔴 цвет приманок с уровнем ближе к своему, но не сливается с ним', (tester) async {
    final gaps = <int, int>{};
    for (final level in [42, 60, 400]) {
      final p = levelParams(level);
      await open(tester, level: level, seed: level);
      await tester.tap(find.byKey(const Key('начать')));
      await tester.pump();
      final primary = Theme.of(tester.element(find.byKey(const Key('поле')))).colorScheme.primary;
      final seen = await watchSeries(tester, p);
      gaps[level] = channelGap(seen.lureColor!, primary);
    }
    expect(gaps[42]! > gaps[60]! && gaps[60]! > gaps[400]!, isTrue, reason: 'разница цвета по уровням: $gaps');
    expect(gaps[400], greaterThanOrEqualTo(20), reason: 'на 400-м цвета ещё различимы: $gaps');
  });

  testWidgets('🔴 пауза держит вспышку: пока открыто меню, показ не истекает', (tester) async {
    final p = levelParams(42);
    await open(tester, level: 42, seed: 42);
    await tester.tap(find.byKey(const Key('начать')));
    await tester.pump();
    // Экран игры под меню паузы — за кадром, поэтому точки ищутся и там.
    int shown() {
      var count = 0;
      for (var i = 0; i < maxDots + 5; i += 1) {
        for (final k in ['точка$i', 'чужая$i']) {
          if (find.byKey(Key(k), skipOffstage: false).evaluate().isNotEmpty) count += 1;
        }
      }
      return count;
    }

    final before = shown();
    expect(before, greaterThan(0));
    await tester.tap(find.byTooltip('Пауза'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byKey(const Key('pause-resume')), findsOneWidget, reason: 'меню паузы открылось');
    expect(isGameHeld(), isTrue);
    await tester.pump(Duration(milliseconds: p.exposureMs * 10));
    expect(shown(), before, reason: 'на паузе вспышка стоит — показ не истёк под меню');
    await tester.tap(find.byKey(const Key('pause-resume')));
    // Часы пошли, когда страница паузы ушла из дерева, — это кадр-другой после конца анимации.
    await tester.pumpAndSettle();
    expect(isGameHeld(), isFalse, reason: 'меню закрыто — часы идут');
    await tester.pump(const Duration(seconds: 5));
    expect(find.byKey(const Key('ряд-ответов')), findsOneWidget, reason: 'после паузы серия дошла до ответа');
  });

  testWidgets('🔴 на 42-м до серии — карточка правила «Вспышки-приманки»', (tester) async {
    await tester.runAsync(LevelRules.load);
    await open(tester, level: 42, ruleSeen: false);
    await tester.pump();
    expect(find.text(L.t('lr_quick_count_decoys_title')), findsOneWidget,
        reason: 'новая механика объявлена до партии, как у остальных игр с правилами уровня');
  });
}
