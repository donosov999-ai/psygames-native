import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// 🔴 КАЖДАЯ ИГРА НАБОРА ДОСТИЖИМА ИЗ РАЗВИЛКИ: на её экране стоят плашки набора
/// (`SuiteSwitch(route: '<её маршрут>'`) либо пункт «Режим» (`SuiteModeAction(route: …)`).
///
/// У набора в развилке ОДНА карточка (`gameSuites.ts`): до остальных его игр человек доходит только
/// плашками «Режим» на экране настройки. Замер 02.10.2026: плашек не было ни в одном нативном экране,
/// и 11 игр не открывались из развилок вовсе (Корси, «Наоборот», Simon, ANT, go/no-go, …).
///
/// Долг записан поимённо, с владельцем экрана. Новый экран набора без плашек проба не пропустит, а
/// строку долга, у которой плашки уже стоят, обязывает снять — храповик, как у часов партии.
const _debt = <String, String>{
  '/games/spatial-span': 'psygames-spatial-claude-mac',
};

/// Экраны, лежащие не в `lib/games/<маршрут через подчёркивание>/screen.dart`.
const _screenOf = <String, String>{'/games/go-no-go': 'lib/games/gonogo/screen.dart'};

void main() {
  test('🔴 у каждой игры набора на экране плашки набора — иначе до неё не дойти из развилки', () {
    final suites = (jsonDecode(File('assets/game_suites.json').readAsStringSync()) as Map)['suites'] as List;
    final missing = <String>[];
    final stale = <String>[];
    var routes = 0;
    for (final s in suites.cast<Map<String, dynamic>>()) {
      for (final m in (s['modes'] as List).cast<Map<String, dynamic>>()) {
        routes++;
        final route = m['route'] as String;
        final file = File(_screenOf[route] ?? 'lib/games/${route.split('/').last.replaceAll('-', '_')}/screen.dart');
        // Плашки на экране настройки (`SuiteSwitch`) ИЛИ пункт «Режим» в ряду значков
        // (`SuiteModeAction`) — для игр, где партия начинается сразу и экрана настройки нет.
        final src = file.existsSync() ? file.readAsStringSync() : '';
        final has = src.contains("SuiteSwitch(route: '$route'") || src.contains("SuiteModeAction(route: '$route'");
        if (!has && !_debt.containsKey(route)) missing.add('$route (${file.path})');
        if (has && _debt.containsKey(route)) stale.add('$route — сними строку из _debt (${_debt[route]})');
      }
    }
    expect(routes, greaterThan(10), reason: 'ассет наборов прочитан');
    expect(missing, isEmpty, reason: 'экран набора без плашек — игра недостижима из развилки');
    expect(stale, isEmpty);
  });
}
