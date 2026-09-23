/// ПРАВИЛА «БЫСТРОГО СЧЁТА» — перенос из frontend/app/games/quick-count.tsx.
///
/// Точки вспыхивают на мгновение, и надо назвать, сколько их было. Лестница
/// растит три оси по очереди: объём (точек больше), скорость (показ короче) и —
/// с 32-го уровня — ЗАДЕРЖКУ: пауза между исчезновением точек и появлением
/// кнопок, когда число надо продержать в уме.
///
/// 🔴 ЧТО ЗДЕСЬ ПРАВИЛО, А НЕ ВЁРСТКА. Окно ответов и раскладка точек —
/// ПРАВИЛА, и перенесены как правила:
/// · окно из шести чисел подряд не должно выдавать ответ. Замер 17.09.2026
///   показал, что окно вокруг ответа его выдавало: игрок, запомнивший для
///   каждого окна самый частый ответ, угадывал 45 % при потолке 33 %. Теперь,
///   если все возможные ответы уровня помещаются в окно, окно накрывает их
///   целиком, а сдвиг выбирает лишь начало. Проба это МЕРЯЕТ перебором.
/// · раскидывание точек держит отступ от края и зазор между точками: от них
///   зависит, читается ли картинка как отдельные точки, а не как пятно.
library;

import 'dart:math' as math;

/// Больше двадцати точек на экране телефона не различить — потолок задачи.
const int maxDots = 20;

/// Уровень, на котором кончаются оси «объём» и «скорость». Дальше растёт задержка.
const int volumeSpeedEnd = 31;

/// Сколько чисел показывается в ряду ответов. Шесть — не украшение: каркас
/// держит по краям слота 66 точек, и на экране 360 в ряд влезает по три кнопки.
const int answerMax = 6;

const int bossEvery = 3;
const int trialsPerRound = 12;

/// Уровень взят при точности не ниже 80 % за двенадцать проб.
const double passAccuracyPercent = 80;

class LevelParams {
  const LevelParams({required this.minN, required this.maxN, required this.exposureMs, required this.holdMs});
  final int minN, maxN, exposureMs, holdMs;

  @override
  bool operator ==(Object other) =>
      other is LevelParams &&
      other.minN == minN &&
      other.maxN == maxN &&
      other.exposureMs == exposureMs &&
      other.holdMs == holdMs;

  @override
  int get hashCode => Object.hash(minN, maxN, exposureMs, holdMs);

  @override
  String toString() => '$minN..$maxN/$exposureMs/$holdMs';
}

/// ⚠️ Потолок держит ОБЕ границы: раньше нижняя росла без потолка и с L40
/// обгоняла верхнюю — на 45-м кнопок не оставалось ни одной, партия вставала.
LevelParams levelParams(int level) {
  final spread = 2 + (level / 5).floor();
  final wanted = 3 + ((level - 1) / 2).floor();
  final maxN = math.min(maxDots, wanted + spread);
  final minN = math.max(2, math.min(wanted, maxN - 2));
  return LevelParams(
    minN: minN,
    maxN: maxN,
    exposureMs: math.max(300, 900 - level * 40),
    holdMs: math.min(2000, math.max(0, (level - volumeSpeedEnd) * 200)),
  );
}

/// Докуда лестница реально растёт — СЧИТАЕТСЯ из levelParams, а не вписано числом:
/// иначе следующая правка параметров разошлась бы с подписью молча.
final int quickCountLevels = (() {
  var last = 1;
  var prev = levelParams(1);
  for (var l = 2; l <= 200; l += 1) {
    final current = levelParams(l);
    if (current != prev) {
      last = l;
      prev = current;
    }
  }
  return last;
})();

/// Полный набор возможных кнопок: весь диапазон уровня плюс запас с обеих сторон.
List<int> answerChoices(LevelParams p) {
  final lo = math.max(1, p.minN - 2);
  final hi = p.maxN + 2;
  return List<int>.generate(hi - lo + 1, (i) => lo + i);
}

/// Окно из шести чисел подряд. Верный ответ ВСЕГДА внутри окна, но положение
/// задаётся сдвигом, а не центром: окно «n−3…n+3» раздавало бы ответ даром.
List<int> answerWindow(LevelParams p, int n, int shift) {
  final all = answerChoices(p);
  if (all.length <= answerMax) return all;
  final first = all.first;
  final last = all.last;
  final place = ((shift % answerMax) + answerMax) % answerMax;
  final from = math.max(first, p.maxN - answerMax + 1);
  final to = math.min(p.minN, last - answerMax + 1);
  if (from <= to) {
    final start = from + (place % (to - from + 1));
    return List<int>.generate(answerMax, (i) => start + i);
  }
  var lo = n - place;
  if (lo < first) lo = first;
  if (lo + answerMax - 1 > last) lo = last - answerMax + 1;
  return List<int>.generate(answerMax, (i) => lo + i);
}

/// Бросок для положения окна. Тянется ОДИН раз на пробу: иначе кнопки
/// перескакивали бы при каждой перерисовке, пока человек целится.
int rollWindowShift(math.Random rnd) => rnd.nextInt(answerMax);

class Dot {
  const Dot(this.x, this.y);
  final double x, y;
}

/// Раскидать n точек без наложения: отступ от края `r+8`, зазор между точками
/// `r*2.4`, не больше 60 попыток на точку — чтобы не зависнуть на тесном поле.
/// ⚠️ На тесном поле запасной путь ставит точку куда придётся: замер веба
/// (20 точек на 200×160, r=18) — 1539 слишком близких пар из 40 раздач.
/// Поэтому поле обязано быть достаточным, а не «как получится».
List<Dot> scatterDots(int n, double w, double h, double r, math.Random rnd) {
  final dots = <Dot>[];
  final pad = r + 8;
  double rx() => pad + rnd.nextDouble() * math.max(1, w - pad * 2);
  double ry() => pad + rnd.nextDouble() * math.max(1, h - pad * 2);
  for (var i = 0; i < n; i += 1) {
    var placed = false;
    for (var attempt = 0; attempt < 60 && !placed; attempt += 1) {
      final x = rx();
      final y = ry();
      final ok = dots.every((d) => math.sqrt(math.pow(d.x - x, 2) + math.pow(d.y - y, 2)) >= r * 2.4);
      if (ok) {
        dots.add(Dot(x, y));
        placed = true;
      }
    }
    if (!placed) dots.add(Dot(rx(), ry()));
  }
  return dots;
}

/// Насколько часто угадает игрок, запомнивший для каждого окна самый частый
/// ответ. Считается точным перебором всех n и всех сдвигов — тем же способом,
/// которым мерили утечку в вебе. Потолок честной игры — 1 / (число возможных).
double windowGuessRate(LevelParams p) {
  final byWindow = <String, Map<int, int>>{};
  var total = 0;
  for (var n = p.minN; n <= p.maxN; n += 1) {
    for (var shift = 0; shift < answerMax; shift += 1) {
      final key = answerWindow(p, n, shift).join(',');
      final m = byWindow.putIfAbsent(key, () => <int, int>{});
      m[n] = (m[n] ?? 0) + 1;
      total += 1;
    }
  }
  var best = 0;
  for (final m in byWindow.values) {
    best += m.values.reduce(math.max);
  }
  return best / total;
}

// ─────────────────────── Раскладка ряда ответов (ПРАВИЛО) ───────────────────
//
// 🔴 СТОЛБЦЫ СЧИТАЮТСЯ ОТ САМОГО УЗКОГО ЭКРАНА, А НЕ ОТ ТЕКУЩЕГО. Иначе на 390
// выходит два ряда, на 360 — три, и полоса ответа прыгает при переходе между
// телефонами. Замер веба 09.09.2026: 133 точки на 390 против 193 на 360 — и это
// раздражало в «Зарядке», где игры идут одна за другой. Числа взяты у соседнего
// раздела («Внимание», ANSWER_BAR_H = 120), чтобы разделы не разъехались между собой.
//
// ⚠️ Когда вторая перенесённая игра раздела попросит те же числа — переехать в
// общий слой. Пока пользователь один, и копия была бы хуже общего места.

const double gutterBoth = 132;
const double btnGap = 8;
const double minTap = 48;
const double searchBarH = 120;
const double minScreenW = 320;

class AnswerGrid {
  const AnswerGrid({required this.cols, required this.rows, required this.size});
  final int cols, rows;

  /// Сторона кнопки: квадрат, чтобы цифра стояла в центре.
  final double size;
}

AnswerGrid answerGrid(int count, double screenW) {
  final n = math.max(1, math.min(count, answerMax));
  final narrow = minScreenW - gutterBoth;
  final cols = math.max(1, ((narrow + btnGap) / (minTap + btnGap)).floor());
  final rows = (n / cols).ceil();
  final screen = screenW.isFinite && screenW >= minScreenW ? screenW : minScreenW;
  final free = screen - gutterBoth;
  final byWidth = ((free - (cols - 1) * btnGap) / cols).floorToDouble();
  final byHeight = ((searchBarH - 16 - (rows - 1) * btnGap) / rows).floorToDouble();
  return AnswerGrid(cols: cols, rows: rows, size: math.max(minTap, math.min(byWidth, byHeight)));
}
