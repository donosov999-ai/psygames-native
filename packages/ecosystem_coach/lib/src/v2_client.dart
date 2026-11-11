/// Клиент кабинета v2 (сервер coach/3): группы, уроки, задания, отчёты. Разбор без доверия — кривые поля пустые.
library;

import 'client.dart';
import 'model.dart';
import 'v2_model.dart';

String _s(Object? v) => v is String ? v : '';
int _i(Object? v) => v is num ? v.toInt() : 0;
double _f(Object? v) => v is num ? v.toDouble() : (v is String ? double.tryParse(v) ?? 0 : 0);
DateTime? _t(Object? v) => v is String ? DateTime.tryParse(v) : null;
List<Object?> _l(Object? v) => v is List ? v : const [];
Map<String, Object?> _m(Object? v) => v is Map ? v.cast<String, Object?>() : const {};

/// Каталог шагов приложения: по `ref` находится знакомое упражнение (название, уровни, единица).
class CoachStepCatalog {
  CoachStepCatalog(this.kinds) : _byRef = {for (final k in kinds) k.ref: k};
  final List<CoachStepKind> kinds;
  final Map<String, CoachStepKind> _byRef;

  CoachStepKind? find(String ref) => _byRef[ref];

  /// Шаг с сервера → вид шага. Незнакомый `ref` (каталог старше урока) показывается по названию из урока.
  CoachLessonStep step(Object? json, String appId) {
    final m = _m(json);
    final ref = _s(m['ref']);
    final known = _byRef[ref];
    final unit = m['unit'] == 'minutes' ? CoachStepUnit.minutes : CoachStepUnit.times;
    final kind = known ??
        CoachStepKind(appId: appId, ref: ref, title: _s(m['title']).isEmpty ? ref : _s(m['title']), unit: unit);
    return CoachLessonStep(kind: kind, level: _i(m['level']), amount: _i(m['amount']).clamp(1, 1000), note: _s(m['note']));
  }

  String title(String ref) => _byRef[ref]?.title ?? ref;
}

CoachProgress coachProgressOf(Object? v) => switch (v) {
      'done' => CoachProgress.done,
      'inProgress' => CoachProgress.inProgress,
      'overdue' => CoachProgress.overdue,
      _ => CoachProgress.notStarted,
    };

CoachRecurrence coachRecurrenceOf(Object? v) =>
    CoachRecurrence.values.firstWhere((r) => r.name == v, orElse: () => CoachRecurrence.none);

/// Кому назначено: группа или ученик (ключ `g:<id>` / `c:<id>` в выборе «кому»).
class CoachTarget {
  const CoachTarget.group(this.id) : isGroup = true;
  const CoachTarget.student(this.id) : isGroup = false;
  final String id;
  final bool isGroup;

  String get key => '${isGroup ? 'g' : 'c'}:$id';
  static CoachTarget? parse(String key) => key.startsWith('g:')
      ? CoachTarget.group(key.substring(2))
      : key.startsWith('c:')
          ? CoachTarget.student(key.substring(2))
          : null;
}

class CoachAssignmentReport {
  const CoachAssignmentReport({required this.assignment, required this.rows, this.connectionIds = const {}});
  final CoachAssignment assignment;
  final List<CoachAssignmentRow> rows;

  /// Имя ученика → связь (открыть отчёт по ученику из строки).
  final Map<String, String> connectionIds;
}

class CoachGroupDetails {
  const CoachGroupDetails({required this.group, required this.students});
  final CoachGroup group;
  final List<CoachGroupStudent> students;
}

/// Действия coach/3. Каталог нужен, чтобы шаги урока показать названиями приложения.
extension CoachClientV3 on CoachClient {
  Future<Map<String, Object?>> _v3(String action, Map<String, Object?> payload) async {
    final r = await transport.call(action, payload);
    final m = r is Map ? r.cast<String, Object?>() : <String, Object?>{};
    final err = m['error'];
    if (err is String) throw CoachException(err);
    return m;
  }

  CoachLesson _lesson(Object? j, CoachStepCatalog catalog) {
    final m = _m(j);
    final app = _s(m['app_id']).isEmpty ? appId : _s(m['app_id']);
    return CoachLesson(
      id: _s(m['id']).isEmpty ? null : _s(m['id']),
      title: _s(m['title']),
      goal: _s(m['goal']),
      template: m['template'] == true,
      steps: [for (final s in _l(m['steps'])) catalog.step(s, app)],
    );
  }

  Future<List<CoachGroup>> groups() async => [
        for (final g in _l((await _v3('groups_list', {}))['groups']))
          CoachGroup(
            id: _s(_m(g)['id']),
            name: _s(_m(g)['name']),
            students: _i(_m(g)['students']),
            activeAssignments: _i(_m(g)['active_assignments']),
            idle: _i(_m(g)['idle']),
          ),
      ];

  Future<String> saveGroup(String name, {String? groupId}) async =>
      _s((await _v3('group_save', {'name': name.trim(), 'group_id': ?groupId}))['id']);

  Future<void> archiveGroup(String groupId) => _v3('group_archive', {'group_id': groupId});

  Future<CoachGroupDetails> groupMembers(String groupId) async {
    final m = await _v3('group_members', {'group_id': groupId});
    final students = [
      for (final s in _l(m['students']))
        CoachGroupStudent(
          connectionId: _s(_m(s)['connection_id']),
          name: _s(_m(s)['name']),
          lastAt: _t(_m(s)['last_at']),
          weekTrainings: _i(_m(s)['week_trainings']),
          apps: [for (final a in _l(_m(s)['apps'])) if (a is String) a],
        ),
    ];
    return CoachGroupDetails(
        group: CoachGroup(id: groupId, name: _s(_m(m['group'])['name']), students: students.length), students: students);
  }

  Future<void> setGroupMembers(String groupId, List<String> connectionIds) =>
      _v3('group_members_set', {'group_id': groupId, 'connection_ids': connectionIds});

  /// Общая ссылка группы в это приложение: многоразовая, 30 дней.
  Future<CreatedInvite> createGroupInvite(String groupId, {int? maxUses}) async {
    final m = await _v3('group_invite_create', {'group_id': groupId, 'app_id': appId, 'max_uses': ?maxUses});
    return CreatedInvite(code: _s(m['code']), appId: appId, expiresAt: _t(m['expires_at']));
  }

  Future<List<CoachLesson>> lessons(CoachStepCatalog catalog, {String? lang}) async => [
        for (final l in _l((await _v3('lessons_list', {'app_id': appId, 'lang': ?lang}))['lessons'])) _lesson(l, catalog),
      ];

  Future<List<CoachLesson>> templates(CoachStepCatalog catalog, {String? lang}) async => [
        for (final l in _l((await _v3('templates_list', {'app_id': appId, 'lang': ?lang}))['lessons'])) _lesson(l, catalog),
      ];

  /// Урок — неизменяемая версия: правка сохраняется новым уроком, назначенное раньше не меняется.
  Future<String> saveLesson(CoachLesson lesson) async => _s((await _v3('lesson_save', {
        'app_id': appId,
        'title': lesson.title.trim(),
        if (lesson.goal.trim().isNotEmpty) 'goal': lesson.goal.trim(),
        'steps': [for (final s in lesson.steps) s.toJson()..['app_id'] = appId],
      }))['id']);

  Future<String> copyLesson(String programId, {String? lang}) async =>
      _s((await _v3('lesson_copy', {'program_id': programId, 'lang': ?lang}))['id']);

  Future<void> archiveLesson(String programId) => _v3('lesson_archive', {'program_id': programId});

  Future<String> assignLesson(String programId, CoachTarget to,
          {DateTime? due, CoachRecurrence repeat = CoachRecurrence.none, DateTime? startsAt}) async =>
      _s((await _v3('assign_lesson', {
        'program_id': programId,
        if (to.isGroup) 'group_id': to.id else 'connection_id': to.id,
        if (due != null) 'due_at': due.toUtc().toIso8601String(),
        if (startsAt != null) 'starts_at': startsAt.toUtc().toIso8601String(),
        'recurrence': repeat.name,
      }))['id']);

  Future<void> archiveAssignment(String id) => _v3('assignment_archive', {'assignment_id': id});

  Future<List<CoachAssignment>> assignments(CoachStepCatalog catalog, {String? groupId}) async => [
        for (final a in _l((await _v3('assignments_list', {'group_id': ?groupId}))['assignments']))
          CoachAssignment(
            id: _s(_m(a)['id']),
            lesson: _lesson({..._m(a), 'id': _m(a)['program_id']}, catalog),
            target: _s(_m(a)['target']),
            due: _t(_m(a)['due_at']),
            recurrence: coachRecurrenceOf(_m(a)['recurrence']),
            counts: {
              for (final e in _m(_m(a)['counts']).entries) coachProgressOf(e.key): _i(e.value),
            },
          ),
      ];

  Future<CoachAssignmentReport> assignmentReport(String id, CoachStepCatalog catalog) async {
    final m = await _v3('assignment_report', {'assignment_id': id});
    final rows = <CoachAssignmentRow>[];
    final ids = <String, String>{};
    final counts = <CoachProgress, int>{};
    for (final r in _l(m['rows'])) {
      final row = _m(r);
      final st = coachProgressOf(row['status']);
      counts[st] = (counts[st] ?? 0) + 1;
      ids[_s(row['student'])] = _s(row['connection_id']);
      rows.add(CoachAssignmentRow(
          student: _s(row['student']), done: [for (final d in _l(row['done'])) _i(d)], status: st, lastAt: _t(row['last_at'])));
    }
    return CoachAssignmentReport(
      assignment: CoachAssignment(
        id: id,
        lesson: _lesson(m, catalog),
        target: _s(m['target']),
        due: _t(m['due_at']),
        recurrence: coachRecurrenceOf(m['recurrence']),
        counts: counts,
      ),
      rows: rows,
      connectionIds: ids,
    );
  }

  /// Задания ученика в этом приложении (на главную, карточка «Задания от преподавателя»).
  Future<List<CoachStudentTask>> studentAssignments(CoachStepCatalog catalog) async => [
        for (final a in _l((await _v3('student_assignments', {'app_id': appId}))['assignments']))
          CoachStudentTask(
            id: _s(_m(a)['id']),
            lesson: _lesson(_m(a), catalog),
            coach: _s(_m(a)['coach_name']),
            done: [for (final d in _l(_m(a)['done'])) _i(d)],
            due: _t(_m(a)['due_at']),
            comment: _s(_m(a)['comment']).isEmpty ? null : _s(_m(a)['comment']),
          ),
      ];

  Future<CoachStudentReport> studentReport(String connectionId, CoachStepCatalog catalog) async {
    final results = await Future.wait([
      _v3('student_report', {'connection_id': connectionId}),
      _v3('comment_list', {'connection_id': connectionId}),
    ]);
    final m = results[0];
    final modes = [for (final x in _l(m['modes'])) _m(x)];
    final top = modes.fold<int>(1, (a, x) => _i(x['count']) > a ? _i(x['count']) : a);
    return CoachStudentReport(
      name: _s(m['name']),
      weeks: [for (final w in _l(m['weeks'])) _i(w)],
      skills: [
        for (final x in modes)
          CoachSkill(
            title: catalog.title(_s(x['mode'])),
            score: (_i(x['count']) * 100 / top).round(),
            trend: _i(x['week']) - _i(x['prev_week']),
            value: '${_i(x['count'])}',
          ),
      ],
      mistakes: [
        for (final x in _l(m['mistakes']))
          '${catalog.title(_s(_m(x)['mode']))}: ${_s(_m(x)['key'])} ×${_i(_m(x)['count'])}',
      ],
      comments: [
        for (final c in _l(results[1]['comments']))
          CoachComment(author: _s(_m(c)['author']), text: _s(_m(c)['text']), at: _t(_m(c)['at'])),
      ],
    );
  }

  /// [lagLabel] — подпись отстающего: имя и дни без тренировок (null — ещё не занимался).
  Future<CoachGroupReport> groupReport(String groupId, {required String Function(String name, int? days) lagLabel, DateTime? now}) async {
    final m = await _v3('group_report', {'group_id': groupId});
    final at = now ?? DateTime.now();
    return CoachGroupReport(
      group: _s(_m(m['group'])['name']),
      avgWeekTrainings: _f(m['avg_week_trainings']),
      doneShare: _f(m['done_share']),
      lagging: [
        for (final x in _l(m['lagging']))
          lagLabel(_s(_m(x)['name']), _t(_m(x)['last_at']) == null ? null : at.difference(_t(_m(x)['last_at'])!).inDays),
      ],
    );
  }

  Future<void> addComment(String connectionId, String text) => _v3('comment_add', {'connection_id': connectionId, 'text': text});
}
