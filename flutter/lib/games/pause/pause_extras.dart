// Что вернулось «Дыханию» и «Гимнастике для глаз» после переезда с веба (аудит потерь
// 05.11.2026, раздел «Зарядки и серии», ~/Documents/TeamOps/psygames-design/loss-audit-20261105/warmup.md):
//
//   · [PauseAbout] — блок «Об игре»: описание и три пользы (веб `GameAbout`, задача 26165a85);
//   · [PauseLevelTrail] — тропинка подходов/уровней со звёздами (веб `LevelProgressMap`,
//     задачи 936e3a5e и af5c3ae9);
//   · [PauseResult] — итог подхода: звёзды, уровень, время, серия дней (веб `LevelCleared`,
//     задача b9517e77). В «Авроре» — общий [GameResultPanel] листа 15, в Classic — та же
//     раскладка простыми виджетами.
//
// Тексты — ключи общего словаря, которые уже переведены на 12 языков веб-стороной.
library;

import 'dart:convert';

import 'package:flutter/material.dart';

import '../../shell/aurora_scope.dart';
import '../../shell/chrome_art.dart';
import '../../shell/game_about.dart';
import '../../shell/game_colors.dart';
import '../../shell/home_inputs.dart' show streakFromDayMarks;
import '../../shell/l10n.dart';
import '../../shell/shared_state.dart';
import '../../shell/ui_kit/game_result.dart';

/// Польза упражнения строкой: значок и ключ словаря.
typedef PauseBenefit = (IconData, String);

/// «День n из m» — прогресс цели-серии под итогом практики (веб `goalProgress` + `pickPraise` в
/// `LevelCleared`, задача b9517e77). Цель — `psygames_streak_goal_<профиль>` (`days`: 7, 14 или 30), серия —
/// дни подряд по меткам `psygames_earn_v1[<профиль>].days` до сегодняшнего. Строка только пока цель
/// не достигнута (`0 < n < m`): достигнутую праздновать должно окно цели, а не итог практики.
/// ⚠️ Считает метки, уже сохранённые приёмником партий: пока сегодняшняя ещё не легла, серия — по вчера.
String? streakGoalLine(SharedState state, DateTime now) {
  try {
    final pid = state.activeProfile;
    final goal = jsonDecode(state.get('${SharedState.prefix}streak_goal_$pid') ?? 'null');
    final days = goal is Map ? goal['days'] : null;
    if (days is! num || days <= 0) return null;
    final log = jsonDecode(state.get('${SharedState.prefix}earn_v1') ?? 'null');
    final mine = log is Map ? log[pid] : null;
    final marks = mine is Map && mine['days'] is List ? (mine['days'] as List).cast<Object?>() : const <Object?>[];
    final streak = streakFromDayMarks(marks, now);
    final done = streak < days ? streak : days.toInt();
    if (done <= 0 || done >= days) return null;
    return L.f('goalDayOf', {'n': '$done', 'm': '${days.toInt()}'});
  } catch (_) {
    return null; // битая запись цели или журнала — молчим, а не ломаем итог
  }
}

/// «Передышка для глаз»: на каждой десятой подряд завершённой практике — совет посмотреть вдаль
/// (веб `eyeRestTracker.tickLevelStreak`, `LevelCleared`). Счётчик один на процесс, как в вебе;
/// считает практики «Паузы» (дыхание и гимнастика), а не все игры. Отсчёта на 20 с нет: на итоге
/// «Паузы» нет автоперехода, человек сам решает, когда нажать дальше.
class EyeRestTracker {
  EyeRestTracker._();

  static const every = 10;
  static int _streak = 0;

  /// Завершена ещё одна практика; `true` — эта десятая подряд, показать передышку.
  static bool tick() {
    _streak += 1;
    return _streak % every == 0;
  }

  static void reset() => _streak = 0;
}

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

  Widget _stars(Color color) => Text(
    '★' * stars + '☆' * (3 - stars).clamp(0, 3),
    key: const Key('pause-result-stars'),
    textAlign: TextAlign.center,
    style: TextStyle(fontSize: 40, letterSpacing: 6, color: color),
  );

  @override
  Widget build(BuildContext context) {
    // Итог — часть игровой рамки (DESIGN_SYSTEM.md, правило 1): в «Авроре» он «Авроры», даже
    // пока поле практики ещё классическое (маршрут не в `auroraReadyRoutes`). Тему рамки
    // отдаёт [AuroraFrame].
    final frame = AuroraFrame.of(context);
    if (frame != null || ChromeArt.aurora(context)) {
      final theme = frame ?? Theme.of(context);
      return Theme(
        data: theme,
        child: Builder(builder: (context) => _aurora(context)),
      );
    }
    return _classic(context);
  }

  Widget _aurora(BuildContext context) {
    final roles = GameColors.aurora(Theme.of(context).brightness);
    return GameResultPanel(
      key: const Key('pause-done'),
      won: true,
      title: title,
      subtitle: subtitle,
      hero: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.emoji_events_rounded, size: 110, color: roles.reward),
          _stars(roles.reward),
        ],
      ),
      stats: [for (final s in stats) GameResultStat(icon: s.icon, label: s.label, value: s.value)],
      board: lines.isEmpty
          ? null
          : Column(
              children: [
                for (final l in lines)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(l, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
                  ),
              ],
            ),
      primary: GameResultAction(key: const Key('pause-again'), label: L.t('retry'), icon: Icons.replay, onTap: onAgain),
      pair: [
        GameResultAction(key: const Key('pause-home'), label: L.t('goHome'), icon: Icons.home_outlined, onTap: onHome),
      ],
    );
  }

  Widget _classic(BuildContext context) {
    final theme = Theme.of(context);
    final roles = GameColors.of(context);
    return ListView(
      key: const Key('pause-done'),
      padding: const EdgeInsets.all(16),
      children: [
        _stars(roles.reward),
        Text(
          title,
          key: const Key('game-result-title'),
          style: theme.textTheme.headlineSmall,
          textAlign: TextAlign.center,
        ),
        if (subtitle != null) Text(subtitle!, style: theme.textTheme.titleMedium, textAlign: TextAlign.center),
        const SizedBox(height: 12),
        Wrap(
          alignment: WrapAlignment.center,
          spacing: 16,
          runSpacing: 12,
          children: [
            for (final s in stats)
              SizedBox(
                key: s.key,
                width: 140,
                child: Column(
                  children: [
                    Icon(s.icon, color: roles.reward),
                    Text(s.value, style: theme.textTheme.headlineSmall, textAlign: TextAlign.center),
                    Text(s.label, style: theme.textTheme.bodySmall, textAlign: TextAlign.center),
                  ],
                ),
              ),
          ],
        ),
        for (final l in lines)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(l, style: theme.textTheme.bodySmall, textAlign: TextAlign.center),
          ),
        const SizedBox(height: 16),
        FilledButton.icon(
          key: const Key('pause-again'),
          onPressed: onAgain,
          icon: const Icon(Icons.replay),
          label: Text(L.t('retry')),
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          key: const Key('pause-home'),
          onPressed: onHome,
          icon: const Icon(Icons.home_outlined),
          label: Text(L.t('goHome')),
        ),
      ],
    );
  }
}
