// ОТКЛИК НА ОТВЕТ — ОДИН НА ВСЕ ИГРЫ: ВИДНО, ОЩУТИМО, СЛЫШНО (задача 5d4d04bb, правило Дениса 13.11.2026).
//
// Денис 13.11, «Быстрый счёт»: «при ответе непонятно, правильно назвали или нет, нет визуального
// подтверждения… я молчу про виброотклик или звук; надо в стандартах прописать». Правило записано в
// стандарт дизайна каркаса (раздел «отклик на КАЖДЫЙ ответ»); здесь его единственное исполнение:
//
//   · видно — выбранный вариант загорается зелёным или красным, при ошибке верный — зелёным;
//     большой ✓/✗ по центру экрана рисует GameShell; держится [hold] (600 мс), потом следующая проба;
//     при «Уменьшить движение» анимации нет, цвет, значок и пауза остаются;
//   · ощутимо — только [AppHaptics]: hit() верно, miss() ошибка; глушится тумблером «Вибрация»;
//   · слышно — короткий звук через общий [GameEffectAudio], только по тумблеру «Звук» ([appSoundOn]).
//
// Игра сообщает только «что выбрано и что верно» и ЖДЁТ: `await feedback.show(picked, correct)`, потом
// следующая проба. Отклик приходит после ответа и в время реакции не входит — время игра снимает до
// вызова. Подсветка — обёртка [AnswerMark] вокруг любой кнопки или клетки варианта.
//
// Звуковой движок — Flame (`audioplayers`), выбран 13.11 по итогам пилота «Сортировки товаров» (там был
// стенд off / flame / soloud без записанного итога): у него тихая звуковая сессия iOS (ambient) и он не
// забирает звук у голоса и шума языковых игр; SoLoud отзывается быстрее, но для подсветки в 600 мс это
// не главное, а перехват звука у голосовых заданий — реальный риск.
library;

import 'dart:async';

import 'package:flutter/material.dart';

import 'app_haptics.dart';
import 'audio_host.dart';
import 'game_clock.dart';
import 'game_colors.dart';
import 'game_effect_audio.dart';
import 'shared_state.dart';

/// Что сейчас подсвечено: выбранный вариант, верный, верно ли.
typedef AnswerMarkState = ({Object? picked, Object? correct, bool right});

/// The game emits one answer signal. Only its adapter decides which channels
/// to forward, substitute or silence; the caller need not change its rules.
abstract interface class AnswerFeedbackAdapter {
  AnswerFeedbackDelivery adapt(AnswerMarkState signal);
}

class AnswerFeedbackDelivery {
  const AnswerFeedbackDelivery({
    this.choice,
    this.center,
    this.haptic = false,
    this.sound = false,
    this.hold = Duration.zero,
    this.blockInput = false,
  });

  final AnswerMarkState? choice, center;
  final bool haptic, sound;
  final Duration hold;
  final bool blockInput;
}

class StandardAnswerFeedbackAdapter implements AnswerFeedbackAdapter {
  const StandardAnswerFeedbackAdapter({this.sound = true});

  final bool sound;

  @override
  AnswerFeedbackDelivery adapt(AnswerMarkState signal) => AnswerFeedbackDelivery(
    choice: signal,
    center: signal,
    haptic: true,
    sound: sound,
    hold: AnswerFeedback.hold,
    blockInput: true,
  );
}

/// Speech needs exclusive control of its audio session; the answer still
/// uses the same visual and haptic channels.
const spokenAnswerFeedback = StandardAnswerFeedbackAdapter(sound: false);

class AnswerFeedback {
  AnswerFeedback(
    this.state, {
    GameSoundBackend? backend,
    this.adapter = const StandardAnswerFeedbackAdapter(),
  })
    : _audio = GameEffectAudio(
        backend: backend ?? backendFactory(),
        enabled: () => appSoundOn(state),
      ),
      _haptics = AppHaptics(state);

  final SharedState state;
  final AnswerFeedbackAdapter adapter;
  final GameEffectAudio _audio;
  final AppHaptics _haptics;

  /// Сколько держится подсветка (правило: 600 мс, допустимо 500–900).
  static const hold = Duration(milliseconds: 600);

  static final current = ValueNotifier<AnswerFeedback?>(null);

  /// Звуковой движок отклика. Пробы подставляют свой (`test/flutter_test_config.dart` — без звука).
  static GameSoundBackend? Function() backendFactory = FlameSoundBackend.new;

  /// Подсветка для [AnswerMark]; `null` — ничего не подсвечено.
  final mark = ValueNotifier<AnswerMarkState?>(null);
  final centerMark = ValueNotifier<AnswerMarkState?>(null);

  int _seq = 0;
  bool _disposed = false;
  GameTimer? _timer;
  Completer<void>? _waiting;

  /// Идёт ли отклик: игра на это время не принимает новые ответы.
  bool get busy => !_disposed && _waiting != null;

  void _cancelWait() {
    _timer?.cancel();
    _timer = null;
    final waiting = _waiting;
    _waiting = null;
    if (waiting != null && !waiting.isCompleted) waiting.complete();
  }

  /// Отклик на ответ: подсветка, вибрация, звук; вернётся через [hold], когда подсветка снята.
  /// `right` — для игр, где «верно» не сводится к равенству (несколько верных вариантов).
  Future<void> show(Object? picked, Object? correct, {bool? right}) async {
    if (_disposed) return;
    _cancelWait();
    final ok = right ?? picked == correct;
    final seq = ++_seq;
    final delivery = adapter.adapt((picked: picked, correct: correct, right: ok));
    final timed = delivery.hold > Duration.zero;
    final done = timed && delivery.blockInput ? Completer<void>() : null;
    _waiting = done;
    mark.value = delivery.choice;
    centerMark.value = delivery.center;
    if (delivery.center != null) {
      current.value = this;
    } else if (identical(current.value, this)) {
      current.value = null;
    }
    if (delivery.haptic) unawaited(ok ? _haptics.hit() : _haptics.miss());
    if (delivery.sound) _audio.emit(ok ? GameSound.correct : GameSound.wrong, 'answer$seq');
    if (!timed) return;
    _timer = gameTimeout(delivery.hold, () {
      if (!_disposed && seq == _seq) _clearVisuals();
      _timer = null;
      if (identical(_waiting, done)) _waiting = null;
      if (done != null && !done.isCompleted) done.complete();
    });
    if (done != null) await done.future;
  }

  void _clearVisuals() {
    mark.value = null;
    centerMark.value = null;
    if (identical(current.value, this)) current.value = null;
  }

  /// Снять подсветку сразу (уход с экрана, новая партия).
  void clear() {
    if (_disposed) return;
    _seq++;
    _clearVisuals();
    _cancelWait();
  }

  Future<void> dispose() async {
    if (_disposed) return;
    _disposed = true;
    _seq++;
    _cancelWait();
    _clearVisuals();
    mark.dispose();
    centerMark.dispose();
    await _audio.dispose();
  }
}

/// Подсветка варианта: зелёный — выбран и верен или верный при ошибке, красный — выбран и неверен.
/// Оборачивает любую кнопку или клетку; пока нет отклика — рисует её как есть.
class AnswerMark extends StatelessWidget {
  const AnswerMark({super.key, required this.feedback, required this.value, required this.child, this.radius = 12});

  final AnswerFeedback feedback;
  final Object? value;
  final Widget child;
  final double radius;

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<AnswerMarkState?>(
    valueListenable: feedback.mark,
    builder: (context, m, _) {
      final good = m != null && m.correct == value && (m.right || m.picked != value);
      final bad = m != null && !m.right && m.picked == value;
      if (!good && !bad) return child;
      final roles = GameColors.of(context);
      final color = good ? roles.correct : roles.wrong;
      return Stack(children: [
        DecoratedBox(
          key: Key(good ? 'answer-mark-good' : 'answer-mark-bad'),
          position: DecorationPosition.foreground,
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.28),
            border: Border.all(color: color, width: 3),
            borderRadius: BorderRadius.circular(radius),
          ),
          child: child,
        ),
      ]);
    },
  );
}

/// Paints the central mark above the game body without affecting input or layout.
class AnswerFeedbackOverlay extends StatelessWidget {
  const AnswerFeedbackOverlay({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) => Stack(
    fit: StackFit.passthrough,
    children: [
      child,
      Positioned.fill(child: _buildOverlay()),
    ],
  );

  // Keep this layer separate from the game's semantics. OverlayPortal groups
  // its child and overlay into traversal nodes even when the mark is hidden.
  Widget _buildOverlay() => ExcludeSemantics(
    child: IgnorePointer(
      child: ValueListenableBuilder<AnswerFeedback?>(
        valueListenable: AnswerFeedback.current,
        builder: (context, feedback, _) {
          if (feedback == null) return const SizedBox.shrink();
          return ValueListenableBuilder<AnswerMarkState?>(
            valueListenable: feedback.centerMark,
            builder: (context, mark, _) {
              if (mark == null) return const SizedBox.shrink();
              final roles = GameColors.of(context);
              final color = mark.right ? roles.correct : roles.wrong;
              return Center(
                child: Container(
                  key: Key(
                    mark.right
                        ? 'answer-feedback-center-good'
                        : 'answer-feedback-center-bad',
                  ),
                  width: mark.right ? 68 : 136,
                  height: mark.right ? 68 : 136,
                  decoration: BoxDecoration(
                    color: color,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(color: color.withValues(alpha: 0.35), blurRadius: 24),
                    ],
                  ),
                  child: Icon(
                    mark.right ? Icons.check_rounded : Icons.close_rounded,
                    size: mark.right ? 48 : 96,
                    color: roles.onStrong,
                  ),
                ),
              );
            },
          );
        },
      ),
    ),
  );
}
