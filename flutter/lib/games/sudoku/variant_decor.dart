/// РИСУНОК ВАРИАНТОВ НА НАТИВНОЙ ДОСКЕ — термометры, стрелки, клетки-суммы, метки
/// чётности, точки Кропки, линии шёпота, ренбана и равных сумм.
///
/// 🔴 ЗАЧЕМ (задача 450c0211, 01.10.2026). Нативная доска с переноса 23.09 рисовала только
/// рамки клеток: на ступенях 30–53 и 81–92 в шапке стояло «Правило: термометры», а на поле
/// не было ни трубки, ни колбы, ни кружка стрелки, ни суммы группы, ни метки чётности, ни
/// точки. Вышло в Play 2.56.2. Пробы молчали, потому что проверяли целость доски, а не то,
/// что подсказка дошла до экрана; теперь это проверяет `sudoku_variant_decor_test.dart`.
///
/// ГЕОМЕТРИЯ И КРАСКА — ПЕРЕНОС ВЕБА (`frontend/src/services/sudoku-overlay.ts` и рендер клетки
/// в `frontend/app/games/sudoku.tsx`): трубка — 0,16 клетки (не тоньше 3), колба — 0,42,
/// зазор у границы `seam` 1,5 точки (иначе линия стирает сетку — отчёты Вали 31.08), точка
/// Кропки — 0,2 клетки на грани, метка чётности — 0,6 клетки (круг — нечёт, квадрат — чёт),
/// тонировка групп-сумм — шесть оттенков с долей 0,16.
library;

import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'rules.dart';

/// Смешать [base] с [over] в доле [t] — непрозрачно, как `blendHex` веба.
Color blendColor(Color base, Color over, double t) => Color.lerp(base, over, t)!;

/// Акценты судоку веба: `GRADIENT` и оттенки групп `CAGE_ACCENTS`.
const sudokuAccent = Color(0xFF7F7FD5);
const sudokuAccent2 = Color(0xFF86A8E7);

/// Зелёная линия «немецкого шёпота» — `#22C55E` веба.
const whisperGreen = Color(0xFF22C55E);

/// Синяя линия равных сумм — `#3B82F6` веба.
const regionSumBlue = Color(0xFF3B82F6);

/// Линия «палиндром» — `#9CA3AF` веба.
const palindromeColor = Color(0xFF9CA3AF);

/// Линия «между концами» — `#6B7280` веба.
const betweenColor = Color(0xFF6B7280);

/// Линия «замок» — `#0EA5E9` веба.
const lockoutColor = Color(0xFF0EA5E9);

/// Фиолетовая полоса ренбана — `#A855F7` веба, бледная (доля 0,32), чтобы цифра читалась.
const renbanPurple = Color(0xFFA855F7);
const cageAccents = [
  Color(0xFF7F7FD5), Color(0xFF86A8E7), Color(0xFFD58A7F),
  Color(0xFF7FD5A8), Color(0xFFD5C97F), Color(0xFFB07FD5),
];

/// Зазор линии у границы клетки — в точках, не в долях клетки (см. шапку `sudoku-overlay.ts`).
const double seam = 1.5;

/// Что нарисовать в одной клетке (под цифрой).
class CellDecor {
  const CellDecor({this.thermo, this.arrow, this.parity = 0, this.cageId = -1, this.whisper, this.renban, this.regionsum, this.palindrome, this.between, this.lockout});

  /// Звено термометра; колба — у клетки без `prev`.
  final ThermoLink? thermo;

  /// Клетка стрелки: кружок или звено линии.
  final ArrowLink? arrow;

  /// 1 — чётная (квадрат), 2 — нечётная (круг), 0 — метки нет.
  final int parity;

  /// Номер группы-суммы; −1 — вне групп.
  final int cageId;

  /// Звено зелёной линии шёпота — как термометр, но без колбы.
  final ThermoLink? whisper;

  /// Звено полосы ренбана — широкая бледная, кружок в центре клетки сглаживает повороты.
  final ThermoLink? renban;

  /// Звено синей линии равных сумм — тонкая, как шёпот.
  final ThermoLink? regionsum;

  /// Звено линии «палиндром».
  final ThermoLink? palindrome;

  /// Звено линии «между концами».
  final ThermoLink? between;

  /// Звено линии «замок».
  final ThermoLink? lockout;

  bool get isEmpty =>
      thermo == null && arrow == null && parity == 0 && cageId < 0 && whisper == null && renban == null &&
      regionsum == null &&
      palindrome == null &&
      between == null &&
      lockout == null;
}

/// Рисунок клетки по геометрии доски; `null` — рисовать нечего.
CellDecor? cellDecorFor(BoardGeometry g, int r, int c) {
  final d = CellDecor(
    thermo: g.thermo?[r][c],
    arrow: g.arrow?[r][c],
    parity: g.parity?[r][c] ?? 0,
    cageId: g.cages?.cageOf[r][c] ?? -1,
    whisper: g.whisper?[r][c],
    renban: g.renban?[r][c],
    regionsum: g.regionsum?[r][c],
    palindrome: g.palindrome?[r][c],
    between: g.between?[r][c],
    lockout: g.lockout?[r][c],
  );
  return d.isEmpty ? null : d;
}

/// Тонировка клетки группы-суммы поверх фона (`cageTint` веба).
Color? cageTint(Color surface, int cageId) =>
    cageId < 0 ? null : blendColor(surface, cageAccents[cageId % cageAccents.length], 0.16);

/// Рисует трубку термометра, линию шёпота, стрелку и метку чётности ПОД цифрой клетки.
class CellDecorPainter extends CustomPainter {
  CellDecorPainter({required this.decor, required this.surface, required this.row, required this.col});

  final CellDecor decor;
  final Color surface;

  /// Клетка рисунка — по ней звено знает, в какую сторону сосед.
  final int row;
  final int col;

  /// Отрезок от центра клетки к соседу [nb] клетки (r, c), не доходящий до границы на [seam].
  static Rect segment(Size s, int r, int c, List<int> nb, double thick) {
    final dr = nb[0] - r, dc = nb[1] - c;
    final cell = s.width;
    final arm = math.max(1.0, cell / 2 - seam);
    if (dc == 1) return Rect.fromLTWH(cell / 2, cell / 2 - thick / 2, arm, thick);
    if (dc == -1) return Rect.fromLTWH(seam, cell / 2 - thick / 2, arm, thick);
    if (dr == 1) return Rect.fromLTWH(cell / 2 - thick / 2, cell / 2, thick, arm);
    return Rect.fromLTWH(cell / 2 - thick / 2, seam, thick, arm);
  }

  @override
  void paint(Canvas canvas, Size size) {
    final cell = size.width;
    final parity = decor.parity;
    if (parity != 0) {
      final d = cell * 0.6;
      final rect = Rect.fromCenter(center: Offset(cell / 2, cell / 2), width: d, height: d);
      final fill = Paint()..color = blendColor(surface, sudokuAccent2, 0.20);
      final edge = Paint()
        ..color = blendColor(surface, sudokuAccent2, 0.45)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1;
      if (parity == 2) {
        canvas.drawOval(rect, fill);
        canvas.drawOval(rect, edge);
      } else {
        final rr = RRect.fromRectAndRadius(rect, Radius.circular(math.max(3, cell * 0.1)));
        canvas.drawRRect(rr, fill);
        canvas.drawRRect(rr, edge);
      }
    }
    final t = decor.thermo;
    if (t != null) {
      final thick = math.max(3.0, (cell * 0.16).roundToDouble());
      final paint = Paint()..color = blendColor(surface, sudokuAccent, 0.5);
      for (final nb in [t.prev, t.next]) {
        if (nb != null) canvas.drawRect(segment(size, row, col, nb, thick), paint);
      }
      if (t.prev == null) {
        canvas.drawCircle(Offset(cell / 2, cell / 2), cell * 0.21, paint);   // колба
      }
    }
    final rb = decor.renban;
    if (rb != null) {
      // Ренбан — как в вебе (`app/games/sudoku.tsx`): полоса 0,34 клетки (не тоньше 6),
      // бледная — под цифрой; кружок в центре закрывает стык на повороте.
      final thick = math.max(6.0, (cell * 0.34).roundToDouble());
      final paint = Paint()..color = blendColor(surface, renbanPurple, 0.32);
      canvas.drawCircle(Offset(cell / 2, cell / 2), thick / 2, paint);
      for (final nb in [rb.prev, rb.next]) {
        if (nb != null) canvas.drawRect(segment(size, row, col, nb, thick), paint);
      }
    }
    final rs = decor.regionsum;
    if (rs != null) {
      // Равные суммы — синяя тонкая линия, как шёпот (`app/games/sudoku.tsx`).
      final thick = math.max(3.0, (cell * 0.16).roundToDouble());
      final paint = Paint()..color = blendColor(surface, regionSumBlue, 0.6);
      for (final nb in [rs.prev, rs.next]) {
        if (nb != null) canvas.drawRect(segment(size, row, col, nb, thick), paint);
      }
    }
    final palindromeLink = decor.palindrome;
    if (palindromeLink != null) {
      // палиндром — как в вебе (`app/games/sudoku.tsx`).
      final thick = math.max(3.0, (cell * 0.16).roundToDouble());
      final paint = Paint()..color = blendColor(surface, palindromeColor, 0.6);
      for (final nb in [palindromeLink.prev, palindromeLink.next]) {
        if (nb != null) canvas.drawRect(segment(size, row, col, nb, thick), paint);
      }
    }
    final betweenLink = decor.between;
    if (betweenLink != null) {
      // между концами — как в вебе (`app/games/sudoku.tsx`).
      final thick = math.max(3.0, (cell * 0.16).roundToDouble());
      final paint = Paint()..color = blendColor(surface, betweenColor, 0.6);
      for (final nb in [betweenLink.prev, betweenLink.next]) {
        if (nb != null) canvas.drawRect(segment(size, row, col, nb, thick), paint);
      }
      // Концы линии — кружки (как кружок стрелки): в них цифры-границы.
      if (betweenLink.prev == null || betweenLink.next == null) {
        canvas.drawCircle(Offset(cell / 2, cell / 2), cell * 0.4, Paint()..color = surface);
        canvas.drawCircle(
          Offset(cell / 2, cell / 2),
          cell * 0.4,
          Paint()
            ..color = paint.color
            ..style = PaintingStyle.stroke
            ..strokeWidth = math.max(2.0, (cell * 0.07).roundToDouble()),
        );
      }
    }
    final lockoutLink = decor.lockout;
    if (lockoutLink != null) {
      // замок — как в вебе (`app/games/sudoku.tsx`).
      final thick = math.max(3.0, (cell * 0.16).roundToDouble());
      final paint = Paint()..color = blendColor(surface, lockoutColor, 0.6);
      for (final nb in [lockoutLink.prev, lockoutLink.next]) {
        if (nb != null) canvas.drawRect(segment(size, row, col, nb, thick), paint);
      }
      // Концы — ромбы (повёрнутый квадрат): в них цифры, «запирающие» середину шкалы.
      if (lockoutLink.prev == null || lockoutLink.next == null) {
        final h = cell * 0.4;
        final diamond = Path()
          ..moveTo(cell / 2, cell / 2 - h)
          ..lineTo(cell / 2 + h, cell / 2)
          ..lineTo(cell / 2, cell / 2 + h)
          ..lineTo(cell / 2 - h, cell / 2)
          ..close();
        canvas.drawPath(diamond, Paint()..color = surface);
        canvas.drawPath(
          diamond,
          Paint()
            ..color = paint.color
            ..style = PaintingStyle.stroke
            ..strokeWidth = math.max(2.0, (cell * 0.07).roundToDouble()),
        );
      }
    }
    final w = decor.whisper;
    if (w != null) {
      // Шёпот — та же трубка и тот же зазор у границы, что у термометра, но без колбы:
      // у линии нет начала, правило симметрично.
      final thick = math.max(3.0, (cell * 0.16).roundToDouble());
      final paint = Paint()..color = blendColor(surface, whisperGreen, 0.6);
      for (final nb in [w.prev, w.next]) {
        if (nb != null) canvas.drawRect(segment(size, row, col, nb, thick), paint);
      }
    }
    final a = decor.arrow;
    if (a != null) {
      final thick = math.max(2.0, (cell * 0.07).roundToDouble());
      final paint = Paint()..color = blendColor(surface, sudokuAccent2, 0.55);
      if (a.isCircle) {
        canvas.drawCircle(
          Offset(cell / 2, cell / 2),
          cell * 0.4,
          Paint()
            ..color = paint.color
            ..style = PaintingStyle.stroke
            ..strokeWidth = thick,
        );
      }
      for (final nb in [a.prev, a.next]) {
        if (nb != null) canvas.drawRect(segment(size, row, col, nb, thick), paint);
      }
      // Остриё — на последней клетке стрелки (нет `next`, есть `prev`).
      final prev = a.prev;
      if (!a.isCircle && a.next == null && prev != null) {
        final dr = row - prev[0], dc = col - prev[1];
        final hs = math.max(3.0, cell * 0.13);
        final tip = Offset(cell / 2 + dc * cell * 0.24, cell / 2 + dr * cell * 0.24);
        final back = Offset(tip.dx - dc * hs * 1.5, tip.dy - dr * hs * 1.5);
        final side = Offset(-dr.toDouble(), dc.toDouble()) * hs;
        canvas.drawPath(
          Path()
            ..moveTo(tip.dx, tip.dy)
            ..lineTo(back.dx + side.dx, back.dy + side.dy)
            ..lineTo(back.dx - side.dx, back.dy - side.dy)
            ..close(),
          paint,
        );
      }
    }
  }

  @override
  bool shouldRepaint(CellDecorPainter old) =>
      old.decor != decor || old.surface != surface || old.row != row || old.col != col;
}

/// Точка Кропки на грани: центр в координатах доски и цвет.
class KropkiDot {
  const KropkiDot(this.center, this.black);
  final Offset center;
  final bool black;
}

/// Точки Кропки по всей доске — поверх клеток: они сидят НА грани, и рисунок одной клетки
/// срезал бы половину точки соседней.
List<KropkiDot> kropkiDots(KropkiMap k, int n, double cell) => [
      for (var r = 0; r < n; r++)
        for (var c = 0; c < n; c++) ...[
          if (c < n - 1 && k.h[r][c] != 0) KropkiDot(Offset((c + 1) * cell, (r + 0.5) * cell), k.h[r][c] == 2),
          if (r < n - 1 && k.v[r][c] != 0) KropkiDot(Offset((c + 0.5) * cell, (r + 1) * cell), k.v[r][c] == 2),
        ],
    ];

/// Знак XV на грани: центр в координатах доски и буква.
class XvMark {
  const XvMark(this.center, this.isX);
  final Offset center;
  final bool isX;
}

/// Знаки XV по всей доске — поверх клеток, на гранях (как точки Кропки).
List<XvMark> xvMarks(KropkiMap xv, int n, double cell) => [
      for (var r = 0; r < n; r++)
        for (var c = 0; c < n; c++) ...[
          if (c < n - 1 && xv.h[r][c] != 0) XvMark(Offset((c + 1) * cell, (r + 0.5) * cell), xv.h[r][c] == 2),
          if (r < n - 1 && xv.v[r][c] != 0) XvMark(Offset((c + 0.5) * cell, (r + 1) * cell), xv.v[r][c] == 2),
        ],
    ];

/// XV — буква в кружке на грани, как знак неравенства веба (пилюля 0,36 клетки).
class XvPainter extends CustomPainter {
  XvPainter({required this.marks, required this.cell, required this.surface, required this.ink});
  final List<XvMark> marks;
  final double cell;
  final Color surface;
  final Color ink;

  @override
  void paint(Canvas canvas, Size size) {
    final rad = cell * 0.18;
    final edge = Paint()
      ..color = const Color(0xFF777777)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    for (final m in marks) {
      canvas.drawCircle(m.center, rad, Paint()..color = surface);
      canvas.drawCircle(m.center, rad, edge);
      final tp = TextPainter(
        text: TextSpan(
          text: m.isX ? 'X' : 'V',
          style: TextStyle(color: ink, fontSize: math.max(9.0, (cell * 0.26).roundToDouble()), fontWeight: FontWeight.w800),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(canvas, m.center - Offset(tp.width / 2, tp.height / 2));
    }
  }

  @override
  bool shouldRepaint(XvPainter old) => old.marks != marks || old.cell != cell || old.surface != surface || old.ink != ink;
}

class KropkiPainter extends CustomPainter {
  KropkiPainter({required this.dots, required this.cell});
  final List<KropkiDot> dots;
  final double cell;

  @override
  void paint(Canvas canvas, Size size) {
    final rad = cell * 0.1;
    final edge = Paint()
      ..color = const Color(0xFF777777)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;
    for (final d in dots) {
      canvas.drawCircle(d.center, rad, Paint()..color = d.black ? const Color(0xFF222222) : Colors.white);
      canvas.drawCircle(d.center, rad, edge);
    }
  }

  @override
  bool shouldRepaint(KropkiPainter old) => old.dots != dots || old.cell != cell;
}

/// Диагонали (`diagonal`, `killerdiag`) — одной цельной линией через доску, серым пунктиром,
/// и рамки доп. зон «гипера» — как в вебе (`app/games/sudoku.tsx`: Svg Line 7,6 и Rect rx 4).
/// Рамка, а не заливка: заливка гасла от подсветки строки выделения (отчёт Вали «то
/// голубые то нет»).
class BoardLinesPainter extends CustomPainter {
  BoardLinesPainter({required this.diagonals, required this.hyper, required this.n, required this.ink});
  final bool diagonals;
  final bool hyper;
  final int n;
  final Color ink;

  @override
  void paint(Canvas canvas, Size size) {
    final cell = size.width / n;
    if (diagonals) {
      final p = Paint()
        ..color = ink.withValues(alpha: 0.6)
        ..strokeWidth = 1.5;
      void dashed(Offset a, Offset b) {
        final len = (b - a).distance;
        final dir = (b - a) / len;
        for (var t = 0.0; t < len; t += 13) {
          canvas.drawLine(a + dir * t, a + dir * math.min(t + 7, len), p);
        }
      }

      dashed(Offset.zero, Offset(size.width, size.height));
      dashed(Offset(size.width, 0), Offset(0, size.height));
    }
    if (hyper) {
      final p = Paint()
        ..color = sudokuAccent.withValues(alpha: 0.85)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5;
      for (final box in hyperBoxes) {
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromLTWH(box[1] * cell + 1.5, box[0] * cell + 1.5, cell * 3 - 3, cell * 3 - 3),
            const Radius.circular(4),
          ),
          p,
        );
      }
    }
  }

  @override
  bool shouldRepaint(BoardLinesPainter old) =>
      old.diagonals != diagonals || old.hyper != hyper || old.n != n || old.ink != ink;
}
