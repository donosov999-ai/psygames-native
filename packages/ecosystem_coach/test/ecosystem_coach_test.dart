import 'package:ecosystem_coach/ecosystem_coach.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Подставной сервер: отвечает как `ecosystem_coach_v2`, записывает вызовы.
class FakeTransport implements CoachTransport {
  final calls = <(String, Map<String, Object?>)>[];
  final Map<String, Object? Function(Map<String, Object?>)> answers;
  FakeTransport(this.answers);

  @override
  Future<Object?> call(String action, Map<String, Object?> payload) async {
    calls.add((action, payload));
    final a = answers[action];
    if (a == null) throw const CoachException('coach_unavailable');
    return a(payload);
  }
}

class FakeAuth extends ChangeNotifier implements CoachAuth {
  FakeAuth({this.googleAvailable = true});
  @override
  bool signedIn = false;
  @override
  final bool googleAvailable;
  @override
  String? get email => signedIn ? 'a@b.c' : null;
  final calls = <String>[];
  @override
  Future<void> signInWithGoogle() async => calls.add('google');
  @override
  Future<void> sendEmailLink(String email) async => calls.add('mail:$email');
  @override
  Future<void> signOut() async {
    signedIn = false;
    notifyListeners();
  }
  void complete() {
    signedIn = true;
    notifyListeners();
  }
}

const code48 = 'abcdef0123456789abcdef0123456789abcdef0123456789';

void main() {
  test('ссылка-приглашение: одна форма на 4 приложения, чужая схема и кривой код — отказ', () {
    final link = CoachInviteLink(appId: 'smart-alarm', code: code48).toUri();
    expect(link.toString(), 'com.odv999.smartalarm://coach/invite?code=$code48');
    expect(CoachInviteLink.parse(link, appId: 'smart-alarm')?.code, code48);
    expect(CoachInviteLink.parse(link, appId: 'psygames'), isNull, reason: 'чужая схема');
    expect(CoachInviteLink.parse(Uri.parse('com.psygames.app://coach/invite?code=XYZ'), appId: 'psygames'), isNull);
    expect(CoachInviteLink.parse(Uri.parse('com.psygames.app://coach/join/$code48'), appId: 'psygames'), isNull);
  });

  test('клиент: принять приглашение — completion добавляется всегда, версия политики coach/2', () async {
    final t = FakeTransport({'invite_accept': (_) => {'connection_id': 'c1'}});
    final c = CoachClient(t, appId: 'typerighting');
    expect(await c.acceptInvite(code: code48, studentName: ' Ваня ', scopes: ['metrics', 'evil'], consent: true), 'c1');
    final p = t.calls.single.$2;
    expect(p['app_id'], 'typerighting');
    expect(p['student_name'], 'Ваня');
    expect(p['scopes'], ['completion', 'metrics'], reason: 'неизвестная область отброшена');
    expect(p['policy_version'], 'coach/2');
  });

  test('клиент: ответ сервера с error — исключение с кодом', () async {
    final c = CoachClient(FakeTransport({'invite_preview': (_) => {'error': 'coach_invite_unavailable'}}), appId: 'psygames');
    expect(() => c.previewInvite(code48), throwsA(isA<CoachException>().having((e) => e.code, 'code', 'coach_invite_unavailable')));
  });

  test('событие: только разрешённые поля, время в UTC, пустые метрики не уходят', () {
    final e = CoachEvent(eventId: 'e1', kind: 'game', mode: 'schulte', exerciseRef: 'schulte:5', occurredAt: DateTime.utc(2026, 11, 11, 9), metrics: {'score': 10});
    expect(e.toJson(), {'event_id': 'e1', 'kind': 'game', 'mode': 'schulte', 'exercise_ref': 'schulte:5', 'occurred_at': '2026-11-11T09:00:00.000Z', 'metrics': {'score': 10}});
  });

  test('модель: события без области errors — null («скрыто»), а не пусто', () {
    final v = CoachEventView.fromJson({'id': '1', 'app_id': 'psygames', 'kind': 'game', 'metrics': {'score': 5}});
    expect(v.metrics, {'score': 5});
    expect(v.errors, isNull);
  });

  testWidgets('кабинет преподавателя: без сервера — честное «недоступно»', (t) async {
    await t.pumpWidget(MaterialApp(home: TeacherCabinetScreen(client: CoachClient(FakeTransport({}), appId: 'psygames'))));
    await t.pumpAndSettle();
    expect(find.byKey(const Key('coach-unavailable')), findsOneWidget);
  });

  testWidgets('кабинет преподавателя: ученик с двумя приложениями и счётчиками; приглашение — ссылка своей схемы', (t) async {
    final tr = FakeTransport({
      'dashboard': (_) => {
            'profile': {'name': 'Анна'},
            'students': [
              {
                'connection_id': 'c1',
                'student_name': 'Ваня',
                'apps': [
                  {'app_id': 'abstract-hub', 'scopes': ['completion'], 'events': 3},
                  {'app_id': 'typerighting', 'scopes': ['completion', 'metrics'], 'events': 7},
                ],
              },
            ],
            'coaches': [],
          },
      'invite_create': (_) => {'code': code48, 'expires_at': '2026-11-18T00:00:00Z'},
    });
    await t.pumpWidget(MaterialApp(home: TeacherCabinetScreen(client: CoachClient(tr, appId: 'abstract-hub'))));
    await t.pumpAndSettle();
    expect(find.text('Ваня'), findsOneWidget);
    expect(find.textContaining('Trainings: 3', findRichText: true), findsOneWidget);
    expect(find.textContaining('Trainings: 7', findRichText: true), findsOneWidget);
    await t.tap(find.byKey(const Key('coach-invite')));
    await t.pumpAndSettle();
    expect(find.text('com.abstracthub.app://coach/invite?code=$code48'), findsOneWidget);
  });

  testWidgets('ученик: без явной галочки согласия «Подключиться» не нажимается; completion нельзя снять', (t) async {
    final tr = FakeTransport({
      'invite_preview': (_) => {'coach_name': 'Анна', 'app_id': 'psygames'},
      'invite_accept': (_) => {'connection_id': 'c9'},
    });
    String? done;
    await t.pumpWidget(MaterialApp(
        home: AcceptInviteScreen(client: CoachClient(tr, appId: 'psygames'), code: code48, studentName: 'Ваня', onDone: (id) => done = id)));
    await t.pumpAndSettle();
    expect(find.text('Анна'), findsOneWidget);
    expect(t.widget<CheckboxListTile>(find.byKey(const Key('coach-scope-completion'))).onChanged, isNull);
    expect(t.widget<FilledButton>(find.byKey(const Key('coach-accept'))).onPressed, isNull);
    await t.tap(find.byKey(const Key('coach-consent')));
    await t.pump();
    await t.enterText(find.byKey(const Key('coach-student-name')), '');
    await t.pump();
    expect(t.widget<FilledButton>(find.byKey(const Key('coach-accept'))).onPressed, isNull, reason: 'без имени нельзя');
    await t.enterText(find.byKey(const Key('coach-student-name')), 'Ваня');
    await t.pump();
    await t.tap(find.byKey(const Key('coach-accept')));
    await t.pumpAndSettle();
    expect(done, 'c9');
    expect(tr.calls.last.$2['consent'], true);
  });

  testWidgets('вход: без аккаунта — панель входа; после входа экран сам грузит сводку; выход возвращает панель', (t) async {
    final auth = FakeAuth();
    final tr = FakeTransport({'dashboard': (_) => {'profile': {'name': 'Анна'}, 'students': [], 'coaches': []}});
    await t.pumpWidget(MaterialApp(home: TeacherCabinetScreen(client: CoachClient(tr, appId: 'psygames'), auth: auth)));
    await t.pumpAndSettle();
    expect(find.byKey(const Key('coach-sign-in')), findsOneWidget);
    expect(t.widget<OutlinedButton>(find.byKey(const Key('coach-send-link'))).onPressed, isNull, reason: 'без почты нельзя');
    await t.enterText(find.byKey(const Key('coach-email')), 'teacher@example.com');
    await t.pump();
    await t.tap(find.byKey(const Key('coach-send-link')));
    await t.pumpAndSettle();
    expect(auth.calls, ['mail:teacher@example.com']);
    expect(find.byKey(const Key('coach-link-sent')), findsOneWidget);
    await t.tap(find.byKey(const Key('coach-google')));
    await t.pumpAndSettle();
    expect(auth.calls.last, 'google');

    auth.complete();
    await t.pumpAndSettle();
    expect(find.byKey(const Key('coach-sign-in')), findsNothing);
    expect(find.byKey(const Key('coach-no-students')), findsOneWidget);

    await t.tap(find.byKey(const Key('coach-sign-out')));
    await t.pumpAndSettle();
    expect(find.byKey(const Key('coach-sign-in')), findsOneWidget);
  });

  testWidgets('вход: без Google (iOS до входа Apple) — только почта', (t) async {
    final auth = FakeAuth(googleAvailable: false);
    await t.pumpWidget(MaterialApp(home: MyCoachesScreen(client: CoachClient(FakeTransport({}), appId: 'psygames'), auth: auth)));
    await t.pumpAndSettle();
    expect(find.byKey(const Key('coach-google')), findsNothing);
    expect(find.byKey(const Key('coach-email')), findsOneWidget);
  });

  testWidgets('приглашение до входа: сначала вход, после входа — кто приглашает', (t) async {
    final auth = FakeAuth();
    final tr = FakeTransport({'invite_preview': (_) => {'coach_name': 'Анна', 'app_id': 'psygames'}});
    await t.pumpWidget(MaterialApp(home: AcceptInviteScreen(client: CoachClient(tr, appId: 'psygames'), code: code48, auth: auth)));
    await t.pumpAndSettle();
    expect(find.byKey(const Key('coach-sign-in')), findsOneWidget);
    expect(tr.calls, isEmpty, reason: 'до входа на сервер не ходим');
    auth.complete();
    await t.pumpAndSettle();
    expect(find.text('Анна'), findsOneWidget);
  });

  test('показатели — человеческими словами, не ключами', () {
    final e = CoachEventView.fromJson({'id': '1', 'app_id': 'psygames', 'kind': 'game', 'mode': 'schulte',
        'metrics': {'score': 128, 'time_seconds': 41, 'level': 7}, 'errors': {'count': 1}});
    expect(coachMetricsLine(e, CoachStrings.ru), 'Счёт 128 · Время 0:41 · Уровень 7 · Ошибки 1');
    expect(defaultEventTitle(CoachEventView.fromJson({'id': '2', 'app_id': 'abstract-hub', 'kind': 'result', 'exercise_ref': 'go-capture'})),
        'Go capture');
  });

  test('показатели набора: «97 %», без языка, ошибки по клавишам — сумма и самые частые', () {
    final e = CoachEventView.fromJson({'id': '1', 'app_id': 'typerighting', 'kind': 'typing',
        'metrics': {'elapsed_ms': 41000, 'wpm': 52, 'accuracy': 97, 'language': 'ru', 'errors': 3},
        'errors': {'е': 2, 'ы': 1}});
    expect(coachMetricsLine(e, CoachStrings.ru), 'Время 0:41 · WPM 52 · 97 % · Ошибки 3');
    final keys = CoachEventView.fromJson({'id': '2', 'app_id': 'typerighting', 'kind': 'typing', 'metrics': {'wpm': 40},
        'errors': {'е': 2, 'ы': 5, 'ж': 1, 'щ': 1}});
    expect(coachMetricsLine(keys, CoachStrings.ru), 'WPM 40 · Ошибки 9 (ы×5, е×2, ж×1)');
  });

  testWidgets('согласие: по умолчанию «все тренировки» включены; у приложения без ошибок их нет', (t) async {
    final tr = FakeTransport({
      'invite_preview': (_) => {'coach_name': 'Анна', 'app_id': 'smart-alarm'},
      'invite_accept': (_) => {'connection_id': 'c1'},
    });
    await t.pumpWidget(MaterialApp(home: AcceptInviteScreen(
        client: CoachClient(tr, appId: 'smart-alarm'), code: code48, studentName: 'Ваня', scopes: const ['completion', 'metrics', 'history'])));
    await t.pumpAndSettle();
    expect(find.byKey(const Key('coach-scope-errors')), findsNothing);
    expect(t.widget<CheckboxListTile>(find.byKey(const Key('coach-scope-history'))).value, isTrue);
    await t.tap(find.byKey(const Key('coach-consent')));
    await t.pump();
    await t.tap(find.byKey(const Key('coach-accept')));
    await t.pumpAndSettle();
    expect((tr.calls.last.$2['scopes'] as List).toSet(), {'completion', 'metrics', 'history'});
  });
}
