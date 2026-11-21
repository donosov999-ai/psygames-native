// Что вернулось «Дыханию» и «Гимнастике для глаз» после переезда с веба (аудит потерь
// 05.11.2026, раздел «Зарядки и серии», ~/Documents/TeamOps/psygames-design/loss-audit-20261105/warmup.md):
//
//   · [PauseAbout] — блок «Об игре»: описание и три пользы (веб `GameAbout`, задача 26165a85);
//   · [PauseLevelTrail] — тропинка подходов/уровней со звёздами (веб `LevelProgressMap`,
//     задачи 936e3a5e и af5c3ae9);
//   · [PauseResult] — итог подхода: звёзды, уровень, время, серия дней (веб `LevelCleared`,
//     задача b9517e77). Обе темы рисует [LevelResult] через адаптер отчёта.
//
// Тексты — ключи общего словаря, которые уже переведены на 12 языков веб-стороной.
library;

import 'package:flutter/material.dart';

import '../../shell/game_about.dart';
import '../../shell/game_colors.dart';
import '../../shell/l10n.dart';
import '../../shell/level_result.dart';

/// Польза упражнения строкой: значок и ключ словаря.
typedef PauseBenefit = (IconData, String);

/// Польза дыхания — те же три пункта, что у веба (`BREATH_BENEFITS`).
const breathBenefits = <PauseBenefit>[
  (Icons.favorite_border, 'benefitBreath1'),
  (Icons.nightlight_outlined, 'benefitBreath2'),
  (Icons.monitor_heart_outlined, 'benefitBreath3'),
];

/// Польза гимнастики для глаз (`EYE_BENEFITS`).
const eyeBenefits = <PauseBenefit>[
  (Icons.visibility_outlined, 'benefitEye1'),
  (Icons.wb_sunny_outlined, 'benefitEye2'),
  (Icons.sentiment_satisfied_outlined, 'benefitEye3'),
];

/// Ключи, которые зовутся не литералом `L.t('…')`, а из списков выше, — чтобы
/// `flutter/tools/embed-l10n.mjs` положил их в словарь сборки (он видит `*Keys`).
const pauseExtrasKeys = [
  'title_about_game',
  'breathingIntroDesc',
  'eyeGymIntroDesc',
  'benefitBreath1',
  'benefitBreath2',
  'benefitBreath3',
  'benefitEye1',
  'benefitEye2',
  'benefitEye3',
];

/// «Об игре» «Дыхания» и «Гимнастики для глаз» — общий блок каркаса [GameAbout] (задача 3a365b5d)
/// с ключами проб `pause-about-*`: у практик по одному блоку на каждую, данные — списки выше.
class PauseAbout extends StatelessWidget {
  const PauseAbout({super.key, required this.descriptionKey, required this.benefits});

  final String descriptionKey;
  final List<PauseBenefit> benefits;

  @override
  Widget build(BuildContext context) => GameAbout(
    descriptionKey: descriptionKey,
    benefits: [for (final (icon, key) in benefits) GameBenefit(key, icon: icon)],
    keyPrefix: 'pause-about',
  );
}

/// Тропинка: узлы 1…[last], пройденные (≤ [best]) — открыты, текущий — обведён, дальше —
/// замок. [onPick] задан — пройденные узлы нажимаются (гимнастика: переиграть уровень);
/// не задан — картинка пути без мёртвых кнопок (дыхание считает подходы, не ступени).
class PauseLevelTrail extends StatefulWidget {
  const PauseLevelTrail({
    super.key,
    required this.title,
    required this.last,
    required this.best,
    required this.current,
    this.stars = const {},
    this.onPick,
    this.nodeLabel,
    this.keyPrefix = 'pause-trail',
  });

  final String title;
  final int last, best, current;
  final Map<int, int> stars;
  final ValueChanged<int>? onPick;

  /// Подпись под номером узла («3′» — минуты уровня гимнастики).
  final String Function(int)? nodeLabel;
  final String keyPrefix;

  @override
  State<PauseLevelTrail> createState() => _PauseLevelTrailState();
}

class _PauseLevelTrailState extends State<PauseLevelTrail> {
  static const _node = 56.0;
  late final ScrollController _scroll = ScrollController(
    initialScrollOffset: ((widget.current - 3) * _node).clamp(0, double.infinity).toDouble(),
  );

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final roles = GameColors.of(context);
    final last = widget.last < widget.best ? widget.best : widget.last;
    final hasLabels = widget.nodeLabel != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(widget.title, key: Key('${widget.keyPrefix}-title'), style: theme.textTheme.labelLarge),
        if (widget.onPick != null)
          Text(L.t('tapNodeToReplay'), style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
        const SizedBox(height: 6),
        SizedBox(
          height: _node + (hasLabels ? 34 : 18),
          child: ListView.builder(
            key: Key(widget.keyPrefix),
            controller: _scroll,
            scrollDirection: Axis.horizontal,
            itemCount: last,
            itemExtent: _node,
            itemBuilder: (context, i) {
              final n = i + 1;
              final passed = n <= widget.best;
              final isCurrent = n == widget.current;
              final s = widget.stars[n] ?? 0;
              final tap = widget.onPick != null && passed && !isCurrent ? () => widget.onPick!(n) : null;
              return Stack(
                alignment: Alignment.topCenter,
                children: [
                  // Отрезок пути к следующему узлу: пройденный — цветом выбора, дальше — бледный.
                  if (n < last)
                    Positioned(
                      top: 22,
                      left: _node / 2,
                      width: _node,
                      child: Container(height: 3, color: n < widget.best ? roles.selected : scheme.outlineVariant),
                    ),
                  Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Semantics(
                        button: tap != null,
                        selected: isCurrent,
                        label: L.f('levelOfMax', {'n': '$n', 'max': '$last'}),
                        excludeSemantics: true,
                        child: Material(
                          shape: CircleBorder(
                            side: BorderSide(color: isCurrent ? roles.selected : Colors.transparent, width: 2.5),
                          ),
                          color: passed ? scheme.primaryContainer : scheme.surfaceContainerHighest,
                          child: InkWell(
                            key: Key('${widget.keyPrefix}-$n'),
                            customBorder: const CircleBorder(),
                            onTap: tap,
                            child: SizedBox(
                              width: 44,
                              height: 44,
                              child: Center(
                                child: passed
                                    ? Text(
                                        '$n',
                                        style: TextStyle(
                                          fontWeight: isCurrent ? FontWeight.w800 : FontWeight.w600,
                                          color: scheme.onPrimaryContainer,
                                        ),
                                      )
                                    : Icon(Icons.lock_outline, size: 16, color: scheme.outline),
                              ),
                            ),
                          ),
                        ),
                      ),
                      SizedBox(
                        height: 16,
                        child: s > 0
                            ? Text(
                                '★' * s,
                                key: Key('${widget.keyPrefix}-stars-$n'),
                                style: TextStyle(fontSize: 11, color: roles.reward),
                              )
                            : null,
                      ),
                      if (hasLabels)
                        Text(
                          widget.nodeLabel!(n),
                          style: theme.textTheme.labelSmall?.copyWith(color: scheme.onSurfaceVariant),
                        ),
                    ],
                  ),
                ],
              );
            },
          ),
        ),
      ],
    );
  }
}

/// Строка показателя итога.
class PauseResultStat {
  const PauseResultStat(this.icon, this.label, this.value, {this.key});

  final IconData icon;
  final String label;
  final String value;
  final Key? key;
}

/// Итог подхода «Дыхания» / «Гимнастики» / практики «Паузы».
///
/// ⚠️ ТРИ ЗВЕЗДЫ ЗА ЗАВЕРШЁННЫЙ ПОДХОД — как у веба (`stars={3}`): дыхание и гимнастику
/// нельзя сделать «хуже», их либо довели до конца, либо прекратили.
class PauseResult extends StatelessWidget {
  const PauseResult({
    super.key,
    required this.title,
    this.subtitle,
    this.stars = 3,
    this.stats = const [],
    this.lines = const [],
    required this.onAgain,
    required this.onHome,
  });

  final String title;
  final String? subtitle;
  final int stars;
  final List<PauseResultStat> stats;

  /// Дополнительные строки под показателями (выполненные наборы «Паузы», приватность).
  final List<String> lines;
  final VoidCallback onAgain;
  final VoidCallback onHome;

  @override
  Widget build(BuildContext context) => LevelResult.adapt(
    ReportOutcomeAdapter(
      title: title,
      titleKey: const Key('game-result-title'),
      score: subtitle,
      icon: Icons.emoji_events_rounded,
      awardStars: stars,
      starsKey: const Key('pause-result-stars'),
      stats: [
        for (final s in stats) GameResultStat(icon: s.icon, label: s.label, value: s.value, key: s.key),
      ],
      details: lines.isEmpty
          ? null
          : Column(mainAxisSize: MainAxisSize.min, children: [
              for (final line in lines)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(line, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
                ),
            ]),
      action: GameResultAction(key: const Key('pause-again'), label: L.t('retry'), icon: Icons.replay, onTap: onAgain),
      exit: GameResultAction(key: const Key('pause-home'), label: L.t('goHome'), icon: Icons.home_outlined, onTap: onHome),
    ),
    key: const Key('pause-done'),
  );
}
