import 'dart:math';

/// N-BACK — ПРАВИЛА, ГЕНЕРАТОР РЯДА И МЕРА РАЗЛИЧЕНИЯ d′.
///
/// Перенос со сверкой: всё здесь — порт веба один к одному, и проба
/// `test/n_back_test.dart` сверяет его с эталоном, снятым прогоном ЖИВОГО TS
/// (`frontend/src/games/n-back/tools/record-flutter-reference.gen.ts`):
///   · правила уровня — `levelParams` из `app/games/n-back.tsx`;
///   · блок ряда — `buildNbackSequence` / `buildNbackSequenceVar` из `src/games/nback/sequence.ts`,
///     на том же потоке случайных чисел и в том же порядке вызовов; план глубины — `nPlanFor`;
///   · d′ и точность — `src/games/n-back/core/dprime.ts`.
/// После правки любого из трёх веб-файлов эталон переснимается тем экспортёром.

/// Уровень, на котором глубина упирается в 6: выше лестницу держит растущий интервал
/// между стимулами (ось задержки) и доля приманок (ось 5).
const nbVolumeTop = 13;

/// 🔴 ОСЬ 9 — ГЛУБИНА МЕНЯЕТСЯ ВНУТРИ ПАРТИИ (задача 103cd98d, 02.10.2026). С L27 (приманки
/// упёрлись в 0,45 на L26) партия чередует N и N − 1 отрезками по `switchEvery` проб: 10 на L27,
/// на уровень короче, до 4 на L33. Пока растёт эта ось, удержание стоит; с L34 растёт снова.
/// Порт `NB_SWITCH_*` из `app/games/n-back.tsx`.
const nbSwitchFrom = 27;
const nbSwitchStart = 10;
const nbSwitchFloor = 4;

/// Доля целей в блоке. Фиксирована и НЕ является ручкой сложности: она задаёт величину
/// измеряемого эффекта, и крутить ею сложность значит ломать мерку.
const nbMatchRate = 0.3;

/// Буквы второго потока — только согласные: не путаются с позициями.
const nbAudioLetters = ['B', 'D', 'F', 'H', 'K', 'L', 'M', 'Q', 'R', 'T'];

/// Клеток в сетке 3×3.
const nbCells = 9;

/// Порог зачёта уровня: точность по ХУДШЕМУ из потоков (схема Jaeggi).
const nbPassAccuracy = 80;

/// Сколько проб в партии, если шаг не сказал иначе.
const nbDefaultTrials = 20;

enum NbModality { single, dual }

/// Что задаёт уровень.
class NbLevelParams {
  const NbLevelParams({
    required this.n,
    required this.modality,
    required this.showMs,
    required this.gapMs,
    this.lureRate,
    this.switchEvery,
  });

  /// Глубина: с чем сравнивать — со стимулом n назад.
  final int n;
  final NbModality modality;

  /// Сколько горит клетка.
  final int showMs;

  /// Пауза после показа до следующего стимула (без разброса).
  final int gapMs;

  /// Доля приманок, заданная УРОВНЕМ (ось 5); `null` — по глубине ([lureRateFor]).
  final double? lureRate;

  /// Ось 9: глубина чередуется N и N − 1 отрезками по столько проб; `null` — постоянная N.
  final int? switchEvery;

  /// L1–5: одиночный поток, N = уровень · L6–8: N = 5 быстрее · L9+: двойной поток,
  /// N растёт до 6; выше [nbVolumeTop] — интервал +200 мс за уровень и приманки до 0,45.
  static NbLevelParams of(int level) {
    if (level <= 5) {
      return NbLevelParams(n: level, modality: NbModality.single, showMs: 700, gapMs: 1100);
    }
    if (level <= 8) {
      final f = level - 5;
      return NbLevelParams(
        n: 5,
        modality: NbModality.single,
        showMs: max(450, 700 - f * 80),
        gapMs: max(700, 1100 - f * 130),
      );
    }
    final dl = level - 8;
    // Удержание (ось 3): в полосе оси 9 стоит, дальше растёт снова — одна ось на ступень.
    const switchFloorLevel = nbSwitchFrom + (nbSwitchStart - nbSwitchFloor);
    final int holdLevels = level < nbSwitchFrom
        ? max(0, level - nbVolumeTop)
        : (nbSwitchFrom - 1 - nbVolumeTop) + max(0, level - switchFloorLevel);
    final hold = holdLevels * 200;
    final lureRate = min(0.45, 0.2 + max(0, level - nbVolumeTop) * 0.02);
    return NbLevelParams(
      n: min(6, 1 + dl),
      modality: NbModality.dual,
      showMs: 700,
      gapMs: 1100 + hold,
      lureRate: lureRate,
      switchEvery: level >= nbSwitchFrom ? max(nbSwitchFloor, nbSwitchStart - (level - nbSwitchFrom)) : null,
    );
  }
}

/// Режим шага батареи: '2-back' → 2. Шаг говорит `mode: '2-back'` — без разбора оценка
/// молча игралась как 1-back, а её d′ сравнивался с нормой двухбэка.
int? nFromModeParam(String modeParam) {
  final m = RegExp(r'^(\d+)-back$').firstMatch(modeParam);
  return m == null ? null : max(1, int.parse(m.group(1)!));
}

/// Доля приманок по глубине: на 1-back приманки быть не может (лаг 0 — сам стимул).
double lureRateFor(int n) {
  if (n <= 1) return 0;
  return min(0.2, 0.1 + (n - 2) * 0.05);
}

/// Источник случайности: число в [0, 1).
typedef NbRng = double Function();

/// Блок: стимулы и позиции, где ЗАКАЗАНЫ совпадение и приманка.
class NbackSequence {
  const NbackSequence(this.items, this.matchAt, this.lureAt);

  /// Индексы стимулов `0..alphabet-1`.
  final List<int> items;

  /// Где стимул совпадает с тем, что был n назад.
  final List<int> matchAt;

  /// Где приманка — повтор на лаге n−1 или n+1, но НЕ на n.
  final List<int> lureAt;
}

List<T> _shuffle<T>(NbRng rng, List<T> list) {
  final out = [...list];
  for (var i = out.length - 1; i > 0; i--) {
    final j = (rng() * (i + 1)).floor();
    final t = out[i];
    out[i] = out[j];
    out[j] = t;
  }
  return out;
}

/// Блок с ТОЧНЫМ числом целей и приманок при постоянной глубине — частный случай
/// [buildNbackSequenceVar]; выход тот же до последней цифры. Порт `buildNbackSequence`.
NbackSequence buildNbackSequence(int trials, int n, int alphabet, NbRng rng, [double? lureRate]) =>
    buildNbackSequenceVar(trials, List.filled(trials, n), alphabet, rng, lureRate ?? lureRateFor(n));

/// План глубины партии (ось 9): отрезками по [switchEvery] проб глубина чередуется n, n − 1, n…
/// Без [switchEvery] — постоянная n. Порт `nPlanFor`.
List<int> nbPlanFor(int trials, int n, [int? switchEvery]) {
  if (switchEvery == null || switchEvery <= 0 || n < 2) return List.filled(trials, n);
  return [for (var i = 0; i < trials; i++) (i ~/ switchEvery).isEven ? n : n - 1];
}

/// Блок с ТОЧНЫМ числом целей и приманок для глубины на каждую позицию: сборка повторяется,
/// пока посчитанное в готовом ряду не совпадёт с заказанным (40 попыток; не вышло — последняя
/// сборка, а не падение посреди партии). Порт `buildNbackSequenceVar` один к одному, включая
/// порядок вызовов ГПСЧ.
NbackSequence buildNbackSequenceVar(int trials, List<int> nAt, int alphabet, NbRng rng, [double? lureRate]) {
  final rate = lureRate ?? lureRateFor(nAt.reduce(max));
  NbackSequence? last;
  for (var attempt = 0; attempt < 40; attempt++) {
    final built = _buildOnce(trials, nAt, alphabet, rng, rate);
    last = built;
    if (countMatchesVar(built.items, nAt) == built.matchAt.length &&
        countLuresVar(built.items, nAt) == built.lureAt.length) {
      return built;
    }
  }
  return last!;
}

NbackSequence _buildOnce(int trials, List<int> nAt, int alphabet, NbRng rng, double lureRate) {
  final items = List<int>.filled(trials, -1);
  // Совпадение возможно только с позиции глубины: доли считаются от них, а не от длины блока.
  final eligible = [for (var i = 0; i < trials; i++) if (i >= nAt[i]) i];
  final matchCount = (eligible.length * nbMatchRate).round();
  final lureCount = (eligible.length * lureRate).round();

  final shuffled = _shuffle(rng, eligible);
  int cut(int k) => min(k, shuffled.length);   // как `slice` в JS: за краем — до края
  final matchAt = shuffled.sublist(0, cut(matchCount))..sort();
  // Приманки — из позиций, свободных от целей: одна позиция — один ответ.
  final lureAt = shuffled.sublist(cut(matchCount), cut(matchCount + lureCount))..sort();
  final isMatch = matchAt.toSet();
  final isLure = lureAt.toSet();

  for (var i = 0; i < trials; i++) {
    final n = nAt[i];
    if (isMatch.contains(i)) {
      items[i] = items[i - n];
      continue;
    }
    // Значения, которые дали бы совпадение или приманку случайно.
    final forbidden = <int>{};
    if (i - n >= 0) forbidden.add(items[i - n]);
    if (i - (n - 1) >= 0 && n - 1 > 0) forbidden.add(items[i - (n - 1)]);
    if (i - (n + 1) >= 0) forbidden.add(items[i - (n + 1)]);

    if (isLure.contains(i)) {
      final lags = _shuffle(rng, [n - 1, n + 1].where((lag) => lag > 0 && i - lag >= 0).toList());
      var placed = false;
      for (final lag in lags) {
        final value = items[i - lag];
        if (i - n >= 0 && items[i - n] == value) continue;   // это было бы совпадение
        items[i] = value;
        placed = true;
        break;
      }
      if (placed) continue;
    }

    final pool = [for (var v = 0; v < alphabet; v++) if (!forbidden.contains(v)) v];
    // Запрещено максимум три значения при алфавите от девяти: пусто — значит алфавит
    // кто-то поменял не заметив, и честнее упасть, чем поставить совпадение молча.
    if (pool.isEmpty) throw StateError('n-back: alphabet $alphabet is too small for n=$n');
    items[i] = pool[(rng() * pool.length).floor()];
  }
  return NbackSequence(items, matchAt, lureAt);
}

/// Настоящее число совпадений в готовом ряду.
int countMatches(List<int> items, int n) => countMatchesVar(items, List.filled(items.length, n));

/// То же для глубины на каждую позицию.
int countMatchesVar(List<int> items, List<int> nAt) {
  var c = 0;
  for (var i = 0; i < items.length; i++) {
    if (i >= nAt[i] && items[i] == items[i - nAt[i]]) c += 1;
  }
  return c;
}

/// Настоящее число приманок: повтор на лаге n±1, не являющийся совпадением.
int countLures(List<int> items, int n) => countLuresVar(items, List.filled(items.length, n));

/// То же для глубины на каждую позицию: лаги nAt[i] ± 1.
int countLuresVar(List<int> items, List<int> nAt) {
  var c = 0;
  for (var i = 0; i < items.length; i++) {
    final n = nAt[i];
    if (i - n >= 0 && items[i] == items[i - n]) continue;
    for (final lag in [n - 1, n + 1]) {
      if (lag > 0 && i - lag >= 0 && items[i] == items[i - lag]) {
        c += 1;
        break;
      }
    }
  }
  return c;
}

/// Пауза между стимулами с разбросом ±15 % (не больше 200 мс): иначе интервал
/// предсказуем, и жать можно «в ритм», не распознавая стимул.
int jitteredGapMs(int baseMs, NbRng rng) {
  final jitter = min(200.0, baseMs * 0.15);
  return max(300.0, baseMs + (rng() * 2 - 1) * jitter).round();
}

/// Ответы одного потока.
class NbCounts {
  const NbCounts({this.hits = 0, this.misses = 0, this.falseAlarms = 0, this.correctRejections = 0});
  final int hits;
  final int misses;
  final int falseAlarms;
  final int correctRejections;

  int get answered => hits + misses + falseAlarms + correctRejections;
}

/// d′ потока: насколько ответы отличались от угадывания.
class NbSignal {
  const NbSignal({required this.answered, required this.hitRate, required this.falseAlarmRate, required this.dPrime});
  final int answered;
  final double hitRate;
  final double falseAlarmRate;
  final double dPrime;
}

/// Обратная функция нормального распределения (аппроксимация Акклэма), коэффициенты —
/// байт в байт из `core/dprime.ts`: иначе сохранённые d′ прошлых партий не сравнятся.
double nbZScore(double p) {
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pLow = 0.02425, pHigh = 1 - pLow;
  if (p < pLow) {
    final q = sqrt(-2 * log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= pHigh) {
    final q = p - 0.5, r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
        (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  final q = sqrt(-2 * log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

/// Лог-линейная поправка (Снодграсс–Корвин): доля из (yes + 0,5) / (всего + 1) — ни нуля,
/// ни единицы, d′ конечен и на идеальной партии; пустой поток — 0,5.
double _correctedRate(int yes, int no) {
  final trials = yes + no;
  return trials > 0 ? (yes + 0.5) / (trials + 1) : 0.5;
}

NbSignal nbSignalDetection(NbCounts c) {
  final hitRate = _correctedRate(c.hits, c.misses);
  final falseAlarmRate = _correctedRate(c.falseAlarms, c.correctRejections);
  return NbSignal(
    answered: c.answered,
    hitRate: hitRate,
    falseAlarmRate: falseAlarmRate,
    dPrime: double.parse((nbZScore(hitRate) - nbZScore(falseAlarmRate)).toStringAsFixed(2)),
  );
}

/// Доля верных ответов (попадания + верные отказы) в процентах; ни одной пробы с ответом —
/// [whenNothingAnswered].
int nbAccuracyPercent(NbCounts c, int whenNothingAnswered) =>
    c.answered > 0 ? ((c.hits + c.correctRejections) / c.answered * 100).round() : whenNothingAnswered;

/// Чем кончилось нажатие.
enum NbPress { ignored, hit, falseAlarm }

/// ПАРТИЯ: блок готовится целиком до первого стимула; проба за пробой человек жмёт
/// «совпадение», если стимул равен тому, что был n назад. Нет нажатия — по окончании пробы
/// это промах (если совпадение было) или верный отказ.
class NbackGame {
  NbackGame({
    required this.n,
    required this.trials,
    required this.modality,
    double? lureRate,
    int? switchEvery,
    NbRng? rng,
  })  : _rng = rng ?? Random().nextDouble,
        plan = nbPlanFor(trials, n, switchEvery) {
    visual = buildNbackSequenceVar(trials, plan, nbCells, _rng, lureRate ?? lureRateFor(n));
    // Слуховой блок строится всегда, как в вебе: поток случайных чисел не зависит от режима.
    audio = buildNbackSequenceVar(trials, plan, nbAudioLetters.length, _rng, lureRate ?? lureRateFor(n));
  }

  /// Глубина уровня (метки отчёта, шаг зарядки); на пробе действует [nHere].
  final int n;

  /// План глубины партии по пробам (ось 9); у постоянной глубины — везде [n].
  final List<int> plan;

  /// Глубина ТЕКУЩЕЙ пробы: с чем сравнивать — со стимулом [nHere] назад.
  int get nHere => index >= 0 && index < plan.length ? plan[index] : n;

  /// На этой пробе глубина сменилась — экран объявляет «Теперь N-back».
  bool get switchedHere => index > 0 && index < plan.length && plan[index] != plan[index - 1];
  final int trials;
  final NbModality modality;
  final NbRng _rng;
  late final NbackSequence visual;
  late final NbackSequence audio;

  bool get dual => modality == NbModality.dual;

  /// Какая проба идёт: −1 — партия ещё не началась.
  int index = -1;
  bool visualAnswered = false;
  bool audioAnswered = false;

  int hits = 0, misses = 0, falseAlarms = 0, correctRejections = 0;
  int aHits = 0, aMisses = 0, aFalseAlarms = 0, aCorrectRejections = 0;

  /// Отвечать можно с пробы глубины: раньше сравнивать не с чем.
  bool get canMatch => index >= nHere;
  bool get started => index >= 0;
  bool get finished => index >= trials;

  /// Горящая клетка и названная буква текущей пробы; вне пробы — пусто.
  int? get cell => started && !finished ? visual.items[index] : null;
  String? get letter => dual && started && !finished ? nbAudioLetters[audio.items[index]] : null;

  bool get isVisualMatch => canMatch && visual.items[index] == visual.items[index - nHere];
  bool get isAudioMatch => canMatch && audio.items[index] == audio.items[index - nHere];

  /// Следующая проба. `false` — проб больше нет, партия кончилась.
  bool next() {
    index += 1;
    visualAnswered = false;
    audioAnswered = false;
    return !finished;
  }

  NbPress pressVisual() {
    if (!started || finished || !canMatch || visualAnswered) return NbPress.ignored;
    visualAnswered = true;
    if (isVisualMatch) {
      hits += 1;
      return NbPress.hit;
    }
    falseAlarms += 1;
    return NbPress.falseAlarm;
  }

  NbPress pressAudio() {
    if (!dual || !started || finished || !canMatch || audioAnswered) return NbPress.ignored;
    audioAnswered = true;
    if (isAudioMatch) {
      aHits += 1;
      return NbPress.hit;
    }
    aFalseAlarms += 1;
    return NbPress.falseAlarm;
  }

  /// Конец пробы: без нажатия — промах или верный отказ.
  void closeTrial() {
    if (!started || finished || !canMatch) return;
    if (!visualAnswered) {
      if (isVisualMatch) {
        misses += 1;
      } else {
        correctRejections += 1;
      }
    }
    if (dual && !audioAnswered) {
      if (isAudioMatch) {
        aMisses += 1;
      } else {
        aCorrectRejections += 1;
      }
    }
  }

  NbCounts get visualCounts =>
      NbCounts(hits: hits, misses: misses, falseAlarms: falseAlarms, correctRejections: correctRejections);
  NbCounts get audioCounts =>
      NbCounts(hits: aHits, misses: aMisses, falseAlarms: aFalseAlarms, correctRejections: aCorrectRejections);

  int get accuracy => nbAccuracyPercent(visualCounts, 0);

  /// Пустой слуховой поток — 100: итог берётся минимумом, ноль завалил бы уровень ни за что.
  int get audioAccuracy => nbAccuracyPercent(audioCounts, 100);

  /// Итог — по ХУДШЕМУ потоку, не средним: иначе провальный поток маскируется хорошим.
  int get combinedAccuracy => dual ? min(accuracy, audioAccuracy) : accuracy;

  bool get passed => combinedAccuracy >= nbPassAccuracy;

  int get score => hits * 10 - falseAlarms * 5 + (dual ? aHits * 10 - aFalseAlarms * 5 : 0);

  int get errors => misses + falseAlarms + (dual ? aMisses + aFalseAlarms : 0);
}
