import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/languages/fresh_pool.dart';
import 'package:psygames_flutter/games/semantic_sort/model.dart';
import 'package:psygames_flutter/games/semantic_sort/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ В «СОРТИРОВКУ СЛОВ» ИГРАЕТСЯ НАЖАТИЯМИ.
///
/// Проба жмёт настоящие кнопки категорий и читает экран. Верная категория
/// выводится из ДАННЫХ (слово → его `cat` в словаре), а не из модели экрана —
/// иначе экран мог бы показать любое слово, и проба осталась бы зелёной.
void main() {
  late SharedState state;

  /// Маленький словарь: 3 категории по 3 слова — порог «≥ 3 слова» проходит у всех.
  const vocab = <Map<String, String>>[
    {'en': 'cat', 'ru': 'кот', 'es': 'gato', 'cat': 'animals'},
    {'en': 'dog', 'ru': 'собака', 'es': 'perro', 'cat': 'animals'},
    {'en': 'cow', 'ru': 'корова', 'es': 'vaca', 'cat': 'animals'},
    {'en': 'bread', 'ru': 'хлеб', 'es': 'pan', 'cat': 'food'},
    {'en': 'milk', 'ru': 'молоко', 'es': 'leche', 'cat': 'food'},
    {'en': 'egg', 'ru': 'яйцо', 'es': 'huevo', 'cat': 'food'},
    {'en': 'red', 'ru': 'красный', 'es': 'rojo', 'cat': 'colors'},
    {'en': 'blue', 'ru': 'синий', 'es': 'azul', 'cat': 'colors'},
    {'en': 'green', 'ru': 'зелёный', 'es': 'verde', 'cat': 'colors'},
  ];

  setUp(() async {
    SharedPreferences.setMockInitialValues({'language': 'ru', 'psygames_active_profile': 'nzt48'});
    state = await SharedState.open();
    await L.load('ru');
  });

  tearDown(() {
    GamePreset.clear();
    SessionReport.sink = null;
  });

  Widget app({int Function()? clock}) => MaterialApp(
        home: SemanticSortScreen(
          state: state,
          clock: clock ?? () => 1000,
          random: () => 0.0,
          vocabOverride: vocab,
          distractorsOverride: const {},
        ),
      );

  String catOf(String word) => vocab.firstWhere((w) => w.values.contains(word))['cat']!;

  Future<void> answer(WidgetTester tester, {required bool right}) async {
    final word = tester.widget<Text>(find.byKey(const Key('semantic-word'))).data!;
    final correct = catOf(word);
    String cat = correct;
    if (!right) {
      cat = ['animals', 'food', 'colors'].firstWhere(
          (c) => c != correct && find.byKey(Key('semantic-cat-$c')).evaluate().isNotEmpty);
    }
    await tester.tap(find.byKey(Key('semantic-cat-$cat')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 1000));
    await tester.pumpAndSettle();
  }

  testWidgets('🔴 все верно — уровень пройден, и лестница поднялась', (tester) async {
    final sent = <Map<String, dynamic>>[];
    SessionReport.sink = (j) async => sent.add(jsonDecode(j) as Map<String, dynamic>);
    await tester.pumpWidget(app());
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('semantic-start')));
    await tester.pumpAndSettle();

    // Уровень 1: 2 категории на раунд, раундов столько, сколько слов (9 < 10).
    expect(find.byKey(const Key('semantic-word')), findsOneWidget);
    expect(find.byType(FilledButton), findsNWidgets(2), reason: 'две кнопки категорий на первом уровне');
    for (var i = 0; i < vocab.length; i += 1) {
      await answer(tester, right: true);
    }
    expect(find.byKey(const Key('semantic-score')), findsOneWidget);
    expect(state.get(SharedState.levelKey('semantic_sort', 'nzt48')), '2', reason: 'проход — уровень вверх');

    expect(sent, hasLength(1), reason: 'одна партия — один отчёт');
    final r = sent.single;
    expect(r['game_type'], 'semantic_sort');
    expect(r['score'], vocab.length);
    expect(r['errors'], 0);
    final d = r['details'] as Map<String, dynamic>;
    expect(d['accuracy'], 1.0);
    expect(d['cats_per_round'], 2);
    expect(d['level'], 1);
  });

  testWidgets('🔴 точность ниже 80 % — уровень не пройден, лестница не поднялась', (tester) async {
    await tester.pumpWidget(app());
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('semantic-start')));
    await tester.pumpAndSettle();
    // Из 9 раундов 2 ошибки = 77,8 % — ниже порога 80 %.
    for (var i = 0; i < vocab.length; i += 1) {
      await answer(tester, right: i >= 2);
    }
    expect(state.get(SharedState.levelKey('semantic_sort', 'nzt48')), anyOf(isNull, '1'));
  });

  testWidgets('🔴 запас невиданного пишется в общую память — вторая партия не повторит слова', (tester) async {
    await tester.pumpWidget(app());
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('semantic-start')));
    await tester.pumpAndSettle();
    final seen = readSeen(state, semanticSeenPool);
    expect(seen, hasLength(vocab.length), reason: 'все слова партии отмечены виденными');
    expect(state.get(freshPoolKey(semanticSeenPool, 'nzt48')), isNotNull, reason: 'ключ тот же, что у веба');
  });

  testWidgets('шаг зарядки: стартует сам, берёт число раундов из адреса и лестницу не двигает', (tester) async {
    GamePreset.set({'wu': '1', 'targetLang': 'en', 'rounds': '4', 'cats': '3'});
    await tester.pumpWidget(app());
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('semantic-start')), findsNothing, reason: 'автостарт');
    expect(find.text('1/4'), findsOneWidget, reason: 'раундов — из адреса');
    expect(find.byType(FilledButton), findsNWidgets(3), reason: 'категорий — из адреса');
    for (var i = 0; i < 4; i += 1) {
      await answer(tester, right: true);
    }
    expect(state.get(SharedState.levelKey('semantic_sort', 'nzt48')), anyOf(isNull, '1'),
        reason: 'шаг зарядки личный уровень не меняет');
  });

  testWidgets('разбор открывается до партии и показывает слово с его категорией', (tester) async {
    await tester.pumpWidget(app());
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pumpAndSettle();
    expect(find.text('cat'), findsWidgets, reason: 'первое слово словаря пары ru→en');
    expect(find.textContaining(semanticCategoryName('animals')), findsWidgets);
  });

  testWidgets('имена категорий на кнопках — из словаря, а не ключи', (tester) async {
    await tester.pumpWidget(app());
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('semantic-start')));
    await tester.pumpAndSettle();
    for (final e in find.byType(Text).evaluate()) {
      final t = (e.widget as Text).data ?? '';
      expect(t.contains('catVocab_'), isFalse, reason: 'на экране ключ словаря: $t');
    }
  });
}
