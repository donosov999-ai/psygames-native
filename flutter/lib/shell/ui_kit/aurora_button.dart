import 'package:flutter/material.dart';

import '../design_template.dart';
import '../game_colors.dart';

/// Кнопка «Авроры» — лист 15: главная оранжевая с тёмным текстом, прочие обведённые на поверхности.
/// Высота 52 (кнопки «Авроры» ≥ 48, `PROJECT_REF.md`), скругление 14, подпись в одну строку.
/// Оранжевый — `GameColors.aurora(...).highlight` тёмной темы (на листе он один в обеих темах, решение Дениса
/// 29.10 15:03), текст на нём — `onStrong` тёмной темы: свой литерал не заводим (храповик цветов).
class AuroraButton extends StatelessWidget {
  const AuroraButton({
    super.key,
    required this.label,
    required this.icon,
    required this.onTap,
    this.primary = false,
    this.compact = false,
    this.trailing = false,
  });

  final String label;
  final IconData icon;
  final VoidCallback? onTap;

  /// Главная (оранжевая) — одна на экран.
  final bool primary;

  /// Кнопка в ряду из двух: меньше шрифт и значок.
  final bool compact;

  /// Значок справа у края, подпись по центру («Следующий уровень ›» на листе 15).
  final bool trailing;

  static Color get action => GameColors.auroraDark.highlight;
  static Color get onAction => GameColors.auroraDark.onStrong;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final fg = primary ? onAction : auroraToken('text', dark: dark)!;
    return SizedBox(
      height: 52,
      child: Material(
        color: primary ? action : auroraToken('surface', dark: dark),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: primary ? BorderSide.none : BorderSide(color: auroraToken('border', dark: dark)!),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (trailing) SizedBox(width: compact ? 20 : 22) else Icon(icon, size: compact ? 20 : 22, color: fg),
                const SizedBox(width: 10),
                Flexible(
                  fit: trailing ? FlexFit.tight : FlexFit.loose,
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: compact ? 15 : 17, fontWeight: FontWeight.w700, color: fg),
                  ),
                ),
                if (trailing) ...[const SizedBox(width: 10), Icon(icon, size: compact ? 20 : 22, color: fg)],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
