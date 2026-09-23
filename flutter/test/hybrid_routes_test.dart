import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';

/// ПЕРЕХВАТ ПЕРЕНЕСЁННЫХ ИГР.
///
/// Гибрид показывает нынешнее приложение целиком, но перенесённые игры обязан
/// открывать нативно. Если разбор ссылки промахнётся, человек получит СТАРЫЙ
/// экран там, где уже есть новый, — и прогресс поедет двумя путями сразу.
/// Ссылки приходят в разном виде: с расширением и без, с запросом и якорем.
void main() {
  test('🔴 перенесённые игры узнаются во всех видах ссылок', () {
    const origin = 'http://127.0.0.1:54321';
    for (final url in [
      '$origin/games/one-line',
      '$origin/games/one-line.html',
      '$origin/games/one-line?level=4',
      '$origin/games/one-line.html#top',
      '$origin/games/dots-connect',
      '$origin/games/digit-span.html?mode=free',
      '$origin/games/stroop',
      '$origin/games/stroop.html?mode=ink',
      '$origin/games/flanker',
      '$origin/games/flanker.html?autostart=1',
      '$origin/games/simon',
      '$origin/games/sudoku',
      '$origin/games/sudoku.html?mode=levels',
      '$origin/games/go-no-go',
      '$origin/games/mental-rotation',
      '$origin/games/mental-rotation.html?level=12',
      '$origin/games/spatial-span',
      '$origin/games/spatial-lab',
      '$origin/games/spatial-lab?mode=netslide',
      '$origin/games/spatial-hub',
      '$origin/games/spatial-lab.html?mode=sixteen&level=9',
      '$origin/games/goods-sort',
      '$origin/games/goods-sort.html?level=12',
      '$origin/games/water-sort',
      '$origin/games/ball-sort',
      '$origin/games/nut-sort.html?level=3',
      '$origin/games/cake-sort',
      '$origin/games/pizza-sort',
      '$origin/games/hanoi',
      '$origin/games/tower-london',
      '$origin/games/sorting-hub',
      '$origin/games/choice-rt',
      '$origin/games/stop-signal',
    ]) {
      expect(HybridApp.routeOf(url), isNotNull, reason: url);
    }
  });

  /// ⚠️ Фрактал и ГЛУБОКИЙ фрактал — РАЗНЫЕ экраны. Перехват одного не должен утаскивать
  /// второй: он ещё в вебе, и подмена показала бы человеку другую игру.
  test('🔴 фрактал перехватывается, а глубокий фрактал остаётся в вебе', () {
    const origin = 'http://127.0.0.1:54321';
    expect(HybridApp.routeOf('$origin/games/sudoku-fractal'), '/games/sudoku-fractal');
    expect(HybridApp.routeOf('$origin/games/sudoku-fractal.html'), '/games/sudoku-fractal');
    expect(HybridApp.routeOf('$origin/games/sudoku-fractal?level=6'), '/games/sudoku-fractal');
    // ⚠️ Глубокий фрактал — ОТДЕЛЬНЫЙ экран и отдельный маршрут: перехват одного не
    // должен утаскивать второй, иначе человек увидит не ту игру.
    expect(HybridApp.routeOf('$origin/games/sudoku-fractal-deep'), '/games/sudoku-fractal-deep');
  });

  test('🔴 самурай перехватывается: и ссылкой, и файлом, и с якорем', () {
    for (final url in [
      'http://127.0.0.1:54321/games/sudoku-samurai',
      'http://127.0.0.1:54321/games/sudoku-samurai.html',
      'file:///assets/www/games/sudoku-samurai?level=3',
      'http://127.0.0.1:54321/games/sudoku-samurai#board',
    ]) {
      expect(HybridApp.routeOf(url), '/games/sudoku-samurai', reason: url);
    }
  });

  test('🔴 неперенесённые игры и прочие страницы остаются в вебе', () {
    const origin = 'http://127.0.0.1:54321';
    for (final url in [
      '$origin/',
      '$origin/index.html',
      '$origin/games/schulte',
      '$origin/collection',
      '$origin/statistics',
      '$origin/games/one-liner',   // похожее имя — не наша игра
      '$origin/games/sudoku-hub',       // развилка судоку ещё не перенесена
      '$origin/games/puzzles',          // головоломки Тэтхэма ещё не перенесены
      '$origin/games/mental-rotation-lab',   // и это: лаборатория ещё в вебе
    ]) {
      expect(HybridApp.routeOf(url), isNull, reason: url);
    }
  });

  test('каждая перенесённая игра имеет свой построитель экрана', () {
    // ⚠️ ОДИН СПИСОК НА ВСЕХ, А НЕ ДВА expect ПОДРЯД. При сведении веток разделов
    // сюда трижды попадали два ожидаемых набора рядом, и каждый утверждал, что
    // перенесённые игры исчерпываются его половиной: такая проба краснеет на любой
    // следующей игре, кто бы её ни принёс. Набор растёт снизу, одной строкой на игру.
    expect(HybridApp.native.keys.toSet(), {
      '/games/ball-sort',
      '/games/cake-sort',
      '/games/digit-span',
      '/games/dots-connect',
      '/games/flanker',
      '/games/go-no-go',
      '/games/goods-sort',
      '/games/hanoi',
      '/games/memory-matrix',
      '/games/mental-rotation',
      '/games/nut-sort',
      '/games/one-line',
      '/games/pizza-sort',
      '/games/simon',
      '/games/sorting-hub',
      '/games/spatial-hub',
      '/games/spatial-lab',
      '/games/spatial-span',
      '/games/stroop',
      '/games/sudoku',
      '/games/sudoku-fractal',
      '/games/sudoku-fractal-deep',
      '/games/sudoku-samurai',
      '/games/tower-london',
      '/games/water-sort',
      '/games/choice-rt', '/games/stop-signal',
    });
    for (final build in HybridApp.native.values) {
      expect(build, isNotNull);
    }
  });
}
