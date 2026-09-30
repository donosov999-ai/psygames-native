/// ЧТО НА САМОМ ДЕЛЕ ВИДНО НА РИСУНКЕ ФИГУРЫ.
///
/// 📍 Три отчёта Дениса 17.09.2026 (0110c5db, 7c8b49d2, 8db157b4): «то, что я вижу, и
/// то, что он называет правильным ответом, не сочетается» · «угол такой, что
/// перекрывает часть фигуры, и непонятно, сколько кубиков она содержит» · «кубики
/// изначально не содержат такое количество». Замер координатора: у 95–100 % заданий
/// хотя бы один кубик эталона не виден ВООБЩЕ.
///
/// 🔴 ПРАВИЛО. Проекция изометрическая вдоль (1,1,1) (`surface.dart`: отсекаются faces
/// с `normal·(1,1,1) <= 0`), поэтому кубики (x,y,z) и (x+1,y+1,z+1) дают ОДИН И ТОТ ЖЕ
/// шестиугольник: кубик hidden целиком, если по лучу взгляда перед ним стоит другой.
/// Сверено с контролями растрового прибора: куб 2×2×2 → hidden ровно 1, «Г» из четырёх
/// → 0, лестница до (1,1,1) → 1.
///
/// ⚠️ ГРАНИЦА. Считается перекрытие кубиком СВОЕГО столбца; редкий случай, когда
/// шестиугольник закрыт по частям тремя разными соседями, сюда не попадает — правило
/// НЕДООЦЕНИВАЕТ скрытость и потому не поднимает ложной тревоги.
///
/// ⚠️ Это перенос `frontend/src/games/mental-rotation/core/occlusion.ts` один в один.
/// Расходиться двум половинам приложения нельзя: генератор один и тот же, и эталон
/// `test/fixtures/mental-rotation-reference.json` снят прогоном живого TS.
library;

import 'geometry.dart';

String _key(Cube c) => '${c[0]},${c[1]},${c[2]}';

/// Кубики, которых на рисунке не видно вообще.
Shape hiddenCubes(Shape shape) {
  final present = shape.map(_key).toSet();
  var limit = 0;
  for (final c in shape) {
    for (final v in c) {
      if (v > limit) limit = v;
    }
  }
  limit += 1;
  return shape.where((c) {
    // Между кубиком и тем, что его закрывает, бывает пустота — идём по всему лучу.
    for (var k = 1; c[0] + k <= limit && c[1] + k <= limit && c[2] + k <= limit; k++) {
      if (present.contains('${c[0] + k},${c[1] + k},${c[2] + k}')) return true;
    }
    return false;
  }).toList();
}

/// Отпечаток РИСУНКА: какие faces реально попадают на экран. Две фигуры с одинаковым
/// отпечатком выглядят одинаково, сколько бы кубиков ни отличалось внутри.
String visibleSignature(Shape shape) {
  final present = shape.map(_key).toSet();
  final hidden = hiddenCubes(shape).map(_key).toSet();
  var minX = shape.first[0], minY = shape.first[1], minZ = shape.first[2];
  for (final c in shape) {
    if (c[0] < minX) minX = c[0];
    if (c[1] < minY) minY = c[1];
    if (c[2] < minZ) minZ = c[2];
  }
  final faces = <String>[];
  for (final c in shape) {
    if (hidden.contains(_key(c))) continue;
    final x = c[0] - minX, y = c[1] - minY, z = c[2] - minZ;
    if (!present.contains('${c[0] + 1},${c[1]},${c[2]}')) faces.add('$x,$y,$z:x');
    if (!present.contains('${c[0]},${c[1] + 1},${c[2]}')) faces.add('$x,$y,$z:y');
    if (!present.contains('${c[0]},${c[1]},${c[2] + 1}')) faces.add('$x,$y,$z:z');
  }
  faces.sort();
  return faces.join('|');
}

/// Ракурсы, в которых видны ВСЕ кубики фигуры. Пусто — таких нет.
List<Shape> orientationsWithoutHidden(Shape shape) =>
    allOrientations(shape).where((o) => hiddenCubes(o).isEmpty).toList();

/// Ракурс, где видно как можно больше: любой из чистых, иначе — с наименьшим числом
/// скрытых кубиков, а не первый попавшийся.
///
/// ⚠️ Имена здесь латиницей: Dart принимает кириллицу в идентификаторах, но линт
/// требует lowerCamelCase, и разбирать 192 замечания ради русских имён не стоит ничего.
Shape clearestOrientation(Shape shape, Shape Function(List<Shape>) choose) {
  final all = allOrientations(shape);
  final clean = all.where((o) => hiddenCubes(o).isEmpty).toList();
  if (clean.isNotEmpty) return choose(clean);
  var best = all.first;
  var bestCount = 1 << 30;
  for (final o in all) {
    final n = hiddenCubes(o).length;
    if (n < bestCount) {
      bestCount = n;
      best = o;
    }
  }
  return best;
}
