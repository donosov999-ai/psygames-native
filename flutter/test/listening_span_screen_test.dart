import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/listening_span/model.dart';
import 'package:psygames_flutter/games/listening_span/screen.dart';
import 'package:psygames_flutter/shell/demo_lesson.dart';
import 'package:psygames_flutter/shell/game_clock.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/level_rules.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/voice.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Голос для проб: записывает, ЧТО и на каком языке сказано, и умеет «не иметь голоса».
class _FakeVoice implements VoiceBackend {
  _FakeVoice({required this.system});
  final bool system;
  final spoken = <String>[];
  final langs = <String>[];

  @override
  Future<bool> playUrl(String url, double rate) async => false;

  @override
  Future<bool> speakSystem(String text, String bcp47, double rate) async {
    if (!system) return false;
    spoken.add(text);
    langs.add(bcp47);
    return true;
  }

  @override
  Future<bool> hasSystemVoice(String bcp47) async => system;

  @override
  Future<void> cancel() async {}
}

/// 🔴 «ОБЪЁМ НА СЛУХ» ИГРАЕТСЯ НА СЛУХ И НАЖАТИЯМИ.
///
/// Что прозвучало — проба узнаёт у голоса, как человек ушами; подсмотреть ряд в модели
/// значило бы пройти пробу и при немом экране. Слова нажимаются по ТЕКСТУ на сетке ввода.
/// Отчёт партии перехватывается: проверяются метки, details и длительность в секундах.
void main() {
  late SharedState state;
  late _FakeVoice backend;

  /// Сколько слов прозвучало к концу прошлого раунда: первое слово раунда звучит в тот же
  /// кадр, что и старт, — раньше, чем проба начала бы слушать.
  var heardBefore = 0;
  final sent = <Map<String, dynamic>>[];
  final vocab = [
    for (final e in jsonDecode(File('assets/vocab/translation-vocab.json').readAsStringSync()) as List)
      (e as Map).cast<String, Object?>(),
  ];
  final names = ((jsonDecode(File('assets/vocab/lang-names.json').readAsStringSync()) as Map)['languages'] as Map)
      .cast<String, String>();

  setUpAll(() async {
    await L.load('ru');
    await LevelRules.load();
  });

  Future<void> boot(
    WidgetTester tester, {
    int level = 1,
    bool voice = true,
    bool rulesSeen = true,
    Map<String, String>? preset,
    String? savedTarget,
  }) async {
    gameWallMs = () => tester.binding.clock.now().millisecondsSinceEpoch;
    SharedPreferences.setMockInitialValues({
      'psygames_listening_span_level_nzt48': '$level',
      if (rulesSeen) LevelRules.seenKey('listening_span', 'span8'): '1',
      if (rulesSeen) LevelRules.seenKey('listening_span', 'similar'): '1',
      lspanTargetLangKey: ?savedTarget,
    });
    state = await SharedState.open();
    sent.clear();
    SessionReport.sink = (json) async => sent.add(jsonDecode(json) as Map<String, dynamic>);
    if (preset != null) GamePreset.set(preset);
    backend = _FakeVoice(system: voice);
    heardBefore = 0;
    final layer = VoiceLayer(backend: backend, soundOn: () => true);
    // Поток на ЦЕЛОМ состоянии: на дроби он сходится к ≈0,22 и выдаёт почти одно и то же (01.10.2026).
    var st = 4242;
    double rng() {
      st = (st * 9301 + 49297) % 233280;
      return st / 233280;
    }
    await tester.pumpWidget(MaterialApp(
      home: ListeningSpanScreen(key: UniqueKey(), state: state, voice: layer, vocab: vocab, langNames: names, rng: rng),
    ));
    for (var i = 0; i < 5; i++) {
      await tester.pump();
    }
  }

  tearDown(() {
    gameWallMs = () => DateTime.now().millisecondsSinceEpoch;
    GamePreset.clear();
    SessionReport.sink = null;
  });

  bool hud(WidgetTester tester, String label, String value) => find
      .byWidgetPredicate((w) => w is Semantics && w.properties.label == '$label: $value')
      .evaluate()
      .isNotEmpty;

  final grid = find.byKey(const Key('lspan-grid'));

  /// Слушает раунд до открытия ввода; возвращает слова, прозвучавшие в этом раунде.
  Future<List<String>> listen(WidgetTester tester) async {
    for (var i = 0; i < 600 && grid.evaluate().isEmpty; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    expect(grid, findsOneWidget, reason: 'ввод так и не открылся');
    final heard = backend.spoken.sublist(heardBefore);
    heardBefore = backend.spoken.length;
    return heard;
  }

  Future<void> tapWord(WidgetTester tester, String w) async {
    await tester.tap(find.descendant(of: grid, matching: find.text(w)));
    await tester.pump();
  }

  /// Раунд нажатиями: [order] — слова в порядке нажатия.
  Future<void> answer(WidgetTester tester, List<String> order) async {
    for (final w in order) {
      if (grid.evaluate().isEmpty) break;
      await tapWord(tester, w);
    }
  }

  testWidgets('🔴 партия на слух: два раунда в порядке звучания — уровень взят, отчёт как у веба', (tester) async {
    await boot(tester, level: 1);
    expect(find.byKey(const Key('lspan-start')), findsOneWidget);
    await tester.tap(find.byKey(const Key('lspan-start')));
    await tester.pump();

    final first = await listen(tester);
    expect(first.length, 3, reason: 'на первом уровне звучат три слова');
    expect(find.text(first.first), findsOneWidget, reason: 'услышанное стоит в сетке');
    expect(find.descendant(of: grid, matching: find.byType(InkWell)).evaluate().length, 6,
        reason: 'сетка — три услышанных и три отвлекающих');
    await answer(tester, first);
    await tester.pump(const Duration(milliseconds: lspanAfterWinMs + 50));

    final second = await listen(tester);
    expect(second.toSet().intersection(first.toSet()), isEmpty, reason: 'второй раунд — невиданные слова');
    await answer(tester, second);
    await tester.pump(const Duration(milliseconds: lspanAfterWinMs + 50));
    await tester.pump();

    expect(find.byKey(const Key('lspan-passed')), findsOneWidget);
    expect(hud(tester, L.t('level'), '2'), isTrue, reason: 'ни одной ошибки — уровень растёт');
    final s = sent.single;
    expect(s['game_type'], 'listening_span');
    expect('${s['difficulty']} / ${s['mode']}', 'L1 / 3-span · en', reason: 'метки — как пишет веб-экран');
    expect(s['details'], {'level': 1, 'span': 3, 'errors': 0, 'target_lang': 'en'});
    expect(s['time_seconds'] as int, inInclusiveRange(4, 60), reason: 'секунды партии, а не отметка времени');
    expect(backend.langs.toSet(), {'en-US'}, reason: 'слова звучат голосом изучаемого языка');
  });

  testWidgets('🔴 верные слова не в том порядке — ошибка раунда; две ошибки — уровень не взят', (tester) async {
    await boot(tester, level: 1);
    await tester.tap(find.byKey(const Key('lspan-start')));
    await tester.pump();
    for (var round = 0; round < 2; round++) {
      final heard = await listen(tester);
      await tapWord(tester, heard[1]);
      expect(find.byWidgetPredicate((w) => w is Semantics && (w.properties.label ?? '').endsWith('-wrong')),
          findsOneWidget, reason: 'нажатое не в свой черёд отмечено ошибкой');
      await tapWord(tester, heard[0]);
      await tester.pump(const Duration(milliseconds: lspanAfterMissMs + 50));
    }
    await tester.pump();
    expect(find.byKey(const Key('lspan-failed')), findsOneWidget);
    expect(sent.single['errors'], 2);
    expect(hud(tester, L.t('level'), '1'), isTrue, reason: 'две ошибки за партию — уровень тот же');
  });

  testWidgets('🔴 удержание (ось 3): на 10-м уровне после последнего слова ввод закрыт ещё 0,7 с', (tester) async {
    await boot(tester, level: 10);
    await tester.tap(find.byKey(const Key('lspan-start')));
    await tester.pump();
    final p = LspanLevelParams.of(10);
    // Восемь слов с паузами: ждём, пока прозвучит последнее и пройдёт пауза после него.
    for (var i = 0; i < 400 && backend.spoken.length < p.span; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    await tester.pump(Duration(milliseconds: p.gapMs + 50));
    expect(grid, findsNothing, reason: 'слова кончились, а ввод ещё закрыт — ряд надо держать');
    expect(tester.widget<Text>(find.byKey(const Key('lspan-listen-title'))).data, L.t('memorize'));
    await tester.pump(Duration(milliseconds: p.holdMs));
    await tester.pump();
    expect(grid, findsOneWidget, reason: 'после удержания ввод открылся');
    await tester.tap(find.byTooltip(L.t('restart')));
    await tester.pump();
  });

  testWidgets('🔴 голоса нет — партия не начинается, на экране причина', (tester) async {
    await boot(tester, level: 1, voice: false);
    expect(find.byKey(const Key('lspan-voice-block')), findsOneWidget, reason: 'причина видна ещё до старта');
    await tester.tap(find.byKey(const Key('lspan-start')));
    await tester.pump(const Duration(seconds: 3));
    expect(grid, findsNothing);
    expect(find.byKey(const Key('lspan-start')), findsOneWidget, reason: 'остались на экране настройки');
    expect(sent, isEmpty);
  });

  testWidgets('выбор языка — выпадающий список из словаря, без языка приложения; выбор запоминается', (tester) async {
    await boot(tester, level: 1);
    await tester.tap(find.byKey(const Key('lspan-lang')));
    await tester.pumpAndSettle();
    final items = find.byType(DropdownMenuItem<String>);
    final codes = items.evaluate().map((e) => (e.widget as DropdownMenuItem<String>).value).toSet();
    expect(codes, lspanVocabLangs(vocab).toSet().difference({'ru'}), reason: 'все языки словаря, кроме языка приложения');
    await tester.tap(find.text(names['de']!).last);
    await tester.pumpAndSettle();
    expect(state.get(lspanTargetLangKey), 'de');

    await tester.tap(find.byKey(const Key('lspan-start')));
    await tester.pump();
    final heard = await listen(tester);
    final deWords = {for (final e in vocab) e['de']};
    expect(heard.every(deWords.contains), isTrue, reason: 'звучат слова выбранного языка: $heard');
    expect(backend.langs.toSet(), {'de-DE'});
    await tester.tap(find.byTooltip(L.t('restart')));
    await tester.pump();
  });

  testWidgets('🔴 «Показать решение»: порядок услышанных пронумерован; партия не засчитана', (tester) async {
    await boot(tester, level: 2);
    await tester.tap(find.byKey(const Key('lspan-start')));
    await tester.pump();
    final heard = await listen(tester);
    await tester.tap(find.byTooltip(L.t('puzzleShowSolution')));
    await tester.pump();
    final solution = find.byKey(const Key('lspan-solution'));
    expect(solution, findsOneWidget);
    final g = tester.widget<LspanWordGrid>(solution);
    for (var k = 0; k < heard.length; k++) {
      expect(g.order[g.grid.indexOf(heard[k])], k + 1, reason: '«${heard[k]}» прозвучало ${k + 1}-м');
    }
    expect(g.order.length, heard.length, reason: 'отвлекающие без номера');
    expect(sent, isEmpty, reason: 'показанное решение в статистику и лестницу не идёт');
    expect(hud(tester, L.t('level'), '2'), isTrue);
  });

  testWidgets('🔴 шаг зарядки: стартует сам, язык из шага, партия доиграна — уровень не двигается', (tester) async {
    await boot(tester, level: 12, preset: {'wu': '1', 'targetLang': 'de'});
    expect(find.byKey(const Key('lspan-start')), findsNothing, reason: 'шаг стартует сам');
    for (var round = 0; round < lspanRounds; round++) {
      final heard = await listen(tester);
      expect(heard.length, LspanLevelParams.of(12).span);
      await answer(tester, heard);
      await tester.pump(const Duration(milliseconds: lspanAfterWinMs + 50));
    }
    await tester.pump();
    expect(find.byKey(const Key('lspan-passed')), findsOneWidget);
    expect(backend.langs.toSet(), {'de-DE'}, reason: 'язык — из шага');
    expect(sent.single['details'], {'level': 12, 'span': 8, 'errors': 0, 'target_lang': 'de'});
    expect(hud(tester, L.t('level'), '12'), isTrue, reason: 'шаг зарядки личный уровень не двигает');
  });

  testWidgets('🔴 разбор открывается ДО партии; ответы примеров — по правилу самой игры', (tester) async {
    await boot(tester, level: 1);
    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pumpAndSettle();
    expect(find.byType(DemoCard), findsOneWidget);
    expect(find.byType(LspanLessonArt), findsOneWidget, reason: 'в разборе сетка самой игры');

    final arts = listeningSpanLessonTrials(lspanWordPool(vocab, 'en', (_) => false))
        .map((t) => t.art! as LspanLessonArt)
        .toList();
    expect(arts.map((a) => a.answerFollowsTheRule).toList(), [true, false, true],
        reason: 'порядок звучания — верно; не тот порядок — ошибка; ловушку обходим');
    final trap = arts[2].trap!;
    expect(arts[2].heard.contains(trap), isFalse, reason: 'ловушка не звучала');
    final closest = arts[2].heard.map((h) => lspanSimilarity(trap, h)).reduce((a, b) => a > b ? a : b);
    expect(closest, greaterThan(0), reason: 'ловушка созвучна услышанному');
    await tester.tap(find.byKey(const Key('lesson-close')));
    await tester.pumpAndSettle();
  });

  testWidgets('🔴 на 6-м уровне ДО партии — карточка правила, не поверх озвучки', (tester) async {
    await boot(tester, level: 6, rulesSeen: false);
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.byType(AlertDialog), findsOneWidget, reason: 'правило уровня объявлено в спокойный момент');
    expect(find.text(L.t('lr_listening_span_span8_title')), findsWidgets);
    await tester.tap(find.text(L.t('ctaGotIt')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('lspan-start')), findsOneWidget, reason: 'после «Понятно» — экран старта');
  });
}
