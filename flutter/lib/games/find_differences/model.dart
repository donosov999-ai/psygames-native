/// ПРАВИЛА «НАЙДИ ОТЛИЧИЯ» — перенос из frontend/app/games/find-differences.tsx.
///
/// Две почти одинаковые сцены: найти все отличия за отведённое время, три раунда
/// на уровень. Растут четыре оси: сколько отличий (2→6), сколько объектов (12→19),
/// сколько секунд на раунд (40→15) и — с пятнадцатого уровня — СХОДСТВО СОСЕДЕЙ.
///
/// 🔴 ЧЕТВЁРТАЯ ОСЬ — ЭТО ПРИМАНКА, А НЕ «ПОМЕЛЬЧЕ». Алфавит зверей сужается
/// (12 → 3), и в сцене появляются двойники: тот же зверь стоит в двух-трёх
/// местах. Ошибка рождается не от мелкости отличия, а от того, что человек
/// сравнивает левого зверя с ЕГО ЖЕ двойником справа. При этом приманка не врёт:
/// любое отличие остаётся честно отличимым, если сравнить нужную пару.
/// Ниже трёх видов не опускаемся — сцена превратилась бы в шахматную доску.
library;

import 'dart:math' as math;

import '../../shell/js_compat.dart' show Rng, jsRound;

export '../../shell/js_compat.dart' show Rng, createRng;

/// Сколько разных зверей в наборе. Логике сцены нужен только их счёт — сам
/// спрайт подставляет экран из набора профиля.
const int spriteCount = 12;

const int roundsPerLevel = 3;
const int fdBossEvery = 3;

class Shape {
  Shape({required this.sprite, required this.x, required this.y, required this.size, required this.rot});
  int sprite;
  double x, y;
  double size;
  int rot;

  Shape copy() => Shape(sprite: sprite, x: x, y: y, size: size, rot: rot);
}

class FdParams {
  const FdParams({
    required this.diffCount,
    required this.objectCount,
    required this.roundTimeSec,
    required this.rounds,
    required this.spriteAlphabet,
  });
  final int diffCount, objectCount, roundTimeSec, rounds, spriteAlphabet;
}

FdParams levelParams(int level) {
  final diffCount = math.min(6, 2 + ((level - 1) / 3).floor());        // 2,2,2,3,3,3 … 6
  final objectCount = math.min(19, 12 + ((level - 1) / 2).floor());    // 12 → 19
  final roundTimeSec = math.max(15, 40 - (level - 1) * 2);             // 40 с → 15 с
  // Время НЕ трогаем сверх этого намеренно: вечерний слот запрещает наказание
  // временем, и ось сходства обязана работать и там, где таймера нет вовсе.
  final spriteAlphabet =
      math.max(3, math.min(spriteCount, spriteCount - (math.max(0, level - 15) / 2).floor()));
  return FdParams(
    diffCount: diffCount,
    objectCount: objectCount,
    roundTimeSec: roundTimeSec,
    rounds: roundsPerLevel,
    spriteAlphabet: spriteAlphabet,
  );
}

/// Верх лестницы СЧИТАЕТСЯ исполнением, а не вписан числом: вписанное разошлось
/// бы с лестницей при первой же правке молча.
final int findDifferencesLevels = (() {
  var last = 1;
  var prev = _paramsKey(levelParams(1));
  for (var l = 2; l <= 200; l += 1) {
    final current = _paramsKey(levelParams(l));
    if (current != prev) {
      last = l;
      prev = current;
    }
  }
  return last;
})();

String _paramsKey(FdParams p) =>
    '${p.diffCount}|${p.objectCount}|${p.roundTimeSec}|${p.rounds}|${p.spriteAlphabet}';

double _rand(double a, double b, Rng rnd) => a + rnd() * (b - a);

/// Расстояние между центрами, ближе которого объекты перекрылись бы и один
/// закрыл бы нажатие по другому.
bool tooClose(Shape a, Shape b, {double padding = 12}) {
  final minDist = (a.size + b.size) / 2 + padding;
  final dx = a.x - b.x;
  final dy = a.y - b.y;
  return (dx * dx + dy * dy) < (minDist * minDist);
}

/// Сцена по сетке: каждый объект в своей ячейке плюс лёгкое смещение внутри неё.
/// Объект гарантированно остаётся внутри ячейки с зазором — НАЛОЖЕНИЯ НЕВОЗМОЖНЫ.
List<Shape> generateScene(double width, double height, int count, int alphabet, Rng rnd) {
  final cols = math.max(1, jsRound(math.sqrt(count * width / math.max(1, height))).toInt());
  final rows = (count / cols).ceil();
  final cw = width / cols;
  final ch = height / rows;
  final cellMin = math.min(cw, ch);
  final size = math.max(30.0, math.min(56.0, cellMin - 16));
  final jitter = math.max(0.0, (cellMin - size) / 2 - 6);
  final cellIdx = List<int>.generate(cols * rows, (i) => i);
  for (var i = cellIdx.length - 1; i > 0; i -= 1) {
    final j = (rnd() * (i + 1)).floor();
    final t = cellIdx[i];
    cellIdx[i] = cellIdx[j];
    cellIdx[j] = t;
  }
  final shapes = <Shape>[];
  for (var n = 0; n < math.min(count, cols * rows); n += 1) {
    final ci = cellIdx[n];
    final gr = (ci / cols).floor();
    final gc = ci % cols;
    shapes.add(Shape(
      sprite: (rnd() * math.max(1, math.min(alphabet, spriteCount))).floor(),
      x: gc * cw + cw / 2 + _rand(-jitter, jitter, rnd),
      y: gr * ch + ch / 2 + _rand(-jitter, jitter, rnd),
      size: size,
      rot: 0,
    ));
  }
  return shapes;
}

class Altered {
  const Altered(this.shapes, this.diffIdx);
  final List<Shape> shapes;
  final List<int> diffIdx;
}

/// Вторая сцена: те же объекты, но у нескольких изменён зверь, размер или поворот.
///
/// 🔴 ПОДМЕНА ЗВЕРЯ ОСТАЁТСЯ ВНУТРИ АЛФАВИТА. Иначе на верхних уровнях отличие
/// выдавало бы себя само: в сцене из трёх видов вдруг появляется четвёртый, и
/// его видно, не сравнивая картинки вовсе, — ось сходства работала бы наоборот.
Altered withDifference(List<Shape> scene, int diffCount, int alphabet, Rng rnd) {
  final altered = scene.map((s) => s.copy()).toList();
  final indices = List<int>.generate(scene.length, (i) => i);
  for (var i = indices.length - 1; i > 0; i -= 1) {
    final j = (rnd() * (i + 1)).floor();
    final t = indices[i];
    indices[i] = indices[j];
    indices[j] = t;
  }
  final diffIdx = indices.take(diffCount).toList();
  for (final i in diffIdx) {
    // Первый способ выбирается броском, остальные идут запасными.
    final tryChanges = [(rnd() * 3).floor(), 0, 1, 2];
    var applied = false;
    for (final change in tryChanges) {
      if (applied) break;
      if (change == 0) {
        final alph = math.max(1, math.min(alphabet, spriteCount));
        if (alph > 1) {
          var sp = altered[i].sprite;
          do {
            sp = (rnd() * alph).floor();
          } while (sp == altered[i].sprite);
          altered[i].sprite = sp;
          applied = true;
        }
      } else if (change == 1) {
        final candidate = altered[i].copy();
        candidate.size = candidate.size > 54 ? candidate.size - 16 : candidate.size + 16;
        var overlaps = false;
        for (var oi = 0; oi < altered.length; oi += 1) {
          if (oi != i && tooClose(candidate, altered[oi], padding: 8)) {
            overlaps = true;
            break;
          }
        }
        if (!overlaps) {
          altered[i].size = candidate.size;
          applied = true;
        }
      } else {
        altered[i].rot = (altered[i].rot + (rnd() < 0.5 ? 180 : 90)) % 360;
        applied = true;
      }
    }
  }
  return Altered(altered, diffIdx);
}

// ────────────────── Раскладка сцен и попадание — ПРАВИЛА из замера ───────────
//
// 🔴 ТАП ЛОВИТ СЦЕНА ПО КООРДИНАТЕ, А НЕ САМ ОБЪЕКТ. Раньше нажатие висело на
// фигуре: мелкий треугольник — крошечная зона, промахнуться легко. Теперь ищется
// ближайший объект, и промах прощается до края плюс 16 точек (но не меньше 28).
//
// 🔴 ВЫСОТА СЦЕНЫ — БЮДЖЕТ, А НЕ «ПОЛОВИНА ЭКРАНА». Замер 16.09.2026: строка
// подсказки лежала под плашкой показателей на ВСЕХ экранах, потому что высота
// считалась как «(экран − 240) / 2» и колонка с резервом выходила выше поля.
// Здесь поле получает высоту ЧИСЛОМ от каркаса, поэтому вычитать резерв низа уже
// не нужно — только собственные зазоры колонки.

/// Строка подсказки 16 + зазор колонки 12 + зазор между сценами 18 + рамки 4×2.
const double fdColumnGaps = 16 + 12 + 18 + 4 * 2;

class SceneSize {
  const SceneSize(this.width, this.height);
  final double width, height;
}

SceneSize sceneSize(double screenW, double fieldHeight) {
  final w = math.min(screenW - 24, 440.0);
  // ⚠️ ОТЛИЧИЕ ОТ ВЕБА, И ОНО НАМЕРЕННОЕ. Там нижний предел сцены 150 точек, и на
  // 320×568 колонка не влезала — в вебе это записано как «известный остаток».
  // Здесь поле приходит ЧИСЛОМ, и вылезать некуда: две сцены обязаны уложиться в
  // отданную высоту. Поэтому предел опущен до 110 — ниже сцена перестаёт читаться,
  // но до этого размера мы сперва ужимаемся, а не режем картинку.
  final budget = (fieldHeight - fdColumnGaps) / 2;
  final h = math.max(110.0, math.min(math.min(340.0, w * 0.8), budget));
  return SceneSize(w, h);
}

/// Ближайший объект к точке нажатия или null. Прощает промах до края плюс 16
/// точек, но не меньше 28 — иначе в мелкую фигуру не попасть пальцем.
int? hitTest(List<Shape> shapes, double x, double y) {
  var best = -1;
  var bestD = double.infinity;
  for (var i = 0; i < shapes.length; i += 1) {
    final s = shapes[i];
    final dx = s.x - x;
    final dy = s.y - y;
    final d = math.sqrt(dx * dx + dy * dy);
    final tol = math.max(s.size / 2 + 16, 28);
    if (d <= tol && d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best >= 0 ? best : null;
}
