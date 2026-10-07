import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/span_hub/screen.dart';
import 'package:psygames_flutter/shell/hub_screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПРОБА РАЗВИЛКИ «ОБЪЁМ ПАМЯТИ».
///
/// Развилка существует ради трёх вещей: показать ВЕСЬ состав раздела, показать
/// рядом УРОВЕНЬ из общей с вебом памяти и вернуть маршрут наверх — открывать игру
/// должна оболочка. Плюс шапка: та же, что у веб-развилки, а не общая заглушка.
Future<void> boot(WidgetTester tester, Widget hub) async {
  // 07.10.2026: карточек 6 → 8 (OSpan и «Мнемоника» приехали, задача 668bcc73) — на 390×844 список
  // прокручивается и строится лениво; проба «лишних карточек нет» считает построенные, поэтому экран выше.
  tester.view.physicalSize = const Size(780, 2600);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  await tester.runAsync(() async {
    await tester.pumpWidget(MaterialApp(home: hub));
    for (var i = 0; i < 40; i++) {
      await tester.pump(const Duration(milliseconds: 50));
      await Future<void>.delayed(const Duration(milliseconds: 50));
      if (find.byType(Card).evaluate().isNotEmpty) break;
    }
  });
  await tester.pump();
}

/// Карточка развилки по адресу: в ней ищем уровень, а не по всему экрану.
Finder card(String route) => find.byKey(ValueKey('hub-card-$route'));

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await L.load('ru');
  });

  setUp(() {
    SharedPreferences.setMockInitialValues({
      // Уровни пишут игры ТЕМИ ЖЕ ключами: psygames_<игра>_level_<профиль>.
      // n_back и listening_span пишет пока веб-половина, picture_pairs — натив.
      'psygames_n_back_level_nzt48': '3',
      'psygames_picture_pairs_level_nzt48': '12',
      'psygames_listening_span_level_nzt48': '7',
    });
  });

  const exercises = {
    '/games/digit-span': 'Запомни цифры',
    '/games/memory-matrix': 'Позиции',
    '/games/listening-span': 'Слуховой охват',
    '/games/reading-span': 'Reading Span: память',
    '/games/n-back': 'N-back: оперативная память',
    '/games/picture-pairs': 'Парные картинки',
    // 07.10.2026: переезды по решению Дениса 18.09 (задача 668bcc73): OSpan из «Счёта» и «Мнемоника: порядок» из «Мнемотехник».
    '/games/ospan': 'OSpan: счёт+память',
    '/games/mnemonics': 'Мнемоника: порядок',
  };

  testWidgets('показывает все восемь упражнений раздела, каждое своим названием', (tester) async {
    final state = await SharedState.open();
    await boot(tester, SpanHubScreen(state: state, isNative: (r) => true));
    for (final e in exercises.entries) {
      await tester.scrollUntilVisible(card(e.key), 120, scrollable: find.byType(Scrollable).first);
      expect(find.descendant(of: card(e.key), matching: find.text(e.value)), findsOneWidget,
          reason: 'карточка «${e.value}»');
    }
    expect(find.byType(ListTile), findsNWidgets(exercises.length), reason: 'лишних карточек нет');
  });

  testWidgets('🔴 шапка — та же, что у веб-развилки: заголовок, призыв и сноска раздела', (tester) async {
    final state = await SharedState.open();
    await boot(tester, SpanHubScreen(state: state, isNative: (r) => true));
    expect(find.text('Объём памяти'), findsWidgets, reason: 'заголовок развилки');
    // До 30.09.2026 натив подставлял общее «Выбери упражнение» и терял сноску.
    expect(find.text('Выбери модальность'), findsOneWidget, reason: 'призыв развилки, а не общий');
    await tester.scrollUntilVisible(find.textContaining('max_span'), 120,
        scrollable: find.byType(Scrollable).first);
    expect(find.textContaining('max_span'), findsOneWidget, reason: 'сноска веб-развилки');
  });

  testWidgets('🔴 на карточке — уровень ИЗ ОБЩЕЙ ПАМЯТИ, а не единица', (tester) async {
    final state = await SharedState.open();
    await boot(tester, SpanHubScreen(state: state, isNative: (r) => true));
    for (final e in {
      '/games/n-back': 'ур. 3',
      '/games/picture-pairs': 'ур. 12',
      '/games/listening-span': 'ур. 7',
      '/games/digit-span': 'ур. 1',
    }.entries) {
      await tester.scrollUntilVisible(card(e.key), 120, scrollable: find.byType(Scrollable).first);
      expect(find.descendant(of: card(e.key), matching: find.text(e.value)), findsOneWidget,
          reason: '${e.key}: уровень из общей памяти');
    }
  });

  testWidgets('значки карточек — свои, а не общий пазл', (tester) async {
    final state = await SharedState.open();
    await boot(tester, SpanHubScreen(state: state, isNative: (r) => true));
    final puzzles = find.descendant(of: find.byType(ListTile), matching: find.byIcon(Icons.extension_outlined));
    expect(puzzles, findsNothing, reason: 'до 30.09.2026 у пяти карточек из шести стоял пазл');
  });

  testWidgets('🔴 нажатие ВОЗВРАЩАЕТ МАРШРУТ наверх, а не открывает игру само', (tester) async {
    // «Слуховой охват» ещё в вебе: развилка не знает, что перенесено, и отдаёт
    // маршрут оболочке — иначе она стала бы второй оболочкой.
    final state = await SharedState.open();
    Object? popped;
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(
        home: Builder(
          builder: (context) => ElevatedButton(
            onPressed: () async {
              popped = await Navigator.of(context).push(MaterialPageRoute(
                builder: (_) => SpanHubScreen(state: state, isNative: (r) => false),
              ));
            },
            child: const Text('открыть развилку'),
          ),
        ),
      ));
      await tester.pump();
      await tester.tap(find.text('открыть развилку'));
      for (var i = 0; i < 40; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 50));
        if (find.byType(Card).evaluate().isNotEmpty) break;
      }
      await tester.tap(card('/games/listening-span'));
      for (var i = 0; i < 20 && popped == null; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 50));
      }
    });
    await tester.pumpAndSettle();
    expect(popped, isA<HubCardTap>());
    expect((popped! as HubCardTap).route, '/games/listening-span');
  });
}
