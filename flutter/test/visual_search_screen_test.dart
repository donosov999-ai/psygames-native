import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/visual_search/model.dart';
import 'package:psygames_flutter/games/visual_search/screen.dart';
import 'package:psygames_flutter/shell/aux_action.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ ИГРАЕТСЯ НАЖАТИЯМИ, И ПРОБА ВИДИТ РОВНО ТО, ЧТО ВИДИТ ИГРОК: форму,
/// цвет и точку приманки — подписи предметов. Кто цель, проба не спрашивает:
/// она ищет совпадение с образцом сама, как человек.
void main() {
  late SharedState state;
  var opens = 0;

  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await L.load('ru');
  });

  Future<void> open(WidgetTester tester,
      {int level = 1, int trials = 8, Size? screen, String seed = 'проба'}) async {
    if (screen != null) {
      tester.view.devicePixelRatio = 1.0;
      tester.view.physicalSize = screen;
      addTearDown(tester.view.reset);
    }
    SharedPreferences.setMockInitialValues({
      if (level != 1) '${SharedState.prefix}visual_search_level_nzt48': '$level',
    });
    state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(
      home: VisualSearchScreen(
        key: ValueKey('open${opens += 1}'),
        state: state,
        rnd: createRng(seed),
        trials: trials,
      ),
    ));
    await tester.pump();
    await tester.pump();
  }

  /// Что нарисовано на предмете — читается подписью, как экранным диктором.
  List<String> marksOf(WidgetTester tester, int i) {
    final node = tester.getSemantics(find.byKey(Key('item$i')));
    return node.label.split(' ');
  }

  int itemCount(WidgetTester tester) {
    var n = 0;
    while (find.byKey(Key('item$n')).evaluate().isNotEmpty) {
      n += 1;
    }
    return n;
  }

  /// Номера предметов, которые ВЫГЛЯДЯТ как цель и не помечены точкой.
  List<int> looksLikeTarget(WidgetTester tester, List<String> sample) {
    final out = <int>[];
    for (var i = 0; i < itemCount(tester); i += 1) {
      final m = marksOf(tester, i);
      if (m.contains('dot') || m.contains('found')) continue;
      if (m[0] == sample[0] && m[1] == sample[1]) out.add(i);
    }
    return out;
  }

  /// Образец читается из подписей: целей столько, сколько обещает уровень, и
  /// все они одной формы и цвета — это и есть образец глазами игрока.
  List<String> guessSample(WidgetTester tester, int targetCount) {
    final counts = <String, int>{};
    for (var i = 0; i < itemCount(tester); i += 1) {
      final m = marksOf(tester, i);
      final key = '${m[0]} ${m[1]}';
      counts[key] = (counts[key] ?? 0) + 1;
    }
    // Самое редкое сочетание «форма+цвет» и есть цель: приманок меньше целей
    // не бывает только на высоких уровнях, поэтому сверяем с числом целей.
    final rarest = counts.entries.reduce((a, b) => a.value <= b.value ? a : b);
    return rarest.key.split(' ');
  }

  int hudValue(WidgetTester tester, IconData icon) {
    final row = find.ancestor(of: find.byIcon(icon), matching: find.byType(Row)).first;
    final text = tester.widget<Text>(find.descendant(of: row, matching: find.byType(Text))).data!;
    return int.parse(text.split('/').first);
  }

  testWidgets('🔴 раунд закрывается, только когда найдены ВСЕ цели', (tester) async {
    // 🔴 ЗАМЕР СТОИТ ТАМ, ГДЕ ПРАВИЛО РАБОТАЕТ. В первом раунде цель ВСЕГДА одна
    // (targetCount = 1 + (раунд−1)/2), и проба на нём слепа: мутация «закрывать
    // раунд по первой цели» её не красит. Двух целей ждём до третьего раунда.
    await open(tester, level: 5, trials: 8);
    var round = 1;
    while (vsLevelParams(5, round).targetCount < 2) {
      final cfg = vsLevelParams(5, round);
      final sample = guessSample(tester, cfg.targetCount);
      for (final t in looksLikeTarget(tester, sample)) {
        await tester.tap(find.byKey(Key('item$t')));
        await tester.pump();
      }
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pump();
      round += 1;
    }
    final cfg = vsLevelParams(5, round);
    expect(cfg.targetCount, greaterThanOrEqualTo(2), reason: 'проба не дошла до раунда с двумя целями');
    expect(find.text('$round/8'), findsOneWidget);
    expect(itemCount(tester), cfg.count);

    final sample = guessSample(tester, cfg.targetCount);
    final targets = looksLikeTarget(tester, sample);
    expect(targets.length, cfg.targetCount, reason: 'целей на поле не столько, сколько обещает уровень');

    // Первая цель: подсвечена, но раунд НЕ закрыт.
    await tester.tap(find.byKey(Key('item${targets.first}')));
    await tester.pump();
    expect(marksOf(tester, targets.first), contains('found'));
    await tester.pump(const Duration(milliseconds: 600));
    await tester.pump();
    expect(find.text('$round/8'), findsOneWidget, reason: 'раунд закрылся по первой цели из ${targets.length}');

    // Остальные цели: после последней раунд закрывается.
    for (final t in targets.skip(1)) {
      await tester.tap(find.byKey(Key('item$t')));
      await tester.pump();
    }
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pump();
    expect(find.text('${round + 1}/8'), findsOneWidget, reason: 'раунд не сменился после всех целей');
  });

  testWidgets('🔴 одну цель нельзя засчитать дважды', (tester) async {
    // Без этого правила раунд с двумя целями закрывался бы ДВУМЯ нажатиями по
    // одной и той же — то есть поиска не было бы вовсе.
    await open(tester, level: 5, trials: 8, seed: 'дважды');
    var round = 1;
    while (vsLevelParams(5, round).targetCount < 2) {
      final c = vsLevelParams(5, round);
      for (final t in looksLikeTarget(tester, guessSample(tester, c.targetCount))) {
        await tester.tap(find.byKey(Key('item$t')));
        await tester.pump();
      }
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pump();
      round += 1;
    }
    final cfg = vsLevelParams(5, round);
    final targets = looksLikeTarget(tester, guessSample(tester, cfg.targetCount));
    expect(targets.length, greaterThanOrEqualTo(2));
    await tester.tap(find.byKey(Key('item${targets.first}')));
    await tester.pump();
    await tester.tap(find.byKey(Key('item${targets.first}')));
    await tester.pump(const Duration(milliseconds: 600));
    await tester.pump();
    expect(find.text('$round/8'), findsOneWidget,
        reason: 'повторное нажатие по найденной цели закрыло раунд');
    expect(hudValue(tester, Icons.error_outline), 0, reason: 'повтор по цели засчитан ошибкой');
  });

  testWidgets('🔴 приманка выглядит как цель, но нажатие по ней — ОШИБКА', (tester) async {
    await open(tester, level: 25, seed: 'приманка');   // L25: приманок четыре
    final cfg = vsLevelParams(25, 1);
    expect(cfg.decoys, greaterThan(0));
    final decoys = <int>[];
    for (var i = 0; i < itemCount(tester); i += 1) {
      if (marksOf(tester, i).contains('dot')) decoys.add(i);
    }
    expect(decoys.length, cfg.decoys, reason: 'приманок на поле не столько, сколько обещает уровень');
    final sample = guessSample(tester, cfg.targetCount);
    // Приманка неотличима от цели всем, кроме точки.
    expect(marksOf(tester, decoys.first).take(2).toList(), sample,
        reason: 'приманка отличается от цели не только точкой — ось подавления не работает');
    expect(hudValue(tester, Icons.error_outline), 0);
    await tester.tap(find.byKey(Key('item${decoys.first}')));
    await tester.pump();
    expect(hudValue(tester, Icons.error_outline), 1, reason: 'нажатие по приманке не засчитано ошибкой');
    expect(marksOf(tester, decoys.first), isNot(contains('found')));
  });

  testWidgets('🔴 промах — ошибка, и на время красного отклика поле закрыто', (tester) async {
    // ⚠️ Мерить это находкой цели нельзя: в первом раунде цель ОДНА, нажатие по
    // ней закрывает раунд и раздаёт новое поле — проба смотрела бы на другую
    // доску и оставалась зелёной даже со снятыми заслонами (замер 23.09.2026).
    // Поэтому мерим счётчиком ошибок: второй промах внутри окна не должен пройти.
    await open(tester, seed: 'промах');
    final cfg = vsLevelParams(1, 1);
    final sample = guessSample(tester, cfg.targetCount);
    final wrong = List.generate(itemCount(tester), (i) => i)
        .where((i) => marksOf(tester, i)[0] != sample[0])
        .toList();
    expect(wrong.length, greaterThanOrEqualTo(2));

    await tester.tap(find.byKey(Key('item${wrong[0]}')));
    await tester.pump();
    expect(hudValue(tester, Icons.error_outline), 1, reason: 'промах не засчитан ошибкой');

    await tester.tap(find.byKey(Key('item${wrong[1]}')));
    await tester.pump();
    expect(hudValue(tester, Icons.error_outline), 1,
        reason: 'нажатие прошло сквозь окно красного отклика');

    await tester.pump(const Duration(milliseconds: 450));
    await tester.tap(find.byKey(Key('item${wrong[1]}')));
    await tester.pump();
    expect(hudValue(tester, Icons.error_outline), 2, reason: 'после отклика поле не ожило');
  });

  testWidgets('🔴 уровень берётся при одной ошибке и не берётся при двух', (tester) async {
    Future<bool> play(int mistakes) async {
      await open(tester, level: 2, trials: 3, seed: 'итог$mistakes');
      var left = mistakes;
      for (var r = 1; r <= 3; r += 1) {
        final cfg = vsLevelParams(2, r);
        final sample = guessSample(tester, cfg.targetCount);
        if (left > 0) {
          final wrong = List.generate(itemCount(tester), (i) => i)
              .firstWhere((i) => marksOf(tester, i)[0] != sample[0]);
          await tester.tap(find.byKey(Key('item$wrong')));
          await tester.pump();
          await tester.pump(const Duration(milliseconds: 450));
          left -= 1;
        }
        for (final t in looksLikeTarget(tester, sample)) {
          await tester.tap(find.byKey(Key('item$t')));
          await tester.pump();
        }
        await tester.pump(const Duration(milliseconds: 500));
        await tester.pump();
      }
      expect(find.byKey(const Key('result')), findsOneWidget, reason: 'партия не закончилась');
      return find.text('Следующий').evaluate().isNotEmpty;
    }

    expect(await play(1), isTrue, reason: 'одна ошибка — ровно порог, уровень берётся');
    expect(await play(2), isFalse, reason: 'две ошибки — уровень не берётся');
  });

  testWidgets('экран открывается на ТОМ уровне, что записан в лестнице', (tester) async {
    await open(tester, level: 12);
    expect(itemCount(tester), vsLevelParams(12, 1).count);
    expect(find.text('12'), findsWidgets);
  });

  testWidgets('🔴 поле квадратное, целиком в поле каркаса, предметы внутри доски', (tester) async {
    for (final screen in [const Size(360, 640), const Size(390, 844)]) {
      for (final level in [1, 12, 25]) {
        await open(tester, level: level, screen: screen);
        final aux = tester.getRect(find.byType(AuxBar));
        final board = tester.getRect(find.byKey(const Key('board')));
        expect(board.width, closeTo(board.height, 0.01), reason: 'доска не квадратная, $screen L$level');
        expect(board.bottom, lessThanOrEqualTo(aux.top + 0.01),
            reason: 'доска вылезла из поля на ${board.bottom - aux.top}, $screen L$level');
        expect(board.width, lessThanOrEqualTo(screen.width + 0.01), reason: 'доска шире экрана, $screen L$level');
        final n = itemCount(tester);
        expect(n, vsLevelParams(level, 1).count);
        // Доска — квадрат: её ширина и высота равны, и она целиком над рядом значков.
        final first = tester.getRect(find.byKey(const Key('item0')));
        expect(first.width, vsItemSize);
        for (var i = 0; i < n; i += 1) {
          final r = tester.getRect(find.byKey(Key('item$i')));
          expect(r.left, greaterThanOrEqualTo(-0.01), reason: 'предмет $i левее доски, $screen L$level');
          expect(r.right, lessThanOrEqualTo(screen.width + 0.01), reason: 'предмет $i правее экрана, $screen L$level');
          expect(r.bottom, lessThanOrEqualTo(aux.top + 0.01),
              reason: 'предмет $i вылез из поля на ${r.bottom - aux.top}, $screen L$level');
          expect(r.width, greaterThanOrEqualTo(vsItemSize - 0.01),
              reason: 'предмет $i мельче порога нажатия, $screen L$level');
        }
      }
    }
  });
}
