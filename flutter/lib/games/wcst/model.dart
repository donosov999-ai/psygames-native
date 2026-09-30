/// WCST — «Сортировка карт», шестнадцатая игра раздела «Конфликт внимания».
///
/// Правила перенесены из `frontend/app/games/wcst.tsx` (VER 2); эталон выгружен
/// прогоном живого TS в `test/fixtures/wcst-reference.json`.
///
/// 🔴 ГЛАВНАЯ МЕРА — ПЕРСЕВЕРАТИВНЫЕ ОШИБКИ: ответы по СТАРОМУ правилу после
/// того, как оно молча сменилось. Рядом — `rule_catch_mean`, за сколько ходов
/// человек перехватывает новое правило.
///
/// 🔴 РАЗВОДЯЩАЯ КАРТА — ТА, ЧЕЙ ВЫБОР ВЫДАЁТ ПРАВИЛО. У четырёх эталонов все
/// цвета, формы и числа различны, поэтому каждый признак карты указывает ровно
/// на один эталон. Дальше три случая:
///   три РАЗНЫХ эталона — чтобы ответить, надо знать правило (разводящая);
///   два эталона        — одно правило неотличимо от другого;
///   ОДИН эталон        — любое правило даёт тот же ответ: ошибиться нельзя, и
///                        проба не сообщает, каким правилом играли.
///
/// ⚠️ В равномерной раздаче разводящих ровно 24/64 = 0,375 — это СЧИТАЕТСЯ, а не
/// замеряется: 4 эталона, 4³ = 64 карты, разводящих 4·3·2 = 24. Симуляция на
/// 200 000 карт даёт 0,3748 — те же числа в пределах шума.
///
/// 🔴 ТРЕТЬЯ ОСЬ — ДОЛЯ РАЗВОДЯЩИХ КАРТ, и она единственная в разделе, что НЕ
/// тратит измерение, а чинит его. Карта одного эталона верна при любом правиле,
/// и «перехват за 1 ход» на ней записывался, хотя человек ничего не
/// перехватывал. Ось убирает дармовые единицы: трудность вверх и мера чище
/// одновременно.
library;

import 'dart:math';

enum CardColor { r, g, b, y }

enum CardShape { circle, triangle, square, star }

enum SortRule { color, shape, count }

/// Карта: цвет, форма, число фигур.
class WcstCard {
  const WcstCard({required this.color, required this.shape, required this.count});
  final CardColor color;
  final CardShape shape;
  final int count;

  @override
  bool operator ==(Object other) =>
      other is WcstCard && other.color == color && other.shape == shape && other.count == count;

  @override
  int get hashCode => Object.hash(color, shape, count);

  @override
  String toString() => '${color.name}/${shape.name}/$count';
}

/// Четыре эталона: у каждого свои цвет, форма и число — как в классическом WCST.
const List<WcstCard> wcstRefCards = [
  WcstCard(color: CardColor.r, shape: CardShape.triangle, count: 1),
  WcstCard(color: CardColor.g, shape: CardShape.star, count: 2),
  WcstCard(color: CardColor.b, shape: CardShape.square, count: 3),
  WcstCard(color: CardColor.y, shape: CardShape.circle, count: 4),
];

/// Доля разводящих карт в равномерной раздаче: 24 из 64.
const double classicDiscShare = 24 / 64;

/// Классический WCST: правило меняется после десяти верных подряд.
const int wcstClassicStreak = 10;

const int wcstMaxLevel = 12;

/// Какие эталоны задевает карта по каждому признаку.
List<int> _refIndexes(WcstCard card) => [
      wcstRefCards.indexWhere((r) => r.color == card.color),
      wcstRefCards.indexWhere((r) => r.shape == card.shape),
      wcstRefCards.indexWhere((r) => r.count == card.count),
    ];

/// Сколько РАЗНЫХ эталонов задевает карта: 3 — разводящая, 1 — пустая.
int refSpread(WcstCard card) => _refIndexes(card).toSet().length;

/// Подходит ли карта к эталону по заданному правилу.
bool matchByRule(WcstCard target, WcstCard ref, SortRule rule) {
  switch (rule) {
    case SortRule.color:
      return target.color == ref.color;
    case SortRule.shape:
      return target.shape == ref.shape;
    case SortRule.count:
      return target.count == ref.count;
  }
}

List<T> _shuffled<T>(List<T> arr, double Function() rnd) {
  final a = [...arr];
  for (var i = a.length - 1; i > 0; i--) {
    final j = (rnd() * (i + 1)).floor();
    final t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/// Карта, у которой цвет, форма и число указывают на три РАЗНЫХ эталона.
WcstCard _makeDiscriminating(double Function() rnd) {
  final pick = _shuffled([0, 1, 2, 3], rnd).take(3).toList();
  return WcstCard(
    color: wcstRefCards[pick[0]].color,
    shape: wcstRefCards[pick[1]].shape,
    count: wcstRefCards[pick[2]].count,
  );
}

/// НЕразводящая карта: два эталона или один.
///
/// 🔴 БЕРЁТСЯ ОТБОРОМ ИЗ РАВНОМЕРНОГО БРОСКА, а не строится напрямую. Так
/// соотношение «два эталона к одному» остаётся каноническим (36 к 4) само
/// собой; построй напрямую — пришлось бы задавать его руками, и любая описка
/// тихо переписала бы канон.
WcstCard _makeAmbiguous(double Function() rnd) {
  for (var i = 0; i < 64; i++) {
    final c = WcstCard(
      color: CardColor.values[(rnd() * 4).floor()],
      shape: CardShape.values[(rnd() * 4).floor()],
      count: 1 + (rnd() * 4).floor(),
    );
    if (refSpread(c) < 3) return c;
  }
  // Сюда попасть нельзя: 0,375^64 ≈ 10⁻²⁷. Ветка есть, чтобы цикл был конечным.
  return WcstCard(
    color: wcstRefCards[0].color,
    shape: wcstRefCards[0].shape,
    count: wcstRefCards[1].count,
  );
}

/// Очередная карта. `discriminatingShare` — доля разводящих В САМОЙ РАЗДАЧЕ.
///
/// 🔴 ПАРАМЕТР — ДОЛЯ В РАЗДАЧЕ, А НЕ ДОЛЯ ПРИНУДИТЕЛЬНЫХ КАРТ. Наивная
/// редакция делает так: с вероятностью `share` — разводящая, иначе обычный
/// случайный бросок. Но случайный бросок сам разводящий в 37,5 % случаев,
/// поэтому при `share = 0,375` в раздачу приходит 0,375 + 0,625·0,375 = 0,609.
/// Число в `levelParams` называлось бы «доля разводящих» и означало другое — то
/// есть мера уровня врала бы ровно в том месте, ради которого заведена.
/// ⚠️ Этот самый промах допущен и здесь при переносе 23.09.2026; поймал его
/// замер генератора по 200 000 карт, а не чтение кода.
WcstCard makeTarget(double discriminatingShare, double Function() rnd) {
  return rnd() < discriminatingShare ? _makeDiscriminating(rnd) : _makeAmbiguous(rnd);
}

/// Уровень: три оси.
class WcstLevel {
  const WcstLevel({
    required this.trials,
    required this.ruleChangeStreak,
    required this.persevCap,
    required this.discriminatingShare,
  });

  final int trials;

  /// Сколько верных подряд до молчаливой смены правила: 9 → 3.
  final int ruleChangeStreak;

  /// Потолок персеверативных ошибок для прохода уровня.
  final int persevCap;

  /// Доля разводящих карт: 0,40 → 1,00.
  ///
  /// ⚠️ На L1 стоит 0,40 — вплотную к классической раздаче (0,375), так что
  /// начало лестницы человек не почувствует изменившимся. Шаг взят делением, а
  /// не зашит числом: при шаге 0,06 доля упиралась бы в потолок уже на L11, и
  /// две верхние ступени снова стали бы одинаковыми — то самое, ради чего ось и
  /// заводилась.
  final double discriminatingShare;

  /// УСЛОВИЕ, ПРИ КОТОРОМ СНЯТА МЕРА, — В САМУ ПАРТИЮ.
  ///
  /// `rule_catch_mean` зависит от того, КАКУЮ колоду человеку раздали. Замер
  /// симуляцией 10.09.2026 (партия 40 проб, серия 4): при доле 0,375 идеальный
  /// игрок перехватывает за 1,63 хода, при доле 1,00 — за 1,99. Одно и то же
  /// «перехватил за 2 хода» на первом и двенадцатом уровне означает РАЗНОЕ.
  Map<String, Object?> get condition => {
        'trials': trials,
        'ruleChangeStreak': ruleChangeStreak,
        'persevCap': persevCap,
        'discriminatingShare': discriminatingShare,
      };

  static WcstLevel of(int level) {
    final trials = level <= 4 ? 24 : (level <= 8 ? 32 : 40);
    return WcstLevel(
      trials: trials,
      ruleChangeStreak: max(3, 9 - ((level - 1) * 6 / (wcstMaxLevel - 1)).floor()),
      persevCap: max(2, (trials * 0.12).round()),
      // ⚠️ Потолок оставлен: за концом лестницы формула дала бы 1,16, и такая
      // «доля» уехала бы в партию числом, которого не бывает.
      discriminatingShare: min(1, ((0.40 + (level - 1) * 0.60 / (wcstMaxLevel - 1)) * 100).round() / 100),
    );
  }
}

/// Мера перехвата правила.
class RuleCatchStats {
  const RuleCatchStats({required this.mean, required this.shifts, required this.trials});

  /// ⚠️ `null`, а НЕ 0, когда сдвигов не было: ноль означал бы мгновенный
  /// перехват, которого не случалось.
  final double? mean;

  /// Число сдвигов лежит рядом со средним намеренно: среднее по одному сдвигу и
  /// по пяти — разные по надёжности числа, и различить их можно только имея
  /// второе.
  final int shifts;

  final List<int>? trials;
}

RuleCatchStats ruleCatchStats(List<int> catches) {
  if (catches.isEmpty) return const RuleCatchStats(mean: null, shifts: 0, trials: null);
  final mean = catches.reduce((a, b) => a + b) / catches.length;
  return RuleCatchStats(
    mean: double.parse(mean.toStringAsFixed(2)),
    shifts: catches.length,
    trials: catches,
  );
}

enum WcstOutcome { hit, miss }

/// Партия.
class WcstGame {
  WcstGame({required this.level, this.classic = false, Random? rnd})
      : params = WcstLevel.of(level),
        _rnd = rnd ?? Random();

  final int level;

  /// Классический режим: серия 10, доля разводящих классическая, лестница не
  /// трогается.
  final bool classic;
  final WcstLevel params;
  final Random _rnd;

  int get trialsTotal => params.trials;
  int get ruleStreak => classic ? wcstClassicStreak : params.ruleChangeStreak;
  double get discShare => classic ? classicDiscShare : params.discriminatingShare;

  int round = 0;
  int hits = 0;
  int errors = 0;
  int perseverative = 0;
  int streak = 0;
  int categories = 0;
  int shiftsTotal = 0;

  final List<int> catches = [];

  SortRule rule = SortRule.color;
  SortRule? _lastRule;
  bool _justChanged = false;
  int _sinceShift = 0;
  bool _answered = true;

  WcstCard? target;

  double _next() => _rnd.nextDouble();

  bool get finished => round >= trialsTotal && _answered;

  /// Правило только что сменилось и ещё не перехвачено.
  bool get awaitingCatch => _justChanged;

  void begin() {
    round = 0;
    hits = 0;
    errors = 0;
    perseverative = 0;
    streak = 0;
    categories = 0;
    shiftsTotal = 0;
    catches.clear();
    rule = SortRule.values[(_next() * 3).floor()];
    _lastRule = null;
    _justChanged = false;
    _sinceShift = 0;
    _answered = true;
    target = null;
    nextTrial();
  }

  bool nextTrial() {
    if (round >= trialsTotal) return false;
    round += 1;
    target = makeTarget(discShare, _next);
    _answered = false;
    return true;
  }

  /// Выбор эталона.
  WcstOutcome? pick(int refIdx) {
    final t = target;
    if (t == null || _answered) return null;
    _answered = true;
    final ok = matchByRule(t, wcstRefCards[refIdx], rule);
    // ⚠️ Ход после смены правила считается НЕЗАВИСИМО от исхода: мы ищем, за
    // сколько ходов человек поймал новое правило, а не сколько раз угадал.
    if (_justChanged) _sinceShift += 1;
    if (ok) {
      hits += 1;
      streak += 1;
      if (_justChanged) {
        catches.add(_sinceShift);
        _sinceShift = 0;
      }
      _justChanged = false;
      return WcstOutcome.hit;
    }
    errors += 1;
    streak = 0;
    // Персеверация: ответ по ПРЕДЫДУЩЕМУ правилу сразу после его смены.
    if (_justChanged && _lastRule != null && matchByRule(t, wcstRefCards[refIdx], _lastRule!)) {
      perseverative += 1;
    }
    return WcstOutcome.miss;
  }

  /// Закрыть ход: правило МОЛЧА меняется после серии верных.
  /// true — правило сменилось.
  bool closeTrial() {
    if (streak < ruleStreak) return false;
    final opts = SortRule.values.where((r) => r != rule).toList();
    _lastRule = rule;
    rule = opts[(_next() * opts.length).floor()];
    _justChanged = true;
    _sinceShift = 0;
    shiftsTotal += 1;
    streak = 0;
    // Закрытая серия-под-правилом = категория.
    categories += 1;
    return true;
  }

  RuleCatchStats get ruleCatch => ruleCatchStats(catches);

  /// Проход: мало персеверативных ошибок И разумная точность против случайного
  /// тапа. В классике исхода нет.
  bool get passed {
    if (classic) return false;
    return perseverative <= params.persevCap && hits >= (trialsTotal * 0.55).ceil();
  }
}
