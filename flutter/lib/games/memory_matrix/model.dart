import 'dart:math';

/// «Матрица памяти» — правила, перенесённые из `frontend/app/games/memory-matrix.tsx` и
/// сверенные с эталоном живого TS (`test/fixtures/mm-reference.json`; экспортёр в репо:
/// `frontend/src/games/memory-matrix/tools/record-flutter-reference.gen.ts`). Считать перенос
/// «проверенным» той же формулой, которой переносил, нельзя — такая проба зелёная всегда.
///
/// 🔴 ПЕРЕНОС 01.10.2026 — ВТОРОЙ, ЦЕЛИКОМ. Первый (23.09) перенёс лестницу, но не игру:
/// один раунд вместо десяти, одна серия вместо двух с L11, без режима «по порядку», ложные
/// без креста, отметка снималась повторным нажатием, отчёт без меток. Здесь — партия веба:
/// [MatrixLevel] из [mmTotalRounds] раундов, раунд — [MatrixRound] с вводом `handleCellPress`.

/// Потолок объёма: выше него поле и скорость на пределе, растут другие оси.
const mmVolumeTop = 15;

/// Сколько клеток поля отдаётся под ложные вспышки.
const decoyRoom = 6;

/// Раундов в уровне — веб `MM_TOTAL_ROUNDS`.
const mmTotalRounds = 10;

/// Паузы показа «по порядку» и итога раунда — как в вебе.
const mmSeqGapMs = 200;
const mmSeqTailMs = 300;
const mmFeedbackMs = 900;

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

/// Пауза на чтение подписи перед первой вспышкой — веб `паузаНаЧтение` (жалоба Вали 7be44621:
/// «пока читаешь задание, клетки закрываются»). 46 мс на знак, не меньше 700 и не больше 2200;
/// ноль — если эту же строку человек уже читал. ⚠️ Знаки — единицы UTF-16, как `length` в JS.
int mmReadPauseMs(String caption, String previous) {
  if (caption == previous) return 0;
  return min(2200, max(700, caption.length * 46));
}

/// Раздача раунда — веб `dealRound`: из перетасованного пула первая серия (она же порядок для
/// режима «по порядку»), вторая серия, ложные — из ОСТАТКА пула. Тасовка — Фишер–Йетс с конца,
/// `floor(rng() * (i + 1))`: иной порядок обращений к случайности дал бы другое поле.
({List<int> set1, List<int> seq, List<int> set2, List<int> decoys}) mmDealRound(
  int gridSize,
  int need,
  bool two,
  int decoysWanted,
  double Function() rng,
) {
  final total = gridSize * gridSize;
  final pool = List<int>.generate(total, (i) => i);
  for (var i = pool.length - 1; i > 0; i--) {
    final j = (rng() * (i + 1)).floor();
    final t = pool[i];
    pool[i] = pool[j];
    pool[j] = t;
  }
  // Как JS `slice`: границы за краем пула режутся, «конец раньше начала» — пусто.
  List<int> slice(int from, int to) {
    final a = min(max(0, from), total);
    final b = min(max(a, to), total);
    return pool.sublist(a, b);
  }

  final taken = two ? need * 2 : need;
  return (
    set1: slice(0, need),
    seq: slice(0, need),
    set2: two ? slice(need, need * 2) : <int>[],
    decoys: slice(taken, taken + min(decoysWanted, total - taken)),
  );
}

/// Порядок вспышек режима «по порядку»: серия и ложные вперемешку. Ложная номер j встаёт после
/// `((j + 1) · n) ~/ (k + 1)` настоящих — ровно по ряду и без нового обращения к случайности, так
/// что раздача остаётся раздачей веба (эталон `mm-reference.json`).
///
/// 🔴 До 02.10.2026 ложные в этом режиме раздавались, подпись «перечёркнутые — мимо» висела, а
/// показ их не зажигал: ось L16 была объявлена и не исполнялась, и в обеих половинах — веб так же
/// (сверка веб → натив 02.10). «Показать решение» при этом рисовало кресты, которых не было.
List<({int cell, bool decoy})> mmSeqShowOrder(List<int> seq, List<int> decoys) {
  final out = <({int cell, bool decoy})>[];
  var d = 0;
  for (var i = 0; i < seq.length; i++) {
    while (d < decoys.length && ((d + 1) * seq.length) ~/ (decoys.length + 1) <= i) {
      out.add((cell: decoys[d++], decoy: true));
    }
    out.add((cell: seq[i], decoy: false));
  }
  while (d < decoys.length) {
    out.add((cell: decoys[d++], decoy: true));
  }
  return out;
}

/// Чем кончилось нажатие.
enum MmPress {
  /// Нажатие не считается: раунд кончился или клетку уже отметили.
  ignored,

  /// Верная клетка, раунд продолжается.
  hit,

  /// Первая серия собрана — дальше вторая (две серии, static).
  seriesDone,

  /// Раунд собран целиком.
  roundWon,

  /// Не та клетка (или не в свой черёд) — раунд кончается.
  roundLost,
}

/// Раунд: что показали и что человек нажал. Ввод — веб `handleCellPress`.
class MatrixRound {
  MatrixRound({
    required this.mode,
    required this.two,
    required this.set1,
    required this.seq,
    required this.set2,
    required this.decoys,
  });

  final String mode;

  /// Две серии: сначала вводится первая (фиолетовая), затем вторая (красная).
  final bool two;
  final List<int> set1;
  final List<int> seq;
  final List<int> set2;
  final List<int> decoys;

  /// Отмеченные в ТЕКУЩЕЙ серии; после сбора первой серии счёт начинается заново.
  final Set<int> picked = {};
  final List<int> pickedSequence = [];

  /// Собранная первая серия — для итога раунда: без неё верно введённые фиолетовые после второй
  /// серии показывались «пропущенными» (сверка веб → натив 02.10; в вебе так же).
  final Set<int> pickedFirst = {};
  int inputSeries = 0;
  bool over = false;

  /// Нажатие, которым раунд проигран: не та клетка или верная не в свой черёд. В итоге раунда она
  /// с крестом, даже если входит в серию, — иначе нажатая не в свой черёд горела «верно».
  int? lostOn;

  /// Серия, которую вводят сейчас.
  Set<int> get target => (two && inputSeries == 1 ? set2 : set1).toSet();

  /// Всё, что человек отметил за раунд, — обе серии.
  Set<int> get pickedAll => {...pickedFirst, ...picked};

  MmPress tap(int cell) {
    if (over || picked.contains(cell)) return MmPress.ignored;
    picked.add(cell);
    pickedSequence.add(cell);
    final t = target;
    final hit = mode == 'static' ? t.contains(cell) : cell == seq[pickedSequence.length - 1];
    var allFound = false;
    if (mode == 'static') {
      allFound = t.every(picked.contains);
    } else {
      allFound = pickedSequence.length >= seq.length;
      for (var i = 0; allFound && i < pickedSequence.length; i++) {
        if (pickedSequence[i] != seq[i]) allFound = false;
      }
    }
    if (two && hit && allFound && inputSeries == 0) {
      inputSeries = 1;
      pickedFirst.addAll(picked);
      picked.clear();
      pickedSequence.clear();
      return MmPress.seriesDone;
    }
    if (allFound || !hit) {
      over = true;
      if (!hit) lostOn = cell;
      return hit && allFound ? MmPress.roundWon : MmPress.roundLost;
    }
    return MmPress.hit;
  }
}

/// Уровень — [mmTotalRounds] раундов. Очки, серия подряд и зачёт — как в вебе.
class MatrixLevel {
  MatrixLevel({required this.level, required this.mode, required this.gridSize, this.preset = false})
      : params = LevelParams.of(level);

  final int level;
  final String mode;

  /// Сторона поля партии: по уровню, а в шаге зарядки — желание шага под потолком уровня.
  final int gridSize;

  /// Шаг зарядки идёт мимо лестницы: три клетки, 1,5 с показа, одна серия, без задержки и ложных.
  final bool preset;
  final LevelParams params;

  int round = 0;
  int hits = 0;
  int errors = 0;
  int score = 0;
  int streak = 0;
  MatrixRound? current;

  int get flashMs => preset ? 1500 : params.flashMs;
  int get holdMs => preset ? 0 : params.holdMs;
  int get decoysWanted => preset ? 0 : params.decoys;
  bool get two => (preset ? 1 : params.seriesCount) == 2 && mode == 'static';

  /// Показ одной серии на этом раунде (static): чуть короче с каждым раундом, не меньше 0,5 с.
  int get singleShowMs => max(500, flashMs - round * 60);

  /// Вспышка одной клетки в режиме «по порядку».
  int get seqFlashMs => max(400, 700 - round * 30);

  bool get lastRound => round >= mmTotalRounds;

  /// Уровень взят: не больше одной ошибки за десять раундов. В шаге зарядки — не зачёт.
  bool get passed => !preset && errors <= 1;

  MatrixRound nextRound(double Function() rng) {
    round += 1;
    final need = cellsNeeded(level, round, mode, preset: preset).need;
    final d = mmDealRound(gridSize, need, two, decoysWanted, rng);
    return current = MatrixRound(mode: mode, two: two, set1: d.set1, seq: d.seq, set2: d.set2, decoys: d.decoys);
  }

  MmPress tap(int cell) {
    final r = current;
    if (r == null) return MmPress.ignored;
    final res = r.tap(cell);
    if (res == MmPress.ignored) return res;
    if (res == MmPress.roundLost) {
      errors += 1;
      score = max(0, score - 5);
      streak = 0;
    } else {
      hits += 1;
      score += 10;
      streak += 1;
    }
    return res;
  }
}
