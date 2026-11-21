import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/vocab_srs/model.dart';
import 'package:psygames_flutter/games/languages/bilingual.dart';
import 'package:psygames_flutter/games/languages/word_bank.dart';
import 'package:psygames_flutter/games/vocab_srs/screen.dart';
import 'package:psygames_flutter/shell/app_theme.dart';
import 'package:psygames_flutter/shell/aurora_scope.dart';
import 'package:psygames_flutter/shell/design_template.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/level_result.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/voice.dart';
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

  Widget app({
    required int Function() clock,
    List<VocabEntry>? words,
    VoiceLayer? voice,
    Brightness? aurora,
    double textScale = 1,
  }) => MaterialApp(
    theme: aurora == null
        ? null
        : applyUiTemplate(classicShellTheme(aurora), UiTemplate.aurora),
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(context)
          .copyWith(textScaler: TextScaler.linear(textScale)),
      child: child!,
    ),
    home: AuroraGameScope(
      route: '/games/vocab-srs',
      child: VocabSrsScreen(
        state: state,
        clock: clock,
        vocabOverride: words ?? vocab,
        storeOverride: deck,
        random: () =>
            0.0, // порядок вариантов закреплён: проба ищет их по подписи
        voice: voice,
      ),
    ),
  );

  Future<void> showSetting(WidgetTester tester, Finder setting) async {
    if (setting.hitTestable().evaluate().isNotEmpty) return;
    await tester.scrollUntilVisible(
      setting.hitTestable(),
      100,
      scrollable: find.descendant(
        of: find.byKey(const Key('vocab-settings-scroll')),
        matching: find.byType(Scrollable),
      ),
    );
    await tester.pumpAndSettle();
  }

  /// Состояние карточки в колоде ПАРЫ. Пара по умолчанию ru→en: для русского
  /// интерфейса веб-версия предлагает английский, и колода лежит под своим ключом.
  CardState? stateOf(String id, {String base = 'ru', String target = 'en'}) {
    final raw = deck.data[deckKeyFor(base, target)];
    if (raw == null) return null;
    final states =
        (jsonDecode(raw) as Map<String, dynamic>)['states']
            as Map<String, dynamic>;
    final s = states[id];
    return s == null
        ? null
        : CardState.fromJson((s as Map).cast<String, dynamic>());
  }

  testWidgets('быстрый верный ответ идёт как easy, медленный — как good', (
    tester,
  ) async {
    var clock = 1000;
    await tester.pumpWidget(app(clock: () => clock));
    await tester.pumpAndSettle();

    // Пять новых слов, лимит оставляем по умолчанию.
    await tester.tap(find.byKey(const Key('vocab-start')));
    await tester.pumpAndSettle();

    // Показано изучаемое слово (узнавание), спрашивается родное.
    // ⚠️ Язык по умолчанию для русского интерфейса — английский (веб-версия:
    // `language === 'en' ? 'es' : 'en'`), поэтому на карточке английское слово.
    final shown = tester
        .widget<Text>(find.byKey(const Key('vocab-word')))
        .data!;
    final entry = vocab.firstWhere((w) => w['en'] == shown);
    expect(find.text('1/5'), findsOneWidget);

    // Быстрый ответ: 1,2 с < 2,5 с → easy → первый интервал 3 дня.
    clock += 1200;
    await tester.tap(find.byKey(Key('vocab-option-${entry['ru']}')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pumpAndSettle();
    expect(
      stateOf('v:${entry['en']}')!.intervalDays,
      3,
      reason: 'быстрый верный → easy',
    );

    // Медленный ответ по второй карточке: 4 с → good → 1 день.
    final shown2 = tester
        .widget<Text>(find.byKey(const Key('vocab-word')))
        .data!;
    final entry2 = vocab.firstWhere((w) => w['en'] == shown2);
    clock += 4000;
    await tester.tap(find.byKey(Key('vocab-option-${entry2['ru']}')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pumpAndSettle();
    expect(
      stateOf('v:${entry2['en']}')!.intervalDays,
      1,
      reason: 'медленный верный → good',
    );

    expect(find.text('2'), findsWidgets); // счётчик «верно» в полосе каркаса
  });

  testWidgets(
    '🔴 ошибка возвращает карточку в ту же партию, а не откладывает на завтра',
    (tester) async {
      var clock = 1000;
      await tester.pumpWidget(app(clock: () => clock));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('vocab-start')));
      await tester.pumpAndSettle();

      expect(find.text('1/5'), findsOneWidget);
      final shown = tester
          .widget<Text>(find.byKey(const Key('vocab-word')))
          .data!;
      final entry = vocab.firstWhere((w) => w['en'] == shown);

      // Жмём ЛЮБОЙ вариант, кроме верного. Искать среди НАРИСОВАННЫХ: вариантов
      // четыре, а слов в словаре пять — один на экран не попал.
      final wrong = vocab.firstWhere(
        (w) =>
            w['ru'] != entry['ru'] &&
            find.byKey(Key('vocab-option-${w['ru']}')).evaluate().isNotEmpty,
      );
      await tester.tap(find.byKey(Key('vocab-option-${wrong['ru']}')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 1200));
      await tester.pumpAndSettle();

      // Карточка сброшена в ноль и вернулась в очередь — партия стала длиннее.
      expect(stateOf('v:${entry['en']}')!.reps, 0);
      expect(stateOf('v:${entry['en']}')!.intervalDays, 0);
      expect(
        find.text('2/6'),
        findsOneWidget,
        reason: 'очередь выросла на одну карточку',
      );
    },
  );

  testWidgets('партия доигрывается до конца и поднимает счётчик подходов', (
    tester,
  ) async {
    var clock = 1000;
    await tester.pumpWidget(app(clock: () => clock));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('vocab-start')));
    await tester.pumpAndSettle();

    for (var i = 0; i < vocab.length; i += 1) {
      final shown = tester
          .widget<Text>(find.byKey(const Key('vocab-word')))
          .data!;
      final entry = vocab.firstWhere((w) => w['en'] == shown);
      clock += 1000;
      await tester.tap(find.byKey(Key('vocab-option-${entry['ru']}')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pumpAndSettle();
    }

    expect(find.text(L.t('levelDone').replaceAll('{n}', '1')), findsOneWidget);
    expect(find.text(L.t('srsAllDone')), findsOneWidget);
    expect(find.textContaining(L.t('srsNextDue')), findsOneWidget);
    expect(find.byKey(const Key('level-result-next')), findsNothing);
    // Счётчик прохождений лежит там же, где его пишет веб-сторона.
    expect(state.get('psygames_vocab_srs_level_nzt48'), '2');

    await tester.tap(find.byKey(const Key('level-result-settings')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('vocab-start')));
    await tester.pumpAndSettle();
    expect(find.text(L.t('srsAllDone')), findsOneWidget);
    expect(find.byKey(const Key('level-result-score')), findsNothing);
    expect(find.byKey(const Key('level-result-next')), findsNothing);
    expect(state.get('psygames_vocab_srs_level_nzt48'), '2');
  });

  for (final (auto, dual) in [(false, false), (true, false), (true, true)]) {
    testWidgets(
      'after 10/10, level 2 starts ${auto ? "automatically" : "on tap"} (bilingual: $dual)',
      (tester) async {
        final previousAuto = LevelResult.autoAdvance;
        LevelResult.autoAdvance = auto;
        addTearDown(() => LevelResult.autoAdvance = previousAuto);
        if (dual) {
          GamePreset.set({'bilingual': '1', 'targetLang': 'en', 'lang2': 'es'});
        }
        final sent = <Map<String, dynamic>>[];
        SessionReport.sink = (raw) async =>
            sent.add(jsonDecode(raw) as Map<String, dynamic>);
        final words = [
          ...vocab,
          for (var i = 6; i <= 12; i++)
            {
              'en': 'word $i',
              'ru': 'слово $i',
              'es': 'palabra $i',
              'cat': 'things',
            },
        ];
        var clock = 1000;
        await tester.pumpWidget(app(clock: () => clock, words: words));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('vocab-start')));
        await tester.pumpAndSettle();
        expect(find.text('1/10'), findsOneWidget);
        for (var i = 0; i < 10; i++) {
          final shown = tester
              .widget<Text>(find.byKey(const Key('vocab-word')))
              .data!;
          final word = words.firstWhere((w) => w['en'] == shown);
          clock += 1000;
          await tester.tap(find.byKey(Key('vocab-option-${word['ru']}')));
          await tester.pump();
          await tester.pump(const Duration(milliseconds: 610));
          await tester.pump();
        }
        expect(
          find.text(L.t('levelDone').replaceAll('{n}', '1')),
          findsOneWidget,
        );
        expect(find.text('${L.t('sdkNextLevel')} · 2'), findsOneWidget);
        expect(sent, hasLength(1));
        expect(sent.single['score'], 10);
        if (auto) {
          await tester.pump(const Duration(milliseconds: 1400));
          expect(find.byKey(const Key('level-result')), findsOneWidget);
          await tester.pump(const Duration(milliseconds: 150));
        } else {
          await tester.tap(find.byKey(const Key('level-result-next')));
          // A second tap racing the first cannot record another result.
          await tester.tap(find.byKey(const Key('level-result-next')));
        }
        await tester.pumpAndSettle();
        expect(find.text('1/2'), findsOneWidget);
        if (dual) {
          expect(find.byKey(const Key('vocab-word-second')), findsOneWidget);
          expect(sent.single['details']['target_lang'], 'en+es');
        }
        expect(find.byKey(const Key('level-result')), findsNothing);
        expect(state.get('psygames_vocab_srs_level_nzt48'), '2');
        expect(sent, hasLength(1));
      },
    );
  }

  testWidgets('🔴 базовый язык берётся у веб-стороны, а не зашит в код', (
    tester,
  ) async {
    // Английский интерфейс: колода обязана собраться на ПАРУ en→es, а не ru→es.
    SharedPreferences.setMockInitialValues({'language': 'en'});
    state = await SharedState.open();
    var clock = 1000;
    await tester.pumpWidget(app(clock: () => clock));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('vocab-start')));
    await tester.pumpAndSettle();

    clock += 1000;
    final shown = tester
        .widget<Text>(find.byKey(const Key('vocab-word')))
        .data!;
    final entry = vocab.firstWhere((w) => w['es'] == shown);
    await tester.tap(find.byKey(Key('vocab-option-${entry['en']}')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pumpAndSettle();

    expect(deck.data.keys, contains(deckKeyFor('en', 'es')));
    expect(deck.data.keys, isNot(contains(deckKeyFor('ru', 'es'))));
  });

  testWidgets('выбор языка — одна выпадающая строка, а не сетка кнопок', (
    tester,
  ) async {
    await tester.pumpWidget(app(clock: () => 1000));
    await tester.pumpAndSettle();
    // Замер 17.09.2026 по веб-версии: сетка из 11 кнопок занимала 277 px и
    // уводила экран настроек на полтора экрана вниз (задача a0ae517f).
    expect(find.byKey(const Key('vocab-lang')), findsOneWidget);
    expect(find.byType(DropdownButtonFormField<String>), findsOneWidget);
  });

  testWidgets(
    '🔴 печать: опечатка не пускает дальше, но в ошибки сессии не идёт',
    (tester) async {
      var clock = 1000;
      await tester.pumpWidget(app(clock: () => clock));
      await tester.pumpAndSettle();

      // Третье направление: ответ печатается целиком.
      await showSetting(tester, find.byKey(const Key('vocab-dir-typing')));
      await tester.tap(find.byKey(const Key('vocab-dir-typing')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('vocab-start')));
      await tester.pumpAndSettle();

      // Показано РОДНОЕ слово, набрать надо изучаемое (пара ru→en).
      final shown = tester
          .widget<Text>(find.byKey(const Key('vocab-word')))
          .data!;
      final entry = vocab.firstWhere((w) => w['ru'] == shown);
      final word = entry['en']!;
      final input = find.byKey(const Key('vocab-typing-input'));
      expect(find.byKey(const Key('vocab-speak-first')), findsNothing);
      expect(find.byKey(const Key('vocab-ipa-first')), findsNothing);
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
      expect(
        stateOf('v:${entry['en']}')!.intervalDays,
        1,
        reason: 'опечатка снимает easy',
      );
      // И в ошибки сессии опечатка НЕ пошла: счётчик ошибок остался нулём.
      expect(find.text('1'), findsWidgets);
      expect(find.byKey(const Key('vocab-checked-word')), findsOneWidget);
      expect(find.byKey(const Key('vocab-speak-first')), findsOneWidget);
      expect(find.byKey(const Key('vocab-ipa-first')), findsOneWidget);
      await tester.tap(find.byKey(const Key('vocab-next-card')));
      await tester.pumpAndSettle();
      expect(find.text('2/5'), findsOneWidget);
      expect(find.byKey(const Key('vocab-speak-first')), findsNothing);
    },
  );

  testWidgets('печать без опечаток идёт как easy', (tester) async {
    var clock = 1000;
    await tester.pumpWidget(app(clock: () => clock));
    await tester.pumpAndSettle();
    await showSetting(tester, find.byKey(const Key('vocab-dir-typing')));
    await tester.tap(find.byKey(const Key('vocab-dir-typing')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('vocab-start')));
    await tester.pumpAndSettle();

    final shown = tester
        .widget<Text>(find.byKey(const Key('vocab-word')))
        .data!;
    final entry = vocab.firstWhere((w) => w['ru'] == shown);
    final input = find.byKey(const Key('vocab-typing-input'));
    for (final ch in entry['en']!.split('')) {
      clock += 100;
      await tester.enterText(input, ch);
      await tester.pump();
    }
    await tester.pump(const Duration(milliseconds: 600));
    await tester.pumpAndSettle();
    expect(
      stateOf('v:${entry['en']}')!.intervalDays,
      3,
      reason: 'чисто и быстро → easy',
    );
  });

  /// Родное слово по показанному: в узнавании на карточке изучаемое (en или es),
  /// ответ — русское, и оно у обоих языков одно.
  Map<String, String> entryByShown(String shown) =>
      vocab.firstWhere((w) => w['en'] == shown || w['es'] == shown);

  Future<void> answerRight(WidgetTester tester, void Function() tick) async {
    final shown = tester
        .widget<Text>(find.byKey(const Key('vocab-word')))
        .data!;
    tick();
    await tester.tap(
      find.byKey(Key('vocab-option-${entryByShown(shown)['ru']}')),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pumpAndSettle();
  }

  testWidgets('🔴 шаг языковой зарядки: два языка одновременно и две колоды', (
    tester,
  ) async {
    GamePreset.set({
      'wu': '1',
      'targetLang': 'en',
      'bilingual': '1',
      'lang2': 'es',
    });
    var clock = 1000;
    await tester.pumpWidget(app(clock: () => clock));
    await tester.pumpAndSettle();

    expect(
      find.byKey(const Key('vocab-start')),
      findsNothing,
      reason: 'автостарт шага зарядки',
    );
    expect(find.text('1/5'), findsOneWidget);

    final shown = tester
        .widget<Text>(find.byKey(const Key('vocab-word')))
        .data!;
    final second = tester
        .widget<Text>(find.byKey(const Key('vocab-word-second')))
        .data!;
    final entry = entryByShown(shown);
    expect(entry['en'], shown);
    expect(entry['es'], second);
    expect(find.byKey(const Key('vocab-lang-first')), findsOneWidget);
    expect(find.byKey(const Key('vocab-lang-second')), findsOneWidget);
    expect(find.text(pairPill('en', ['en', 'es'])), findsOneWidget);

    clock += 1000;
    await answerRight(tester, () {});
    final id = 'v:${entry['en']}';
    expect(stateOf(id, target: 'en'), isNotNull);
    expect(stateOf(id, target: 'es'), isNotNull);
    expect(find.byKey(const Key('vocab-word-second')), findsOneWidget);
  });

  testWidgets(
    '🔴 совмещённая партия шлёт один отчёт без выдуманных переключений',
    (tester) async {
      final sent = <Map<String, dynamic>>[];
      SessionReport.sink = (json) async =>
          sent.add(jsonDecode(json) as Map<String, dynamic>);
      GamePreset.set({
        'auto': '1',
        'targetLang': 'en',
        'bilingual': '1',
        'lang2': 'es',
      });
      var clock = 1000;
      await tester.pumpWidget(app(clock: () => clock));
      await tester.pumpAndSettle();

      for (var i = 0; i < 5; i += 1) {
        await answerRight(tester, () => clock += 1000);
      }
      expect(
        find.text(L.t('levelDone').replaceAll('{n}', '1')),
        findsOneWidget,
      );

      expect(sent, hasLength(1), reason: 'одна партия — один отчёт');
      final r = sent.single;
      expect(r['game_type'], 'vocab_srs');
      expect(r['score'], 5);
      expect(r['errors'], 0);
      expect(r['difficulty'], 'ru→en');
      expect(r['mode'], 'recognize');
      final d = r['details'] as Map<String, dynamic>;
      expect(d['target_lang'], 'en+es');
      expect(d['cards_total'], 5);
      expect(d['new_learned'], 5);
      expect(d['lang_switches'], 0);
      expect(d.containsKey('passed'), isFalse);
    },
  );

  testWidgets('без билингво отчёт одноязычный и без счёта смен', (
    tester,
  ) async {
    final sent = <Map<String, dynamic>>[];
    SessionReport.sink = (json) async =>
        sent.add(jsonDecode(json) as Map<String, dynamic>);
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

  testWidgets('переключатель билингво показывает выбор второго языка', (
    tester,
  ) async {
    await tester.pumpWidget(app(clock: () => 1000));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('vocab-lang2')), findsNothing);
    await tester.tap(find.byKey(const Key('vocab-bilingual')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('vocab-lang2')), findsOneWidget);
  });

  testWidgets('profile keeps both languages, mode and limit without starting', (
    tester,
  ) async {
    const key = 'device_vocab_srs_settings_nzt48';
    final prefs = await SharedPreferences.getInstance();
    final words = [
      for (final item in vocab) {...item, 'de': item['en']!.toUpperCase()},
    ];
    Future<void> open() async {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpWidget(app(clock: () => 1000, words: words));
      await tester.pumpAndSettle();
    }

    bool bilingual() => tester
        .widget<SwitchListTile>(find.byKey(const Key('vocab-bilingual')))
        .value;
    bool selected(String id) =>
        tester.widget<ChoiceChip>(find.byKey(Key(id))).selected;
    String? selectedLang(String field) => tester
        .widget<DropdownButtonFormField<String>>(
          find.descendant(
            of: find.byKey(Key(field)),
            matching: find.byType(DropdownButtonFormField<String>),
          ),
        )
        .initialValue;
    Future<void> pick(String field, String lang) async {
      await tester.tap(find.byKey(Key(field)));
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(Key('$field-$lang')).last,
        warnIfMissed: false,
      );
      await tester.pumpAndSettle();
    }

    await open();
    await pick('vocab-lang', 'es');
    await tester.tap(find.byKey(const Key('vocab-bilingual')));
    await tester.pumpAndSettle();
    await pick('vocab-lang2', 'de');
    await showSetting(tester, find.byKey(const Key('vocab-limit-20')));
    await tester.tap(find.byKey(const Key('vocab-limit-20')));
    await showSetting(tester, find.byKey(const Key('vocab-dir-recall')));
    await tester.tap(find.byKey(const Key('vocab-dir-recall')));
    await tester.pumpAndSettle();
    final persisted = prefs.getString(key);
    expect(persisted, isNotNull);
    expect(
      state.snapshot().containsKey(key),
      isFalse,
      reason: 'no cloud or WebView snapshot change',
    );
    expect(deck.data, isEmpty);

    await prefs.reload();
    await open();
    expect(bilingual(), isTrue);
    expect(selectedLang('vocab-lang'), 'es');
    expect(selectedLang('vocab-lang2'), 'de');
    await showSetting(tester, find.byKey(const Key('vocab-limit-20')));
    expect(selected('vocab-limit-20'), isTrue);
    await showSetting(tester, find.byKey(const Key('vocab-dir-recall')));
    expect(selected('vocab-dir-recall'), isTrue);

    GamePreset.set({
      'wu': '1',
      'targetLang': 'en',
      'lang2': 'es',
      'newLimit': '5',
      'bilingual': '1',
    });
    await open();
    expect(find.byKey(const Key('vocab-word-second')), findsOneWidget);
    expect(find.text('1/5'), findsOneWidget);
    expect(prefs.getString(key), persisted);

    // A playlist may explicitly turn bilingual off for one round.
    // Reopening from the catalog must still restore the user's on setting.
    GamePreset.set({'wu': '1', 'targetLang': 'en', 'bilingual': '0'});
    await open();
    expect(find.byKey(const Key('vocab-word')), findsOneWidget);
    expect(find.byKey(const Key('vocab-word-second')), findsNothing);
    expect(prefs.getString(key), persisted);

    GamePreset.clear();
    await open();
    expect(bilingual(), isTrue);
    expect(selectedLang('vocab-lang'), 'es');
    expect(selectedLang('vocab-lang2'), 'de');

    await tester.tap(find.byKey(const Key('vocab-bilingual')));
    await tester.pumpAndSettle();
    await open();
    expect(bilingual(), isFalse);
    await tester.tap(find.byKey(const Key('vocab-bilingual')));
    await tester.pumpAndSettle();
    expect(
      selectedLang('vocab-lang2'),
      'de',
      reason: 'keeps the second language while off',
    );

    await state.set('psygames_active_profile', 'free');
    await open();
    expect(bilingual(), isFalse);
    expect(selectedLang('vocab-lang'), 'en');
    await showSetting(tester, find.byKey(const Key('vocab-limit-10')));
    expect(selected('vocab-limit-10'), isTrue);
    await showSetting(tester, find.byKey(const Key('vocab-dir-recognize')));
    expect(selected('vocab-dir-recognize'), isTrue);
  });

  testWidgets(
    'bilingual sound is routed by word language; IPA remains without sound',
    (tester) async {
      final backend = _VoiceProbe();
      var sound = true;
      final voice = VoiceLayer(backend: backend, soundOn: () => sound);
      GamePreset.set({
        'auto': '1',
        'targetLang': 'en',
        'lang2': 'es',
        'bilingual': '1',
      });
      await tester.pumpWidget(app(clock: () => 1000, voice: voice));
      await tester.pumpAndSettle();
      final en = tester.widget<Text>(find.byKey(const Key('vocab-word'))).data!;
      final es = tester
          .widget<Text>(find.byKey(const Key('vocab-word-second')))
          .data!;
      final speakEn = find.byKey(const Key('vocab-speak-first'));
      final speakEs = find.byKey(const Key('vocab-speak-second'));
      expect(find.byKey(const Key('vocab-ipa-first')), findsOneWidget);
      expect(find.byKey(const Key('vocab-ipa-second')), findsOneWidget);
      await tester.tap(speakEn);
      await tester.pumpAndSettle();
      await tester.tap(speakEs);
      await tester.pumpAndSettle();
      expect(backend.words, [(en, 'en-US'), (es, 'es-ES')]);

      backend.available = false;
      await tester.tap(speakEs);
      await tester.pumpAndSettle();
      expect(find.text(L.t('srsPronunciationUnavailable')), findsOneWidget);
      expect(find.byKey(const Key('vocab-ipa-second')), findsOneWidget);
      sound = false;
      await tester.tap(speakEn);
      await tester.pumpAndSettle();
      expect(
        backend.words,
        hasLength(2),
        reason: 'no wrong-language system fallback',
      );
      expect(find.text(L.t('voiceSoundOff')), findsOneWidget);
      await answerRight(tester, () {});
      expect(find.text('2/5'), findsOneWidget);
      expect(find.text(L.t('voiceSoundOff')), findsNothing);
      expect(backend.cancels, 0, reason: 'completed audio needs no stop');
    },
  );

  testWidgets(
    'real shared bank brings the new cards to bilingual recognition',
    (tester) async {
      GamePreset.set({'targetLang': 'en', 'lang2': 'es', 'bilingual': '1'});
      await tester.pumpWidget(
        MaterialApp(
          home: VocabSrsScreen(
            state: state,
            clock: () => 1000,
            storeOverride: deck,
            random: () => 0.0,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('/927'), findsOneWidget);
      await tester.tap(find.byKey(const Key('vocab-start')));
      await tester.pumpAndSettle();
      final bank = (await tester.runAsync(loadWordBank))!;
      final mix = bank.forLanguages({'ru', 'en', 'es'}, interleave: true);
      for (final row in mix.take(4)) {
        final english = row['en']!;
        expect(find.text(english), findsOneWidget);
        expect(find.text(row['es']!), findsOneWidget);
        await tester.tap(find.byKey(Key("vocab-option-${row['ru']}")));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 610));
        await tester.pumpAndSettle();
        expect(stateOf('v:$english')?.reps, 1);
        expect(stateOf('v:$english', target: 'es')?.reps, 1);
      }
    },
  );

  for (final brightness in Brightness.values) {
    testWidgets(
      'Aurora $brightness: SRS Start is round, fixed and removed in play',
      (tester) async {
        tester.view.physicalSize = const Size(640, 1136);
        tester.view.devicePixelRatio = 2;
        addTearDown(tester.view.reset);
        await tester.pumpWidget(
          app(clock: () => 1000, aurora: brightness, textScale: 2),
        );
        await tester.pumpAndSettle();
        final start = find.byKey(const Key('vocab-start'));
        final face = find.byKey(const Key('game-start-face'));
        final pause = find.byKey(const Key('game-pause'));
        final bilingual = find.byKey(const Key('vocab-bilingual'));
        final bar = find.byKey(const Key('game-bar-aurora'));
        final faceRect = tester.getRect(face);
        expect(faceRect.width, closeTo(faceRect.height, 0.1));
        expect(faceRect.width, inInclusiveRange(48.0, 54.0));
        expect(faceRect.center.dx, greaterThan(tester.getCenter(pause).dx));
        expect(tester.getCenter(pause).dy, closeTo(faceRect.center.dy, 1));
        expect(
          find.descendant(of: bar, matching: find.text(L.t('start'))),
          findsOneWidget,
        );
        await showSetting(tester, bilingual);
        await tester.tap(bilingual);
        await tester.pumpAndSettle();
        await showSetting(tester, find.byKey(const Key('vocab-dir-typing')));
        await tester.pumpAndSettle();
        expect(
          tester.getRect(face),
          faceRect,
          reason: 'Start is outside the scrollable settings',
        );
        expect(tester.takeException(), isNull);
        expect(start.hitTestable(), findsOneWidget);
        await tester.tap(face);
        await tester.pumpAndSettle();
        expect(start, findsNothing);
        expect(pause.hitTestable(), findsOneWidget);
        expect(find.byKey(const Key('vocab-word-second')), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets(
    'autoplay remembers one or both languages, stays quiet in workouts',
    (tester) async {
      final backend = _VoiceProbe();
      final voice = VoiceLayer(backend: backend, soundOn: () => true);
      Future<void> reopen() async {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pumpWidget(app(clock: () => 1000, voice: voice));
        await tester.pumpAndSettle();
      }

      Future<void> tap(String key) async {
        final control = find.byKey(Key(key));
        await tester.ensureVisible(control);
        await tester.tap(control);
        await tester.pumpAndSettle();
      }

      String word(String key) =>
          tester.widget<Text>(find.byKey(Key(key))).data!;
      await reopen();
      expect(
        tester
            .widget<SwitchListTile>(
              find.byKey(const Key('vocab-auto-pronounce')),
            )
            .value,
        isFalse,
      );
      await tap('vocab-bilingual');
      await tap('vocab-auto-pronounce');
      await reopen();
      expect(
        tester
            .widget<ChoiceChip>(
              find.byKey(const Key('vocab-pronounce-primary')),
            )
            .selected,
        isTrue,
      );
      await tap('vocab-start');
      expect(backend.words, [(word('vocab-word'), 'en-US')]);

      await reopen();
      await tap('vocab-pronounce-both');
      await reopen();
      expect(
        tester
            .widget<ChoiceChip>(find.byKey(const Key('vocab-pronounce-both')))
            .selected,
        isTrue,
      );
      backend.words.clear();
      await tap('vocab-start');
      expect(backend.words, [
        (word('vocab-word'), 'en-US'),
        (word('vocab-word-second'), 'es-ES'),
      ]);
      for (var i = 1; i < 4; i++) {
        await answerRight(tester, () {});
        expect(backend.words.skip(2 * i), [
          (word('vocab-word'), 'en-US'),
          (word('vocab-word-second'), 'es-ES'),
        ]);
      }

      backend.words.clear();
      GamePreset.set({'wu': '1', 'quiet': '1', 'bilingual': '1'});
      await reopen();
      expect(find.byKey(const Key('vocab-start')), findsNothing);
      expect(find.byKey(const Key('vocab-word-second')), findsOneWidget);
      expect(backend.words, isEmpty);
      GamePreset.clear();
      await reopen();
      expect(
        tester
            .widget<ChoiceChip>(find.byKey(const Key('vocab-pronounce-both')))
            .selected,
        isTrue,
      );
    },
  );

  testWidgets('recall reveals pronunciation only after grading', (
    tester,
  ) async {
    final backend = _VoiceProbe();
    await tester.pumpWidget(
      app(
        clock: () => 1000,
        voice: VoiceLayer(backend: backend, soundOn: () => true),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('vocab-auto-pronounce')));
    await tester.pumpAndSettle();
    await showSetting(tester, find.byKey(const Key('vocab-dir-recall')));
    await tester.tap(find.byKey(const Key('vocab-dir-recall')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('vocab-start')));
    await tester.pumpAndSettle();
    final shown = tester
        .widget<Text>(find.byKey(const Key('vocab-word')))
        .data!;
    final word = vocab.firstWhere((w) => w['ru'] == shown)['en']!;
    expect(find.byKey(const Key('vocab-speak-first')), findsNothing);
    expect(find.byKey(const Key('vocab-ipa-first')), findsNothing);
    expect(backend.words, isEmpty);
    await tester.tap(find.byKey(Key('vocab-option-$word')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 610));
    await tester.pumpAndSettle();
    expect(
      tester.widget<Text>(find.byKey(const Key('vocab-checked-word'))).data,
      word,
    );
    expect(find.byKey(const Key('vocab-speak-first')), findsOneWidget);
    expect(backend.words, [(word, 'en-US')]);
    await tester.tap(find.byKey(const Key('vocab-next-card')));
    await tester.pumpAndSettle();
    expect(find.text('2/5'), findsOneWidget);
    expect(find.byKey(const Key('vocab-speak-first')), findsNothing);
    expect(backend.words, [
      (word, 'en-US'),
    ], reason: 'The next hidden answer is not read.');
  });

  testWidgets(
    '🔴 разбор открывается ДО партии и показывает слово из колоды этой пары',
    (tester) async {
      final backend = _VoiceProbe();
      await tester.pumpWidget(app(
        clock: () => 1000,
        voice: VoiceLayer(backend: backend, soundOn: () => true),
      ));
      await tester.pumpAndSettle();
      // Партия не начата — кнопка разбора уже есть.
      expect(find.byKey(const Key('vocab-start')), findsOneWidget);
      await tester.tap(find.byKey(const Key('game-lesson')));
      await tester.pumpAndSettle();
      // Пример — первое слово словаря для пары ru→en, а не выдуманное: house → дом.
      expect(find.text('house'), findsWidgets);
      expect(find.textContaining('дом'), findsWidgets);
      final listen = find.byKey(const Key('demo-listen'));
      expect(backend.words, isEmpty, reason: 'help does not play automatically');
      await tester.tap(listen);
      await tester.pumpAndSettle();
      expect(backend.words, [('house', 'en-US')]);
      backend.available = false;
      await tester.tap(listen);
      await tester.pumpAndSettle();
      expect(find.text(L.t('srsPronunciationUnavailable')), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}

class _VoiceProbe implements VoiceBackend {
  bool available = true;
  int cancels = 0;
  final words = <(String, String)>[];

  @override
  Future<bool> playUrl(String url, double rate) async => false;

  @override
  Future<bool> speakSystem(String text, String bcp47, double rate) async {
    words.add((text, bcp47));
    return available;
  }

  @override
  Future<bool> hasSystemVoice(String bcp47) async => available;

  @override
  Future<void> cancel() async {
    cancels++;
  }
}
