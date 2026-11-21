import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/listening_prompt.dart';

void main() {
  testWidgets('timeout opens retry; late success cannot unlock a new attempt', (
    tester,
  ) async {
    final controller = ListeningPromptController(
      isVisible: () => true,
      onChange: () {},
    );
    addTearDown(controller.dispose);
    final attempts = <Completer<bool>>[];
    final current = <bool Function()>[];
    var cancels = 0;
    controller.present(
      ListeningPrompt(
        playbackLimit: const Duration(seconds: 1),
        play: (active) {
          current.add(active);
          final result = Completer<bool>();
          attempts.add(result);
          return result.future;
        },
        cancelPlayback: () async {
          cancels++;
        },
      ),
    );
    expect(controller.canAnswer, isFalse);
    expect(controller.replay(), isFalse, reason: 'no overlapping audio');
    await tester.pump(const Duration(seconds: 1));
    expect(controller.failed, isTrue);
    expect(controller.playing, isFalse);
    expect(current.first(), isFalse);
    expect(cancels, 1);
    expect(controller.replay(), isTrue);
    attempts.first.complete(true);
    await tester.pump();
    expect(
      controller.canAnswer,
      isFalse,
      reason: 'obsolete success cannot unlock',
    );
    attempts.last.complete(true);
    await tester.pump();
    expect(controller.canAnswer, isTrue);
  });

  testWidgets(
    'lesson invalidates pending audio and resumes the same unanswered prompt',
    (tester) async {
      final controller = ListeningPromptController(
        isVisible: () => true,
        onChange: () {},
      );
      addTearDown(controller.dispose);
      final old = Completer<bool>();
      var attempts = 0;
      controller.present(
        ListeningPrompt(
          play: (active) => ++attempts == 1 ? old.future : Future.value(true),
          autoDelay: const Duration(milliseconds: 200),
        ),
      );
      await tester.pump(const Duration(milliseconds: 200));
      expect(controller.playing, isTrue);
      controller.suspend();
      old.complete(true);
      await tester.pump();
      expect(controller.canAnswer, isFalse);
      controller.resume(needsPrompt: true);
      await tester.pump(const Duration(milliseconds: 200));
      expect(attempts, 2);
      expect(controller.canAnswer, isTrue);
    },
  );

  testWidgets(
    'leaving the exercise cancels the timeout even if the player never responds',
    (tester) async {
      final controller = ListeningPromptController(
        isVisible: () => true,
        onChange: () {},
      );
      controller.present(
        ListeningPrompt(play: (_) => Completer<bool>().future),
      );
      expect(controller.playing, isTrue);
      controller.dispose();
      await tester.pump();
    },
  );
}
