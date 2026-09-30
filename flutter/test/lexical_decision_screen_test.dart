import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/lexical_decision/model.dart';
import 'package:psygames_flutter/games/lexical_decision/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ «СЛОВО ИЛИ НЕТ?» НАЖАТИЯМИ. Верный ответ выводится из ДАННЫХ (есть ли
/// показанное слово в словаре), а не из модели экрана.
void main() {
  late SharedState state;
  const vocab = <Map<String, String>>[
    {'en': 'house', 'es': 'casa', 'fr': 'maison'},
    {'en': 'water', 'es': 'agua', 'fr': 'eau'},
    {'en': 'bread', 'es': 'pan', 'fr': 'pain'},
    {'en': 'mother', 'es': 'madre', 'fr': 'mère'},
    {'en': 'garden', 'es': 'jardín', 'fr': 'jardin'},
    {'en': 'window', 'es': 'ventana', 'fr': 'fenêtre'},
    {'en': 'winter', 'es': 'invierno', 'fr': 'hiver'},
    {'en': 'river', 'es': 'río', 'fr': 'rivière'},
    {'en': 'summer', 'es': 'verano', 'fr': 'été'},
    {'en': 'forest', 'es': 'bosque', 'fr': 'forêt'},
  ];
  bool isReal(String w) => vocab.any((e) => e.values.contains(w));

  setUp(() async {
    SharedPreferences.setMockInitialValues({'language': 'ru', 'psygames_active_profile': 'nzt48'});
    state = await SharedState.open();
    await L.load('ru');
  });
  tearDown(() {
    GamePreset.clear();
    SessionReport.sink = null;
  });

  Widget app(int Function() clock) => MaterialApp(
        // Постоянное число генератору не годится: псевдослово выходило бы одно и то же.
        home: LexicalDecisionScreen(state: state, clock: clock, random: Random(5).nextDouble, vocabOverride: vocab),
      );

  Future<void> boot(WidgetTester tester, int Function() clock) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(app(clock));
      for (var i = 0; i < 40; i++) {
        await tester.pump(const Duration(milliseconds: 20));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(const Key('ld-start')).evaluate().isNotEmpty ||
            find.byKey(const Key('ld-word')).evaluate().isNotEmpty) {
          break;
        }
      }
    });
    await tester.pump();
  }

  /// ⚠️ БЕЗ `runAsync` — для проб про ВРЕМЯ. Экран, поднятый в `runAsync`, взводит
  /// таймеры настоящим временем, и `pump(10 с)` их не двигает: проба «дедлайна
  /// нет» зеленела бы и с дедлайном (мутация выжила, 30.09.2026).
  Future<void> bootFake(WidgetTester tester, int Function() clock) async {
    await tester.pumpWidget(app(clock));
    for (var i = 0; i < 20; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }
  }

  String shown(WidgetTester tester) => tester.widget<Text>(find.byKey(const Key('ld-word'))).data!;

  testWidgets('🔴 все верно в окно — уровень пройден и партия ушла одним отчётом', (tester) async {
    final sent = <Map<String, dynamic>>[];
    SessionReport.sink = (j) async => sent.add(jsonDecode(j) as Map<String, dynamic>);
    var now = 1000;
    await boot(tester, () => now);
    await tester.tap(find.byKey(const Key('ld-start')));
    await tester.pump();
    final total = ldLevelParams(1).trials;
    expect(find.text('1/$total'), findsOneWidget);
    var words = 0;
    for (var i = 0; i < total; i += 1) {
      now += 700;
      final real = isReal(shown(tester));
      if (real) words += 1;
      await tester.tap(find.byKey(Key(real ? 'ld-yes' : 'ld-no')));
      await tester.pump(const Duration(milliseconds: 400));
    }
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.byKey(const Key('ld-score')), findsOneWidget);
    expect(state.get(SharedState.levelKey('lexical_decision', 'nzt48')), '2');
    expect(sent, hasLength(1));
    final s = sent.single;
    expect(s['game_type'], 'lexical_decision');
    expect(s['difficulty'], 'en · $total');
    expect(s['mode'], 'lvl1');
    final d = s['details'] as Map;
    expect(d['hits'], words);
    expect(d['correct_rejections'], total - words);
    expect(d['false_alarms'], 0);
    expect(d['window_ms'], ldLevelParams(1).windowMs);
    expect(d['mean_rt_ms'], 700);
  });

  testWidgets('🔴 не успел в окно — ошибка, а на СЛОВЕ ещё и пропуск; дальше само', (tester) async {
    final sent = <Map<String, dynamic>>[];
    SessionReport.sink = (j) async => sent.add(jsonDecode(j) as Map<String, dynamic>);
    var now = 1000;
    await boot(tester, () => now);
    await tester.tap(find.byKey(const Key('ld-start')));
    await tester.pump();
    final p = ldLevelParams(1);
    var words = 0;
    for (var i = 0; i < p.trials; i += 1) {
      if (isReal(shown(tester))) words += 1;
      now += p.windowMs + 10;
      await tester.pump(Duration(milliseconds: p.windowMs + 10));
      await tester.pump(const Duration(milliseconds: 850));
    }
    await tester.pump(const Duration(milliseconds: 100));
    expect(sent, hasLength(1));
    final d = sent.single['details'] as Map;
    expect(d['timeouts'], p.trials);
    expect(d['misses'], words, reason: 'просрочка на слове — пропуск');
    expect(d['hits'], 0);
    expect(d['mean_rt_ms'], 0, reason: 'просрочка не пишет время реакции');
    expect(sent.single['errors'], p.trials);
    expect(state.get(SharedState.levelKey('lexical_decision', 'nzt48')), isNot('2'));
  });

  testWidgets('шаг зарядки: сам стартует, без дедлайна, число проб из адреса, язык подписан', (tester) async {
    GamePreset.set({'wu': '1', 'targetLang': 'en', 'trials': '6'});
    var now = 1000;
    await bootFake(tester, () => now);
    expect(find.byKey(const Key('ld-start')), findsNothing);
    expect(find.text('1/6'), findsOneWidget);
    now += 10000;
    await tester.pump(const Duration(seconds: 10));
    expect(find.text('1/6'), findsOneWidget, reason: 'шагу зарядки дедлайн не ставится');
    expect(find.byKey(const Key('language-badge')), findsOneWidget);
    expect(find.text('English'), findsOneWidget, reason: 'язык — самоназванием, как в вебе');
  });

  testWidgets('🔴 билингво: смена языка отмечена стрелкой у самого стимула', (tester) async {
    GamePreset.set({'wu': '1', 'targetLang': 'en', 'trials': '6', 'bilingual': '1', 'lang2': 'es'});
    var now = 1000;
    await boot(tester, () => now);
    // Ряд чередования: en, es, en, en, es, es — вторая проба на испанском.
    expect(find.text('English'), findsOneWidget);
    now += 500;
    await tester.tap(find.byKey(Key(isReal(shown(tester)) ? 'ld-yes' : 'ld-no')));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('2/6'), findsOneWidget);
    expect(find.text('→ Español'), findsOneWidget, reason: 'переход на второй язык');
    expect(find.text('ES·en'), findsOneWidget, reason: 'пилюля в шапке: текущий прописными');
  });

  testWidgets('в выборе — только языки с псевдословами и без своего', (tester) async {
    await boot(tester, () => 1000);
    // Выбор — выпадающей строкой: состав пунктов виден в открытом списке.
    await tester.tap(find.byKey(const Key('ld-lang')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byKey(const Key('ld-lang-en')), findsWidgets);
    expect(find.byKey(const Key('ld-lang-es')), findsWidgets);
    expect(find.byKey(const Key('ld-lang-fr')), findsNothing, reason: 'у французского генератора нет');
    expect(find.byKey(const Key('ld-lang-ru')), findsNothing, reason: 'свой язык целью не бывает');
    expect(find.byKey(const Key('ld-level-params')), findsOneWidget);
  });

  testWidgets('разбор до партии — настоящее слово и псевдослово языка', (tester) async {
    await boot(tester, () => 1000);
    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pumpAndSettle();
    expect(find.text('house'), findsWidgets, reason: 'первое слово словаря');
  });
}
