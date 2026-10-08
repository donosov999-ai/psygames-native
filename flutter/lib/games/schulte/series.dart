/// СЕРИЯ БЛОКОВ «ТАБЛИЦЫ ШУЛЬТЕ» — ПЕРЕНОС ЖИВОГО ЯДРА ВЕБА (задача 1b6338c1, 07.10.2026).
///
/// Источник — три файла TS, перенесены построчно, без пересказа:
///   · `frontend/src/games/schulte/core/blocks.ts`   — поле и три правила поверх него;
///   · `frontend/src/games/schulte/core/progress.ts` — уровень серии (модель C);
///   · `frontend/src/services/series.ts`              — прогон, разности, сессия.
/// Совпадение доказывает проба `test/schulte_series_test.dart` по эталону живого ядра
/// (`frontend/src/games/schulte/tools/record-series-reference.gen.ts`).
///
/// 🔴 ЗАЧЕМ СЕРИЯ. Три блока идут по ОДНОМУ полю, и меряется не время блока, а РАЗНОСТЬ
/// (аддитивный метод Стернберга):
///   'order'     — найти 1…N² по порядку          → T₁ скорость поиска
///   'alternate' — то же поле, чередуя два ряда    → T₂ − T₁ цена переключения
///   'sum'       — то же поле, пара с суммой S     → T₃ − T₁ цена удержания в уме
/// Поэтому поле собирается ОДИН раз ([buildSchulteField]), а [nextBlock] переносит его
/// в следующий блок тем же объектом — генератора в переходе нет вовсе.
///
/// ⚠️ ОБЩАЯ ЧАСТЬ ЗАМЕРА (прогон, разности, сессия) уже перенесена у «Шахмат вслепую»
/// (`games/chess_blind/series_run.dart`), но живёт в их папке и тянет их ленты. Здесь — свой
/// перенос того же `series.ts`, как у них; общий модуль — отдельное решение двух разделов.
library;

import 'dart:convert';
import 'dart:math' as math;

/// Генератор случайности снаружи: экран даёт `Random().nextDouble`, проба — свой ряд.
typedef SeriesRandom = double Function();

// ───────────────────────────── blocks.ts ─────────────────────────────

/// Порядок блоков НЕ рандомизируется: он часть замера.
const List<String> schulteSeriesPlan = ['order', 'alternate', 'sum'];

/// Сложность крутится РАЗМЕРОМ поля — не долями проб и не таймером.
const int seriesMinSize = 5;
const int seriesMaxSize = 8;

/// Столько ошибок в блоке ещё считается взятым блоком — тот же допуск, что у таблицы уровня.
const int seriesBlockMaxErrors = 2;

/// Под этим именем серия уходит в статистику — то же, что у веба (`SERIES_GAME_TYPE`).
const String schulteSeriesGameType = 'schulte_series';

class SchulteField {
  const SchulteField(this.size, this.cells);

  /// Сторона квадрата. Она же уровень серии: общий для всех блоков.
  final int size;

  /// Значения по клеткам слева направо и сверху вниз.
  final List<int> cells;
}

int clampSeriesSize(num size) {
  final n = size.isFinite ? size.round() : seriesMinSize;
  return math.min(seriesMaxSize, math.max(seriesMinSize, n));
}

/// Поле серии: 1…N² вперемешку (Фишер — Йетс). Собирается ОДИН раз на всю серию.
SchulteField buildSchulteField(int size, SeriesRandom random) {
  final n = clampSeriesSize(size);
  final cells = List<int>.generate(n * n, (i) => i + 1);
  for (var i = cells.length - 1; i > 0; i -= 1) {
    final j = (random() * (i + 1)).floor();
    final t = cells[i];
    cells[i] = cells[j];
    cells[j] = t;
  }
  return SchulteField(n, List.unmodifiable(cells));
}

/// Цели блока «по порядку»: 1, 2, 3 … N².
List<int> orderTargets(int total) => List<int>.generate(math.max(0, total), (i) => i + 1);

/// Цели блока «чередование»: 1, N², 2, N²−1 … На нечётном числе середина — последней.
List<int> alternateTargets(int total) {
  final out = <int>[];
  var lo = 1, hi = total;
  while (lo < hi) {
    out
      ..add(lo)
      ..add(hi);
    lo += 1;
    hi -= 1;
  }
  if (lo == hi) out.add(lo);
  return out;
}

/// Сумма пары в блоке «счёт»: у каждого значения ровно один партнёр.
int pairSum(int total) => total + 1;

/// Сколько пар предстоит собрать. На нечётном поле серединное значение без пары.
int sumPairsTotal(int total) => total ~/ 2;

class SchulteSeriesState {
  const SchulteSeriesState({
    required this.field,
    required this.blockIndex,
    required this.step,
    required this.pending,
    required this.taken,
    required this.errors,
  });

  /// ОДНО поле на всю серию: [nextBlock] переносит его как есть.
  final SchulteField field;
  final int blockIndex;

  /// Сколько целей блока уже взято: клеток в 'order'/'alternate', пар в 'sum'.
  final int step;

  /// Первая клетка собираемой пары (только 'sum'); иначе null.
  final int? pending;

  /// Клетки, закрытые в ЭТОМ блоке.
  final List<bool> taken;
  final int errors;

  SchulteSeriesState copy({int? step, int? Function()? pending, List<bool>? taken, int? errors}) => SchulteSeriesState(
        field: field,
        blockIndex: blockIndex,
        step: step ?? this.step,
        pending: pending == null ? this.pending : pending(),
        taken: taken ?? this.taken,
        errors: errors ?? this.errors,
      );
}

String blockKeyAt(int blockIndex) =>
    blockIndex >= 0 && blockIndex < schulteSeriesPlan.length ? schulteSeriesPlan[blockIndex] : schulteSeriesPlan.last;

/// Открыть блок на ГОТОВОМ поле. Поля здесь не создают — его приносят снаружи.
SchulteSeriesState openBlock(SchulteField field, int blockIndex) => SchulteSeriesState(
      field: field,
      blockIndex: blockIndex,
      step: 0,
      pending: null,
      taken: List<bool>.filled(field.cells.length, false),
      errors: 0,
    );

/// Следующий блок ТОГО ЖЕ поля. Единственный законный переход между блоками.
SchulteSeriesState nextBlock(SchulteSeriesState state) => openBlock(state.field, state.blockIndex + 1);

int blockStepsTotal(SchulteField field, String key) {
  final total = field.cells.length;
  return key == 'sum' ? sumPairsTotal(total) : total;
}

/// Что показывать в шапке: искомое значение, а в блоке счёта — сумма пары.
int blockTarget(SchulteSeriesState state) {
  final total = state.field.cells.length;
  final key = blockKeyAt(state.blockIndex);
  if (key == 'sum') return pairSum(total);
  final targets = key == 'alternate' ? alternateTargets(total) : orderTargets(total);
  return targets[math.min(state.step, targets.length - 1)];
}

bool blockDone(SchulteSeriesState state) =>
    state.step >= blockStepsTotal(state.field, blockKeyAt(state.blockIndex));

/// `hit` — цель взята · `miss` — ошибка · `pair-open` — первая клетка пары выбрана ·
/// `pair-cancel` — выбор снят повторным нажатием · `ignored` — клетка уже закрыта.
enum SeriesPress { hit, miss, pairOpen, pairCancel, ignored }

/// Имя исхода как у веба — для эталона.
String seriesPressName(SeriesPress p) => switch (p) {
      SeriesPress.hit => 'hit',
      SeriesPress.miss => 'miss',
      SeriesPress.pairOpen => 'pair-open',
      SeriesPress.pairCancel => 'pair-cancel',
      SeriesPress.ignored => 'ignored',
    };

/// Нажатие по клетке. Правило блока решает, что это было.
({SchulteSeriesState state, SeriesPress result}) pressSeriesCell(SchulteSeriesState state, int index) {
  final field = state.field;
  if (index < 0 || index >= field.cells.length || state.taken[index]) {
    return (state: state, result: SeriesPress.ignored);
  }
  final total = field.cells.length;
  final key = blockKeyAt(state.blockIndex);
  final value = field.cells[index];

  if (key == 'sum') {
    final pending = state.pending;
    if (pending == null) return (state: state.copy(pending: () => index), result: SeriesPress.pairOpen);
    if (pending == index) return (state: state.copy(pending: () => null), result: SeriesPress.pairCancel);
    final partner = field.cells[pending];
    if (value + partner == pairSum(total)) {
      final taken = [...state.taken];
      taken[index] = true;
      taken[pending] = true;
      return (state: state.copy(taken: taken, pending: () => null, step: state.step + 1), result: SeriesPress.hit);
    }
    // Пара не сложилась — ошибка, и выбор снимается целиком: иначе следующее нажатие
    // достраивало бы пару к чужой клетке и ошибка считалась бы дважды.
    return (state: state.copy(pending: () => null, errors: state.errors + 1), result: SeriesPress.miss);
  }

  final targets = key == 'alternate' ? alternateTargets(total) : orderTargets(total);
  if (value != targets[state.step]) return (state: state.copy(errors: state.errors + 1), result: SeriesPress.miss);
  final taken = [...state.taken];
  taken[index] = true;
  return (state: state.copy(taken: taken, step: state.step + 1), result: SeriesPress.hit);
}

// ───────────────────────────── series.ts ─────────────────────────────

/// Сколько раз подряд блок должен быть взят, чтобы считаться устойчивым.
const int stableRuns = 2;

/// Один блок серии: правило, время, ошибки, дошёл ли человек до конца.
class SeriesBlock {
  const SeriesBlock({required this.key, required this.timeMs, required this.errors, required this.done});
  final String key;
  final int timeMs;
  final int errors;

  /// Блок доведён до конца. Оборванный блок в разности не идёт.
  final bool done;
}

class SeriesRun {
  const SeriesRun({required this.gameType, required this.level, required this.planned, this.blocks = const []});
  final String gameType;

  /// Размер поля — ОБЩИЙ для всех блоков серии. Часть ключа замера.
  final int level;
  final List<String> planned;
  final List<SeriesBlock> blocks;
}

SeriesRun startSeries(String gameType, int level, List<String> planned) {
  // Сообщение разработчику, не подпись экрана: серия — минимум два блока, из одного разность не считается.
  if (planned.length < 2) throw ArgumentError('A series needs at least two blocks: one block gives no difference');
  return SeriesRun(gameType: gameType, level: level, planned: planned);
}

/// Записать завершённый (или оборванный) блок. Старый прогон не трогает.
SeriesRun recordBlock(SeriesRun run, SeriesBlock block) =>
    SeriesRun(gameType: run.gameType, level: run.level, planned: run.planned, blocks: [...run.blocks, block]);

/// Серия полна: сыграны ВСЕ блоки, в заданном порядке, и каждый доведён до конца.
bool seriesComplete(SeriesRun run) {
  if (run.blocks.length != run.planned.length) return false;
  for (var i = 0; i < run.blocks.length; i += 1) {
    if (run.blocks[i].key != run.planned[i] || !run.blocks[i].done) return false;
  }
  return true;
}

/// Разности относительно ПЕРВОГО блока. Неполная серия разностей не даёт вовсе — `null`.
Map<String, int>? seriesDiffs(SeriesRun run) {
  if (!seriesComplete(run)) return null;
  final base = run.blocks.first;
  return {for (final b in run.blocks.skip(1)) '${b.key}_minus_${base.key}': b.timeMs - base.timeMs};
}

/// ОДНА сессия на всю серию; блоки и уровень — в `details`. У неполной серии ключа `diffs` нет.
({String gameType, int score, double timeSeconds, int errors, String mode, Map<String, Object?> details})
    seriesSession(SeriesRun run) {
  final complete = seriesComplete(run);
  final diffs = seriesDiffs(run);
  final totalMs = run.blocks.fold<int>(0, (s, b) => s + b.timeMs);
  final errors = run.blocks.fold<int>(0, (s, b) => s + b.errors);
  final details = <String, Object?>{
    'level': run.level,
    'series_complete': complete,
    'blocks': [
      for (final b in run.blocks) {'key': b.key, 'time_ms': b.timeMs, 'errors': b.errors, 'done': b.done},
    ],
    'diffs': ?diffs,
  };
  final perBlock = totalMs / math.max(1, run.blocks.length);
  return (
    gameType: run.gameType,
    // JS Math.round: половина — вверх. Здесь значения положительные, и floor(x + 0,5) с ним совпадает.
    score: complete ? math.max(0, (60000 / math.max(1, perBlock) + 0.5).floor()) : 0,
    timeSeconds: totalMs / 1000,
    errors: errors,
    mode: 'series-l${run.level}',
    details: details,
  );
}

int bumpStreak(int previous, bool taken) => taken ? previous + 1 : 0;

/// Уровень серии — модель C: растёт, только когда ВЗЯТЫ ВСЕ блоки; ограничитель — слабое звено.
({bool raise, String weakest}) seriesLevelMove(Map<String, int> streaks, List<String> planned) {
  var weakest = planned.first;
  var min = double.infinity;
  for (final key in planned) {
    final s = streaks[key] ?? 0;
    if (s < min) {
      min = s.toDouble();
      weakest = key;
    }
  }
  return (raise: min >= stableRuns, weakest: weakest);
}

/// Старт — с МИНИМАЛЬНОГО уровня по блокам; прежние уровни возвращаются рядом для показа.
int seriesStartLevel(Map<String, int> levels, List<String> planned) {
  var min = 1 << 30;
  for (final key in planned) {
    final l = levels[key] ?? 1;
    if (l < min) min = l;
  }
  return min == 1 << 30 ? 1 : min;
}

// ───────────────────────────── progress.ts ─────────────────────────────

class SchulteSeriesProgress {
  const SchulteSeriesProgress(this.sizes, this.streaks);

  /// Достигнутый размер поля по каждому блоку.
  final Map<String, int> sizes;

  /// Сколько прогонов ПОДРЯД блок был взят.
  final Map<String, int> streaks;

  static Map<String, int> _zeroed(int v) => {for (final k in schulteSeriesPlan) k: v};
  static final SchulteSeriesProgress empty = SchulteSeriesProgress(_zeroed(seriesMinSize), _zeroed(0));

  /// Ключ хранилища — тот же, что у веба: прогресс серии общий для обеих половин.
  static String keyFor(String profile) => 'psygames_schulte_series_$profile';

  /// Разбор сохранённого прогресса. Мусор и пропуски — это минимум, а не падение.
  static SchulteSeriesProgress parse(String? raw) {
    if (raw == null || raw.isEmpty) return empty;
    try {
      final parsed = jsonDecode(raw);
      if (parsed is! Map) return empty;
      final sizes = {...empty.sizes};
      final streaks = {...empty.streaks};
      final ps = parsed['sizes'], pk = parsed['streaks'];
      for (final key in schulteSeriesPlan) {
        final s = ps is Map ? ps[key] : null;
        if (s is num && s.isFinite) sizes[key] = clampSeriesSize(s);
        final k = pk is Map ? pk[key] : null;
        if (k is num && k.isFinite && k >= 0) streaks[key] = k.floor();
      }
      return SchulteSeriesProgress(sizes, streaks);
    } catch (_) {
      return empty;
    }
  }

  String encode() => jsonEncode({'sizes': sizes, 'streaks': streaks});
}

/// Размеры блоков с поправкой на обычную лесенку: «поиск» человек уже растил в одиночной игре.
Map<String, int> seriesBlockLevels(SchulteSeriesProgress progress, int ladderSize) {
  final ladder = clampSeriesSize(ladderSize);
  return {
    'order': math.max(clampSeriesSize(progress.sizes['order']!), ladder),
    'alternate': clampSeriesSize(progress.sizes['alternate']!),
    'sum': clampSeriesSize(progress.sizes['sum']!),
  };
}

/// Вход в серию: общий уровень (минимум по блокам) + прежние уровни для показа.
({int level, Map<String, int> perBlock}) seriesEntry(SchulteSeriesProgress progress, int ladderSize) {
  final levels = seriesBlockLevels(progress, ladderSize);
  return (level: clampSeriesSize(seriesStartLevel(levels, schulteSeriesPlan)), perBlock: levels);
}

/// Блок взят: доигран до конца и ошибок не больше допуска. Времени здесь нет.
bool blockTaken(SeriesBlock block) => block.done && block.errors <= seriesBlockMaxErrors;

class SeriesOutcome {
  const SeriesOutcome({
    required this.progress,
    required this.raised,
    required this.weakest,
    required this.nextLevel,
    required this.runsLeft,
  });
  final SchulteSeriesProgress progress;

  /// Поле выросло — все блоки устойчивы.
  final bool raised;

  /// Блок, который держит уровень: у него самая короткая серия удач.
  final String weakest;

  /// Размер поля, с которого пойдёт следующая серия.
  final int nextLevel;

  /// Сколько чистых прогонов подряд ещё нужно слабейшему блоку.
  final int runsLeft;
}

/// Что стало с уровнем после прогона. Прерванная серия не двигает ничего.
SeriesOutcome afterSeriesRun(SchulteSeriesProgress progress, SeriesRun run, int ladderSize) {
  final level = clampSeriesSize(run.level);
  if (!seriesComplete(run)) {
    final move = seriesLevelMove(progress.streaks, schulteSeriesPlan);
    return SeriesOutcome(
      progress: progress,
      raised: false,
      weakest: move.weakest,
      nextLevel: seriesEntry(progress, ladderSize).level,
      runsLeft: math.max(0, stableRuns - (progress.streaks[move.weakest] ?? 0)),
    );
  }

  final streaks = {...progress.streaks};
  for (final block in run.blocks) {
    streaks[block.key] = bumpStreak(progress.streaks[block.key] ?? 0, blockTaken(block));
  }
  final move = seriesLevelMove(streaks, schulteSeriesPlan);
  if (!move.raise) {
    return SeriesOutcome(
      progress: SchulteSeriesProgress(progress.sizes, streaks),
      raised: false,
      weakest: move.weakest,
      nextLevel: level,
      runsLeft: math.max(0, stableRuns - (streaks[move.weakest] ?? 0)),
    );
  }

  final grown = clampSeriesSize(level + 1);
  final raised = grown > level;
  final sizes = raised
      ? {
          'order': math.max(progress.sizes['order']!, grown),
          'alternate': math.max(progress.sizes['alternate']!, grown),
          'sum': math.max(progress.sizes['sum']!, grown),
        }
      : progress.sizes;
  // Новый размер — новый отсчёт устойчивости: прошлые прогоны были на другом поле.
  return SeriesOutcome(
    progress: SchulteSeriesProgress(sizes, raised ? {for (final k in schulteSeriesPlan) k: 0} : streaks),
    raised: raised,
    weakest: move.weakest,
    nextLevel: grown,
    runsLeft: raised ? stableRuns : 0,
  );
}
