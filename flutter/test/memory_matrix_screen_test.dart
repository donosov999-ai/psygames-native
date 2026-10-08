import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/memory_matrix/model.dart';
import 'package:psygames_flutter/games/memory_matrix/screen.dart';
import 'package:psygames_flutter/shell/app_haptics.dart';
import 'package:psygames_flutter/shell/demo_lesson.dart';
import 'package:psygames_flutter/shell/game_clock.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/game_rules.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/level_rules.dart';
import 'package:psygames_flutter/shell/preset_cap.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'support/settings_fit.dart';

/// 🔴 «МАТРИЦА ПАМЯТИ» ИГРАЕТСЯ НАЖАТИЯМИ, РАСКЛАД ЧИТАЕТСЯ С ПОЛЯ.
///
/// Какие клетки горят и каким цветом — проба считывает с экрана во время показа, как видит
/// человек; подсмотреть раздачу в модели значило бы пройти пробу и при сломанном показе.
/// Отчёт уровня перехватывается: метки веба, details и длительность в секундах.
void main() {
  late SharedState state;
  final sent = <Map<String, dynamic>>[];

  setUpAll(() async {
    await L.load('ru');
    await LevelRules.load();
  });

  Future<void> boot(WidgetTester tester,
      {int level = 1, Map<String, String>? preset, int seed = 7, Map<String, String> extra = const {}}) async {
    // Паузы показа идут на игровых часах — им нужно поддельное время пробы.
    gameWallMs = () => tester.binding.clock.now().millisecondsSinceEpoch;
    SharedPreferences.setMockInitialValues({
      'psygames_memory_matrix_level_nzt48': '$level',
      // Карточки правил уровня проба уже «видела»: они ложатся в спокойный момент и закрыли бы поле.
      for (final k in ['grid6', 'fast', 'two_series', 'decoys']) LevelRules.seenKey('memory_matrix', k): '1',
      ...extra,
    });
    state = await SharedState.open();
    sent.clear();
    SessionReport.sink = (json) async => sent.add(jsonDecode(json) as Map<String, dynamic>);
    if (preset != null) GamePreset.set(preset);
    // Линейный конгруэнтный поток на ЦЕЛОМ состоянии: на дроби он сходится к ≈0,22 и раздавал
    // каждый раунд почти одно и то же поле (01.10.2026, найдено на «Цифровом ряде»).
    var st = seed;
    double rng() {
      st = (st * 9301 + 49297) % 233280;
      return st / 233280;
    }
    await tester.pumpWidget(MaterialApp(home: MemoryMatrixScreen(key: UniqueKey(), state: state, rng: rng)));
    for (var i = 0; i < 5; i++) {
      await tester.pump();
    }
  }

  tearDown(() {
    gameWallMs = () => DateTime.now().millisecondsSinceEpoch;
    GamePreset.clear();
    SessionReport.sink = null;
  });

  /// Состояние каждой клетки поля партии — из самой клетки (подпись скринридера теперь словами).
  Map<int, String> cells(WidgetTester tester) => {
        for (final c in find.byType(MatrixCellView).evaluate().map((e) => e.widget as MatrixCellView))
          if (c.keyPrefix == 'mm-cell-') c.index: c.state.name,
      };

  /// Подписи клеток для скринридера — как их прочтёт TalkBack / VoiceOver.
  List<String> cellLabels(WidgetTester tester) => [
        for (final c in find.byType(MatrixCellView).evaluate().map((e) => e.widget as MatrixCellView))
          if (c.keyPrefix == 'mm-cell-')
            find
                .descendant(of: find.byWidget(c), matching: find.byType(Semantics))
                .evaluate()
                .map((e) => (e.widget as Semantics).properties.label ?? '')
                .firstWhere((l) => l.isNotEmpty, orElse: () => ''),
      ];

  Set<int> inState(WidgetTester tester, String s) => {for (final e in cells(tester).entries) if (e.value == s) e.key};
  String caption(WidgetTester tester) => tester.widget<Text>(find.byKey(const Key('mm-caption'))).data ?? '';

  Future<void> pumpUntil(WidgetTester tester, bool Function() ok, {int maxMs = 15000}) async {
    for (var t = 0; t < maxMs && !ok(); t += 50) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    expect(ok(), isTrue, reason: 'не дождались за $maxMs мс');
  }

  bool hud(String key, String value) => find
      .byWidgetPredicate((w) => w is Semantics && w.properties.label == '${L.t(key)}: $value')
      .evaluate()
      .isNotEmpty;

  /// Показ серии: дождаться, пока клетки загорятся, и запомнить их — как человек.
  Future<Set<int>> watch(WidgetTester tester, {String state = 'lit'}) async {
    await pumpUntil(tester, () => inState(tester, state).isNotEmpty);
    return inState(tester, state);
  }

  Future<void> tapAll(WidgetTester tester, Iterable<int> cs) async {
    for (final c in cs) {
      await tester.tap(find.byKey(Key('mm-cell-$c')));
      await tester.pump();
    }
  }

  Future<void> settleReport(WidgetTester tester) async {
    for (var i = 0; i < 5; i++) {
      await tester.pump();
    }
  }

  testWidgets('🔴 уровень нажатиями: 10 раундов, пауза на чтение только в первом; отчёт метками веба',
      (tester) async {
    await boot(tester, level: 1);
    await tester.tap(find.byKey(const Key('mm-start')));
    await tester.pump();
    expect(caption(tester), L.t('matrixMemorize'), reason: 'подпись видна ДО первой вспышки');
    await tester.pump(const Duration(milliseconds: 650));
    expect(inState(tester, 'lit'), isEmpty, reason: 'пауза на чтение: клетки тёмные, пока читается задание');
    var taps = 0;
    for (var round = 1; round <= mmTotalRounds; round++) {
      if (round > 1) {
        expect(inState(tester, 'lit'), isNotEmpty,
            reason: 'раунд $round: ту же подпись второй раз не читают — клетки горят сразу');
      }
      final lit = await watch(tester);
      expect(lit.length, cellsNeeded(1, round, 'static').need, reason: 'раунд $round');
      await pumpUntil(tester, () => caption(tester) == L.t('matrixRecall'));
      expect(inState(tester, 'lit'), isEmpty, reason: 'на вводе клетки погашены');
      await tapAll(tester, lit);
      taps += lit.length;
      expect(caption(tester), L.t('matrixGood'));
      await tester.pump(const Duration(milliseconds: mmFeedbackMs + 20));
    }
    await settleReport(tester);
    expect(find.byKey(const Key('mm-again')), findsOneWidget);
    expect(hud('round', '$mmTotalRounds/$mmTotalRounds'), isTrue);
    expect(hud('level', '2'), isTrue, reason: 'без ошибок — уровень растёт');
    final s = sent.single;
    expect('${s['game_type']} ${s['difficulty']} / ${s['mode']}', 'memory_matrix 3x3 / 10r',
        reason: 'метки — как пишет веб-экран');
    expect(s['details'], {'level': 1, 'hits': taps, 'finalRound': mmTotalRounds});
    expect(s['score'], taps * 10);
    expect(s['time_seconds'] as int, inInclusiveRange(10, 120), reason: 'секунды уровня, а не отметка времени');
    expect(hud('hud_best', '$taps'), isTrue, reason: 'рекорд серии побит в этой партии и виден');
    expect(state.get(mmBestStreakKey), '$taps', reason: 'рекорд в памяти: мост возит веб-пространство psygames.');
  });

  testWidgets('🔴 две серии (L11): фиолетовая, потом красная; ввод в том же порядке', (tester) async {
    await boot(tester, level: 11);
    await tester.tap(find.byKey(const Key('mm-start')));
    await tester.pump();
    expect(caption(tester), L.t('mmMemorizePurple'));
    final purple = await watch(tester);
    final red = await watch(tester, state: 'lit2');
    expect(inState(tester, 'lit'), isEmpty, reason: 'серии горят по очереди, не вместе');
    expect(purple.intersection(red), isEmpty, reason: 'серии не пересекаются');
    expect([purple.length, red.length], [cellsNeeded(11, 1, 'static').need, cellsNeeded(11, 1, 'static').need]);
    await pumpUntil(tester, () => caption(tester) == L.t('mmPurpleFirst'));
    await tapAll(tester, purple);
    expect(caption(tester), L.t('mmNowRed'), reason: 'первая собрана — теперь красная');
    expect(inState(tester, 'correct'), isEmpty, reason: 'отметки второй серии считаются заново');
    await tapAll(tester, red);
    expect(caption(tester), L.t('matrixGood'));
    // Итог раунда: верно введены ОБЕ серии. До 02.10 фиолетовые здесь стояли «пропущенными».
    expect(inState(tester, 'correct'), {...purple, ...red});
    expect(inState(tester, 'missed'), isEmpty, reason: 'фиолетовые введены — они не пропущены');
    await tester.tap(find.byTooltip(L.t('restart')));
    await tester.pump();
  });

  testWidgets('🔴 две серии: красная клетка, нажатая раньше фиолетовых, — промах', (tester) async {
    await boot(tester, level: 11);
    await tester.tap(find.byKey(const Key('mm-start')));
    await tester.pump();
    await watch(tester);
    final red = await watch(tester, state: 'lit2');
    await pumpUntil(tester, () => caption(tester) == L.t('mmPurpleFirst'));
    await tapAll(tester, [red.first]);
    expect(caption(tester), L.t('matrixMissed'));
    expect(inState(tester, 'wrong'), {red.first}, reason: 'красная, нажатая вместо фиолетовой, — с крестом, а не «верно»');
    await tester.tap(find.byTooltip(L.t('restart')));
    await tester.pump();
  });

  testWidgets('🔴 режим «по порядку»: клетки по одной, ввод в порядке загорания; не в свой черёд — промах',
      (tester) async {
    await boot(tester, level: 2);
    await tester.tap(find.text(L.t('label_mode_sequential')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('mm-start')));
    await tester.pump();
    Future<List<int>> watchSeq() async {
      final order = <int>[];
      var prev = -1;
      await pumpUntil(tester, () => inState(tester, 'lit').isNotEmpty);
      for (var t = 0; t < 15000 && caption(tester) != L.t('matrixRecall'); t += 50) {
        final lit = inState(tester, 'lit');
        expect(lit.length, lessThanOrEqualTo(1), reason: 'в режиме «по порядку» горит одна клетка');
        final now = lit.isEmpty ? -1 : lit.first;
        if (now >= 0 && now != prev) order.add(now);
        prev = now;
        await tester.pump(const Duration(milliseconds: 50));
      }
      return order;
    }

    final first = await watchSeq();
    expect(first.length, cellsNeeded(2, 1, 'sequential').need);
    await tapAll(tester, first);
    expect(caption(tester), L.t('matrixGood'));
    await tester.pump(const Duration(milliseconds: mmFeedbackMs + 20));
    final second = await watchSeq();
    await tapAll(tester, [second[1]]);
    expect(caption(tester), L.t('matrixMissed'), reason: 'верная клетка не в свой черёд — промах');
    // Итог раунда: нажатая не в свой черёд — с крестом. До 02.10 она горела «верно».
    expect(inState(tester, 'wrong'), {second[1]});
    expect(inState(tester, 'correct'), isEmpty);
    await tester.tap(find.byTooltip(L.t('restart')));
    await tester.pump();
  });

  testWidgets('🔴 «по порядку» с L16: ложные вспыхивают с крестом вперемешку с серией; ввод — серия без них',
      (tester) async {
    await boot(tester, level: 16);
    await tester.tap(find.text(L.t('label_mode_sequential')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('mm-start')));
    await tester.pump();
    expect(caption(tester), contains(L.t('mmIgnoreCrossed')), reason: 'подпись говорит: перечёркнутые — мимо');
    final order = <int>[];
    final crossed = <int>{};
    var prev = -1;
    for (var t = 0; t < 30000 && caption(tester) != L.t('matrixRecall'); t += 50) {
      final lit = inState(tester, 'lit');
      expect(lit.length, lessThanOrEqualTo(1), reason: 'в режиме «по порядку» горит одна клетка');
      crossed.addAll(inState(tester, 'wrong'));
      final now = lit.isEmpty ? -1 : lit.first;
      if (now >= 0 && now != prev) order.add(now);
      prev = now;
      await tester.pump(const Duration(milliseconds: 50));
    }
    expect(crossed.length, LevelParams.of(16).decoys, reason: 'ложная вспышка видна крестом и в этом режиме');
    expect(crossed.intersection(order.toSet()), isEmpty);
    expect(order.length, cellsNeeded(16, 1, 'sequential').need);
    await tapAll(tester, order);
    expect(caption(tester), L.t('matrixGood'), reason: 'серия в порядке загорания, ложные пропущены');
    await tester.tap(find.byTooltip(L.t('restart')));
    await tester.pump();
  });

  test('порядок показа «по порядку»: серия в своём порядке, ложные — ровно по ряду, без новой случайности', () {
    final seq = [for (var i = 0; i < 13; i++) i];
    final show = mmSeqShowOrder(seq, [90, 91]);
    expect([for (final s in show) if (!s.decoy) s.cell], seq, reason: 'серия не переставлена');
    expect([for (var i = 0; i < show.length; i++) if (show[i].decoy) i], [4, 9], reason: '13 настоящих: ложные после 4-й и 8-й');
    expect(mmSeqShowOrder(seq, const []).every((s) => !s.decoy), isTrue);
  });

  testWidgets('🔴 L16: ложная вспышка с крестом не входит в ответ; удержание перед вводом', (tester) async {
    await boot(tester, level: 16);
    await tester.tap(find.byKey(const Key('mm-start')));
    await tester.pump();
    expect(caption(tester), contains(L.t('mmIgnoreCrossed')), reason: 'подпись говорит: перечёркнутые — мимо');
    final purple = await watch(tester);
    final crossed = inState(tester, 'wrong');
    expect(crossed.length, LevelParams.of(16).decoys, reason: 'ложная вспышка видна крестом');
    expect(crossed.intersection(purple), isEmpty);
    await pumpUntil(tester, () => caption(tester) == L.t('memorize'));
    expect(inState(tester, 'lit').length + inState(tester, 'lit2').length, 0, reason: 'удержание: поле пустое');
    await tester.tap(find.byKey(Key('mm-cell-${purple.first}')), warnIfMissed: false);
    await tester.pump();
    expect(inState(tester, 'correct'), isEmpty, reason: 'во время удержания нажатия не принимаются');
    await tester.pump(Duration(milliseconds: LevelParams.of(16).holdMs + 50));
    expect(caption(tester), L.t('mmPurpleFirst'), reason: 'после удержания — ввод');
    await tapAll(tester, [crossed.first]);
    expect(caption(tester), L.t('matrixMissed'), reason: 'ложную не запоминают — нажать её значит ошибиться');
    await tester.tap(find.byTooltip(L.t('restart')));
    await tester.pump();
  });

  testWidgets('🔴 шаг зарядки: стартует сам, сетка под потолком уровня во ВСЕХ раундах, лестница стоит',
      (tester) async {
    await boot(tester, level: 1, preset: {'wu': '1', 'size': '5', 'mode': 'static'});
    expect(find.byKey(const Key('mm-start')), findsNothing, reason: 'шаг стартует сам');
    final grid = capPresetByLevel(want: 5, atLevel: LevelParams.of(1).gridSize, atTop: false);
    for (var round = 1; round <= mmTotalRounds; round++) {
      expect(cells(tester).length, grid * grid, reason: 'раунд $round: шаг просит 5×5, освоено 3×3 — даём 4×4');
      final lit = await watch(tester);
      expect(lit.length, cellsNeeded(1, round, 'static', preset: true).need);
      await pumpUntil(tester, () => caption(tester) == L.t('matrixRecall'));
      await tapAll(tester, lit);
      await tester.pump(const Duration(milliseconds: mmFeedbackMs + 20));
    }
    await settleReport(tester);
    expect('${sent.single['difficulty']} / ${sent.single['mode']}', '${grid}x$grid / 10r');
    expect(state.get('psygames_memory_matrix_level_nzt48'), '1', reason: 'шаг зарядки личный уровень не двигает');
    // Шаг зачёта не имеет: итог — «Готово!», а не «Промах» при нуле ошибок (сверка 02.10).
    expect(caption(tester), L.t('done'));
    expect(
        find.byWidgetPredicate((w) => w is Semantics && (w.properties.label ?? '').startsWith('${L.t('level')}: ')),
        findsNothing,
        reason: 'в шаге играется пресет — номера личного уровня в шапке нет (как у «Корси»)');
  });

  // Замер 02.10: короткое правило по адресу — карточка набора «Позиции» (`suitePositionsDesc`, текст
  // про три игры сразу). С 2.56.12 справка из партии — полный текст из общего реестра
  // (`GameRules.fullKeyFor`), у «Матрицы» он свой. Проба держит, чтобы текст набора не вернулся.
  testWidgets('🔴 справка «?» — про ЭТУ игру, а не про весь набор «Позиции» (приёмка §4б, п. 1)', (tester) async {
    await tester.runAsync(GameRules.load);
    GameRules.currentRoute = '/games/memory-matrix';
    addTearDown(() => GameRules.currentRoute = null);
    expect(GameRules.fullKeyFor('/games/memory-matrix'), 'memoryMatrixIntroDesc');
    await boot(tester, level: 1);
    await tester.tap(find.byIcon(Icons.help_outline));
    await tester.pumpAndSettle();
    final text = tester.widget<Text>(find.byKey(const Key('game-rules-text'))).data;
    expect(text, L.t('memoryMatrixIntroDesc'));
    expect(text, isNot(L.t('suitePositionsDesc')));
    await tester.tap(find.byKey(const Key('game-rules-close')));
    await tester.pumpAndSettle();
  });

  testWidgets('🔴 «Заново» снимает отметку разбора — следующая партия снова зачётная', (tester) async {
    await boot(tester, level: 1);
    LessonUsed.mark();
    await tester.tap(find.byTooltip(L.t('restart')).first);
    await tester.pump();
    expect(LessonUsed.inRound, isFalse);
  });

  testWidgets('🔴 скринридер: клетка — строка, колонка и состояние словами, не отладочный id', (tester) async {
    await boot(tester, level: 1);
    await tester.tap(find.byKey(const Key('mm-start')));
    await tester.pump();
    final lit = await watch(tester);
    final c = lit.first;
    expect(cellLabels(tester), contains('${L.t('a11yRow')} ${c ~/ 3 + 1}, ${L.t('a11yCol')} ${c % 3 + 1}, ${L.t('a11yLit')}'));
    await pumpUntil(tester, () => caption(tester) == L.t('matrixRecall'));
    await tapAll(tester, [c]);
    final labels = cellLabels(tester);
    expect(labels, contains('${L.t('a11yRow')} ${c ~/ 3 + 1}, ${L.t('a11yCol')} ${c % 3 + 1}, ${L.t('a11yCorrect')}'));
    expect(labels.where((l) => l.startsWith('mm-cell-') || l.isEmpty), isEmpty, reason: 'подписи: $labels');
    expect(labels.length, 9);
    await tester.tap(find.byTooltip(L.t('restart')));
    await tester.pump();
  });

  testWidgets('🔴 интерфейс на английском — подписи из словаря, ни одной русской буквы', (tester) async {
    await L.load('en');
    addTearDown(() => L.load('ru'));
    await boot(tester, level: 16);
    String screenText() => find.byType(Text).evaluate().map((e) => (e.widget as Text).data ?? '').join(' | ');
    expect(RegExp(r'[А-Яа-яЁё]').hasMatch(screenText()), isFalse, reason: 'экран старта: ${screenText()}');
    await tester.tap(find.byKey(const Key('mm-start')));
    await tester.pump();
    expect(caption(tester), '${L.t('mmMemorizePurple')} · ${L.t('mmIgnoreCrossed')}');
    expect(RegExp(r'[А-Яа-яЁё]').hasMatch(screenText()), isFalse, reason: 'показ: ${screenText()}');
    await tester.tap(find.byTooltip(L.t('restart')));
    await tester.pump();
  });

  testWidgets('🔴 «Показать решение»: серии раскрыты своими цветами; партия не засчитана', (tester) async {
    await boot(tester, level: 11);
    await tester.tap(find.byKey(const Key('mm-start')));
    await tester.pump();
    final purple = await watch(tester);
    final red = await watch(tester, state: 'lit2');
    await pumpUntil(tester, () => caption(tester) == L.t('mmPurpleFirst'));
    await tester.tap(find.byTooltip(L.t('puzzleShowSolution')));
    await tester.pump();
    expect(inState(tester, 'lit'), purple);
    expect(inState(tester, 'lit2'), red);
    await tester.pump(const Duration(seconds: 5));
    expect(sent, isEmpty, reason: 'показанное решение в статистику и лестницу не идёт');
    expect(hud('level', '11'), isTrue);
    expect(find.byKey(const Key('mm-again')), findsOneWidget);
  });

  testWidgets('протяжка пальцем по полю отмечает клетки под ним', (tester) async {
    await boot(tester, level: 3);
    await tester.tap(find.byKey(const Key('mm-start')));
    await tester.pump();
    final lit = await watch(tester);
    await pumpUntil(tester, () => caption(tester) == L.t('matrixRecall'));
    const n = 5;   // L3 — сетка 5×5
    final from = lit.first;
    final row = from ~/ n;
    final to = from % n < n ~/ 2 ? row * n + n - 1 : row * n;   // к дальнему краю ряда
    final a = tester.getCenter(find.byKey(Key('mm-cell-$from')));
    final b = tester.getCenter(find.byKey(Key('mm-cell-$to')));
    final g = await tester.startGesture(a);
    for (var k = 1; k <= 12; k++) {
      await g.moveTo(Offset.lerp(a, b, k / 12)!);
      await tester.pump();
    }
    await g.up();
    await tester.pump();
    final marked = {...inState(tester, 'correct'), ...inState(tester, 'wrong')};
    expect(marked.contains(from), isTrue, reason: 'клетка, с которой начали протяжку, отмечена');
    expect(marked.length, greaterThan(1), reason: 'протяжка отметила больше одной клетки: $marked');
    await tester.tap(find.byTooltip(L.t('restart')));
    await tester.pump();
  });

  testWidgets('🔴 разбор открывается ДО партии; примеры — на поле самой игры', (tester) async {
    await boot(tester, level: 1);
    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pumpAndSettle();
    expect(find.byType(DemoCard), findsWidgets);
    expect(find.byKey(const Key('lesson-mm-0')), findsWidgets, reason: 'в разборе — поле самой игры');
    final trials = memoryMatrixLessonTrials();
    expect(trials.map((t) => t.rule).toList(),
        [L.t('teachMatrixShape'), L.t('lr_memory_matrix_two_series_rule'), L.t('lr_memory_matrix_decoys_rule')]);
    expect(trials.every((t) => t.art is MatrixGridView), isTrue);
  });

  testWidgets('вибрация нажатия — только при включённом тумблере «Вибрация»', (tester) async {
    final buzz = <String>[];
    final messenger = tester.binding.defaultBinaryMessenger;
    messenger.setMockMethodCallHandler(SystemChannels.platform, (c) async {
      if (c.method == 'HapticFeedback.vibrate') buzz.add('${c.arguments}');
      return null;
    });
    addTearDown(() => messenger.setMockMethodCallHandler(SystemChannels.platform, null));
    for (final on in [true, false]) {
      buzz.clear();
      await boot(tester, level: 1, extra: {hapticKey: '$on'});
      await tester.tap(find.byKey(const Key('mm-start')));
      await tester.pump();
      final lit = await watch(tester);
      await pumpUntil(tester, () => caption(tester) == L.t('matrixRecall'));
      await tapAll(tester, [lit.first]);
      expect(buzz.length, on ? 1 : 0, reason: 'тумблер ${on ? 'включён' : 'выключен'}: $buzz');
      if (on) {
        // Клетка — лёгкий щелчок, собранный раунд — отклик сильнее (у веба — двойной импульс успеха).
        await tapAll(tester, lit.skip(1));
        expect(buzz.first, 'HapticFeedbackType.selectionClick');
        expect(buzz.last, 'HapticFeedbackType.mediumImpact', reason: 'раунд собран: $buzz');
      }
      await tester.tap(find.byTooltip(L.t('restart')));
      await tester.pump();
    }
  });

  testWidgets('уход с экрана посреди показа гасит таймеры', (tester) async {
    await boot(tester, level: 5);
    await tester.tap(find.byKey(const Key('mm-start')));
    await tester.pump(const Duration(milliseconds: 100));
    // Без прокрутки времени: таймер, переживший экран, проба поймает сама — «Timer is still pending».
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('🔴 настройка влезает в 360×640 по-английски и по-русски: «Начать» видна, ничего за краем (ae1d918b)',
      (tester) async {
    await expectSettingsFit(tester, () => boot(tester, level: 16), where: 'memory-matrix L16 (ложные вспышки)');
  });

  testWidgets('🔴 партия на 360×640: органы ответа целиком на экране (или в прокрутке поля), не меньше 48×48 (приёмка 6596a00d)',
      (tester) async {
    await expectPlayFit(tester, () async {
      await boot(tester, level: 16);
      await tester.tap(find.byKey(const Key('mm-start')));
      await tester.pump();
      await pumpUntil(tester, () => caption(tester) == L.t('mmPurpleFirst'));
    }, where: 'memory-matrix L16, ввод');
    await tester.pumpWidget(const SizedBox());
  });
}
