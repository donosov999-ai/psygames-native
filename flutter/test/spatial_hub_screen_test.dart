import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/spatial_hub/screen.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// РАЗВИЛКА ВЕДЁТ ТУДА, КУДА НАПИСАНО — И ТУДА, ЧЕГО ЕЩЁ НЕТ НАТИВНО.
///
/// 🔴 Половина карточек ведёт в игры, которые ещё в вебе. Проба нажимает КАЖДУЮ и проверяет, что
/// маршрут ушёл хосту целиком, вместе с `?mode=`: срежь запрос — и «Клоцки» с «Сокобаном»
/// откроют одну и ту же игру, а никакая проверка маршрутов этого не заметит (адрес-то один).
void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({
      'psygames_active_profile': 'nzt48',
      'psygames_mental_rotation_level_nzt48': '7',
      'psygames_spatial_lab_net_level_nzt48': '3',
    });
    state = await SharedState.open();
    await L.load('ru');
  });

  Future<List<String>> boot(WidgetTester tester) async {
    final opened = <String>[];
    await tester.pumpWidget(
      MaterialApp(home: SpatialHubScreen(state: state, onOpen: opened.add)),
    );
    await tester.pump();
    await tester.pump();
    return opened;
  }

  testWidgets('🔴 состав развилки — тот же и в том же порядке, что в вебе', (tester) async {
    await boot(tester);
    expect(find.text('Пространство'), findsOneWidget);
    expect(spatialHubCards.map((c) => c.route).toList(), [
      '/games/mental-rotation',
      '/games/spatial-lab?mode=twiddle',
      '/games/spatial-lab?mode=net',
      '/games/puzzles?mode=Slide',
      '/games/puzzles?mode=Sokoban',
      '/games/dots-connect',
      '/games/one-line',
      '/games/trail-making',
      '/games/navigator',
    ]);
    expect(find.text('Ментальная ротация'), findsOneWidget);
    // Сноска — в самом низу списка: до неё доходим прокруткой, как человек.
    await tester.scrollUntilVisible(find.byKey(const Key('сноска')), 120);
    expect(find.byKey(const Key('сноска')), findsOneWidget);
  });

  testWidgets('🔴 каждая карточка уходит хосту своим маршрутом целиком', (tester) async {
    final opened = await boot(tester);
    for (final card in spatialHubCards) {
      await tester.ensureVisible(find.byKey(Key('карточка-${card.route}')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(Key('карточка-${card.route}')));
      await tester.pump();
    }
    expect(opened, spatialHubCards.map((c) => c.route).toList(),
        reason: 'маршрут уходит как написан — с запросом режима');
  });

  testWidgets('🔴 уровень на карточке берётся из ОБЩЕЙ памяти, а не заводится заново',
      (tester) async {
    await boot(tester);
    expect(find.text('ур. 7'), findsOneWidget, reason: 'уровень «Ротации» из ключа веб-стороны');
    expect(find.text('ур. 3'), findsOneWidget, reason: 'уровень «Сети труб»');
    // У карточек, которых нет в общей памяти, значка уровня нет вовсе — а не «ур. 1».
    expect(find.text('ур. 1'), findsWidgets);
  });

  testWidgets('🔴 без хоста нажатие не роняет экран', (tester) async {
    HybridApp.open = null;
    await tester.pumpWidget(MaterialApp(home: SpatialHubScreen(state: state)));
    await tester.pump();
    await tester.pump();
    // Карточка далеко внизу и ещё не построена — доезжаем до неё прокруткой.
    await tester.scrollUntilVisible(find.byKey(const Key('карточка-/games/navigator')), 120);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('карточка-/games/navigator')));
    await tester.pump();
    expect(tester.takeException(), isNull);
  });
}
