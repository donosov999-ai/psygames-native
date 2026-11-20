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

class AnswerFeedback {
  AnswerFeedback(this.state, {GameSoundBackend? backend})
    : _audio = GameEffectAudio(backend: backend ?? backendFactory(), enabled: () => appSoundOn(state)),
      _haptics = AppHaptics(state);

  final SharedState state;
  final GameEffectAudio _audio;
  final AppHaptics _haptics;

  /// Сколько держится подсветка (правило: 600 мс, допустимо 500–900).
  static const hold = Duration(milliseconds: 600);

  static final current = ValueNotifier<AnswerFeedback?>(null);

  /// Звуковой движок отклика. Пробы подставляют свой (`test/flutter_test_config.dart` — без звука).
  static GameSoundBackend? Function() backendFactory = FlameSoundBackend.new;

  /// Подсветка для [AnswerMark]; `null` — ничего не подсвечено.
  final mark = ValueNotifier<AnswerMarkState?>(null);

  int _seq = 0;
  bool _disposed = false;
  GameTimer? _timer;
  Completer<void>? _waiting;

  /// Идёт ли отклик: игра на это время не принимает новые ответы.
  bool get busy => !_disposed && mark.value != null;

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
    current.value = this;
    mark.value = (picked: picked, correct: correct, right: ok);
    unawaited(ok ? _haptics.hit() : _haptics.miss());
    _audio.emit(ok ? GameSound.correct : GameSound.wrong, 'answer$seq');
    final done = Completer<void>();
    _waiting = done;
    _timer = gameTimeout(hold, () {
      if (!_disposed && seq == _seq) mark.value = null;
      _timer = null;
      if (identical(_waiting, done)) _waiting = null;
      if (!done.isCompleted) done.complete();
    });
    return done.future;
  }

  /// Снять подсветку сразу (уход с экрана, новая партия).
  void clear() {
    if (_disposed) return;
    _seq++;
    mark.value = null;
    _cancelWait();
  }

  Future<void> dispose() async {
    if (_disposed) return;
    _disposed = true;
    _seq++;
    _cancelWait();
    mark.value = null;
    if (identical(current.value, this)) current.value = null;
    mark.dispose();
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
      return DecoratedBox(
        key: Key(good ? 'answer-mark-good' : 'answer-mark-bad'),
        position: DecorationPosition.foreground,
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.28),
          border: Border.all(color: color, width: 3),
          borderRadius: BorderRadius.circular(radius),
        ),
        child: child,
      );
    },
  );
}
