/// ЛЕСТНИЦЫ СЕМИ СЕТОК ТЭТХЭМА — те же пять ступеней, что у веб-версии.
///
/// Взяты из `frontend/src/games/tatham-bridge/sections/sudoku.ts` строка в строку:
/// параметры отдаются движку как есть, а ступень человек видит подписью. Разойдутся —
/// разойдётся и прогресс: ключ уровня общий с веб-версией
/// (`psygames_puzzles_<режим строчными>_level_<профиль>`).
///
/// ⚠️ ЧТО ОЗНАЧАЮТ БУКВЫ. Хвост параметров — класс сложности САМОГО движка: `de` лёгкая,
/// `dn` обычная, `dh` трудная, `dk` хитрая, `dx` крайняя, `du` запредельная. У Filling
/// классов нет вовсе — его лестница растёт только размером поля.
library;

class PuzzleStep {
  const PuzzleStep(this.title, this.params);
  final String title;
  final String params;
}

class PuzzleMode {
  const PuzzleMode({
    required this.engineName,
    required this.title,
    required this.steps,
    this.digits = false,
    this.digitLabels,
  });

  /// Имя игры у автора — им она ищется в движке («Solo», «Light Up»).
  final String engineName;

  /// Наше имя на экране.
  final String title;
  final List<PuzzleStep> steps;

  /// Нужен ли ряд цифр: у Singles ввод только тычками.
  final bool digits;

  /// Подписи клавиш, если цифры значат не себя. У «Нежити» 1/2/3 — это призрак,
  /// вампир и зомби (порядок из `undead.c:1931`), и голые цифры не говорили,
  /// какое чудовище ставят.
  final List<String>? digitLabels;

  /// Ключ прогресса: тот же, что пишет веб-версия.
  String get levelKey => 'puzzles_${engineName.toLowerCase()}';
}

const puzzleModes = <String, PuzzleMode>{
  'Solo': PuzzleMode(
    engineName: 'Solo',
    title: 'Судоку Тэтхэма',
    digits: true,
    steps: [
      PuzzleStep('9×9, простая', '3x3db'),
      PuzzleStep('9×9, средняя', '3x3di'),
      PuzzleStep('9×9, продвинутая', '3x3da'),
      PuzzleStep('9×9, крайняя', '3x3de'),
      PuzzleStep('9×9, запредельная', '3x3du'),
    ],
  ),
  'Towers': PuzzleMode(
    engineName: 'Towers',
    title: 'Небоскрёбы Тэтхэма',
    digits: true,
    steps: [
      PuzzleStep('4×4, лёгкая', '4de'),
      PuzzleStep('5×5, лёгкая', '5de'),
      PuzzleStep('5×5, трудная', '5dh'),
      PuzzleStep('6×6, трудная', '6dh'),
      PuzzleStep('6×6, запредельная', '6du'),
    ],
  ),
  'Unequal': PuzzleMode(
    engineName: 'Unequal',
    title: 'Неравенства Тэтхэма',
    digits: true,
    steps: [
      PuzzleStep('4×4, лёгкая', '4de'),
      PuzzleStep('5×5, лёгкая', '5de'),
      PuzzleStep('5×5, хитрая', '5dk'),
      PuzzleStep('6×6, хитрая', '6dk'),
      PuzzleStep('7×7, крайняя', '7dx'),
    ],
  ),
  'Keen': PuzzleMode(
    engineName: 'Keen',
    title: 'Клетки с арифметикой',
    digits: true,
    steps: [
      PuzzleStep('4×4, лёгкая', '4de'),
      PuzzleStep('5×5, лёгкая', '5de'),
      PuzzleStep('6×6, обычная', '6dn'),
      PuzzleStep('6×6, трудная', '6dh'),
      PuzzleStep('6×6, запредельная', '6du'),
    ],
  ),
  'Singles': PuzzleMode(
    engineName: 'Singles',
    title: 'Лишние числа',
    steps: [
      PuzzleStep('5×5, лёгкая', '5x5de'),
      PuzzleStep('6×6, хитрая', '6x6dk'),
      PuzzleStep('8×8, хитрая', '8x8dk'),
      PuzzleStep('10×10, хитрая', '10x10dk'),
      PuzzleStep('12×12, хитрая', '12x12dk'),
    ],
  ),
  'Undead': PuzzleMode(
    engineName: 'Undead',
    title: 'Нежить',
    digits: true,
    digitLabels: ['призрак', 'вампир', 'зомби'],
    steps: [
      PuzzleStep('4×4, лёгкая', '4x4de'),
      PuzzleStep('4×4, обычная', '4x4dn'),
      PuzzleStep('4×4, трудная', '4x4dt'),
      PuzzleStep('5×5, трудная', '5x5dt'),
      PuzzleStep('7×7, трудная', '7x7dt'),
    ],
  ),
  'Filling': PuzzleMode(
    engineName: 'Filling',
    title: 'Заполнение областей',
    digits: true,
    steps: [
      PuzzleStep('9×7', '9x7'),
      PuzzleStep('11×8', '11x8'),
      PuzzleStep('13×9', '13x9'),
      PuzzleStep('15×11', '15x11'),
      PuzzleStep('17×13', '17x13'),
    ],
  ),
};
