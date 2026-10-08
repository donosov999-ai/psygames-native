import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/level_ladder.dart';
import 'package:psygames_flutter/shell/pet_screen.dart';
import 'package:psygames_flutter/shell/profiles.dart';
import 'package:psygames_flutter/shell/screen_ui.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/synapse/synapse_feed.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🗨 СИНАПС ГОВОРИТ ПОСЛЕ ПАРТИИ (задача 852e4b4a; схема владельца — COMMON_OPTIONS §6).
///
/// Партия идёт настоящим путём: [LevelLadder.win]/[fail] → [SessionReport.send] → адаптер
/// [SynapseFeed] → ядро `synapse_advisor` → реплики в общей памяти профиля → пузырь «Питомца».
///   · числа в репликах — только из фактов (своей партии и истории ЭТОГО профиля);
///   · урок, выключенный питомец и партия без исхода — тишина;
///   · пузырь: первая реплика вместо приветствия, «Следующая фраза» листает, «Закрыть» возвращает
///     приветствие; на 320×568 и крупном шрифте ничего не вылезает.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  Map<String, Object?> load(String f) => (jsonDecode(File(f).readAsStringSync()) as Map).cast<String, Object?>();
  final at = DateTime.utc(2026, 10, 7, 12);

  /// Две прошлые партии «Шульте» этого профиля (уровень 2: 42 и 40 с) и чужая быстрая — 10 с.
  String history() => jsonEncode([
    for (final (pid, t, h) in [('nzt48', 42, 30), ('nzt48', 40, 20), ('kids', 10, 10)])
      {
        'game_type': 'schulte_table',
        'score': 25,
        'time_seconds': t,
        'difficulty': '2',
        'profile_id': pid,
        'timestamp': at.subtract(Duration(hours: h)).toIso8601String(),
      },
  ]);

  Future<SharedState> stateWith(Map<String, Object> extra) async {
    SharedPreferences.setMockInitialValues({'psygames_active_profile': 'nzt48', 'psygames_sessions': history(), ...extra});
    return SharedState.open();
  }

  setUp(() {
    L.useForTest('ru', (jsonDecode(File('assets/l10n/ru.json').readAsStringSync()) as Map).cast<String, String>());
    Profiles.useForTest(Profiles.parse(File('assets/profiles.json').readAsStringSync()));
    SynapseFeed.resetForTest();
    SynapseFeed.now = () => at;
    SessionReport.sink = (_) async {};
    LessonUsed.reset();
  });
  tearDown(() {
    SessionReport.sink = null;
    SynapseFeed.resetForTest();
  });

  /// Лестница «Шульте» на уровне 1: победа поднимает до 2 — партия уходит с `difficulty: '2'`.
  Future<List<String>> winSchulte(SharedState s, {int seconds = 38}) async {
    SynapseFeed.state = s;
    final ladder = LevelLadder(gameId: 'schulte_table', store: MemoryLevelStore());
    await ladder.win(score: 25, timeSeconds: seconds);
    await SynapseFeed.settled;
    return SynapseFeed.linesFor(s);
  }

  test('🔴 победа: рекорд по времени — числа только из фактов этого профиля', () async {
    final s = await stateWith({});
    final lines = await winSchulte(s);
    expect(lines, isNotEmpty);
    expect(lines.join(' '), contains('38'));
    expect(lines.join(' '), contains('40'), reason: 'прежний лучший этого профиля');
    final numbers = RegExp(r'\d+').allMatches(lines.join(' ')).map((m) => int.parse(m[0]!)).toSet();
    expect(numbers.difference({38, 40, 42, 1, 2, 3}), isEmpty, reason: 'чужие 10 с и выдуманные числа — нельзя: $lines');
    expect(s.get(SynapseFeed.memoryKey('nzt48')), isNotNull, reason: 'память ядра — по профилю');
  });

  test('🔴 тишина: урок, выключенный питомец, партия без исхода', () async {
    final lesson = await stateWith({});
    LessonUsed.mark();
    expect(await winSchulte(lesson), isEmpty, reason: 'урок — молчит');
    expect(lesson.get(SynapseFeed.memoryKey('nzt48')), isNull, reason: 'на уроке ядро не зовётся');

    final off = await stateWith({'psygames_pet_on': 'false'});
    expect(await winSchulte(off), isEmpty, reason: 'питомец выключен — молчит');
    // «Глушит всё» — не только пузырь: ядро не зовётся, ни реплик, ни памяти в хранилище.
    expect([off.get(SynapseFeed.linesKey('nzt48')), off.get(SynapseFeed.memoryKey('nzt48'))], [null, null]);

    final direct = await stateWith({});
    SynapseFeed.state = direct;
    await SessionReport.send(gameType: 'schulte_table', score: 25, timeSeconds: 30);
    await SynapseFeed.settled;
    expect(SynapseFeed.linesFor(direct), isEmpty, reason: 'исход неизвестен (экран без лестницы) — молчит');
  });

  test('реплики устаревают через 12 ч; «Закрыть» снимает их до следующей партии', () async {
    final s = await stateWith({});
    expect(await winSchulte(s), isNotEmpty);
    SynapseFeed.now = () => at.add(const Duration(hours: 13));
    expect(SynapseFeed.linesFor(s), isEmpty);
    SynapseFeed.now = () => at;
    await SynapseFeed.dismiss(s);
    expect(SynapseFeed.linesFor(s), isEmpty);
  });

  group('пузырь «Питомца»', () {
    Future<void> mount(WidgetTester t, SharedState s, {Size size = const Size(780, 6000), double text = 1}) async {
      t.view.physicalSize = size * 2;
      t.view.devicePixelRatio = 2;
      addTearDown(t.view.reset);
      ScreenUi.reset();
      ScreenUi.model(PetScreen.route).value = load('test/fixtures/pet_model.json');
      await t.pumpWidget(
        MediaQuery(
          data: MediaQueryData(size: size, textScaler: TextScaler.linear(text)),
          child: MaterialApp(
            home: Scaffold(
              body: PetScreen(origin: 'http://127.0.0.1:1', state: s),
            ),
          ),
        ),
      );
      await t.pump();
    }

    testWidgets('🔴 первая реплика вместо приветствия; «Следующая фраза» листает; «Закрыть» — приветствие', (t) async {
      final s = await stateWith({});
      final lines = await t.runAsync(() => winSchulte(s)) ?? const <String>[];
      expect(lines.length, greaterThan(1), reason: 'есть что листать: $lines');
      final greeting = load('test/fixtures/pet_model.json')['bubble'] as String;
      await mount(t, s);
      expect(find.text(lines.first), findsOneWidget);
      expect(find.text(greeting), findsNothing);
      for (var i = 1; i < lines.length; i++) {
        await t.tap(find.byKey(const ValueKey('pet-synapse-next')));
        await t.pump();
        expect(find.text(lines[i]), findsOneWidget);
      }
      expect(find.byKey(const ValueKey('pet-synapse-next')), findsNothing, reason: 'последняя — листать некуда');
      await t.tap(find.byKey(const ValueKey('pet-synapse-close')));
      await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
      await t.pump();
      expect(find.text(greeting), findsOneWidget);
      expect(s.get(SynapseFeed.linesKey('nzt48')), isNull);
    });

    testWidgets('320×568 и крупный шрифт: пузырь с кнопками помещается', (t) async {
      final s = await stateWith({});
      await t.runAsync(() => winSchulte(s));
      await mount(t, s, size: const Size(320, 568), text: 1.3);
      expect(t.takeException(), isNull);
      final close = t.getRect(find.byKey(const ValueKey('pet-synapse-close')));
      expect(close.right <= 320 && close.left >= 0, isTrue, reason: '$close');
    });

    testWidgets('без общей памяти — пузырь как был', (t) async {
      ScreenUi.reset();
      ScreenUi.model(PetScreen.route).value = load('test/fixtures/pet_model.json');
      await t.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: PetScreen(origin: 'http://127.0.0.1:1')),
        ),
      );
      await t.pump();
      expect(find.text(load('test/fixtures/pet_model.json')['bubble'] as String), findsOneWidget);
    });
  });
}
