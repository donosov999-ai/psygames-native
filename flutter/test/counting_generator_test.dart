import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/counter/model.dart' show counterStepKey, counterStepKeys;
import 'package:psygames_flutter/games/counter/screen.dart';
import 'package:psygames_flutter/games/counting_common/generator_shadow.dart';
import 'package:psygames_flutter/games/math_slider/model.dart' as slider
    show sliderBandCount, sliderBandNames, sliderStepKey, sliderStepKeys, trialsPerRound;
import 'package:psygames_flutter/games/math_slider/screen.dart';
import 'package:psygames_flutter/games/math_sprint/model.dart' show sprintStepKeys;
import 'package:psygames_flutter/games/number_bonds/model.dart' show bondsStepKey, bondsStepKeys;
import 'package:psygames_flutter/games/number_bonds/screen.dart';
import 'package:psygames_flutter/games/ospan/model.dart' show ospanStepKey, ospanStepKeys;
import 'package:psygames_flutter/games/ospan/screen.dart';
import 'package:psygames_flutter/games/pattern/model.dart'
    show createRng, makeOptions, makeSequence, mixFrom, patternStepKey, patternStepKeys, trialsPerRound;
import 'package:psygames_flutter/games/pattern/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/generator/contract.dart';
import 'package:psygames_flutter/shell/generator/engine.dart';
import 'package:psygames_flutter/shell/generator/ladder_pool.dart';
import 'package:psygames_flutter/shell/generator/store.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ШЕСТЬ ИГР «СЧЁТА» НА ОБЩЕМ МОДУЛЕ ГЕНЕРАТОРА — ЗВЕНО 4 ЦЕПОЧКИ (задача 4e584381).
///
/// Пилот — «Мат. спринт» (своя проба math_sprint_generator_test.dart). Здесь — то, что держит
/// остальные пять и общий для них адаптер [LadderShadow]:
///   1. ЗАМЕР ЗВЕНА: у каждой игры пул собирается из ОБЕЩАННЫХ ступеней, имена — из темы или
///      параметров, рейтинг растёт с лестницей; печатается, куда генератор поставил бы новичка;
///   2. АДАПТЕР: одна партия — одно начисление, шаг зарядки и открытый хвост молчат, подсказка —
///      «с подсказкой»;
///   3. ЭКРАНЫ: настоящая партия на экране каждой игры доходит до тени — раздача при открытии,
///      исход после последней пробы. Партия проигрывается бездействием или неверными ответами.
void main() {
  const profile = 'nzt48';
  late SharedState state;
  var opens = 0;

  tearDown(() {
    GamePreset.clear();
    LessonUsed.reset();
  });

  const pools = <String, List<String> Function()>{
    'math_sprint': _sprint,
    'number_bonds': _bonds,
    'counter': _counter,
    'math_slider': _slider,
    'pattern': _pattern,
    'ospan': _ospan,
  };

  test('🔴 замер звена 4: шесть игр «Счёта» — пул из обещанных ступеней, рейтинг растёт с лестницей', () {
    final rows = <String>[];
    final problems = <String>[];
    for (final e in pools.entries) {
      final keys = e.value();
      if (keys.toSet().length != keys.length) problems.add('${e.key}: две ступени с одним именем');
      final pool = ladderPool(gameId: e.key, stepKeys: keys);
      for (var i = 1; i < pool.length; i += 1) {
        if (!(pool[i].rating > pool[i - 1].rating)) problems.add('${e.key}: ступень ${i + 1} не труднее $i');
      }
      final fresh = pickNext(AdaptiveState(), pool, Leniency.normal);
      if (fresh == null) {
        problems.add('${e.key}: выбор вернул пусто');
        continue;
      }
      rows.add('  ${e.key}: ступеней ${pool.length}, новичку (1200) — ${fresh.id}, это L${pool.indexOf(fresh) + 1}');
    }
    // ignore: avoid_print
    print('ГЕНЕРАТОР · «СЧЁТ»: подключено ${rows.length} игр из ${pools.length}\n${rows.join('\n')}');
    expect(problems, isEmpty);
    expect(slider.sliderBandNames.length, slider.sliderBandCount, reason: 'у каждой полосы «Мат. шкалы» своё имя');
    // Имена — из темы или параметров, а не из номера уровня.
    expect(slider.sliderStepKey(1), 'addition-1');
    expect(slider.sliderStepKey(49), 'quad-equation-1');
    expect(patternStepKey(1), 'arithmetic-1');
    expect(patternStepKey(mixFrom), 'mix-1');
    expect(bondsStepKey(1), 'p6-v8-k2-n6-w0-t10');
    expect(counterStepKey(1), 'g3-s150-c9');
    expect(ospanStepKey(1), 's3-l1100-e-m0');
  });

  test('ЗАМЕР для звена 5: игрок выигрывает всё подряд — куда тянет тень и как растёт рейтинг', () {
    // Не правило, а измерение, которое должно повторяться: что генератор выбрал бы на каждом
    // уровне прописанной лестницы у человека, который не проигрывает ни разу.
    for (final e in pools.entries) {
      final pool = ladderPool(gameId: e.key, stepKeys: e.value());
      var s = AdaptiveState();
      final picks = <int>[];
      var last = s.skillRating;
      for (var l = 1; l <= pool.length; l += 1) {
        picks.add(pool.indexOf(pickNext(s, pool, Leniency.normal)!) + 1);
        s = applyOutcome(
          s,
          OutcomeEvent(
            eventId: '${e.key}-$l',
            task: TaskId(gameId: e.key, templateId: pool[l - 1].id, difficultyBand: l, generatorVersion: 1, seed: '$l'),
            outcome: Outcome.passed,
            at: DateTime.utc(2026, 10, 2, 0, l),
          ),
          template: pool[l - 1],
        );
        expect(s.skillRating, greaterThanOrEqualTo(last), reason: '${e.key}: победа на L$l опустила рейтинг');
        last = s.skillRating;
      }
      // ignore: avoid_print
      print('ЗАМЕР · ${e.key}: лестница L1→L${pool.length} без поражений; тень предлагала бы '
          'L${picks.first} на старте и L${picks.last} в конце; рейтинг 1200 → ${s.skillRating.round()}');
    }
  });

  test('🔴 адаптер: одна партия — одно начисление; зарядка и хвост молчат; подсказка — «с подсказкой»',
      () async {
    SharedPreferences.setMockInitialValues({});
    final s = await SharedState.open();
    final shadow = LadderShadow(s, gameId: 'probe', stepKeys: const ['a', 'b', 'c']);
    final store = GeneratorStore(s, gameId: 'probe');

    shadow.deal(2);
    expect(shadow.given?.id, 'probe:b');
    shadow.outcome(passed: true);
    shadow.outcome(passed: true);   // второй исход той же партии не начисляется
    expect(store.load().adaptiveWins, 1);
    expect(store.load().recentOutcomes, [Outcome.passed.name]);

    shadow.deal(4);
    expect(shadow.given, isNull, reason: 'выше пула — открытый хвост, ступени у генератора нет');
    shadow.outcome(passed: true);
    expect(store.load().adaptiveWins, 1);

    GamePreset.set({'wu': '1'});
    shadow.deal(1);
    expect(shadow.given, isNull, reason: 'шаг зарядки — не личная лестница');
    GamePreset.clear();

    shadow.deal(1);
    shadow.outcome(passed: true, assisted: true, hints: 1);
    expect(store.load().recentOutcomes.last, Outcome.assisted.name);
    expect(store.load().adaptiveWins, 1, reason: '«с подсказкой» — не победа генератора');

    LessonUsed.mark();
    shadow.deal(1);
    shadow.outcome(passed: true);
    expect(store.load().recentOutcomes.last, Outcome.assisted.name, reason: 'разбор посреди партии');
    expect(store.shadowLog().length, 3, reason: 'в журнале тени только настоящие раздачи');
  });

  Future<void> open(WidgetTester tester, Widget Function(SharedState s) screen,
      {required String game, int level = 1}) async {
    SharedPreferences.setMockInitialValues({
      '${SharedState.prefix}active_profile': profile,
      if (level != 1) '${SharedState.prefix}${game}_level_$profile': '$level',
    });
    state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(home: KeyedSubtree(key: ValueKey('открытие${opens += 1}'), child: screen(state))));
    await tester.pump();
    await tester.pump();
  }

  /// Раздача при открытии: одна строка тени, шаблон — ступень этого уровня.
  void expectDeal(String game, String stepKey, int level) {
    final log = GeneratorStore(state, gameId: game).shadowLog();
    expect(log.length, 1, reason: '$game: раздача не попала в тень');
    expect((log.single['given'] as Map)['id'], '$game:$stepKey');
    expect(log.single['level'], level);
  }

  /// Исход партии: один, и это провал — партию проиграли бездействием.
  void expectFailed(String game) {
    final s = GeneratorStore(state, gameId: game).load();
    expect(s.recentOutcomes, [Outcome.failed.name], reason: '$game: исход партии не дошёл до генератора');
    expect(s.adaptiveWins, 0);
    expect(state.get('${SharedState.prefix}${game}_level_$profile') ?? '1', isNot('2'),
        reason: '$game: провал не двигает лестницу вверх');
  }

  testWidgets('🔴 «Состав числа»: раздача при открытии, исход после шести просроченных задач', (tester) async {
    await open(tester, (s) => NumberBondsScreen(state: s, rnd: createRng('тень')), game: 'number_bonds', level: 4);
    expectDeal('number_bonds', bondsStepKey(4), 4);
    for (var i = 0; i < 6; i += 1) {
      await tester.pump(const Duration(seconds: 41));   // окно L4 — 40 с
      await tester.pump(const Duration(milliseconds: 700));
    }
    await tester.pump();
    expectFailed('number_bonds');
  });

  testWidgets('🔴 «Счётчик»: раздача при открытии, исход после десяти просроченных раундов', (tester) async {
    await open(tester, (s) => CounterScreen(state: s, rnd: createRng('тень')), game: 'counter');
    expectDeal('counter', counterStepKey(1), 1);
    for (var i = 0; i < 10; i += 1) {
      await tester.pump(const Duration(seconds: 16));   // окно L1 — 15 с
      await tester.pump(const Duration(milliseconds: 800));
    }
    await tester.pump();
    expectFailed('counter');
  });

  testWidgets('🔴 «Мат. шкала»: раздача при открытии, исход после последнего задания', (tester) async {
    await open(tester, (s) => MathSliderScreen(state: s), game: 'math_slider');
    expectDeal('math_slider', slider.sliderStepKey(1), 1);
    for (var i = 0; i <= slider.trialsPerRound; i += 1) {   // тренировка + задания; маркер на середине
      await tester.tap(find.byKey(const Key('подтвердить')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 1900));
      await tester.pump();
    }
    final s = GeneratorStore(state, gameId: 'math_slider').load();
    expect(s.recentOutcomes.length, 1, reason: 'исход партии не дошёл до генератора');
    final won = state.get('${SharedState.prefix}math_slider_level_$profile') == '2';
    expect(s.recentOutcomes.single, won ? Outcome.passed.name : Outcome.failed.name,
        reason: 'исход генератора — тот же, что засчитала лестница');
  });

  testWidgets('🔴 «Паттерны»: раздача при открытии, исход после десяти неверных ответов', (tester) async {
    await open(tester, (s) => PatternScreen(state: s, rnd: createRng('тень')), game: 'pattern');
    expectDeal('pattern', patternStepKey(1), 1);
    final rng = createRng('тень');
    for (var i = 0; i < trialsPerRound; i += 1) {
      final seq = makeSequence(1, rng);
      final options = makeOptions(seq.answer, rng);   // тот же бросок, что у экрана
      await tester.tap(find.byKey(Key('ответ${options.firstWhere((o) => o != seq.answer)}')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 800));
    }
    await tester.pump();
    expectFailed('pattern');
  });

  testWidgets('🔴 OSpan: раздача при открытии, исход после вспоминания с ошибкой', (tester) async {
    await open(tester, (s) => OspanScreen(state: s, rnd: createRng('тень')), game: 'ospan');
    expectDeal('ospan', ospanStepKey(1), 1);
    for (var i = 0; i < 3; i += 1) {   // на L1 в наборе три буквы
      await tester.tap(find.byKey(const Key('верно')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 1200));   // показ буквы 1100 мс
    }
    await tester.enterText(find.byKey(const Key('ввод')), 'QQQ');
    await tester.tap(find.byKey(const Key('проверить')));
    await tester.pump();
    await tester.pump();
    expectFailed('ospan');
  });
}

List<String> _sprint() => sprintStepKeys;
List<String> _bonds() => bondsStepKeys;
List<String> _counter() => counterStepKeys;
List<String> _slider() => slider.sliderStepKeys;
List<String> _pattern() => patternStepKeys;
List<String> _ospan() => ospanStepKeys;
