/// Маршрут режима «Вперемешку» набора «Собери сумму».
///
/// 🔴 ЭТО НЕ НОВАЯ ИГРА РЕЕСТРА. Решение Дениса 13.11.2026: «Считалка» и «Числовые пары» —
/// режимы одной игры, `PUBLIC_GAME_COUNT` = 131 не трогаем. Запись в реестре игр подняла бы
/// счёт и изменила `profiles.json`, поэтому режим живёт под маршрутом первого режима набора, с
/// ключом `?mode=mixed`, и в реестре игр его нет: оболочка перехватывает адрес
/// (`HybridApp.native`), а пункт «Режим» (`SuiteModeAction`) предлагает его там, где открыты ВСЕ
/// режимы набора, то есть оба правила, из которых он собран.
library;

import '../../shell/suite_switch.dart' show SuiteMode;

const String sumMixedRoute = '/games/counter?mode=mixed';

/// Пункт «Вперемешку» в листе режимов — подпись из словаря (`suiteModeMixed`).
const SuiteMode sumMixedMode = SuiteMode(sumMixedRoute, 'suiteModeMixed');
