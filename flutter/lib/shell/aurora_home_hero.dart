import 'package:flutter/material.dart';

import 'design_template.dart';
import 'game_shell.dart';

/// 🔴 КАРТОЧКА ЗАРЯДКИ НА ГЛАВНОЙ В «АВРОРЕ» — иллюстрация во всю карточку, слева название,
/// пояснение и кнопка (лист 01 Codex, «Тренировка дня»; компактный реф главной 30.10 —
/// HOME_DESIGN_REF.md: «иллюстративная шапка без Синапса», питомец остаётся в шапке экрана).
///
/// Картинки две — тёмная и светлая (`assets/aurora_hubs/home_hero_brain_<тема>.webp`, 1280×720,
/// мозг со свечением), левая часть нарисована спокойной под текст. Текст и действие — из той же карточки `warmup`
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
    // Кнопка — оранжевая, как на листе и как главная кнопка паузы (решение Дениса 29.10), а не
    // акцент профиля: один цвет действия «Авроры» на всё приложение.
    const onAccent = GameShell.onPauseYellow;
    return Padding(
      key: const ValueKey('aurora-home-hero'),
      padding: const EdgeInsets.only(top: 4, bottom: 16),
      // Высота — не меньше пропорций картинки, но растёт под текст: при крупном шрифте (×2)
      // название, пояснение и кнопка не обрезаются, картинка остаётся фоном (cover).
      child: LayoutBuilder(builder: (context, box) => ConstrainedBox(
        constraints: BoxConstraints(minHeight: (box.maxWidth * 720 / 1280).clamp(190.0, 300.0)),
        child: Material(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24), side: BorderSide(color: border)),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onTap,
            child: Stack(children: [
              Positioned.fill(
                child: Image.asset(dark ? 'assets/aurora_game_chrome/home_training_hero_pilot.png' : 'assets/aurora_game_chrome/home_training_hero_light_v2.png', fit: BoxFit.cover),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 18, 18, 88),
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
                ]),
              ),
              Positioned(
                left: 18, bottom: 16,
                child: SizedBox(
                    width: (box.maxWidth - 36).clamp(0.0, 220.0), height: 56,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(24),
                        image: const DecorationImage(image: AssetImage('assets/aurora_game_chrome/home_panels_pilot/approved_action.png'), fit: BoxFit.fill),
                      ),
                      child: FilledButton.icon(
                      key: const ValueKey('aurora-home-hero-start'),
                      onPressed: onTap,
                      style: FilledButton.styleFrom(
                        backgroundColor: Colors.transparent,
                        shadowColor: Colors.transparent,
                        foregroundColor: onAccent,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
                        padding: const EdgeInsets.symmetric(horizontal: 22),
                      ),
                      icon: const Icon(Icons.play_arrow_rounded),
                      label: Text(cta, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
                    )),
                  ),
              ),
            ]),
          ),
        ),
      )),
    );
  }
}
