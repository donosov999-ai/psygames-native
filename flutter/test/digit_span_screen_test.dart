import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/digit_span/model.dart';
import 'package:psygames_flutter/games/digit_span/screen.dart';
import 'package:psygames_flutter/shell/demo_lesson.dart';
import 'package:psygames_flutter/shell/game_clock.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/level_rules.dart';
import 'package:psygames_flutter/shell/preset_cap.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/voice.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'support/settings_fit.dart';

/// Голос без сети и без системы: записывает сказанное, «есть ли голос» — по флагу.
class _FakeVoice implements VoiceBackend {
  _FakeVoice({this.system = true});
  final bool system;
  final spoken = <String>[];

  @override
  Future<bool> playUrl(String url, double rate) async => false;

  @override
  Future<bool> speakSystem(String text, String bcp47, double rate) async {
    if (!system) return false;
    spoken.add(text);
    return true;
  }

  @override
  Future<bool> hasSystemVoice(String bcp47) async => system;

  @override
  Future<void> cancel() async {}
}

/// 🔴 «ЦИФРОВОЙ РЯД» ИГРАЕТСЯ НАЖАТИЯМИ, РЯД ЧИТАЕТСЯ С ЭКРАНА (или слышится подставным голосом).
///
/// Подсмотреть ряд в модели значило бы пройти пробу и при сломанном показе. Отчёт уровня
/// перехватывается: метки веба, details, длительность в секундах, лестница по способу подачи.
void main() {
  late SharedState state;
  late _FakeVoice voiceDevice;
  final sent = <Map<String, dynamic>>[];
  final stringsJson = jsonDecode(File('assets/l10n/digit_span.json').readAsStringSync()) as Map<String, dynamic>;

  setUpAll(() async {
    await L.load('ru');
    await LevelRules.load();
  });

  tearDown(() {
    gameWallMs = () => DateTime.now().millisecondsSinceEpoch;
    GamePreset.clear();
    SessionReport.sink = null;
  });

  Future<void> boot(
    WidgetTester tester, {
    int level = 1,
    Map<String, String> prefs = const {},
    Map<String, String>? preset,
    bool voice = true,
    int seed = 5,
  }) async {
    // Паузы показа идут на игровых часах — им нужно поддельное время пробы.
    gameWallMs = () => tester.binding.clock.now().millisecondsSinceEpoch;
    SharedPreferences.setMockInitialValues({
      'psygames_digit_span_level_nzt48': '$level',
      // Карточки правил уровня проба уже «видела»: они ложатся в спокойный момент и закрыли бы поле.
      for (final k in ['reverse', 'surprise_dir']) LevelRules.seenKey('digit_span', k): '1',
      ...prefs,
    });
    state = await SharedState.open();
    sent.clear();
    SessionReport.sink = (json) async => sent.add(jsonDecode(json) as Map<String, dynamic>);
    if (preset != null) GamePreset.set(preset);
    voiceDevice = _FakeVoice(system: voice);
    // Линейный конгруэнтный поток на ЦЕЛОМ состоянии. На дроби (x = (x·9301 + 49297) % 233280 / 233280)
    // он сходится к ≈0,22, и все цифры ряда выходили «2»: на таком ряду «прямо», «наоборот» и «по
    // возрастанию» неразличимы, и проба обратного ввода ничего не доказывала (01.10.2026).
    var st = seed;
    double rng() {
      st = (st * 9301 + 49297) % 233280;
      return st / 233280;
    }
    await tester.pumpWidget(MaterialApp(
      home: DigitSpanScreen(
        key: UniqueKey(),
        state: state,
        rng: rng,
        voice: VoiceLayer(backend: voiceDevice, soundOn: () => true),
        strings: DsStrings.fromJson(stringsJson, L.locale),
      ),
    ));
    for (var i = 0; i < 6; i++) {
      await tester.pump();
    }
  }

  String text(WidgetTester tester, String key) {
    final f = find.byKey(Key(key));
    return f.evaluate().isEmpty ? '' : tester.widget<Text>(f).data ?? '';
  }

  bool hud(String key, String value) => find
      .byWidgetPredicate((w) => w is Semantics && w.properties.label == '${L.t(key)}: $value')
      .evaluate()
      .isNotEmpty;

  bool inputOpen(WidgetTester tester) {
    final f = find.byKey(const Key('ds-key-1'));
    return f.evaluate().isNotEmpty && tester.widget<OutlinedButton>(f).onPressed != null;
  }

  Future<void> pumpUntil(WidgetTester tester, bool Function() ok, {int maxMs = 20000}) async {
    for (var t = 0; t < maxMs && !ok(); t += 50) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    expect(ok(), isTrue, reason: 'не дождались за $maxMs мс');
  }

  /// Смотреть показ по одной цифре, пока не откроется ввод. Повтор цифры подряд законен, поэтому
  /// новая цифра засчитывается только после пустого кадра — так её различает и человек.
  Future<List<int>> watch(WidgetTester tester) async {
    final seen = <int>[];
    var afterGap = true;
    for (var t = 0; t < 30000 && !inputOpen(tester); t += 50) {
      final txt = text(tester, 'ds-digit').trim();
      if (txt.isEmpty) {
        afterGap = true;
      } else {
        if (afterGap) seen.add(int.parse(txt));
        afterGap = false;
      }
      await tester.pump(const Duration(milliseconds: 50));
    }
    expect(inputOpen(tester), isTrue, reason: 'ввод не открылся');
    return seen;
  }

  Future<void> type(WidgetTester tester, List<int> digits) async {
    for (final d in digits) {
      await tester.tap(find.byKey(Key('ds-key-$d')));
      await tester.pump();
    }
  }

  /// Ввести ряд и дождаться проверки; `wrong` — сломать первую цифру.
  Future<void> answer(WidgetTester tester, List<int> expected, {bool wrong = false}) async {
    final typed = [...expected];
    if (wrong) typed[0] = (typed[0] + 1) % 10;
    await type(tester, typed);
    await tester.pump(const Duration(milliseconds: dsSubmitDelayMs + 10));
  }

  Future<void> settle(WidgetTester tester) async {
    for (var i = 0; i < 6; i++) {
      await tester.pump();
    }
  }

  testWidgets('🔴 уровень — лесенка длин: верно → длиннее, две ошибки на длине → конец; отчёт метками веба',
      (tester) async {
    await boot(tester, level: 1);
    expect(text(tester, 'ds-level-what'), L.t('typeAsShown'));
    await tester.tap(find.byKey(const Key('ds-start')));
    await tester.pump();
    for (final len in [4, 5, 6]) {
      final seen = await watch(tester);
      expect(seen.length, len, reason: 'ряд длины $len');
      expect(hud('lengthLabel', '$len'), isTrue);
      await answer(tester, seen);
      expect(text(tester, 'ds-result'), L.t('msg_correct_level_up'));
      await tester.pump(const Duration(milliseconds: dsNextRowMs + 10));
    }
    final first7 = await watch(tester);
    expect(first7.length, 7);
    await answer(tester, first7, wrong: true);
    expect(text(tester, 'ds-result'), '${L.t('label_was')}: ${first7.join()}', reason: 'ошибка показывает, каким был ряд');
    await tester.pump(const Duration(milliseconds: dsNextRowMs + 10));
    final second7 = await watch(tester);
    expect(second7.length, 7, reason: 'после ошибки длина та же');
    await answer(tester, second7, wrong: true);
    await settle(tester);
    expect(find.byKey(const Key('ds-again')), findsOneWidget);
    expect(hud('level', '2'), isTrue, reason: 'хотя бы один верный ряд — уровень взят');
    final s = sent.single;
    expect('${s['game_type']} ${s['difficulty']} / ${s['mode']}', 'digit_span forward / start7');
    expect(s['details'], {
      'level': 1, 'maxSpan': 6, 'correctRounds': 3, 'finalLength': 7, 'direction': 'forward', 'delivery': 'screen',
    });
    expect('${s['score']} ${s['errors']}', '60 2');
    expect(s['time_seconds'] as int, inInclusiveRange(20, 120), reason: 'секунды партии, а не отметка времени');
    expect(state.get(dsPersonalBestKey), '6', reason: 'рекорд L1 экраном — под ключом веб-таблицы');
    expect(hud('personalBest', '6'), isTrue);
  });

  testWidgets('две ошибки на первой длине — уровень не взят, лестница стоит', (tester) async {
    await boot(tester, level: 3);
    await tester.tap(find.byKey(const Key('ds-start')));
    await tester.pump();
    for (var i = 0; i < 2; i++) {
      final seen = await watch(tester);
      expect(seen.length, LevelParams.of(3).startLen);
      await answer(tester, seen, wrong: true);
      await tester.pump(const Duration(milliseconds: dsNextRowMs + 10));
    }
    await settle(tester);
    expect(hud('level', '3'), isTrue);
    expect(find.text(L.t('retry')), findsOneWidget);
    expect(sent.single['details']['correctRounds'], 0);
    expect(state.get(dsPersonalBestKey), isNull, reason: 'рекорд — только с первого уровня');
  });

  testWidgets('🔴 «весь ряд разом»: ряд целиком, своя лестница, рекорд не пишется', (tester) async {
    await boot(tester, level: 1, prefs: {'psygames_digit_span_all_level_nzt48': '2'});
    await tester.tap(find.byKey(const Key('ds-delivery-all')));
    await settle(tester);
    expect(hud('level', '2'), isTrue, reason: 'у способа подачи своя лестница');
    await tester.tap(find.byKey(const Key('ds-start')));
    await tester.pump();
    final row = text(tester, 'ds-digit');
    final digits = row.split(' ').map(int.parse).toList();
    expect(digits.length, LevelParams.of(2).startLen, reason: 'весь ряд на экране сразу: «$row»');
    await tester.pump(Duration(milliseconds: allAtOnceMs(digits.length, LevelParams.of(2).gapMs) - 100));
    expect(text(tester, 'ds-digit'), row, reason: 'ряд держится столько же, сколько шёл бы по одной');
    await pumpUntil(tester, () => inputOpen(tester));
    await answer(tester, digits);
    await tester.pump(const Duration(milliseconds: dsNextRowMs + 10));
    final next = text(tester, 'ds-digit').split(' ').map(int.parse).toList();
    await pumpUntil(tester, () => inputOpen(tester));
    await answer(tester, next, wrong: true);
    await tester.pump(const Duration(milliseconds: dsNextRowMs + 10));
    final again = text(tester, 'ds-digit').split(' ').map(int.parse).toList();
    await pumpUntil(tester, () => inputOpen(tester));
    await answer(tester, again, wrong: true);
    await settle(tester);
    expect(sent.single['game_type'], 'digit_span', reason: 'статистика — под игрой, а не под лестницей');
    expect(sent.single['details']['delivery'], 'all');
    expect(state.get('psygames_digit_span_all_level_nzt48'), '3', reason: 'взята своя лестница');
    expect(state.get('psygames_digit_span_level_nzt48'), '1', reason: 'экранная лестница не тронута');
    expect(state.get(dsPersonalBestKey), isNull, reason: 'рекорд — только экраном по одной');
  });

  testWidgets('🔴 голосом: цифры звучат по порядку, на поле — «слушайте», своя лестница', (tester) async {
    await boot(tester, level: 1);
    await tester.tap(find.byKey(const Key('ds-delivery-voice')));
    await settle(tester);
    await tester.tap(find.byKey(const Key('ds-start')));
    await tester.pump();
    expect(find.byKey(const Key('ds-listening')), findsOneWidget);
    expect(find.byKey(const Key('ds-digit')), findsNothing, reason: 'голосом — смотреть не на что');
    await pumpUntil(tester, () => inputOpen(tester));
    final heard = voiceDevice.spoken.map(int.parse).toList();
    expect(heard.length, 4, reason: 'L1 — четыре цифры');
    await answer(tester, heard);
    expect(text(tester, 'ds-result'), L.t('msg_correct_level_up'));
    // Первый уровень, но голосом: в рекорд партия не идёт — ни в шапку, ни в память.
    expect(hud('personalBest', '—'), isTrue, reason: 'голосовая партия рекорд не двигает даже на экране');
    for (var i = 0; i < 2; i++) {
      voiceDevice.spoken.clear();   // ДО перехода: первая цифра нового ряда звучит сразу
      await tester.pump(const Duration(milliseconds: dsNextRowMs + 10));
      await pumpUntil(tester, () => inputOpen(tester));
      expect(voiceDevice.spoken.length, 5, reason: 'после верного ряда — на цифру длиннее');
      await answer(tester, voiceDevice.spoken.map(int.parse).toList(), wrong: true);
    }
    await settle(tester);
    expect(sent.single['details']['delivery'], 'voice');
    expect(state.get('psygames_digit_span_voice_level_nzt48'), '2', reason: 'взята голосовая лестница');
    expect(state.get(dsPersonalBestKey), isNull, reason: 'рекорд — только экраном по одной');
  });

  testWidgets('🔴 голоса нет — честная заглушка, голос не выбрать; шаг с голосом идёт экраном', (tester) async {
    await boot(tester, level: 1, voice: false);
    expect(find.byKey(const Key('ds-voice-warning')), findsOneWidget);
    expect(find.text(stringsJson['ru']['voiceNoVoice'] as String), findsOneWidget);
    expect(tester.widget<ChoiceChip>(find.byKey(const Key('ds-delivery-voice'))).onSelected, isNull);
    await tester.pumpWidget(const SizedBox());
    await boot(tester, level: 1, voice: false, preset: {'wu': '1', 'delivery': 'voice'});
    final seen = await watch(tester);
    expect(seen.length, capPresetByLevel(want: 4, atLevel: 4, atTop: false), reason: 'партия идёт экраном');
    await tester.tap(find.byTooltip(L.t('restart')));
    await tester.pump();
  });

  testWidgets('🔴 L11: обратный ввод — задом наперёд', (tester) async {
    await boot(tester, level: 11);
    expect(text(tester, 'ds-level-what'), L.t('typeReversed'));
    await tester.tap(find.byKey(const Key('ds-start')));
    await tester.pump();
    final seen = await watch(tester);
    expect(find.text(L.t('typeReversed')), findsOneWidget);
    await answer(tester, seen.reversed.toList());
    expect(text(tester, 'ds-result'), L.t('msg_correct_level_up'));
    await tester.tap(find.byTooltip(L.t('restart')));
    await tester.pump();
  });

  testWidgets('🔴 L15: направление объявляется ПОСЛЕ показа; перед вводом — удержание', (tester) async {
    await boot(tester, level: 15);
    expect(text(tester, 'ds-level-what'), L.t('lr_digit_span_surprise_dir_rule'));
    await tester.tap(find.byKey(const Key('ds-start')));
    await tester.pump();
    expect(find.byKey(const Key('ds-dir-reveal')), findsNothing, reason: 'во время показа направление неизвестно');
    final seen = <int>[];
    var afterGap = true;
    for (var t = 0; t < 30000 && find.byKey(const Key('ds-holding')).evaluate().isEmpty; t += 50) {
      final txt = text(tester, 'ds-digit').trim();
      if (txt.isEmpty) {
        afterGap = true;
      } else {
        if (afterGap) seen.add(int.parse(txt));
        afterGap = false;
      }
      await tester.pump(const Duration(milliseconds: 50));
    }
    expect(find.byKey(const Key('ds-holding')), findsOneWidget, reason: 'выше потолка — удержание');
    expect(inputOpen(tester), isFalse, reason: 'на удержании клавиши погашены');
    await pumpUntil(tester, () => inputOpen(tester), maxMs: LevelParams.of(15).holdMs + 200);
    final revealed = text(tester, 'ds-dir-reveal');
    final names = {
      L.t('directionForward'): Direction.forward,
      L.t('directionBackward'): Direction.backward,
      stringsJson['ru']['directionAscending'] as String: Direction.ascending,
    };
    expect(names.keys, contains(revealed), reason: 'объявлено одно из трёх направлений');
    await answer(tester, expectedDigits(seen, names[revealed]!));
    expect(text(tester, 'ds-result'), L.t('msg_correct_level_up'));
    await tester.tap(find.byTooltip(L.t('restart')));
    await tester.pump();
  });

  testWidgets('🔴 шаг зарядки: стартует сам, темп и направление из шага, метки шага, лестница стоит', (tester) async {
    await boot(tester,
        level: 7, preset: {'wu': '1', 'diff': 'medium', 'mode': 'ascending', 'startLen': '5', 'pace': 'slow'});
    expect(find.byKey(const Key('ds-start')), findsNothing, reason: 'шаг стартует сам');
    // Темп «медленно»: цифра держится 1000 мс, следующая — через 1600.
    final first = text(tester, 'ds-digit').trim();
    expect(first, isNotEmpty, reason: 'первая цифра — сразу');
    await tester.pump(const Duration(milliseconds: 900));
    expect(text(tester, 'ds-digit').trim(), first);
    await tester.pump(const Duration(milliseconds: 200));
    expect(text(tester, 'ds-digit').trim(), isEmpty, reason: 'через секунду погасла');
    final rest = await watch(tester);
    final seen = [int.parse(first), ...rest];
    expect(seen.length, capPresetByLevel(want: 5, atLevel: LevelParams.of(1).startLen, atTop: false));
    expect(find.text(stringsJson['ru']['typeAscending'] as String), findsOneWidget);
    await answer(tester, expectedDigits(seen, Direction.ascending), wrong: true);
    await tester.pump(const Duration(milliseconds: dsNextRowMs + 10));
    final again = await watch(tester);
    await answer(tester, again, wrong: true);
    await settle(tester);
    final s = sent.single;
    expect('${s['difficulty']} / ${s['mode']}', 'medium / ascending', reason: 'метки шага «Оценки»/зарядки');
    expect(s['details']['level'], 1, reason: 'шаг играет правила первого уровня');
    expect(state.get('psygames_digit_span_level_nzt48'), '7', reason: 'шаг личный уровень не двигает');
  });

  testWidgets('🔴 интерфейс на английском — подписи из словарей, ни одной русской буквы', (tester) async {
    await L.load('en');
    addTearDown(() => L.load('ru'));
    await boot(tester, level: 15, voice: false);
    String screenText() => find.byType(Text).evaluate().map((e) => (e.widget as Text).data ?? '').join(' | ');
    expect(RegExp(r'[А-Яа-яЁё]').hasMatch(screenText()), isFalse, reason: 'настройки: ${screenText()}');
    await tester.tap(find.byKey(const Key('ds-start')));
    await tester.pump();
    await pumpUntil(tester, () => inputOpen(tester));
    expect(RegExp(r'[А-Яа-яЁё]').hasMatch(screenText()), isFalse, reason: 'ввод: ${screenText()}');
    await tester.tap(find.byTooltip(L.t('restart')));
    await tester.pump();
  });

  testWidgets('«Показать решение»: ряд раскрыт, партия не записана', (tester) async {
    await boot(tester, level: 2);
    await tester.tap(find.byKey(const Key('ds-start')));
    await tester.pump();
    final seen = await watch(tester);
    await type(tester, [seen.first]);
    await tester.tap(find.byTooltip(L.t('puzzleShowSolution')));
    await tester.pump();
    expect(text(tester, 'ds-result'), '${L.t('label_was')}: ${seen.join()}');
    await tester.pump(const Duration(seconds: 5));
    expect(sent, isEmpty);
    expect(hud('level', '2'), isTrue);
  });

  testWidgets('стереть — убирает последнюю набранную цифру', (tester) async {
    await boot(tester, level: 1);
    await tester.tap(find.byKey(const Key('ds-start')));
    await tester.pump();
    final seen = await watch(tester);
    await type(tester, [seen[0], (seen[1] + 1) % 10]);
    await tester.tap(find.byKey(const Key('ds-key-erase')));
    await tester.pump();
    expect(text(tester, 'ds-typed'), '${seen[0]}•••');
    await answer(tester, seen.sublist(1));
    expect(text(tester, 'ds-result'), L.t('msg_correct_level_up'));
    await tester.tap(find.byTooltip(L.t('restart')));
    await tester.pump();
  });

  testWidgets('разбор открывается до партии', (tester) async {
    await boot(tester, level: 1);
    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pumpAndSettle();
    expect(find.byType(DemoCard), findsWidgets);
    expect(digitSpanLessonTrials().map((t) => t.rule).toList(), [L.t('teachSpanChunks'), L.t('teachSpanBackward')]);
  });

  testWidgets('уход с экрана посреди показа гасит таймеры', (tester) async {
    await boot(tester, level: 5);
    await tester.tap(find.byKey(const Key('ds-start')));
    await tester.pump(const Duration(milliseconds: 100));
    // Без прокрутки времени: таймер, переживший экран, проба поймает сама — «Timer is still pending».
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('🔴 настройка влезает в 360×640 по-английски и по-русски: «Начать» видна, ничего за краем (ae1d918b)',
      (tester) async {
    await expectSettingsFit(tester, () => boot(tester, level: 15), where: 'digit-span L15 (направление после показа)');
  });

  testWidgets('🔴 партия на 360×640: органы ответа целиком на экране (или в прокрутке поля), не меньше 48×48 (приёмка 6596a00d)',
      (tester) async {
    await expectPlayFit(tester, () async {
      await boot(tester, level: 15);
      await tester.tap(find.byKey(const Key('ds-start')));
      await pumpUntil(tester, () => inputOpen(tester));
    }, where: 'digit-span L15, ввод');
    await tester.pumpWidget(const SizedBox());
  });
}
