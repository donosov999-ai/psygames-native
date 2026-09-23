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
    ]) {
      expect(HybridApp.routeOf(url), isNotNull, reason: url);
    }
  });

  test('🔴 неперенесённые игры и прочие страницы остаются в вебе', () {
    const origin = 'http://127.0.0.1:54321';
    for (final url in [
      '$origin/',
      '$origin/index.html',
      '$origin/games/schulte',
      '$origin/games/sudoku.html',
      '$origin/collection',
      '$origin/statistics',
      '$origin/games/one-liner',   // похожее имя — не наша игра
    ]) {
      expect(HybridApp.routeOf(url), isNull, reason: url);
    }
  });

  test('каждая перенесённая игра имеет свой построитель экрана', () {
    expect(HybridApp.native.keys.toSet(),
        {'/games/dots-connect', '/games/one-line', '/games/digit-span', '/games/memory-matrix', '/games/stroop', '/games/flanker', '/games/simon', '/games/goods-sort', '/games/water-sort', '/games/ball-sort', '/games/nut-sort', '/games/cake-sort', '/games/pizza-sort', '/games/hanoi', '/games/tower-london', '/games/sorting-hub'});
    for (final build in HybridApp.native.values) {
      expect(build, isNotNull);
    }
  });
}
