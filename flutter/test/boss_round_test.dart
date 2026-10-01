// Бой с боссом: перенос раздачи сверяется с живым вебом, раунд играется нажатиями.
//
// Эталон: test/fixtures/boss-round-reference.json, снят прогоном живого
// frontend/src/components/bossTask.ts (frontend/src/components/tools/record-boss-reference.gen.ts).
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/boss_round.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/js_compat.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/level_ladder.dart';

BossType typeOf(String name) => BossType.values.firstWhere((t) => t.name == name);

/// Зерно с подсчётом бросков: лишний или пропавший бросок сдвигает все следующие раздачи.
({Rng rng, int Function() draws}) counted(String seed) {
  final inner = createRng(seed);
  var n = 0;
  return (
    rng: () {
      n += 1;
      return inner();
    },
    draws: () => n,
  );
}

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await L.load('ru');
  });

  group('раздача — перенос живого bossTask.ts', () {
    final ref = jsonDecode(File('test/fixtures/boss-round-reference.json').readAsStringSync())
        as Map<String, dynamic>;
    final cases = (ref['cases'] as List).cast<Map<String, dynamic>>();

    test('эталон полон: 6 типов × 40 зёрен', () {
      expect(cases, hasLength(240));
      expect({for (final c in cases) c['type']}, {for (final t in BossType.values) t.name});
    });

    test('🔴 каждая раздача совпадает с вебом: поля, порядок вариантов и число бросков', () {
      for (final c in cases) {
        final r = counted(c['seed'] as String);
        final task = makeBossTask(typeOf(c['type'] as String), r.rng);
        expect(jsonDecode(jsonEncode(task.toJson())), c['task'], reason: '${c['seed']}');
        expect(r.draws(), c['draws'], reason: '${c['seed']}: другое число бросков');
      }
    });
  });

  test('🔴 правило и задание каждого типа — текст, а не ключ, на всех 12 языках', () async {
    // Ключи зовутся переменной, и подстановка на промахе молча возвращает сам ключ:
    // экран показал бы «bossIntroCounting». Мерим то, что собрано, против того, что зовём.
    for (final loc in const ['ru', 'en', 'es', 'de', 'zh', 'hi', 'pt', 'fr', 'it', 'ja', 'ko', 'ar']) {
      await L.load(loc);
      for (final type in BossType.values) {
        final task = makeBossTask(type, createRng('ключи'));
        for (final key in [task.introKey, task.hudKey]) {
          expect(bossTaskKeys, contains(key), reason: '$key не объявлен списком — сборщик его не увидит');
          expect(L.t(key), isNot(key), reason: '$loc: $key не собран в словарь');
        }
      }
      for (final key in const ['bossTitle', 'bossDefeated', 'bossSurvived']) {
        expect(L.t(key), isNot(key), reason: '$loc: $key не собран в словарь');
      }
    }
    await L.load('ru');
  });

  group('веха бывает только после ЗАСЧИТАННОЙ победы', () {
    tearDown(() {
      GamePreset.clear();
      LessonUsed.reset();
    });

    test('🔴 win() говорит, засчитана ли победа: обычная — да, шаг зарядки и партия с разбором — нет', () async {
      // Веб: `passed = !isPreset && …`, и босс только при passed. Нативно это знает лестница:
      // отметку разбора снимает тот же вызов, поэтому спросить после нельзя.
      final l = LevelLadder(gameId: 'boss_probe', store: MemoryLevelStore());
      await l.load();
      expect(await l.win(), isTrue);
      GamePreset.set({'wu': '1'});
      expect(await l.win(), isFalse, reason: 'шаг зарядки открыл бы бой');
      GamePreset.clear();
      LessonUsed.mark();
      expect(await l.win(), isFalse, reason: 'партия с показанным решением открыла бы бой');
      expect(await l.win(), isTrue, reason: 'следующая партия снова зачётная');
    });
  });

  group('winThenBoss — победа и веха одним вызовом', () {
    tearDown(() {
      GamePreset.clear();
      LessonUsed.reset();
    });

    /// Лестница на уровне [level]: победы подряд с первого (не больше [level] попыток —
    /// в пресете или при отметке разбора win() уровень не двигает, и цикл висел бы вечно).
    Future<LevelLadder> ladderAt(int level) async {
      final l = LevelLadder(gameId: 'boss_probe', store: MemoryLevelStore());
      await l.load();
      for (var i = 0; i < level && l.level < level; i += 1) {
        await l.win();
      }
      expect(l.level, level, reason: 'лестница не поднялась до $level');
      return l;
    }

    /// Кнопка зовёт winThenBoss; итог пишется в список (null — боя не было).
    Future<List<bool?>> host(WidgetTester tester, LevelLadder ladder) async {
      final out = <bool?>[];
      await tester.pumpWidget(MaterialApp(
        key: UniqueKey(),
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              key: const Key('win'),
              onPressed: () async => out.add(
                  await BossRound.winThenBoss(context, ladder, type: BossType.gonogo, color: Colors.teal)),
              child: const Text('win'),
            ),
          ),
        ),
      ));
      await tester.tap(find.byKey(const Key('win')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      return out;
    }

    Future<void> finishBoss(WidgetTester tester) async {
      await tester.pump(BossRound.introTime + const Duration(seconds: BossRound.roundSeconds + 1));
      await tester.pump(BossRound.doneTime);
      await tester.pumpAndSettle();
    }

    testWidgets('🔴 на 3-м уровне: обычная победа — бой; шаг зарядки и партия с разбором — нет', (tester) async {
      // Правило стоит там, где действует: на уровне-вехе. На 1-м и 2-м боя нет при любом
      // признаке, и проба «пресет не открывает бой» там была бы зелёной всегда.
      // Лестницу поднимаем ДО пресета: в пресете win() уровень не двигает.
      final preset = await ladderAt(3);
      GamePreset.set({'wu': '1'});
      var out = await host(tester, preset);
      expect(find.byKey(const Key('boss-round')), findsNothing, reason: 'шаг зарядки открыл бой');
      expect(out, [null]);
      GamePreset.clear();

      final lesson = await ladderAt(3);
      LessonUsed.mark();
      out = await host(tester, lesson);
      expect(find.byKey(const Key('boss-round')), findsNothing, reason: 'партия с разбором открыла бой');
      expect(out, [null]);

      final plain = await ladderAt(3);
      out = await host(tester, plain);
      expect(find.byKey(const Key('boss-round')), findsOneWidget, reason: 'засчитанная победа на 3-м — боя нет');
      expect(plain.level, 4, reason: 'уровень засчитан ДО боя, как reach(+1) в вебе');
      await finishBoss(tester);
      expect(out, [false]);
    });

    testWidgets('🔴 веха считается от СЫГРАННОГО уровня, а не от нового', (tester) async {
      // После победы на 2-м лестница уже на 3-м: если брать уровень после win(), бой
      // открывался бы на 2-м, 5-м, 8-м — на один раньше веба.
      final out = await host(tester, await ladderAt(2));
      expect(find.byKey(const Key('boss-round')), findsNothing, reason: 'бой после 2-го уровня');
      expect(out, [null]);
    });
  });

  group('раунд нажатиями', () {
    /// Кнопка «в бой» на пустом экране: итог [openBossRound] пишется в [result].
    Future<List<bool>> host(WidgetTester tester, BossType type, String seed, {Size? screen}) async {
      if (screen != null) {
        tester.view.devicePixelRatio = 1.0;
        tester.view.physicalSize = screen;
        addTearDown(tester.view.reset);
      }
      final result = <bool>[];
      await tester.pumpWidget(MaterialApp(
        key: UniqueKey(), // новое приложение на каждый бой: итог пишется в СВОЙ список
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: TextButton(
                key: const Key('go'),
                onPressed: () async =>
                    result.add(await openBossRound(context, type: type, color: Colors.indigo, rng: createRng(seed))),
                child: const Text('go'),
              ),
            ),
          ),
        ),
      ));
      await tester.tap(find.byKey(const Key('go')));
      await tester.pump(); // бой открыт: с этого кадра идёт показ правила
      return result;
    }

    BossTask taskOf(BossType type, String seed) => makeBossTask(type, createRng(seed));

    testWidgets('правило показано 1,8 с, потом задание и таймер 15', (tester) async {
      await host(tester, BossType.counting, 'показ');
      await tester.pump(const Duration(milliseconds: 500)); // переход экрана позади
      expect(find.byKey(const Key('boss-intro')), findsOneWidget);
      expect(find.text('БОСС'), findsOneWidget);
      await tester.pump(const Duration(milliseconds: 1200)); // 1,7 с от открытия
      expect(find.byKey(const Key('boss-timer')), findsNothing, reason: 'задание раньше показа правила');
      await tester.pump(const Duration(milliseconds: 150));
      expect(find.byKey(const Key('boss-timer')), findsOneWidget);
      expect(find.text('⏱ 15'), findsOneWidget);
      await tester.pump(const Duration(seconds: 20));
      await tester.pumpAndSettle();
    });

    testWidgets('🔴 верный вариант — босс повержен, окно закрывается с true', (tester) async {
      const seed = 'верно';
      final task = taskOf(BossType.counting, seed);
      final result = await host(tester, BossType.counting, seed);
      await tester.pump(BossRound.introTime);
      final i = task.options!.indexOf(task.answer!);
      await tester.tap(find.byKey(Key('boss-option-$i')));
      await tester.pump();
      expect(find.text(L.t('bossDefeated')), findsOneWidget);
      expect(result, isEmpty, reason: 'итог раньше, чем его показали');
      await tester.pump(BossRound.doneTime);
      await tester.pumpAndSettle();
      expect(result, [true]);
      expect(find.byKey(const Key('boss-round')), findsNothing);
    });

    testWidgets('🔴 неверный вариант — босс устоял, второе нажатие не засчитывается', (tester) async {
      const seed = 'мимо';
      final task = taskOf(BossType.lightning, seed);
      final result = await host(tester, BossType.lightning, seed);
      await tester.pump(BossRound.introTime);
      final wrong = List.generate(4, (i) => i).firstWhere((i) => task.options![i] != task.answer);
      final right = task.options!.indexOf(task.answer!);
      await tester.tap(find.byKey(Key('boss-option-$wrong')));
      await tester.pump();
      await tester.tap(find.byKey(Key('boss-option-$right')));
      await tester.pump();
      expect(find.text(L.t('bossSurvived')), findsOneWidget);
      await tester.pump(BossRound.doneTime);
      await tester.pumpAndSettle();
      expect(result, [false]);
    });

    testWidgets('🔴 время вышло — босс устоял', (tester) async {
      final result = await host(tester, BossType.completeline, 'время');
      await tester.pump(BossRound.introTime);
      await tester.pump(const Duration(seconds: 14));
      expect(find.text(L.t('bossSurvived')), findsNothing, reason: 'раунд кончился раньше 15 с');
      await tester.pump(const Duration(seconds: 1));
      expect(find.text(L.t('bossSurvived')), findsOneWidget);
      await tester.pump(BossRound.doneTime);
      await tester.pumpAndSettle();
      expect(result, [false]);
    });

    testWidgets('клетка-нарушитель: верное нажатие побеждает, чужое — нет', (tester) async {
      for (final (type, seed) in [(BossType.gonogo, 'зелёный'), (BossType.finderror, 'повтор'), (BossType.oddletter, 'гласная')]) {
        final task = taskOf(type, seed);
        final ok = await host(tester, type, seed);
        await tester.pump(BossRound.introTime);
        await tester.tap(find.byKey(Key('boss-cell-${task.badCells!.first}')));
        await tester.pump(BossRound.doneTime);
        await tester.pumpAndSettle();
        expect(ok, [true], reason: '$type: нарушитель не засчитан');

        final no = await host(tester, type, seed);
        await tester.pump(BossRound.introTime);
        final other = List.generate(task.grid!.length, (i) => i).firstWhere((i) => !task.badCells!.contains(i));
        await tester.tap(find.byKey(Key('boss-cell-$other')));
        await tester.pump(BossRound.doneTime);
        await tester.pumpAndSettle();
        expect(no, [false], reason: '$type: засчитана чужая клетка');
      }
    });

    testWidgets('назад во время боя — «устоял», а не потерянный итог', (tester) async {
      final result = await host(tester, BossType.counting, 'назад');
      await tester.pump(BossRound.introTime);
      final nav = tester.state<NavigatorState>(find.byType(Navigator));
      await nav.maybePop();
      await tester.pumpAndSettle();
      expect(result, [false]);
    });

    testWidgets('веха — каждый третий уровень, как BOSS_EVERY в вебе', (tester) async {
      expect([for (var l = 1; l <= 10; l += 1) if (BossRound.due(l)) l], [3, 6, 9]);
      expect(BossRound.due(0), isFalse);
    });

    testWidgets('🔴 задание целиком на экране 320×568, 360×640 и 390×844', (tester) async {
      for (final screen in const [Size(320, 568), Size(360, 640), Size(390, 844)]) {
        for (final type in BossType.values) {
          await host(tester, type, 'раскладка', screen: screen);
          await tester.pump(BossRound.introTime);
          final root = tester.getRect(find.byKey(const Key('boss-round')));
          for (final e in find
              .descendant(of: find.byKey(const Key('boss-round')), matching: find.byWidgetPredicate((_) => true))
              .evaluate()) {
            final ro = e.renderObject;
            if (ro is! RenderBox || !ro.hasSize) continue;
            final r = MatrixUtils.transformRect(ro.getTransformTo(null), Offset.zero & ro.size);
            expect(r.left >= root.left - 0.5 && r.right <= root.right + 0.5, isTrue,
                reason: '$type на $screen: ${e.widget.runtimeType} вылез по ширине ($r)');
          }
          // Клетки и кнопки не меньше пальца.
          for (final e in find.byWidgetPredicate((w) => w.key is ValueKey<String> &&
              ((w.key as ValueKey<String>).value.startsWith('boss-cell-') ||
                  (w.key as ValueKey<String>).value.startsWith('boss-option-'))).evaluate()) {
            final ro = e.renderObject as RenderBox;
            final s = ro.size;
            expect(s.width >= 48 && s.height >= 48, isTrue, reason: '$type на $screen: цель нажатия $s');
            // Прокрутка спрятала бы вылет законно — поэтому цель обязана быть ВИДНА целиком.
            final r = MatrixUtils.transformRect(ro.getTransformTo(null), Offset.zero & s);
            expect(r.top >= root.top - 0.5 && r.bottom <= root.bottom + 0.5, isTrue,
                reason: '$type на $screen: цель нажатия за краем экрана ($r)');
          }
          await tester.pump(const Duration(seconds: 16));
          await tester.pumpAndSettle();
        }
      }
    });
  });
}
