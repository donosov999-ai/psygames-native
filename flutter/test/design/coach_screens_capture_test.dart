// Снимки кабинета преподавателя для приёмки: НАСТОЯЩИЕ экраны пакета ecosystem_coach в рамке и теме PsyGames,
// подставной сервер. Без флага — обычная проба экранов (без записи файлов).
// Снять: flutter test test/design/coach_screens_capture_test.dart --dart-define=CAPTURE_COACH=true
//        [--dart-define=COACH_LOCALE=en] → test/design/preview/coach-<экран>.png
import 'dart:io';
import 'dart:ui' as ui;

import 'package:ecosystem_coach/ecosystem_coach.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/app_look.dart';
import 'package:psygames_flutter/shell/app_theme.dart';
import 'package:psygames_flutter/shell/coach_bridge.dart';
import 'package:psygames_flutter/shell/design_template.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _capture = bool.fromEnvironment('CAPTURE_COACH');
const _locale = String.fromEnvironment('COACH_LOCALE', defaultValue: 'ru');
const _code = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718';

class _Server implements CoachTransport {
  _Server({this.empty = false});
  final bool empty;
  @override
  Future<Object?> call(String action, Map<String, Object?> p) async {
    final now = DateTime.utc(2026, 11, 11, 12);
    String ago(int m) => now.subtract(Duration(minutes: m)).toIso8601String();
    switch (action) {
      case 'dashboard':
        if (empty) return {'students': [], 'coaches': []};
        return {
          'profile': {'name': 'Анна Петровна'},
          'students': [
            {'connection_id': 'c1', 'student_name': 'Алекс', 'apps': [
              {'app_id': 'psygames', 'scopes': ['completion', 'metrics', 'errors', 'history'], 'events': 14, 'last_at': ago(35)},
              {'app_id': 'abstract-hub', 'scopes': ['completion', 'metrics'], 'events': 6, 'last_at': ago(60 * 26)},
            ]},
            {'connection_id': 'c2', 'student_name': 'Маша', 'apps': [
              {'app_id': 'typerighting', 'scopes': ['completion', 'metrics', 'history'], 'events': 22, 'last_at': ago(120)},
              {'app_id': 'smart-alarm', 'scopes': ['completion', 'history'], 'events': 9, 'last_at': ago(60 * 9)},
            ]},
            {'connection_id': 'c3', 'student_name': 'Иван', 'apps': [
              {'app_id': 'psygames', 'scopes': ['completion'], 'events': 0},
            ]},
          ],
          'coaches': [
            {'connection_id': 'k1', 'coach_name': 'Анна Петровна', 'apps': [
              {'app_id': 'psygames', 'scopes': ['completion', 'metrics', 'history']},
              {'app_id': 'abstract-hub', 'scopes': ['completion']},
            ]},
          ],
        };
      case 'student_events':
        if (p['app_id'] == 'psygames') {
          return {'events': [
            {'id': '1', 'app_id': 'psygames', 'kind': 'game', 'mode': 'schulte_table', 'exercise_ref': 'schulte_table:hard', 'occurred_at': ago(35),
              'received_at': ago(34), 'metrics': {'score': 128, 'time_seconds': 41, 'level': 7}, 'errors': {'count': 1}},
            {'id': '2', 'app_id': 'psygames', 'kind': 'warmup', 'mode': 'stroop', 'occurred_at': ago(50), 'received_at': ago(49),
              'metrics': {'score': 96, 'time_seconds': 60}, 'errors': {'count': 3}},
            {'id': '3', 'app_id': 'psygames', 'kind': 'game', 'mode': 'digit_span', 'exercise_ref': 'digit_span:normal',
              'received_at': ago(60 * 5), 'metrics': {'score': 9, 'time_seconds': 75, 'level': 4}, 'errors': {'count': 0}},
          ]};
        }
        return {'events': [
          {'id': '4', 'app_id': 'abstract-hub', 'kind': 'result', 'mode': 'practice', 'exercise_ref': 'go-capture',
            'occurred_at': ago(60 * 26), 'received_at': ago(60 * 26), 'metrics': {'score': 3, 'seconds': 140, 'level': 2}},
        ]};
      case 'invite_create':
        return {'code': _code, 'expires_at': now.add(const Duration(days: 7)).toIso8601String()};
      case 'invite_preview':
        return {'coach_name': 'Анна Петровна', 'app_id': 'psygames'};
      default:
        return {};
    }
  }
}

class _Auth extends ChangeNotifier implements CoachAuth {
  _Auth({required this.signedIn, this.googleAvailable = true, this.appleAvailable = false});
  @override
  final bool appleAvailable;
  @override
  final bool signedIn;
  @override
  final bool googleAvailable;
  @override
  String? get email => null;
  @override
  Future<void> signInWithApple() async {}
  @override
  Future<void> signInWithGoogle() async {}
  @override
  Future<void> sendEmailLink(String email) async {}
  @override
  Future<void> signOut() async {}
}

void main() {
  final boundary = GlobalKey();

  setUpAll(() async {
    final icons = await rootBundle.load('fonts/MaterialIcons-Regular.otf');
    await (FontLoader('MaterialIcons')..addFont(Future.value(icons))).load();
    if (Platform.isMacOS) {
      // Шрифт по умолчанию (Roboto) в пробах не установлен — подставляем Arial под оба имени, иначе шапка и окна — квадраты.
      for (final family in ['CoachPreview', 'Roboto', '.SF Pro Text']) {
        await (FontLoader(family)
              ..addFont(Future.value(File('/System/Library/Fonts/Supplemental/Arial.ttf').readAsBytesSync().buffer.asByteData())))
            .load();
      }
    }
  });

  Future<void> show(WidgetTester t, Widget Function(PsyGamesCoach coach) screen, {bool empty = false}) async {
    await t.pumpWidget(const SizedBox());
    t.view.physicalSize = const Size(390 * 2, 844 * 2);
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    SharedPreferences.setMockInitialValues({uiTemplateKey: 'aurora_v1', AppLook.overrideKey: 'dark', 'language': _locale});
    final state = await SharedState.open();
    await t.runAsync(() async {
      await L.load(_locale);
      await AppLook.load(state);
      await PsyGamesCoach.loadGameNames();
    });
    var theme = appShellTheme(state, brightness: Brightness.dark);
    if (Platform.isMacOS) theme = theme.copyWith(textTheme: theme.textTheme.apply(fontFamily: 'CoachPreview'));
    final coach = PsyGamesCoach(CoachClient(_Server(empty: empty), appId: 'psygames'));
    await t.pumpWidget(RepaintBoundary(
      key: boundary,
      child: MaterialApp(debugShowCheckedModeBanner: false, theme: theme, darkTheme: theme, themeMode: ThemeMode.dark, home: screen(coach)),
    ));
    await t.pumpAndSettle();
  }

  Future<void> shoot(WidgetTester t, String name) async {
    await t.pumpAndSettle();
    if (!_capture) return;
    await t.runAsync(() async {
      final render = boundary.currentContext!.findRenderObject()! as RenderRepaintBoundary;
      final image = await render.toImage(pixelRatio: 2);
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      final file = File('test/design/preview/coach-$name${_locale == 'ru' ? '' : '-$_locale'}.png');
      await file.parent.create(recursive: true);
      await file.writeAsBytes(bytes!.buffer.asUint8List());
      image.dispose();
    });
  }

  testWidgets('вход: iPhone — Apple, Google и почта; Android — Google и почта', (t) async {
    await show(t, (c) => TeacherCabinetScreen(
        client: c.client, strings: c.strings, frame: psyCoachFrame, auth: _Auth(signedIn: false, appleAvailable: true)));
    expect(find.byKey(const Key('coach-apple')), findsOneWidget);
    expect(find.byKey(const Key('coach-google')), findsOneWidget);
    await shoot(t, '1-sign-in-iphone');
    await show(t, (c) => TeacherCabinetScreen(
        client: c.client, strings: c.strings, frame: psyCoachFrame, auth: _Auth(signedIn: false)));
    expect(find.byKey(const Key('coach-google')), findsOneWidget);
    expect(find.byKey(const Key('coach-apple')), findsNothing);
    await shoot(t, '2-sign-in-android');
  });

  testWidgets('кабинет: стать преподавателем, ученики по приложениям, приглашение', (t) async {
    await show(t, (c) => TeacherCabinetScreen(client: c.client, strings: c.strings, frame: psyCoachFrame, auth: _Auth(signedIn: true)),
        empty: true);
    expect(find.byKey(const Key('coach-save-profile')), findsOneWidget);
    await shoot(t, '3-become-teacher');

    await show(t, (c) => TeacherCabinetScreen(client: c.client, strings: c.strings, frame: psyCoachFrame, auth: _Auth(signedIn: true)));
    expect(find.text('Алекс'), findsOneWidget);
    await shoot(t, '4-students');

    await t.tap(find.byKey(const Key('coach-invite')));
    await t.pumpAndSettle();
    expect(find.byKey(const Key('coach-invite-link')), findsOneWidget);
    await shoot(t, '5-invite-link');
  });

  testWidgets('тренировки ученика по приложениям', (t) async {
    final student = CoachDashboard.fromJson(await _Server().call('dashboard', {})).students.first;
    await show(t, (c) => StudentDetailScreen(
        client: c.client, strings: c.strings, frame: psyCoachFrame, student: student, eventTitle: PsyGamesCoach.eventTitle));
    expect(find.byKey(const Key('coach-event-1')), findsOneWidget);
    expect(find.textContaining('schulte'), findsNothing, reason: 'игра — названием, не кодом');
    await shoot(t, '6-student-trainings');
  });

  testWidgets('ученик: согласие по пунктам и «Мои преподаватели»', (t) async {
    await show(t, (c) => AcceptInviteScreen(
        client: c.client, code: _code, studentName: 'Алекс', strings: c.strings, frame: psyCoachFrame, auth: _Auth(signedIn: true)));
    await t.tap(find.byKey(const Key('coach-consent')));
    await shoot(t, '7-student-consent');

    await show(t, (c) => MyCoachesScreen(client: c.client, strings: c.strings, frame: psyCoachFrame, auth: _Auth(signedIn: true)));
    expect(find.text('Анна Петровна'), findsOneWidget);
    await shoot(t, '8-my-teachers');
  });
}
