import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'dart:math';

import 'package:psygames_flutter/games/chess_blind/bands.dart';
import 'package:psygames_flutter/games/chess_blind/board.dart';
import 'package:psygames_flutter/games/chess_blind/ladder.dart';
import 'package:psygames_flutter/games/chess_blind/moves.dart';
import 'package:psygames_flutter/games/chess_blind/positions.dart';
import 'package:psygames_flutter/games/chess_blind/questions.dart';

/// 🔴 ЛЕСТНИЦА ПЕРЕНЕСЕНА СО СВЕРКОЙ, А НЕ ПЕРЕПИСАНА НА ГЛАЗ.
///
/// Эталон снят прогоном ЖИВОГО TS (`src/games/chess-blind/core/puzzle.ts`):
/// все 25 ступеней со всеми ручками, поведение на краях и минимум уникальных
/// фигур. Уровень у веба и у нативной половины ОБЩИЙ, и разойдись числа — у
/// человека на одной и той же ступени были бы разные задания.
void main() {
  final reference = jsonDecode(
    File('test/fixtures/chess-blind-reference.json').readAsStringSync(),
  ) as Map<String, dynamic>;

  boardAndBandsMatchLiveTs(reference);
  questionsMatchLiveTs(reference);
  corpusMatchesLiveTs(reference);
  movesMatchLiveTs(reference);

  test('🔴 полоса лестницы совпадает с живым TS', () {
    expect(puzzleMinLevel, reference['minLevel']);
    expect(puzzleMaxLevel, reference['maxLevel']);
  });

  test('🔴 ВСЕ 25 ступеней совпадают по каждой ручке', () {
    final levels = reference['levels'] as Map<String, dynamic>;
    expect(levels, hasLength(25), reason: 'эталон на 25 ступеней');
    for (final entry in levels.entries) {
      final level = int.parse(entry.key);
      final want = entry.value as Map<String, dynamic>;
      final got = puzzleLevelParams(level);
      expect(got.pieces, want['pieces'], reason: 'фигуры, ступень $level');
      expect(got.exposeSec, want['exposeSec'], reason: 'показ, ступень $level');
      expect(got.moves, want['moves'], reason: 'ходы вслепую, ступень $level');
      expect(
        got.quizType.name,
        want['quizType'],
        reason: 'вид вопроса, ступень $level',
      );
      expect(
        got.questions,
        want['questions'],
        reason: 'вопросов, ступень $level',
      );
      expect(
        got.optionCount,
        want['optionCount'],
        reason: 'вариантов, ступень $level',
      );
      expect(
        got.sameColorShare,
        want['sameColorShare'],
        reason: 'один цвет, ступень $level',
      );
    }
  });

  test(
    '🔴 края лестницы: мусор становится ближайшей ступенью, а не падением',
    () {
      final clamp = reference['clamp'] as Map<String, dynamic>;
      for (final entry in clamp.entries) {
        expect(
          clampPuzzleLevel(num.parse(entry.key)),
          entry.value,
          reason: 'уровень «${entry.key}»',
        );
      }
      expect(
        clampPuzzleLevel(double.nan),
        puzzleMinLevel,
        reason: 'не число — первая ступень',
      );
    },
  );

  test('🔴 минимум однозначных фигур совпадает с живым TS', () {
    final want = reference['minUnique'] as Map<String, dynamic>;
    expect(puzzleMinUnique(PuzzleQuizType.pick, 3), want['pick-3']);
    expect(puzzleMinUnique(PuzzleQuizType.locate, 3), want['locate-3']);
    expect(puzzleMinUnique(PuzzleQuizType.pick, 1), want['pick-1']);
    expect(puzzleMinUnique(PuzzleQuizType.locate, 5), want['locate-5']);
  });

  test('🔴 ход вслепую стоит на ПЕРВОЙ ступени', () {
    // Замер 10.09.2026: дальше 4-го уровня не заходил никто, а ходы вслепую
    // начинались с 6-го — механику, ради которой игра названа, не видел ни один
    // игравший. Число здесь стоит числом нарочно.
    expect(puzzleLevelParams(1).moves, 1);
    final firstBlind = List.generate(
      25,
      (i) => i + 1,
    ).firstWhere((level) => puzzleLevelParams(level).moves > 0);
    expect(
      firstBlind,
      lessThanOrEqualTo(2),
      reason: 'впервые виден на ступени $firstBlind',
    );
  });
}

/// 🔴 ДОСКА И ПОЛОСЫ — ТОЖЕ СО СВЕРКОЙ, ПО ВСЕМ 64 КЛЕТКАМ.
///
/// Две записи клетки живут рядом: индекс ядра (0 = a1, снизу вверх) и индекс
/// экрана (0 = a8, сверху вниз). Спутать их значит нарисовать позицию вверх
/// ногами, и никакая проба правил этого не увидит.
void boardAndBandsMatchLiveTs(Map<String, dynamic> reference) {
  final board = reference['board'] as Map<String, dynamic>;
  final ladder = reference['ladder'] as Map<String, dynamic>;

  test('🔴 ВСЕ 64 клетки совпадают: имя, цвет, индекс экрана', () {
    expect(boardSide, board['side']);
    expect(boardSquares, board['squares']);
    final squares = board['squares_detail'] as Map<String, dynamic>;
    expect(squares, hasLength(64));
    for (final entry in squares.entries) {
      final i = int.parse(entry.key);
      final want = entry.value as Map<String, dynamic>;
      expect(squareName(i), want['name'], reason: 'имя клетки $i');
      expect(fileOf(i), want['file'], reason: 'вертикаль $i');
      expect(rankOf(i), want['rank'], reason: 'горизонталь $i');
      expect(isLightSquare(i), want['light'], reason: 'цвет клетки $i');
      expect(screenIndex(i), want['screen'], reason: 'индекс экрана для $i');
    }
  });

  test('🔴 имя разбирается обратно, а мусор БРОСАЕТ, а не даёт a1', () {
    final byName = board['byName'] as Map<String, dynamic>;
    for (final entry in byName.entries) {
      expect(squareIndex(entry.key), entry.value, reason: entry.key);
    }
    for (final bad
        in (board['badNames'] as List<dynamic>).cast<Map<String, dynamic>>()) {
      expect(
        bad['index'],
        'throws',
        reason: 'эталон: живой TS бросает на «${bad['name']}»',
      );
      expect(
        () => squareIndex(bad['name'] as String),
        throwsA(isA<FormatException>()),
        reason: 'на «${bad['name']}» обязана быть ошибка, а не тихий индекс',
      );
    }
    final same = board['sameColor'] as Map<String, dynamic>;
    expect(
      sameSquareColor(squareIndex('a1'), squareIndex('h8')),
      same['a1-h8'],
    );
    expect(
      sameSquareColor(squareIndex('a1'), squareIndex('a2')),
      same['a1-a2'],
    );
  });

  test('🔴 полосы фигур и маршрут коня совпадают на всех ступенях', () {
    expect(chessMinLevel, ladder['minLevel']);
    expect(chessMaxLevel(), ladder['maxLevel']);
    final bands = (ladder['bands'] as List<dynamic>)
        .cast<Map<String, dynamic>>();
    expect(pieceBands, hasLength(bands.length));
    for (var i = 0; i < bands.length; i++) {
      expect(pieceBands[i].min, bands[i]['min'], reason: 'полоса $i, минимум');
      expect(pieceBands[i].max, bands[i]['max'], reason: 'полоса $i, максимум');
    }
    final perLevel = ladder['bandForLevel'] as Map<String, dynamic>;
    for (final entry in perLevel.entries) {
      final want = entry.value as Map<String, dynamic>;
      final got = bandForLevel(int.parse(entry.key));
      expect(got.min, want['min'], reason: 'ступень ${entry.key}, минимум');
      expect(got.max, want['max'], reason: 'ступень ${entry.key}, максимум');
    }
    final knight = ladder['knightMoves'] as Map<String, dynamic>;
    for (final entry in knight.entries) {
      expect(
        knightMovesForLevel(int.parse(entry.key)),
        entry.value,
        reason: 'маршрут коня, ступень ${entry.key}',
      );
    }
    expect([knightMinMoves, knightMaxMoves], ladder['knightRange']);
    final clamp = ladder['clamp'] as Map<String, dynamic>;
    for (final entry in clamp.entries) {
      expect(
        clampLevel(num.parse(entry.key)),
        entry.value,
        reason: 'край «${entry.key}»',
      );
    }
  });
}

/// 🔴 ВОПРОСЫ: СВЕРЯЕТСЯ ТО, ЧТО ОТ СЛУЧАЯ НЕ ЗАВИСИТ.
///
/// Порядок вопросов случаен по устройству игры. А вот сколько их выйдет, с
/// каких клеток может спросить «розыск» и есть ли варианты ответа — от случая
/// не зависит и обязано совпасть с живым TS. Именно здесь 07.09.2026 нашёлся
/// дефект: лестница обещала пять вопросов, а позиция давала три, и счётчик
/// молча показывал «3/5».
void questionsMatchLiveTs(Map<String, dynamic> reference) {
  final cases = reference['questions'] as Map<String, dynamic>;

  List<PuzzlePiece> parse(String spec) {
    final tokens = spec.split(' ');
    return [
      for (var i = 0; i < tokens.length; i++)
        PuzzlePiece(sq: i * 3, type: tokens[i][0], white: tokens[i][1] == 'w'),
    ];
  }

  for (final entry in cases.entries) {
    final want = entry.value as Map<String, dynamic>;
    test('🔴 вопросы «${entry.key}» совпадают с живым TS', () {
      final pieces = parse(want['spec'] as String);
      expect(pieces, hasLength(want['pieces']), reason: 'фигур в позиции');
      expect(
        uniquePieceCount(pieces),
        want['unique'],
        reason: 'однозначных фигур',
      );
      expect(
        locatableSquares(pieces),
        (want['locateSquares'] as List<dynamic>).cast<int>(),
        reason: 'клетки, с которых может спросить «розыск»',
      );

      final rnd = Random(7);
      for (final probe in [
        (q: 3, kind: PuzzleQuizType.locate, key: 'locate3Count'),
        (q: 5, kind: PuzzleQuizType.locate, key: 'locate5Count'),
        (q: 3, kind: PuzzleQuizType.pick, key: 'pick3Count'),
      ]) {
        final built = buildQuestions(
          pieces: pieces,
          quizType: probe.kind,
          questions: probe.q,
          level: 12,
          random: rnd,
        );
        expect(built, hasLength(want[probe.key]), reason: probe.key);
      }

      final locate = buildQuestions(
        pieces: pieces,
        quizType: PuzzleQuizType.locate,
        questions: 5,
        level: 12,
        random: rnd,
      );
      expect(
        locate.every((q) => q.options.isEmpty),
        want['locateOptionsAlwaysEmpty'],
        reason: 'у «розыска» вариантов нет: отвечают касанием по доске',
      );
      final pick = buildQuestions(
        pieces: pieces,
        quizType: PuzzleQuizType.pick,
        questions: 3,
        level: 3,
        random: rnd,
      );
      expect(
        pick.every((q) => q.options.isNotEmpty),
        want['pickHasOptions'],
        reason: 'у «выбора» варианты обязаны быть',
      );
    });
  }

  test('🔴 недобор вопросов ВИДЕН, а не молчит', () {
    // Позиция из четырёх одинаковых пешек: однозначных фигур нет вовсе, и
    // «розыск» не может задать ни одного вопроса. Это не ошибка кода — это
    // свойство позиции, и экран обязан его учитывать, а не показывать «0/5».
    final pawns = [
      for (var i = 0; i < 4; i++)
        PuzzlePiece(sq: i * 3, type: 'P', white: true),
    ];
    expect(uniquePieceCount(pawns), 0);
    expect(
      buildQuestions(
        pieces: pawns,
        quizType: PuzzleQuizType.locate,
        questions: 5,
        level: 12,
        random: Random(1),
      ),
      isEmpty,
      reason: 'спрашивать нечего, и это должно быть видно числом',
    );
  });
}

/// 🔴 КОРПУС ПОЗИЦИЙ: ТОТ ЖЕ ФАЙЛ, ТОТ ЖЕ ВЫБОР, ТА ЖЕ ДОСКА.
///
/// Веб и нативная половина везут ОДИН корпус и обязаны при одинаковом броске
/// выбрать одну позицию: иначе человек на той же ступени получит другую доску,
/// а прогресс поедет двумя путями.
void corpusMatchesLiveTs(Map<String, dynamic> reference) {
  final want = reference['corpus'] as Map<String, dynamic>;
  final meta = want['meta'] as Map<String, dynamic>;
  final parsedRef = (reference['parsed'] as List<dynamic>)
      .cast<Map<String, dynamic>>();

  late PositionCorpus corpus;
  setUpAll(() {
    corpus = PositionCorpus.parse(
      File('assets/chess_blind/positions.json').readAsStringSync(),
    );
  });

  test('🔴 корпус тот же: размер и происхождение', () {
    expect(corpus.size, meta['size'], reason: 'позиций в корпусе');
    expect(corpus.source, meta['source'], reason: 'откуда взят');
    expect(corpus.license, meta['license'], reason: 'лицензия');
    expect(corpus.method, meta['method'], reason: 'как набирался');
  });

  test('🔴 при ОДИНАКОВОМ броске выбирается ТА ЖЕ позиция, что в вебе', () {
    final picks = (want['picks'] as List<dynamic>).cast<Map<String, dynamic>>();
    for (final p in picks) {
      final band = p['band'] as Map<String, dynamic>;
      final b = PieceBand(band['min'] as int, band['max'] as int);
      expect(
        corpus.inBand(b),
        isNotEmpty,
        reason: 'полоса ${b.min}–${b.max} набрана',
      );
      // Края броска: 0 и почти 1. Формула выбора обязана совпасть с вебом.
      // 🔴 СВЕРЯЕТСЯ САМА ПОЗИЦИЯ, А НЕ ЧИСЛО ФИГУР. Первая версия этой пробы
      // сравнивала только количество, и мутация «округление вместо отсечения»
      // её пережила: в полосе десятки позиций с одинаковым числом фигур.
      // Отпечаток — набор занятых клеток.
      List<int> squares(double roll) =>
          piecesFromFen(corpus.pick(b, roll).fen).map((x) => x.sq).toList()
            ..sort();
      expect(
        squares(0),
        (p['lowSquares'] as List<dynamic>).cast<int>(),
        reason: 'бросок 0 выбрал ДРУГУЮ позицию, полоса ${b.min}–${b.max}',
      );
      expect(
        squares(0.999999),
        (p['highSquares'] as List<dynamic>).cast<int>(),
        reason: 'бросок ~1 выбрал ДРУГУЮ позицию, полоса ${b.min}–${b.max}',
      );
      expect(squares(0), hasLength(p['lowPieces']));
      expect(squares(0.999999), hasLength(p['highPieces']));

      // Середина броска: именно здесь отсечение расходится с округлением.
      final rolls = (want['rolls'] as List<dynamic>).cast<num>();
      final byRoll = (want['picksByRoll'] as List<dynamic>)
          .cast<Map<String, dynamic>>()
          .firstWhere(
            (e) =>
                (e['band'] as Map<String, dynamic>)['min'] == b.min &&
                (e['band'] as Map<String, dynamic>)['max'] == b.max,
          );
      final expectedByRoll = (byRoll['squares'] as List<dynamic>)
          .map((x) => (x as List<dynamic>).cast<int>())
          .toList();
      for (var i = 0; i < rolls.length; i++) {
        expect(
          squares(rolls[i].toDouble()),
          expectedByRoll[i],
          reason:
              'бросок ${rolls[i]} выбрал ДРУГУЮ позицию, полоса ${b.min}–${b.max}',
        );
      }
      // И фактическое число фигур обязано лежать В ПОЛОСЕ, а не рядом.
      for (final roll in [0.0, 0.25, 0.5, 0.75, 0.999999]) {
        final pieces = piecesFromFen(corpus.pick(b, roll).fen).length;
        expect(
          pieces,
          inInclusiveRange(b.min, b.max),
          reason:
              'бросок $roll дал $pieces фигур мимо полосы ${b.min}–${b.max}',
        );
      }
    }
  });

  test('🔴 разбор FEN совпадает с живым TS клетка в клетку', () {
    for (final want in parsedRef) {
      final got = piecesFromFen(want['fen'] as String);
      final expected = (want['pieces'] as List<dynamic>)
          .cast<Map<String, dynamic>>();
      expect(
        got,
        hasLength(expected.length),
        reason: 'фигур в «${want['fen']}»',
      );
      // Порядок у TS свой, поэтому сверяем множеством «клетка+вид+цвет».
      String key(int sq, String type, bool white) =>
          '$sq$type${white ? 'w' : 'b'}';
      expect(
        got.map((p) => key(p.sq, p.type, p.white)).toSet(),
        expected
            .map(
              (e) =>
                  key(e['sq'] as int, e['type'] as String, e['white'] as bool),
            )
            .toSet(),
        reason: 'позиция «${want['fen']}» разобрана иначе',
      );
    }
  });
}

/// 🔴 ХОДЫ ФИГУР СВЕРЕНЫ С ЭТАЛОНОМ, А ЦЕПОЧКА — СО СВОИМИ СВОЙСТВАМИ.
///
/// Сами ходы детерминированы и сверяются клетка в клетку. Цепочка ходов вслепую
/// случайна по устройству, поэтому у неё проверяется другое: длина, то что
/// каждый ход идёт с занятой клетки на пустую, и что позиция после цепочки
/// содержит те же фигуры — фишки ДВИГАЮТСЯ, а не появляются и исчезают.
void movesMatchLiveTs(Map<String, dynamic> reference) {
  final cases = (reference['moveCases'] as List<dynamic>)
      .cast<Map<String, dynamic>>();

  test('🔴 ходы каждой фигуры совпадают с эталоном', () {
    for (final c in cases) {
      final got = movesFor(
        sq: c['sq'] as int,
        type: c['type'] as String,
        white: c['white'] as bool,
        occupied: (c['occupied'] as List<dynamic>).cast<int>().toSet(),
      );
      expect(
        got,
        (c['moves'] as List<dynamic>).cast<int>(),
        reason: '${c['type']} с клетки ${c['sq']}',
      );
    }
  });

  test('🔴 цепочка ходов вслепую: фишки ДВИГАЮТСЯ, а не пропадают', () {
    final start = piecesFromFen(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1',
    );
    final result = generateBlindMoves(
      pieces: start,
      count: 8,
      random: Random(11),
    );
    expect(
      result.moves,
      hasLength(8),
      reason: 'на полной доске ходы есть всегда',
    );
    expect(result.after, hasLength(start.length), reason: 'фигур столько же');
    // Состав фигур не изменился: взятий в игре нет.
    List<String> kinds(List<PuzzlePiece> ps) =>
        ps.map((p) => '${p.type}${p.white ? 'w' : 'b'}').toList()..sort();
    expect(kinds(result.after), kinds(start), reason: 'взятий быть не должно');
    // Ни одна фишка не села на другую.
    expect(
      result.after.map((p) => p.sq).toSet(),
      hasLength(result.after.length),
      reason: 'две фишки на одной клетке',
    );
  });

  test('🔴 цепочка ОБРЫВАЕТСЯ, если ходить некому, и это видно длиной', () {
    // Король в углу, окружённый своими: ходов нет ни у кого, кроме пешек —
    // поэтому берём позицию из одних королей вплотную.
    final locked = [
      const PuzzlePiece(sq: 0, type: 'K', white: true),
      const PuzzlePiece(sq: 1, type: 'K', white: false),
      const PuzzlePiece(sq: 8, type: 'K', white: true),
      const PuzzlePiece(sq: 9, type: 'K', white: false),
    ];
    final result = generateBlindMoves(
      pieces: locked,
      count: 5,
      random: Random(3),
    );
    expect(result.moves.length, lessThanOrEqualTo(5));
    for (final m in result.moves) {
      expect(m.from, isNot(m.to), reason: 'ход на месте — не ход');
    }
  });
}
