import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/deep/tree.dart';

/// 🔴 ЦИФРА СНИЗУ ПОЯВЛЯЕТСЯ И ПРОПАДАЕТ САМА — ВТОРОЙ БУХГАЛТЕРИИ НЕТ.
///
/// Главное правило «Бездны»: значение кормимой клетки не хранится, а ВЫЧИСЛЯЕТСЯ из
/// вопроса «дорешан ли ребёнок». Поэтому отмена хода в ребёнке, роняющая его ниже
/// порога, сама забирает цифру у родителя. Здесь это проверяется поведением, а не
/// чтением кода, — и здесь же меряется цена: нетронутое поддерево не материализуется.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late DeepBank bank;
  setUpAll(() async => bank = await DeepBank.load());

  const cfg = DeepCfg(depth: 2, rating: 1.2, feedCount: 9, unlockShare: 0.24);
  const seed = 'проба-прогресса';

  /// Узлы с кэшем и счётчиком материализаций — так их держит экран.
  ({NodeAt at, List<String> made}) nodes() {
    final cache = <String, DeepNode>{};
    final made = <String>[];
    DeepNode at(String p) => cache.putIfAbsent(p, () {
          made.add(p);
          return materializeChain(bank, seed, p, cfg).last;
        });
    return (at: at, made: made);
  }

  test('🔴 нетронутое дерево не материализуется: цена открытия — один узел', () {
    final n = nodes();
    final played = <String, List<List<int>>>{};
    // Отрисовка корня спрашивает значение каждой клетки — и не должна тащить детей.
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        deepValueAt(n.at, played, '', r, c);
      }
    }
    expect(n.made, [''], reason: 'материализовано: ${n.made.length} узлов — ${n.made.take(5)}');
  });

  test('🔴 порог ребёнка взят — цифра всплыла в родителя; отмена — забрала обратно', () {
    final n = nodes();
    final root = n.at('');
    final cell = root.feedCells.first;
    final kidPath = childPath('', cell[0], cell[1]);
    final kid = n.at(kidPath);

    final played = <String, List<List<int>>>{
      kidPath: [for (var r = 0; r < 9; r++) List<int>.filled(9, 0)],
    };

    // До порога цифры наверху нет.
    expect(deepValueAt(n.at, played, '', cell[0], cell[1]), 0);
    expect(deepNodeDone(n.at, played, kidPath), isFalse);

    // Закрываем клетки ребёнка по решению, пока порог не возьмётся.
    var filled = 0;
    outer:
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        if (kid.puzzle[r][c] != 0) continue;
        if (kid.feedCells.any((f) => f[0] == r && f[1] == c)) continue;
        played[kidPath]![r][c] = kid.solution[r][c];
        if (++filled >= kid.unlockCells) break outer;
      }
    }
    expect(deepNodeDone(n.at, played, kidPath), isTrue,
        reason: 'порог ${kid.unlockCells}, закрыто $filled');
    expect(deepValueAt(n.at, played, '', cell[0], cell[1]), root.solution[cell[0]][cell[1]],
        reason: 'цифра ребёнка всплыла в кормимую клетку родителя');

    // Снимаем одну клетку — узел падает ниже порога, и цифра наверху пропадает сама.
    outer2:
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        if (played[kidPath]![r][c] != 0) {
          played[kidPath]![r][c] = 0;
          break outer2;
        }
      }
    }
    expect(deepNodeDone(n.at, played, kidPath), isFalse);
    expect(deepValueAt(n.at, played, '', cell[0], cell[1]), 0,
        reason: 'цифру, которую уже нечем подтвердить, наверху не оставляют');
  });

  /// ⚠️ ЭТО НЕ ТЕОРИЯ. Мутация «считать кормимые клетки своими» прошла мимо первой
  /// редакции проб: экран в такую клетку не пишет, и разницы не возникало. Но правило
  /// живёт в движке, а не в экране, — значит и проверяться должно движком: если завтра
  /// экран туда что-нибудь запишет, порог не должен браться чужой цифрой.
  test('🔴 цифра, попавшая в кормимую клетку, прогрессом НЕ считается', () {
    final n = nodes();
    final root = n.at('');
    final played = <String, List<List<int>>>{
      '': [for (var r = 0; r < 9; r++) List<int>.filled(9, 0)],
    };
    final before = deepNodeProgress(n.at, played, '');

    // Кладём в кормимые клетки верные цифры решения — «как будто» их кто-то вписал.
    for (final f in root.feedCells) {
      played['']![f[0]][f[1]] = root.solution[f[0]][f[1]];
    }
    expect(deepNodeProgress(n.at, played, ''), before,
        reason: 'кормимая клетка закрывается ребёнком, а не рукой');
    expect(deepOwnSolved(root, played['']), 0);
  });

  test('🔴 победа — это собранный корень, и она не наступает раньше времени', () {
    final n = nodes();
    final root = n.at('');
    final played = <String, List<List<int>>>{
      '': [for (var r = 0; r < 9; r++) List<int>.filled(9, 0)],
    };
    expect(deepRootComplete(n.at, played), isFalse);

    // Свои клетки корня закрываем рукой, кормимые — решением детей.
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        if (root.puzzle[r][c] != 0) continue;
        if (root.feedCells.any((f) => f[0] == r && f[1] == c)) continue;
        played['']![r][c] = root.solution[r][c];
      }
    }
    expect(deepRootComplete(n.at, played), isFalse,
        reason: 'девять кормимых клеток без детей — корень не собран');

    for (final f in root.feedCells) {
      final p = childPath('', f[0], f[1]);
      final kid = n.at(p);
      played[p] = [for (var r = 0; r < 9; r++) List<int>.filled(9, 0)];
      var filled = 0;
      outer:
      for (var r = 0; r < 9; r++) {
        for (var c = 0; c < 9; c++) {
          if (kid.puzzle[r][c] != 0) continue;
          played[p]![r][c] = kid.solution[r][c];
          if (++filled >= kid.unlockCells) break outer;
        }
      }
    }
    expect(deepRootComplete(n.at, played), isTrue, reason: 'все девять детей дорешаны — победа');
  });
}
