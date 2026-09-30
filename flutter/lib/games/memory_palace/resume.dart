/// НЕДОИГРАННАЯ ПАРТИЯ «ДВОРЦА ПАМЯТИ» — ПЕРЕНОС `frontend/src/games/memory-palace/integration.ts`.
///
/// 🔴 ЗАЧЕМ. Экран нативный с 24.09.2026, а продолжение партии при переносе потерялось: свернул
/// приложение посреди раскладки — партия начиналась заново (задача 1077f0ae). Запись лежит в ОБЩЕМ
/// ключе (`ResumeStore`: `psygames_resume_memory_palace_<профиль>`), и одну партию открывают обе
/// половины. Поэтому снимок — ФОРМА веб-сессии `MemoryPalaceSession` (имена полей и фаз как в TS),
/// а сверка — эталоном `flutter/test/fixtures/memory-palace-resume-reference.json`, снятым прогоном
/// живого TS (`frontend/src/games/memory-palace/tools/record-flutter-resume.gen.ts`).
///
/// Правила снимка — как в вебе, строка в строку:
/// · сохранять нечего (маршрут, итог) — `null`, а не пустая запись: мусор всплывает карточкой
///   «Продолжить» и обещает партию, которой нет;
/// · пауза в снимок не консервируется: человек вышел — это и есть его пауза;
/// · предмет «в руке» (выбран, не положен) — состояние руки, а не партии: сбрасывается;
/// · время — НАКОПЛЕННОЕ (`elapsedMs`), а не момент старта: подъём назавтра не должен отчитаться
///   о десятичасовом маршруте.
library;

import 'dart:math';

import 'model.dart';

/// Версия состава снимка — та же, что у веба (`MEMORY_PALACE_RESUME_V`).
const memoryPalaceResumeVersion = 1;

/// Имя игры в общем хранилище — как у веба (`MEMORY_PALACE_GAME_ID`).
const memoryPalaceGameId = 'memory_palace';

/// Задержка записи после хода — как у веба (`RESUME_DEBOUNCE_MS`).
const memoryPalaceResumeDebounce = Duration(milliseconds: 400);

/// Зерно партии. 🔴 СВЕЖЕЕ НА КАЖДЫЙ ЗАХОД (веб: `makeSeed`/`makeNonce`): предмет, который человек
/// уже раскладывал по этому маршруту, во второй раз он не запоминает, а УЗНАЁТ. До 30.09.2026
/// нативный экран брал `memory-palace-<уровень>` — каждый заход на уровне давал ту же раскладку.
String memoryPalaceSeed(int level, int now, double rnd) {
  final t = now.abs().toRadixString(36);
  final r = (rnd.abs() * 1679616).floor().toRadixString(36).padLeft(4, '0');
  return 'memory-palace-l${max(1, level)}-$t$r';
}

bool memoryPalaceHasSomethingToLose(MemoryPalaceSession? s) {
  if (s == null) return false;
  switch (s.phase) {
    case MemoryPalacePhase.place:
      return s.placements.any((id) => id != null);
    case MemoryPalacePhase.study ||
          MemoryPalacePhase.recallForward ||
          MemoryPalacePhase.transition ||
          MemoryPalacePhase.recallReverse:
      return true;
    case MemoryPalacePhase.paused:
      // Пауза посреди расстановки — живая партия, пауза на маршруте — нет.
      return s.pausedFrom != null && s.pausedFrom != MemoryPalacePhase.route;
    case MemoryPalacePhase.rules || MemoryPalacePhase.route || MemoryPalacePhase.result:
      return false;
  }
}

Map<String, Object?> _locusJson(PalaceLocus l) =>
    {'id': l.id, 'order': l.order, 'label': l.label, 'motif': l.motif, 'color': l.color};

Map<String, Object?> _itemJson(PalaceItem i) =>
    {'id': i.id, 'label': i.label, 'shape': i.shape, 'color': i.color, 'accent': i.accent};

Map<String, Object?> _roundJson(MemoryPalaceRound r) => {
      'id': r.id,
      'seed': r.seed,
      'level': r.level,
      'difficulty': r.difficulty,
      'generatorVersion': 'memory-palace-generator-v1',
      'lociCount': r.lociCount,
      'loci': [for (final l in r.loci) _locusJson(l)],
      'targetItems': [for (final i in r.targetItems) _itemJson(i)],
      'distractorItems': [for (final i in r.distractorItems) _itemJson(i)],
      'recallCandidates': [for (final i in r.recallCandidates) _itemJson(i)],
      'directions': const ['forward', 'reverse'],
    };

/// Снимок для хранилища или `null`, если терять нечего.
Map<String, Object?>? memoryPalaceSnapshot(MemoryPalaceSession? s, int level, int now) {
  if (s == null || !memoryPalaceHasSomethingToLose(s)) return null;
  final pauseStart = s.pauseStartedAt;
  final livePause = pauseStart == null ? 0 : max(0, now - pauseStart);
  final elapsedMs = max(0, now - (s.startedAt ?? now) - s.pausedMs - livePause);
  final phase = s.phase == MemoryPalacePhase.paused ? (s.pausedFrom ?? MemoryPalacePhase.place) : s.phase;
  return {
    'level': level,
    'seed': s.round.seed,
    'elapsedMs': elapsedMs,
    'session': {
      'config': {'seed': s.round.seed, 'level': s.round.level},
      'round': _roundJson(s.round),
      'phase': memoryPalacePhaseNames[phase],
      'pausedFrom': null,
      'placements': [...s.placements],
      'finalizedPlacements': s.finalizedPlacements == null ? null : [...s.finalizedPlacements!],
      'selectedPlacementItemId': null,
      'selectedPlacementLocusIndex': s.selectedLocusIndex,
      'placementChanges': s.placementChanges,
      'recallIndex': s.recallIndex,
      'forwardResponses': [...s.forwardResponses],
      'reverseResponses': [...s.reverseResponses],
      'startedAt': null,
      'pauseStartedAt': null,
      'pausedMs': 0,
      'result': null,
    },
  };
}

MemoryPalacePhase? _phaseOf(Object? name) {
  for (final e in memoryPalacePhaseNames.entries) {
    if (e.value == name) return e.key;
  }
  return null;
}

/// Поднять партию из снимка (своего или веб-половины). Часы заводятся ЗАДНИМ ЧИСЛОМ на накопленное
/// время. `null` — снимок негодный или терять в нём нечего.
({MemoryPalaceSession session, String seed, int level})? memoryPalaceRestore(Map<String, Object?>? saved, int now) {
  if (saved == null) return null;
  final raw = saved['session'];
  if (raw is! Map || raw['round'] is! Map) return null;
  try {
    final r = (raw['round'] as Map).cast<String, dynamic>();
    List<PalaceItem> items(String key) =>
        [for (final i in (r[key] as List)) PalaceItem.fromJson((i as Map).cast<String, dynamic>())];
    final round = MemoryPalaceRound(
      id: r['id'] as String,
      seed: r['seed'] as String,
      level: (r['level'] as num).toInt(),
      difficulty: (r['difficulty'] as num).toInt(),
      lociCount: (r['lociCount'] as num).toInt(),
      loci: [for (final l in (r['loci'] as List)) PalaceLocus.fromJson((l as Map).cast<String, dynamic>())],
      targetItems: items('targetItems'),
      distractorItems: items('distractorItems'),
      recallCandidates: items('recallCandidates'),
    );
    final phase = _phaseOf(raw['phase']);
    if (phase == null) return null;
    final s = MemoryPalaceSession(round: round)
      ..phase = phase
      ..pausedFrom = null
      ..placements = [for (final p in (raw['placements'] as List)) p as String?]
      ..finalizedPlacements = raw['finalizedPlacements'] == null
          ? null
          : [for (final p in (raw['finalizedPlacements'] as List)) p as String]
      ..selectedItemId = raw['selectedPlacementItemId'] as String?
      ..selectedLocusIndex = (raw['selectedPlacementLocusIndex'] as num?)?.toInt()
      ..placementChanges = (raw['placementChanges'] as num).toInt()
      ..recallIndex = (raw['recallIndex'] as num).toInt();
    s.forwardResponses.addAll([for (final x in (raw['forwardResponses'] as List)) x as String]);
    s.reverseResponses.addAll([for (final x in (raw['reverseResponses'] as List)) x as String]);
    if (!memoryPalaceHasSomethingToLose(s)) return null;
    final elapsed = max(0, (saved['elapsedMs'] as num?)?.toInt() ?? 0);
    s
      ..startedAt = now - elapsed
      ..pausedMs = 0
      ..pauseStartedAt = null;
    return (session: s, seed: saved['seed'] as String, level: (saved['level'] as num).toInt());
  } catch (_) {
    // Запись от другой версии или испорченная — не поднимаем, партия начнётся заново.
    return null;
  }
}
