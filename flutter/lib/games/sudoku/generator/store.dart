/// Хранилище пути генератора «Судоку» — привязка общего хранилища к имени игры.
///
/// Общий модуль — `lib/shell/generator/store.dart` (задача 543d853c, 30.09.2026). Здесь
/// только имя игры: ключи «Судоку» остаются байт в байт прежними
/// (`psygames_sudoku_adaptive_*`), и проба `generator_isolation_test.dart` меряет, что
/// прописанные ключи `psygames_sudoku_level_*` не тронуты.
library;

import '../../../shell/generator/store.dart' as shared;

export '../../../shell/generator/store.dart' hide GeneratorStore;

/// Хранилище генератора «Судоку»: общее, с именем игры `sudoku`.
class GeneratorStore extends shared.GeneratorStore {
  GeneratorStore(super.state, {super.profile}) : super(gameId: 'sudoku');
}
