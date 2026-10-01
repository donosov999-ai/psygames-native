import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/picture_pairs/model.dart';
import 'package:psygames_flutter/games/picture_pairs/screen.dart';
import 'package:psygames_flutter/shell/game_clock.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🧸 «ПАРНЫЕ КАРТИНКИ», РЕЖИМ «МАЛЫШИ» — НАЖАТИЯМИ (задача cd9685ec, движок MindLab «Пары»).
///
/// За ребёнка играет проба с идеальной памятью, открывающая карты по порядку, — это ровно
/// стратегия эталона [idealMemoryMoves]: её ходы равны идеальным, эффективность 1, три звезды.
void main() {
  late SharedState state;
  final sent = <Map<String, dynamic>>[];
  final themesJson = jsonDecode(File('assets/pairs/themes.json').readAsStringSync()) as Map<String, dynamic>;
  final sprites = (themesJson['sprites'] as Map<String, dynamic>)['brain'] as List;
  final theme = PairsTheme.fromJson(themesJson, 'nzt48');
  const resumeKey = 'psygames_resume_picture_pairs_nzt48';
  const levelKey = 'psygames_picture_pairs_level_nzt48';
  const kidsKey = 'psygames_picture_pairs_kids_step_nzt48';

  setUpAll(() async => L.load('ru'));

  tearDown(() {
    gameWallMs = () => DateTime.now().millisecondsSinceEpoch;
    GamePreset.clear();
    SessionReport.sink = null;
  });

  Future<void> boot(WidgetTester tester, {int level = 5, int? kidsStep}) async {
    gameWallMs = () => tester.binding.clock.now().millisecondsSinceEpoch;
    SharedPreferences.setMockInitialValues({
      levelKey: '$level',
      if (kidsStep != null) kidsKey: '$kidsStep',
    });
    state = await SharedState.open();
    sent.clear();
    SessionReport.sink = (json) async => sent.add(jsonDecode(json) as Map<String, dynamic>);
    await tester.pumpWidget(MaterialApp(
      home: PicturePairsScreen(key: UniqueKey(), state: state, rnd: Random(5), theme: theme),
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

  /// Что видно на открытой карте: картинка и, у жёлтого двойника, ещё карточка — как номер
  /// карты в модели ([pairsSpriteOf], [pairsIsTwin]). Закрытая — −1.
  int face(WidgetTester tester, int i, {String prefix = ''}) {
    final f = find.byKey(Key('$prefixлицо$i'));
    if (f.evaluate().isEmpty) return -1;
    final img = tester.widget<Image>(find.descendant(of: f, matching: find.byType(Image)));
    final yellow = (tester.widget<Container>(f).decoration! as BoxDecoration).color == pairsTwinColor;
    return sprites.indexOf((img.image as AssetImage).assetName) + (yellow ? pairsSpriteCount : 0);
  }

  bool hud(String key) => find
      .byWidgetPredicate((w) => w is Semantics && (w.properties.label ?? '').startsWith('${L.t(key)}: '))
      .evaluate()
      .isNotEmpty;

  Future<void> open(WidgetTester tester, int i) async {
    await tester.ensureVisible(find.byKey(Key('карта$i')));
    await tester.tap(find.byKey(Key('карта$i')));
    await tester.pump(const Duration(milliseconds: 16));
  }

  /// Идеальная память по порядку мест: известная пара — снять; иначе первая незнакомая, к ней
  /// известная пара или следующая незнакомая. Ровно стратегия эталона.
  Future<int> playIdeal(WidgetTester tester) async {
    final seen = <int, int>{};
    var moves = 0;
    bool closed(int i) => face(tester, i) < 0;
    while (find.byKey(const Key('pp-kids-stars')).evaluate().isEmpty) {
      final n = cardCount();
      final known = <int, List<int>>{};
      for (final e in seen.entries) {
        if (closed(e.key)) known.putIfAbsent(e.value, () => []).add(e.key);
      }
      final pair = known.values.where((v) => v.length >= 2).firstOrNull;
      int a;
      int b;
      if (pair != null) {
        a = pair[0];
        b = pair[1];
        await open(tester, a);
      } else {
        a = List.generate(n, (i) => i).firstWhere((i) => closed(i) && !seen.containsKey(i));
        await open(tester, a);
        seen[a] = face(tester, a);
        final mate = seen.entries.where((e) => e.key != a && e.value == seen[a] && closed(e.key)).firstOrNull;
        b = mate?.key ?? List.generate(n, (i) => i).firstWhere((i) => closed(i) && !seen.containsKey(i));
      }
      await open(tester, b);
      seen[b] = face(tester, b);
      moves++;
      await tester.pump(const Duration(milliseconds: 900));
      if (moves > 200) fail('партия не кончилась за 200 ходов');
    }
    return moves;
  }

  testWidgets('🔴 «Малыши»: ступень 1 — 4 пары без показа и без часов; идеальная игра — три звезды и ступень 2',
      (tester) async {
    await boot(tester);
    await tester.tap(find.text(L.t('pairsModeKids')));
    await tester.pump();
    expect(tester.widget<Text>(find.byKey(const Key('pp-kids-step'))).data,
        L.t('pairsKidsStep').replaceAll('{n}', '1').replaceAll('{m}', '${pairsKidsSteps.length}').replaceAll('{p}', '4'));
    await tester.tap(find.byKey(const Key('pp-start')));
    await tester.pump();
    expect(cardCount(), 8, reason: 'ступень 1 — четыре пары');
    expect([for (var i = 0; i < 8; i++) face(tester, i)].every((s) => s < 0), isTrue, reason: 'показа нет');
    expect(hud('time'), isFalse, reason: 'часов у «Малышей» нет');
    expect(hud('level'), isFalse, reason: 'лестницы тоже');

    final moves = await playIdeal(tester);
    expect(tester.widget<Text>(find.byKey(const Key('pp-kids-stars'))).data, '★★★');
    expect(find.byKey(const Key('pp-kids-up')), findsOneWidget, reason: 'объявлена новая ступень');
    expect(state.get(kidsKey), '1', reason: 'ступень сохранена у профиля');
    expect(state.get(levelKey), '5', reason: 'лестница уровней не тронута');
    expect(state.get(resumeKey), isNull, reason: 'снимком «Малыши» не пишутся');
    final s = sent.single;
    final d = s['details'] as Map;
    expect('${s['mode']} / ${s['difficulty']} / ступень ${d['step']} / звёзд ${d['stars']}', 'kids / 4 pairs / ступень 1 / звёзд 3');
    expect(d['moves'], moves);
    expect(d['ideal_moves'], moves, reason: 'стратегия пробы — ровно эталон');
    expect(d['efficiency'], 1.0);

    await tester.tap(find.text(L.t('nextLabel')));
    await tester.pump();
    expect(tester.widget<Text>(find.byKey(const Key('pp-kids-step'))).data,
        L.t('pairsKidsStep').replaceAll('{n}', '2').replaceAll('{m}', '${pairsKidsSteps.length}').replaceAll('{p}', '8'));
    await leave(tester);
  });

  testWidgets('ступень берётся из профиля: третья — 12 пар', (tester) async {
    await boot(tester, kidsStep: 2);
    await tester.tap(find.text(L.t('pairsModeKids')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('pp-start')));
    await tester.pump();
    expect(cardCount(), 24);
    await leave(tester);
  });

  testWidgets('🔴 ступень 4 — похожие пары: правило и образец ДО партии, идеальная игра различает цвет — три звезды', (
    tester,
  ) async {
    await boot(tester, kidsStep: 3);
    await tester.tap(find.text(L.t('pairsModeKids')));
    await tester.pump();
    expect(
      tester.widget<Text>(find.byKey(const Key('pp-kids-step'))).data,
      L.t('pairsKidsStep').replaceAll('{n}', '4').replaceAll('{m}', '${pairsKidsSteps.length}').replaceAll('{p}', '12'),
    );
    expect(tester.widget<Text>(find.byKey(const Key('pp-kids-twins'))).data, L.t('pairsKidsTwins'));
    // Образец — карты самой игры: одна картинка на обычной и на жёлтой карточке.
    final plain = face(tester, 0, prefix: 'twin-');
    final twin = face(tester, pairsSpriteCount, prefix: 'twin-');
    expect(
      '${pairsIsTwin(plain)} ${pairsIsTwin(twin)} ${pairsSpriteOf(plain) == pairsSpriteOf(twin)}',
      'false true true',
    );

    await tester.tap(find.byKey(const Key('pp-start')));
    await tester.pump();
    expect(cardCount(), 24, reason: 'двенадцать пар');
    final moves = await playIdeal(tester);
    expect(tester.widget<Text>(find.byKey(const Key('pp-kids-stars'))).data, '★★★');
    final d = sent.single['details'] as Map;
    expect(
      'ступень ${d['step']} · пар ${d['pairs']} · жёлтых ${d['twins']} · ходов ${d['moves'] == moves} · '
          'идеально ${d['ideal_moves'] == moves}',
      'ступень 4 · пар 12 · жёлтых 2 · ходов true · идеально true',
    );
    await leave(tester);
  });

  testWidgets('🔴 жёлтый двойник — другая пара: обычная и жёлтая карта одной картинки закрываются промахом', (
    tester,
  ) async {
    await boot(tester, kidsStep: 5);
    await tester.tap(find.text(L.t('pairsModeKids')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('pp-start')));
    await tester.pump();
    // Разведка парами мест подряд, пока не увидены обычная и жёлтая карта одной картинки.
    final seen = <int, int>{};
    (int, int)? couple() {
      for (final a in seen.entries) {
        for (final b in seen.entries) {
          if (!pairsIsTwin(a.value) &&
              b.value == a.value + pairsSpriteCount &&
              face(tester, a.key) < 0 &&
              face(tester, b.key) < 0) {
            return (a.key, b.key);
          }
        }
      }
      return null;
    }

    for (var i = 0; couple() == null; i += 2) {
      if (i + 1 >= cardCount()) fail('за проход по полю двойник не встретился');
      for (final j in [i, i + 1]) {
        if (face(tester, j) < 0) {
          await open(tester, j);
          seen[j] = face(tester, j);
        }
      }
      await tester.pump(const Duration(milliseconds: 900));
    }
    final (a, b) = couple()!;
    final matchedBefore = find
        .byWidgetPredicate((w) => w is Container && (w.decoration as BoxDecoration?)?.color == const Color(0xFF22C55E))
        .evaluate()
        .length;
    await open(tester, a);
    await open(tester, b);
    await tester.pump(const Duration(milliseconds: 900));
    expect(
      '${face(tester, a)} ${face(tester, b)}',
      '-1 -1',
      reason: 'картинка одна, карточки разные — промах, обе закрылись',
    );
    final matchedAfter = find
        .byWidgetPredicate((w) => w is Container && (w.decoration as BoxDecoration?)?.color == const Color(0xFF22C55E))
        .evaluate()
        .length;
    expect(matchedAfter, matchedBefore, reason: 'ничего не собрано');
    await leave(tester);
  });

  testWidgets('🔴 четыре режима фишками на 360×640: все в окне, «Начать» видна', (tester) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await boot(tester);
    for (final m in PairsMode.values) {
      final r = tester.getRect(find.byKey(Key('pp-mode-${m.name}')));
      expect(r.left >= 0 && r.right <= 360, isTrue, reason: '${m.name}: $r');
    }
    await tester.tap(find.text(L.t('pairsModeKids')));
    await tester.pump();
    expect(tester.getRect(find.byKey(const Key('pp-start'))).bottom, lessThanOrEqualTo(640.0));
    await leave(tester);
  });

  testWidgets('🔴 ступень с похожими парами на 360×640: правило и образец не выталкивают «Начать»', (tester) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await boot(tester, kidsStep: pairsKidsSteps.length - 1);
    await tester.tap(find.text(L.t('pairsModeKids')));
    await tester.pump();
    expect(find.byKey(const Key('pp-kids-twins')), findsOneWidget);
    expect(tester.getRect(find.byKey(const Key('pp-start'))).bottom, lessThanOrEqualTo(640.0));
    expect(tester.takeException(), isNull, reason: 'без переполнения');
    await tester.tap(find.byKey(const Key('pp-start')));
    await tester.pump();
    expect(cardCount(), 48, reason: 'последняя ступень — 24 пары');
    expect(tester.takeException(), isNull, reason: 'поле 48 карт без переполнения');
    await leave(tester);
  });
}
