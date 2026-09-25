import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';

import '../chess_common/board.dart';

import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import 'game.dart';
import 'ladder.dart';
import 'positions.dart';
import 'questions.dart';

/// ЭКРАН «ДОСКИ В УМЕ» на общем каркасе.
///
/// Тонкий по устройству: всё, что можно проверить без пикселей, живёт в
/// `game.dart` и уже закрыто пробами. Здесь остаётся показ и касания.
class ChessBlindScreen extends StatefulWidget {
  const ChessBlindScreen({super.key, this.level = 1, this.corpus, this.random});

  final int level;

  /// Подменяется в пробах, чтобы не читать ассет.
  final PositionCorpus? corpus;
  final Random? random;

  @override
  State<ChessBlindScreen> createState() => _ChessBlindScreenState();
}

class _ChessBlindScreenState extends State<ChessBlindScreen> {
  ChessBlindGame? _game;
  Timer? _timer;
  int _left = 0;
  String? _error;

  @override
  void initState() {
    super.initState();
    _newGame();
  }

  Future<void> _newGame() async {
    _timer?.cancel();
    try {
      final corpus = widget.corpus ?? await PositionCorpus.load();
      if (!mounted) return;
      final game = ChessBlindGame.start(
        level: widget.level,
        corpus: corpus,
        random: widget.random,
      );
      setState(() {
        _game = game;
        _error = null;
        _left = game.params.exposeSec;
      });
      _tick();
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = "${L.t('chessBlind')}: $e");
    }
  }

  /// Отсчёт показа. По нулю позиция маскируется, идут ходы, затем вопросы.
  void _tick() {
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return;
      setState(() => _left--);
      if (_left > 0) return;
      t.cancel();
      setState(() {
        _game?.beginBlind();
        _game?.beginQuiz();
      });
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _answerPiece(String type, bool white) {
    setState(() => _game?.answer(piece: type, white: white));
  }

  void _answerSquare(int sq) {
    final game = _game;
    if (game == null || game.params.quizType != PuzzleQuizType.locate) return;
    setState(() => game.answer(square: sq));
  }

  @override
  Widget build(BuildContext context) {
    final game = _game;
    if (game == null) {
      return GameShell(
        title: L.t('chessBlind'),
        field: (context, h) => Center(
          child: Text(
            _error ?? L.t('label_ready'),
            key: const Key('cb-status'),
          ),
        ),
      );
    }

    // Что показывать: до маски — сами фигуры, после — одинаковые фишки.
    final masked = game.phase != ChessBlindPhase.expose;
    final shown = masked ? game.finalPieces : game.start;

    return GameShell(
      title: L.t('chessBlind'),
      hud: [
        HudItem(label: L.t('label_level_short'), value: '${game.level}'),
        HudItem(
          label: L.t('chessQuestionShort'),
          // 🔴 ЗНАМЕНАТЕЛЬ — ФАКТ, А НЕ ОБЕЩАНИЕ ЛЕСТНИЦЫ: на «розыске» вопросов
          // бывает меньше, чем обещано, и «3/5» без возможности дойти до пяти
          // человек читает как поломку.
          value: '${game.asked}/${game.total}',
        ),
        if (game.phase == ChessBlindPhase.expose)
          HudItem(label: L.t('chessCfgExpose'), value: '$_left'),
      ],
      field: (context, fieldHeight) {
        // Доска берёт высоту У КАРКАСА числом, а не от окна: окно не знает про
        // шапку, счётчики и липкий низ.
        //
        // 🔴 НО ОДНОЙ ВЫСОТЫ МАЛО. Сперва я считал сторону только от неё, и на
        // узком экране доска вылезала вбок — сторона 390 при высоте поля больше.
        // Поймано пробой «доска квадратная»: берём меньшую из двух сторон.
        return LayoutBuilder(
          builder: (context, box) {
            final side = fieldHeight < box.maxWidth
                ? fieldHeight
                : box.maxWidth;
            final highlight =
                game.phase == ChessBlindPhase.quiz &&
                    game.params.quizType == PuzzleQuizType.locate
                ? game.current?.sq
                : null;
            return Center(
              child: ChessBoardView(
                side: side,
                keyPrefix: 'cb-sq',
                masked: masked,
                selected: highlight,
                onTapSquare: _answerSquare,
                pieces: {
                  for (final p in shown)
                    p.sq: BoardPiece(p.type, white: p.white),
                },
              ),
            );
          },
        );
      },
      toolbar:
          game.phase == ChessBlindPhase.quiz &&
              game.params.quizType == PuzzleQuizType.pick &&
              game.current != null
          ? _PickBar(question: game.current!, onPick: _answerPiece)
          : game.phase == ChessBlindPhase.done
          ? Padding(
              padding: const EdgeInsets.all(12),
              child: Text(
                "${L.t('hud_correct')}: ${game.right}/${game.total}",
                key: const Key('cb-result'),
                textAlign: TextAlign.center,
              ),
            )
          : null,
    );
  }
}

/// Доска 8×8. До маски видны фигуры, после — одинаковые фишки.
/// Варианты ответа для вида «что стоит на поле».
class _PickBar extends StatelessWidget {
  const _PickBar({required this.question, required this.onPick});

  final Question question;
  final void Function(String type, bool white) onPick;

  @override
  Widget build(BuildContext context) {
    // Варианты строит ядро; пока их нет — показываем верный и пару соседних,
    // чтобы экран был проверяем целиком.
    final options = <(String, bool)>{
      (question.type, question.white),
      ('P', question.white),
      ('N', !question.white),
    }.toList();
    return Padding(
      padding: const EdgeInsets.all(8),
      child: Wrap(
        alignment: WrapAlignment.center,
        spacing: 8,
        children: [
          for (final o in options)
            OutlinedButton(
              key: Key('cb-pick-${o.$1}${o.$2 ? 'w' : 'b'}'),
              onPressed: () => onPick(o.$1, o.$2),
              child: Text('${o.$1}${o.$2 ? '↑' : '↓'}'),
            ),
        ],
      ),
    );
  }
}
