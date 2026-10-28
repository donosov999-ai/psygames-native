import 'package:flutter/material.dart';

/// 🎨 СМЫСЛОВЫЕ ЦВЕТА ИГР — ОДИН ИСТОЧНИК НА ВСЁ ПРИЛОЖЕНИЕ (дизайн «Аврора», план 28.10.2026).
///
/// Игра не пишет `Color(0xFF22C55E)` для «верно» — она берёт `GameColors.of(context).correct`. Тогда смена
/// дизайна (Classic → «Аврора») перекрашивает все игры сразу и одинаково, а не каждый раздел по-своему.
/// Новая роль нужна — задача каркасу (psygames-shell-claude-mac), не литерал в игре: литералы держит
/// храповик `test/design/hardcoded_colors_ratchet_test.dart`.
///
/// `classic` — ровно те цвета, что игры рисуют сегодня (замер 28.10.2026 по `lib/games`, main 2ed016951):
/// «верно» `#22C55E` — 67 мест, «ошибка» `#EF4444` — 39, «внимание» `#F59E0B` — 19, «выбрано» `#3B82F6` — 9,
/// «подсветка» `#FBBF24` — 12, приглушённый `#94A3B8` — 5. Перевод игры на роли не меняет ни пикселя.
/// Цвета стимулов (Струп, цвета фишек) — не роли: это данные игры, они остаются в игре.
///
/// Тема без расширения (сегодняшнее приложение, пробы) получает `classic`. Шаблон «Аврора» кладёт свой
/// набор в `ThemeData.extensions` — и только тогда игры, перенесённые на роли, меняются.
@immutable
class GameColors extends ThemeExtension<GameColors> {
  const GameColors({
    required this.correct,
    required this.wrong,
    required this.warning,
    required this.selected,
    required this.highlight,
    required this.muted,
  });

  /// Верный ответ, попадание, решённая клетка.
  final Color correct;

  /// Ошибка, промах, неверная клетка.
  final Color wrong;

  /// Почти промах, время на исходе, предупреждение.
  final Color warning;

  /// Выбранный элемент, курсор, активная клетка.
  final Color selected;

  /// Подсветка подсказки, совпадения, цели.
  final Color highlight;

  /// Приглушённое: недоступное, фон неактивного.
  final Color muted;

  static const classic = GameColors(
    correct: Color(0xFF22C55E),
    wrong: Color(0xFFEF4444),
    warning: Color(0xFFF59E0B),
    selected: Color(0xFF3B82F6),
    highlight: Color(0xFFFBBF24),
    muted: Color(0xFF94A3B8),
  );

  static GameColors of(BuildContext context) => Theme.of(context).extension<GameColors>() ?? classic;

  @override
  GameColors copyWith({
    Color? correct,
    Color? wrong,
    Color? warning,
    Color? selected,
    Color? highlight,
    Color? muted,
  }) => GameColors(
    correct: correct ?? this.correct,
    wrong: wrong ?? this.wrong,
    warning: warning ?? this.warning,
    selected: selected ?? this.selected,
    highlight: highlight ?? this.highlight,
    muted: muted ?? this.muted,
  );

  @override
  GameColors lerp(ThemeExtension<GameColors>? other, double t) {
    if (other is! GameColors) return this;
    return GameColors(
      correct: Color.lerp(correct, other.correct, t)!,
      wrong: Color.lerp(wrong, other.wrong, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
      selected: Color.lerp(selected, other.selected, t)!,
      highlight: Color.lerp(highlight, other.highlight, t)!,
      muted: Color.lerp(muted, other.muted, t)!,
    );
  }
}
