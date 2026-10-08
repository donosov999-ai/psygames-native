/// Время для шапки — коротко. Перенос `frontend/src/services/hudTime.ts` (VER 1).
///
/// До минуты — целые секунды (`47s`), дальше — минуты и секунды (`4:55`), после часа —
/// часы (`1:04:55`): строка не растёт со временем партии. Доли секунды — в итог партии и
/// в сессию, не в шапку. NaN и бесконечность — ноль, а не «NaNs» на экране.
library;

String hudTime(double seconds, String secSuffix) {
  final t = seconds.isFinite ? (seconds < 0 ? 0 : seconds.floor()) : 0;
  if (t < 60) return '$t$secSuffix';
  final m = t ~/ 60;
  final s = t % 60;
  if (m < 60) return '$m:${'$s'.padLeft(2, '0')}';
  final h = m ~/ 60;
  return '$h:${'${m % 60}'.padLeft(2, '0')}:${'$s'.padLeft(2, '0')}';
}
