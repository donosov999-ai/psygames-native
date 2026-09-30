import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';

import '../../shell/game_preset.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import '../chess_common/board.dart';
import 'game.dart';
import 'ladder.dart';
import 'options.dart';
import 'positions.dart';
import 'questions.dart';
import 'series_screen.dart';

/// Тайминги показа ходов вслепую — числа веба (`beginMask`, chess-blind.tsx).
const int blindFirstMs = 600;
const int blindStepMs = 1400;
const int blindMoveAtMs = 450;
const int blindHighlightMs = 900;
const int blindTailMs = 400;
const int blindNoMovesMs = 800;

/// Сколько держится итог ответа, прежде чем идёт следующий вопрос (веб).
const int revealPickRightMs = 700;
const int revealPickWrongMs = 1400;
const int revealLocateRightMs = 450;
const int revealLocateWrongMs = 1000;

/// 🔴 КЛЮЧИ, КОТОРЫХ СБОРЩИК СЛОВАРЯ НЕ ВИДИТ В ВЫЗОВАХ — СПИСКОМ. Имя фигуры
/// собирается из стороны и вида (`chessPc` + W/B + K…P), подпись вопроса стоит
/// в развилке, а `dart format` рвёт `L.t(` переносом строки — регулярка
/// `flutter/tools/embed-l10n.mjs` такие вызовы пропускает, и экран показал бы
/// сам ключ (замер 30.09.2026: 15 ключей из 722 не попали в словарь).
const chessBlindScreenKeys = <String>[
  'chessPcWK',
  'chessPcWQ',
  'chessPcWR',
  'chessPcWB',
  'chessPcWN',
  'chessPcWP',
  'chessPcBK',
  'chessPcBQ',
  'chessPcBR',
  'chessPcBB',
  'chessPcBN',
  'chessPcBP',
  'chessCfgQuizPick',
  'chessCfgQuizLocate',
  'chessHintWhatSquareAt',
];

/// Участок лестницы словом — рубежи веба (`stageName`).
String chessBlindStage(int level) => level <= 5
    ? L.t('chessStageFlash')
    : level <= 10
    ? L.t('chessStageBlind')
    : L.t('chessStageLocate');

/// Имя клетки экрана (0 = a8): «e4».
String cbSquareName(int sq) => '${'abcdefgh'[sq % 8]}${8 - sq ~/ 8}';

/// Имя фигуры словом из общего словаря: «белый конь».
String cbPieceName(Combo c) => L.t('chessPc${c.white ? 'W' : 'B'}${c.type}');

const Map<String, String> _glyphs = {
  'Kw': '♔', 'Qw': '♕', 'Rw': '♖', 'Bw': '♗', 'Nw': '♘', 'Pw': '♙', //
  'Kb': '♚', 'Qb': '♛', 'Rb': '♜', 'Bb': '♝', 'Nb': '♞', 'Pb': '♟',
};

/// Подсказки доски: пустая доска в серии и подписи полей по краям. Ключ тот же,
/// что у веба (`core/assist.ts`), — настройка одна на обе половины.
class ChessAssist {
  const ChessAssist({this.board = false, this.coords = true});
  final bool board;
  final bool coords;

  static String keyFor(String profile) => 'psygames_chess_assist_$profile';

  static ChessAssist read(SharedState state) {
    final raw = state.get(keyFor(state.activeProfile));
    if (raw == null) return const ChessAssist();
    try {
      final j = jsonDecode(raw) as Map<String, dynamic>;
      return ChessAssist(
        board: j['board'] == true,
        coords: j['coords'] != false,
      );
    } catch (_) {
      return const ChessAssist();
    }
  }

  Future<void> write(SharedState state) => state.set(
    keyFor(state.activeProfile),
    jsonEncode({'board': board, 'coords': coords}),
  );
}

/// Что показано после ответа, пока идёт пауза до следующего вопроса.
class _Reveal {
  const _Reveal({
    required this.question,
    required this.right,
    required this.until,
    this.picked,
    this.wrongSq,
  });
  final Question question;
  final bool right;
  final int until;
  final Combo? picked;
  final int? wrongSq;
}

enum _Stage { config, play, done }

/// ЭКРАН «ДОСКИ В УМЕ» — ПАРТИЯ, на общем каркасе.
///
/// 🔴 ПЕРЕНОС ЭКРАНА, А НЕ ТОЛЬКО ПРАВИЛ. Первая редакция 24.09 перенесла
/// правила со сверкой, а экран остался заглушкой: уровень всегда 1, ходы
/// вслепую применялись разом, верный вариант стоял первой кнопкой. Здесь каждая
/// фаза веба (`startGame` → `beginMask` → `beginQuiz` → `finishGame`) имеет свою
/// строку, а числа таймингов — те же.
///
/// 🔴 ЧАСЫ ИГРОВЫЕ: всё, что идёт по времени (показ, ходы, пауза после ответа),
/// стоит, пока партия не на экране — под паузой, правилами, разбором. Веб
/// научился этому 09.09 после «пауза не паузит: игра ушла на помеху».
class ChessBlindScreen extends StatefulWidget {
  const ChessBlindScreen({
    super.key,
    required this.state,
    this.corpus,
    this.random,
    this.clock,
  });

  final SharedState state;

  /// Пробы подают корпус сами, чтобы не читать ассет.
  final PositionCorpus? corpus;
  final Random? random;

  /// Пробы: поддельные игровые часы, мс.
  final int Function()? clock;

  @override
  State<ChessBlindScreen> createState() => _ChessBlindScreenState();
}

class _ChessBlindScreenState extends State<ChessBlindScreen> {
  late final LevelLadder _ladder = LevelLadder(
    gameId: 'chess_blind',
    store: SharedLevelStore(widget.state),
    maxLevel: puzzleMaxLevel,
  );
  final Stopwatch _watch = Stopwatch()..start();
  Timer? _ticker;
  PositionCorpus? _corpus;
  String? _error;
  late ChessAssist _assist = ChessAssist.read(widget.state);

  _Stage _stage = _Stage.config;
  ChessBlindGame? _game;
  int _level = 1;
  int _phaseStart = 0;
  int _startedAt = 0;
  int _shownMoves = 0;
  int _moveNum = 0;
  int? _hlFrom;
  int? _hlTo;
  _Reveal? _reveal;
  bool _completing = false;

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
      await _ladder.load();
      final corpus = widget.corpus ?? await PositionCorpus.load();
      if (!mounted) return;
      setState(() => _corpus = corpus);
      if (GamePreset.flag('series')) {
        _openSeries(replace: true);
        return;
      }
      if (GamePreset.autostart) _start();
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = "${L.t('chessBlind')}: $e");
    }
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  void _openSeries({bool replace = false}) {
    final route = MaterialPageRoute<void>(
      builder: (_) => ChessBlindSeriesScreen(corpus: _corpus),
    );
    final nav = Navigator.of(context);
    replace ? nav.pushReplacement(route) : nav.push(route);
  }

  void _start() {
    final corpus = _corpus;
    if (corpus == null) return;
    final level = GamePreset.isPreset
        ? GamePreset.num('level', 1)
        : _ladder.level;
    final game = ChessBlindGame.start(
      level: level,
      corpus: corpus,
      random: widget.random,
    );
    _pausedTotal = 0;
    _pausedSince = null;
    setState(() {
      _game = game;
      _level = level;
      _stage = _Stage.play;
      _phaseStart = _now();
      _startedAt = _phaseStart;
      _shownMoves = 0;
      _moveNum = 0;
      _hlFrom = null;
      _hlTo = null;
      _reveal = null;
      _completing = false;
    });
    _ticker?.cancel();
    _ticker = Timer.periodic(const Duration(milliseconds: 50), (_) => _tick());
  }

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
    final g = _game;
    if (g == null || _stage != _Stage.play) return;
    final now = _now();
    final t = now - _phaseStart;
    switch (g.phase) {
      case ChessBlindPhase.expose:
        if (t >= g.params.exposeSec * 1000) {
          g.beginBlind();
          _phaseStart = now;
        }
      case ChessBlindPhase.blind:
        final n = g.moves.length;
        if (n == 0) {
          if (t >= blindNoMovesMs) _toQuiz(g, now);
          break;
        }
        var shown = 0;
        var num = 0;
        int? from;
        int? to;
        for (var i = 0; i < n; i++) {
          final base = blindFirstMs + i * blindStepMs;
          if (t >= base) num = i + 1;
          if (t >= base + blindMoveAtMs) shown = i + 1;
          if (t >= base && t < base + blindHighlightMs) {
            from = g.moves[i].from;
            to = g.moves[i].to;
          }
        }
        _moveNum = num;
        _shownMoves = shown;
        _hlFrom = from;
        _hlTo = to;
        if (t >= blindFirstMs + n * blindStepMs + blindTailMs) _toQuiz(g, now);
      case ChessBlindPhase.interference:
      case ChessBlindPhase.quiz:
      case ChessBlindPhase.done:
        final r = _reveal;
        if (r != null && now >= r.until) _reveal = null;
        if (g.phase == ChessBlindPhase.done &&
            _reveal == null &&
            !_completing) {
          _completing = true;
          _complete(g);
          return;
        }
    }
    setState(() {});
  }

  void _toQuiz(ChessBlindGame g, int now) {
    _hlFrom = null;
    _hlTo = null;
    _shownMoves = g.moves.length;
    g.beginQuiz();
    _phaseStart = now;
  }

  void _tapSquare(int sq) {
    final g = _game;
    if (g == null || _reveal != null) return;
    if (g.params.quizType == PuzzleQuizType.pick) {
      setState(() => g.select(sq));
      return;
    }
    final q = g.current;
    if (q == null) return;
    final ok = g.answer(square: sq);
    setState(() {
      _reveal = _Reveal(
        question: q,
        right: ok,
        until: _now() + (ok ? revealLocateRightMs : revealLocateWrongMs),
        wrongSq: ok ? null : sq,
      );
    });
  }

  void _pick(Combo c) {
    final g = _game;
    if (g == null || _reveal != null) return;
    final q = g.current;
    if (q == null) return;
    final ok = g.answer(piece: c.type, white: c.white);
    setState(() {
      _reveal = _Reveal(
        question: q,
        right: ok,
        picked: c,
        until: _now() + (ok ? revealPickRightMs : revealPickWrongMs),
      );
    });
  }

  Future<void> _complete(ChessBlindGame g) async {
    _ticker?.cancel();
    final seconds = ((_now() - _startedAt) / 1000).round();
    final score = g.right * 150 - g.errors * 50;
    final details = <String, Object?>{
      'level': g.level,
      'hits': g.right,
      'errors': g.errors,
      // Сколько фигур СТОЯЛО, а не сколько просил уровень — как в вебе.
      'pieces': g.start.length,
      'moves': g.params.moves,
      'quiz_type': g.params.quizType.name,
    };
    setState(() => _stage = _Stage.done);
    if (g.passed) {
      await _ladder.win(
        score: score,
        timeSeconds: seconds,
        errors: g.errors,
        mode: g.params.quizType.name,
        difficulty: 'L${g.level}',
        details: details,
      );
    } else {
      await _ladder.fail(
        score: score,
        timeSeconds: seconds,
        errors: g.errors,
        mode: g.params.quizType.name,
        difficulty: 'L${g.level}',
        details: details,
      );
    }
    if (mounted) setState(() {});
  }

  Future<void> _setAssist(ChessAssist a) async {
    setState(() => _assist = a);
    await a.write(widget.state);
  }

  @override
  Widget build(BuildContext context) {
    final g = _game;
    final playing = _stage == _Stage.play && g != null;
    return GameShell(
      title: L.t('chessBlind'),
      hud: [
        if (!GamePreset.isPreset || playing)
          HudItem(
            label: L.t('label_level_short'),
            value: '${playing ? _level : _ladder.level}',
            icon: Icons.flag_outlined,
          ),
        if (playing) ...[
          HudItem(
            label: L.t('hud_correct'),
            value: '${g.right}',
            icon: Icons.check_circle_outline,
          ),
          // Знаменатель — ФАКТ, а не обещание лестницы (замер 07.09.2026).
          if (g.phase == ChessBlindPhase.quiz || _reveal != null)
            HudItem(
              label: L.t('chessQuestionShort'),
              value: '${g.asked}/${g.total}',
              icon: Icons.help_outline,
            ),
        ],
      ],
      field: (context, h) {
        if (_corpus == null) {
          return Center(
            child: Text(
              _error ?? L.t('label_ready'),
              key: const Key('cb-status'),
            ),
          );
        }
        return switch (_stage) {
          _Stage.config => _config(),
          _Stage.play =>
            g!.phase == ChessBlindPhase.interference && _reveal == null
                ? _interference(g)
                : _play(g, h),
          _Stage.done => _result(),
        };
      },
      toolbar: playing ? _options(g) : null,
      pauseActions: [
        if (playing)
          PauseAction(
            label: L.t('restart'),
            icon: Icons.refresh,
            onPressed: _start,
          ),
      ],
    );
  }

  Widget _config() {
    final level = _ladder.level;
    final p = puzzleLevelParams(level);
    final band = puzzlePiecesBand(p.pieces);
    final bits = [
      '${band.min}–${band.max} ${L.t('chessCfgPieces')}',
      '${L.t('chessCfgExpose')} ${p.exposeSec}${L.t('secShort')}',
      if (p.moves > 0) '${p.moves} ${L.t('chessCfgBlindMoves')}',
      L.t(
        p.quizType == PuzzleQuizType.pick
            ? 'chessCfgQuizPick'
            : 'chessCfgQuizLocate',
      ),
    ];
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            L.t('chessBlindConfigDesc'),
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 12),
          Text(
            '${chessBlindStage(level)} · ${L.t('label_level_short')}$level',
            key: const Key('cb-stage'),
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
          Text(bits.join(' · '), key: const Key('cb-level-bits')),
          const SizedBox(height: 12),
          Text(
            L.t('chessAssistTitle'),
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
          CheckboxListTile(
            key: const Key('cb-assist-board'),
            contentPadding: EdgeInsets.zero,
            value: _assist.board,
            title: Text(L.t('chessAssistBoard')),
            onChanged: (v) => _setAssist(
              ChessAssist(board: v ?? false, coords: _assist.coords),
            ),
          ),
          CheckboxListTile(
            key: const Key('cb-assist-coords'),
            contentPadding: EdgeInsets.zero,
            value: _assist.coords,
            title: Text(L.t('chessAssistCoords')),
            onChanged: (v) => _setAssist(
              ChessAssist(board: _assist.board, coords: v ?? false),
            ),
          ),
          Text(
            L.t('chessAssistNote'),
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 16),
          FilledButton(
            key: const Key('cb-start'),
            onPressed: _start,
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(52),
            ),
            child: Text(L.f('lvlTargetBtn', {'n': '$level'})),
          ),
          if (!GamePreset.isPreset) ...[
            const SizedBox(height: 10),
            OutlinedButton(
              key: const Key('cb-mode-series'),
              onPressed: _openSeries,
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(48),
              ),
              child: Text(L.t('seriesBlocksCount')),
            ),
          ],
        ],
      ),
    );
  }

  String _hint(ChessBlindGame g) {
    final quizQ = _reveal?.question ?? g.current;
    switch (g.phase) {
      case ChessBlindPhase.expose:
        final left = max(0, g.params.exposeSec * 1000 - (_now() - _phaseStart));
        return '${L.t('chessHintMemorize')} · ${(left / 1000).ceil()}${L.t('secShort')}';
      case ChessBlindPhase.blind:
        return g.params.moves > 0
            ? '${L.t('chessHintBlindMoves')}: $_moveNum/${g.moves.length}'
            : L.t('chessHintHidden');
      default:
        if (quizQ == null) return ' ';
        if (g.params.quizType == PuzzleQuizType.pick) {
          // 🔴 КЛЕТКА НАЗВАНА СЛОВАМИ, А НЕ ТОЛЬКО ПОДСВЕЧЕНА (отчёт 9e1e38f3).
          return L
              .t('chessHintWhatSquareAt')
              .replaceAll(RegExp(r'[:\s]+$'), '');
        }
        final c = (type: quizQ.type, white: quizQ.white);
        return L.f('chessHintWhereIs', {
          'piece': cbPieceName(c),
          'glyph': _glyphs[comboKey(c)] ?? '',
        });
    }
  }

  Widget _play(ChessBlindGame g, double fieldHeight) {
    final reveal = _reveal;
    final pick = g.params.quizType == PuzzleQuizType.pick;
    final quizLike =
        g.phase == ChessBlindPhase.quiz ||
        g.phase == ChessBlindPhase.done ||
        reveal != null;
    final shown = switch (g.phase) {
      ChessBlindPhase.expose => g.start,
      ChessBlindPhase.blind => g.piecesAfter(_shownMoves),
      _ => g.finalPieces,
    };
    final asked = reveal?.question ?? g.current;
    final outlines = <int, Color>{};
    int? strong;
    if (_hlFrom != null) outlines[_hlFrom!] = const Color(0xFFFBBF24);
    if (_hlTo != null) outlines[_hlTo!] = const Color(0xFFFBBF24);
    if (quizLike && pick) {
      for (final sq in g.pendingSquares) {
        outlines[sq] = const Color(0xAA38BDF8);
      }
      if (asked != null && reveal == null) {
        outlines[asked.sq] = const Color(0xFF0284C7);
        strong = asked.sq;
      }
    }
    final revealed = <int>{};
    if (reveal != null) {
      if (pick) {
        revealed.add(reveal.question.sq);
        outlines[reveal.question.sq] = reveal.right
            ? const Color(0xFF22C55E)
            : const Color(0xFFF43F5E);
      } else {
        outlines[reveal.question.sq] = const Color(0xFF22C55E);
        final wrong = reveal.wrongSq;
        if (wrong != null) outlines[wrong] = const Color(0xFFF43F5E);
      }
    }
    final canTap = g.phase == ChessBlindPhase.quiz && reveal == null;
    final exposeLeft = g.params.exposeSec * 1000 - (_now() - _phaseStart);

    return LayoutBuilder(
      builder: (context, box) {
        const labels = 18.0;
        final reserved =
            64.0 + (pick && quizLike ? 34 : 0) + (_assist.coords ? labels : 0);
        final side = min(
          box.maxWidth - 16 - (_assist.coords ? labels : 0),
          fieldHeight - reserved,
        ).clamp(120.0, 560.0);
        final step = side / 8;
        final board = ChessBoardView(
          side: side,
          keyPrefix: 'cb-sq',
          masked: g.phase != ChessBlindPhase.expose,
          sideDiscs: true,
          revealed: revealed,
          outlines: outlines,
          strong: strong,
          cornerCoords: !_assist.coords,
          onTapSquare: canTap
              ? (sq) {
                  if (pick && !g.pendingSquares.contains(sq)) return;
                  _tapSquare(sq);
                }
              : null,
          pieces: {
            for (final p in shown) p.sq: BoardPiece(p.type, white: p.white),
          },
        );
        final labelStyle = TextStyle(
          fontSize: max(10, step * 0.28),
          fontWeight: FontWeight.w600,
          color: Theme.of(context).colorScheme.onSurfaceVariant,
        );
        return Column(
          children: [
            Text(
              _hint(g),
              key: const Key('cb-hint'),
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
            ),
            if (pick && quizLike && asked != null)
              Text(
                cbSquareName(asked.sq),
                key: const Key('cb-ask-square'),
                style: TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                  color: Theme.of(context).colorScheme.primary,
                ),
              ),
            const SizedBox(height: 4),
            if (g.phase == ChessBlindPhase.expose)
              SizedBox(
                width: side,
                child: LinearProgressIndicator(
                  key: const Key('cb-expose-bar'),
                  value: (exposeLeft / (g.params.exposeSec * 1000)).clamp(
                    0.0,
                    1.0,
                  ),
                  minHeight: 6,
                ),
              ),
            const SizedBox(height: 6),
            // Шахматная доска канонически слева направо: a — слева при любом языке.
            Directionality(
              textDirection: TextDirection.ltr,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (_assist.coords)
                    SizedBox(
                      width: labels,
                      height: side,
                      child: Column(
                        children: [
                          for (var r = 0; r < 8; r++)
                            SizedBox(
                              height: step,
                              child: Center(
                                child: Text('${8 - r}', style: labelStyle),
                              ),
                            ),
                        ],
                      ),
                    ),
                  Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      board,
                      if (_assist.coords)
                        SizedBox(
                          width: side,
                          height: labels,
                          child: Row(
                            children: [
                              for (var c = 0; c < 8; c++)
                                SizedBox(
                                  width: step,
                                  child: Center(
                                    child: Text(
                                      'abcdefgh'[c],
                                      style: labelStyle,
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }

  /// 🔴 ПОМЕХА — ОТДЕЛЬНЫЙ ЭКРАН, А НЕ НАКЛАДКА НА ДОСКУ: смысл оси в том, что
  /// доски перед глазами нет. Ответы знаками «✓ / ✗» — без новых ключей словаря.
  Widget _interference(ChessBlindGame g) {
    final e = g.example;
    if (e == null) return const SizedBox.shrink();
    Widget button(bool yes) => FilledButton(
      key: Key(yes ? 'cb-interf-yes' : 'cb-interf-no'),
      onPressed: () => setState(() => g.answerExample(yes)),
      style: FilledButton.styleFrom(
        minimumSize: const Size(96, 56),
        backgroundColor: yes
            ? const Color(0xFF166534)
            : const Color(0xFF7F1D1D),
      ),
      child: Text(
        yes ? '✓' : '✗',
        style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800),
      ),
    );
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            '${g.exampleIndex + 1}/${g.examples.length}',
            key: const Key('cb-interf-count'),
          ),
          const SizedBox(height: 18),
          Directionality(
            textDirection: TextDirection.ltr,
            child: Text(
              '${e.left} = ${e.shown}',
              key: const Key('cb-interf-example'),
              style: const TextStyle(fontSize: 44, fontWeight: FontWeight.w800),
            ),
          ),
          const SizedBox(height: 22),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [button(true), const SizedBox(width: 16), button(false)],
          ),
        ],
      ),
    );
  }

  /// Варианты ответа «что стоит на клетке» — картинками фигур на светлой
  /// плашке: сторону несут рамка и сама фигура (отчёт Дениса 05.09.2026 —
  /// чёрная фигура сливалась с тёмной плашкой).
  Widget? _options(ChessBlindGame g) {
    if (g.params.quizType != PuzzleQuizType.pick) return null;
    final reveal = _reveal;
    final q = reveal?.question ?? g.current;
    if (q == null ||
        g.phase == ChessBlindPhase.expose ||
        g.phase == ChessBlindPhase.blind) {
      return null;
    }
    if (g.phase == ChessBlindPhase.interference && reveal == null) return null;
    final correct = (type: q.type, white: q.white);
    return Padding(
      padding: const EdgeInsets.all(8),
      child: Wrap(
        alignment: WrapAlignment.center,
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final key in q.options)
            Builder(
              builder: (context) {
                final c = comboOf(key);
                final picked =
                    reveal?.picked != null && comboKey(reveal!.picked!) == key;
                final isCorrect =
                    reveal != null && !reveal.right && comboKey(correct) == key;
                final ring = picked
                    ? (reveal.right
                          ? const Color(0xFF22C55E)
                          : const Color(0xFFF43F5E))
                    : isCorrect
                    ? const Color(0xFF22C55E)
                    : null;
                return Semantics(
                  button: true,
                  label: cbPieceName(c),
                  child: GestureDetector(
                    key: Key('cb-opt-$key'),
                    onTap: () => _pick(c),
                    child: Container(
                      width: 56,
                      height: 56,
                      decoration: BoxDecoration(
                        color: const Color(0xFFE2E8F0),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color:
                              ring ??
                              (c.white
                                  ? const Color(0xFF94A3B8)
                                  : const Color(0xFF0F172A)),
                          width: ring == null ? 2 : 4,
                        ),
                      ),
                      alignment: Alignment.center,
                      child: ChessPieceImage(
                        type: c.type,
                        white: c.white,
                        size: 44,
                      ),
                    ),
                  ),
                );
              },
            ),
        ],
      ),
    );
  }

  Widget _result() {
    final g = _game;
    if (g == null) return const SizedBox.shrink();
    final stars = g.errors == 0
        ? 3
        : g.errors <= 1
        ? 2
        : 1;
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            '★' * stars + '☆' * (3 - stars),
            key: const Key('cb-stars'),
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 36, color: Color(0xFFE0A800)),
          ),
          const SizedBox(height: 8),
          Text(
            "${L.t('hud_correct')}: ${g.right}/${g.total}",
            key: const Key('cb-result'),
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 20),
          FilledButton(
            key: const Key('cb-next'),
            onPressed: _start,
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(52),
            ),
            child: Text(
              g.passed && !GamePreset.isPreset
                  ? '${L.t('nextLabel')} · ${L.t('label_level_short')} ${_ladder.level}'
                  : L.t('restart'),
            ),
          ),
          const SizedBox(height: 8),
          OutlinedButton(
            key: const Key('cb-menu'),
            onPressed: () => setState(() => _stage = _Stage.config),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(48),
            ),
            child: Text(L.t('mode')),
          ),
        ],
      ),
    );
  }
}
