import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/puzzles/engine.dart';
import 'package:psygames_flutter/games/puzzles/lesson.dart';
import 'package:psygames_flutter/games/puzzles/techniques.dart';
import 'package:psygames_flutter/shell/lesson.dart';

/// 🔴 ИМЯ ПРИЁМА У ШАГА РАЗБОРА БЕРЁТСЯ ИЗ ПЕЧАТИ РЕШАТЕЛЯ АВТОРА (задача 23773004).
///
/// Разбор без имени приёма — это показ ответа (урок 23 из 40). Решатель Тэтхэма знает,
/// ПОЧЕМУ ставит клетку, и печатает это строками; мост их ловит, `techniques.dart` переводит
/// в ключ приёма по клетке. Строки ниже — настоящая печать движков 01.10.2026, не выдуманная.
///
/// Проба отвечает на три вопроса: верно ли читается каждая роль строки; совпадает ли клетка
/// печати с клеткой рисунка; и сколько шагов получает имя на живом движке — числом по игре.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('роли строк печати', () {
    test('заголовок Slant называет приём, но его координата — узел, а не решённая клетка', () {
      final m = techniqueByCell([
        'filling around clue point at 4,2',
        r'  placing \ in 1,3',
        'emptying around clue point at 2,3',
        '  placing / in 3,3',
      ]);
      expect(m[(1, 3)], 'teachLogicClueNeedsAll');
      expect(m[(3, 3)], 'teachLogicClueFull');
      expect(m.containsKey((4, 2)), isFalse, reason: 'узел подсказки записан решённой клеткой');
      expect(m.containsKey((2, 3)), isFalse, reason: 'узел подсказки записан решённой клеткой');
    });

    test('подсказка Light Up решает соседей по стороне, а не по диагонали', () {
      final m = techniqueByCell(['Clue at (2,1) full; setting unlit to IMPOSSIBLE.']);
      for (final c in const [(1, 1), (3, 1), (2, 0), (2, 2)]) {
        expect(m[c], 'teachLogicClueFull', reason: 'сосед $c');
      }
      expect(m.containsKey((1, 0)), isFalse, reason: 'диагональ подсказкой Light Up не решается');
      expect(m.containsKey((3, 2)), isFalse, reason: 'диагональ подсказкой Light Up не решается');
    });

    test('прямо названная клетка перебивает догадку «вокруг», даже если стоит позже', () {
      final m = techniqueByCell([
        'Clue at (2,2) trivial; setting unlit to LIGHT.',
        'row 3 forces non-tent at 2,3',
      ]);
      expect(m[(2, 3)], 'teachLogicClueFull');
      expect(m[(1, 2)], 'teachLogicClueNeedsAll');
      // И в обратном порядке: точная строка раньше — догадка «вокруг» её не перезаписывает.
      final r = techniqueByCell([
        'row 3 forces non-tent at 2,3',
        'Clue at (2,2) trivial; setting unlit to LIGHT.',
      ]);
      expect(r[(2, 3)], 'teachLogicClueFull', reason: 'догадка «вокруг» перебила прямую строку');
    });

    test('«depth = 0» — начало любого решения, а не перебор', () {
      expect(techniqueByCell(['solve_sub: depth = 0', '  placing / in 0,0']), isEmpty);
      expect(techniqueByCell(['solve_sub: depth = 1', '  placing / in 0,0'])[(0, 0)], 'teachLogicTrial');
    });

    test('тупик Net задаёт приём краю, но сам клетку не решает', () {
      expect(techniqueByCell(['setting dead end value 1,0:4 to 1']), isEmpty);
      final m = techniqueByCell(['setting dead end value 1,0:4 to 1', 'marking edge 1,0:4 open']);
      expect(m[(1, 0)], 'teachLogicConnect');
    });

    test('диапазон Dominosa «(1-2,3)» — это две клетки', () {
      final m = techniqueByCell(['domino 0-1 has unique placement (1-2,3)']);
      expect(m[(1, 3)], 'teachLogicOnlyPlace');
      expect(m[(2, 3)], 'teachLogicOnlyPlace');
    });
  });

  group('шаг ↔ клетка печати', () {
    LessonStep at(int x, int y) => LessonStep(box: LessonBox(x * 32, y * 32, 32, 32, LessonBoxKind.place));
    (int, int) cellOf(LessonBox b) => (b.x ~/ 32, b.y ~/ 32);

    test('шаги идут в порядке рассуждений решателя, а не слева направо', () {
      final out = nameSteps([at(0, 0), at(1, 0), at(2, 0)], {(2, 0): 'teachLogicOnlyPlace', (0, 0): 'teachLogicRuleOut'}, cellOf);
      expect([for (final s in out) cellOf(s.box!)], [(2, 0), (0, 0), (1, 0)]);
      expect(out.last.techniqueKey, isNull, reason: 'клетке без строки печати имя выдумано');
    });

    test('кольцо рамки Slant: рисованная клетка (1,1) — это печатная (0,0)', () {
      final steps = [for (var x = 1; x <= 4; x++) for (var y = 1; y <= 4; y++) at(x, y)];
      final byCell = {for (var x = 0; x < 4; x++) for (var y = 0; y < 4; y++) (x, y): 'teachLogicClueFull'};
      final out = nameSteps(steps, byCell, cellOf);
      expect(out.where((s) => s.techniqueKey != null).length, 16);
    });

    test('плотная печать: сдвиг на одну НЕ берётся, если выигрывает лишь край', () {
      // Замер Pearl 01.10: печать решает КАЖДУЮ клетку, и сдвиг на одну отличается от нуля на
      // 1–2 попадания края (92 против 91). Здесь сдвиг (−1,0) набирает 100 против 98 у нуля —
      // «по максимуму» он бы выиграл, и каждая клетка получила бы имя соседа слева.
      final steps = [for (var x = 0; x < 10; x++) for (var y = 0; y < 10; y++) at(x, y)];
      final byCell = <(int, int), String>{
        for (var x = -1; x < 10; x++)
          for (var y = 0; y < 10; y++)
            if (!(x == 9 && y < 2)) (x, y): x.isEven ? 'teachLogicOnlyPlace' : 'teachLogicRuleOut',
      };
      final out = nameSteps(steps, byCell, cellOf);
      final s55 = out.firstWhere((s) => cellOf(s.box!) == (5, 5));
      expect(s55.techniqueKey, 'teachLogicRuleOut', reason: 'имя взято у соседней клетки — сдвиг ушёл по ничьей');
    });

    test('сетка — по клеточным примитивам автора, а не по наименьшему разрыву', () {
      // Кадр Light Up 01.10: фон клетки 32×32 с углом 16; лампа 8×8 и кружок стоят в 4 точках
      // друг от друга — наименьший разрыв давал сторону 4, и клетка дробилась на восемь шагов.
      final g = gridOf(const [
        'R 0 0 256 256 0',
        'R 16 16 32 32 0',
        'R 48 16 32 32 0',
        'R 16 48 32 32 0',
        'R 112 80 32 32 0',
        'R 60 28 8 8 2',
        'R 124 28 8 8 2',
        'C 64 64 11 3 2',
      ]);
      expect(g, isNotNull);
      expect((g!.side, g.ox, g.oy), (32, 16, 16));
      expect(g.cellAt(60, 28), (1, 0), reason: 'лампа должна попасть в свою клетку');
      expect(g.cellAt(64, 64), (1, 1));
    });
  });

  test('🔴 у каждого ключа приёма есть строка во всех двенадцати языках', () {
    // Плеер показывает `L.t(key)`, а словарь на промахе возвращает сам ключ — человек увидел бы
    // «teachLogicClueFull». Ключ без строки должен ронять пробу здесь, а не на экране.
    for (final loc in const ['ru', 'en', 'es', 'de', 'zh', 'hi', 'pt', 'fr', 'it', 'ja', 'ko', 'ar']) {
      final dict = jsonDecode(File('assets/l10n/$loc.json').readAsStringSync()) as Map<String, dynamic>;
      for (final k in techniqueKeys) {
        expect((dict[k] as String?)?.trim().isNotEmpty, isTrue, reason: '$loc: нет строки $k');
      }
    }
  });

  group('живой движок', () {
    final libPath = '${Directory.current.path}/build/tatham/${TathamEngine.libraryName}';
    late TathamEngine engine;

    setUpAll(() {
      if (!File(libPath).existsSync()) {
        final res = Process.runSync('bash', ['tool/build_tatham.sh'], workingDirectory: Directory.current.path);
        if (!File(libPath).existsSync()) fail('движок не собран: bash tool/build_tatham.sh\n${res.stdout}\n${res.stderr}');
      }
      engine = TathamEngine.open(libPath);
    });

    // Пол — по замеру 01.10.2026 (первый пресет, зёрна 20261001–20261003) минус 10 пунктов:
    // Slant 71, Light Up 50, Tents 100, Dominosa 83, Rectangles 100, Pearl 100, Net 92 %. Map
    // печатает НОМЕРА ОБЛАСТЕЙ, а не клетки, — ему имя этим слоем не достаётся, и врать нельзя.
    const floors = <String, int>{
      'Slant': 60,
      'Light Up': 40,
      'Tents': 90,
      'Dominosa': 70,
      'Rectangles': 90,
      'Pearl': 90,
      'Net': 80,
    };

    for (final e in floors.entries) {
      test('${e.key}: доля шагов с именем приёма ≥ ${e.value} %', () async {
        final i = engine.indexOf(e.key);
        final p = engine.presetsOf(i).first;
        var named = 0, total = 0;
        for (var seed = 20261001; seed <= 20261003; seed++) {
          expect(engine.start(i, p.params, seed), isTrue);
          final steps = await TathamLesson(engine, canSolve: true, gameName: e.key).steps();
          total += steps.length;
          named += steps.where((s) => s.techniqueKey != null).length;
        }
        final share = total == 0 ? 0 : named * 100 ~/ total;
        // ignore: avoid_print
        print('${e.key}: $named из $total = $share %');
        expect(share, greaterThanOrEqualTo(e.value));
      });
    }

    test('шаг — одна клетка: две карточки на одной клетке не встают ни в одном режиме', () async {
      final modes = jsonDecode(File('assets/puzzles/modes.json').readAsStringSync()) as Map<String, dynamic>;
      final bad = <String>[];
      for (final entry in modes.entries) {
        final mode = entry.value as Map<String, dynamic>;
        final name = (mode['engineName'] as String?) ?? entry.key;
        final i = engine.indexOf(name);
        if (i < 0 || !engine.canSolve(i)) continue;
        var steps = ((mode['steps'] as List?) ?? const []).cast<Map<String, dynamic>>();
        if (steps.isEmpty) steps = [for (final p in engine.presetsOf(i)) {'params': p.params}];
        if (steps.isEmpty || !engine.start(i, steps.first['params'] as String, 20261001)) continue;
        final got = await TathamLesson(engine, canSolve: true, gameName: name).steps();
        final boxes = {for (final s in got) (s.box!.x, s.box!.y)};
        if (boxes.length != got.length) bad.add('${entry.key}: ${got.length} шагов на ${boxes.length} клеток');
      }
      expect(bad, isEmpty);
    });
  });
}
