import 'dart:math';

/// «Позиция» (проба Познера на ориентирование внимания) — седьмая игра раздела
/// «Конфликт внимания» на Flutter.
///
/// Правила перенесены из `frontend/app/games/posner.tsx`; эталон выгружен прогоном
/// живого TS в `test/fixtures/posner-reference.json`.
///
/// 🔴 МЕРА — ВЫИГРЫШ ОТ ПОДСКАЗКИ: RT(невалидная) − RT(валидная). Она РАЗНОСТНАЯ,
/// поэтому доля валидных подсказок осью сложности быть не может и заморожена на
/// 0,7: подними её — и сдвинется сама измеряемая величина. Сложность растёт окном
/// ответа, объёмом проб и разбросом паузы «подсказка → мишень» (SOA).
enum PosnerSide { left, right }

/// Вид подсказки: верная, пустая (стрелки нет) и обманная.
enum CueValidity { valid, neutral, invalid }

/// Доля верных подсказок. Канон Познера (1980) — около 0,8; здесь 0,7, и это
/// записано числом в `levelCondition`, чтобы два прохода можно было сравнивать.
const double validRatio = 0.7;

/// Доля пустых проб: подсказка не указывает никуда.
const double neutralRatio = 0.15;

/// Потолок лестницы.
const int posnerMaxLevel = 15;

/// Проба: куда показывает подсказка (пусто — нейтральная), где появится мишень.
class PosnerTrial {
  const PosnerTrial({required this.cueDir, required this.targetSide, required this.validity});
  final PosnerSide? cueDir;
  final PosnerSide targetSide;
  final CueValidity validity;
}

/// Рождение пробы.
///
/// ⚠️ ПОРЯДОК РОЗЫГРЫШЕЙ ТОТ ЖЕ, ЧТО В TS: вид подсказки, потом сторона мишени.
/// ⚠️ ГРАНИЦА НЕЙТРАЛЬНЫХ СЧИТАЕТСЯ СЛОЖЕНИЕМ, А НЕ ЗАШИТА ЧИСЛОМ: в двоичной
/// плавающей точке 0,7 + 0,15 = 0,8499999999999999778, то есть ЧУТЬ МЕНЬШЕ 0,85,
/// и розыгрыш ровно 0,85 даёт ОБМАННУЮ подсказку. В эталоне эта строка есть.
PosnerTrial makeTrial(double Function() rnd) {
  final r = rnd();
  final validity = r < validRatio
      ? CueValidity.valid
      : (r < validRatio + neutralRatio ? CueValidity.neutral : CueValidity.invalid);
  final target = rnd() < 0.5 ? PosnerSide.left : PosnerSide.right;
  final other = target == PosnerSide.left ? PosnerSide.right : PosnerSide.left;
  final cue = switch (validity) {
    CueValidity.valid => target,
    CueValidity.invalid => other,
    CueValidity.neutral => null,
  };
  return PosnerTrial(cueDir: cue, targetSide: target, validity: validity);
}

/// Что задаёт уровень: объём, окно ответа и разброс паузы «подсказка → мишень».
class PosnerLevel {
  const PosnerLevel({
    required this.trials,
    required this.windowMs,
    required this.soaMinMs,
    required this.soaMaxMs,
  });

  /// Проб в партии: 24 → 30 → 36.
  final int trials;

  /// Окно ответа, мс: 2200 → 900.
  final int windowMs;

  /// Пауза «подсказка → мишень», мс: от 150…250 на L1 до 80…700 на L15.
  /// Растёт именно РАЗБРОС: момент появления мишени нельзя выучить.
  final int soaMinMs;
  final int soaMaxMs;

  static PosnerLevel of(int level) {
    final l = level;
    return PosnerLevel(
      trials: l <= 5 ? 24 : (l <= 10 ? 30 : 36),
      windowMs: max(900, 2200 - (l - 1) * 95),
      soaMinMs: max(80, 150 - (l - 1) * 5),
      soaMaxMs: min(700, 250 + (l - 1) * 33),
    );
  }
}

enum PosnerOutcome { hit, wrong, miss }

/// Партия: подсказка → пауза SOA → мишень → окно ответа.
///
/// ⚠️ Часы передаются снаружи (`nowMs`): проба играет партию на поддельных часах.
class PosnerGame {
  PosnerGame({required this.level, Random? rnd, int Function()? nowMs, int? trialsOverride})
      : params = PosnerLevel.of(level),
        _rnd = rnd ?? Random(),
        _now = nowMs ?? (() => DateTime.now().millisecondsSinceEpoch),
        trialsTotal = trialsOverride ?? PosnerLevel.of(level).trials;

  final int level;
  final PosnerLevel params;
  final int trialsTotal;
  final Random _rnd;
  final int Function() _now;

  int round = 0;
  int hits = 0;
  int errors = 0;

  final Map<CueValidity, List<int>> rts = {
    CueValidity.valid: [],
    CueValidity.neutral: [],
    CueValidity.invalid: [],
  };

  PosnerTrial? trial;

  /// Пауза до показа подсказки, мс: 600–1000, как в веб-версии.
  int cueDelayMs = 600;

  /// Пауза «подсказка → мишень» этой пробы, мс.
  int soaMs = 150;

  bool _answered = true;
  bool _targetShown = false;
  bool _cueShown = false;
  int _targetAt = 0;
  int _startedAt = 0;

  double _next() => _rnd.nextDouble();

  bool get finished => round >= trialsTotal && _answered;
  bool get cueShown => _cueShown;
  bool get targetShown => _targetShown;

  void begin() => _startedAt = _now();

  /// Следующая проба. Очередь случайных: вид подсказки → сторона мишени →
  /// пауза до подсказки → пауза SOA.
  bool nextTrial() {
    if (round >= trialsTotal) return false;
    round += 1;
    trial = makeTrial(_next);
    cueDelayMs = 600 + (_next() * 400).floor();
    soaMs = params.soaMinMs + (_next() * (params.soaMaxMs - params.soaMinMs)).floor();
    _answered = false;
    _cueShown = false;
    _targetShown = false;
    return true;
  }

  void showCue() => _cueShown = true;

  void hideCue() => _cueShown = false;

  /// Мишень на экране — отсюда идёт отсчёт времени реакции.
  void showTarget() {
    _targetShown = true;
    _targetAt = _now();
  }

  /// Ответ человека: в какой стороне мишень.
  ///
  /// 🔴 Время реакции копится ТОЛЬКО с верных ответов и раздельно по видам
  /// подсказки: из этих двух половин и складывается выигрыш от подсказки.
  PosnerOutcome answer(PosnerSide side) {
    final t = trial;
    if (t == null || _answered || !_targetShown) return PosnerOutcome.miss;
    _answered = true;
    final rt = _now() - _targetAt;
    if (side == t.targetSide) {
      hits += 1;
      rts[t.validity]!.add(rt);
      return PosnerOutcome.hit;
    }
    errors += 1;
    return PosnerOutcome.wrong;
  }

  /// Окно вышло без ответа: пропуск считается ошибкой.
  PosnerOutcome timeout() {
    if (_answered) return PosnerOutcome.miss;
    _answered = true;
    errors += 1;
    return PosnerOutcome.miss;
  }

  double _mean(List<int> xs) => xs.isEmpty ? 0 : xs.reduce((a, b) => a + b) / xs.length;

  double get accuracy => trialsTotal == 0 ? 0 : hits / trialsTotal;

  /// Среднее время по всем верным ответам.
  int? get meanRtMs {
    final all = [...rts[CueValidity.valid]!, ...rts[CueValidity.neutral]!, ...rts[CueValidity.invalid]!];
    if (all.isEmpty) return null;
    return _mean(all).round();
  }

  /// Выигрыш от подсказки: RT(обманная) − RT(верная).
  /// Пусто, когда одной из половин нет: ноль означал бы «подсказка не помогает».
  int? get validityEffectMs {
    final v = rts[CueValidity.valid]!;
    final i = rts[CueValidity.invalid]!;
    if (v.isEmpty || i.isEmpty) return null;
    return (_mean(i) - _mean(v)).round();
  }

  /// Очки — формулой веб-версии.
  int get score {
    final mean = meanRtMs ?? 0;
    return max(0, (hits * 80 - errors * 60 - mean * 0.05).round());
  }

  double get elapsedSeconds => (_now() - _startedAt) / 1000.0;
}
