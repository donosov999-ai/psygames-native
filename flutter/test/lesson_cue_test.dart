/// ПАУЗЫ ПОЛЯ РАЗБОРА НА ТИКЕРЕ (`lib/games/hearing_common/lesson_cue.dart`).
///
/// Три обещания помощника: шаг не звучит раньше срока; паузы между шагами соблюдены; виджет ушёл —
/// недосказанное не звучит и таймеров после него не остаётся (у голого `Timer` проба падала с
/// «A Timer is still pending»). И главное отличие от `gameTimeout`: под разбором игровые часы
/// стоят, а подсказка карточки обязана идти.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/hearing_common/lesson_cue.dart';
import 'package:psygames_flutter/shell/game_clock.dart';

class _Host extends StatefulWidget {
  const _Host({required this.log, this.gap = const Duration(milliseconds: 450), this.speaking});
  final List<String> log;
  final Duration gap;

  /// Слово «звучит», пока не завершён этот Completer.
  final Completer<void>? speaking;
  @override
  State<_Host> createState() => _HostState();
}

class _HostState extends State<_Host> with SingleTickerProviderStateMixin {
  late final LessonCue _cue = LessonCue(this);

  @override
  void initState() {
    super.initState();
    _cue.run(3, (i) async {
      widget.log.add('w$i');
      await widget.speaking?.future;
    }, gap: widget.gap);
  }

  @override
  void dispose() {
    _cue.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => const SizedBox();
}

void main() {
  tearDown(resetGameClock);

  testWidgets('первый шаг — через 350 мс, дальше — через паузу; не раньше срока', (tester) async {
    final log = <String>[];
    await tester.pumpWidget(_Host(log: log));
    await tester.pump(const Duration(milliseconds: 300));
    expect(log, isEmpty, reason: 'раньше 350 мс карточка молчит');
    await tester.pump(const Duration(milliseconds: 100));
    expect(log, ['w0']);
    await tester.pump(const Duration(milliseconds: 400));
    expect(log, ['w0'], reason: 'пауза 450 мс ещё не прошла');
    await tester.pump(const Duration(milliseconds: 100));
    expect(log, ['w0', 'w1']);
    await tester.pump(const Duration(milliseconds: 500));
    expect(log, ['w0', 'w1', 'w2']);
  });

  testWidgets('виджет ушёл — недосказанное не звучит, таймеров не остаётся', (tester) async {
    final log = <String>[];
    await tester.pumpWidget(_Host(log: log));
    await tester.pump(const Duration(milliseconds: 400));
    expect(log, ['w0']);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 2));
    expect(log, ['w0']);
  });

  testWidgets('виджет ушёл, пока слово звучит, — следующее не начинается и ошибки нет', (tester) async {
    final log = <String>[];
    final speaking = Completer<void>();
    await tester.pumpWidget(_Host(log: log, speaking: speaking));
    await tester.pump(const Duration(milliseconds: 400));
    expect(log, ['w0']);
    await tester.pumpWidget(const SizedBox());
    speaking.complete();
    await tester.pump(const Duration(seconds: 2));
    expect(log, ['w0']);
    expect(tester.takeException(), isNull);
  });

  testWidgets('🔴 под разбором игровые часы стоят — а подсказка карточки идёт', (tester) async {
    final release = holdGame();
    final log = <String>[];
    await tester.pumpWidget(_Host(log: log, gap: Duration.zero));
    await tester.pump(const Duration(milliseconds: 400));
    expect(isGameHeld(), isTrue);
    expect(log, ['w0', 'w1', 'w2'], reason: 'на gameTimeout карточка молчала бы весь разбор');
    release();
  });
}
