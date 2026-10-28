import 'package:flutter/material.dart';

/// 🎨 СМЫСЛОВЫЕ ЦВЕТА ИГР — ОДИН ИСТОЧНИК НА ВСЁ ПРИЛОЖЕНИЕ (дизайн «Аврора», план 28.10.2026, задача ed1cc06d).
///
/// Игра не пишет `Color(0xFF22C55E)` для «верно» — она берёт `GameColors.of(context).correct`. Тогда смена
/// дизайна (Classic → «Аврора») перекрашивает все игры сразу и одинаково, а не каждый раздел по-своему.
/// Нужна новая роль — задача каркасу (psygames-shell-claude-mac), не литерал в игре: литералы держит
/// храповик `test/design/hardcoded_colors_ratchet_test.dart`. Цвета стимулов (Струп, фишки, фигуры SET) — не
/// роли: это правила игры, они остаются в игре и стоят в белом списке храповика.
///
/// РОЛИ (заявки разделов 28.10: опись `aurora_v1/inventory/sudoku.md` §«Заявка», `search-counting.md` §4).
///   · исход: `correct`, `wrong`, `warning`; подложка и цифра ошибки — `wrongFill`, `wrongInk`;
///     подложка других ролей — сама роль с прозрачностью 0.2 (правило `flutter/DESIGN_SYSTEM.md`, своих
///     «светлых» оттенков не заводить);
///   · выбор: `selected`, `highlight`, `onStrong` (текст и обводка на насыщенной заливке роли или стимула);
///   · доска: `cell`, `cellAlt` (заданная, недоступная, вход), `boardLine`, `boardLineStrong` (граница блока,
///     рамка поля), `onCell` (заданная цифра и основной текст клетки), `inkPlaced` (ход игрока), `notesInk`;
///   · поле стимулов: `stimulusField` — одинаково тёмная подложка в обеих темах, чтобы цвета стимулов читались
///     одинаково;
///   · прочее: `hint` (подсказка, «Показать решение»), `link` (связь клеток: вход фрактала, портал «Бездны»),
///     `reward` (звёзды ступени), `muted` (недоступное, обводки знаков).
///
/// CLASSIC. Цвета исхода и выбора — одни на всё приложение: самые частые у игр (`#22C55E` — 67 мест,
/// `#EF4444` — 39) и лаванда бренда у выбора («Судоку» — главный её пользователь). У 9 игр со своими оттенками
/// (`#F43F5E`, `#DC2626`, `#16A34A`…) оттенок сдвинется — это намеренно: одни «верно» и «ошибка» на всё
/// приложение и есть цель «Авроры» (в журнале расхождений Classic — «намеренно, роль»). Доска в Classic
/// берётся из `ColorScheme`, как сегодня, — у полей судоку не сдвигается ни пиксель.
///
/// «АВРОРА». Токены `PROJECT_REF.md` «Точное оформление шаблона Аврора» (accent `#FFA34C`, success, danger,
/// info, surface…). Это начальные значения: контраст мерится на реальных компонентах при приёмке (≥ 4,5:1 для
/// цифр на клетке), правка — здесь, в одном месте. Регистрирует их тема шаблона «Аврора»
/// (`ThemeData.extensions`); тема без расширения — Classic, поэтому поле игры, ещё не перенесённое на
/// «Аврору» (обёртка classic-темы), остаётся прежним.
@immutable
class GameColors extends ThemeExtension<GameColors> {
  const GameColors({
    required this.correct,
    required this.wrong,
    required this.warning,
    required this.wrongFill,
    required this.wrongInk,
    required this.selected,
    required this.highlight,
    required this.onStrong,
    required this.cell,
    required this.cellAlt,
    required this.boardLine,
    required this.boardLineStrong,
    required this.onCell,
    required this.inkPlaced,
    required this.notesInk,
    required this.stimulusField,
    required this.hint,
    required this.link,
    required this.reward,
    required this.muted,
  });

  /// Верный ответ, попадание, решённая клетка.
  final Color correct;

  /// Ошибка, промах, неверная клетка (рамка, значок).
  final Color wrong;

  /// Почти промах, время на исходе, предупреждение.
  final Color warning;

  /// Фон неверной клетки.
  final Color wrongFill;

  /// Цифра или текст «неверно» на `wrongFill`.
  final Color wrongInk;

  /// Выбранный элемент, курсор, активная клетка.
  final Color selected;

  /// Совпадения, найденное, цель, линия выбранной клетки.
  final Color highlight;

  /// Текст и обводка на насыщенной заливке (`selected`, `correct`, стимул).
  final Color onStrong;

  /// Фон клетки и плитки поля.
  final Color cell;

  /// Заданная, недоступная или особая клетка (вход фрактала), глубина стопки.
  final Color cellAlt;

  /// Тонкая линия между клетками.
  final Color boardLine;

  /// Граница блока и рамка поля.
  final Color boardLineStrong;

  /// Заданная цифра и основной текст на клетке.
  final Color onCell;

  /// Цифра и отметка игрока.
  final Color inkPlaced;

  /// Заметки карандашом.
  final Color notesInk;

  /// Подложка под цветные стимулы — одинаковая в обеих темах.
  final Color stimulusField;

  /// Кнопка «Подсказка», «Показать решение».
  final Color hint;

  /// Связь клеток: вход фрактала, портал «Бездны».
  final Color link;

  /// Награда: звёзды пройденной ступени.
  final Color reward;

  /// Приглушённое: недоступное, обводки знаков, точки призрака.
  final Color muted;

  /// Classic: роли исхода и выбора — постоянные, доска — из `ColorScheme` (как игры рисуют её сегодня).
  static GameColors classicFor(ColorScheme s) => GameColors(
    correct: const Color(0xFF22C55E),
    wrong: const Color(0xFFEF4444),
    warning: const Color(0xFFF59E0B),
    wrongFill: const Color(0xFFFECACA),
    wrongInk: const Color(0xFFB91C1C),
    selected: const Color(0xFF5B4FD1),
    highlight: const Color(0xFF7F7FD5),
    onStrong: const Color(0xFFFFFFFF),
    cell: s.surface,
    cellAlt: s.surfaceContainerHighest,
    boardLine: s.outlineVariant,
    boardLineStrong: s.onSurface,
    onCell: s.onSurface,
    inkPlaced: s.primary,
    notesInk: s.onSurfaceVariant,
    stimulusField: const Color(0xFF1F2937),
    hint: const Color(0xFFB45309),
    link: const Color(0xFFA89FDB),
    reward: const Color(0xFFEF9F27),
    muted: const Color(0xFF94A3B8),
  );

  /// «Аврора», тёмная тема.
  static const auroraDark = GameColors(
    correct: Color(0xFF53D4AF),
    wrong: Color(0xFFFF7986),
    warning: Color(0xFFFFD27A),
    wrongFill: Color(0xFF4A2433),
    wrongInk: Color(0xFFFF7986),
    selected: Color(0xFF70CFEA),
    highlight: Color(0xFFFFA34C),
    onStrong: Color(0xFF152A38),
    cell: Color(0xFF102734),
    cellAlt: Color(0xFF173442),
    boardLine: Color(0xFF345564),
    boardLineStrong: Color(0xFFB7CAD6),
    onCell: Color(0xFFF4F7FA),
    inkPlaced: Color(0xFF70CFEA),
    notesInk: Color(0xFFB7CAD6),
    stimulusField: Color(0xFF071823),
    hint: Color(0xFFFFA34C),
    link: Color(0xFF70CFEA),
    reward: Color(0xFFFFA34C),
    muted: Color(0xFF526577),
  );

  /// «Аврора», светлая тема. Поле стимулов — то же тёмное, что в тёмной теме (лист 23). Акцент `#FFA34C` на белой
  /// клетке даёт 1,98:1 — кольцо найденного не видно; поэтому подсветка и награда здесь — тот же тон темнее,
  /// `#B85C00` (4,6:1 на белом, белая цифра на нём — тоже 4,6:1).
  static const auroraLight = GameColors(
    correct: Color(0xFF087C63),
    wrong: Color(0xFFB82742),
    warning: Color(0xFF8A6D00),
    wrongFill: Color(0xFFFBE3E7),
    wrongInk: Color(0xFFB82742),
    selected: Color(0xFF096B85),
    highlight: Color(0xFFB85C00),
    onStrong: Color(0xFFFFFFFF),
    cell: Color(0xFFFFFFFF),
    cellAlt: Color(0xFFEFF5FA),
    boardLine: Color(0xFFCEDDE8),
    boardLineStrong: Color(0xFF526577),
    onCell: Color(0xFF152A38),
    inkPlaced: Color(0xFF096B85),
    notesInk: Color(0xFF526577),
    stimulusField: Color(0xFF071823),
    hint: Color(0xFF9A5B00),
    link: Color(0xFF096B85),
    reward: Color(0xFFB85C00),
    muted: Color(0xFF8A9BAA),
  );

  /// Набор «Авроры» под яркость темы — для регистрации в `ThemeData.extensions` шаблона.
  static GameColors aurora(Brightness b) => b == Brightness.dark ? auroraDark : auroraLight;

  static GameColors of(BuildContext context) {
    final t = Theme.of(context);
    return t.extension<GameColors>() ?? classicFor(t.colorScheme);
  }

  @override
  GameColors copyWith({
    Color? correct,
    Color? wrong,
    Color? warning,
    Color? wrongFill,
    Color? wrongInk,
    Color? selected,
    Color? highlight,
    Color? onStrong,
    Color? cell,
    Color? cellAlt,
    Color? boardLine,
    Color? boardLineStrong,
    Color? onCell,
    Color? inkPlaced,
    Color? notesInk,
    Color? stimulusField,
    Color? hint,
    Color? link,
    Color? reward,
    Color? muted,
  }) => GameColors(
    correct: correct ?? this.correct,
    wrong: wrong ?? this.wrong,
    warning: warning ?? this.warning,
    wrongFill: wrongFill ?? this.wrongFill,
    wrongInk: wrongInk ?? this.wrongInk,
    selected: selected ?? this.selected,
    highlight: highlight ?? this.highlight,
    onStrong: onStrong ?? this.onStrong,
    cell: cell ?? this.cell,
    cellAlt: cellAlt ?? this.cellAlt,
    boardLine: boardLine ?? this.boardLine,
    boardLineStrong: boardLineStrong ?? this.boardLineStrong,
    onCell: onCell ?? this.onCell,
    inkPlaced: inkPlaced ?? this.inkPlaced,
    notesInk: notesInk ?? this.notesInk,
    stimulusField: stimulusField ?? this.stimulusField,
    hint: hint ?? this.hint,
    link: link ?? this.link,
    reward: reward ?? this.reward,
    muted: muted ?? this.muted,
  );

  /// Все роли по имени — для проб (контраст, полнота) и журнала расхождений.
  Map<String, Color> get roles => {
    'correct': correct,
    'wrong': wrong,
    'warning': warning,
    'wrongFill': wrongFill,
    'wrongInk': wrongInk,
    'selected': selected,
    'highlight': highlight,
    'onStrong': onStrong,
    'cell': cell,
    'cellAlt': cellAlt,
    'boardLine': boardLine,
    'boardLineStrong': boardLineStrong,
    'onCell': onCell,
    'inkPlaced': inkPlaced,
    'notesInk': notesInk,
    'stimulusField': stimulusField,
    'hint': hint,
    'link': link,
    'reward': reward,
    'muted': muted,
  };

  @override
  GameColors lerp(ThemeExtension<GameColors>? other, double t) {
    if (other is! GameColors) return this;
    Color l(Color a, Color b) => Color.lerp(a, b, t)!;
    return GameColors(
      correct: l(correct, other.correct),
      wrong: l(wrong, other.wrong),
      warning: l(warning, other.warning),
      wrongFill: l(wrongFill, other.wrongFill),
      wrongInk: l(wrongInk, other.wrongInk),
      selected: l(selected, other.selected),
      highlight: l(highlight, other.highlight),
      onStrong: l(onStrong, other.onStrong),
      cell: l(cell, other.cell),
      cellAlt: l(cellAlt, other.cellAlt),
      boardLine: l(boardLine, other.boardLine),
      boardLineStrong: l(boardLineStrong, other.boardLineStrong),
      onCell: l(onCell, other.onCell),
      inkPlaced: l(inkPlaced, other.inkPlaced),
      notesInk: l(notesInk, other.notesInk),
      stimulusField: l(stimulusField, other.stimulusField),
      hint: l(hint, other.hint),
      link: l(link, other.link),
      reward: l(reward, other.reward),
      muted: l(muted, other.muted),
    );
  }
}
