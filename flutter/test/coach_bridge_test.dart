import 'package:ecosystem_coach/ecosystem_coach.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/coach_bridge.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Transport implements CoachTransport {
  final sent = <Map<String, Object?>>[];
  bool fail = false;
  @override
  Future<Object?> call(String action, Map<String, Object?> payload) async {
    if (fail) throw const CoachException('coach_sign_in_required');
    sent.add(payload);
    return {'stored': true};
  }
}

void main() {
  final now = DateTime.utc(2026, 11, 11, 12);

  test('кабинет выключен по умолчанию: без флага PSY_COACH его нет', () {
    expect(PsyGamesCoach.enabled, isFalse);
  });

  test('проекция партии: только имя игры, уровень, очки, время, ошибки — детали доски не уходят', () {
    final e = coachEventFromSession({
      'id': 'r1',
      'game_type': 'digit_span',
      'score': 120,
      'time_seconds': 64,
      'difficulty': 'hard',
      'errors': 2,
      'details': {'ladderLevel': 7, 'board': 'секрет', 'ladderGame': 'sudoku'},
    }, now: now, newId: () => 'x')!;
    expect(e.toJson(), {
      'event_id': 'r1',
      'kind': 'game',
      'mode': 'digit_span',
      'exercise_ref': 'digit_span:hard',
      'occurred_at': '2026-11-11T12:00:00.000Z',
      'metrics': {'score': 120, 'time_seconds': 64, 'level': 7},
      'errors': {'count': 2},
    });
  });

  test('проекция: партия зарядки — kind warmup; без id — свой id; без игры — ничего', () {
    final e = coachEventFromSession({'game_type': 'schulte', 'score': 1, 'details': {'warmup_owner': {'a': 1}}},
        now: now, newId: () => 'gen')!;
    expect(e.kind, 'warmup');
    expect(e.eventId, 'gen');
    expect(coachEventFromSession({'score': 1}, now: now, newId: () => 'x'), isNull);
  });

  test('отчёт партии доходит до кабинета; сбой кабинета не роняет сохранение партии', () async {
    final t = _Transport();
    final coach = PsyGamesCoach(CoachClient(t, appId: 'psygames'), clock: () => now, newId: () => 'g')..observe();
    final saved = <String>[];
    SessionReport.sink = (json) async => saved.add(json);
    addTearDown(() {
      SessionReport.sink = null;
      coach.dispose();
    });
    await SessionReport.send(gameType: 'stroop', score: 10, timeSeconds: 30, id: 'id-1');
    await pumpEventQueue();
    expect(saved, hasLength(1));
    expect((t.sent.single['event'] as Map)['event_id'], 'id-1');
    expect(t.sent.single['app_id'], 'psygames');

    t.fail = true;
    await SessionReport.send(gameType: 'stroop', score: 11, timeSeconds: 31, id: 'id-2');
    await pumpEventQueue();
    expect(saved, hasLength(2), reason: 'партия сохранена, хотя кабинет недоступен');

    coach.dispose();
    expect(SessionReport.observer, isNull);
  });

  test('каталог шагов: игры каталога с кодом партии и маршрутом; шаг урока открывает игру', () async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await PsyGamesCoach.loadGameNames();
    final catalog = PsyGamesCoach.stepCatalog();
    expect(catalog.kinds.length, greaterThan(50));
    expect(catalog.find('schulte_table'), isNotNull);
    expect(catalog.find('sudoku_samurai'), isNotNull, reason: 'ref — код партии (sessionType), а не id каталога');
    expect(PsyGamesCoach.routeFor('schulte_table'), '/games/schulte');
    expect(PsyGamesCoach.routeFor('нет_такой'), isNull);
  });

  test('отправленная партия двигает счётчик результатов (карточка заданий перечитывает прогресс)', () async {
    final t = _Transport();
    final coach = PsyGamesCoach(CoachClient(t, appId: 'psygames'), clock: () => now, newId: () => 'g');
    await coach.submitSession({'game_type': 'stroop', 'score': 1, 'id': 'r1'});
    expect(coach.results.value, 1);
  });

  testWidgets('режим: преподаватель сохраняется; главная показывает вход в кабинет вместо заданий', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final state = await SharedState.open();
    final coach = PsyGamesCoach(CoachClient(_Transport(), appId: 'psygames'), state: state);
    expect(coach.role.value, CoachRole.student);
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: coach.studentCard(onOpen: (_) {}))));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('home-coach-teacher')), findsNothing);
    coach.setRole(CoachRole.teacher);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('home-coach-teacher')), findsOneWidget);
    expect(find.byKey(const ValueKey('home-coach-tasks')), findsNothing);
    expect(PsyGamesCoach(CoachClient(_Transport(), appId: 'psygames'), state: state).role.value, CoachRole.teacher,
        reason: 'режим переживает перезапуск');
    coach.setRole(CoachRole.student);
    expect(state.get(PsyGamesCoach.roleKey), isNull);
  });

  test('подписи кабинета v2: 12 языков приложения, незнакомый — английский', () {
    expect(CoachV2Strings.forLocale('ja').roleTeacher, '先生');
    expect(CoachV2Strings.forLocale('pt-BR').assign, 'Atribuir');
    expect(CoachV2Strings.forLocale('xx').assign, 'Assign');
  });
}
