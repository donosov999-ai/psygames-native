import 'dart:math';

/// «Струп: цвет и слово» — первая проба раздела «Конфликт внимания» на Flutter.
///
/// Правила перенесены из `frontend/app/games/stroop.tsx` и общего модуля помех
/// `frontend/src/games/attention/decoys.ts`. Сверка идёт не на глаз и не той же
/// формулой: эталоны выгружены прогоном живого TS в
/// `test/fixtures/stroop-reference.json` вместе с ПОРЯДКОМ обращений к случайности.
///
/// 🔴 ГЛАВНОЕ ПРАВИЛО РАЗДЕЛА, которое переезд обязан сохранить: доля конфликтных
/// проб — НЕ ось сложности. Мера прохода Струпа — РАЗНОСТЬ времён реакции
/// (неконгруэнтные − конгруэнтные), и сдвиг доли уменьшает ровно ту величину, ради
/// которой проба существует (Rothermund 2022, doi:10.5334/joc.232; обзор
/// Bugg & Crump 2012, doi:10.3389/fpsyg.2012.00367). Поэтому 50/50 заморожено.
class StroopColor {
  const StroopColor({required this.name, required this.ru, required this.en, required this.hex});
  final String name;
  final String ru;
  final String en;
  final String hex;
}

/// Обычная палитра.
const List<StroopColor> stroopColorsDefault = [
  StroopColor(name: 'red', ru: 'КРАСНЫЙ', en: 'RED', hex: '#ef4444'),
  StroopColor(name: 'blue', ru: 'СИНИЙ', en: 'BLUE', hex: '#3b82f6'),
  StroopColor(name: 'green', ru: 'ЗЕЛЁНЫЙ', en: 'GREEN', hex: '#22c55e'),
  StroopColor(name: 'yellow', ru: 'ЖЁЛТЫЙ', en: 'YELLOW', hex: '#eab308'),
];

/// Палитра для дальтонизма: без неё задача нерешаема в принципе — при протанопии
/// минимальная разница обычной палитры ΔE 8,4, здесь 30,7 (замер раздела 22.08.2026).
const List<StroopColor> stroopColorsColorblind = [
  StroopColor(name: 'red', ru: 'КРАСНЫЙ', en: 'RED', hex: '#c1272d'),
  StroopColor(name: 'blue', ru: 'СИНИЙ', en: 'BLUE', hex: '#0072b2'),
  StroopColor(name: 'green', ru: 'ЗЕЛЁНЫЙ', en: 'GREEN', hex: '#006644'),
  StroopColor(name: 'yellow', ru: 'ЖЁЛТЫЙ', en: 'YELLOW', hex: '#f0e442'),
];

/// Доля конфликтных проб. Канон, не ручка уровня.
const double incongruentRatio = 0.5;

/// Предел помех: четыре знака, по два в ряд над и под стимулом.
const int decoysMax = 4;

/// Помехи — геометрические фигуры, а не буквы: буква рядом со словом читалась бы вместе с ним.
const List<String> decoyGlyphs = [
  'ellipse-outline', 'square-outline', 'triangle-outline',
  'diamond-outline', 'cube-outline', 'prism-outline',
];

/// Подпись на кнопке — по светлоте фона, а не всегда белая: белым по четырём
/// кнопкам выходило 3,8 / 3,7 / 2,3 / 1,9 при норме 4,5 (замер 22.08.2026).
String stroopLabelColor(String hex) {
  double lin(int c) {
    final s = c / 255;
    return s <= 0.04045 ? s / 12.92 : pow((s + 0.055) / 1.055, 2.4).toDouble();
  }

  final r = lin(int.parse(hex.substring(1, 3), radix: 16));
  final g = lin(int.parse(hex.substring(3, 5), radix: 16));
  final b = lin(int.parse(hex.substring(5, 7), radix: 16));
  final l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.05 ? '#FFFFFF' : '#111111';
}

/// Что задаёт уровень: темп, объём, доля смен правила и помехи.
///
/// Ось доли конфликтных заморожена (см. шапку), поэтому трудность растят четыре
/// другие: объём проб, окно ответа, смена правила внутри партии и помехи вокруг слова.
class StroopLevel {
  const StroopLevel({
    required this.trials,
    required this.windowMs,
    required this.switchRate,
    required this.decoys,
  });

  /// Сколько проб в партии: L1–5 — 20, L6–10 — 24, дальше 26…34.
  final int trials;

  /// Окно ответа, мс: 3500 на L1 → 1200 на L15 и ниже не опускается.
  final int windowMs;

  /// Доля проб, идущих по ДРУГОМУ правилу. До L4 смен нет — правило надо освоить.
  final double switchRate;

  /// Сколько знаков-помех вокруг слова.
  final int decoys;

  static StroopLevel of(int level) {
    final l = max(1, min(15, level));
    final trials = l <= 5 ? 20 : (l <= 10 ? 24 : min(34, 24 + (l - 10) * 2));
    final windowMs = max(1200, 3500 - (l - 1) * 165);
    // TS округляет долю до трёх знаков (toFixed(3)) — переносим вместе с округлением,
    // иначе сверка с эталоном разойдётся в третьем знаке.
    final switchRate = l <= 4 ? 0.0 : double.parse((((l - 4) * 0.40) / 11).toStringAsFixed(3));
    final decoys = l <= 3 ? 0 : (l <= 8 ? 2 : decoysMax);
    return StroopLevel(trials: trials, windowMs: windowMs, switchRate: switchRate, decoys: decoys);
  }
}

/// Помехи для ОДНОЙ пробы. Зовётся при рождении пробы, а не в отрисовке: иначе
/// знаки менялись бы на каждом кадре и мельтешение добавляло бы свою нагрузку.
List<String> makeDecoys(int n, double Function() rnd) {
  final count = max(0, min(decoysMax, n));
  return List.generate(count, (_) => decoyGlyphs[(rnd() * decoyGlyphs.length).floor()]);
}

/// Одна проба: слово, цвет чернил, согласованность и помехи.
class StroopTrial {
  const StroopTrial({required this.word, required this.ink, required this.congruent, required this.decoys});
  final StroopColor word;
  final StroopColor ink;
  final bool congruent;
  final List<String> decoys;
}

/// Рождение пробы. ⚠️ Порядок обращений к случайности тот же, что в TS: слово →
/// помехи → согласованность → чернила. Помехи раздаются ДО ветвления, одинаково
/// обеим половинам, иначе ось помех попала бы прямо в интерференцию.
StroopTrial makeTrial(int level, List<StroopColor> palette, double Function() rnd) {
  final word = palette[(rnd() * palette.length).floor()];
  final decoys = makeDecoys(StroopLevel.of(level).decoys, rnd);
  if (rnd() >= incongruentRatio) {
    return StroopTrial(word: word, ink: word, congruent: true, decoys: decoys);
  }
  var ink = word;
  while (ink.name == word.name) {
    ink = palette[(rnd() * palette.length).floor()];
  }
  return StroopTrial(word: word, ink: ink, congruent: false, decoys: decoys);
}

/// Правило пробы: обычно базовое, с вероятностью `switchRate` — другое.
String ruleForTrial(String base, double switchRate, double Function() rnd) {
  if (switchRate <= 0) return base;
  return rnd() < switchRate ? (base == 'ink' ? 'word' : 'ink') : base;
}

/// Исход одной пробы для экрана.
enum StroopOutcome { hit, wrong, miss }

/// Партия: раздаёт пробы, считает попадания и ВРЕМЯ РЕАКЦИИ.
///
/// 🔴 ВРЕМЯ РЕАКЦИИ КОПИТСЯ НЕ СО ВСЕХ ПРОБ. Только с верных и только с тех, что
/// шли по БАЗОВОМУ правилу: на пробах другого правила интерференция иной природы
/// (обратный Струп, много меньше прямого), и их подмешивание размывало бы
/// `interference_ms` пропорционально доле смен.
///
/// ⚠️ Часы передаются снаружи (`nowMs`), а не берутся из DateTime: проба обязана
/// уметь проиграть партию на поддельных часах, а замер отклика — на настоящих.
class StroopGame {
  StroopGame({
    required this.level,
    required this.mode,
    List<StroopColor>? palette,
    Random? rnd,
    int Function()? nowMs,
  })  : params = StroopLevel.of(level),
        palette = palette ?? stroopColorsDefault,
        _rnd = rnd ?? Random(),
        _now = nowMs ?? (() => DateTime.now().millisecondsSinceEpoch);

  final int level;

  /// Базовое правило партии: 'ink' — называть цвет чернил, 'word' — слово.
  final String mode;
  final StroopLevel params;
  final List<StroopColor> palette;
  final Random _rnd;
  final int Function() _now;

  int round = 0;
  int hits = 0;
  int errors = 0;
  int misses = 0;
  int switchedTrials = 0;

  final List<int> rtsCongruent = [];
  final List<int> rtsIncongruent = [];

  StroopTrial? trial;
  String trialRule = 'ink';
  bool _answered = true;
  int _trialStart = 0;

  double _next() => _rnd.nextDouble();

  bool get finished => round >= params.trials && _answered;

  /// Следующая проба. Возвращает false, когда партия кончилась.
  bool nextTrial() {
    if (round >= params.trials) return false;
    round += 1;
    trial = makeTrial(level, palette, _next);
    trialRule = ruleForTrial(mode, params.switchRate, _next);
    if (trialRule != mode) switchedTrials += 1;
    _answered = false;
    _trialStart = _now();
    return true;
  }

  /// Имя цвета, которое сейчас верно — по правилу ПРОБЫ, а не партии.
  String? get correctName {
    final t = trial;
    if (t == null) return null;
    return trialRule == 'ink' ? t.ink.name : t.word.name;
  }

  /// Ответ человека. Время реакции считается от показа стимула.
  StroopOutcome answer(StroopColor chosen) {
    final t = trial;
    if (t == null || _answered) return StroopOutcome.miss;
    _answered = true;
    final rt = _now() - _trialStart;
    if (chosen.name == correctName) {
      hits += 1;
      if (trialRule == mode) {
        if (t.ink.name == t.word.name) {
          rtsCongruent.add(rt);
        } else {
          rtsIncongruent.add(rt);
        }
      }
      return StroopOutcome.hit;
    }
    errors += 1;
    return StroopOutcome.wrong;
  }

  /// Окно ответа вышло: просрочка = ошибка, время реакции не копится.
  StroopOutcome timeout() {
    if (_answered) return StroopOutcome.miss;
    _answered = true;
    misses += 1;
    errors += 1;
    return StroopOutcome.miss;
  }

  double _mean(List<int> xs) => xs.isEmpty ? 0 : xs.reduce((a, b) => a + b) / xs.length;

  /// Среднее время реакции по верным пробам базового правила. Пусто, когда их нет.
  ///
  /// Показывается человеку и проверяется пробой: постоянный сдвиг отсчёта (например,
  /// если считать от планирования таймера, а не от показа стимула) разностью
  /// `interferenceMs` НЕ ловится — он сокращается. Ловится только этим числом.
  int? get meanRtMs {
    final all = [...rtsCongruent, ...rtsIncongruent];
    if (all.isEmpty) return null;
    return _mean(all).round();
  }

  /// Мера прохода: интерференция — разность средних времён реакции.
  /// Пусто, когда одной из половин нет: ноль означал бы «интерференции нет».
  int? get interferenceMs {
    if (rtsCongruent.isEmpty || rtsIncongruent.isEmpty) return null;
    return (_mean(rtsIncongruent) - _mean(rtsCongruent)).round();
  }

  double get accuracy => params.trials == 0 ? 0 : hits / params.trials;
}
