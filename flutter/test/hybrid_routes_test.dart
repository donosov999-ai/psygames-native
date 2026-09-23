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
      '$origin/games/schulte',
      '$origin/games/schulte.html?level=3',
      '$origin/games/mahjong',
      '$origin/games/math-slider',
      '$origin/games/math-slider.html?level=21',
      '$origin/games/object-tracker',
      '$origin/games/object-tracker.html?level=7',
      '$origin/games/quick-count',
      '$origin/games/quick-count.html',
      '$origin/games/pattern',
      '$origin/games/pattern.html?level=9',
      '$origin/games/math-sprint',
      '$origin/games/math-sprint.html',
      '$origin/games/number-bonds',
      '$origin/games/number-bonds.html?level=4',
      '$origin/games/ospan',
      '$origin/games/ospan.html',
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
      '$origin/games/sudoku',
      '$origin/games/sudoku.html?mode=levels',
      '$origin/games/go-no-go',
      '$origin/games/choice-rt',
      '$origin/games/stop-signal',
      '$origin/games/posner',
      '$origin/games/stroop-emotional',
      '$origin/games/switching-task',
      '$origin/games/targets',
      '$origin/games/inhibition',
      '$origin/games/faces-names',
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

  /// 🔴 РЕЖИМ ОТЛИЧАЕТСЯ ТОЛЬКО ХВОСТОМ АДРЕСА. Срезать его до поиска значит открыть
  /// «Небоскрёбы» обычной судоку — человек жмёт одно, получает другое.
  test('🔴 режимы судоку узнаются по хвосту адреса, а не теряются', () {
    const origin = 'http://127.0.0.1:54321';
    expect(HybridApp.routeOf('$origin/games/sudoku?mode=towers'), '/games/sudoku?mode=towers');
    expect(HybridApp.routeOf('$origin/games/sudoku?mode=unequal'), '/games/sudoku?mode=unequal');
    expect(HybridApp.routeOf('$origin/games/sudoku.html?mode=towers'), '/games/sudoku?mode=towers',
        reason: 'и в виде .html тоже');
    expect(HybridApp.routeOf('$origin/games/sudoku'), '/games/sudoku',
        reason: 'без хвоста — обычная судоку');
    expect(HybridApp.routeOf('$origin/games/sudoku?mode=killer'), '/games/sudoku',
        reason: 'неизвестный режим ведёт на обычный экран, а не в никуда');
    // Игру без режимов хвост не задевает.
    expect(HybridApp.routeOf('$origin/games/one-line?autostart=1'), '/games/one-line');
  });

  test('🔴 развилки раздела открываются нативно', () {
    const origin = 'http://127.0.0.1:54321';
    expect(HybridApp.routeOf('$origin/games/sudoku-hub'), '/games/sudoku-hub');
    expect(HybridApp.routeOf('$origin/games/puzzles-hub'), '/games/puzzles-hub');
  });

  test('🔴 неперенесённые игры и прочие страницы остаются в вебе', () {
    const origin = 'http://127.0.0.1:54321';
    for (final url in [
      '$origin/',
      '$origin/index.html',
      '$origin/collection',
      '$origin/statistics',
      '$origin/games/one-liner',   // похожее имя — не наша игра
      '$origin/games/puzzles',          // головоломки Тэтхэма ещё не перенесены
      '$origin/games/mental-rotation-lab',   // и это: лаборатория ещё в вебе
    ]) {
      expect(HybridApp.routeOf(url), isNull, reason: url);
    }
  });

  test('каждая перенесённая игра имеет свой построитель экрана', () {
    // ⚠️ ОДИН СПИСОК НА ВСЕХ, А НЕ ДВА expect ПОДРЯД: два набора рядом
    // означают, что кто-то проверяет устаревший, и проба краснеет на любой
    // следующей игре. Набор пересобирается из карты перехвата при вливании.
    expect(HybridApp.native.keys.toSet(), {
      '/games/ball-sort',
      '/games/cake-sort',
      '/games/choice-rt',
      '/games/digit-span',
      '/games/dots-connect',
      '/games/faces-names',
      '/games/flanker',
      '/games/go-no-go',
      '/games/goods-sort',
      '/games/hanoi',
      '/games/inhibition',
      '/games/mahjong',
      '/games/math-slider',
      '/games/math-sprint',
      '/games/memory-matrix',
      '/games/mental-rotation',
      '/games/number-bonds',
      '/games/nut-sort',
      '/games/object-tracker',
      '/games/one-line',
      '/games/ospan',
      '/games/pattern',
      '/games/posner',
      '/games/pizza-sort',
      '/games/quick-count',
      '/games/schulte',
      '/games/simon',
      '/games/sorting-hub',
      '/games/spatial-hub',
      '/games/spatial-lab',
      '/games/spatial-span',
      '/games/stop-signal',
      '/games/stroop',
      '/games/stroop-emotional',
      '/games/switching-task',
      '/games/sudoku',
      '/games/sudoku-hub',
      '/games/sudoku?mode=towers',
      '/games/sudoku?mode=unequal',
      '/games/puzzles-hub',
      '/games/sudoku-fractal',
      '/games/sudoku-fractal-deep',
      '/games/sudoku-samurai',
      '/games/targets',
      '/games/tower-london',
      '/games/water-sort',
    });
    for (final build in HybridApp.native.values) {
      expect(build, isNotNull);
    }
  });
}
