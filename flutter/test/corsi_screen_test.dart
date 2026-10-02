import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/corsi/model.dart';
import 'package:psygames_flutter/games/corsi/screen.dart';
import 'package:psygames_flutter/shell/app_haptics.dart';
import 'package:psygames_flutter/shell/game_clock.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/level_rules.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/boss_probe.dart';

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

  // Паузы показа идут на игровых часах каркаса — им нужно поддельное время пробы.
  tearDown(() => gameWallMs = () => DateTime.now().millisecondsSinceEpoch);

  Future<void> boot(WidgetTester tester) async {
    gameWallMs = () => tester.binding.clock.now().millisecondsSinceEpoch;
    await tester.pumpWidget(MaterialApp(home: CorsiScreen(state: state)));
    await tester.pump();
    await tester.pump();
  }

  /// Какой блок горит сейчас: его плашка залита основным цветом темы.
  int? litBlock(WidgetTester tester) {
    for (var i = 0; i < 9; i++) {
      final f = find.byKey(Key('corsi-block-$i'));
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
      await tester.tap(find.byKey(Key('corsi-block-$b')));
      await tester.pump();
    }
    expect(hud(tester, 'hud_span', '3'), isTrue, reason: 'ряд повторён целиком — длина засчитана');
    expect(hud(tester, 'hud_entered', '3/3'), isTrue, reason: 'в шапке — сколько набрано из ряда, как в вебе');
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
    await tester.tap(find.byKey(Key('corsi-block-$wrongBlock')));
    await tester.pump();
    expect(hud(tester, 'hud_entered', '1/3'), isTrue);
    expect(hud(tester, 'hud_span', '0'), isTrue, reason: 'непройденный ряд длину не даёт');
    await tester.pump(const Duration(milliseconds: 800));
    final again = await watch(tester);
    expect(again.length, 3, reason: 'после первого промаха — новый ряд той же длины');
    await tester.pump(const Duration(seconds: 6));
  });

  testWidgets('🔴 пока идёт показ, блоки не нажимаются', (tester) async {
    await boot(tester);
    await tester.tap(find.text(L.t('start')));
    await tester.pump(const Duration(milliseconds: 100));
    for (var i = 0; i < 9; i++) {
      await tester.tap(find.byKey(Key('corsi-block-$i')), warnIfMissed: false);
      await tester.pump();
    }
    expect(hud(tester, 'lengthLabel', '3'), isTrue, reason: 'на показе в шапке — длина ряда');
    await watch(tester);
    expect(hud(tester, 'hud_entered', '0/3'), isTrue, reason: 'нажатия во время показа не набираются');
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
      final r = tester.getRect(find.byKey(Key('corsi-block-$i')));
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
      final f = find.byKey(Key('corsi-order-${seq[k]}'));
      expect(f, findsOneWidget, reason: 'блок ${seq[k]} входит в ответ и должен показать свой номер');
      expect(tester.widget<Text>(f).data, '${k + 1}', reason: 'на первом уровне ряд повторяется в том же порядке');
    }
    expect(find.byKey(const Key('corsi-order--1')), findsNothing);
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
    gameWallMs = () => tester.binding.clock.now().millisecondsSinceEpoch;
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
      await tester.tap(find.byKey(Key('corsi-block-$b')));
      await tester.pump();
    }
    for (var miss = 0; miss < 2; miss++) {
      await tester.pump(const Duration(milliseconds: 800));
      final row = await watchAll(tester);
      final wrong = List.generate(9, (i) => i).firstWhere((i) => i != row.first);
      await tester.tap(find.byKey(Key('corsi-block-$wrong')));
      await tester.pump();
    }
    // Пауза после промаха (700 мс) — и партия уходит в итог.
    await tester.pump(const Duration(milliseconds: 800));
    await tester.pump();
  }

  testWidgets('🔴 первая вспышка — через такт, как у веб-интервала; ошибок в шапке нет', (tester) async {
    await boot(tester);
    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    final tick = LevelParams.of(1).tickMs;
    // Весь отрезок до первого такта доска тёмная — время перевести взгляд (не один кадр: вспышка
    // короче такта и к его концу погасла бы и при показе «сразу»).
    for (var t = 50; t < tick; t += 50) {
      await tester.pump(const Duration(milliseconds: 50));
      expect(litBlock(tester), isNull, reason: '$t мс после «Начать» — доска ещё тёмная');
    }
    await tester.pump(const Duration(milliseconds: 100));
    expect(litBlock(tester), isNotNull, reason: 'на такте — первая вспышка');
    expect(find.byWidgetPredicate((w) => w is Semantics && (w.properties.label ?? '').startsWith('${L.t('errors')}:')),
        findsNothing, reason: 'веб нарочно не держит ошибки в шапке');
    await tester.pump(const Duration(seconds: 6));
  });

  group('итог партии', () {
    final sent = <Map<String, dynamic>>[];
    setUp(() {
      sent.clear();
      SessionReport.sink = (json) async => sent.add(jsonDecode(json) as Map<String, dynamic>);
    });
    tearDown(() {
      SessionReport.sink = null;
      gameWallMs = () => DateTime.now().millisecondsSinceEpoch;
    });

    testWidgets('🔴 отчёт — метками веба, время по игровым часам, строка итога; рекорд охвата в шапке', (tester) async {
      gameWallMs = () => tester.binding.clock.now().millisecondsSinceEpoch;
      await open(tester, 1);
      expect(find.byWidgetPredicate((w) => w is Semantics && (w.properties.label ?? '').startsWith('${L.t('hud_best')}:')),
          findsNothing, reason: 'рекорда ещё нет — и в шапке его нет');
      await winByTaps(tester);
      expect(hud(tester, 'hud_best', '3'), isTrue, reason: 'рекорд размаха поднят по ходу, как bumpPersonalBest');
      final s = sent.single;
      expect('${s['game_type']} ${s['difficulty']} / ${s['mode']}', 'corsi forward / L1');
      expect(s['details'], {'level': 1, 'span': 3});
      expect('${s['score']} ${s['errors']}', '${3 * 200 - 2 * 50} 2');
      expect(s['time_seconds'] as int, inInclusiveRange(5, 60), reason: 'секунды партии по игровым часам');
      final line = tester.widget<Text>(find.byKey(const Key('corsi-result'))).data!;
      expect(line, contains('${L.t('score')}: 500'));
      expect(line, contains('${L.t('errors')}: 2'));
      expect(hud(tester, 'level', '2'), isTrue);
    });
  });

  testWidgets('вибрация на итоге ряда — только при включённом тумблере «Вибрация»', (tester) async {
    final buzz = <String>[];
    final messenger = tester.binding.defaultBinaryMessenger;
    messenger.setMockMethodCallHandler(SystemChannels.platform, (c) async {
      if (c.method == 'HapticFeedback.vibrate') buzz.add('${c.arguments}');
      return null;
    });
    addTearDown(() => messenger.setMockMethodCallHandler(SystemChannels.platform, null));
    for (final on in [true, false]) {
      buzz.clear();
      gameWallMs = () => tester.binding.clock.now().millisecondsSinceEpoch;
      SharedPreferences.setMockInitialValues({hapticKey: '$on'});
      state = await SharedState.open();
      await tester.pumpWidget(MaterialApp(home: CorsiScreen(key: UniqueKey(), state: state)));
      await tester.pump();
      await tester.pump();
      await tester.tap(find.text(L.t('start')));
      await tester.pump();
      final seq = await watch(tester);
      final wrong = List.generate(9, (i) => i).firstWhere((i) => i != seq.first);
      await tester.tap(find.byKey(Key('corsi-block-$wrong')));
      await tester.pump();
      expect(buzz.length, on ? 1 : 0, reason: 'тумблер ${on ? 'включён' : 'выключен'}: $buzz');
      await tester.pumpWidget(const SizedBox());
    }
  });

  testWidgets('🔴 веха: победа на 3-м уровне открывает бой «сложи подсвеченные», на 2-м — нет', (tester) async {
    // В вебе corsi.tsx зовёт BossRound каждые три уровня (BOSS_EVERY = 3, тип counting);
    // при переносе бой пропал молча — задача a2ecb067.
    await expectBossAfterWin(tester, won: find.text(L.t('nextLabel')), hudKey: 'bossHudCounting', play: (level) async {
      await open(tester, level);
      await winByTaps(tester);
    });
  });
}
