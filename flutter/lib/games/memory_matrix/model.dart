import 'dart:math';

/// «Матрица памяти» — четвёртая перенесённая игра и вторая про ТАП по полю.
///
/// Взята по жалобам Дениса на вёрстку: за 45 дней у неё две жалобы, и она из
/// того класса («тап и соединение»), где WebView врёт про размеры сильнее всего.
///
/// Правила перенесены из `frontend/app/games/memory-matrix.tsx` и сверены с
/// эталонами, выгруженными прогоном живого TS (`test/fixtures/mm-reference.json`).
/// Считать перенос «проверенным» той же формулой, которой переносил, нельзя —
/// такая проба зелёная всегда.

/// Потолок объёма: выше него поле и скорость на пределе, растут другие оси.
const mmVolumeTop = 15;

/// Сколько клеток поля отдаётся под ложные вспышки.
const decoyRoom = 6;

/// Что задаёт уровень.
class LevelParams {
  const LevelParams({
    required this.gridSize,
    required this.baseFlashes,
    required this.flashMs,
    required this.seriesCount,
    required this.holdMs,
    required this.decoys,
  });

  /// Сторона поля: L1 = 3 … L4 = 6, дальше держим 6.
  final int gridSize;

  /// Сколько клеток запомнить на первом круге.
  final int baseFlashes;

  /// Сколько держится вспышка.
  final int flashMs;

  /// С L11 серий две, разного цвета.
  final int seriesCount;

  /// Пауза между показом и вводом — ось задержки, выше потолка объёма.
  final int holdMs;

  /// 🔴 ОСЬ ЛОЖНЫХ ВСПЫШЕК. Клетки, которые загораются и которые запоминать НЕ
  /// надо. Растят нагрузку не объёмом, а необходимостью отделять нужное от
  /// ненужного: держать в уме столько же, а входящего потока больше.
  final int decoys;

  static LevelParams of(int level) => LevelParams(
        gridSize: min(6, 2 + level),
        baseFlashes: 3 + (level / 1.5).floor(),
        flashMs: max(500, 1500 - level * 70),
        seriesCount: level >= 11 ? 2 : 1,
        holdMs: max(0, level - mmVolumeTop) * 700,
        decoys: min(decoyRoom, max(0, level - mmVolumeTop)),
      );
}

/// Сколько клеток показать на этом круге и сколько из них ложных.
class Needed {
  const Needed({required this.need, required this.decoys, required this.free});
  final int need;
  final int decoys;
  final int free;
}

/// Перенос `cellsNeeded`. Круги внутри уровня добавляют по клетке каждые три.
Needed cellsNeeded(int level, int round, String mode, {bool preset = false}) {
  final p = LevelParams.of(level);
  final total = p.gridSize * p.gridSize;
  final two = p.seriesCount == 2 && mode == 'static';
  final decoys = preset ? 0 : p.decoys;
  final underNeeded = total - (decoys > 0 ? decoyRoom : 0);
  final base = preset ? 3 : p.baseFlashes;
  final need = min(two ? ((underNeeded - 1) / 2).floor() : underNeeded - 1,
      base + ((round - 1) / 3).floor());
  return Needed(need: need, decoys: decoys, free: total - (two ? need * 2 : need));
}

/// Партия: какие клетки загорались и какие человек отметил.
class MemoryMatrixGame {
  MemoryMatrixGame({
    required this.level,
    this.round = 1,
    this.mode = 'static',
    Set<int>? target,
    Set<int>? decoys,
    Random? rnd,
  })  : params = LevelParams.of(level),
        need = cellsNeeded(level, round, mode) {
    final r = rnd ?? Random();
    final total = params.gridSize * params.gridSize;
    if (target != null) {
      _target.addAll(target);
    } else {
      while (_target.length < need.need) {
        _target.add(r.nextInt(total));
      }
    }
    if (decoys != null) {
      _decoys.addAll(decoys);
    } else {
      while (_decoys.length < need.decoys) {
        final c = r.nextInt(total);
        if (!_target.contains(c)) _decoys.add(c);
      }
    }
  }

  final int level;
  final int round;
  final String mode;
  final LevelParams params;
  final Needed need;

  final Set<int> _target = {};
  final Set<int> _decoys = {};
  final Set<int> picked = {};

  Set<int> get target => Set.unmodifiable(_target);
  Set<int> get decoys => Set.unmodifiable(_decoys);
  int get total => params.gridSize * params.gridSize;

  /// Отметить клетку. Повторное нажатие снимает отметку — так человек
  /// исправляет промах, не начиная круг заново.
  void tap(int cell) {
    if (cell < 0 || cell >= total) return;
    if (!picked.remove(cell)) picked.add(cell);
  }

  bool get full => picked.length >= _target.length;

  /// Победа — отмечены ровно нужные клетки. Лишняя отметка так же губительна,
  /// как пропуск: иначе выигрывала бы стратегия «отметить всё поле».
  bool get isWon => picked.length == _target.length && picked.containsAll(_target);

  /// Ложные вспышки, на которые человек всё-таки нажал, — по ним видно, работает
  /// ли ось помех или человек их попросту не замечает.
  Set<int> get decoysTaken => picked.intersection(_decoys);
}
