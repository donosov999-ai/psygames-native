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
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'model.dart';
import 'puzzle.dart';

/// ЭКРАН «ОЧЕРЕДИ ЗВЕРЕЙ» — раздел «Сортировки», движок MindLab (решение Дениса
/// 30.09.2026: «добавляем, потом доработаем»).
///
/// Вверху — подсказки «🦁 ➜ 🦊» (стрелка значит «раньше»), в середине — очередь,
/// внизу — звери, которых ещё не поставили. Нажатие ставит зверя следующим; если
/// по подсказкам перед ним кто-то ещё не стоит, ход не проходит и считается
/// ошибкой — зверь коротко краснеет, чтобы отказ был виден, а не молча.
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

  /// Раздать партию текущей ступени. Движок иногда не добивается единственного
  /// порядка — тогда раздаём заново (на 1800 пробных задачах такого не было ни разу).
  void _deal() {
    _autoNext?.cancel();
    final n = queueSizeFor(_ladder.level);
    ({AnimalQueue game, List<int> order})? g;
    for (var i = 0; i < 20 && g == null; i += 1) {
      g = generateQueue(n, _rnd);
    }
    _game = g!.game;
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
   * РАЗБОР — общим решателем каркаса, как у ханоя (`AnimalQueuePuzzle`), и у
   * каждого шага названный приём: первым встаёт тот, на кого не указывает ни
   * одна стрелка «раньше»; дальше — тот, чьи «раньше» уже стоят. Без имени
   * приёма разбор был бы показом ответа.
   */
  Future<void> _openLesson() async {
    final g = _game;
    if (g == null) return;
    final from = AnimalQueue(g.animals, g.clues);
    final raw = await BoardLesson(const AnimalQueuePuzzle(), from).steps();
    if (!mounted || raw.isEmpty) return;
    final steps = [
      for (var i = 0; i < raw.length; i += 1)
        LessonStep(
          payload: raw[i].payload,
          techniqueKey: i == 0 ? 'teachQueueFirst' : 'teachQueueNext',
          text: i == 0 ? L.t('teachQueueFirst') : L.t('teachQueueNext'),
        ),
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

/// Поле: подсказки, очередь, оставшиеся звери. Рисует и игру, и разбор.
class _QueueBoard extends StatelessWidget {
  const _QueueBoard({required this.game, required this.wrong, required this.onTap});

  final AnimalQueue game;
  final int? wrong;
  final void Function(int animal) onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final left = [
      for (var i = 0; i < game.animals.length; i += 1)
        if (!game.queue.contains(i)) i,
    ];
    Widget face(String f, double size) => Text(f, style: TextStyle(fontSize: size));
    return SingleChildScrollView(
      padding: const EdgeInsets.all(12),
      child: Column(
        children: [
          // Подсказки: «A ➜ B» — A стоит раньше B.
          Wrap(
            key: const ValueKey('aq-clues'),
            alignment: WrapAlignment.center,
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final c in game.clues)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: scheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    face(game.animals[c.before], 22),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 6),
                      child: Icon(Icons.arrow_forward, size: 18, color: scheme.primary),
                    ),
                    face(game.animals[c.after], 22),
                  ]),
                ),
            ],
          ),
          const SizedBox(height: 20),
          // Очередь: места по числу зверей, первое — слева.
          Wrap(
            key: const ValueKey('aq-queue'),
            alignment: WrapAlignment.center,
            spacing: 6,
            runSpacing: 6,
            children: [
              for (var slot = 0; slot < game.animals.length; slot += 1)
                Container(
                  width: 52,
                  height: 52,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: scheme.outline, width: slot < game.queue.length ? 2 : 1),
                  ),
                  child: slot < game.queue.length
                      ? face(game.animals[game.queue[slot]], 30)
                      : Text('${slot + 1}', style: TextStyle(color: scheme.outline)),
                ),
            ],
          ),
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
