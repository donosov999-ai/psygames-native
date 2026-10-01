/// ПОСТРОЕНИЯ ДОРОГИ — перенос `runner-shapes.mjs` (VER 3) «Числового забега».
///
/// Строй, змейка, сетка, стопки за столбом, трамплин над красным, стены, «×2 против +N»,
/// препятствия, черта этапа и станции хаба «Счёт»: блиц-арки, ряд на арках, шкала, память
/// в пути, ворота «ровно N». Порядок бросков жребия — тот же, что в вебе: одно зерно даёт ту
/// же дорогу (сверка — `test/fixtures/number-run-reference.json`).
///
/// ⚠️ Числа — `double`, как в JS: сумма, прибавки и штрафы считаются теми же операциями.
library;

import 'dart:math' as math;

import '../../shell/js_compat.dart' show Rng, jsImul, jsRound, jsNum;
import 'road.dart';
import 'rules.dart';

/// mulberry32 с целым зерном — `random(seed)` раннера (без FNV-1a, в отличие от `createRng`).
Rng runnerRandom(int seed) {
  var a = seed & 0xFFFFFFFF;
  return () {
    a = (a + 0x6d2b79f5) & 0xFFFFFFFF;
    var t = jsImul((a ^ (a >> 15)).toSigned(32), (a | 1).toSigned(32));
    final m = jsImul((t ^ ((t & 0xFFFFFFFF) >> 7)).toSigned(32), (t | 61).toSigned(32));
    t = (t ^ ((t + m) & 0xFFFFFFFF).toSigned(32)).toSigned(32);
    return ((t ^ ((t & 0xFFFFFFFF) >> 14)) & 0xFFFFFFFF) / 4294967296.0;
  };
}

/// Перемешивание с конца — тем же порядком бросков, что `shuffle` раннера.
List<T> runnerShuffle<T>(List<T> a, Rng rng) {
  final r = List<T>.of(a);
  for (var i = r.length - 1; i > 0; i--) {
    final j = (rng() * (i + 1)).floor();
    final tmp = r[i];
    r[i] = r[j];
    r[j] = tmp;
  }
  return r;
}

double _sum(Iterable<double> v) => v.fold(0.0, (a, b) => a + b);

/// Круглое «не меньше пяти»: `Math.max(5, Math.round(v/5)*5)`.
double round5(double v) => math.max(5.0, jsRound(v / 5) * 5);

/// Число в подписи стены: целое — без хвоста, как в шаблонной строке JS.
String _n(double v) => '${jsNum(v)}';

/// Пары стопок [выгодная, невыгодная]; сторона — от зерна. От явной разницы к близким суммам
/// и приманке первым числом.
final List<List<List<double>> Function(double)> _columns = [
  (u) => [
        [2 * u, 2 * u, 2 * u, 2 * u],
        [-3 * u, u, u, u],
      ],
  (u) => [
        [-u, 2 * u, 2 * u, 3 * u],
        [6 * u, -9 * u, 2 * u, -u],
      ],
  (u) => [
        [2 * u, 2 * u, 2 * u, 2 * u],
        [-u, -2 * u, -4 * u, -8 * u],
      ],
  (u) => [
        [-3 * u, 4 * u, 3 * u, 3 * u],
        [5 * u, -2 * u, 4 * u, -u],
      ],
  (u) => [
        [-6 * u, 3 * u, 5 * u, 4 * u],
        [10 * u, -8 * u, 6 * u, -4 * u],
      ],
];

/// Дуги змейки (x по строкам); зеркалятся зерном.
const List<List<double>> _snakes = [
  [0, .5, 1, 1, .5, 0, -.5],
  [-1, -.5, 0, .5, 1, .5, 0],
  [-.5, 0, .5, 0, -.5, 0, .5],
  [1, .5, 0, -.5, -.5, 0, .5],
  [0, -.5, -1, -.5, 0, .5, 1],
];
const List<double> _lanes5 = [-1, -.5, 0, .5, 1];

/// Строки ворот «ровно N»: по одному числу на строку, между строками палец успевает на соседнюю полосу.
const List<double> exactLines = [-18, -13.5, -9, -4.5, 0];

/// Знаки станции «память в пути»: одинаковы на всех языках и не путаются с цифрами дороги.
const List<String> memorySymbols = ['●', '▲', '■', '★', '◆', '♥', '✚', '☾'];

/// Задание блиц-арки: пример и ответ (генератор «Мат. спринта»).
class BlitzTask {
  const BlitzTask({required this.display, required this.answer});
  final String display;
  final double answer;
}

/// Задание ряда на арках: члены ряда, ответ, варианты (генератор «Паттернов»).
class PatternTask {
  const PatternTask({required this.items, required this.answer, required this.options});
  final List<int> items;
  final double answer;
  final List<double> options;
}

/// Задание шкалы: выражение, прямая [min, max], ответ, деления (генератор «Мат. шкалы»).
class ScaleTask {
  const ScaleTask({required this.prompt, required this.min, required this.max, required this.answer, required this.ticks});
  final String prompt;
  final double min, max, answer;
  final List<double> ticks;
}

/// Задание ворот «ровно N»: цель и фишки (генератор «Состава числа»).
class ExactTask {
  const ExactTask({required this.target, required this.chips});
  final double target;
  final List<double> chips;
}

/// Дорога, которую строят по рядам. Ряд стоит через каждые 24 единицы.
class RoadTrack {
  RoadTrack(this.rng);

  final Rng rng;
  final List<RoadRow> rows = [];

  /// Число, которое к этому месту собирает эталонный путь (от него — доли стен и прибавки станций).
  double intended = 1;
  int columnsSeen = 0, wallsSeen = 0;

  RoadRow add(int stage, RoadRow Function(int id, double z) make) {
    final row = make(rows.length, 24.0 * (rows.length + 1));
    rows.add(row);
    return row;
  }

  /// Единица стопок и сетки растёт с числом, которое к этому месту собирают.
  double unit(double k) => math.max(k, round5(intended / 80));

  void operation(int stage, List<String> options) {
    final shuffled = runnerShuffle(options, rng);
    add(stage, (id, z) => RoadRow.of(kind: 'operation', id: id, stage: stage, z: z, options: shuffled));
    intended = options.map((o) => applyOperation(intended, o, 1e6)).reduce(math.max);
  }

  /// Штраф стен — доля числа, которое к этому месту собирают.
  List<double> share(double k, List<double> parts) => [for (final p in parts) math.max(k, round5(intended * p))];

  int lane() => (rng() * 3).floor() - 1;

  void line(int stage, double k, double gain, double loss) {
    final half = math.max(1.0, (gain / 2).floorToDouble());
    final values = rows.isEmpty ? List<double>.filled(5, gain) : runnerShuffle([gain, gain, half, half, -loss], rng);
    add(
        stage,
        (id, z) => RoadRow.of(
              kind: 'pickups',
              id: id,
              stage: stage,
              z: z,
              shape: 'line',
              window: 3,
              items: [for (var i = 0; i < values.length; i++) RoadItem(x: (i - 2) / 2, value: values[i])],
            ));
    intended += gain;
  }

  void snake(int stage, double k, int redCount) {
    const dzs = <double>[-18, -15, -12, -9, -6, -3, 0];
    final mirror = rng() < .5 ? -1.0 : 1.0;
    final xs = [
      for (final x in _snakes[(rng() * _snakes.length).floor()]) x * mirror == 0 ? 0.0 : x * mirror,
    ];
    final small = math.max(1.0, (k / 2).floorToDouble());
    final values = [for (var i = 0; i < dzs.length; i++) i < 3 ? small : k];
    final items = [for (var i = 0; i < dzs.length; i++) RoadItem(x: xs[i], dz: dzs[i], window: .6, value: values[i])];
    // Красные — в той же строке, что синее, но не там, где проходит палец.
    final taken = <int>{};
    for (var r = 0; r < redCount; r++) {
      final lines = runnerShuffle([1, 2, 3, 4, 5], rng).where((i) => !taken.contains(i)).toList();
      for (final i in lines) {
        final near = [xs[i - 1], xs[i], xs[i + 1]];
        final free = _lanes5.where((x) => !near.contains(x)).toList();
        if (free.isEmpty) continue;
        items.add(RoadItem(x: free[(rng() * free.length).floor()], dz: dzs[i], window: .6, value: -(2 + 2 * r) * k));
        taken.add(i);
        break;
      }
    }
    final routes = [
      RoadRoute(
        id: 'snake',
        entry: RoadPoint(dzs[0] - 1, xs[0]),
        exit: xs.last,
        gain: _sum(values),
        waypoints: [for (var i = 0; i < dzs.length; i++) RoadPoint(dzs[i], xs[i])],
      ),
    ];
    add(stage,
        (id, z) => RoadRow.of(kind: 'pickups', id: id, stage: stage, z: z, shape: 'snake', window: 1, items: items, routes: routes));
    intended += _sum(values);
  }

  void grid(int stage, double k) {
    const dzs = <double>[-18, -12, -6, 0];
    final items = <RoadItem>[];
    final blues = <List<double>>[];
    final red3 = math.max(3 * k, unit(k));
    for (final dz in dzs) {
      final red = ((rng() * 3).floor() - 1).toDouble();
      blues.add([-1.0, 0.0, 1.0].where((x) => x != red).toList());
      for (final x in const [-1.0, 0.0, 1.0]) {
        items.add(RoadItem(x: x, dz: dz, window: .4, value: x == red ? -red3 : k));
      }
    }
    // Путь: в каждой строке синее, ближайшее к тому, где палец уже стоит.
    List<RoadPoint> walk(int from, double x0) {
      var x = x0;
      final out = <RoadPoint>[];
      for (var i = 0; i < dzs.length - from; i++) {
        if (i > 0) {
          final c = [...blues[from + i]]..sort((a, b) {
              final d = (a - x).abs() - (b - x).abs();
              return d != 0 ? d.sign.toInt() : (a - b).sign.toInt();
            });
          x = c[0];
        }
        out.add(RoadPoint(dzs[from + i], x));
      }
      return out;
    }

    final routes = [
      for (final x0 in blues[0])
        RoadRoute(
          id: 'grid${x0 < 0 ? 'L' : x0 > 0 ? 'R' : 'C'}',
          entry: RoadPoint(dzs[0] - 1, x0),
          exit: walk(0, x0).last.x,
          gain: dzs.length * k,
          waypoints: walk(0, x0),
        ),
    ];
    add(stage,
        (id, z) => RoadRow.of(kind: 'pickups', id: id, stage: stage, z: z, shape: 'grid', window: 1, items: items, routes: routes));
    intended += dzs.length * k;
  }

  void columns(int stage, double k) {
    final pair = _columns[columnsSeen++ % _columns.length](unit(k));
    final good = pair[0], bad = pair[1];
    final leftGood = rng() < .5;
    final left = leftGood ? good : bad, right = leftGood ? bad : good;
    const dzs = <double>[-14, -10, -6, -2];
    final items = [
      for (var i = 0; i < dzs.length; i++) ...[
        RoadItem(x: -.5, dz: dzs[i], half: .5, window: .6, value: left[i]),
        RoadItem(x: .5, dz: dzs[i], half: .5, window: .6, value: right[i]),
      ],
    ];
    final routes = [
      for (final (id, x, values) in [('left', -.5, left), ('right', .5, right)])
        RoadRoute(id: id, entry: RoadPoint(-17, x), exit: x, gain: _sum(values), waypoints: [RoadPoint(-2, x)]),
    ];
    add(
        stage,
        (id, z) => RoadRow.of(
              kind: 'pickups',
              id: id,
              stage: stage,
              z: z,
              shape: 'columns',
              window: 1,
              items: items,
              divider: const RoadDivider(fromDz: -17, toDz: 0, gap: .25),
              routes: routes,
            ));
    intended += math.max(_sum(left), _sum(right));
  }

  void ramp(int stage, double k) {
    final lane = rng() < .5 ? -1.0 : 1.0;
    final red = round5(math.max(8 * k, intended / 3));
    // Площадка сама зовёт к себе; синие-приманки — в дальнем краю, и после них не успеть на площадку.
    final items = [
      RoadItem(x: -lane, dz: -17, window: .6, value: k),
      RoadItem(x: -lane, dz: -13, window: .6, value: 2 * k),
      RoadItem(x: -lane, dz: -9, window: .6, value: 3 * k),
      RoadItem(x: 0, dz: -5, window: 1, half: 1.6, value: -red),
    ];
    final routes = [
      RoadRoute(id: 'jump', entry: RoadPoint(-15, lane), exit: lane, gain: 0, waypoints: [RoadPoint(-13, lane)]),
      RoadRoute(
        id: 'bait',
        entry: RoadPoint(-18, -lane),
        exit: -lane,
        gain: 6 * k - red,
        waypoints: [RoadPoint(-17, -lane), RoadPoint(-13, -lane), RoadPoint(-9, -lane)],
      ),
    ];
    add(
        stage,
        (id, z) => RoadRow.of(
              kind: 'pickups',
              id: id,
              stage: stage,
              z: z,
              shape: 'ramp',
              window: 1,
              items: items,
              jump: RoadJump(lane: lane, launchOffset: 14, landingOffset: 1, height: 2.8),
              routes: routes,
            ));
  }

  void walls(int stage, double k) {
    final n = wallsSeen++;
    if (n % 3 == 0) {
      operation(stage, [for (final v in share(k, const [.1, .25, .4])) '−${_n(v)}']); // меньший минус, разница видна сразу
    } else if (n % 3 == 1) {
      operation(stage, [for (final v in share(k, const [.1, .13, .16])) '−${_n(v)}']); // меньший минус из близких чисел
    } else {
      operation(stage, [for (final v in share(k, const [.15, .3])) '−${_n(v)}', '+${_n(2 * k)}']); // среди минусов есть плюс
    }
  }

  /// ×2 против +N (в вебе — `double`; в Dart имя занято типом): выгоднее удвоить, только если твоё число больше N.
  void doubling(int stage, double k, double factor) =>
      operation(stage, ['×2', '+${_n(round5(intended * factor))}', '−${_n(round5(intended * .2))}']);

  void bridge(int stage, double lane) => add(
      stage,
      (id, z) => RoadRow.of(
            kind: 'obstacle',
            id: id,
            stage: stage,
            z: z,
            terrain: 'bridge',
            span: 12,
            penalties: [for (final l in const [-1.0, 0.0, 1.0]) l == lane ? 0 : 1],
          ));

  void jump(int stage, double lane) => add(
      stage,
      (id, z) => RoadRow.of(
            kind: 'obstacle',
            id: id,
            stage: stage,
            z: z,
            terrain: 'jump',
            span: 12,
            penalties: const [1, 1, 1],
            jump: RoadJump(lane: lane, launchOffset: 14, landingOffset: 1, height: 2.8),
          ));

  void block(int stage, double k) {
    final penalties = runnerShuffle([2 * k, 6 * k, 0.0], rng);
    add(stage,
        (id, z) => RoadRow.of(kind: 'obstacle', id: id, stage: stage, z: z, terrain: 'block', span: 0, penalties: penalties));
  }

  void gap(int stage) {
    final penalties = runnerShuffle(const [1.0, 0.0, 0.0], rng);
    add(stage,
        (id, z) => RoadRow.of(kind: 'obstacle', id: id, stage: stage, z: z, terrain: 'gap', span: 12, penalties: penalties));
  }

  void stageLine(int stage) => add(
      stage,
      (id, z) => RoadRow.of(
            kind: 'gate',
            id: id,
            stage: stage,
            z: z,
            checkpoint: true,
            rules: const [RoadRule.any],
            stageEnd: true,
          ));

  // ── Станции хаба «Счёт» ──────────────────────────────────────────────────────────────────────

  /// Блиц-арки («Мат. спринт»): пример над дорогой, три арки с ответами; места вариантов
  /// равноправны — промежутки независимы и одинаковы, ответ на случайном месте.
  void blitz(int stage, double k, BlitzTask problem) {
    final answer = problem.answer;
    final steps = answer >= 0 && answer < 10 ? const [1.0, 2.0] : const [1.0, 2.0, 10.0];
    double step() => steps[(rng() * steps.length).floor()];
    List<double>? options;
    for (var t = 0; t < 20 && options == null; t++) {
      final at = <double>[0, step()];
      at.add(at[1] + step());
      final place = (rng() * 3).floor();
      final o = [for (final x in at) answer + x - at[place]];
      if (answer < 0 || o.every((v) => v >= 0)) options = o;
    }
    final shuffled = runnerShuffle(options ?? [answer, answer + 1, answer + 2], rng);
    final reward = math.max(2 * k, round5(intended * .1));
    add(
        stage,
        (id, z) => RoadRow.of(
              kind: 'answer',
              id: id,
              stage: stage,
              z: z,
              station: 'blitz',
              prompt: problem.display,
              options: shuffled,
              correct: shuffled.indexOf(answer),
              reward: reward,
              penalty: reward,
            ));
    intended += reward;
  }

  /// Ряд на арках («Паттерны»): члены ряда на табло, три продолжения на арках.
  void pattern(int stage, double k, PatternTask seq) {
    final options = seq.options.take(3).toList();
    final reward = math.max(2 * k, round5(intended * .1));
    final prompt = '${seq.items.map((v) => '$v'.replaceFirst('-', '−')).join(' • ')} • ?';
    add(
        stage,
        (id, z) => RoadRow.of(
              kind: 'answer',
              id: id,
              stage: stage,
              z: z,
              station: 'pattern',
              prompt: prompt,
              options: options,
              correct: options.indexOf(seq.answer),
              reward: reward,
              penalty: reward,
            ));
    intended += reward;
  }

  /// Шкала («Мат. шкала»): поперёк дороги числовая прямая [min, max], над ней выражение.
  void scale(int stage, double k, ScaleTask q) {
    final reward = math.max(3 * k, round5(intended * .12));
    final x = (q.answer - q.min) / (q.max - q.min) * 2 - 1;
    add(
        stage,
        (id, z) => RoadRow.of(
              kind: 'scale',
              id: id,
              stage: stage,
              z: z,
              station: 'scale',
              prompt: q.prompt,
              min: q.min,
              max: q.max,
              answer: q.answer,
              ticks: q.ticks,
              tolerance: .1,
              reward: reward,
              penalty: reward,
              routes: [
                RoadRoute(id: 'scale', entry: RoadPoint(-8, x), exit: x, gain: reward, waypoints: [RoadPoint(0, x)]),
              ],
            ));
    intended += reward;
  }

  /// Память в пути (OSpan): знаки проплывают над дорогой по одному — запомнить порядок.
  void memoryShow(int stage, double k, List<String> symbols) {
    final dzs = [
      for (var i = 0; i < symbols.length; i++) symbols.length == 1 ? -9.0 : -18 + i * 18 / (symbols.length - 1),
    ];
    add(
        stage,
        (id, z) => RoadRow.of(
              kind: 'pickups',
              id: id,
              stage: stage,
              z: z,
              shape: 'memory-show',
              station: 'memory',
              window: 1,
              items: const [],
              show: RoadShow(symbols: symbols, dzs: dzs),
            ));
  }

  /// Вспомнить: по строке на знак, в строке три знака; верный на пути (+1), чужие вне пути (−1).
  /// Это ворота «ровно N» с целью N: ровно N только когда взяты все верные и ни одного чужого.
  void memoryRecall(int stage, double k, List<String> symbols) {
    final n = symbols.length;
    final lines = exactLines.sublist(0, n);
    final path = [((rng() * 3).floor() - 1).toDouble()];
    for (var i = 1; i < n; i++) {
      final options = [-1.0, 0.0, 1.0].where((l) => (l - path[i - 1]).abs() <= 1).toList();
      path.add(options[(rng() * options.length).floor()]);
    }
    final items = <RoadItem>[];
    for (var i = 0; i < lines.length; i++) {
      final others = runnerShuffle(memorySymbols.where((s) => s != symbols[i]).toList(), rng);
      var o = 0;
      for (final x in const [-1.0, 0.0, 1.0]) {
        items.add(x == path[i]
            ? RoadItem(x: x, dz: lines[i], window: .4, value: 1, part: true, symbol: symbols[i])
            : RoadItem(x: x, dz: lines[i], window: .4, value: -1, part: true, symbol: others[o++]));
      }
    }
    final bonus = math.max(3 * k, round5(intended * .15));
    add(
        stage,
        (id, z) => RoadRow.of(
              kind: 'pickups',
              id: id,
              stage: stage,
              z: z,
              shape: 'memory-recall',
              station: 'memory',
              window: 1,
              items: items,
              recall: true,
              exact: RoadExact(target: n.toDouble(), bonus: bonus, unit: k),
              routes: [
                RoadRoute(
                  id: 'recall',
                  entry: RoadPoint(lines[0] - 1, path[0]),
                  exit: path.last,
                  gain: bonus,
                  waypoints: [for (var i = 0; i < lines.length; i++) RoadPoint(lines[i], path[i])],
                ),
              ],
            ));
    intended += bonus;
  }

  /// Ворота «ровно N» («Состав числа»): числа-части по строкам, собрать ровно N. Путь строится
  /// первым: полоса на строку, соседние строки — не дальше соседней полосы; числа решения — на
  /// пути, лишние — только вне пути.
  void exact(int stage, double k, ExactTask puzzle) {
    final solution = subsetFor(puzzle.target, puzzle.chips);
    if (solution == null) throw StateError('Exact puzzle without a solution: ${_n(puzzle.target)}');
    final path = [((rng() * 3).floor() - 1).toDouble()];
    for (var i = 1; i < exactLines.length; i++) {
      final options = [-1.0, 0.0, 1.0].where((l) => (l - path[i - 1]).abs() <= 1).toList();
      path.add(options[(rng() * options.length).floor()]);
    }
    final lines = runnerShuffle([for (var i = 0; i < exactLines.length; i++) i], rng).sublist(0, solution.length)
      ..sort();
    final items = <RoadItem>[];
    final rest = [...puzzle.chips];
    for (final v in solution) {
      rest.removeAt(rest.indexOf(v));
    }
    for (var i = 0; i < solution.length; i++) {
      items.add(RoadItem(x: path[lines[i]], dz: exactLines[lines[i]], window: .4, value: solution[i], part: true));
    }
    final free = runnerShuffle([
      for (var i = 0; i < exactLines.length; i++)
        for (final l in const [-1.0, 0.0, 1.0])
          if (l != path[i]) RoadPoint(exactLines[i], l),
    ], rng);
    final extra = rest.length < free.length ? rest.length : free.length;
    for (var i = 0; i < extra; i++) {
      items.add(RoadItem(x: free[i].x, dz: free[i].dz, window: .4, value: rest[i], part: true));
    }
    final bonus = math.max(3 * k, round5(intended * .15));
    final routes = [
      RoadRoute(
        id: 'exact',
        entry: RoadPoint(exactLines[0] - 1, path[0]),
        exit: path.last,
        gain: bonus,
        waypoints: [for (var i = 0; i < exactLines.length; i++) RoadPoint(exactLines[i], path[i])],
      ),
    ];
    add(
        stage,
        (id, z) => RoadRow.of(
              kind: 'pickups',
              id: id,
              stage: stage,
              z: z,
              shape: 'exact',
              station: 'exact',
              window: 1,
              items: items,
              exact: RoadExact(target: puzzle.target, bonus: bonus, unit: k),
              routes: routes,
            ));
    intended += bonus;
  }
}

/// Первое найденное подмножество с суммой цели — не длиннее числа строк ворот.
List<double>? subsetFor(double target, List<double> chips) {
  final n = chips.length;
  List<double>? best;
  for (var mask = 1; mask < 1 << n; mask++) {
    var s = 0.0;
    var c = 0;
    for (var i = 0; i < n; i++) {
      if (mask & (1 << i) != 0) {
        s += chips[i];
        c++;
      }
    }
    if (s == target && c <= exactLines.length && (best == null || c < best.length)) {
      best = [
        for (var i = 0; i < n; i++)
          if (mask & (1 << i) != 0) chips[i],
      ];
    }
  }
  return best;
}
