/// ПРАВИЛА OSPAN — перенос лестницы frontend/src/games/counting/ospanLadder.ts
/// и генератора равенств из app/games/ospan.tsx.
///
/// Чередование: равенство «верно/неверно» → буква на запоминание, и так N раз;
/// потом назвать буквы по порядку. Лестница растит три вещи сразу: охват
/// (3→9 букв), скорость показа буквы (1100→500 мс — пол восприятия) и счётную
/// нагрузку, которая НЕ упирается в потолок: за L16 в пул плавно входят
/// квадраты, корни, цепочки a×b−c, x-равенства и степени двойки.
library;

import 'dart:math' as math;

import '../../shell/js_compat.dart' show Rng;

export '../../shell/js_compat.dart' show Rng, createRng;

class OspanParams {
  const OspanParams({
    required this.setSize,
    required this.letterMs,
    required this.hardMath,
    required this.mathLoad,
  });
  final int setSize, letterMs;
  final bool hardMath;
  final double mathLoad;
}

OspanParams levelParams(int level) {
  final setSize = math.min(9, 2 + level);
  final fast = math.max(0, level - 5);
  final letterMs = math.max(500, 1100 - fast * 55);
  final hardMath = level >= 6;                       // с L6 карточка обещает «×, числа крупнее»
  final mathLoad = math.max(0, (level - 4) / 8);     // 0 → 1,5 (L16) → дальше без потолка
  return OspanParams(setSize: setSize, letterMs: letterMs, hardMath: hardMath, mathLoad: mathLoad.toDouble());
}

class Equation {
  const Equation(this.left, this.right, this.isCorrect);
  final String left;
  final int right;
  final bool isCorrect;
}

int _jsRound(double v) => (v + 0.5).floor();

const String _superscripts = '⁰¹²³⁴⁵⁶⁷⁸⁹';

/// Равенство для счётной нагрузки. Порядок бросков совпадает с веб-версией
/// побайтно: сперва «верно ли», затем формы от самой поздней к базовой.
Equation makeEquation(double load, bool allowMult, Rng rnd) {
  final isCorrect = rnd() < 0.5;
  int wobble() => (rnd() < 0.5 ? -1 : 1) * (1 + (rnd() * 3).floor());

  // Степени двойки (≈L31+) и x-равенства (≈L28+): доли плавные, потолка нет.
  if (load >= 3.4 && rnd() < math.min(0.25, (load - 3.4) * 0.2)) {
    final k = 3 + (rnd() * math.min(5, 1 + _jsRound(load - 2))).floor();
    final real = math.pow(2, k).toInt();
    final sup = _superscripts[k];
    final shown = isCorrect
        ? real
        : real + (rnd() < 0.5 ? -1 : 1) * (2 + (rnd() * math.max(3, real / 8)).floor());
    return Equation('2$sup', shown, shown == real);
  }
  if (load >= 3.0 && rnd() < math.min(0.3, (load - 3.0) * 0.22)) {
    final x = 2 + (rnd() * 7).floor();
    final a = 2 + (rnd() * _jsRound(2 + load)).floor();
    final b = 1 + (rnd() * _jsRound(4 + load * 3)).floor();
    final plus = rnd() < 0.5;
    final real = plus ? a * x + b : a * x - b;
    final shown = isCorrect ? real : real + wobble();
    return Equation('x=$x: ${a}x ${plus ? '+' : '−'} $b', shown, shown == real);
  }
  if (load >= 2.6 && rnd() < math.min(0.35, (load - 2.6) * 0.25)) {
    final a = 3 + (rnd() * 10).floor();
    final b = 2 + (rnd() * 8).floor();
    final c = 5 + (rnd() * _jsRound(10 + load * 12)).floor();
    final real = a * b - c;
    final shown = isCorrect ? real : real + wobble();
    return Equation('$a × $b − $c', shown, shown == real);
  }
  if (load >= 2.0 && rnd() < math.min(0.3, (load - 2.0) * 0.22)) {
    final k = 6 + (rnd() * _jsRound(4 + load * 3)).floor();
    final shown = isCorrect ? k : k + (rnd() < 0.5 ? -1 : 1);
    return Equation('√${k * k}', shown, shown == k);
  }
  if (load >= 1.4 && rnd() < math.min(0.35, (load - 1.4) * 0.25)) {
    final n = 7 + (rnd() * _jsRound(3 + load * 4)).floor();
    final real = n * n;
    // Дистрактор квадрата — сосед (n±1)² или сдвиг: ±1 палится последней цифрой.
    final shown = isCorrect
        ? real
        : (rnd() < 0.5 ? math.pow(n + (rnd() < 0.5 ? 1 : -1), 2).toInt() : real + wobble() * n);
    return Equation('$n²', shown, shown == real);
  }
  final top = 9 + _jsRound(load * 10);
  final a = 1 + (rnd() * top).floor();
  final b = 1 + (rnd() * math.min(top, 12)).floor();   // второй множитель — в пределах таблицы
  final useMult = allowMult && rnd() < math.min(0.45, 0.15 + load * 0.3);
  final op = useMult ? '*' : (rnd() < 0.5 ? '+' : '-');
  final real = op == '+' ? a + b : (op == '-' ? a - b : a * b);
  final shown = isCorrect ? real : real + wobble();
  return Equation('$a ${op == '*' ? '×' : op} $b', shown, shown == real);
}

/// Буквы на запоминание. Русский и латинский наборы — как в вебе; похожие на
/// цифры и друг на друга исключены там же.
const List<String> lettersRu = [
  'А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З', 'К', 'Л',
  'М', 'Н', 'П', 'Р', 'С', 'Т', 'Ф', 'Х', 'Ц', 'Ш',
];
const List<String> lettersEn = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K',
  'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'V', 'X',
];

/// Уровень берётся ТОЛЬКО за чистое вспоминание: все буквы по порядку без ошибок.
bool ospanPassed(int recallErrors) => recallErrors == 0;
