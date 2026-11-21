import 'dart:async';

import 'package:flutter/material.dart';

import 'l10n.dart';
import 'noise.dart';
import 'voice.dart';

/// Adapter payload: the exercise supplies the prompt and optional interference.
/// Timing, retries and permission to answer belong to [ListeningPromptController].
class ListeningPrompt {
  const ListeningPrompt({
    required this.play,
    this.cancelPlayback,
    this.noise,
    this.snrDb,
    this.autoDelay = Duration.zero,
    this.answerDelay = Duration.zero,
    this.playbackLimit = const Duration(seconds: 35),
  });

  ListeningPrompt.speech({
    required VoiceLayer? voice,
    required String text,
    required String lang,
    required double rate,
    String? bundledAsset,
    this.noise,
    this.snrDb,
    this.autoDelay = Duration.zero,
    this.answerDelay = Duration.zero,
    this.playbackLimit = const Duration(seconds: 35),
  }) : cancelPlayback = voice?.cancel,
       play = ((current) async =>
           await voice?.speak(
             text,
             lang,
             rate: rate,
             stillCurrent: current,
             bundledAsset: bundledAsset,
           ) ??
           false);

  final Future<bool> Function(bool Function() current) play;
  final Future<void> Function()? cancelPlayback;
  final NoiseLayer? noise;
  final double? snrDb;
  final Duration autoDelay;
  final Duration answerDelay;
  final Duration playbackLimit;
}

class ListeningPromptController {
  ListeningPromptController({required this.isVisible, required this.onChange});

  final bool Function() isVisible;
  final VoidCallback onChange;
  ListeningPrompt? _prompt;
  Timer? _auto, _unlock, _deadline;
  Completer<bool>? _pending;
  bool _suspended = false, _disposed = false;
  bool _playing = false, _unlocked = false, _failed = false;
  int _epoch = 0;

  bool get playing => _playing;
  bool get unlocked => _unlocked;
  bool get failed => _failed;
  bool get canAnswer => unlocked && !playing && !_suspended && isVisible();

  void present(ListeningPrompt prompt) {
    _invalidate();
    _prompt = prompt;
    _unlocked = false;
    _failed = false;
    onChange();
    _schedule();
  }

  bool replay() {
    if (_prompt == null || _disposed || _suspended || playing || !isVisible()) {
      return false;
    }
    _auto?.cancel();
    unawaited(_play());
    return true;
  }

  void suspend() {
    _suspended = true;
    _invalidate();
    onChange();
  }

  void resume({required bool needsPrompt}) {
    _suspended = false;
    if (needsPrompt && !unlocked) _schedule();
  }

  void _schedule() {
    final prompt = _prompt;
    if (_disposed || _suspended || prompt == null) return;
    if (prompt.autoDelay == Duration.zero) {
      unawaited(_play());
    } else {
      _auto = Timer(prompt.autoDelay, _play);
    }
  }

  Future<void> _play() async {
    final prompt = _prompt;
    if (_disposed || _suspended || playing || prompt == null) return;
    if (!isVisible()) {
      _failed = !unlocked;
      onChange();
      return;
    }
    final epoch = ++_epoch;
    var expired = false;
    bool ownsPlayback() => !_disposed && epoch == _epoch;
    bool current() => ownsPlayback() && isVisible();
    _playing = true;
    _failed = false;
    onChange();
    final noise = prompt.snrDb == null ? null : prompt.noise;
    var played = false;
    try {
      if (noise != null) await _optionalNoise(() => noise.start(prompt.snrDb));
      if (current()) {
        final wait = _pending = Completer<bool>();
        void complete(bool value) {
          if (!wait.isCompleted) wait.complete(value);
        }

        _deadline = Timer(prompt.playbackLimit, () {
          expired = true;
          complete(false);
          final cancel = prompt.cancelPlayback;
          if (cancel != null) unawaited(_ignoreCancel(cancel));
        });
        unawaited(
          Future<bool>.sync(() => prompt.play(() => current() && !expired))
              .then(
                complete,
                onError: (Object _, StackTrace _) => complete(false),
              ),
        );
        played = await wait.future;
      }
    } catch (_) {
      // An audio error must never count as a presented exercise.
    } finally {
      if (ownsPlayback()) {
        _deadline?.cancel();
        _pending = null;
        if (noise != null) await _optionalNoise(noise.stop);
      }
      if (ownsPlayback()) {
        _playing = false;
        if (current()) {
          _failed = !played;
          if (played && !unlocked && !(_unlock?.isActive ?? false)) {
            if (prompt.answerDelay == Duration.zero) {
              _unlocked = true;
            } else {
              _unlock = Timer(prompt.answerDelay, () {
                _unlocked = true;
                onChange();
              });
            }
          }
        } else {
          _failed = !unlocked;
        }
        onChange();
      }
    }
  }

  void _invalidate() {
    _epoch++;
    _auto?.cancel();
    _unlock?.cancel();
    _deadline?.cancel();
    if (_pending case final wait? when !wait.isCompleted) wait.complete(false);
    _pending = null;
    _playing = false;
  }

  void dispose() {
    _disposed = true;
    _invalidate();
  }

  static Future<void> _optionalNoise(Future<void> Function() operation) async {
    try {
      await operation().timeout(const Duration(milliseconds: 500));
    } catch (_) {
      // The prompt is essential; interference is optional.
    }
  }

  static Future<void> _ignoreCancel(Future<void> Function() cancel) async {
    try {
      await cancel();
    } catch (_) {
      // A broken backend must not block retry.
    }
  }
}

/// One recovery message for all listening exercises. Replay stays in the toolbar.
class ListeningPromptStatus extends StatelessWidget {
  const ListeningPromptStatus({
    super.key,
    required this.controller,
    required this.soundOn,
    this.errorKey,
  });

  final ListeningPromptController controller;
  final bool soundOn;
  final Key? errorKey;

  @override
  Widget build(BuildContext context) {
    if (controller.playing) {
      return Semantics(
        liveRegion: true,
        label: L.t('listeningPromptPlaying'),
        child: const Padding(
          padding: EdgeInsets.all(8),
          child: SizedBox.square(
            dimension: 18,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      );
    }
    if (!controller.failed) return const SizedBox.shrink();
    return Semantics(
      liveRegion: true,
      child: Text(
        soundOn ? L.t('listeningPromptFailed') : L.t('voiceSoundOff'),
        key: errorKey ?? const Key('listening-prompt-error'),
        textAlign: TextAlign.center,
      ),
    );
  }
}
