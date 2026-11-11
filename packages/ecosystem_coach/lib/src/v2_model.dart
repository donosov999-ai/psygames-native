/// Кабинет v2: группы, уроки (программы), задания, отчёты. Модели совпадают с ответами сервера coach/3.
library;

/// Режим интерфейса приложения: ученик видит игры и свои задания, преподаватель — кабинет.
enum CoachRole { student, teacher }

/// Шаг урока, который приложение умеет предложить (свой каталог у каждого приложения).
class CoachStepKind {
  const CoachStepKind({required this.appId, required this.ref, required this.title, this.group = '', this.maxLevel = 0,
      this.unit = CoachStepUnit.times});
  final String appId;

  /// Стабильный ключ упражнения: `mode` или `exercise_ref`, которым приложение шлёт тренировку.
  final String ref;
  final String title;

  /// Раздел каталога («Внимание», «Курс печати», «Задачи Lichess»…).
  final String group;

  /// 0 — у упражнения нет уровней.
  final int maxLevel;
  final CoachStepUnit unit;

  Map<String, Object?> toJson() =>
      {'app_id': appId, 'ref': ref, 'title': title, 'group': group, 'max_level': maxLevel, 'unit': unit.name};
  factory CoachStepKind.fromJson(Map<String, Object?> j) => CoachStepKind(
        appId: '${j['app_id']}',
        ref: '${j['ref']}',
        title: '${j['title']}',
        group: '${j['group'] ?? ''}',
        maxLevel: (j['max_level'] as num?)?.toInt() ?? 0,
        unit: CoachStepUnit.values.firstWhere((u) => u.name == j['unit'], orElse: () => CoachStepUnit.times),
      );
}

enum CoachStepUnit { times, minutes }

/// Шаг урока: что, на каком уровне, сколько.
class CoachLessonStep {
  const CoachLessonStep({required this.kind, this.level = 0, this.amount = 1, this.note = ''});
  final CoachStepKind kind;
  final int level;
  final int amount;
  final String note;

  CoachLessonStep copyWith({int? level, int? amount, String? note}) =>
      CoachLessonStep(kind: kind, level: level ?? this.level, amount: amount ?? this.amount, note: note ?? this.note);

  Map<String, Object?> toJson() => {
        'app_id': kind.appId,
        'ref': kind.ref,
        'title': kind.title,
        if (kind.maxLevel > 0) 'level': level,
        'amount': amount,
        'unit': kind.unit.name,
        if (note.isNotEmpty) 'note': note,
      };
}

class CoachLesson {
  const CoachLesson({this.id, required this.title, this.goal = '', this.steps = const [], this.template = false});
  final String? id;
  final String title, goal;
  final List<CoachLessonStep> steps;

  /// Шаблон из библиотеки (не свой).
  final bool template;

  int get minutes => steps.where((s) => s.kind.unit == CoachStepUnit.minutes).fold(0, (a, s) => a + s.amount);
}

class CoachGroup {
  const CoachGroup({required this.id, required this.name, this.students = 0, this.activeAssignments = 0, this.idle = 0});
  final String id, name;
  final int students, activeAssignments;

  /// Сколько учеников группы давно не занимались.
  final int idle;
}

class CoachGroupStudent {
  const CoachGroupStudent({required this.connectionId, required this.name, this.lastAt, this.weekTrainings = 0, this.apps = const []});
  final String connectionId, name;
  final DateTime? lastAt;
  final int weekTrainings;
  final List<String> apps;

  bool idleSince(DateTime now, {int days = 7}) => lastAt == null || now.difference(lastAt!).inDays >= days;
}

enum CoachRecurrence { none, daily, weekdays, weekly }

/// Статус ученика по заданию.
enum CoachProgress { done, inProgress, notStarted, overdue }

class CoachAssignment {
  const CoachAssignment({required this.id, required this.lesson, required this.target, this.due, this.recurrence = CoachRecurrence.none,
      this.counts = const {}});
  final String id;
  final CoachLesson lesson;

  /// Кому: имя группы или ученика.
  final String target;
  final DateTime? due;
  final CoachRecurrence recurrence;
  final Map<CoachProgress, int> counts;

  int get total => counts.values.fold(0, (a, b) => a + b);
}

/// Строка отчёта по заданию: ученик × шаги (сколько сделано из нужного).
class CoachAssignmentRow {
  const CoachAssignmentRow({required this.student, required this.done, required this.status, this.lastAt});
  final String student;
  final List<int> done;
  final CoachProgress status;
  final DateTime? lastAt;
}

class CoachSkill {
  const CoachSkill({required this.title, required this.score, this.trend = 0});
  final String title;

  /// 0..100 — средний результат по навыку.
  final int score;

  /// Изменение за неделю, в пунктах.
  final int trend;
}

class CoachStudentReport {
  const CoachStudentReport({required this.name, this.weeks = const [], this.skills = const [], this.mistakes = const [],
      this.comments = const []});
  final String name;

  /// Тренировок по неделям, старые → новые.
  final List<int> weeks;
  final List<CoachSkill> skills;
  final List<String> mistakes;
  final List<CoachComment> comments;
}

class CoachComment {
  const CoachComment({required this.author, required this.text, this.at});
  final String author, text;
  final DateTime? at;
}

class CoachGroupReport {
  const CoachGroupReport({required this.group, this.avgWeekTrainings = 0, this.doneShare = 0, this.lagging = const [], this.skills = const []});
  final String group;
  final double avgWeekTrainings;

  /// Доля выполненных заданий, 0..1.
  final double doneShare;
  final List<String> lagging;
  final List<CoachSkill> skills;
}

/// Задание у ученика: урок, прогресс по шагам, комментарий преподавателя.
class CoachStudentTask {
  const CoachStudentTask({required this.id, required this.lesson, required this.coach, required this.done, this.due, this.comment});
  final String id;
  final CoachLesson lesson;
  final String coach;
  final List<int> done;
  final DateTime? due;
  final String? comment;

  bool get complete => [for (var i = 0; i < lesson.steps.length; i++) done.length > i && done[i] >= lesson.steps[i].amount].every((x) => x);
}
