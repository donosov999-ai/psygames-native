import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// 🔴 КАЖДАЯ ИГРА НАБОРА ДОСТИЖИМА ИЗ РАЗВИЛКИ: на её экране стоят плашки набора
/// (`SuiteSwitch(route: '<её маршрут>'`).
///
/// У набора в развилке ОДНА карточка (`gameSuites.ts`): до остальных его игр человек доходит только
/// плашками «Режим» на экране настройки. Замер 02.10.2026: плашек не было ни в одном нативном экране,
/// и 11 игр не открывались из развилок вовсе (Корси, «Наоборот», Simon, ANT, go/no-go, …).
///
/// Долг записан поимённо, с владельцем экрана. Новый экран набора без плашек проба не пропустит, а
/// строку долга, у которой плашки уже стоят, обязывает снять — храповик, как у часов партии.
const _debt = <String, String>{
  '/games/stroop': 'psygames-attention-claude-mac',
  '/games/stroop-emotional': 'psygames-attention-claude-mac',
  '/games/flanker': 'psygames-attention-claude-mac',
  '/games/simon': 'psygames-attention-claude-mac',
  '/games/choice-rt': 'psygames-attention-claude-mac',
  '/games/ant': 'psygames-attention-claude-mac',
  '/games/cpt': 'psygames-attention-claude-mac',
  '/games/switching-task': 'psygames-attention-claude-mac',
  '/games/inhibition': 'psygames-attention-claude-mac',
  '/games/go-no-go': 'psygames-attention-claude-mac',
  '/games/stop-signal': 'psygames-attention-claude-mac',
  '/games/prl': 'psygames-attention-claude-mac',
  '/games/iowa': 'psygames-attention-claude-mac',
  '/games/bart': 'psygames-attention-claude-mac',
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
        final has = file.existsSync() && file.readAsStringSync().contains("SuiteSwitch(route: '$route'");
        if (!has && !_debt.containsKey(route)) missing.add('$route (${file.path})');
        if (has && _debt.containsKey(route)) stale.add('$route — сними строку из _debt (${_debt[route]})');
      }
    }
    expect(routes, greaterThan(10), reason: 'ассет наборов прочитан');
    expect(missing, isEmpty, reason: 'экран набора без плашек — игра недостижима из развилки');
    expect(stale, isEmpty);
  });
}
