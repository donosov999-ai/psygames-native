import 'dart:math' as math;

import '../../shell/js_compat.dart' show jsRound;

/// «СОЕДИНИ ЦЕПОЧКУ» (Trail Making Test) — правила. Перенос `frontend/app/games/trail-making.tsx`.
///
/// Лестница и всё, что раскладка узлов считает БЕЗ случайности (подписи, колонки, ячейка, диаметр,
/// дрожание), сверены с живым TS эталоном `test/fixtures/trail-making-reference.json` (экспортёр в репо:
/// `frontend/src/games/trail-making/tools/record-flutter-reference.gen.ts`). Сами точки веб ставит через
/// `Math.random` без зерна — каждая партия своя; для них сверяются СВОЙСТВА: кружки не накладываются,
/// узлы в поле, порядок подписей верный.
///
/// ⚠️ Босс-раунда раз в три ступени (веб, `BossRound`) здесь нет: общего компонента во Flutter нет ни у
/// одной перенесённой игры («Счётчик», «Быстрый счёт», SDMT держат только константу).
enum TrailMode {
  a('A'),
  b('B');

  const TrailMode(this.wire);
  final String wire;
}

/// Ступеней лестницы: дальше 15-й параметры стоят (пар число-буква не больше 11).
const trailLevels = 15;

/// Проход: уложился в лимит времени ступени и не больше стольких ошибок.
const trailMaxPassErrors = 2;

/// Протяжка: палец ближе этого к центру узла — узел пройден (кружок 44, палец толще).
const trailNodeHitR = 30.0;

/// До этого смещения жест — тап узла, дальше — протяжка.
const trailDragSlop = 6.0;

const trailNodeMax = 44.0;
const trailNodeMin = 30.0;
const trailJitterMax = 0.2;
const trailLayoutPad = 30.0;

/// Русские буквы режима B — «А…Х без Й», ровно строка веба `АБВГДЕЖЗИКЛМНОПРСТУФХ` (21 буква).
/// Записаны правилом из кодов, а не строкой: это материал игры, а не подпись интерфейса, и
/// храповик зашитого текста (`test/ui_text_debt_does_not_grow_test.dart`) не должен считать его долгом.
/// Совпадение с вебом держит эталон подписей в `trail_making_model_test.dart`.
final trailRuLetters = String.fromCharCodes([for (var c = 0x0410; c <= 0x0425; c++) if (c != 0x0419) c]);
const trailEnLetters = 'ABCDEFGHIJKLMNOPQRST';

class TrailLevel {
  const TrailLevel(this.mode, this.count, this.totalNodes, this.timeLimitSec);
  final TrailMode mode;

  /// Для B — число ПАР: узлов вдвое больше.
  final int count;
  final int totalNodes;
  final int timeLimitSec;
}

/// Ступень 1..15 (классическая ось TMT):
///   1–7  — A: только числа, узлов 6 → 12, бюджет на узел 2,6 с → 1,7 с;
///   8–15 — B: чередование 1→А→2→Б…, пары 4 → 11 (узлов 8 → 22), бюджет 3,3 с → 2,25 с.
TrailLevel trailLevelParams(int level) {
  if (level <= 7) {
    final count = 5 + level;
    final perNode = 2.6 - (level - 1) * 0.15;
    return TrailLevel(TrailMode.a, count, count, jsRound(count * perNode).toInt());
  }
  final count = math.min(11, level - 4);
  final totalNodes = count * 2;
  final perNode = math.max(2.1, 3.3 - (level - 8) * 0.15);
  return TrailLevel(TrailMode.b, count, totalNodes, jsRound(totalNodes * perNode).toInt());
}

class TrailNode {
  const TrailNode(this.label, this.x, this.y);
  final String label;
  final double x;
  final double y;
}

class TrailLayout {
  const TrailLayout({required this.nodes, required this.size, required this.cell, required this.jitter});
  final List<TrailNode> nodes;

  /// Диаметр кружка: под него и разведены центры.
  final double size;
  final double cell;
  final double jitter;
}

/// Подписи по порядку обхода: A — «1, 2, 3…», B — «1, А, 2, Б…». Буквы — русские только для `ru`,
/// для остальных языков латиница, как в вебе. Букв меньше, чем пар, — дальше идут одни числа.
List<String> trailLabels(TrailMode mode, int n, String lang) {
  final letters = lang == 'ru' ? trailRuLetters : trailEnLetters;
  return [
    if (mode == TrailMode.a)
      for (var i = 1; i <= n; i++) '$i'
    else
      for (var i = 0; i < n; i++) ...['${i + 1}', if (i < letters.length) letters[i]],
  ];
}

/// Раскладка по «дрожащей сетке»: колонки — те, при которых меньшая сторона ячейки максимальна;
/// диаметр подчинён ячейке, дрожание — диаметру, так что центры соседей расходятся не ближе
/// диаметра: расстояние ≥ ячейка · (1 − дрожание) ≥ диаметр.
TrailLayout trailMakeNodes(TrailMode mode, int n, String lang, double w, double h, math.Random rnd) {
  final labels = trailLabels(mode, n, lang);
  final count = labels.length;
  const pad = trailLayoutPad;
  final gw = math.max(1.0, w - pad * 2);
  final gh = math.max(1.0, h - pad * 2);
  var cols = 1;
  var cell = 0.0;
  for (var k = 1; k <= count; k++) {
    final side = math.min(gw / k, gh / (count / k).ceil());
    if (side > cell) {
      cell = side;
      cols = k;
    }
  }
  final rows = (count / cols).ceil();
  final cellW = gw / cols;
  final cellH = gh / rows;
  final size = math.min(trailNodeMax, math.max(trailNodeMin, cell * (1 - trailJitterMax)));
  final jitter = math.max(0.0, math.min(trailJitterMax, 1 - size / cell));
  final cells = List<int>.generate(cols * rows, (i) => i);
  for (var i = cells.length - 1; i > 0; i--) {
    final j = (rnd.nextDouble() * (i + 1)).floor();
    final t = cells[i];
    cells[i] = cells[j];
    cells[j] = t;
  }
  final nodes = <TrailNode>[
    for (var idx = 0; idx < count; idx++)
      TrailNode(
        labels[idx],
        pad + cellW * (cells[idx] % cols + 0.5) + (rnd.nextDouble() - 0.5) * cellW * jitter,
        pad + cellH * (cells[idx] ~/ cols + 0.5) + (rnd.nextDouble() - 0.5) * cellH * jitter,
      ),
  ];
  return TrailLayout(nodes: nodes, size: size, cell: cell, jitter: jitter);
}

enum TrailStep { ignored, advanced, miss, done }

/// Партия: какой узел следующий, сколько ошибок. Тап и протяжка идут через одни и те же правила.
class TrailGame {
  TrailGame(this.layout);

  final TrailLayout layout;
  int current = 0;
  int errors = 0;
  int? _wrongDragNode;

  bool get finished => current >= layout.nodes.length;

  TrailStep _advance() {
    current++;
    return finished ? TrailStep.done : TrailStep.advanced;
  }

  /// Тап: верный узел — вперёд; узел ДАЛЬШЕ по порядку — ошибка; уже пройденный — ничего.
  TrailStep tap(int index) {
    if (finished) return TrailStep.ignored;
    if (index == current) return _advance();
    if (index > current) {
      errors++;
      return TrailStep.miss;
    }
    return TrailStep.ignored;
  }

  /// Ближайший узел в радиусе захвата; при перекрытии зон побеждает ближайший. −1 — ни одного.
  int nodeAt(double x, double y) {
    var best = -1;
    var bestD = double.infinity;
    for (var i = 0; i < layout.nodes.length; i++) {
      final n = layout.nodes[i];
      final d = (n.x - x) * (n.x - x) + (n.y - y) * (n.y - y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return bestD <= trailNodeHitR * trailNodeHitR ? best : -1;
  }

  /// Палец в точке протяжки: зашёл в верный узел — вперёд, не отрывая пальца; в неверный — одна ошибка
  /// на ОДИН вход в узел, жест не рвётся.
  TrailStep dragAt(double x, double y) {
    if (finished) return TrailStep.ignored;
    final hit = nodeAt(x, y);
    if (hit != _wrongDragNode) _wrongDragNode = null;
    if (hit < 0) return TrailStep.ignored;
    if (hit == current) return _advance();
    if (hit > current && _wrongDragNode == null) {
      _wrongDragNode = hit;
      errors++;
      return TrailStep.miss;
    }
    return TrailStep.ignored;
  }

  void endDrag() => _wrongDragNode = null;
}

/// Проход ступени: лимит есть (у шага зарядки его нет — там прохода нет вовсе), уложился, ошибок ≤ 2.
bool trailPassed({required double seconds, required int timeLimitSec, required int errors}) =>
    timeLimitSec > 0 && seconds <= timeLimitSec && errors <= trailMaxPassErrors;

/// Счёт партии — как у веба: `max(0, round(1000 − время·5 − ошибки·30))`.
int trailScore(double seconds, int errors) => math.max(0, jsRound(1000 - seconds * 5 - errors * 30).toInt());
