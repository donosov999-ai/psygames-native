import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/picture_pairs/model.dart';
import 'package:psygames_flutter/games/picture_pairs/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ ИГРАЕТСЯ НАЖАТИЯМИ ПО КАРТАМ, а не вызовом правил.
///
/// Расклад СЧИТЫВАЕТСЯ С ЭКРАНА во время показа — какая картинка лежит лицом вверх
/// в каждой клетке, ровно как видит человек. Подсмотреть колоду в модели было бы
/// обманом: проба прошла бы и при сломанном показе.
void main() {
  late SharedState state;
  // Профиль по умолчанию — nzt48, его набор картинок — «мозги» (brain). Набор
  // читается с диска и передаётся экрану готовым: без runAsync проба не зависит
  // от настоящей асинхронности загрузки ассетов.
  final themesJson = jsonDecode(File('assets/pairs/themes.json').readAsStringSync()) as Map<String, dynamic>;
  final sprites = (themesJson['sprites'] as Map<String, dynamic>)['brain'] as List;
  final theme = PairsTheme.fromJson(themesJson, 'nzt48');

  // Словарь грузится ДО тестов, а не в теле: чтение ассета внутри поддельных часов
  // теста вешало второй тест файла (замер 30.09, 0 % ЦП, 10 минут).
  setUpAll(() async => L.load('ru'));

  Future<void> boot(WidgetTester tester, {int level = 1, int seed = 7}) async {
    SharedPreferences.setMockInitialValues({'psygames_picture_pairs_level_nzt48': '$level'});
    state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(home: PicturePairsScreen(state: state, rnd: Random(seed), theme: theme)));
    for (var i = 0; i < 10 && find.text(L.t('start')).evaluate().isEmpty; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }
    expect(find.text(L.t('start')), findsOneWidget, reason: 'экран поднялся до кнопки старта');
  }

  int cardCount() => find.byWidgetPredicate((w) => w.key is ValueKey<String> &&
      (w.key! as ValueKey<String>).value.startsWith('карта')).evaluate().length;

  /// Картинка карты, если она лицом вверх; -1 — рубашка.
  int face(WidgetTester tester, int i) {
    final f = find.byKey(Key('лицо$i'));
    if (f.evaluate().isEmpty) return -1;
    final img = tester.widget<Image>(find.descendant(of: f, matching: find.byType(Image)));
    return sprites.indexOf((img.image as AssetImage).assetName);
  }

  List<int> board(WidgetTester tester) => [for (var i = 0; i < cardCount(); i++) face(tester, i)];

  bool hud(String key, String value) => find
      .byWidgetPredicate((w) => w is Semantics && w.properties.label == '${L.t(key)}: $value')
      .evaluate()
      .isNotEmpty;

  Future<void> tapCard(WidgetTester tester, int i) async {
    await tester.ensureVisible(find.byKey(Key('карта$i')));
    await tester.tap(find.byKey(Key('карта$i')));
    await tester.pump();
  }

  testWidgets('🔴 уровень проходится нажатиями по раскладу, увиденному на показе', (tester) async {
    await boot(tester, level: 1);
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    final seen = board(tester);
    expect(seen.length, 8, reason: 'на L1 четыре пары');
    expect(seen.every((s) => s >= 0), isTrue, reason: 'на показе все карты лицом вверх');

    await tester.pump(Duration(milliseconds: LevelCfg.of(1).previewMs + 50));
    expect(board(tester).every((s) => s < 0), isTrue, reason: 'после показа все карты закрыты');

    final groups = <int, List<int>>{};
    for (var i = 0; i < seen.length; i++) {
      groups.putIfAbsent(seen[i], () => []).add(i);
    }
    for (final g in groups.values) {
      for (final i in g) {
        await tapCard(tester, i);
      }
      await tester.pump(const Duration(milliseconds: 450));
    }
    expect(hud('hud_correct', '4/4'), isTrue, reason: 'все пары собраны');
    expect(hud('hud_moves', '4'), isTrue, reason: 'четыре хода без промаха');
    expect(find.text(L.t('nextLabel')), findsOneWidget, reason: 'уровень пройден');
    expect(hud('level', '2'), isTrue, reason: 'лестница подняла уровень');
    // Экран разбирается ВНУТРИ теста: 48 картинок грузятся настоящей асинхронностью,
    // и живое дерево после конца теста вешало его сборку (замер 30.09: 10 минут, 0 % ЦП).
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
  });

  testWidgets('🔴 показ идёт столько, сколько объявлен: новичку 8 карт на 3,2 с (0d6d8b28)', (tester) async {
    // Онбординг открывает экран на уровне новичка. До 01.10 это было 0,76 с на восемь
    // карт — меньше одной фиксации глаза на карту (отчёт 7d506dbe «мало времени»).
    expect(LevelCfg.of(1).previewMs, 3200, reason: 'L1: 8 карт по 400 мс');
    await boot(tester, level: 1);
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    await tester.pump(Duration(milliseconds: LevelCfg.of(1).previewMs - 50));
    expect(board(tester).every((s) => s >= 0), isTrue, reason: 'за 50 мс до конца показа все карты лицом вверх');
    await tester.pump(const Duration(milliseconds: 100));
    expect(board(tester).every((s) => s < 0), isTrue, reason: 'показ кончился — карты закрыты');
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
  });

  testWidgets('🔴 промах: ход засчитан, карты закрываются, собранного нет', (tester) async {
    await boot(tester, level: 1);
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    final seen = board(tester);
    await tester.pump(Duration(milliseconds: LevelCfg.of(1).previewMs + 50));
    final a = 0;
    final b = List.generate(seen.length, (i) => i).firstWhere((i) => seen[i] != seen[a]);
    await tapCard(tester, a);
    await tapCard(tester, b);
    expect(hud('hud_moves', '1'), isTrue, reason: 'промах — тоже ход');
    expect(face(tester, a), seen[a], reason: 'пока идёт показ промаха, карты видны');
    await tester.pump(const Duration(milliseconds: 850));
    expect(face(tester, a), -1, reason: 'промах закрылся');
    expect(face(tester, b), -1);
    expect(hud('hud_correct', '0/4'), isTrue);
    // Экран разбирается ВНУТРИ теста: 48 картинок грузятся настоящей асинхронностью,
    // и живое дерево после конца теста вешало его сборку (замер 30.09: 10 минут, 0 % ЦП).
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
  });

  testWidgets('🔴 L29: после промаха две пары меняются местами — ровно подсвеченные', (tester) async {
    // L29: обменов на ошибку ровно (29 − 21) / 4 = 2, бросок не нужен.
    expect(LevelCfg.of(29).swapsPerMiss, 2.0);
    await boot(tester, level: 29);
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    final before = board(tester);
    expect(before.length, 48, reason: 'на L29 двенадцать четвёрок');
    await tester.pump(Duration(milliseconds: LevelCfg.of(29).previewMs + 50));

    // Промах: три карты одной картинки и одна чужая.
    final sym = before[0];
    final same = [for (var i = 0; i < before.length; i++) if (before[i] == sym) i].take(3).toList();
    final other = List.generate(before.length, (i) => i).firstWhere((i) => before[i] != sym);
    for (final i in [...same, other]) {
      await tapCard(tester, i);
    }
    await tester.pump(const Duration(milliseconds: 800));

    // Обмены: считываем подсвеченные пары по мере появления.
    final swaps = <List<int>>[];
    for (var t = 0; t < 60; t++) {
      final lit = [
        for (var i = 0; i < before.length; i++)
          if (find.byKey(Key('обмен$i')).evaluate().isNotEmpty) i,
      ];
      if (lit.isNotEmpty && (swaps.isEmpty || swaps.last.join() != lit.join())) {
        expect(lit.length, 2, reason: 'подсвечена ровно пара');
        swaps.add(lit);
      }
      await tester.pump(const Duration(milliseconds: 50));
    }
    expect(swaps.length, 2, reason: 'обменов после ошибки ровно два');

    // Ответ открывает расклад: он обязан совпасть с показанным, где поменяны ТОЛЬКО эти пары.
    await tester.tap(find.byTooltip(L.t('puzzleShowSolution')));
    await tester.pump();
    final expected = List.of(before);
    for (final p in swaps) {
      final t = expected[p[0]];
      expected[p[0]] = expected[p[1]];
      expected[p[1]] = t;
    }
    expect(board(tester), expected, reason: 'переехали ровно подсвеченные карты');
    // Экран разбирается ВНУТРИ теста: 48 картинок грузятся настоящей асинхронностью,
    // и живое дерево после конца теста вешало его сборку (замер 30.09: 10 минут, 0 % ЦП).
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
  });

  testWidgets('🔴 «Показать решение»: все карты лицом вверх, уровень не тронут', (tester) async {
    await boot(tester, level: 1);
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    final seen = board(tester);
    await tester.pump(Duration(milliseconds: LevelCfg.of(1).previewMs + 50));
    await tester.tap(find.byTooltip(L.t('puzzleShowSolution')));
    await tester.pump();
    expect(board(tester), seen, reason: 'ответ — весь расклад');
    expect(hud('level', '1'), isTrue, reason: 'подсмотренный расклад уровень не поднимает');
    expect(find.text(L.t('retry')), findsOneWidget);
    // Экран разбирается ВНУТРИ теста: 48 картинок грузятся настоящей асинхронностью,
    // и живое дерево после конца теста вешало его сборку (замер 30.09: 10 минут, 0 % ЦП).
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
  });

  testWidgets('🔴 правило уровня объявлено ДО показа — там, где механика меняется', (tester) async {
    await boot(tester, level: 5);
    expect(find.byKey(const Key('правило')), findsNothing, reason: 'на L5 новых правил нет');
    await tester.pumpWidget(const SizedBox());
    for (final (level, key) in [(10, 'lr_picture_pairs_triple_title'), (13, 'lr_picture_pairs_quad_title'), (22, 'lr_picture_pairs_swap_title')]) {
      await boot(tester, level: level);
      expect(find.text(L.t(key)), findsOneWidget, reason: 'L$level объявляет своё правило');
      await tester.pumpWidget(const SizedBox());
    }
  });

  testWidgets('🔴 на 360×640 карты не мельче пальца и не шире экрана', (tester) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await boot(tester, level: 37);
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    expect(cardCount(), 48);
    for (var i = 0; i < 48; i++) {
      final r = tester.getRect(find.byKey(Key('карта$i')));
      expect(r.width, greaterThanOrEqualTo(pairsFingerMin), reason: 'карта $i мельче пальца');
      expect(r.left, greaterThanOrEqualTo(0.0), reason: 'карта $i за левым краем');
      expect(r.right, lessThanOrEqualTo(360.0), reason: 'карта $i за правым краем');
    }
    await tester.pump(const Duration(seconds: 1));
    // Экран разбирается ВНУТРИ теста: 48 картинок грузятся настоящей асинхронностью,
    // и живое дерево после конца теста вешало его сборку (замер 30.09: 10 минут, 0 % ЦП).
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
  });

  testWidgets('уход с экрана гасит таймеры показа и секундомера', (tester) async {
    await boot(tester, level: 1);
    await tester.tap(find.text(L.t('start')));
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pumpWidget(const MaterialApp(home: SizedBox()));
    await tester.pump(const Duration(seconds: 3));
  });
}
