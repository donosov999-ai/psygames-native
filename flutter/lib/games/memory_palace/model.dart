/// «ДВОРЕЦ ПАМЯТИ» — ПРАВИЛА, ПЕРЕНЕСЁННЫЕ С TS СО СВЕРКОЙ ПО ЭТАЛОНУ.
///
/// 🔴 ЧТО ЗДЕСЬ ГЛАВНОЕ. Приём loci держится на МАРШРУТЕ: человек знает дорогу
/// наизусть и вешает на неё образы. Поэтому первые пять уровней маршрут
/// неизменен — осваивается сам приём, — а с шестого он перемешивается, и номер
/// места прячется везде, кроме фазы маршрута. Без этого «запомните порядок»
/// было бы обещанием работы, которой нет: порядок читался бы прямо с экрана.
///
/// 🔴 У ИГРЫ ДВА ГЕНЕРАТОРА СЛУЧАЙНОСТИ, И ПУТАТЬ ИХ НЕЛЬЗЯ. Маршрут крутит
/// отдельная ветка `:route:`. Возьми общую — и перемешивание маршрута сдвинуло
/// бы всю цепочку бросков, то есть НАБОРЫ ПРЕДМЕТОВ поменялись бы на всех
/// уровнях разом, включая первые пять, где маршрут не трогают вовсе.
///
/// ⚠️ СОДЕРЖИМОЕ НЕ ПЕРЕПИСАНО, А ВЫГРУЖЕНО: места, предметы и подписи на
/// двенадцати языках лежат в `assets/memory-palace.json`, который пишет
/// `frontend/scripts/flutter-memory-palace-reference.test.ts` прогоном живого TS.
library;

import 'dart:convert';
import 'dart:math' as math;

import '../../shell/js_compat.dart';

const String memoryPalaceGeneratorVersion = 'memory-palace-generator-v1';
const int memoryPalaceLevels = 15;

/// До какого уровня маршрут постоянен. Решение Дениса 06.09.2026, вариант C.
const int memoryPalaceFixedRouteLevels = 5;

bool memoryPalaceRouteIsShuffled(int level) => level > memoryPalaceFixedRouteLevels;

int memoryPalaceLociCountForLevel(int requestedLevel) {
  final level = math.min(memoryPalaceLevels, math.max(1, requestedLevel));
  return math.min(12, 5 + ((level - 1) ~/ 2));
}

/* ─────────────────────────── содержимое ─────────────────────────── */

class PalaceLocus {
  const PalaceLocus({
    required this.id,
    required this.order,
    required this.motif,
    required this.color,
    required this.label,
  });

  final String id;
  final int order;
  final String motif;
  final String color;
  final Map<String, String> label;

  PalaceLocus withOrder(int newOrder) =>
      PalaceLocus(id: id, order: newOrder, motif: motif, color: color, label: label);

  String title(String locale) => label[locale] ?? label['en'] ?? id;

  factory PalaceLocus.fromJson(Map<String, dynamic> j) => PalaceLocus(
        id: j['id'] as String,
        order: j['order'] as int,
        motif: j['motif'] as String,
        color: j['color'] as String,
        label: (j['label'] as Map).map((k, v) => MapEntry(k as String, v as String)),
      );
}

class PalaceItem {
  const PalaceItem({
    required this.id,
    required this.shape,
    required this.color,
    required this.accent,
    required this.label,
  });

  final String id;
  final String shape;
  final String color;
  final String accent;
  final Map<String, String> label;

  String title(String locale) => label[locale] ?? label['en'] ?? id;

  factory PalaceItem.fromJson(Map<String, dynamic> j) => PalaceItem(
        id: j['id'] as String,
        shape: j['shape'] as String,
        color: j['color'] as String,
        accent: j['accent'] as String,
        label: (j['label'] as Map).map((k, v) => MapEntry(k as String, v as String)),
      );
}

class MemoryPalaceContent {
  MemoryPalaceContent({required this.route, required this.items, this.strings = const {}});

  final List<PalaceLocus> route;
  final List<PalaceItem> items;

  /// Подписи экрана на двенадцати языках — те же, что у веб-версии.
  final Map<String, Map<String, String>> strings;

  String s(String locale, String key) => strings[locale]?[key] ?? strings['en']?[key] ?? key;

  String fill(String template, Map<String, Object> values) =>
      template.replaceAllMapped(RegExp(r'\{(\w+)\}'), (m) {
        final key = m.group(1)!;
        return values.containsKey(key) ? '${values[key]}' : m.group(0)!;
      });

  static MemoryPalaceContent fromJsonString(String source) {
    final j = jsonDecode(source) as Map<String, dynamic>;
    Map<String, Map<String, String>> flat(Object? raw) => ((raw as Map?) ?? const {}).map(
          (locale, values) => MapEntry(
            locale as String,
            {
              for (final e in (values as Map).entries)
                if (e.value is String) e.key as String: e.value as String,
            },
          ),
        );
    return MemoryPalaceContent(
      route: [for (final l in j['route'] as List) PalaceLocus.fromJson(l as Map<String, dynamic>)],
      items: [for (final i in j['items'] as List) PalaceItem.fromJson(i as Map<String, dynamic>)],
      strings: flat(j['strings']),
    );
  }
}

/* ─────────────────────────── расклад ─────────────────────────── */

class MemoryPalaceRound {
  const MemoryPalaceRound({
    required this.id,
    required this.seed,
    required this.level,
    required this.difficulty,
    required this.lociCount,
    required this.loci,
    required this.targetItems,
    required this.distractorItems,
    required this.recallCandidates,
  });

  final String id;
  final String seed;
  final int level;
  final int difficulty;
  final int lociCount;
  final List<PalaceLocus> loci;
  final List<PalaceItem> targetItems;
  final List<PalaceItem> distractorItems;

  /// Что показывается на припоминании: свои предметы вперемешку с чужими.
  final List<PalaceItem> recallCandidates;

  PalaceItem? item(String id) {
    for (final i in [...targetItems, ...distractorItems]) {
      if (i.id == id) return i;
    }
    return null;
  }
}

MemoryPalaceRound generateMemoryPalaceRound(
  MemoryPalaceContent content,
  String seed,
  int requestedLevel,
) {
  final normalizedSeed = normalizeSeed(seed, 'memory-palace');
  final level = math.min(memoryPalaceLevels, math.max(1, requestedLevel));
  final lociCount = memoryPalaceLociCountForLevel(level);
  final distractorCount = math.min(4, 2 + ((lociCount - 5) ~/ 3));
  final rng = createRng('$normalizedSeed:$level:$memoryPalaceGeneratorVersion');
  // 🔴 Отдельная ветка случайности для маршрута — см. шапку файла.
  final routeRng = createRng('$normalizedSeed:route:$level:$memoryPalaceGeneratorVersion');
  final routeForLevel = memoryPalaceRouteIsShuffled(level)
      ? shuffle(routeRng, content.route).take(lociCount).toList()
      : content.route.take(lociCount).toList();
  final shuffledItems = shuffle(rng, content.items);
  final targetItems = shuffledItems.take(lociCount).toList();
  final distractorItems = shuffledItems.skip(lociCount).take(distractorCount).toList();
  final recallCandidates = shuffle(rng, [...targetItems, ...distractorItems]);
  return MemoryPalaceRound(
    id: 'memory-palace:$normalizedSeed:$level',
    seed: normalizedSeed,
    level: level,
    difficulty: math.min(100, math.max(1, jsRound((18 + (lociCount - 5) * 8 + distractorCount * 4).toDouble()).toInt())),
    lociCount: lociCount,
    // Нумерация всегда 1..N подряд: перемешивание меняет, КАКОЕ место стоит
    // вторым, а не его номер.
    loci: [
      for (var i = 0; i < routeForLevel.length; i += 1) routeForLevel[i].withOrder(i + 1),
    ],
    targetItems: targetItems,
    distractorItems: distractorItems,
    recallCandidates: recallCandidates,
  );
}

/* ─────────────────────────── партия ─────────────────────────── */

enum MemoryPalacePhase {
  rules,
  route,
  place,
  study,
  recallForward,
  transition,
  recallReverse,
  paused,
  result,
}

const Map<MemoryPalacePhase, String> memoryPalacePhaseNames = {
  MemoryPalacePhase.rules: 'rules',
  MemoryPalacePhase.route: 'route',
  MemoryPalacePhase.place: 'place',
  MemoryPalacePhase.study: 'study',
  MemoryPalacePhase.recallForward: 'recall-forward',
  MemoryPalacePhase.transition: 'transition',
  MemoryPalacePhase.recallReverse: 'recall-reverse',
  MemoryPalacePhase.paused: 'paused',
  MemoryPalacePhase.result: 'result',
};

class DirectionRecallScore {
  const DirectionRecallScore({
    required this.direction,
    required this.itemKnowledgeHits,
    required this.locationHits,
    required this.orderPairHits,
    required this.orderPairTotal,
    required this.responses,
  });

  final String direction;
  final int itemKnowledgeHits;
  final int locationHits;
  final int orderPairHits;
  final int orderPairTotal;
  final int responses;
}

class MemoryPalaceMetrics {
  const MemoryPalaceMetrics({
    required this.accuracy,
    required this.durationMs,
    required this.difficulty,
    required this.errors,
    required this.score,
    required this.level,
    required this.lociCount,
    required this.placementChanges,
    required this.itemKnowledgeAccuracy,
    required this.locationAccuracy,
    required this.orderAccuracy,
    required this.forwardLocationAccuracy,
    required this.reverseLocationAccuracy,
    required this.locationHits,
    required this.itemKnowledgeHits,
  });

  final double accuracy;
  final int durationMs;
  final int difficulty;
  final int errors;
  final int score;
  final int level;
  final int lociCount;
  final int placementChanges;
  final double itemKnowledgeAccuracy;
  final double locationAccuracy;
  final double orderAccuracy;
  final double forwardLocationAccuracy;
  final double reverseLocationAccuracy;
  final int locationHits;
  final int itemKnowledgeHits;

  /// Порог тот же, что в вебе: обе стороны обязаны держаться сами, иначе
  /// сильный прямой порядок спрятал бы полностью забытый обратный.
  bool get passed =>
      accuracy >= 0.7 &&
      locationAccuracy >= 0.6 &&
      forwardLocationAccuracy >= 0.5 &&
      reverseLocationAccuracy >= 0.5;
}

DirectionRecallScore scoreRecallDirection(
  String direction,
  List<String> forwardPlacements,
  List<String> responses,
  Set<String> targetIds,
) {
  final expected =
      direction == 'forward' ? [...forwardPlacements] : [...forwardPlacements.reversed];
  final slice = responses.take(expected.length).toList();
  final itemKnowledgeHits = slice.where(targetIds.contains).length;
  var locationHits = 0;
  for (var i = 0; i < expected.length; i += 1) {
    if (i < slice.length && slice[i] == expected[i]) locationHits += 1;
  }
  final expectedIndex = <String, int>{
    for (var i = 0; i < expected.length; i += 1) expected[i]: i,
  };
  var orderPairHits = 0;
  final orderPairTotal = expected.length * (expected.length - 1) ~/ 2;
  for (var left = 0; left < slice.length; left += 1) {
    for (var right = left + 1; right < slice.length; right += 1) {
      final l = expectedIndex[slice[left]];
      final r = expectedIndex[slice[right]];
      if (l != null && r != null && l < r) orderPairHits += 1;
    }
  }
  return DirectionRecallScore(
    direction: direction,
    itemKnowledgeHits: itemKnowledgeHits,
    locationHits: locationHits,
    orderPairHits: orderPairHits,
    orderPairTotal: orderPairTotal,
    responses: slice.length,
  );
}

MemoryPalaceMetrics scoreMemoryPalace(
  MemoryPalaceRound round,
  List<String> finalizedPlacements,
  List<String> forwardResponses,
  List<String> reverseResponses, {
  required int durationMs,
  required int placementChanges,
}) {
  if (finalizedPlacements.length != round.lociCount) {
    throw StateError('Finalized placements do not cover every locus');
  }
  final targetIds = {for (final i in round.targetItems) i.id};
  final scores = [
    scoreRecallDirection('forward', finalizedPlacements, forwardResponses, targetIds),
    scoreRecallDirection('reverse', finalizedPlacements, reverseResponses, targetIds),
  ];
  final totalResponses = round.lociCount * scores.length;
  final itemKnowledgeHits = scores.fold(0, (s, x) => s + x.itemKnowledgeHits);
  final locationHits = scores.fold(0, (s, x) => s + x.locationHits);
  final orderPairHits = scores.fold(0, (s, x) => s + x.orderPairHits);
  final orderPairTotal = scores.fold(0, (s, x) => s + x.orderPairTotal);
  final itemKnowledgeAccuracy = itemKnowledgeHits / totalResponses;
  final locationAccuracy = locationHits / totalResponses;
  final orderAccuracy = orderPairTotal == 0 ? 1.0 : orderPairHits / orderPairTotal;
  final accuracy = math.min(
    1.0,
    math.max(0.0, itemKnowledgeAccuracy * 0.35 + locationAccuracy * 0.45 + orderAccuracy * 0.2),
  );
  final errors = totalResponses - locationHits;
  return MemoryPalaceMetrics(
    accuracy: accuracy,
    durationMs: math.max(0, jsRound(durationMs.toDouble()).toInt()),
    difficulty: round.difficulty,
    errors: errors,
    score: jsRound(
      math.min(1500.0, math.max(0.0, accuracy * 1000 + round.difficulty * 4 - errors * 18)),
    ).toInt(),
    level: round.level,
    lociCount: round.lociCount,
    placementChanges: math.max(0, placementChanges),
    itemKnowledgeAccuracy: itemKnowledgeAccuracy,
    locationAccuracy: locationAccuracy,
    orderAccuracy: orderAccuracy,
    forwardLocationAccuracy: scores[0].locationHits / round.lociCount,
    reverseLocationAccuracy: scores[1].locationHits / round.lociCount,
    locationHits: locationHits,
    itemKnowledgeHits: itemKnowledgeHits,
  );
}

/// Партия. Изменяемая: экран держит один объект и двигает его нажатиями.
class MemoryPalaceSession {
  MemoryPalaceSession({required this.round});

  final MemoryPalaceRound round;

  MemoryPalacePhase phase = MemoryPalacePhase.rules;
  MemoryPalacePhase? pausedFrom;

  /// Что лежит на каждом месте: индекс — место, значение — предмет.
  late List<String?> placements = List<String?>.filled(round.lociCount, null);
  List<String>? finalizedPlacements;
  String? selectedItemId;
  int? selectedLocusIndex;
  int placementChanges = 0;
  int recallIndex = 0;
  final List<String> forwardResponses = [];
  final List<String> reverseResponses = [];
  int? startedAt;
  int? pauseStartedAt;
  int pausedMs = 0;
  MemoryPalaceMetrics? result;

  static MemoryPalaceSession create(MemoryPalaceContent content, String seed, int level) =>
      MemoryPalaceSession(round: generateMemoryPalaceRound(content, seed, level));

  bool get isActive => const {
        MemoryPalacePhase.route,
        MemoryPalacePhase.place,
        MemoryPalacePhase.study,
        MemoryPalacePhase.recallForward,
        MemoryPalacePhase.transition,
        MemoryPalacePhase.recallReverse,
      }.contains(phase);

  void start(int now) {
    if (phase != MemoryPalacePhase.rules) return;
    phase = MemoryPalacePhase.route;
    startedAt = now;
  }

  void continueToPlacement() {
    if (phase != MemoryPalacePhase.route) return;
    phase = MemoryPalacePhase.place;
    selectedItemId = null;
  }

  /// Выбор предмета. Если место уже выбрано — кладём сразу: человек мог начать
  /// с места («вот сюда положу вазу»), и это такой же законный порядок.
  void selectItem(String itemId) {
    if (phase != MemoryPalacePhase.place) return;
    if (!round.targetItems.any((i) => i.id == itemId)) return;
    final locus = selectedLocusIndex;
    if (locus != null) {
      selectedLocusIndex = null;
      _placeAt(itemId, locus);
      return;
    }
    selectedItemId = selectedItemId == itemId ? null : itemId;
  }

  void selectLocus(int locusIndex) {
    if (phase != MemoryPalacePhase.place) return;
    if (locusIndex < 0 || locusIndex >= round.lociCount) return;
    final selected = selectedItemId;
    if (selected == null) {
      // 🔴 Молчать нельзя: отчёт 22.08.2026 «нажимаю разное, не выбирается» —
      // это как раз было касание места до выбора предмета.
      selectedLocusIndex = selectedLocusIndex == locusIndex ? null : locusIndex;
      return;
    }
    _placeAt(selected, locusIndex);
  }

  void _placeAt(String itemId, int locusIndex) {
    final currentIndex = placements.indexOf(itemId);
    if (currentIndex == locusIndex) {
      selectedItemId = null;
      selectedLocusIndex = null;
      return;
    }
    final occupant = placements[locusIndex];
    if (currentIndex >= 0) placements[currentIndex] = occupant;
    placements[locusIndex] = itemId;
    final isRevision = currentIndex >= 0 || occupant != null;
    selectedItemId = null;
    selectedLocusIndex = null;
    if (isRevision) placementChanges += 1;
  }

  bool get placementComplete =>
      placements.length == round.lociCount &&
      placements.every((x) => x != null) &&
      placements.toSet().length == round.lociCount;

  void confirmPlacements() {
    if (phase != MemoryPalacePhase.place || !placementComplete) return;
    phase = MemoryPalacePhase.study;
    selectedItemId = null;
    selectedLocusIndex = null;
    finalizedPlacements = [for (final x in placements) x!];
  }

  void startRecall() {
    if (phase != MemoryPalacePhase.study || finalizedPlacements == null) return;
    phase = MemoryPalacePhase.recallForward;
    recallIndex = 0;
    forwardResponses.clear();
    reverseResponses.clear();
    result = null;
  }

  String? get currentDirection {
    if (phase == MemoryPalacePhase.recallForward) return 'forward';
    if (phase == MemoryPalacePhase.recallReverse) return 'reverse';
    return null;
  }

  PalaceLocus? get currentRecallLocus {
    final direction = currentDirection;
    if (direction == null) return null;
    final index = direction == 'forward' ? recallIndex : round.lociCount - 1 - recallIndex;
    return index >= 0 && index < round.loci.length ? round.loci[index] : null;
  }

  List<String> get currentResponses =>
      phase == MemoryPalacePhase.recallReverse ? reverseResponses : forwardResponses;

  void selectRecallItem(String itemId, int now) {
    final direction = currentDirection;
    if (direction == null || finalizedPlacements == null) return;
    if (!round.recallCandidates.any((i) => i.id == itemId)) return;
    final responses = currentResponses;
    if (responses.contains(itemId)) return;
    responses.add(itemId);
    if (responses.length < round.lociCount) {
      recallIndex = responses.length;
      return;
    }
    if (direction == 'forward') {
      phase = MemoryPalacePhase.transition;
      recallIndex = 0;
      return;
    }
    recallIndex = responses.length;
    phase = MemoryPalacePhase.result;
    result = scoreMemoryPalace(
      round,
      finalizedPlacements!,
      forwardResponses,
      reverseResponses,
      durationMs: math.max(0, now - (startedAt ?? now) - pausedMs),
      placementChanges: placementChanges,
    );
  }

  void continueToReverse() {
    if (phase != MemoryPalacePhase.transition) return;
    phase = MemoryPalacePhase.recallReverse;
    recallIndex = 0;
  }

  void pause(int now) {
    if (!isActive) return;
    pausedFrom = phase;
    phase = MemoryPalacePhase.paused;
    pauseStartedAt = now;
  }

  void resume(int now) {
    if (phase != MemoryPalacePhase.paused || pausedFrom == null) return;
    pausedMs += pauseStartedAt == null ? 0 : math.max(0, now - pauseStartedAt!);
    phase = pausedFrom!;
    pausedFrom = null;
    pauseStartedAt = null;
  }

  void restart(int now) {
    phase = MemoryPalacePhase.route;
    pausedFrom = null;
    placements = List<String?>.filled(round.lociCount, null);
    finalizedPlacements = null;
    selectedItemId = null;
    selectedLocusIndex = null;
    placementChanges = 0;
    recallIndex = 0;
    forwardResponses.clear();
    reverseResponses.clear();
    startedAt = now;
    pauseStartedAt = null;
    pausedMs = 0;
    result = null;
  }
}
