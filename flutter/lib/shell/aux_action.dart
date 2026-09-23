import 'package:flutter/material.dart';

/// Служебное действие игры — значком в ряду ПОД полем.
///
/// Решение Дениса 17.09.2026 для всех игр PsyGames: отменить, заново, подсказка,
/// решение — одной строкой значков под полем, не в шапке и не двумя рядами.
/// Перенос правила из React-каркаса (GameAuxAction): та же форма 48×48, залитый
/// значок у включённого режима, число внутри значка вместо бейджа на углу.
class AuxAction extends StatelessWidget {
  const AuxAction({
    super.key,
    required this.icon,
    required this.label,
    this.onPressed,
    this.active = false,
    this.count,
    this.tint,
  });

  final IconData icon;

  /// Подпись для чтеца экрана и для меню паузы: у каждого значка она обязательна,
  /// иначе кнопка без подписи валит живой аудит (a11y-audit в старом наборе).
  final String label;
  final VoidCallback? onPressed;

  /// Включённый режим (карандаш, цвет) — залитая кнопка.
  final bool active;

  /// Число внутри значка: сколько пометок, сколько отмен осталось.
  final int? count;
  final Color? tint;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final disabled = onPressed == null;
    final fg = disabled
        ? scheme.onSurface.withValues(alpha: 0.35)
        : (tint ?? (active ? scheme.onPrimary : scheme.onSurface));
    final bg = active ? (tint ?? scheme.primary) : scheme.surfaceContainerHighest;

    return Semantics(
      button: true,
      enabled: !disabled,
      label: label,
      child: Tooltip(
        message: label,
        child: InkWell(
          onTap: onPressed,
          borderRadius: BorderRadius.circular(24),
          child: Container(
            width: 48,
            height: 48,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: bg,
              shape: BoxShape.circle,
              border: Border.all(color: scheme.outlineVariant),
            ),
            child: count == null
                ? Icon(icon, size: 20, color: fg)
                : Text('$count',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: fg)),
          ),
        ),
      ),
    );
  }
}

/// Ряд служебных значков под полем. Переносится строкой только тогда, когда
/// значки не встают в ширину: два ряда над полем — то, от чего ушли 17.09.2026.
class AuxBar extends StatelessWidget {
  const AuxBar({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Wrap(
          alignment: WrapAlignment.center,
          spacing: 10,
          runSpacing: 8,
          children: children,
        ),
      );
}
