/// РАЗБОР ОТВЕТА: ПОКАЗАТЬ САМ ПОВОРОТ — перенос `core/replay.ts`.
///
/// 🔴 ЧТО БЫЛО. После промаха человек видел красную рамку и слово «неверно» — и ровно ничего не
/// узнавал. Кадры строятся по записанному пути ([RotationTask.steps]): эталон → 90° → 90° → … →
/// правильный вариант, и поворот достраивается глазами, а не догадкой.
///
/// ⚠️ ПОСЛЕДНИЙ КАДР ОБЯЗАН СОВПАСТЬ С ПРАВИЛЬНЫМ ВАРИАНТОМ — иначе разбор врёт убедительнее,
/// чем молчание. Это проба в прогоне, а не обещание в комментарии.
library;

import 'geometry.dart';
import 'rotation.dart';

class ReplayFrame {
  const ReplayFrame({required this.index, required this.shape, required this.axis});

  /// Номер кадра: 0 — эталон как есть, дальше по одному повороту на 90°.
  final int index;
  final Shape shape;

  /// Вокруг какой оси пришли в этот кадр. У нулевого кадра оси нет.
  final Axis? axis;
}

/// Годится и для «Памяти»: у неё тот же эталон и тот же записанный путь поворота.
List<ReplayFrame> rotationReplay(RotationTask task) {
  final frames = <ReplayFrame>[ReplayFrame(index: 0, shape: normalizeShape(task.base), axis: null)];
  var current = task.base;
  for (var i = 0; i < task.steps.length; i++) {
    current = rotateShape(current, task.steps[i].axis, 1);
    frames.add(ReplayFrame(index: i + 1, shape: normalizeShape(current), axis: task.steps[i].axis));
  }
  return frames;
}
