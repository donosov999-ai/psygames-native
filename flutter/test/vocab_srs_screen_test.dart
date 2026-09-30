import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/vocab_srs/model.dart';
import 'package:psygames_flutter/games/languages/bilingual.dart';
import 'package:psygames_flutter/games/vocab_srs/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/session_report.dart';
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

  tearDown(() {
    // Пресет и приёмник отчёта — СТАТИЧЕСКИЕ, как в приложении. Не снять — следующая
    // проба стартовала бы шагом зарядки и слала отчёты в чужой список.
    GamePreset.clear();
    SessionReport.sink = null;
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

  testWidgets('🔴 печать: опечатка не пускает дальше, но в ошибки сессии не идёт', (tester) async {
    var clock = 1000;
    await tester.pumpWidget(app(clock: () => clock));
    await tester.pumpAndSettle();

    // Третье направление: ответ печатается целиком.
    await tester.tap(find.byKey(const Key('vocab-dir-typing')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('vocab-start')));
    await tester.pumpAndSettle();

    // Показано РОДНОЕ слово, набрать надо изучаемое (пара ru→en).
    final shown = tester.widget<Text>(find.byKey(const Key('vocab-word'))).data!;
    final entry = vocab.firstWhere((w) => w['ru'] == shown);
    final word = entry['en']!;
    final input = find.byKey(const Key('vocab-typing-input'));
    expect(input, findsOneWidget, reason: 'поле набора вместо вариантов');
    expect(find.byKey(Key('vocab-option-${entry['ru']}')), findsNothing);

    // Опечатка на первом же символе: курсор обязан СТОЯТЬ.
    await tester.enterText(input, 'ы');
    await tester.pump();
    expect(find.byKey(const Key('vocab-char-0')), findsOneWidget);

    // Дальше набираем слово целиком.
    for (final ch in word.split('')) {
      clock += 200;
      await tester.enterText(input, ch);
      await tester.pump();
    }
    await tester.pump(const Duration(milliseconds: 600));
    await tester.pumpAndSettle();

    // Слово набрано → ответ верный, карточка оценена. Опечатка была, значит
    // «good» (интервал 1 день), а не «easy» (3 дня).
    expect(stateOf('v:${entry['en']}')!.intervalDays, 1, reason: 'опечатка снимает easy');
    // И в ошибки сессии опечатка НЕ пошла: счётчик ошибок остался нулём.
    expect(find.text('1'), findsWidgets);
  });

  testWidgets('печать без опечаток идёт как easy', (tester) async {
    var clock = 1000;
    await tester.pumpWidget(app(clock: () => clock));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('vocab-dir-typing')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('vocab-start')));
    await tester.pumpAndSettle();

    final shown = tester.widget<Text>(find.byKey(const Key('vocab-word'))).data!;
    final entry = vocab.firstWhere((w) => w['ru'] == shown);
    final input = find.byKey(const Key('vocab-typing-input'));
    for (final ch in entry['en']!.split('')) {
      clock += 100;
      await tester.enterText(input, ch);
      await tester.pump();
    }
    await tester.pump(const Duration(milliseconds: 600));
    await tester.pumpAndSettle();
    expect(stateOf('v:${entry['en']}')!.intervalDays, 3, reason: 'чисто и быстро → easy');
  });

  /// Родное слово по показанному: в узнавании на карточке изучаемое (en или es),
  /// ответ — русское, и оно у обоих языков одно.
  Map<String, String> entryByShown(String shown) =>
      vocab.firstWhere((w) => w['en'] == shown || w['es'] == shown);

  Future<void> answerRight(WidgetTester tester, void Function() tick) async {
    final shown = tester.widget<Text>(find.byKey(const Key('vocab-word'))).data!;
    tick();
    await tester.tap(find.byKey(Key('vocab-option-${entryByShown(shown)['ru']}')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pumpAndSettle();
  }

  testWidgets('🔴 шаг языковой зарядки: стартует сам, с парой из адреса и двумя колодами', (tester) async {
    // Ровно то, что шлёт языковая зарядка: шаг серии, цель и второй язык.
    GamePreset.set({'wu': '1', 'targetLang': 'en', 'bilingual': '1', 'lang2': 'es'});
    var clock = 1000;
    await tester.pumpWidget(app(clock: () => clock));
    await tester.pumpAndSettle();

    // Без нажатия «Начать» — сразу партия, и в ней ОБА языка: 5 + 5 карточек.
    expect(find.byKey(const Key('vocab-start')), findsNothing, reason: 'автостарт шага зарядки');
    expect(find.text('1/10'), findsOneWidget);

    // Первая карточка по ряду — английская, пилюля показывает пару.
    final shown = tester.widget<Text>(find.byKey(const Key('vocab-word'))).data!;
    expect(vocab.any((w) => w['en'] == shown), isTrue, reason: 'ряд начинается с первого языка');
    expect(find.text(pairPill('en', ['en', 'es'])), findsOneWidget);

    // Оценка уходит в колоду СВОЕГО языка, вторую не трогает.
    clock += 1000;
    await answerRight(tester, () {});
    final id = 'v:${entryByShown(shown)['en']}';
    expect(stateOf(id, target: 'en'), isNotNull, reason: 'оценка в колоде ru→en');
    expect(stateOf(id, target: 'es'), isNull, reason: 'колода ru→es не тронута');

    // Вторая карточка по узору en, es, en, en, es, es — испанская.
    final second = tester.widget<Text>(find.byKey(const Key('vocab-word'))).data!;
    expect(vocab.any((w) => w['es'] == second), isTrue, reason: 'второй шаг ряда — второй язык');
  });

  testWidgets('🔴 партия доезжает до веб-половины: отчёт с парой и числом настоящих смен', (tester) async {
    final sent = <Map<String, dynamic>>[];
    SessionReport.sink = (json) async => sent.add(jsonDecode(json) as Map<String, dynamic>);
    GamePreset.set({'auto': '1', 'targetLang': 'en', 'bilingual': '1', 'lang2': 'es'});
    var clock = 1000;
    await tester.pumpWidget(app(clock: () => clock));
    await tester.pumpAndSettle();

    for (var i = 0; i < 10; i += 1) {
      await answerRight(tester, () => clock += 1000);
    }
    expect(find.text(L.t('resultsTitle')), findsOneWidget);

    expect(sent, hasLength(1), reason: 'одна партия — один отчёт');
    final r = sent.single;
    expect(r['game_type'], 'vocab_srs', reason: 'имя совпадает с веб-версией — иначе партия уйдёт не под той игрой');
    expect(r['score'], 10);
    expect(r['errors'], 0);
    expect(r['difficulty'], 'ru→en');
    expect(r['mode'], 'recognize');
    final d = r['details'] as Map<String, dynamic>;
    expect(d['target_lang'], 'en+es');
    expect(d['cards_total'], 10);
    // По id карточки, как у веба: одно слово в двух колодах — одно новое.
    expect(d['new_learned'], 5);
    // Смены — ПО ФАКТУ раскладки, а не по включённому флагу.
    final expected = spreadByRow(
      {'en': List.generate(5, (i) => i), 'es': List.generate(5, (i) => i)}, 10, ['en', 'es']).switches;
    expect(d['lang_switches'], expected);
    expect(d.containsKey('passed'), isFalse, reason: 'провала у подхода нет — поле не пишем, как веб');
  });

  testWidgets('без билингво отчёт одноязычный и без счёта смен', (tester) async {
    final sent = <Map<String, dynamic>>[];
    SessionReport.sink = (json) async => sent.add(jsonDecode(json) as Map<String, dynamic>);
    var clock = 1000;
    await tester.pumpWidget(app(clock: () => clock));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('vocab-start')));
    await tester.pumpAndSettle();
    for (var i = 0; i < 5; i += 1) {
      await answerRight(tester, () => clock += 1000);
    }
    final d = sent.single['details'] as Map<String, dynamic>;
    expect(d['target_lang'], 'en');
    expect(d.containsKey('lang_switches'), isFalse);
  });

  testWidgets('переключатель билингво показывает выбор второго языка', (tester) async {
    await tester.pumpWidget(app(clock: () => 1000));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('vocab-lang2')), findsNothing);
    await tester.tap(find.byKey(const Key('vocab-bilingual')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('vocab-lang2')), findsOneWidget);
  });

  testWidgets('🔴 разбор открывается ДО партии и показывает слово из колоды этой пары', (tester) async {
    await tester.pumpWidget(app(clock: () => 1000));
    await tester.pumpAndSettle();
    // Партия не начата — кнопка разбора уже есть.
    expect(find.byKey(const Key('vocab-start')), findsOneWidget);
    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pumpAndSettle();
    // Пример — первое слово словаря для пары ru→en, а не выдуманное: house → дом.
    expect(find.text('house'), findsWidgets);
    expect(find.textContaining('дом'), findsWidgets);
  });
}
