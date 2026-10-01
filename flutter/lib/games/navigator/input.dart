/// ВВОД «НАВИГАТОРА»: КЛАВИШИ И СВАЙПЫ — ПЕРЕНОС `core/input.ts` ОДИН В ОДИН.
///
/// 🔴 ОБА СПОСОБА ПЕРЕНЕСЕНЫ, И ЭТО НЕ ФОРМАЛЬНОСТЬ. Урок 30.09.2026: перенос «Лаборатории»
/// потерял двойное нажатие, добавленное по отчёту Дениса, — эталон сверял правила, а жест в эталон
/// не попадает. Здесь свайпы и клавиши — часть ядра и сверяются с эталоном наравне с правилами.
library;

import 'dart:math' as math;

import 'geometry.dart';
import 'types.dart';

/// Порог свайпа в точках — как `threshold = 24` в TS.
const navigatorSwipeThreshold = 24.0;

/// `Math.hypot` так, как его считает V8: со шкалированием и компенсацией Кэхана.
/// Замер 30.09.2026, node 26.9: «корень из суммы квадратов» расходится с V8 в последнем знаке
/// у 746 366 пар из 2 000 000, а эта запись — у 0. Порог 24 точки — строгое сравнение, и на
/// самой окружности корень переворачивает ответ у каждой пятой точки: свайп
/// (23.567700267527236, 4.534700001102221) по V8 даёт ровно 24 и засчитывается, по корню —
/// 23.999999999999996 и пропадает. На сетке с шагом 0,01 точки таких нет — практически это
/// последний знак, но эталон сверяет поле в поле, и расхождение там было бы настоящим.
/// Тот же алгоритм уже стоит в `object_tracker/model.dart` (`jsHypot`); чужой модуль игры
/// не импортирую, чтобы перенос «Навигатора» не зависел от «Трекера».
double _jsHypot(double x, double y) {
  final ax = x.abs();
  final ay = y.abs();
  final maxAbs = math.max(ax, ay);
  if (maxAbs == 0) return 0;
  var sum = 0.0;
  var compensation = 0.0;
  for (final v in [ax, ay]) {
    final n = v / maxAbs;
    final summand = n * n - compensation;
    final preliminary = sum + summand;
    compensation = (preliminary - sum) - summand;
    sum = preliminary;
  }
  return maxAbs * math.sqrt(sum);
}

Cardinal? cardinalFromKey(String key) => switch (key.toLowerCase()) {
  'arrowup' || 'w' => Cardinal.north,
  'arrowright' || 'd' => Cardinal.east,
  'arrowdown' || 's' => Cardinal.south,
  'arrowleft' || 'a' => Cardinal.west,
  _ => null,
};

Cardinal? cardinalFromSwipe(double dx, double dy, [double threshold = navigatorSwipeThreshold]) {
  if (_jsHypot(dx, dy) < threshold) return null;
  if (dx.abs() > dy.abs()) return dx > 0 ? Cardinal.east : Cardinal.west;
  return dy > 0 ? Cardinal.south : Cardinal.north;
}

Turn? turnFromKey(String key) => switch (key.toLowerCase()) {
  'arrowleft' || 'a' => Turn.left,
  'arrowright' || 'd' => Turn.right,
  'arrowup' || 'w' || ' ' => Turn.straight,
  _ => null,
};

Turn? turnFromSwipe(double dx, double dy, [double threshold = navigatorSwipeThreshold]) {
  if (_jsHypot(dx, dy) < threshold) return null;
  if (dx.abs() > dy.abs()) return dx > 0 ? Turn.right : Turn.left;
  return dy < 0 ? Turn.straight : null;
}

HomeSector? homeSectorFromKey(String key) => switch (key.toLowerCase()) {
  '8' || 'arrowup' || 'w' => HomeSector.north,
  '9' => HomeSector.northEast,
  '6' || 'arrowright' || 'd' => HomeSector.east,
  '3' => HomeSector.southEast,
  '2' || 'arrowdown' || 's' => HomeSector.south,
  '1' => HomeSector.southWest,
  '4' || 'arrowleft' || 'a' => HomeSector.west,
  '7' => HomeSector.northWest,
  _ => null,
};

HomeSector? homeSectorFromSwipe(double dx, double dy, [double threshold = navigatorSwipeThreshold]) {
  if (_jsHypot(dx, dy) < threshold) return null;
  return homeSectorForBearing(math.atan2(dx, -dy) * 180 / math.pi);
}
