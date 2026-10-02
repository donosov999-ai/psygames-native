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
import 'package:psygames_flutter/shell/preset_cap.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 «ПАРНЫЕ КАРТИНКИ»: СВОБОДНАЯ ПАРТИЯ И ПРОДОЛЖЕНИЕ — НАЖАТИЯМИ И УХОДОМ С ЭКРАНА.
///
/// Расклад считывается с экрана во время показа, как его видит человек. Продолжение
/// проверяется так, как его встречает человек: ушёл посреди партии (экран снесён) и
/// вернулся — расклад, собранное и ходы на месте; показ и доигранная партия записи не
/// оставляют. Отчёт свободной партии перехватывается: метки веба, лестница не двигается.
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

  Future<void> open(WidgetTester tester) async {
    await tester.pumpWidget(MaterialApp(
      home: PicturePairsScreen(key: UniqueKey(), state: state, rnd: Random(7), theme: theme),
    ));
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }
  }

  Future<void> boot(WidgetTester tester, {int level = 1, Map<String, String>? preset}) async {
    // Отложенная запись идёт на игровых часах — им нужно поддельное время пробы.
    gameWallMs = () => tester.binding.clock.now().millisecondsSinceEpoch;
    SharedPreferences.setMockInitialValues({levelKey: '$level'});
    state = await SharedState.open();
    sent.clear();
    SessionReport.sink = (json) async => sent.add(jsonDecode(json) as Map<String, dynamic>);
    if (preset != null) GamePreset.set(preset);
    await open(tester);
  }

  /// Уйти с экрана — экран снесён, как при выходе назад или выгрузке.
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

  Future<void> tapCard(WidgetTester tester, int i) async {
    await tester.ensureVisible(find.byKey(Key('карта$i')));
    await tester.tap(find.byKey(Key('карта$i')));
    await tester.pump();
  }

  Map<int, List<int>> groupsOf(List<int> seen) {
    final g = <int, List<int>>{};
    for (var i = 0; i < seen.length; i++) {
      g.putIfAbsent(seen[i], () => []).add(i);
    }
    return g;
  }

  Future<void> collect(WidgetTester tester, List<int> places) async {
    for (final i in places) {
      await tapCard(tester, i);
    }
    await tester.pump(const Duration(milliseconds: 450));
  }

  Future<void> chooseFree(WidgetTester tester, {int pairs = 6, bool photo = true, int previewMs = 500}) async {
    await tester.tap(find.text(L.t('sudokuModeFree')));
    await tester.pump();
    await tester.tap(find.byKey(Key('pp-pairs-$pairs')));
    await tester.pump();
    if (!photo) {
      await tester.tap(find.byKey(const Key('pp-photo')));
      await tester.pump();
    } else {
      await tester.tap(find.byKey(Key('pp-preview-$previewMs')));
      await tester.pump();
    }
  }

  testWidgets('🔴 свободная партия: 6 пар, показ 0,5 с — доиграна нажатиями; метки веба; лестница не двинулась',
      (tester) async {
    await boot(tester, level: 3);
    await chooseFree(tester, pairs: 6, previewMs: 500);
    await tester.tap(find.byKey(const Key('pp-start')));
    await tester.pump();
    final seen = board(tester);
    expect(seen.length, 12, reason: 'шесть пар — двенадцать карт');
    expect(seen.every((s) => s >= 0), isTrue, reason: 'показ: все лицом вверх');
    await tester.pump(const Duration(milliseconds: 550));
    expect(board(tester).every((s) => s < 0), isTrue, reason: 'после 0,5 с карты закрыты');
    expect(hud('level', '3'), isFalse, reason: 'в свободной партии уровня в шапке нет');

    for (final places in groupsOf(seen).values) {
      await collect(tester, places);
    }
    expect(hud('hud_correct', '6/6'), isTrue);
    final s = sent.single;
    expect('${s['difficulty']} / ${s['mode']}', '6 pairs / photo-500ms');
    // Метрики памяти MindLab (cd9685ec): идеальная память считается по раскладу с показа.
    final ideal = idealMemoryMoves(seen, 2);
    expect(s['details'], {
      'moves': 6,
      'optimal': 6,
      'photo_memory_mode': true,
      'preview_ms': 500,
      'extra_moves': 0,
      'ideal_moves': ideal,
      'efficiency': double.parse((ideal / 6).toStringAsFixed(2)),
      'perseverations': 0,
    });
    expect(find.byKey(const Key('pp-ideal')), findsOneWidget, reason: 'итог сравнивает с идеальной памятью');
    expect(tester.widget<Text>(find.byKey(const Key('pp-ideal'))).data,
        L.t('pairsIdealMoves').replaceAll('{n}', '$ideal'));
    expect(state.get(levelKey), '3', reason: 'свободная партия лестницу не двигает');
    await leave(tester);
  });

  testWidgets('🔴 персеверация в отчёте: тот же промах дважды — одна; эффективность — идеальные на ходы',
      (tester) async {
    await boot(tester, level: 3);
    await chooseFree(tester, pairs: 6, previewMs: 500);
    await tester.tap(find.byKey(const Key('pp-start')));
    await tester.pump();
    final seen = board(tester);
    await tester.pump(const Duration(milliseconds: 550));
    // Две карты с разными картинками: первый промах — разведка, второй тот же — персеверация.
    final a = 0;
    final b = List.generate(seen.length, (i) => i).firstWhere((i) => seen[i] != seen[a]);
    for (var k = 0; k < 2; k++) {
      await tapCard(tester, a);
      await tapCard(tester, b);
      await tester.pump(const Duration(milliseconds: 850));
    }
    for (final places in groupsOf(seen).values) {
      await collect(tester, places);
    }
    final s = sent.single;
    final ideal = idealMemoryMoves(seen, 2);
    final details = s['details'] as Map;
    expect('${details['moves']} ходов, персевераций ${details['perseverations']}', '8 ходов, персевераций 1');
    expect(details['ideal_moves'], ideal);
    expect(details['efficiency'], double.parse((ideal / 8).toStringAsFixed(2)));
    await leave(tester);
  });

  testWidgets('🔴 в русском интерфейсе настройки нет латинских слов — ни одного ключа словаря вместо текста',
      (tester) async {
    // Ключ внутри тернарника (`L.t(x ? 'a' : 'b')`) сборщик словаря не видит, и экран показывал
    // сам ключ: до 01.10 здесь висели «pairsModeFreeHint» и «0.5с (hard)».
    await boot(tester, level: 3);
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
    await chooseFree(tester, pairs: 8, previewMs: 1500);
    scan('свободно');
    expect('латинских слов: ${latin.length}${latin.isEmpty ? '' : ' — ${latin.take(6).join('; ')}'}', 'латинских слов: 0');
    await leave(tester);
  });

  testWidgets('без фото-показа партия начинается закрытой; число пар — выбранное', (tester) async {
    await boot(tester, level: 1);
    await chooseFree(tester, pairs: 8, photo: false);
    await tester.tap(find.byKey(const Key('pp-start')));
    await tester.pump();
    expect(cardCount(), 16);
    expect(board(tester).every((s) => s < 0), isTrue, reason: 'показа нет — все рубашкой вверх');
    await leave(tester);
  });

  testWidgets('🔴 шаг зарядки — свободная партия по шагу: пары под потолком уровня, показ из шага', (tester) async {
    await boot(tester, level: 1, preset: {'wu': '1', 'pairsCount': '10', 'previewMs': '1500'});
    expect(find.byKey(const Key('pp-start')), findsNothing, reason: 'шаг стартует сам');
    final want = capPresetByLevel(want: 10, atLevel: LevelCfg.of(1).pairs, atTop: false);
    expect(cardCount(), want * 2, reason: 'шаг просит 10 пар, освоено 4 — больше освоенного + 1 не даём');
    expect(board(tester).every((s) => s >= 0), isTrue);
    // boot уже прокрутил ~200 мс: шаг стартовал сам в его кадрах. Показ из шага — 1,5 с.
    await tester.pump(const Duration(milliseconds: 1100));
    expect(board(tester).every((s) => s >= 0), isTrue, reason: 'показ из шага — 1,5 с, а не 0,5');
    await tester.pump(const Duration(milliseconds: 300));
    expect(board(tester).every((s) => s < 0), isTrue, reason: 'после 1,5 с показа карты закрыты');
    await leave(tester);
  });

  testWidgets('🔴 продолжение: ушёл посреди партии — вернулся к тому же раскладу, собранному и ходам',
      (tester) async {
    await boot(tester, level: 1);
    await tester.tap(find.byKey(const Key('pp-start')));
    await tester.pump();
    final seen = board(tester);
    await tester.pump(Duration(milliseconds: LevelCfg.of(1).previewMs + 50));
    final groups = groupsOf(seen).values.toList();
    await collect(tester, groups[0]);                       // одна группа собрана
    await tapCard(tester, groups[1][0]);
    await tapCard(tester, groups[2][0]);                    // промах
    await tester.pump(const Duration(milliseconds: 900));
    await tester.pump(pairsResumeDebounce);
    expect(state.get(resumeKey), isNotNull, reason: 'живая партия записана');

    await leave(tester);
    await open(tester);
    expect(find.byKey(const Key('pp-start')), findsNothing, reason: 'вернулись в партию, а не на старт');
    expect(hud('hud_moves', '2'), isTrue);
    expect(hud('hud_correct', '1/4'), isTrue);
    final back = board(tester);
    for (var i = 0; i < seen.length; i++) {
      expect(back[i], groups[0].contains(i) ? seen[i] : -1,
          reason: 'карта $i: собранное лицом вверх на своих местах, остальное закрыто');
    }
    for (final places in groups.skip(1)) {
      await collect(tester, places);
    }
    expect(find.text(L.t('nextLabel')), findsOneWidget, reason: 'тот же расклад доигран по запомненным местам');
    expect(state.get(resumeKey), isNull, reason: 'доигранная партия записи не оставляет');
    await leave(tester);
  });

  testWidgets('🔴 запись — в конверте веба; показ не пишется; «Заново» стирает запись', (tester) async {
    await boot(tester, level: 1);
    await tester.tap(find.byKey(const Key('pp-start')));
    await tester.pump();
    await leave(tester);
    expect(state.get(resumeKey), isNull, reason: 'показ — не партия: снимок лицом вверх был бы шпаргалкой');

    await open(tester);
    expect(find.byKey(const Key('pp-start')), findsOneWidget);
    await tester.tap(find.byKey(const Key('pp-start')));
    await tester.pump();
    final seen = board(tester);
    await tester.pump(Duration(milliseconds: LevelCfg.of(1).previewMs + 50));
    await collect(tester, groupsOf(seen).values.first);
    await tester.pump(pairsResumeDebounce);
    final env = jsonDecode(state.get(resumeKey)!) as Map<String, dynamic>;
    expect(env['v'], pairsResumeVersion);
    expect(env['savedAt'], isA<int>());
    expect((env['state'] as Map)['mode'], 'game');

    await tester.tap(find.byTooltip(L.t('restart')));
    await tester.pump();
    expect(state.get(resumeKey), isNull, reason: '«Заново» — прежняя партия брошена');
    await leave(tester);
  });
}
