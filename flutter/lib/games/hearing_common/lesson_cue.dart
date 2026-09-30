library;

import 'dart:async';

import 'package:flutter/scheduler.dart';

/// ⏱ ПАУЗЫ ПОЛЯ РАЗБОРА — НА ТИКЕРЕ КАДРОВ, А НЕ НА `Timer` (раздел «Память и слух», 01.10.2026).
///
/// Карточка разбора звучит сама: через 350 мс после показа, слова — с паузами между ними
/// («Фонемы», «Эхо», «Тоны», «Ритм и высота»). Это время ИНТЕРФЕЙСА разбора, а не партии:
/// · игровые часы (`shell/game_clock.dart`) под разбором СТОЯТ — `LessonPlayerScreen` держит
///   `holdGame`, и `gameTimeout` здесь не сработал бы никогда;
/// · голый `Timer` запрещает храповик `test/game_clock_discipline_test.dart`, и в пробах он
///   переживал закрытие карточки («A Timer is still pending»).
/// Тикер — механизм анимаций (так советует и сам храповик): гаснет вместе с виджетом и идёт по
/// поддельному времени `testWidgets`.
class LessonCue {
  LessonCue(TickerProvider vsync) {
    _ticker = vsync.createTicker(_onTick);
  }

  late final Ticker _ticker;
  Completer<bool>? _wait;
  Duration _until = Duration.zero;
  bool _gone = false;

  /// Подождать `d`. `false` — виджет ушёл раньше срока: дальше ничего не делать.
  Future<bool> wait(Duration d) {
    if (_gone) return Future.value(false);
    _wait?.complete(false);
    final c = Completer<bool>();
    _wait = c;
    _until = d;
    if (_ticker.isActive) _ticker.stop();
    _ticker.start();
    return c.future;
  }

  void _onTick(Duration elapsed) {
    if (elapsed < _until) return;
    _ticker.stop();
    final c = _wait;
    _wait = null;
    c?.complete(true);
  }

  /// Пауза `first`, затем `say(i)` для каждого шага с паузой `gap` между шагами. Виджет ушёл —
  /// последовательность обрывается там, где была.
  Future<void> run(
    int count,
    FutureOr<void> Function(int i) say, {
    Duration first = const Duration(milliseconds: 350),
    Duration gap = Duration.zero,
  }) async {
    if (count <= 0 || !await wait(first)) return;
    for (var i = 0; i < count; i += 1) {
      if (_gone) return;
      await say(i);
      if (_gone) return;
      if (i + 1 < count && gap > Duration.zero && !await wait(gap)) return;
    }
  }

  /// Звать из `dispose` виджета ДО `super.dispose()`.
  void dispose() {
    _gone = true;
    _ticker.dispose();
    final c = _wait;
    _wait = null;
    c?.complete(false);
  }
}
