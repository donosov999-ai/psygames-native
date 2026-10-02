/// ОДИН КОД ПРАКТИК НА ДВА ПРИЛОЖЕНИЯ — PsyGames («Пауза») и «Умный будильник».
///
/// 🔴 ЗАЧЕМ. До 02.10.2026 ядро, каталог и вибрация жили двумя копиями, и каждая
/// починка делалась дважды: 01.10 одна правка вибрации стоила двух PR в PsyGames и
/// трёх сборок будильника, а копии успели разойтись (в будильнике параллель
/// молчала, в PsyGames вёл Кегель). Решение Дениса: «вынести в один общий блок —
/// чиню один раз, и в будильнике, и в PsyGames».
///
/// Каталог (assets/practices.json) — выгрузка ЯДРА НА TS PsyGames
/// (frontend/src/games/pause/core) плюс надстройка будильника; ядро на Dart —
/// перенос того же ядра, сверенный с ним пробами приложений.
library;

export 'src/practices.dart';
export 'src/practice_haptics.dart';
export 'src/step_now.dart';
export 'src/eye_modes.dart';
export 'src/eye_geometry.dart';
export 'src/face_massage_guide.dart';

/// Путь каталога практик в ассетах пакета — грузить через rootBundle приложения.
const practiceCatalogAsset = 'packages/practice_kit/assets/practices.json';
