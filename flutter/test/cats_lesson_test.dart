import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/cats/generator.dart';
import 'package:psygames_flutter/games/cats/lesson.dart';
import 'package:psygames_flutter/games/cats/rules.dart';
import 'package:psygames_flutter/shell/l10n.dart';

/// 🔴 РАЗБОР «КОШЕК» ОБЯЗАН УЧИТЬ, А НЕ ПОКАЗЫВАТЬ ОТВЕТ.
///
/// Три обещания, и каждое ломается по-своему:
///   1. разбор доводит доску до решения — иначе он бросает человека на полпути;
///   2. каждая поставленная кошка — из разгадки: местная проверка «одно место»
///      не знает будущего, и без этого условия разбор научил бы неверному ходу;
///   3. шаги НАЗВАНЫ приёмом, и вынужденных среди них большинство — разбор, где
///      каждый шаг «дальше перебор», это показ ответа под другим именем.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async => L.load('ru'));

  const sizes = [6, 7, 8, 9, 10];

  test('🔴 разбор доводит доску до решения, и каждая кошка — из разгадки', () {
    for (final n in sizes) {
      for (var i = 0; i < 5; i++) {
        final b = generateCats(n, 'разбор-$n-$i')!.board;
        final moves = catsLessonMoves(b);
        final cats = {for (final m in moves) m.r * n + m.c};
        expect(moves.length, n, reason: 'поле $n×$n: шагов столько же, сколько кошек');
        expect(cats, b.solutionCells, reason: 'поле $n×$n: разбор ставит ровно разгадку');
        expect(catsSolved(b, cats), isTrue);
      }
    }
  });

  /// ЗАМЕР И ПОРОГ СРАЗУ: какая доля ходов вынуждена. Это и есть ответ на вопрос
  /// «учит ли разбор»: перебор — честное слово там, где приёма нет, но если перебор
  /// повсюду, человек смотрит на готовую разгадку.
  test('🔴 большинство шагов вынуждены приёмом, а не «дальше перебор»', () {
    var forced = 0, total = 0;
    final byTechnique = <CatTechnique, int>{};
    for (final n in sizes) {
      for (var i = 0; i < 10; i++) {
        final b = generateCats(n, 'приёмы-$n-$i')!.board;
        for (final m in catsLessonMoves(b)) {
          total++;
          byTechnique[m.why] = (byTechnique[m.why] ?? 0) + 1;
          if (m.why != CatTechnique.trial) forced++;
        }
      }
    }
    final share = forced / total;
    // ignore: avoid_print
    print('шагов $total · вынуждено ${(share * 100).toStringAsFixed(1)} % · '
        'по приёмам: ${byTechnique.entries.map((e) => '${e.key.name}=${e.value}').join(', ')}');
    expect(share, greaterThan(0.5), reason: 'разбор, где почти всё — перебор, показывает ответ');

    // ⚠️ ДОЛИ МАЛО: она зелёная, даже если один приём разбор перестал видеть вовсе.
    // 📍 Замер 30.09.2026: мутация «приём "цвет" не распознаётся» прошла мимо порога —
    // ходы подхватили строка и перебор, доля осталась выше половины. Поэтому каждый
    // из двух главных приёмов обязан встречаться сам. Столбец (9 из 400) не требуется:
    // на такой частоте проба стала бы зависеть от раскладки, а не от кода.
    expect(byTechnique[CatTechnique.region] ?? 0, greaterThan(total ~/ 4),
        reason: '«в цвете одно место» — главный приём этой игры');
    expect(byTechnique[CatTechnique.row] ?? 0, greaterThan(0), reason: 'приём «строка» виден');
  });

  test('🔴 у каждого шага есть имя приёма — ключ и строка из словаря', () {
    final b = generateCats(8, 'имена')!.board;
    final steps = catsLessonSteps(b);
    expect(steps, isNotEmpty);
    for (final s in steps) {
      expect(s.techniqueKey, isNotNull);
      expect(s.text, isNotNull);
      expect(s.text, isNot(s.techniqueKey),
          reason: 'в разборе видна строка, а не сам ключ — ключ ${s.techniqueKey} не собран в словарь');
      expect(s.box, isNotNull, reason: 'рамка показывает, куда ставим');
    }
  });
}
