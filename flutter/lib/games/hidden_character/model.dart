/// «КТО СПРЯТАЛСЯ?» — ПРАВИЛА РАУНДА, БЕЗ FLUTTER.
///
/// Происхождение: движок MindLab `escondidos/escondidos.py` (дедукция да/нет,
/// clean-room) и пилот Codex (ветка codex/mindlab-five), решение Дениса 30.09.2026
/// «добавляем нативно, дорабатываем потом». Имя Escondidos — коммерческое, в
/// продукте его нет.
///
/// 🔴 ЧЕМ ЭТО ОТЛИЧАЕТСЯ ОТ ПИЛОТА. В пилоте 16 персонажей были ВСЕМИ сочетаниями
/// четырёх признаков: любой вопрос делил ровно пополам, и любые четыре вопроса
/// давали ответ — думать было не над чем. Здесь признаков больше, чем нужно, а
/// персонажи — не все сочетания: один вопрос делит 6 на 6, другой 11 на 1. Выбор
/// вопроса и есть навык, и у него есть эталон — наименьшее число вопросов в
/// худшем случае ([worstCaseQuestions]), посчитанное полным перебором.
library;

import 'dart:math';

/// Признаки, которые видно на карточке.
enum Feature { hat, glasses, beard, redShirt, smile, earring }

/// Ступень: сколько персонажей, сколько признаков и сколько ЛОВУШЕК требуется от расклада.
///
/// 🔴 ОСЬ ТРУДНОСТИ — ЛОВУШКИ, А НЕ ЧИСЛО ПЕРСОНАЖЕЙ (замер 30.09.2026, 200 раскладов на
/// конфигурацию). Ловушка — вопрос, который ухудшает гарантию: после него в худшем случае
/// нужно больше вопросов, чем было бы после лучшего. [trapDensity] — сколько таких вопросов
/// в среднем задаст игрок, спрашивающий наугад. Рост персонажей трудности НЕ даёт: на
/// 40–48 персонажах из 64 возможных любой вопрос делит пополам, ловушек почти нет
/// (медиана 0,10 и 0,02), а внутри одной конфигурации разброс огромный (16×6: от 0,33 до
/// 1,31 между 10-м и 90-м процентилем). Поэтому ступень ОТБИРАЕТ расклад по ловушкам.
///
/// Прежняя таблица 8→24 персонажа давала ловушки 0 · 0,08 · 0,01 · 0,44 · 0,57 · 0,80 ·
/// 0,43 · 0,65 — первые три ступени навык выбора не проверяли вовсе, седьмая была легче
/// шестой.
///
/// ⚠️ ГРАНИЦА ОДИНОЧНЫХ ВОПРОСОВ, ПОДПИСАННАЯ ЗАМЕРОМ: при шести признаках ловушек больше
/// ~1,5 на расклад не бывает (максимум за 2800 раскладов — 1,58). Дальше лестница растёт
/// следующей осью — вопросами с «или» (ступени 9+), не размером поля.
({int suspects, int features, double minTraps, double maxTraps, bool or}) hiddenStep(int level) {
  // Окна ловушек [от, до) — без перекрытий: при одном нижнем пороге расклады перелетали в
  // чужую полосу, и седьмая ступень выходила легче шестой (1,16 против 1,19 — поймал гейт).
  // Размер поля выбран там, где окно достижимо (замер распределений 30.09), и к верху
  // растёт длина партии: 28 персонажей — эталон 5–6 вопросов.
  //
  // 🔴 СТУПЕНИ 9+ — ВОПРОСЫ С «ИЛИ» (задача 5c011a93, замер 01.10.2026: Python-перенос того же
  // минимакса, 40 раскладов на сочетание, 6 признаков). «Есть ли шляпа ИЛИ очки?» — 15 пар
  // к 6 одиночным вопросам: ловушек становится больше, а лучший вопрос уже не очевиден.
  // Медиана ловушек без «или» / с «или»: 16 перс. 1,07 / 1,85 · 24 — 0,63 / 1,90 ·
  // 28 — 1,03 / 2,32; максимум 1,40 / 3,01. Граница 1,58 снимается этой осью.
  final t = _hiddenTable[(level - 1).clamp(0, _hiddenTable.length - 1)];
  return (suspects: t.$1, features: t.$2, minTraps: t.$3, maxTraps: t.$4, or: t.$5);
}

/// Сколько ступеней в таблице.
int get hiddenStepCount => _hiddenTable.length;

const _hiddenTable = <(int, int, double, double, bool)>[
  (8, 3, 0.0, 0.01, false),    // знакомство: любой вопрос годится
  (12, 5, 0.25, 0.4, false),
  (16, 6, 0.45, 0.6, false),
  (24, 6, 0.65, 0.8, false),
  (28, 6, 0.85, 1.0, false),
  (28, 6, 1.0, 1.15, false),
  (28, 6, 1.15, 1.3, false),
  (16, 6, 1.3, 1.45, false),   // вершина при шести одиночных вопросах
  (16, 6, 1.45, 1.7, true),    // дальше — «или»
  (24, 6, 1.7, 1.95, true),
  (24, 6, 1.95, 2.2, true),
  (28, 6, 2.2, 2.45, true),
  (28, 6, 2.45, 9.0, true),    // вершина замера (максимум 3,01)
];

/// 🔴 ВОПРОС — МАСКА ПРИЗНАКОВ, СОЕДИНЁННЫХ «ИЛИ». Один бит — «есть ли шляпа?», два —
/// «есть ли шляпа ИЛИ очки?»: ответ «да», если у спрятавшегося есть хоть один из них.
typedef Question = int;

/// Вопрос про один признак.
Question askAbout(Feature f) => 1 << f.index;

/// Вопрос «[a] или [b]?».
Question askEither(Feature a, Feature b) => (1 << a.index) | (1 << b.index);

/// Признаки вопроса — по порядку перечисления.
List<Feature> questionFeatures(Question q) => [for (final f in Feature.values) if (q & (1 << f.index) != 0) f];

/// Ответ персонажа [suspect] на вопрос [q].
bool answersYes(int suspect, Question q) => suspect & q != 0;

/// Какие вопросы можно задать: по одному признаку, а со ступени «или» — ещё все пары.
List<Question> questionsFor(List<Feature> features, {bool withOr = false}) => [
      for (final f in features) askAbout(f),
      if (withOr)
        for (var i = 0; i < features.length; i++)
          for (var j = i + 1; j < features.length; j++) askEither(features[i], features[j]),
    ];

bool hasFeature(int mask, Feature f) => mask & (1 << f.index) != 0;

/// 🔴 ПЕРЕБОР НА МНОЖЕСТВАХ-ЧИСЛАХ. Маска персонажа — число 0…63 (шесть признаков), значит
/// любое множество персонажей — 64-битное число «какие маски на месте». Деление вопросом —
/// одно `&` с заранее посчитанным «кто ответит да», ключ памяти — само число.
///
/// 📍 ЗАЧЕМ. С «или» вопросов 21 вместо 6, и прежний перебор (списки + ключ-строка) стоил
/// замера ради: Python-перенос — 261 мс на расклад 28 персонажей против 4 мс без «или», а
/// раздача отбирает до 120 раскладов. Здесь та же рекурсия без списков и строк.
///
/// ⚠️ Только для нативной сборки: 64-битные операции над int в Dart на вебе (JS) не точны.
/// Игра нативная (NATIVE_ONLY_GAMES), на веб не собирается.
class _Solver {
  _Solver(this.questions) : _yes = [for (final q in questions) _yesSet(q)];

  final List<Question> questions;
  final List<int> _yes;
  final Map<int, int> _worst = {};
  final Map<int, double> _traps = {};

  static int _yesSet(Question q) {
    var bits = 0;
    for (var v = 0; v < 64; v++) {
      if (v & q != 0) bits |= 1 << v;
    }
    return bits;
  }

  static int setOf(Iterable<int> masks) {
    var s = 0;
    for (final m in masks) {
      s |= 1 << m;
    }
    return s;
  }

  static int count(int s) {
    var n = 0;
    while (s != 0) {
      s &= s - 1;
      n++;
    }
    return n;
  }

  /// Наименьшее число вопросов, которым гарантированно находится любой из множества.
  int worst(int s) {
    if (s & (s - 1) == 0) return 0;   // ноль или один персонаж
    final hit = _worst[s];
    if (hit != null) return hit;
    var best = 1 << 30;
    for (final y in _yes) {
      final yes = s & y;
      if (yes == 0 || yes == s) continue;   // вопрос ничего не делит
      final v = 1 + max<int>(worst(yes), worst(s & ~y));
      if (v < best) best = v;
    }
    _worst[s] = best;
    return best;
  }

  /// Цена вопроса [qi] для множества [s]: худший случай после него, `null` — не делит.
  int? after(int s, int qi) {
    final yes = s & _yes[qi];
    if (yes == 0 || yes == s) return null;
    return 1 + max<int>(worst(yes), worst(s & ~_yes[qi]));
  }

  /// Ожидание ошибочных выборов у игрока, спрашивающего наугад среди полезных вопросов.
  double traps(int s) {
    if (s & (s - 1) == 0) return 0;
    final hit = _traps[s];
    if (hit != null) return hit;
    final best = worst(s);
    final total = count(s);
    var sum = 0.0, n = 0;
    for (final y in _yes) {
      final yes = s & y;
      if (yes == 0 || yes == s) continue;
      final no = s & ~y;
      final v = 1 + max<int>(worst(yes), worst(no));
      sum += (v > best ? 1 : 0) + count(yes) / total * traps(yes) + count(no) / total * traps(no);
      n++;
    }
    final r = n == 0 ? 0.0 : sum / n;
    _traps[s] = r;
    return r;
  }

  /// Лучший вопрос: минимум худшего случая, при равенстве — ближе к делению пополам.
  Question? best(int s) {
    Question? out;
    var bestScore = 1 << 30, bestBalance = 1 << 30;
    final total = count(s);
    for (var qi = 0; qi < questions.length; qi++) {
      final score = after(s, qi);
      if (score == null) continue;
      final balance = (2 * count(s & _yes[qi]) - total).abs();
      if (score < bestScore || (score == bestScore && balance < bestBalance)) {
        out = questions[qi];
        bestScore = score;
        bestBalance = balance;
      }
    }
    return out;
  }
}

/// Сколько раз в среднем ошибётся в выборе вопроса игрок, спрашивающий наугад: точное
/// ожидание по всем оставшимся и всем полезным вопросам (цель — любая из оставшихся).
double trapDensityFor(List<int> masks, List<Question> questions) =>
    _Solver(questions).traps(_Solver.setOf(masks));

/// Наименьшее число вопросов, которым ГАРАНТИРОВАННО находится любой из [masks].
int worstCaseFor(List<int> masks, List<Question> questions) => _Solver(questions).worst(_Solver.setOf(masks));

/// Лучший вопрос из [questions]; `null` — делить нечего.
Question? bestQuestionFor(List<int> masks, List<Question> questions) =>
    _Solver(questions).best(_Solver.setOf(masks));

/// То же для одиночных вопросов по признакам — прежняя форма, ей пользуются пробы.
double trapDensity(List<int> masks, List<Feature> features) => trapDensityFor(masks, questionsFor(features));
int worstCaseQuestions(List<int> masks, List<Feature> features) => worstCaseFor(masks, questionsFor(features));
Feature? bestQuestion(List<int> masks, List<Feature> features) {
  final q = bestQuestionFor(masks, questionsFor(features));
  return q == null ? null : questionFeatures(q).single;
}

class HiddenRound {
  HiddenRound({required this.features, required this.suspects, required this.target, this.withOr = false})
      : questions = questionsFor(features, withOr: withOr),
        remaining = {for (var i = 0; i < suspects.length; i++) i} {
    if (suspects.toSet().length != suspects.length) {
      throw ArgumentError('двое одинаковых — их не различить ни одним вопросом');
    }
    _solver = _Solver(questions);
    optimal = _solver.worst(_Solver.setOf(suspects));
  }

  /// Раздача ступени: [hiddenStep]. Признаки — случайные из шести, персонажи — разные
  /// сочетания этих признаков, и расклад ОТБИРАЕТСЯ по ловушкам: первый, попавший в окно
  /// ступени. ⚠️ Зависать нельзя: не больше [attempts] попыток, дальше — ближайший к окну
  /// из увиденных.
  factory HiddenRound.deal(int level, Random rnd, {int attempts = 120}) {
    final step = hiddenStep(level);
    List<Feature>? bestUsed;
    List<int>? bestSuspects;
    var bestGap = double.infinity;
    for (var a = 0; a < attempts; a++) {
      final used = (List<Feature>.of(Feature.values)..shuffle(rnd)).take(step.features).toList()
        ..sort((x, y) => x.index.compareTo(y.index));
      final all = <int>[];
      for (var combo = 0; combo < (1 << used.length); combo++) {
        var mask = 0;
        for (var k = 0; k < used.length; k++) {
          if (combo & (1 << k) != 0) mask |= 1 << used[k].index;
        }
        all.add(mask);
      }
      all.shuffle(rnd);
      final suspects = all.take(min(step.suspects, all.length)).toList();
      final t = trapDensityFor(suspects, questionsFor(used, withOr: step.or));
      final gap = t < step.minTraps ? step.minTraps - t : (t >= step.maxTraps ? t - step.maxTraps + 1e-9 : 0.0);
      if (gap < bestGap) {
        bestGap = gap;
        bestUsed = used;
        bestSuspects = suspects;
      }
      if (gap == 0) break;
    }
    return HiddenRound(
      features: bestUsed!,
      suspects: bestSuspects!,
      target: rnd.nextInt(bestSuspects.length),
      withOr: step.or,
    );
  }

  /// Признаки в ходу — о них можно спрашивать.
  final List<Feature> features;

  /// Можно ли спрашивать «A или B?» (ступени 9+).
  final bool withOr;

  /// Все вопросы, которые можно задать.
  final List<Question> questions;

  /// Персонажи: маска признаков.
  final List<int> suspects;

  /// Кто спрятался (номер в [suspects]).
  final int target;

  /// Эталон: вопросов в худшем случае при лучшей игре.
  late final int optimal;

  /// Кто ещё под подозрением.
  final Set<int> remaining;

  /// Заданные вопросы и ответы — по порядку.
  final List<(Question, bool)> asked = [];

  /// Итог: `null` — ещё играем.
  bool? won;

  /// 🔴 ОШИБОЧНЫЕ ВЫБОРЫ — то, что меряет навык. Вопрос ошибочен, если после него в худшем
  /// случае нужно больше вопросов, чем после лучшего из доступных. Прежний счёт «вопросы
  /// сверх эталона» мерил удачу: эталон — худший случай, а игрок наугад в среднем тратил
  /// МЕНЬШЕ (на 8-й ступени 4,78 против 5,03) и брал три звезды в 79–100 % партий.
  int mistakes = 0;

  late final _Solver _solver;

  /// Ловушек в раскладе — для отчёта и проб.
  late final double traps = _solver.traps(_Solver.setOf(suspects));

  /// Множество ещё подозреваемых — числом, для перебора.
  int get _left => _Solver.setOf([for (final i in remaining) suspects[i]]);

  bool wasAsked(Feature f) => wasAskedQuestion(askAbout(f));
  bool wasAskedQuestion(Question q) => asked.any((a) => a.$1 == q);

  /// Спросить: есть ли у спрятавшегося признак [f].
  bool ask(Feature f) => askQuestion(askAbout(f));

  /// Спросить вопросом [q] (один признак или «A или B»). Отсекает несовпавших.
  bool askQuestion(Question q) {
    if (won != null) throw StateError('раунд окончен');
    if (!questions.contains(q) || wasAskedQuestion(q)) throw StateError('вопрос $q нельзя');
    final s = _left;
    final best = _solver.worst(s);
    final v = _solver.after(s, questions.indexOf(q));
    if (v != null) {
      if (v > best) mistakes++;
    } else if (remaining.length > 1) {
      mistakes++;   // вопрос, который ничего не делит, — тоже потраченный ход
    }
    final answer = answersYes(suspects[target], q);
    asked.add((q, answer));
    remaining.removeWhere((i) => answersYes(suspects[i], q) != answer);
    return answer;
  }

  /// Лучший вопрос сейчас (для разбора): `null` — делить нечего.
  Question? bestNow() => _solver.best(_left);

  /// Назвать спрятавшегося.
  bool pick(int i) {
    if (won != null) throw StateError('раунд окончен');
    if (!remaining.contains(i)) throw StateError('$i уже исключён');
    won = i == target;
    return won!;
  }

  /// Лишние вопросы против эталона.
  int get extraQuestions => max(0, asked.length - optimal);
}
