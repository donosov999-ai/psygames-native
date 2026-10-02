import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/schulte/screen.dart';
import 'package:psygames_flutter/shell/boss_round.dart';
import 'package:psygames_flutter/shell/game_clock.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/level_rules.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/boss_probe.dart';

/// ПАРТИЯ ИГРАЕТСЯ ТЫЧКАМИ ПО КЛЕТКАМ, а не вызовом правил: проба читает с
/// экрана, что искать, и жмёт ровно ту клетку, на которой это написано.
void main() {
  setUpAll(() async {
    // Подписи — из общего словаря, как в приложении (экран переведён на L.t, задача 4b6f863e).
    TestWidgetsFlutterBinding.ensureInitialized();
    await L.load('ru');
  });

  late SharedState state;

  Future<SharedState> boot({int level = 1}) async {
    SharedPreferences.setMockInitialValues({
      if (level != 1) '${SharedState.prefix}schulte_table_level_nzt48': '$level',
      '${SharedState.prefix}language': 'ru',
    });
    return SharedState.open();
  }

  Future<void> open(WidgetTester tester, {int level = 1}) async {
    // Таймеры партии — на игровых часах (shell/game_clock.dart): идут с поддельным временем пробы.
    gameWallMs = () => tester.binding.clock.now().millisecondsSinceEpoch;
    addTearDown(() => gameWallMs = () => DateTime.now().millisecondsSinceEpoch);
    state = await boot(level: level);
    await tester.pumpWidget(MaterialApp(home: SchulteScreen(key: UniqueKey(), state: state)));
    await tester.pump();
    await tester.pump();
  }

  /// Что сейчас велено искать — из строки над полем.
  String target(WidgetTester tester) {
    final text = tester.widget<Text>(find.byKey(const Key('цель'))).data ?? '';
    return text.replaceFirst('Ищи: ', '');
  }

  /// Клетка, на которой написано это значение.
  Finder cellWith(WidgetTester tester, String value) {
    for (var i = 0; i < 100; i += 1) {
      final key = Key('клетка$i');
      final f = find.byKey(key);
      if (f.evaluate().isEmpty) continue;
      final texts = find.descendant(of: f, matching: find.byType(Text));
      if (texts.evaluate().isEmpty) continue;
      if (tester.widget<Text>(texts.first).data == value) return f;
    }
    throw StateError('на поле нет клетки «$value»');
  }

  testWidgets('🔴 уровень проходится тычками: 25 клеток по порядку — победа', (tester) async {
    await open(tester);
    expect(find.text(L.t('schulteTable')), findsOneWidget);
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    for (var step = 0; step < 25; step += 1) {
      await tester.tap(cellWith(tester, target(tester)));
      await tester.pump();
    }

    expect(find.text(L.t('nextLabel')), findsOneWidget,
        reason: 'вся таблица собрана по порядку — уровень взят');
  });

  testWidgets('🔴 чужая клетка считается ошибкой, а цель не двигается', (tester) async {
    await open(tester);
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    final before = target(tester);
    // Жмём клетку, на которой НЕ то, что велено искать.
    final other = before == '7' ? '8' : '7';
    await tester.tap(cellWith(tester, other));
    await tester.pump();

    expect(target(tester), before, reason: 'ошибка не двигает цель');
    expect(find.text('1'), findsWidgets, reason: 'счётчик ошибок вырос до 1');
  });

  testWidgets('🔴 пока правило не объявлено, нажатия не считаются', (tester) async {
    await open(tester, level: 16);   // ось 9: правило объявляется через 1,5 с
    await tester.tap(find.text(L.t('start')));
    await tester.pump();

    expect(target(tester), '?', reason: 'до объявления цель скрыта');
    await tester.tap(find.byKey(const Key('клетка0')));
    await tester.pump();
    expect(target(tester), '?', reason: 'нажатие до объявления не считается');

    await tester.pump(const Duration(milliseconds: 1600));
    expect(target(tester), isNot('?'), reason: 'через полторы секунды правило объявлено');
  });

  testWidgets('уход с экрана гасит таймеры', (tester) async {
    await open(tester, level: 16);
    await tester.tap(find.text(L.t('start')));
    await tester.pump(const Duration(milliseconds: 200));
    await tester.pumpWidget(const MaterialApp(home: SizedBox()));
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('🔴 веха: победа на 3-м уровне открывает бой «сложи подсвеченные», на 2-м — нет', (tester) async {
    // В вебе этот экран зовёт BossRound каждые три уровня; при переносе бой пропал молча.
    await expectBossAfterWin(tester, won: find.text(L.t('nextLabel')), hudKey: 'bossHudCounting', play: (level) async {
      await open(tester, level: level);
      await tester.tap(find.text(L.t('start')));
      await tester.pump();
      for (var i = 0; i < 200 && find.text(L.t('nextLabel')).evaluate().isEmpty; i += 1) {
        await tester.tap(cellWith(tester, target(tester)));
        await tester.pump();
      }
    });
  });

  testWidgets('🔴 итог боя не переезжает в следующий уровень того же экрана', (tester) async {
    // Правило действует только ВНУТРИ одного экрана: пробы вехи открывают экран заново
    // на каждом уровне и этого пути не проходят. Здесь 3-й уровень с боем, «Следующий
    // уровень» той же кнопкой, 4-й без боя — строки «Босс устоял» в его итоге быть не должно.
    Future<void> playToEnd() async {
      await tester.tap(find.text(L.t('start')));
      await tester.pump();
      for (var i = 0; i < 200 && find.text(L.t('nextLabel')).evaluate().isEmpty; i += 1) {
        await tester.tap(cellWith(tester, target(tester)));
        await tester.pump();
      }
    }

    await open(tester, level: 3);
    await playToEnd();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.byKey(const Key('boss-round')), findsOneWidget);
    await tester.pump(BossRound.introTime + const Duration(seconds: BossRound.roundSeconds + 1));
    await tester.pump(BossRound.doneTime);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('boss-outcome')), findsOneWidget);

    await tester.tap(find.text(L.t('nextLabel')));
    await tester.pump();
    await playToEnd();
    await tester.pump(const Duration(seconds: 3));
    expect(find.byKey(const Key('boss-round')), findsNothing, reason: 'бой после 4-го уровня');
    expect(find.text(L.t('nextLabel')), findsOneWidget, reason: 'уровень 4 не взят');
    expect(find.byKey(const Key('boss-outcome')), findsNothing, reason: 'в итоге 4-го уровня — итог прошлого боя');
  });

  Future<void> openAt(WidgetTester tester, int level, {bool ruleSeen = true}) async {
    // Часы партии — игровые (shell/game_clock.dart): в пробе они идут вместе с поддельным временем.
    gameWallMs = () => tester.binding.clock.now().millisecondsSinceEpoch;
    addTearDown(() => gameWallMs = () => DateTime.now().millisecondsSinceEpoch);
    SharedPreferences.setMockInitialValues({
      '${SharedState.prefix}schulte_table_level_nzt48': '$level',
      '${SharedState.prefix}language': 'ru',
      if (ruleSeen) LevelRules.seenKey('schulte_table', 'timelimit'): '1',
    });
    state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(home: SchulteScreen(key: UniqueKey(), state: state)));
    await tester.pump();
    await tester.pump();
  }

  testWidgets('🔴 ПОТОЛКА НЕТ: на 19-м время вышло — таблица встала, уровень не засчитан', (tester) async {
    // Правило Дениса 06.09.2026: с 19-го на таблицу 150 с, с каждым уровнем на 4 % меньше.
    final limit = '150 ${L.t('secShort')}';
    final timeUp = L.f('schulteResultTimeUp', {'limit': limit});
    await openAt(tester, 19);
    expect(find.textContaining('/ $limit'), findsOneWidget, reason: 'в полосе показателей — время и лимит');
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 1600));   // ось 9: правило объявлено
    await tester.pump(const Duration(seconds: 148));
    expect(find.text(timeUp), findsNothing, reason: 'до лимита партия идёт');
    await tester.pump(const Duration(seconds: 2));
    expect(find.text(timeUp), findsOneWidget, reason: 'лимит вышел — партия кончилась сама');
    expect(find.text(L.t('retry')), findsOneWidget, reason: 'уровень не засчитан');
    expect(state.get('${SharedState.prefix}schulte_table_level_nzt48'), '19', reason: 'лестница не шагнула');
    await tester.tap(find.byKey(const Key('клетка0')));
    await tester.pump();
    expect(find.text(timeUp), findsOneWidget, reason: 'после лимита нажатия не считаются');
  });

  testWidgets('🔴 на 18-м лимита нет: в полосе одно время, партия идёт сколько угодно', (tester) async {
    await openAt(tester, 18);
    expect(find.textContaining(' / '), findsNothing, reason: 'без лимита в полосе одно время');
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 1600));
    await tester.pump(const Duration(seconds: 200));
    expect(find.text(L.t('retry')), findsNothing, reason: 'уровень до 19-го не обрывается по времени');
  });

  testWidgets('🔴 на 19-м до партии — карточка правила «время на таблицу»', (tester) async {
    await tester.runAsync(LevelRules.load);
    await openAt(tester, 19, ruleSeen: false);
    await tester.pump();
    expect(find.text(L.t('lr_schulte_table_timelimit_title')), findsOneWidget,
        reason: 'новая механика объявлена до партии, как у остальных игр с правилами уровня');
  });
}
