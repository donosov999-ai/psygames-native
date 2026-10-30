import 'package:flutter/material.dart';

import 'aurora_glass.dart';
import 'design_template.dart';

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
    if (_aurora(context)) return _auroraTile(context);
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

/// «Аврора» включена в теме этого места: в нижнем ряду игры рамка ставит её тему
/// (`GameShell`, задача 045be21d), поэтому служебные действия игры меняют вид один раз здесь.
bool _aurora(BuildContext context) =>
    Theme.of(context).extension<UiTemplateTheme>()?.template == UiTemplate.aurora;

extension on AuxAction {
  /*
   * «Аврора», реф Codex 30.10 (sudoku-even-toolbar-v4): служебное действие — круглая стеклянная
   * кнопка 52 со значком и подпись под ней (та же подпись, что у чтеца экрана и в меню паузы).
   * Включённый режим — залитый круг, число — вместо значка, как в Classic.
   */
  Widget _auroraTile(BuildContext context) {
    final theme = Theme.of(context);
    final dark = theme.brightness == Brightness.dark;
    final disabled = onPressed == null;
    final text = auroraToken('text', dark: dark)!;
    final accent = tint ?? theme.colorScheme.primary;
    final fg = disabled
        ? text.withValues(alpha: 0.35)
        : (active ? theme.colorScheme.onPrimary : (tint ?? text));
    return Semantics(
      button: true,
      enabled: !disabled,
      label: label,
      excludeSemantics: true,
      onTap: onPressed,
      // Нажимается вся колонка — и круг, и подпись под ним (как вкладки внизу): по подписи палец
      // тоже попадает. Рябь — у круга, его InkWell выигрывает спор жестов.
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onPressed,
        child: Column(mainAxisSize: MainAxisSize.min, children: [
        // Стеклянный круг в золотом ободке (стандарт игрового экрана, `AuroraGlass`).
        Container(
          decoration: AuroraGlass.ring(dark, active: active ? accent : null),
          child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: onPressed,
            child: SizedBox(
              width: 52,
              height: 52,
              // Число — значком-счётчиком на значке (реф 30.10: лампочка с «2»), а не вместо значка:
              // по значку видно, ЧТО считается.
              child: Center(
                child: count == null
                    ? Icon(icon, size: 22, color: fg)
                    : Badge(
                        key: const Key('aux-count'),
                        label: Text('$count'),
                        backgroundColor: theme.colorScheme.primary,
                        textColor: theme.colorScheme.onPrimary,
                        child: Icon(icon, size: 22, color: fg),
                      ),
              ),
            ),
          ),
          ),
        ),
        const SizedBox(height: 4),
        FittedBox(
          fit: BoxFit.scaleDown,
          child: Text(label,
              maxLines: 1,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 11, height: 1.1, color: disabled ? fg : text)),
        ),
      ]),
      ),
    );
  }
}

class AuxBar extends StatelessWidget {
  const AuxBar({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) => _aurora(context)
      // «Аврора»: равные колонки на всю ширину справа от паузы (реф Codex 30.10) — без пустого места справа.
      ? Row(
          key: const Key('aux-bar-aurora'),
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final c in children)
              Expanded(child: Padding(padding: const EdgeInsets.symmetric(horizontal: 2), child: Center(child: c))),
          ],
        )
      : Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Wrap(
          alignment: WrapAlignment.center,
          spacing: 10,
          runSpacing: 8,
          children: children,
        ),
      );
}
