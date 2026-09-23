import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/puzzles/engine.dart';

/// 🔴 ЭТА ПРОБА ГОНЯЕТ НАСТОЯЩИЙ ДВИЖОК ТЭТХЭМА, А НЕ ЗАГЛУШКУ.
///
/// Вопрос, на который она отвечает числом: надо ли переносить движок в Dart. Ответ —
/// нет: те же исходники C, что возит веб-версия через emscripten, собираются нативно
/// (`tool/build_tatham.sh`, 13 секунд, 1,4 МБ, 25 экспортов) и зовутся через dart:ffi
/// тем же API `psy_*`. Значит перенос «Головоломок» — это оболочка, рисование и ввод.
///
/// ⚠️ Библиотека НЕ лежит в репозитории: она собирается из канона Тэтхэма
/// (`~/dev/puzzles`). Нет канона — проба честно падает с командой, которой чинится,
/// а не притворяется пройденной: пропуск здесь означал бы, что движка никто не проверил.
void main() {
  final flutterDir = Directory.current.path;
  final libPath = '$flutterDir/build/tatham/${TathamEngine.libraryName}';

  setUpAll(() {
    if (File(libPath).existsSync()) return;
    final res = Process.runSync('bash', ['tool/build_tatham.sh'], workingDirectory: flutterDir);
    if (!File(libPath).existsSync()) {
      fail('движок не собран: bash tool/build_tatham.sh\n'
          '${res.stdout}\n${res.stderr}\n'
          'канон: git clone https://git.tartarus.org/simon/puzzles.git ~/dev/puzzles');
    }
  });

  late TathamEngine engine;

  setUp(() => engine = TathamEngine.open(libPath));

  test('🔴 в сборке 42 игры, и семь наших сеток среди них', () {
    expect(engine.games, 42, reason: 'игр в сборке: ${engine.games}');
    // ⚠️ Имена — ЛЮДСКИЕ, как их зовёт автор («Solo», «Light Up»), и ровно так же их
    // зовёт веб-версия в sections/sudoku.ts. Строчные ('solo') не находятся вовсе.
    for (final name in ['Solo', 'Towers', 'Unequal', 'Keen', 'Singles', 'Undead', 'Filling']) {
      expect(engine.indexOf(name), greaterThanOrEqualTo(0), reason: 'нет игры $name');
    }
  });

  test('🔴 партия открывается и рисуется потоком примитивов', () {
    final solo = engine.indexOf('Solo');
    expect(engine.start(solo, '3x3db', 20260923), isTrue, reason: 'партия не открылась');

    final size = engine.size;
    expect(size.w, greaterThan(0));
    expect(size.h, greaterThan(0));

    final frame = engine.draw();
    // Доска 9×9 не может нарисоваться десятком примитивов: это и есть проверка,
    // что рисование пришло целиком, а не пустым буфером.
    expect(frame.length, greaterThan(50), reason: 'примитивов в кадре: ${frame.length}');
    expect(engine.colours.length, greaterThan(2), reason: 'палитра: ${engine.colours.length} цветов');
    expect(engine.status, 0, reason: 'свежая партия не может быть выиграна');
  });

  test('🔴 ход меняет кадр и двигает историю, отмена возвращает', () {
    final solo = engine.indexOf('Solo');
    expect(engine.start(solo, '3x3db', 20260923), isTrue);
    final before = engine.draw();
    final posBefore = engine.statePos;

    // ⚠️ КЛЕТКУ ИЩЕМ ПЕРЕБОРОМ, А НЕ СЧИТАЕМ ПО ФОРМУЛЕ. Поле движка нарисовано с
    // полями и своим шагом клетки; ход засчитывается только в ПУСТУЮ клетку, а какие
    // пусты — знает движок, не мы. Ход там, где выросла история: `PKR_SOME_EFFECT`
    // приходит и на выделение клетки, по нему ход считать нельзя.
    final size = engine.size;
    var moved = false;
    for (var r = 0; r < 9 && !moved; r++) {
      for (var c = 0; c < 9 && !moved; c++) {
        engine.tap(((c + 0.5) * size.w / 9).round(), ((r + 0.5) * size.h / 9).round());
        engine.key('1'.codeUnitAt(0));
        if (engine.statePos > posBefore) moved = true;
      }
    }
    expect(moved, isTrue, reason: 'ни один тычок с цифрой не дал хода');

    final after = engine.draw();
    expect(after.join('\n') == before.join('\n'), isFalse, reason: 'кадр обязан измениться');

    expect(engine.undo(), isTrue);
    expect(engine.statePos, posBefore, reason: 'отмена вернула историю на место');
  });

  test('🔴 решатель доводит партию до победы', () {
    final solo = engine.indexOf('Solo');
    expect(engine.start(solo, '3x3db', 20260923), isTrue);
    expect(engine.solve(), isTrue, reason: 'Solo обязан уметь показывать решение');
    expect(engine.status, 1, reason: 'после решения статус победы; текст: ${engine.statusText}');
  });

  /// ⚠️ Замер для переноса: сколько примитивов приходит на кадр у НАШИХ семи сеток.
  /// Это будущая нагрузка CustomPainter — число, а не ощущение.
  test('замер: размер кадра у семи наших сеток', () {
    // Параметры — первые ступени лестницы веб-версии (sections/sudoku.ts).
    const ladder = {
      'Solo': '3x3db', 'Towers': '4de', 'Unequal': '4de', 'Keen': '4de',
      'Singles': '5x5de', 'Undead': '4x4de', 'Filling': '9x7',
    };
    final report = <String>[];
    for (final e in ladder.entries) {
      final name = e.key;
      final i = engine.indexOf(name);
      if (!engine.start(i, e.value, 20260923)) {
        report.add('$name: с параметрами ${e.value} не открылась');
        continue;
      }
      final f = engine.draw();
      final s = engine.size;
      report.add('$name ${s.w}x${s.h}: ${f.length}');
      expect(f.length, greaterThan(10), reason: '$name нарисовался ${f.length} примитивами');
    }
    // ignore: avoid_print
    print('примитивов на кадр — ${report.join(' · ')}');
    expect(report.length, 7);
  });
}
