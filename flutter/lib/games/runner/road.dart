/// ДОРОГА РАННЕРА — общее ядро раннеров, перенос `runner-core.mjs` «Числового забега» (VER 8)
/// ЦЕЛИКОМ.
///
/// 🔴 ПОЧЕМУ ПЕРЕНОС, А НЕ СВОЯ ФИЗИКА. Раннеров два — «Числовой забег» (раздел «Счёт») и
/// «Поиск на ходу» (развилка «Поиск глазами»), и по цепочке раннеров (звено 3) у них ОДНО ядро.
/// Скорость смены полосы, округление полосы на пересечении ряда, окна сборов, столб, трамплин,
/// падение с моста и догон кадра — те же строки, что в вебе, и сверяются с прогоном живого
/// ядра точным равенством чисел:
/// · `test/fixtures/road-reference.json` — ряды-ответы «Поиска»
///   (`frontend/src/games/number-run/tools/record-road-reference.mjs`);
/// · `test/fixtures/number-run-reference.json` — уровни и забег «Числового забега» целиком
///   (`frontend/src/games/number-run/tools/record-number-run-reference.mjs`).
///
/// Роды рядов: `pickups` (числа на дороге; строй, змейка, сетка, стопки за столбом, трамплин,
/// ворота «ровно N», память в пути) · `answer` (три арки, полоса = ответ) · `scale` (место на
/// дороге — число на прямой) · `operation` (стена во всю ширину) · `obstacle` (мост, трамплин,
/// блок, провал) · `gate` (ворота-правило; черта этапа).
///
/// ⚠️ `correct` у ряда-ответа — С НУЛЯ: полосы −1/0/1, верно при `lane + 1 == correct`.
/// ⚠️ Полоса округляется как `Math.round` в JS (половина — вверх), а не как `round()` в Dart.
/// ⚠️ Падение с моста пишет событие поверх событий ДО шага (`s.events`), как в вебе. Это не
///    теряет ничего: на ряду-препятствии сборов нет, а взлёт с трамплина исключает падение —
///    к падению событий шага не бывает (порча «поверх событий шага» пробой не отличима).
library;

import 'dart:math' as math;

import '../../shell/js_compat.dart' show jsRound;
import 'rules.dart';

export 'rules.dart' show RoadRule, RoadExact;

/// Версия ядра — как `CORE_VERSION` в вебе.
const String roadCoreVersion = 'number-run-core/8';

/// Шаг интегрирования — как `FIXED_DT` ядра.
const double roadFixedDt = 1 / 120;

enum RoadStatus { ready, running, paused, failed, won }

/// Число на дороге. `part` — часть ворот «ровно N»: число не меняет сразу, а идёт в сумму ряда.
class RoadItem {
  const RoadItem({
    required this.x,
    required this.value,
    this.dz,
    this.window,
    this.half,
    this.part = false,
    this.symbol,
  });

  final double x, value;
  final double? dz, window, half;
  final bool part;

  /// Знак памяти («вспомни по порядку»).
  final String? symbol;

  Map<String, Object?> toJson() => {
        'x': x,
        if (dz != null) 'dz': dz,
        if (half != null) 'half': half,
        if (window != null) 'window': window,
        'value': value,
        if (part) 'part': true,
        if (symbol != null) 'symbol': symbol,
      };
}

/// Точка пути построения: смещение от ряда и место поперёк дороги.
class RoadPoint {
  const RoadPoint(this.dz, this.x);
  final double dz, x;
  Map<String, Object?> toJson() => {'dz': dz, 'x': x};
}

/// Путь построения (змейка, сетка, стопка, трамплин, станция): вход, выход, прибавка.
class RoadRoute {
  const RoadRoute({
    required this.id,
    required this.entry,
    required this.exit,
    required this.gain,
    required this.waypoints,
  });

  final String id;
  final RoadPoint entry;
  final double exit, gain;
  final List<RoadPoint> waypoints;

  Map<String, Object?> toJson() => {
        'id': id,
        'entry': entry.toJson(),
        'exit': exit,
        'gain': gain,
        'waypoints': [for (final w in waypoints) w.toJson()],
      };
}

/// Столб между стопками: внутри его пролёта середину не пересечь.
class RoadDivider {
  const RoadDivider({required this.fromDz, required this.toDz, required this.gap});
  final double fromDz, toDz, gap;
  Map<String, Object?> toJson() => {'fromDz': fromDz, 'toDz': toDz, 'gap': gap};
}

/// Трамплин: полоса взлёта, где взлетаешь и где садишься, высота дуги.
class RoadJump {
  const RoadJump({required this.lane, required this.launchOffset, required this.landingOffset, required this.height});
  final double lane, launchOffset, landingOffset, height;
  Map<String, Object?> toJson() =>
      {'lane': lane, 'launchOffset': launchOffset, 'landingOffset': landingOffset, 'height': height};
}

/// Показ знаков памяти над дорогой: знаки и где каждый проплывает.
class RoadShow {
  const RoadShow({required this.symbols, required this.dzs});
  final List<String> symbols;
  final List<double> dzs;
  Map<String, Object?> toJson() => {'symbols': symbols, 'dzs': dzs};
}

/// Ряд дороги. Ядру важны место, род и цена; что нарисовано — [payload] (раннер «Поиска»).
class RoadRow {
  /// Ряд-ответ раннера «Поиска»: три арки, верная [correct] (с нуля).
  const RoadRow({
    required this.id,
    required this.z,
    required int this.correct,
    this.window,
    this.reward = 1,
    this.penalty = 0,
    this.options = const ['a', 'b', 'c'],
    this.payload,
  })  : kind = 'answer',
        stage = null,
        station = null,
        prompt = null,
        shape = null,
        items = const [],
        routes = null,
        divider = null,
        jump = null,
        exact = null,
        show = null,
        recall = false,
        terrain = null,
        span = 0,
        penalties = const [],
        rules = const [],
        checkpoint = false,
        stageEnd = false,
        min = 0,
        max = 0,
        answer = 0,
        ticks = const [],
        tolerance = 0;

  /// Любой род ряда — так строит дорогу `RoadTrack` («Числовой забег»).
  const RoadRow.of({
    required this.kind,
    required this.id,
    required this.z,
    this.stage,
    this.window,
    this.station,
    this.prompt,
    this.shape,
    this.items = const [],
    this.routes,
    this.divider,
    this.jump,
    this.exact,
    this.show,
    this.recall = false,
    this.options = const [],
    this.correct,
    this.reward = 0,
    this.penalty = 0,
    this.terrain,
    this.span = 0,
    this.penalties = const [],
    this.rules = const [],
    this.checkpoint = false,
    this.stageEnd = false,
    this.min = 0,
    this.max = 0,
    this.answer = 0,
    this.ticks = const [],
    this.tolerance = 0,
    this.payload,
  });

  final String kind;
  final int id;
  final double z;
  final int? stage;

  /// Ряд засчитывается на `z + window`.
  final double? window;

  /// Станция хаба «Счёт»: blitz / pattern / scale / exact / memory.
  final String? station;
  final String? prompt;
  final String? shape;
  final List<RoadItem> items;
  final List<RoadRoute>? routes;
  final RoadDivider? divider;
  final RoadJump? jump;
  final RoadExact? exact;
  final RoadShow? show;
  final bool recall;

  /// Ответы арок (`answer`) или подписи стены (`operation`).
  final List<Object?> options;

  /// Верная полоса С НУЛЯ: 0 — левая, 1 — средняя, 2 — правая.
  final int? correct;
  final double reward, penalty;

  /// Препятствие: `bridge` / `jump` / `block` / `gap`; пролёт; штраф (или опасность) по полосам.
  final String? terrain;
  final double span;
  final List<double> penalties;

  /// Ворота: одно правило на все полосы или по правилу на полосу.
  final List<RoadRule> rules;
  final bool checkpoint, stageEnd;

  /// Шкала: прямая [min, max], ответ, деления, допуск (доля ширины).
  final double min, max, answer;
  final List<double> ticks;
  final double tolerance;

  /// Станция, которую рисует экран: ядро её не читает.
  final Object? payload;

  double get eventZ => z + (window ?? 0);

  factory RoadRow.fromJson(Map<String, dynamic> j) => RoadRow(
        id: j['id'] as int,
        z: (j['z'] as num).toDouble(),
        correct: j['correct'] as int,
        window: (j['window'] as num?)?.toDouble(),
        reward: (j['reward'] as num? ?? 1).toDouble(),
        penalty: (j['penalty'] as num? ?? 0).toDouble(),
        options: (j['options'] as List?)?.cast<Object?>() ?? const ['a', 'b', 'c'],
      );

  /// Ряд любого рода из JSON веба — обратное к [toJson] (эталоны, ручные дорожки проб).
  factory RoadRow.fromFullJson(Map<String, dynamic> j) {
    double d(Object? v) => (v as num).toDouble();
    double? od(Object? v) => (v as num?)?.toDouble();
    RoadPoint point(Object? v) => RoadPoint(d((v as Map)['dz']), d(v['x']));
    final kind = j['kind'] as String;
    final jump = j['jump'] as Map<String, dynamic>?;
    final exact = j['exact'] as Map<String, dynamic>?;
    final show = j['show'] as Map<String, dynamic>?;
    final divider = j['divider'] as Map<String, dynamic>?;
    return RoadRow.of(
      kind: kind,
      id: j['id'] as int,
      z: d(j['z']),
      stage: j['stage'] as int?,
      window: od(j['window']),
      station: j['station'] as String?,
      prompt: j['prompt'] as String?,
      shape: j['shape'] as String?,
      items: [
        for (final i in (j['items'] as List? ?? const []).cast<Map<String, dynamic>>())
          RoadItem(
            x: d(i['x']),
            value: d(i['value']),
            dz: od(i['dz']),
            window: od(i['window']),
            half: od(i['half']),
            part: i['part'] == true,
            symbol: i['symbol'] as String?,
          ),
      ],
      routes: j['routes'] == null
          ? null
          : [
              for (final r in (j['routes'] as List).cast<Map<String, dynamic>>())
                RoadRoute(
                  id: r['id'] as String,
                  entry: point(r['entry']),
                  exit: d(r['exit']),
                  gain: d(r['gain']),
                  waypoints: [for (final w in r['waypoints'] as List) point(w)],
                ),
            ],
      divider: divider == null
          ? null
          : RoadDivider(fromDz: d(divider['fromDz']), toDz: d(divider['toDz']), gap: d(divider['gap'])),
      jump: jump == null
          ? null
          : RoadJump(
              lane: d(jump['lane']),
              launchOffset: d(jump['launchOffset']),
              landingOffset: d(jump['landingOffset']),
              height: d(jump['height']),
            ),
      exact: exact == null ? null : RoadExact(target: d(exact['target']), bonus: d(exact['bonus']), unit: d(exact['unit'])),
      show: show == null
          ? null
          : RoadShow(
              symbols: (show['symbols'] as List).cast<String>(),
              dzs: [for (final v in show['dzs'] as List) d(v)],
            ),
      recall: j['recall'] == true,
      options: kind == 'operation'
          ? (j['options'] as List).cast<String>()
          : [for (final v in j['options'] as List? ?? const []) d(v)],
      correct: j['correct'] as int?,
      reward: od(j['reward']) ?? 0,
      penalty: od(j['penalty']) ?? 0,
      terrain: j['terrain'] as String?,
      span: od(j['span']) ?? 0,
      penalties: [for (final v in j['penalties'] as List? ?? const []) d(v)],
      rules: [
        for (final r in (j['rules'] as List? ?? const []).cast<Map<String, dynamic>>()) RoadRule(od(r['min']), od(r['max'])),
      ],
      checkpoint: j['checkpoint'] == true,
      stageEnd: j['stageEnd'] == true,
      min: od(j['min']) ?? 0,
      max: od(j['max']) ?? 0,
      answer: od(j['answer']) ?? 0,
      ticks: [for (final v in j['ticks'] as List? ?? const []) d(v)],
      tolerance: od(j['tolerance']) ?? 0,
    );
  }

  Map<String, Object?> toJson() => {
        'kind': kind,
        'id': id,
        if (stage != null) 'stage': stage,
        'z': z,
        if (window != null) 'window': window,
        if (station != null) 'station': station,
        if (shape != null) 'shape': shape,
        ...switch (kind) {
          'pickups' => {
              'items': [for (final i in items) i.toJson()],
              if (routes != null) 'routes': [for (final r in routes!) r.toJson()],
              if (divider != null) 'divider': divider!.toJson(),
              if (jump != null) 'jump': jump!.toJson(),
              if (exact != null) 'exact': exact!.toJson(),
              if (show != null) 'show': show!.toJson(),
              if (recall) 'recall': true,
            },
          'answer' => {
              if (prompt != null) 'prompt': prompt,
              'options': options,
              'correct': correct,
              'reward': reward,
              'penalty': penalty,
            },
          'scale' => {
              'prompt': prompt,
              'min': min,
              'max': max,
              'answer': answer,
              'ticks': ticks,
              'tolerance': tolerance,
              'reward': reward,
              'penalty': penalty,
              if (routes != null) 'routes': [for (final r in routes!) r.toJson()],
            },
          'operation' => {'options': options},
          'obstacle' => {
              'terrain': terrain,
              'span': span,
              'penalties': penalties,
              if (jump != null) 'jump': jump!.toJson(),
            },
          _ => {
              if (checkpoint) 'checkpoint': true,
              'rules': [for (final r in rules) r.toJson()],
              if (stageEnd) 'stageEnd': true,
            },
        },
      };
}

/// Этап забега: ряды от и до, число на входе и число эталонного пути на выходе.
class RoadStage {
  const RoadStage({
    required this.id,
    required this.startRow,
    required this.endRow,
    required this.startZ,
    required this.endZ,
    required this.startValue,
    required this.target,
  });

  final int id, startRow, endRow;
  final double startZ, endZ, startValue, target;

  Map<String, Object?> toJson() => {
        'id': id,
        'startRow': startRow,
        'endRow': endRow,
        'startZ': startZ,
        'endZ': endZ,
        'startValue': startValue,
        'target': target,
      };
}

/// Финал после черты: лестница из десяти стен или «Страж» (число, которое надо перебить).
class RoadFinale {
  const RoadFinale.ladder({required this.reference, required List<double> this.walls}) : boss = null;
  const RoadFinale.boss({required this.reference, required double this.boss}) : walls = null;

  /// Число эталонного пути решателя.
  final double reference;
  final List<double>? walls;
  final double? boss;

  Map<String, Object?> toJson() => {
        'reference': reference,
        if (walls != null) 'walls': walls,
        if (boss != null) 'boss': boss,
      };
}

class RoadCourse {
  const RoadCourse({
    required this.levelId,
    required this.seed,
    required this.rows,
    this.mode = 'journey',
    this.speed = 8,
    this.lateralSpeed = 4,
    this.start = 0,
    this.gates = 0,
    this.version,
    this.format,
    this.boss = false,
    this.stages,
    this.finale,
  });

  final int levelId;
  final int seed;
  final List<RoadRow> rows;

  /// `journey` — долгий кадр не ставит на паузу, а отбрасывается (время пишется в журнал);
  /// иначе долгий кадр — пауза «прерывание», как у тренировок «Числового забега».
  final String mode;
  final double speed; // единиц дороги в секунду
  final double lateralSpeed; // полос в секунду
  final double start;

  /// Сколько ворот пройти для победы (у уровня — одна черта, у забега — двенадцать).
  final int gates;
  final String? version, format;
  final bool boss;
  final List<RoadStage>? stages;
  final RoadFinale? finale;

  double get length => rows.isEmpty ? 0 : rows.last.eventZ;

  RoadCourse withFinale(RoadFinale f) => RoadCourse(
        levelId: levelId,
        seed: seed,
        rows: rows,
        mode: mode,
        speed: speed,
        lateralSpeed: lateralSpeed,
        start: start,
        gates: gates,
        version: version,
        format: format,
        boss: boss,
        stages: stages,
        finale: f,
      );

  factory RoadCourse.fromJson(Map<String, dynamic> j) => RoadCourse(
        levelId: j['levelId'] as int,
        seed: j['seed'] as int,
        mode: j['mode'] as String? ?? 'training',
        speed: (j['speed'] as num).toDouble(),
        lateralSpeed: (j['lateralSpeed'] as num).toDouble(),
        start: (j['start'] as num? ?? 0).toDouble(),
        rows: [for (final r in j['rows'] as List) RoadRow.fromJson(r as Map<String, dynamic>)],
      );

  /// Курс любого вида из JSON веба — обратное к [toJson].
  factory RoadCourse.fromFullJson(Map<String, dynamic> j) {
    double d(Object? v) => (v as num).toDouble();
    final finale = j['finale'] as Map<String, dynamic>?;
    return RoadCourse(
      levelId: j['levelId'] as int,
      seed: j['seed'] as int,
      mode: j['mode'] as String? ?? 'training',
      speed: d(j['speed']),
      lateralSpeed: d(j['lateralSpeed']),
      start: d(j['start'] ?? 0),
      gates: j['gates'] as int? ?? 0,
      version: j['version'] as String?,
      format: j['format'] as String?,
      boss: j['boss'] == true,
      rows: [for (final r in j['rows'] as List) RoadRow.fromFullJson(r as Map<String, dynamic>)],
      stages: j['stages'] == null
          ? null
          : [
              for (final s in (j['stages'] as List).cast<Map<String, dynamic>>())
                RoadStage(
                  id: s['id'] as int,
                  startRow: s['startRow'] as int,
                  endRow: s['endRow'] as int,
                  startZ: d(s['startZ']),
                  endZ: d(s['endZ']),
                  startValue: d(s['startValue']),
                  target: d(s['target']),
                ),
            ],
      finale: finale == null
          ? null
          : finale['boss'] != null
              ? RoadFinale.boss(reference: d(finale['reference']), boss: d(finale['boss']))
              : RoadFinale.ladder(reference: d(finale['reference']), walls: [for (final w in finale['walls'] as List) d(w)]),
    );
  }

  Map<String, Object?> toJson() => {
        if (version != null) 'version': version,
        'mode': mode,
        if (format != null) 'format': format,
        'levelId': levelId,
        'seed': seed,
        if (format == 'level') 'boss': boss,
        'start': start,
        'speed': speed,
        'lateralSpeed': lateralSpeed,
        'length': rows.isEmpty ? 0 : rows.last.z,
        'rows': [for (final r in rows) r.toJson()],
        'gates': gates,
        if (stages != null) 'stages': [for (final s in stages!) s.toJson()],
        if (finale != null) 'finale': finale!.toJson(),
      };
}

/// Событие дороги — та же форма, что в вебе: `answer`, `pickup`, `pickups`, `scale`,
/// `operation`, `obstacle`, `gate`, `jump`, `pause`, `resume`.
class RoadEvent {
  const RoadEvent(this.data);

  RoadEvent.answer({
    required int id,
    required int lane,
    required Object? value,
    required bool ok,
    required double before,
    required double after,
    required double t,
    required double z,
  }) : data = {
          'type': 'answer',
          'id': id,
          'lane': lane,
          'value': value,
          'ok': ok,
          'before': before,
          'after': after,
          't': t,
          'z': z,
        };

  RoadEvent.pause({required String reason, required double t, required double z})
      : data = {'type': 'pause', 'reason': reason, 't': t, 'z': z};

  RoadEvent.resume({required double t, required double z}) : data = {'type': 'resume', 't': t, 'z': z};

  final Map<String, Object?> data;

  String get type => data['type'] as String;
  int? get id => data['id'] as int?;

  /// Полоса −1/0/1. У взлёта с трамплина это полоса трамплина (в данных — число с точкой).
  int? get lane => (data['lane'] as num?)?.toInt();
  Object? get value => data['value'];
  bool? get ok => data['ok'] as bool?;
  double? get before => (data['before'] as num?)?.toDouble();
  double? get after => (data['after'] as num?)?.toDouble();
  double get t => (data['t'] as num).toDouble();
  double get z => (data['z'] as num).toDouble();
  String? get reason => data['reason'] as String?;

  Map<String, Object?> toJson() => data;
}

/// Полёт над трамплином: с какого ряда, где взлетел, где сядет, высота дуги.
class RoadFlight {
  const RoadFlight({required this.id, required this.startZ, required this.endZ, required this.height});
  final int id;
  final double startZ, endZ, height;
  Map<String, Object?> toJson() => {'id': id, 'startZ': startZ, 'endZ': endZ, 'height': height};
}

/// Состояние забега. Шаг не меняет прежнее состояние — возвращает новое, как в вебе.
class RoadState {
  RoadState._({
    required this.mode,
    required this.levelId,
    required this.seed,
    required this.stage,
    required this.clearedStages,
    required this.peak,
    required this.hits,
    required this.jump,
    required this.collected,
    required this.z,
    required this.x,
    required this.target,
    required this.sum,
    required this.gates,
    required this.status,
    required this.nextRow,
    required this.elapsed,
    required this.events,
    required this.failure,
    required this.slowFrames,
    required this.discardedTime,
    required this.pauses,
    required this.mistakes,
  });

  final String mode;
  final int levelId, seed;
  int stage, clearedStages, hits, gates;
  RoadStatus status;
  RoadFlight? jump;
  List<int> collected;
  double z, x, target, sum, peak, elapsed, discardedTime;
  int nextRow, slowFrames, pauses, mistakes;
  List<RoadEvent> events;
  Map<String, Object?>? failure;

  /// Ответы по порядку рядов — то, что экран считает находками и промахами.
  Iterable<RoadEvent> get answers => events.where((e) => e.type == 'answer');

  RoadState copy() => RoadState._(
        mode: mode,
        levelId: levelId,
        seed: seed,
        stage: stage,
        clearedStages: clearedStages,
        peak: peak,
        hits: hits,
        jump: jump,
        collected: collected,
        z: z,
        x: x,
        target: target,
        sum: sum,
        gates: gates,
        status: status,
        nextRow: nextRow,
        elapsed: elapsed,
        events: events,
        failure: failure,
        slowFrames: slowFrames,
        discardedTime: discardedTime,
        pauses: pauses,
        mistakes: mistakes,
      );

  Map<String, Object?> toJson() => {
        'version': roadCoreVersion,
        'mode': mode,
        'levelId': levelId,
        'seed': seed,
        'stage': stage,
        'clearedStages': clearedStages,
        'peak': peak,
        'hits': hits,
        'jump': jump?.toJson(),
        'collected': collected,
        'z': z,
        'x': x,
        'target': target,
        'sum': sum,
        'gates': gates,
        'status': status.name,
        'nextRow': nextRow,
        'elapsed': elapsed,
        'failure': failure,
        'slowFrames': slowFrames,
        'discardedTime': discardedTime,
        'pauses': pauses,
        'mistakes': mistakes,
      };
}

/// Высота машины над дорогой в полёте — парабола между взлётом и посадкой.
double jumpHeight(RoadState s) {
  final j = s.jump;
  if (j == null) return 0;
  final u = (s.z - j.startZ) / (j.endZ - j.startZ);
  return u <= 0 || u >= 1 ? 0 : 4 * j.height * u * (1 - u);
}

/// Размер числа на машине растёт с числом; попадание — всегда в ширину полосы.
double numberScale(double value) => 1 + math.min(1.6, math.log(1 + math.max(0, value)) / math.ln2 / 7);

RoadState roadInitial(RoadCourse c) => RoadState._(
      mode: c.mode,
      levelId: c.levelId,
      seed: c.seed,
      stage: (c.stages != null && c.stages!.isNotEmpty) ? c.stages!.first.id : c.levelId,
      clearedStages: 0,
      peak: c.start,
      hits: 0,
      jump: null,
      collected: const [],
      z: 0,
      x: 0,
      target: 0,
      sum: c.start,
      gates: 0,
      status: RoadStatus.ready,
      nextRow: 0,
      elapsed: 0,
      events: const [],
      failure: null,
      slowFrames: 0,
      discardedTime: 0,
      pauses: 0,
      mistakes: 0,
    );

/// Тянуть к точке дороги (−1…1). Не в забеге — ничего.
RoadState roadSetTarget(RoadState s, double x) {
  if (!x.isFinite) throw ArgumentError('Invalid target');
  if (s.status != RoadStatus.running) return s;
  return s.copy()..target = math.max(-1.0, math.min(1.0, x));
}

/// Соседняя полоса. Цель округляется как `Math.round` в вебе.
RoadState roadChangeLane(RoadState s, int delta) => roadSetTarget(s, jsRound(s.target) + delta);

RoadState roadPause(RoadState s, [String reason = 'manual']) {
  if (s.status != RoadStatus.running) return s;
  return s.copy()
    ..status = RoadStatus.paused
    ..pauses = s.pauses + 1
    ..events = [...s.events, RoadEvent.pause(reason: reason, t: s.elapsed, z: s.z)];
}

RoadState roadResume(RoadState s) {
  if (s.status != RoadStatus.ready && s.status != RoadStatus.paused) return s;
  return s.copy()
    ..status = RoadStatus.running
    ..events = [...s.events, RoadEvent.resume(t: s.elapsed, z: s.z)];
}

/// `Math.sign(v) || Math.sign(w) || 1`: ноль (и −0) — «нет знака».
double _signOr(double a, double b) {
  final sa = a.sign;
  if (sa != 0 && !sa.isNaN) return sa;
  final sb = b.sign;
  if (sb != 0 && !sb.isNaN) return sb;
  return 1;
}

class _Hit {
  const _Hit(this.t, this.index, this.item);
  final double t;
  final int index;
  final RoadItem item;
}

/// Один шаг интегрирования (не длиннее 0,1 с): движение вперёд и вбок, сборы, трамплин,
/// падение с моста и ряды на пути. Построчный перенос `step` из `runner-core.mjs`.
RoadState roadStep(RoadState s, double dt, RoadCourse course) {
  if (!dt.isFinite || dt < 0 || dt > .1 + 1e-10) throw ArgumentError('dt outside simulation contract');
  if (s.status != RoadStatus.running || dt == 0) return s;
  if (course.levelId != s.levelId || course.seed != s.seed) throw ArgumentError('Wrong course');
  final terrain = s.nextRow < course.rows.length ? course.rows[s.nextRow] : null;
  final endZ = s.z + dt * course.speed, lat = course.lateralSpeed;
  double move(double x0, double t) => x0 + (s.target - x0).sign * math.min((s.target - x0).abs(), t * lat);
  // Столб: сторона берётся там, где столб начинается; внутри его пролёта середину не пересечь.
  final div = terrain?.divider;
  final zoneA = div != null ? terrain!.z + div.fromDz : 0.0;
  final zoneB = div != null ? terrain!.z + div.toDz : 0.0;
  var side = 0.0, tA = 0.0, tB = dt;
  if (div != null && endZ >= zoneA && s.z <= zoneB) {
    tA = math.max(0.0, (zoneA - s.z) / course.speed);
    tB = math.min(dt, (zoneB - s.z) / course.speed);
    side = _signOr(move(s.x, tA), s.target);
  }
  double bound(double x) => side < 0 ? math.min(x, -div!.gap) : math.max(x, div!.gap);
  double xAt(double t) => side == 0 || t <= tA
      ? move(s.x, t)
      : t <= tB
          ? bound(move(s.x, t))
          : move(bound(move(s.x, tB)), t - tB);
  final next = s.copy()
    ..z = endZ
    ..x = xAt(dt)
    ..elapsed = s.elapsed + dt
    ..events = [...s.events];
  if (next.jump != null && endZ >= next.jump!.endZ) next.jump = null;
  RoadFlight? launched;
  final tj = terrain?.jump;
  if (tj != null) {
    final launchZ = terrain!.z - tj.launchOffset;
    if (s.z < launchZ && endZ >= launchZ) {
      final t = (launchZ - s.z) / course.speed, x = xAt(t);
      if ((x - tj.lane).abs() < .48) {
        launched = next.jump =
            RoadFlight(id: terrain.id, startZ: launchZ, endZ: terrain.z + tj.landingOffset, height: tj.height);
        next.events.add(RoadEvent(
            {'type': 'jump', 'id': terrain.id, 'lane': tj.lane, 'z': launchZ, 't': s.elapsed + t}));
      }
    }
  }
  if (terrain?.kind == 'pickups') {
    // У каждого числа своя глубина, окно и ширина; под дугой полёта и за столбом не трогается ничто.
    final flights = [?s.jump, ?launched];
    final velocity = (s.target - s.x).sign * lat;
    final hits = <_Hit>[];
    for (var index = 0; index < terrain!.items.length; index++) {
      final item = terrain.items[index];
      if (s.collected.contains(index)) continue;
      final zi = terrain.z + (item.dz ?? 0), w = item.window ?? terrain.window!, half = item.half ?? .18;
      final ta = math.max(0.0, (zi - w - s.z) / course.speed), tb = math.min(dt, (zi + w - s.z) / course.speed);
      if (ta > tb) continue;
      if (flights.any((f) => zi > f.startZ && zi < f.endZ) ||
          (side != 0 && zi >= zoneA && zi <= zoneB && item.x.sign != side)) {
        continue;
      }
      final xa = xAt(ta), xb = xAt(tb), lo = item.x - half, hi = item.x + half;
      if (math.max(xa, xb) < lo || math.min(xa, xb) > hi) continue;
      final double? t = xa >= lo && xa <= hi
          ? ta
          : velocity == 0
              ? null
              : ((velocity > 0 ? lo : hi) - s.x) / velocity;
      if (t != null && t >= ta - 1e-9 && t <= tb + 1e-9) hits.add(_Hit(math.max(ta, t), index, item));
    }
    if (hits.isNotEmpty) {
      next.collected = [...s.collected];
      hits.sort((a, b) {
        final d = a.t - b.t;
        return d != 0 ? d.sign.toInt() : a.index - b.index;
      });
      for (final hit in hits) {
        // Число-часть ворот «ровно N» число не меняет: оно идёт в сумму ряда, которую ворота сверят на выходе.
        final before = next.sum;
        if (!hit.item.part) next.sum += hit.item.value;
        next.peak = math.max(next.peak, next.sum);
        next.collected.add(hit.index);
        next.events.add(RoadEvent({
          'type': 'pickup',
          'id': terrain.id,
          'item': hit.index,
          'value': hit.item.value,
          'before': before,
          'after': next.sum,
          't': s.elapsed + hit.t,
          'z': s.z + hit.t * course.speed,
          if (hit.item.part) 'part': true,
        }));
      }
    }
  }
  final airborne = next.jump != null && next.jump!.id == terrain?.id;
  if (terrain != null &&
      terrain.kind == 'obstacle' &&
      terrain.span != 0 &&
      !airborne &&
      endZ >= terrain.z - terrain.span &&
      s.z < terrain.z) {
    final ta = math.max(0.0, (terrain.z - terrain.span - s.z) / course.speed);
    final tb = math.min(dt, (terrain.z - s.z) / course.speed);
    final xa = xAt(ta), xb = xAt(tb), velocity = (s.target - s.x).sign * course.lateralSpeed;
    double? impact;
    for (var i = 0; i < terrain.penalties.length; i++) {
      if (terrain.penalties[i] == 0) continue;
      final lane = i - 1, lo = lane - .5, hi = lane + .5;
      if (math.max(xa, xb) < lo || math.min(xa, xb) > hi) continue;
      final double? t = xa >= lo && xa <= hi
          ? ta
          : velocity == 0
              ? null
              : ((velocity > 0 ? lo : hi) - s.x) / velocity;
      if (t != null && t >= ta - 1e-9 && t <= tb + 1e-9 && (impact == null || t < impact)) {
        impact = math.max(ta, t);
      }
    }
    if (impact != null) {
      final z = s.z + impact * course.speed, x = xAt(impact);
      return next.copy()
        ..z = z
        ..x = x
        ..elapsed = s.elapsed + impact
        ..status = RoadStatus.failed
        ..hits = s.hits + 1
        ..nextRow = s.nextRow + 1
        ..failure = {'kind': 'fall', 'terrain': terrain.terrain}
        ..events = [
          ...s.events,
          RoadEvent({
            'type': 'obstacle',
            'id': terrain.id,
            'lane': jsRound(x).toInt(),
            'damage': 0,
            'fall': true,
            'before': s.sum,
            'after': s.sum,
            'z': z,
            't': s.elapsed + impact,
          }),
        ];
    }
  }
  while (next.nextRow < course.rows.length && course.rows[next.nextRow].eventZ <= endZ + 1e-9) {
    final row = course.rows[next.nextRow];
    final eventZ = row.eventZ;
    final t = math.max(0.0, (eventZ - s.z) / course.speed);
    final x = xAt(t);
    final lane = math.max(-1, math.min(1, jsRound(x).toInt()));
    final before = next.sum;
    // Каждая полоса — вариант; «→» — явный пропуск. Пустых зазоров нет.
    if (row.kind == 'pickups') {
      final exact = row.exact;
      if (exact != null) {
        var got = 0.0;
        for (final i in next.collected) {
          got += row.items[i].part ? row.items[i].value : 0;
        }
        final delta = exactDelta(exact, got);
        next.sum += delta;
        if (delta < 0) next.mistakes += 1;
        next.events.add(RoadEvent({
          'type': 'pickups',
          'id': row.id,
          'lane': lane,
          'items': next.collected,
          'sum': next.sum,
          'exact': {'target': exact.target, 'got': got, 'delta': delta},
          'before': before,
          't': s.elapsed + t,
          'z': eventZ,
        }));
      } else {
        next.events.add(RoadEvent({
          'type': 'pickups',
          'id': row.id,
          'lane': lane,
          'items': next.collected,
          'sum': next.sum,
          't': s.elapsed + t,
          'z': eventZ,
        }));
      }
      next.collected = [];
    } else if (row.kind == 'scale') {
      final value = scaleValue(row.min, row.max, x);
      final err = (value - row.answer).abs() / (row.max - row.min);
      final delta = scaleDelta(err, tolerance: row.tolerance, reward: row.reward, penalty: row.penalty);
      next.sum += delta;
      if (delta < 0) next.mistakes += 1;
      next.events.add(RoadEvent({
        'type': 'scale',
        'id': row.id,
        'x': x,
        'value': value,
        'err': err,
        'delta': delta,
        'before': before,
        'after': next.sum,
        't': s.elapsed + t,
        'z': row.z,
      }));
    } else if (row.kind == 'answer') {
      final ok = lane + 1 == row.correct;
      next.sum += ok ? row.reward : -row.penalty;
      if (!ok) next.mistakes += 1;
      next.events.add(RoadEvent.answer(
        id: row.id,
        lane: lane,
        value: row.options[lane + 1],
        ok: ok,
        before: before,
        after: next.sum,
        t: s.elapsed + t,
        z: row.z,
      ));
    } else if (row.kind == 'operation') {
      final operation = row.options[lane + 1] as String;
      next.sum = applyOperation(before, operation, course.mode == 'journey' ? 1e6 : 9999);
      next.events.add(RoadEvent({
        'type': 'operation',
        'id': row.id,
        'lane': lane,
        'operation': operation,
        'before': before,
        'after': next.sum,
        't': s.elapsed + t,
        'z': row.z,
      }));
    } else if (row.kind == 'obstacle') {
      final damage = row.span != 0 ? 0.0 : row.penalties[lane + 1];
      next.sum -= damage;
      if (damage != 0) next.hits += 1;
      next.events.add(RoadEvent({
        'type': 'obstacle',
        'id': row.id,
        'lane': lane,
        'damage': damage,
        'jumped': row.jump != null,
        'before': before,
        'after': next.sum,
        't': s.elapsed + t,
        'z': row.z,
      }));
    } else {
      final rule = row.rules.length == 1 ? row.rules[0] : row.rules[lane + 1];
      final ok = roadMeets(next.sum, rule);
      next.events.add(RoadEvent({
        'type': 'gate',
        'id': row.id,
        'lane': lane,
        'sum': next.sum,
        'rule': rule.toJson(),
        'ok': ok,
        't': s.elapsed + t,
        'z': row.z,
      }));
      if (!ok) {
        next.status = RoadStatus.failed;
        next.failure = {'rule': rule.toJson(), 'sum': next.sum, ...ruleDifference(next.sum, rule)};
      } else {
        next.gates += 1;
        if (row.stageEnd) next.clearedStages += 1;
        if (next.gates == course.gates) next.status = RoadStatus.won;
      }
    }
    next.nextRow += 1;
    next.peak = math.max(next.peak, next.sum);
    final stages = course.stages;
    if (stages != null) {
      next.stage = next.nextRow < course.rows.length ? (course.rows[next.nextRow].stage ?? stages.length) : stages.length;
    }
    if (next.status != RoadStatus.running) {
      next.z = row.z;
      next.x = x;
      next.elapsed = s.elapsed + t;
      break;
    }
  }
  return next;
}

/// Кадр любой длины: догон не больше 0,25 с шагами 1/120 с; кадр длиннее 0,8 с — пауза
/// «прерывание» (или, в режиме `journey`, отброшенное время в журнале). Не прячем — пишем.
RoadState roadAdvanceFrame(RoadState s, double dt, RoadCourse c) {
  if (!dt.isFinite || dt < 0) throw ArgumentError('Invalid frame interval');
  if (s.status != RoadStatus.running) return s;
  if (dt > .8) {
    if (c.mode != 'journey') return roadPause(s, 'interruption');
    return s.copy()
      ..slowFrames = s.slowFrames + 1
      ..discardedTime = s.discardedTime + dt;
  }
  var next = s.copy()
    ..slowFrames = s.slowFrames + (dt > .1 ? 1 : 0)
    ..discardedTime = s.discardedTime + math.max(0.0, dt - .25);
  var remaining = math.min(dt, .25);
  while (remaining > 1e-10 && next.status == RoadStatus.running) {
    final part = math.min(remaining, roadFixedDt);
    next = roadStep(next, part, c);
    remaining -= part;
  }
  return next;
}
