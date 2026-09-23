import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/quick_count/model.dart';

/// СВЕРКА ПРАВИЛ «БЫСТРОГО СЧЁТА» С ЭТАЛОНАМИ ИЗ ЖИВОГО TS.
///
/// `test/fixtures/quick-count-reference.json` выгружен прогоном веб-экрана:
/// лестница 60 уровней, полный перебор окон ответа (все n × все сдвиги) на
/// тринадцати уровнях, померенная утечка ответа и свойства раскладки точек.
void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/quick-count-reference.json').readAsStringSync())
        as Map<String, dynamic>;
  });

  test('🔴 постоянные лестницы те же', () {
    expect(answerMax, ref['answerMax']);
    expect(quickCountLevels, ref['levelsTop']);
    expect(maxDots, ref['maxDots']);
    expect(bossEvery, ref['bossEvery']);
    expect(trialsPerRound, ref['trialsPerRound']);
  });

  test('🔴 60 уровней дают те же числа: сколько точек, как долго показ, какая задержка', () {
    for (final raw in ref['ladder'] as List) {
      final e = raw as Map<String, dynamic>;
      final p = levelParams(e['level'] as int);
      final at = 'L${e['level']}';
      expect(p.minN, e['minN'], reason: '$at нижняя граница');
      expect(p.maxN, e['maxN'], reason: '$at верхняя граница');
      expect(p.exposureMs, e['exposureMs'], reason: '$at показ');
      expect(p.holdMs, e['holdMs'], reason: '$at задержка');
      expect(p.minN <= p.maxN, isTrue, reason: '$at границы не перевёрнуты');
      expect(p.maxN - p.minN >= 2, isTrue, reason: '$at между границами хотя бы три ответа');
    }
  });

  test('🔴 окно ответа: полный перебор n и сдвигов совпадает с вебом', () {
    var rows = 0;
    for (final raw in ref['windows'] as List) {
      final e = raw as Map<String, dynamic>;
      final p = levelParams(e['level'] as int);
      final want = e['params'] as Map<String, dynamic>;
      expect([p.minN, p.maxN], [want['minN'], want['maxN']], reason: 'L${e['level']} границы');
      expect(answerChoices(p), e['choices'], reason: 'L${e['level']} полный набор кнопок');
      for (final rawRow in (e['rows'] as List)) {
        final r = rawRow as Map<String, dynamic>;
        final got = answerWindow(p, r['n'] as int, r['shift'] as int);
        expect(got, r['window'], reason: 'L${e['level']} n=${r['n']} сдвиг=${r['shift']}');
        expect(got.contains(r['n']), isTrue, reason: 'верный ответ обязан быть в окне');
        expect(got.length <= answerMax, isTrue, reason: 'окно не шире шести');
        rows += 1;
      }
    }
    // Число закреплено: 13 уровней × все n × шесть сдвигов = 342 окна. Упадёт —
    // значит усох эталон или съехали границы уровня, и это надо заметить.
    expect(rows, 342, reason: 'перебор, а не выборочная проверка: проверено $rows окон');
  });

  test('🔴 окно НЕ выдаёт ответ: угадывание равно потолку честной игры', () {
    for (final raw in ref['leak'] as List) {
      final e = raw as Map<String, dynamic>;
      final level = e['level'] as int;
      final p = levelParams(level);
      final got = windowGuessRate(p);
      final possible = p.maxN - p.minN + 1;
      expect(got, closeTo((e['guessRate'] as num).toDouble(), 1e-12),
          reason: 'L$level угадывание считается так же, как в вебе');
      expect(possible, e['possible'], reason: 'L$level столько возможных ответов');
      if (possible <= answerMax) {
        // Все возможные ответы помещаются в окно — значит окно не сообщает НИЧЕГО,
        // и чаще 1/возможных угадать нельзя. Это и есть проверка на утечку.
        expect(got, closeTo(1 / possible, 1e-12),
            reason: 'L$level: угадывание $got против потолка ${1 / possible}');
      } else {
        // Возможных больше, чем кнопок: часть отсекается самим окном, и потолок выше.
        // Здесь важно не «мало», а «столько же, сколько в вебе» — что и проверено выше.
        expect(got > 1 / possible, isTrue, reason: 'L$level окно из шести не накрывает $possible ответов');
      }
    }
  });

  test('🔴 раскладка кнопок ответа не прыгает между телефонами', () {
    final c = ref['gridConstants'] as Map<String, dynamic>;
    expect(answerMax, c['ANSWER_MAX']);
    expect(searchBarH, c['SEARCH_BAR_H']);
    expect(gutterBoth, c['GUTTER_BOTH']);
    expect(btnGap, c['BTN_GAP']);
    expect(minTap, c['MIN_TAP']);
    final shapes = <int, Set<String>>{};
    for (final raw in ref['grids'] as List) {
      final e = raw as Map<String, dynamic>;
      final g = answerGrid(e['count'] as int, (e['screenW'] as num).toDouble());
      final at = 'экран ${e['screenW']}, кнопок ${e['count']}';
      expect(g.cols, e['cols'], reason: '$at столбцов');
      expect(g.rows, e['rows'], reason: '$at рядов');
      expect(g.size, closeTo((e['size'] as num).toDouble(), 1e-9), reason: '$at сторона кнопки');
      shapes.putIfAbsent(e['count'] as int, () => <String>{}).add('${g.cols}x${g.rows}');
    }
    // 🔴 Главное свойство, ради которого правило существует: при одном и том же
    // числе кнопок сетка ОДНА на всех экранах — 320, 360, 390, 430.
    for (final entry in shapes.entries) {
      expect(entry.value.length, 1,
          reason: 'кнопок ${entry.key}: сетка обязана быть одна на всех экранах, а вышло ${entry.value}');
    }
  });

  test('🔴 раскладка точек: отступ от края держится, зазор — где поле позволяет', () {
    for (final raw in ref['scatter'] as List) {
      final e = raw as Map<String, dynamic>;
      final n = e['n'] as int;
      final w = (e['w'] as num).toDouble();
      final h = (e['h'] as num).toDouble();
      final r = (e['r'] as num).toDouble();
      final pad = r + 8;
      final rnd = math.Random(7);
      var outside = 0;
      var tooClose = 0;
      for (var run = 0; run < 40; run += 1) {
        final dots = scatterDots(n, w, h, r, rnd);
        expect(dots.length, n, reason: 'точек ровно столько, сколько просили');
        for (var i = 0; i < dots.length; i += 1) {
          final d = dots[i];
          if (d.x < pad - 1e-9 || d.y < pad - 1e-9 || d.x > w - pad + 1e-9 || d.y > h - pad + 1e-9) {
            outside += 1;
          }
          for (var j = i + 1; j < dots.length; j += 1) {
            final g = math.sqrt(math.pow(d.x - dots[j].x, 2) + math.pow(d.y - dots[j].y, 2));
            if (g < r * 2.4) tooClose += 1;
          }
        }
      }
      expect(outside, 0, reason: '${e['n']} точек на ${e['w']}×${e['h']}: за поле не вышла ни одна');
      final webTooClose = e['tooClosePairs'] as int;
      if (webTooClose == 0) {
        expect(tooClose, 0,
            reason: 'на просторном поле (${e['w']}×${e['h']}) точки не слипаются — как и в вебе');
      } else {
        // ⚠️ Тесное поле: в вебе тоже слипаются ($webTooClose пар из 40 раздач).
        // Это свойство запасного пути, а не дефект переноса, — но оно означает,
        // что поле такого размера игре давать НЕЛЬЗЯ.
        expect(tooClose > 0, isTrue, reason: 'тесное поле слипается и здесь, как в вебе');
      }
    }
  });
}
