// Ядро практик на Dart — общее для PsyGames и «Умного будильника» (пакет practice_kit).
// Перенос ядра на TS `frontend/src/games/pause/core` репозитория PsyGames; сверка с
// ним — пробы приложений (PsyGames: flutter/test/pause_core_test.dart, эталон —
// node flutter/tools/export-pause.cjs). Правишь ядро на TS — перенеси правку сюда
// тем же заходом: копия теперь одна.
//
// Native Dart port v0.2.0-dev.1 / Smart Alarm 0.1.11, canonical pause/core.
// The JSON boundary deliberately preserves original field names and plan IDs.
import 'dart:convert';
import 'dart:math' as math;

typedef Json = Map<String, dynamic>;
List<Json> objects(dynamic value) => (value as List).cast<Json>();
String localText(dynamic value, String locale) => value[locale] ?? value['en'];
bool safeInt(dynamic n) => n is int && n >= 0 && n <= 9007199254740991;

class PlanFailure implements Exception {
  final List<String> codes;
  PlanFailure(this.codes);
  @override
  String toString() => codes.join(', ');
}

class Practices {
  final Json data;
  Practices(this.data);
  List<Json> get catalog => objects(data['catalog']);
  Json get warnings => data['warnings'];
  Json set(String id) => catalog.firstWhere((s) => s['id'] == id);
  Json program(String id, [String? programId]) {
    final s = set(id);
    return objects(s['programs'])
        .firstWhere((p) => p['id'] == (programId ?? s['defaultProgramId']));
  }

  /// Что занимает выбранная программа: своё, если задано, иначе ресурсы набора
  /// (`getPracticeResources` ядра на TS, задача f5dfd582).
  List<String> resources(String setId, [String? programId]) {
    try {
      final p = program(setId, programId);
      return List<String>.from(p['resources'] ?? set(setId)['resources'] ?? const []);
    } on StateError {
      return const [];
    }
  }

  /// Общий ресурс двух практик — развилка «либо-либо». Внимание целиком не делится
  /// ни с чем (`getResourceConflict` ядра на TS).
  List<String> resourceConflict(Json a, Json b) {
    final left = resources(a['setId'], a['programId']), right = resources(b['setId'], b['programId']);
    if (left.contains('attention') || right.contains('attention')) return const ['attention'];
    return left.where(right.contains).toList();
  }

  List<Json> _resolve(List<Json> selections) {
    final result = <Json>[];
    for (final s in selections) {
      try {
        final p = program(s['setId'], s['programId']);
        result.add({
          'set': set(s['setId']),
          'program': p,
          'selection': {'setId': s['setId'], 'programId': p['id']},
        });
      } on StateError {
        /* An invalid selection is reported by validate. */
      }
    }
    return result;
  }

  List<String> requiredWarnings(List<Json> selections) => _resolve(selections)
      .expand<String>(
        (i) => [
          ...List<String>.from(i['set']['warningIds'] ?? []),
          ...List<String>.from(i['program']['warningIds'] ?? []),
        ],
      )
      .toSet()
      .toList();
  List<String> priorExperience(List<Json> selections) =>
      _resolve(selections)
          .where((i) => i['program']['requiresPriorExperience'] == true)
          .map((i) => '${i['set']['id']}/${i['program']['id']}')
          .toSet()
          .toList();

  String? _parallelIssue(Json i, Json r) {
    final p = i['program'], s = i['set'];
    final category = p['parallelClass'] ?? s['parallelClass'];
    if (p['soloOnly'] == true ||
        category == 'solo' ||
        category == 'attention') {
      return 'PAIR_NOT_ALLOWED';
    }
    final count = r['soloCompletions']?[s['id']] ?? 0;
    final threshold = r['masteryThreshold'] ?? 3;
    if ((safeInt(count) ? count : 0) <
        (safeInt(threshold) && threshold > 0 ? threshold : 3)) {
      return 'MASTERY_REQUIRED';
    }
    if (p['requiresAudioInParallel'] == true && r['guideMode'] == 'visual') {
      return 'AUDIO_GUIDE_REQUIRED';
    }
    return null;
  }

  List<String> validate(Json r) {
    final errors = <String>[];
    final duration = r['durationMs'];
    if (!safeInt(duration) || duration < 30000 || duration > 3600000) {
      errors.add('INVALID_DURATION');
    }
    final selections = objects(r['selections']);
    for (final selection in selections) {
      if (_resolve([selection]).isEmpty) errors.add('UNKNOWN_PROGRAM');
    }
    final resolved = _resolve(selections), mode = r['mode'];
    if ((mode == 'solo' && resolved.length != 1) ||
        (mode == 'parallel' && (resolved.length < 2 || resolved.length > 20)) ||
        (mode == 'charge' && (resolved.isEmpty || resolved.length > 20))) {
      errors.add('INVALID_SELECTION_COUNT');
    }
    if (resolved.map((i) => i['set']['id']).toSet().length != resolved.length) {
      errors.add('DUPLICATE_SELECTION');
    }
    for (final i in resolved) {
      if (!(i['program']['contexts'] ?? i['set']['contexts']).contains(
        r['context'],
      )) {
        errors.add('CONTEXT_UNAVAILABLE');
      }
      if ((i['program']['status'] ?? i['set']['status']) == 'experimental' &&
          r['allowExperimental'] != true) {
        errors.add('EXPERIMENTAL_DISABLED');
      }
    }
    for (final id in requiredWarnings(selections)) {
      if (!(r['acknowledgedWarnings'] ?? []).contains(id)) {
        errors.add('WARNING_NOT_ACKNOWLEDGED');
      }
    }
    for (final id in priorExperience(selections)) {
      if (!(r['confirmedPriorExperience'] ?? []).contains(id)) {
        errors.add('PRIOR_EXPERIENCE_REQUIRED');
      }
    }
    if (mode == 'parallel') {
      errors.addAll(
        resolved.map((i) => _parallelIssue(i, r)).whereType<String>().toSet(),
      );
      var clash = false;
      for (var i = 0; i < resolved.length && !clash; i++) {
        for (var j = i + 1; j < resolved.length; j++) {
          if (resourceConflict(resolved[i]['selection'], resolved[j]['selection']).isNotEmpty) {
            clash = true;
            break;
          }
        }
      }
      if (clash) errors.add('RESOURCE_CONFLICT');
    }
    return errors;
  }

  Json _step(
    Json item,
    Json step,
    String locale,
    int lane,
    int start,
    int end,
  ) {
    final peak = step['attention'] == 'peak'
        ? math.min(250, math.max(0, end - start))
        : 0;
    return {
      'lane': lane,
      'setId': item['set']['id'],
      'programId': item['program']['id'],
      'stepId': step['id'],
      'title': localText(step['title'], locale),
      'cue': localText(step['cue'], locale),
      'channel': step['channel'],
      'motion': step['motion'],
      'startMs': start,
      'endMs': end,
      'attentionPeakStartMs': peak > 0 ? start : null,
      'attentionPeakEndMs': peak > 0 ? start + peak : null,
    };
  }

  List<Json> _lane(Json item, String locale, int lane, int start, int end) {
    final result = <Json>[], steps = objects(item['program']['steps']);
    // Guided massage is a single pass, not an endless repetition on one area.
    // Fit both sides into short sessions; longer sessions finish with rest.
    if (item['program']['singlePass'] == true) {
      final total = steps.fold<int>(0, (sum, s) => sum + (s['durationMs'] as int));
      final span = math.min(total, end - start);
      var consumed = 0, cursor = start;
      for (final step in steps) {
        consumed += step['durationMs'] as int;
        final next = start + (span * consumed / total).round();
        result.add(_step(item, step, locale, lane, cursor, next));
        cursor = next;
      }
      if (cursor < end) {
        result.add(_step(item, steps.last, locale, lane, cursor, end));
      }
      return result;
    }
    int cursor = start, index = 0;
    while (cursor < end) {
      final step = steps[index++ % steps.length];
      final next = math.min(end, cursor + (step['durationMs'] as int));
      result.add(_step(item, step, locale, lane, cursor, next));
      cursor = next;
    }
    return result;
  }

  List<Json> _breathFirst(List<Json> values) => [
    ...values.where((i) => i['set']['id'] == 'breathing'),
    ...values.where((i) => i['set']['id'] != 'breathing'),
  ];
  /// 🔴 КОДЫ, КОТОРЫЕ ВЫРАЖАЮТ МНЕНИЕ, А НЕ НЕВОЗМОЖНОСТЬ ПОСТРОИТЬ ПЛАН.
  ///
  /// Денис, автор приложения, 24.09.2026: «я решил, или кто другой — он
  /// запускает и смотрит, а не ты блокируешь. Ты вообще блокировать ничего не
  /// вправе». Эти семь кодов — про то, что приложение СЧИТАЕТ неудачным
  /// сочетанием: пара не рекомендуется, нужен звук, программа задумана для
  /// другого места, программа экспериментальная, набор пройден мало раз,
  /// предупреждение не подтверждено, нет прошлого опыта. Ни один из них не
  /// мешает собрать план — они мешали человеку нажать кнопку.
  ///
  /// Остальные коды остаются отказом, потому что плана из них не выходит:
  /// неизвестная программа, дубль набора, неверное число практик для режима,
  /// длительность вне диапазона.
  static const advisoryCodes = {
    'PAIR_NOT_ALLOWED',
    'AUDIO_GUIDE_REQUIRED',
    'CONTEXT_UNAVAILABLE',
    'EXPERIMENTAL_DISABLED',
    'MASTERY_REQUIRED',
    'WARNING_NOT_ACKNOWLEDGED',
    'PRIOR_EXPERIENCE_REQUIRED',
    // Развилку «либо-либо» решает интерфейс заменой, а не отказом (задача f5dfd582).
    'RESOURCE_CONFLICT',
  };

  /// Что стоит сказать человеку, не мешая ему запустить.
  ///
  /// ⚠️ Считается только при `advisory: true` — иначе эти коды по-прежнему
  /// отказ, и порт сверяется с оригиналом как раньше.
  List<String> advisories(Json r) =>
      validate(r).where(advisoryCodes.contains).toSet().toList();

  Json plan(Json r) {
    final all = validate(r);
    final errors = r['advisory'] == true
        ? all.where((c) => !advisoryCodes.contains(c)).toList()
        : all;
    if (errors.isNotEmpty) throw PlanFailure(errors);
    final resolved = _resolve(objects(r['selections']));
    List<List<Json>> working = [resolved];
    if (r['mode'] == 'charge') {
      // Маршрут: в общий параллельный блок — только то, что не делит ресурс с уже взятым.
      final parallel = <Json>[];
      working = [];
      for (final i in resolved) {
        final clash = parallel.any((t) => resourceConflict(t['selection'], i['selection']).isNotEmpty);
        if (_parallelIssue(i, r) == null && !clash) {
          parallel.add(i);
        } else {
          working.add([i]);
        }
      }
      if (parallel.isNotEmpty) working.insert(0, _breathFirst(parallel));
    }
    final int duration = r['durationMs'];
    if (duration < working.length * 15000) {
      throw PlanFailure(['DURATION_TOO_SHORT']);
    }
    final base = duration ~/ working.length,
        remainder = duration % working.length;
    final blocks = <Json>[], timeline = <Json>[];
    int cursor = 0;
    for (int index = 0; index < working.length; index++) {
      final end = cursor + base + (index < remainder ? 1 : 0),
          items = _breathFirst(working[index]);
      blocks.add({
        'id': 'block-${index + 1}',
        'startMs': cursor,
        'endMs': end,
        'setIds': items.map((i) => i['set']['id']).toList(),
      });
      final scheduled = <Json>[];
      final breath = items.first['set']['id'] == 'breathing'
          ? _lane(items.first, r['locale'], 0, cursor, end)
          : null;
      for (int lane = 0; lane < items.length; lane++) {
        final item = items[lane], steps = objects(item['program']['steps']);
        List<Json> raw;
        if (lane == 0 && breath != null) {
          raw = breath;
        } else if (item['set']['id'] == 'eye-gym' ||
            item['program']['singlePass'] == true || breath == null) {
          raw = _lane(item, r['locale'], lane, cursor, end);
        } else {
          raw = List.generate(breath.length, (j) {
            final b = breath[j];
            Json step;
            if (item['set']['id'] == 'pelvic-floor') {
              final exhale =
                  (b['stepId'] as String).contains('exhale') ||
                  (b['stepId'] as String).endsWith('-out');
              step = steps.firstWhere(
                (s) => s['id'] == (exhale ? 'long-squeeze' : 'long-release'),
                orElse: () => steps[exhale ? 0 : math.min(1, steps.length - 1)],
              );
            } else {
              step = steps[j % steps.length];
            }
            return _step(
              item,
              step,
              r['locale'],
              lane,
              b['startMs'],
              b['endMs'],
            );
          });
        }
        if (lane > 0) {
          raw = raw.map((s) {
            if (s['attentionPeakStartMs'] == null) return s;
            final int span =
                s['attentionPeakEndMs'] - s['attentionPeakStartMs'];
            int? chosen;
            for (
              int candidate = s['startMs'];
              candidate + span <= s['endMs'];
              candidate += 250
            ) {
              if (!scheduled.any(
                (p) =>
                    p['attentionPeakStartMs'] != null &&
                    candidate < p['attentionPeakEndMs'] &&
                    p['attentionPeakStartMs'] < candidate + span,
              )) {
                chosen = candidate;
                break;
              }
            }
            return {
              ...s,
              'attentionPeakStartMs': chosen,
              'attentionPeakEndMs': chosen == null ? null : chosen + span,
            };
          }).toList();
        }
        scheduled.addAll(raw);
        timeline.addAll(raw);
      }
      cursor = end;
    }
    final selections = resolved.map((i) => i['selection']).toList();
    final mode = r['visualLeaderMode'] ?? 'full-screen-clock';
    final fingerprint = jsonEncode({
      'mode': r['mode'],
      'selections': selections,
      'durationMs': duration,
      'locale': r['locale'],
      'guideMode': r['guideMode'],
      'context': r['context'],
      'visualLeaderMode': mode,
    });
    int hash = 0x811c9dc5;
    for (final code in fingerprint.codeUnits) {
      hash = ((hash ^ code) * 0x01000193) & 0xffffffff;
    }
    timeline.sort((a, b) {
      final c = (a['startMs'] as int).compareTo(b['startMs']);
      return c != 0 ? c : (a['lane'] as int).compareTo(b['lane']);
    });
    return {
      'id': 'pause-${hash.toRadixString(16).padLeft(8, '0')}',
      'version': 'pause-practices-plan-v1',
      'mode': r['mode'],
      'locale': r['locale'],
      'guideMode': r['guideMode'],
      'context': r['context'],
      'visualLeaderMode': mode,
      'durationMs': duration,
      'selections': selections,
      'blocks': blocks,
      'timeline': timeline,
      'warningIds': requiredWarnings(objects(selections)),
      'priorExperienceProgramIds': priorExperience(objects(selections)),
    };
  }

  Json frame(Json plan, int elapsed) {
    if (!safeInt(elapsed)) throw ArgumentError('elapsedMs');
    final bounded = math.min(plan['durationMs'] as int, elapsed);
    final cues = objects(plan['timeline'])
        .where((s) => bounded >= s['startMs'] && bounded < s['endMs'])
        .map((s) {
          Json? tone;
          final String id = s['stepId'];
          if (plan['guideMode'] != 'visual' && s['channel'] == 'scale') {
            final hold = ['hold-in', 'hold-out', 'hold'].contains(id);
            final inhale =
                !hold && (id.contains('inhale') || id.endsWith('-in'));
            final exhale =
                !hold && (id.contains('exhale') || id.endsWith('-out'));
            tone = {
              'kind': inhale || exhale ? 'pitch-ramp' : 'steady',
              'fromHz': inhale
                  ? 220
                  : exhale
                  ? 440
                  : 330,
              'toHz': inhale
                  ? 440
                  : exhale
                  ? 220
                  : 330,
            };
          }
          return {
            for (final key in [
              'setId',
              'programId',
              'stepId',
              'title',
              'cue',
              'channel',
              'motion',
            ])
              key: s[key],
            'leaderShape':
                program(s['setId'], s['programId'])['leaderShape'] ?? 'none',
            'tone': tone,
            'progress': s['endMs'] == s['startMs']
                ? 1
                : (bounded - s['startMs']) / (s['endMs'] - s['startMs']),
          };
        })
        .toList();
    return {
      'elapsedMs': bounded,
      'progress': plan['durationMs'] == 0 ? 1 : bounded / plan['durationMs'],
      'cues': cues,
    };
  }
}

Json newSession(Json plan) => {
  'phase': 'ready',
  'plan': plan,
  'elapsedMs': 0,
  'runningSinceMs': null,
  'interruptedCount': 0,
  'result': null,
};
void _timestamp(int now) {
  if (!safeInt(now)) throw ArgumentError('Invalid timestamp');
}

int elapsedTime(Json s, int now) {
  _timestamp(now);
  if (s['runningSinceMs'] == null) return s['elapsedMs'];
  if (now < s['runningSinceMs']) throw StateError('Clock must be monotonic');
  final int elapsed = s['elapsedMs'] + now - s['runningSinceMs'];
  if (!safeInt(elapsed)) throw StateError('Elapsed time overflow');
  return math.min(s['plan']['durationMs'] as int, elapsed);
}

Json _complete(Json s, int elapsed) => {
  ...s,
  'phase': 'completed',
  'elapsedMs': elapsed,
  'runningSinceMs': null,
  'result': {
    'planId': s['plan']['id'],
    'durationMs': s['plan']['durationMs'],
    'completedSetIds': objects(s['plan']['selections'])
        .map((i) => i['setId'])
        .toSet()
        .toList(),
    'completion': 1,
    'adherence': 1,
    'interruptedCount': s['interruptedCount'],
  },
};
Json sessionAction(Json s, String action, int now, [int extra = 30000]) {
  if (action == 'start') {
    _timestamp(now);
    if (s['phase'] != 'ready') {
      throw StateError('Only ready sessions can start');
    }
    return {...s, 'phase': 'running', 'runningSinceMs': now};
  }
  if (action == 'resume') {
    _timestamp(now);
    return s['phase'] == 'paused'
        ? {...s, 'phase': 'running', 'runningSinceMs': now}
        : s;
  }
  if (action == 'dispose') {
    return {...s, 'phase': 'disposed', 'runningSinceMs': null, 'result': null};
  }
  if (action == 'restart') {
    if (s['phase'] == 'disposed') throw StateError('Disposed');
    return newSession(s['plan']);
  }
  if (!['running', 'paused'].contains(s['phase'])) return s;
  if (['tick', 'pause'].contains(action) && s['phase'] != 'running') return s;
  final elapsed = elapsedTime(s, now);
  final Json p = s['plan'];
  if (action == 'skip') {
    final ends = objects(p['timeline'])
        .map((i) => i['endMs'] as int)
        .where((v) => v > elapsed);
    final target = ends.fold<int>(p['durationMs'], math.min);
    return target >= p['durationMs']
        ? _complete(s, p['durationMs'])
        : {
            ...s,
            'elapsedMs': target,
            if (s['phase'] == 'running') 'runningSinceMs': now,
          };
  }
  if (action == 'extend') {
    if (extra <= 0) return s;
    dynamic shift(dynamic v) =>
        v == null ? null : (v > elapsed ? v + extra : v);
    return {
      ...s,
      'plan': {
        ...p,
        'durationMs': p['durationMs'] + extra,
        'timeline': objects(p['timeline'])
            .map(
              (i) => {
                ...i,
                for (final k in [
                  'startMs',
                  'endMs',
                  'attentionPeakStartMs',
                  'attentionPeakEndMs',
                ])
                  k: shift(i[k]),
              },
            )
            .toList(),
        'blocks': objects(p['blocks'])
            .map(
              (i) => {
                ...i,
                'startMs': shift(i['startMs']),
                'endMs': shift(i['endMs']),
              },
            )
            .toList(),
      },
      if (s['phase'] == 'running') ...{
        'elapsedMs': elapsed,
        'runningSinceMs': now,
      },
    };
  }
  if (elapsed >= p['durationMs']) return _complete(s, elapsed);
  if (action == 'pause') {
    return {
      ...s,
      'phase': 'paused',
      'elapsedMs': elapsed,
      'runningSinceMs': null,
      'interruptedCount': s['interruptedCount'] + 1,
    };
  }
  return {...s, 'elapsedMs': elapsed, 'runningSinceMs': now};
}
