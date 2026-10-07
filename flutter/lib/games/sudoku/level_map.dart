/// КАРТА УРОВНЕЙ — ВЕРНУТЬСЯ НА ПРОЙДЕННЫЙ (перенос смысла `LevelProgressMap` веба).
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

import 'dart:convert';

import 'package:flutter/material.dart';

import '../../shell/l10n.dart';
import '../../shell/shared_state.dart';

String _starsKey(SharedState state, String gameId) => '${SharedState.prefix}${gameId}_stars_${state.activeProfile}';

/// Звёзды победы — формулы веба (проп `stars` у `LevelCleared`). Подсказка карты обещает
/// «переиграть и добрать звёзды» — без записи с натива это была бы неправда.
int sudokuStars(int errors) => errors == 0 ? 3 : errors <= 2 ? 2 : 1;   // sudoku.tsx
int fractalStars(int errors) => errors == 0 ? 3 : errors <= 3 ? 2 : 1;   // sudoku-fractal.tsx
int samuraiStars(int errors, int hints) =>   // sudoku-samurai.tsx, starsFor
    errors == 0 && hints == 0 ? 3 : errors <= 2 && hints <= 1 ? 2 : 1;

/// Звёзды по уровням (общая запись с вебом, `levelStars.ts`); пусто — побед со звёздами не было.
Map<int, int> levelStarsOf(SharedState state, String gameId) {
  final raw = state.get(_starsKey(state, gameId));
  if (raw == null) return const {};
  try {
    final m = (jsonDecode(raw) as Map).cast<String, Object?>();
    return {
      for (final e in m.entries)
        if (int.tryParse(e.key) != null && e.value is num) int.parse(e.key): (e.value as num).toInt(),
    };
  } catch (_) {
    return const {};   // битая запись — без звёзд, карта цела
  }
}

/// Записать звёзды пройденного уровня — как `saveLevelStars` веба: держится лучший результат.
Future<void> saveLevelStars(SharedState state, String gameId, int level, int stars) async {
  final map = Map<int, int>.of(levelStarsOf(state, gameId));
  if ((map[level] ?? 0) >= stars) return;
  map[level] = stars;
  await state.set(_starsKey(state, gameId), jsonEncode({for (final e in map.entries) '${e.key}': e.value}));
}

/// Открыть карту; вернёт выбранный пройденный уровень или null (закрыли / нажали текущий).
Future<int?> showLevelMap(
  BuildContext context, {
  required int current,
  required int best,
  required int last,
  Map<int, int> stars = const {},
}) {
  return showModalBottomSheet<int>(
    context: context,
    showDragHandle: true,
    builder: (ctx) => _LevelMap(current: current, best: best, last: last, stars: stars),
  );
}

class _LevelMap extends StatefulWidget {
  const _LevelMap({required this.current, required this.best, required this.last, required this.stars});

  final int current, best, last;
  final Map<int, int> stars;

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
            L.f('levelOfMax', {'n': '${widget.current}', 'max': '$last'}),
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
                        ? Text('★' * s, key: Key('level-stars-$n'), style: const TextStyle(fontSize: 11, color: Color(0xFFEF9F27)))
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
