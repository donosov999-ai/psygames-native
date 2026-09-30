/// «ЛИЦА И ИМЕНА» — ПРАВИЛА, ПЕРЕНЕСЁННЫЕ С TS СО СВЕРКОЙ ПО ЭТАЛОНУ.
///
/// 🔴 ЧТО ЗДЕСЬ ГЛАВНОЕ. Сложность игры держится не на числе людей, а на
/// ПОХОЖЕСТИ: ложные лица подбираются по расстоянию до настоящего, ложные имена
/// — по расстоянию Левенштейна, ложные факты — по категории. Ошибка на знак в
/// любой из трёх формул даёт ту же игру с другой сложностью — и заметить это на
/// глаз нельзя. Поэтому перенос сверяется эталоном, снятым прогоном живого TS
/// (`test/fixtures/faces-names-reference.json`), а не «похоже, работает».
///
/// 🔴 СОРТИРОВКА ОБЯЗАНА БЫТЬ УСТОЙЧИВОЙ. В JS `Array.prototype.sort` устойчива
/// по стандарту: при равных ключах порядок остаётся тем, что дало перемешивание.
/// В Dart `List.sort` неустойчив. Подбор вариантов сперва перемешивает, потом
/// сортирует по близости — значит неустойчивая сортировка молча выдаст ДРУГИЕ
/// варианты ответа на том же seed. Отсюда `_stableSortBy`.
///
/// ⚠️ БИБЛИОТЕКА ЛЮДЕЙ НЕ ПЕРЕПИСАНА, А ВЫГРУЖЕНА. 48 портретов, имён и фактов
/// на двенадцати языках лежат в `assets/faces-names.json`, который пишет
/// `frontend/scripts/flutter-faces-names-reference.test.ts` прогоном живого TS.
/// Копия в коде была бы вторым источником правды и отстала бы молча.
library;

import 'dart:convert';
import 'dart:math' as math;

import '../../shell/js_compat.dart';

const String facesNamesGeneratorVersion = 'faces-names-generator-v1';
const int facesNamesLevels = 33;

/* ─────────────────────────── случайность ─────────────────────────── */

/// 🔴 СВОЕЙ АРИФМЕТИКИ ЗДЕСЬ НЕТ. FNV-1a, mulberry32, `Math.imul` и округление
/// «половина вверх» уже лежат в `shell/js_compat.dart` — общем модуле для всех
/// перенесённых игр. Вторая копия тех же тридцати строк разошлась бы с первой
/// молча: одно зерно дало бы в двух играх разные партии.

/// Устойчивая сортировка: при равных ключах сохраняется исходный порядок — как
/// в JS, где `Array.prototype.sort` устойчива по стандарту, а в Dart нет.
///
/// ⚠️ ЭТО ГРАБЛИ ВСЕГО ПЕРЕЕЗДА, А НЕ ОДНОЙ ИГРЫ: любой подбор вида
/// «перемешать, потом отсортировать по близости» молча даст другой результат.
/// Место этой функции — в `shell/js_compat.dart`, рядом с остальной
/// совместимостью; пока лежит здесь, потому что каркас не мой. Передано в канал.
List<T> _stableSortBy<T>(List<T> items, double Function(T) key) {
  final indexed = <MapEntry<int, T>>[
    for (var i = 0; i < items.length; i += 1) MapEntry(i, items[i]),
  ];
  indexed.sort((a, b) {
    final c = key(a.value).compareTo(key(b.value));
    return c != 0 ? c : a.key.compareTo(b.key);
  });
  return [for (final e in indexed) e.value];
}

/* ─────────────────────────── библиотека ─────────────────────────── */

class FaceSpec {
  const FaceSpec({
    required this.assetId,
    required this.family,
    required this.variant,
    required this.backgroundColor,
    required this.faceTone,
    required this.hairColor,
    required this.accentColor,
    required this.faceShape,
    required this.hairStyle,
    required this.eyeSpacing,
    required this.glasses,
    required this.mouthCurve,
  });

  final String assetId;
  final int family;
  final int variant;
  final String backgroundColor;
  final String faceTone;
  final String hairColor;
  final String accentColor;
  final String faceShape;
  final String hairStyle;
  final int eyeSpacing;
  final bool glasses;
  final int mouthCurve;

  factory FaceSpec.fromJson(Map<String, dynamic> j) => FaceSpec(
        assetId: j['assetId'] as String,
        family: j['family'] as int,
        variant: j['variant'] as int,
        backgroundColor: j['backgroundColor'] as String,
        faceTone: j['faceTone'] as String,
        hairColor: j['hairColor'] as String,
        accentColor: j['accentColor'] as String,
        faceShape: j['faceShape'] as String,
        hairStyle: j['hairStyle'] as String,
        eyeSpacing: j['eyeSpacing'] as int,
        glasses: j['glasses'] as bool,
        mouthCurve: j['mouthCurve'] as int,
      );
}

class Person {
  const Person({
    required this.id,
    required this.name,
    required this.factId,
    required this.face,
    required this.scripts,
  });

  final String id;
  final String name;
  final String factId;
  final FaceSpec face;

  /// Запись имени в нелатинских письменностях: подпись, а не ответ.
  final Map<String, String> scripts;

  /// Как имя показать на языке интерфейса. Для латиницы — `null`: вторая
  /// строка там повторяла бы первую.
  String? script(String locale) => scripts[locale];

  factory Person.fromJson(Map<String, dynamic> j) => Person(
        id: j['id'] as String,
        name: j['name'] as String,
        factId: j['factId'] as String,
        face: FaceSpec.fromJson(j['face'] as Map<String, dynamic>),
        scripts: ((j['scripts'] as Map?) ?? const {})
            .map((k, v) => MapEntry(k as String, v as String)),
      );
}

class NeutralFact {
  const NeutralFact({required this.id, required this.category, required this.text});

  final String id;
  final String category;
  final Map<String, String> text;

  factory NeutralFact.fromJson(Map<String, dynamic> j) => NeutralFact(
        id: j['id'] as String,
        category: j['category'] as String,
        text: (j['text'] as Map).map((k, v) => MapEntry(k as String, v as String)),
      );
}

class FacesNamesLibrary {
  FacesNamesLibrary({
    required this.people,
    required this.facts,
    this.strings = const {},
    this.portraits = const {},
  })  : _peopleById = {for (final p in people) p.id: p},
        _factsById = {for (final f in facts) f.id: f};

  final List<Person> people;
  final List<NeutralFact> facts;

  /// Подписи экрана на двенадцати языках — те же, что у веб-версии
  /// (`core/i18n.ts`). 🔴 Зашивать их в код нельзя: строка в экране знает ровно
  /// один язык, и кореец увидел бы русскую подпись посреди переведённого экрана.
  final Map<String, Map<String, String>> strings;

  /// Описание портрета для экранного диктора, собранное заранее на каждом языке.
  final Map<String, Map<String, String>> portraits;

  final Map<String, Person> _peopleById;
  final Map<String, NeutralFact> _factsById;

  /// Подпись по ключу. Нет перевода — берём английский, а не пустоту.
  String s(String locale, String key) =>
      strings[locale]?[key] ?? strings['en']?[key] ?? key;

  /// Подстановка `{имя}` — тем же правилом, что в вебе (`interpolateFacesNames`).
  String fill(String template, Map<String, Object> values) =>
      template.replaceAllMapped(RegExp(r'\{(\w+)\}'), (m) {
        final key = m.group(1)!;
        return values.containsKey(key) ? '${values[key]}' : m.group(0)!;
      });

  String portrait(String locale, String personId) =>
      portraits[locale]?[personId] ?? portraits['en']?[personId] ?? '';

  Person? person(String id) => _peopleById[id];
  NeutralFact? fact(String id) => _factsById[id];

  /// Текст факта на языке интерфейса; английский — запасной, пустоты не отдаём.
  String factText(String locale, String id) {
    final f = _factsById[id];
    if (f == null) return id;
    return f.text[locale] ?? f.text['en'] ?? id;
  }

  static FacesNamesLibrary fromJsonString(String source) {
    final j = jsonDecode(source) as Map<String, dynamic>;
    // ⚠️ В словаре игры есть и вложенные карты (формы лица, причёски) — экрану
    // они не нужны, и в плоский словарь подписей не попадают.
    Map<String, Map<String, String>> flat(Object? raw) => ((raw as Map?) ?? const {}).map(
          (locale, values) => MapEntry(
            locale as String,
            {
              for (final e in (values as Map).entries)
                if (e.value is String) e.key as String: e.value as String,
            },
          ),
        );
    return FacesNamesLibrary(
      people: [for (final p in j['people'] as List) Person.fromJson(p as Map<String, dynamic>)],
      facts: [for (final f in j['facts'] as List) NeutralFact.fromJson(f as Map<String, dynamic>)],
      strings: flat(j['strings']),
      portraits: flat(j['portraits']),
    );
  }
}

/* ─────────────────────────── расстояния ─────────────────────────── */

double faceDistance(Person left, Person right) {
  final a = left.face;
  final b = right.face;
  var distance = a.family == b.family ? 0.08 : 0.58;
  if (a.faceShape != b.faceShape) distance += 0.1;
  if (a.hairStyle != b.hairStyle) distance += 0.08;
  if (a.hairColor != b.hairColor) distance += 0.05;
  if (a.glasses != b.glasses) distance += 0.08;
  distance += math.min(0.06, (a.eyeSpacing - b.eyeSpacing).abs() * 0.015);
  distance += math.min(0.05, (a.mouthCurve - b.mouthCurve).abs() * 0.0125);
  return math.min(1, distance);
}

int levenshtein(String a, String b) {
  if (a == b) return 0;
  if (a.isEmpty) return b.length;
  if (b.isEmpty) return a.length;
  var previous = List<int>.generate(b.length + 1, (i) => i);
  for (var i = 1; i <= a.length; i += 1) {
    final current = <int>[i];
    for (var j = 1; j <= b.length; j += 1) {
      final cost = a.codeUnitAt(i - 1) == b.codeUnitAt(j - 1) ? 0 : 1;
      current.add(math.min(math.min(current[j - 1] + 1, previous[j] + 1), previous[j - 1] + cost));
    }
    previous = current;
  }
  return previous[b.length];
}

double nameDistance(Person left, Person right) {
  final a = left.name.toLowerCase();
  final b = right.name.toLowerCase();
  final edit = levenshtein(a, b) / math.max(math.max(a.length, b.length), 1);
  final initialPenalty = a[0] == b[0] ? 0.0 : 0.25;
  final lengthPenalty = math.min(0.2, (a.length - b.length).abs() * 0.05);
  return math.min(1, edit * 0.55 + initialPenalty + lengthPenalty);
}

double combinedPersonDistance(Person left, Person right) =>
    faceDistance(left, right) * 0.68 + nameDistance(left, right) * 0.32;

double factDistance(FacesNamesLibrary lib, String leftId, String rightId) {
  final left = lib.fact(leftId);
  final right = lib.fact(rightId);
  if (left == null || right == null) return 1;
  return left.category == right.category ? 0.2 : 0.9;
}

/* ─────────────────────────── расклад ─────────────────────────── */

class InterferencePrompt {
  const InterferencePrompt({
    required this.id,
    required this.left,
    required this.right,
    required this.answer,
    required this.options,
  });

  final String id;
  final int left;
  final int right;
  final int answer;
  final List<int> options;
}

class FacesNamesTrial {
  const FacesNamesTrial({
    required this.id,
    required this.targetPersonId,
    required this.recognitionPersonIds,
    required this.namePersonIds,
    required this.factIds,
  });

  final String id;
  final String targetPersonId;
  final List<String> recognitionPersonIds;
  final List<String> namePersonIds;
  final List<String> factIds;
}

class FacesNamesPuzzle {
  const FacesNamesPuzzle({
    required this.id,
    required this.seed,
    required this.level,
    required this.difficulty,
    required this.people,
    required this.studiedPersonIds,
    required this.trials,
    required this.interferencePrompts,
    required this.factRecallEnabled,
    required this.immediateRecall,
    required this.meanFaceSimilarity,
    required this.meanNameSimilarity,
    required this.meanRecognitionDistractorSimilarity,
  });

  final String id;
  final String seed;
  final int level;
  final int difficulty;

  /// Все, кто встретится на экране: изучаемые и все ложные варианты.
  final List<Person> people;
  final List<String> studiedPersonIds;
  final List<FacesNamesTrial> trials;
  final List<InterferencePrompt> interferencePrompts;
  final bool factRecallEnabled;
  final bool immediateRecall;
  final double meanFaceSimilarity;
  final double meanNameSimilarity;
  final double meanRecognitionDistractorSimilarity;

  Person? person(String id) {
    for (final p in people) {
      if (p.id == id) return p;
    }
    return null;
  }
}

int personCountForLevel(int level) => math.min(12, 2 + ((level - 1) ~/ 3));

double _clamp(double v, double min, double max) => math.min(max, math.max(min, v));

double _meanPairSimilarity(
  List<Person> people,
  double Function(Person, Person) distance,
) {
  var total = 0.0;
  var count = 0;
  for (var left = 0; left < people.length; left += 1) {
    for (var right = left + 1; right < people.length; right += 1) {
      total += 1 - distance(people[left], people[right]);
      count += 1;
    }
  }
  return count == 0 ? 0 : roundNumber(total / count);
}

List<Person> _chooseStudiedPeople(
  Rng rng,
  FacesNamesLibrary lib,
  int count,
  double closeness,
) {
  final shuffled = shuffle(rng, lib.people);
  final chosen = <Person>[shuffled.first];
  final remaining = shuffled.sublist(1);
  while (chosen.length < count) {
    var bestIndex = 0;
    var bestScore = double.infinity;
    for (var index = 0; index < remaining.length; index += 1) {
      final candidate = remaining[index];
      var minimumDistance = double.infinity;
      for (final person in chosen) {
        final d = combinedPersonDistance(person, candidate);
        if (d < minimumDistance) minimumDistance = d;
      }
      final desiredDistance = 0.9 - closeness * 0.74;
      final score = (minimumDistance - desiredDistance).abs() + rng() * 0.005;
      if (score < bestScore) {
        bestIndex = index;
        bestScore = score;
      }
    }
    chosen.add(remaining.removeAt(bestIndex));
  }
  return chosen;
}

List<Person> _chooseControlledPeople(
  Rng rng,
  Person target,
  List<Person> candidates,
  int count,
  double closeness,
  double Function(Person, Person) distance,
) {
  final desiredDistance = 0.88 - closeness * 0.72;
  final sorted = _stableSortBy(
    shuffle(rng, candidates),
    (Person p) => (distance(target, p) - desiredDistance).abs(),
  );
  return sorted.take(count).toList();
}

List<String> _chooseControlledFacts(
  Rng rng,
  FacesNamesLibrary lib,
  String targetFactId,
  int count,
  double closeness,
) {
  final desiredDistance = closeness >= 0.5 ? 0.2 : 0.9;
  final pool = lib.facts.where((f) => f.id != targetFactId).toList();
  final sorted = _stableSortBy(
    shuffle(rng, pool),
    (NeutralFact f) => (factDistance(lib, targetFactId, f.id) - desiredDistance).abs(),
  );
  return [for (final f in sorted.take(count)) f.id];
}

List<InterferencePrompt> _createInterferencePrompts(Rng rng, int count) {
  return [
    for (var index = 0; index < count; index += 1) _interferencePrompt(rng, index),
  ];
}

InterferencePrompt _interferencePrompt(Rng rng, int index) {
  final left = randomInt(rng, 1, 9);
  final right = randomInt(rng, 1, 9);
  final answer = left + right;
  // Порядок вставки сохраняется — как у Set в JS, откуда варианты и берутся.
  final options = <int>{answer};
  while (options.length < 3) {
    final offset = randomInt(rng, 1, 3) * (rng() < 0.5 ? -1 : 1);
    options.add(math.max(1, answer + offset));
  }
  return InterferencePrompt(
    id: 'interference-$index',
    left: left,
    right: right,
    answer: answer,
    options: shuffle(rng, options.toList()),
  );
}

FacesNamesPuzzle generateFacesNamesPuzzle(
  FacesNamesLibrary lib,
  String seed,
  int requestedLevel,
) {
  final normalizedSeed = normalizeSeed(seed, 'faces-names');
  final level = math.max(1, requestedLevel.floor());
  final rng = createRng('$normalizedSeed:$level:$facesNamesGeneratorVersion');
  final closeness = _clamp((level - 1) / 32, 0, 1);
  final studiedPeople = _chooseStudiedPeople(rng, lib, personCountForLevel(level), closeness);
  final studiedIds = {for (final p in studiedPeople) p.id};
  final recognitionOptionCount = math.min(4, 2 + ((level - 1) ~/ 8));
  final nameOptionCount = recognitionOptionCount;
  final factRecallEnabled = level >= 8;
  final immediateRecall = level <= 4;
  final trialTargets = level >= 5 ? shuffle(rng, studiedPeople) : [...studiedPeople];
  final peopleById = <String, Person>{for (final p in studiedPeople) p.id: p};
  var recognitionSimilarityTotal = 0.0;
  var recognitionDistractorCount = 0;

  final trials = <FacesNamesTrial>[];
  for (var index = 0; index < trialTargets.length; index += 1) {
    final target = trialTargets[index];
    final recognitionDistractors = _chooseControlledPeople(
      rng,
      target,
      lib.people.where((p) => !studiedIds.contains(p.id)).toList(),
      recognitionOptionCount - 1,
      closeness,
      faceDistance,
    );
    final nameDistractors = _chooseControlledPeople(
      rng,
      target,
      lib.people.where((p) => p.id != target.id).toList(),
      nameOptionCount - 1,
      closeness,
      nameDistance,
    );
    for (final person in [...recognitionDistractors, ...nameDistractors]) {
      peopleById[person.id] = person;
    }
    for (final distractor in recognitionDistractors) {
      recognitionSimilarityTotal += 1 - faceDistance(target, distractor);
      recognitionDistractorCount += 1;
    }
    final factIds = factRecallEnabled
        ? shuffle(rng, <String>[
            target.factId,
            ..._chooseControlledFacts(rng, lib, target.factId, nameOptionCount - 1, closeness),
          ])
        : <String>[];
    trials.add(FacesNamesTrial(
      id: 'trial-$index',
      targetPersonId: target.id,
      recognitionPersonIds:
          shuffle(rng, <String>[target.id, ...recognitionDistractors.map((p) => p.id)]),
      namePersonIds: shuffle(rng, <String>[target.id, ...nameDistractors.map((p) => p.id)]),
      factIds: factIds,
    ));
  }

  final interferenceCount = immediateRecall ? 1 : math.min(6, 2 + ((level - 5) ~/ 7));
  final meanFaceSimilarity = _meanPairSimilarity(studiedPeople, faceDistance);
  final meanNameSimilarity = _meanPairSimilarity(studiedPeople, nameDistance);
  final meanRecognitionDistractorSimilarity = recognitionDistractorCount == 0
      ? 0.0
      : roundNumber(recognitionSimilarityTotal / recognitionDistractorCount);
  final difficulty = _clamp(
    jsRound(5 +
            studiedPeople.length * 4 +
            interferenceCount * 3 +
            recognitionOptionCount * 3 +
            meanFaceSimilarity * 14 +
            meanNameSimilarity * 10 +
            meanRecognitionDistractorSimilarity * 12 +
            (factRecallEnabled ? 10 : 0) +
            (immediateRecall ? 0 : 5))
        .toDouble(),
    1,
    100,
  ).round();

  return FacesNamesPuzzle(
    id: 'faces-names:$normalizedSeed:$level',
    seed: normalizedSeed,
    level: level,
    difficulty: difficulty,
    people: peopleById.values.toList(),
    studiedPersonIds: [for (final p in studiedPeople) p.id],
    trials: trials,
    // ⚠️ ПОСЛЕДНИМ — как в TS: помехи берут случайность ПОСЛЕ всех разборов,
    // и любой другой порядок сдвинет всю партию на том же seed.
    interferencePrompts: _createInterferencePrompts(rng, interferenceCount),
    factRecallEnabled: factRecallEnabled,
    immediateRecall: immediateRecall,
    meanFaceSimilarity: meanFaceSimilarity,
    meanNameSimilarity: meanNameSimilarity,
    meanRecognitionDistractorSimilarity: meanRecognitionDistractorSimilarity,
  );
}

/* ─────────────────────────── партия ─────────────────────────── */

enum FacesNamesPhase { rules, study, interference, recognition, nameRecall, factRecall, paused, result, disposed }

/// Имена фаз — те же строки, что в вебе: по ним сверяется эталон.
const Map<FacesNamesPhase, String> facesNamesPhaseNames = {
  FacesNamesPhase.rules: 'rules',
  FacesNamesPhase.study: 'study',
  FacesNamesPhase.interference: 'interference',
  FacesNamesPhase.recognition: 'recognition',
  FacesNamesPhase.nameRecall: 'name-recall',
  FacesNamesPhase.factRecall: 'fact-recall',
  FacesNamesPhase.paused: 'paused',
  FacesNamesPhase.result: 'result',
  FacesNamesPhase.disposed: 'disposed',
};

class RecallAnswer {
  RecallAnswer({
    required this.trialId,
    required this.targetPersonId,
    required this.recognizedPersonId,
    required this.recognitionCorrect,
    this.selectedNamePersonId,
    this.nameCorrect,
    this.selectedFactId,
    this.factCorrect,
  });

  final String trialId;
  final String targetPersonId;
  final String recognizedPersonId;
  final bool recognitionCorrect;
  String? selectedNamePersonId;
  bool? nameCorrect;
  String? selectedFactId;
  bool? factCorrect;
}

class FacesNamesMetrics {
  const FacesNamesMetrics({
    required this.accuracy,
    required this.durationMs,
    required this.difficulty,
    required this.errors,
    required this.score,
    required this.seed,
    required this.level,
    required this.personCount,
    required this.faceRecognitionCorrect,
    required this.faceRecognitionTotal,
    required this.faceRecognitionAccuracy,
    required this.nameRecallCorrect,
    required this.nameRecallTotal,
    required this.nameRecallAccuracy,
    required this.factRecallCorrect,
    required this.factRecallTotal,
    required this.factRecallAccuracy,
    required this.interferenceRounds,
    required this.interferenceCorrect,
    required this.invalidInteractions,
  });

  final double accuracy;
  final int durationMs;
  final int difficulty;
  final int errors;
  final int score;
  final String seed;
  final int level;
  final int personCount;
  final int faceRecognitionCorrect;
  final int faceRecognitionTotal;
  final double faceRecognitionAccuracy;
  final int nameRecallCorrect;
  final int nameRecallTotal;
  final double nameRecallAccuracy;
  final int factRecallCorrect;
  final int factRecallTotal;
  final double? factRecallAccuracy;
  final int interferenceRounds;
  final int interferenceCorrect;
  final int invalidInteractions;

  /// Порог прохождения тот же, что в вебе: сильная половина не должна прятать
  /// рухнувшую связку «лицо → имя», поэтому у каждой своя планка.
  bool get passed =>
      accuracy >= 0.75 &&
      faceRecognitionAccuracy >= 0.6 &&
      nameRecallAccuracy >= 0.6 &&
      (factRecallAccuracy == null || factRecallAccuracy! >= 0.5);
}

/// Партия. Изменяемая: экран держит один объект и двигает его нажатиями —
/// в вебе на каждый шаг создавался новый, но там это требование React.
class FacesNamesSession {
  FacesNamesSession({required this.puzzle, required this.level, required this.seed});

  final FacesNamesPuzzle puzzle;
  final int level;
  final String seed;

  FacesNamesPhase phase = FacesNamesPhase.rules;
  FacesNamesPhase? pausedFrom;
  int studyIndex = 0;
  int interferenceIndex = 0;
  int trialIndex = 0;
  final List<RecallAnswer> answers = [];
  int interferenceCorrect = 0;
  int invalidInteractions = 0;
  int? startedAt;
  int? pauseStartedAt;
  int pausedMs = 0;
  FacesNamesMetrics? result;

  static FacesNamesSession create(FacesNamesLibrary lib, String seed, int level) {
    final safeLevel = math.max(1, level);
    return FacesNamesSession(
      puzzle: generateFacesNamesPuzzle(lib, seed, safeLevel),
      level: safeLevel,
      seed: seed,
    );
  }

  Person? get currentStudied {
    if (studyIndex >= puzzle.studiedPersonIds.length) return null;
    return puzzle.person(puzzle.studiedPersonIds[studyIndex]);
  }

  InterferencePrompt? get currentPrompt =>
      interferenceIndex < puzzle.interferencePrompts.length
          ? puzzle.interferencePrompts[interferenceIndex]
          : null;

  FacesNamesTrial? get currentTrial =>
      trialIndex < puzzle.trials.length ? puzzle.trials[trialIndex] : null;

  bool get isActive => const {
        FacesNamesPhase.study,
        FacesNamesPhase.interference,
        FacesNamesPhase.recognition,
        FacesNamesPhase.nameRecall,
        FacesNamesPhase.factRecall,
      }.contains(phase);

  void _freshRound(int now) {
    phase = FacesNamesPhase.study;
    pausedFrom = null;
    studyIndex = 0;
    interferenceIndex = 0;
    trialIndex = 0;
    answers.clear();
    interferenceCorrect = 0;
    invalidInteractions = 0;
    startedAt = now;
    pauseStartedAt = null;
    pausedMs = 0;
    result = null;
  }

  void start(int now) {
    if (phase != FacesNamesPhase.rules) return;
    _freshRound(now);
  }

  void restart(int now) => _freshRound(now);

  void advanceStudy() {
    if (phase != FacesNamesPhase.study) return;
    if (studyIndex + 1 < puzzle.studiedPersonIds.length) {
      studyIndex += 1;
      return;
    }
    phase = FacesNamesPhase.interference;
    interferenceIndex = 0;
  }

  void answerInterference(int selected) {
    if (phase != FacesNamesPhase.interference) return;
    final prompt = currentPrompt;
    if (prompt == null || !prompt.options.contains(selected)) {
      invalidInteractions += 1;
      return;
    }
    if (selected == prompt.answer) interferenceCorrect += 1;
    if (interferenceIndex + 1 < puzzle.interferencePrompts.length) {
      interferenceIndex += 1;
      return;
    }
    phase = FacesNamesPhase.recognition;
    trialIndex = 0;
  }

  void selectRecognizedFace(String personId) {
    if (phase != FacesNamesPhase.recognition) return;
    final trial = currentTrial;
    if (trial == null || !trial.recognitionPersonIds.contains(personId)) {
      invalidInteractions += 1;
      return;
    }
    answers.add(RecallAnswer(
      trialId: trial.id,
      targetPersonId: trial.targetPersonId,
      recognizedPersonId: personId,
      recognitionCorrect: personId == trial.targetPersonId,
    ));
    phase = FacesNamesPhase.nameRecall;
  }

  void selectRecalledName(String personId, int now) {
    if (phase != FacesNamesPhase.nameRecall) return;
    final trial = currentTrial;
    final answer = answers.isEmpty ? null : answers.last;
    if (trial == null ||
        answer == null ||
        answer.trialId != trial.id ||
        !trial.namePersonIds.contains(personId)) {
      invalidInteractions += 1;
      return;
    }
    answer.selectedNamePersonId = personId;
    answer.nameCorrect = personId == trial.targetPersonId;
    if (puzzle.factRecallEnabled) {
      phase = FacesNamesPhase.factRecall;
      return;
    }
    _finishOrAdvance(now);
  }

  void selectRecalledFact(String factId, int now) {
    if (phase != FacesNamesPhase.factRecall) return;
    final trial = currentTrial;
    final target = trial == null ? null : puzzle.person(trial.targetPersonId);
    final answer = answers.isEmpty ? null : answers.last;
    if (trial == null ||
        target == null ||
        answer == null ||
        answer.trialId != trial.id ||
        !trial.factIds.contains(factId)) {
      invalidInteractions += 1;
      return;
    }
    answer.selectedFactId = factId;
    answer.factCorrect = factId == target.factId;
    _finishOrAdvance(now);
  }

  void _finishOrAdvance(int now) {
    if (trialIndex + 1 < puzzle.trials.length) {
      trialIndex += 1;
      phase = FacesNamesPhase.recognition;
      return;
    }
    final started = startedAt ?? now;
    phase = FacesNamesPhase.result;
    result = scoreFacesNames(
      puzzle,
      answers,
      durationMs: math.max(0, now - started - pausedMs),
      interferenceCorrect: interferenceCorrect,
      invalidInteractions: invalidInteractions,
    );
  }

  void pause(int now) {
    if (!isActive) return;
    pausedFrom = phase;
    phase = FacesNamesPhase.paused;
    pauseStartedAt = now;
  }

  void resume(int now) {
    if (phase != FacesNamesPhase.paused || pausedFrom == null) return;
    final pausedDuration = pauseStartedAt == null ? 0 : math.max(0, now - pauseStartedAt!);
    phase = pausedFrom!;
    pausedFrom = null;
    pauseStartedAt = null;
    pausedMs += pausedDuration;
  }
}

FacesNamesMetrics scoreFacesNames(
  FacesNamesPuzzle puzzle,
  List<RecallAnswer> answers, {
  required int durationMs,
  required int interferenceCorrect,
  required int invalidInteractions,
}) {
  final faceRecognitionCorrect = answers.where((a) => a.recognitionCorrect).length;
  final nameRecallCorrect = answers.where((a) => a.nameCorrect == true).length;
  final factAnswers = answers.where((a) => a.factCorrect != null).toList();
  final factRecallCorrect = factAnswers.where((a) => a.factCorrect == true).length;
  final faceRecognitionTotal = answers.length;
  final nameRecallTotal = answers.length;
  final factRecallTotal = factAnswers.length;
  final faceRecognitionAccuracy =
      faceRecognitionTotal == 0 ? 0.0 : faceRecognitionCorrect / faceRecognitionTotal;
  final nameRecallAccuracy = nameRecallTotal == 0 ? 0.0 : nameRecallCorrect / nameRecallTotal;
  final double? factRecallAccuracy =
      factRecallTotal == 0 ? null : factRecallCorrect / factRecallTotal;
  final components = <double>[faceRecognitionAccuracy, nameRecallAccuracy];
  if (factRecallAccuracy != null) components.add(factRecallAccuracy);
  final accuracy = _clamp(
    components.reduce((a, b) => a + b) / math.max(1, components.length),
    0,
    1,
  );
  final wrongRecall = (faceRecognitionTotal - faceRecognitionCorrect) +
      (nameRecallTotal - nameRecallCorrect) +
      (factRecallTotal - factRecallCorrect);
  return FacesNamesMetrics(
    accuracy: roundNumber(accuracy),
    durationMs: math.max(0, jsRound(durationMs.toDouble()).toInt()),
    difficulty: puzzle.difficulty,
    errors: wrongRecall + invalidInteractions,
    score: jsRound(accuracy * 100).toInt(),
    seed: puzzle.seed,
    level: puzzle.level,
    personCount: puzzle.studiedPersonIds.length,
    faceRecognitionCorrect: faceRecognitionCorrect,
    faceRecognitionTotal: faceRecognitionTotal,
    faceRecognitionAccuracy: roundNumber(faceRecognitionAccuracy),
    nameRecallCorrect: nameRecallCorrect,
    nameRecallTotal: nameRecallTotal,
    nameRecallAccuracy: roundNumber(nameRecallAccuracy),
    factRecallCorrect: factRecallCorrect,
    factRecallTotal: factRecallTotal,
    factRecallAccuracy: factRecallAccuracy == null ? null : roundNumber(factRecallAccuracy),
    interferenceRounds: puzzle.interferencePrompts.length,
    interferenceCorrect:
        math.max(0, math.min(puzzle.interferencePrompts.length, interferenceCorrect)),
    invalidInteractions: invalidInteractions,
  );
}
