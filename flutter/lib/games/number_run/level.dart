/// УРОВНИ «ЧИСЛОВОГО ЗАБЕГА» — перенос `runner-level.mjs` (VER 3).
///
/// Уровень ≈ 90 с: 15 рядов содержимого между 14 препятствиями и черта финиша. Финал —
/// лестница 10 стен (пройден при ≥ 5) или «Страж» на уровне-боссе (пройден, если число не
/// меньше стража). Главы вводят станции хаба «Счёт» по одной: 1–3 дорога · 4–6 + блиц-арки ·
/// 7–9 + ворота «ровно N» · 10–12 + ряд на арках · 13–15 + шкала · 16–18 + память в пути ·
/// 19+ смесь (схема `~/dev/psygames/counting-chat/SPEC_RUNNER_HUB_STATIONS.md`).
///
/// 🔴 ЗАДАЧИ СТАНЦИЙ — ГЕНЕРАТОРЫ САМИХ УПРАЖНЕНИЙ, уже перенесённые на Dart: блиц берёт пример у
/// «Мат. спринта», ворота — у «Состава числа», ряд — у «Паттернов», шкала — у «Мат. шкалы»,
/// память — лестницу OSpan. Вторая арифметика в раннере разошлась бы с упражнениями молча.
library;

import 'dart:math' as math;

import '../../shell/js_compat.dart' show Rng, jsImul;
import '../math_slider/model.dart' as slider;
import '../math_sprint/model.dart' as sprint;
import '../number_bonds/model.dart' as bonds;
import '../ospan/model.dart' as ospan;
import '../pattern/model.dart' as pattern;
import '../runner/road.dart';
import '../runner/shapes.dart';
import '../runner/solver.dart';
import 'campaign.dart';

const String levelVersion = 'number-run-level/3';
const int levelSlots = 15;
const int passWalls = 5;
const double bossShare = .6;

/// Каждый третий уровень — «Страж» (канон `constants/bosses.ts`: BOSS_EVERY = 3).
bool isBossLevel(int level) => level % 3 == 0;

class Chapter {
  const Chapter(this.from, this.station);
  final int from;
  final String station;
}

/// С какого уровня входит станция.
const List<Chapter> chapters = [
  Chapter(4, 'blitz'),
  Chapter(7, 'exact'),
  Chapter(10, 'pattern'),
  Chapter(13, 'scale'),
  Chapter(16, 'memory'),
];

/// С какого уровня все введённые станции идут вперемешку: через главу после последней.
final int mixFrom = chapters.last.from + 3;

const List<String> _shapes = ['snake', 'grid', 'columns', 'ramp', 'line', 'walls'];
const List<String> _obstacles = [
  'bridge', 'jump', 'block', 'gap', 'jump', 'bridge', 'bridge', //
  'jump', 'block', 'gap', 'jump', 'bridge', 'jump', 'bridge',
];

/// Уровень станции от уровня забега: первая встреча со станцией — первый уровень её упражнения.
int stationLevel(String station, int level) =>
    math.max(1, level - (chapters.firstWhere((c) => c.station == station).from - 1));

/// Станции уровня по порядку. Первый уровень главы — три новых; второй — четыре новых и одна
/// прежняя; страж и уровни смеси — шесть вперемешку из всех введённых.
List<String> stationPlan(int level, bool boss) {
  final known = [
    for (final c in chapters)
      if (level >= c.from) c.station,
  ];
  if (known.isEmpty) return const [];
  if (boss || level >= mixFrom) return [for (var i = 0; i < 6; i++) known[(i + level) % known.length]];
  final chapter = chapters.where((c) => level >= c.from).last;
  final older = known.where((s) => s != chapter.station).toList();
  if (level == chapter.from) return List.filled(3, chapter.station);
  return older.isNotEmpty
      ? [chapter.station, chapter.station, older[0], chapter.station, chapter.station]
      : List.filled(4, chapter.station);
}

/// Места станций среди 15 рядов: блоками, равномерно, не первым рядом и не последним.
/// Память — блок из трёх: показ, ряд дороги между, вспомнить.
Map<int, String> _layout(List<String> stations) {
  final blocks = [
    for (final s in stations) s == 'memory' ? <String?>['memory-show', null, 'memory-recall'] : <String?>[s],
  ];
  const inner = levelSlots - 2;
  var free = math.max(0, inner - blocks.fold<int>(0, (a, b) => a + b.length));
  var slot = 1;
  final at = <int, String>{};
  for (var i = 0; i < blocks.length; i++) {
    final b = blocks[i];
    final gap = free ~/ (blocks.length - i + 1);
    slot += gap;
    free -= gap;
    for (var j = 0; j < b.length; j++) {
      final e = b[j];
      if (e != null) at[slot + j] = e;
    }
    slot += b.length;
  }
  return at;
}

/// Задания станций: откуда уровень берёт пример, задачу, ряд, вопрос шкалы и число знаков.
class RunnerTasks {
  const RunnerTasks({
    required this.blitz,
    required this.exact,
    required this.pattern,
    required this.scale,
    required this.memory,
  });

  final BlitzTask Function(int level, Rng rnd) blitz;
  final ExactTask Function(int level, Rng rnd) exact;
  final PatternTask Function(int level, Rng rnd) pattern;
  final ScaleTask Function(int level, Rng rnd) scale;

  /// Сколько знаков держать — лестница OSpan (`setSize`); сами знаки выбирает уровень.
  final int Function(int level) memory;
}

/// Генераторы упражнений раздела «Счёт». [numberLocale] — запись дробей в вопросе шкалы, как в
/// вебе (`шкала.formatExpression(q.expression, язык)`, NumberRunGame.web.tsx:216): `'ru'` —
/// запятая, `'en'` — точка; экран берёт её по языку человека (`slider.numberLocale`).
RunnerTasks countingTasksFor(String numberLocale) => RunnerTasks(
  blitz: (level, rnd) {
    final p = sprint.generateSprintProblem(level, rnd);
    return BlitzTask(display: p.display, answer: p.answer.toDouble());
  },
  exact: (level, rnd) {
    final p = bonds.makePuzzle(bonds.levelParams(level), rnd);
    return ExactTask(target: p.target.toDouble(), chips: [for (final c in p.chips) c.toDouble()]);
  },
  pattern: (level, rnd) {
    final s = pattern.makeSequence(level, rnd);
    final options = pattern.makeOptions(s.answer, rnd, count: 3, tail: pattern.tailLure(s.items));
    return PatternTask(items: s.items, answer: s.answer.toDouble(), options: [for (final o in options) o.toDouble()]);
  },
  // Вопрос «Мат. шкалы» её же генератором. Зерно у неё строковое — берём его из жребия уровня,
  // чтобы уровень повторялся по зерну. Выше 52-го у шкалы фигуры-интегралы: на табло над
  // дорогой их не нарисовать, поэтому потолок станции — 52.
  scale: (level, rnd) {
    final q = slider.generateMathSliderQuestions('run-${(rnd() * 1e9).floor()}', math.min(52, level), 1)[0];
    return ScaleTask(
      prompt: slider.formatExpression(q.expression, locale: numberLocale),
      min: q.scale.min,
      max: q.scale.max,
      answer: q.answer,
      ticks: q.scale.ticks,
    );
  },
  memory: (level) => ospan.levelParams(level).setSize,
);

/// Русская запись чисел — ею сняты эталоны забега (`record-number-run-reference.mjs`:
/// `formatExpression(q.expression, 'ru')`), поэтому пробы ядра ходят через неё.
final RunnerTasks countingTasks = countingTasksFor('ru');

/// Уровень [level] по зерну [seed]. Раздачу, где стоящий на месте проходит уровень, перебрасываем
/// солью; выбор по-прежнему однозначен для пары (уровень, зерно).
RoadCourse makeLevel(int level, int seed, RunnerTasks tasks, {bool boss = false}) {
  if (level < 1) throw ArgumentError('Invalid level');
  if (seed < 0 || seed > 0xffffffff) throw ArgumentError('Invalid level seed');
  for (var salt = 0; salt < 16; salt++) {
    final course = _buildLevel(level, seed, salt, tasks, boss);
    if (course != null) return course;
  }
  throw StateError('No playable level: $level/$seed');
}

RoadCourse? _buildLevel(int level, int seed, int salt, RunnerTasks tasks, bool boss) {
  final rng = runnerRandom((seed ^ jsImul(level, 0x9e3779b1) ^ jsImul(salt, 0x85ebca6b)) & 0xFFFFFFFF);
  final track = RoadTrack(rng);
  final k = level + 1.0;
  final stationAt = _layout(stationPlan(level, boss));
  List<String>? memory;
  var shape = level % _shapes.length;
  for (var i = 0; i < levelSlots; i++) {
    final station = stationAt[i];
    if (i == 0) {
      track.line(1, k, 4 * k, 2 * k);
    } else if (station == 'blitz') {
      track.blitz(1, k, tasks.blitz(stationLevel('blitz', level), rng));
    } else if (station == 'exact') {
      track.exact(1, k, tasks.exact(stationLevel('exact', level), rng));
    } else if (station == 'pattern') {
      track.pattern(1, k, tasks.pattern(stationLevel('pattern', level), rng));
    } else if (station == 'scale') {
      track.scale(1, k, tasks.scale(stationLevel('scale', level), rng));
    } else if (station == 'memory-show') {
      final n = math.min(5, tasks.memory(stationLevel('memory', level)));
      memory = runnerShuffle(memorySymbols, rng).sublist(0, n);
      track.memoryShow(1, k, memory);
    } else if (station == 'memory-recall') {
      track.memoryRecall(1, k, memory!);
    } else if (i == levelSlots - 1) {
      if (boss) {
        track.doubling(1, k, .85);
      } else {
        track.walls(1, k);
      }
    } else {
      final next = _shapes[shape++ % _shapes.length];
      if (next == 'snake') {
        track.snake(1, k, level == 1 ? 0 : level < 6 ? 1 : 2);
      } else if (next == 'line') {
        track.line(1, k, 5 * k, 3 * k);
      } else {
        buildShape(track, next, 1, k);
      }
    }
    if (i < levelSlots - 1) {
      final o = _obstacles[i];
      if (o == 'block') {
        track.block(1, k);
      } else if (o == 'gap') {
        track.gap(1);
      } else {
        final lane = level == 1 && i < 2 ? (o == 'bridge' ? -1.0 : 0.0) : track.lane().toDouble();
        if (o == 'bridge') {
          track.bridge(1, lane);
        } else {
          track.jump(1, lane);
        }
      }
    }
  }
  track.stageLine(1);
  final rows = List<RoadRow>.unmodifiable(track.rows);
  final course = RoadCourse(
    version: levelVersion,
    mode: 'journey',
    format: 'level',
    levelId: level,
    seed: seed,
    boss: boss,
    start: 1,
    speed: 8,
    lateralSpeed: 4,
    rows: rows,
    gates: 1,
    stages: [
      RoadStage(
        id: 1,
        startRow: 0,
        endRow: rows.length - 1,
        startZ: 0,
        endZ: rows.last.z,
        startValue: 1,
        target: track.intended,
      ),
    ],
  );
  final path = solveCourse(course);
  if (path == null || [-1.0, 0.0, 1.0].any((lane) => stationaryWins(course, lane))) return null;
  final reference = path.last.sum;
  return course.withFinale(boss
      ? RoadFinale.boss(reference: reference, boss: math.max(10.0, round5(reference * bossShare)))
      : finaleLadder(reference));
}

/// Пройден ли уровень: у обычного — пробито не меньше [passWalls] стен из десяти; у стража —
/// число не меньше стража.
bool levelPassed(RoadCourse course, double value) {
  final f = course.finale!;
  return f.boss != null ? value >= f.boss! : wallsBroken(f, value) >= passWalls;
}
