import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/corsi/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/level_rules.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/boss_probe.dart';
import 'support/settings_fit.dart';

/// ПАРТИЯ ИГРАЕТСЯ ТЫЧКАМИ ПО БЛОКАМ, а не вызовом правил.
///
/// Ряд случаен, и подсмотреть его в модели было бы обманом: проба прошла бы даже
/// при сломанном показе. Поэтому ряд СЧИТЫВАЕТСЯ С ЭКРАНА — какой блок горит в
/// каждый момент показа, тот и запоминается, ровно как это делает человек.
void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    await L.load('ru');
  });

  Future<void> boot(WidgetTester tester) async {
    await tester.pumpWidget(MaterialApp(home: CorsiScreen(state: state)));
    await tester.pump();
    await tester.pump();
  }

  /// Какой блок горит сейчас: его плашка залита основным цветом темы.
  int? litBlock(WidgetTester tester) {
    for (var i = 0; i < 9; i++) {
      final f = find.byKey(Key('блок$i'));
      if (f.evaluate().isEmpty) continue;
      final m = tester.widget<Material>(find.ancestor(of: f, matching: find.byType(Material)).first);
      final scheme = Theme.of(tester.element(f)).colorScheme;
      if (m.color == scheme.primary) return i;
    }
    return null;
  }

  /// Смотрит показ и записывает ряд по вспышкам, как его видит человек.
  Future<List<int>> watch(WidgetTester tester) async {
    final seen = <int>[];
    var dark = true;
    for (var i = 0; i < 80; i++) {
      final lit = litBlock(tester);
      if (lit == null) {
        dark = true;
      } else if (dark) {
        seen.add(lit);
        dark = false;
      }
      await tester.pump(const Duration(milliseconds: 50));
    }
    return seen;
  }

  /// Значение счётчика в полосе показателей — по подписи, а не по позиции: в
  /// полосе четыре счётчика, и «0» у трёх из них одинаков.
  bool hud(WidgetTester tester, String key, String value) => find
      .byWidgetPredicate((w) => w is Semantics && w.properties.label == '${L.t(key)}: $value')
      .evaluate()
      .isNotEmpty;

  testWidgets('🔴 ряд показывается по одному блоку и берётся повтором тычков', (tester) async {
    await boot(tester);
    expect(find.text(L.t('corsi')), findsOneWidget);

    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    final seq = await watch(tester);
    expect(seq.length, 3, reason: 'на первом уровне ряд из трёх блоков, и каждый горит отдельно');
    expect(seq.toSet().length, 3, reason: 'блоки в ряду разные');

    for (final b in seq) {
      await tester.tap(find.byKey(Key('блок$b')));
      await tester.pump();
    }
    expect(hud(tester, 'hud_span', '3'), isTrue, reason: 'ряд повторён целиком — длина засчитана');
    expect(hud(tester, 'errors', '0'), isTrue, reason: 'верный повтор не считается ошибкой');
    await tester.pump(const Duration(milliseconds: 700));
    await tester.pump(const Duration(seconds: 6));
  });

  testWidgets('🔴 нажатие не в тот блок — ошибка, и ряд показывается заново', (tester) async {
    await boot(tester);
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    final seq = await watch(tester);
    expect(seq, isNotEmpty);

    final wrongBlock = List.generate(9, (i) => i).firstWhere((i) => i != seq.first);
    await tester.tap(find.byKey(Key('блок$wrongBlock')));
    await tester.pump();
    expect(hud(tester, 'errors', '1'), isTrue, reason: 'промах засчитан ошибкой');
    expect(hud(tester, 'hud_span', '0'), isTrue, reason: 'непройденный ряд длину не даёт');
    await tester.pump(const Duration(milliseconds: 800));
    await tester.pump(const Duration(seconds: 6));
  });

  testWidgets('🔴 пока идёт показ, блоки не нажимаются', (tester) async {
    await boot(tester);
    await tester.tap(find.text(L.t('start')));
    await tester.pump(const Duration(milliseconds: 100));
    for (var i = 0; i < 9; i++) {
      await tester.tap(find.byKey(Key('блок$i')), warnIfMissed: false);
      await tester.pump();
    }
    expect(hud(tester, 'errors', '0'), isTrue, reason: 'нажатия во время показа не считаются ошибками');
    expect(hud(tester, 'hud_span', '0'), isTrue, reason: 'и длину не дают');
    await tester.pump(const Duration(seconds: 6));
  });

  testWidgets('🔴 доска целиком помещается в поле каркаса', (tester) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await boot(tester);
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    for (var i = 0; i < 9; i++) {
      final r = tester.getRect(find.byKey(Key('блок$i')));
      expect(r.left, greaterThanOrEqualTo(0.0), reason: 'блок $i уехал за левый край');
      expect(r.right, lessThanOrEqualTo(360.0), reason: 'блок $i уехал за правый край');
      expect(r.bottom, lessThanOrEqualTo(640.0), reason: 'блок $i уехал за нижний край');
    }
    await tester.pump(const Duration(seconds: 6));
  });

  testWidgets('🔴 «Показать решение» нумерует блоки в порядке ответа и уровень не трогает', (tester) async {
    await boot(tester);
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    final seq = await watch(tester);
    expect(seq.length, 3);

    await tester.tap(find.byTooltip(L.t('puzzleShowSolution')));
    await tester.pump();
    for (var k = 0; k < seq.length; k++) {
      final f = find.byKey(Key('порядок${seq[k]}'));
      expect(f, findsOneWidget, reason: 'блок ${seq[k]} входит в ответ и должен показать свой номер');
      expect(tester.widget<Text>(f).data, '${k + 1}', reason: 'на первом уровне ряд повторяется в том же порядке');
    }
    expect(find.byKey(const Key('порядок-1')), findsNothing);
    expect(hud(tester, 'level', '1'), isTrue, reason: 'подсмотренный ряд уровень не поднимает');
    expect(hud(tester, 'hud_span', '0'), isTrue, reason: 'и длину не засчитывает');

    await tester.tap(find.text(L.t('retry')));
    await tester.pump();
    expect(hud(tester, 'level', '1'), isTrue, reason: 'после ответа — тот же уровень заново');
  });

  testWidgets('уход с экрана гасит таймер показа', (tester) async {
    await boot(tester);
    await tester.tap(find.text(L.t('start')));
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pumpWidget(const MaterialApp(home: SizedBox()));
    await tester.pump(const Duration(seconds: 6));
  });
  /// Открывает экран на уровне [level]: лестница читает его из общего хранилища, как в
  /// приложении. Таблица правил — заранее: догруженная посреди партии, она перестраивает
  /// шапку каркаса в случайный момент поддельного времени.
  Future<void> open(WidgetTester tester, int level) async {
    SharedPreferences.setMockInitialValues({'psygames_corsi_level_nzt48': '$level'});
    state = await SharedState.open();
    await LevelRules.load();
    await tester.pumpWidget(MaterialApp(home: CorsiScreen(key: UniqueKey(), state: state)));
    await tester.pump();
    await tester.pump();
  }

  /// Смотрит показ до конца — пока подпись «Запомни» не сменится вводом. На 3-м уровне
  /// ряд из пяти-шести блоков идёт дольше четырёх секунд окна [watch].
  Future<List<int>> watchAll(WidgetTester tester) async {
    final seen = <int>[];
    var dark = true;
    for (var i = 0; i < 400; i++) {
      final lit = litBlock(tester);
      if (lit == null) {
        dark = true;
        if (find.text(L.t('memorize')).evaluate().isEmpty) break;
      } else if (dark) {
        seen.add(lit);
        dark = false;
      }
      await tester.pump(const Duration(milliseconds: 50));
    }
    return seen;
  }

  /// Партия победой нажатиями: первый ряд — длина, с которой уровень начинается, —
  /// повторён верно; дальше два нарочных промаха, и партия кончается со взятым уровнем.
  Future<void> winByTaps(WidgetTester tester) async {
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    final first = await watchAll(tester);
    for (final b in first) {
      await tester.tap(find.byKey(Key('блок$b')));
      await tester.pump();
    }
    for (var miss = 0; miss < 2; miss++) {
      await tester.pump(const Duration(milliseconds: 800));
      final row = await watchAll(tester);
      final wrong = List.generate(9, (i) => i).firstWhere((i) => i != row.first);
      await tester.tap(find.byKey(Key('блок$wrong')));
      await tester.pump();
    }
    // Пауза после промаха (700 мс) — и партия уходит в итог.
    await tester.pump(const Duration(milliseconds: 800));
    await tester.pump();
  }

  testWidgets('🔴 веха: победа на 3-м уровне открывает бой «сложи подсвеченные», на 2-м — нет', (tester) async {
    // В вебе corsi.tsx зовёт BossRound каждые три уровня (BOSS_EVERY = 3, тип counting);
    // при переносе бой пропал молча — задача a2ecb067.
    await expectBossAfterWin(tester, won: find.text(L.t('nextLabel')), hudKey: 'bossHudCounting', play: (level) async {
      await open(tester, level);
      await winByTaps(tester);
    });
  });

  testWidgets('🔴 настройка на 360×640 по-английски и по-русски: «Начать» на первом экране (ae1d918b)', (tester) async {
    await expectSettingsFit(tester, () => boot(tester), where: 'corsi');
  });
}
