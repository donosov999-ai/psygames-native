import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/vocab_srs/model.dart';
import 'package:psygames_flutter/games/vocab_srs/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ В «СЛОВАРЬ SRS» ИГРАЕТСЯ НАЖАТИЯМИ, а не вызовом правил.
///
/// Проба нажимает настоящие кнопки и читает то, что видно на экране. Правила
/// через модель здесь НЕ зовутся — иначе экран мог бы быть подключён к ним как
/// угодно и проба осталась бы зелёной.
///
/// 🔴 ЧТО ЗДЕСЬ ГЛАВНОЕ. Оценка карточки выводится из ВРЕМЕНИ ответа: быстрее
/// 2,5 с — `easy` (первый интервал 3 дня), медленнее — `good` (1 день). Часы
/// подставные, поэтому проба проверяет не «что-то записалось», а ровно тот
/// интервал, который следует из скорости нажатия.
void main() {
  late SharedState state;
  late MemoryDeckStore deck;

  /// Маленький словарь: пяти слов хватает и на верный ответ, и на отвлекающие.
  const vocab = <VocabEntry>[
    {'en': 'house', 'ru': 'дом', 'es': 'casa', 'cat': 'home'},
    {'en': 'water', 'ru': 'вода', 'es': 'agua', 'cat': 'food'},
    {'en': 'dog', 'ru': 'собака', 'es': 'perro', 'cat': 'animals'},
    {'en': 'book', 'ru': 'книга', 'es': 'libro', 'cat': 'things'},
    {'en': 'table', 'ru': 'стол', 'es': 'mesa', 'cat': 'things'},
  ];

  setUp(() async {
    SharedPreferences.setMockInitialValues({'language': 'ru'});
    state = await SharedState.open();
    deck = MemoryDeckStore();
    // Подписи — из ТОГО ЖЕ словаря, что и в сборке: проба заодно проверяет, что
    // `assets/l10n/ru.json` собран и читается. Сменится формулировка в словаре —
    // проба не развалится, потому что сравнивает через L.t(), а не строкой.
    await L.load('ru');
  });

  Widget app({required int Function() clock}) => MaterialApp(
        home: VocabSrsScreen(
          state: state,
          clock: clock,
          vocabOverride: vocab,
          storeOverride: deck,
          random: () => 0.0, // порядок вариантов закреплён: проба ищет их по подписи
        ),
      );

  /// Состояние карточки в колоде ПАРЫ. Пара по умолчанию ru→en: для русского
  /// интерфейса веб-версия предлагает английский, и колода лежит под своим ключом.
  CardState? stateOf(String id, {String base = 'ru', String target = 'en'}) {
    final raw = deck.data[deckKeyFor(base, target)];
    if (raw == null) return null;
    final states = (jsonDecode(raw) as Map<String, dynamic>)['states'] as Map<String, dynamic>;
    final s = states[id];
    return s == null ? null : CardState.fromJson((s as Map).cast<String, dynamic>());
  }

  testWidgets('быстрый верный ответ идёт как easy, медленный — как good', (tester) async {
    var clock = 1000;
    await tester.pumpWidget(app(clock: () => clock));
    await tester.pumpAndSettle();

    // Пять новых слов, лимит оставляем по умолчанию.
    await tester.tap(find.byKey(const Key('vocab-start')));
    await tester.pumpAndSettle();

    // Показано изучаемое слово (узнавание), спрашивается родное.
    // ⚠️ Язык по умолчанию для русского интерфейса — английский (веб-версия:
    // `language === 'en' ? 'es' : 'en'`), поэтому на карточке английское слово.
    final shown = tester.widget<Text>(find.byKey(const Key('vocab-word'))).data!;
    final entry = vocab.firstWhere((w) => w['en'] == shown);
    expect(find.text('1/5'), findsOneWidget);

    // Быстрый ответ: 1,2 с < 2,5 с → easy → первый интервал 3 дня.
    clock += 1200;
    await tester.tap(find.byKey(Key('vocab-option-${entry['ru']}')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pumpAndSettle();
    expect(stateOf('v:${entry['en']}')!.intervalDays, 3, reason: 'быстрый верный → easy');

    // Медленный ответ по второй карточке: 4 с → good → 1 день.
    final shown2 = tester.widget<Text>(find.byKey(const Key('vocab-word'))).data!;
    final entry2 = vocab.firstWhere((w) => w['en'] == shown2);
    clock += 4000;
    await tester.tap(find.byKey(Key('vocab-option-${entry2['ru']}')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pumpAndSettle();
    expect(stateOf('v:${entry2['en']}')!.intervalDays, 1, reason: 'медленный верный → good');

    expect(find.text('2'), findsWidgets); // счётчик «верно» в полосе каркаса
  });

  testWidgets('🔴 ошибка возвращает карточку в ту же партию, а не откладывает на завтра', (tester) async {
    var clock = 1000;
    await tester.pumpWidget(app(clock: () => clock));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('vocab-start')));
    await tester.pumpAndSettle();

    expect(find.text('1/5'), findsOneWidget);
    final shown = tester.widget<Text>(find.byKey(const Key('vocab-word'))).data!;
    final entry = vocab.firstWhere((w) => w['en'] == shown);

    // Жмём ЛЮБОЙ вариант, кроме верного. Искать среди НАРИСОВАННЫХ: вариантов
    // четыре, а слов в словаре пять — один на экран не попал.
    final wrong = vocab.firstWhere((w) =>
        w['ru'] != entry['ru'] && find.byKey(Key('vocab-option-${w['ru']}')).evaluate().isNotEmpty);
    await tester.tap(find.byKey(Key('vocab-option-${wrong['ru']}')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 1200));
    await tester.pumpAndSettle();

    // Карточка сброшена в ноль и вернулась в очередь — партия стала длиннее.
    expect(stateOf('v:${entry['en']}')!.reps, 0);
    expect(stateOf('v:${entry['en']}')!.intervalDays, 0);
    expect(find.text('2/6'), findsOneWidget, reason: 'очередь выросла на одну карточку');
  });

  testWidgets('партия доигрывается до конца и поднимает счётчик подходов', (tester) async {
    var clock = 1000;
    await tester.pumpWidget(app(clock: () => clock));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('vocab-start')));
    await tester.pumpAndSettle();

    for (var i = 0; i < vocab.length; i += 1) {
      final shown = tester.widget<Text>(find.byKey(const Key('vocab-word'))).data!;
      final entry = vocab.firstWhere((w) => w['en'] == shown);
      clock += 1000;
      await tester.tap(find.byKey(Key('vocab-option-${entry['ru']}')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pumpAndSettle();
    }

    expect(find.text(L.t('resultsTitle')), findsOneWidget);
    // Счётчик прохождений лежит там же, где его пишет веб-сторона.
    expect(state.get('psygames_vocab_srs_level_nzt48'), '2');
  });

  testWidgets('🔴 базовый язык берётся у веб-стороны, а не зашит в код', (tester) async {
    // Английский интерфейс: колода обязана собраться на ПАРУ en→es, а не ru→es.
    SharedPreferences.setMockInitialValues({'language': 'en'});
    state = await SharedState.open();
    var clock = 1000;
    await tester.pumpWidget(app(clock: () => clock));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('vocab-start')));
    await tester.pumpAndSettle();

    clock += 1000;
    final shown = tester.widget<Text>(find.byKey(const Key('vocab-word'))).data!;
    final entry = vocab.firstWhere((w) => w['es'] == shown);
    await tester.tap(find.byKey(Key('vocab-option-${entry['en']}')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pumpAndSettle();

    expect(deck.data.keys, contains(deckKeyFor('en', 'es')));
    expect(deck.data.keys, isNot(contains(deckKeyFor('ru', 'es'))));
  });

  testWidgets('выбор языка — одна выпадающая строка, а не сетка кнопок', (tester) async {
    await tester.pumpWidget(app(clock: () => 1000));
    await tester.pumpAndSettle();
    // Замер 17.09.2026 по веб-версии: сетка из 11 кнопок занимала 277 px и
    // уводила экран настроек на полтора экрана вниз (задача a0ae517f).
    expect(find.byKey(const Key('vocab-lang')), findsOneWidget);
    expect(find.byType(DropdownButtonFormField<String>), findsOneWidget);
  });
}
