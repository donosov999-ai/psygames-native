import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/fillwords/core/fillwords.dart';
import 'package:psygames_flutter/games/proofreading/fillwords_field.dart';
import 'package:psygames_flutter/games/proofreading/model.dart';
import 'package:psygames_flutter/games/proofreading/screen.dart';
import 'package:psygames_flutter/games/proofreading/series/series_blocks.dart';
import 'package:psygames_flutter/games/proofreading/series/series_data.dart';
import 'package:psygames_flutter/games/proofreading/series/series_field.dart';
import 'package:psygames_flutter/games/proofreading/series/series_play.dart';
import 'package:psygames_flutter/shell/aux_action.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// СЕРИЯ «КОРРЕКТУРЫ» НА ЭКРАНЕ (задача f4bb47dc): ДВЕРЬ, ТРИ БЛОКА, ВРЕЗКА, ИТОГ.
///
/// Натив серии не знал: вход «Блоки корректуры» молча давал одну обычную партию, а двери на
/// настройке не было вовсе. Пробы играют серию НАЖАТИЯМИ и протягиваниями по полю, собранному
/// тем же ядром с тем же зерном, и смотрят на экран и на отправленную партию.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late SharedState state;
  late ProofSeriesData data;
  late FillwordsPool en;
  final sent = <Map<String, dynamic>>[];

  setUpAll(() async {
    data = await ProofSeriesData.load();
    en = await loadWordPool('en');
  });

  Future<void> fresh({String? progress}) async {
    SharedPreferences.setMockInitialValues({
      if (progress != null) '${SharedState.prefix}proofreading_series_nzt48': progress,
    });
    state = await SharedState.open();
  }

  setUp(() async {
    await fresh();
    await L.load('en');
    final ref = jsonDecode(File('test/fixtures/proofreading-reference.json').readAsStringSync())
        as Map<String, dynamic>;
    ProofScripts.useForTest((ref['scripts'] as Map).map((k, v) => MapEntry('$k', '$v')), '${ref['digits']}');
    sent.clear();
    SessionReport.sink = (j) async => sent.add(jsonDecode(j) as Map<String, dynamic>);
  });
  tearDown(() {
    GamePreset.clear();
    SessionReport.sink = null;
  });

  Future<void> open(WidgetTester tester, {int seed = 40}) async {
    await tester.pumpWidget(MaterialApp(
        home: ProofreadingScreen(
            state: state, fwSeed: seed, clock: () => tester.binding.clock.now().millisecondsSinceEpoch)));
    await tester.pumpAndSettle();
  }

  /// Поле серии, которое соберёт экран: зерно двери — зерно экрана + 1, вход — по прогрессу.
  ProofField fieldOf(int seed, {ProofSeriesProgress? progress}) {
    final entry = proofSeriesEntry(progress ?? emptyProofProgress, fillwordsLevel(1).rows);
    return buildProofField(data, en, 'en', entry.level, seed + 1);
  }

  Future<void> enter(WidgetTester tester) async {
    await tester.tap(find.byKey(const Key('proof-series-door')));
    for (var i = 0; i < 20 && find.byKey(const Key('ser-block')).evaluate().isEmpty; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    expect(find.byKey(const Key('ser-block')), findsOneWidget, reason: 'серия не началась');
  }

  Future<void> tapCell(WidgetTester tester, int i) async {
    await tester.tap(find.byKey(Key('ser-cell-$i')));
    await tester.pump(const Duration(milliseconds: 300));
  }

  Future<void> trace(WidgetTester tester, List<int> path) async {
    final g = await tester.startGesture(tester.getCenter(find.byKey(Key('ser-cell-${path.first}'))));
    await tester.pump(const Duration(milliseconds: 100));
    for (final c in path.skip(1)) {
      await g.moveTo(tester.getCenter(find.byKey(Key('ser-cell-$c'))));
      await tester.pump(const Duration(milliseconds: 100));
    }
    await g.up();
    await tester.pump(const Duration(milliseconds: 100));
  }

  Future<void> passInterlude(WidgetTester tester) async {
    expect(find.byKey(const Key('ser-interlude')), findsOneWidget, reason: 'нет врезки с правилом следующего блока');
    await tester.pump(const Duration(milliseconds: proofInterludeMs + 100));
    expect(find.byKey(const Key('ser-interlude')), findsNothing, reason: 'врезка не увела в следующий блок');
  }

  /// Серия целиком: промах в «Знаке», все знаки; все слова; чужое слово и слова категории.
  Future<void> playAll(WidgetTester tester, ProofField f, {bool clean = false}) async {
    if (!clean) await tapCell(tester, f.puzzle.letters.indexWhere((ch) => !f.signs.contains(ch)));
    for (final c in f.signCells) {
      await tapCell(tester, c);
    }
    await passInterlude(tester);
    for (final w in f.puzzle.words) {
      await trace(tester, w.path);
    }
    await passInterlude(tester);
    if (!clean) {
      final foreign = [for (var i = 0; i < f.puzzle.words.length; i++) if (!f.senseWords.contains(i)) i].first;
      await trace(tester, f.puzzle.words[foreign].path);
    }
    for (final i in f.senseWords) {
      await trace(tester, f.puzzle.words[i].path);
    }
  }

  testWidgets('🔴 дверь серии → три блока по одному полю → итог с разностями; партия и прогресс записаны', (tester) async {
    await open(tester);
    final f = fieldOf(40);
    expect(tester.widget<Text>(find.byKey(const Key('proof-series-starts'))).data,
        interpolate(data.strings('en').startsAt, {'size': 5}));
    await enter(tester);
    final chip = find.descendant(of: find.byKey(const Key('ser-sign-0')), matching: find.byType(Text));
    expect((chip.evaluate().single.widget as Text).data, f.signs.first, reason: 'знак блока не тот');
    for (var i = 0; i < f.puzzle.letters.length; i++) {
      final t = find.descendant(of: find.byKey(Key('ser-cell-$i')), matching: find.byType(Text));
      expect((t.evaluate().single.widget as Text).data, f.puzzle.letters[i], reason: 'клетка $i не та — поле не того зерна');
    }
    await playAll(tester, f);
    expect(find.byKey(const Key('ser-result')), findsOneWidget, reason: 'нет итога серии');
    expect(find.byKey(const Key('ser-segment')), findsOneWidget, reason: 'нет цены сегментации');
    expect(find.byKey(const Key('ser-sense')), findsOneWidget, reason: 'нет цены смысла');
    final r = sent.single;
    expect(r['game_type'], proofSeriesGameType);
    expect(r['difficulty'], '5x5');
    expect(r['errors'], 2, reason: 'промах «Знака» и чужое слово «Смысла»');
    final d = r['details'] as Map<String, dynamic>;
    expect(d['series_complete'], isTrue);
    expect((d['blocks'] as List).map((b) => b['key']), proofSeriesPlan);
    expect((d['diffs'] as Map).keys, containsAll(['word_minus_sign', 'sense_minus_sign']));
    final p = parseProofProgress(state.get(proofSeriesKey(state)));
    expect(p.streaks, {'sign': 1, 'word': 1, 'sense': 1}, reason: 'прогресс серии не записан');
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('🔴 уход посреди серии — неполная, без разностей; прогресс не двигается', (tester) async {
    await open(tester, seed: 41);
    final f = fieldOf(41);
    await enter(tester);
    await tapCell(tester, f.signCells[0]);
    await tester.tap(find.byIcon(Icons.arrow_back));
    await tester.pump();
    expect(find.byKey(const Key('ser-not-finished')), findsOneWidget, reason: 'итог не говорит, что серия неполная');
    final d = sent.single['details'] as Map<String, dynamic>;
    expect(d['series_complete'], isFalse);
    expect(d.containsKey('diffs'), isFalse, reason: 'у неполной серии разностей быть не должно');
    expect((d['blocks'] as List).single['done'], isFalse);
    expect(parseProofProgress(state.get(proofSeriesKey(state))).streaks, emptyProofProgress.streaks);
    // Из итога «назад» — к настройке, с дверью.
    await tester.tap(find.byKey(const Key('ser-leave')));
    await tester.pump();
    expect(find.byKey(const Key('proof-series-door')), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('уход мимо кнопок (экран снят) тоже пишет неполную серию', (tester) async {
    await open(tester, seed: 42);
    final f = fieldOf(42);
    await enter(tester);
    await tapCell(tester, f.signCells[0]);
    await tester.pumpWidget(const SizedBox());
    expect(sent, hasLength(1), reason: 'сыгранный блок пропал при уходе');
    expect((sent.single['details'] as Map)['series_complete'], isFalse);
  });

  testWidgets('🔴 вход «auto=1&series=1» начинает серию; «series=1» без auto — настройка с дверью', (tester) async {
    GamePreset.set({'auto': '1', 'series': '1'});
    await open(tester, seed: 43);
    for (var i = 0; i < 20 && find.byKey(const Key('ser-block')).evaluate().isEmpty; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    expect(find.byKey(const Key('ser-block')), findsOneWidget, reason: 'вход «Блоки корректуры» дал не серию');
    await tester.pumpWidget(const SizedBox());
    sent.clear();
    GamePreset.set({'series': '1'});
    await tester.pumpWidget(MaterialApp(home: ProofreadingScreen(key: const ValueKey('s'), state: state, fwSeed: 44)));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('proof-series-door')), findsOneWidget);
    expect(find.byKey(const Key('ser-block')), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('подсказка в блоке «Слово»: путь самого короткого слова, счётчик убывает', (tester) async {
    await open(tester, seed: 45);
    final f = fieldOf(45);
    await enter(tester);
    for (final c in f.signCells) {
      await tapCell(tester, c);
    }
    await passInterlude(tester);
    AuxAction hint() => tester.widget<AuxAction>(find.byKey(const Key('ser-hint')));
    final before = hint().count!;
    await tester.tap(find.byKey(const Key('ser-hint')));
    await tester.pump();
    expect(hint().count, before - 1);
    final shortest = f.puzzle.words.reduce((a, b) => b.path.length < a.path.length ? b : a).path;
    for (final c in shortest) {
      final box = tester.widget<Container>(find.byKey(Key('ser-cell-$c'))).decoration as BoxDecoration;
      expect(box.color, fwHintColor, reason: 'клетка $c пути подсказки не залита');
    }
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('🔴 второй устойчивый прогон поднимает поле: итог называет 6×6, дверь — тоже', (tester) async {
    const start = '{"sizes":{"sign":5,"word":5,"sense":5},"streaks":{"sign":1,"word":1,"sense":1}}';
    await fresh(progress: start);
    await open(tester, seed: 46);
    final f = fieldOf(46, progress: parseProofProgress(start));
    await enter(tester);
    await playAll(tester, f, clean: true);
    expect(tester.widget<Text>(find.byKey(const Key('ser-outcome'))).data,
        interpolate(data.strings('en').levelUp, {'size': 6}));
    await tester.tap(find.byKey(const Key('ser-leave')));
    await tester.pump();
    expect(tester.widget<Text>(find.byKey(const Key('proof-series-starts'))).data,
        interpolate(data.strings('en').startsAt, {'size': 6}), reason: 'дверь не знает нового поля');
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('🔴 язык без категорий — честный отказ с именами языков, а не спрятанная дверь', (tester) async {
    await L.load('ja');
    await open(tester, seed: 47);
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    expect(find.byKey(const Key('proof-series-door')), findsNothing);
    final t = tester.widget<Text>(find.byKey(const Key('proof-series-nosense'))).data!;
    expect(t, contains('English'), reason: 'в отказе нет имён языков: «$t»');
    await tester.pumpWidget(const SizedBox());
  });

  group('серия на малых экранах', () {
    for (final size in const [Size(320, 568), Size(360, 640), Size(390, 844)]) {
      testWidgets('en ${size.width.toInt()}×${size.height.toInt()}: поле 8×8 и правило на экране', (tester) async {
        tester.view.physicalSize = size * 3;
        tester.view.devicePixelRatio = 3;
        addTearDown(tester.view.reset);
        const top = '{"sizes":{"sign":8,"word":8,"sense":8},"streaks":{"sign":0,"word":0,"sense":0}}';
        await fresh(progress: top);
        await open(tester, seed: 48);
        await enter(tester);
        final last = tester.getRect(find.byKey(const Key('ser-cell-63')));
        expect(last.right <= size.width && last.bottom <= size.height, isTrue, reason: 'поле 8×8 за краем: $last');
        final rule = tester.getRect(find.byKey(const Key('ser-rule')));
        expect(rule.bottom, lessThanOrEqualTo(size.height), reason: 'правило блока ушло за край');
        await tester.pumpWidget(const SizedBox());
      });
    }
  });
}
