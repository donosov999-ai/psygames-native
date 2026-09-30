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

/// Ступень: сколько персонажей и сколько признаков в ходу.
({int suspects, int features}) hiddenStep(int level) {
  const suspects = [8, 10, 12, 12, 16, 16, 20, 24];
  const features = [3, 4, 4, 5, 5, 6, 6, 6];
  final i = (level - 1).clamp(0, suspects.length - 1);
  return (suspects: suspects[i], features: features[i]);
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

  /// Раздача ступени: [hiddenStep], признаки — случайные из шести, персонажи —
  /// разные сочетания этих признаков.
  factory HiddenRound.deal(int level, Random rnd) {
    final step = hiddenStep(level);
    final used = (List<Feature>.of(Feature.values)..shuffle(rnd)).take(step.features).toList()
      ..sort((a, b) => a.index.compareTo(b.index));
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
    return HiddenRound(features: used, suspects: suspects, target: rnd.nextInt(suspects.length));
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

  bool wasAsked(Feature f) => asked.any((a) => a.$1 == f);

  /// Спросить: есть ли у спрятавшегося признак [f]. Отсекает несовпавших.
  bool ask(Feature f) {
    if (won != null) throw StateError('раунд окончен');
    if (!features.contains(f) || wasAsked(f)) throw StateError('вопрос $f нельзя');
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
