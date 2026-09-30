import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// РАЗВИЛКА «СЛУХ» — нативно, на общем каркасе развилок.
///
/// Меряем две вещи: состав раздела целиком (пять упражнений) и то, что заголовок
/// говорит на языке интерфейса. 🔴 Второе — дефект каркаса, найденный 30.09.2026:
/// `meta` в `assets/hubs.json` вёз только русский текст, и нативная развилка
/// показывала «Слух» и «Выбери упражнение» англичанину, хотя веб-экран той же
/// развилки берёт ключи словаря.
const hearingCards = ['phonemePairs', 'chineseTones', 'pseudowordEcho', 'dictation', 'rhythmPitch'];

Future<void> boot(WidgetTester tester, SharedState state) async {
  tester.view.physicalSize = const Size(780, 1688);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  await tester.runAsync(() async {
    await tester.pumpWidget(MaterialApp(home: HybridApp.native['/games/hearing-hub']!(state)));
    for (var i = 0; i < 40; i++) {
      await tester.pump(const Duration(milliseconds: 50));
      await Future<void>.delayed(const Duration(milliseconds: 50));
      if (find.byType(Card).evaluate().isNotEmpty) break;
    }
  });
  await tester.pump();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late SharedState state;
  setUp(() async {
    SharedPreferences.setMockInitialValues({
      'psygames_active_profile': 'nzt48',
      // Уровень пишет веб-половина тем же ключом: psygames_<игра>_level_<профиль>.
      'psygames_dictation_level_nzt48': '7',
    });
    state = await SharedState.open();
  });

  testWidgets('«Слух» показывает все пять упражнений раздела и уровень из общей памяти', (tester) async {
    await L.load('ru');
    await boot(tester, state);
    expect(find.text('Слух'), findsWidgets, reason: 'заголовок развилки');
    for (final key in hearingCards) {
      final name = L.t(key);
      expect(name, isNot(key), reason: 'в словаре нет подписи карточки $key');
      await tester.scrollUntilVisible(find.text(name), 120, scrollable: find.byType(Scrollable).first);
      expect(find.text(name), findsOneWidget, reason: 'карточка «$name»');
    }
    expect(find.text('ур. 7'), findsOneWidget, reason: 'уровень «Диктанта» из общей памяти');
  });

  testWidgets('🔴 заголовок и «выбери упражнение» — на языке интерфейса, а не по-русски', (tester) async {
    await L.load('en');
    addTearDown(() => L.load('ru'));
    await boot(tester, state);
    expect(L.t('hearingGroup'), 'Hearing', reason: 'в английском словаре нет заголовка развилки');
    expect(find.text('Hearing'), findsWidgets, reason: 'заголовок развилки на английском');
    expect(find.text(L.t('hubPickExercise')), findsOneWidget, reason: 'приглашение выбрать — на английском');
    expect(find.text('Слух'), findsNothing, reason: 'русский заголовок на английском интерфейсе');
    expect(find.text('Выбери упражнение'), findsNothing, reason: 'русское приглашение на английском интерфейсе');
  });
}
