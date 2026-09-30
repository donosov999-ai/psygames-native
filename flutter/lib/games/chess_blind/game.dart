/// ПАРТИЯ «ДОСКИ В УМЕ»: показ → маска → ходы вслепую → вопросы.
///
/// 🔴 СОСТОЯНИЕ ЖИВЁТ ОТДЕЛЬНО ОТ ЭКРАНА. В веб-версии вся партия сидела внутри
/// файла маршрута, наружу торчал только компонент — и проверить её было нечем,
/// кроме как через отрисовку. Здесь ход партии можно прогнать пробой без единого
/// пикселя, а экран остаётся тонким.
library;

import 'dart:math';

import 'bands.dart';
import 'ladder.dart';
import 'moves.dart';
import 'positions.dart';
import 'questions.dart';

/// Где сейчас партия.
enum ChessBlindPhase {
  /// Позиция видна целиком — её запоминают.
  expose,

  /// Фигуры превратились в одинаковые фишки, идут ходы вслепую.
  blind,

  /// Задаются вопросы по ИТОГОВОЙ позиции.
  quiz,

  /// Партия окончена, виден итог.
  done,
}

class ChessBlindGame {
  ChessBlindGame._({
    required this.level,
    required this.params,
    required this.start,
    required this.moves,
    required this.finalPieces,
    required this.questions,
  }) : _phase = ChessBlindPhase.expose;

  /// Собрать партию: позиция из корпуса по ступени, ходы вслепую, вопросы.
  factory ChessBlindGame.start({
    required int level,
    required PositionCorpus corpus,
    Random? random,
  }) {
    final rnd = random ?? Random();
    final params = puzzleLevelParams(level);
    // Ступень партии просит ЧИСЛО фигур, а корпус набран полосами: берём ту
    // полосу, в которую это число попадает.
    final band = pieceBands.firstWhere(
      (b) => params.pieces >= b.min && params.pieces <= b.max,
      orElse: () => pieceBands.last,
    );
    final entry = corpus.pickRandom(band, rnd);
    final start = piecesFromFen(entry.fen);
    final chain = generateBlindMoves(
      pieces: start,
      count: params.moves,
      random: rnd,
    );
    return ChessBlindGame._(
      level: level,
      params: params,
      start: start,
      moves: chain.moves,
      finalPieces: chain.after,
      questions: buildQuestions(
        pieces: chain.after,
        quizType: params.quizType,
        questions: params.questions,
        level: level,
        random: rnd,
      ),
    );
  }

  final int level;
  final PuzzleLevelParams params;

  /// Позиция, которую показали.
  final List<PuzzlePiece> start;

  /// Ходы, сделанные уже под маской.
  final List<BlindMove> moves;

  /// Позиция после всех ходов — по ней и спрашивают.
  final List<PuzzlePiece> finalPieces;

  final List<Question> questions;

  ChessBlindPhase _phase;
  int _asked = 0;
  int _right = 0;

  ChessBlindPhase get phase => _phase;

  /// Сколько вопросов уже задано и сколько верных.
  int get asked => _asked;
  int get right => _right;

  /// Сколько вопросов будет ФАКТИЧЕСКИ. 🔴 Это число может быть меньше
  /// обещанного лестницей: «розыск» спрашивает только про однозначные фигуры,
  /// и если их в позиции меньше — вопросов меньше. Счётчик обязан показывать
  /// правду, а не обещание (замер 07.09.2026: «3/5» без возможности дойти до пяти).
  int get total => questions.length;

  Question? get current => _asked < questions.length ? questions[_asked] : null;

  void beginBlind() {
    if (_phase == ChessBlindPhase.expose) _phase = ChessBlindPhase.blind;
  }

  void beginQuiz() {
    if (_phase == ChessBlindPhase.blind) {
      _phase = questions.isEmpty ? ChessBlindPhase.done : ChessBlindPhase.quiz;
    }
  }

  /// Ответ на текущий вопрос. Для «выбора» — фигура, для «розыска» — клетка.
  bool answer({String? piece, bool? white, int? square}) {
    final q = current;
    if (q == null || _phase != ChessBlindPhase.quiz) return false;
    final ok = params.quizType == PuzzleQuizType.locate
        ? square == q.sq
        : piece == q.type && white == q.white;
    _asked++;
    if (ok) _right++;
    if (_asked >= questions.length) _phase = ChessBlindPhase.done;
    return ok;
  }
}
