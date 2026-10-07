/// «Корректура» — восемнадцатая, последняя игра раздела «Конфликт внимания»
/// на Flutter. Корректурная проба Бурдона: в поле знаков найти все вхождения
/// двух заданных.
///
/// Правила перенесены из `frontend/app/games/proofreading.tsx` (VER 7); эталон
/// выгружен прогоном живого TS в `test/fixtures/proofreading-reference.json`.
///
/// ⚠️ ПЕРЕНЕСЕНО ЗАДАНИЕ «БУКВЫ/ЦИФРЫ», А НЕ ФИЛВОРДЫ. У экрана ДВА задания под
/// одним game_type (`task_mode`: 'letters' и 'fillwords'), и филворды — другая
/// проба: там свой генератор головоломок, свой словарь и своя лестница
/// (`fillwordsLevel`). Сравнивать их между собой нельзя, поэтому и переносятся
/// они порознь.
///
/// 🔴 МЕРА ПРОХОДА — ДОЛЯ, А НЕ СЧЁТ. Проба Бурдона меряется пропусками, но
/// брать голое число пропусков нельзя: ось сложности здесь — размер поля
/// (8×8 → 16×12), значит целей на партию становится больше, и число пропусков
/// растёт САМО, без падения внимания. Это тот же дефект «счёт вместо доли», что
/// доля конфликтных проб у соседей. Доля от этого свободна.
library;

import 'dart:convert';
import 'dart:math';

import 'package:flutter/services.dart';

import '../../shell/preset_cap.dart';

/// Письменности и цифровой набор — ИЗ АССЕТА, а не константой в коде.
///
/// 🔴 ПОЧЕМУ АССЕТОМ. Это МАТЕРИАЛ пробы: шесть алфавитов, один из них
/// кириллический. Зашить их в Dart значило бы завести второй источник правды
/// (первый — `frontend/src/constants/scripts.ts`) и добавить русские литералы в
/// `lib/`, против которых стоит храповик `ui_text_debt_does_not_grow`. Файл
/// `assets/l10n/proofreading-scripts.json` выгружен прогоном живого TS — тем же
/// приёмом, что слова «эмоционального Струпа».
///
/// ⚠️ Порядок символов канонический: у соседнего экрана (Шульте) то же поле
/// служит заучиванием алфавита, и перетасовать его нельзя.
/// ⚠️ Правишь `scripts.ts` — перевыгружаешь JSON.
class ProofScripts {
  ProofScripts._(this.byId, this.digits);

  final Map<String, String> byId;
  final String digits;

  static ProofScripts? _cache;

  /// Набор загружен? Пробам модели ассет не нужен: они задают алфавит сами.
  static bool get loaded => _cache != null;

  static ProofScripts get current =>
      _cache ?? ProofScripts._(const {}, '');

  static Future<ProofScripts> load({AssetBundle? bundle}) async {
    if (_cache != null) return _cache!;
    final b = bundle ?? rootBundle;
    var scripts = <String, String>{};
    var digits = '';
    try {
      final raw = await b.loadString('assets/l10n/proofreading-scripts.json');
      final all = jsonDecode(raw) as Map<String, dynamic>;
      scripts = ((all['scripts'] as Map?) ?? const {}).map((k, v) => MapEntry('$k', '$v'));
      digits = '${all['digits'] ?? ''}';
    } catch (_) {
      // Ассета нет — поле соберётся на латинице: игра не должна падать из-за
      // отсутствующего файла, а латиница есть в любом наборе.
      scripts = const {'latin': 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'};
      digits = '0123456789';
    }
    _cache = ProofScripts._(scripts, digits);
    return _cache!;
  }

  /// Для проб: подставить набор без обращения к ассету.
  static void useForTest(Map<String, String> scripts, String digits) {
    _cache = ProofScripts._(scripts, digits);
  }
}

const int proofMaxLevel = 15;

/// Цифровое поле на выборе письменности — как у веба (`ScriptId | 'digits'`).
const String proofDigits = 'digits';

/// Письменность партии — как у веба (`proofreading.tsx`, состояние `mode`).
///
/// 🔴 ДО 07.10.2026 НАТИВ ВСЕМ ДАВАЛ КИРИЛЛИЦУ: в конструкторе стояло `'cyrillic'`, и
/// английский игрок видел «Find: Л  К» (замер на маршруте hybrid_app). Веб берёт письменность
/// из адреса (`mode`), а без него — по языку: русский — кириллица, остальные — латиница.
/// ⚠️ Адрес — не проверка: 144 шага зарядки в `defaultPlaylists.json` шлют `mode: "11x8"`
/// (размер, а не письменность). Неизвестное имя откатывается к языку — как у веба.
String proofScriptFor({required String param, required String locale, required Iterable<String> known}) {
  if (param == proofDigits || known.contains(param)) return param;
  return locale == 'ru' ? 'cyrillic' : 'latin';
}

/// Уровень: размер поля, время и порог доли найденных.
class ProofLevel {
  const ProofLevel({
    required this.rows,
    required this.cols,
    required this.timeLimitSec,
    required this.minFoundPct,
  });

  final int rows;
  final int cols;

  /// Лимит времени: считается от ЧИСЛА КЛЕТОК и темпа сканирования, а не задан
  /// числом. Темп растёт с уровнем: 1,0 → 0,45 секунды на клетку.
  final int timeLimitSec;

  /// Какую долю целей надо найти, чтобы уровень был взят: 0,8 → 0,9 → 1,0.
  final double minFoundPct;

  int get cells => rows * cols;

  /// УСЛОВИЕ, ПРИ КОТОРОМ СНЯТА МЕРА, — В САМУ ПАРТИЮ.
  Map<String, Object?> get condition =>
      {'rows': rows, 'cols': cols, 'timeLimitSec': timeLimitSec, 'minFoundPct': minFoundPct};

  static ProofLevel of(int level) {
    // Поле растёт тремя ступенями: 8×8 → 12×10 → 16×12.
    final rows = level <= 5 ? 7 + level : (level <= 10 ? 4 + level : min(16, 1 + level));
    final cols = level <= 5 ? 8 : (level <= 10 ? 10 : 12);
    final perCellSec = max(0.45, 1.0 - (level - 1) * 0.04);
    return ProofLevel(
      rows: rows,
      cols: cols,
      timeLimitSec: (rows * cols * perCellSec).round(),
      minFoundPct: level <= 5 ? 0.8 : (level <= 10 ? 0.9 : 1.0),
    );
  }

  /// Шаг зарядки — как у веба (`startGame`, ветка `isPreset`): размер из шага, но не выше
  /// освоенного больше чем на ступень (`capPresetByLevel`), и БЕЗ ЛИМИТА ВРЕМЕНИ — сценарий
  /// зарядки рассчитан по времени всей связки. Поле разбирается целиком: порога нет.
  /// Без размера в шаге веб берёт 14×12 (`num('rows', 14)`, `num('cols', 12)`).
  static ProofLevel preset(int level, {required int wantRows, required int wantCols}) {
    final at = ProofLevel.of(level);
    return ProofLevel(
      rows: capPresetByLevel(want: wantRows, atLevel: at.rows, atTop: at.rows >= 16),
      cols: capPresetByLevel(want: wantCols, atLevel: at.cols, atTop: at.cols >= 12),
      timeLimitSec: 0,
      minFoundPct: 1,
    );
  }
}

/// Поле партии: знаки, две цели и места целей.
class ProofGrid {
  const ProofGrid({
    required this.letters,
    required this.targets,
    required this.targetIndices,
  });

  final List<String> letters;

  /// Две РАЗНЫЕ цели.
  final List<String> targets;

  /// Где цели стоят.
  final Set<int> targetIndices;

  int get total => targetIndices.length;
}

/// Минимум целей на поле.
///
/// 🔴 ГАРАНТИЯ, А НЕ УДАЧА. На больших алфавитах (иероглифы, кана — по 46
/// знаков) цели выпадали 0–2 раза: критерий «найти ≥N % целей» терял смысл, а
/// при нуле раунд не завершался вовсе. Досеиваем цели в случайные не-целевые
/// клетки, пока их не станет достаточно.
int minTargetsFor(int totalCells) => max(4, (totalCells / 16).round());

/// Сборка поля.
ProofGrid buildGrid({
  required int rows,
  required int cols,
  required String alphabet,
  required double Function() rnd,
}) {
  final totalCells = rows * cols;
  final letters = List.generate(totalCells, (_) => alphabet[(rnd() * alphabet.length).floor()]);

  // Две цели, обязательно разные: одна и та же цель дважды означала бы одну.
  final targets = <String>[alphabet[(rnd() * alphabet.length).floor()]];
  var second = alphabet[(rnd() * alphabet.length).floor()];
  while (second == targets[0]) {
    second = alphabet[(rnd() * alphabet.length).floor()];
  }
  targets.add(second);

  final minTargets = minTargetsFor(totalCells);
  var present = letters.where(targets.contains).length;
  var guard = 0;
  while (present < minTargets && guard++ < totalCells * 20) {
    final idx = (rnd() * totalCells).floor();
    if (!targets.contains(letters[idx])) {
      letters[idx] = targets[(rnd() * 2).floor()];
      present++;
    }
  }

  final indices = <int>{};
  for (var i = 0; i < letters.length; i++) {
    if (targets.contains(letters[i])) indices.add(i);
  }
  return ProofGrid(letters: letters, targets: targets, targetIndices: indices);
}

enum ProofTap { hit, wrong, ignored }

/// Партия.
class ProofGame {
  ProofGame({
    required this.level,
    this.script = 'cyrillic',
    this.digits = false,
    this.preset = false,
    ProofLevel? params,
    Random? rnd,
    int Function()? nowMs,
  })  : params = params ?? ProofLevel.of(level),
        _rnd = rnd ?? Random(),
        _now = nowMs ?? (() => DateTime.now().millisecondsSinceEpoch);

  final int level;

  /// Какая письменность. Игнорируется, если поле цифровое.
  final String script;
  final bool digits;

  /// Шаг зарядки: уровень не засчитывается, поле — [ProofLevel.preset].
  final bool preset;
  final ProofLevel params;
  final Random _rnd;
  final int Function() _now;

  /// Поле партии.
  ///
  /// ⚠️ НЕ `late`: полоса показателей каркаса рисуется ДО начала партии и
  /// спрашивает число целей. С `late` экран падал на самом первом кадре —
  /// LateInitializationError вместо экрана готовности.
  ProofGrid grid = const ProofGrid(letters: [], targets: [], targetIndices: {});
  final Set<int> found = {};
  int errors = 0;
  bool finished = false;
  int _startedAt = 0;

  String get alphabet {
    final s = ProofScripts.current;
    if (digits) return s.digits;
    return s.byId[script] ?? s.byId['latin'] ?? '';
  }

  double _next() => _rnd.nextDouble();

  void begin() {
    grid = buildGrid(rows: params.rows, cols: params.cols, alphabet: alphabet, rnd: _next);
    found.clear();
    errors = 0;
    hints = 0;
    hintCell = null;
    finished = false;
    _startedAt = _now();
  }

  double get elapsedSec => (_now() - _startedAt) / 1000.0;

  /// Лимит 0 — без лимита (шаг зарядки): время не кончается.
  bool get timeUp => params.timeLimitSec > 0 && elapsedSec >= params.timeLimitSec;

  /// Подсказок на партию — как у веба (`ПОДСКАЗОК_В_КОРРЕКТУРЕ`).
  static const int maxHints = 3;

  /// Взято подсказок. Цена у веба — звезда, как промах; здесь — поле партии `hints`.
  int hints = 0;

  /// Клетка, которую показала последняя подсказка; гаснет при нажатии на неё.
  int? hintCell;

  /// Подсказка (`взятьПодсказкуБукв`): ОДНА ненайденная цель — ПЕРВАЯ по порядку поля, а не
  /// случайная: человек должен понимать, что ему показали. Нечего показать — `null`.
  int? takeHint() {
    if (finished || hints >= maxHints) return null;
    final left = [for (final i in grid.targetIndices.toList()..sort()) if (!found.contains(i)) i];
    if (left.isEmpty) return null;
    hints += 1;
    hintCell = left.first;
    return hintCell;
  }

  /// Нажатие по клетке.
  ///
  /// ⚠️ Повторное нажатие по УЖЕ найденной клетке не считается ни попаданием,
  /// ни ошибкой: человек просто попал по тому же знаку дважды.
  ProofTap tap(int index) {
    if (finished || found.contains(index)) return ProofTap.ignored;
    // Подсказанную клетку гасим при любом нажатии на неё: показ своё дело сделал.
    if (hintCell == index) hintCell = null;
    if (grid.targetIndices.contains(index)) {
      found.add(index);
      // Все цели найдены — партия кончается досрочно.
      if (found.length == grid.targetIndices.length) finished = true;
      return ProofTap.hit;
    }
    errors += 1;
    return ProofTap.wrong;
  }

  /// Время вышло.
  void stopByTime() => finished = true;

  int get missed => grid.targetIndices.length - found.length;

  /// Доля пропусков — мера прохода раздела.
  int get omissionPct =>
      grid.targetIndices.isEmpty ? 0 : (missed / grid.targetIndices.length * 100).round();

  int get accuracyPct =>
      grid.targetIndices.isEmpty ? 100 : (found.length / grid.targetIndices.length * 100).round();

  /// Уровень взят: найдено не меньше доли уровня. Шаг зарядки уровня не берёт (как веб).
  bool get passed {
    final total = grid.targetIndices.length;
    if (preset || total == 0) return false;
    return found.length >= (total * params.minFoundPct).ceil();
  }

  /// Время партии для записи: с лимитом — не больше лимита (как веб `finalTime`).
  double get finalSec => params.timeLimitSec > 0 ? min(elapsedSec, params.timeLimitSec.toDouble()) : elapsedSec;
}

/// Поля партии — как веб (`saveSession` в `proofreading.tsx`). До 07.10.2026 натив уходил
/// без `details`: в статистике не было ни доли пропусков, ни задания, ни размера поля.
///
/// ⚠️ Условие уровня (`levelCondition`) — от УРОВНЯ, а `rows`/`cols`/`time_limit_sec` —
/// фактические: на шаге зарядки поле и лимит свои. Порядок ключей как у веба: фактические
/// идут позже и перекрывают условие.
Map<String, Object?> proofSessionDetails(ProofGame g) {
  final total = g.grid.targetIndices.length;
  final found = g.found.length;
  final missed = max(0, total - found);
  return {
    'level': g.level,
    ...ProofLevel.of(g.level).condition,
    'hits': found,
    'errors': g.errors,
    'missed': missed,
    'n_targets': total,
    // Мера прохода раздела — доля, а не счёт (см. шапку файла).
    'proof_omission_pct': total > 0 ? (missed / total * 100).round() : 0,
    'accuracy': total > 0 ? (found / total * 100).round() : 100,
    'rows': g.params.rows,
    'cols': g.params.cols,
    'time_limit_sec': g.params.timeLimitSec,
    // Два задания под одним game_type — сравнивать их нельзя.
    'task_mode': 'letters',
    'hints': g.hints,
    'letters_left': 0,
  };
}
