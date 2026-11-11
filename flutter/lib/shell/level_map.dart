/// КАРТА УРОВНЕЙ — ВЕРНУТЬСЯ НА ПРОЙДЕННЫЙ (перенос смысла `LevelProgressMap` веба).
///
/// 🔴 С 11.11.2026 — ОБЩИЙ КОМПОНЕНТ КАРКАСА (задача 8e90ac74): в вебе тропинка стояла у 76 игр, в нативе
/// осталась у трёх «Судоку». Теперь её открывает пауза любой игры с лестницей ([GameShell], пункт
/// «Карта уровней» в «Уровни · Сложность»), звёзды пишет [LevelLadder.win]. Родилась здесь, в «Судоку»:
///
/// 🔴 ПОВОД — сверка «веб против натива» 138f7818, строки 101 («Судоку»), 199 («Самурай»),
/// 303 («Фрактал»), все «высокая»; задача b5df5096 п.4. В нативе уровень только рос сам
/// (`LevelLadder.win`), вернуться на лёгкий, переиграть пройденный, увидеть путь — было нельзя,
/// хотя `LevelLadder.pick` в каркасе есть. Денис: «тропинки прохождения уровней как это в
/// играх делают (там можно вернуться к боссу или какой-то интересной части)».
///
/// Лента узлов 1…последний: пройденные (≤ лучшего) нажимаются, текущий выделен, дальше —
/// закрыто; звёзды — общая запись с вебом (`psygames_<игра>_stars_<профиль>`, `levelStars.ts`):
/// победа пишет лучшее, карта читает. Нажатие отдаёт номер уровня; что с ним делать (`pick` +
/// раздача, вопрос «Заново?» при живой партии) — решает экран. Потолок (`best`) выбор не
/// трогает — как у веба.
library;

import 'package:flutter/material.dart';

import 'game_colors.dart';
import 'l10n.dart';
import 'shared_level_store.dart' show decodeLevelStars, encodeLevelStars;
import 'shared_state.dart';

String _starsKey(SharedState state, String gameId) => '${SharedState.prefix}${gameId}_stars_${state.activeProfile}';

/// Звёзды по уровням (общая запись с вебом, `levelStars.ts`); пусто — побед со звёздами не было.
Map<int, int> levelStarsOf(SharedState state, String gameId) => decodeLevelStars(state.get(_starsKey(state, gameId)));

/// Записать звёзды пройденного уровня — как `saveLevelStars` веба: держится лучший результат.
/// Победы пишет [LevelLadder.win] сам; эта функция — для проб и переноса.
Future<void> saveLevelStars(SharedState state, String gameId, int level, int stars) async {
  final map = Map<int, int>.of(levelStarsOf(state, gameId));
  if ((map[level] ?? 0) >= stars) return;
  map[level] = stars;
  await state.set(_starsKey(state, gameId), encodeLevelStars(map));
}

/// Открыть карту; вернёт выбранный пройденный уровень или null (закрыли / нажали текущий).
Future<int?> showLevelMap(
  BuildContext context, {
  required int current,
  required int best,
  required int last,
  Map<int, int> stars = const {},
  bool open = false,
}) {
  return showModalBottomSheet<int>(
    context: context,
    showDragHandle: true,
    builder: (ctx) => _LevelMap(current: current, best: best, last: last, stars: stars, open: open),
  );
}

class _LevelMap extends StatefulWidget {
  const _LevelMap({required this.current, required this.best, required this.last, required this.stars, this.open = false});

  final int current, best, last;
  final Map<int, int> stars;

  /// Лестница без потолка: заголовок «Уровень N» без «из …», впереди — несколько закрытых узлов.
  final bool open;

  @override
  State<_LevelMap> createState() => _LevelMapState();
}

class _LevelMapState extends State<_LevelMap> {
  static const _node = 56.0;
  late final ScrollController _scroll;

  @override
  void initState() {
    super.initState();
    // Лента сама встаёт на текущем уровне — как у веба.
    _scroll = ScrollController(initialScrollOffset: ((widget.current - 3) * _node).clamp(0, double.infinity));
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final last = widget.last < widget.best ? widget.best : widget.last;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(
            widget.open ? '${L.t('level')} ${widget.current}' : L.f('levelOfMax', {'n': '${widget.current}', 'max': '$last'}),
            key: const Key('level-map-title'),
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 4),
          Text(L.t('tapNodeToReplay'), style: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant)),
          const SizedBox(height: 12),
          SizedBox(
            height: _node + 18,
            child: ListView.builder(
              key: const Key('level-map'),
              controller: _scroll,
              scrollDirection: Axis.horizontal,
              itemCount: last,
              itemExtent: _node,
              itemBuilder: (context, i) {
                final n = i + 1;
                final passed = n <= widget.best;
                final isCurrent = n == widget.current;
                final s = widget.stars[n] ?? 0;
                return Column(mainAxisSize: MainAxisSize.min, children: [
                  Material(
                    shape: CircleBorder(
                      side: BorderSide(color: isCurrent ? scheme.primary : Colors.transparent, width: 2.5),
                    ),
                    color: passed ? scheme.primaryContainer : scheme.surfaceContainerHighest,
                    child: InkWell(
                      key: Key('level-node-$n'),
                      customBorder: const CircleBorder(),
                      // Закрытые узлы не нажимаются; текущий — тоже: он и так в игре.
                      onTap: passed && !isCurrent ? () => Navigator.of(context).pop(n) : null,
                      child: SizedBox(
                        width: 44,
                        height: 44,
                        child: Center(
                          child: passed
                              ? Text('$n',
                                  style: TextStyle(
                                    fontWeight: isCurrent ? FontWeight.w800 : FontWeight.w600,
                                    color: scheme.onPrimaryContainer,
                                  ))
                              : Icon(Icons.lock_outline, size: 16, color: scheme.outline),
                        ),
                      ),
                    ),
                  ),
                  SizedBox(
                    height: 16,
                    child: s > 0
                        ? Text('★' * s, key: Key('level-stars-$n'), style: TextStyle(fontSize: 11, color: GameColors.of(context).reward))
                        : null,
                  ),
                ]);
              },
            ),
          ),
        ]),
      ),
    );
  }
}
