import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/wcst/model.dart';
import 'package:psygames_flutter/games/wcst/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/game_shell.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ В WCST ИГРАЕТСЯ НАЖАТИЯМИ.
///
/// 🔴 Проба НЕ знает текущего правила — как и человек. Она выводит его так же,
/// как человек: пробует, смотрит на отклик и держится за правило, пока оно
/// работает.
///
/// Где лежит уровень игры после переезда: тот же ключ, что у веб-версии.
const String _levelKey = 'psygames_wcst_level_nzt48';

void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    await L.load('ru');
  });

  /// Карта на столе, прочитанная С ЭКРАНА: цвет, форма и число фигур.
  /// ⚠️ Правило при этом НЕ читается: оно нигде на экране не названо.
  WcstCard targetOnScreen(WidgetTester tester) {
    final glyphs = <String>[];
    final finder = find.byWidgetPredicate((w) =>
        w.key is ValueKey<String> && (w.key! as ValueKey<String>).value.startsWith('wcst-target-glyph-'));
    for (final e in finder.evaluate()) {
      glyphs.add((e.widget.key! as ValueKey<String>).value);
    }
    expect(glyphs, isNotEmpty, reason: 'карты на столе нет');
    final parts = glyphs.first.split('-');
    final shape = CardShape.values.firstWhere((s) => s.name == parts[3]);
    final color = CardColor.values.firstWhere((c) => c.name == parts[4]);
    return WcstCard(color: color, shape: shape, count: glyphs.length);
  }

  bool hitShown(WidgetTester tester, int idx) {
    final c = tester.widget<Container>(find.byKey(Key('wcst-ref-$idx')));
    final b = (c.decoration! as BoxDecoration).border! as Border;
    return b.top.color == const Color(0xFF22C55E);
  }

  testWidgets('🔴 карта на столе читается с экрана и сортируется по ПРАВИЛУ', (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: WcstScreen(key: const ValueKey('play'), state: state, rnd: Random(4))));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('wcst-params')), findsOneWidget);
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    // Проба выводит правило так же, как человек: пробует и держится за то,
    // что работает. Правило с экрана НЕ читается.
    var guess = SortRule.color;
    var hits = 0, misses = 0;
    final trials = WcstLevel.of(1).trials;
    for (var i = 1; i <= trials; i++) {
      final card = targetOnScreen(tester);
      final idx = [0, 1, 2, 3].firstWhere((k) => matchByRule(card, wcstRefCards[k], guess),
          orElse: () => 0);
      await tester.tap(find.byKey(Key('wcst-ref-$idx')));
      await tester.pump();
      if (hitShown(tester, idx)) {
        hits++;
      } else {
        misses++;
        // Не сработало — пробуем следующее правило.
        guess = SortRule.values[(SortRule.values.indexOf(guess) + 1) % 3];
      }
      await tester.pump(const Duration(milliseconds: wcstFeedbackMs + 50));
    }
    await tester.pumpAndSettle(
        const Duration(milliseconds: 100), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 5));
    expect(hits + misses, trials);
    expect(hits, greaterThan(0), reason: 'ни одного верного за партию');
    expect(find.byKey(const Key('wcst-verdict')), findsOneWidget);
  });

  testWidgets('🔴 правило меняется МОЛЧА: подсказка приходит только ПОСЛЕ ошибки', (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: WcstScreen(key: const ValueKey('silent'), state: state, rnd: Random(7))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    // Играем БЕЗУПРЕЧНО по правилу «цвет»: рано или поздно правило сменится, и
    // тот же ход станет ошибкой — вот тогда и появится подсказка.
    var sawNote = false;
    for (var i = 1; i <= WcstLevel.of(1).trials && !sawNote; i++) {
      final card = targetOnScreen(tester);
      // ⚠️ До ответа подсказки быть НЕ ДОЛЖНО ни на одной пробе: это и значит
      // «правило меняется молча».
      expect(find.byKey(const Key('wcst-shift-note')), findsNothing,
          reason: 'проба $i: подсказка показана ДО ответа');
      final idx = [0, 1, 2, 3].firstWhere((k) => matchByRule(card, wcstRefCards[k], SortRule.color));
      await tester.tap(find.byKey(Key('wcst-ref-$idx')));
      await tester.pump();
      if (!hitShown(tester, idx) && find.byKey(const Key('wcst-shift-note')).evaluate().isNotEmpty) {
        sawNote = true;
      }
      await tester.pump(const Duration(milliseconds: wcstFeedbackMs + 50));
    }
    expect(sawNote, isTrue, reason: 'правило не сменилось либо подсказка не пришла');
  });

  testWidgets('🔴 партия из случайных тапов уровень НЕ берёт', (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: WcstScreen(key: const ValueKey('rnd'), state: state, rnd: Random(2))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    // Всегда первый эталон: точность заведомо ниже порога 55 %.
    for (var i = 1; i <= WcstLevel.of(1).trials; i++) {
      await tester.tap(find.byKey(const Key('wcst-ref-0')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: wcstFeedbackMs + 50));
    }
    await tester.pumpAndSettle(
        const Duration(milliseconds: 100), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 5));
    expect(find.text(L.t('sameLevelRetry')), findsOneWidget, reason: 'случайные тапы засчитаны');
    expect(state.get(_levelKey) ?? '1', '1', reason: 'лестница шагнула на случайных тапах');
  });

  testWidgets('🔴 в классике серия 10 и лестница не двигается', (tester) async {
    SharedPreferences.setMockInitialValues({_levelKey: '5'});
    state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(
        home: WcstScreen(key: const ValueKey('cl'), state: state, classic: true, rnd: Random(3))));
    await tester.pumpAndSettle();
    // Параметры классики: серия 10, а не серия уровня.
    final params = (find.byKey(const Key('wcst-params')).evaluate().first.widget as Text).data!;
    expect(params.contains('10'), isTrue, reason: 'серия классики не названа: $params');
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    // ⚠️ Играем ХОРОШО: партия, которая в уровневом режиме подняла бы ступень.
    var guess = SortRule.color;
    for (var i = 1; i <= 40 /* свободная классика: 40 проб по умолчанию, как у веба, а не число пробы уровня */; i++) {
      final card = targetOnScreen(tester);
      final idx = [0, 1, 2, 3].firstWhere((k) => matchByRule(card, wcstRefCards[k], guess), orElse: () => 0);
      await tester.tap(find.byKey(Key('wcst-ref-$idx')));
      await tester.pump();
      if (!hitShown(tester, idx)) {
        guess = SortRule.values[(SortRule.values.indexOf(guess) + 1) % 3];
      }
      await tester.pump(const Duration(milliseconds: wcstFeedbackMs + 50));
    }
    await tester.pumpAndSettle(
        const Duration(milliseconds: 100), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 5));
    expect(find.byKey(const Key('wcst-verdict')), findsOneWidget);
    expect(state.get(_levelKey), '5', reason: 'классика подвинула лестницу');
  });
  /// Счётчик проб из шапки: «сыграно/всего».
  String roundHud(WidgetTester tester) =>
      tester.widget<GameShell>(find.byType(GameShell)).hud.firstWhere((h) => h.label == L.t('round')).value;

  /// Играет `n` проб тапами по стопкам; возвращает, сколько было верных.
  Future<void> playTrials(WidgetTester tester, int n) async {
    var guess = SortRule.color;
    for (var i = 1; i <= n; i++) {
      final card = targetOnScreen(tester);
      final idx = [0, 1, 2, 3].firstWhere((k) => matchByRule(card, wcstRefCards[k], guess), orElse: () => 0);
      await tester.tap(find.byKey(Key('wcst-ref-$idx')));
      await tester.pump();
      if (!hitShown(tester, idx)) guess = SortRule.values[(SortRule.values.indexOf(guess) + 1) % 3];
      await tester.pump(const Duration(milliseconds: wcstFeedbackMs + 50));
    }
    await tester.pumpAndSettle(
        const Duration(milliseconds: 100), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 5));
  }

  testWidgets('🔴 «Свободно»: выбор режима и числа проб 20/40/60, партия пишется, лестница не двигается', (tester) async {
    // Без выбора «Свободно» классический тест был недостижим из игры (задача 6b801ecb): веб — `GameModeSwitch`.
    SharedPreferences.setMockInitialValues({_levelKey: '5'});
    state = await SharedState.open();
    final sent = <Map<String, dynamic>>[];
    SessionReport.sink = (j) async => sent.add(jsonDecode(j) as Map<String, dynamic>);
    addTearDown(() => SessionReport.sink = null);
    await tester.pumpWidget(MaterialApp(home: WcstScreen(state: state, rnd: Random(3))));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('wcst-mode-levels')), findsOneWidget);
    expect(find.byKey(const Key('wcst-mode-free')), findsOneWidget);
    expect(tester.widget<ChoiceChip>(find.byKey(const Key('wcst-mode-levels'))).selected, isTrue);
    expect(find.byKey(const Key('wcst-trials-20')), findsNothing, reason: 'число проб — только у «Свободно»');
    expect(find.text(L.t('wcstModeLevelsDesc')), findsOneWidget);

    await tester.tap(find.byKey(const Key('wcst-mode-free')));
    await tester.pumpAndSettle();
    expect(find.text(L.t('wcstModeClassicDesc')), findsOneWidget);
    for (final n in [20, 40, 60]) {
      expect(find.byKey(Key('wcst-trials-$n')), findsOneWidget, reason: 'нет плашки $n проб');
    }
    expect(tester.widget<ChoiceChip>(find.byKey(const Key('wcst-trials-40'))).selected, isTrue);
    await tester.tap(find.byKey(const Key('wcst-trials-20')));
    await tester.pumpAndSettle();
    final params = (find.byKey(const Key('wcst-params')).evaluate().first.widget as Text).data!;
    expect(params.contains('20'), isTrue, reason: 'число проб 20 не доехало до строки параметров: $params');

    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    expect(roundHud(tester), '1/20', reason: 'в партии должно быть 20 проб');
    await playTrials(tester, 20);
    expect(find.byKey(const Key('wcst-verdict')), findsOneWidget);
    expect(state.get(_levelKey), '5', reason: 'свободная партия подвинула лестницу');
    expect(sent, hasLength(1), reason: 'свободная партия обязана записаться (веб saveSession)');
    final r = sent.single;
    expect(r['game_type'], 'wcst');
    expect(r['mode'], 'classic_20t', reason: 'метка классики — по ней «Оценка» узнаёт партию');
    final d = r['details'] as Map<String, dynamic>;
    expect(d.containsKey('perseverative'), isTrue, reason: 'клиническая метрика обязательна по схеме');
    expect(d['n_trials'], 20);
    expect(d.containsKey('level'), isFalse, reason: 'в классике колода канонная — уровня в записи нет');
  });

  testWidgets('шаг зарядки — классика без выбора режима, число проб из адреса', (tester) async {
    GamePreset.set({'wu': '1', 'trials': '24'});
    addTearDown(GamePreset.clear);
    await tester.pumpWidget(MaterialApp(home: WcstScreen(state: state, rnd: Random(3))));
    await tester.pump();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.byKey(const Key('wcst-mode-free')), findsNothing, reason: 'в шаге зарядки режим задан шагом');
    expect(roundHud(tester), '1/24', reason: 'число проб шага зарядки не доехало');
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('🔴 уровневая партия пишет клиническую метрику и звёзды по персеверациям', (tester) async {
    final sent = <Map<String, dynamic>>[];
    SessionReport.sink = (j) async => sent.add(jsonDecode(j) as Map<String, dynamic>);
    addTearDown(() => SessionReport.sink = null);
    await tester.pumpWidget(MaterialApp(home: WcstScreen(state: state, rnd: Random(4))));
    await tester.pumpAndSettle();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    await playTrials(tester, WcstLevel.of(1).trials);
    expect(sent, hasLength(1));
    final d = sent.single['details'] as Map<String, dynamic>;
    expect(d.containsKey('perseverative'), isTrue);
    expect(d['level'], 1, reason: 'в уровневом режиме условие партии пишется');
    expect(wcstStars(0), 3);
    expect(wcstStars(2), 2);
    expect(wcstStars(3), 1);
  });

  testWidgets('🔴 по умолчанию карту ТАЩАТ под стопку; тап по стопке тоже кладёт; выбор ввода запоминается', (tester) async {
    await tester.pumpWidget(MaterialApp(home: WcstScreen(key: const ValueKey('drag'), state: state, rnd: Random(4))));
    await tester.pumpAndSettle();
    expect(tester.widget<ChoiceChip>(find.byKey(const Key('wcst-input-drag'))).selected, isTrue,
        reason: 'перетаскивание — по умолчанию (решение Дениса 13.11)');
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    // Тащим карту на стопку: ответ засчитан, на стопке отклик.
    final from = tester.getCenter(find.byKey(const Key('wcst-target')));
    final to = tester.getCenter(find.byKey(const Key('wcst-ref-2')));
    await tester.timedDragFrom(from, to - from, const Duration(milliseconds: 400));
    await tester.pump();
    final border = ((tester.widget<Container>(find.byKey(const Key('wcst-ref-2'))).decoration! as BoxDecoration).border!
        as Border).top.color;
    expect(border == const Color(0xFF22C55E) || border == const Color(0xFFEF4444), isTrue,
        reason: 'карта брошена на стопку 2 — отклика нет');
    // ⚠️ Правило не показывается: верна стопка или нет — решает только игра.
    await tester.pump(const Duration(milliseconds: wcstFeedbackMs + 50));
    // Тап по стопке — запасной ввод: единственная карта на столе кладётся сразу.
    await tester.tap(find.byKey(const Key('wcst-ref-0')));
    await tester.pump();
    final tapped = ((tester.widget<Container>(find.byKey(const Key('wcst-ref-0'))).decoration! as BoxDecoration).border!
        as Border).top.color;
    expect(tapped == const Color(0xFF22C55E) || tapped == const Color(0xFFEF4444), isTrue,
        reason: 'тап по стопке не положил карту');
    await tester.pumpWidget(const SizedBox.shrink());

    // «Нажимать»: выбор помнится и после перезапуска экрана.
    await tester.pumpWidget(MaterialApp(home: WcstScreen(key: const ValueKey('tap'), state: state, rnd: Random(4))));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('wcst-input-tap')));
    await tester.pumpAndSettle();
    expect(state.get('psygames_wcst_input'), 'tap');
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpWidget(MaterialApp(home: WcstScreen(key: const ValueKey('again'), state: state, rnd: Random(4))));
    await tester.pumpAndSettle();
    expect(tester.widget<ChoiceChip>(find.byKey(const Key('wcst-input-tap'))).selected, isTrue,
        reason: 'выбор ввода не запомнился');
  });
  for (final lang in ['ru', 'en', 'de', 'hi']) {
    testWidgets('настройка и партия WCST не ломают раскладку: $lang, 320 px, шрифт ×1,5', (tester) async {
      await L.load(lang);
      tester.view.physicalSize = const Size(320, 568) * 3;
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      Widget app() => MaterialApp(
            builder: (c, child) =>
                MediaQuery(data: MediaQuery.of(c).copyWith(textScaler: const TextScaler.linear(1.5)), child: child!),
            home: WcstScreen(state: state, rnd: Random(4)),
          );
      await tester.pumpWidget(app());
      await tester.pumpAndSettle();
      // Настройка прокручивается (три выбора на 320 px при шрифте ×1,5): чип сперва выводим на экран.
      await tester.ensureVisible(find.byKey(const Key('wcst-mode-free')));
      await tester.tap(find.byKey(const Key('wcst-mode-free')));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: 'настройка «Свободно»: переполнение');
      // «Начать» прибита снизу и видна без прокрутки, хотя на экране три выбора.
      expect(tester.getRect(find.text(L.t('start'))).bottom, lessThanOrEqualTo(568), reason: 'кнопка «Начать» ушла за экран');
      await tester.tap(find.text(L.t('start')));
      await tester.pump();
      expect(tester.takeException(), isNull, reason: 'партия (перетаскивание): переполнение');
      for (var i = 0; i < 4; i++) {
        expect(tester.getRect(find.byKey(Key('wcst-ref-$i'))).right, lessThanOrEqualTo(320), reason: 'стопка $i вышла за экран');
      }
      await tester.pumpWidget(const SizedBox.shrink());
      await L.load('ru');
    });
  }
}
