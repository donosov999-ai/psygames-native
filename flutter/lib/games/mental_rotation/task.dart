/// ВИДЫ ЗАДАНИЙ — общий тип для одиннадцати генераторов.
///
/// В TS это размеченное объединение по полю `kind`; здесь — общий интерфейс с тем же полем.
/// Экран разбирает задание по [MentalRotationTask.kind] и приводит к нужному классу.
///
/// ⚠️ СПИСОК ВИДОВ В ИГРЕ ОДИН. Второй список (в счётчике партии) уже однажды отстал: новый вид
/// добавили в один, а другой молча терял пробу, и в сводке это выглядело как «не выпало».
library;

enum TaskKind {
  rotation,
  projection,
  net,
  viewpoint,
  same,
  assembly,
  memory,
  formation,
  section,
  missing,
  oblique,
}

/// Имя вида, как в TS-ядре и в записях истории.
String taskKindName(TaskKind k) => k.name;

abstract interface class MentalRotationTask {
  TaskKind get kind;

  /// Номер верного варианта. Есть у КАЖДОГО вида — значит, место ему в общем типе, а не в
  /// разборе по одиннадцати веткам на каждом экране и в каждой пробе.
  int get correctIdx;
}
