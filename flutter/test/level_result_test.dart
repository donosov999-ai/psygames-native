import 'package:flame/game.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/level_ladder.dart';
import 'package:psygames_flutter/shell/level_result.dart';
import 'package:psygames_flutter/shell/reward_effects.dart';

/// 🔴 АВТОПЕРЕХОД ИТОГА УРОВНЯ (задача e90a53d5). Денис 13.11: «должна же во всех играх автопереход быть».
/// Пройдено — следующая партия сама через 1,5 с, провал — «Ещё раз» сам через 2,5 с, тап — сразу;
/// «Настройки» останавливают отсчёт; в зарядке автоперехода нет (шаг ведёт мост зарядки).
void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await L.load('ru');
  });
  setUp(() {
    LevelResult.autoAdvance = true;
    LevelResult.effects = true;
    GamePreset.clear();
  });
  tearDown(() {
    LevelResult.autoAdvance = false;
    LevelResult.effects = false;
    GamePreset.clear();
  });

  Future<List<String>> pump(WidgetTester t, {required bool passed, bool settings = true, bool still = false}) async {
    final log = <String>[];
    await t.pumpWidget(
      MaterialApp(
        builder: (context, child) =>
            MediaQuery(data: MediaQuery.of(context).copyWith(disableAnimations: still), child: child!),
        home: Scaffold(
          body: LevelResult(
            passed: passed,
            level: 3,
            score: '9 / 10',
            onNext: () => log.add('next'),
            onSettings: settings ? () => log.add('settings') : null,
          ),
        ),
      ),
    );
    return log;
  }

  testWidgets('🔴 пройдено: заголовок с уровнем, через 1,5 с — следующая партия, один раз', (t) async {
    final log = await pump(t, passed: true);
    expect(find.text(L.t('levelDone').replaceAll('{n}', '3')), findsOneWidget);
    expect(find.byKey(const Key('level-result-countdown')), findsOneWidget);
    await t.pump(const Duration(milliseconds: 1400));
    expect(log, isEmpty);
    await t.pump(const Duration(milliseconds: 200));
    expect(log, ['next']);
    await t.pump(const Duration(seconds: 3));
    await t.tap(find.byKey(const Key('level-result-next')));
    expect(log, ['next'], reason: 'уход с итога — один');
  });

  testWidgets('🔴 провал: «Ещё раз» сам через 2,5 с, не раньше', (t) async {
    final log = await pump(t, passed: false);
    expect(find.text(L.t('sameLevelRetry')), findsOneWidget);
    await t.pump(const Duration(milliseconds: 2400));
    expect(log, isEmpty);
    await t.pump(const Duration(milliseconds: 200));
    expect(log, ['next']);
  });

  testWidgets('тап по итогу — сразу, не дожидаясь отсчёта', (t) async {
    final log = await pump(t, passed: true);
    await t.tap(find.byKey(const Key('level-result-score')));
    expect(log, ['next']);
    await t.pump(const Duration(seconds: 3));
    expect(log, ['next']);
  });

  testWidgets('«Настройки» уводят к настройке и останавливают автопереход', (t) async {
    final log = await pump(t, passed: true);
    await t.tap(find.byKey(const Key('level-result-settings')));
    await t.pump(const Duration(seconds: 3));
    expect(log, ['settings']);
  });

  testWidgets('в зарядке автоперехода нет — шаг ведёт мост зарядки', (t) async {
    GamePreset.set({'wu': '1'});
    final log = await pump(t, passed: true);
    expect(find.byKey(const Key('level-result-countdown')), findsNothing);
    await t.pump(const Duration(seconds: 4));
    expect(log, isEmpty);
  });

  testWidgets('🔴 анимация победы: звезда и искры у общего итога, у провала — нет', (t) async {
    await pump(t, passed: true);
    expect(find.byKey(const Key('level-result-star')), findsOneWidget);
    expect(find.byType(VictorySparks), findsOneWidget);
    await t.pump(const Duration(milliseconds: 1200));
    await pump(t, passed: false);
    await t.pump();
    expect(find.byType(VictorySparks), findsNothing);
  });

  testWidgets('«Уменьшить движение» — без анимации: звезда стоит, искр нет, автопереход тот же', (t) async {
    final log = await pump(t, passed: true, still: true);
    expect(find.byKey(const ValueKey('reward-lottie')), findsNothing);
    expect(find.byWidgetPredicate((w) => w is GameWidget), findsNothing, reason: 'искр нет');
    await t.pump(const Duration(milliseconds: 1600));
    expect(log, ['next']);
  });

  testWidgets('🔴 звёзды дорисовываются, когда игра засчитала победу ПОСЛЕ открытия итога, и берутся у выигравшей лестницы, а не у последней загруженной («Шульте»)', (t) async {
    LevelLadder.newScreen();
    final ladder = LevelLadder(gameId: 'probe_stars', store: MemoryLevelStore());
    await t.runAsync(ladder.load);
    // Вторая лестница на том же экране загружена ПОСЛЕ (как «Серия» у «Шульте») — current теперь она.
    await t.runAsync(LevelLadder(gameId: 'probe_series', store: MemoryLevelStore()).load);
    await t.pumpWidget(
      MaterialApp(
        home: Scaffold(body: LevelResult(passed: true, level: 1, onNext: () {})),
      ),
    );
    await t.pump();
    expect(find.byKey(const Key('level-result-stars')), findsNothing, reason: 'победа ещё не засчитана');
    await t.runAsync(() => ladder.win(errors: 0, report: false));
    await t.pump();
    expect(find.text('★★★'), findsOneWidget, reason: '0 ошибок — три звезды этой партии');
    LevelResult.autoAdvance = false;
  });
}
