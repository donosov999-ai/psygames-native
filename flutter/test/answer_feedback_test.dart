import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/runner/answer_feedback_adapter.dart';
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

class _ReplaceAndSilence implements AnswerFeedbackAdapter {
  const _ReplaceAndSilence();

  @override
  AnswerFeedbackDelivery adapt(AnswerMarkState signal) => AnswerFeedbackDelivery(
    center: (picked: 'rendered', correct: signal.correct, right: signal.right),
    hold: const Duration(milliseconds: 50),
  );
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

  testWidgets('runner sends the common signal without a center mark or waiting', (t) async {
    SharedPreferences.setMockInitialValues({});
    final sound = _Sound();
    final f = AnswerFeedback(
      await SharedState.open(),
      backend: sound,
      adapter: runnerAnswerFeedback,
    );
    await f.show('road event', null, right: false);
    expect(f.busy, isFalse);
    expect(f.mark.value, isNull);
    expect(f.centerMark.value, isNull);
    expect(AnswerFeedback.current.value, isNot(same(f)));
    expect(haptics, ['HapticFeedbackType.heavyImpact']);
    expect(sound.played, isEmpty);
    await f.dispose();
  });

  testWidgets('an adapter can replace one visual channel and silence the rest', (t) async {
    SharedPreferences.setMockInitialValues({});
    final sound = _Sound();
    final f = AnswerFeedback(
      await SharedState.open(),
      backend: sound,
      adapter: const _ReplaceAndSilence(),
    );
    await f.show('original', 'answer');
    expect(f.busy, isFalse, reason: 'visual lifetime does not have to block input');
    expect(f.mark.value, isNull);
    expect(f.centerMark.value?.picked, 'rendered');
    expect(AnswerFeedback.current.value, same(f));
    await t.pump(const Duration(milliseconds: 50));
    expect(f.busy, isFalse);
    expect(f.centerMark.value, isNull);
    expect(haptics, isEmpty);
    expect(sound.played, isEmpty);
    await f.dispose();
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
    expect(t.getSize(center), const Size.square(68));
    final check = find.descendant(of: center, matching: find.byIcon(Icons.check_rounded));
    expect(t.widget<Icon>(check).size, 48);
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
    expect(t.getSize(center), const Size.square(136));
    final cross = find.descendant(of: center, matching: find.byIcon(Icons.close_rounded));
    expect(t.widget<Icon>(cross).size, 96);
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

  testWidgets('центральный знак сохраняет поле, его семантику и жесты', (t) async {
    t.view.devicePixelRatio = 1;
    t.view.physicalSize = const Size(390, 844);
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    final semantics = t.ensureSemantics();
    SharedPreferences.setMockInitialValues({});
    final f = AnswerFeedback(await SharedState.open(), backend: _Sound());
    var taps = 0;
    var dragUpdates = 0;
    const label = 'Игровая клетка';
    final target = find.byKey(const Key('feedback-gesture-target'));
    final level = find.bySemanticsLabel(RegExp(r'(?:^|\n)Уровень: 7(?:\n|$)'));
    await t.pumpWidget(MaterialApp(
      home: GameShell(
        title: 'Test',
        hud: const [HudItem(label: 'Уровень', value: '7')],
        field: (_, _) => Align(
          alignment: Alignment.topLeft,
          child: Semantics(
            container: true,
            label: label,
            child: GestureDetector(
              key: const Key('feedback-gesture-target'),
              behavior: HitTestBehavior.opaque,
              onTap: () => taps++,
              onPanUpdate: (_) => dragUpdates++,
              child: const SizedBox.expand(),
            ),
          ),
        ),
      ),
    ));
    final fieldBefore = t.element(target);
    expect(find.bySemanticsLabel(label), findsOneWidget);
    expect(level, findsOneWidget);
    var completed = false;
    f.show(1, 1).then((_) => completed = true);
    await t.pump();
    final mark = find.byKey(const Key('answer-feedback-center-good'));
    expect(mark, findsOneWidget);
    final center = t.getCenter(mark);
    expect(center, const Offset(195, 422));
    expect(t.getRect(target).contains(center), isTrue);
    expect(t.element(target), same(fieldBefore));
    expect(find.bySemanticsLabel(label), findsOneWidget);
    expect(level, findsOneWidget);
    await t.tapAt(center);
    await t.dragFrom(center, const Offset(72, 0));
    expect(taps, 1);
    expect(dragUpdates, greaterThan(0));
    await t.pump(AnswerFeedback.hold);
    expect(completed, isTrue);
    expect(mark, findsNothing);
    expect(t.element(target), same(fieldBefore));
    expect(find.bySemanticsLabel(label), findsOneWidget);
    await t.pumpWidget(const SizedBox());
    await f.dispose();
    semantics.dispose();
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
