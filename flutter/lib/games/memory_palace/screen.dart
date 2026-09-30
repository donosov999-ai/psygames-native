/// «ДВОРЕЦ ПАМЯТИ» НА ОБЩЕМ КАРКАСЕ.
///
/// 🔴 РАСКЛАДКА ПЕРЕНЕСЕНА ВМЕСТЕ С ПРАВИЛАМИ, А НЕ ПРИДУМАНА ЗАНОВО. В числах
/// веб-версии (`placeLayout.ts`) лежат починки по отчётам, и потерять их при
/// переезде значит вернуть жалобы:
/// · отзыв afa77c5a (02.09.2026) «бегаешь между двумя страницами целую игру» —
///   лента предметов и сцена мест обязаны быть видны ОДНОВРЕМЕННО, поэтому
///   лента горизонтальная (76 точек), плитка места компактная (86), а на
///   больших уровнях колонок четыре, а не три;
/// · два отчёта NZT-48 «нихуя не понятно по смыслу игры» — предмет на первых
///   трёх уровнях подписан ИМЕНЕМ внутри плитки: человек связывает с местом
///   слово, а не «оранжевый ромб», иначе на опросе вход и выход стоят на разных
///   носителях;
/// · в фазе изучения имя предмета обязательно ВСЕГДА: на опросе кандидатов
///   показывают подписанными, и выученный «зелёный кружок» пришлось бы называть
///   словом, которого человек не читал.
///
/// ⚠️ Номер места виден в фазе маршрута всегда, а вне её — только пока маршрут
/// постоянен (до пятого уровня). С шестого номер на плитке сделал бы
/// перемешивание маршрута бессмысленным: порядок читался бы прямо с экрана.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;

import '../../shell/aux_action.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import '../../shell/lesson.dart';
import '../../shell/lesson_player.dart';
import 'lesson.dart';
import 'model.dart';

/// Числа раскладки — те же, что в вебе (`PLACE_LAYOUT`).
class PalaceLayout {
  static const double sceneGap = 6;
  static const double routeTile = 62;
  static const double placeTile = 86;
  static const double studyTile = 110;
  static const double itemTile = 76;
  static const double itemGap = 10;
  static const double locusMinWidth = 56;
  static const double locusMaxWidth = 132;

  /// Колонок в сцене мест: в размещении четвёртая колонка снимает целую строку,
  /// без которой фаза не влезает в экран; маршруту и изучению платить нечем.
  static int columns(int lociCount, String phase) =>
      phase != 'place' ? 3 : (lociCount > 6 ? 4 : 3);

  static double tileHeight(String phase) => phase == 'route'
      ? routeTile
      : phase == 'study'
          ? studyTile
          : placeTile;
}

/// До какого уровня предмет в ленте подписан именем. Решение Дениса 06.09.2026.
const int palaceLabelledLevels = 3;

bool palaceShowsItemNames(int level) => level <= palaceLabelledLevels;

class MemoryPalaceScreen extends StatefulWidget {
  const MemoryPalaceScreen({super.key, required this.state, this.content});

  final SharedState state;

  /// Подставляется пробой: она не ходит в ассеты.
  final MemoryPalaceContent? content;

  @override
  State<MemoryPalaceScreen> createState() => _MemoryPalaceScreenState();
}

class _MemoryPalaceScreenState extends State<MemoryPalaceScreen> {
  late LevelLadder _ladder;
  MemoryPalaceContent? _content;
  MemoryPalaceSession? _session;
  bool _booting = true;

  int get _now => DateTime.now().millisecondsSinceEpoch;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(
      gameId: 'memory_palace',
      store: SharedLevelStore(widget.state),
      maxLevel: memoryPalaceLevels,
    );
    _boot();
  }

  Future<void> _boot() async {
    final content = widget.content ??
        MemoryPalaceContent.fromJsonString(await rootBundle.loadString('assets/memory-palace.json'));
    await _ladder.load();
    if (!mounted) return;
    setState(() {
      _content = content;
      _booting = false;
      _newRound();
    });
  }

  void _newRound() {
    final c = _content;
    if (c == null) return;
    _session = MemoryPalaceSession.create(c, 'memory-palace-${_ladder.level}', _ladder.level);
  }

  Future<void> _finish(MemoryPalaceMetrics m) async {
    final seconds = (m.durationMs / 1000).round();
    if (m.passed) {
      await _ladder.win(score: m.score, timeSeconds: seconds, errors: m.errors, mode: 'level');
    } else {
      await _ladder.fail(score: m.score, timeSeconds: seconds, errors: m.errors, mode: 'level');
    }
    if (mounted) setState(() {});
  }

  void _step(void Function(MemoryPalaceSession s) action) {
    final s = _session;
    if (s == null) return;
    setState(() => action(s));
    final r = s.result;
    if (s.phase == MemoryPalacePhase.result && r != null) _finish(r);
  }

  /// Тексты разбора — из словаря, теми же ключами, что зовёт веб-учитель.
  String _teach(String key, Map<String, String> args) {
    var out = switch (key) {
      'teachPalaceIntro' => L.t('teachPalaceIntro'),
      'teachPalaceLinkFirst' => L.t('teachPalaceLinkFirst'),
      'teachPalaceLink' => L.t('teachPalaceLink'),
      'teachPalaceWalk' => L.t('teachPalaceWalk'),
      'teachPalaceRecall' => L.t('teachPalaceRecall'),
      'teachPalaceBack' => L.t('teachPalaceBack'),
      _ => L.t('teachPalaceDone'),
    };
    for (final e in args.entries) {
      out = out.replaceAll('{${e.key}}', e.value);
    }
    return out;
  }

  Future<void> _openLesson() async {
    final s = _session;
    final c = _content;
    if (s == null || c == null) return;
    final round = s.round;
    final steps = palaceLessonSteps(say: _teach, round: round, locale: L.locale);
    if (steps.isEmpty) return;
    LessonUsed.mark();
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => LessonPlayerScreen(
        title: c.s(L.locale, 'title'),
        steps: steps,
        board: (context, side, i) {
          final card = steps[i.clamp(0, steps.length - 1)].payload as PalaceCard;
          final n = card.layout.length;
          // Места идут в ряд по маршруту: порядок мест и есть порядок предметов,
          // и показывать их сеткой значило бы стереть дорогу.
          final w = (side / (n < 1 ? 1 : n)) - 6;
          return Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (var k = 0; k < n; k += 1)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 3),
                  child: PalaceLocusTile(
                    locus: round.loci[k],
                    width: w < 24 ? 24 : w,
                    height: side * 0.7,
                    phase: 'study',
                    locale: L.locale,
                    item: card.layout[k] == null ? null : round.item(card.layout[k]!),
                    selected: card.place == k,
                    showOrder: true,
                  ),
                ),
            ],
          );
        },
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final s = _session;
    final c = _content;
    if (_booting || s == null || c == null) {
      return GameShell(
        title: _content?.s(L.locale, 'title') ?? '',
        field: (context, h) => const Center(child: CircularProgressIndicator()),
      );
    }
    return GameShell(
      title: c.s(L.locale, 'title'),
      onLesson: _openLesson,
      hud: [
        HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: c.s(L.locale, 'route'), value: '${s.round.lociCount}', icon: Icons.route_outlined),
        HudItem(label: c.s(L.locale, _phaseKey(s.phase)), value: _progress(s), icon: Icons.checklist_outlined),
      ],
      field: (context, h) => _field(context, s, c, h),
      auxRow: AuxBar(children: [
        AuxAction(
          icon: Icons.refresh,
          label: c.s(L.locale, 'restart'),
          onPressed: () => setState(() => s.restart(_now)),
        ),
      ]),
      toolbar: _toolbar(context, s, c),
      pauseActions: [
        PauseAction(
          label: c.s(L.locale, 'restart'),
          icon: Icons.refresh,
          onPressed: () => setState(() => s.restart(_now)),
        ),
      ],
    );
  }

  String _phaseKey(MemoryPalacePhase phase) {
    switch (phase) {
      case MemoryPalacePhase.route:
        return 'route';
      case MemoryPalacePhase.place:
        return 'place';
      case MemoryPalacePhase.study:
        return 'study';
      case MemoryPalacePhase.recallReverse:
        return 'recallReverse';
      case MemoryPalacePhase.result:
        return 'result';
      default:
        return 'recallForward';
    }
  }

  String _progress(MemoryPalaceSession s) {
    if (s.phase == MemoryPalacePhase.place) {
      final placed = s.placements.where((x) => x != null).length;
      return '$placed/${s.round.lociCount}';
    }
    if (s.phase == MemoryPalacePhase.recallForward || s.phase == MemoryPalacePhase.recallReverse) {
      return '${s.currentResponses.length}/${s.round.lociCount}';
    }
    return '${s.round.lociCount}';
  }

  /* ─────────────────────────── поле ─────────────────────────── */

  Widget _field(BuildContext context, MemoryPalaceSession s, MemoryPalaceContent c, double h) {
    final scheme = Theme.of(context).colorScheme;
    switch (s.phase) {
      case MemoryPalacePhase.rules:
        return _Pad(
          height: h,
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Text(c.s(L.locale, 'rulesTitle'), style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(c.s(L.locale, 'rulesBody'), textAlign: TextAlign.center),
          ]),
        );
      case MemoryPalacePhase.route:
        return _Pad(
          height: h,
          child: Column(children: [
            Text(c.s(L.locale, 'routeBody'), textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Expanded(child: _lociScene(context, s, c, 'route')),
          ]),
        );
      case MemoryPalacePhase.place:
        return _Pad(
          height: h,
          child: Column(children: [
            // 🔴 ЛЕНТА И СЦЕНА — ОДНОВРЕМЕННО. Именно их разлучение и вызвало
            // жалобу «бегаешь между двумя страницами целую игру».
            SizedBox(height: PalaceLayout.itemTile, child: _itemStrip(context, s, c)),
            const SizedBox(height: 8),
            Expanded(child: _lociScene(context, s, c, 'place')),
          ]),
        );
      case MemoryPalacePhase.study:
        return _Pad(
          height: h,
          child: Column(children: [
            Text(c.s(L.locale, 'studyBody'), textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Expanded(child: _lociScene(context, s, c, 'study')),
          ]),
        );
      case MemoryPalacePhase.recallForward:
      case MemoryPalacePhase.recallReverse:
        final locus = s.currentRecallLocus;
        return _Pad(
          height: h,
          child: Column(children: [
            Text(
              c.s(L.locale, s.phase == MemoryPalacePhase.recallForward ? 'recallForward' : 'recallReverse'),
              style: TextStyle(color: scheme.onSurfaceVariant),
            ),
            const SizedBox(height: 6),
            Text(locus?.title(L.locale) ?? '',
                style: Theme.of(context).textTheme.headlineSmall, textAlign: TextAlign.center),
            const SizedBox(height: 10),
            Expanded(child: _candidates(context, s, c)),
          ]),
        );
      case MemoryPalacePhase.transition:
        return _Pad(
          height: h,
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(Icons.swap_vert, size: 40, color: scheme.primary),
            const SizedBox(height: 10),
            Text(c.s(L.locale, 'recallReverse'),
                style: Theme.of(context).textTheme.titleLarge, textAlign: TextAlign.center),
          ]),
        );
      case MemoryPalacePhase.result:
        final m = s.result!;
        return _Pad(
          height: h,
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(m.passed ? Icons.emoji_events_outlined : Icons.replay_outlined,
                size: 44, color: m.passed ? scheme.primary : scheme.onSurfaceVariant),
            const SizedBox(height: 8),
            Text(m.passed ? L.f('levelDone', {'n': '${m.level}'}) : L.t('retry'),
                style: Theme.of(context).textTheme.titleLarge, textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text('${c.s(L.locale, 'recallForward')}: ${(m.forwardLocationAccuracy * m.lociCount).round()}/${m.lociCount}'),
            Text('${c.s(L.locale, 'recallReverse')}: ${(m.reverseLocationAccuracy * m.lociCount).round()}/${m.lociCount}'),
            Text('${L.t('score')}: ${m.score}', style: const TextStyle(fontWeight: FontWeight.w700)),
          ]),
        );
      default:
        return const SizedBox.shrink();
    }
  }

  /// Сцена мест. Ширина плитки — доля строки, как в вебе: пиксели на узком
  /// экране дают две колонки вместо трёх, и сетка снова растёт вверх.
  Widget _lociScene(BuildContext context, MemoryPalaceSession s, MemoryPalaceContent c, String phase) {
    final columns = PalaceLayout.columns(s.round.lociCount, phase);
    return LayoutBuilder(builder: (context, box) {
      final width = ((box.maxWidth - (columns - 1) * PalaceLayout.sceneGap) / columns)
          .clamp(PalaceLayout.locusMinWidth, PalaceLayout.locusMaxWidth);
      return SingleChildScrollView(
        child: Wrap(
          spacing: PalaceLayout.sceneGap,
          runSpacing: PalaceLayout.sceneGap,
          alignment: WrapAlignment.center,
          children: [
            for (var i = 0; i < s.round.loci.length; i += 1)
              PalaceLocusTile(
                key: ValueKey('locus-$i'),
                locus: s.round.loci[i],
                width: width,
                height: PalaceLayout.tileHeight(phase),
                phase: phase,
                locale: L.locale,
                item: phase == 'route' ? null : s.round.item(s.placements[i] ?? ''),
                selected: s.selectedLocusIndex == i,
                // Номер вне фазы маршрута — только пока маршрут постоянен.
                showOrder: phase == 'route' || !memoryPalaceRouteIsShuffled(s.round.level),
                onTap: phase == 'place' ? () => setState(() => s.selectLocus(i)) : null,
              ),
          ],
        ),
      );
    });
  }

  /// Лента предметов: ГОРИЗОНТАЛЬНАЯ и одной строкой при любом их числе.
  Widget _itemStrip(BuildContext context, MemoryPalaceSession s, MemoryPalaceContent c) {
    final placed = s.placements.whereType<String>().toSet();
    return ListView.separated(
      scrollDirection: Axis.horizontal,
      itemCount: s.round.targetItems.length,
      separatorBuilder: (_, _) => const SizedBox(width: PalaceLayout.itemGap),
      itemBuilder: (context, i) {
        final item = s.round.targetItems[i];
        return _ItemTile(
          key: ValueKey('item-${item.id}'),
          item: item,
          locale: L.locale,
          size: PalaceLayout.itemTile,
          dimmed: placed.contains(item.id),
          selected: s.selectedItemId == item.id,
          showName: palaceShowsItemNames(s.round.level),
          onTap: () => setState(() => s.selectItem(item.id)),
        );
      },
    );
  }

  /// Кандидаты опроса — ПОЛНОЙ плиткой, с подписью: спрашивают словом.
  Widget _candidates(BuildContext context, MemoryPalaceSession s, MemoryPalaceContent c) {
    final used = s.currentResponses.toSet();
    return SingleChildScrollView(
      child: Wrap(
        spacing: PalaceLayout.itemGap,
        runSpacing: PalaceLayout.itemGap,
        alignment: WrapAlignment.center,
        children: [
          for (final item in s.round.recallCandidates)
            _ItemTile(
              key: ValueKey('candidate-${item.id}'),
              item: item,
              locale: L.locale,
              size: PalaceLayout.itemTile,
              dimmed: used.contains(item.id),
              selected: false,
              showName: true,
              onTap: used.contains(item.id) ? null : () => _step((x) => x.selectRecallItem(item.id, _now)),
            ),
        ],
      ),
    );
  }

  /* ─────────────────────────── ряд под полем ─────────────────────────── */

  Widget? _toolbar(BuildContext context, MemoryPalaceSession s, MemoryPalaceContent c) {
    Widget bar(Widget child) => Padding(padding: const EdgeInsets.fromLTRB(12, 8, 12, 12), child: child);
    switch (s.phase) {
      case MemoryPalacePhase.rules:
        return bar(FilledButton.icon(
          key: const ValueKey('mp-start'),
          onPressed: () => setState(() => s.start(_now)),
          icon: const Icon(Icons.play_arrow),
          label: Text(c.s(L.locale, 'start')),
        ));
      case MemoryPalacePhase.route:
        return bar(FilledButton.icon(
          key: const ValueKey('mp-to-place'),
          onPressed: () => setState(s.continueToPlacement),
          icon: const Icon(Icons.arrow_forward),
          label: Text(c.s(L.locale, 'placeTitle')),
        ));
      case MemoryPalacePhase.place:
        return bar(FilledButton.icon(
          key: const ValueKey('mp-confirm'),
          onPressed: s.placementComplete ? () => setState(s.confirmPlacements) : null,
          icon: const Icon(Icons.check),
          label: Text(c.s(L.locale, 'studyTitle')),
        ));
      case MemoryPalacePhase.study:
        return bar(FilledButton.icon(
          key: const ValueKey('mp-to-recall'),
          onPressed: () => setState(s.startRecall),
          icon: const Icon(Icons.help_outline),
          label: Text(c.s(L.locale, 'recallTitle')),
        ));
      case MemoryPalacePhase.transition:
        return bar(FilledButton.icon(
          key: const ValueKey('mp-to-reverse'),
          onPressed: () => setState(s.continueToReverse),
          icon: const Icon(Icons.arrow_forward),
          label: Text(c.s(L.locale, 'recallReverse')),
        ));
      case MemoryPalacePhase.result:
        return bar(FilledButton.icon(
          key: const ValueKey('mp-again'),
          onPressed: () => setState(_newRound),
          icon: const Icon(Icons.arrow_forward),
          label: Text(s.result!.passed ? L.t('nextLabel') : L.t('retry')),
        ));
      default:
        return null;
    }
  }
}

class _Pad extends StatelessWidget {
  const _Pad({required this.height, required this.child});

  final double height;
  final Widget child;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: height.isFinite ? height : null,
        child: Padding(padding: const EdgeInsets.all(12), child: child),
      );
}

/// Плитка места: номер-ромб, название и слот под предмет.
class PalaceLocusTile extends StatelessWidget {
  const PalaceLocusTile({
    super.key,
    required this.locus,
    required this.width,
    required this.height,
    required this.phase,
    required this.locale,
    required this.item,
    required this.selected,
    required this.showOrder,
    this.onTap,
  });

  final PalaceLocus locus;
  final double width;
  final double height;
  final String phase;
  final String locale;
  final PalaceItem? item;
  final bool selected;
  final bool showOrder;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final color = _hex(locus.color);
    return InkWell(
      onTap: onTap,
      child: Container(
        width: width,
        height: height,
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.14),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: selected ? scheme.primary : color, width: selected ? 2 : 1),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (showOrder)
              Container(
                width: 22,
                height: 22,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(6)),
                child: Text('${locus.order}',
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: Colors.white)),
              ),
            const SizedBox(height: 2),
            Flexible(
              child: Text(
                locus.title(locale),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 10, height: 1.2, fontWeight: FontWeight.w600),
              ),
            ),
            if (phase != 'route') ...[
              const SizedBox(height: 2),
              _ItemShape(item: item, size: 20),
              if (phase == 'study') ...[
                const SizedBox(height: 2),
                Flexible(
                  child: Text(
                    item?.title(locale) ?? '',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 10, height: 1.2),
                  ),
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

/// Плитка предмета в ленте и среди кандидатов.
class _ItemTile extends StatelessWidget {
  const _ItemTile({
    super.key,
    required this.item,
    required this.locale,
    required this.size,
    required this.dimmed,
    required this.selected,
    required this.showName,
    this.onTap,
  });

  final PalaceItem item;
  final String locale;
  final double size;
  final bool dimmed;
  final bool selected;
  final bool showName;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Opacity(
      opacity: dimmed ? 0.35 : 1,
      child: InkWell(
        onTap: onTap,
        child: Container(
          width: size,
          height: size,
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(
            color: _hex(item.color).withValues(alpha: 0.16),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: selected ? scheme.primary : _hex(item.accent), width: selected ? 2 : 1),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Подпись ВНУТРИ плитки, а не под ней: под ней она вернула бы
              // беготню между лентой и сценой (жалоба afa77c5a).
              _ItemShape(item: item, size: showName ? 26 : 34),
              if (showName) ...[
                const SizedBox(height: 2),
                Flexible(
                  child: Text(
                    item.title(locale),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 9, height: 1.15, fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Фигура предмета: круг, квадрат, ромб, треугольник, капсула, арка.
class _ItemShape extends StatelessWidget {
  const _ItemShape({required this.item, required this.size});

  final PalaceItem? item;
  final double size;

  @override
  Widget build(BuildContext context) {
    final i = item;
    if (i == null) {
      return Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
          borderRadius: BorderRadius.circular(4),
        ),
      );
    }
    return CustomPaint(size: Size(size, size), painter: _ShapePainter(i));
  }
}

class _ShapePainter extends CustomPainter {
  _ShapePainter(this.item);

  final PalaceItem item;

  @override
  void paint(Canvas canvas, Size size) {
    final fill = Paint()..color = _hex(item.color);
    final edge = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5
      ..color = _hex(item.accent);
    final r = Rect.fromLTWH(0, 0, size.width, size.height);
    switch (item.shape) {
      case 'round':
        canvas.drawOval(r, fill);
        canvas.drawOval(r.deflate(0.75), edge);
        break;
      case 'square':
        final rr = RRect.fromRectAndRadius(r, const Radius.circular(3));
        canvas.drawRRect(rr, fill);
        canvas.drawRRect(rr.deflate(0.75), edge);
        break;
      case 'diamond':
        final p = Path()
          ..moveTo(size.width / 2, 0)
          ..lineTo(size.width, size.height / 2)
          ..lineTo(size.width / 2, size.height)
          ..lineTo(0, size.height / 2)
          ..close();
        canvas.drawPath(p, fill);
        canvas.drawPath(p, edge);
        break;
      case 'triangle':
        final p = Path()
          ..moveTo(size.width / 2, 0)
          ..lineTo(size.width, size.height)
          ..lineTo(0, size.height)
          ..close();
        canvas.drawPath(p, fill);
        canvas.drawPath(p, edge);
        break;
      case 'capsule':
        final rr = RRect.fromRectAndRadius(
            Rect.fromLTWH(0, size.height * 0.2, size.width, size.height * 0.6),
            Radius.circular(size.height * 0.3));
        canvas.drawRRect(rr, fill);
        canvas.drawRRect(rr.deflate(0.75), edge);
        break;
      default: // arch
        final p = Path()
          ..moveTo(0, size.height)
          ..lineTo(0, size.height * 0.45)
          ..arcToPoint(Offset(size.width, size.height * 0.45),
              radius: Radius.circular(size.width / 2))
          ..lineTo(size.width, size.height)
          ..close();
        canvas.drawPath(p, fill);
        canvas.drawPath(p, edge);
    }
  }

  @override
  bool shouldRepaint(_ShapePainter old) => old.item.id != item.id;
}

Color _hex(String hex) {
  final clean = hex.replaceFirst('#', '');
  return Color(int.parse(clean.length == 6 ? 'FF$clean' : clean, radix: 16));
}
