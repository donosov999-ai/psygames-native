import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:practice_kit/practice_kit.dart';
import 'package:psygames_flutter/games/pause/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 «ГИМНАСТИКА ДЛЯ ГЛАЗ»: ПОЛЕ ВО ВЕСЬ ЭКРАН И СТЕРЕОКАРТИНКИ (задача a72e77a1).
///
/// Решения Дениса из карточки: (1) во всех режимах поле занимает весь экран, во
/// время занятия видна только жёлтая круглая кнопка паузы сбоку, остальные
/// действия — в меню паузы; (2) стереокартинки портретом во весь экран, «ответ /
/// дальше / готово» — в паузе. Веб-правка Codex (codex/eye-stereograms, c90ea3e4)
/// до людей не дошла бы: адрес /games/eye-gym перехвачен нативным экраном.
void main() {
  final engine = Practices(jsonDecode(File('../packages/practice_kit/assets/practices.json').readAsStringSync()) as Json);
  final copy = jsonDecode(File('assets/pause/copy.json').readAsStringSync()) as Json;
  late SharedState state;
  late List<Map<String, dynamic>> reports;
  var now = 0;

  setUpAll(() async => L.load('ru'));

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    reports = [];
    now = 0;
    GamePreset.clear();
    SessionReport.sink = (json) async => reports.add(jsonDecode(json) as Map<String, dynamic>);
  });
  tearDown(() {
    GamePreset.clear();
    SessionReport.sink = null;
  });

  Future<void> open(WidgetTester tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(
      home: PauseScreen(state: state, flavor: PauseFlavor.eyeGym, engine: engine, copy: copy, clock: () => now),
    ));
    await tester.pump();
    await tester.pump();
  }

  Future<void> at(WidgetTester tester, int ms) async {
    now = ms;
    await tester.pump(const Duration(milliseconds: 16));
    await tester.pump();
  }

  Future<void> free(WidgetTester tester, String mode) async {
    await tester.tap(find.byKey(const Key('pause-eye-road-false')));
    await tester.pump();
    await tester.ensureVisible(find.byKey(Key('pause-eye-mode-$mode')));
    await tester.tap(find.byKey(Key('pause-eye-mode-$mode')));
    await tester.pump();
  }

  Future<void> menu(WidgetTester tester) async {
    await tester.tap(find.byKey(const Key('field-only-pause')));
    await tester.pumpAndSettle();
  }

  testWidgets('🔴 подход — только поле: ни шапки, ни ряда значков, одна жёлтая кнопка паузы', (tester) async {
    await open(tester);
    await tester.tap(find.byKey(const Key('pause-start')));
    await tester.pump();
    expect(find.byKey(const Key('pause-eye')), findsOneWidget);
    expect(find.byKey(const Key('field-only-pause')), findsOneWidget);
    expect(find.byKey(const Key('pause-pause')), findsNothing, reason: 'ряд значков под полем остался');
    expect(find.byKey(const Key('pause-restart')), findsNothing);
    expect(find.text(L.t('eyeGym')), findsNothing, reason: 'шапка с названием осталась над полем');
    final field = tester.getSize(find.byKey(const Key('game-field')));
    expect(field.height, greaterThan(800), reason: 'поле не во весь экран: ${field.height}');
    // Кнопка паузы не ложится на подпись шага.
    final btn = tester.getRect(find.byKey(const Key('field-only-pause')));
    final instr = tester.getRect(find.byKey(const Key('pause-eye-instr')));
    expect(btn.overlaps(instr), isFalse, reason: 'кнопка паузы накрыла подпись: $btn / $instr');
  });

  testWidgets('🔴 меню паузы держит подход: время не идёт, после «Продолжить» — идёт', (tester) async {
    await open(tester);
    await tester.tap(find.byKey(const Key('pause-start')));
    await tester.pump();
    await at(tester, 5000);
    final dynamic st = tester.state(find.byType(PauseScreen));
    final before = st.debugEyeElapsed as double;
    await menu(tester);
    expect(find.text(L.t('exitConfirmStay')), findsOneWidget);
    await at(tester, 25000);
    expect(st.debugEyeElapsed as double, closeTo(before, .05), reason: 'под меню паузы подход шёл дальше');
    await tester.tap(find.byKey(const Key('pause-resume')));
    // Не pumpAndSettle: после «Продолжить» точка движется каждым кадром — покоя нет.
    await tester.pump(const Duration(milliseconds: 500));
    await at(tester, 27000);
    // ⚠️ Под меню экран перекрыт и не тикает — замер «время не идёт» зеленел бы и без
    // остановки (мутация выжила 01.10). Дефект виден ПОСЛЕ возврата: подход прыгнул
    // бы на все 20 с, что висело меню. Прибавиться должно только 2 с после него.
    expect(st.debugEyeElapsed as double, closeTo(before + 2, .3),
        reason: 'после меню подход прыгнул вперёд на время меню: ${st.debugEyeElapsed} при $before');
  });

  testWidgets('«Начать заново» — в меню паузы', (tester) async {
    await open(tester);
    await tester.tap(find.byKey(const Key('pause-start')));
    await tester.pump();
    await menu(tester);
    expect(find.byIcon(Icons.replay), findsOneWidget, reason: '«Начать заново» не попало в меню паузы');
  });

  testWidgets('🔴 стереокартинки — пятый режим свободных настроек, без длительности и скорости', (tester) async {
    await open(tester);
    expect(find.byKey(const Key('pause-eye-mode-stereo')), findsNothing, reason: 'в уровнях стереокартинок нет');
    await free(tester, 'stereo');
    expect(find.byKey(const Key('pause-eye-stereo-note')), findsOneWidget);
    expect(find.byKey(const Key('pause-eye-scale-1.0')), findsNothing);
    expect(find.byKey(const Key('pause-eye-speed-1.0')), findsNothing);
  });

  testWidgets('🔴 стереокартинка во весь экран; ответ, дальше и готово — из меню паузы', (tester) async {
    await open(tester);
    await free(tester, 'stereo');
    await tester.tap(find.byKey(const Key('pause-start')));
    await tester.pump();
    expect(find.byKey(const Key('pause-eye-stereo')), findsOneWidget);
    expect(find.byKey(const Key('field-only-pause')), findsOneWidget);
    final img = tester.widget<Image>(find.descendant(of: find.byKey(const Key('pause-eye-stereo')), matching: find.byType(Image)));
    expect((img.image as AssetImage).assetName, 'assets/eye_stereograms/circle.png');
    expect(img.fit, BoxFit.cover);
    expect(find.byKey(const Key('pause-eye-stereo-answer')), findsNothing);

    await menu(tester);
    await tester.tap(find.text(L.t('eyeStereoReveal')));
    await tester.pumpAndSettle();
    expect(find.text('${L.t('eyeStereoAnswer')}: ${L.t('shape_circle')}'), findsOneWidget);

    await menu(tester);
    await tester.tap(find.text(L.t('eyeStereoNext')));
    await tester.pumpAndSettle();
    final next = tester.widget<Image>(find.descendant(of: find.byKey(const Key('pause-eye-stereo')), matching: find.byType(Image)));
    expect((next.image as AssetImage).assetName, 'assets/eye_stereograms/heart.png');
    expect(find.byKey(const Key('pause-eye-stereo-answer')), findsNothing, reason: 'ответ прошлой картинки остался');

    await menu(tester);
    await tester.tap(find.text(L.t('storyDone')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('pause-config')), findsOneWidget);
    expect(reports, isEmpty, reason: 'стереокартинки — не партия: в статистику не пишутся');
  });

  test('картинки лежат в ассетах и объявлены в pubspec', () {
    final pubspec = File('pubspec.yaml').readAsStringSync();
    expect(pubspec, contains('- assets/eye_stereograms/'));
    for (final (file, _) in PauseScreenState.stereograms) {
      expect(File('assets/eye_stereograms/$file.png').existsSync(), isTrue, reason: file);
    }
  });

  test('подписи — из словаря на всех языках, а не сырые ключи', () async {
    for (final lang in ['ru', 'en', 'de', 'ja', 'ar']) {
      await L.load(lang);
      for (final k in ['eyeModeStereo', 'eyeStereoReveal', 'eyeStereoNext', 'storyDone', 'shape_circle', 'gamePauseOpen']) {
        expect(L.t(k), isNot(k), reason: '$lang: $k');
      }
    }
    await L.load('ru');
  });
}
