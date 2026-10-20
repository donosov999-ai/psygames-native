import 'dart:async';
import 'dart:typed_data';

/// No camera, network or alarm scheduling in this layer.
enum DiaryShotState { absent, pending, saved, unavailable }

enum DiaryShotSlot { before, during, after }

class DiaryCaptureException implements Exception {
  const DiaryCaptureException(this.code);
  final String code;
}

class DiaryFrame {
  const DiaryFrame(this.bytes, this.takenAtMs);
  final Uint8List bytes;
  final int takenAtMs;
}

abstract class DiaryCamera {
  /// Already-authorized foreground capture. Never request permission here.
  Future<DiaryFrame> capture();

  /// Release camera ownership and cancel outstanding capture where possible.
  Future<void> cancel();
}

abstract class DiaryRepository {
  Future<List<DiaryEntry>> read();
  Future<void> write(List<DiaryEntry> entries);

  /// Return a private basename, never an arbitrary external file path.
  Future<String> saveFrame(DiaryFrame frame);
  Future<void> deleteFrame(String basename);
}

class DiaryEntry {
  DiaryEntry({
    required this.id,
    required this.kind,
    required this.title,
    required this.startedAtMs,
    this.outcome = 'running',
    this.brightness,
    this.before = DiaryShotState.absent,
    this.after = DiaryShotState.absent,
    this.during = DiaryShotState.absent,
    this.duringFile,
    this.duringAtMs,
    this.beforeError,
    this.duringError,
    this.afterError,
    this.beforeFile,
    this.afterFile,
    this.beforeAtMs,
    this.afterAtMs,
  });
  final String id, kind, title;
  final int startedAtMs;
  String outcome;

  /// Self-reported alertness, not a camera-derived score.
  int? brightness;
  DiaryShotState before, during, after;
  String? beforeFile, duringFile, afterFile;
  String? beforeError, duringError, afterError;
  int? beforeAtMs, duringAtMs, afterAtMs;

  DiaryShotState shotState(DiaryShotSlot slot) => switch (slot) {
    DiaryShotSlot.before => before,
    DiaryShotSlot.during => during,
    DiaryShotSlot.after => after,
  };
  void setShot(
    DiaryShotSlot slot,
    DiaryShotState state, {
    String? file,
    int? time,
    String? error,
  }) {
    switch (slot) {
      case DiaryShotSlot.before:
        before = state;
        beforeFile = file;
        beforeAtMs = time;
        beforeError = error;
      case DiaryShotSlot.during:
        during = state;
        duringFile = file;
        duringAtMs = time;
        duringError = error;
      case DiaryShotSlot.after:
        after = state;
        afterFile = file;
        afterAtMs = time;
        afterError = error;
    }
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'kind': kind,
    'title': title,
    'startedAtMs': startedAtMs,
    'outcome': outcome,
    'alertness': brightness,
    'before': before.name,
    'after': after.name,
    'beforeFile': beforeFile,
    'afterFile': afterFile,
    'beforeAtMs': beforeAtMs,
    'afterAtMs': afterAtMs,
    'during': during.name,
    'duringFile': duringFile,
    'duringAtMs': duringAtMs,
    'beforeError': beforeError,
    'duringError': duringError,
    'afterError': afterError,
  };

  static DiaryEntry fromJson(Map<String, dynamic> json) {
    DiaryShotState state(dynamic name) => DiaryShotState.values.firstWhere(
      (s) => s.name == name,
      orElse: () => DiaryShotState.unavailable,
    );
    return DiaryEntry(
      id: json['id'] as String,
      kind: json['kind'] as String,
      title: json['title'] as String,
      startedAtMs: json['startedAtMs'] as int,
      outcome: json['outcome'] as String? ?? 'interrupted',
      brightness: json['alertness'] as int?,
      before: state(json['before']),
      after: state(json['after']),
      beforeFile: json['beforeFile'] as String?,
      afterFile: json['afterFile'] as String?,
      beforeAtMs: json['beforeAtMs'] as int?,
      afterAtMs: json['afterAtMs'] as int?,
      during: json.containsKey('during')
          ? state(json['during'])
          : DiaryShotState.absent,
      duringFile: json['duringFile'] as String?,
      duringAtMs: json['duringAtMs'] as int?,
      beforeError: json['beforeError'] as String?,
      duringError: json['duringError'] as String?,
      afterError: json['afterError'] as String?,
    );
  }
}

/// The caller starts alarm-stop independently: finish() must never gate stop.
/// A reserved shot survives reload, so resume cannot take another "before".
class PhotoDiary {
  PhotoDiary(
    this.repository,
    this.camera, {
    this.timeout = const Duration(seconds: 6),
    int Function()? now,
  }) : now = now ?? (() => DateTime.now().millisecondsSinceEpoch);
  final DiaryRepository repository;
  final DiaryCamera camera;
  final Duration timeout;
  final int Function() now;
  final List<DiaryEntry> entries = [];
  Future<void> _queue = Future.value();
  bool foreground = true;
  bool _busy = false;
  int _generation = 0;
  int _deletion = 0;

  Future<T> _serial<T>(Future<T> Function() action) {
    final next = _queue.then((_) => action());
    _queue = next.then<void>((_) {}, onError: (Object _) {});
    return next;
  }

  Future<void> load() => _serial(() async {
    entries.clear();
    entries.addAll(await repository.read());
    for (final entry in entries) {
      if (entry.during == DiaryShotState.pending) {
        entry.setShot(
          DiaryShotSlot.during,
          DiaryShotState.unavailable,
          error: 'interrupted',
        );
      }
      if (entry.before == DiaryShotState.pending) {
        entry.before = DiaryShotState.unavailable;
      }
      if (entry.after == DiaryShotState.pending) {
        entry.after = DiaryShotState.unavailable;
      }
    }
    await repository.write(entries);
  });

  Future<void> begin({
    required String id,
    required String kind,
    required String title,
    required bool enabled,
    required bool savePhotos,
    int? startedAtMs,
  }) async {
    if (!enabled) return;
    final deletion = _deletion;
    final entry = await _serial(() async {
      if (deletion != _deletion || entries.any((e) => e.id == id)) return null;
      final e = DiaryEntry(
        id: id,
        kind: kind,
        title: title,
        startedAtMs: startedAtMs ?? now(),
      );
      entries.insert(0, e);
      await repository.write(entries);
      return e;
    });
    if (entry != null && savePhotos) {
      await _capture(entry, slot: DiaryShotSlot.before);
    }
  }

  Future<void> finish(
    String id, {
    required String outcome,
    required bool savePhotos,
  }) async {
    final entry = await _serial(() async {
      final matches = entries.where((e) => e.id == id);
      if (matches.isEmpty) return null;
      final previous = matches.first.outcome;
      if (previous != 'running' && previous != 'snoozed') return null;
      if (previous == outcome) return null;
      final e = matches.first;
      e.outcome = outcome;
      await repository.write(entries);
      return e;
    });
    if (entry != null && outcome == 'completed' && savePhotos) {
      await _capture(entry, slot: DiaryShotSlot.after);
    }
  }

  /// An in-session shot is not evidence of successful completion.
  Future<void> captureDuring(String id, {required bool savePhotos}) async {
    if (!savePhotos) return;
    final found = entries.where((e) => e.id == id && e.outcome == 'running');
    if (found.isNotEmpty) {
      await _capture(found.first, slot: DiaryShotSlot.during);
    }
  }

  Future<void> _capture(DiaryEntry e, {required DiaryShotSlot slot}) async {
    final generation = _generation;
    bool valid() =>
        foreground &&
        generation == _generation &&
        entries.contains(e) &&
        (slot == DiaryShotSlot.after
            ? e.outcome == 'completed'
            : e.outcome == 'running');
    var claimed = false;
    var saving = false;
    String? file;
    try {
      await _serial(() async {
        if (!entries.contains(e) ||
            e.shotState(slot) != DiaryShotState.absent) {
          return;
        }
        if (!valid() || _busy) {
          e.setShot(
            slot,
            DiaryShotState.unavailable,
            error: !valid() ? 'interrupted' : 'camera_busy',
          );
        } else {
          _busy = true;
          claimed = true;
          e.setShot(slot, DiaryShotState.pending);
        }
        await repository.write(entries);
      });
      if (!claimed) return;
      final frame = await camera.capture().timeout(timeout);
      if (!valid()) throw const DiaryCaptureException('interrupted');
      saving = true;
      await _serial(() async {
        if (!valid()) throw const DiaryCaptureException('interrupted');
        file = await repository.saveFrame(frame);
        if (!valid()) throw const DiaryCaptureException('interrupted');
        e.setShot(
          slot,
          DiaryShotState.saved,
          file: file,
          time: frame.takenAtMs,
        );
        await repository.write(entries);
      });
    } catch (error) {
      final code = error is TimeoutException
          ? 'timeout'
          : error is DiaryCaptureException
          ? error.code
          : saving
          ? 'storage_error'
          : 'capture_error';
      await _serial(() async {
        if (file != null) await repository.deleteFrame(file!);
        if (!entries.contains(e)) return;
        e.setShot(slot, DiaryShotState.unavailable, error: code);
        await repository.write(entries);
      });
    } finally {
      if (claimed) {
        try {
          await camera.cancel().timeout(timeout);
        } catch (_) {}
        _busy = false;
      }
    }
  }

  Future<void> interrupt() async {
    foreground = false;
    _generation++;
    try {
      await camera.cancel().timeout(timeout);
    } catch (_) {}
  }

  void resume() {
    foreground = true;
  }

  Future<void> rate(String id, int? value) => _serial(() async {
    if (value != null && (value < 1 || value > 5)) throw ArgumentError('1–5');
    for (final e in entries.where((e) => e.id == id)) {
      e.brightness = value;
    }
    await repository.write(entries);
  });

  Future<void> delete(String id) async {
    _generation++;
    await _serial(() async {
      final removed = entries.where((e) => e.id == id).toList();
      entries.removeWhere((e) => e.id == id);
      await repository.write(entries);
      for (final e in removed) {
        for (final file in [
          e.beforeFile,
          e.duringFile,
          e.afterFile,
        ].whereType<String>()) {
          await repository.deleteFrame(file);
        }
      }
    });
  }

  Future<void> deleteAll() async {
    _deletion++;
    for (final id in entries.map((e) => e.id).toList()) {
      await delete(id);
    }
  }
}
