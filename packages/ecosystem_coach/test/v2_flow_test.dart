import 'package:ecosystem_coach/ecosystem_coach.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'ecosystem_coach_test.dart' show FakeTransport;

final _catalog = CoachStepCatalog(const [
  CoachStepKind(appId: 'psygames', ref: 'schulte_table', title: 'Schulte', maxLevel: 20),
  CoachStepKind(appId: 'psygames', ref: 'stroop', title: 'Stroop', unit: CoachStepUnit.minutes),
]);

Map<String, Object? Function(Map<String, Object?>)> _server({List<Object?> groups = const [], List<Object?> assignments = const []}) => {
      'dashboard': (_) => {
            'profile': {'name': 'Анна'},
            'students': [
              {'connection_id': 'c1', 'student_name': 'Маша', 'apps': []},
            ],
            'coaches': [],
          },
      'groups_list': (_) => {'groups': groups},
      'assignments_list': (_) => {'assignments': assignments},
      'group_save': (p) => {'id': 'g9', 'name': p['name']},
      'group_members': (_) => {
            'group': {'id': 'g1', 'name': '5А'},
            'students': [
              {'connection_id': 'c1', 'name': 'Маша', 'last_at': '2026-11-11T10:00:00Z', 'week_trainings': 4, 'apps': ['psygames']},
            ],
          },
      'group_invite_create': (_) => {'code': 'a' * 48, 'app_id': 'psygames', 'expires_at': '2026-12-11T00:00:00Z'},
      'lessons_list': (_) => {'lessons': []},
      'templates_list': (_) => {
            'lessons': [
              {
                'id': 't1',
                'template': true,
                'app_id': 'psygames',
                'title': 'Внимание',
                'goal': '',
                'steps': [
                  {'ref': 'schulte_table', 'amount': 3},
                  {'ref': 'stroop', 'amount': 5, 'unit': 'minutes'},
                ],
              },
            ],
          },
      'lesson_copy': (_) => {'id': 'p1'},
      'assign_lesson': (_) => {'id': 'a1'},
      'student_assignments': (_) => {
            'assignments': [
              {
                'id': 'a1',
                'app_id': 'psygames',
                'title': 'Внимание',
                'coach_name': 'Анна',
                'steps': [
                  {'ref': 'schulte_table', 'amount': 2},
                  {'ref': 'unknown_game', 'title': 'Новая игра', 'amount': 1},
                ],
                'done': [2, 0],
                'status': 'inProgress',
                'comment': 'Молодец',
              },
            ],
          },
    };

Widget _app(Widget home) => MaterialApp(home: home);

void main() {
  test('клиент: задания ученика — шаги по каталогу, незнакомый ref по названию из урока', () async {
    final client = CoachClient(FakeTransport(_server()), appId: 'psygames');
    final tasks = await client.studentAssignments(_catalog);
    expect(tasks.single.lesson.steps.first.kind.title, 'Schulte');
    expect(tasks.single.lesson.steps.first.kind.maxLevel, 20);
    expect(tasks.single.lesson.steps.last.kind.title, 'Новая игра');
    expect(tasks.single.done, [2, 0]);
    expect(tasks.single.comment, 'Молодец');
  });

  test('клиент: урок уходит с app_id приложения на каждом шаге', () async {
    final t = FakeTransport({..._server(), 'lesson_save': (_) => {'id': 'p2'}});
    final client = CoachClient(t, appId: 'psygames');
    await client.saveLesson(CoachLesson(title: ' Урок ', steps: [CoachLessonStep(kind: _catalog.kinds.first, level: 3, amount: 2)]));
    final payload = t.calls.single.$2;
    expect(payload['title'], 'Урок');
    expect((payload['steps'] as List).single, containsPair('app_id', 'psygames'));
    expect((payload['steps'] as List).single, containsPair('level', 3));
  });

  test('клиент: назначение группе и ученику — разные поля', () async {
    final t = FakeTransport(_server());
    final client = CoachClient(t, appId: 'psygames');
    await client.assignLesson('p1', const CoachTarget.group('g1'), repeat: CoachRecurrence.weekdays);
    await client.assignLesson('p1', const CoachTarget.student('c1'));
    expect(t.calls[0].$2, containsPair('group_id', 'g1'));
    expect(t.calls[0].$2, containsPair('recurrence', 'weekdays'));
    expect(t.calls[1].$2, containsPair('connection_id', 'c1'));
    expect(t.calls[1].$2.containsKey('group_id'), isFalse);
  });

  testWidgets('кабинет: пусто → подсказка; «Новая группа» создаёт группу', (tester) async {
    final t = FakeTransport(_server());
    await tester.pumpWidget(_app(TeacherCabinetV2(client: CoachClient(t, appId: 'psygames'), catalog: _catalog)));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('coach-no-groups')), findsOneWidget);
    await tester.tap(find.byKey(const Key('coach-new-group')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('coach-group-name')), '5А');
    await tester.tap(find.byKey(const Key('coach-group-create')));
    await tester.pumpAndSettle();
    expect(t.calls.where((c) => c.$1 == 'group_save').single.$2['name'], '5А');
  });

  testWidgets('кабинет: группа открывается со ссылкой и учениками', (tester) async {
    final t = FakeTransport(_server(groups: [
      {'id': 'g1', 'name': '5А', 'students': 1, 'active_assignments': 0, 'idle': 0},
    ]));
    await tester.pumpWidget(_app(TeacherCabinetV2(client: CoachClient(t, appId: 'psygames'), catalog: _catalog)));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('coach-group-g1')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('coach-group-qr')), findsOneWidget);
    expect(find.byKey(const Key('coach-group-student-c1')), findsOneWidget);
    expect(t.calls.where((c) => c.$1 == 'group_invite_create').length, 1);
  });

  testWidgets('кабинет: из группы — библиотека → шаблон копируется → назначается этой группе', (tester) async {
    final t = FakeTransport(_server(groups: [
      {'id': 'g1', 'name': '5А', 'students': 1, 'active_assignments': 0, 'idle': 0},
    ]));
    await tester.pumpWidget(_app(TeacherCabinetV2(client: CoachClient(t, appId: 'psygames'), catalog: _catalog)));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('coach-group-g1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('coach-group-assign')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('coach-lib-t1')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('coach-target-g:g1')), findsOneWidget);
    await tester.tap(find.byKey(const Key('coach-assign-go')));
    await tester.pumpAndSettle();
    expect(t.calls.where((c) => c.$1 == 'lesson_copy').length, 1);
    final assign = t.calls.where((c) => c.$1 == 'assign_lesson').single.$2;
    expect(assign['program_id'], 'p1');
    expect(assign['group_id'], 'g1');
  });

  testWidgets('ученик: карточка заданий; «Начать» отдаёт шаг приложению', (tester) async {
    final started = <String>[];
    await tester.pumpWidget(_app(Scaffold(
        body: StudentAssignmentsPanel(
            client: CoachClient(FakeTransport(_server()), appId: 'psygames'),
            catalog: _catalog,
            onStart: (task, i) => started.add(task.lesson.steps[i].kind.ref)))));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('coach-student-tasks')), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Start'));
    expect(started, ['unknown_game']);
  });

  testWidgets('ученик: сервер недоступен — карточки нет, ошибки нет', (tester) async {
    await tester.pumpWidget(_app(Scaffold(
        body: StudentAssignmentsPanel(client: CoachClient(FakeTransport(const {}), appId: 'psygames'), catalog: _catalog))));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('coach-student-tasks')), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
