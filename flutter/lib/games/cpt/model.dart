/// CPT — «Поток букв», семнадцатая игра раздела «Конфликт внимания» на Flutter.
///
/// X-задача Rosvold et al. (1956) и её AX-вариант. Правила перенесены из
/// `frontend/app/games/cpt.tsx` (VER 4); эталон выгружен прогоном живого TS в
/// `test/fixtures/cpt-reference.json`.
///
/// ⚠️ ЭТО НЕ Conners Not-X: там жмут на всё, КРОМЕ X, и цели частые.
///
/// 🔴 ЦЕЛЬ РЕДКА — 20 % проб, и это заморожено. На редкости цели держится вся
/// проба: `rt_variability` (CV-RT, один из самых валидных маркеров) считается по
/// попаданиям, и при 10 % целей их осталось бы 3–9 на партию. Доля осью
/// сложности не является; стережёт гейт `conflict-ratio-is-not-difficulty`.
///
/// СЛОЖНОСТЬ РАСТЁТ ТРУДНОСТЬЮ ЗАДАЧИ, а не временем и не долей целей:
///   L1–5   классический X-CPT, ISI 1500 → 900;
///   L6–10  AX-CPT (жми на цель ТОЛЬКО если перед ней была A), ISI 1100 → 850;
///   L11–15 AX + ISI 800 → 500 + растущая доля двойников мишени.
/// Плюс две ручки поверх: мишень перестаёт быть X с L9 и правило становится
/// СОСТАВНЫМ (буква И цвет) с L13.
library;

import 'dart:math';

/// Цвет стимула. `ink` — обычный цвет текста, до составного правила.
enum StimColor { red, blue, green, ink }

/// Режим пробы.
enum CptMode { x, ax }

/// ⚠️ `ink` ВХОДИТ в набор «не красных»: он такой же цвет стимула, как синий и
/// зелёный, а не «цвет по умолчанию». Из-за этого красный — один из ЧЕТЫРЁХ, и
/// доля красных в потоке 0,388, а не 0,446. Промах при переносе 23.09.2026
/// поймал замер потока, а не чтение кода.
const List<StimColor> cptNonRed = [StimColor.blue, StimColor.green, StimColor.ink];
const List<StimColor> cptAllColors = [StimColor.red, ...cptNonRed];

/// Мишени по блокам: X → K → T → H.
const List<String> cptTargets = ['X', 'K', 'T', 'H'];

/// ⚠️ ДВОЙНИКИ У КАЖДОЙ МИШЕНИ СВОИ — и это не аккуратность, а необходимость.
/// Оставь список общим, смени мишень на K — и K окажется в списке СОБСТВЕННЫХ
/// двойников: генератор начнёт выдавать мишень под видом дистрактора.
const Map<String, List<String>> cptConfusables = {
  'X': ['K', 'Y', 'V', 'W', 'N', 'M'],
  'K': ['X', 'R', 'H', 'N', 'M'],
  'T': ['Y', 'L', 'F', 'J', 'V'],
  'H': ['N', 'M', 'K', 'U', 'B'],
};

/// Доля целей. Заморожена.
const double cptTargetRate = 0.2;

/// Как часто пара A→мишень замыкается.
const double cptAxCompletion = 0.7;

/// Как часто ставить подсказку A, чтобы доля целей осталась ровно `cptTargetRate`.
///
/// 🔴 ВЫВОД, А НЕ ПОДБОР. Доля подсказок a удовлетворяет a = A_CUE·(1−a), то есть
/// a = A_CUE/(1+A_CUE); доля целей = a·AX_COMPLETION. Приравняли к TARGET_RATE →
/// A_CUE = T/(C−T). До этого стояло `A_CUE_RATE = TARGET_RATE` и не учитывалось
/// замыкание: реальная доля целей была p²/(1+p) ≈ 8 % вместо 20 %.
const double cptACueRate = cptTargetRate / (cptAxCompletion - cptTargetRate);

/// Мишень БЕЗ предшествующей A — ловушка на commission.
const double cptBxLure = 0.18;

/// Как часто мишенная буква приходит НЕ того цвета (ловушка составного правила).
const double cptColorLureRate = 0.10;

/// Сколько буква видна, мс.
const int cptStimDurationMs = 250;

/// Сколько проб надо сыграть, чтобы партия считалась партией.
///
/// 🔴 ЗДЕСЬ БЫЛА АРИФМЕТИЧЕСКАЯ ОШИБКА, ИЗ-ЗА КОТОРОЙ ТРИ УРОВНЯ НЕ БРАЛИСЬ
/// НИКОГДА: порог стоял 40, а ПРОБА СТОИТ ДВА ISI (пауза до буквы плюс окно
/// ответа). Настоящий счёт за 90 секунд: L1 — 30 проб, L2 — 33, L3 — 37, и все
/// три ниже сорока. Порог 24 взят от реального минимума — четыре пятых самой
/// короткой полной партии.
const int cptMinTrialsForLevel = 24;

const int cptMaxLevel = 15;

const List<String> _lettersNonX = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'Y', 'Z',
];
final List<String> _alphabet = [..._lettersNonX, 'X'];

/// Уровень.
class CptLevel {
  const CptLevel({
    required this.durationSec,
    required this.isiMs,
    required this.mode,
    required this.confusableRatio,
    required this.target,
    required this.colorRule,
  });

  /// Партия — 90 секунд на любом уровне: короткие сессии не скучают.
  final int durationSec;

  final int isiMs;
  final CptMode mode;

  /// Доля двойников среди дистракторов.
  ///
  /// ⚠️ ВКЛЮЧАЮТСЯ С L3, А НЕ С L11. Было: ноль на L1–L10 и рост только на
  /// верхней трети — механизм был написан и до двух третей лестницы НЕ ДОЕЗЖАЛ.
  /// L1–L2 оставлены чистыми намеренно: там человек учится правилу, а не
  /// различению.
  final double confusableRatio;

  /// Буква-мишень. До L8 канонная X, с L9 — уже не X никогда: привычка жать на
  /// X складывается за прошлые партии, и именно её тут и приходится держать.
  final String target;

  /// Составное правило: не «X», а «КРАСНАЯ X».
  final bool colorRule;

  /// УСЛОВИЕ, ПРИ КОТОРОМ СНЯТЫ МЕРЫ, — В САМУ ПАРТИЮ.
  Map<String, Object?> get condition => {
        'isiMs': isiMs,
        'mode': mode == CptMode.x ? 'X' : 'AX',
        'confusableRatio': confusableRatio,
        'target': target,
        'colorRule': colorRule,
      };

  static CptLevel of(int level) {
    final mode = level <= 5 ? CptMode.x : CptMode.ax;
    final isi = level <= 5
        ? max(900, 1500 - (level - 1) * 150)
        : (level <= 10 ? max(850, 1100 - (level - 6) * 60) : max(500, 800 - (level - 11) * 75));
    final confusable =
        level <= 2 ? 0.0 : min(0.5, ((0.10 + (level - 3) * 0.035) * 1000).round() / 1000);
    // ⚠️ БЛОКАМИ ПО ТРИ УРОВНЯ, а не каждый уровень: иначе человек не успевает
    // привыкнуть к букве, и «удержать правило поверх привычки» превращается в
    // «привычки нет вовсе» — ось мерила бы не то.
    final block = min(2, max(0, ((min(level, 15) - 9) / 3).floor()));
    return CptLevel(
      durationSec: 90,
      isiMs: isi,
      mode: mode,
      confusableRatio: confusable,
      target: level <= 8 ? 'X' : cptTargets[1 + block],
      // L13, а не L12: на L12 уже меняется мишень, и два новых правила на одной
      // ступени человек прочитает как одно.
      colorRule: level >= 13,
    );
  }
}

/// Сколько проб физически влезает в партию уровня.
/// ⚠️ Одна проба = ДВА ISI. Считается формулой, а не на глаз в комментарии:
/// ровно из-за счёта на глаз три уровня и оказались непроходимыми.
int trialsThatFit(int level) {
  final p = CptLevel.of(level);
  return (p.durationSec * 1000 / (p.isiMs * 2)).floor();
}

List<String> _bankFor(String target, bool avoidA) =>
    _alphabet.where((l) => l != target && !(avoidA && l == 'A')).toList();

String _pickDistractor(String target, double confusableRatio, double Function() rnd, {bool avoidA = false}) {
  final twins = cptConfusables[target] ?? const [];
  if (confusableRatio > 0 && twins.isNotEmpty && rnd() < confusableRatio) {
    return twins[(rnd() * twins.length).floor()];
  }
  final bank = _bankFor(target, avoidA);
  return bank[(rnd() * bank.length).floor()];
}

/// Следующая буква потока.
///
/// ⚠️ В AX-режиме подсказка и её замыкание РАЗВЕДЕНЫ — только так доля целей
/// равна `cptTargetRate`.
String pickNextLetter(CptMode mode, String target, double confusableRatio, String prev, double Function() rnd) {
  if (mode == CptMode.x) {
    return rnd() < cptTargetRate ? target : _pickDistractor(target, confusableRatio, rnd);
  }
  if (prev == 'A') {
    return rnd() < cptAxCompletion ? target : _pickDistractor(target, confusableRatio, rnd, avoidA: true);
  }
  if (rnd() < cptACueRate) return 'A';
  if (rnd() < cptBxLure) return target;
  return _pickDistractor(target, confusableRatio, rnd, avoidA: true);
}

/// Что показано и надо ли на это жать.
class CptStim {
  const CptStim({required this.letter, required this.color, required this.isTarget});
  final String letter;
  final StimColor color;
  final bool isTarget;
}

CptStim makeTrial(int level, String prev, double Function() rnd) {
  final p = CptLevel.of(level);
  var letter = pickNextLetter(p.mode, p.target, p.confusableRatio, prev, rnd);
  final isTarget = p.mode == CptMode.x ? letter == p.target : (letter == p.target && prev == 'A');

  if (!p.colorRule) return CptStim(letter: letter, color: StimColor.ink, isTarget: isTarget);

  // 🔴 Истинная мишень ВСЕГДА красная: цвет не отнимает у неё редкость.
  if (isTarget) return CptStim(letter: letter, color: StimColor.red, isTarget: true);

  // Цветовой лур подменяет только НЕ-цель — поэтому доля целей не меняется.
  // ⚠️ Подсказку A не трогаем: подменив её, мы уничтожили бы будущую пару
  // A→мишень и тихо понизили долю целей. Ошибка выглядела бы как «доля почти та».
  if (letter != 'A' && rnd() < cptColorLureRate) {
    letter = p.target;
    return CptStim(letter: letter, color: cptNonRed[(rnd() * cptNonRed.length).floor()], isTarget: false);
  }
  // Дистракторы тоже бывают КРАСНЫМИ — иначе цвет один решал бы задачу, и
  // составное правило выродилось бы в «жми на красное», то есть в другую пробу.
  return CptStim(
    letter: letter,
    color: cptAllColors[(rnd() * cptAllColors.length).floor()],
    isTarget: false,
  );
}

/// Примеры для разбора — ДАННЫЕ: мишень и не-мишень по ПРАВИЛУ ЭТОГО УРОВНЯ.
///
/// 🔴 Признак мишени считается той же формулой, что в `makeTrial`: в режиме X
/// мишень — сама буква, в режиме AX — та же буква, но только после «A». Вторая
/// половина примеров и есть предмет упражнения: буква та же, а жать нельзя,
/// потому что перед ней была другая.
List<({CptStim stim, String prev})> cptDemoTrials(CptLevel p) {
  CptStim stim(String letter, String prev, {StimColor? color}) {
    final target = p.mode == CptMode.x ? letter == p.target : (letter == p.target && prev == 'A');
    return CptStim(
      letter: letter,
      color: color ?? (p.colorRule && target ? StimColor.red : StimColor.ink),
      isTarget: target && (color == null || color == StimColor.red),
    );
  }

  return [
    (stim: stim(p.target, 'A'), prev: 'A'),
    (stim: stim(p.target, 'B'), prev: 'B'),
    if (p.colorRule)
      // Мишенная буква НЕ того цвета: правило цвета добавляет третий пример.
      (stim: stim(p.target, 'A', color: StimColor.blue), prev: 'A'),
  ];
}

/// Запись одной пробы.
class CptTrial {
  CptTrial({
    required this.letter,
    required this.color,
    required this.isColorLure,
    required this.isTarget,
    required this.trialIndex,
  });

  final String letter;
  final StimColor color;

  /// Мишенная буква НЕ того цвета: жать нельзя.
  final bool isColorLure;

  final bool isTarget;
  final int trialIndex;
  bool responded = false;
  int? rt;
}

/// Наклон по четырём четвертям, метод наименьших квадратов.
double? _quartileSlope(List<double> byQuartile) {
  const xs = [1.0, 2.0, 3.0, 4.0];
  const meanX = 2.5;
  final meanY = byQuartile.reduce((a, b) => a + b) / 4;
  var num = 0.0, den = 0.0;
  for (var i = 0; i < 4; i++) {
    num += (xs[i] - meanX) * (byQuartile[i] - meanY);
    den += (xs[i] - meanX) * (xs[i] - meanX);
  }
  return den > 0 ? num / den : 0;
}

/// ПАДЕНИЕ ТОЧНОСТИ К КОНЦУ ПАРТИИ.
///
/// ⚠️ Это НЕ то же, что наклон времени реакции: человек может отвечать так же
/// быстро и при этом пропускать всё больше целей. Обе величины нужны, и считаются
/// они порознь.
/// Порог 8 целей: по одной-двум на четверть доля не считается — вышел бы шум под
/// видом биомаркера.
({double? slope, List<double>? byQuartile}) vigilanceAccuracySlope(List<CptTrial> targets) {
  if (targets.length < 8) return (slope: null, byQuartile: null);
  final perQ = targets.length ~/ 4;
  final byOrder = [...targets]..sort((a, b) => a.trialIndex.compareTo(b.trialIndex));
  final rates = <double>[];
  for (var i = 0; i < 4; i++) {
    final slice = byOrder.sublist(i * perQ, (i + 1) * perQ);
    rates.add(slice.where((t) => t.responded).length / slice.length);
  }
  final s = _quartileSlope(rates);
  return (
    slope: s == null ? null : double.parse(s.toStringAsFixed(4)),
    byQuartile: rates.map((r) => double.parse(r.toStringAsFixed(3))).toList(),
  );
}

/// Меры партии.
class CptMetrics {
  const CptMetrics({
    required this.hits,
    required this.omissions,
    required this.commissions,
    required this.accuracy,
    required this.commissionRate,
    required this.meanRtMs,
    required this.cvRt,
    required this.vigilanceSlopeMs,
    required this.accuracySlope,
    required this.played,
  });

  final int hits;
  final int omissions;
  final int commissions;

  /// Доля пойманных целей.
  final double accuracy;

  /// Доля нажатий на НЕ-цели — от фактически показанных не-целей.
  final double commissionRate;

  final double meanRtMs;

  /// CV-RT = std/mean. Один из самых валидных маркеров.
  final double cvRt;

  /// Наклон ВРЕМЕНИ по четвертям, мс/четверть. Положительный = замедляется.
  final double vigilanceSlopeMs;

  /// Наклон ДОЛИ пойманных по четвертям. Отрицательный = внимание падает.
  final double? accuracySlope;

  final int played;
}

CptMetrics calcMetrics(List<CptTrial> trials) {
  final targets = trials.where((t) => t.isTarget).toList();
  final nonTargets = trials.where((t) => !t.isTarget).toList();
  final hits = targets.where((t) => t.responded).length;
  final omissions = targets.where((t) => !t.responded).length;
  final commissions = nonTargets.where((t) => t.responded).length;

  // ⚠️ Время берётся ТОЛЬКО с попаданий: время нажатия на не-цель — про ошибку,
  // а не про скорость.
  final hitRts = targets.where((t) => t.responded && t.rt != null).map((t) => t.rt!).toList();
  final meanRt = hitRts.isEmpty ? 0.0 : hitRts.reduce((a, b) => a + b) / hitRts.length;
  final variance = hitRts.length > 1
      ? hitRts.map((rt) => (rt - meanRt) * (rt - meanRt)).reduce((a, b) => a + b) / hitRts.length
      : 0.0;
  final cv = meanRt > 0 ? sqrt(variance) / meanRt : 0.0;

  var vigilance = 0.0;
  if (hitRts.length >= 8) {
    final perQ = hitRts.length ~/ 4;
    final means = <double>[];
    for (var i = 0; i < 4; i++) {
      final slice = hitRts.sublist(i * perQ, (i + 1) * perQ);
      means.add(slice.reduce((a, b) => a + b) / slice.length);
    }
    vigilance = _quartileSlope(means) ?? 0;
  }

  final acc = vigilanceAccuracySlope(targets);

  return CptMetrics(
    hits: hits,
    omissions: omissions,
    commissions: commissions,
    accuracy: targets.isEmpty ? 0 : hits / targets.length,
    commissionRate: nonTargets.isEmpty ? 0 : commissions / nonTargets.length,
    meanRtMs: meanRt,
    cvRt: cv,
    vigilanceSlopeMs: vigilance,
    accuracySlope: acc.slope,
    played: trials.length,
  );
}

/// Порог прохода уровня.
const double cptPassAccuracy = 0.7;
const double cptMaxCommissionRate = 0.3;

/// Партия.
class CptGame {
  CptGame({required this.level, Random? rnd, int Function()? nowMs, int? durationOverrideSec})
      : params = CptLevel.of(level),
        _rnd = rnd ?? Random(),
        _now = nowMs ?? (() => DateTime.now().millisecondsSinceEpoch),
        durationSec = durationOverrideSec ?? CptLevel.of(level).durationSec;

  final int level;
  final CptLevel params;
  final int durationSec;
  final Random _rnd;
  final int Function() _now;

  final List<CptTrial> trials = [];
  CptTrial? current;
  String _prevLetter = '';
  int _startedAt = 0;
  int _stimAt = 0;
  bool _responded = true;

  double _next() => _rnd.nextDouble();

  void begin() {
    trials.clear();
    current = null;
    _prevLetter = '';
    _responded = true;
    _startedAt = _now();
  }

  double get elapsedSec => (_now() - _startedAt) / 1000.0;

  /// Время партии вышло.
  bool get timeUp => elapsedSec >= durationSec;

  /// Пауза до следующей буквы: ISI уровня с дрожанием ±15 %.
  ///
  /// ⚠️ Дрожание обязательно: при ровном ISI человек начинает жать по счёту.
  int nextIsiMs() => (params.isiMs * (0.85 + _next() * 0.3)).round();

  /// Окно ответа на пробу — один полный ISI уровня от показа буквы.
  int get trialWindowMs => params.isiMs;

  /// Показать следующую букву.
  CptStim showNext() {
    final s = makeTrial(level, _prevLetter, _next);
    _prevLetter = s.letter;
    final t = CptTrial(
      letter: s.letter,
      color: s.color,
      isColorLure: params.colorRule && !s.isTarget && s.letter == params.target,
      isTarget: s.isTarget,
      trialIndex: trials.length,
    );
    current = t;
    _responded = false;
    _stimAt = _now();
    return s;
  }

  /// Нажатие. true — засчитано (первое в пробе).
  bool tap() {
    final t = current;
    if (t == null || _responded) return false;
    _responded = true;
    t.responded = true;
    t.rt = _now() - _stimAt;
    return true;
  }

  /// Закрыть пробу: она уходит в запись независимо от того, был ответ или нет.
  void closeTrial() {
    final t = current;
    if (t == null) return;
    trials.add(t);
    current = null;
    _responded = true;
  }

  CptMetrics get metrics => calcMetrics(trials);

  /// Партия оборвана: сыграно меньше, чем нужно для зачёта.
  ///
  /// 🔴 «СТОП» БЫЛ БЕСПЛАТНЫМ ЛЕВЕЛ-АПОМ: дождался первой цели, тапнул, вышел —
  /// точность 1/1, ложных тревог ноль, уровень взят за десять секунд (замер: в
  /// 100 % прогонов). И провалом это тоже не является: человек, которому
  /// позвонили, ничего не сделал неправильно. Оборванная партия уровень НЕ
  /// ДВИГАЕТ — ни вверх, ни вниз.
  bool get aborted => trials.length < cptMinTrialsForLevel;

  /// Уровень взят? У оборванной партии исхода нет вовсе.
  bool? get passed {
    if (aborted) return null;
    final m = metrics;
    return m.accuracy >= cptPassAccuracy && m.commissionRate <= cptMaxCommissionRate;
  }

  int get score {
    final m = metrics;
    return max(0, (m.hits * 5 - m.commissions * 20 - m.omissions * 10));
  }
}
