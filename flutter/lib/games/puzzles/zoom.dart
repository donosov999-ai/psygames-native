import 'dart:ui';

/// МАСШТАБ ДОСКИ ГОЛОВОЛОМОК (задача a504c68b, решение Дениса 08.10.2026: «Б, на Flutter»).
///
/// 📍 ПОВОД — замер 17.09.2026 касаниями на окне iPhone 390 pt: у «Заполнения областей»
/// клетка ступеней 3–5 выходит 26 · 22 · 20 pt при пальце ≈ 44 pt. Другой оси сложности у
/// движка нет — только размер поля, — поэтому резать поле значило бы ставить потолок.
/// Вместо этого доску можно увеличить: два пальца — масштаб и сдвиг, один палец — ход.
///
/// Вид = доска × [scale] + [offset] в координатах коробки доски. Увеличенная доска всегда
/// накрывает коробку целиком: пустых полос по краям сдвиг не открывает.
class BoardZoom {
  /// Предел увеличения: клетка 20 pt становится 80 pt — с запасом на палец.
  static const maxScale = 4.0;

  double scale = 1;
  Offset offset = Offset.zero;

  double _pinchScale = 1;
  double _pinchDistance = 1;
  Offset _pinchFocus = Offset.zero;

  bool get zoomed => scale > 1.001;

  /// Точка коробки (куда пришло касание) → точка неувеличенной доски.
  Offset toBoard(Offset view) => (view - offset) / scale;

  void reset() {
    scale = 1;
    offset = Offset.zero;
  }

  /// Увеличить в [k] раз так, чтобы точка [focal] осталась под пальцем.
  void zoomAt(Offset focal, double k, Size box) {
    final board = toBoard(focal);
    scale = (scale * k).clamp(1.0, maxScale);
    offset = focal - board * scale;
    _clamp(box);
  }

  /// Два пальца легли: запомнить исходный масштаб и точку доски между ними.
  void pinchStart(Offset a, Offset b) {
    _pinchScale = scale;
    _pinchDistance = (a - b).distance;
    if (_pinchDistance < 1) _pinchDistance = 1;
    _pinchFocus = toBoard((a + b) / 2);
  }

  /// Пальцы сдвинулись: масштаб — по расстоянию, сдвиг — за серединой между ними.
  void pinchUpdate(Offset a, Offset b, Size box) {
    final focal = (a + b) / 2;
    scale = (_pinchScale * (a - b).distance / _pinchDistance).clamp(1.0, maxScale);
    offset = focal - _pinchFocus * scale;
    _clamp(box);
  }

  void _clamp(Size box) {
    offset = Offset(
      offset.dx.clamp(box.width * (1 - scale), 0.0),
      offset.dy.clamp(box.height * (1 - scale), 0.0),
    );
  }
}

/// Сколько столбцов клеток у ступени — грубо, по строке параметров движка. Нужна только
/// для решения «показывать ли кнопку «Крупнее»», поэтому промах здесь не ломает игру:
/// не разобрали параметры — кнопка просто стоит, а щипок работает всегда.
///
/// «9x7» → 9 · «6dh» → 6 · у Solo «3x3» — размер блока, клеток в ряду 3 × 3 = 9.
int? puzzleColumns(String engineName, String params) {
  final m = RegExp(r'^(\d+)x(\d+)').firstMatch(params);
  if (engineName == 'Solo' && m != null) return int.parse(m.group(1)!) * int.parse(m.group(2)!);
  if (m != null) return int.parse(m.group(1)!);
  final first = RegExp(r'^(\d+)').firstMatch(params);
  return first == null ? null : int.parse(first.group(1)!);
}

/// Клетка мельче этого — кнопка «Крупнее» под полем (ниже ~30 pt промахи вероятны, замер 17.09).
const smallCellPt = 32.0;
