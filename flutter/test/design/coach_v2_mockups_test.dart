// Макеты кабинета v2 на согласование (план ~/.claude/plans/magical-wandering-teapot.md, Ф0): НАСТОЯЩИЕ экраны пакета
// ecosystem_coach в рамке и теме PsyGames, подставные данные. Без флага — проба экранов, без записи файлов.
// Снять: flutter test test/design/coach_v2_mockups_test.dart --dart-define=CAPTURE_COACH=true
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
final _now = DateTime(2026, 11, 11, 15);

List<CoachStepKind> _catalog(bool ru) => [
      CoachStepKind(appId: 'psygames', ref: 'schulte_table', title: L.t('schulteTable'), group: ru ? 'Внимание' : 'Attention', maxLevel: 20),
      CoachStepKind(appId: 'psygames', ref: 'stroop', title: L.t('stroop'), group: ru ? 'Торможение' : 'Inhibition', unit: CoachStepUnit.minutes),
      CoachStepKind(appId: 'psygames', ref: 'digit_span', title: L.t('digitSpan'), group: ru ? 'Память' : 'Memory', maxLevel: 15),
      CoachStepKind(appId: 'psygames', ref: 'n_back', title: L.t('nBack'), group: ru ? 'Память' : 'Memory', maxLevel: 10),
      CoachStepKind(appId: 'abstract-hub', ref: 'lichess:mateIn1', title: ru ? 'Мат в 1 ход — задачи Lichess' : 'Mate in 1 — Lichess puzzles', group: ru ? 'Тактика' : 'Tactics'),
      CoachStepKind(appId: 'abstract-hub', ref: 'go-capture', title: ru ? 'Го: взятие камней' : 'Go: capturing stones', group: ru ? 'Го' : 'Go', maxLevel: 10),
      CoachStepKind(appId: 'typerighting', ref: 'course:12', title: ru ? 'Курс печати — урок 12' : 'Typing course — lesson 12', group: ru ? 'Курс' : 'Course'),
      CoachStepKind(appId: 'typerighting', ref: 'practice', title: ru ? 'Практика печати' : 'Typing practice', unit: CoachStepUnit.minutes),
      CoachStepKind(appId: 'smart-alarm', ref: 'breathing', title: ru ? 'Дыхание' : 'Breathing', unit: CoachStepUnit.minutes),
      CoachStepKind(appId: 'smart-alarm', ref: 'eye-gym', title: ru ? 'Гимнастика для глаз' : 'Eye exercises', unit: CoachStepUnit.minutes),
    ];

CoachLesson _lesson(bool ru) {
  final k = _catalog(ru);
  return CoachLesson(
    id: 'l1',
    title: ru ? 'Внимание: 15 минут' : 'Attention: 15 minutes',
    goal: ru ? 'Разогрев перед уроком: внимание, торможение, память' : 'Warm-up before class: attention, inhibition, memory',
    steps: [
      CoachLessonStep(kind: k[0], level: 3, amount: 3),
      CoachLessonStep(kind: k[1], amount: 5),
      CoachLessonStep(kind: k[2], level: 4, amount: 2),
    ],
  );
}

class _Shot {
  _Shot(this.name, this.build);
  final String name;
  final Widget Function(bool ru, CoachV2Strings s) build;
}

void main() {
  final boundary = GlobalKey();

  setUpAll(() async {
    final icons = await rootBundle.load('fonts/MaterialIcons-Regular.otf');
    await (FontLoader('MaterialIcons')..addFont(Future.value(icons))).load();
    if (Platform.isMacOS) {
      for (final family in ['CoachPreview', 'Roboto', '.SF Pro Text']) {
        await (FontLoader(family)
              ..addFont(Future.value(File('/System/Library/Fonts/Supplemental/Arial.ttf').readAsBytesSync().buffer.asByteData())))
            .load();
      }
    }
  });

  final shots = <_Shot>[
    _Shot('01-teacher-home', (ru, s) => TeacherHomeScreen(
          strings: s,
          title: ru ? 'Кабинет преподавателя' : 'Teacher cabinet',
          frame: psyCoachFrame,
          header: CoachRoleSwitch(role: CoachRole.teacher, onChanged: (_) {}, strings: s),
          groups: [
            CoachGroup(id: 'g1', name: ru ? '5А' : 'Grade 5A', students: 24, activeAssignments: 2, idle: 3),
            CoachGroup(id: 'g2', name: ru ? 'Шахматы, вторник' : 'Chess, Tuesday', students: 8, activeAssignments: 1),
            CoachGroup(id: 'g3', name: ru ? 'Индивидуально' : 'One-to-one', students: 3, activeAssignments: 1, idle: 1),
          ],
          assignments: [
            CoachAssignment(id: 'a1', lesson: _lesson(ru), target: ru ? '5А' : 'Grade 5A', due: DateTime(2026, 11, 14),
                recurrence: CoachRecurrence.weekdays,
                counts: const {CoachProgress.done: 12, CoachProgress.inProgress: 5, CoachProgress.notStarted: 4, CoachProgress.overdue: 3}),
            CoachAssignment(id: 'a2', lesson: CoachLesson(title: ru ? 'Тактика: мат в 1' : 'Tactics: mate in 1', steps: [CoachLessonStep(kind: _catalog(ru)[4], amount: 10)]),
                target: ru ? 'Шахматы, вторник' : 'Chess, Tuesday', due: DateTime(2026, 11, 18),
                counts: const {CoachProgress.done: 3, CoachProgress.inProgress: 2, CoachProgress.notStarted: 3}),
          ],
        )),
    _Shot('02-group', (ru, s) => GroupScreen(
          strings: s,
          frame: psyCoachFrame,
          now: _now,
          group: CoachGroup(id: 'g1', name: ru ? '5А' : 'Grade 5A', students: 24),
          inviteLink: Uri.parse('com.psygames.app://coach/invite?code=a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718'),
          students: [
            CoachGroupStudent(connectionId: 'c1', name: ru ? 'Алекс' : 'Alex', lastAt: _now.subtract(const Duration(hours: 2)), weekTrainings: 9),
            CoachGroupStudent(connectionId: 'c2', name: ru ? 'Маша' : 'Mia', lastAt: _now.subtract(const Duration(days: 1)), weekTrainings: 6),
            CoachGroupStudent(connectionId: 'c3', name: ru ? 'Иван' : 'Ivan', lastAt: _now.subtract(const Duration(days: 9)), weekTrainings: 0),
            CoachGroupStudent(connectionId: 'c4', name: ru ? 'Соня' : 'Sophie', weekTrainings: 0),
          ],
        )),
    _Shot('03-lesson-editor', (ru, s) => LessonEditorScreen(strings: s, frame: psyCoachFrame, lesson: _lesson(ru), catalog: _catalog(ru),
        appNames: CoachStrings.en.appNames)),
    _Shot('04-library', (ru, s) => LessonLibraryScreen(strings: s, frame: psyCoachFrame, mine: [_lesson(ru)], templates: [
          CoachLesson(title: ru ? 'Слепая печать: неделя 1' : 'Touch typing: week 1', template: true, goal: ru ? 'Домашний ряд, 10 минут в день' : 'Home row, 10 min a day',
              steps: [CoachLessonStep(kind: _catalog(ru)[6], amount: 1), CoachLessonStep(kind: _catalog(ru)[7], amount: 10)]),
          CoachLesson(title: ru ? 'Утро без телефона' : 'Phone-free morning', template: true,
              steps: [CoachLessonStep(kind: _catalog(ru)[8], amount: 5), CoachLessonStep(kind: _catalog(ru)[9], amount: 3)]),
          CoachLesson(title: ru ? 'Память: N-back неделя' : 'Memory: N-back week', template: true,
              steps: [CoachLessonStep(kind: _catalog(ru)[3], level: 2, amount: 5)]),
        ])),
    _Shot('05-assign', (ru, s) => AssignLessonScreen(strings: s, frame: psyCoachFrame, lesson: _lesson(ru), initialDue: DateTime(2026, 11, 14),
        targets: {'g1': ru ? '5А' : 'Grade 5A', 'g2': ru ? 'Шахматы, вторник' : 'Chess, Tuesday', 'c1': ru ? 'Алекс' : 'Alex', 'c3': ru ? 'Иван' : 'Ivan'})),
    _Shot('06-assignment-report', (ru, s) => AssignmentReportScreen(strings: s, frame: psyCoachFrame,
          assignment: CoachAssignment(id: 'a1', lesson: _lesson(ru), target: ru ? '5А' : 'Grade 5A', due: DateTime(2026, 11, 14),
              recurrence: CoachRecurrence.weekdays,
              counts: const {CoachProgress.done: 12, CoachProgress.inProgress: 5, CoachProgress.notStarted: 4, CoachProgress.overdue: 3}),
          rows: [
            CoachAssignmentRow(student: ru ? 'Алекс' : 'Alex', done: const [3, 5, 2], status: CoachProgress.done),
            CoachAssignmentRow(student: ru ? 'Маша' : 'Mia', done: const [3, 2, 0], status: CoachProgress.inProgress),
            CoachAssignmentRow(student: ru ? 'Соня' : 'Sophie', done: const [0, 0, 0], status: CoachProgress.notStarted),
            CoachAssignmentRow(student: ru ? 'Иван' : 'Ivan', done: const [1, 0, 0], status: CoachProgress.overdue),
          ])),
    _Shot('07-student-report', (ru, s) => StudentReportScreen(strings: s, frame: psyCoachFrame,
          report: CoachStudentReport(name: ru ? 'Маша' : 'Mia', weeks: const [3, 5, 4, 7, 6, 9], skills: [
            CoachSkill(title: ru ? 'Внимание' : 'Attention', score: 78, trend: 6),
            CoachSkill(title: ru ? 'Память' : 'Memory', score: 61, trend: 3),
            CoachSkill(title: ru ? 'Торможение' : 'Inhibition', score: 44, trend: -5),
          ], mistakes: ru ? const ['Струп: цвет вместо слова', 'Цифры: путает порядок', 'Шульте: пропуск 17'] : const [
            'Stroop: colour instead of word', 'Digits: order swaps', 'Schulte: skips 17'
          ], comments: [
            CoachComment(author: ru ? 'Анна Петровна' : 'Ms Anna', text: ru ? 'Отличная неделя, держим темп!' : 'Great week, keep it up!', at: DateTime(2026, 11, 8)),
          ]))),
    _Shot('08-group-report', (ru, s) => GroupReportScreen(strings: s, frame: psyCoachFrame,
          report: CoachGroupReport(group: ru ? '5А' : 'Grade 5A', avgWeekTrainings: 5.4, doneShare: 0.63,
              lagging: ru ? const ['Иван — 9 дней без тренировок', 'Соня — не начала задание'] : const ['Ivan — 9 days without training', 'Sophie — not started'],
              skills: [
                CoachSkill(title: ru ? 'Внимание' : 'Attention', score: 71, trend: 4),
                CoachSkill(title: ru ? 'Память' : 'Memory', score: 58, trend: 1),
                CoachSkill(title: ru ? 'Торможение' : 'Inhibition', score: 49, trend: -2),
              ]))),
    _Shot('09-student-tasks', (ru, s) => Scaffold(
          appBar: AppBar(title: const Text('PsyGames')),
          body: ListView(padding: const EdgeInsets.all(16), children: [
            StudentAssignmentsCard(strings: s, tasks: [
              CoachStudentTask(id: 't1', lesson: _lesson(ru), coach: ru ? 'Анна Петровна' : 'Ms Anna', done: const [3, 2, 0],
                  due: DateTime(2026, 11, 14), comment: ru ? 'Начни с Шульте, потом Струп — как на уроке.' : 'Start with Schulte, then Stroop — like in class.'),
            ]),
          ]),
        )),
    _Shot('10-role-switch-settings', (ru, s) => Scaffold(
          appBar: AppBar(title: Text(ru ? 'Настройки' : 'Settings')),
          body: Padding(padding: const EdgeInsets.all(16), child: CoachRoleSwitch(role: CoachRole.student, onChanged: (_) {}, strings: s)),
        )),
  ];

  for (final cfg in const [('ru', true), ('en', false)]) {
    final locale = cfg.$1;
    final dark = cfg.$2;
    for (final shot in shots) {
      testWidgets('макет ${shot.name} · $locale · ${dark ? 'тёмная' : 'светлая'}', (t) async {
        t.view.physicalSize = const Size(390 * 2, 844 * 2);
        t.view.devicePixelRatio = 2;
        addTearDown(t.view.reset);
        SharedPreferences.setMockInitialValues(
            {uiTemplateKey: 'aurora_v1', AppLook.overrideKey: dark ? 'dark' : 'light', 'language': locale});
        final state = await SharedState.open();
        await t.runAsync(() async {
          await L.load(locale);
          await AppLook.load(state);
        });
        var theme = appShellTheme(state, brightness: dark ? Brightness.dark : Brightness.light);
        if (Platform.isMacOS) theme = theme.copyWith(textTheme: theme.textTheme.apply(fontFamily: 'CoachPreview'));
        final s = locale == 'ru' ? CoachV2Strings.ru : CoachV2Strings.en;
        await t.pumpWidget(RepaintBoundary(
          key: boundary,
          child: MaterialApp(debugShowCheckedModeBanner: false, theme: theme, darkTheme: theme,
              themeMode: dark ? ThemeMode.dark : ThemeMode.light, home: shot.build(locale == 'ru', s)),
        ));
        await t.pumpAndSettle();
        expect(t.takeException(), isNull);
        if (!_capture) return;
        await t.runAsync(() async {
          final render = boundary.currentContext!.findRenderObject()! as RenderRepaintBoundary;
          final image = await render.toImage(pixelRatio: 2);
          final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
          final file = File('test/design/preview/coach-v2-${shot.name}-$locale.png');
          await file.parent.create(recursive: true);
          await file.writeAsBytes(bytes!.buffer.asUint8List());
          image.dispose();
        });
      });
    }
  }
}
