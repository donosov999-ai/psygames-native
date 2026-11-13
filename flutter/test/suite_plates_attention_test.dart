import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/ant/screen.dart';
import 'package:psygames_flutter/games/bart/screen.dart';
import 'package:psygames_flutter/games/choice_rt/screen.dart';
import 'package:psygames_flutter/games/cpt/screen.dart';
import 'package:psygames_flutter/games/flanker/screen.dart';
import 'package:psygames_flutter/games/gonogo/screen.dart';
import 'package:psygames_flutter/games/inhibition/screen.dart';
import 'package:psygames_flutter/games/iowa/screen.dart';
import 'package:psygames_flutter/games/prl/screen.dart';
import 'package:psygames_flutter/games/simon/screen.dart';
import 'package:psygames_flutter/games/stop_signal/screen.dart';
import 'package:psygames_flutter/games/stroop/screen.dart';
import 'package:psygames_flutter/games/stroop_emotional/screen.dart';
import 'package:psygames_flutter/games/switching_task/screen.dart';
import 'package:psygames_flutter/shell/game_clock.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/hub_screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/profiles.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/suite_switch.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ДЕВЯТЬ ИГР «КОНФЛИКТА ВНИМАНИЯ» ДОСТИЖИМЫ ИЗ РАЗВИЛКИ (отчёт 13.11: BART не нашли).
///
/// В развилке у набора ОДНА карточка (первый режим), остальные игры открываются плашками «Режим» на
/// экране настройки. Плашек не было ни у одного из 14 экранов раздела: Simon, Choice-RT, ANT,
/// эмоциональный Струп, «Переключение», Go/No-Go, Стоп-сигнал, Iowa и BART не открывались вовсе.
/// Статический сторож (`every_suite_mode_reachable_test`) видит, что строка `SuiteSwitch(route: …)`
/// есть в файле; эта проба — что плашки ДОЕЗЖАЮТ до экрана и уводят на соседа.
///
/// Состав режимов берётся из профиля (`assets/profiles.json`) — веб-список `psygames_hub_visible`
/// в пробе НЕ задан: именно так игра открывается без веб-половины.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    await L.load('ru');
    await GameSuites.load();
    Profiles.useForTest(Profiles.parse(File('assets/profiles.json').readAsStringSync()));
  });

  tearDown(() {
    GamePreset.clear();
    gameWallMs = () => DateTime.now().millisecondsSinceEpoch;
  });

  Future<SharedState> stateFor(String profile, {Map<String, Object> extra = const {}}) async {
    SharedPreferences.setMockInitialValues({'psygames_active_profile': profile, ...extra});
    return SharedState.open();
  }

  final screens = <String, Widget Function(SharedState)>{
    '/games/stroop': (s) => StroopScreen(state: s),
    '/games/stroop-emotional': (s) => EmoStroopScreen(state: s),
    '/games/flanker': (s) => FlankerScreen(state: s),
    '/games/simon': (s) => SimonScreen(state: s),
    '/games/choice-rt': (s) => ChoiceRtScreen(state: s),
    '/games/ant': (s) => AntScreen(state: s),
    '/games/cpt': (s) => CptScreen(state: s),
    '/games/switching-task': (s) => SwitchingTaskScreen(state: s),
    '/games/inhibition': (s) => InhibitionScreen(state: s),
    '/games/go-no-go': (s) => GoNoGoScreen(state: s),
    '/games/stop-signal': (s) => StopSignalScreen(state: s),
    '/games/prl': (s) => PrlScreen(state: s),
    '/games/iowa': (s) => IowaScreen(state: s),
    '/games/bart': (s) => BartScreen(state: s),
  };

  /// Экран открыт поверх «оболочки»: результат закрытия — то, что получит `HybridApp._openNative`.
  Future<Object? Function()> open(WidgetTester tester, Widget screen) async {
    gameWallMs = () => tester.binding.clock.now().millisecondsSinceEpoch;
    Object? result;
    await tester.pumpWidget(MaterialApp(
      home: Builder(
        builder: (ctx) => Center(
          child: FilledButton(
            key: const Key('host-open'),
            onPressed: () async => result = await Navigator.of(ctx).push<Object?>(MaterialPageRoute(builder: (_) => screen)),
            child: const Text('open'),
          ),
        ),
      ),
    ));
    await tester.tap(find.byKey(const Key('host-open')));
    for (var i = 0; i < 12; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    return () => result;
  }

  Finder chip(String route) => find.byKey(Key('suite-mode-$route'));

  for (final route in screens.keys) {
    testWidgets('🔴 $route: на настройке плашки набора, в партии их нет', (tester) async {
      final suite = GameSuites.of(route, await GameSuites.load())!;
      final s = await stateFor('nzt48');
      await open(tester, screens[route]!(s));
      expect(find.byKey(Key('suite-switch-${suite.id}')), findsOneWidget, reason: 'плашек набора нет на настройке');
      for (final m in suite.modes) {
        expect(chip(m.route), findsOneWidget, reason: 'нет плашки режима ${m.route}');
      }
      expect(tester.widget<ChoiceChip>(chip(route)).selected, isTrue, reason: 'текущий режим не отмечен');
      await tester.tap(find.text(L.t('start')));
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.byKey(Key('suite-switch-${suite.id}')), findsNothing, reason: 'плашки не должны занимать поле в партии');
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }

  testWidgets('🔴 BART → «Правило меняется» (PRL): плашка уводит заменой маршрута', (tester) async {
    final s = await stateFor('nzt48');
    final result = await open(tester, BartScreen(state: s));
    await tester.tap(chip('/games/prl'));
    for (var i = 0; i < 12; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    final r = result();
    expect(r, isA<HubCardTap>());
    expect((r as HubCardTap).route, '/games/prl');
    expect(r.replace, isTrue, reason: '«назад» должно вести в развилку, а не по плашкам');
  });

  testWidgets('только открытое профилю: режимы из allowed_games профиля, а не все', (tester) async {
    final json = jsonDecode(File('assets/profiles.json').readAsStringSync()) as Map<String, dynamic>;
    final suites = await GameSuites.load();
    var checked = 0;
    for (final p in (json['profiles'] as List).cast<Map<String, dynamic>>()) {
      final allowed = p['allowed_games'] is List ? (p['allowed_games'] as List).cast<String>().toSet() : null;
      final suite = GameSuites.of('/games/prl', suites)!;
      final expected = [
        for (final m in suite.modes)
          if (allowed == null || allowed.contains(m.route.split('/').last.replaceAll('-', '_'))) m.route
      ];
      final s = await stateFor(p['id'] as String);
      final got = [for (final m in GameSuites.openModes(s, suite)) m.route];
      expect(got, expected, reason: 'профиль ${p['id']}');
      checked++;
    }
    expect(checked, greaterThan(10), reason: 'профили прочитаны');
  });

  testWidgets('список веба важнее профиля: посчитанный для этого профиля состав берётся как есть', (tester) async {
    final suites = await GameSuites.load();
    final suite = GameSuites.of('/games/prl', suites)!;
    final s = await stateFor('nzt48', extra: {
      HubScreen.visibleKey: jsonEncode({
        'profile': 'nzt48',
        'hubs': <String, Object>{},
        'suites': {
          'suite_decisions': ['/games/prl', '/games/bart']
        },
      }),
    });
    expect([for (final m in GameSuites.openModes(s, suite)) m.route], ['/games/prl', '/games/bart']);
  });

  testWidgets('🔴 карточка набора в развилке называет режимы: «Решения» → Правило меняется · Четыре колоды · Надувай шар',
      (tester) async {
    // Высокий экран: ListView строит карточки лениво, а набор «Решения» — восьмая.
    tester.view.physicalSize = const Size(800, 4000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    SharedPreferences.setMockInitialValues({'psygames_active_profile': 'nzt48'});
    final state = (await tester.runAsync(SharedState.open))!;
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(
        home: HubScreen(
          state: state,
          hubRoute: '/games/attention-conflict',
          icon: Icons.psychology_alt,
          gradient: const [Color(0xFF7C3AED), Color(0xFFEC4899)],
        ),
      ));
      for (var i = 0; i < 80; i++) {
        await tester.pump(const Duration(milliseconds: 30));
        await Future<void>.delayed(const Duration(milliseconds: 15));
        if (find.byType(ListView).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
    String modes(String route) => tester.widget<Text>(find.byKey(ValueKey('hub-modes-$route'))).data!;
    expect(modes('/games/prl'), '${L.t('suiteModeReversal')} · ${L.t('suiteModeDecks')} · ${L.t('suiteModeBalloon')}');
    expect(modes('/games/flanker'),
        '${L.t('suiteModeFlanker')} · ${L.t('suiteModeSimon')} · ${L.t('suiteModeChoice')} · ${L.t('suiteModeAnt')}');
    // Мишени и WCST — не наборы: второй строки нет.
    expect(find.byKey(const ValueKey('hub-modes-/games/targets')), findsNothing);
    expect(find.byKey(const ValueKey('hub-modes-/games/wcst')), findsNothing);
  });
}
