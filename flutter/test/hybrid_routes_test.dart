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
      '$origin/games/sudoku',
      '$origin/games/sudoku.html?mode=levels',
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
    expect(HybridApp.routeOf('$origin/games/sudoku-fractal-deep'), isNull,
        reason: 'глубокий фрактал — отдельный экран, он ещё не перенесён');
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
    ]) {
      expect(HybridApp.routeOf(url), isNull, reason: url);
    }
  });

  test('каждая перенесённая игра имеет свой построитель экрана', () {
    expect(HybridApp.native.keys.toSet(), {
      '/games/dots-connect', '/games/one-line', '/games/digit-span', '/games/memory-matrix',
      '/games/sudoku', '/games/sudoku-samurai', '/games/sudoku-fractal',
    });
    for (final build in HybridApp.native.values) {
      expect(build, isNotNull);
    }
  });
}
