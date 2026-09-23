/// СМЕСЬ ЗАДАНИЙ — И БИОМАРКЕР, КОТОРЫЙ ОТ НЕЁ НЕ ПОРТИТСЯ. Перенос `core/session.ts`.
///
/// 🔴 ГЛАВНАЯ ОПАСНОСТЬ НОВЫХ ВИДОВ ЗАДАНИЙ. У игры есть НАСТОЯЩАЯ измеряемая величина —
/// `angle_response_slope`, наклон времени ответа по углу поворота (мс/градус). Она осмысленна
/// ровно там, где угол ОПРЕДЕЛЁН. У проекции и развёртки угла нет вовсе; сложи их в ту же
/// регрессию — и наклон станет шумом, который выглядит как измерение. Поэтому:
///   · вид задания пишется в КАЖДУЮ запись пробы;
///   · в регрессию берутся ТОЛЬКО поворотные пробы с известным углом;
///   · доля поворотных проб в партии не опускается ниже 60 %.
///
/// ⚠️ ОТБОР ПРОБ — ФУНКЦИЯ, А НЕ ПРАВИЛО В ГОЛОВЕ: «не забыть проверить вид задания перед
/// записью точки» — то самое место, где через месяц потеряется условие.
library;

import 'formation.dart';
import 'levels.dart';
import 'memory.dart';
import 'net.dart';
import 'oblique.dart';
import 'pieces.dart';
import 'projection.dart';
import 'rng.dart';
import 'rotation.dart';
import 'same.dart';
import 'section.dart';
import 'task.dart';
import 'viewpoint.dart';

/// С какого уровня появляется вид задания. Поворот — с первого и всегда.
///
/// ⚠️ ПОРОГИ РАЗНЕСЕНЫ, А НЕ ПОСТАВЛЕНЫ ОДИН НА ДРУГОЙ: два новых правила за партию — это два
/// незнакомых правила сразу, и доля поворотных проб проседает рывком. Ракурс седьмым — он ближе
/// всего к повороту; пара «да/нет» девятой — у неё другой способ отвечать. «Недостающая часть»
/// только с 21-го, где в фигуре восемь кубиков: пустота из четырёх не больше сплошной части.
/// «Сечение» (косая плоскость) — двадцать четвёртым: это вторая геометрия.
const Map<TaskKind, int> kindUnlock = {
  TaskKind.rotation: 1,
  TaskKind.projection: 3,
  TaskKind.net: 5,
  TaskKind.viewpoint: 7,
  TaskKind.same: 9,
  TaskKind.assembly: 11,
  TaskKind.memory: 13,
  TaskKind.formation: 15,
  TaskKind.section: 18,
  TaskKind.missing: 21,
  TaskKind.oblique: 24,
};

/// Ниже этой доли поворотных проб партия опускаться не должна — см. шапку.
const double minRotationShare = 0.6;

List<TaskKind> unlockedKinds(int level) => [
  for (final e in kindUnlock.entries)
    if (level >= e.value) e.key,
];

/// ОТРАБОТКА ОДНОГО ВИДА (отчёт 1263dc58: «в настройках нельзя запустить отработку одного вида
/// заданий, они идут только вперемешку»). Выбрать можно ЛЮБОЙ вид, а не только открытый
/// уровнем; задания при этом строятся не ниже уровня, где вид открывается.
///
/// ⚠️ БИОМАРКЕР. Доля поворотных проб — правило смеси; у отработки её нет. Поэтому партия-
/// отработка не двигает уровень и пишется в историю отдельным режимом.
int practiceLevel(TaskKind kind, int level) {
  final floor = kindUnlock[kind]!;
  return (level > floor ? level : floor).clamp(1, 50);
}

List<TaskKind> planPractice(TaskKind kind, int trials) =>
    List<TaskKind>.filled(trials > 0 ? trials : 0, kind);

/// Режим партии для истории: у отработки к режиму смеси дописан вид.
String practiceMode(int level, TaskKind? kind) =>
    kind != null ? 'lvl$level-3D-${kind.name}' : 'lvl$level-3D';

/// План партии: какой пробе быть каким заданием.
///
/// Первая проба всегда поворотная: партия начинается с того, ради чего игра и заведена, а новые
/// виды подмешиваются дальше и вразбивку — подряд идущие однотипные пробы проходят на инерции.
List<TaskKind> planTaskKinds(int level, int trials, Rng rng) {
  final plan = List<TaskKind>.filled(trials > 0 ? trials : 0, TaskKind.rotation, growable: true);
  final extras = unlockedKinds(level).where((k) => k != TaskKind.rotation).toList();
  if (plan.length < 3 || extras.isEmpty) return plan;

  final byShare = (plan.length * minRotationShare).ceil();
  final rotationMin = byShare > 2 ? byShare : 2;
  final extraCount = plan.length - rotationMin > 0 ? plan.length - rotationMin : 0;
  if (extraCount == 0) return plan;

  final positions = <int>[];
  for (var i = 1; i <= extraCount; i++) {
    var at = (i * plan.length / (extraCount + 1)).round();
    if (at < 1) at = 1;
    if (at > plan.length - 1) at = plan.length - 1;
    while (positions.contains(at) && at > 1) {
      at--;
    }
    while (positions.contains(at) && at < plan.length - 1) {
      at++;
    }
    if (!positions.contains(at)) positions.add(at);
  }

  final order = shuffle(rng, extras);
  for (var i = 0; i < positions.length; i++) {
    plan[positions[i]] = order[i % order.length];
  }
  return plan;
}

MentalRotationTask buildTask(TaskKind kind, int level, Rng rng) {
  final p = levelParams(level);
  return switch (kind) {
    TaskKind.projection => buildProjectionTask(p.minC, p.maxC, p.optionCount, rng),
    TaskKind.net => buildNetTask(p.optionCount, rng),
    TaskKind.viewpoint => buildViewpointTask(level, rng),
    TaskKind.same => buildSameTask(level, rng),
    TaskKind.missing => buildMissingTask(level, rng),
    TaskKind.assembly => buildAssemblyTask(level, rng),
    TaskKind.formation => buildFormationTask(level, rng),
    TaskKind.section => buildSectionTask(level, rng),
    TaskKind.memory => buildMemoryTask(level, rng),
    TaskKind.oblique => buildObliqueTask(level, rng),
    TaskKind.rotation => buildRotationTask(level, rng),
  };
}

// ─── замер ────────────────────────────────────────────────────────────────

class TrialRecord {
  const TrialRecord({
    required this.kind,
    required this.angle,
    required this.rt,
    required this.correct,
  });

  final TaskKind kind;

  /// Угол поворота в градусах. У проекции и развёртки его нет — 0.
  final int angle;

  /// Время ответа, мс.
  final int rt;
  final bool correct;
}

/// Точки для регрессии: только поворотные пробы, только верные ответы, только с ненулевым
/// углом. Ошибочный ответ временем не измеряется — человек мог гадать.
List<({int angle, int rt})> slopeSamples(List<TrialRecord> records) => [
  for (final r in records)
    if (r.kind == TaskKind.rotation && r.correct && r.angle > 0) (angle: r.angle, rt: r.rt),
];

/// Наклон RT по углу (мс/градус). Меньше — быстрее ротация в голове.
double angleResponseSlope(List<TrialRecord> records) {
  final pairs = slopeSamples(records);
  if (pairs.length < 2) return 0;
  final n = pairs.length;
  var sumX = 0.0, sumY = 0.0, sumXY = 0.0, sumXX = 0.0;
  for (final p in pairs) {
    sumX += p.angle;
    sumY += p.rt;
    sumXY += p.angle * p.rt;
    sumXX += p.angle * p.angle;
  }
  final denom = n * sumXX - sumX * sumX;
  if (denom == 0) return 0; // все углы одинаковы — наклона нет
  return (n * sumXY - sumX * sumY) / denom;
}

/// Среднее время по ТЕМ ЖЕ пробам, что и наклон. Не по всем верным ответам: проекция и
/// развёртка отвечаются в другом темпе, и общее среднее перестало бы сравниваться.
int meanSlopeRt(List<TrialRecord> records) {
  final pairs = slopeSamples(records);
  if (pairs.isEmpty) return 0;
  var sum = 0;
  for (final p in pairs) {
    sum += p.rt;
  }
  return (sum / pairs.length).round();
}

/// Сколько проб какого вида было в партии.
///
/// ⚠️ НУЛИ БЕРУТСЯ ИЗ [kindUnlock], А НЕ ПИШУТСЯ РУКАМИ. Здесь однажды стоял второй по счёту
/// список видов, и он отстал: счётчик молча терял новую пробу, а в сводке это выглядело не
/// ошибкой, а «таких заданий не выпало».
Map<TaskKind, int> taskKindCounts(List<TrialRecord> records) {
  final out = {for (final k in kindUnlock.keys) k: 0};
  for (final r in records) {
    out[r.kind] = (out[r.kind] ?? 0) + 1;
  }
  return out;
}
