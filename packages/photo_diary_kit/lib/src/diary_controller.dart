import 'dart:async';

import 'package:flutter/foundation.dart';

import 'core/diary_preferences.dart';
import 'core/photo_diary.dart';

typedef DiaryLoader = Future<PhotoDiary> Function();

/// Optional app-owned feature. Errors never escape into wake/practice handlers.
/// No alarm API, scheduler, microphone, networking or permission prompt here.
class DiaryController extends ChangeNotifier {
  DiaryController(
    this._preferences, {
    required this.loadDiary,
    required this.persistPreferences,
    required this.readPhoto,
    this.deadline = const Duration(seconds: 8),
  });
  DiaryPreferences _preferences;
  DiaryPreferences get preferences => _preferences;
  final DiaryLoader loadDiary;
  final Future<void> Function(DiaryPreferences) persistPreferences;
  final Future<Uint8List?> Function(String) readPhoto;
  final Duration deadline;
  PhotoDiary? _diary;
  Future<void>? _initializing;
  Future<void> _preferenceWrites = Future.value();
  bool unavailable = false;
  bool _disposed = false;
  bool _foreground = true;
  int _consentGeneration = 0;
  final _terminal = <String, String>{};
  List<DiaryEntry> get entries => List.unmodifiable(_diary?.entries ?? []);

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  Future<void> initialize() async {
    if (_diary != null) return;
    final pending = _initializing ??= _initialize();
    await pending;
    // A failed storage initialization must not disable all later sessions.
    if (identical(_initializing, pending)) _initializing = null;
  }

  Future<void> _initialize() async {
    try {
      final diary = await loadDiary().timeout(deadline);
      if (_disposed) {
        await diary.interrupt();
        return;
      }
      _diary = diary;
      if (!_foreground) await diary.interrupt();
      unavailable = false;
    } catch (_) {
      unavailable = true;
    }
    _notify();
  }

  Future<void> _optional(Future<void> Function() action) async {
    try {
      await action().timeout(deadline);
    } catch (_) {
      unavailable = true;
      // Cancel any late capture, without delaying the caller for cancellation.
      final diary = _diary;
      if (diary != null) {
        unawaited(
          diary
              .interrupt()
              .then((_) {
                if (_foreground && !_disposed) diary.resume();
              })
              .catchError((Object _) {}),
        );
      }
    }
    _notify();
  }

  Future<void> changePreferences(DiaryPreferences value) async {
    final revoking =
        (_preferences.cameraConsent && !value.cameraConsent) ||
        (_preferences.storageConsent && !value.storageConsent);
    _preferences = value;
    _notify();
    final saving = _preferenceWrites.then((_) => persistPreferences(value));
    _preferenceWrites = saving.then<void>((_) {}, onError: (Object _) {});
    if (revoking) {
      _consentGeneration++;
      await interrupt();
      if (_foreground) _diary?.resume();
    }
    await _optional(() => saving);
  }

  /// Voluntary caller may await this bounded preparation before starting timer.
  /// Wake caller must NOT await it before showing task or silencing the alarm.
  Future<void> begin({
    required String id,
    required String kind,
    required String title,
    required bool sessionOptIn,
  }) async {
    final allowed = kind == 'wake'
        ? preferences.wakeCapture
        : preferences.practiceCapture;
    if (!allowed ||
        !sessionOptIn ||
        !_foreground ||
        _disposed ||
        _terminal.containsKey(id)) {
      return;
    }
    final generation = _consentGeneration;
    final startedAtMs = DateTime.now().millisecondsSinceEpoch;
    await initialize();
    if (_disposed || !_foreground || generation != _consentGeneration) return;
    final diary = _diary;
    if (diary == null) return;
    await _optional(() async {
      await diary.begin(
        id: id,
        kind: kind,
        title: title,
        startedAtMs: startedAtMs,
        enabled: true,
        savePhotos: preferences.savePhotos && !_terminal.containsKey(id),
      );
      final outcome = _terminal[id];
      if (outcome != null) {
        await diary.finish(
          id,
          outcome: outcome,
          savePhotos: preferences.savePhotos && _foreground,
        );
      }
    });
  }

  /// Caller passes actual chain/session outcome, never inferred from a photo.
  /// Finish alarm first; start this independently afterwards.
  Future<void> finish(String id, String outcome) async {
    final previous = _terminal[id];
    if (previous != null && previous != 'snoozed') return;
    _terminal[id] = outcome;
    if (_terminal.length > 256) _terminal.remove(_terminal.keys.first);
    final diary = _diary;
    if (diary == null || _disposed) return;
    await _optional(
      () => diary.finish(
        id,
        outcome: outcome,
        savePhotos: preferences.savePhotos && _foreground,
      ),
    );
  }

  Future<void> rate(String id, int? rating) async {
    final diary = _diary;
    if (diary != null) await _optional(() => diary.rate(id, rating));
  }

  Future<void> captureDuring(String id) async {
    final diary = _diary;
    if (diary == null ||
        _disposed ||
        !_foreground ||
        !preferences.savePhotos ||
        !preferences.wakeCapture ||
        !preferences.rainbowCapture ||
        _terminal.containsKey(id)) {
      return;
    }
    await _optional(() => diary.captureDuring(id, savePhotos: true));
  }

  Future<void> delete(String id) async {
    final diary = _diary;
    if (diary != null) await _optional(() => diary.delete(id));
  }

  Future<void> deleteAll() async {
    final diary = _diary;
    if (diary != null) await _optional(diary.deleteAll);
  }

  Future<void> interrupt() async {
    final diary = _diary;
    if (diary != null) await _optional(diary.interrupt);
  }

  void foreground(bool value) {
    _foreground = value;
    if (value) {
      _diary?.resume();
    } else {
      unawaited(interrupt());
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _foreground = false;
    unawaited(interrupt());
    super.dispose();
  }
}
