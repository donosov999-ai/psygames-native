import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/warmup_step_bridge.dart';

/// 🔴 НАТИВНЫЙ МОСТ МЕЖДУ ДВУМЯ НАТИВНЫМИ ШАГАМИ ЗАРЯДКИ.
///
/// Решение Дениса 01.10.2026: «зачем вебом скреплять переходы между двумя
/// упражнениями? это лишний глюк». Веб присылает `warmupStepDone`
/// (`frontend/src/services/hostWarmup.ts`), оболочка показывает этот экран и по
/// выбору человека сама открывает следующую игру (`hybrid_app.dart::_warmupStepDone`).
/// Здесь меряется сам экран: отсчёт уводит дальше сам, кнопки дают нужный выбор,
/// «Остановить» переспрашивает и держит отсчёт, пока висит вопрос.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async => L.load('ru'));

  final msg = <String, Object?>{
    'op': 'warmupStepDone',
    'fromIdx': 0,
    'total': 5,
    'evening': false,
    'next': {'url': '/games/word-pairs?wu=1&level=3', 'title': 'Пары слов'},
    'afterNext': {'url': '/games/digit-span?wu=1', 'title': 'Объём цифр'},
    'played': {'score': 5, 'time_seconds': 29.0, 'errors': 0},
  };

  WarmupBridgeChoice? got;
  var popped = false;

  Future<void> open(WidgetTester tester, {int? seconds}) async {
    got = null;
    popped = false;
    final done = WarmupStepDone.fromJson(msg)!;
    await tester.pumpWidget(MaterialApp(
      home: Builder(
        builder: (c) => Scaffold(
          body: TextButton(
            onPressed: () async {
              got = await Navigator.of(c).push<WarmupBridgeChoice>(
                MaterialPageRoute(builder: (_) => WarmupStepBridge(done: done, seconds: seconds)),
              );
              popped = true;
            },
            child: const Text('open'),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
  }

  test('сообщение веба читается целиком; без адреса следующего шага — отказ', () {
    final d = WarmupStepDone.fromJson(msg)!;
    expect(d.fromIdx, 0);
    expect(d.total, 5);
    expect(d.nextUrl, '/games/word-pairs?wu=1&level=3');
    expect(d.nextTitle, 'Пары слов');
    expect(d.afterNextTitle, 'Объём цифр');
    expect(d.score, 5);
    expect(d.seconds, 29.0);
    expect(WarmupStepDone.fromJson({...msg, 'next': {'title': 'x'}}), isNull);
    expect(WarmupStepDone.fromJson({...msg, 'fromIdx': null}), isNull);
  });

  testWidgets('🔴 отсчёт уводит на следующую игру сам — без нажатия', (tester) async {
    await open(tester);
    expect(find.text('Пары слов'), findsOneWidget);
    expect(find.textContaining('1/5'), findsWidgets);
    expect(find.byKey(const Key('warmup-bridge-played')), findsOneWidget);
    expect(find.textContaining(L.t('startingInN').replaceAll('{n}', '5')), findsOneWidget);
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(seconds: 1));
    }
    await tester.pumpAndSettle();
    expect(popped, isTrue);
    expect(got, WarmupBridgeChoice.go);
  });

  testWidgets('«Старт сейчас» — сразу дальше', (tester) async {
    await open(tester);
    await tester.tap(find.byKey(const Key('warmup-bridge-go')));
    await tester.pumpAndSettle();
    expect(got, WarmupBridgeChoice.go);
  });

  testWidgets('«Пропустить» — выбор skip', (tester) async {
    await open(tester);
    await tester.tap(find.byKey(const Key('warmup-bridge-skip')));
    await tester.pumpAndSettle();
    expect(got, WarmupBridgeChoice.skip);
  });

  testWidgets('🔴 «Остановить» переспрашивает; пока висит вопрос — отсчёт стоит', (tester) async {
    await open(tester);
    await tester.tap(find.byKey(const Key('warmup-bridge-stop')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('warmup-bridge-keep')), findsOneWidget);
    // Под вопросом время идёт — но на следующую игру мост не уходит.
    for (var i = 0; i < 8; i++) {
      await tester.pump(const Duration(seconds: 1));
    }
    expect(popped, isFalse, reason: 'отсчёт ушёл на следующую игру под вопросом «остановить?»');
    // «Продолжить зарядку» — вопрос закрыт, отсчёт снова идёт и уводит дальше.
    await tester.tap(find.byKey(const Key('warmup-bridge-keep')));
    await tester.pumpAndSettle();
    expect(popped, isFalse);
    for (var i = 0; i < 6; i++) {
      await tester.pump(const Duration(seconds: 1));
    }
    await tester.pumpAndSettle();
    expect(got, WarmupBridgeChoice.go);
  });

  testWidgets('«Остановить» → «Остановить» — выбор stop', (tester) async {
    await open(tester);
    await tester.tap(find.byKey(const Key('warmup-bridge-stop')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('warmup-bridge-stop-yes')));
    await tester.pumpAndSettle();
    expect(got, WarmupBridgeChoice.stop);
  });

  testWidgets('системное «назад» не уводит молча — тот же вопрос', (tester) async {
    await open(tester);
    final nav = tester.state<NavigatorState>(find.byType(Navigator).last);
    await nav.maybePop();
    await tester.pumpAndSettle();
    expect(popped, isFalse);
    expect(find.byKey(const Key('warmup-bridge-keep')), findsOneWidget);
  });

  testWidgets('тексты моста — из словаря, а не сырые ключи', (tester) async {
    await open(tester);
    for (final key in ['complexWarmup', 'bridgeJustPlayed', 'onbNext', 'ctaStartNow', 'skipGameNamed', 'stopComplex']) {
      expect(L.t(key), isNot(key), reason: 'ключ $key не попал в словарь приложения');
    }
  });
}
