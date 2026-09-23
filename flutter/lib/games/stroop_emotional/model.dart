import 'dart:math';

/// «Эмоциональный Струп» — восьмая игра раздела «Конфликт внимания» на Flutter.
///
/// Правила перенесены из `frontend/app/games/stroop-emotional.tsx`; эталон выгружен
/// прогоном живого TS в `test/fixtures/emostroop-reference.json`.
///
/// 🔴 ДОЛИ ВАЛЕНТНОСТЕЙ ЗАМОРОЖЕНЫ РАВНЫМИ И ОСЬЮ СЛОЖНОСТИ НЕ ЯВЛЯЮТСЯ. Канон —
/// равные списки слов по валентностям, и там же прямо сказано: интерференция
/// УМЕНЬШАЕТСЯ с ростом доли заряженных проб, то есть доля и есть модулятор
/// измеряемого. Сложность растёт окном ответа, объёмом и темпом подачи.
enum Valence { threat, positive, neutral }

/// Доля заряженных проб (угроза + позитив) — две трети, по трети на каждую.
const double emotionalRatio = 2 / 3;

/// Внутри заряженных — поровну угрозы и позитива.
const double threatWithinEmotional = 0.5;

/// Цвета чернил. Имена те же, что в веб-версии: по ним сверяется ответ.
const List<String> emoColors = ['red', 'green', 'blue', 'yellow'];

/// Обычная палитра и палитра для дальтонизма — те же значения, что в вебе.
const Map<String, String> emoColorHex = {
  'red': '#ef4444', 'green': '#22C55E', 'blue': '#3b82f6', 'yellow': '#eab308',
};
const Map<String, String> emoColorHexColorblind = {
  'red': '#d55e00', 'green': '#009e73', 'blue': '#0072b2', 'yellow': '#f0e442',
};

/// Языки, на которых есть наборы слов.
const List<String> emoLangs = ['ru', 'en'];

/// 🔴 ЗАПАСНОЙ ЯЗЫК, А НЕ ПАДЕНИЕ. Наборы слов есть для двух языков; на остальных
/// берётся английский. Для человека, который слов не понимает, заряд теряется и
/// проба вырождается в обычный Струп — но она ИДЁТ, а не падает, и экран об этом
/// честно предупреждает.
String emoLangFor(String lang) => emoLangs.contains(lang) ? lang : 'en';

/// Одна проба: слово, его окраска и цвет чернил.
class EmoTrial {
  const EmoTrial({required this.word, required this.valence, required this.color});
  final String word;
  final Valence valence;
  final String color;
}

/// Рождение пробы.
///
/// ⚠️ ПОРЯДОК РОЗЫГРЫШЕЙ ТОТ ЖЕ, ЧТО В TS: заряженная ли проба → (если да) угроза
/// или позитив → слово из набора → цвет чернил. На нейтральной пробе розыгрышей
/// ТРИ, на заряженной ЧЕТЫРЕ — эталон хранит взятые числа, и проба это сверяет.
EmoTrial makeTrial(Map<Valence, List<String>> words, double Function() rnd) {
  final valence = rnd() < emotionalRatio
      ? (rnd() < threatWithinEmotional ? Valence.threat : Valence.positive)
      : Valence.neutral;
  final list = words[valence]!;
  final word = list[(rnd() * list.length).floor()];
  final color = emoColors[(rnd() * emoColors.length).floor()];
  return EmoTrial(word: word, valence: valence, color: color);
}

/// Что задаёт уровень: объём, окно ответа и темп подачи.
class EmoLevel {
  const EmoLevel({
    required this.trials,
    required this.answerWindowMs,
    required this.isiBaseMs,
    required this.isiJitterMs,
  });

  /// Проб в партии: 18 → 24 → 30. Объём важен по существу: обе меры —
  /// РАЗНОСТИ относительно нейтральных, и база разности крепнет с уровнем.
  final int trials;

  /// Окно ответа, мс: 3500 → 1400.
  final int answerWindowMs;

  /// Межстимульная пауза, мс: 500 → 250, разброс 400 → 200.
  final int isiBaseMs;
  final int isiJitterMs;

  static EmoLevel of(int level) {
    final l = level;
    return EmoLevel(
      trials: l <= 5 ? 18 : (l <= 10 ? 24 : 30),
      answerWindowMs: max(1400, 3500 - (l - 1) * 150),
      isiBaseMs: max(250, 500 - (l - 1) * 18),
      isiJitterMs: max(200, 400 - (l - 1) * 15),
    );
  }
}

enum EmoOutcome { hit, wrong, miss }

/// Партия: раздаёт пробы, держит окно ответа и копит время реакции по валентностям.
class EmoStroopGame {
  EmoStroopGame({
    required this.level,
    required this.words,
    Random? rnd,
    int Function()? nowMs,
    int? trialsOverride,
  })  : params = EmoLevel.of(level),
        _rnd = rnd ?? Random(),
        _now = nowMs ?? (() => DateTime.now().millisecondsSinceEpoch),
        trialsTotal = trialsOverride ?? EmoLevel.of(level).trials;

  final int level;

  /// Наборы слов по валентностям — приходят снаружи (из ассета), а не зашиты в
  /// код: слова это материал пробы и живут в словаре, общем с веб-версией.
  final Map<Valence, List<String>> words;
  final EmoLevel params;
  final int trialsTotal;
  final Random _rnd;
  final int Function() _now;

  int round = 0;
  int hits = 0;
  int errors = 0;

  final Map<Valence, List<int>> rts = {
    Valence.threat: [],
    Valence.positive: [],
    Valence.neutral: [],
  };

  EmoTrial? trial;

  /// Межстимульная пауза текущей пробы, мс.
  int isiMs = 500;
  bool _answered = true;
  bool _shown = false;
  int _stimAt = 0;
  int _startedAt = 0;

  double _next() => _rnd.nextDouble();

  bool get finished => round >= trialsTotal && _answered;
  bool get stimulusShown => _shown;

  void begin() => _startedAt = _now();

  /// Следующая проба. После розыгрышей самой пробы берётся пауза.
  bool nextTrial() {
    if (round >= trialsTotal) return false;
    round += 1;
    trial = makeTrial(words, _next);
    isiMs = params.isiBaseMs + (_next() * params.isiJitterMs).floor();
    _answered = false;
    _shown = false;
    return true;
  }

  void showStimulus() {
    _shown = true;
    _stimAt = _now();
  }

  /// Ответ: человек называет ЦВЕТ ЧЕРНИЛ, а не слово.
  EmoOutcome answer(String color) {
    final t = trial;
    if (t == null || _answered || !_shown) return EmoOutcome.miss;
    _answered = true;
    final rt = _now() - _stimAt;
    if (color == t.color) {
      hits += 1;
      rts[t.valence]!.add(rt);
      return EmoOutcome.hit;
    }
    errors += 1;
    return EmoOutcome.wrong;
  }

  EmoOutcome timeout() {
    if (_answered) return EmoOutcome.miss;
    _answered = true;
    errors += 1;
    return EmoOutcome.miss;
  }

  double _mean(List<int> xs) => xs.isEmpty ? 0 : xs.reduce((a, b) => a + b) / xs.length;

  double get accuracy => trialsTotal == 0 ? 0 : hits / trialsTotal;

  int? get meanRtMs {
    final all = [...rts[Valence.threat]!, ...rts[Valence.positive]!, ...rts[Valence.neutral]!];
    if (all.isEmpty) return null;
    return _mean(all).round();
  }

  /// Помеха от угрозы: RT(угроза) − RT(нейтральные).
  /// Пусто, когда одной из половин нет: ноль означал бы «заряд не мешает».
  int? get interferenceThreatMs => _interference(Valence.threat);

  /// Помеха от позитива: RT(позитив) − RT(нейтральные). Вторая мера пробы.
  int? get interferencePositiveMs => _interference(Valence.positive);

  int? _interference(Valence v) {
    final charged = rts[v]!;
    final neutral = rts[Valence.neutral]!;
    if (charged.isEmpty || neutral.isEmpty) return null;
    return (_mean(charged) - _mean(neutral)).round();
  }

  /// Очки — формулой веб-версии.
  int get score {
    final mean = meanRtMs ?? 0;
    return max(0, (hits * 80 - errors * 60 - mean * 0.05).round());
  }

  double get elapsedSeconds => (_now() - _startedAt) / 1000.0;
}
