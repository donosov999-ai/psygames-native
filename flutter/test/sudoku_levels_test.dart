import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/levels.dart';
import 'package:psygames_flutter/games/sudoku/rules.dart';

/// 🔴 У КАЖДОЙ СТУПЕНИ ЛЕСТНИЦЫ ЕСТЬ ДОСКА, И ОНА СХОДИТСЯ.
///
/// Доски возятся ДАННЫМИ: банк классики (1835 задач) и выгруженные вариантные доски
/// (780 штук на 65 уровней). Дыра в данных — это экран «доска не собралась» у живого
/// человека на конкретном уровне, и заметить её без этой пробы можно только жалобой.
///
/// Проверяется не только наличие, но и ЦЕЛОСТНОСТЬ: подсказки задания совпадают с
/// решением, решение полное и не нарушает правил своего варианта. Правила к этому
/// моменту уже сверены с живым TS (`sudoku_rules_test.dart`), поэтому здесь ими можно
/// мерить данные.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late SudokuLevels levels;

  setUpAll(() async {
    levels = await SudokuLevels.load();
  });

  test('лестница на месте: 92 ступени', () {
    expect(levels.lastLevel, 92);
    expect(levels.config(1).n, 6, reason: 'первые ступени — 6×6');
    expect(levels.config(9).variant, 'diagonal');
    expect(levels.config(62).variant, 'jigsaw', reason: 'кривые блоки переехали на 62–65 (23.09)');
    expect(levels.config(54).variant, 'none', reason: 'на 54–61 встал пояс ALS из банка');
  });

  test('🔴 у каждой из 92 ступеней есть хотя бы одна доска', () {
    final empty = <int>[];
    for (var lv = 1; lv <= 92; lv++) {
      if (levels.boardsFor(lv) == 0) empty.add(lv);
    }
    expect(empty, isEmpty, reason: 'ступени без досок: ${empty.take(10).join(', ')}');
  });

  /// ⚠️ ПРОВЕРЯЕМ КАЖДУЮ ДОСКУ, А НЕ ОДНУ НА УРОВЕНЬ. Первая редакция брала доску по
  /// зерну — и мутация «испортить подсказку первой доски» прошла мимо: на уровне их
  /// двенадцать, а выпадала другая. Теперь перебираются все вариантные доски выгрузки
  /// и по три банковских на каждый банковский уровень (там решение считается на месте,
  /// и перебор всего банка стоил бы минуты).
  test('🔴 каждая доска целая: подсказки совпадают с решением, решение законно', () {
    final broken = <String>[];
    var checked = 0;
    for (var lv = 1; lv <= 92; lv++) {
      final count = levels.boardsFor(lv);
      final cfg = levels.config(lv);
      final take = cfg.fromBank ? 3 : count;
      for (var i = 0; i < take && broken.length < 8; i++) {
        final board = levels.boardAt(lv, i);
        if (board == null) {
          broken.add('L$lv: доски нет');
          continue;
        }
        checked++;
        final n = board.n;

        // 1. Подсказки задания стоят там же и теми же цифрами, что в решении.
        for (var r = 0; r < n && broken.length < 8; r++) {
          for (var c = 0; c < n; c++) {
            final given = board.puzzle[r][c];
            if (given != 0 && given != board.solution[r][c]) {
              broken.add('L$lv: подсказка ($r,$c)=$given, а в решении ${board.solution[r][c]}');
              break;
            }
          }
        }

        // 2. Решение заполнено целиком.
        for (var r = 0; r < n && broken.length < 8; r++) {
          for (var c = 0; c < n; c++) {
            if (board.solution[r][c] == 0) {
              broken.add('L$lv: в решении пусто на ($r,$c)');
              break;
            }
          }
        }

        // 3. Решение не нарушает правил своего варианта: снимаем клетку и проверяем,
        //    что её цифра туда законна.
        final grid = [
          for (final row in board.solution) [...row],
        ];
        outer:
        for (var r = 0; r < n; r++) {
          for (var c = 0; c < n; c++) {
            final v = grid[r][c];
            grid[r][c] = 0;
            final ok = isValid(
              grid,
              r,
              c,
              v,
              n,
              board.br,
              board.bc,
              variant: board.variant,
              geometry: board.geometry,
            );
            grid[r][c] = v;
            if (!ok) {
              broken.add('L$lv (${board.variant}): решение нарушает правило на ($r,$c)=$v');
              break outer;
            }
          }
        }
      }
    }
    expect(broken, isEmpty, reason: broken.take(8).join(' · '));
    expect(checked, greaterThan(700), reason: 'проверено досок: $checked');
  });

  test('🔴 доски берутся из банка там, где лестница обещает классику 9×9', () {
    // 5–8, 54–61, 66–80 — банковские: у них есть рейтинг полосы, а геометрии нет.
    for (final lv in [5, 8, 54, 61, 66, 80]) {
      final board = levels.boardFor(lv, seed: 7)!;
      expect(board.rating, isNotNull, reason: 'L$lv обязан прийти из банка');
      expect(board.variant, 'none');
      expect(board.geometry.regions, isNull);
    }
    // 9–53, 62–65, 81–92 — вариантные: рейтинга нет, зато есть измеренная ступень.
    for (final lv in [9, 42, 62, 81, 92]) {
      final board = levels.boardFor(lv, seed: 7)!;
      expect(board.rating, isNull, reason: 'L$lv — вариантная доска, не банк');
      expect(board.tier, isNotNull, reason: 'у вариантной доски мера посчитана при выгрузке');
    }
  });

  test('полоса банка растёт по лестнице и сдвигается дорогой', () {
    expect(levels.bankRating(5) < levels.bankRating(54), isTrue);
    expect(levels.bankRating(54) < levels.bankRating(66), isTrue);
    expect(levels.bankRating(66) < levels.bankRating(80), isTrue);
    // «Полегче» берёт полосу ниже, «пожёстче» — выше.
    expect(levels.bankRating(66, shift: -1) < levels.bankRating(66), isTrue);
    expect(levels.bankRating(66, shift: 1) > levels.bankRating(66), isTrue);
  });

  test('одно зерно — одна и та же доска, разные зёрна — разные', () {
    final a = levels.boardFor(30, seed: 1)!;
    final b = levels.boardFor(30, seed: 1)!;
    expect(a.puzzle, b.puzzle);
    var differs = false;
    for (var s = 2; s < 12 && !differs; s++) {
      final c = levels.boardFor(30, seed: s)!;
      if (c.puzzle.toString() != a.puzzle.toString()) differs = true;
    }
    expect(differs, isTrue, reason: 'на уровне лежит не одна доска, а дюжина');
  });
}
