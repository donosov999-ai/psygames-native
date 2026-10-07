import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';

import '../../shell/aux_action.dart';
import '../../shell/board_solver.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/lesson.dart';
import '../../shell/lesson_player.dart';
import '../../shell/level_ladder.dart';
import '../../shell/level_rules.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'model.dart';
import 'puzzle.dart';

/// ЭКРАН «ОЧЕРЕДИ ЗВЕРЕЙ» — раздел «Сортировки», движок MindLab (решение Дениса
/// 30.09.2026: «добавляем, потом доработаем»; доработка 02.10.2026, задача e95b7e2f).
///
/// Вверху — подсказки пяти видов, в середине — очередь от двери 🚪, внизу — звери, которых
/// ещё не поставили. Нажатие ставит зверя следующим; если с ним очередь уже не достроить,
/// ход не проходит и считается ошибкой — зверь коротко краснеет, чтобы отказ был виден.
///
/// 🔴 ДВЕРЬ НАРИСОВАНА. Денис, глядя на первую редакцию в симуляторе: «это типа очередь,
/// кто за кем идёт». Направление угадывалось по номерам клеток; теперь голова очереди —
/// у двери, и подсказка «🚪 🦁» читается без слов.
class AnimalQueueScreen extends StatefulWidget {
  const AnimalQueueScreen({super.key, required this.state, this.seed});

  final SharedState state;

  /// Зерно раздачи для проб; без него — случайная.
  final int? seed;

  @override
  State<AnimalQueueScreen> createState() => _AnimalQueueScreenState();
}

class _AnimalQueueScreenState extends State<AnimalQueueScreen> {
  late LevelLadder _ladder;
  late Random _rnd;
  AnimalQueue? _game;
  int _errors = 0;
  int? _wrong;
  Timer? _wrongTimer;
  Timer? _autoNext;

  bool get _won => _game?.done ?? false;

  @override
  void initState() {
    super.initState();
    _rnd = Random(widget.seed);
    _ladder = LevelLadder(gameId: 'animal_queue', store: SharedLevelStore(widget.state));
    _boot();
  }

  @override
  void dispose() {
    _wrongTimer?.cancel();
    _autoNext?.cancel();
    super.dispose();
  }

  Future<void> _boot() async {
    await _ladder.load();
    if (!mounted) return;
    setState(_deal);
  }

  /// Раздать партию текущей ступени. Единственность ответа генератор держит сам.
  void _deal() {
    _autoNext?.cancel();
    _game = generateQueue(_ladder.level, _rnd).game;
    _errors = 0;
    _wrong = null;
  }

  void _tap(int animal) {
    final game = _game;
    if (game == null || _won || game.queue.contains(animal)) return;
    final next = game.play(animal);
    if (next == null) {
      _wrongTimer?.cancel();
      setState(() {
        _errors += 1;
        _wrong = animal;
      });
      _wrongTimer = Timer(const Duration(milliseconds: 450), () {
        if (mounted) setState(() => _wrong = null);
      });
      return;
    }
    setState(() => _game = next);
    if (next.done) {
      _autoNext = Timer(const Duration(milliseconds: 1400), () {
        if (mounted && _won) _next();
      });
    }
  }

  Future<void> _next() async {
    _autoNext?.cancel();
    await _ladder.win(errors: _errors);
    if (!mounted) return;
    setState(_deal);
  }

  void _restart() => setState(() {
        _autoNext?.cancel();
        final g = _game;
        if (g != null) _game = AnimalQueue(g.animals, g.clues);
        _errors = 0;
        _wrong = null;
      });

  /// Звёзды по ошибкам: без ошибок — три, одна — две, больше — одна.
  int get _stars => _errors == 0 ? 3 : (_errors == 1 ? 2 : 1);

  /*
   * РАЗБОР — общим решателем каркаса, как у ханоя (`AnimalQueuePuzzle`), и у каждого шага
   * названная причина (`queueLessonKey`).
   */
  Future<void> _openLesson() async {
    final g = _game;
    if (g == null) return;
    final from = AnimalQueue(g.animals, g.clues);
    final raw = await BoardLesson(const AnimalQueuePuzzle(), from).steps();
    if (!mounted || raw.isEmpty) return;
    AnimalQueue before(int i) =>
        i == 0 ? from : (raw[i - 1].payload as ({int move, AnimalQueue after})).after;
    final steps = [
      for (var i = 0; i < raw.length; i += 1)
        () {
          final key = queueLessonKey(before(i), (raw[i].payload as ({int move, AnimalQueue after})).move);
          return LessonStep(payload: raw[i].payload, techniqueKey: key, text: L.t(key));
        }(),
    ];
    LessonUsed.mark();
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => LessonPlayerScreen(
        title: L.t('animalQueue'),
        steps: steps,
        board: (context, side, shown) {
          final at = shown == 0
              ? from
              : (steps[(shown - 1).clamp(0, steps.length - 1)].payload
                      as ({int move, AnimalQueue after}))
                  .after;
          return _QueueBoard(game: at, wrong: null, onTap: (_) {});
        },
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final game = _game;
    if (game == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return GameShell(
      title: L.t('animalQueue'),
      onLesson: _openLesson,
      levelRule: LevelRuleSpot(
        gameId: 'animal_queue',
        level: _ladder.level,
        state: widget.state,
        calm: game.queue.isEmpty || _won,
      ),
      hud: [
        HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(label: L.t('errors'), value: '$_errors', icon: Icons.error_outline),
      ],
      field: (context, h) => _QueueBoard(game: game, wrong: _wrong, onTap: _tap),
      auxRow: AuxBar(children: [
        AuxAction(icon: Icons.refresh, label: L.t('restart'), onPressed: _restart),
      ]),
      toolbar: _won
          ? Padding(
              padding: const EdgeInsets.all(12),
              child: FilledButton.icon(
                key: const ValueKey('aq-next'),
                onPressed: _next,
                icon: const Icon(Icons.arrow_forward),
                label: Text('${'★' * _stars} · ${L.t('level')} ${_ladder.level + 1}'),
              ),
            )
          : null,
      pauseActions: [
        PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: _restart),
      ],
    );
  }
}

/// Поле: подсказки, очередь от двери, оставшиеся звери. Рисует и игру, и разбор.
class _QueueBoard extends StatelessWidget {
  const _QueueBoard({required this.game, required this.wrong, required this.onTap});

  final AnimalQueue game;
  final int? wrong;
  final void Function(int animal) onTap;

  /// Подпись подсказки для чтеца экрана — словами, а не значками.
  static String clueLabel(QueueClue c, List<String> animals) {
    final a = animals[c.a];
    final b = c.b >= 0 ? animals[c.b] : '';
    switch (c.kind) {
      case ClueKind.first:
        return L.f('aqClueFirst', {'a': a});
      case ClueKind.last:
        return L.f('aqClueLast', {'a': a});
      case ClueKind.next:
        return L.f('aqClueNext', {'a': a, 'b': b});
      case ClueKind.before:
        return L.f('aqClueBefore', {'a': a, 'b': b});
      case ClueKind.apart:
        return L.f('aqClueApart', {'a': a, 'b': b});
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final left = [
      for (var i = 0; i < game.animals.length; i += 1)
        if (!game.queue.contains(i)) i,
    ];
    Widget face(String f, double size) => Text(f, style: TextStyle(fontSize: size));
    Widget sign(IconData icon, Color color) => Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6),
          child: Icon(icon, size: 18, color: color),
        );
    List<Widget> clueBody(QueueClue c) {
      final a = face(game.animals[c.a], 22);
      switch (c.kind) {
        case ClueKind.first:
          return [face('🚪', 20), const SizedBox(width: 4), a];
        case ClueKind.last:
          return [a, const SizedBox(width: 4), face('🏁', 20)];
        case ClueKind.next:
          return [a, sign(Icons.link, scheme.primary), face(game.animals[c.b], 22)];
        case ClueKind.before:
          return [a, sign(Icons.arrow_forward, scheme.primary), face(game.animals[c.b], 22)];
        case ClueKind.apart:
          return [a, sign(Icons.block, const Color(0xFFDC2626)), face(game.animals[c.b], 22)];
      }
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.all(12),
      child: Column(
        children: [
          Wrap(
            key: const ValueKey('aq-clues'),
            alignment: WrapAlignment.center,
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final c in game.clues)
                Semantics(
                  label: clueLabel(c, game.animals),
                  excludeSemantics: true,
                  child: Container(
                    key: ValueKey('aq-clue-${c.kind.name}-${c.a}-${c.b}'),
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: scheme.surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(mainAxisSize: MainAxisSize.min, children: clueBody(c)),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 20),
          // Очередь от двери: клетка сжимается по ширине поля, чтобы десять зверей встали в
          // один ряд и на узком телефоне — нажимают не по ней, а по зверям ниже.
          LayoutBuilder(builder: (context, box) {
            final n = game.animals.length;
            const gap = 4.0;
            const doorW = 30.0;
            final slot = min(52.0, ((box.maxWidth - doorW - gap * n) / n).floorToDouble());
            return Row(
              key: const ValueKey('aq-queue'),
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Semantics(
                  label: L.t('aqDoor'),
                  child: SizedBox(
                    key: const ValueKey('aq-door'),
                    width: doorW,
                    child: Center(child: face('🚪', min(26, slot * 0.7))),
                  ),
                ),
                for (var place = 0; place < n; place += 1)
                  Padding(
                    padding: const EdgeInsets.only(left: gap),
                    child: Container(
                      width: slot,
                      height: slot,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(slot / 4),
                        border: Border.all(color: scheme.outline, width: place < game.queue.length ? 2 : 1),
                      ),
                      child: place < game.queue.length
                          ? face(game.animals[game.queue[place]], slot * 0.58)
                          : Text('${place + 1}', style: TextStyle(color: scheme.outline, fontSize: min(14, slot * 0.4))),
                    ),
                  ),
              ],
            );
          }),
          const SizedBox(height: 24),
          // Кого ещё не поставили.
          Wrap(
            alignment: WrapAlignment.center,
            spacing: 12,
            runSpacing: 12,
            children: [
              for (final i in left)
                Semantics(
                  button: true,
                  label: game.animals[i],
                  child: InkWell(
                    key: ValueKey('aq-animal-$i'),
                    borderRadius: BorderRadius.circular(16),
                    onTap: () => onTap(i),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 150),
                      width: 72,
                      height: 72,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: wrong == i ? const Color(0xFFFECACA) : scheme.surfaceContainerHighest,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: wrong == i ? const Color(0xFFDC2626) : scheme.outlineVariant, width: 2),
                      ),
                      child: face(game.animals[i], 40),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
