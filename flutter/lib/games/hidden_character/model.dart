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
/// ⚠️ ГРАНИЦА, ПОДПИСАННАЯ ЗАМЕРОМ: при шести признаках ловушек больше ~1,5 на расклад не
/// бывает (максимум за 2800 раскладов — 1,58). Дальше лестница растёт следующей осью —
/// вопросами с «или» (больше вариантов вопроса — больше ловушек), не размером поля.
({int suspects, int features, double minTraps, double maxTraps}) hiddenStep(int level) {
  // Окна ловушек [от, до) — без перекрытий: при одном нижнем пороге расклады перелетали в
  // чужую полосу, и седьмая ступень выходила легче шестой (1,16 против 1,19 — поймал гейт).
  // Размер поля выбран там, где окно достижимо (замер распределений 30.09), и к верху
  // растёт длина партии: 28 персонажей — эталон 5–6 вопросов.
  const table = <(int, int, double, double)>[
    (8, 3, 0.0, 0.01),    // знакомство: любой вопрос годится
    (12, 5, 0.25, 0.4),
    (16, 6, 0.45, 0.6),
    (24, 6, 0.65, 0.8),
    (28, 6, 0.85, 1.0),
    (28, 6, 1.0, 1.15),
    (28, 6, 1.15, 1.3),
    (16, 6, 1.3, 9.0),    // вершина при шести признаках (граница — выше)
  ];
  final t = table[(level - 1).clamp(0, table.length - 1)];
  return (suspects: t.$1, features: t.$2, minTraps: t.$3, maxTraps: t.$4);
}

/// Сколько раз в среднем ошибётся в выборе вопроса игрок, спрашивающий наугад: точное
/// ожидание по всем оставшимся и всем полезным вопросам (цель — любая из оставшихся).
double trapDensity(List<int> masks, List<Feature> features,
    [Map<String, int>? worst, Map<String, double>? memo]) {
  if (masks.length <= 1) return 0;
  final w = worst ?? <String, int>{};
  final e = memo ?? <String, double>{};
  final key = (List<int>.of(masks)..sort()).join(',');
  final hit = e[key];
  if (hit != null) return hit;
  final best = worstCaseQuestions(masks, features, w);
  var sum = 0.0, n = 0;
  for (final f in features) {
    final yes = [for (final m in masks) if (hasFeature(m, f)) m];
    if (yes.isEmpty || yes.length == masks.length) continue;
    final no = [for (final m in masks) if (!hasFeature(m, f)) m];
    final v = 1 + max<int>(worstCaseQuestions(yes, features, w), worstCaseQuestions(no, features, w));
    sum += (v > best ? 1 : 0) +
        yes.length / masks.length * trapDensity(yes, features, w, e) +
        no.length / masks.length * trapDensity(no, features, w, e);
    n++;
  }
  final r = n == 0 ? 0.0 : sum / n;
  e[key] = r;
  return r;
}

bool hasFeature(int mask, Feature f) => mask & (1 << f.index) != 0;

/// Наименьшее число вопросов, которым ГАРАНТИРОВАННО находится любой из [masks]
/// (минимакс по вопросам из [features]). Перебор с памятью: на 24 персонажах и
/// шести признаках — доли секунды.
int worstCaseQuestions(List<int> masks, List<Feature> features, [Map<String, int>? memo]) {
  if (masks.length <= 1) return 0;
  final cache = memo ?? <String, int>{};
  final key = (List<int>.of(masks)..sort()).join(',');
  final hit = cache[key];
  if (hit != null) return hit;
  var best = 1 << 30;
  for (final f in features) {
    final yes = [for (final m in masks) if (hasFeature(m, f)) m];
    if (yes.isEmpty || yes.length == masks.length) continue; // вопрос ничего не делит
    final no = [for (final m in masks) if (!hasFeature(m, f)) m];
    final v = 1 + max<int>(worstCaseQuestions(yes, features, cache), worstCaseQuestions(no, features, cache));
    if (v < best) best = v;
  }
  cache[key] = best;
  return best;
}

/// Лучший вопрос из оставшихся: минимум худшего случая, при равенстве — ближе к
/// делению пополам. `null` — делить нечего.
Feature? bestQuestion(List<int> masks, List<Feature> features) {
  Feature? best;
  var bestScore = 1 << 30;
  var bestBalance = 1 << 30;
  final memo = <String, int>{};
  for (final f in features) {
    final yes = [for (final m in masks) if (hasFeature(m, f)) m];
    if (yes.isEmpty || yes.length == masks.length) continue;
    final no = [for (final m in masks) if (!hasFeature(m, f)) m];
    final score = 1 + max<int>(worstCaseQuestions(yes, features, memo), worstCaseQuestions(no, features, memo));
    final balance = (yes.length - no.length).abs();
    if (score < bestScore || (score == bestScore && balance < bestBalance)) {
      best = f;
      bestScore = score;
      bestBalance = balance;
    }
  }
  return best;
}

class HiddenRound {
  HiddenRound({required this.features, required this.suspects, required this.target})
      : optimal = worstCaseQuestions(suspects, features),
        remaining = {for (var i = 0; i < suspects.length; i++) i} {
    if (suspects.toSet().length != suspects.length) {
      throw ArgumentError('двое одинаковых — их не различить ни одним вопросом');
    }
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
      final t = trapDensity(suspects, used);
      final gap = t < step.minTraps ? step.minTraps - t : (t >= step.maxTraps ? t - step.maxTraps + 1e-9 : 0.0);
      if (gap < bestGap) {
        bestGap = gap;
        bestUsed = used;
        bestSuspects = suspects;
      }
      if (gap == 0) break;
    }
    return HiddenRound(features: bestUsed!, suspects: bestSuspects!, target: rnd.nextInt(bestSuspects.length));
  }

  /// Признаки в ходу — о них можно спрашивать.
  final List<Feature> features;

  /// Персонажи: маска признаков.
  final List<int> suspects;

  /// Кто спрятался (номер в [suspects]).
  final int target;

  /// Эталон: вопросов в худшем случае при лучшей игре.
  final int optimal;

  /// Кто ещё под подозрением.
  final Set<int> remaining;

  /// Заданные вопросы и ответы — по порядку.
  final List<(Feature, bool)> asked = [];

  /// Итог: `null` — ещё играем.
  bool? won;

  /// 🔴 ОШИБОЧНЫЕ ВЫБОРЫ — то, что меряет навык. Вопрос ошибочен, если после него в худшем
  /// случае нужно больше вопросов, чем после лучшего из доступных. Прежний счёт «вопросы
  /// сверх эталона» мерил удачу: эталон — худший случай, а игрок наугад в среднем тратил
  /// МЕНЬШЕ (на 8-й ступени 4,78 против 5,03) и брал три звезды в 79–100 % партий.
  int mistakes = 0;

  final Map<String, int> _worst = {};

  /// Ловушек в раскладе — для отчёта и проб.
  late final double traps = trapDensity(suspects, features, _worst);

  bool wasAsked(Feature f) => asked.any((a) => a.$1 == f);

  /// Спросить: есть ли у спрятавшегося признак [f]. Отсекает несовпавших.
  bool ask(Feature f) {
    if (won != null) throw StateError('раунд окончен');
    if (!features.contains(f) || wasAsked(f)) throw StateError('вопрос $f нельзя');
    final rem = [for (final i in remaining) suspects[i]];
    final best = worstCaseQuestions(rem, features, _worst);
    final yes = [for (final m in rem) if (hasFeature(m, f)) m];
    final no = [for (final m in rem) if (!hasFeature(m, f)) m];
    if (yes.isNotEmpty && no.isNotEmpty) {
      final v = 1 + max<int>(worstCaseQuestions(yes, features, _worst), worstCaseQuestions(no, features, _worst));
      if (v > best) mistakes++;
    } else if (rem.length > 1) {
      mistakes++;   // вопрос, который ничего не делит, — тоже потраченный ход
    }
    final answer = hasFeature(suspects[target], f);
    asked.add((f, answer));
    remaining.removeWhere((i) => hasFeature(suspects[i], f) != answer);
    return answer;
  }

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
