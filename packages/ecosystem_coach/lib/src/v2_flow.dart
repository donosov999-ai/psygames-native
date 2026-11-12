/// Кабинет v2 на живых данных: связывает экраны v2 с сервером coach/3. Вход и профиль — как в v1
/// ([CoachSignIn], имя преподавателя). Приложение даёт клиента, каталог шагов, рамку и подписи.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'auth.dart';
import 'client.dart';
import 'model.dart';
import 'screens.dart';
import 'strings.dart';
import 'v2_client.dart';
import 'v2_model.dart';
import 'v2_screens.dart';
import 'v2_strings.dart';

Uri _inviteUri(CreatedInvite inv) =>
    Uri(scheme: coachApps[inv.appId], host: 'coach', path: '/invite', queryParameters: {'code': inv.code});

/// Главная преподавателя v2: группы, задания, библиотека, отчёты.
class TeacherCabinetV2 extends StatefulWidget {
  const TeacherCabinetV2({
    super.key,
    required this.client,
    required this.catalog,
    this.auth,
    this.strings = CoachStrings.en,
    this.v2 = CoachV2Strings.en,
    this.frame = defaultCoachFrame,
    this.lang,
    this.header,
  });
  final CoachClient client;
  final CoachStepCatalog catalog;
  final CoachAuth? auth;
  final CoachStrings strings;
  final CoachV2Strings v2;
  final CoachFrame frame;

  /// Язык шаблонов библиотеки (`ru`, `en`…); без него — английский.
  final String? lang;

  /// Над группами: переключатель режима или своё.
  final Widget? header;

  @override
  State<TeacherCabinetV2> createState() => _TeacherCabinetV2State();
}

class _TeacherCabinetV2State extends State<TeacherCabinetV2> {
  CoachDashboard? _dash;
  List<CoachGroup> _groups = const [];
  List<CoachAssignment> _assignments = const [];
  bool _loading = true;
  final _name = TextEditingController();
  final _invites = <String, Uri>{};

  CoachClient get _c => widget.client;
  CoachV2Strings get _s => widget.v2;

  @override
  void initState() {
    super.initState();
    widget.auth?.addListener(_onAuth);
    unawaited(_load());
  }

  @override
  void dispose() {
    widget.auth?.removeListener(_onAuth);
    _name.dispose();
    super.dispose();
  }

  void _onAuth() {
    if (!mounted) return;
    setState(() => _dash = null);
    unawaited(_load());
  }

  Future<void> _load() async {
    if (widget.auth != null && !widget.auth!.signedIn) {
      if (mounted) setState(() => _loading = false);
      return;
    }
    try {
      final dash = await _c.dashboard();
      var groups = const <CoachGroup>[];
      var assignments = const <CoachAssignment>[];
      if (dash.isCoach) {
        final r = await Future.wait([_c.groups(), _c.assignments(widget.catalog)]);
        groups = r[0] as List<CoachGroup>;
        assignments = r[1] as List<CoachAssignment>;
      }
      if (mounted) {
        setState(() {
          _dash = dash;
          _groups = groups;
          _assignments = assignments;
          _loading = false;
        });
      }
    } on CoachException {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _toast(String text) => ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(text)));

  Future<T?> _push<T>(Widget Function(BuildContext) b) => Navigator.of(context).push<T>(MaterialPageRoute(builder: b));

  /// Ошибка действия — коротко внизу, экран остаётся.
  Future<void> _guard(Future<void> Function() f) async {
    try {
      await f();
    } on CoachException {
      if (mounted) _toast(widget.strings.unavailable);
    }
  }

  Future<String?> _askName(String title, {String initial = ''}) async {
    final name = await showDialog<String>(
        context: context, builder: (ctx) => _NameDialog(title: title, initial: initial, strings: _s));
    return (name == null || name.isEmpty) ? null : name;
  }

  Future<void> _newGroup() => _guard(() async {
        final name = await _askName(_s.newGroup);
        if (name == null) return;
        await _c.saveGroup(name);
        await _load();
      });

  Future<Uri> _groupLink(String groupId) async =>
      _invites[groupId] ??= _inviteUri(await _c.createGroupInvite(groupId));

  Future<void> _openGroup(CoachGroup g) => _guard(() async {
        final r = await Future.wait<Object>([_c.groupMembers(g.id), _groupLink(g.id)]);
        final details = r[0] as CoachGroupDetails;
        if (!mounted) return;
        await _push<void>((_) => GroupScreen(
              group: details.group,
              students: details.students,
              inviteLink: r[1] as Uri,
              strings: _s,
              frame: widget.frame,
              onStudent: (st) => _openStudent(st.connectionId),
              onAssign: () => _pickAndAssign(preselect: CoachTarget.group(g.id)),
              onReport: () => _openGroupReport(g.id),
            ));
        await _load();
      });

  Future<void> _openStudent(String connectionId) => _guard(() async {
        final report = await _c.studentReport(connectionId, widget.catalog);
        if (!mounted) return;
        await _push<void>((ctx) => StudentReportScreen(
              report: report,
              strings: _s,
              frame: widget.frame,
              onComment: (text, praise) async {
                final body = praise ? (text.isEmpty ? '👍' : '👍 $text') : text;
                if (body.isEmpty) return;
                await _guard(() async {
                  await _c.addComment(connectionId, body);
                  if (ctx.mounted) Navigator.of(ctx).pop();
                  _toast(_s.saved);
                });
              },
            ));
      });

  Future<void> _openGroupReport(String groupId) => _guard(() async {
        final report = await _c.groupReport(groupId,
            lagLabel: (name, days) => '$name — ${days == null ? _s.neverTrained : CoachV2Strings.n(_s.daysIdle, days)}');
        if (!mounted) return;
        await _push<void>((_) => GroupReportScreen(
              report: report,
              strings: _s,
              frame: widget.frame,
              onExport: () {
                final text = [
                  report.group,
                  '${_s.avgWeek}: ${report.avgWeekTrainings.toStringAsFixed(1)}',
                  '${_s.doneShare}: ${(report.doneShare * 100).round()} %',
                  if (report.lagging.isNotEmpty) '${_s.lagging}: ${report.lagging.join('; ')}',
                ].join('\n');
                Clipboard.setData(ClipboardData(text: text));
                _toast(_s.copied);
              },
            ));
      });

  Future<void> _openAssignment(CoachAssignment a) => _guard(() async {
        final rep = await _c.assignmentReport(a.id, widget.catalog);
        if (!mounted) return;
        await _push<void>((reportCtx) => AssignmentReportScreen(
              assignment: rep.assignment,
              rows: rep.rows,
              strings: _s,
              frame: widget.frame,
              onStudent: (row) {
                final id = rep.connectionIds[row.student];
                if (id != null && id.isNotEmpty) unawaited(_openStudent(id));
              },
              // Срок и повтор — с этого момента: старое назначение уходит в архив со своим отчётом.
              onEdit: () => unawaited(_push<void>((editCtx) => AssignLessonScreen(
                    lesson: rep.assignment.lesson,
                    targets: {'this': rep.assignment.target},
                    strings: _s,
                    frame: widget.frame,
                    initialDue: rep.assignment.due,
                    initialRepeat: rep.assignment.recurrence,
                    onAssign: (_, due, repeat) => _guard(() async {
                      await _c.updateAssignment(a.id, due: due, clearDue: due == null && rep.assignment.due != null, repeat: repeat);
                      if (editCtx.mounted) Navigator.of(editCtx).pop();
                      if (reportCtx.mounted) Navigator.of(reportCtx).pop();
                      _toast(_s.saved);
                    }),
                  ))),
            ));
      });

  Map<String, String> _targets({CoachTarget? first}) {
    final all = <String, String>{
      for (final g in _groups) CoachTarget.group(g.id).key: g.name,
      for (final st in _dash?.students ?? const <CoachLink>[]) CoachTarget.student(st.connectionId).key: st.name,
    };
    if (first == null || !all.containsKey(first.key)) return all;
    return {first.key: all[first.key]!, ...all..remove(first.key)};
  }

  Future<void> _assign(CoachLesson lesson, {CoachTarget? preselect}) async {
    var id = lesson.id;
    if (id == null || lesson.template) {
      id = lesson.template && lesson.id != null ? await _c.copyLesson(lesson.id!, lang: widget.lang) : await _c.saveLesson(lesson);
    }
    final programId = id;
    if (!mounted) return;
    await _push<void>((ctx) => AssignLessonScreen(
          lesson: lesson,
          targets: _targets(first: preselect),
          strings: _s,
          frame: widget.frame,
          onAssign: (to, due, repeat) => _guard(() async {
            if (to.isEmpty) return;
            for (final key in to) {
              final target = CoachTarget.parse(key);
              if (target != null) await _c.assignLesson(programId, target, due: due, repeat: repeat);
            }
            if (ctx.mounted) Navigator.of(ctx).pop();
            _toast(_s.assigned);
          }),
        ));
    await _load();
  }

  Future<void> _editLesson(CoachLesson? lesson) async {
    await _push<void>((ctx) => LessonEditorScreen(
          catalog: widget.catalog.kinds,
          lesson: lesson,
          strings: _s,
          frame: widget.frame,
          appNames: widget.strings.appNames,
          onSave: (l) => _guard(() async {
            if (l.title.isEmpty || l.steps.isEmpty) return;
            await _c.saveLesson(l);
            if (ctx.mounted) Navigator.of(ctx).pop();
            _toast(_s.saved);
          }),
          onAssign: (l) => _guard(() async {
            if (l.title.isEmpty || l.steps.isEmpty) return;
            final saved = await _c.saveLesson(l);
            await _assign(CoachLesson(id: saved, title: l.title, goal: l.goal, steps: l.steps));
          }),
        ));
  }

  /// Библиотека; [preselect] — открыта из группы: урок сразу назначается ей.
  Future<void> _pickAndAssign({CoachTarget? preselect}) => _openLibrary(preselect: preselect);

  Future<void> _openLibrary({CoachTarget? preselect}) => _guard(() async {
        Future<(List<CoachLesson>, List<CoachLesson>)> fetch() async {
          final r = await Future.wait([_c.lessons(widget.catalog, lang: widget.lang), _c.templates(widget.catalog, lang: widget.lang)]);
          return (r[0], r[1]);
        }

        var data = await fetch();
        if (!mounted) return;
        await _push<void>((ctx) => StatefulBuilder(builder: (ctx, setLocal) {
              Future<void> refresh() async {
                data = await fetch();
                setLocal(() {});
              }

              return LessonLibraryScreen(
                mine: data.$1,
                templates: data.$2,
                strings: _s,
                frame: widget.frame,
                onOpen: (l) async {
                  if (preselect != null) {
                    await _guard(() => _assign(l, preselect: preselect));
                  } else {
                    await _editLesson(l.template ? CoachLesson(title: l.title, goal: l.goal, steps: l.steps) : l);
                  }
                  await _guard(refresh);
                },
                onCopy: (l) => _guard(() async {
                  if (l.id == null) return;
                  await _c.copyLesson(l.id!, lang: widget.lang);
                  await refresh();
                  _toast(_s.saved);
                }),
                onNew: () async {
                  await _editLesson(null);
                  await _guard(refresh);
                },
              );
            }));
        await _load();
      });

  @override
  Widget build(BuildContext context) {
    final s = widget.strings;
    final auth = widget.auth;
    final d = _dash;
    final title = s.teacherTitle;
    final signOut = [
      if (auth != null && auth.signedIn)
        CoachBarAction(key: const Key('coach-sign-out'), icon: Icons.logout, label: s.signOut, onPressed: auth.signOut, primary: false),
    ];
    if (auth != null && !auth.signedIn) return widget.frame(context, title, CoachSignIn(auth: auth, strings: s), const []);
    if (_loading && d == null) return widget.frame(context, title, const Center(child: CircularProgressIndicator()), const []);
    if (d == null) {
      return widget.frame(
          context,
          title,
          Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(s.unavailable, key: const Key('coach-unavailable'), textAlign: TextAlign.center))),
          signOut);
    }
    if (!d.isCoach) {
      return widget.frame(
        context,
        title,
        ListView(padding: const EdgeInsets.all(20), children: [
          TextField(key: const Key('coach-name'), controller: _name, decoration: InputDecoration(labelText: s.yourName), maxLength: 120),
          const SizedBox(height: 12),
          FilledButton(
            key: const Key('coach-save-profile'),
            onPressed: () => _guard(() async {
              if (_name.text.trim().isEmpty) return;
              await _c.saveProfile(_name.text);
              await _load();
            }),
            child: Text(s.saveProfile),
          ),
        ]),
        signOut,
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: TeacherHomeScreen(
        groups: _groups,
        assignments: _assignments,
        strings: _s,
        title: title,
        frame: (context, title, body, actions) => widget.frame(context, title, body, [...actions, ...signOut]),
        header: widget.header,
        empty: _groups.isEmpty && _assignments.isEmpty ? Text(_s.noGroups, key: const Key('coach-no-groups')) : null,
        onGroup: _openGroup,
        onAssignment: _openAssignment,
        onNewGroup: _newGroup,
        onLibrary: _openLibrary,
      ),
    );
  }
}

/// Окно имени группы: контроллер живёт столько же, сколько окно (и его анимация закрытия).
class _NameDialog extends StatefulWidget {
  const _NameDialog({required this.title, required this.initial, required this.strings});
  final String title, initial;
  final CoachV2Strings strings;

  @override
  State<_NameDialog> createState() => _NameDialogState();
}

class _NameDialogState extends State<_NameDialog> {
  late final _ctl = TextEditingController(text: widget.initial);

  @override
  void dispose() {
    _ctl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: Text(widget.title),
        content: TextField(key: const Key('coach-group-name'), controller: _ctl, autofocus: true, maxLength: 80,
            decoration: InputDecoration(labelText: widget.strings.groupName)),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(widget.strings.cancel)),
          FilledButton(
              key: const Key('coach-group-create'),
              onPressed: () => Navigator.of(context).pop(_ctl.text.trim()),
              child: Text(widget.strings.create)),
        ],
      );
}

/// Карточка заданий ученика на главной: сама грузит задания этого приложения. Без входа и без заданий — пусто.
class StudentAssignmentsPanel extends StatefulWidget {
  const StudentAssignmentsPanel({super.key, required this.client, required this.catalog, this.auth, this.strings = CoachV2Strings.en,
      this.onStart, this.refresh});
  final CoachClient client;
  final CoachStepCatalog catalog;
  final CoachAuth? auth;
  final CoachV2Strings strings;
  final void Function(CoachStudentTask task, int step)? onStart;

  /// Повод перечитать (возврат на главную, конец партии).
  final Listenable? refresh;

  @override
  State<StudentAssignmentsPanel> createState() => _StudentAssignmentsPanelState();
}

class _StudentAssignmentsPanelState extends State<StudentAssignmentsPanel> {
  List<CoachStudentTask> _tasks = const [];

  @override
  void initState() {
    super.initState();
    widget.auth?.addListener(_load);
    widget.refresh?.addListener(_load);
    _load();
  }

  @override
  void dispose() {
    widget.auth?.removeListener(_load);
    widget.refresh?.removeListener(_load);
    super.dispose();
  }

  Future<void> _load() async {
    if (widget.auth != null && !widget.auth!.signedIn) {
      if (mounted && _tasks.isNotEmpty) setState(() => _tasks = const []);
      return;
    }
    try {
      final tasks = await widget.client.studentAssignments(widget.catalog);
      if (mounted) setState(() => _tasks = tasks);
    } on CoachException {
      // Нет сети или входа — карточки просто нет, главная не ломается.
    }
  }

  @override
  Widget build(BuildContext context) => StudentAssignmentsCard(tasks: _tasks, strings: widget.strings, onStart: widget.onStart);
}
