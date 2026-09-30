/// ПОЗИЦИЯ «ДЕТСКОГО МАТА» И ПРОВЕРКА ОТВЕТА.
///
/// Перенос с живого TS (`frontend/src/games/scholars-mate/core/check.ts`) СО
/// СВЕРКОЙ: эталон снят прогоном самого TS, проба сверяет вердикты позиция в
/// позицию. Правила шахмат считает `bishop` (чистый Dart, MIT) — в вебе ту же
/// работу делает chess.js.
///
/// 🔴 ГЛАВНОЕ ЗДЕСЬ — ПРЕ-ХОД. В записи Lichess первый ход последовательности
/// принадлежит СОПЕРНИКУ: `fen` — позиция ДО него, а спрашивают про то, что
/// будет ПОСЛЕ. Показать `fen` как есть значит показать чужую позицию и
/// спросить ход, которого в ней нет; задача выглядит нерешаемой, и виноватым
/// человек считает себя.
///
/// ⚠️ ПРАВИЛЬНЫХ ХОДОВ БЫВАЕТ НЕСКОЛЬКО. У «защитись» их 2–12: любой, после
/// которого мата в один у соперника нет. Засчитывается ЛЮБОЙ, показывается
/// лучший — на детском уровне «спасся» важнее, чем «спасся красиво».
library;

import 'package:bishop/bishop.dart' as bishop;

import 'ladder.dart';

// Вид задания объявлен в лестнице — она переносилась первой. Второй такой же
// enum здесь был бы двумя разными типами с одним именем.
export 'ladder.dart' show ScholarsKind;

/// Одна задача набора.
class ScholarsPuzzle {
  const ScholarsPuzzle({
    required this.kind,
    required this.fen,
    this.pre,
    this.solutions = const [],
    this.san = const [],
    this.line = const [],
    this.mateIn = 1,
    this.rating = 0,
    this.motif,
    this.threat,
  });

  final ScholarsKind kind;

  /// Позиция ДО пре-хода. Показывать человеку только после [pre].
  final String fen;

  /// Ход соперника, который играется перед вопросом (только Lichess).
  final String? pre;

  /// Верные ходы в записи uci. У `threat` пусто.
  final List<String> solutions;

  /// Те же ходы в записи SAN.
  final List<String> san;

  /// Продолжение для мата в 2–3 хода: наш ход, ответ соперника, наш ход…
  final List<String> line;

  final int mateIn;
  final int rating;
  final String? motif;

  /// Ответ да/нет для `threat` — разметка источника, не истина.
  final bool? threat;

  static ScholarsPuzzle fromJson(Map<String, dynamic> j) => ScholarsPuzzle(
    kind: ScholarsKind.values.firstWhere((k) => k.name == j['kind']),
    fen: j['fen'] as String,
    pre: j['pre'] as String?,
    solutions: (j['solutions'] as List? ?? []).cast<String>(),
    san: (j['san'] as List? ?? []).cast<String>(),
    line: (j['line'] as List? ?? []).cast<String>(),
    mateIn: (j['mateIn'] as num? ?? 1).toInt(),
    rating: (j['rating'] as num? ?? 0).toInt(),
    motif: j['motif'] as String?,
    threat: j['threat'] as bool?,
  );
}

/// Что вышло из ответа человека.
class Verdict {
  const Verdict({
    required this.correct,
    this.best,
    this.reply,
    this.fenAfter,
    this.mated = false,
    this.refutation,
  });

  final bool correct;

  /// Верный ход в записи SAN — показать после ответа.
  final String? best;

  /// Ответ соперника, если задача в два-три хода и ход был верный.
  final String? reply;

  /// Позиция после нашего хода (и ответа соперника).
  final String? fenAfter;

  /// Мат уже поставлен — партия окончена.
  final bool mated;

  /// 🔴 ЧЕМ НАКАЗАЛИ: ход соперника, который матует после НЕВЕРНОЙ защиты.
  /// Без него разбор ошибки половинчатый — человек видит «верно было Qe7», но
  /// не видит, что случилось с его ходом.
  final String? refutation;
}

bishop.Game _board(String fen) =>
    bishop.Game(variant: bishop.Variant.standard(), fen: fen);

/// FEN в том же виде, в каком его пишет веб.
///
/// 🔴 ПОЛЕ ВЗЯТИЯ НА ПРОХОДЕ ЗАПОЛНЯЕТСЯ ПО-РАЗНОМУ. `bishop` ставит клетку
/// всегда, когда пешка шагнула через одну; chess.js — только когда взятие
/// действительно возможно. Позиция одна, строки разные, и сверка с вебом
/// краснела на первой же партии из Lichess (замер 25.09.2026: fromGames[0],
/// «g6» против «-»). Поле нужно и человеку: FEN уходит в отчёт о дефекте и в
/// эталон, и две записи одной позиции — это две позиции при поиске.
String _asWebWrites(bishop.Game g) {
  final fen = g.fen;
  final parts = fen.split(' ');
  if (parts.length < 4 || parts[3] == '-') return fen;
  final target = parts[3];
  for (final m in g.generateLegalMoves()) {
    final uci = g.toAlgebraic(m);
    if (uci.substring(2, 4) != target) continue;
    final from = uci.substring(0, 2);
    final piece = _pieceAt(fen, from);
    if (piece != null && piece.toLowerCase() == 'p') return fen;
  }
  parts[3] = '-';
  return parts.join(' ');
}

/// Сыграть ход в записи uci. Возвращает, получилось ли.
bool _play(bishop.Game g, String uci) {
  try {
    return g.makeMoveString(uci);
  } catch (_) {
    return false;
  }
}

/// Позиция, которую реально видит человек: [ScholarsPuzzle.fen] уже с
/// разыгранным пре-ходом.
String shownFen(ScholarsPuzzle p) {
  final pre = p.pre;
  if (pre == null || pre.isEmpty) return p.fen;
  final g = _board(p.fen);
  if (!_play(g, pre)) return p.fen; // битая запись — показываем как есть
  return _asWebWrites(g);
}

/// Чей ход в показанной позиции: 'w' или 'b'.
///
/// ⚠️ БЕРЁМ ИЗ СТРОКИ, А НЕ РАЗБОРОМ. Сторона хода — второе поле FEN, и
/// создавать ради неё доску незачем: доска перерисовывается десять раз в
/// секунду по секундомеру.
String sideToMove(ScholarsPuzzle p) =>
    shownFen(p).split(' ')[1] == 'b' ? 'b' : 'w';

/// Матующий ход в записи SAN, если он есть.
String? matingMove(String fen) {
  try {
    final g = _board(fen);
    for (final m in g.generateLegalMoves()) {
      final t = _board(fen);
      if (!_play(t, g.toAlgebraic(m))) continue;
      if (t.checkmate) return g.toSan(m);
    }
  } catch (_) {
    // битая позиция
  }
  return null;
}

/// Есть ли у стороны, чей ход, мат в один.
bool hasMateInOne(String fen) {
  final g = _board(fen);
  for (final m in g.generateLegalMoves()) {
    final t = _board(fen);
    if (!_play(t, g.toAlgebraic(m))) continue;
    if (t.checkmate) return true;
  }
  return false;
}

/// 🔴 «ГРОЗИТ ЛИ МАТ» — ЭТО ВОПРОС ПРО СОПЕРНИКА, А НЕ ПРО ХОДЯЩЕГО.
///
/// В такой позиции ходит ЗАЩИЩАЮЩИЙСЯ, а мат грозит другой стороне. Спросить
/// доску «есть ли мат в один» напрямую значит спросить, может ли матовать сам
/// защищающийся: другой вопрос, другой ответ. Считаем НУЛЕВЫМ ХОДОМ —
/// передаём очередь сопернику и спрашиваем про него.
///
/// ⚠️ Если защищающийся уже под шахом, «пропустить ход» нельзя, и вопрос
/// теряет смысл: там не «грозит», там уже случилось. Такие позиции считаем
/// угрозой.
bool threatAnswer(ScholarsPuzzle p) {
  final fen = shownFen(p);
  final g = _board(fen);
  if (g.inCheck) return true;
  final parts = fen.split(' ');
  parts[1] = parts[1] == 'w' ? 'b' : 'w';
  if (parts.length > 3) {
    parts[3] = '-'; // взятие на проходе после пропуска хода недействительно
  }
  try {
    return hasMateInOne(parts.join(' '));
  } catch (_) {
    return p.threat ?? false; // позиция без нулевого хода — верим разметке
  }
}

const Map<String, int> _pieceValue = {
  'p': 1,
  'n': 3,
  'b': 3,
  'r': 5,
  'q': 9,
  'k': 0,
};

/// Что стоит на клетке в позиции. Пусто — клетка свободна.
///
/// Читается из строки FEN, а не спрашивается у движка: цена фигуры нужна и для
/// взятой, и для пошедшей, а Move отдаёт их кодами своего варианта.
String? _pieceAt(String fen, String square) {
  final file = square.codeUnitAt(0) - 97;
  final rank = int.parse(square.substring(1));
  final rows = fen.split(' ').first.split('/');
  if (rank < 1 || rank > rows.length) return null;
  final row = rows[rows.length - rank];
  var col = 0;
  for (final ch in row.split('')) {
    final digit = int.tryParse(ch);
    if (digit != null) {
      col += digit;
      continue;
    }
    if (col == file) return ch;
    col++;
  }
  return null;
}

int _valueOf(String? piece) =>
    piece == null ? 0 : (_pieceValue[piece.toLowerCase()] ?? 0);

/// Лучший ход защиты — ВЫЧИСЛЕННЫЙ, а не первый из списка.
///
/// 📍 Замер веба 05.09.2026: из 3977 ходов, записанных генератором как
/// спасающие, реально спасают 3740 (94%). Список годен как подсказка и негоден
/// как истина.
///
/// 🔴 ИЗ СПАСАЮЩИХ БЕРЁТСЯ НЕ ПЕРВЫЙ, А НЕ ТЕРЯЮЩИЙ ФИГУРУ: прежняя редакция
/// веба в 32 случаях из 378 советовала ход, после которого фигуру просто
/// съедают, и человек учился отдавать слона ни за что.
String? bestDefence(ScholarsPuzzle p) {
  final fen = shownFen(p);
  final g = _board(fen);
  String? bestSan;
  int? bestGain;
  for (final m in g.generateLegalMoves()) {
    final uci = g.toAlgebraic(m);
    final t = _board(fen);
    if (!_play(t, uci)) continue;
    if (hasMateInOne(t.fen)) continue; // не спасает — не наш случай
    final from = uci.substring(0, 2);
    final to = uci.substring(2, 4);
    final took = _valueOf(_pieceAt(fen, to));
    final recaptured = _canBeTakenOn(t, to);
    final gave = recaptured ? _valueOf(_pieceAt(fen, from)) : 0;
    final gain = took - gave;
    if (bestGain == null || gain > bestGain) {
      bestGain = gain;
      bestSan = g.toSan(m);
    }
    if (bestGain >= 0) break; // не теряем материал — дальше не ищем
  }
  return bestSan;
}

/// Спасает ли ход (в записи SAN) и чего стоит, в пешках.
///
/// 🔴 «ЛУЧШИЙ ХОД ЗАЩИТЫ» ОПРЕДЕЛЁН НЕОДНОЗНАЧНО, и сверять его строкой с
/// вебом нельзя. Спасающих ходов бывает до двенадцати, и при равной цене
/// выбирается первый по порядку перебора — а порядок у `bishop` и у chess.js
/// разный (замер 25.09.2026: пять позиций из сорока, у нас Qc7, в вебе Qe7 —
/// оба спасают и оба ничего не теряют). Поэтому сверяется СВОЙСТВО: наш ход
/// спасает и по материалу не хуже веб-варианта.
///
/// Пусто — такого хода нет или он не спасает.
int? defenceGain(ScholarsPuzzle p, String san) {
  final fen = shownFen(p);
  final g = _board(fen);
  for (final m in g.generateLegalMoves()) {
    if (g.toSan(m) != san) continue;
    final uci = g.toAlgebraic(m);
    final t = _board(fen);
    if (!_play(t, uci)) return null;
    if (hasMateInOne(t.fen)) return null;
    final took = _valueOf(_pieceAt(fen, uci.substring(2, 4)));
    final gave = _canBeTakenOn(t, uci.substring(2, 4))
        ? _valueOf(_pieceAt(fen, uci.substring(0, 2)))
        : 0;
    return took - gave;
  }
  return null;
}

/// Может ли сторона, чей сейчас ход, взять фигуру на этой клетке.
bool _canBeTakenOn(bishop.Game g, String square) {
  for (final m in g.generateLegalMoves()) {
    final uci = g.toAlgebraic(m);
    if (uci.substring(2, 4) != square) continue;
    if (_pieceAt(g.fen, square) != null) return true;
  }
  return false;
}

/// Проверить ход человека.
///
/// 🔴 ДЛЯ `mate` СВЕРЯЕМ НЕ СО СПИСКОМ, А С ДОСКОЙ: если ход ставит мат, он
/// верный, даже если в списке его нет. Обратное тоже важно — совпал со
/// списком, а мата нет, значит запись битая, и засчитывать нельзя.
///
/// ⚠️ У `defend` наоборот: доска сама ответа не даёт, «защитился» это «после
/// моего хода у соперника нет мата в один», и проверяется перебором.
Verdict check(ScholarsPuzzle p, String uci) {
  final fen = shownFen(p);
  final g = _board(fen);
  final firstSan = p.san.isEmpty ? null : p.san.first;
  if (!_play(g, uci)) return Verdict(correct: false, best: firstSan);

  final after = _asWebWrites(g);

  if (p.kind == ScholarsKind.defend) {
    final saved = !hasMateInOne(after);
    return Verdict(
      correct: saved,
      best: bestDefence(p) ?? firstSan,
      fenAfter: after,
      // `saved ?` здесь экономия, а не защита: после верной защиты мата в один
      // нет, и `matingMove` вернул бы null сам. Условие экономит полный
      // перебор на каждом ВЕРНОМ ответе, то есть на большинстве.
      refutation: saved ? null : matingMove(after),
    );
  }

  if (g.checkmate) {
    return Verdict(
      correct: true,
      best: firstSan,
      fenAfter: after,
      mated: true,
    );
  }

  // Мат в два-три хода: наш ход верен, если он ПЕРВЫЙ в записанной
  // последовательности. Проверять «ведёт ли к мату» перебором нельзя — это
  // работа движка, которого в приложении нет; здесь верим записи Lichess.
  if (p.line.length > 1) {
    if (p.line.first != uci) {
      return Verdict(correct: false, best: firstSan, fenAfter: after);
    }
    final reply = p.line[1];
    if (reply.isNotEmpty && _play(g, reply)) {
      return Verdict(
        correct: true,
        best: firstSan,
        reply: reply,
        fenAfter: _asWebWrites(g),
      );
    }
    return Verdict(correct: true, best: firstSan, fenAfter: after);
  }

  return Verdict(
    correct: p.solutions.contains(uci),
    best: firstSan,
    fenAfter: after,
  );
}

/// Все законные ходы фигуры С УКАЗАННОЙ КЛЕТКИ — подсветка при выборе.
///
/// 🔴 Возвращает ПОЛЯ, а не ходы: превращение пешки даёт четыре хода на одно
/// поле, и подсветка обязана показать поле один раз.
List<String> movesFrom(String fen, String square) {
  try {
    final g = _board(fen);
    final seen = <String>{};
    for (final m in g.generateLegalMoves()) {
      final uci = g.toAlgebraic(m);
      if (uci.substring(0, 2) != square) continue;
      seen.add(uci.substring(2, 4));
    }
    return seen.toList();
  } catch (_) {
    return const [];
  }
}

/// 🔴 ПРЕВРАЩЕНИЕ ПЕШКИ: тап даёт четыре знака, а ход требует пятый.
///
/// Ферзь — единственный разумный выбор в матовой задаче: недопревращение в
/// этих узорах не встречается.
String completeMove(String fen, String uci) {
  if (uci.length > 4) return uci;
  try {
    final g = _board(fen);
    for (final m in g.generateLegalMoves()) {
      final full = g.toAlgebraic(m);
      if (full.length > 4 &&
          full.substring(0, 2) == uci.substring(0, 2) &&
          full.substring(2, 4) == uci.substring(2, 4)) {
        return '${uci}q';
      }
    }
    return uci;
  } catch (_) {
    return uci;
  }
}

/// Шаг связки «мата с жертвой»: ход человека, затем ответ соперника из записи.
///
/// 🔴 ЖЕРТВА ДОИГРЫВАЕТСЯ ДО МАТА. В вебе верность решалась первым ходом, и
/// упражнение, названное «мат с жертвой», кончалось до мата на всех 371 позиции.
/// Экран играет ответ соперника и спрашивает следующий ход, пока не мат.
({String fen, bool mated}) playLineStep(String fen, String uci, String? reply) {
  final g = _board(fen);
  _play(g, uci);
  if (reply != null) _play(g, reply);
  return (fen: _asWebWrites(g), mated: g.checkmate);
}
