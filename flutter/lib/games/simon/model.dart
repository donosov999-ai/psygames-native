import 'dart:math';

/// «Цвет против позиции» (проба Саймона) — третья игра раздела «Конфликт
/// внимания» на Flutter.
///
/// Правила перенесены из `frontend/app/games/simon.tsx`. Эталон выгружен прогоном
/// живого TS в `test/fixtures/simon-reference.json` вместе с очередью случайных.
///
/// 🔴 ЧТО ПЕРЕЕЗД ОБЯЗАН СОХРАНИТЬ. Доля конфликтных проб заморожена на 0,5 и осью
/// сложности НЕ является: эффект Саймона зависит от неё и при росте доли вплоть до
/// инверсии (Luo, Yang, Wang 2023, doi:10.1037/xlm0001158). Сложность растёт темпом
/// подачи, окном ответа и объёмом — как записано в веб-версии.
///
/// ⚠️ Отличие от «Стрелок»: конфликт здесь ПРОСТРАНСТВЕННЫЙ. Ответ задаёт ЦВЕТ
/// (синий — левая кнопка, красный — правая), а мешает СТОРОНА, где вспыхнул квадрат.
enum SimonColor { blue, red }

enum SimonSide { left, right }

enum SimonKind { congruent, incongruent }

/// Доля конфликтных проб. Канон условия, а не ручка уровня.
const double simonIncongruentProb = 0.5;

/// Цвета стимула — те же, что в веб-версии.
const String simonBlueHex = '#3b82f6';
const String simonRedHex = '#ef4444';

/// Какая кнопка верна для цвета. Правило игры, одно на все уровни.
SimonSide correctSide(SimonColor c) => c == SimonColor.blue ? SimonSide.left : SimonSide.right;

/// Что задаёт уровень: объём, окно ответа и темп подачи.
class SimonLevel {
  const SimonLevel({
    required this.trials,
    required this.windowMs,
    required this.preMinMs,
    required this.preJitterMs,
  });

  /// Проб в партии: 16 → 20 → 24.
  final int trials;

  /// Окно ответа, мс: 2600 на L1 → 920 на L15, пол 900.
  final int windowMs;

  /// Наименьшая пауза перед стимулом, мс: 500 → 250.
  final int preMinMs;

  /// Дрожание паузы, мс: 600 → 200. Темп подачи — вторая ось.
  final int preJitterMs;

  static SimonLevel of(int level) {
    final l = level;
    final trials = l <= 5 ? 16 : (l <= 10 ? 20 : 24);
    return SimonLevel(
      trials: trials,
      windowMs: max(900, 2600 - (l - 1) * 120),
      preMinMs: max(250, 500 - (l - 1) * 18),
      preJitterMs: max(200, 600 - (l - 1) * 29),
    );
  }
}

/// Одна проба: цвет квадрата, сторона, где он вспыхнул, и вид пробы.
class SimonTrial {
  const SimonTrial({required this.color, required this.position, required this.kind});
  final SimonColor color;
  final SimonSide position;
  final SimonKind kind;
}

/// Рождение пробы.
///
/// ⚠️ ПОРЯДОК ОБРАЩЕНИЙ К СЛУЧАЙНОСТИ ТОТ ЖЕ, ЧТО В TS: цвет, потом конфликтность.
/// ⚠️ Сравнение строгое: розыгрыш РОВНО 0,5 даёт красный и согласованную пробу —
/// обе строки есть в эталоне.
SimonTrial makeTrial(double Function() rnd) {
  final color = rnd() < 0.5 ? SimonColor.blue : SimonColor.red;
  final incongruent = rnd() < simonIncongruentProb;
  final correct = correctSide(color);
  final position = incongruent
      ? (correct == SimonSide.left ? SimonSide.right : SimonSide.left)
      : correct;
  return SimonTrial(
    color: color,
    position: position,
    kind: incongruent ? SimonKind.incongruent : SimonKind.congruent,
  );
}

/// Примеры для разбора — ДАННЫЕ: синий слева (цвет и позиция согласны) и синий
/// СПРАВА (позиция тянет вправо, а цвет требует левой кнопки). Вторая проба и
/// есть эффект Саймона.
List<SimonTrial> simonDemoTrials() => const [
      SimonTrial(color: SimonColor.blue, position: SimonSide.left, kind: SimonKind.congruent),
      SimonTrial(color: SimonColor.blue, position: SimonSide.right, kind: SimonKind.incongruent),
    ];

enum SimonOutcome { hit, wrong, miss }

/// Партия: раздаёт пробы, держит два срока подряд и копит время реакции по видам.
///
/// 🔴 Время считается от ПОКАЗА стимула: перед ним стоит пауза preMin + дрожание,
/// и отсчёт с рождения пробы увеличил бы каждое время на случайную величину.
/// Разностью `simonEffectMs` это не ловится — она сдвиг сокращает.
class SimonGame {
  SimonGame({required this.level, Random? rnd, int Function()? nowMs, int? trialsOverride})
      : params = SimonLevel.of(level),
        _rnd = rnd ?? Random(),
        _now = nowMs ?? (() => DateTime.now().millisecondsSinceEpoch),
        trialsTotal = trialsOverride ?? SimonLevel.of(level).trials;

  final int level;
  final SimonLevel params;
  final int trialsTotal;
  final Random _rnd;
  final int Function() _now;

  int round = 0;
  int hits = 0;
  int errors = 0;
  int misses = 0;

  final Map<SimonKind, List<int>> rts = {SimonKind.congruent: [], SimonKind.incongruent: []};

  SimonTrial? trial;

  /// Пауза перед стимулом текущей пробы, мс.
  int preDelayMs = 500;
  bool _answered = true;
  bool _shown = false;
  int _stimAt = 0;
  int _startedAt = 0;

  double _next() => _rnd.nextDouble();

  bool get finished => round >= trialsTotal && _answered;
  bool get stimulusShown => _shown;

  void begin() => _startedAt = _now();

  /// Следующая проба. Очередь случайных: цвет → конфликтность → пауза.
  bool nextTrial() {
    if (round >= trialsTotal) return false;
    round += 1;
    trial = makeTrial(_next);
    preDelayMs = params.preMinMs + (_next() * params.preJitterMs).floor();
    _answered = false;
    _shown = false;
    return true;
  }

  void showStimulus() {
    _shown = true;
    _stimAt = _now();
  }

  SimonOutcome answer(SimonSide chosen) {
    final t = trial;
    if (t == null || _answered || !_shown) return SimonOutcome.miss;
    _answered = true;
    final rt = _now() - _stimAt;
    if (chosen == correctSide(t.color)) {
      hits += 1;
      rts[t.kind]!.add(rt);
      return SimonOutcome.hit;
    }
    errors += 1;
    return SimonOutcome.wrong;
  }

  SimonOutcome timeout() {
    if (_answered) return SimonOutcome.miss;
    _answered = true;
    misses += 1;
    errors += 1;
    return SimonOutcome.miss;
  }

  double _mean(List<int> xs) => xs.isEmpty ? 0 : xs.reduce((a, b) => a + b) / xs.length;

  int? get meanRtMs {
    final all = [...rts[SimonKind.congruent]!, ...rts[SimonKind.incongruent]!];
    if (all.isEmpty) return null;
    return _mean(all).round();
  }

  /// Мера игры: эффект Саймона — разность средних. Пусто, когда одной половины нет.
  int? get simonEffectMs {
    final c = rts[SimonKind.congruent]!;
    final i = rts[SimonKind.incongruent]!;
    if (c.isEmpty || i.isEmpty) return null;
    return (_mean(i) - _mean(c)).round();
  }

  double get accuracy => trialsTotal == 0 ? 0 : hits / trialsTotal;

  /// Очки — формулой веб-версии: за эффект Саймона снимается отдельно, и только
  /// когда он положительный (отрицательный означал бы, что конфликт помогал).
  int get score {
    final mean = meanRtMs ?? 0;
    final effect = simonEffectMs ?? 0;
    return max(0, (hits * 80 - errors * 60 - mean * 0.05 - max(0, effect) * 0.3).round());
  }

  double get elapsedSeconds => (_now() - _startedAt) / 1000.0;
}
