import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/hub_screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 НАТИВНАЯ РАЗВИЛКА ПОКАЗЫВАЕТ ТОЛЬКО ТО, ЧТО ОТКРЫВАЕТ ПРОФИЛЬ (задача c86ddae6).
///
/// Замер 01.10.2026: значок «Мнемоники» в каталоге — «1», а нативная развилка — все 5.
/// Состав считает веб той же функцией, что и значок (`frontend/src/services/hubVisibility.ts`,
/// проба `hub-visibility-for-native.test.ts`), и кладёт в `psygames_hub_visible`.
/// Списки ниже — настоящий вывод `hubVisibility` для «Мнемоник» на 01.10.2026.
const _hub = '/games/mnemonics-hub';
const _seniors = ['/games/mnemonics', '/games/word-pairs'];

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async => L.load('ru'));

  Future<List<String>> shownInOrder(WidgetTester tester, Map<String, Object> prefs, {String hub = _hub}) async {
    SharedPreferences.setMockInitialValues(prefs);
    final state = (await tester.runAsync(SharedState.open))!;
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(
        home: HubScreen(
          state: state,
          hubRoute: hub,
          icon: Icons.psychology_outlined,
          gradient: const [Color(0xFF7C3AED), Color(0xFF0EA5E9)],
        ),
      ));
      for (var i = 0; i < 60; i++) {
        await tester.pump(const Duration(milliseconds: 30));
        await Future<void>.delayed(const Duration(milliseconds: 15));
        if (find.byType(ListView).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
    return find
        .byWidgetPredicate((w) => w.key is ValueKey<String> && (w.key! as ValueKey<String>).value.startsWith('hub-card-'))
        .evaluate()
        .map((e) => (e.widget.key! as ValueKey<String>).value.substring('hub-card-'.length))
        .toList();
  }

  Future<Set<String>> shown(WidgetTester tester, Map<String, Object> prefs, {String hub = _hub}) async =>
      (await shownInOrder(tester, prefs, hub: hub)).toSet();

  String visible(String profile, List<String> routes) => jsonEncode({
        'profile': profile,
        'hubs': {_hub: routes},
      });

  testWidgets('🔴 профиль «seniors»: в развилке ровно его две игры, а не все пять', (tester) async {
    final cards = await shown(tester, {
      'psygames_active_profile': 'seniors',
      HubScreen.visibleKey: visible('seniors', _seniors),
    });
    expect(cards, _seniors.toSet());
  });

  testWidgets('список посчитан для ДРУГОГО профиля — не применяется', (tester) async {
    final all = await shown(tester, {'psygames_active_profile': 'nzt48'});
    final cards = await shown(tester, {
      'psygames_active_profile': 'nzt48',
      HubScreen.visibleKey: visible('seniors', _seniors),
    });
    expect(all.length, greaterThan(_seniors.length), reason: 'у nzt48 в «Мнемониках» больше двух игр');
    expect(cards, all);
  });

  testWidgets('ключа нет (веб ещё не посчитал) — развилка как прежде, не пустая', (tester) async {
    final cards = await shown(tester, {'psygames_active_profile': 'seniors'});
    expect(cards, isNotEmpty);
    expect(cards.length, greaterThanOrEqualTo(_seniors.length));
  });

  testWidgets('🔴 карточку, которой нет в раскладке файла, развилка показывает, если веб её открыл (4a5bb886)', (tester) async {
    // Файл состава (выгружен 13.09) о «Кошках» не знает; веб по правилу «новое — во все профили»
    // её дописал. Раньше развилка пересекала список веба со своей раскладкой — и «Кошки» терялись.
    const sudoku = '/games/sudoku-hub';
    final file = jsonEncode({
      'профили': {
        'seniors': {
          'хабы': {
            sudoku: ['/games/sudoku'],
          },
        },
      },
    });
    final cards = await shownInOrder(tester, {
      'psygames_active_profile': 'seniors',
      'psygames_playlists_override': file,
      HubScreen.visibleKey: jsonEncode({
        'profile': 'seniors',
        'hubs': {sudoku: ['/games/cats', '/games/sudoku']},
      }),
    }, hub: sudoku);
    expect(cards, ['/games/cats', '/games/sudoku'], reason: 'нет «Кошек» или порядок не как у веба');
  });
}
