import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/picture_pairs/duel.dart';
import 'package:psygames_flutter/games/picture_pairs/screen.dart';
import 'package:psygames_flutter/shell/game_clock.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ⚔️ «ПАРНЫЕ КАРТИНКИ», ДУЭЛЬ С БОТОМ — НАЖАТИЯМИ, КАК ЕЁ ИГРАЕТ ЧЕЛОВЕК (задача cd9685ec).
///
/// За человека играет проба с идеальной памятью: она видит только то, что видно на экране, —
/// свои карты и карты бота, пока они открыты. Бот ходит сам, на игровых часах.
void main() {
  late SharedState state;
  final sent = <Map<String, dynamic>>[];
  final themesJson = jsonDecode(File('assets/pairs/themes.json').readAsStringSync()) as Map<String, dynamic>;
  final sprites = (themesJson['sprites'] as Map<String, dynamic>)['brain'] as List;
  final theme = PairsTheme.fromJson(themesJson, 'nzt48');
  const resumeKey = 'psygames_resume_picture_pairs_nzt48';
  const levelKey = 'psygames_picture_pairs_level_nzt48';

  setUpAll(() async => L.load('ru'));

  tearDown(() {
    gameWallMs = () => DateTime.now().millisecondsSinceEpoch;
    GamePreset.clear();
    SessionReport.sink = null;
  });

  Future<void> boot(WidgetTester tester, {int level = 4}) async {
    // Бот ходит на игровых часах — им нужно поддельное время пробы.
    gameWallMs = () => tester.binding.clock.now().millisecondsSinceEpoch;
    SharedPreferences.setMockInitialValues({levelKey: '$level'});
    state = await SharedState.open();
    sent.clear();
    SessionReport.sink = (json) async => sent.add(jsonDecode(json) as Map<String, dynamic>);
    await tester.pumpWidget(MaterialApp(
      home: PicturePairsScreen(key: UniqueKey(), state: state, rnd: Random(11), theme: theme),
    ));
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }
  }

  Future<void> leave(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
  }

  int cardCount() => find.byWidgetPredicate((w) => w.key is ValueKey<String> &&
      (w.key! as ValueKey<String>).value.startsWith('карта')).evaluate().length;

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

  String caption(WidgetTester tester) {
    final f = find.byKey(const Key('pp-caption'));
    return f.evaluate().isEmpty ? '' : tester.widget<Text>(f).data ?? '';
  }

  Future<void> chooseDuel(
    WidgetTester tester, {
    int pairs = 6,
    PairsBotLevel bot = PairsBotLevel.kitten,
    int group = 2,
  }) async {
    await tester.tap(find.text(L.t('pairsModeDuel')));
    await tester.pump();
    await tester.tap(find.byKey(Key('pp-group-$group')));
    await tester.pump();
    await tester.tap(find.byKey(Key('pp-pairs-$pairs')));
    await tester.pump();
    await tester.tap(find.byKey(Key('pp-bot-${bot.name}')));
    await tester.pump();
  }

  /// Открыть карту; `false` — нажатие не прошло (поле заперто), карта осталась закрытой.
  Future<bool> open(WidgetTester tester, int i) async {
    await tester.ensureVisible(find.byKey(Key('карта$i')));
    await tester.tap(find.byKey(Key('карта$i')));
    await tester.pump(const Duration(milliseconds: 16));
    return face(tester, i) >= 0;
  }

  /// Доиграть дуэль за человека с идеальной памятью. Возвращает, сколько раз ходил бот.
  /// Ход — [group] карт: известна вся группа — снять её; иначе первая незнакомая, к ней
  /// известные той же картинки, остаток — незнакомыми.
  Future<int> playToEnd(WidgetTester tester, {int group = 2}) async {
    final seen = <int, int>{};
    var botTurns = 0;
    var wasBot = false;
    void look() {
      final b = board(tester);
      for (var i = 0; i < b.length; i++) {
        if (b[i] >= 0) seen[i] = b[i];
      }
    }

    for (var step = 0; step < 2000; step++) {
      if (find.byKey(const Key('pp-duel-result')).evaluate().isNotEmpty) return botTurns;
      look();
      final mine = caption(tester) == L.t('pairsDuelYourTurn');
      if (!mine) {
        if (!wasBot && caption(tester) == L.t('pairsDuelBotTurn')) botTurns++;
        wasBot = caption(tester) == L.t('pairsDuelBotTurn');
        await tester.pump(const Duration(milliseconds: 100));
        continue;
      }
      wasBot = false;
      bool closed(int i) => face(tester, i) < 0;
      final known = <int, List<int>>{};
      for (final e in seen.entries) {
        if (closed(e.key)) known.putIfAbsent(e.value, () => []).add(e.key);
      }
      final whole = known.values.where((v) => v.length >= group).firstOrNull;
      final n = cardCount();
      final List<int> plan;
      if (whole != null) {
        plan = whole.take(group).toList();
      } else {
        final a = List.generate(n, (i) => i).firstWhere((i) => closed(i) && !seen.containsKey(i));
        plan = [a];
      }
      if (!await open(tester, plan.first)) {
        await tester.pump(const Duration(milliseconds: 100));
        continue;
      }
      look();
      final opened = [plan.first];
      while (opened.length < group) {
        int next;
        if (plan.length == group) {
          next = plan[opened.length];
        } else {
          final s = seen[plan.first]!;
          final mate = seen.entries.where((e) => !opened.contains(e.key) && e.value == s && closed(e.key)).firstOrNull;
          next =
              mate?.key ??
              List.generate(n, (i) => i).firstWhere((i) => closed(i) && !seen.containsKey(i) && !opened.contains(i));
        }
        await open(tester, next);
        opened.add(next);
        look();
      }
      await tester.pump(const Duration(milliseconds: 900));
    }
    fail('дуэль не кончилась за 2000 шагов');
  }

  testWidgets('🔴 дуэль доиграна нажатиями: ходы по очереди, бот ходит сам, итог и отчёт; лестница и снимок не тронуты',
      (tester) async {
    await boot(tester, level: 4);
    await chooseDuel(tester, pairs: 6, bot: PairsBotLevel.kitten);
    await tester.tap(find.byKey(const Key('pp-start')));
    await tester.pump();
    expect(cardCount(), 12, reason: 'шесть пар');
    expect(board(tester).every((s) => s < 0), isTrue, reason: 'в дуэли показа нет — карты сразу закрыты');
    expect(caption(tester), L.t('pairsDuelYourTurn'), reason: 'первым ходит человек');
    expect(hud('pairsDuelYou', '0') && hud('rbBot', '0'), isTrue, reason: 'в шапке — счёт сторон');
    expect(hud('level', '4'), isFalse, reason: 'дуэль лестницу не показывает');

    final botTurns = await playToEnd(tester);
    expect(botTurns, greaterThan(0), reason: 'бот ходил сам');
    final s = sent.single;
    final d = s['details'] as Map;
    expect('${s['mode']} / ${s['difficulty']}', 'duel-kitten / 6 pairs');
    expect((d['player_pairs'] as int) + (d['bot_pairs'] as int), 6, reason: 'все пары разобраны');
    expect(d['bot'], 'kitten');
    expect(d['bot_memory'], 2);
    final you = d['player_pairs'] as int;
    final bot = d['bot_pairs'] as int;
    final key = you > bot ? 'pairsDuelWin' : you < bot ? 'pairsDuelLose' : 'pairsDuelDraw';
    expect(d['outcome'], you.compareTo(bot));
    expect(tester.widget<Text>(find.byKey(const Key('pp-duel-result'))).data,
        L.t(key).replaceAll('{you}', '$you').replaceAll('{bot}', '$bot'));
    expect(hud('pairsDuelYou', '$you') && hud('rbBot', '$bot'), isTrue);
    expect(state.get(levelKey), '4', reason: 'дуэль лестницу не двигает');
    expect(state.get(resumeKey), isNull, reason: 'дуэль снимком не пишется');
    await leave(tester);
  });

  testWidgets('🔴 дуэль на тройках доиграна нажатиями: ход — три карты у обеих сторон, отчёт с размером группы', (
    tester,
  ) async {
    await boot(tester, level: 4);
    await chooseDuel(tester, pairs: 6, bot: PairsBotLevel.fox, group: 3);
    expect(tester.widget<Text>(find.byKey(const Key('pp-group-3'))).data, L.t('lr_picture_pairs_triple_title'));
    expect(find.text(L.t('pairsDuelHintTriples')), findsOneWidget, reason: 'подсказка — про три карты за ход');
    await tester.tap(find.byKey(const Key('pp-start')));
    await tester.pump();
    expect(cardCount(), 18, reason: 'шесть троек');
    // Первый ход человека: две разные карты ещё не конец хода — открывается третья.
    await open(tester, 0);
    await open(tester, 1);
    expect(caption(tester), L.t('pairsDuelYourTurn'), reason: 'две карты из трёх — ход не кончен');
    await open(tester, 2);
    expect(board(tester).where((s) => s >= 0).length, 3, reason: 'ход — три карты');
    await tester.pump(const Duration(milliseconds: 900));

    final botTurns = await playToEnd(tester, group: 3);
    expect(botTurns, greaterThan(0), reason: 'бот ходил сам');
    final s = sent.single;
    final d = s['details'] as Map;
    expect('${s['mode']} / ${s['difficulty']} / группа ${d['group_size']}', 'duel-fox / 6 triples / группа 3');
    expect((d['player_pairs'] as int) + (d['bot_pairs'] as int), 6, reason: 'все тройки разобраны');
    expect(state.get(levelKey), '4', reason: 'дуэль лестницу не двигает');
    await leave(tester);
  });

  testWidgets('🔴 бот на тройках открывает три карты по одной, с паузой', (tester) async {
    await boot(tester);
    await chooseDuel(tester, pairs: 8, bot: PairsBotLevel.owl, group: 3);
    await tester.tap(find.byKey(const Key('pp-start')));
    await tester.pump();
    final first = <int>[];
    for (var i = 0; first.length < 3; i++) {
      await open(tester, i);
      first.add(face(tester, i));
    }
    expect(
      first.toSet().length > 1,
      isTrue,
      reason: 'нужен промах: на зерне Random(11) первые три карты не одна тройка — иначе поменяйте зерно пробы',
    );
    await tester.pump(const Duration(milliseconds: 810));
    expect(caption(tester), L.t('pairsDuelBotTurn'), reason: 'промах — ход бота');
    for (var k = 1; k <= 3; k++) {
      await tester.pump(const Duration(milliseconds: pairsBotStepMs + 10));
      expect(board(tester).where((s) => s >= 0).length, k, reason: 'бот открыл карту $k из трёх');
    }
    await leave(tester);
  });

  testWidgets('🔴 карты бота видны человеку: после промаха бот открывает по карте с паузой', (tester) async {
    await boot(tester);
    await chooseDuel(tester, pairs: 8, bot: PairsBotLevel.owl);
    await tester.tap(find.byKey(const Key('pp-start')));
    await tester.pump();
    await open(tester, 0);
    await open(tester, 1);
    expect(face(tester, 0) != face(tester, 1), isTrue,
        reason: 'нужен промах: на зерне Random(11) первые две карты разные — иначе поменяйте зерно пробы');
    await tester.pump(const Duration(milliseconds: 810));
    expect(caption(tester), L.t('pairsDuelBotTurn'), reason: 'промах — ход бота');
    expect(board(tester).where((s) => s >= 0).length, 0, reason: 'промах закрылся');
    await tester.pump(const Duration(milliseconds: pairsBotStepMs + 10));
    expect(board(tester).where((s) => s >= 0).length, 1, reason: 'бот открыл первую карту — она видна');
    await tester.pump(const Duration(milliseconds: pairsBotStepMs));
    expect(board(tester).where((s) => s >= 0).length, 2, reason: 'и вторую');
    // Ушёл посреди дуэли — снимка нет: ход бота из снимка честно не поднять.
    await leave(tester);
    expect(state.get(resumeKey), isNull, reason: 'дуэль снимком не пишется даже при уходе посреди партии');
  });

  testWidgets('память бота на экране настройки: котёнок — 2 карты, лиса — 3, сова — всё', (tester) async {
    await boot(tester);
    await chooseDuel(tester, bot: PairsBotLevel.kitten);
    String memory() => tester.widget<Text>(find.byKey(const Key('pp-bot-memory'))).data ?? '';
    expect(memory(), L.t('pairsBotRemembersN').replaceAll('{n}', '2'));
    await tester.tap(find.byKey(const Key('pp-bot-fox')));
    await tester.pump();
    expect(memory(), L.t('pairsBotRemembersN').replaceAll('{n}', '3'));
    await tester.tap(find.byKey(const Key('pp-bot-owl')));
    await tester.pump();
    expect(memory(), L.t('pairsBotRemembersAll'));
    await leave(tester);
  });

  testWidgets('🔴 в русском интерфейсе настройки нет латинских слов — ни одного ключа словаря вместо текста',
      (tester) async {
    // Ключ внутри тернарника или switch (`L.t(x ? 'a' : 'b')`) сборщик словаря не видит, и экран
    // показывает сам ключ: так до 01.10 в свободной партии висели pairsModeFreeHint и «(hard)».
    await boot(tester);
    final latin = <String>[];
    void scan(String where) {
      for (final e in find.byType(Text).evaluate()) {
        final t = (e.widget as Text).data ?? '';
        for (final m in RegExp(r'[A-Za-z]{3,}').allMatches(t)) {
          latin.add('$where: «${m.group(0)}» в «$t»');
        }
      }
    }

    scan('уровни');
    await tester.tap(find.text(L.t('sudokuModeFree')));
    await tester.pump();
    scan('свободно');
    await chooseDuel(tester, bot: PairsBotLevel.owl);
    scan('дуэль');
    await tester.tap(find.byKey(const Key('pp-group-3')));
    await tester.pump();
    scan('дуэль на тройках');
    await tester.tap(find.text(L.t('pairsModeKids')));
    await tester.pump();
    scan('малыши');
    expect('латинских слов: ${latin.length}${latin.isEmpty ? '' : ' — ${latin.take(6).join('; ')}'}', 'латинских слов: 0');
    await leave(tester);
  });

  testWidgets('🔴 настройка дуэли на 360×640: режимы и три бота без переполнения, «Начать» видна', (tester) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await boot(tester);
    await chooseDuel(tester, bot: PairsBotLevel.fox, group: 3);
    final start = tester.getRect(find.byKey(const Key('pp-start')));
    expect(start.bottom, lessThanOrEqualTo(640.0), reason: '«Начать» на первом экране');
    for (final b in PairsBotLevel.values) {
      final r = tester.getRect(find.byKey(Key('pp-bot-${b.name}')));
      expect(r.right, lessThanOrEqualTo(360.0), reason: '${b.name} не за краем');
    }
    for (final g in [2, 3]) {
      final r = tester.getRect(find.byKey(Key('pp-group-$g')));
      expect(r.left >= 0 && r.right <= 360, isTrue, reason: 'группа $g не за краем: $r');
    }
    expect(tester.takeException(), isNull, reason: 'без переполнения');
    await leave(tester);
  });
}
