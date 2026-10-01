/// РАЗБОР «ДЕТСКОГО МАТА» ПО ШАГАМ: ход за ходом и почему именно он.
///
/// 🔴 КАЖДЫЙ ХОД РАЗБОРА ПРОВЕРЕН ТЕМ ЖЕ, ЧЕМ ИГРА ЗАСЧИТЫВАЕТ ОТВЕТ. Мат — это
/// [check] с `mated`, защита — [check] с `correct` на ходе [bestDefence], угроза —
/// [threatAnswer] и её же нулевой ход [passTurn], жертва — [playLineStep] до мата.
/// Разбор, который показал бы ход, за который игра ставит «мимо», учил бы сдавать
/// неверный ответ (урок «Все слова» 30.09: база набора выглядела приёмом, а игра
/// её не засчитывает).
///
/// 🔴 КАЖДЫЙ ШАГ НАЗВАН ПРИЁМОМ, А НЕ ТОЛЬКО ХОДОМ. Показ ответа по шагам пишется
/// в пять строк и не учит ничему; здесь у каждого шага ключ словаря с приёмом
/// («смотри на поля вокруг короля», «отдай ход сопернику в уме»), и проба считает
/// названные шаги числом.
///
/// ⚠️ МАТЕРИАЛ СОБИРАЕТСЯ ТЕМИ ЖЕ ПРАВИЛАМИ, ЧТО И ПОДХОД. Разбор берёт колоду
/// режима и ступени, которую сейчас раздал бы «Начать», — и открывается ДО
/// партии: приём объясняют перед показом, а не после проигранного подхода.
library;

import '../../shell/l10n.dart';
import '../../shell/lesson.dart';
import 'check.dart';
import 'motifs.dart';

/// Что рисует доска на шаге разбора.
class ScholarsLessonFrame {
  const ScholarsLessonFrame({
    required this.fen,
    required this.whiteBottom,
    this.from,
    this.to,
    this.focus,
  });

  /// Позиция на этом шаге — уже ПОСЛЕ хода шага, если ход есть.
  final String fen;

  /// Ориентация как в партии: снизу та сторона, что ходит в задаче.
  final bool whiteBottom;

  /// Ход шага: откуда и куда (поля «e4»).
  final String? from;
  final String? to;

  /// Куда смотреть: король соперника.
  final String? focus;
}

/// 🔴 КЛЮЧИ ПРИЁМОВ — СПИСКОМ. Шаг получает ключ переменной, а сборщик словаря
/// (`flutter/tools/embed-l10n.mjs`) видит только литералы `L.t('…')` и такие
/// списки: без него строки не попали бы в словарь приложения, и разбор показал
/// бы сам ключ — а проба, сверяющая показанное с ожидаемым, этого не заметит.
const scholarsLessonKeys = <String>[
  'teachScholarsKing',
  'teachScholarsMate',
  'teachScholarsThreatAsk',
  'teachScholarsThreatYes',
  'teachScholarsThreatNo',
  'teachScholarsDefendThreat',
  'teachScholarsDefend',
  'teachScholarsSacrifice',
  'teachScholarsReply',
  'teachScholarsContinue',
];

/// Сколько примеров в одном разборе. Каждый — два-пять шагов; больше трёх
/// превращает разбор в отдельную партию.
const int scholarsLessonExamples = 3;

/// Поле короля стороны [white] в позиции.
String? _kingSquare(String fen, {required bool white}) {
  final rows = fen.split(' ').first.split('/');
  for (var r = 0; r < rows.length; r++) {
    var c = 0;
    for (final ch in rows[r].split('')) {
      final gap = int.tryParse(ch);
      if (gap != null) {
        c += gap;
        continue;
      }
      if (ch == (white ? 'K' : 'k')) {
        return '${String.fromCharCode(97 + c)}${8 - r}';
      }
      c++;
    }
  }
  return null;
}

bool _whiteToMove(String fen) => fen.split(' ')[1] != 'b';

/// Шаг разбора: ключ приёма, готовая строка и кадр доски.
LessonStep _step(
  String key,
  ScholarsLessonFrame frame, {
  Map<String, String> args = const {},
  String? motif,
}) {
  final body = args.isEmpty ? L.t(key) : L.f(key, args);
  // Имя узора — уже переведённый ключ игры; разбор говорит на языке экрана.
  final text = motif == null
      ? body
      : '${L.t(motifKey[motif] ?? motif)} · $body';
  return LessonStep(techniqueKey: key, text: text, payload: frame);
}

/// Шаги одного примера. Пусто — пример разобрать нечем (битая запись), и тогда
/// его место займёт следующий пример колоды, а не выдуманное объяснение.
List<LessonStep> scholarsLessonSteps(ScholarsPuzzle p) {
  final fen = shownFen(p);
  final bottom = sideToMove(p) == 'w';
  final mover = _whiteToMove(fen);
  final enemyKing = _kingSquare(fen, white: !mover);
  final start = ScholarsLessonFrame(
    fen: fen,
    whiteBottom: bottom,
    focus: enemyKing,
  );

  switch (p.kind) {
    case ScholarsKind.threat:
      final ask = _step(
        'teachScholarsThreatAsk',
        ScholarsLessonFrame(fen: fen, whiteBottom: bottom),
      );
      if (!threatAnswer(p)) {
        return [
          ask,
          _step(
            'teachScholarsThreatNo',
            ScholarsLessonFrame(fen: fen, whiteBottom: bottom),
          ),
        ];
      }
      // Под шахом «пропустить ход» нельзя: игра засчитывает такую позицию
      // угрозой, но показать ход угрозы нечем — пример уступает место.
      if (inCheck(fen)) return const [];
      final passed = passTurn(fen);
      final mate = mateInOne(passed);
      if (mate == null) return const [];
      final after = playLineStep(passed, mate.uci, null).fen;
      return [
        ask,
        _step(
          'teachScholarsThreatYes',
          ScholarsLessonFrame(
            fen: after,
            whiteBottom: bottom,
            from: mate.uci.substring(0, 2),
            to: mate.uci.substring(2, 4),
          ),
          args: {'move': mate.san},
        ),
      ];

    case ScholarsKind.defend:
      // Под шахом угроза уже случилась — нулевого хода нет, показывать нечего.
      if (inCheck(fen)) return const [];
      final passed = passTurn(fen);
      final threat = mateInOne(passed);
      final san = bestDefence(p);
      final uci = san == null ? null : uciOf(fen, san);
      if (threat == null || san == null || uci == null) return const [];
      // Ход защиты обязан быть ЗАСЧИТАН игрой, а не только найден перебором.
      if (!check(p, uci).correct) return const [];
      return [
        _step(
          'teachScholarsDefendThreat',
          ScholarsLessonFrame(
            fen: playLineStep(passed, threat.uci, null).fen,
            whiteBottom: bottom,
            from: threat.uci.substring(0, 2),
            to: threat.uci.substring(2, 4),
          ),
          args: {'move': threat.san},
        ),
        _step(
          'teachScholarsDefend',
          ScholarsLessonFrame(
            fen: playLineStep(fen, uci, null).fen,
            whiteBottom: bottom,
            from: uci.substring(0, 2),
            to: uci.substring(2, 4),
          ),
          args: {'move': san},
        ),
      ];

    case ScholarsKind.mate:
    case ScholarsKind.fromGames:
    case ScholarsKind.sacrifice:
      if (p.line.length > 1) return _lineSteps(p, fen, bottom, start);
      String? mating;
      for (final s in p.solutions) {
        if (check(p, s).mated) {
          mating = s;
          break;
        }
      }
      final move = mating;
      final san = move == null ? null : sanOf(fen, move);
      if (move == null || san == null) return const [];
      return [
        _step('teachScholarsKing', start, motif: p.motif),
        _step(
          'teachScholarsMate',
          ScholarsLessonFrame(
            fen: playLineStep(fen, move, null).fen,
            whiteBottom: bottom,
            from: move.substring(0, 2),
            to: move.substring(2, 4),
          ),
          args: {'move': san},
        ),
      ];
  }
}

/// Мат в два-три хода по записанной связке: наш ход, вынужденный ответ, наш ход…
/// Последний ход обязан поставить мат — иначе связка разбору не годится.
List<LessonStep> _lineSteps(
  ScholarsPuzzle p,
  String fen,
  bool bottom,
  ScholarsLessonFrame start,
) {
  final steps = <LessonStep>[_step('teachScholarsKing', start, motif: p.motif)];
  var at = fen;
  var mated = false;
  for (var i = 0; i < p.line.length; i++) {
    final uci = p.line[i];
    final san = sanOf(at, uci);
    if (san == null) return const [];
    final played = playLineStep(at, uci, null);
    at = played.fen;
    mated = played.mated;
    final ours = i.isEven;
    final last = i == p.line.length - 1;
    final key = !ours
        ? 'teachScholarsReply'
        : last
        ? 'teachScholarsMate'
        : i == 0 && p.kind == ScholarsKind.sacrifice
        ? 'teachScholarsSacrifice'
        : 'teachScholarsContinue';
    steps.add(
      _step(
        key,
        ScholarsLessonFrame(
          fen: at,
          whiteBottom: bottom,
          from: uci.substring(0, 2),
          to: uci.substring(2, 4),
        ),
        args: {'move': san},
      ),
    );
  }
  return mated ? steps : const [];
}

/// Разбор по колоде: по одному примеру каждого вида, в порядке колоды.
///
/// ⚠️ Вид, у которого пример не разобрался, не пропадает молча — берётся
/// следующая позиция того же вида. Пусто целиком — разбора нет, и кнопка
/// об этом скажет пустым списком, а не выдуманным шагом.
List<LessonStep> scholarsLessonFromDeck(List<ScholarsPuzzle> deck) {
  final out = <LessonStep>[];
  final seen = <ScholarsKind>{};
  for (final p in deck) {
    if (seen.contains(p.kind)) continue;
    final steps = scholarsLessonSteps(p);
    if (steps.isEmpty) continue;
    seen.add(p.kind);
    out.addAll(steps);
    if (seen.length >= scholarsLessonExamples) break;
  }
  return out;
}
