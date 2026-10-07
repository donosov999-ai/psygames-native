import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/fillwords/core/fillwords.dart';
import 'package:psygames_flutter/games/proofreading/fillwords_field.dart';
import 'package:psygames_flutter/games/proofreading/fillwords_round.dart';
import 'package:psygames_flutter/games/proofreading/model.dart';
import 'package:psygames_flutter/games/proofreading/screen.dart';
import 'package:psygames_flutter/shell/aux_action.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// «КОРРЕКТУРА»: ЗАДАНИЕ «ФИЛВОРДЫ» (задача caaa1596) — НА ЯДРЕ «СЛОВ».
///
/// Натив переносил только «буквы/цифры»; выбора «Филворды» на настройке не было вовсе. Пробы
/// идут двумя этажами: правила жеста — на модели партии без пальца ([FwRound], дословно веб
/// `fwBegin/fwStep/fwCommit/fwRelease`), а экран — настоящими протягиваниями по клеткам, с
/// полем, собранным тем же ядром с тем же зерном.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late SharedState state;
  late FillwordsPool en;
  final sent = <Map<String, dynamic>>[];

  setUpAll(() async {
    en = await loadWordPool('en');
  });

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
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

  /// Поле уровня — тем же ядром и тем же зерном, что у экрана.
  FillwordsPuzzle puzzleOf(int level, int seed, {bool diagonals = true, FillwordsPool? pool}) {
    final cfg = fillwordsLevel(level);
    final p = pool ?? en;
    return generateFillwords(
      FillwordsRequest(
          rows: cfg.rows,
          cols: cfg.cols,
          locale: p.locale,
          seed: seed,
          maxWordLen: cfg.maxWordLen,
          minWordLen: cfg.minWordLen,
          diagonals: diagonals),
      p,
    );
  }

  FwRound roundOf(FillwordsPuzzle p, {int hints = 3}) =>
      FwRound(level: 1, puzzle: p, order: SubmitOrder.free, hintsAllowed: hints, timeLimitSec: 75, nowMs: () => 0)
        ..begin();

  group('правила жеста — модель партии', () {
    test('🔴 протянутое слово засчитано в миг, когда линия его накрыла', () {
      final p = puzzleOf(1, 11);
      final r = roundOf(p);
      final w = p.words.first.path;
      r.touch(w.first);
      for (final c in w.skip(1).take(w.length - 2)) {
        expect(r.drag(c), FwOutcome.none, reason: 'недостроенная линия не сдаётся');
      }
      expect(r.drag(w.last), FwOutcome.hit, reason: 'последняя буква накрыла слово — зачёт до отпускания');
      expect(r.found, 1);
      expect(r.trace, isEmpty);
      expect(r.release(), FwOutcome.none, reason: 'попадание уже засчитано — отпускание его не повторяет');
      expect(r.mistakes, 0);
    });

    test('🔴 тапы по соседним буквам набирают слово; набранная тапами линия при отпускании не сдаётся', () {
      final p = puzzleOf(1, 12);
      final r = roundOf(p);
      final w = p.words.first.path;
      r.touch(w[0]);
      r.release();
      r.touch(w[1]);
      r.release();
      expect(r.trace, [w[0], w[1]], reason: 'тап по соседу продолжает линию');
      expect(r.mistakes, 0, reason: 'отпускание после тапа — не сдача и не промах');
      for (final c in w.skip(2)) {
        r.touch(c);
        r.release();
      }
      expect(r.found, 1, reason: 'слово, набранное тапами, засчитано');
    });

    test('🔴 протянутая мимо слова линия — промах; тап и дрожь — нет', () {
      final p = puzzleOf(1, 13);
      final r = roundOf(p);
      final w = p.words.firstWhere((x) => x.path.length >= 3).path;
      r.touch(w[0]);
      r.drag(w[1]);
      expect(r.release(), FwOutcome.miss, reason: 'две буквы слова из трёх и больше — не слово');
      expect(r.mistakes, 1);
      r.touch(w[0]);
      expect(r.release(), FwOutcome.none, reason: 'тап — не промах');
      expect(r.mistakes, 1);
    });

    test('подсказка — самое короткое ненайденное слово целиком; гаснет вместе с ним; не больше положенного', () {
      final p = puzzleOf(1, 14);
      final r = roundOf(p, hints: 2);
      expect(r.takeHintNow(), isTrue);
      final shortest = p.words.map((w) => w.path.length).reduce((a, b) => a < b ? a : b);
      expect(r.hint!.cells.length, shortest, reason: 'показано не самое короткое слово целиком');
      final w = p.words[r.hint!.wordIndex].path;
      r.touch(w.first);
      for (final c in w.skip(1)) {
        r.drag(c);
      }
      r.release();
      expect(r.hint, isNull, reason: 'подсказка не погасла вместе со словом');
      expect(r.takeHintNow(), isTrue);
      expect(r.takeHintNow(), isFalse, reason: 'третьей подсказки на уровне с двумя быть не должно');
      expect(r.hintsLeft, 0);
    });

    test('🔴 поле разобрано целиком — партия кончена; поля партии как у веба', () {
      final p = puzzleOf(1, 15);
      final r = roundOf(p);
      for (final w in p.words) {
        r.touch(w.path.first);
        for (final c in w.path.skip(1)) {
          r.drag(c);
        }
        r.release();
      }
      expect(r.cleared, isTrue);
      expect(r.finished, isTrue);
      final d = fillwordsSessionDetails(r, levelCondition: ProofLevel.of(1).condition);
      expect(d['task_mode'], 'fillwords');
      expect(d['letters_left'], 0);
      expect(d['n_targets'], p.words.length);
      expect(d['hits'], p.words.length);
      expect([d['rows'], d['cols']], [p.rows, p.cols]);
      expect(d['time_limit_sec'], 75);
    });
  });

  group('экран', () {
    Future<void> open(WidgetTester tester, {int seed = 21}) async {
      await tester.pumpWidget(MaterialApp(
          home: ProofreadingScreen(
              state: state, fwSeed: seed, clock: () => tester.binding.clock.now().millisecondsSinceEpoch)));
      await tester.pumpAndSettle();
    }

    Future<void> pickFillwords(WidgetTester tester) async {
      await tester.tap(find.byKey(const Key('proof-task-fillwords')));
      for (var i = 0; i < 40; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        final start = tester.widget<FilledButton>(find.widgetWithText(FilledButton, L.t('start')));
        if (start.onPressed != null) return;
      }
      fail('словарь не загрузился — «Начать» не включилась');
    }

    Future<void> traceWord(WidgetTester tester, List<int> path) async {
      final g = await tester.startGesture(tester.getCenter(find.byKey(Key('fw-cell-${path.first}'))));
      await tester.pump();
      for (final c in path.skip(1)) {
        await g.moveTo(tester.getCenter(find.byKey(Key('fw-cell-$c'))));
        await tester.pump();
      }
      await g.up();
      await tester.pump();
    }

    testWidgets('🔴 выбор «Филворды» открывает филворды, а не буквы; строка уровня — число слов поля', (tester) async {
      await open(tester);
      await pickFillwords(tester);
      final p = puzzleOf(1, 21);
      final line = tester.widget<Text>(find.byKey(const Key('proof-params'))).data!;
      expect(line, contains('${p.words.length}'), reason: 'строка уровня не называет число слов');
      expect(line, contains('${p.rows}×${p.cols}'));
      await tester.tap(find.text(L.t('start')));
      await tester.pump();
      expect(find.byKey(const Key('fw-grid')), findsOneWidget, reason: 'открылись не филворды');
      expect(find.byKey(const Key('proof-targets')), findsNothing, reason: 'открылись буквы');
      for (var i = 0; i < p.letters.length; i++) {
        final t = find.descendant(of: find.byKey(Key('fw-cell-$i')), matching: find.byType(Text));
        expect((t.evaluate().single.widget as Text).data, p.letters[i], reason: 'клетка $i не та');
      }
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('🔴 партия филвордов протягиваниями доходит до итога; уровень взят; партия ушла с полями', (tester) async {
      await open(tester, seed: 22);
      await pickFillwords(tester);
      await tester.tap(find.text(L.t('start')));
      await tester.pump();
      final p = puzzleOf(1, 22);
      // Промах до слов: две буквы первого слова — не слово.
      await traceWord(tester, p.words.first.path.take(2).toList());
      for (final w in p.words) {
        await traceWord(tester, w.path);
      }
      await tester.pump();
      expect(find.text(L.t('levelDone').replaceAll('{n}', '1')), findsOneWidget, reason: 'итог не «уровень взят»');
      expect(find.byKey(const Key('proof-fw-result')), findsOneWidget);
      final r = sent.single;
      final d = r['details'] as Map<String, dynamic>;
      expect(d['task_mode'], 'fillwords');
      expect(d['letters_left'], 0);
      expect(d['hits'], p.words.length);
      expect(d['errors'], 1, reason: 'промах протянутой линией не записан');
      expect(r['difficulty'], '${p.rows}x${p.cols}');
      expect(state.get('${SharedState.prefix}proofreading_level_nzt48'), '2', reason: 'лестница не поднялась');
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('шапка настройки — про выбранное задание: лимит и слова филвордов, а не букв', (tester) async {
      await open(tester, seed: 28);
      await pickFillwords(tester);
      // Подпись счётчика шапки — в Semantics (на экране значок и число).
      Finder hud(String text) =>
          find.byWidgetPredicate((w) => w is Semantics && (w.properties.label ?? '') == text);
      final p = puzzleOf(1, 28);
      expect(hud('${L.t('timeLeftLabel')}: ${fillwordsLevel(1).timeLimitSec}'), findsOneWidget,
          reason: 'шапка называет лимит букв, а не филвордов');
      expect(hud('${L.t('label_words')}: 0/${p.words.length}'), findsOneWidget, reason: 'шапка не про слова');
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('подсказка заливает путь самого короткого слова; счётчик убывает', (tester) async {
      await open(tester, seed: 23);
      await pickFillwords(tester);
      await tester.tap(find.text(L.t('start')));
      await tester.pump();
      AuxAction hint() => tester.widget<AuxAction>(find.byKey(const Key('proof-hint')));
      final before = hint().count!;
      await tester.tap(find.byKey(const Key('proof-hint')));
      await tester.pump();
      expect(hint().count, before - 1);
      final p = puzzleOf(1, 23);
      final shortest = p.words.reduce((a, b) => b.path.length < a.path.length ? b : a).path;
      for (final c in shortest) {
        final box = tester.widget<Container>(find.byKey(Key('fw-cell-$c'))).decoration as BoxDecoration;
        expect(box.color, fwHintColor, reason: 'клетка $c пути подсказки не залита');
      }
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('🔴 адрес taskMode=fillwords: вне зарядки — выбраны филворды; в зарядке — буквы, как у веба', (tester) async {
      GamePreset.set({'taskMode': 'fillwords'});
      await open(tester);
      for (var i = 0; i < 20; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }
      final chip = tester.widget<ChoiceChip>(find.byKey(const Key('proof-task-fillwords')));
      expect(chip.selected, isTrue, reason: 'адрес не выбрал филворды');
      await tester.pumpWidget(const SizedBox());

      GamePreset.set({'wu': '1', 'taskMode': 'fillwords', 'level': '1'});
      await tester.pumpWidget(MaterialApp(
          home: ProofreadingScreen(
              key: const ValueKey('wu'),
              state: state,
              fwSeed: 24,
              clock: () => tester.binding.clock.now().millisecondsSinceEpoch)));
      for (var i = 0; i < 20 && find.byKey(const Key('proof-targets')).evaluate().isEmpty; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }
      // Веб: `fillwordsRound = !isPreset && …` — у зарядки свой сценарий и хронометраж.
      expect(find.byKey(const Key('proof-targets')), findsOneWidget, reason: 'шаг зарядки не начался буквами');
      expect(find.byKey(const Key('fw-grid')), findsNothing, reason: 'шаг зарядки запустил филворды');
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('🔴 язык без словаря — честный отказ с именами языков, а не пустое поле', (tester) async {
      await L.load('ja');
      await open(tester);
      for (var i = 0; i < 10; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }
      expect(find.byKey(const Key('proof-task-fillwords')), findsNothing, reason: 'режим без словаря предложен');
      final t = tester.widget<Text>(find.byKey(const Key('proof-fw-nodict'))).data!;
      expect(t, contains('English'), reason: 'в отказе нет имён языков со словарём: «$t»');
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('🔴 «Список слов» переживает выход (ключ веба) и показывает слова сбоку, найденное вычеркнуто', (tester) async {
      await open(tester, seed: 25);
      await pickFillwords(tester);
      await tester.tap(find.byKey(const Key('proof-fw-words')));
      await tester.pumpAndSettle();
      expect(state.get(proofWordListKey), '1', reason: 'выбор не записан ключом веба');
      await tester.pumpWidget(const SizedBox());
      await open(tester, seed: 25);
      await pickFillwords(tester);
      expect(tester.widget<CheckboxListTile>(find.byKey(const Key('proof-fw-words'))).value, isTrue,
          reason: 'выбор слетел при новом входе');
      await tester.tap(find.text(L.t('start')));
      await tester.pump();
      final p = puzzleOf(1, 25);
      expect(find.byKey(const Key('fw-word-0')), findsOneWidget, reason: 'списка нет');
      await traceWord(tester, p.words.first.path);
      final w0 = tester.widget<Text>(find.byKey(const Key('fw-word-0')));
      expect(w0.style!.decoration, TextDecoration.lineThrough, reason: 'найденное не вычеркнуто');
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('«Только прямые» — поле без диагоналей (то же ядро, другое правило линии)', (tester) async {
      await open(tester, seed: 26);
      await pickFillwords(tester);
      await tester.tap(find.byKey(const Key('proof-fw-straight')));
      await tester.pumpAndSettle();
      await tester.tap(find.text(L.t('start')));
      await tester.pump();
      final p = puzzleOf(1, 26, diagonals: false);
      for (var i = 0; i < p.letters.length; i++) {
        final t = find.descendant(of: find.byKey(Key('fw-cell-$i')), matching: find.byType(Text));
        expect((t.evaluate().single.widget as Text).data, p.letters[i], reason: 'поле не «прямое»: клетка $i');
      }
      await tester.pumpWidget(const SizedBox());
    });
  });

  group('настройка филвордов на малых экранах', () {
    for (final lang in ['ru', 'en', 'de', 'hi', 'ar']) {
      for (final size in const [Size(320, 568), Size(360, 640), Size(390, 844)]) {
        testWidgets('$lang ${size.width.toInt()}×${size.height.toInt()}', (tester) async {
          await L.load(lang);
          tester.view.physicalSize = size * 3;
          tester.view.devicePixelRatio = 3;
          addTearDown(tester.view.reset);
          await tester.pumpWidget(MaterialApp(home: ProofreadingScreen(state: state, fwSeed: 27)));
          await tester.pumpAndSettle();
          final task = find.byKey(const Key('proof-task-fillwords'));
          if (task.evaluate().isNotEmpty) {
            await tester.tap(task);
            for (var i = 0; i < 20; i++) {
              await tester.pump(const Duration(milliseconds: 50));
            }
          }
          final start = tester.getRect(find.text(L.t('start')));
          expect(start.bottom, lessThanOrEqualTo(size.height), reason: '«Начать» ушла за край');
          final rules = tester.getRect(find.byKey(const Key('proof-rules')));
          expect(rules.right <= size.width && rules.left >= 0, isTrue, reason: 'правила за краем: $rules');
        });
      }
    }
  });
}
