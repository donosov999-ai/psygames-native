import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/answer_feedback.dart';
import 'package:psygames_flutter/shell/game_effect_audio.dart';
import 'package:psygames_flutter/shell/game_shell.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ОТКЛИК НА ОТВЕТ — ОДИН КОМПОНЕНТ КАРКАСА (задача 5d4d04bb, правило Дениса 13.11.2026).
/// Видно (✓ зелёный / ✗ красный, при ошибке верный — ✓, 600 мс), ощутимо (AppHaptics hit/miss по тумблеру
/// «Вибрация»), слышно (GameEffectAudio по тумблеру «Звук»).
class _Sound implements GameSoundBackend {
  final played = <GameSound>[];
  @override
  Future<void> play(GameSound sound, double volume, bool Function() current) async => played.add(sound);
  @override
  Future<void> stop() async {}
  @override
  Future<void> dispose() async {}
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final haptics = <String>[];
  setUp(() {
    haptics.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      SystemChannels.platform,
      (call) async {
        if (call.method == 'HapticFeedback.vibrate') haptics.add('${call.arguments}');
        return null;
      },
    );
  });

  Future<(AnswerFeedback, _Sound)> pump(WidgetTester t, {Map<String, Object> prefs = const {}}) async {
    SharedPreferences.setMockInitialValues(prefs);
    final state = await SharedState.open();
    final sound = _Sound();
    final f = AnswerFeedback(state, backend: sound);
    await t.pumpWidget(
      MaterialApp(
        home: GameShell(
          title: 'Test',
          field: (context, _) => Row(
            children: [
              for (final v in [3, 4, 5])
                AnswerMark(
                  feedback: f,
                  value: v,
                  child: SizedBox(width: 60, height: 60, child: Text('$v', key: Key('v$v'))),
                ),
            ],
          ),
        ),
      ),
    );
    return (f, sound);
  }

  Finder markOn(int v, String kind) =>
      find.ancestor(of: find.byKey(Key('v$v')), matching: find.byKey(Key('answer-mark-$kind')));

  testWidgets('🔴 верно: выбранное — зелёный ✓, щелчок hit, звук «верно»; через 600 мс снято, show вернулся', (
    t,
  ) async {
    final (f, sound) = await pump(t);
    var done = false;
    f.show(4, 4).then((_) => done = true);
    await t.pump();
    expect(markOn(4, 'good'), findsOneWidget);
    expect(find.byKey(const Key('answer-mark-bad')), findsNothing);
    final center = find.byKey(const Key('answer-feedback-center-good'));
    expect(center, findsOneWidget, reason: 'не только цвет — большой значок по центру экрана');
    expect(t.getCenter(center), const Offset(400, 300));
    expect(find.byIcon(Icons.check_rounded), findsOneWidget);
    expect(f.busy, isTrue, reason: 'пока горит — новые ответы не принимаются');
    expect(haptics, ['HapticFeedbackType.selectionClick']);
    await t.pump(const Duration(milliseconds: 590));
    expect(done, isFalse);
    expect(markOn(4, 'good'), findsOneWidget, reason: 'держится 600 мс');
    await t.pump(const Duration(milliseconds: 20));
    expect(done, isTrue);
    expect(find.byKey(const Key('answer-mark-good')), findsNothing);
    expect(f.busy, isFalse);
    expect(sound.played, [GameSound.correct]);
  });

  testWidgets('🔴 ошибка: выбранное — красный ✗, верное — зелёный ✓, тяжёлый толчок miss, звук «ошибка»', (t) async {
    final (f, sound) = await pump(t);
    f.show(3, 5);
    await t.pump();
    expect(markOn(3, 'bad'), findsOneWidget);
    expect(markOn(5, 'good'), findsOneWidget, reason: 'при ошибке верный вариант тоже виден');
    final center = find.byKey(const Key('answer-feedback-center-bad'));
    expect(center, findsOneWidget, reason: 'ошибка — большой красный крест по центру экрана');
    expect(t.getCenter(center), const Offset(400, 300));
    expect(find.byIcon(Icons.close_rounded), findsOneWidget);
    expect(haptics, ['HapticFeedbackType.heavyImpact']);
    await t.pump(AnswerFeedback.hold);
    expect(sound.played, [GameSound.wrong]);
  });

  testWidgets('тумблеры «Звук» и «Вибрация» выключены — подсветка и пауза есть, звука и толчка нет', (t) async {
    final (f, sound) = await pump(
      t,
      prefs: {'psygames_sound_enabled': 'false', '${SharedState.prefix}haptic_enabled': 'false'},
    );
    f.show(3, 5);
    await t.pump();
    expect(markOn(3, 'bad'), findsOneWidget);
    await t.pump(AnswerFeedback.hold);
    expect(sound.played, isEmpty);
    expect(haptics, isEmpty);
  });

  testWidgets('уход во время подсветки: отложенный таймер не пишет в закрытый экран', (t) async {
    final (f, _) = await pump(t);
    var done = false;
    f.show(4, 4).then((_) => done = true);
    await t.pump();
    await t.pumpWidget(const SizedBox());
    await f.dispose();
    await t.pump(AnswerFeedback.hold);
    expect(done, isTrue);
    expect(t.takeException(), isNull);
  });
}
