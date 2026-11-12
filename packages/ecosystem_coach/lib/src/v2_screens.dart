/// Кабинет v2: режим преподавателя, группы, уроки, задания, отчёты. Рамку даёт приложение ([CoachFrame]),
/// цвета — только из темы приложения (никаких своих литералов).
library;

import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';

import 'screens.dart';
import 'skin.dart';
import 'v2_model.dart';
import 'v2_strings.dart';

/// Редактор данных шага урока (свой у приложения): текст преподавателя, позиция FEN, id задачи.
typedef CoachStepDataEditor = Future<Map<String, Object?>?> Function(BuildContext context, CoachLessonStep step);

String _d(DateTime? d) => d == null
    ? ''
    : '${d.toLocal().day.toString().padLeft(2, '0')}.${d.toLocal().month.toString().padLeft(2, '0')}';

Color _progressColor(BuildContext context, CoachProgress p) =>
    CoachSkin.of(context).progressColor?.call(context, p) ?? _statusColor(Theme.of(context).colorScheme, p);

Color _statusColor(ColorScheme c, CoachProgress p) => switch (p) {
      CoachProgress.done => c.primary,
      CoachProgress.inProgress => c.tertiary,
      CoachProgress.notStarted => c.outlineVariant,
      CoachProgress.overdue => c.error,
    };

String _statusLabel(CoachV2Strings s, CoachProgress p) => switch (p) {
      CoachProgress.done => s.statusDone,
      CoachProgress.inProgress => s.statusInProgress,
      CoachProgress.notStarted => s.statusNotStarted,
      CoachProgress.overdue => s.statusOverdue,
    };

String _repeatLabel(CoachV2Strings s, CoachRecurrence r) => switch (r) {
      CoachRecurrence.none => s.repeatNone,
      CoachRecurrence.daily => s.repeatDaily,
      CoachRecurrence.weekdays => s.repeatWeekdays,
      CoachRecurrence.weekly => s.repeatWeekly,
    };

/// Переключатель «Ученик / Преподаватель» — ставится в настройки приложения и в шапку кабинета.
class CoachRoleSwitch extends StatelessWidget {
  const CoachRoleSwitch({super.key, required this.role, required this.onChanged, this.strings = CoachV2Strings.en});
  final CoachRole role;
  final ValueChanged<CoachRole> onChanged;
  final CoachV2Strings strings;

  @override
  Widget build(BuildContext context) {
    final s = strings;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(s.roleTitle, style: Theme.of(context).textTheme.titleSmall),
      const SizedBox(height: 8),
      SegmentedButton<CoachRole>(
        key: const Key('coach-role'),
        segments: [
          ButtonSegment(value: CoachRole.student, icon: const Icon(Icons.sports_esports_outlined), label: Text(s.roleStudent)),
          ButtonSegment(value: CoachRole.teacher, icon: const Icon(Icons.school_outlined), label: Text(s.roleTeacher)),
        ],
        selected: {role},
        onSelectionChanged: (v) => onChanged(v.first),
      ),
      const SizedBox(height: 6),
      Text(s.roleHint, style: Theme.of(context).textTheme.bodySmall),
    ]);
  }
}

/// Полоса статусов задания: сделали / в процессе / не начали / просрочили.
class CoachStatusBar extends StatelessWidget {
  const CoachStatusBar({super.key, required this.counts, required this.strings, this.legend = true});
  final Map<CoachProgress, int> counts;
  final CoachV2Strings strings;
  final bool legend;

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme;
    final total = counts.values.fold(0, (a, b) => a + b);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      ClipRRect(
        borderRadius: BorderRadius.circular(6),
        child: SizedBox(
          height: 10,
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            for (final p in CoachProgress.values)
              if ((counts[p] ?? 0) > 0) Expanded(flex: counts[p]!, child: ColoredBox(color: _progressColor(context, p))),
            if (total == 0) Expanded(child: ColoredBox(color: c.surfaceContainerHighest)),
          ]),
        ),
      ),
      if (legend) ...[
        const SizedBox(height: 6),
        Wrap(spacing: 12, runSpacing: 4, children: [
          for (final p in CoachProgress.values)
            Row(mainAxisSize: MainAxisSize.min, children: [
              Container(width: 8, height: 8, decoration: BoxDecoration(color: _statusColor(c, p), shape: BoxShape.circle)),
              const SizedBox(width: 4),
              Text('${_statusLabel(strings, p)} ${counts[p] ?? 0}', style: Theme.of(context).textTheme.bodySmall),
            ]),
        ]),
      ],
    ]);
  }
}

/// Главная преподавателя: группы и активные задания.
class TeacherHomeScreen extends StatelessWidget {
  const TeacherHomeScreen({super.key, required this.groups, required this.assignments, this.strings = CoachV2Strings.en,
      this.title = 'Teacher cabinet', this.frame = defaultCoachFrame, this.onGroup, this.onAssignment, this.onNewGroup, this.onLibrary,
      this.header, this.empty});
  final List<CoachGroup> groups;
  final List<CoachAssignment> assignments;
  final CoachV2Strings strings;
  final String title;
  final CoachFrame frame;
  final ValueChanged<CoachGroup>? onGroup;
  final ValueChanged<CoachAssignment>? onAssignment;
  final VoidCallback? onNewGroup, onLibrary;

  /// Переключатель режима или что-то своё над списком.
  final Widget? header;

  /// Подсказка, когда нет ни групп, ни заданий.
  final Widget? empty;

  @override
  Widget build(BuildContext context) {
    final s = strings;
    final t = Theme.of(context).textTheme;
    final c = Theme.of(context).colorScheme;
    return frame(
      context,
      title,
      ListView(key: const Key('coach-teacher-home'), padding: const EdgeInsets.all(16), children: [
        if (header != null) ...[header!, const SizedBox(height: 16)],
        if (empty != null) ...[empty!, const SizedBox(height: 16)],
        if (groups.isNotEmpty) Text(s.groups, style: t.titleMedium),
        const SizedBox(height: 8),
        for (final g in groups)
          CoachPanel(
            child: ListTile(
              key: Key('coach-group-${g.id}'),
              leading: CircleAvatar(child: Text(g.name.characters.first)),
              title: Text(g.name),
              subtitle: Text([CoachV2Strings.n(s.studentsN, g.students), CoachV2Strings.n(s.assignmentsN, g.activeAssignments)].join(' · ')),
              trailing: g.idle > 0
                  ? Chip(
                      avatar: Icon(Icons.bedtime_outlined, size: 16, color: c.error),
                      label: Text('${g.idle}'),
                      visualDensity: VisualDensity.compact,
                    )
                  : const Icon(Icons.chevron_right),
              onTap: () => onGroup?.call(g),
            ),
          ),
        const SizedBox(height: 16),
        if (assignments.isNotEmpty) Text(s.assignments, style: t.titleMedium),
        const SizedBox(height: 8),
        for (final a in assignments)
          CoachPanel(
            child: InkWell(
              key: Key('coach-assignment-${a.id}'),
              borderRadius: BorderRadius.circular(12),
              onTap: () => onAssignment?.call(a),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(a.lesson.title, style: t.titleSmall),
                  const SizedBox(height: 2),
                  Text([a.target, if (a.due != null) '${s.due} ${_d(a.due)}', _repeatLabel(s, a.recurrence)].join(' · '),
                      style: t.bodySmall),
                  const SizedBox(height: 10),
                  CoachStatusBar(counts: a.counts, strings: s),
                ]),
              ),
            ),
          ),
      ]),
      [
        CoachBarAction(key: const Key('coach-library'), icon: Icons.menu_book_outlined, label: s.library, onPressed: () => onLibrary?.call()),
        CoachBarAction(key: const Key('coach-new-group'), icon: Icons.group_add_outlined, label: s.newGroup,
            onPressed: () => onNewGroup?.call(), primary: false),
      ],
    );
  }
}

/// Группа: общая ссылка + QR, ученики с поиском и сортировкой, метка «давно не занимался».
class GroupScreen extends StatefulWidget {
  const GroupScreen({super.key, required this.group, required this.students, required this.inviteLink, this.strings = CoachV2Strings.en,
      this.frame = defaultCoachFrame, this.now, this.onStudent, this.onAssign, this.onReport});
  final CoachGroup group;
  final List<CoachGroupStudent> students;
  final Uri inviteLink;
  final CoachV2Strings strings;
  final CoachFrame frame;
  final DateTime? now;
  final ValueChanged<CoachGroupStudent>? onStudent;
  final VoidCallback? onAssign, onReport;

  @override
  State<GroupScreen> createState() => _GroupScreenState();
}

class _GroupScreenState extends State<GroupScreen> {
  String _q = '';
  bool _byName = false;

  @override
  Widget build(BuildContext context) {
    final s = widget.strings;
    final c = Theme.of(context).colorScheme;
    final t = Theme.of(context).textTheme;
    final now = widget.now ?? DateTime.now();
    final list = widget.students.where((x) => x.name.toLowerCase().contains(_q.toLowerCase())).toList()
      ..sort(_byName
          ? (a, b) => a.name.compareTo(b.name)
          : (a, b) => (b.lastAt ?? DateTime(0)).compareTo(a.lastAt ?? DateTime(0)));
    final link = widget.inviteLink.toString();
    return widget.frame(
      context,
      widget.group.name,
      ListView(padding: const EdgeInsets.all(16), children: [
        CoachPanel(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              // QR всегда тёмный на белом — светлый на тёмном многие сканеры не читают.
              Container(
                color: Colors.white,
                padding: const EdgeInsets.all(6),
                child: QrImageView(
                  key: const Key('coach-group-qr'),
                  data: link,
                  size: 96,
                  padding: EdgeInsets.zero,
                  eyeStyle: const QrEyeStyle(eyeShape: QrEyeShape.square, color: Colors.black),
                  dataModuleStyle: const QrDataModuleStyle(dataModuleShape: QrDataModuleShape.square, color: Colors.black),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(s.groupLink, style: t.titleSmall),
                  const SizedBox(height: 4),
                  Text(s.groupLinkHint, style: t.bodySmall),
                  const SizedBox(height: 6),
                  TextButton.icon(
                    key: const Key('coach-group-copy'),
                    onPressed: () => Clipboard.setData(ClipboardData(text: link)),
                    icon: const Icon(Icons.copy, size: 18),
                    label: Text(s.copy),
                  ),
                ]),
              ),
            ]),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          key: const Key('coach-group-search'),
          decoration: InputDecoration(prefixIcon: const Icon(Icons.search), hintText: s.search),
          onChanged: (v) => setState(() => _q = v),
        ),
        const SizedBox(height: 8),
        Wrap(spacing: 8, children: [
          ChoiceChip(label: Text(s.sortActivity), selected: !_byName, onSelected: (_) => setState(() => _byName = false)),
          ChoiceChip(label: Text(s.sortName), selected: _byName, onSelected: (_) => setState(() => _byName = true)),
        ]),
        const SizedBox(height: 4),
        for (final st in list)
          ListTile(
            key: Key('coach-group-student-${st.connectionId}'),
            contentPadding: EdgeInsets.zero,
            leading: CircleAvatar(child: Text(st.name.characters.first)),
            title: Text(st.name),
            subtitle: Text([
              st.lastAt == null ? s.never : CoachV2Strings.n(s.lastSeen, _d(st.lastAt)),
              CoachV2Strings.n(s.weekN, st.weekTrainings),
            ].join(' · ')),
            trailing: st.idleSince(now) ? Icon(Icons.bedtime_outlined, color: c.error) : const Icon(Icons.chevron_right),
            onTap: () => widget.onStudent?.call(st),
          ),
      ]),
      [
        CoachBarAction(key: const Key('coach-group-assign'), icon: Icons.assignment_outlined, label: s.assign,
            onPressed: () => widget.onAssign?.call()),
        CoachBarAction(key: const Key('coach-group-report'), icon: Icons.insights_outlined, label: s.report,
            onPressed: () => widget.onReport?.call(), primary: false),
      ],
    );
  }
}

/// Редактор урока: шаги из каталога приложений, уровень, сколько раз / минут, порядок перетаскиванием.
class LessonEditorScreen extends StatefulWidget {
  const LessonEditorScreen({super.key, required this.catalog, this.lesson, this.strings = CoachV2Strings.en, this.frame = defaultCoachFrame,
      this.appNames = const {}, this.onSave, this.onAssign, this.stepDataEditor});
  final List<CoachStepKind> catalog;
  final CoachLesson? lesson;
  final CoachV2Strings strings;
  final CoachFrame frame;
  final Map<String, String> appNames;
  final ValueChanged<CoachLesson>? onSave, onAssign;

  /// Свой редактор данных шага у приложения (текст преподавателя, позиция FEN). Вызывается для видов с
  /// `editableData`: при добавлении шага и по «✎». null в ответе — без изменений.
  final CoachStepDataEditor? stepDataEditor;

  @override
  State<LessonEditorScreen> createState() => _LessonEditorScreenState();
}

class _LessonEditorScreenState extends State<LessonEditorScreen> {
  late final _title = TextEditingController(text: widget.lesson?.title ?? '');
  late final _goal = TextEditingController(text: widget.lesson?.goal ?? '');
  late final List<CoachLessonStep> _steps = [...?widget.lesson?.steps];

  @override
  void dispose() {
    _title.dispose();
    _goal.dispose();
    super.dispose();
  }

  CoachLesson get _lesson => CoachLesson(id: widget.lesson?.id, title: _title.text.trim(), goal: _goal.text.trim(), steps: _steps);

  Future<void> _pick() async {
    final s = widget.strings;
    final byApp = <String, List<CoachStepKind>>{};
    for (final k in widget.catalog) {
      (byApp[k.appId] ??= []).add(k);
    }
    final kind = await showModalBottomSheet<CoachStepKind>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.7,
          builder: (ctx, scroll) => ListView(controller: scroll, children: [
            Padding(padding: const EdgeInsets.all(16), child: Text(s.addStep, style: Theme.of(ctx).textTheme.titleMedium)),
            for (final e in byApp.entries) ...[
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                child: Text(widget.appNames[e.key] ?? e.key, style: Theme.of(ctx).textTheme.labelLarge),
              ),
              for (final k in e.value)
                ListTile(
                  key: Key('coach-kind-${k.appId}-${k.ref}'),
                  title: Text(k.title),
                  subtitle: k.group.isEmpty ? null : Text(k.group),
                  trailing: const Icon(Icons.add),
                  onTap: () => Navigator.of(ctx).pop(k),
                ),
            ],
          ]),
        ),
      ),
    );
    if (kind != null) {
      var step = CoachLessonStep(kind: kind, level: kind.maxLevel > 0 ? 1 : 0, amount: kind.unit == CoachStepUnit.minutes ? 5 : 3,
          data: kind.defaultData);
      final editor = widget.stepDataEditor;
      if (kind.editableData && editor != null && mounted) {
        final data = await editor(context, step);
        if (data != null) step = step.copyWith(data: data);
      }
      setState(() => _steps.add(step));
    }
  }

  Widget _stepper(int value, ValueChanged<int> on, {int min = 1, int max = 99}) => Row(mainAxisSize: MainAxisSize.min, children: [
        IconButton(visualDensity: VisualDensity.compact, onPressed: value > min ? () => on(value - 1) : null, icon: const Icon(Icons.remove)),
        Text('$value'),
        IconButton(visualDensity: VisualDensity.compact, onPressed: value < max ? () => on(value + 1) : null, icon: const Icon(Icons.add)),
      ]);

  @override
  Widget build(BuildContext context) {
    final s = widget.strings;
    final t = Theme.of(context).textTheme;
    return widget.frame(
      context,
      s.lesson,
      ListView(padding: const EdgeInsets.all(16), children: [
        TextField(key: const Key('coach-lesson-title'), controller: _title, decoration: InputDecoration(labelText: s.lessonTitle)),
        const SizedBox(height: 8),
        TextField(key: const Key('coach-lesson-goal'), controller: _goal, maxLines: 2, decoration: InputDecoration(labelText: s.lessonGoal)),
        const SizedBox(height: 16),
        ReorderableListView(
          key: const Key('coach-lesson-steps'),
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          buildDefaultDragHandles: true,
          onReorderItem: (a, b) => setState(() => _steps.insert(b, _steps.removeAt(a))),
          children: [
            for (var i = 0; i < _steps.length; i++)
              CoachPanel(
                key: ValueKey('step-$i-${_steps[i].kind.ref}'),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 8, 40, 8),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('${i + 1}. ${_steps[i].kind.title}', style: t.titleSmall),
                    Text(widget.appNames[_steps[i].kind.appId] ?? _steps[i].kind.appId, style: t.bodySmall),
                    Wrap(crossAxisAlignment: WrapCrossAlignment.center, spacing: 12, children: [
                      if (_steps[i].kind.maxLevel > 0)
                        Row(mainAxisSize: MainAxisSize.min, children: [
                          Text(s.level),
                          _stepper(_steps[i].level, (v) => setState(() => _steps[i] = _steps[i].copyWith(level: v)), max: _steps[i].kind.maxLevel),
                        ]),
                      Row(mainAxisSize: MainAxisSize.min, children: [
                        _stepper(_steps[i].amount, (v) => setState(() => _steps[i] = _steps[i].copyWith(amount: v))),
                        Text(_steps[i].kind.unit == CoachStepUnit.minutes ? s.minutes : s.times),
                      ]),
                      if (_steps[i].kind.editableData && widget.stepDataEditor != null)
                        IconButton(
                          key: Key('coach-step-data-$i'),
                          tooltip: s.change,
                          icon: const Icon(Icons.edit_outlined),
                          onPressed: () async {
                            final data = await widget.stepDataEditor!(context, _steps[i]);
                            if (data != null && mounted) setState(() => _steps[i] = _steps[i].copyWith(data: data));
                          },
                        ),
                    ]),
                  ]),
                ),
              ),
          ],
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(key: const Key('coach-add-step'), onPressed: _pick, icon: const Icon(Icons.add), label: Text(s.addStep)),
      ]),
      [
        CoachBarAction(key: const Key('coach-lesson-assign'), icon: Icons.send_outlined, label: s.assign,
            onPressed: () => widget.onAssign?.call(_lesson)),
        CoachBarAction(key: const Key('coach-lesson-save'), icon: Icons.save_outlined, label: s.save,
            onPressed: () => widget.onSave?.call(_lesson), primary: false),
      ],
    );
  }
}

/// Библиотека: шаблоны и свои уроки.
class LessonLibraryScreen extends StatelessWidget {
  const LessonLibraryScreen({super.key, required this.templates, required this.mine, this.strings = CoachV2Strings.en,
      this.frame = defaultCoachFrame, this.onOpen, this.onCopy, this.onNew});
  final List<CoachLesson> templates, mine;
  final CoachV2Strings strings;
  final CoachFrame frame;
  final ValueChanged<CoachLesson>? onOpen, onCopy;
  final VoidCallback? onNew;

  @override
  Widget build(BuildContext context) {
    final s = strings;
    final t = Theme.of(context).textTheme;
    Widget tile(CoachLesson l) => CoachPanel(
          child: ListTile(
            key: Key('coach-lib-${l.id ?? l.title}'),
            title: Text(l.title),
            subtitle: Text([
              CoachV2Strings.n(s.stepsN, l.steps.length),
              if (l.minutes > 0) '${l.minutes} ${s.minutes}',
              if (l.goal.isNotEmpty) l.goal,
            ].join(' · '), maxLines: 2, overflow: TextOverflow.ellipsis),
            trailing: l.template
                ? TextButton(onPressed: () => onCopy?.call(l), child: Text(s.copy))
                : const Icon(Icons.chevron_right),
            onTap: () => onOpen?.call(l),
          ),
        );
    return frame(
      context,
      s.library,
      ListView(padding: const EdgeInsets.all(16), children: [
        Text(s.myLessons, style: t.titleMedium),
        const SizedBox(height: 6),
        for (final l in mine) tile(l),
        const SizedBox(height: 16),
        Text(s.templates, style: t.titleMedium),
        const SizedBox(height: 6),
        for (final l in templates) tile(l),
      ]),
      [CoachBarAction(key: const Key('coach-new-lesson'), icon: Icons.add, label: s.newLesson, onPressed: () => onNew?.call())],
    );
  }
}

/// Назначение урока: кому (группы и ученики), срок, повтор.
class AssignLessonScreen extends StatefulWidget {
  const AssignLessonScreen({super.key, required this.lesson, required this.targets, this.strings = CoachV2Strings.en,
      this.frame = defaultCoachFrame, this.initialDue, this.initialRepeat = CoachRecurrence.none, this.onAssign});
  final CoachLesson lesson;

  /// Варианты «кому»: id → название (группы и ученики).
  final Map<String, String> targets;
  final CoachV2Strings strings;
  final CoachFrame frame;
  final DateTime? initialDue;
  final CoachRecurrence initialRepeat;
  final void Function(Set<String> targets, DateTime? due, CoachRecurrence repeat)? onAssign;

  @override
  State<AssignLessonScreen> createState() => _AssignLessonScreenState();
}

class _AssignLessonScreenState extends State<AssignLessonScreen> {
  late final Set<String> _to = {if (widget.targets.isNotEmpty) widget.targets.keys.first};
  late DateTime? _due = widget.initialDue;
  late CoachRecurrence _repeat = widget.initialRepeat;

  @override
  Widget build(BuildContext context) {
    final s = widget.strings;
    final t = Theme.of(context).textTheme;
    return widget.frame(
      context,
      s.assign,
      ListView(padding: const EdgeInsets.all(16), children: [
        Text(widget.lesson.title, style: t.titleLarge),
        Text(CoachV2Strings.n(s.stepsN, widget.lesson.steps.length), style: t.bodySmall),
        const SizedBox(height: 16),
        Text(s.assignTo, style: t.titleSmall),
        const SizedBox(height: 6),
        Wrap(spacing: 8, runSpacing: 6, children: [
          for (final e in widget.targets.entries)
            FilterChip(
              key: Key('coach-target-${e.key}'),
              label: Text(e.value),
              selected: _to.contains(e.key),
              onSelected: (v) => setState(() => v ? _to.add(e.key) : _to.remove(e.key)),
            ),
        ]),
        const SizedBox(height: 16),
        Text(s.due, style: t.titleSmall),
        const SizedBox(height: 6),
        OutlinedButton.icon(
          key: const Key('coach-due'),
          icon: const Icon(Icons.event_outlined),
          label: Text(_due == null ? '—' : _d(_due)),
          onPressed: () async {
            final now = DateTime.now();
            final picked = await showDatePicker(context: context, firstDate: now, lastDate: now.add(const Duration(days: 365)),
                initialDate: _due ?? now);
            if (picked != null) setState(() => _due = picked);
          },
        ),
        const SizedBox(height: 16),
        Text(s.repeat, style: t.titleSmall),
        const SizedBox(height: 6),
        Wrap(spacing: 8, runSpacing: 6, children: [
          for (final r in CoachRecurrence.values)
            ChoiceChip(
              key: Key('coach-repeat-${r.name}'),
              label: Text(_repeatLabel(s, r)),
              selected: _repeat == r,
              onSelected: (_) => setState(() => _repeat = r),
            ),
        ]),
      ]),
      [
        CoachBarAction(key: const Key('coach-assign-go'), icon: Icons.send_outlined, label: s.assign,
            onPressed: () => widget.onAssign?.call(_to, _due, _repeat)),
      ],
    );
  }
}

/// Отчёт по заданию: ученики × шаги.
class AssignmentReportScreen extends StatelessWidget {
  const AssignmentReportScreen({super.key, required this.assignment, required this.rows, this.strings = CoachV2Strings.en,
      this.frame = defaultCoachFrame, this.onStudent, this.onEdit});
  final CoachAssignment assignment;
  final List<CoachAssignmentRow> rows;
  final CoachV2Strings strings;
  final CoachFrame frame;
  final ValueChanged<CoachAssignmentRow>? onStudent;

  /// «Изменить» — срок и повтор с этого момента (прошлое не переписывается).
  final VoidCallback? onEdit;

  @override
  Widget build(BuildContext context) {
    final s = strings;
    final c = Theme.of(context).colorScheme;
    final t = Theme.of(context).textTheme;
    final steps = assignment.lesson.steps;
    return frame(
      context,
      assignment.lesson.title,
      ListView(padding: const EdgeInsets.all(16), children: [
        Text([assignment.target, if (assignment.due != null) '${s.due} ${_d(assignment.due)}', _repeatLabel(s, assignment.recurrence)].join(' · '),
            style: t.bodySmall),
        const SizedBox(height: 10),
        CoachStatusBar(counts: assignment.counts, strings: s),
        const SizedBox(height: 16),
        for (var i = 0; i < steps.length; i++)
          Text('${i + 1}. ${steps[i].kind.title} · ${steps[i].amount} ${steps[i].kind.unit == CoachStepUnit.minutes ? s.minutes : s.times}',
              style: t.bodySmall),
        const Divider(height: 24),
        for (final r in rows)
          InkWell(
            key: Key('coach-row-${r.student}'),
            onTap: () => onStudent?.call(r),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Row(children: [
                Container(width: 10, height: 10, decoration: BoxDecoration(color: _progressColor(context, r.status), shape: BoxShape.circle)),
                const SizedBox(width: 8),
                Expanded(child: Text(r.student)),
                for (var i = 0; i < steps.length; i++)
                  Container(
                    width: 34,
                    height: 26,
                    margin: const EdgeInsets.only(left: 4),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: (i < r.done.length && r.done[i] >= steps[i].amount) ? c.primaryContainer : c.surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text('${i < r.done.length ? r.done[i] : 0}/${steps[i].amount}', style: t.labelSmall),
                  ),
              ]),
            ),
          ),
      ]),
      [
        if (onEdit != null)
          CoachBarAction(key: const Key('coach-assignment-edit'), icon: Icons.edit_calendar_outlined, label: s.change, onPressed: onEdit!),
      ],
    );
  }
}

class _WeekBars extends StatelessWidget {
  const _WeekBars(this.weeks);
  final List<int> weeks;

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme;
    final t = Theme.of(context).textTheme;
    final top = weeks.isEmpty ? 1 : math.max(1, weeks.reduce(math.max));
    return SizedBox(
      height: 120,
      child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
        for (var i = 0; i < weeks.length; i++)
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 3),
              child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [
                Text('${weeks[i]}', style: t.labelSmall),
                const SizedBox(height: 2),
                Container(
                  height: 90 * weeks[i] / top,
                  decoration: BoxDecoration(
                    color: i == weeks.length - 1 ? c.primary : c.primary.withValues(alpha: 0.45),
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
              ]),
            ),
          ),
      ]),
    );
  }
}

class _SkillRow extends StatelessWidget {
  const _SkillRow(this.skill);
  final CoachSkill skill;

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme;
    final t = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(children: [
        Expanded(flex: 3, child: Text(skill.title, style: t.bodyMedium)),
        Expanded(
          flex: 4,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(value: skill.score / 100, minHeight: 8, backgroundColor: c.surfaceContainerHighest),
          ),
        ),
        SizedBox(
          width: 56,
          child: Text(
            '${skill.value ?? skill.score}${skill.trend == 0 ? '' : skill.trend > 0 ? ' ↑${skill.trend}' : ' ↓${-skill.trend}'}',
            textAlign: TextAlign.end,
            style: t.labelMedium?.copyWith(color: skill.trend < 0 ? c.error : null),
          ),
        ),
      ]),
    );
  }
}

/// Отчёт по ученику: недели, навыки, частые ошибки, комментарии и похвала.
class StudentReportScreen extends StatefulWidget {
  const StudentReportScreen({super.key, required this.report, this.strings = CoachV2Strings.en, this.frame = defaultCoachFrame,
      this.onComment});
  final CoachStudentReport report;
  final CoachV2Strings strings;
  final CoachFrame frame;
  final void Function(String text, bool praise)? onComment;

  @override
  State<StudentReportScreen> createState() => _StudentReportScreenState();
}

class _StudentReportScreenState extends State<StudentReportScreen> {
  final _text = TextEditingController();

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.strings;
    final r = widget.report;
    final t = Theme.of(context).textTheme;
    return widget.frame(
      context,
      r.name,
      ListView(padding: const EdgeInsets.all(16), children: [
        Text(s.byWeeks, style: t.titleSmall),
        const SizedBox(height: 8),
        _WeekBars(r.weeks),
        const SizedBox(height: 16),
        if (r.skills.isNotEmpty) ...[
          Text(s.skills, style: t.titleSmall),
          for (final k in r.skills) _SkillRow(k),
          const SizedBox(height: 16),
        ],
        if (r.mistakes.isNotEmpty) ...[
          Text(s.mistakes, style: t.titleSmall),
          const SizedBox(height: 6),
          Wrap(spacing: 6, runSpacing: 6, children: [for (final m in r.mistakes) Chip(label: Text(m), visualDensity: VisualDensity.compact)]),
          const SizedBox(height: 16),
        ],
        Text(s.comment, style: t.titleSmall),
        for (final cm in r.comments)
          ListTile(contentPadding: EdgeInsets.zero, dense: true, title: Text(cm.text), subtitle: Text([cm.author, _d(cm.at)].join(' · '))),
        TextField(key: const Key('coach-comment'), controller: _text, maxLines: 2, decoration: InputDecoration(hintText: s.comment)),
      ]),
      [
        CoachBarAction(key: const Key('coach-praise'), icon: Icons.emoji_events_outlined, label: s.praise,
            onPressed: () => widget.onComment?.call(_text.text.trim(), true)),
        CoachBarAction(key: const Key('coach-send-comment'), icon: Icons.send_outlined, label: s.comment,
            onPressed: () => widget.onComment?.call(_text.text.trim(), false), primary: false),
      ],
    );
  }
}

/// Отчёт по группе: средние, доля выполненного, отстающие, навыки, выгрузка.
class GroupReportScreen extends StatelessWidget {
  const GroupReportScreen({super.key, required this.report, this.strings = CoachV2Strings.en, this.frame = defaultCoachFrame,
      this.onExport});
  final CoachGroupReport report;
  final CoachV2Strings strings;
  final CoachFrame frame;
  final VoidCallback? onExport;

  @override
  Widget build(BuildContext context) {
    final s = strings;
    final t = Theme.of(context).textTheme;
    final c = Theme.of(context).colorScheme;
    Widget metric(String label, String value) => Expanded(
          child: CoachPanel(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(label, style: t.bodySmall),
                const SizedBox(height: 4),
                Text(value, style: t.headlineSmall),
              ]),
            ),
          ),
        );
    return frame(
      context,
      '${s.groupReport} · ${report.group}',
      ListView(padding: const EdgeInsets.all(16), children: [
        Row(children: [
          metric(s.avgWeek, report.avgWeekTrainings.toStringAsFixed(1)),
          metric(s.doneShare, '${(report.doneShare * 100).round()} %'),
        ]),
        const SizedBox(height: 16),
        if (report.skills.isNotEmpty) ...[
          Text(s.skills, style: t.titleSmall),
          for (final k in report.skills) _SkillRow(k),
          const SizedBox(height: 16),
        ],
        if (report.lagging.isNotEmpty) Text(s.lagging, style: t.titleSmall),
        for (final name in report.lagging)
          ListTile(contentPadding: EdgeInsets.zero, dense: true, leading: Icon(Icons.trending_down, color: c.error), title: Text(name)),
      ]),
      [CoachBarAction(key: const Key('coach-export'), icon: Icons.ios_share_outlined, label: s.export, onPressed: () => onExport?.call())],
    );
  }
}

/// Карточка «Задания от преподавателя» — приложение ставит её на главную ученику.
class StudentAssignmentsCard extends StatelessWidget {
  const StudentAssignmentsCard({super.key, required this.tasks, this.strings = CoachV2Strings.en, this.onStart});
  final List<CoachStudentTask> tasks;
  final CoachV2Strings strings;
  final void Function(CoachStudentTask task, int step)? onStart;

  @override
  Widget build(BuildContext context) {
    if (tasks.isEmpty) return const SizedBox.shrink();
    final s = strings;
    final c = Theme.of(context).colorScheme;
    final t = Theme.of(context).textTheme;
    return CoachPanel(
      key: const Key('coach-student-tasks'),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(Icons.school_outlined, color: c.primary),
            const SizedBox(width: 8),
            Expanded(child: Text(s.fromTeacher, style: t.titleMedium)),
          ]),
          for (final task in tasks) ...[
            const SizedBox(height: 12),
            Text(task.lesson.title, style: t.titleSmall),
            Text([task.coach, if (task.due != null) '${s.due} ${_d(task.due)}'].join(' · '), style: t.bodySmall),
            for (var i = 0; i < task.lesson.steps.length; i++)
              Builder(builder: (context) {
                final st = task.lesson.steps[i];
                final done = i < task.done.length ? task.done[i] : 0;
                final ok = done >= st.amount;
                return ListTile(
                  key: Key('coach-task-${task.id}-$i'),
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                  leading: Icon(ok ? Icons.check_circle : Icons.radio_button_unchecked, color: ok ? c.primary : c.outline),
                  title: Text(st.kind.title),
                  subtitle: Text(
                      '${st.kind.maxLevel > 0 ? '${s.level} ${st.level} · ' : ''}$done/${st.amount} ${st.kind.unit == CoachStepUnit.minutes ? s.minutes : s.times}'),
                  trailing: ok
                      ? Text(s.counted, style: t.labelMedium?.copyWith(color: c.primary))
                      : FilledButton.tonal(onPressed: () => onStart?.call(task, i), child: Text(s.start)),
                );
              }),
            if (task.comment != null)
              Container(
                margin: const EdgeInsets.only(top: 6),
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: c.secondaryContainer, borderRadius: BorderRadius.circular(8)),
                child: Row(children: [
                  Icon(Icons.chat_bubble_outline, size: 18, color: c.onSecondaryContainer),
                  const SizedBox(width: 8),
                  Expanded(child: Text(task.comment!, style: t.bodyMedium?.copyWith(color: c.onSecondaryContainer))),
                ]),
              ),
          ],
        ]),
      ),
    );
  }
}
