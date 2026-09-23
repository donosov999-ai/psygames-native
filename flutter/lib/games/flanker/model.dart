import 'dart:math';

/// «Стрелки» (фланкерная проба Эриксена) — вторая игра раздела «Конфликт
/// внимания» на Flutter.
///
/// Правила перенесены из `frontend/app/games/flanker.tsx`. Сверка идёт не на глаз
/// и не той же формулой: эталон выгружен прогоном живого TS в
/// `test/fixtures/flanker-reference.json` вместе с очередью случайных чисел.
///
/// 🔴 ГЛАВНОЕ, ЧТО ПЕРЕЕЗД ОБЯЗАН СОХРАНИТЬ — ДОЛЯ КОНФЛИКТНЫХ ПРОБ НЕ ЕСТЬ ОСЬ
/// СЛОЖНОСТИ. Мера игры `flanker_effect_ms` — РАЗНОСТЬ времён реакции
/// (конфликтные − согласованные), и сама доля конфликтных её модулирует
/// (proportion-congruent effect, Jost et al. 2022, doi:10.1111/psyp.14092):
/// чем больше конфликтных, тем МЕНЬШЕ измеряемый эффект. Поэтому доли заморожены
/// на 0,40 / 0,45 / 0,15, а сложность растёт разносом «цель ↔ фланги» (канонная
/// ручка Эриксена 1974), окном ответа и объёмом проб.
enum FlankerDirection { left, right }

enum FlankerKind { congruent, incongruent, neutral }

/// Доля согласованных проб. Канон условия, на котором снимается норма батареи.
const double flankerPCong = 0.40;

/// Доля конфликтных проб.
const double flankerPIncong = 0.45;

/// Разнос «цель ↔ фланги» на L1, CSS-px. Верх опущен с канонного 1,0° (34 px) до
/// 0,82° (28 px): при 34 px ряд 336 px не помещается на телефон 360 px.
const double flankerGapMax = 28;

/// Разнос на L15 — 4 px (≈0,12°). Ниже канонных 0,06° не опускаемся: при глифах
/// 36 px стрелки слились бы в полосу, и проба мерила бы разборчивость.
const double flankerGapMin = 4;

/// Ширина ряда стимулов: четыре фланга по 36, центр 56 и четыре зазора.
/// Считается там же, где рисуется, — этим числом сторожится «ряд влезает в 360».
double flankerRowWidthPx(double gapPx) => 4 * 36 + 56 + 4 * gapPx;

/// Что задаёт уровень: объём, окно ответа и разнос. Доли — константы, не ручки.
class FlankerLevel {
  const FlankerLevel({
    required this.trials,
    required this.windowMs,
    required this.pCong,
    required this.pIncong,
    required this.gapPx,
  });

  /// Проб в партии: 20 → 26 → 32. Объём — третья ось: половина разности
  /// (`mean_rt_congruent`) при 20 пробах считалась по ВОСЬМИ числам.
  final int trials;

  /// Окно ответа, мс: 3000 на L1 → 1000 на L15, ниже не опускается.
  final int windowMs;
  final double pCong;
  final double pIncong;

  /// Разнос «цель ↔ фланги», px: 28 на L1 → 4 на L15 (ось Эриксена).
  final double gapPx;

  static FlankerLevel of(int level) {
    final l = max(1, min(15, level));
    final trials = l <= 5 ? 20 : (l <= 10 ? 26 : 32);
    final windowMs = l <= 5
        ? 3000 - (l - 1) * 200
        : (l <= 10 ? 2000 - (l - 6) * 100 : max(1000, 1400 - (l - 11) * 100));
    final gapPx = max(
      flankerGapMin,
      ((flankerGapMax - (l - 1) * (flankerGapMax - flankerGapMin) / 14)).round().toDouble(),
    );
    return FlankerLevel(
      trials: trials,
      windowMs: windowMs,
      pCong: flankerPCong,
      pIncong: flankerPIncong,
      gapPx: gapPx,
    );
  }
}

/// Одна проба: куда смотрит центральная стрелка, какого вида проба и фланги.
/// У нейтральной фланги пустые — вместо стрелок рисуются чёрточки.
class FlankerTrial {
  const FlankerTrial({required this.center, required this.kind, required this.flankers});
  final FlankerDirection center;
  final FlankerKind kind;

  /// Четыре фланга: два слева, два справа. Пусто — нейтральная проба.
  final List<FlankerDirection>? flankers;
}

/// Рождение пробы.
///
/// ⚠️ ПОРЯДОК ОБРАЩЕНИЙ К СЛУЧАЙНОСТИ ТОТ ЖЕ, ЧТО В TS: сначала направление
/// центра, потом вид пробы. Порядок — часть эталона, а не деталь исполнения.
///
/// ⚠️ ГРАНИЦА ВИДОВ СЧИТАЕТСЯ СЛОЖЕНИЕМ, А НЕ ЗАШИТА ЧИСЛОМ. `0,40 + 0,45` в
/// двоичной плавающей точке даёт 0,8500000000000001, поэтому розыгрыш ровно 0,85
/// даёт КОНФЛИКТНУЮ пробу, а не нейтральную. В эталоне эта строка есть
/// (`r=[0, 0.85] → incongruent`); зашей я сюда 0.85 — перенос разошёлся бы с
/// веб-версией ровно на этом значении.
FlankerTrial makeTrial(double pCong, double pIncong, double Function() rnd) {
  final center = rnd() < 0.5 ? FlankerDirection.left : FlankerDirection.right;
  final r = rnd();
  final kind = r < pCong
      ? FlankerKind.congruent
      : (r < pCong + pIncong ? FlankerKind.incongruent : FlankerKind.neutral);
  final opposite = center == FlankerDirection.left ? FlankerDirection.right : FlankerDirection.left;
  final flankers = switch (kind) {
    FlankerKind.congruent => List<FlankerDirection>.filled(4, center),
    FlankerKind.incongruent => List<FlankerDirection>.filled(4, opposite),
    FlankerKind.neutral => null,
  };
  return FlankerTrial(center: center, kind: kind, flankers: flankers);
}

/// Исход одной пробы для экрана.
enum FlankerOutcome { hit, wrong, miss }

/// Партия: раздаёт пробы, держит окно ответа и копит ВРЕМЯ РЕАКЦИИ по видам проб.
///
/// 🔴 ВРЕМЯ СЧИТАЕТСЯ ОТ ПОКАЗА СТИМУЛА, А НЕ ОТ РОЖДЕНИЯ ПРОБЫ. Между ними стоит
/// подготовительный интервал 500–1100 мс (в веб-версии `500 + Math.random()*600`),
/// и если отсчёт начать раньше, каждое время реакции вырастет на случайную
/// величину. Разностью `flankerEffectMs` это НЕ ловится — сдвиг общий для обеих
/// половин и сокращается; ловится только средним временем.
///
/// ⚠️ Часы передаются снаружи (`nowMs`): проба обязана уметь проиграть партию на
/// поддельных часах, а замер отклика — на настоящих.
class FlankerGame {
  FlankerGame({required this.level, Random? rnd, int Function()? nowMs, int? trialsOverride})
      : params = FlankerLevel.of(level),
        _rnd = rnd ?? Random(),
        _now = nowMs ?? (() => DateTime.now().millisecondsSinceEpoch),
        trialsTotal = trialsOverride ?? FlankerLevel.of(level).trials;

  final int level;
  final FlankerLevel params;

  /// Сколько проб в этой партии. В личной игре — из уровня; зарядка задаёт своё.
  final int trialsTotal;
  final Random _rnd;
  final int Function() _now;

  int round = 0;
  int hits = 0;
  int errors = 0;
  int misses = 0;

  final Map<FlankerKind, List<int>> rts = {
    FlankerKind.congruent: [],
    FlankerKind.incongruent: [],
    FlankerKind.neutral: [],
  };

  FlankerTrial? trial;

  /// Подготовительный интервал текущей пробы, мс: 500–1100.
  int preDelayMs = 500;
  bool _answered = true;
  bool _shown = false;
  int _stimAt = 0;
  int _startedAt = 0;

  double _next() => _rnd.nextDouble();

  bool get finished => round >= trialsTotal && _answered;

  /// Виден ли сейчас стимул. Ответ до показа не принимается — как в веб-версии.
  bool get stimulusShown => _shown;

  /// Начало партии: с этого момента считается общее время.
  void begin() => _startedAt = _now();

  /// Следующая проба. Возвращает false, когда партия кончилась.
  ///
  /// Очередь случайных: направление центра → вид пробы → подготовительный интервал.
  bool nextTrial() {
    if (round >= trialsTotal) return false;
    round += 1;
    trial = makeTrial(params.pCong, params.pIncong, _next);
    preDelayMs = 500 + (_next() * 600).floor();
    _answered = false;
    _shown = false;
    return true;
  }

  /// Подготовительный интервал вышел, стимул на экране: отсюда идёт отсчёт.
  void showStimulus() {
    _shown = true;
    _stimAt = _now();
  }

  /// Ответ человека. Верный — время реакции копится в свой вид пробы.
  FlankerOutcome answer(FlankerDirection chosen) {
    final t = trial;
    if (t == null || _answered || !_shown) return FlankerOutcome.miss;
    _answered = true;
    final rt = _now() - _stimAt;
    if (chosen == t.center) {
      hits += 1;
      rts[t.kind]!.add(rt);
      return FlankerOutcome.hit;
    }
    errors += 1;
    return FlankerOutcome.wrong;
  }

  /// Окно ответа вышло: просрочка считается ошибкой, время реакции не копится.
  FlankerOutcome timeout() {
    if (_answered) return FlankerOutcome.miss;
    _answered = true;
    misses += 1;
    errors += 1;
    return FlankerOutcome.miss;
  }

  double _mean(List<int> xs) => xs.isEmpty ? 0 : xs.reduce((a, b) => a + b) / xs.length;

  List<int> get _allRts => [
        ...rts[FlankerKind.congruent]!,
        ...rts[FlankerKind.incongruent]!,
        ...rts[FlankerKind.neutral]!,
      ];

  /// Среднее время реакции по всем верным пробам. Пусто, когда верных нет.
  ///
  /// Показывается человеку и проверяется пробой: постоянный сдвиг отсчёта
  /// разностью не ловится (сокращается), ловится только этим числом.
  int? get meanRtMs {
    final all = _allRts;
    if (all.isEmpty) return null;
    return _mean(all).round();
  }

  /// Мера игры: эффект фланкера — разность средних времён конфликтных и
  /// согласованных проб. Пусто, когда одной из половин нет: ноль означал бы
  /// «конфликт не мешает», а это другое утверждение.
  int? get flankerEffectMs {
    final cong = rts[FlankerKind.congruent]!;
    final incong = rts[FlankerKind.incongruent]!;
    if (cong.isEmpty || incong.isEmpty) return null;
    return (_mean(incong) - _mean(cong)).round();
  }

  double get accuracy => trialsTotal == 0 ? 0 : hits / trialsTotal;

  /// Очки партии — формулой веб-версии, чтобы статистика не разошлась при переезде.
  int get score {
    final mean = meanRtMs ?? 0;
    return max(0, (hits * 80 - errors * 60 - mean * 0.05).round());
  }

  /// Время партии в секундах — как в веб-версии, для записи в статистику.
  double get elapsedSeconds => (_now() - _startedAt) / 1000.0;
}
