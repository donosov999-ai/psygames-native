/// Подписи кабинета. Приложение передаёт свои (из своих словарей); [CoachStrings.en] / [CoachStrings.ru] —
/// запасные, основной язык экосистемы — английский.
library;

class CoachStrings {
  const CoachStrings({
    required this.teacherTitle,
    required this.studentTitle,
    required this.yourName,
    required this.saveProfile,
    required this.noStudents,
    required this.invite,
    required this.inviteReady,
    required this.copyLink,
    required this.copied,
    required this.trainings,
    required this.noTrainings,
    required this.timeUnknown,
    required this.hiddenByStudent,
    required this.myCoaches,
    required this.noCoaches,
    required this.acceptTitle,
    required this.acceptButton,
    required this.consentText,
    required this.scopeCompletion,
    required this.scopeMetrics,
    required this.scopeErrors,
    required this.scopeHistory,
    required this.revoke,
    required this.disconnect,
    required this.unavailable,
    required this.appNames,
  });

  final String teacherTitle, studentTitle, yourName, saveProfile, noStudents, invite, inviteReady, copyLink, copied;
  final String trainings, noTrainings, timeUnknown, hiddenByStudent, myCoaches, noCoaches;
  final String acceptTitle, acceptButton, consentText, scopeCompletion, scopeMetrics, scopeErrors, scopeHistory;
  final String revoke, disconnect, unavailable;
  final Map<String, String> appNames;

  String scope(String s) => switch (s) {
        'completion' => scopeCompletion,
        'metrics' => scopeMetrics,
        'errors' => scopeErrors,
        'history' => scopeHistory,
        _ => s,
      };

  static const _apps = {'psygames': 'PsyGames', 'abstract-hub': 'Chess & Go', 'smart-alarm': 'Smart Alarm', 'typerighting': 'TypeFree'};

  static const en = CoachStrings(
    teacherTitle: 'Teacher cabinet',
    studentTitle: 'My teachers',
    yourName: 'Your name for students',
    saveProfile: 'Become a teacher',
    noStudents: 'No students yet. Send an invite link.',
    invite: 'Invite a student',
    inviteReady: 'Send this link to your student. It works once, for 7 days.',
    copyLink: 'Copy link',
    copied: 'Copied',
    trainings: 'Trainings',
    noTrainings: 'No trainings yet',
    timeUnknown: 'time unknown',
    hiddenByStudent: 'hidden by the student',
    myCoaches: 'My teachers',
    noCoaches: 'You are not connected to a teacher.',
    acceptTitle: 'Connect to a teacher',
    acceptButton: 'Connect',
    consentText: 'I agree that this teacher sees what I select below from this app, from now on. I can turn it off at any time.',
    scopeCompletion: 'What and when I completed',
    scopeMetrics: 'Scores, speed, accuracy, time',
    scopeErrors: 'My frequent mistakes',
    scopeHistory: 'All trainings, not only assignments',
    revoke: 'Stop sharing',
    disconnect: 'Disconnect',
    unavailable: 'The teacher cabinet is unavailable right now. Your training works as usual.',
    appNames: _apps,
  );

  static const ru = CoachStrings(
    teacherTitle: 'Кабинет преподавателя',
    studentTitle: 'Мои преподаватели',
    yourName: 'Ваше имя для учеников',
    saveProfile: 'Стать преподавателем',
    noStudents: 'Учеников пока нет. Отправьте ссылку-приглашение.',
    invite: 'Пригласить ученика',
    inviteReady: 'Отправьте эту ссылку ученику. Она одноразовая и действует 7 дней.',
    copyLink: 'Скопировать ссылку',
    copied: 'Скопировано',
    trainings: 'Тренировки',
    noTrainings: 'Тренировок пока нет',
    timeUnknown: 'время неизвестно',
    hiddenByStudent: 'скрыто учеником',
    myCoaches: 'Мои преподаватели',
    noCoaches: 'Вы не подключены к преподавателю.',
    acceptTitle: 'Подключиться к преподавателю',
    acceptButton: 'Подключиться',
    consentText: 'Я согласен, что этот преподаватель видит выбранное ниже из этого приложения — с этого момента. Отключить можно в любой момент.',
    scopeCompletion: 'Что и когда я выполнил',
    scopeMetrics: 'Очки, скорость, точность, время',
    scopeErrors: 'Мои частые ошибки',
    scopeHistory: 'Все тренировки, не только задания',
    revoke: 'Перестать показывать',
    disconnect: 'Отключиться',
    unavailable: 'Кабинет преподавателя сейчас недоступен. Тренировки работают как обычно.',
    appNames: _apps,
  );
}
