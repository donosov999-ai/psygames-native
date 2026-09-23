/// ПРАВИЛА «ПАТТЕРНОВ» — перенос ядра frontend/src/games/counting/patternSequences.ts.
///
/// Игрок видит ряд чисел и называет следующее. Лестница задаётся не числом, а
/// КЛАССОМ ряда: арифметический → геометрический → квадраты и кубы → Фибоначчи →
/// растущая разность → «посмотри и скажи» → переплетённые → линейный → два
/// действия по очереди → два разных ряда через один → смена знака, а с 23-го
/// уровня — смесь трудных классов, где вид ряда уровень уже не называет и растут
/// только числа (`mixScale`), без потолка.
///
/// 🔴 ДВА ЗАСЛОНА, БЕЗ КОТОРЫХ ИГРА ОБМАНЫВАЕТ, И ОБА ПЕРЕНЕСЕНЫ ЦЕЛИКОМ:
/// · `readings`/`fair` — ряд уходит игроку, только если самые проверенные его
///   прочтения сходятся на одном ответе. Иначе «2, 3, 5, 8» честно читается и
///   как Фибоначчи (13), и как растущая разность (12);
/// · `makeOptions` — варианты ответа не выдают ответ своими числами. До правки
///   17.09.2026 приём «бери вариант, ближайший к среднему» угадывал 73–85 % при
///   случайных 25 %. Промежутки берутся независимо, место ответа случайно.
library;

import 'dart:math' as math;

import '../../shell/js_compat.dart' show Rng, jsRound;

export '../../shell/js_compat.dart' show Rng, createRng;

int _rnd(Rng rng, int n) => (rng() * n).floor();

List<T> _shuffle<T>(List<T> arr, Rng rng) {
  final a = List<T>.of(arr);
  for (var i = a.length - 1; i > 0; i -= 1) {
    final j = (rng() * (i + 1)).floor();
    final t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/// Действие для подсказки. Пробел НЕРАЗРЫВНЫЙ: на 360 подсказка переносилась
/// между «×» и числом (кадр 17.09.2026).
String _plus(num v) => v < 0 ? '− ${-v}' : '+ $v';
String _times(num v) => v < 0 ? '× (−${-v})' : '× $v';

class Sequence {
  const Sequence({
    required this.items,
    required this.answer,
    required this.classKey,
    required this.ruleKey,
    this.ruleParams,
  });

  final List<int> items;
  final int answer;
  final String classKey, ruleKey;
  final Map<String, Object>? ruleParams;
}

// ───────────────────────────── Генераторы классов ────────────────────────────

Sequence _arithmetic(Rng rng) {
  final start = 1 + _rnd(rng, 9), step = 2 + _rnd(rng, 6);
  return Sequence(
    items: [start, start + step, start + 2 * step, start + 3 * step],
    answer: start + 4 * step,
    classKey: 'patternClassArithmetic',
    ruleKey: 'patternRuleArithmetic',
    ruleParams: {'n': step},
  );
}

Sequence _geometric(Rng rng) {
  final start = 2 + _rnd(rng, 3), r = 2 + _rnd(rng, 2);
  return Sequence(
    items: [start, start * r, start * r * r, start * r * r * r],
    answer: start * r * r * r * r,
    classKey: 'patternClassGeometric',
    ruleKey: 'patternRuleGeometric',
    ruleParams: {'n': r},
  );
}

Sequence _squares(Rng rng) {
  final s = 1 + _rnd(rng, 4);
  return Sequence(
    items: [s * s, (s + 1) * (s + 1), (s + 2) * (s + 2), (s + 3) * (s + 3)],
    answer: (s + 4) * (s + 4),
    classKey: 'patternClassSquares',
    ruleKey: 'patternRuleSquares',
    ruleParams: {'a': s, 'b': s + 1, 'c': s + 2},
  );
}

Sequence _cubes(Rng rng) {
  final s = 1 + _rnd(rng, 2);
  return Sequence(
    items: [s * s * s, (s + 1) * (s + 1) * (s + 1), (s + 2) * (s + 2) * (s + 2)],
    answer: (s + 3) * (s + 3) * (s + 3),
    classKey: 'patternClassCubes',
    ruleKey: 'patternRuleCubes',
    ruleParams: {'a': s, 'b': s + 1},
  );
}

Sequence _fibonacci(Rng rng, [int s = 1]) {
  var a = 1 + _rnd(rng, 3 * s);
  var b = a + 1 + _rnd(rng, 2 * s);
  final all = <int>[a, b];
  for (var i = 0; i < 3; i += 1) {
    final c = a + b;
    all.add(c);
    a = b;
    b = c;
  }
  return Sequence(
    items: all.sublist(0, 4),
    answer: all[4],
    classKey: 'patternClassFibonacci',
    ruleKey: 'patternRuleFibonacci',
  );
}

Sequence _growingDiff(Rng rng, [int s = 1]) {
  final start = 1 + _rnd(rng, 5 * s), baseStep = 1 + _rnd(rng, 3 * s);
  final items = <int>[start];
  var d = baseStep;
  for (var i = 0; i < 3; i += 1) {
    items.add(items.last + d);
    d += 1;
  }
  return Sequence(
    items: items,
    answer: items[3] + d,
    classKey: 'patternClassGrowingDiff',
    ruleKey: 'patternRuleGrowingDiff',
    ruleParams: {'a': baseStep, 'b': baseStep + 1},
  );
}

Sequence _lookAndSay(Rng rng) {
  const seqs = [1, 11, 21, 1211, 111221, 312211];
  final i = _rnd(rng, 2);
  return Sequence(
    items: seqs.sublist(i, i + 4),
    answer: seqs[i + 4],
    classKey: 'patternClassLookSay',
    ruleKey: 'patternRuleLookSay',
  );
}

Sequence _interleaved(Rng rng) {
  final startO = 1 + _rnd(rng, 4), a = 1 + _rnd(rng, 3);
  final startE = 5 + _rnd(rng, 5), b = 5 + _rnd(rng, 6);
  return Sequence(
    items: [startO, startE, startO + a, startE + b],
    answer: startO + 2 * a,
    classKey: 'patternClassInterleaved',
    ruleKey: 'patternRuleInterleaved',
    ruleParams: {'a': a, 'b': b},
  );
}

/// L15: предыдущее × k и ± b. Разности растут в k раз — по ним правило и находят.
Sequence _linear(Rng rng, [int s = 1]) {
  final k = 2 + _rnd(rng, 2), a0 = 1 + _rnd(rng, 5 * s);
  final lo = math.max(-3 * s, 1 - (k - 1) * a0), hi = 5 * s;
  var b = lo + _rnd(rng, hi - lo + 1);
  if (b == 0) b = hi;
  final all = <int>[a0];
  for (var i = 0; i < 4; i += 1) {
    all.add(k * all[i] + b);
  }
  return Sequence(
    items: all.sublist(0, 4),
    answer: all[4],
    classKey: 'patternClassLinear',
    ruleKey: 'patternRuleLinear',
    ruleParams: {'a': k, 'b': _plus(b)},
  );
}

/// L17: «+ c» и «× m» по очереди. ПЯТЬ чисел, а не четыре: по четырём правило
/// «+3, ×2» неотличимо от «+3, +4 по очереди», и заслон отбросил бы такой ряд.
Sequence _twoOps(Rng rng, [int s = 1]) {
  final a0 = 1 + _rnd(rng, 4 * s),
      c = 1 + _rnd(rng, 8 * s),
      m = 2 + _rnd(rng, 2),
      mulFirst = _rnd(rng, 2) == 1;
  final all = <int>[a0];
  for (var i = 0; i < 5; i += 1) {
    all.add((i % 2 == 0) != mulFirst ? all[i] + c : all[i] * m);
  }
  final add = _plus(c), mul = _times(m);
  return Sequence(
    items: all.sublist(0, 5),
    answer: all[5],
    classKey: 'patternClassTwoOps',
    ruleKey: 'patternRuleTwoOps',
    ruleParams: mulFirst ? {'a': mul, 'b': add} : {'a': add, 'b': mul},
  );
}

class _Half {
  const _Half(this.kind, this.start, this.step);
  final String kind;
  final int start, step;
}

_Half _half(Rng rng, String kind, int s) => kind == 'add'
    ? _Half(kind, 1 + _rnd(rng, 9 * s), 2 + _rnd(rng, 8 * s))
    : _Half(kind, 1 + _rnd(rng, 4 * s), 2 + _rnd(rng, 2));

int _term(_Half h, int i) =>
    h.kind == 'add' ? h.start + i * h.step : h.start * math.pow(h.step, i).toInt();

/// L19: места 1,3,5… — один ряд, места 2,4,6… — другой, правила у них разные.
Sequence _interMixed(Rng rng, List<String> kinds, [int s = 1]) {
  final odd = _half(rng, kinds[0], s), even = _half(rng, kinds[1], s);
  final items = <int>[];
  for (final i in [0, 1, 2]) {
    items..add(_term(odd, i))..add(_term(even, i));
  }
  final answer = _term(odd, 3);
  if (odd.kind == 'add' && even.kind == 'add') {
    return Sequence(
      items: items,
      answer: answer,
      classKey: 'patternClassInterleaved',
      ruleKey: 'patternRuleInterleaved',
      ruleParams: {'a': odd.step, 'b': even.step},
    );
  }
  String op(_Half h) => h.kind == 'add' ? _plus(h.step) : _times(h.step);
  return Sequence(
    items: items,
    answer: answer,
    classKey: 'patternClassInterMixed',
    ruleKey: 'patternRuleInterMixed',
    ruleParams: {'a': op(odd), 'b': op(even)},
  );
}

/// L21: предыдущее × (−k) ± b. Знак меняется каждый шаг, а модуль растёт.
Sequence _signFlip(Rng rng, [int s = 1]) {
  final k = 2 + _rnd(rng, 2), a0 = 2 + _rnd(rng, 6 * s);
  final room = math.min(4 * s, (k - 1) * a0 - 1);
  var b = -room + _rnd(rng, 2 * room + 1);
  if (b == 0) b = room;
  final all = <int>[a0];
  for (var i = 0; i < 4; i += 1) {
    all.add(-k * all[i] + b);
  }
  return Sequence(
    items: all.sublist(0, 4),
    answer: all[4],
    classKey: 'patternClassSignFlip',
    ruleKey: 'patternRuleLinear',
    ruleParams: {'a': '(−$k)', 'b': _plus(b)},
  );
}

// ───────────────────────── Прочтения ряда и заслон честности ─────────────────
//
// Запас прочтения (`surplus`) — сколько показанных чисел сверх его свободных:
// столько чисел правило ПРОВЕРЯЮТ. Запас 0 ничего не доказывает — такие прочтения
// в список не попадают. Список правил ШИРЕ классов игры: человек видит в ряду и
// «шаги +3, +4 по очереди», и простые числа, которых генератор не выдаёт, — ряд,
// который так читается с другим ответом, игроку несправедлив.

class Reading {
  const Reading(this.rule, this.surplus, this.answer);
  final String rule;
  final int surplus;
  final int answer;
}

bool _whole(double v) =>
    v.isFinite && v == v.roundToDouble() && v.abs() <= 9007199254740991;

bool _all(int n, bool Function(int) ok) {
  for (var i = 0; i < n; i += 1) {
    if (!ok(i)) return false;
  }
  return true;
}

List<int> _steps(List<int> x) => [for (var i = 1; i < x.length; i += 1) x[i] - x[i - 1]];

double? _arithRead(List<int> x) {
  final d = x[1] - x[0];
  return _all(x.length - 1, (i) => x[i + 1] - x[i] == d) ? (x.last + d).toDouble() : null;
}

double? _geomRead(List<int> x) {
  if (x[0] == 0 || x[1] == 0 || !_all(x.length - 1, (i) => x[i + 1] * x[0] == x[i] * x[1])) {
    return null;
  }
  final next = x.last * x[1] / x[0];
  return _whole(next) ? next : null;
}

double _cbrt(double v) => v < 0 ? -math.pow(-v, 1 / 3).toDouble() : math.pow(v, 1 / 3).toDouble();

double? _powerRead(List<int> x, int e) {
  if (e == 2 && x[0] < 0) return null;
  final s = jsRound(e == 2 ? math.sqrt(x[0].toDouble()) : _cbrt(x[0].toDouble())).toInt();
  return _all(x.length, (i) => math.pow(s + i, e) == x[i])
      ? math.pow(s + x.length, e).toDouble()
      : null;
}

double? _sayAloud(double v) {
  if (!_whole(v) || v <= 0) return null;
  final s = v.toInt().toString();
  final out = StringBuffer();
  var i = 0;
  while (i < s.length) {
    var j = i;
    while (j < s.length && s[j] == s[i]) {
      j += 1;
    }
    out.write('${j - i}${s[i]}');
    i = j;
  }
  final text = out.toString();
  return text.length > 15 ? null : double.parse(text);
}

final List<int> _primes = (() {
  final p = <int>[];
  for (var v = 2; p.length < 300; v += 1) {
    if (p.every((q) => v % q != 0)) p.add(v);
  }
  return p;
})();

List<double> _interleavedReadings(List<int> x) {
  final halves = [
    [for (var i = 0; i < x.length; i += 2) x[i]],
    [for (var i = 1; i < x.length; i += 2) x[i]],
  ];
  if (!halves.every((h) => h.length >= 3)) return const [];   // у половины из двух чисел правило не проверить
  final own = halves[x.length % 2], other = halves[1 - (x.length % 2)];
  if (_arithRead(other) == null && _geomRead(other) == null) return const [];
  return [_arithRead(own), _geomRead(own)].whereType<double>().toList();
}

double? _twoOpsRead(List<int> x, bool mulFirst) {
  final addAt = mulFirst ? 1 : 0, mulAt = 1 - (mulFirst ? 1 : 0);
  if (x[mulAt] == 0) return null;
  final c = (x[addAt + 1] - x[addAt]).toDouble();
  final m = x[mulAt + 1] / x[mulAt];
  if (!_whole(m)) return null;
  double step(double v, int i) => i % 2 == addAt ? v + c : v * m;
  return _all(x.length - 1, (i) => x[i + 1] == step(x[i].toDouble(), i))
      ? step(x.last.toDouble(), x.length - 1)
      : null;
}

class _Reader {
  const _Reader(this.rule, this.free, this.read);
  final String rule;
  final int free;
  final double? Function(List<int>) read;
}

final List<_Reader> _readers = [
  _Reader('arithmetic', 2, _arithRead),
  _Reader('geometric', 2, _geomRead),
  _Reader('squares', 1, (x) => _powerRead(x, 2)),
  _Reader('cubes', 1, (x) => _powerRead(x, 3)),
  _Reader('primes', 1, (x) {
    final i = _primes.indexOf(x[0]);
    return i >= 0 && i + x.length < _primes.length && _all(x.length, (j) => _primes[i + j] == x[j])
        ? _primes[i + x.length].toDouble()
        : null;
  }),
  _Reader('look-say', 1, (x) =>
      _all(x.length - 1, (i) => _sayAloud(x[i].toDouble()) == x[i + 1]) ? _sayAloud(x.last.toDouble()) : null),
  _Reader('fibonacci', 2, (x) =>
      _all(x.length - 2, (i) => x[i + 2] == x[i + 1] + x[i]) ? (x.last + x[x.length - 2]).toDouble() : null),
  _Reader('growing-mul', 2, (x) {
    if (x[0] == 0 || !_whole(x[1] / x[0])) return null;
    final m = x[1] / x[0];
    return _all(x.length - 1, (i) => x[i + 1] == x[i] * (m + i))
        ? x.last * (m + x.length - 1)
        : null;
  }),
  _Reader('growing-by-one', 2, (x) {
    final d = _steps(x);
    return _all(d.length - 1, (i) => d[i + 1] - d[i] == 1) ? (x.last + d.last + 1).toDouble() : null;
  }),
  _Reader('second-difference', 3, (x) {
    final d = _steps(x);
    final a = _arithRead(d);
    return a == null ? null : x.last + a;
  }),
  _Reader('linear', 3, (x) {
    if (x[1] == x[0]) return null;
    final k = (x[2] - x[1]) / (x[1] - x[0]);
    final b = x[1] - k * x[0];
    return _whole(k) && _all(x.length - 1, (i) => x[i + 1] == k * x[i] + b) ? k * x.last + b : null;
  }),
  _Reader('alternating-steps', 3, (x) {
    final d = _steps(x);
    return _all(d.length, (i) => d[i] == d[i % 2]) ? (x.last + d[(x.length - 1) % 2]).toDouble() : null;
  }),
  _Reader('alternating-ratios', 3, (x) {
    if (x[0] == 0 || x[1] == 0) return null;
    final r = [x[1] / x[0], x[2] / x[1]];
    return r.every(_whole) && _all(x.length - 1, (i) => x[i + 1] == x[i] * r[i % 2])
        ? x.last * r[(x.length - 1) % 2]
        : null;
  }),
  _Reader('add-then-mul', 3, (x) => _twoOpsRead(x, false)),
  _Reader('mul-then-add', 3, (x) => _twoOpsRead(x, true)),
];

List<Reading> readings(List<int> items) {
  final out = <Reading>[];
  for (final r in _readers) {
    if (items.length <= r.free || items.length < 3) continue;
    final answer = r.read(items);
    if (answer != null && _whole(answer)) {
      out.add(Reading(r.rule, items.length - r.free, answer.toInt()));
    }
  }
  for (final answer in _interleavedReadings(items)) {
    out.add(Reading('interleaved', items.length - 4, answer.toInt()));
  }
  return out;
}

/// ЧЕСТЕН ЛИ РЯД. Самые проверенные прочтения обязаны сходиться на ответе ряда.
/// `proof: false` — полоса, чей ряд числами не подтверждается (L13–14): там
/// нечестно ЛЮБОЕ прочтение с другим ответом.
bool fair(List<int> items, int answer, {bool proof = true}) {
  final r = readings(items);
  if (!proof) return r.every((x) => x.answer == answer);
  if (r.isEmpty) return false;
  final best = r.map((x) => x.surplus).reduce(math.max);
  final top = r.where((x) => x.surplus == best).toList();
  return top.isNotEmpty && top.every((x) => x.answer == answer);
}

// ─────────────────────────────── Лестница классов ────────────────────────────

class _Band {
  const _Band(this.upTo, this.label, this.proof, this.gen);
  final int upTo;
  final String label;
  final bool proof;
  final Sequence Function(Rng) gen;
}

final List<_Band> _bands = [
  _Band(2, 'patternClassArithmetic', true, _arithmetic),
  _Band(4, 'patternClassGeometric', true, _geometric),
  _Band(6, 'patternClassSquaresCubes', true, (rng) => _rnd(rng, 2) != 0 ? _squares(rng) : _cubes(rng)),
  _Band(8, 'patternClassFibonacci', true, (rng) => _fibonacci(rng)),
  _Band(10, 'patternClassGrowingDiff', true, (rng) => _growingDiff(rng)),
  _Band(12, 'patternClassLookSayHint', true, _lookAndSay),
  _Band(14, 'patternClassInterleaved', false, _interleaved),
  _Band(16, 'patternClassLinear', true, (rng) => _linear(rng)),
  _Band(18, 'patternClassTwoOps', true, (rng) => _twoOps(rng)),
  _Band(20, 'patternClassInterMixed', true,
      (rng) => _interMixed(rng, _rnd(rng, 2) != 0 ? ['add', 'mul'] : ['mul', 'add'])),
  _Band(22, 'patternClassSignFlip', true, (rng) => _signFlip(rng)),
];

/// С этого уровня — смесь трудных классов: какой выпадет, уровень не говорит.
final int mixFrom = _bands.last.upTo + 1;

final List<Sequence Function(Rng, int)> _mix = [
  (rng, s) => _fibonacci(rng, s),
  (rng, s) => _growingDiff(rng, s),
  (rng, s) => _linear(rng, s),
  (rng, s) => _twoOps(rng, s),
  (rng, s) => _signFlip(rng, s),
  (rng, s) => _interMixed(
      rng, [_rnd(rng, 2) != 0 ? 'add' : 'mul', _rnd(rng, 2) != 0 ? 'add' : 'mul'], s),
];

/// Масштаб чисел смеси: растёт на единицу каждые два уровня и не упирается ни во что.
int mixScale(int level) => level < mixFrom ? 1 : 1 + ((level - mixFrom) / 2).floor();

Sequence pickSequence(int level, Rng rng) {
  for (final b in _bands) {
    if (level <= b.upTo) return b.gen(rng);
  }
  return _mix[_rnd(rng, _mix.length)](rng, mixScale(level));
}

String levelLabelKey(int level) {
  for (final b in _bands) {
    if (level <= b.upTo) return b.label;
  }
  return 'patternClassMixed';
}

/// Полный перебор пространств всех генераторов (449 рядов) нашёл ровно два
/// неоднозначных префикса: [2,3,5,8] и [4,5,7,10]. Первый ловит и сам заслон,
/// второй — нет, поэтому список оставлен.
const Set<String> _ambiguousItems = {'2,3,5,8', '4,5,7,10'};

Sequence makeSequence(int level, Rng rng) {
  var proof = true;
  for (final b in _bands) {
    if (level <= b.upTo) {
      proof = b.proof;
      break;
    }
  }
  for (var guard = 0; guard < 50; guard += 1) {
    final s = pickSequence(level, rng);
    if (!_ambiguousItems.contains(s.items.join(',')) && fair(s.items, s.answer, proof: proof)) {
      return s;
    }
  }
  return _arithmetic(rng);   // практически недостижимо
}

/// ВАРИАНТЫ ОТВЕТА. 🔴 По одним числам вариантов, не глядя на ряд, ответ не
/// угадать: места равноправны. До правки 17.09.2026 неверные ставились вокруг
/// ответа, и приём «бери ближайший к среднему» угадывал 73–85 % при случайных 25 %.
/// Промежутки между соседями берутся независимо и одинаково, место ответа
/// случайно, а лесенка сдвигается к нему.
List<int> makeOptions(int answer, Rng rng, {int count = 4}) {
  final unit = 2 * math.max(1, jsRound(answer.abs() * 0.075).toInt()).toInt();
  final place = _rnd(rng, count);
  final at = <int>[0];
  for (var i = 1; i < count; i += 1) {
    at.add(at[i - 1] + unit * (1 + _rnd(rng, 2)));
  }
  return _shuffle([for (final x in at) answer + x - at[place]], rng);
}

/// Порог прохождения партии — семь попаданий из десяти.
const double passHitRate = 0.7;

/// Проб в партии по умолчанию (игрок может выбрать 5/10/15).
const int trialsPerRound = 10;

// ────────────────────── Раскладка ряда — ПРАВИЛО, а не вёрстка ───────────────
//
// Ряд вместе с «?» встаёт в ОДНУ строку, пока это возможно. Замер 17.09.2026
// живьём в сборке: поле под ряд 352 точки на 375–430 и 340 на 360. Пять клеток
// по 64 с зазором 8 — ровно 352, поэтому на 360 «?» уезжал на вторую строку уже
// на первом уровне, а ряды из шести и семи клеток (L17, L19) переносились и на 390.
// Ширина знака — 0,66 кегля и 4 точки на рамки: при 0,62 без рамок ряды
// «5 −8 18 −34 ?» и «139 211 350 561 ?» на 360 всё равно переносились.
// Число не влезает и на кегле 16 (смесь далеко за L100) — тогда перенос строки.

class CellSize {
  const CellSize({required this.font, required this.pad, required this.gap, required this.cell, required this.fits});
  final double font, pad, gap, cell;
  final bool fits;
}

CellSize cellSize(double width, List<String> labels) {
  final cells = labels.length;
  final chars = labels.map((l) => l.length).reduce(math.max);
  CellSize variant(double font) {
    final pad = font >= 24 ? 8.0 : 5.0;
    final gap = font >= 24 ? 8.0 : 6.0;
    final need = (chars * font * 0.66).ceilToDouble() + 2 * pad + 4;
    final room = ((width - gap * (cells - 1)) / cells).floorToDouble();
    return CellSize(
      font: font,
      pad: pad,
      gap: gap,
      cell: math.max(need, math.min(64.0, room)),
      fits: need <= room,
    );
  }

  if (width == 0) return const CellSize(font: 24, pad: 8, gap: 8, cell: 64, fits: true);
  for (final font in [24.0, 20.0, 18.0, 16.0]) {
    final v = variant(font);
    if (v.fits) return v;
  }
  return variant(16);
}

/// Высота клетки ряда — от кегля, как в вебе (`minHeight` в `cellStyle`).
double cellHeight(double font) => font >= 24 ? 64 : (font >= 20 ? 56 : 48);

// ────────────────────────── Подписи классов и правил ─────────────────────────
//
// Перенос русских строк из словаря веб-версии (LanguageContext, patternClass*/
// patternRule*) — не сочинение заново: подсказка обязана звучать теми же словами,
// что в нынешнем приложении, иначе игрок увидит два разных объяснения одного ряда.
// Плейсхолдеры {a}/{b}/{c}/{n} заполняются числами правила (`ruleParams`).

const Map<String, String> patternClassRu = {
  'patternClassArithmetic': 'Арифметическая прогрессия',
  'patternClassGeometric': 'Геометрическая прогрессия',
  'patternClassSquares': 'Квадраты чисел',
  'patternClassCubes': 'Кубы чисел',
  'patternClassSquaresCubes': 'Квадраты и кубы',
  'patternClassFibonacci': 'Похоже на Фибоначчи',
  'patternClassGrowingDiff': 'Растущая разность',
  'patternClassLookSay': '«Посмотри и скажи»',
  'patternClassLookSayHint': '«Посмотри и скажи» (нужна подсказка)',
  'patternClassInterleaved': 'Два переплетённых ряда',
  'patternClassLinear': 'Умножь и прибавь',
  'patternClassTwoOps': 'Два действия по очереди',
  'patternClassInterMixed': 'Два разных ряда через один',
  'patternClassSignFlip': 'Знак меняется каждый шаг',
  'patternClassMixed': 'Любой из трудных рядов — числа растут с уровнем',
};

const Map<String, String> patternRuleRu = {
  'patternRuleArithmetic': 'Каждый член больше на {n}',
  'patternRuleGeometric': 'Каждый член умножается на {n}',
  'patternRuleSquares': 'n²: {a}², {b}², {c}², …',
  'patternRuleCubes': 'n³: {a}³, {b}³, …',
  'patternRuleFibonacci': 'Сумма двух предыдущих',
  'patternRuleGrowingDiff': 'Разность растёт на 1 каждый шаг ({a}, {b}, …)',
  'patternRuleLookSay': 'Читай предыдущий вслух: «один 1» → 11, «два 1 один 2» …',
  'patternRuleInterleaved':
      'Позиции 1,3,5… растут на {a}; позиции 2,4… на {b}. Нужна следующая нечётная',
  'patternRuleLinear': 'Каждое число — предыдущее × {a}, потом {b}',
  'patternRuleTwoOps': 'Действия чередуются: {a}, потом {b}, снова {a}…',
  'patternRuleInterMixed':
      'Позиции 1,3,5…: каждый раз {a}; позиции 2,4…: {b}. Нужна следующая нечётная',
};

String fillParams(String template, Map<String, Object>? params) {
  if (params == null) return template;
  var out = template;
  params.forEach((key, value) {
    out = out.replaceAll('{$key}', '$value');
  });
  return out;
}

/// Минус в числах ряда — ТИПОГРАФСКИЙ, как в вебе: дефис в колонке цифр читается
/// как перенос.
String showNumber(int v) => v.toString().replaceAll('-', '−');

/// Выбор клетки под ШИРИНУ И ВЫСОТУ поля.
///
/// 🔴 В вебе высоты не было: страница прокручивалась, и ряд просто рос вниз.
/// Здесь поле получает высоту ЧИСЛОМ от каркаса, и ряд обязан в неё уложиться —
/// первая проба раскладки поймала переполнение на 23 точки. Поэтому к подбору
/// по ширине добавлен подбор по высоте: берётся самый крупный кегль, при котором
/// клетка вместе с вопросом и подсказкой влезает в отданную высоту.
CellSize cellSizeFor(double width, double height, List<String> labels, {bool hasHint = false}) {
  final reserved = 28.0 + (hasHint ? 76.0 : 0.0);   // строка вопроса и коробка подсказки
  final room = height - reserved;
  final byWidth = cellSize(width, labels);
  if (cellHeight(byWidth.font) <= room) return byWidth;
  for (final font in [20.0, 18.0, 16.0]) {
    if (font >= byWidth.font) continue;
    final v = cellSize(width, labels);
    final candidate = CellSize(
      font: font,
      pad: font >= 24 ? 8 : 5,
      gap: font >= 24 ? 8 : 6,
      cell: math.min(v.cell, math.max(font * 2, v.cell)),
      fits: v.fits,
    );
    if (cellHeight(font) <= room) return candidate;
  }
  return CellSize(font: 16, pad: 5, gap: 6, cell: byWidth.cell, fits: byWidth.fits);
}
