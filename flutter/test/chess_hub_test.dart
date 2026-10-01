import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/chess_hub/screen.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПРОБА РАЗВИЛКИ «ШАХМАТЫ».
///
/// Развилка собрана ради одного: человек, пришедший тренировать шахматы, не
/// обязан заранее знать оба названия. Поэтому проверяется не «экран построился»,
/// а видны ли ОБА упражнения и стоит ли рядом уровень из общей с вебом памяти.
Future<void> _boot(WidgetTester tester, SharedState state) async {
  tester.view.physicalSize = const Size(780, 1688);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  await tester.runAsync(() async {
    await tester.pumpWidget(
      MaterialApp(
        home: Navigator(
          onGenerateRoute: (_) => MaterialPageRoute(
            builder: (_) =>
                chessHubScreen(state: state, isNative: (r) => false),
          ),
        ),
      ),
    );
    for (var i = 0; i < 40; i++) {
      await tester.pump(const Duration(milliseconds: 50));
      await Future<void>.delayed(const Duration(milliseconds: 50));
      if (find.byType(Card).evaluate().isNotEmpty) break;
    }
  });
  await tester.pump();
}

void main() {
  setUp(() async {
    // Развилка берёт названия карточек из СЛОВАРЯ (ключи в assets/hubs.json) —
    // так общий хаб устроен с main 30.09; без словаря на экране были бы ключи.
    await L.load('ru');
    SharedPreferences.setMockInitialValues({
      // Ключи те же, что пишет веб-половина: psygames_<игра>_level_<профиль>.
      'psygames_scholars_mate_level_nzt48': '9',
      'psygames_chess_blind_level_nzt48': '4',
    });
  });

  testWidgets('развилка показывает оба упражнения раздела', (tester) async {
    final state = await SharedState.open();
    await _boot(tester, state);
    expect(find.text('Шахматы'), findsWidgets, reason: 'заголовок развилки');
    expect(find.text('Выбери упражнение'), findsOneWidget);
    expect(find.text('Детский мат'), findsOneWidget);
    expect(find.text('Доска в уме'), findsOneWidget);
  });

  testWidgets('🔴 НА КАРТОЧКЕ СТОИТ УРОВЕНЬ ИЗ ОБЩЕЙ ПАМЯТИ, а не единица', (
    tester,
  ) async {
    // За этим в развилку и возвращаются: увидеть, где остановился. Уровень
    // общий с веб-половиной, иначе прогресс поедет двумя путями.
    final state = await SharedState.open();
    await _boot(tester, state);
    expect(
      find.text('ур. 9'),
      findsOneWidget,
      reason: 'уровень «Детского мата»',
    );
    expect(find.text('ур. 4'), findsOneWidget, reason: 'уровень «Доски в уме»');
  });

  test('🔴 перехват включён ВМЕСТЕ с зарядкой: развилка — с мостом к шахматной зарядке', () {
    // Сторож стоял обратным до 01.10.2026: слота под шапку не было, и перехват
    // отнял бы рабочую зарядку. Снят тем же изменением, что поставил шапку-мост;
    // что шапка именно «chess», держит warmup_bridge_test.dart.
    expect(HybridApp.native.containsKey('/games/chess-hub'), isTrue);
  });
}
