/// ПРАВИЛА «ЗРИТЕЛЬНОГО ПОИСКА» — перенос из frontend/app/games/visual-search.tsx.
///
/// Канон раздела: цель среди отвлекающих. Три оси растут вместе —
///  · объём: 18 → 96 предметов, целей 1 → 4;
///  · сходство: с L8 цель задаётся ПАРОЙ «форма + цвет», и каждый отвлекающий
///    делит с ней ровно один признак — общего «выскакивания» больше нет, поиск
///    становится последовательным;
///  · подавление: с L16 на поле ПРИМАНКИ — выглядят РОВНО как цель и отличаются
///    только точкой в середине. Их нельзя брать по привычке, которой и идёт весь
///    поиск: приходится тормозить и проверять каждую находку.
///
/// ⚠️ ФОРМЫ ВЫБРАНЫ РОТО-РАЗЛИЧИМЫМИ. Каждому предмету достаётся поворот
/// 0/90/180/270, поэтому «Г» когда-то оказалась той же «L» и давала ложные
/// нажатия (отчёт тестировщика). Набор T (трилучевая) · L (угол) · I (черта) ·
/// plus (крест) под поворотом не сливается.
library;

import 'dart:math' as math;

import '../../shell/js_compat.dart' show Rng;

export '../../shell/js_compat.dart' show Rng, createRng;

/// Докуда лестница растёт ПО ПЕРВОМУ РАУНДУ — то, что игрок видит, открыв
/// уровень. Считается исполнением правил, а не вписано числом.
final int vsMaxLevel = () {
  var last = 1;
  var prev = _signature(1);
  for (var l = 2; l <= 200; l += 1) {
    final now = _signature(l);
    if (now != prev) {
      last = l;
      prev = now;
    }
  }
  return last;
}();

String _signature(int level) {
  final p = vsLevelParams(level, 1);
  return '${p.count}|${p.targetCount}|${p.conjunction}|${p.decoys}';
}

/// С этого уровня цель задаётся парой «форма + цвет».
const int vsConjFromLevel = 8;

/// До этого уровня приманок нет: уровни 1..15 остаются прежними побайтно.
const int vsNoDecoysUpTo = 15;

/// Ошибок на партию, при которых уровень ещё засчитывается.
const int vsErrorsAllowed = 1;

enum VsShape { t, l, i, plus }

const List<VsShape> vsShapes = [VsShape.t, VsShape.l, VsShape.i, VsShape.plus];

/// Обычный режим: цвет ничего не значит, все фигуры белые.
const String vsNeutral = '#ffffff';

const List<String> vsColors = ['#60a5fa', '#fbbf24', '#f472b6'];

/// Палитра для дальтонизма: на конъюнкции цвет несёт смысл наравне с формой,
/// а обычная тройка проваливает тританопию (голубой сливается с розовым).
const List<String> vsColorsCb = ['#56b4e9', '#fc8d62', '#e78ac3'];

/// Сторона предмета и его чувствительной области — порог нажатия.
const double vsItemSize = 32;

class VsCfg {
  const VsCfg({
    required this.count,
    required this.targetCount,
    required this.conjunction,
    required this.decoys,
  });

  final int count;
  final int targetCount;
  final bool conjunction;
  final int decoys;
}

VsCfg vsLevelParams(int level, int round) {
  final base = math.min(72, 14 + level * 4);
  final growth = 3 + level ~/ 4;
  final count = math.min(96, base + (round - 1) * growth);
  final maxT = level <= 3
      ? 1
      : level <= 7
          ? 2
          : level <= 11
              ? 3
              : 4;
  final targetCount = math.min(maxT, 1 + (round - 1) ~/ 2);
  // Приманок больше каждые три уровня; шесть — предел ОСИ, а не лестницы:
  // дальше поле превращается в «не трогай ничего», и это уже другая игра.
  final decoys = math.min(6, math.max(0, ((level - vsNoDecoysUpTo) / 3).ceil()));
  return VsCfg(
    count: count,
    targetCount: targetCount,
    conjunction: level >= vsConjFromLevel,
    decoys: decoys,
  );
}

class VsTarget {
  const VsTarget(this.shape, this.color);
  final VsShape shape;
  final String color;
}

/// ⚠️ ПОРЯДОК БРОСКОВ: сперва форма, потом (только на конъюнкции) цвет.
VsTarget vsPickTarget(bool conjunction, List<String> palette, Rng rnd) {
  final shape = vsShapes[(rnd() * vsShapes.length).floor()];
  final color = conjunction ? palette[(rnd() * palette.length).floor()] : vsNeutral;
  return VsTarget(shape, color);
}

class VsItem {
  VsItem({
    required this.x,
    required this.y,
    required this.rot,
    required this.isTarget,
    required this.shape,
    required this.color,
    required this.decoy,
    this.found = false,
  });

  final double x;
  final double y;
  final int rot;
  final bool isTarget;
  final VsShape shape;
  final String color;

  /// Выглядит РОВНО как цель, но помечена точкой — трогать нельзя.
  final bool decoy;
  bool found;
}

List<T> _shuffle<T>(List<T> values, Rng rnd) {
  final a = List<T>.of(values);
  for (var i = a.length - 1; i > 0; i -= 1) {
    final j = (rnd() * (i + 1)).floor();
    final tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

/// Раздача поля. Порядок бросков повторяет веб побайтно: места → цели →
/// приманки → признаки каждого предмета (форма/цвет, дрожание, поворот).
///
/// 🔴 ПРИМАНКА БЕРЁТСЯ ТОЛЬКО ИЗ НЕЦЕЛЕВЫХ МЕСТ: цель приманкой стать не может,
/// иначе уровень был бы непроходим.
List<VsItem> vsMakeBoard({
  required int count,
  required VsShape targetShape,
  required String targetColor,
  required int targetCount,
  required bool conjunction,
  required double w,
  required double h,
  required Rng rnd,
  List<String> palette = vsColors,
  int decoyCount = 0,
}) {
  final cols = math.sqrt(count * (w / h)).ceil();
  final rows = (count / cols).ceil();
  final cellW = w / cols;
  final cellH = h / rows;
  final slots = <List<double>>[];
  for (var r = 0; r < rows; r += 1) {
    for (var c = 0; c < cols; c += 1) {
      slots.add([c * cellW + cellW / 2, r * cellH + cellH / 2]);
    }
  }
  final picked = _shuffle(slots, rnd).take(count).toList();
  final targetSet =
      _shuffle(List<int>.generate(picked.length, (i) => i), rnd).take(targetCount).toSet();
  final free = List<int>.generate(picked.length, (i) => i).where((i) => !targetSet.contains(i)).toList();
  final decoySet = _shuffle(free, rnd).take(math.min(decoyCount, free.length)).toSet();
  final otherShapes = vsShapes.where((s) => s != targetShape).toList();
  final otherColors = palette.where((c) => c != targetColor).toList();
  T pick<T>(List<T> a) => a[(rnd() * a.length).floor()];

  final items = <VsItem>[];
  for (var i = 0; i < picked.length; i += 1) {
    final isT = targetSet.contains(i);
    VsShape shape;
    String color;
    if (isT) {
      shape = targetShape;
      color = conjunction ? targetColor : vsNeutral;
    } else if (conjunction) {
      // Отвлекающий делит с целью РОВНО один признак — иначе цель выскакивала бы сама.
      if (rnd() < 0.5) {
        color = targetColor;
        shape = pick(otherShapes);
      } else {
        color = pick(otherColors);
        shape = targetShape;
      }
    } else {
      shape = pick(otherShapes);
      color = vsNeutral;
    }
    final decoy = decoySet.contains(i);
    if (decoy) {
      shape = targetShape;
      color = conjunction ? targetColor : vsNeutral;
    }
    items.add(VsItem(
      x: picked[i][0] + (rnd() - 0.5) * cellW * 0.3,
      y: picked[i][1] + (rnd() - 0.5) * cellH * 0.3,
      rot: [0, 90, 180, 270][(rnd() * 4).floor()],
      isTarget: isT,
      shape: shape,
      color: color,
      decoy: decoy,
    ));
  }
  return items;
}

/// РАЗМЕР ДОСКИ — ПРАВИЛО, А НЕ ВЁРСТКА: от него зависит раскладка мест и
/// плотность поля, то есть сама сложность поиска. Доска квадратная, не шире 480.
({double w, double h}) vsBoardSize(double width) {
  final w = math.min(width - 32, 480.0);
  return (w: w, h: (w * 1.0).roundToDouble());
}
