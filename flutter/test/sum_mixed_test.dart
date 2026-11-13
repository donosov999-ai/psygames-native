import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/counter/model.dart';
import 'package:psygames_flutter/games/number_bonds/model.dart';
import 'package:psygames_flutter/games/sum_mixed/model.dart';
import 'package:psygames_flutter/games/sum_mixed/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 «СОБЕРИ СУММУ · ВПЕРЕМЕШКУ»: правило раунда меняется, и его видно ДО раунда.
///
/// 📍 Решение Дениса 13.11.2026 (bf1c918c, п.6): третий режим набора — «правило меняется случайно
/// между раундами, перед раундом большой индикатор текущего правила; своя лестница». Модель
/// собрана из генераторов родителей (`makeCounterRound`, `makePuzzle`), поэтому проба сверяет
/// паритет параметров и честность смены правила, а экран гоняет настоящей партией: плашка → поле
/// → решение по числам с экрана → следующий раунд.
void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await L.load('ru');
  });

  group('модель', () {
    test('🔴 правила раундов: оба встречаются, серий длиннее двух нет — на любом зерне', () {
      for (var seed = 0; seed < 500; seed++) {
        final rules = dealRules(mixedRounds, createRng('mix-$seed'));
        expect(rules, hasLength(mixedRounds));
        expect(rules.toSet(), {SumRule.speed, SumRule.composition}, reason: 'зерно $seed: одно правило на всю партию');
        var run = 1;
        for (var i = 1; i < rules.length; i++) {
          run = rules[i] == rules[i - 1] ? run + 1 : 1;
          expect(run, lessThanOrEqualTo(mixedMaxRun), reason: 'зерно $seed: серия из $run подряд на раунде ${i + 1}');
        }
      }
    });

    test('смена правила не вырождается в строгое чередование (это уже не «случайно»)', () {
      final patterns = <String>{};
      for (var seed = 0; seed < 200; seed++) {
        patterns.add(dealRules(mixedRounds, createRng('mix-$seed')).map((r) => r.index).join());
      }
      expect(patterns.length, greaterThan(50), reason: 'разных раскладок всего ${patterns.length}');
    });

    test('🔴 параметры уровня — ровно параметры родителей (второй таблицы трудности нет)', () {
      for (var level = 1; level <= 40; level++) {
        final cfg = mixedLevelParams(level);
        final s = counterLevelParams(level), c = levelParams(level);
        expect([cfg.speed.gridSize, cfg.speed.roundLimitMs, cfg.speed.cellMax, cfg.speed.tripleShare],
            [s.gridSize, s.roundLimitMs, s.cellMax, s.tripleShare],
            reason: 'L$level: «на скорость» разошлась со «Считалкой»');
        expect([cfg.composition.pool, cfg.composition.maxV, cfg.composition.windowMs],
            [c.pool, c.maxV, c.windowMs],
            reason: 'L$level: «состав» разошёлся с «Числовыми парами»');
        expect(cfg.limitMs(SumRule.speed), s.roundLimitMs);
        expect(cfg.limitMs(SumRule.composition), c.windowMs);
      }
    });

    test('раздача раунда: у каждого правила своя половина, цель собирается из поля', () {
      final cfg = mixedLevelParams(1);
      final speed = makeMixedRound(SumRule.speed, cfg, createRng('r1'));
      expect(speed.speed, isNotNull);
      expect(speed.composition, isNull);
      expect(speed.values, hasLength(cfg.speed.gridSize * cfg.speed.gridSize));
      final comp = makeMixedRound(SumRule.composition, cfg, createRng('r2'));
      expect(comp.composition, isNotNull);
      expect(comp.speed, isNull);
      expect(comp.values, hasLength(cfg.composition.pool));
    });
  });

  group('экран', () {
    late SharedState state;

    Future<void> open(WidgetTester tester, {String seed = 'вперемешку'}) async {
      SharedPreferences.setMockInitialValues({});
      state = await SharedState.open();
      await tester.pumpWidget(MaterialApp(home: SumMixedScreen(key: ValueKey(seed), state: state, rnd: createRng(seed))));
      await tester.pump();
      await tester.pump();
    }

    Finder bannerOf(SumRule r) => find.byKey(Key('rule-banner-${r.name}'));

    SumRule? ruleOnBanner(WidgetTester tester) {
      for (final r in SumRule.values) {
        if (bannerOf(r).evaluate().isNotEmpty) return r;
      }
      return null;
    }

    /// Целые числа из дочерних текстов виджета.
    int numberIn(WidgetTester tester, Finder f) =>
        int.parse(tester.widget<Text>(find.descendant(of: f, matching: find.byType(Text)).first).data!);

    /// Решает раунд так, как это делает человек: читает цель и числа С ЭКРАНА, ищет набор клеток.
    Future<void> solve(WidgetTester tester, SumRule rule) async {
      late int target;
      late List<int> values;
      late Finder Function(int) tile;
      if (rule == SumRule.speed) {
        target = int.parse(tester.widget<Text>(find.byKey(const Key('target'))).data!);
        tile = (i) => find.byKey(Key('cell$i'));
        values = [for (var i = 0; tile(i).evaluate().isNotEmpty; i++) numberIn(tester, tile(i))];
      } else {
        target = int.parse(tester.widget<Text>(find.byKey(const Key('цель'))).data!);
        tile = (i) => find.byKey(Key('фишка$i'));
        values = [for (var i = 0; tile(i).evaluate().isNotEmpty; i++) numberIn(tester, tile(i))];
      }
      List<int>? pick;
      for (var i = 0; i < values.length && pick == null; i++) {
        for (var j = i + 1; j < values.length && pick == null; j++) {
          if (values[i] + values[j] == target) pick = [i, j];
          for (var k = j + 1; k < values.length && pick == null; k++) {
            if (values[i] + values[j] + values[k] == target) pick = [i, j, k];
          }
        }
      }
      expect(pick, isNotNull, reason: 'цель $target не собирается из $values (правило ${rule.name})');
      for (final i in pick!) {
        await tester.tap(tile(i));
        await tester.pump();
      }
    }

    testWidgets('🔴 перед раундом — крупная плашка правила, поля и таймера ещё нет', (tester) async {
      await open(tester);
      final rule = ruleOnBanner(tester);
      expect(rule, isNotNull, reason: 'плашки правила нет на старте партии');
      expect(find.byKey(const Key('rule-banner-name')), findsOneWidget);
      expect(tester.widget<Text>(find.byKey(const Key('rule-banner-name'))).data,
          L.t(rule == SumRule.speed ? 'suiteModeSpeed' : 'suiteModeComposition'));
      expect(tester.widget<Text>(find.byKey(const Key('mode-caption'))).data, L.t('suiteModeMixed'));
      expect(find.byKey(const Key('cell0')), findsNothing, reason: 'поле под плашкой');
      expect(find.byKey(const Key('фишка0')), findsNothing, reason: 'поле под плашкой');

      // плашка стоит достаточно, чтобы её прочитать, и уходит сама
      await tester.pump(const Duration(milliseconds: 900));
      expect(ruleOnBanner(tester), rule, reason: 'плашка ушла раньше, чем её можно прочитать');
      await tester.pump(const Duration(milliseconds: 700));
      expect(ruleOnBanner(tester), isNull, reason: 'плашка не ушла');
      expect(find.byKey(Key(rule == SumRule.speed ? 'cell0' : 'фишка0')), findsOneWidget);
    });

    testWidgets('🔴 таймер раунда стартует ПОСЛЕ плашки, а не вместе с ней', (tester) async {
      // Берём зерно, где первый раунд — «на скорость» (у него есть окно на уровне 1).
      for (var s = 0; s < 40; s++) {
        await open(tester, seed: 'таймер-$s');
        if (ruleOnBanner(tester) != SumRule.speed) continue;
        Text hud() => tester.widget<Text>(find.descendant(of: find.ancestor(of: find.byIcon(Icons.timer_outlined), matching: find.byType(Row)).first, matching: find.byType(Text)).first);
        final before = hud().data;
        await tester.pump(const Duration(milliseconds: 1000));
        expect(hud().data, before, reason: 'окно раунда тикает под плашкой');
        await tester.pump(const Duration(milliseconds: 600));
        await tester.pump(const Duration(milliseconds: 3100));
        expect(hud().data, isNot(before), reason: 'после плашки окно не пошло');
        return;
      }
      fail('нет зерна с «на скорость» в первом раунде');
    });

    testWidgets('🔴 партия целиком: оба правила встретились, десять верных, уровень растёт в СВОЕЙ лестнице', (tester) async {
      await open(tester);
      final seen = <SumRule>[];
      for (var round = 1; round <= mixedRounds; round++) {
        final rule = ruleOnBanner(tester);
        expect(rule, isNotNull, reason: 'раунд $round: нет плашки правила');
        seen.add(rule!);
        await tester.pump(const Duration(milliseconds: 1500));
        await solve(tester, rule);
        await tester.pump(const Duration(milliseconds: 900));
      }
      await tester.pump(const Duration(milliseconds: 400));
      expect(seen.toSet(), {SumRule.speed, SumRule.composition}, reason: 'за партию правило не менялось: $seen');
      expect(find.byKey(const Key('level-result')), findsOneWidget, reason: 'итог партии (общий каркаса) не показан');
      expect(find.textContaining('$mixedRounds/$mixedRounds'), findsWidgets, reason: 'счёт партии в итоге');
      expect(find.byKey(const Key('level-result-next')), findsOneWidget);

      final prefs = await SharedPreferences.getInstance();
      final keys = prefs.getKeys();
      expect(keys.where((k) => k.contains('sum_mixed')), isNotEmpty, reason: 'уровень «Вперемешку» не записан: $keys');
      expect(keys.where((k) => k.contains('counter_level') || k.contains('number_bonds_level')), isEmpty,
          reason: 'партия «Вперемешку» тронула лестницу родителя: $keys');
    });

    testWidgets('«Числовые пары»-раунд: неверная сумма по «Проверить» — ошибка, раунд потерян', (tester) async {
      for (var s = 0; s < 60; s++) {
        await open(tester, seed: 'пары-$s');
        if (ruleOnBanner(tester) != SumRule.composition) continue;
        await tester.pump(const Duration(milliseconds: 1500));
        // одна фишка — меньше двух, это не ответ
        await tester.tap(find.byKey(const Key('фишка0')));
        await tester.pump();
        await tester.tap(find.byKey(const Key('check')));
        await tester.pump();
        final err = find.ancestor(of: find.byIcon(Icons.error_outline), matching: find.byType(Row)).first;
        expect(tester.widget<Text>(find.descendant(of: err, matching: find.byType(Text)).first).data, '1');
        // раунд завершён — через паузу отклика идёт плашка следующего
        await tester.pump(const Duration(milliseconds: 800));
        expect(ruleOnBanner(tester), isNotNull, reason: 'после проваленного раунда нет плашки следующего');
        return;
      }
      fail('нет зерна с «составом» в первом раунде');
    });

    testWidgets('🔴 «на скорость»-раунд: перебор посреди протяжки — ОДНА ошибка (как в «Считалке»)', (tester) async {
      // Замер координатора на эмуляторе 13.11: «ошибки 0 → 3» за одну протяжку.
      for (var n = 0; n < 300; n++) {
        await open(tester, seed: 'перебор-$n');
        if (ruleOnBanner(tester) != SumRule.speed) continue;
        await tester.pump(const Duration(milliseconds: 1500));
        final target = int.parse(tester.widget<Text>(find.byKey(const Key('target'))).data!);
        final v = [for (var i = 0; i < 9; i++) numberIn(tester, find.byKey(Key('cell$i')))];
        for (final i in [0, 3, 6]) {
          if (v[i] + v[i + 1] > target && v[i] < target && v[i] + v[i + 1] + v[i + 2] != target) {
            final pts = [for (final c in [i, i + 1, i + 2]) tester.getCenter(find.byKey(Key('cell$c')))];
            final g = await tester.startGesture(pts.first);
            for (final p in pts.skip(1)) {
              await g.moveTo(p);
              await tester.pump(const Duration(milliseconds: 20));
            }
            await g.up();
            await tester.pump();
            final err = find.ancestor(of: find.byIcon(Icons.error_outline), matching: find.byType(Row)).first;
            expect(tester.widget<Text>(find.descendant(of: err, matching: find.byType(Text)).first).data, '1',
                reason: 'один перебор — одна ошибка, сколько бы плиток палец ни прошёл дальше');
            return;
          }
        }
      }
      fail('за 300 партий не нашлось ряда с перебором на второй плитке');
    });
  });
}
