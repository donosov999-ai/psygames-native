import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';

import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/session_report.dart';
import '../../shell/shared_state.dart';
import '../chess_common/board.dart';
import 'bands.dart';
import 'board_frame.dart';
import 'positions.dart';
import 'screen.dart' show ChessAssist;
import 'series.dart';
import 'series_run.dart';
import 'series_strings.dart';

/// Врезка между блоками — 2,5 с, в замер не входит (веб `INTERLUDE_MS`).
const int seriesInterludeMs = 2500;

/// Показ позиции перед блоком «память» — 8 с, тоже вне замера (`RECALL_EXPOSE_MS`).
const int seriesRecallExposeMs = 8000;

enum _Stage { ask, interlude, ready, memorize, result }

const Map<String, String> _glyph = {
  'wk': '♔', 'wq': '♕', 'wr': '♖', 'wb': '♗', 'wn': '♘', 'wp': '♙', //
  'bk': '♚', 'bq': '♛', 'br': '♜', 'bb': '♝', 'bn': '♞', 'bp': '♟',
};

/// ЭКРАН СЕРИИ: три блока подряд по ОДНОЙ позиции — «цвет полей», «ход коня»,
/// «память о позиции» — и разбор T₁ / T₂ − T₁ / T₃ − T₁.
///
/// 🔴 ДОСКИ ВО ВРЕМЯ ВОПРОСОВ НЕТ, И ЭТО НЕ ЭКОНОМИЯ МЕСТА. Нарисуй её — и блок
/// «поле» перестанет мерить работу в уме: цвет клеток видно глазами. Позицию
/// показывают дважды и оба раза ВНЕ часов: во врезке и перед блоком «память».
/// Подсказка «пустая доска» (настройка) рисует клетки без фигур.
///
/// 🔴 ЧАСЫ БЛОКА — ИГРОВЫЕ: стоят под паузой и не идут во врезке и на показе
/// позиции; иначе в разность попало бы чтение правила.
class ChessBlindSeriesScreen extends StatefulWidget {
  const ChessBlindSeriesScreen({
    super.key,
    required this.state,
    this.corpus,
    this.text,
    this.seed,
    this.clock,
  });

  final SharedState state;
  final PositionCorpus? corpus;

  /// Пробы: словарь с диска.
  final ChessBlindText? text;

  /// Пробы: повторимая позиция и вопросы.
  final int? seed;

  /// Пробы: поддельные игровые часы, мс.
  final int Function()? clock;

  @override
  State<ChessBlindSeriesScreen> createState() => _ChessBlindSeriesScreenState();
}

class _ChessBlindSeriesScreenState extends State<ChessBlindSeriesScreen> {
  final Stopwatch _watch = Stopwatch()..start();
  Timer? _ticker;
  ChessBlindText? _text;
  PositionCorpus? _corpus;
  String? _error;
  late final ChessAssist _assist = ChessAssist.read(widget.state);
  late ChessSeriesProgress _progress = ChessSeriesProgress.parse(
    widget.state.get(ChessSeriesProgress.keyFor(widget.state.activeProfile)),
  );

  _Stage _stage = _Stage.ask;
  List<String?> _squares = List<String?>.filled(64, null);
  int _level = 1;
  int _seed = 1;
  int _block = 0;
  List<SeriesQuestion> _questions = const [];
  int _step = 0;
  int _errors = 0;
  SeriesRun? _run;
  bool _blockOpen = false;
  int _blockStart = 0;
  int _stageStart = 0;
  int _shownMs = 0;
  final List<SeriesQuestion> _recallMisses = [];
  SeriesRun? _finished;
  ({bool raised, String weakest, PieceBand band, int runsLeft})? _move;

  int _raw() => widget.clock?.call() ?? _watch.elapsedMilliseconds;
  int _pausedTotal = 0;
  int? _pausedSince;
  int _now() {
    final since = _pausedSince;
    return _raw() - _pausedTotal - (since == null ? 0 : _raw() - since);
  }

  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    try {
      final text = widget.text ?? await ChessBlindText.load();
      final corpus = widget.corpus ?? await PositionCorpus.load();
      if (!mounted) return;
      _text = text;
      _corpus = corpus;
      _begin();
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = "${L.t('chessBlind')}: $e");
    }
  }

  @override
  void dispose() {
    _ticker?.cancel();
    // 🔴 УХОД МИМО КНОПОК серию не теряет: сыгранные блоки — время человека.
    // Пишем как при выходе кнопкой — без разностей и без движения уровня.
    final run = _run;
    if (run != null) {
      final partial = _blockOpen
          ? run.withBlock(_blockRecord(done: false))
          : run;
      if (partial.blocks.isNotEmpty) _report(partial);
    }
    super.dispose();
  }

  /// Старт серии. Позиция берётся ОДИН раз на все три блока — в этом весь замер.
  void _begin() {
    final corpus = _corpus;
    if (corpus == null) return;
    final entry = seriesEntry(_progress);
    _seed = widget.seed ?? DateTime.now().millisecondsSinceEpoch % 100000;
    final picked = corpus.pickRandom(entry.band, Random(_seed));
    _pausedTotal = 0;
    _pausedSince = null;
    setState(() {
      _squares = coreSquaresFromFen(picked.fen);
      _level = entry.level;
      _run = SeriesRun(
        gameType: seriesGameType,
        level: entry.level,
        planned: chessSeriesPlan,
      );
      _finished = null;
      _move = null;
      _recallMisses.clear();
      _openBlock(0);
    });
    _ticker?.cancel();
    _ticker = Timer.periodic(const Duration(milliseconds: 100), (_) => _tick());
  }

  List<SeriesQuestion> _build(int index) => buildBlockQuestions(
    squares: _squares,
    level: _level,
    blockIndex: index,
    random: lcg(_seed + index * 7919),
  );

  /// Открыть блок. У «памяти» часы ждут, пока человек посмотрит позицию.
  void _openBlock(int index) {
    _block = index;
    _questions = _build(index);
    _step = 0;
    _errors = 0;
    if (blockKeyAt(index) == 'recall') {
      _stage = _Stage.ready;
      _blockOpen = false;
    } else {
      _startClock();
    }
  }

  void _startClock() {
    _stage = _Stage.ask;
    _blockStart = _now();
    _shownMs = 0;
    _blockOpen = true;
  }

  SeriesBlock _blockRecord({required bool done}) => SeriesBlock(
    key: blockKeyAt(_block),
    timeMs: _now() - _blockStart,
    errors: _errors,
    done: done,
  );

  void _tick() {
    if (!mounted) return;
    final onTop = ModalRoute.of(context)?.isCurrent ?? true;
    if (!onTop) {
      _pausedSince ??= _raw();
      return;
    }
    final since = _pausedSince;
    if (since != null) {
      _pausedTotal += _raw() - since;
      _pausedSince = null;
    }
    final now = _now();
    switch (_stage) {
      case _Stage.ask:
        if (_blockOpen) _shownMs = now - _blockStart;
      case _Stage.interlude:
        if (now - _stageStart >= seriesInterludeMs) _openBlock(_block + 1);
      case _Stage.memorize:
        if (now - _stageStart >= seriesRecallExposeMs) _startClock();
      case _Stage.ready:
      case _Stage.result:
        break;
    }
    setState(() {});
  }

  /// Ответ «да»/«нет». Одно касание — во всех трёх блоках одинаково.
  void _answer(bool said) {
    final open = _stage == _Stage.ask && _blockOpen;
    if (!open || _step >= _questions.length) return;
    final q = _questions[_step];
    final hit = q.answer == said;
    setState(() {
      _step++;
      if (!hit) {
        _errors++;
        if (q.kind == 'recall') _recallMisses.add(q);
      }
      if (_step >= _questions.length) _closeBlock(done: true);
    });
  }

  void _closeBlock({required bool done}) {
    final run = _run;
    if (run == null || !_blockOpen) return;
    _blockOpen = false;
    final updated = run.withBlock(_blockRecord(done: done));
    _run = updated;
    final last = _block >= chessSeriesPlan.length - 1;
    if (done && !last) {
      _stage = _Stage.interlude;
      _stageStart = _now();
      return;
    }
    _finish(updated);
  }

  /// Уход посреди серии: блоки пишем как есть, но без разностей.
  void _leave() {
    final run = _run;
    if (run == null) return;
    if (_blockOpen) {
      setState(() => _closeBlock(done: false));
      return;
    }
    setState(() => _finish(run));
  }

  void _finish(SeriesRun run) {
    final outcome = afterSeriesRun(_progress, run);
    _progress = outcome.progress;
    widget.state.set(
      ChessSeriesProgress.keyFor(widget.state.activeProfile),
      outcome.progress.encode(),
    );
    _finished = run;
    _move = (
      raised: outcome.raised,
      weakest: outcome.weakest,
      band: outcome.band,
      runsLeft: outcome.runsLeft,
    );
    _run = null;
    _stage = _Stage.result;
    _report(run);
  }

  void _report(SeriesRun run) {
    final s = seriesSession(run);
    SessionReport.send(
      gameType: seriesGameType,
      score: s.score,
      timeSeconds: s.timeSeconds,
      errors: s.errors,
      mode: s.mode,
      difficulty: 'L${run.level}',
      details: s.details,
    );
  }

  String _title(String key) => _text!.t(switch (key) {
    'square' => 'blockSquare',
    'knight' => 'blockKnight',
    _ => 'blockRecall',
  });

  String _rule(String key) => switch (key) {
    'square' => _text!.t('ruleSquare'),
    'knight' => _text!.t('ruleKnight', {'moves': knightMovesForLevel(_level)}),
    _ => _text!.t('ruleRecall'),
  };

  String _name(int core) => '${'abcdefgh'[core % 8]}${core ~/ 8 + 1}';

  String _claim(String? code) =>
      code == null ? _text!.t('emptySquare') : (_glyph[code] ?? code);

  /// Вопрос по частям: фигура в «памяти» — картинкой, той же, что на доске.
  Widget _question(SeriesQuestion q) {
    final t = _text!;
    const style = TextStyle(fontSize: 22, fontWeight: FontWeight.w700);
    switch (q.kind) {
      case 'square':
        return Text(
          t.t('askSquare', {'a': _name(q.a!), 'b': _name(q.b!)}),
          textAlign: TextAlign.center,
          style: style,
        );
      case 'knight':
        return Text(
          t.t('askKnight', {
            'from': _name(q.from!),
            'to': _name(q.to!),
            'moves': q.moves!,
          }),
          textAlign: TextAlign.center,
          style: style,
        );
      default:
        final claim = q.claim;
        if (claim == null) {
          return Text(
            t.t('askRecall', {
              'square': _name(q.square!),
              'piece': _claim(null),
            }),
            textAlign: TextAlign.center,
            style: style,
          );
        }
        const mark = '\u0001';
        final parts = t
            .t('askRecall', {'square': _name(q.square!), 'piece': mark})
            .split(mark);
        return Wrap(
          alignment: WrapAlignment.center,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            if (parts.first.isNotEmpty) Text(parts.first, style: style),
            ChessPieceImage(
              key: Key('cbs-claim-$claim'),
              type: claim[1].toUpperCase(),
              white: claim[0] == 'w',
              size: 34,
            ),
            if (parts.length > 1 && parts[1].isNotEmpty)
              Text(parts[1], style: style),
          ],
        );
    }
  }

  Widget _board(double side, {required bool empty}) => ChessBoardFrame(
    side: side,
    coords: _assist.coords,
    board: ChessBoardView(
      side: side,
      keyPrefix: 'cbs-sq',
      cornerCoords: !_assist.coords,
      pieces: empty
          ? const {}
          : {
              for (var i = 0; i < 64; i++)
                if (_squares[i] != null)
                  (7 - i ~/ 8) * 8 + i % 8: BoardPiece(
                    _squares[i]![1].toUpperCase(),
                    white: _squares[i]![0] == 'w',
                  ),
            },
    ),
  );

  double _side(BoxConstraints box, double h, double reserved) => min(
    // Поля прокрутки (2 × 12) и запас: доска с подписями вылезала на 8 px
    // вправо на 390 px (проба серии, 01.10.2026).
    box.maxWidth - 32 - (_assist.coords ? ChessBoardFrame.labels : 0),
    h - reserved,
  ).clamp(120.0, 520.0);

  @override
  Widget build(BuildContext context) {
    final t = _text;
    final asking =
        _stage == _Stage.ask && _step < _questions.length && _blockOpen;
    return GameShell(
      title: L.t('chessBlind'),
      hud: [
        if (t != null && _stage != _Stage.result) ...[
          HudItem(
            label: L.t('chessQuestionShort'),
            value: '${min(_step + 1, _questions.length)}/${_questions.length}',
            icon: Icons.help_outline,
          ),
          HudItem(
            label: L.t('time'),
            value: '${(_shownMs / 1000).toStringAsFixed(1)}${L.t('secShort')}',
            icon: Icons.timer_outlined,
          ),
        ],
      ],
      pauseActions: [
        if (t != null && _stage != _Stage.result) ...[
          PauseAction(
            label: L.t('restart'),
            icon: Icons.refresh,
            onPressed: _begin,
          ),
          PauseAction(
            label: L.t('exitConfirmLeave'),
            icon: Icons.flag_outlined,
            onPressed: _leave,
          ),
        ],
      ],
      toolbar: asking
          ? Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  FilledButton(
                    key: const Key('cbs-yes'),
                    onPressed: () => _answer(true),
                    style: FilledButton.styleFrom(
                      minimumSize: const Size(130, 56),
                      backgroundColor: const Color(0xFF166534),
                    ),
                    child: Text(
                      t!.t('answerYes'),
                      style: const TextStyle(fontSize: 18),
                    ),
                  ),
                  FilledButton(
                    key: const Key('cbs-no'),
                    onPressed: () => _answer(false),
                    style: FilledButton.styleFrom(
                      minimumSize: const Size(130, 56),
                      backgroundColor: const Color(0xFF7F1D1D),
                    ),
                    child: Text(
                      t.t('answerNo'),
                      style: const TextStyle(fontSize: 18),
                    ),
                  ),
                ],
              ),
            )
          : null,
      field: (context, h) {
        if (t == null) {
          return Center(
            child: Text(
              _error ?? L.t('label_ready'),
              key: const Key('cbs-status'),
            ),
          );
        }
        return LayoutBuilder(
          builder: (context, box) {
            final key = blockKeyAt(_block);
            final line =
                '${t.t('blockOf', {'n': _block + 1, 'total': chessSeriesPlan.length})} · ${_title(key)}';
            switch (_stage) {
              case _Stage.ask:
                if (_questions.isEmpty || _step >= _questions.length) {
                  return const SizedBox.shrink();
                }
                return SingleChildScrollView(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    children: [
                      Text(line, key: const Key('cbs-block')),
                      const SizedBox(height: 12),
                      KeyedSubtree(
                        key: const Key('cbs-question'),
                        child: _question(_questions[_step]),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _rule(key),
                        key: const Key('cbs-rule'),
                        textAlign: TextAlign.center,
                      ),
                      if (_assist.board) ...[
                        const SizedBox(height: 10),
                        _board(_side(box, h, 170), empty: true),
                      ],
                    ],
                  ),
                );
              case _Stage.interlude:
                final next = blockKeyAt(_block + 1);
                return SingleChildScrollView(
                  key: const Key('cbs-interlude'),
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    children: [
                      const Icon(Icons.swap_horiz, size: 40),
                      Text(
                        t.t('ruleChanges'),
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      Text(
                        _title(next),
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      Text(_rule(next), textAlign: TextAlign.center),
                      Text(t.t('samePosition'), textAlign: TextAlign.center),
                      const SizedBox(height: 8),
                      _board(_side(box, h, 170), empty: false),
                    ],
                  ),
                );
              case _Stage.ready:
                return Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(line),
                      const SizedBox(height: 8),
                      Text(
                        L.t('label_ready'),
                        style: const TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      Text(t.t('memorize')),
                      const SizedBox(height: 16),
                      FilledButton(
                        key: const Key('cbs-memorize-start'),
                        onPressed: () => setState(() {
                          _stage = _Stage.memorize;
                          _stageStart = _now();
                        }),
                        style: FilledButton.styleFrom(
                          minimumSize: const Size(180, 52),
                        ),
                        child: Text(L.t('start')),
                      ),
                    ],
                  ),
                );
              case _Stage.memorize:
                final left = max(
                  0,
                  seriesRecallExposeMs - (_now() - _stageStart),
                );
                final side = _side(box, h, 90);
                return Column(
                  children: [
                    Text(
                      '${t.t('memorize')} · ${(left / 1000).ceil()}${L.t('secShort')}',
                      key: const Key('cbs-memorize'),
                    ),
                    SizedBox(
                      width: side,
                      child: LinearProgressIndicator(
                        value: left / seriesRecallExposeMs,
                        minHeight: 6,
                      ),
                    ),
                    const SizedBox(height: 6),
                    _board(side, empty: false),
                  ],
                );
              case _Stage.result:
                return _result(t);
            }
          },
        );
      },
    );
  }

  Widget _result(ChessBlindText t) {
    final run = _finished;
    final move = _move;
    if (run == null || move == null) return const SizedBox.shrink();
    final diffs = seriesDiffs(run);
    String sec(int ms) => '${(ms / 1000).toStringAsFixed(1)} ${L.t('seconds')}';
    String signed(int ms) => '${ms > 0 ? '+' : ''}${sec(ms)}';
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            t.t('seriesDone'),
            key: const Key('cbs-result'),
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 10),
          for (var i = 0; i < run.blocks.length; i++)
            Text(
              '${i + 1}. ${_title(run.blocks[i].key)}: ${sec(run.blocks[i].timeMs)}',
              key: Key('cbs-time-$i'),
            ),
          const SizedBox(height: 10),
          if (diffs == null)
            Text(
              t.t('notFinished'),
              key: const Key('cbs-not-finished'),
              style: const TextStyle(color: Color(0xFFF43F5E)),
            )
          else ...[
            Text(
              '${t.t('coordSpeed')}: ${sec(run.blocks.first.timeMs)}',
              key: const Key('cbs-t1'),
            ),
            Text(
              '${t.t('knightCost')}: ${signed(diffs['knight_minus_square'] ?? 0)}',
              key: const Key('cbs-knight-cost'),
            ),
            Text(
              '${t.t('holdCost')}: ${signed(diffs['recall_minus_square'] ?? 0)}',
              key: const Key('cbs-hold-cost'),
            ),
          ],
          const SizedBox(height: 10),
          Text(
            move.raised
                ? t.t('levelUp', {'min': move.band.min, 'max': move.band.max})
                : t.t('heldBy', {
                    'block': _title(move.weakest),
                    'runs': move.runsLeft,
                  }),
            key: const Key('cbs-level-move'),
          ),
          // Что стояло на самом деле там, где память подвела.
          for (final q in _recallMisses)
            Text('${_name(q.square!)}: ${_claim(q.truth)}'),
          const SizedBox(height: 16),
          FilledButton(
            key: const Key('cbs-again'),
            onPressed: _begin,
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(52),
            ),
            child: Text(t.t('entry')),
          ),
        ],
      ),
    );
  }
}
