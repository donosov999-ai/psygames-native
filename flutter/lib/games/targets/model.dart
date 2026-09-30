/// «Мишени» — десятая игра раздела «Конфликт внимания» на Flutter.
///
/// Правила перенесены из `frontend/app/games/targets.tsx`; эталон выгружен
/// прогоном живого TS в `test/fixtures/targets-reference.json`.
///
/// 🔴 ДОЛЯ МИШЕНЕЙ — ЗАДАННЫЙ ПАРАМЕТР (0,5), А НЕ СЛЕДСТВИЕ АРИФМЕТИКИ.
/// В первой редакции мишенью считался случайно совпавший цвет, и с ростом числа
/// фигур совпадение становилось неизбежным по принципу Дирихле: вероятность
/// мишени доходила до 1,0000, «жать всегда» становилось безошибочной стратегией,
/// и проба на торможение переставала мерить торможение. Поэтому сначала решаем,
/// мишень это или нет, и уже ПОД РЕШЕНИЕ подбираем цвета.
///
/// 🔴 ЛЕСТНИЦА ИДЁТ ВНУТРИ ПАРТИИ, а не между партиями: каждые 10 раундов уровень
/// растёт, и партия кончается либо на L15, либо когда кончились жизни.
library;

import 'dart:math';

/// Палитра фигур. Число цветов задаёт потолок числа квадратов: «не мишень» —
/// это ВСЕ цвета разные, и построить её при фигурах больше палитры нельзя.
const List<String> targetColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE'];

/// Доля мишеней. ⚠️ Заморожена: у go/no-go доля мишеней и есть та величина,
/// относительно которой считаются ошибки торможения, и ручкой сложности быть
/// не может.
const double targetRate = 0.5;

/// Раундов на уровень и потолок лестницы.
const int roundsPerLevel = 10;
const int targetsMaxLevel = 15;

/// Два режима: «поле» — совпадение ВНУТРИ раунда, «джокер» — совпадение с цветом
/// круга ПРОШЛОГО раунда (нагрузка на удержание, а не на сличение).
enum TargetsMode { field, joker }

/// Что задаёт уровень.
class TargetsLevel {
  const TargetsLevel({required this.delayMs, required this.numSquares, required this.jitterPx, required this.lifeBonus});

  /// Сколько раунд висит на экране: 1990 → 450 мс.
  final int delayMs;

  /// Квадратов рядом с кругом: 2 → 5.
  final int numSquares;

  /// ТРЕТЬЯ ОСЬ: разброс фигур по вертикали, 0 → 26 px.
  ///
  /// 🔴 Осей было две — темп и число квадратов, но второе упирается в палитру:
  /// «не мишень» требует, чтобы все цвета были разными, поэтому фигур не больше
  /// семи. Замер по уровням: numSquares идёт 2·2·2·2·3·3·3·3·4·4·4·4·5·5·5 —
  /// всего ЧЕТЫРЕ разных значения на пятнадцать ступеней.
  ///
  /// ⚠️ Ось сходства цветов, которая напрашивается, НЕ взята: вся задача здесь —
  /// сравнение цветов, и сблизив их, мы отняли бы решаемость у людей с
  /// дальтонизмом (замер 10.09 по ΔE в Lab плюс симуляция трёх видов показал,
  /// что запаса нет уже сейчас). Разброс свободен от этого: цвета не трогает,
  /// долю мишеней не трогает, раздаётся одинаково мишеням и не-мишеням. Растёт
  /// время ОБХОДА поля: ровный ряд читается одним движением глаз, разбросанный —
  /// нет.
  final int jitterPx;

  /// Жизней за взятие уровня.
  final int lifeBonus;

  /// УСЛОВИЕ, ПРИ КОТОРОМ СНЯТА МЕРА ПРОХОДА, — В САМУ ПАРТИЮ.
  ///
  /// `commission_errors` зависит и от темпа, и от числа фигур, и от разброса.
  /// Два одинаковых на вид числа, снятые на разных уровнях, означают РАЗНОЕ, а
  /// раздел с 09.09.2026 меряет прогресс ЧЕЛОВЕКА, а не среднее по уровням.
  Map<String, Object?> get condition =>
      {'delay': delayMs, 'numSquares': numSquares, 'jitterPx': jitterPx};

  static TargetsLevel of(int level) {
    // ⚠️ Шаг 110, а НЕ 120. При шаге 120 пол 450 мс достигался уже на L14, а
    // квадратов на L14 и L15 поровну — пятнадцатый уровень побайтово совпадал с
    // четырнадцатым. При шаге 110 все пятнадцать задержек разные, а верх не
    // смягчён: на L15 по-прежнему 450 мс и 5 квадратов.
    final delay = max(450, 2100 - level * 110);
    final wanted = 2 + ((level - 1) ~/ 4);
    return TargetsLevel(
      delayMs: delay,
      numSquares: min(wanted, targetColors.length - 1),
      jitterPx: level <= 4 ? 0 : min(26, 8 + (level - 5) * 2),
      lifeBonus: level <= 3 ? 1 : (level <= 6 ? 3 : 5),
    );
  }
}

/// Раунд: цвет круга, цвета квадратов и заданный исход.
class TargetsRound {
  const TargetsRound({required this.circle, required this.squares, required this.isTarget, this.dy = const []});
  final String circle;
  final List<String> squares;
  final bool isTarget;

  /// Смещение по вертикали для каждой фигуры: [0] — круг, дальше квадраты.
  ///
  /// ⚠️ Рождается ВМЕСТЕ с раундом, а не в отрисовке: иначе фигуры дрожали бы на
  /// каждом кадре, дрожание читалось бы как движение и добавляло к пробе совсем
  /// другую нагрузку. Смещение делается трансформацией, а не отступом: отступ
  /// подвинул бы соседей и менял бы ещё и расстояние между фигурами — вторую
  /// ось разом.
  final List<int> dy;

  TargetsRound withJitter(List<int> shifts) =>
      TargetsRound(circle: circle, squares: squares, isTarget: isTarget, dy: shifts);
}

/// Перемешивание палитры.
///
/// 🔴 ЗДЕСЬ ИСПРАВЛЕНА ТАСОВКА ВЕБ-ВЕРСИИ. Там стоит `sort(() => Math.random() − 0.5)`,
/// и это не перемешивание: замер 120 000 прогонов на семи цветах показал, куда
/// попадает первый элемент — 18,87 / 18,76 / 15,36 / 14,19 / 13,51 / 11,49 / 7,81 %
/// при равномерных 14,29 %. Крайние позиции расходятся в 2,4 раза, то есть первый
/// цвет палитры систематически чаще оказывается кругом. Здесь честный Фишер—Йетс.
/// Порядок цветов на психометрику не влияет (мишень задаётся отдельно), поэтому
/// эталон сверяет ИНВАРИАНТЫ раунда, а не конкретную перестановку.
List<String> shufflePalette(List<String> palette, double Function() rnd) {
  final out = [...palette];
  for (var i = out.length - 1; i > 0; i--) {
    final j = (rnd() * (i + 1)).floor();
    final tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/// Цвета раунда под ЗАДУМАННЫЙ исход.
///
/// `prevColor == null` — первый раунд «джокера»: мишени там быть не может,
/// сличать не с чем.
TargetsRound buildRoundColors({
  required int numSquares,
  required TargetsMode mode,
  required bool wantTarget,
  required String? prevColor,
  required double Function() rnd,
  List<String> palette = targetColors,
}) {
  String pick() => palette[(rnd() * palette.length).floor()];

  if (mode == TargetsMode.joker) {
    final circle = pick();
    if (wantTarget && prevColor != null) {
      // Мишень: прежний цвет круга обязан встретиться среди квадратов.
      final squares = List.generate(numSquares, (_) => pick());
      squares[(rnd() * numSquares).floor()] = prevColor;
      return TargetsRound(circle: circle, squares: squares, isTarget: true);
    }
    // Не мишень: прежнего цвета среди квадратов быть не должно.
    final allowed = palette.where((c) => c != prevColor).toList();
    return TargetsRound(
      circle: circle,
      squares: List.generate(numSquares, (_) => allowed[(rnd() * allowed.length).floor()]),
      isTarget: false,
    );
  }

  final shuffled = shufflePalette(palette, rnd);
  final distinct = shuffled.take(numSquares + 1).toList();
  final circle = distinct[0];
  final squares = distinct.sublist(1);
  if (!wantTarget) {
    // Не мишень: все цвета разные.
    return TargetsRound(circle: circle, squares: squares, isTarget: false);
  }
  // Мишень: ровно одна пара одинаковых среди круга и квадратов.
  //
  // ⚠️ Цвет дублируется из ДРУГОГО места, иначе присваивание может оказаться
  // «сам себе», и совпадения не выйдет вовсе. Первая редакция веб-версии
  // выбирала источник и место независимо и на двух квадратах промахивалась.
  // Индексы: 0 — круг, 1..n — квадраты.
  final to = (rnd() * numSquares).floor();
  final others = [for (var i = 0; i <= numSquares; i++) if (i != to + 1) i];
  final from = others[(rnd() * others.length).floor()];
  squares[to] = from == 0 ? circle : squares[from - 1];
  return TargetsRound(circle: circle, squares: squares, isTarget: true);
}

/// Доля ошибок торможения — от ФАКТИЧЕСКИ показанных не-мишеней, а не от
/// заданной доли: в короткой партии они расходятся. `null` при нуле не-мишеней —
/// доли нет, и ноль тут означал бы «не ошибался».
double? commissionRate(int commissions, int nonTargetsShown) {
  if (nonTargetsShown <= 0) return null;
  return double.parse((commissions / nonTargetsShown).toStringAsFixed(3));
}

enum TargetsOutcome { hit, commission, omission, correctReject }

/// Партия. Кончается на L15 или когда кончились жизни.
class TargetsGame {
  TargetsGame({
    int startLevel = 1,
    this.mode = TargetsMode.field,
    Random? rnd,
    int Function()? nowMs,
  })  : level = startLevel,
        _rnd = rnd ?? Random(),
        _now = nowMs ?? (() => DateTime.now().millisecondsSinceEpoch) {
    lives = 3 + TargetsLevel.of(level).lifeBonus;
  }

  final TargetsMode mode;
  final Random _rnd;
  final int Function() _now;

  int level;
  late int lives;
  int round = 0;
  int score = 0;
  int errors = 0;

  /// Ошибки торможения: нажал на не-мишень.
  int commissions = 0;

  /// Пропуски: не нажал на мишень.
  int omissions = 0;

  int shownTargets = 0;
  int shownNonTargets = 0;

  final List<int> rts = [];

  TargetsRound? current;
  String? _prevColor;
  bool _live = false;
  int _shownAt = 0;
  bool over = false;

  TargetsLevel get params => TargetsLevel.of(level);
  double _next() => _rnd.nextDouble();

  /// Стимул на экране и ещё не отвечен.
  bool get live => _live;

  /// Новый раунд. false — партия кончилась.
  bool nextRound() {
    if (over) return false;
    final r = buildRoundColors(
      numSquares: params.numSquares,
      mode: mode,
      wantTarget: _next() < targetRate,
      prevColor: _prevColor,
      rnd: _next,
    );
    // ⚠️ Разброс раздаётся ОДИНАКОВО мишеням и не-мишеням — он не должен
    // намекать на ответ. Поэтому считается ПОСЛЕ цветов и ни на что не смотрит.
    final swing = params.jitterPx;
    int shift() => swing == 0 ? 0 : ((_next() * 2 - 1) * swing).round();
    _prevColor = r.circle;
    current = r.withJitter([for (var i = 0; i <= r.squares.length; i++) shift()]);
    if (r.isTarget) {
      shownTargets += 1;
    } else {
      shownNonTargets += 1;
    }
    _shownAt = _now();
    _live = true;
    return true;
  }

  /// Нажатие. ⚠️ Тап засчитывается ТОЛЬКО пока стимул на экране и не отвечен:
  /// иначе тап в паузе между раундами читал бы исход ПРОШЛОГО раунда — фантомный
  /// «хит» с завышенным временем или потеря жизни ни за что.
  TargetsOutcome? tap() {
    if (over || !_live) return null;
    _live = false;
    final rt = _now() - _shownAt;
    if (current!.isTarget) {
      rts.add(rt);
      // Очки: чем быстрее внутри окна, тем больше; уровень входит квадратом.
      score += (level * level) * max(0, params.delayMs - rt) ~/ 100;
      return TargetsOutcome.hit;
    }
    errors += 1;
    commissions += 1;
    _spendLife();
    return TargetsOutcome.commission;
  }

  /// Окно раунда истекло.
  TargetsOutcome? timeout() {
    if (over || !_live) return null;
    _live = false;
    if (!current!.isTarget) return TargetsOutcome.correctReject;
    errors += 1;
    omissions += 1;
    _spendLife();
    return TargetsOutcome.omission;
  }

  void _spendLife() {
    lives -= 1;
    if (lives <= 0) {
      lives = 0;
      over = true;
    }
  }

  /// Закрыть раунд и, если набралось десять, шагнуть на уровень выше.
  /// true — уровень вырос.
  bool advance() {
    if (over) return false;
    round += 1;
    if (round < roundsPerLevel) return false;
    if (level >= targetsMaxLevel) {
      over = true;
      return false;
    }
    level += 1;
    round = 0;
    lives += params.lifeBonus;
    return true;
  }

  int? get meanRtMs {
    if (rts.isEmpty) return null;
    return (rts.reduce((a, b) => a + b) / rts.length).round();
  }

  /// Разброс времени реакции — маркер плавания внимания.
  /// ⚠️ Делитель n, а не n−1: так же в веб-версии, и цифры обязаны сойтись.
  int? get stdRtMs {
    if (rts.length < 2) return null;
    final m = rts.reduce((a, b) => a + b) / rts.length;
    final v = rts.map((x) => (x - m) * (x - m)).reduce((a, b) => a + b) / rts.length;
    return sqrt(v).round();
  }

  double? get commissionErrorRate => commissionRate(commissions, shownNonTargets);

  /// Какая доля мишеней вышла НА САМОМ ДЕЛЕ. Рядом с ошибками торможения — чтобы
  /// их долю было с чем сравнивать.
  double? get targetRateActual {
    final n = shownTargets + shownNonTargets;
    if (n == 0) return null;
    return double.parse((shownTargets / n).toStringAsFixed(3));
  }
}
