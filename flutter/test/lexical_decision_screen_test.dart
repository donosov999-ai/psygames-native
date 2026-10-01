import 'dart:convert';
import 'dart:io';
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
    {'en': 'house', 'es': 'casa', 'fr': 'maison', 'ru': 'дом'},
    {'en': 'water', 'es': 'agua', 'fr': 'eau', 'ru': 'вода'},
    {'en': 'bread', 'es': 'pan', 'fr': 'pain', 'ru': 'хлеб'},
    {'en': 'mother', 'es': 'madre', 'fr': 'mère', 'ru': 'мама'},
    {'en': 'garden', 'es': 'jardín', 'fr': 'jardin', 'ru': 'сад'},
    {'en': 'window', 'es': 'ventana', 'fr': 'fenêtre', 'ru': 'окно'},
    {'en': 'winter', 'es': 'invierno', 'fr': 'hiver', 'ru': 'зима'},
    {'en': 'river', 'es': 'río', 'fr': 'rivière', 'ru': 'река'},
    {'en': 'summer', 'es': 'verano', 'fr': 'été', 'ru': 'лето'},
    {'en': 'forest', 'es': 'bosque', 'fr': 'forêt', 'ru': 'лес'},
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

  testWidgets('в выборе — только языки с псевдословами, и свой среди них', (tester) async {
    await boot(tester, () => 1000);
    // Выбор — выпадающей строкой: состав пунктов виден в открытом списке.
    await tester.tap(find.byKey(const Key('ld-lang')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byKey(const Key('ld-lang-en')), findsWidgets);
    expect(find.byKey(const Key('ld-lang-es')), findsWidgets);
    expect(find.byKey(const Key('ld-lang-fr')), findsNothing, reason: 'у французского генератора нет');
    expect(find.byKey(const Key('ld-lang-ru')), findsWidgets, reason: 'родной язык — тоже язык задания (d0ad03d9)');
    expect(find.byKey(const Key('ld-level-params')), findsOneWidget);
  });

  testWidgets('🔴 русскоязычный выбирает «Русский» — партия идёт по-русски, без подмены на en/es', (tester) async {
    final sent = <Map<String, dynamic>>[];
    SessionReport.sink = (j) async => sent.add(jsonDecode(j) as Map<String, dynamic>);
    var now = 1000;
    await boot(tester, () => now);
    await tester.tap(find.byKey(const Key('ld-lang')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.byKey(const Key('ld-lang-ru')).last);
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.byKey(const Key('ld-start')));
    await tester.pump();
    final total = ldLevelParams(1).trials;
    final cyrillic = RegExp('^[а-яё]+\$');
    for (var i = 0; i < total; i += 1) {
      now += 700;
      final w = shown(tester);
      expect(cyrillic.hasMatch(w), isTrue, reason: 'проба ${i + 1} «$w» — не русская');
      await tester.tap(find.byKey(Key(isReal(w) ? 'ld-yes' : 'ld-no')));
      await tester.pump(const Duration(milliseconds: 400));
    }
    await tester.pump(const Duration(milliseconds: 100));
    expect(sent.single['difficulty'], 'ru · $total');
  });

  testWidgets('разбор до партии — настоящее слово и псевдослово языка', (tester) async {
    await boot(tester, () => 1000);
    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pumpAndSettle();
    expect(find.text('house'), findsWidgets, reason: 'первое слово словаря');
  });

  // ── «По норме?» (d0ad03d9). Верный ответ — из ДАННЫХ (`assets/vocab/nonstandard-forms.json`),
  // а не из модели экрана: показанный текст — норма, если он есть среди норм языка.
  final ns = nsFormsFromJson(jsonDecode(File('assets/vocab/nonstandard-forms.json').readAsStringSync()) as Map);
  Set<String> norms(String lang) => {for (final x in ns[lang]!) x.norm};
  Set<String> forms(String lang) => {for (final x in ns[lang]!) x.form};

  Future<void> pickTarget(WidgetTester tester, String lang) async {
    await tester.tap(find.byKey(const Key('ld-lang')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.byKey(Key('ld-lang-$lang')).last);
    await tester.pump(const Duration(milliseconds: 400));
  }

  /// Партия «По норме?» целиком: [wrongOn] — номер пробы, где ответить неверно (разбор на ошибке).
  Future<List<String>> playNorm(WidgetTester tester, String lang, int Function() tick, {int wrongOn = -1}) async {
    final shownTexts = <String>[];
    final total = ldLevelParams(1).trials;
    for (var i = 0; i < total; i += 1) {
      tick();
      final w = shown(tester);
      shownTexts.add(w);
      final isNorm = norms(lang).contains(w);
      expect(isNorm || forms(lang).contains(w), isTrue, reason: 'проба ${i + 1} «$w» — не из данных $lang');
      final say = i == wrongOn ? !isNorm : isNorm;
      await tester.tap(find.byKey(Key(say ? 'ld-yes' : 'ld-no')));
      await tester.pump();
      if (i == wrongOn) {
        final pair = ns[lang]!.firstWhere((x) => x.form == w || x.norm == w);
        expect(find.byKey(const Key('ld-norm-why')), findsOneWidget, reason: 'на ошибке — как по норме');
        final why = tester.widget<Text>(find.byKey(const Key('ld-norm-why'))).data!;
        expect(why, contains(isNorm ? pair.form : pair.norm));
        final rule = tester.widget<Text>(find.byKey(const Key('ld-norm-rule'))).data!;
        expect(rule, isNot(startsWith('nsRule_')), reason: 'правило словом, а не ключом');
        expect(rule, isNotEmpty);
        await tester.pump(const Duration(milliseconds: 2500));
      } else {
        await tester.pump(const Duration(milliseconds: 1000));
      }
    }
    await tester.pump(const Duration(milliseconds: 100));
    return shownTexts;
  }

  testWidgets('🔴 англоязычный игрок: English + «По норме?» — английские ненормативные формы, разбор на ошибке',
      (tester) async {
    await tester.runAsync(() async {
      SharedPreferences.setMockInitialValues({'language': 'en', 'psygames_active_profile': 'nzt48'});
      state = await SharedState.open();
      await L.load('en');
    });
    final sent = <Map<String, dynamic>>[];
    SessionReport.sink = (j) async => sent.add(jsonDecode(j) as Map<String, dynamic>);
    var now = 1000;
    await boot(tester, () => now);
    await pickTarget(tester, 'en');
    expect(find.byKey(const Key('ld-mode-norm')), findsOneWidget, reason: 'у английского данные есть');
    await tester.tap(find.byKey(const Key('ld-mode-norm')));
    await tester.pump();
    expect(find.byKey(const Key('ld-mode-norm-desc')), findsOneWidget);
    expect(find.byKey(const Key('ld-bilingual')), findsNothing, reason: 'норма у каждого языка своя');
    await tester.tap(find.byKey(const Key('ld-start')));
    await tester.pump();
    expect(find.text(L.t('ldNormBtn')), findsOneWidget);
    expect(find.text(L.t('ldNotNormBtn')), findsOneWidget);
    final texts = await playNorm(tester, 'en', () => now += 700, wrongOn: 0);
    final total = ldLevelParams(1).trials;
    expect(texts.where((w) => forms('en').contains(w)), hasLength(total ~/ 2), reason: 'половина — ненормативные');
    expect(sent.single['game_type'], 'lexical_decision');
    expect(sent.single['mode'], 'norm1');
    expect(sent.single['difficulty'], 'en · $total');
    expect((sent.single['details'] as Map)['kind'], 'norm');
  });

  testWidgets('🔴 русскоязычный: «Русский» + «По норме?» — русские формы; всё верно — своя лестница выросла',
      (tester) async {
    var now = 1000;
    await boot(tester, () => now);
    await pickTarget(tester, 'ru');
    await tester.tap(find.byKey(const Key('ld-mode-norm')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('ld-start')));
    await tester.pump();
    final texts = await playNorm(tester, 'ru', () => now += 700);
    expect(texts.any((w) => forms('ru').contains(w)), isTrue);
    expect(state.get(SharedState.levelKey('lexical_decision_norm', 'nzt48')), '2', reason: 'лестница «По норме?»');
    expect(state.get(SharedState.levelKey('lexical_decision', 'nzt48')), isNot('2'), reason: 'классическая не тронута');
  });

  testWidgets('у языка без данных режима «По норме?» нет', (tester) async {
    await boot(tester, () => 1000);
    await pickTarget(tester, 'es');
    expect(find.byKey(const Key('ld-mode-norm')), findsNothing);
    expect(find.byKey(const Key('ld-bilingual')), findsOneWidget);
  });

  test('каждое правило данных — в списке ключей словаря (иначе на экране сырой ключ)', () {
    final rules = {for (final l in ns.values) for (final x in l) x.rule};
    expect([for (final r in rules) if (ldNsRuleKey(r) == null) r], isEmpty);
    for (final k in [...ldNsRuleKeys, ...ldNormTierKeys]) {
      expect(L.t(k), isNot(k), reason: 'ключ $k нет в словаре приложения');
    }
  });

  testWidgets('разбор до партии в режиме «По норме?» — ненормативная форма с нормой, потом сама норма', (tester) async {
    await boot(tester, () => 1000);
    await pickTarget(tester, 'ru');
    await tester.tap(find.byKey(const Key('ld-mode-norm')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    final first = ns['ru']!.firstWhere((x) => x.tier == 1);
    expect(find.text(first.form), findsWidgets, reason: 'первая карточка — ненормативная форма');
    expect(find.textContaining(first.norm), findsWidgets, reason: 'и её норма');
  });
}
