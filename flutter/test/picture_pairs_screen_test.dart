import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/picture_pairs/model.dart';
import 'package:psygames_flutter/games/picture_pairs/screen.dart';
import 'package:psygames_flutter/shell/game_clock.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'support/settings_fit.dart';

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

  final sent = <Map<String, dynamic>>[];
  tearDown(() {
    gameWallMs = () => DateTime.now().millisecondsSinceEpoch;
    SessionReport.sink = null;
    LessonUsed.reset();
  });

  Future<void> boot(WidgetTester tester, {int level = 1, int seed = 7}) async {
    // Показ, снятие группы и обмены идут на игровых часах — им нужно поддельное время пробы.
    gameWallMs = () => tester.binding.clock.now().millisecondsSinceEpoch;
    sent.clear();
    SessionReport.sink = (json) async => sent.add(jsonDecode(json) as Map<String, dynamic>);
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

  /// Собрать уровень по раскладу, увиденному на показе; [midHold] — сколько простоять на
  /// паузе посреди партии (пауза каркаса держит игровые часы — `holdGame`).
  Future<void> playLevel(WidgetTester tester, {required int level, Duration midHold = Duration.zero}) async {
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    final seen = board(tester);
    await tester.pump(Duration(milliseconds: LevelCfg.of(level).previewMs + 50));
    final groups = <int, List<int>>{};
    for (var i = 0; i < seen.length; i++) {
      groups.putIfAbsent(seen[i], () => []).add(i);
    }
    var first = true;
    for (final g in groups.values) {
      for (final i in g) {
        await tapCard(tester, i);
      }
      await tester.pump(const Duration(milliseconds: 450));
      if (first && midHold > Duration.zero) {
        final release = holdGame();
        await tester.pump(midHold);
        release();
        await tester.pump();
      }
      first = false;
    }
  }

  testWidgets('🔴 время партии — по игровым часам: полминуты на паузе в отчёт не входят', (tester) async {
    // Был Stopwatch: минуты в меню паузы и в разборе шли в time_seconds и снимали очки уровня
    // (2 за секунду) — сверка веб → натив 02.10.2026; веб считает по gameNow.
    await boot(tester, level: 1);
    await playLevel(tester, level: 1, midHold: const Duration(seconds: 30));
    expect(find.text(L.t('nextLabel')), findsOneWidget, reason: 'уровень пройден');
    final t = sent.single['time_seconds'] as int;
    expect(t, lessThan(10), reason: 'партия шла пару секунд, 30 секунд паузы — не партия; в отчёте $t');
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
  });

  testWidgets('🔴 показ стоит под паузой: карты не закрываются, пока партия на паузе', (tester) async {
    await boot(tester, level: 1);
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    final release = holdGame();
    await tester.pump(Duration(milliseconds: LevelCfg.of(1).previewMs + 2000));
    expect(board(tester).every((s) => s >= 0), isTrue, reason: 'на паузе показ не сгорает');
    release();
    await tester.pump(Duration(milliseconds: LevelCfg.of(1).previewMs + 50));
    expect(board(tester).every((s) => s < 0), isTrue, reason: 'после паузы показ дошёл до конца');
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
  });

  testWidgets('🔴 ход отзывается вибрацией: карта — лёгкая, группа — средняя, промах — сильная', (tester) async {
    final kinds = <String>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'HapticFeedback.vibrate') kinds.add('${call.arguments}');
      return null;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
    await boot(tester, level: 1);
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    final seen = board(tester);
    await tester.pump(Duration(milliseconds: LevelCfg.of(1).previewMs + 50));
    final a = 0;
    final mate = List.generate(seen.length, (i) => i).firstWhere((i) => i != a && seen[i] == seen[a]);
    final other = List.generate(seen.length, (i) => i).firstWhere((i) => seen[i] != seen[a]);
    await tapCard(tester, a);
    await tapCard(tester, mate);
    await tester.pump(const Duration(milliseconds: 450));
    final oMate = List.generate(seen.length, (i) => i).firstWhere((i) => i != other && seen[i] != seen[other] && seen[i] != seen[a]);
    await tapCard(tester, other);
    await tapCard(tester, oMate);
    await tester.pump(const Duration(milliseconds: 850));
    expect(kinds, [
      'HapticFeedbackType.selectionClick',
      'HapticFeedbackType.mediumImpact',
      'HapticFeedbackType.selectionClick',
      'HapticFeedbackType.heavyImpact',
    ]);
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
  });

  testWidgets('🔴 карта читается скринридером: закрытая — только номер, открытая — номер и картинка', (tester) async {
    await boot(tester, level: 1);
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    final seen = board(tester);
    await tester.pump(Duration(milliseconds: LevelCfg.of(1).previewMs + 50));
    String label(int i) => tester
        .widget<Semantics>(find.ancestor(of: find.byKey(Key('карта$i')), matching: find.byType(Semantics)).first)
        .properties
        .label!;
    expect(label(0), '${L.t('a11yCard')} 1', reason: 'закрытую карту не называем — иначе игра теряет смысл');
    await tapCard(tester, 0);
    expect(label(0), '${L.t('a11yCard')} 1, ${seen[0] + 1}');
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
  });

  testWidgets('🔴 отметку разбора снимает новая раздача — партия снова зачётная, как у «Корси»', (tester) async {
    await boot(tester, level: 1);
    LessonUsed.mark();
    await tester.tap(find.byTooltip(L.t('restart')).first);
    await tester.pump();
    expect(LessonUsed.inRound, isFalse);
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
  });

  testWidgets('🔴 свободная партия с открытым разбором уходит в отчёт с меткой lesson, как партия уровня',
      (tester) async {
    await boot(tester, level: 1);
    await tester.tap(find.text(L.t('sudokuModeFree')));
    await tester.pump();
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    final seen = board(tester);
    expect(seen.length, 12, reason: 'свободная партия — шесть пар по умолчанию');
    await tester.pump(const Duration(milliseconds: 550));
    LessonUsed.mark(); // разбор открыт посреди партии
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
    final d = sent.single['details'] as Map;
    expect('${sent.single['difficulty']} · lesson ${d['lesson']}', '6 pairs · lesson true');
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

  testWidgets('🔴 настройка на 360×640 по-английски и по-русски: «Начать» на первом экране (ae1d918b)', (tester) async {
    // L13 — правило уровня («четвёрки») стоит на экране настройки: самый длинный вид уровней.
    await expectSettingsFit(tester, () => boot(tester, level: 13), where: 'picture-pairs, уровни L13');
    // Свободная партия: число пар, фото-показ и его длительность — больше всего выборов.
    await expectSettingsFit(tester, () async {
      await boot(tester, level: 3);
      await tester.tap(find.text(L.t('sudokuModeFree')));
      await tester.pump();
    }, where: 'picture-pairs, свободно');
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
  });

  testWidgets('🔴 партия на 360×640: органы ответа целиком на экране (или в прокрутке поля), не меньше 48×48 (приёмка 6596a00d)',
      (tester) async {
    await expectPlayFit(tester, () async {
      await boot(tester, level: 13);
      await tester.tap(find.text(L.t('start')));
      await tester.pump(const Duration(milliseconds: 300));
      if (find.text(L.t('ctaGotIt')).evaluate().isNotEmpty) {
        await tester.tap(find.text(L.t('ctaGotIt')));
        await tester.pump(const Duration(milliseconds: 300));
      }
      await tester.pump(Duration(milliseconds: LevelCfg.of(13).previewMs + 50));
    }, where: 'picture-pairs L13, ход');
    await tester.pumpWidget(const SizedBox());
  });
}
