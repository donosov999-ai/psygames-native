import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/warmup_screens.dart';

/// 🔴 ВЫБОР ЗАРЯДКИ И ИТОГ — НАТИВНЫЕ (задача 748c3f5f).
///
/// Решение Дениса 01.10.2026: «всё, что не на Flutter, — переводить», «зачем вебом
/// скреплять переходы — это лишний глюк». Считает за экранами страница
/// (`frontend/src/services/warmupUi.ts`), рисует оболочка (`warmup_screens.dart`).
/// Здесь: оболочка перехватывает оба адреса, рисует присланную модель, нажатия
/// уходят в действия страницы, и серия «выбор → две нативные игры → итог» не
/// показывает страницу ни разу.
void main() {
  final calls = <String>[];

  setUp(() {
    calls.clear();
    WarmupUi.picker.value = null;
    WarmupUi.complete.value = null;
    WarmupUi.run = (js) async => calls.add(js);
  });
  tearDown(() => WarmupUi.run = null);

  Map<String, Object?> card(String key, {bool on = false, bool off = false}) => {
        'key': key,
        'title': 'title-$key',
        'desc': 'desc-$key',
        'meta': 'unitGames: 5 · ~5 unitMin',
        'note': key == 'night' ? 'slotNightNote' : null,
        'icon': 'sunny-outline',
        'tint': ['#f7b733', '#fc4a1a'],
        'on': on,
        'off': off,
        'durs': on
            ? [
                {'value': 5, 'label': '5 мин', 'selected': true},
                {'value': 10, 'label': '10 мин', 'selected': false},
              ]
            : null,
        'ownLens': null,
        'steps': on ? ['1. Шульте · ~1 мин', '2. Объём цифр · ~1 мин'] : <String>[],
      };

  Map<String, Object?> picker({bool startDisabled = false}) => {
        'title': 'warmupPickerTitle',
        'hint': 'warmupPickerHint',
        'back': 'a11yBack',
        'slots': [card('morning', on: true), card('day'), card('evening'), card('night', off: true)],
        'seriesHead': null,
        'series': <Object>[],
        'ownHead': null,
        'own': <Object>[],
        'start': {'label': 'Начать', 'disabled': startDisabled, 'tint': '#f7b733'},
        'help': {
          'label': 'Справка',
          'title': 'warmupPickerTitle',
          'gotIt': 'Понятно',
          'hint': 'hint',
          'rows': [
            {'icon': 'moon-outline', 'tint': '#7b4397', 'name': 'Вечер', 'desc': 'Спокойные игры'},
          ],
        },
      };

  Future<void> pump(WidgetTester tester, Widget screen) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(home: screen));
    await tester.pump();
  }

  bool called(String screen, String action, [String args = '']) =>
      calls.any((c) => c.contains('window.__psyWarmupUi.$screen.$action($args)'));

  group('перехват адресов', () {
    test('🔴 оба адреса — экраны оболочки, и в карте игр их нет (переписи игр их не считают)', () {
      expect(HybridApp.routeOf('http://127.0.0.1:8123/warmup-picker'), '/warmup-picker');
      expect(HybridApp.routeOf('http://127.0.0.1:8123/warmup-complete'), '/warmup-complete');
      expect(HybridApp.shell.keys, containsAll(['/warmup-picker', '/warmup-complete']));
      expect(HybridApp.native.keys, isNot(contains('/warmup-picker')));
      expect(HybridApp.native.keys, isNot(contains('/warmup-complete')));
    });

    test('🔴 «выбор → две нативные игры → итог» — страница не показывается ни разу', () {
      final chain = <String>[
        'http://127.0.0.1:8123/warmup-picker',
        'http://127.0.0.1:8123/games/digit-span?wu=1',
        'http://127.0.0.1:8123/games/schulte?wu=1',
        'http://127.0.0.1:8123/warmup-complete',
      ];
      String? opened;
      for (final url in chain) {
        final next = HybridApp.routeOf(url);
        final a = routeAction(opened, next);
        expect(a, isNot(RouteAction.close), reason: 'на $url нативный экран сняли — человек увидел страницу');
        expect(a, isNot(RouteAction.keep), reason: 'на $url ничего не открылось — человек увидел страницу');
        opened = next;
      }
      // Итог → главная: страница и должна показаться.
      expect(routeAction(opened, HybridApp.routeOf('http://127.0.0.1:8123/')), RouteAction.close);
    });

    test('модель страницы принимается, чужое сообщение — нет', () {
      expect(WarmupUi.accept({'op': 'route', 'url': '/'}), isFalse);
      expect(WarmupUi.accept({'op': 'warmupUi', 'screen': 'picker', 'model': picker()}), isTrue);
      expect(WarmupUi.picker.value?['title'], 'warmupPickerTitle');
      expect(WarmupUi.accept({'op': 'warmupUi', 'screen': 'complete', 'model': {'empty': true}}), isTrue);
      expect(WarmupUi.complete.value?['empty'], true);
    });
  });

  group('выбор зарядки', () {
    testWidgets('пока модели нет — ждём и просим страницу прислать её ещё раз', (tester) async {
      await pump(tester, const WarmupPickerScreen());
      expect(find.byKey(const Key('warmup-ui-waiting')), findsOneWidget);
      expect(called('picker', 'post'), isTrue);
    });

    testWidgets('🔴 карточки, длины и состав — из модели; нажатия уходят в действия страницы', (tester) async {
      WarmupUi.picker.value = picker();
      await pump(tester, const WarmupPickerScreen());
      expect(find.text('title-morning'), findsOneWidget);
      expect(find.text('title-night'), findsOneWidget);
      expect(find.text('slotNightNote'), findsOneWidget);
      expect(find.text('1. Шульте · ~1 мин'), findsOneWidget);
      await tester.tap(find.byKey(const Key('warmup-card-day')));
      expect(called('picker', 'pick', '"day"'), isTrue);
      await tester.tap(find.byKey(const Key('warmup-durs-morning-10')));
      expect(called('picker', 'dur', '"morning",10'), isTrue);
      await tester.tap(find.byKey(const Key('warmup-picker-start')));
      expect(called('picker', 'launch'), isTrue);
      expect(tester.takeException(), isNull);
    });

    testWidgets('погашенный слот не выбирается', (tester) async {
      WarmupUi.picker.value = picker();
      await pump(tester, const WarmupPickerScreen());
      calls.clear();
      await tester.tap(find.byKey(const Key('warmup-card-night')), warnIfMissed: false);
      expect(called('picker', 'pick', '"night"'), isFalse);
    });

    testWidgets('пустой набор — «Начать» серая и не зовёт запуск', (tester) async {
      WarmupUi.picker.value = picker(startDisabled: true);
      await pump(tester, const WarmupPickerScreen());
      await tester.tap(find.byKey(const Key('warmup-picker-start')), warnIfMissed: false);
      expect(called('picker', 'launch'), isFalse);
    });

    testWidgets('«назад» — как у страницы: страница уходит, экран снимет оболочка', (tester) async {
      WarmupUi.picker.value = picker();
      await pump(tester, const WarmupPickerScreen());
      await tester.tap(find.byIcon(Icons.arrow_back));
      expect(called('picker', 'back'), isTrue);
      calls.clear();
      final nav = tester.state<NavigatorState>(find.byType(Navigator));
      await nav.maybePop();
      await tester.pump();
      expect(called('picker', 'back'), isTrue, reason: 'системное «назад» тоже уводит страницу');
      expect(find.byKey(const Key('warmup-picker')), findsOneWidget, reason: 'экран не снимается сам — его снимет перехват');
    });

    testWidgets('справка открывается окном из модели', (tester) async {
      WarmupUi.picker.value = picker();
      await pump(tester, const WarmupPickerScreen());
      await tester.tap(find.byKey(const Key('warmup-picker-help-btn')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('warmup-picker-help')), findsOneWidget);
      expect(find.text('Спокойные игры'), findsOneWidget);
      await tester.tap(find.text('Понятно'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('warmup-picker-help')), findsNothing);
    });

    testWidgets('модель сменилась — экран перерисовался без переоткрытия', (tester) async {
      WarmupUi.picker.value = picker();
      await pump(tester, const WarmupPickerScreen());
      final m = picker();
      m['slots'] = [card('morning'), card('day', on: true), card('evening'), card('night', off: true)];
      WarmupUi.picker.value = m;
      await tester.pump();
      expect(find.text('1. Шульте · ~1 мин'), findsOneWidget, reason: 'состав теперь у выбранной «Дневной»');
      expect(find.byKey(const Key('warmup-durs-day-5')), findsOneWidget);
    });
  });

  group('итог зарядки', () {
    Map<String, Object?> complete({bool again = true}) => {
          'empty': false,
          'completed': true,
          'hero': {'emoji': '🎉', 'title': 'warmupDoneTitle', 'sub': 'пн · Утро · 1:35', 'personalBest': 'personalBest'},
          'resultsTitle': 'resultsTitle',
          'rows': [
            {'name': 'Объём цифр', 'color': '#22c55e', 'score': '+7', 'negative': false, 'time': '31.2с', 'errors': 1},
            {'name': 'Шульте', 'color': '#0ea5e9', 'score': '+12', 'negative': false, 'time': '40.5с', 'errors': null},
          ],
          'skipped': null,
          'breakdown': {
            'title': 'warmupBreakdownTitle',
            'lead': 'Внимание выросло на 12%',
            'rows': [
              {'skill': 'Внимание', 'delta': '+12%', 'up': true},
            ],
            'hints': ['Подтяните память'],
          },
          'total': {'label': 'totalScoreLabel', 'value': '19', 'compare': null, 'combo': null},
          'streak': {'value': '3 дня подряд', 'label': 'dontBreakStreak'},
          'verdict': {'title': 'brainTodayTitle', 'msg': 'Сегодня лучше обычного', 'tone': 'up'},
          'reminder': {'kind': 'ask', 'title': 'Напомнить завтра?', 'body': 'body', 'enable': 'Включить', 'later': 'Не сейчас'},
          'again': again ? 'Ещё раз' : null,
          'home': 'На главную',
        };

    testWidgets('🔴 итог из модели: партии, счёт, серия, вердикт; разбор раскрывается касанием', (tester) async {
      WarmupUi.complete.value = complete();
      await pump(tester, const WarmupCompleteScreen());
      expect(called('complete', 'post'), isTrue);
      expect(find.text('warmupDoneTitle'), findsOneWidget);
      expect(find.text('Объём цифр'), findsOneWidget);
      expect(find.byIcon(Icons.close), findsOneWidget, reason: 'ошибки — значком, не знаком «✗»');
      expect(find.byKey(const Key('warmup-complete-total')), findsOneWidget);
      expect(find.text('3 дня подряд'), findsOneWidget);
      expect(find.text('Сегодня лучше обычного'), findsOneWidget);
      expect(find.text('Подтяните память'), findsNothing, reason: 'разбор свёрнут по умолчанию');
      await tester.tap(find.byKey(const Key('warmup-complete-breakdown')));
      await tester.pump();
      expect(find.text('Подтяните память'), findsOneWidget);
      expect(find.byKey(const Key('warmup-complete-actions')), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('«Ещё раз», «На главную», напоминание — действия страницы', (tester) async {
      WarmupUi.complete.value = complete();
      await pump(tester, const WarmupCompleteScreen());
      await tester.tap(find.byKey(const Key('warmup-complete-again')));
      expect(called('complete', 'again'), isTrue);
      await tester.tap(find.byKey(const Key('warmup-complete-home')));
      expect(called('complete', 'home'), isTrue);
      // Список итога ленивый: напоминание ниже края экрана — докручиваем.
      await tester.scrollUntilVisible(find.byKey(const Key('warmup-complete-remind')), 200,
          scrollable: find.byType(Scrollable).first);
      await tester.tap(find.byKey(const Key('warmup-complete-remind')));
      expect(called('complete', 'remindEnable'), isTrue);
    });

    testWidgets('нет повтора у серии с остыванием — нет и кнопки', (tester) async {
      WarmupUi.complete.value = complete(again: false);
      await pump(tester, const WarmupCompleteScreen());
      expect(find.byKey(const Key('warmup-complete-again')), findsNothing);
      expect(find.byKey(const Key('warmup-complete-home')), findsOneWidget);
    });

    testWidgets('системное «назад» с итога — на главную, не в сыгранную игру', (tester) async {
      WarmupUi.complete.value = complete();
      await pump(tester, const WarmupCompleteScreen());
      final nav = tester.state<NavigatorState>(find.byType(Navigator));
      await nav.maybePop();
      await tester.pump();
      expect(called('complete', 'home'), isTrue);
    });
  });
}
