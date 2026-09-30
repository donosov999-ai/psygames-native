library;

import '../../shell/board_puzzle.dart';
import 'model.dart';

/// КОЛБЫ ПОД ОБЩИМ ДОГОВОРОМ ДОСКИ.
///
/// 🔴 ТРЕТЬЯ ИГРА НА ТОМ ЖЕ РЕШАТЕЛЕ, И ЭТО ПРОВЕРКА ЗАМЫСЛА, А НЕ УКРАШЕНИЕ.
/// Ханой и башни Лондона похожи между собой — «снять верхнее, положить сверху».
/// Колбы устроены иначе: за один ход переливается СРАЗУ НЕСКОЛЬКО одинаковых
/// шариков, и сколько именно — решает сама игра (`pourAmount`). Если договор
/// садится и сюда, значит он про ходы вообще, а не про стопки.
///
/// ⚠️ Снимок кодирует и ЗАПЕЧАТАННЫЕ колбы: доска с тем же набором шариков, но
/// другим числом запечатанных — другое положение, и поиск обязан их различать.
class TubePuzzle extends BoardPuzzle<TubeField, TubeMove> {
  const TubePuzzle();

  @override
  String keyOf(TubeField f) =>
      '${f.tubes.map((t) => t.join(',')).join('|')}#${f.sealed}';

  @override
  bool solved(TubeField f) => f.isSolved;

  @override
  List<TubeMove> movesFrom(TubeField f) => legalMoves(f);

  @override
  TubeField? apply(TubeField f, TubeMove m) => pour(f, m.from, m.to);
}
