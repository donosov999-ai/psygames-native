/// ПАРТИЯ «ДОСКИ В УМЕ»: показ → ходы вслепую → (помеха) → вопросы.
///
/// 🔴 СОСТОЯНИЕ ЖИВЁТ ОТДЕЛЬНО ОТ ЭКРАНА. В веб-версии вся партия сидела внутри
/// файла маршрута, наружу торчал только компонент — и проверить её было нечем,
/// кроме как через отрисовку. Здесь ход партии можно прогнать пробой без единого
/// пикселя, а экран остаётся тонким: он ведёт ЧАСЫ (когда показать ход, когда
/// снять подсветку), а что верно и что дальше — решает партия.
library;

import 'dart:math';

import 'interference.dart';
import 'ladder.dart';
import 'moves.dart';
import 'positions.dart';
import 'questions.dart';

/// Где сейчас партия.
enum ChessBlindPhase {
  /// Позиция видна целиком — её запоминают.
  expose,

  /// Фигуры превратились в фишки, ходы идут по одному.
  blind,

  /// Счёт-помеха между ходами и вопросами (с 11-й ступени).
  interference,

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
    required this.examples,
  }) : _phase = ChessBlindPhase.expose;

  /// Собрать партию так, как её собирает веб (`startGame`): позиция из узкой
  /// полосы уровня с нужным числом однозначных фигур, ходы вслепую, вопросы по
  /// итогу, примеры помехи.
  factory ChessBlindGame.start({
    required int level,
    required PositionCorpus corpus,
    Random? random,
  }) {
    final rnd = random ?? Random();
    final params = puzzleLevelParams(level);
    final entry = corpus.pickPuzzle(
      params.pieces,
      puzzleMinUnique(params.quizType, params.questions),
      rnd,
    );
    final start = piecesFromFen(entry.fen);
    final chain = generateBlindMoves(
      pieces: start,
      count: params.moves,
      random: rnd,
    );
    final hard = level >= 14;
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
      examples: [
        for (var i = 0; i < examplesPerRound(level); i++)
          makeExample(hard, rnd),
      ],
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

  /// Примеры помехи; пусто — помехи на этой ступени нет.
  final List<MathExample> examples;

  ChessBlindPhase _phase;
  final Set<int> _answered = {};
  int _index = 0;
  int _right = 0;
  int _errors = 0;
  int _example = 0;
  int _exampleRight = 0;

  ChessBlindPhase get phase => _phase;

  /// Сколько вопросов уже закрыто, сколько верных и сколько промахов.
  int get asked => _answered.length;
  int get right => _right;
  int get errors => _errors;

  /// Ступень пройдена: не больше одного промаха (как в вебе).
  bool get passed => _errors <= 1;

  /// Сколько вопросов будет ФАКТИЧЕСКИ. 🔴 Это число может быть меньше
  /// обещанного лестницей: «розыск» спрашивает только про однозначные фигуры,
  /// и если их в позиции меньше — вопросов меньше. Счётчик обязан показывать
  /// правду, а не обещание (замер 07.09.2026: «3/5» без возможности дойти до пяти).
  int get total => questions.length;

  /// Вопрос, на который отвечают сейчас. Вне опроса вопроса нет — иначе цикл
  /// «пока есть вопрос — отвечай» во время помехи крутился бы вечно.
  Question? get current =>
      _phase == ChessBlindPhase.quiz && _index < questions.length
      ? questions[_index]
      : null;

  /// Клетки вопросов, на которые ещё не ответили, — их можно выбрать касанием.
  Set<int> get pendingSquares => {
    for (var i = 0; i < questions.length; i++)
      if (!_answered.contains(i)) questions[i].sq,
  };

  /// Текущий пример помехи и его номер.
  MathExample? get example =>
      _phase == ChessBlindPhase.interference && _example < examples.length
      ? examples[_example]
      : null;
  int get exampleIndex => _example;
  int get exampleRight => _exampleRight;

  /// Позиция после первых [count] ходов — экран показывает ходы по одному.
  List<PuzzlePiece> piecesAfter(int count) {
    final out = [...start];
    for (final m in moves.take(count)) {
      final p = out[m.pieceIndex];
      out[m.pieceIndex] = PuzzlePiece(sq: m.to, type: p.type, white: p.white);
    }
    return out;
  }

  void beginBlind() {
    if (_phase == ChessBlindPhase.expose) _phase = ChessBlindPhase.blind;
  }

  /// После ходов — помеха, если она есть на ступени, иначе сразу вопросы.
  void beginQuiz() {
    if (_phase != ChessBlindPhase.blind) return;
    if (examples.isNotEmpty) {
      _phase = ChessBlindPhase.interference;
      return;
    }
    _openQuiz();
  }

  /// Ответ на пример помехи. Верность копится для отчёта, в счёт партии не идёт.
  void answerExample(bool saidCorrect) {
    final e = example;
    if (e == null) return;
    if (saidCorrect == e.correct) _exampleRight++;
    _example++;
    if (_example >= examples.length) _openQuiz();
  }

  void _openQuiz() {
    _phase = questions.isEmpty ? ChessBlindPhase.done : ChessBlindPhase.quiz;
    _index = 0;
  }

  /// 🔴 ОТВЕЧАТЬ МОЖНО В ЛЮБОМ ПОРЯДКЕ (отчёт Дениса 23.08.2026: «нельзя вручную
  /// выбрать те, что помнишь — он навязывает свою последовательность»). Касание
  /// неотвеченной клетки выбирает, про какую отвечаем. Набор вопросов и их число
  /// не меняются — меняется только порядок.
  bool select(int sq) {
    if (_phase != ChessBlindPhase.quiz) return false;
    for (var i = 0; i < questions.length; i++) {
      if (questions[i].sq == sq && !_answered.contains(i)) {
        _index = i;
        return true;
      }
    }
    return false;
  }

  /// Ответ на текущий вопрос. Для «выбора» — фигура, для «розыска» — клетка.
  /// Дальше — следующий НЕОТВЕЧЕННЫЙ, а не следующий по счёту.
  bool answer({String? piece, bool? white, int? square}) {
    final q = current;
    if (q == null) return false;
    final ok = params.quizType == PuzzleQuizType.locate
        ? square == q.sq
        : piece == q.type && white == q.white;
    _answered.add(_index);
    if (ok) {
      _right++;
    } else {
      _errors++;
    }
    final next = nextUnanswered(_index, questions.length, _answered);
    if (next < 0) {
      _phase = ChessBlindPhase.done;
    } else {
      _index = next;
    }
    return ok;
  }
}

/// Следующий неотвеченный после [cur] по кругу; −1 — все отвечены.
int nextUnanswered(int cur, int total, Set<int> answered) {
  for (var k = 1; k <= total; k++) {
    final cand = (cur + k) % total;
    if (!answered.contains(cand)) return cand;
  }
  return -1;
}
