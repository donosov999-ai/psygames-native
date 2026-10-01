import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/picture_pairs/model.dart';
import 'package:psygames_flutter/games/picture_pairs/screen.dart';
import 'package:psygames_flutter/shell/demo_lesson.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 РАЗБОР «ПАРНЫХ КАРТИНОК»: ПОКАЗАННОЕ ОБЯЗАНО СОВПАДАТЬ С ИГРОЙ.
///
/// Разбор, который называет группой не то, что снимает партия, учит не той игре.
/// Поэтому отмеченные на картах разбора места считываются с отрисованных карт и
/// играются настоящей партией с той же колодой и тем же уровнем.
void main() {
  // Словарь — до тестов, не в теле (замер 30.09: чтение ассета в теле testWidgets
  // вешало следующий тест файла).
  setUpAll(() async => L.load('ru'));
  tearDown(LessonUsed.reset);

  final themesJson = jsonDecode(File('assets/pairs/themes.json').readAsStringSync()) as Map<String, dynamic>;
  final theme = PairsTheme.fromJson(themesJson, 'nzt48');

  /// Карты разбора, как их видит человек: какие места выделены.
  Future<List<int>> markedOn(WidgetTester tester, PairsLessonArt art) async {
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: Center(child: art))));
    return [
      for (final e in find.byType(PairCardView).evaluate())
        if ((e.widget as PairCardView).marked) (e.widget as PairCardView).index,
    ];
  }

  testWidgets('🔴 отмеченные в разборе места снимают группу в настоящей партии', (tester) async {
    var played = 0;
    for (final t in pairsLessonTrials(theme, rnd: Random(5))) {
      final art = t.art! as PairsLessonArt;
      if (art.swapPair != null) continue;   // пример про обмен, группы в нём нет
      final marked = await markedOn(tester, art);
      expect(marked.length, art.game.cfg.groupSize,
          reason: 'L${art.game.level}: выделено столько карт, сколько в группе');
      final game = PairsGame(level: art.game.level, cfg: art.game.cfg, deck: [for (final c in art.game.cards) c.symbol]);
      TapResult last = TapResult.ignored;
      for (final i in marked) {
        last = game.tap(i);
      }
      expect(last, TapResult.groupMatched, reason: 'L${art.game.level}: партия снимает показанную группу');
      played++;
    }
    expect(played, 3, reason: 'сыграны все примеры с группой — пара, тройка и жёлтый двойник');
  });

  testWidgets('пример про обмен: подсвечены ровно две карты, и обе рубашкой вверх', (tester) async {
    final art = pairsLessonTrials(theme, rnd: Random(3))
        .map((t) => t.art! as PairsLessonArt)
        .firstWhere((a) => a.swapPair != null);
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: Center(child: art))));
    final lit = [for (var i = 0; i < art.game.cards.length; i++) if (find.byKey(Key('lesson-обмен$i')).evaluate().isNotEmpty) i];
    expect(lit.length, 2);
    expect(find.byKey(const Key('lesson-лицо0')), findsNothing, reason: 'в примере обмена карты закрыты');
  });

  testWidgets('🔴 пример похожих пар: отмечена жёлтая пара, и на поле лежит та же картинка обычной парой', (
    tester,
  ) async {
    final art = pairsLessonTrials(theme, rnd: Random(5)).map((t) => t.art! as PairsLessonArt).last;
    final symbols = [for (final c in art.game.cards) c.symbol];
    final marked = await markedOn(tester, art);
    final twin = symbols[marked.first];
    expect(
      '${marked.every((i) => symbols[i] == twin)} ${pairsIsTwin(twin)} ${symbols.contains(pairsSpriteOf(twin))}',
      'true true true',
    );
  });

  testWidgets('примеры — из генератора игры: пары на L1, тройки на L10', (tester) async {
    for (final seed in [1, 2, 3]) {
      final arts = pairsLessonTrials(theme, rnd: Random(seed)).map((t) => t.art! as PairsLessonArt).toList();
      expect(arts[0].game.cfg.groupSize, 2);
      expect(arts[1].game.cfg.groupSize, 3);
      expect(arts[0].game.cards.length, LevelCfg.of(1).pairs * 2);
      expect(arts[1].game.cards.length, LevelCfg.of(10).pairs * 3);
    }
  });

  for (final size in const [Size(390, 844), Size(375, 667), Size(360, 640)]) {
    testWidgets('🔴 разбор открывается ДО партии и помещается на ${size.width.toInt()}×${size.height.toInt()}',
        (tester) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      SharedPreferences.setMockInitialValues({});
      final state = await SharedState.open();
      await tester.pumpWidget(MaterialApp(home: PicturePairsScreen(state: state, theme: theme, rnd: Random(7))));
      for (var i = 0; i < 10 && find.text(L.t('start')).evaluate().isEmpty; i++) {
        await tester.pump(const Duration(milliseconds: 20));
      }
      expect(find.text(L.t('start')), findsOneWidget, reason: 'партия не начата — экран на готовности');
      await tester.tap(find.byKey(const Key('game-lesson')));
      await tester.pumpAndSettle();
      expect(find.byType(DemoCard), findsOneWidget);
      expect(find.byType(PairCardView), findsWidgets, reason: 'в разборе карты самой игры');
      expect(LessonUsed.inRound, isTrue, reason: 'партия с разбором не засчитывается');
      for (var step = 0; step < 3; step++) {
        await tester.pump(const Duration(seconds: 12));
      }
      await tester.pumpWidget(const SizedBox());
      await tester.pump();
    });
  }
}
