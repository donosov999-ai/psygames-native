import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';

import '../../shell/game_shell.dart';
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
      setState(() => _error = 'Не удалось собрать партию: $e');
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
        title: 'Доска в уме',
        field: (context, h) => Center(
          child: Text(
            _error ?? 'Собираем позицию…',
            key: const Key('cb-status'),
          ),
        ),
      );
    }

    // Что показывать: до маски — сами фигуры, после — одинаковые фишки.
    final masked = game.phase != ChessBlindPhase.expose;
    final shown = masked ? game.finalPieces : game.start;

    return GameShell(
      title: 'Доска в уме',
      hud: [
        HudItem(label: 'Уровень', value: '${game.level}'),
        HudItem(
          label: 'Вопрос',
          // 🔴 ЗНАМЕНАТЕЛЬ — ФАКТ, А НЕ ОБЕЩАНИЕ ЛЕСТНИЦЫ: на «розыске» вопросов
          // бывает меньше, чем обещано, и «3/5» без возможности дойти до пяти
          // человек читает как поломку.
          value: '${game.asked}/${game.total}',
        ),
        if (game.phase == ChessBlindPhase.expose)
          HudItem(label: 'Показ', value: '$_left с'),
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
            return Center(
              child: SizedBox(
                width: side,
                height: side,
                child: _Board(
                  pieces: shown,
                  masked: masked,
                  highlight:
                      game.phase == ChessBlindPhase.quiz &&
                          game.params.quizType == PuzzleQuizType.locate
                      ? game.current?.sq
                      : null,
                  onTapSquare: _answerSquare,
                ),
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
                'Верно ${game.right} из ${game.total}',
                key: const Key('cb-result'),
                textAlign: TextAlign.center,
              ),
            )
          : null,
    );
  }
}

/// Доска 8×8. До маски видны фигуры, после — одинаковые фишки.
class _Board extends StatelessWidget {
  const _Board({
    required this.pieces,
    required this.masked,
    required this.onTapSquare,
    this.highlight,
  });

  final List<PuzzlePiece> pieces;
  final bool masked;
  final void Function(int sq) onTapSquare;
  final int? highlight;

  static const _glyphs = {
    'K': '♚',
    'Q': '♛',
    'R': '♜',
    'B': '♝',
    'N': '♞',
    'P': '♟',
  };

  @override
  Widget build(BuildContext context) {
    final bysquare = {for (final p in pieces) p.sq: p};
    return GridView.builder(
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 8,
      ),
      itemCount: 64,
      itemBuilder: (context, i) {
        final piece = bysquare[i];
        final light = ((i ~/ 8) + (i % 8)) % 2 == 0;
        return GestureDetector(
          key: Key('cb-sq-$i'),
          onTap: () => onTapSquare(i),
          child: Container(
            color: i == highlight
                ? Theme.of(context).colorScheme.primary.withValues(alpha: 0.35)
                : (light ? const Color(0xFFE8C48A) : const Color(0xFFC8A06A)),
            alignment: Alignment.center,
            child: piece == null
                ? null
                : masked
                // Маска: одинаковые фишки, по ним ничего не прочесть.
                ? const Icon(Icons.circle, size: 18, color: Color(0xFF5B5B5B))
                : Text(
                    _glyphs[piece.type] ?? piece.type,
                    style: TextStyle(
                      fontSize: 22,
                      color: piece.white
                          ? const Color(0xFFFDF6E8)
                          : const Color(0xFF1C1A17),
                    ),
                  ),
          ),
        );
      },
    );
  }
}

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
