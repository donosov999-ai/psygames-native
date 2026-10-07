/// «РИТМ И ВЫСОТА» — ядро на Flutter.
///
/// Перенос `frontend/src/games/rhythm-pitch/core/` (rng, generator, validator,
/// scoring, session). Сверка — с ИСПОЛНЕНИЕМ живого TS: у модуля свой ГСЧ от
/// строки зерна, поэтому раунды и итоги сверяются шаг в шаг:
/// `test/fixtures/rhythm-pitch-reference.json`, прибор
/// `frontend/scripts/flutter-rhythm-pitch-reference.test.ts`.
///
/// ⚠️ Две тонкости переноса, без которых эталон не сходится:
/// · ГСЧ — mulberry32 на 32-битной арифметике: `Math.imul`, `>>>`, `| 0`
///   повторены масками, а не «примерно»;
/// · `Math.round` в JS округляет половины ВВЕРХ (−12,25 → −12,2), а Dart — от нуля
///   (−12,3). Смещение задержки бывает отрицательным, поэтому — [jsRound].
library;

import 'dart:math' as math;

const String rhythmPitchGeneratorVersion = 'rhythm-pitch-generator-v1';
const int rhythmPitchLevels = 31;
const List<String> rhythmPitchModes = ['rhythm-echo', 'pitch-path'];
const List<String> pitchLevelNames = ['low', 'mid', 'high'];

// ─── 32-битная арифметика JS ────────────────────────────────────────────────

int _u32(int x) => x & 0xFFFFFFFF;
int _i32(int x) {
  final u = x & 0xFFFFFFFF;
  return u >= 0x80000000 ? u - 0x100000000 : u;
}

/// `Math.imul`: младшие 32 бита произведения, со знаком.
int _imul(int a, int b) => _i32(_u32(a) * _u32(b));

/// `Math.round` из JS: половины — вверх, к +∞.
double jsRound(double x) {
  final f = x.floorToDouble();
  return x - f >= 0.5 ? f + 1 : f;
}

double _clamp(double v, double lo, double hi) => math.min(hi, math.max(lo, v));

// ─── ГСЧ ─────────────────────────────────────────────────────────────────────

/// FNV-1a по единицам UTF-16 строки зерна.
int hashSeed(String seed) {
  var hash = 0x811c9dc5;
  for (var i = 0; i < seed.length; i += 1) {
    hash = _i32(hash ^ seed.codeUnitAt(i));
    hash = _imul(hash, 0x01000193);
  }
  return _u32(hash);
}

typedef Rng = double Function();

/// mulberry32 — тот же поток чисел, что `createRng` модуля.
Rng createRng(String seed) {
  var state = hashSeed(seed);
  if (state == 0) state = 1;
  return () {
    state = _i32(state);
    state = _i32(state + 0x6d2b79f5);
    var value = _imul(state ^ (_u32(state) >> 15), 1 | state);
    value = _i32(_i32(value + _imul(value ^ (_u32(value) >> 7), 61 | value)) ^ value);
    return _u32(value ^ (_u32(value) >> 14)) / 4294967296;
  };
}

String normalizeSeed(String seed) {
  final n = seed
      .trim()
      .toLowerCase()
      .replaceAll(RegExp(r'[\s_]+'), '-')
      .replaceAll(RegExp(r'-{2,}'), '-')
      .replaceAll(RegExp(r'^-|-$'), '');
  return n.isEmpty ? 'rhythm-pitch' : n;
}

int randomInt(Rng rng, int min, int max) {
  if (max < min) throw RangeError('Invalid integer range: $min..$max');
  return min + (rng() * (max - min + 1)).floor();
}

List<T> shuffleRng<T>(Rng rng, List<T> values) {
  final r = [...values];
  for (var i = r.length - 1; i > 0; i -= 1) {
    final t = randomInt(rng, 0, i);
    final x = r[i];
    r[i] = r[t];
    r[t] = x;
  }
  return r;
}

// ─── Раунды ─────────────────────────────────────────────────────────────────

class RhythmBeat {
  const RhythmBeat(this.onsetMs, this.accent);
  final double onsetMs;
  final bool accent;
}

sealed class RpRound {
  const RpRound({
    required this.id,
    required this.seed,
    required this.level,
    required this.difficulty,
    required this.tutorialReplay,
  });
  final String id;
  final String seed;
  final int level;
  final int difficulty;
  final bool tutorialReplay;
  String get mode;
}

class RhythmEchoRound extends RpRound {
  const RhythmEchoRound({
    required super.id,
    required super.seed,
    required super.level,
    required super.difficulty,
    required super.tutorialReplay,
    required this.beatCount,
    required this.bpm,
    required this.unitMs,
    required this.beats,
    required this.pauseCount,
    required this.syncopationCount,
    required this.accentCount,
  });
  @override
  String get mode => 'rhythm-echo';
  final int beatCount;
  final int bpm;
  final double unitMs;
  final List<RhythmBeat> beats;
  final int pauseCount;
  final int syncopationCount;
  final int accentCount;
}

class PitchPathRound extends RpRound {
  const PitchPathRound({
    required super.id,
    required super.seed,
    required super.level,
    required super.difficulty,
    required super.tutorialReplay,
    required this.task,
    required this.toneCount,
    required this.pitchLevelCount,
    required this.intervalSemitones,
    required this.frequenciesHz,
    required this.sequence,
    required this.directionAnswer,
  });
  @override
  String get mode => 'pitch-path';

  /// `direction` — выше или ниже второй звук; `sequence` — путь из трёх высот.
  final String task;
  final int toneCount;
  final int pitchLevelCount;
  final int intervalSemitones;
  final List<double> frequenciesHz;
  final List<int> sequence;
  final String? directionAnswer;
}

double midiToFrequency(int midi) => 440 * math.pow(2, (midi - 69) / 12).toDouble();

String rhythmPitchModeForLevel(int requestedLevel) {
  final level = math.min(rhythmPitchLevels, math.max(1, requestedLevel));
  return rhythmPitchModes[(level - 1) % rhythmPitchModes.length];
}

RhythmEchoRound _rhythmRound(String seed, int level) {
  final rng = createRng('$seed:$level:rhythm:$rhythmPitchGeneratorVersion');
  final beatCount = math.min(12, 3 + (level - 1) ~/ 2);
  final bpm = math.min(160, 60 + ((level - 1) ~/ 2) * 10);
  final unitMs = 60000 / bpm;
  final mult = <double>[];
  for (var i = 0; i < beatCount - 1; i += 1) {
    var m = 1.0;
    if (level >= 4 && i == 1) {
      m = 2;
    } else if (level >= 7 && i == 2) {
      m = rng() < 0.5 ? 0.5 : 1.5;
    } else if (level >= 10 && rng() < 0.18) {
      m = 2;
    } else if (level >= 12 && rng() < 0.24) {
      m = rng() < 0.5 ? 0.5 : 1.5;
    }
    mult.add(m);
  }
  var onset = 0.0;
  final beats = <RhythmBeat>[];
  for (var i = 0; i < beatCount; i += 1) {
    final accent = level >= 5 && (i == 0 || rng() < math.min(0.42, 0.12 + level * 0.01));
    beats.add(RhythmBeat(jsRound(onset * 1000) / 1000, accent));
    onset += unitMs * (i < mult.length ? mult[i] : 0);
  }
  final pauseCount = mult.where((v) => v == 2).length;
  final syncopationCount = mult.where((v) => v == 0.5 || v == 1.5).length;
  final accentCount = beats.where((b) => b.accent).length;
  return RhythmEchoRound(
    id: 'rhythm-pitch:$seed:$level:rhythm-echo',
    seed: seed,
    level: level,
    difficulty: _clamp(
      jsRound(5 + beatCount * 4 + (bpm - 60) * 0.28 + pauseCount * 3 + syncopationCount * 4 + accentCount * 1.5),
      1,
      100,
    ).toInt(),
    tutorialReplay: level <= 3,
    beatCount: beatCount,
    bpm: bpm,
    unitMs: unitMs,
    beats: beats,
    pauseCount: pauseCount,
    syncopationCount: syncopationCount,
    accentCount: accentCount,
  );
}

PitchPathRound _pitchRound(String seed, int level) {
  final rng = createRng('$seed:$level:pitch:$rhythmPitchGeneratorVersion');
  if (level <= 3) {
    final interval = math.max(3, 7 - level);
    final lowMidi = randomInt(rng, 58, 67);
    final answer = rng() < 0.5 ? 'higher' : 'lower';
    return PitchPathRound(
      id: 'rhythm-pitch:$seed:$level:pitch-path',
      seed: seed,
      level: level,
      difficulty: _clamp(jsRound(12.0 + (7 - interval) * 6), 1, 100).toInt(),
      tutorialReplay: true,
      task: 'direction',
      toneCount: 2,
      pitchLevelCount: 2,
      intervalSemitones: interval,
      frequenciesHz: [midiToFrequency(lowMidi), midiToFrequency(lowMidi + interval)],
      sequence: answer == 'higher' ? [0, 1] : [1, 0],
      directionAnswer: answer,
    );
  }
  final toneCount = math.min(10, 3 + (level - 4) ~/ 2);
  final interval = math.max(1, 6 - (level - 4) ~/ 5);
  final center = randomInt(rng, 62, 70);
  final freqs = [midiToFrequency(center - interval), midiToFrequency(center), midiToFrequency(center + interval)];
  final seq = shuffleRng(rng, [0, 1, 2]);
  while (seq.length < toneCount) {
    final prior = seq.last;
    final candidates = [for (final c in [0, 1, 2]) if (c != prior) c];
    seq.add(candidates[randomInt(rng, 0, candidates.length - 1)]);
  }
  return PitchPathRound(
    id: 'rhythm-pitch:$seed:$level:pitch-path',
    seed: seed,
    level: level,
    difficulty: _clamp(jsRound(18.0 + toneCount * 5 + (6 - interval) * 7), 1, 100).toInt(),
    tutorialReplay: false,
    task: 'sequence',
    toneCount: toneCount,
    pitchLevelCount: 3,
    intervalSemitones: interval,
    frequenciesHz: freqs,
    sequence: seq.take(toneCount).toList(),
    directionAnswer: null,
  );
}

RpRound generateRhythmPitchRound(String seed, int requestedLevel, [String? requestedMode]) {
  final s = normalizeSeed(seed);
  final level = math.min(rhythmPitchLevels, math.max(1, requestedLevel));
  final mode = requestedMode ?? rhythmPitchModeForLevel(level);
  final round = mode == 'rhythm-echo' ? _rhythmRound(s, level) : _pitchRound(s, level);
  final issues = validateRhythmPitchRound(round);
  if (issues.isNotEmpty) throw StateError('Generated invalid Rhythm/Pitch round: ${issues.join(', ')}');
  return round;
}

// ─── Проверка раунда ────────────────────────────────────────────────────────

const double comfortableMinFrequencyHz = 196;
const double comfortableMaxFrequencyHz = 880;

List<String> validateRhythmPitchRound(RpRound round) {
  final issues = <String>[];
  if (round.level < 1) issues.add('level ${round.level}');
  if (round.difficulty < 1 || round.difficulty > 100) issues.add('difficulty ${round.difficulty}');
  switch (round) {
    case RhythmEchoRound r:
      if (r.beatCount < 3 || r.beatCount > 12) issues.add('beat count ${r.beatCount}');
      if (r.bpm < 60 || r.bpm > 160) issues.add('BPM ${r.bpm}');
      if (r.beats.length != r.beatCount) issues.add('beat length mismatch');
      var prior = -1.0;
      for (var i = 0; i < r.beats.length; i += 1) {
        final o = r.beats[i].onsetMs;
        if (!o.isFinite || o < 0 || o <= prior) {
          if (i > 0 || o != 0) issues.add('invalid onset $i');
        }
        prior = o;
      }
      final intervals = [for (var i = 1; i < r.beats.length; i += 1) r.beats[i].onsetMs - r.beats[i - 1].onsetMs];
      final pauses = intervals.where((v) => (v - r.unitMs * 2).abs() < 0.01).length;
      final syncs = intervals
          .where((v) => (v - r.unitMs * 0.5).abs() < 0.01 || (v - r.unitMs * 1.5).abs() < 0.01)
          .length;
      if (pauses != r.pauseCount) issues.add('pause count mismatch');
      if (syncs != r.syncopationCount) issues.add('syncopation count mismatch');
      if (r.beats.where((b) => b.accent).length != r.accentCount) issues.add('accent count mismatch');
      if (r.level < 4 && r.pauseCount > 0) issues.add('pause introduced before level 4');
      if (r.level < 7 && r.syncopationCount > 0) issues.add('syncopation introduced before level 7');
      if (r.level < 5 && r.accentCount > 0) issues.add('accent introduced before level 5');
    case PitchPathRound r:
      if (r.task == 'direction') {
        if (r.toneCount != 2 || r.pitchLevelCount != 2) issues.add('direction task shape');
        if (r.directionAnswer == null) issues.add('direction answer missing');
      } else {
        if (r.toneCount < 3 || r.toneCount > 10) issues.add('tone count ${r.toneCount}');
        if (r.pitchLevelCount != 3) issues.add('sequence must use three pitch levels');
        if (r.directionAnswer != null) issues.add('sequence direction answer must be null');
      }
      if (r.sequence.length != r.toneCount) issues.add('pitch sequence length mismatch');
      if (r.sequence.any((v) => v < 0 || v >= r.pitchLevelCount)) issues.add('pitch sequence index outside levels');
      if (r.frequenciesHz.length != r.pitchLevelCount) issues.add('frequency level mismatch');
      if (r.frequenciesHz.any((f) => !f.isFinite || f < comfortableMinFrequencyHz || f > comfortableMaxFrequencyHz)) {
        issues.add('frequency outside comfortable range');
      }
      for (var i = 1; i < r.frequenciesHz.length; i += 1) {
        if (r.frequenciesHz[i] <= r.frequenciesHz[i - 1]) issues.add('frequencies not ascending');
      }
      if (r.intervalSemitones < 1 || r.intervalSemitones > 6) issues.add('interval ${r.intervalSemitones}');
  }
  return issues;
}

// ─── Оценка ─────────────────────────────────────────────────────────────────

class RpMetrics {
  const RpMetrics({
    required this.accuracy,
    required this.durationMs,
    required this.difficulty,
    required this.errors,
    required this.score,
    required this.seed,
    required this.level,
    required this.specific,
  });
  final double accuracy;
  final int durationMs;
  final int difficulty;
  final int errors;
  final int score;
  final String seed;
  final int level;

  /// Поля `specific` веба — как есть, для отчёта о партии.
  final Map<String, Object?> specific;
}

/// Проход: точность от 70 %.
bool rpPassed(RpMetrics m) => m.accuracy >= 0.7;

({double offsetMs, int samples}) estimateLatencyOffset(List<double> expected, List<double> observed) {
  if (observed.length != expected.length) return (offsetMs: 0.0, samples: 0);
  final n = math.min(expected.length, observed.length);
  final diffs = [
    for (var i = 0; i < n; i += 1)
      if ((observed[i] - expected[i]).isFinite) _clamp(observed[i] - expected[i], -250, 500),
  ]..sort();
  if (diffs.isEmpty) return (offsetMs: 0.0, samples: 0);
  final mid = diffs.length ~/ 2;
  final off = diffs.length.isOdd ? diffs[mid] : (diffs[mid - 1] + diffs[mid]) / 2;
  return (offsetMs: jsRound(off * 10) / 10, samples: diffs.length);
}

class TapAlignment {
  const TapAlignment(this.errorsMs, this.missingTaps, this.extraTaps);
  final List<double> errorsMs;
  final int missingTaps;
  final int extraTaps;
}

/// Выравнивание нажатий по долям: пара, пропущенный такт или лишнее нажатие —
/// что дешевле, как `alignTapsToBeats` веба (та же развязка равенств).
TapAlignment alignTapsToBeats(List<double> expected, List<double> observed, double toleranceMs) {
  final beats = expected.length, taps = observed.length;
  final skip = toleranceMs * 1.5;
  final cost = [for (var i = 0; i <= beats; i += 1) List<double>.filled(taps + 1, 0)];
  final step = [for (var i = 0; i <= beats; i += 1) List<int>.filled(taps + 1, 0)];
  for (var i = 1; i <= beats; i += 1) {
    cost[i][0] = i * skip;
    step[i][0] = 1;
  }
  for (var j = 1; j <= taps; j += 1) {
    cost[0][j] = j * skip;
    step[0][j] = 2;
  }
  for (var i = 1; i <= beats; i += 1) {
    for (var j = 1; j <= taps; j += 1) {
      final pair = cost[i - 1][j - 1] + (observed[j - 1] - expected[i - 1]).abs();
      final skipBeat = cost[i - 1][j] + skip;
      final skipTap = cost[i][j - 1] + skip;
      final best = math.min(pair, math.min(skipBeat, skipTap));
      cost[i][j] = best;
      step[i][j] = best == pair ? 0 : (best == skipBeat ? 1 : 2);
    }
  }
  final errors = <double>[];
  var missing = 0, extra = 0, i = beats, j = taps;
  while (i > 0 || j > 0) {
    final move = step[i][j];
    if (move == 0) {
      errors.add((observed[j - 1] - expected[i - 1]).abs());
      i -= 1;
      j -= 1;
    } else if (move == 1) {
      missing += 1;
      i -= 1;
    } else {
      extra += 1;
      j -= 1;
    }
  }
  return TapAlignment(errors.reversed.toList(), missing, extra);
}

class RhythmTimingScore {
  const RhythmTimingScore(this.accuracy, this.meanTimingErrorMs, this.missingTaps, this.extraTaps, this.matchedTaps);
  final double accuracy;
  final double meanTimingErrorMs;
  final int missingTaps;
  final int extraTaps;
  final int matchedTaps;
}

/// Счёт ритма по РИСУНКУ, а не от конца звучания — `scoreRhythmTiming` веба VER 3
/// (решение Дениса 30.09.2026, задача a57a2b44). Образец прикладывается к нажатиям с
/// любым общим сдвигом, берётся лучший; кандидаты — прежняя привязка к концу звучания
/// и каждая пара «нажатие ↔ такт» (минимум суммы |остаток − сдвиг| лежит на медиане
/// остатков, то есть на одном из них). Замер до/после — в шапке веб-функции и в
/// `frontend/scripts/rhythm-pitch-pass-rate.measure.test.ts`.
RhythmTimingScore scoreRhythmTiming(
    RhythmEchoRound round, List<double> taps, double responseStartedAtMs, double calibrationOffsetMs) {
  final onsets = [for (final b in round.beats) b.onsetMs];
  final corrected = [for (final t in taps) t - calibrationOffsetMs];
  final tol = math.max(100.0, round.unitMs * 0.3);
  final shifts = <double>[responseStartedAtMs, for (final t in corrected) for (final o in onsets) t - o];
  TapAlignment? best;
  var bestCost = double.infinity;
  for (final shift in shifts) {
    final a = alignTapsToBeats([for (final o in onsets) shift + o], corrected, tol);
    final cost = a.errorsMs.fold<double>(0, (s, e) => s + e) + (a.missingTaps + a.extraTaps) * tol * 1.5;
    if (cost < bestCost) {
      best = a;
      bestCost = cost;
    }
  }
  final a = best!;
  final timing = a.errorsMs.fold<double>(0, (s, e) => s + e);
  final accuracy = _clamp(1 - bestCost / (round.beatCount * tol), 0, 1);
  return RhythmTimingScore(
    accuracy,
    a.errorsMs.isEmpty ? tol : timing / a.errorsMs.length,
    a.missingTaps,
    a.extraTaps,
    a.errorsMs.length,
  );
}

class RpScoreOptions {
  const RpScoreOptions({
    required this.durationMs,
    required this.calibrationOffsetMs,
    required this.calibrationSamples,
    required this.replayCount,
  });
  final double durationMs;
  final double calibrationOffsetMs;
  final int calibrationSamples;
  final int replayCount;
}

RpMetrics scoreRhythmCompletion(RhythmEchoRound round, List<double> taps, double responseStartedAtMs, RpScoreOptions o) {
  final t = scoreRhythmTiming(round, taps, responseStartedAtMs, o.calibrationOffsetMs);
  final errors = t.missingTaps + t.extraTaps + t.matchedTaps - jsRound(t.accuracy * t.matchedTaps).toInt();
  return RpMetrics(
    accuracy: t.accuracy,
    durationMs: math.max(0, jsRound(o.durationMs).toInt()),
    difficulty: round.difficulty,
    errors: errors,
    score: jsRound(_clamp(t.accuracy * 1000 + round.difficulty * 4 - errors * 25, 0, 1500)).toInt(),
    seed: round.seed,
    level: round.level,
    specific: {
      'mode': round.mode,
      'calibrationOffsetMs': o.calibrationOffsetMs,
      'calibrationSamples': o.calibrationSamples,
      'replayCount': o.replayCount,
      'timingAccuracy': t.accuracy,
      'meanTimingErrorMs': jsRound(t.meanTimingErrorMs * 10) / 10,
      'missingTaps': t.missingTaps,
      'extraTaps': t.extraTaps,
      'beatCount': round.beatCount,
      'bpm': round.bpm,
      'pauseCount': round.pauseCount,
      'syncopationCount': round.syncopationCount,
      'accentCount': round.accentCount,
      'pitchTask': null,
      'pitchAccuracy': null,
      'toneCount': 0,
      'pitchLevelCount': 0,
      'intervalSemitones': null,
      'minimumFrequencyHz': null,
      'maximumFrequencyHz': null,
    },
  );
}

RpMetrics scorePitchCompletion(PitchPathRound round, String? direction, List<int> sequence, RpScoreOptions o) {
  final correct = round.task == 'direction'
      ? (direction == round.directionAnswer ? 1 : 0)
      : [for (var i = 0; i < round.sequence.length; i += 1) if (i < sequence.length && sequence[i] == round.sequence[i]) 1]
          .length;
  final total = round.task == 'direction' ? 1 : round.toneCount;
  final accuracy = correct / total;
  final errors = total - correct;
  return RpMetrics(
    accuracy: accuracy,
    durationMs: math.max(0, jsRound(o.durationMs).toInt()),
    difficulty: round.difficulty,
    errors: errors,
    score: jsRound(_clamp(accuracy * 1000 + round.difficulty * 4 - errors * 30, 0, 1500)).toInt(),
    seed: round.seed,
    level: round.level,
    specific: {
      'mode': round.mode,
      'calibrationOffsetMs': o.calibrationOffsetMs,
      'calibrationSamples': o.calibrationSamples,
      'replayCount': o.replayCount,
      'timingAccuracy': null,
      'meanTimingErrorMs': null,
      'missingTaps': 0,
      'extraTaps': 0,
      'beatCount': 0,
      'bpm': null,
      'pauseCount': 0,
      'syncopationCount': 0,
      'accentCount': 0,
      'pitchTask': round.task,
      'pitchAccuracy': accuracy,
      'toneCount': round.toneCount,
      'pitchLevelCount': round.pitchLevelCount,
      'intervalSemitones': round.intervalSemitones,
      'minimumFrequencyHz': round.frequenciesHz.reduce(math.min),
      'maximumFrequencyHz': round.frequenciesHz.reduce(math.max),
    },
  );
}

// ─── Машина состояний ───────────────────────────────────────────────────────

/// Фазы: rules → calibration → ready → playback → response → result; плюс
/// paused, unavailable, disposed. Переходы — те же, что в `session.ts`: каждая
/// функция возвращает НОВОЕ состояние или прежнее, если переход запрещён.
class RpSession {
  RpSession._(this.seed, this.level, this.mode, this.round);

  factory RpSession.create({required String seed, required int level, String? mode}) {
    final l = math.min(rhythmPitchLevels, math.max(1, level));
    final m = mode ?? rhythmPitchModeForLevel(l);
    return RpSession._(seed, l, m, generateRhythmPitchRound(seed, l, m));
  }

  final String seed;
  final int level;
  final String mode;
  final RpRound round;
  String phase = 'rules';
  String? pausedFrom;
  double volume = 0.65;
  bool calibrationPlaying = false;
  bool calibrationComplete = false;
  List<double> calibrationExpectedTimes = const [];
  List<double> calibrationTaps = const [];
  double calibrationOffsetMs = 0;
  int calibrationSamples = 0;
  double? responseStartedAt;
  List<double> rhythmTaps = const [];
  String? pitchDirectionResponse;
  List<int> pitchSequenceResponse = const [];
  int replayCount = 0;
  double? startedAt;
  double? pauseStartedAt;
  double pausedMs = 0;
  String? audioError;
  RpMetrics? result;

  RpSession _copy() => RpSession._(seed, level, mode, round)
    ..phase = phase
    ..pausedFrom = pausedFrom
    ..volume = volume
    ..calibrationPlaying = calibrationPlaying
    ..calibrationComplete = calibrationComplete
    ..calibrationExpectedTimes = calibrationExpectedTimes
    ..calibrationTaps = calibrationTaps
    ..calibrationOffsetMs = calibrationOffsetMs
    ..calibrationSamples = calibrationSamples
    ..responseStartedAt = responseStartedAt
    ..rhythmTaps = rhythmTaps
    ..pitchDirectionResponse = pitchDirectionResponse
    ..pitchSequenceResponse = pitchSequenceResponse
    ..replayCount = replayCount
    ..startedAt = startedAt
    ..pauseStartedAt = pauseStartedAt
    ..pausedMs = pausedMs
    ..audioError = audioError
    ..result = result;

  static bool _active(String p) => p == 'calibration' || p == 'ready' || p == 'playback' || p == 'response';

  RpScoreOptions _options(double now) => RpScoreOptions(
        durationMs: math.max(0, now - (startedAt ?? now) - pausedMs),
        calibrationOffsetMs: calibrationOffsetMs,
        calibrationSamples: calibrationSamples,
        replayCount: replayCount,
      );

  RpSession start(double now) {
    if (phase != 'rules') return this;
    return _copy()
      ..phase = 'calibration'
      ..startedAt = now
      ..audioError = null;
  }

  RpSession setVolume(double v) {
    if (phase != 'calibration' || calibrationPlaying) return this;
    return _copy()..volume = jsRound(_clamp(v, 0.1, 1) * 100) / 100;
  }

  RpSession startCalibration(List<double> expected) {
    if (phase != 'calibration' || expected.isEmpty) return this;
    return _copy()
      ..calibrationPlaying = true
      ..calibrationComplete = false
      ..calibrationExpectedTimes = [...expected]
      ..calibrationTaps = const []
      ..audioError = null;
  }

  RpSession recordCalibrationTap(double t) {
    if (phase != 'calibration' || !calibrationPlaying || !t.isFinite) return this;
    if (calibrationTaps.length >= calibrationExpectedTimes.length) return this;
    return _copy()..calibrationTaps = [...calibrationTaps, t];
  }

  RpSession completeCalibration() {
    if (phase != 'calibration' || !calibrationPlaying) return this;
    final e = estimateLatencyOffset(calibrationExpectedTimes, calibrationTaps);
    final ok = e.samples >= 2;
    return _copy()
      ..calibrationPlaying = false
      ..calibrationComplete = ok
      ..calibrationOffsetMs = ok ? e.offsetMs : 0
      ..calibrationSamples = e.samples;
  }

  RpSession continueAfterCalibration() {
    if (phase != 'calibration' || !calibrationComplete || calibrationPlaying) return this;
    return _copy()..phase = 'ready';
  }

  RpSession skipCalibration() {
    if (phase != 'calibration' || calibrationPlaying) return this;
    return _copy()
      ..phase = 'ready'
      ..calibrationOffsetMs = 0
      ..calibrationComplete = false;
  }

  RpSession markAudioUnavailable(String message) {
    if (phase == 'disposed') return this;
    return _copy()
      ..phase = 'unavailable'
      ..pausedFrom = null
      ..calibrationPlaying = false
      ..audioError = message;
  }

  RpSession startPlayback() {
    if (phase != 'ready') return this;
    return _copy()
      ..phase = 'playback'
      ..responseStartedAt = null
      ..rhythmTaps = const []
      ..pitchDirectionResponse = null
      ..pitchSequenceResponse = const []
      ..result = null
      ..audioError = null;
  }

  RpSession completePlayback(double responseStartedAt) {
    if (phase != 'playback' || !responseStartedAt.isFinite) return this;
    return _copy()
      ..phase = 'response'
      ..responseStartedAt = responseStartedAt;
  }

  RpSession recordRhythmTap(double t) {
    if (phase != 'response' || round is! RhythmEchoRound || !t.isFinite) return this;
    return _copy()..rhythmTaps = [...rhythmTaps, t];
  }

  RpSession submitRhythm(double now) {
    final r = round;
    if (phase != 'response' || r is! RhythmEchoRound || responseStartedAt == null) return this;
    return _copy()
      ..phase = 'result'
      ..result = scoreRhythmCompletion(r, rhythmTaps, responseStartedAt!, _options(now));
  }

  RpSession selectDirection(String direction, double now) {
    final r = round;
    if (phase != 'response' || r is! PitchPathRound || r.task != 'direction') return this;
    final updated = _copy()..pitchDirectionResponse = direction;
    return updated
      ..phase = 'result'
      ..result = scorePitchCompletion(r, direction, const [], updated._options(now));
  }

  RpSession appendPitchLevel(int index) {
    final r = round;
    if (phase != 'response' ||
        r is! PitchPathRound ||
        r.task != 'sequence' ||
        index < 0 ||
        index >= r.pitchLevelCount ||
        pitchSequenceResponse.length >= r.toneCount) {
      return this;
    }
    return _copy()..pitchSequenceResponse = [...pitchSequenceResponse, index];
  }

  RpSession removeLastPitchLevel() {
    final r = round;
    if (phase != 'response' || r is! PitchPathRound || r.task != 'sequence' || pitchSequenceResponse.isEmpty) {
      return this;
    }
    return _copy()..pitchSequenceResponse = pitchSequenceResponse.sublist(0, pitchSequenceResponse.length - 1);
  }

  RpSession submitPitchSequence(double now) {
    final r = round;
    if (phase != 'response' || r is! PitchPathRound || r.task != 'sequence' || pitchSequenceResponse.length != r.toneCount) {
      return this;
    }
    return _copy()
      ..phase = 'result'
      ..result = scorePitchCompletion(r, null, pitchSequenceResponse, _options(now));
  }

  RpSession replayTutorial() {
    if (phase != 'response' || !round.tutorialReplay) return this;
    return _copy()
      ..phase = 'playback'
      ..responseStartedAt = null
      ..rhythmTaps = const []
      ..pitchDirectionResponse = null
      ..pitchSequenceResponse = const []
      ..replayCount = replayCount + 1;
  }

  RpSession pause(double now) {
    if (!_active(phase)) return this;
    return _copy()
      ..pausedFrom = phase
      ..phase = 'paused'
      ..pauseStartedAt = now
      ..calibrationPlaying = false;
  }

  /// Перезапуск партии (`restartRhythmPitchSession`): подстройка задержки остаётся.
  RpSession restart(double now) {
    if (phase == 'rules') return RpSession.create(seed: seed, level: level, mode: mode);
    return _copy()
      ..phase = calibrationComplete ? 'ready' : 'calibration'
      ..pausedFrom = null
      ..calibrationPlaying = false
      ..responseStartedAt = null
      ..rhythmTaps = const []
      ..pitchDirectionResponse = null
      ..pitchSequenceResponse = const []
      ..replayCount = 0
      ..startedAt = now
      ..pauseStartedAt = null
      ..pausedMs = 0
      ..audioError = null
      ..result = null;
  }

  /// Подстройка из прошлой партии ЭТОГО экрана — своё, не из веба.
  ///
  /// В вебе каждый новый уровень монтирует модуль заново (`key={attempt}`), и
  /// человек отстукивает метроном перед КАЖДЫМ раундом, даже перед «выше или
  /// ниже», где время не меряется вовсе. Задержка устройства между уровнями не
  /// меняется, поэтому здесь она переносится, а партия идёт сразу с «Готовы» —
  /// ровно туда же, куда ведёт и собственный перезапуск модуля ([restart]).
  RpSession carryCalibration(double offsetMs, int samples) {
    if (phase != 'calibration' || calibrationPlaying) return this;
    return _copy()
      ..phase = 'ready'
      ..calibrationComplete = true
      ..calibrationOffsetMs = offsetMs
      ..calibrationSamples = samples;
  }

  RpSession resume(double now) {
    if (phase != 'paused' || pausedFrom == null) return this;
    final paused = pauseStartedAt == null ? 0.0 : math.max(0.0, now - pauseStartedAt!);
    return _copy()
      ..phase = pausedFrom == 'playback' ? 'ready' : pausedFrom!
      ..pausedFrom = null
      ..pauseStartedAt = null
      ..pausedMs = pausedMs + paused;
  }
}
