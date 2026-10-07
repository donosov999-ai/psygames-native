// «Пауза»: практика НАЖАТИЯМИ, с подставными часами.
//
// Меряется то, на чём стоят статистика и зарядка: что и когда уходит в
// `saveSession` (через `SessionReport`), что пауза — и своя, и кнопкой шапки
// каркаса — останавливает время, что выход посреди практики НЕ пишет партию, что
// шаг зарядки с `?set=` открывается сразу в нужном наборе.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:practice_kit/practice_kit.dart';
import 'package:psygames_flutter/games/pause/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/voice.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  final engine = Practices(jsonDecode(File('../packages/practice_kit/assets/practices.json').readAsStringSync()) as Json);
  final copy = jsonDecode(File('assets/pause/copy.json').readAsStringSync()) as Json;
  late _Voice voice;
  late SharedState state;
  late List<Map<String, dynamic>> reports;
  var now = 0;

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
    voice = _Voice();
    await tester.pumpWidget(MaterialApp(
      home: PauseScreen(state: state, engine: engine, copy: copy, clock: () => now, voice: VoiceLayer(backend: voice, soundOn: () => true)),
    ));
    await tester.pump();
  }

  String hudTime(WidgetTester tester) {
    final texts = tester.widgetList<Text>(find.byType(Text)).map((t) => t.data ?? '').toList();
    return texts.firstWhere((t) => RegExp(r'^\d+:\d\d / \d+:\d\d$').hasMatch(t), orElse: () => '');
  }

  testWidgets('🔴 дыхание на минуту: пауза стоит, конец пишет партию так же, как веб', (tester) async {
    await open(tester);
    expect(find.byKey(const Key('pause-config')), findsOneWidget);
    await tester.tap(find.byKey(const Key('pause-set-breathing')));
    await tester.ensureVisible(find.byKey(const Key('pause-minutes-1')));
    await tester.tap(find.byKey(const Key('pause-minutes-1')));
    await tester.pump();
    await tester.ensureVisible(find.byKey(const Key('pause-start')));
    await tester.tap(find.byKey(const Key('pause-start')));
    await tester.pump();
    expect(find.byKey(const Key('pause-playing')), findsOneWidget);

    now = 30000;
    await tester.pump(const Duration(milliseconds: 16));
    expect(hudTime(tester), '0:30 / 1:00');

    await tester.tap(find.byKey(const Key('pause-pause')));
    await tester.pump();
    now = 50000;
    await tester.pump(const Duration(milliseconds: 16));
    expect(hudTime(tester), '0:30 / 1:00', reason: 'на паузе время практики стоит');

    await tester.tap(find.byKey(const Key('pause-resume')));
    await tester.pump();
    expect(reports, isEmpty, reason: 'до конца практики партия не пишется');
    now = 90000;
    await tester.pump(const Duration(milliseconds: 16));
    await tester.pump();

    expect(find.byKey(const Key('pause-done')), findsOneWidget);
    expect(reports, hasLength(1));
    final r = reports.single;
    expect(r['game_type'], 'pause');
    expect(r['score'], 1, reason: 'score — минуты, как в вебе');
    expect(r['time_seconds'], 60);
    expect(r['mode'], 'solo');
    expect(r['difficulty'], 'desk-visible', reason: 'обстановка — в difficulty, как в вебе');
    expect(r['details']['sets'], ['breathing']);
    expect(jsonDecode(state.get('psygames_pause_solo_nzt48')!), {'breathing': 1});
  });

  testWidgets('🔴 кнопка паузы в шапке каркаса останавливает практику', (tester) async {
    await open(tester);
    await tester.ensureVisible(find.byKey(const Key('pause-start')));
    await tester.tap(find.byKey(const Key('pause-start')));
    await tester.pump();
    now = 10000;
    await tester.pump(const Duration(milliseconds: 16));
    expect(hudTime(tester), startsWith('0:10 /'));

    await tester.tap(find.byIcon(Icons.pause).first);
    await tester.pumpAndSettle();
    now = 70000;
    await tester.pump(const Duration(milliseconds: 16));
    // «Продолжить» на экране паузы каркаса; в пробе словаря нет — подпись равна ключу.
    await tester.tap(find.text('exitConfirmStay'));
    // Практика снова идёт — кадры не прекращаются, pumpAndSettle здесь не дождётся тишины.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(milliseconds: 16));
    expect(hudTime(tester), startsWith('0:10 /'),
        reason: 'минута за экраном паузы не должна засчитаться практикой');
  });

  testWidgets('🔴 выход посреди практики партию НЕ пишет', (tester) async {
    await open(tester);
    await tester.ensureVisible(find.byKey(const Key('pause-start')));
    await tester.tap(find.byKey(const Key('pause-start')));
    await tester.pump();
    now = 20000;
    await tester.pump(const Duration(milliseconds: 16));
    await tester.tap(find.byIcon(Icons.arrow_back));
    await tester.pumpAndSettle();
    expect(find.text('Выйти без записи'), findsWidgets, reason: 'подпись — словарём страницы, как в вебе');
    await tester.tap(find.byKey(const Key('pause-leave')));
    await tester.pumpAndSettle();
    now = 999999;
    await tester.pump(const Duration(milliseconds: 16));
    expect(reports, isEmpty);
  });

  testWidgets('🔴 шаг зарядки ?set=eye-gym&wu=1 стартует сразу, в глазах, на полторы минуты', (tester) async {
    GamePreset.set({'set': 'eye-gym', 'wu': '1'});
    await open(tester);
    await tester.pump();
    expect(find.byKey(const Key('pause-playing')), findsOneWidget);
    expect(hudTime(tester), '0:00 / 1:30');
    now = 91000;
    await tester.pump(const Duration(milliseconds: 16));
    await tester.pump();
    expect(reports.single['details']['sets'], ['eye-gym']);
  });

  testWidgets('обстановка отсекает наборы, которые в ней не сделать', (tester) async {
    await open(tester);
    expect(find.byKey(const Key('pause-set-postures')), findsNothing, reason: 'за столом позы не предлагаем');
    await tester.tap(find.byKey(const Key('pause-context-home')));
    await tester.pump();
    expect(find.byKey(const Key('pause-set-postures')), findsOneWidget);
  });

  testWidgets('параллельно: два набора, советы ядра старт не держат', (tester) async {
    await open(tester);
    await tester.tap(find.byKey(const Key('pause-mode-parallel')));
    await tester.pump();
    for (final id in ['breathing', 'eye-gym']) {
      final chip = find.byKey(Key('pause-set-$id'));
      if (!tester.widget<FilterChip>(chip).selected) await tester.tap(chip);
      await tester.pump();
    }
    await tester.ensureVisible(find.byKey(const Key('pause-minutes-1')));
    await tester.tap(find.byKey(const Key('pause-minutes-1')));
    await tester.pump();
    await tester.ensureVisible(find.byKey(const Key('pause-start')));
    await tester.tap(find.byKey(const Key('pause-start')));
    await tester.pump();
    expect(find.byKey(const Key('pause-playing')), findsOneWidget,
        reason: 'без трёх одиночных прохождений ядро СОВЕТУЕТ, а не запрещает');
    now = 61000;
    await tester.pump(const Duration(milliseconds: 16));
    await tester.pump();
    expect(reports.single['mode'], 'parallel');
    expect((reports.single['details']['sets'] as List).toSet(), {'breathing', 'eye-gym'});
  });

  testWidgets('🔴 маршрут: наборы идут друг за другом одной сессией', (tester) async {
    await open(tester);
    await tester.tap(find.byKey(const Key('pause-mode-charge')));
    await tester.pump();
    for (final id in ['breathing', 'eye-gym']) {
      final chip = find.byKey(Key('pause-set-$id'));
      if (!tester.widget<FilterChip>(chip).selected) await tester.tap(chip);
      await tester.pump();
    }
    await tester.ensureVisible(find.byKey(const Key('pause-minutes-2')));
    await tester.tap(find.byKey(const Key('pause-minutes-2')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('pause-start')));
    await tester.pump();
    expect(find.byKey(const Key('pause-playing')), findsOneWidget);
    now = 121000;
    await tester.pump(const Duration(milliseconds: 16));
    await tester.pump();
    expect(reports.single['mode'], 'charge');
    expect((reports.single['details']['sets'] as List).toSet(), {'breathing', 'eye-gym'});
    expect(reports.single['time_seconds'], 120);
  });

  testWidgets('🔴 «экран + звук» называет шаг голосом, «только экран» молчит', (tester) async {
    await open(tester);
    await tester.ensureVisible(find.byKey(const Key('pause-guide-both')));
    await tester.tap(find.byKey(const Key('pause-guide-both')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('pause-start')));
    await tester.pump();
    expect(voice.spoken, hasLength(1), reason: 'первый шаг назван сразу');
    final firstTitle = tester.widgetList<Text>(find.descendant(of: find.byKey(const Key('pause-playing')), matching: find.byType(Text))).first.data!;
    expect(voice.spoken.single, startsWith(firstTitle));
    await tester.tap(find.byKey(const Key('pause-pause')));
    await tester.pump();
    expect(voice.cancels, greaterThan(0), reason: 'на паузе голос замолкает');

    // Тот же старт с «только экран» — ни слова.
    await tester.tap(find.byKey(const Key('pause-restart')));
    await tester.pump();
    await tester.ensureVisible(find.byKey(const Key('pause-guide-visual')));
    await tester.tap(find.byKey(const Key('pause-guide-visual')));
    await tester.pump();
    voice.spoken.clear();
    await tester.tap(find.byKey(const Key('pause-start')));
    await tester.pump();
    now = 30000;
    await tester.pump(const Duration(milliseconds: 16));
    expect(voice.spoken, isEmpty);
  });

  testWidgets('🔴 пятёрка Дениса собирается в параллель; у каждой написано, что она занимает', (tester) async {
    await open(tester);
    await tester.tap(find.byKey(const Key('pause-context-home')));
    await tester.tap(find.byKey(const Key('pause-mode-parallel')));
    await tester.pump();
    for (final id in ['breathing', 'eye-gym', 'postures', 'abdomen', 'pelvic-floor']) {
      final chip = find.byKey(Key('pause-set-$id'));
      await tester.ensureVisible(chip);
      if (!tester.widget<FilterChip>(chip).selected) await tester.tap(chip);
      await tester.pump();
    }
    for (final id in ['breathing', 'eye-gym', 'postures', 'abdomen', 'pelvic-floor']) {
      expect(tester.widget<FilterChip>(find.byKey(Key('pause-set-$id'))).selected, isTrue,
          reason: '$id: в пятёрке нет общего ресурса — никто никого не вытесняет');
    }
    expect(find.byKey(const Key('pause-uses-pelvic-floor')), findsOneWidget);
    expect(tester.widget<Text>(find.byKey(const Key('pause-uses-abdomen'))).data, contains('занимает: пресс и живот'));
  });

  testWidgets('🔴 развилка «либо-либо»: осознанное движение заменяет расслабление, «Начать» не гаснет', (tester) async {
    await open(tester);
    await tester.tap(find.byKey(const Key('pause-context-home')));
    await tester.tap(find.byKey(const Key('pause-mode-parallel')));
    await tester.pump();
    for (final id in ['breathing', 'relaxation', 'feldenkrais']) {
      final chip = find.byKey(Key('pause-set-$id'));
      await tester.ensureVisible(chip);
      if (!tester.widget<FilterChip>(chip).selected) await tester.tap(chip);
      await tester.pump();
    }
    bool on(String id) => tester.widget<FilterChip>(find.byKey(Key('pause-set-$id'))).selected;
    expect(on('feldenkrais'), isTrue);
    expect(on('relaxation'), isFalse, reason: 'оба забирают внимание целиком — второе заменяет первое');
    expect(on('breathing'), isFalse, reason: 'внимание целиком не делится ни с чем, и дыхание тоже уступает');
    expect(tester.widget<Text>(find.byKey(const Key('pause-uses-feldenkrais'))).data, contains('внимание целиком'));
    expect(
      tester.widget<Text>(find.byKey(const Key('pause-replaced'))).data,
      'Расслабление → Осознанное движение · занимает: внимание целиком',
      reason: 'молча снятая галочка читается как сбой — замена названа строкой',
    );
    await tester.ensureVisible(find.byKey(const Key('pause-context-home')));
    await tester.tap(find.byKey(const Key('pause-context-home')));
    await tester.pump();
    expect(find.byKey(const Key('pause-replaced')), findsNothing, reason: 'строка — про последний выбор, следующая правка её гасит');
  });
}

class _Voice implements VoiceBackend {
  final spoken = <String>[];
  var cancels = 0;

  @override
  Future<bool> playUrl(String url, double rate) async => false;

  @override
  Future<bool> speakSystem(String text, String bcp47, double rate) async {
    spoken.add(text);
    return true;
  }

  @override
  Future<bool> hasSystemVoice(String bcp47) async => true;

  @override
  Future<void> cancel() async => cancels++;
}
