/// УРОВЕНЬ РАННЕРА «ПОИСКА»: главы, станции на дороге, проход порогом.
///
/// Схема: `~/dev/psygames/search-chat/SPEC_RUNNER_SEARCH.md` (решения Дениса 30.09.2026 —
/// Flutter, порог 70 % сразу, трекер в первом заходе, босс — общий BossRound).
///
/// 🔴 ВАЛЮТА — НАХОДКА, А НЕ ЧИСЛО. У «Числового забега» станции сводятся к числу, которое
/// растёт или падает. Здесь каждая станция — вопрос «который из трёх», ответ — въехать в арку.
/// Смерти нет: промах только не засчитывается; уровень проигрывается порогом в конце.
///
/// 🔴 СТАНЦИИ НЕ ПИШУТ СВОИХ ГЕНЕРАТОРОВ. Раздачу даёт то же ядро, что у упражнения, — уже
/// перенесённое и сверенное с вебом: ворота по счёту — `schulteSequence` (прямой и обратный
/// ход, буквы, чередование Горбова — ось даром), три окна — `vsMakeBoard` в каждой арке,
/// метки в пути — раунд и физика трекера. Уровень упражнения берётся из уровня раннера,
/// как `stationLevel` «Числового забега»: первая встреча со станцией — первый уровень упражнения.
///
/// План станций и раскладка их по рядам — перенос `stationPlan`/`layout` из
/// `frontend/src/games/number-run/runner-level.mjs`: тот же порядок ввода глав.
library;

import 'dart:math' as math;

import '../../shell/js_compat.dart';
import '../object_tracker/model.dart' as tracker;
import '../schulte/model.dart' as schulte;
import '../visual_search/model.dart';
import 'road.dart';

enum SearchStation { gates, windows, tracker }

class SearchChapter {
  const SearchChapter(this.from, this.station);
  final int from;
  final SearchStation station;
}

/// С какого уровня входит станция (схема §3). Трекер — последней главой: единственная
/// станция с памятью во времени. Остальные пять станций схемы войдут следующими заходами.
const List<SearchChapter> searchChapters = [
  SearchChapter(4, SearchStation.gates),
  SearchChapter(7, SearchStation.windows),
  SearchChapter(10, SearchStation.tracker),
];

/// С какого уровня все введённые станции идут вперемешку — через главу после последней.
int get searchMixFrom => searchChapters.last.from + 3;

/// Рядов на уровне. Первый и последний — всегда звезда: разгон и финиш.
const int searchLevelSlots = 15;

/// Расстояние между рядами, единиц дороги; при скорости 8 — 4 секунды на ряд.
const double searchRowGap = 32;
const double searchSpeed = 8;
const double searchLateralSpeed = 4;

/// Порог прохода — решение Дениса 30.09.2026: 70 % сразу.
const double searchPassShare = 0.7;

/// Слежение: показ целей перед движением и запас на решение после остановки.
const int trackerFlashMs = 1500;
const int trackerDecideMs = 2000;

SearchChapter _chapterOf(SearchStation s) => searchChapters.firstWhere((c) => c.station == s);

/// Уровень упражнения на станции: первая встреча — первый уровень упражнения.
int searchStationLevel(SearchStation s, int level) => math.max(1, level - (_chapterOf(s).from - 1));

/// Станции уровня по порядку — перенос `stationPlan`: первый уровень главы — три новых;
/// второй и третий — четыре новых и одна прежняя; смесь — шесть вперемешку из всех введённых.
List<SearchStation> searchStationPlan(int level) {
  final known = [for (final c in searchChapters) if (level >= c.from) c.station];
  if (known.isEmpty) return const [];
  if (level >= searchMixFrom) {
    return [for (var i = 0; i < 6; i += 1) known[(i + level) % known.length]];
  }
  final chapter = searchChapters.lastWhere((c) => level >= c.from);
  final older = known.where((s) => s != chapter.station).toList();
  if (level == chapter.from) return List.filled(3, chapter.station);
  return older.isNotEmpty
      ? [chapter.station, chapter.station, older.first, chapter.station, chapter.station]
      : List.filled(4, chapter.station);
}

/// Первый уровень главы — обучающий (схема §8): в порог идут и звёзды, а не только станции.
bool searchIntroLevel(int level) => searchChapters.any((c) => c.from == level);

// ───────────────────────────────── Ряды ─────────────────────────────────

/// Что стоит на ряду. Верная полоса — `answer` (с нуля: 0 — левая).
sealed class SearchRow {
  const SearchRow(this.answer);
  final int answer;

  /// Засчитывается ли ряд станцией (звёзды — нет, кроме обучающего уровня).
  bool get isStation;
}

/// Звезда на одной из полос — управление и сбор.
class TokenRow extends SearchRow {
  const TokenRow(super.answer, {this.trackerStart = false});

  /// С этой звезды начинается слежение (станция «метки в пути»).
  final bool trackerStart;

  @override
  bool get isStation => false;
}

/// Ворота по счёту: над дорогой — два последних знака ряда, в арках — три кандидата.
class GatesRow extends SearchRow {
  const GatesRow(super.answer, {required this.shown, required this.arches, required this.colors, required this.level});

  /// Два последних знака: по ним видно и направление, и чередование Горбова.
  final List<String> shown;
  final List<String> arches;

  /// Цвет знака в арке — помеха с 8-го уровня Шульте; `null` — без цвета.
  final List<int?> colors;
  final int level;

  @override
  bool get isStation => true;
}

/// Три окна: в каждой арке горсть фигур, цель — ровно в одной.
class WindowsRow extends SearchRow {
  const WindowsRow(super.answer, {required this.target, required this.arches, required this.level});

  final VsTarget target;

  /// Фигуры арки в долях её окна (0…1 по ширине, 0…0,75 по высоте).
  final List<List<VsItem>> arches;
  final int level;

  @override
  bool get isStation => true;
}

/// Метки в пути: на вывеске двигались фигуры; в конце три из них в цветных кольцах —
/// кольцо цели указывает арку.
class TrackerRow extends SearchRow {
  const TrackerRow(super.answer, {required this.round, required this.ringed, required this.startZ});

  final tracker.ObjectTrackerRound round;

  /// Три фигуры в кольцах: индекс — полоса (0 — левая).
  final List<String> ringed;

  /// Где начинается слежение (ряд со звездой-стартом).
  final double startZ;

  @override
  bool get isStation => true;
}

class SearchLevel {
  const SearchLevel({required this.level, required this.seed, required this.course, required this.rows});

  final int level;
  final int seed;
  final RoadCourse course;
  final List<SearchRow> rows;

  /// Сколько рядов идёт в порог: станции, а на уровне без станций и на обучающем — всё.
  List<int> get scored {
    final stations = [for (var i = 0; i < rows.length; i += 1) if (rows[i].isStation) i];
    if (stations.isEmpty || searchIntroLevel(level)) return [for (var i = 0; i < rows.length; i += 1) i];
    return stations;
  }

  /// Сколько надо найти, чтобы пройти: не меньше 70 % засчитываемых рядов.
  int get needed => (scored.length * searchPassShare - 1e-9).ceil();

  /// Прошёл ли уровень тот, кто ответил на рядах [answers] (по id ряда — верно ли).
  bool passed(Map<int, bool> answers) => found(answers) >= needed;

  int found(Map<int, bool> answers) => scored.where((i) => answers[i] == true).length;
}

// ─────────────────────────────── Раздача ───────────────────────────────

/// Места станций среди рядов: блоками, равномерно, не первым рядом и не последним —
/// перенос `layout`. Трекер — блок из трёх: старт, ряд дороги, ответ.
Map<int, String> _layout(List<SearchStation> stations) {
  final blocks = [
    for (final s in stations)
      s == SearchStation.tracker ? ['tracker-start', null, 'tracker'] : [s.name],
  ];
  const inner = searchLevelSlots - 2;
  var free = math.max(0, inner - blocks.fold<int>(0, (a, b) => a + b.length));
  var slot = 1;
  final at = <int, String>{};
  for (var i = 0; i < blocks.length; i += 1) {
    final gap = free ~/ (blocks.length - i + 1);
    slot += gap;
    free -= gap;
    for (var j = 0; j < blocks[i].length; j += 1) {
      final e = blocks[i][j];
      if (e != null) at[slot + j] = e;
    }
    slot += blocks[i].length;
  }
  return at;
}

/// Письменность ворот — как у Шульте: у русского языка кириллица без Й, Ъ, Ы, Ь, иначе латиница.
/// Кириллица собрана из КОДОВ знаков, а не строкой: это данные ряда, а не подпись, и
/// храповик зашитого текста (`test/ui_text_debt_does_not_grow_test.dart`) их не касается.
String searchAlphabet(String locale) => locale.startsWith('ru')
    ? String.fromCharCodes([
        for (var c = 0x410; c <= 0x42F; c += 1)
          if (!const {0x419, 0x42A, 0x42B, 0x42C}.contains(c)) c,
      ])
    : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

GatesRow _gates(int level, Rng rnd, String alphabet) {
  final p = schulte.LevelParams.of(level);
  final seq = schulte.schulteSequence(
    size: p.gridSize,
    contentMode: p.contentMode,
    direction: p.direction,
    alphabet: alphabet,
    lettersFirst: p.surpriseStart && rnd() < 0.5,
  ).sequence.map((c) => '$c').toList();
  // Позиция: есть и два показанных знака, и следующий за ними.
  final at = 1 + (rnd() * (seq.length - 2)).floor();
  final answerSym = seq[at + 1];
  // Теснота: на первых ступенях помехи далеко по ряду, дальше — соседи (следующий через
  // один, предыдущий). У Горбова сосед через один — число после числа: соблазн «по привычке».
  final near = [at + 2, at + 3, at - 1].where((i) => i >= 0 && i < seq.length).toList();
  final far = [for (var i = 0; i < seq.length; i += 1) if ((i - (at + 1)).abs() >= 4 && i != at) i];
  final nearCount = level <= 3 ? 0 : level <= 8 ? 1 : 2;
  final picks = <int>[];
  for (final i in shuffle(rnd, near)) {
    if (picks.length >= nearCount) break;
    picks.add(i);
  }
  for (final i in shuffle(rnd, far.isEmpty ? near : far)) {
    if (picks.length >= 2) break;
    if (!picks.contains(i)) picks.add(i);
  }
  final answer = (rnd() * 3).floor();
  final distractors = [for (final i in picks) seq[i]];
  final arches = <String>[];
  var d = 0;
  for (var lane = 0; lane < 3; lane += 1) {
    arches.add(lane == answer ? answerSym : distractors[d++]);
  }
  final colors = [for (var lane = 0; lane < 3; lane += 1) p.colorMode ? (rnd() * 4).floor() : null];
  return GatesRow(answer, shown: [seq[at - 1], seq[at]], arches: arches, colors: colors, level: level);
}

WindowsRow _windows(int level, Rng rnd) {
  final cfg = vsLevelParams(level, 1);
  // Горсть в арке — шестая часть поля упражнения: теснота растёт вместе с ним.
  final k = math.max(3, math.min(9, (cfg.count / 6).round()));
  final target = vsPickTarget(cfg.conjunction, vsColors, rnd);
  final answer = (rnd() * 3).floor();
  final arches = [
    for (var lane = 0; lane < 3; lane += 1)
      vsMakeBoard(
        count: k,
        targetShape: target.shape,
        targetColor: target.color,
        targetCount: lane == answer ? 1 : 0,
        conjunction: cfg.conjunction,
        w: 1,
        h: 0.75,
        rnd: rnd,
        // Приманка (как цель, но с точкой) — только в чужих арках: цель ею не бывает.
        decoyCount: lane != answer && cfg.decoys > 0 ? 1 : 0,
      ),
  ];
  return WindowsRow(answer, target: target, arches: arches, level: level);
}

TrackerRow _tracker(int level, int seed, int rowId, double startZ, Rng rnd) {
  final round = tracker.generateObjectTrackerRound('runner-$seed-$rowId', math.min(tracker.trackerLevels, level));
  final ids = round.initialWorld.objects.map((o) => o.id).toList();
  final targets = shuffle(rnd, round.targetIds);
  final others = shuffle(rnd, ids.where((id) => !round.targetIds.contains(id)).toList());
  final answer = (rnd() * 3).floor();
  final ringed = <String>[];
  var o = 0;
  for (var lane = 0; lane < 3; lane += 1) {
    ringed.add(lane == answer ? targets.first : others[o++]);
  }
  return TrackerRow(answer, round: round, ringed: ringed, startZ: startZ);
}

/// Уровень целиком. Ряды, где верная полоса совпала бы у «стоящего на месте» настолько,
/// что он проходит, перебрасываются солью — как `makeLevel` «Числового забега».
SearchLevel makeSearchLevel(int level, int seed, {String? alphabet}) {
  if (level < 1) throw ArgumentError('Invalid level');
  for (var salt = 0; salt < 16; salt += 1) {
    final built = _build(level, seed, salt, alphabet ?? searchAlphabet('ru'));
    final standing = [-1, 0, 1].any((lane) => built.passed({
          for (var i = 0; i < built.rows.length; i += 1) i: built.rows[i].answer == lane + 1,
        }));
    if (!standing) return built;
  }
  throw StateError('No playable level: $level/$seed');
}

SearchLevel _build(int level, int seed, int salt, String alphabet) {
  final rnd = createRng('search-runner:$level:$seed:$salt');
  final at = _layout(searchStationPlan(level));
  final rows = <SearchRow>[];
  final roads = <RoadRow>[];
  var z = 0.0;
  var trackerStartZ = 0.0;
  for (var i = 0; i < searchLevelSlots; i += 1) {
    final kind = at[i];
    // Перед ответом трекера дорога длиннее, если движение не укладывается в два ряда.
    var gap = searchRowGap;
    SearchRow row;
    switch (kind) {
      case 'gates':
        row = _gates(searchStationLevel(SearchStation.gates, level), rnd, alphabet);
      case 'windows':
        row = _windows(searchStationLevel(SearchStation.windows, level), rnd);
      case 'tracker-start':
        row = TokenRow((rnd() * 3).floor(), trackerStart: true);
      case 'tracker':
        final t = _tracker(searchStationLevel(SearchStation.tracker, level), seed, i, trackerStartZ, rnd);
        final needZ = trackerStartZ +
            searchSpeed * (trackerFlashMs + t.round.durationMs + trackerDecideMs) / 1000;
        gap = math.max(searchRowGap, needZ - z);
        row = t;
      default:
        row = TokenRow((rnd() * 3).floor());
    }
    z += gap;
    if (row is TokenRow && row.trackerStart) trackerStartZ = z;
    rows.add(row);
    roads.add(RoadRow(id: i, z: z, correct: row.answer, options: const ['L', 'M', 'R'], payload: row));
  }
  final course = RoadCourse(
    levelId: level,
    seed: seed,
    rows: roads,
    speed: searchSpeed,
    lateralSpeed: searchLateralSpeed,
  );
  return SearchLevel(level: level, seed: seed, course: course, rows: rows);
}
