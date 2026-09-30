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
    Random? rnd,
    int Function()? nowMs,
  })  : params = ProofLevel.of(level),
        _rnd = rnd ?? Random(),
        _now = nowMs ?? (() => DateTime.now().millisecondsSinceEpoch);

  final int level;

  /// Какая письменность. Игнорируется, если поле цифровое.
  final String script;
  final bool digits;
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
    finished = false;
    _startedAt = _now();
  }

  double get elapsedSec => (_now() - _startedAt) / 1000.0;
  bool get timeUp => elapsedSec >= params.timeLimitSec;

  /// Нажатие по клетке.
  ///
  /// ⚠️ Повторное нажатие по УЖЕ найденной клетке не считается ни попаданием,
  /// ни ошибкой: человек просто попал по тому же знаку дважды.
  ProofTap tap(int index) {
    if (finished || found.contains(index)) return ProofTap.ignored;
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

  /// Уровень взят: найдено не меньше доли уровня.
  bool get passed {
    final total = grid.targetIndices.length;
    if (total == 0) return false;
    return found.length >= (total * params.minFoundPct).ceil();
  }
}
