import 'package:flutter/material.dart';

import 'design_template.dart';

/// 🔴 КАРТОЧКА ЗАРЯДКИ НА ГЛАВНОЙ В «АВРОРЕ» — Синапс во всю карточку, слева название,
/// пояснение и кнопка (лист 01 Codex, «Тренировка дня»).
///
/// Картинки две — тёмная и светлая (`assets/aurora_hubs/home_hero_<тема>.webp`), левая
/// часть нарисована спокойной под текст. Текст и действие — из той же карточки `warmup`
/// модели главной, что и в Classic: своих строк и своего перехода у карточки нет.
class AuroraHomeHero extends StatelessWidget {
  const AuroraHomeHero({
    super.key,
    required this.title,
    required this.sub,
    required this.cta,
    required this.onTap,
  });

  final String title;
  final String sub;
  final String cta;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dark = theme.brightness == Brightness.dark;
    final text = auroraToken('text', dark: dark)!;
    final secondary = auroraToken('textSecondary', dark: dark)!;
    final border = auroraToken('border', dark: dark)!;
    final accent = theme.colorScheme.primary;
    final onAccent = theme.colorScheme.onPrimary;
    return Padding(
      key: const ValueKey('aurora-home-hero'),
      padding: const EdgeInsets.only(top: 4, bottom: 16),
      // Высота — не меньше пропорций картинки, но растёт под текст: при крупном шрифте (×2)
      // название, пояснение и кнопка не обрезаются, картинка остаётся фоном (cover).
      child: LayoutBuilder(builder: (context, box) => ConstrainedBox(
        constraints: BoxConstraints(minHeight: box.maxWidth * 714 / 1280),
        child: Material(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24), side: BorderSide(color: border)),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onTap,
            child: Stack(children: [
              Positioned.fill(
                child: Image.asset('assets/aurora_hubs/home_hero_${dark ? 'dark' : 'light'}.webp', fit: BoxFit.cover),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                  FractionallySizedBox(
                    widthFactor: 0.55,
                    child: Text(title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 24, height: 1.15, fontWeight: FontWeight.w700, color: text)),
                  ),
                  const SizedBox(height: 6),
                  FractionallySizedBox(
                    widthFactor: 0.5,
                    child: Text(sub,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 14, height: 1.3, color: secondary)),
                  ),
                  SizedBox(height: box.maxWidth * 0.12),
                  ConstrainedBox(
                    constraints: const BoxConstraints(minHeight: 48),
                    child: FilledButton.icon(
                      key: const ValueKey('aurora-home-hero-start'),
                      onPressed: onTap,
                      style: FilledButton.styleFrom(
                        backgroundColor: accent,
                        foregroundColor: onAccent,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
                        padding: const EdgeInsets.symmetric(horizontal: 22),
                      ),
                      icon: const Icon(Icons.play_arrow_rounded),
                      label: Text(cta, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                    ),
                  ),
                ]),
              ),
            ]),
          ),
        ),
      )),
    );
  }
}
