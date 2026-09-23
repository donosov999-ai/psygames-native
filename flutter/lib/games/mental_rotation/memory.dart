/// «ПАМЯТЬ»: ПОКАЗАЛИ — СПРЯТАЛИ — УЗНАЙ ПОВЁРНУТОЙ — перенос `core/memory.ts`.
///
/// Решение Дениса 17.09.2026, дословно: «все упражнения на ментальное вращение используют
/// память) чтобы повернуть в уме надо помнить)». Поэтому это не «зрительная память с кубиками»,
/// а то же поворотное задание, только эталон исчезает до появления вариантов.
///
/// 🔴 ВРЕМЯ ПОКАЗА — ПАРАМЕТР СТУПЕНИ, А НЕ КОНСТАНТА ЭКРАНА: с 13-го уровня 5 секунд, к 50-му
/// 1,5. Шаг 100 мс — мельче глаз не различит.
library;

import 'rng.dart';
import 'rotation.dart';
import 'task.dart';

/// Уровень, с которого открывается «Память» (он же в карте открытий).
const int memoryFromLevel = 13;
const int memoryExposureStartMs = 5000;
const int memoryExposureEndMs = 1500;

int memoryExposureMs(int level) {
  const steps = 50 - memoryFromLevel;
  final k = ((level - memoryFromLevel) / steps).clamp(0.0, 1.0);
  final ms = memoryExposureStartMs - (memoryExposureStartMs - memoryExposureEndMs) * k;
  return (ms / 100).round() * 100;
}

class MemoryTask implements MentalRotationTask {
  @override
  TaskKind get kind => TaskKind.memory;

  /// «Память» — то же поворотное задание, и верный вариант у неё тот же.
  @override
  int get correctIdx => rotation.correctIdx;

  const MemoryTask({required this.rotation, required this.exposureMs});
  final RotationTask rotation;
  final int exposureMs;
}

MemoryTask buildMemoryTask(int level, Rng rng) =>
    MemoryTask(rotation: buildRotationTask(level, rng), exposureMs: memoryExposureMs(level));
