import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/math_sprint/model.dart';
import 'package:psygames_flutter/games/math_sprint/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/generator/contract.dart';
import 'package:psygames_flutter/shell/generator/engine.dart';
import 'package:psygames_flutter/shell/generator/ladder_pool.dart';
import 'package:psygames_flutter/shell/generator/store.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ГЕНЕРАТОР УРОВНЕЙ НА «МАТ. СПРИНТЕ» — ЗВЕНО 4 ЦЕПОЧКИ, ПИЛОТ ИГР «СЧЁТА» (задача 4e584381).
///
/// «Счёт» — второй, независимый от «Судоку» тип игр: не доски-головоломки, а минута быстрых
/// заданий, у которых трудность — непрерывная функция номера уровня. Спринт подключён к общему
/// модулю (`lib/shell/generator/`) тем же путём, что 42 режима головоломок: ТЕНЬ. Человек
/// играет прежнюю лестницу, генератор пишет, что выбрал бы, и учит рейтинг на настоящих исходах.
/// Проба держит:
///   1. ПУЛ: 32 ступени, которые лестница обещает, с именами по теме, рейтинг растёт с лестницей;
///   2. ИСХОД настоящей партии доходит до генератора: победа, провал, разбор — «с подсказкой»;
///   3. ГРАНИЦЫ: шаг зарядки и открытый хвост выше 32-го уровня рейтинг не учат;
///   4. ИЗОЛЯЦИЯ: тень пишет только свои ключи `_adaptive_`, уровень двигает одна лестница.
void main() {
  const profile = 'nzt48';
  late SharedState state;
  var opens = 0;

  tearDown(() {
    GamePreset.clear();
    LessonUsed.reset();
  });

  Future<void> open(WidgetTester tester, {int level = 1, String seed = 'тень', int seconds = 60}) async {
    SharedPreferences.setMockInitialValues({
      '${SharedState.prefix}active_profile': profile,
      if (level != 1) '${SharedState.prefix}math_sprint_level_$profile': '$level',
    });
    state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(
      home: MathSprintScreen(
        key: ValueKey('открытие${opens += 1}'),
        state: state,
        rnd: createRng(seed),
        seconds: seconds,
      ),
    ));
    await tester.pump();
    await tester.pump();
  }

  Future<void> type(WidgetTester tester, int value) async {
    if (value < 0) {
      await tester.tap(find.byKey(const Key('клавиша−')));
      await tester.pump();
    }
    for (final ch in value.abs().toString().split('')) {
      await tester.tap(find.byKey(Key('клавиша$ch')));
      await tester.pump();
    }
  }

  /// Партия на победу: двенадцать верных ответов клавишами, потом время выходит само.
  Future<void> winRound(WidgetTester tester, {required String seed, int level = 1}) async {
    final rnd = createRng(seed);
    await open(tester, seed: seed, level: level);
    await tester.tap(find.byKey(const Key('начать')));
    await tester.pump();
    for (var i = 0; i < sprintCorrectToPass; i += 1) {
      await type(tester, generateSprintProblem(level, rnd).answer);
    }
    await tester.pump(const Duration(seconds: 61));
    await tester.pump();
  }

  GeneratorStore store() => GeneratorStore(state, gameId: 'math_sprint');

  test('🔴 пул: 32 обещанные ступени, имена по теме, рейтинг растёт вместе с лестницей', () {
    expect(sprintStepKeys.length, sprintMaxLevel);
    expect(sprintStepKeys.toSet().length, sprintStepKeys.length, reason: 'две ступени с одним именем');
    expect(sprintStepKeys.first, 'plus-minus-1');
    expect(sprintStepKeys[27], 'equation-4');
    expect(sprintStepKeys[28], 'mix-1');
    expect(sprintStepKeys.last, 'mix-4');
    for (var l = 1; l <= sprintMaxLevel; l += 1) {
      expect(sprintStepKey(l), startsWith('${sprintBandFor(l)}-'), reason: 'L$l: имя ступени — её тема');
    }
    final pool = ladderPool(gameId: 'math_sprint', stepKeys: sprintStepKeys);
    expect(pool.first.rating, ratingFloor);
    expect(pool.last.rating, ratingCeil);
    for (var i = 1; i < pool.length; i += 1) {
      expect(pool[i].rating, greaterThan(pool[i - 1].rating), reason: 'ступень ${i + 1} не труднее $i');
    }
    // ЗАМЕР для звена 5: куда генератор поставил бы новичка — шкала игрока стартует с середины.
    final fresh = pickNext(AdaptiveState(), pool, Leniency.normal)!;
    final at = pool.indexOf(fresh) + 1;
    // ignore: avoid_print
    print('ГЕНЕРАТОР · СПРИНТ: ступеней ${pool.length} (L1–L$sprintMaxLevel), рейтинги '
        '${pool.first.rating.round()}…${pool.last.rating.round()}, шаг ${(pool[1].rating - pool[0].rating).toStringAsFixed(1)}; '
        'новичку (1200) генератор дал бы ${fresh.id} — это L$at, а лестница начинает с L1');
    expect(at, greaterThan(1), reason: 'замер: холодный старт генератора выше первой ступени лестницы');
  });

  testWidgets('🔴 победа на L1: раздача и исход в тени, ступень plus-minus-1, лестница шагнула сама',
      (tester) async {
    await winRound(tester, seed: 'победа');
    final log = store().shadowLog();
    expect(log.length, 1, reason: 'одна партия — одна раздача в тени');
    expect((log.single['given'] as Map)['id'], 'math_sprint:plus-minus-1');
    expect(log.single['level'], 1);
    final s = store().load();
    expect(s.recentOutcomes, [Outcome.passed.name]);
    expect(s.adaptiveWins, 1, reason: 'победа — в счётчик генератора');
    expect(s.templateGames['math_sprint:plus-minus-1'], 1);
    expect(state.get('${SharedState.prefix}math_sprint_level_$profile'), '2',
        reason: 'уровень двигает лестница, как прежде');
    // ИЗОЛЯЦИЯ: из ключей генератора записаны только состояние и журнал тени — пилот не включён.
    final prefs = await SharedPreferences.getInstance();
    final adaptive = prefs.getKeys().where((k) => k.contains('math_sprint_adaptive')).toSet();
    expect(adaptive, {store().stateKey, store().shadowKey});
  });

  testWidgets('🔴 провал: исход «не вытянул», победы в счётчике нет, номер лестницы стоит', (tester) async {
    await open(tester, seed: 'провал', seconds: 2);
    await tester.tap(find.byKey(const Key('начать')));
    await tester.pump();
    await tester.pump(const Duration(seconds: 3));
    await tester.pump();
    final s = store().load();
    expect(s.recentOutcomes, [Outcome.failed.name]);
    expect(s.adaptiveWins, 0);
    expect(s.skillRating, lessThan(1200), reason: 'провал опускает рейтинг игрока');
    expect(state.get('${SharedState.prefix}math_sprint_level_$profile') ?? '1', '1');
  });

  testWidgets('🔴 разбор в партии — исход «с подсказкой»: рейтинг не растёт', (tester) async {
    await open(tester, seed: 'разбор');
    await tester.tap(find.byKey(const Key('начать')));
    await tester.pump();
    LessonUsed.mark();   // человек открыл разбор посреди партии
    final rnd = createRng('разбор');
    for (var i = 0; i < sprintCorrectToPass; i += 1) {
      await type(tester, generateSprintProblem(1, rnd).answer);
    }
    await tester.pump(const Duration(seconds: 61));
    await tester.pump();
    final s = store().load();
    expect(s.recentOutcomes, [Outcome.assisted.name]);
    expect(s.skillRating, lessThanOrEqualTo(1200), reason: '«с подсказкой» рейтинг не повышает');
  });

  testWidgets('🔴 шаг зарядки и открытый хвост (L33) рейтинг не учат', (tester) async {
    GamePreset.set({'wu': '1'});
    await open(tester, seed: 'зарядка', seconds: 2);
    await tester.pump(const Duration(seconds: 3));
    await tester.pump();
    expect(store().shadowLog(), isEmpty, reason: 'шаг зарядки — не личная лестница');
    expect(state.get(store().stateKey), isNull);
    GamePreset.clear();

    await open(tester, seed: 'хвост', level: sprintMaxLevel + 1, seconds: 2);
    await tester.tap(find.byKey(const Key('начать')));
    await tester.pump();
    await tester.pump(const Duration(seconds: 3));
    await tester.pump();
    expect(store().shadowLog(), isEmpty,
        reason: 'выше L$sprintMaxLevel ступени у генератора нет — конечный пул не держит открытый хвост');
    expect(state.get(store().stateKey), isNull);
  });
}
