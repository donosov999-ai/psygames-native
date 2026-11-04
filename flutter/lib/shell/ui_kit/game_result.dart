import 'package:flutter/material.dart';

import '../design_template.dart';
import '../game_colors.dart';
import 'aurora_button.dart';

/// Действие экрана итога: подпись, значок, нажатие. Ключ — для проб и отчёта.
class GameResultAction {
  const GameResultAction({
    required this.label,
    required this.icon,
    required this.onTap,
    this.key,
    this.trailing = false,
  });

  final String label;

  /// Значок справа («Следующий уровень ›»).
  final bool trailing;
  final IconData icon;
  final VoidCallback? onTap;
  final Key? key;
}

/// Плашка показателя: «Уровень 24 → 25», «Получено +24 балла».
class GameResultStat {
  const GameResultStat({required this.icon, required this.label, required this.value, this.iconColor});

  final IconData icon;
  final String label;
  final String value;

  /// Цвет значка; по умолчанию — `reward` «Авроры».
  final Color? iconColor;
}

/// 🏁 ОБЩИЙ ЭКРАН ИТОГА ПАРТИИ «АВРОРЫ» — лист 15 (две правые колонки), задача 46dc791d.
///
/// Один компонент на все игры: игра передаёт исход, тексты, показатели, снимок поля и действия —
/// вид, порядок и цвета задаёт каркас. Состав листа:
///   · сверху картинка (питомец; по умолчанию — значок исхода), заголовок и строка-пояснение;
///   · победа: плашка показателей («Уровень 24 → 25», «+24 балла»);
///   · снимок поля (необязательно);
///   · главная оранжевая кнопка («Следующий уровень» / «Повторить»), под ней до двух в ряд
///     («Ещё раз», «К играм») и одна во всю ширину («Разобрать с учителем»).
///
/// Победа и поражение различаются картинкой, пояснением и составом: у победы пояснение голубое (`selected`,
/// «Отличная работа!») и плашка показателей, у поражения пояснение — причина цветом текста («Лимит ошибок
/// исчерпан»). Заголовок — цвет текста в обоих случаях, как на листе.
/// Тексты передаёт игра (они уже в её словаре) — компонент новых ключей не заводит.
class GameResultPanel extends StatelessWidget {
  const GameResultPanel({
    super.key,
    required this.won,
    required this.title,
    required this.primary,
    this.subtitle,
    this.hero,
    this.stats = const [],
    this.board,
    this.pair = const [],
    this.extra = const [],
  });

  /// Исход партии.
  final bool won;
  final String title;

  /// Пояснение: «Отличная работа!» или причина поражения.
  final String? subtitle;

  /// Картинка сверху (питомец). Нет — значок исхода.
  final Widget? hero;

  final List<GameResultStat> stats;

  /// Снимок поля.
  final Widget? board;

  /// Главное действие (оранжевая кнопка).
  final GameResultAction primary;

  /// До двух действий в ряд под главной.
  final List<GameResultAction> pair;

  /// Действия во всю ширину — ниже ряда.
  final List<GameResultAction> extra;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final roles = GameColors.aurora(Theme.of(context).brightness);
    final text = auroraToken('text', dark: dark)!;
    final secondary = auroraToken('textSecondary', dark: dark)!;

    Widget button(GameResultAction a, {bool primary = false, bool compact = false}) => AuroraButton(
      key: a.key,
      label: a.label,
      icon: a.icon,
      onTap: a.onTap,
      primary: primary,
      compact: compact,
      trailing: a.trailing,
    );

    return ColoredBox(
      color: auroraToken('background', dark: dark)!,
      child: SafeArea(
        child: SingleChildScrollView(
          key: const Key('game-result'),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: SizedBox(
                  height: 180,
                  child:
                      hero ??
                      Icon(
                        won ? Icons.emoji_events_rounded : Icons.replay_circle_filled_rounded,
                        key: Key(won ? 'game-result-hero-won' : 'game-result-hero-lost'),
                        size: 150,
                        color: won ? roles.reward : roles.muted,
                      ),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                title,
                key: const Key('game-result-title'),
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, height: 1.15, color: text),
              ),
              if (subtitle != null) ...[
                const SizedBox(height: 4),
                Text(
                  subtitle!,
                  key: const Key('game-result-subtitle'),
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 16, color: won ? roles.selected : secondary),
                ),
              ],
              if (stats.isNotEmpty) ...[
                const SizedBox(height: 14),
                _StatsCard(stats: stats, dark: dark, reward: roles.reward),
              ],
              if (board != null) ...[const SizedBox(height: 14), Center(child: board!)],
              const SizedBox(height: 16),
              button(primary, primary: true),
              if (pair.isNotEmpty) ...[
                const SizedBox(height: 10),
                Row(
                  children: [
                    for (final (i, a) in pair.take(2).indexed) ...[
                      if (i > 0) const SizedBox(width: 10),
                      Expanded(child: button(a, compact: pair.length > 1)),
                    ],
                  ],
                ),
              ],
              for (final a in extra) ...[const SizedBox(height: 10), button(a)],
            ],
          ),
        ),
      ),
    );
  }
}

class _StatsCard extends StatelessWidget {
  const _StatsCard({required this.stats, required this.dark, required this.reward});

  final List<GameResultStat> stats;
  final bool dark;
  final Color reward;

  @override
  Widget build(BuildContext context) {
    final text = auroraToken('text', dark: dark)!;
    final secondary = auroraToken('textSecondary', dark: dark)!;
    return Container(
      key: const Key('game-result-stats'),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: auroraToken('raised', dark: dark),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: auroraToken('border', dark: dark)!),
      ),
      child: Row(
        children: [
          for (final (i, s) in stats.indexed) ...[
            if (i > 0)
              Container(
                width: 1,
                height: 40,
                margin: const EdgeInsets.symmetric(horizontal: 12),
                color: auroraToken('border', dark: dark),
              ),
            Expanded(
              child: Row(
                children: [
                  Icon(s.icon, size: 40, color: s.iconColor ?? reward),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          s.label,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 13, color: secondary),
                        ),
                        Text(
                          s.value,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: text),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
