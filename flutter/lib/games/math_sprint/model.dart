/// ПРАВИЛА «СПРИНТА» — перенос ядра frontend/src/games/counting/mathSprintCore.ts.
///
/// Минута на счёт: задачи идут одна за другой, ответ набирается цифрами. Лестница
/// v2 — ШКОЛЬНАЯ ОСЬ, восемь полос по четыре уровня: сложение и вычитание →
/// умножение → деление → цепочки a×b±c → квадраты → целые корни → уравнения
/// ax+b=c → микс высших тем. Внутри полосы позиция t масштабирует числа, а в
/// хвосте (L29+) t растёт БЕЗ КЛАМПА: иначе все уровни за L36 были бы клонами.
///
/// 🔴 РАСКЛАДКА КЛАВИАТУРЫ — ТОЖЕ ПРАВИЛО, И ОНО ИЗ ЗАМЕРА. Высота колонки поля
/// 242 точки (202 на низком экране) взята живым замером: первая версия заложила
/// 180, и строка подсказки пропала на 375×667 и 360×640 — её накрыла полоса.
library;

import 'dart:math' as math;

import '../../shell/js_compat.dart' show Rng;

export '../../shell/js_compat.dart' show Rng, createRng;

/// Последний уровень, который лестница ОБЕЩАЕТ. Выше — открытый хвост микса.
const int sprintMaxLevel = 32;

const int _bandSize = 4;

const List<String> _bandOrder = [
  'plus-minus', 'mult', 'div', 'chain', 'square', 'root', 'equation',
];

/// Тема уровня — детерминированно, по номеру полосы.
String sprintBandFor(int level) {
  final l = math.max(1, level.floor());
  final band = ((l - 1) / _bandSize).floor();
  return band < _bandOrder.length ? _bandOrder[band] : 'mix';
}

/// Позиция уровня в полосе 0…1. В хвосте B8 делится на 5, а не на 8, и не
/// зажимается: рост внутри обещанной зоны 29–32 был на грани клона (×1,03–1,05).
double _bandT(int level) {
  final l = math.max(1, level.floor());
  if (l > 7 * _bandSize) return (l - 7 * _bandSize) / 5;
  return ((l - 1) % _bandSize) / (_bandSize - 1);
}

int _int(Rng rnd, int min, int max) => min + (rnd() * math.max(1, max - min + 1)).floor();

int _round(double v) => (v + 0.5).floor();   // Math.round из JS

class SprintProblem {
  const SprintProblem({required this.display, required this.answer, required this.kind});

  /// Полный текст вопроса, включая «= ?».
  final String display;
  final int answer;
  final String kind;
}

SprintProblem _plusMinus(Rng rnd, double t) {
  final range = _round(12 + t * 90);
  var a = _int(rnd, 5, range);
  // С ростом t операнды ближе друг к другу — переносы через десяток чаще.
  var b = _int(rnd, _round(1 + t * range * 0.6), range);
  final op = rnd() < 0.5 ? '+' : '-';
  if (op == '-' && b > a) {
    final tmp = a;
    a = b;
    b = tmp;
  }
  // Вторая ступень полосы: ТРИ слагаемых, доля растёт с t.
  if (rnd() < t * 0.8) {
    final c = _int(rnd, 4, _round(9 + t * 30));
    if (op == '+') {
      return SprintProblem(display: '$a + $b + $c = ?', answer: a + b + c, kind: 'plus-minus');
    }
    return SprintProblem(display: '$a − $b + $c = ?', answer: a - b + c, kind: 'plus-minus');
  }
  return SprintProblem(
    display: '$a $op $b = ?',
    answer: op == '+' ? a + b : a - b,
    kind: 'plus-minus',
  );
}

SprintProblem _mult(Rng rnd, double t) {
  final a = _int(rnd, _round(3 + t * 4), _round(7 + t * 12));   // таблица → двузначное
  final b = _int(rnd, 2, _round(5 + t * 5));
  return SprintProblem(display: '$a × $b = ?', answer: a * b, kind: 'mult');
}

SprintProblem _div(Rng rnd, double t) {
  final b = _int(rnd, 2, _round(4 + t * 7));
  final q = _int(rnd, _round(3 + t * 3), _round(6 + t * 14));
  return SprintProblem(display: '${b * q} ÷ $b = ?', answer: q, kind: 'div');
}

SprintProblem _chain(Rng rnd, double t) {
  final a = _int(rnd, _round(3 + t * 3), _round(6 + t * 10));
  final b = _int(rnd, 2, _round(4 + t * 8));
  final c = _int(rnd, _round(3 + t * 25), _round(10 + t * 70));
  final plus = rnd() < 0.5;
  final answer = plus ? a * b + c : a * b - c;
  // Минус на скорости — лишний символ: в минус не уводим.
  if (!plus && answer < 0) {
    return SprintProblem(display: '$a × $b + $c = ?', answer: a * b + c, kind: 'chain');
  }
  return SprintProblem(display: '$a × $b ${plus ? '+' : '−'} $c = ?', answer: answer, kind: 'chain');
}

SprintProblem _square(Rng rnd, double t) {
  final n = _int(rnd, _round(4 + t * 8), _round(10 + t * 9));
  return SprintProblem(display: '$n² = ?', answer: n * n, kind: 'square');
}

SprintProblem _root(Rng rnd, double t) {
  final k = _int(rnd, _round(3 + t * 4), _round(9 + t * 11));
  return SprintProblem(display: '√${k * k} = ?', answer: k, kind: 'root');
}

SprintProblem _equation(Rng rnd, double t) {
  final x = _int(rnd, _round(3 + t * 4), _round(9 + t * 20));
  final a = _int(rnd, 2, _round(3 + t * 6));
  final b = _int(rnd, 1, _round(9 + t * 55));
  final plus = rnd() < 0.5;
  final c = plus ? a * x + b : a * x - b;
  // Отрицательная правая часть на скорости путает — пересобираем со знаком «+».
  if (c < 0) {
    return SprintProblem(display: '${a}x + $b = ${a * x + b},  x = ?', answer: x, kind: 'equation');
  }
  return SprintProblem(display: '${a}x ${plus ? '+' : '−'} $b = $c,  x = ?', answer: x, kind: 'equation');
}

final List<SprintProblem Function(Rng, double)> _mix = [_chain, _square, _root, _equation];

SprintProblem generateSprintProblem(int level, Rng rnd) {
  final kind = sprintBandFor(level);
  final t = _bandT(level);
  switch (kind) {
    case 'plus-minus':
      return _plusMinus(rnd, t);
    case 'mult':
      return _mult(rnd, t);
    case 'div':
      return _div(rnd, t);
    case 'chain':
      return _chain(rnd, t);
    case 'square':
      return _square(rnd, t);
    case 'root':
      return _root(rnd, t);
    case 'equation':
      return _equation(rnd, t);
    default:
      return _mix[(rnd() * _mix.length).floor()](rnd, t);
  }
}

/// Перенос прогресса лестницы v1 в v2 — по семейству, на котором стоял игрок.
int migrateSprintLevelV1toV2(int oldLevel) {
  final l = math.max(1, oldLevel.floor());
  if (l <= 2) return l;
  if (l <= 4) return 2 + l;
  if (l <= 8) return 4 + l;
  return 13;
}

// ──────────────────────────── Партия: счёт и порог ───────────────────────────

/// Длительность партии по умолчанию (игрок выбирает 30/60/120).
const int sprintSeconds = 60;

/// Уровень взят при двенадцати верных за партию.
const int sprintCorrectToPass = 12;

/// Очки за верный ответ: базовые десять плюс серия, но не больше тридцати сверху.
int pointsForStreak(int streak) => 10 + math.min(streak * 2, 30);

/// Штраф за ошибку. Счёт ниже нуля не опускается.
const int sprintPenalty = 5;

/// Больше шести цифр в ответе не набрать — как в вебе.
const int sprintMaxDigits = 6;

// ─────────────────── Раскладка клавиатуры — правило из замера ────────────────

const double topOfField = 119;      // ШАПКА 58 + ПОЛОСА_ПОКАЗАТЕЛЕЙ 61
const double answerGutters = 132;   // отступы полосы ответа с двух сторон
const double fingerSize = 48;       // минимальная клавиша под палец
const double actionRow = 56;        // высота ряда действий

class Keypad {
  const Keypad({required this.keyW, required this.keyH, required this.low, required this.column});
  final double keyW, keyH, column;
  final bool low;
}

/// ⚠️ ЧИСЛА ЗДЕСЬ — ЖИВОЙ ЗАМЕР, А НЕ ПРИКИДКА. Колонка поля 242 точки на
/// 390×844 и 202 на низком экране (<760): там задача теряет 40 точек своих полей.
/// Вычитаемые 101 — зазоры, кнопка «Проверить» и отступы полосы.
Keypad keypadFor(double screenW, double screenH) {
  final low = screenH < 760;
  final column = low ? 202.0 : 242.0;
  final keyW = math
      .max(fingerSize, math.min((screenW - answerGutters - 16 - 2) / 3, 88.0))
      .floorToDouble();
  final keyH = math
      .max(fingerSize, math.min(actionRow, (screenH - topOfField - column - 101) / 4))
      .floorToDouble();
  return Keypad(keyW: keyW, keyH: keyH, low: low, column: column);
}
