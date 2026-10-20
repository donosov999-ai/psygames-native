import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/onboarding_model.dart';
import 'package:psygames_flutter/shell/onboarding_screen.dart';
import 'package:psygames_flutter/shell/profiles.dart';
import 'package:psygames_flutter/shell/screen_ui.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/web_theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 «ЗНАКОМСТВО»: МОДЕЛЬ DART = МОДЕЛЬ ВЕБА НА ТОМ ЖЕ ХРАНИЛИЩЕ (задача d6a60b02, вариант Б).
///
/// Эталоны выгружает веб-проба `onboarding-dart-model.test.tsx`: настоящий экран с провайдерами профиля,
/// темы и языка при замороженных часах; ответы подбора и шаги обучения — действиями оболочки. Образец
/// хранит хранилище, шаг, ответы и был ли слайд уведомлений; Dart собирает из них ту же модель.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  Map<String, Object?> obj(String f) => (jsonDecode(File(f).readAsStringSync()) as Map).cast<String, Object?>();
  final data = OnboardingData(
    j: obj('assets/onboarding.json'),
    profilesJson: obj('assets/profiles.json'),
    games: [for (final g in (obj('assets/catalog.json')['games']! as List)) (g as Map).cast<String, Object?>()],
  );
  final profiles = Profiles.parse(File('assets/profiles.json').readAsStringSync());
  void lang(String l) => L.useForTest(l, (jsonDecode(File('assets/l10n/$l.json').readAsStringSync()) as Map).cast<String, String>());
  setUpAll(() => WebTheme.use((jsonDecode(File('assets/web_theme.json').readAsStringSync()) as Map).cast<String, dynamic>()));

  for (final name in ['picker_en', 'picker_quiz', 'picked', 'tutorial_ru', 'tutorial_final']) {
    test('🔴 onboarding_dart_$name: модель Dart = модель веба', () async {
      final f = obj('test/fixtures/onboarding_dart_$name.json');
      final want = (f['model']! as Map).cast<String, Object?>();
      final language = f['language']! as String;
      SharedPreferences.setMockInitialValues((f['storage']! as Map).cast<String, Object>());
      final state = await SharedState.open();
      lang(language);
      final now = (f['now']! as num).toInt(), off = (f['tzOffsetMinutes']! as num).toInt();
      final dart = onboardingModelFrom(
        state,
        data,
        profiles: profiles,
        language: language,
        tutorial: f['tutorial']! as bool,
        notifications: f['notifications']! as bool,
        step: (f['step']! as num).toInt(),
        quiz: {for (final e in (f['quiz']! as Map).entries) '${e.key}': (e.value as num).toInt()},
        wall: DateTime.fromMillisecondsSinceEpoch(now - off * 60000, isUtc: true),
      );
      final got = (jsonDecode(jsonEncode(dart)) as Map).cast<String, Object?>();
      for (final k in want.keys) {
        expect(got[k], want[k], reason: 'поле $k');
      }
      expect(got.keys.toSet(), want.keys.toSet());
    });
  }

  test('подбор на все 27 сочетаний — три игры с карточками и профиль-подсказка', () {
    final picks = (data.j['picks']! as Map).cast<String, Object?>();
    expect(picks.length, 27);
    final cards = (data.j['cards']! as Map).cast<String, Object?>();
    for (final p in picks.values) {
      final games = ((p! as Map)['games']! as List);
      expect(games.length, 3);
      for (final id in games) {
        expect(cards.containsKey(id), isTrue, reason: '$id');
      }
    }
  });

  test('под оболочкой слайда уведомлений нет: страница — веб', () {
    final all = onboardingSlides(data, notifications: true), shell = onboardingSlides(data, notifications: false);
    expect(all.length, shell.length + 1);
    expect(shell.any((s) => s['kind'] == 'notifications'), isFalse);
    expect(shell.last['kind'], 'final');
  });

  test('«занято» — со страницы того же вида; шаг и ответы — из её модели', () {
    final own = <String, Object?>{'mode': 'tutorial', 'busy': false, 'counter': '1 / 7'};
    expect(withOnboardingPageEvents(own, null), same(own));
    expect(withOnboardingPageEvents(own, {'mode': 'picker', 'busy': true}), same(own));
    expect(withOnboardingPageEvents(own, {'mode': 'tutorial', 'busy': true, 'counter': 'x'}), {'mode': 'tutorial', 'busy': true, 'counter': '1 / 7'});
    expect(
      onboardingPageState({
        'mode': 'tutorial',
        'dots': {'active': 3},
      }).step,
      3,
    );
    final quiz = obj('test/fixtures/onboarding_dart_picker_quiz.json');
    expect(onboardingPageState((quiz['model']! as Map).cast<String, Object?>()).quiz, {'mood': 1, 'time': 2, 'taste': 0});
  });

  Future<List<String>> mount(WidgetTester t, {required bool tutorial}) async {
    final f = obj('test/fixtures/onboarding_dart_picker_en.json');
    SharedPreferences.setMockInitialValues((f['storage']! as Map).cast<String, Object>());
    final state = await SharedState.open();
    lang('en');
    Profiles.useForTest(profiles);
    await t.runAsync(WebTheme.load);
    ScreenUi.reset();
    final acts = <String>[];
    ScreenUi.run = (js) async => acts.add(js);
    addTearDown(() => ScreenUi.run = null);
    t.view.physicalSize = const Size(780, 4000);
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    await t.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: OnboardingScreen(origin: 'http://127.0.0.1:1', state: state),
        ),
      ),
    );
    OnboardingScreen.enter(tutorial: tutorial);
    await settle(t, () => find.byKey(const ValueKey('onboarding-loading')).evaluate().isEmpty);
    return acts;
  }

  testWidgets('🔴 подбор без страницы: вопросы и игры знакомства; ответ ставится сразу и уходит странице', (t) async {
    final acts = await mount(t, tutorial: false);
    expect(ScreenUi.model(OnboardingScreen.route).value, isNull, reason: 'модель не от страницы');
    expect(find.byKey(const ValueKey('onboarding-quiz')), findsOneWidget);
    for (final (axis, i) in [('mood', 1), ('time', 2), ('taste', 0)]) {
      await t.tap(find.byKey(ValueKey('onboarding-quiz-$axis-$i')));
      await settle(t, () => false, rounds: 3);
    }
    expect(acts.where((js) => js.contains('.quiz(')).length, 3, reason: 'ответы уходят странице — она решает переход');
    final want = ((obj('test/fixtures/onboarding_dart_picker_quiz.json')['model']! as Map)['quiz']! as Map)['yours']! as Map;
    for (final c in (want['cards']! as List)) {
      expect(find.byKey(ValueKey('onboarding-card-yours-${(c as Map)['id']}')), findsOneWidget);
    }
  });

  testWidgets('обучение без страницы: «Дальше» листает своим шагом; новая модель страницы возвращает её шаг', (t) async {
    await mount(t, tutorial: true);
    final total = onboardingSlides(data, notifications: false).length;
    expect(find.text('1 / $total'), findsOneWidget);
    await t.tap(find.byKey(const ValueKey('onboarding-main')));
    await settle(t, () => find.text('2 / $total').evaluate().isNotEmpty);
    expect(find.text('2 / $total'), findsOneWidget);
    // Нажатие до страницы не дошло: её модель — на первом слайде. Экран берёт её шаг.
    ScreenUi.model(OnboardingScreen.route).value = {
      'mode': 'tutorial',
      'busy': false,
      'dots': {'count': total, 'active': 0},
    };
    await settle(t, () => find.text('1 / $total').evaluate().isNotEmpty);
    expect(find.text('1 / $total'), findsOneWidget);
    // Новый вход — снова с первого слайда.
    await t.tap(find.byKey(const ValueKey('onboarding-main')));
    await settle(t, () => find.text('2 / $total').evaluate().isNotEmpty);
    OnboardingScreen.enter(tutorial: true);
    await settle(t, () => find.text('1 / $total').evaluate().isNotEmpty);
    expect(find.text('1 / $total'), findsOneWidget);
  });
}

Future<void> settle(WidgetTester t, bool Function() until, {int rounds = 60}) async {
  for (var i = 0; i < rounds && !until(); i++) {
    await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
    await t.pump();
  }
}
