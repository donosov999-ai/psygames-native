/// ДОСКА «ДОСКИ В УМЕ»: клетки, их имена и цвет.
///
/// Перенос с живого TS (`src/games/chess-blind/core/board.ts`) СО СВЕРКОЙ по
/// всем 64 клеткам. Две записи здесь живут рядом и путать их нельзя:
/// индекс ЯДРА (0 = a1, снизу вверх, как в FEN) и индекс ЭКРАНА (0 = a8,
/// сверху вниз, как рисуется доска).
library;

const int boardSide = 8;
const int boardSquares = boardSide * boardSide;

const String _files = 'abcdefgh';

int fileOf(int index) => index % boardSide;

int rankOf(int index) => index ~/ boardSide;

/// Имя клетки: «a1», «e4».
String squareName(int index) {
  _requireSquare(index);
  return '${_files[fileOf(index)]}${rankOf(index) + 1}';
}

/// Индекс по имени. 🔴 НА МУСОРЕ БРОСАЕТ, А НЕ ОТДАЁТ -1 — так устроен живой TS,
/// и молчаливый -1 увёл бы фигуру на клетку a1 вместо явной ошибки.
int squareIndex(String name) {
  final file = name.isEmpty ? -1 : _files.indexOf(name[0]);
  final rank = name.length < 2
      ? -1
      : (int.tryParse(name.substring(1)) ?? 0) - 1;
  if (file < 0 || rank < 0 || rank >= boardSide || name.length != 2) {
    throw FormatException('Нет такого поля: $name');
  }
  return rank * boardSide + file;
}

/// Светлая ли клетка. a1 — тёмная.
bool isLightSquare(int index) => (fileOf(index) + rankOf(index)) % 2 == 1;

bool sameSquareColor(int a, int b) => isLightSquare(a) == isLightSquare(b);

/// Индекс ЭКРАНА: доска рисуется сверху вниз, ядро считает снизу вверх.
int screenIndex(int index) {
  _requireSquare(index);
  return (boardSide - 1 - rankOf(index)) * boardSide + fileOf(index);
}

void _requireSquare(int index) {
  if (index < 0 || index >= boardSquares) {
    throw FormatException('Нет такого поля: $index');
  }
}
