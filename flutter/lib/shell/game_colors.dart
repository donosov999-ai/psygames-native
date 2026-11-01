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
  /// Судоку в «Авроре» (пилот Codex 31.10): поле прозрачное на фоне рамки — свои клетки и золотые
  /// толстые линии; роли других игр не меняет.
  static GameColors sudokuGlass(GameColors base, Brightness brightness) => brightness == Brightness.dark
      ? base.copyWith(
          cell: const Color(0xFF061E32),
          cellAlt: const Color(0xFF0A2C42),
          boardLine: const Color(0xFF315E73),
          boardLineStrong: const Color(0xFFFFD77D),
        )
      : base.copyWith(
          cell: const Color(0xFFFFFAF1),
          cellAlt: const Color(0xFFF3E9D7),
          boardLine: const Color(0xFFC0B6A5),
          boardLineStrong: const Color(0xFF9A6200),
        );

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

/*
 * 🔴 ПАЛИТРА ИГРОВОЙ РАМКИ — СНЯТА С РЕФА CODEX 30.10 ПО ПИКСЕЛЯМ, А НЕ ПОДОГНАНА ПОД ТОКЕНЫ.
 *
 * Денис 30.10: «ты вообще собрал в другой палитре и другой вид по форме и виду и геометрии… да
 * похуй на аврору, повтори сначала». Первая версия стандарта брала цвета «Авроры» (бирюзовое
 * стекло, тусклое золото) — вышла другая картинка. Здесь — замер рефов
 * `pause-grouped-levels-v4`, `sudoku-even-toolbar-v4`, `header-help-dropdown-v1`:
 * тёмная — фон #0A2031, стекло #0F2D44, кромка — тонкая яркая #F4DD40…#FBF8A1, «Продолжить»
 * #FBE45B→#FDBB34; светлая — стекло #FDFBE8, кромка #FCDA79…#FEBB3B, «Продолжить» #FDEF76→#FEC542.
 * Шапка, тулбар, кнопки игры и пауза берут цвета только отсюда (`game_chrome.dart`).
 */
@immutable
class ChromePalette {
  const ChromePalette({
    required this.background,
    required this.glow,
    required this.glass,
    required this.glassTop,
    required this.gold,
    required this.goldSoft,
    required this.primaryTop,
    required this.primaryBottom,
    required this.onPrimary,
    required this.text,
    required this.textSecondary,
    required this.ringFill,
    required this.ringFillTop,
    required this.petRing,
  });

  final Color background;
  final Color glow;
  final Color glass;
  final Color glassTop;
  final Color gold;
  final Color goldSoft;
  final Color primaryTop;
  final Color primaryBottom;
  final Color onPrimary;
  final Color text;
  final Color textSecondary;
  final Color ringFill;
  final Color ringFillTop;
  final Color petRing;

  static const dark = ChromePalette(
    background: Color(0xFF0A2031),
    glow: Color(0xFF1C5E9E),
    glass: Color(0xFF0F2D44),
    glassTop: Color(0xFF17405F),
    gold: Color(0xFFFFD77D),
    goldSoft: Color(0xFFFBF8A1),
    primaryTop: Color(0xFFFBE45B),
    primaryBottom: Color(0xFFFDBB34),
    onPrimary: Color(0xFF1A1200),
    text: Color(0xFFF5F5F7),
    textSecondary: Color(0xFFA9BCD0),
    ringFill: Color(0xFF0B2740),
    ringFillTop: Color(0xFF1F4E74),
    petRing: Color(0xFFA06BFF),
  );

  static const light = ChromePalette(
    background: Color(0xFFFFF9EE),
    glow: Color(0xFFFDE5A8),
    glass: Color(0xFFFDFBE8),
    glassTop: Color(0xFFFFFFFF),
    gold: Color(0xFFFFB620),
    goldSoft: Color(0xFFFCDA79),
    primaryTop: Color(0xFFFDEF76),
    primaryBottom: Color(0xFFFEC542),
    onPrimary: Color(0xFF2A1C00),
    text: Color(0xFF151A2D),
    textSecondary: Color(0xFF5C657A),
    ringFill: Color(0xFFFFFBF0),
    ringFillTop: Color(0xFFFFFFFF),
    petRing: Color(0xFFA06BFF),
  );

  static ChromePalette of(bool dark) => dark ? ChromePalette.dark : ChromePalette.light;
}


/*
 * 🔴 ЦВЕТА ПИЛОТА CODEX «СТЕКЛО И КАМНИ» (31.10) — выбор Дениса: «красиво, чего тебе не удавалось».
 * Источник: `~/Documents/TeamOps/psygames-design/codex-game-chrome-handoff-20261031/source/flutter/
 * lib/shell/aurora_glass.dart`. Литералы — здесь, в источнике цветов, а не в `aurora_glass.dart`:
 * храповик цветов не даёт заводить их в файлах рамки.
 */
class ChromePilot {
  ChromePilot._();

  /// Already approved jewel/tab/effect shades, centralized unchanged (01.11).
  /// Decorative roles only: never a stimulus, score or game-result signal.
  static const jewelStar = Color(0xFFFFC85B);
  static const selectedSkin = Color(0xFFFFCF78);
  static const controlGold = Color(0xFFFFBE58);
  static const onGoldAction = Color(0xFF201300);
  static const headerGlint = Color(0x22FFF3C4);
  static const materializationGold = Color(0xFFFFD77E);
  static const timeMorning = Color(0xFFE8A1BA);
  static const timeDay = Color(0xFFFFC85B);
  static const timeEvening = Color(0xFFD44B72);
  static const timeNight = Color(0xFFAA7DEA);
  static const programSeamDark = Color(0xFF082450);
  static const programSeamLight = Color(0xFFFFF5E3);
  static const materializationGlowDark = Color(0xFF75DFFF);
  static const materializationGlowLight = Color(0xFF3075B5);

  /// Подложка шапки и нижнего ряда (поверх картинки `*_chrome_glass`).
  static const chromeDark = [Color(0xF04A7482), Color(0xF01A4157), Color(0xF0082135), Color(0xF0193C4C)];
  static const chromeLight = [Color(0xFFFDF9F0), Color(0xFFF4E9D7), Color(0xFFE9DCC8), Color(0xFFFBF5E9)];

  /// Панели паузы и меню.
  static const panelDark = [Color(0xEB5B8493), Color(0xF01B455D), Color(0xF0071B2D), Color(0xF00A2C46)];
  static const panelLight = [Color(0xFFFFFFF9), Color(0xFFFAF3E7), Color(0xFFE9DDC9), Color(0xFFFFF9EB)];

  /// Фон под картинкой боке (тёмная) и кремовый (светлая).
  static const backdropDark = [Color(0xFF164A6B), Color(0xFF061B2C), Color(0xFF03121E)];
  static const backdropLight = [Color(0xFFFFFCF4), Color(0xFFF5ECD9), Color(0xFFE9DAC0)];

  /// Круглая кнопка в светлой теме (в тёмной — картинка `dark_round_button`).
  static const ringLight = [Color(0xFFFFFFFF), Color(0xFFF8EFDF), Color(0xFFDFCFB8)];

  /// Заливка стекла одним цветом.
  static const fillDark = Color(0xE8092339);
  static const fillLight = Color(0xF5FFF9EB);

  /// Тень подложки рамки.
  static const shadow = Color(0x60000000);
}
