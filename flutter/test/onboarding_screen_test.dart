import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/onboarding_screen.dart';
import 'package:psygames_flutter/shell/screen_ui.dart';

/// 🔴 ЗНАКОМСТВО НА FLUTTER РИСУЕТ МОДЕЛЬ ВЕБА (задача a8aa91e0).
///
/// Образцы выгружает веб-проба `onboarding-host-model.test.tsx` с настоящего экрана: подбор после
/// трёх ответов и первый слайд обучения.
///   Подбор: три вопроса, выбранный ответ подсвечен; «под себя» и общий список — карточками;
///   ответ, выбор игры и оба «Пропустить» — действия веба.
///   Обучение: счётчик, слайд, точки (активная длиннее), «Дальше» и «Пропустить» — действия веба.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final js = <String>[];
  Map<String, Object?> load(String f) => (jsonDecode(File('test/fixtures/$f').readAsStringSync()) as Map).cast<String, Object?>();

  setUp(() {
    ScreenUi.reset();
    js.clear();
    ScreenUi.run = (s) async => js.add(s);
  });

  Future<void> mount(WidgetTester t, Map<String, Object?>? m) async {
    t.view.physicalSize = const Size(780, 4000);
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    ScreenUi.model(OnboardingScreen.route).value = m;
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: OnboardingScreen(origin: 'http://127.0.0.1:1'))));
    await t.pump();
  }

  Finder key(String k) => find.byKey(ValueKey(k));

  testWidgets('без модели — ожидание', (t) async {
    await mount(t, null);
    expect(key('onboarding-loading'), findsOneWidget);
  });

  testWidgets('🔴 подбор: вопросы, выбранные ответы, «под себя» и общий список — строками модели', (t) async {
    final m = load('onboarding_model.json');
    await mount(t, m);
    final quiz = m['quiz']! as Map;
    for (final q in (quiz['questions'] as List).cast<Map>()) {
      expect(find.text(q['q'] as String), findsOneWidget);
      for (final (i, o) in (q['opts'] as List).cast<Map>().indexed) {
        final pill = t.widget<Container>(find.descendant(of: key('onboarding-quiz-${q['axis']}-$i'), matching: find.byType(Container)).first);
        expect((pill.decoration! as BoxDecoration).color == const Color(0xFF7C3AED), o['on'] == true, reason: '${q['axis']} $i');
      }
    }
    for (final c in ((quiz['yours'] as Map)['cards'] as List).cast<Map>()) {
      expect(key('onboarding-card-yours-${c['id']}'), findsOneWidget);
      expect(find.bySemanticsLabel(c['a11y'] as String), findsWidgets);
    }
    for (final c in (m['cards'] as List).cast<Map>()) {
      expect(key('onboarding-card-all-${c['id']}'), findsOneWidget);
    }
    expect(find.text(m['hint'] as String), findsOneWidget);
  });

  testWidgets('🔴 ответ, выбор игры и оба «Пропустить» — действия веба; пока веб занят — нажатия молчат', (t) async {
    final m = load('onboarding_model.json');
    await mount(t, m);
    final firstCard = ((m['cards'] as List).first as Map)['id'];
    await t.tap(key('onboarding-quiz-mood-2'));
    await t.tap(key('onboarding-card-all-$firstCard'));
    await t.tap(key('onboarding-exit'));
    await t.tap(key('onboarding-skip-footer'));
    expect(js[0], contains('["/onboarding"].quiz("mood",2)'));
    expect(js[1], contains('["/onboarding"].choose("$firstCard")'));
    expect(js[2], contains('["/onboarding"].skipPicker()'));
    expect(js[3], contains('["/onboarding"].skipPicker()'));
    js.clear();
    ScreenUi.model(OnboardingScreen.route).value = {...m, 'busy': true};
    await t.pump();
    await t.tap(key('onboarding-card-all-$firstCard'));
    await t.tap(key('onboarding-skip-footer'));
    expect(js, isEmpty);
  });

  testWidgets('🔴 обучение: счётчик, слайд, точки; «Дальше» и «Пропустить» — действия веба', (t) async {
    final m = load('onboarding_tutorial_model.json');
    await mount(t, m);
    expect(find.text(m['counter'] as String), findsOneWidget);
    expect(find.text((m['slide'] as Map)['title'] as String), findsOneWidget);
    final dots = m['dots']! as Map;
    final widths = t
        .widgetList<Container>(find.byType(Container))
        .map((c) => c.constraints?.maxWidth)
        .where((w) => w == 24 || w == 8)
        .toList();
    expect(widths.where((w) => w == 24).length, 1);
    expect(widths.length, dots['count']);
    await t.tap(key('onboarding-main'));
    await t.tap(key('onboarding-skip'));
    expect(js, [contains('["/onboarding"].main()'), contains('["/onboarding"].skip()')]);
  });
}
