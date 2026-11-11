/// Экраны кабинета — одни на 4 приложения. Рамку (шапку, нижний ряд, фон) даёт приложение через [CoachFrame]:
/// в PsyGames это общий каркас игр, у остальных — их собственный. Пакет рисует только содержимое.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

import 'auth.dart';
import 'client.dart';
import 'model.dart';
import 'strings.dart';

/// Рамка экрана приложения: заголовок + содержимое (+ кнопки нижнего ряда, если есть).
typedef CoachFrame = Widget Function(BuildContext context, String title, Widget body, List<CoachBarAction> actions);

class CoachBarAction {
  const CoachBarAction({required this.icon, required this.label, required this.onPressed, this.key, this.primary = true});
  final IconData icon;
  final String label;
  final VoidCallback onPressed;
  final Key? key;

  /// Главное действие экрана — крупная кнопка; второстепенное (выход) — текстовая.
  final bool primary;
}

/// Как подписать тренировку: приложение отдаёт название игры/упражнения на своём языке.
typedef CoachEventTitle = String Function(CoachEventView event);

/// Строка показателей тренировки; своя у приложения, если стандартной мало.
typedef CoachMetricsLine = String Function(CoachEventView event, CoachStrings strings);

String _humanize(String raw) {
  final t = raw.replaceAll(RegExp(r'[_\-:]+'), ' ').trim();
  return t.isEmpty ? raw : t[0].toUpperCase() + t.substring(1);
}

String defaultEventTitle(CoachEventView e) => _humanize(e.exerciseRef ?? e.mode ?? e.kind);

String _clock(num seconds) {
  final s = seconds.round();
  return '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';
}

/// Показатели тренировки человеческими словами: «Счёт 128 · Время 0:41 · Уровень 7 · Ошибки 1».
String coachMetricsLine(CoachEventView e, CoachStrings s) {
  final parts = <String>[];
  final m = e.metrics ?? const <String, Object?>{};
  final shown = <String>{};
  void add(String key, String label, String Function(Object v) fmt) {
    final v = m[key];
    if (v == null || shown.contains(label)) return;
    shown.add(label);
    parts.add('$label ${fmt(v)}');
  }
  add('score', s.metricScore, (v) => '$v');
  add('time_seconds', s.metricTime, (v) => v is num ? _clock(v) : '$v');
  add('seconds', s.metricTime, (v) => v is num ? _clock(v) : '$v');
  add('elapsed_ms', s.metricTime, (v) => v is num ? _clock(v / 1000) : '$v');
  add('duration_min', s.metricTime, (v) => v is num ? _clock(v * 60) : '$v');
  add('level', s.metricLevel, (v) => '$v');
  add('wpm', 'WPM', (v) => '$v');
  final acc = m['accuracy'];
  if (acc != null) parts.add('$acc %');
  add('errors', s.metricErrors, (v) => '$v');
  // Служебные поля, которые преподавателю ничего не говорят.
  const skip = {'score', 'time_seconds', 'seconds', 'elapsed_ms', 'duration_min', 'level', 'wpm', 'accuracy', 'errors', 'language', 'source'};
  for (final k in m.keys) {
    if (skip.contains(k)) continue;
    parts.add('${_humanize(k)} ${m[k]}');
  }
  final errs = e.errors;
  if (errs != null && errs.isNotEmpty && !shown.contains(s.metricErrors)) {
    if (errs['count'] is num) {
      parts.add('${s.metricErrors} ${errs['count']}');
    } else {
      // Словарь «что → сколько раз» (например, клавиши): сумма и три самые частые.
      final counts = [for (final x in errs.entries) if (x.value is num) MapEntry(x.key, (x.value as num))]
        ..sort((a, b) => b.value.compareTo(a.value));
      if (counts.isNotEmpty) {
        final total = counts.fold<num>(0, (a, x) => a + x.value);
        parts.add('${s.metricErrors} $total (${counts.take(3).map((x) => '${x.key}×${x.value}').join(', ')})');
      }
    }
  }
  return parts.join(' · ');
}

/// Рамка по умолчанию — простой Scaffold (для проб и приложений без своего каркаса).
Widget defaultCoachFrame(BuildContext context, String title, Widget body, List<CoachBarAction> actions) => Scaffold(
      appBar: AppBar(title: Text(title)),
      body: SafeArea(child: body),
      bottomNavigationBar: actions.isEmpty
          ? null
          : SafeArea(
              child: Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
                for (final a in actions)
                  a.primary
                      ? FilledButton.icon(key: a.key, onPressed: a.onPressed, icon: Icon(a.icon), label: Text(a.label))
                      : TextButton(key: a.key, onPressed: a.onPressed, child: Text(a.label)),
              ]),
            ),
    );

String _date(DateTime? d) => d == null ? '' : '${d.toLocal().day.toString().padLeft(2, '0')}.${d.toLocal().month.toString().padLeft(2, '0')} '
    '${d.toLocal().hour.toString().padLeft(2, '0')}:${d.toLocal().minute.toString().padLeft(2, '0')}';

/// Кабинет преподавателя: профиль, ученики по всем приложениям, приглашение в текущее приложение.
class TeacherCabinetScreen extends StatefulWidget {
  const TeacherCabinetScreen({super.key, required this.client, this.strings = CoachStrings.en, this.frame = defaultCoachFrame, this.auth,
      this.eventTitle = defaultEventTitle, this.metricsLine = coachMetricsLine});
  final CoachClient client;
  final CoachAuth? auth;
  final CoachEventTitle eventTitle;
  final CoachMetricsLine metricsLine;
  final CoachStrings strings;
  final CoachFrame frame;

  @override
  State<TeacherCabinetScreen> createState() => _TeacherCabinetScreenState();
}

class _TeacherCabinetScreenState extends State<TeacherCabinetScreen> {
  CoachDashboard? _data;
  String? _error;
  final _name = TextEditingController();

  @override
  void initState() {
    super.initState();
    widget.auth?.addListener(_onAuth);
    _load();
  }

  void _onAuth() {
    if (!mounted) return;
    setState(() => _data = null);
    _load();
  }

  @override
  void dispose() {
    widget.auth?.removeListener(_onAuth);
    _name.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (widget.auth != null && !widget.auth!.signedIn) return;
    try {
      final d = await widget.client.dashboard();
      if (mounted) setState(() { _data = d; _error = null; });
    } on CoachException catch (e) {
      if (mounted) setState(() => _error = e.code);
    }
  }

  Future<void> _invite() async {
    final s = widget.strings;
    try {
      final inv = await widget.client.createInvite();
      if (!mounted) return;
      final link = Uri(scheme: coachApps[inv.appId], host: 'coach', path: '/invite', queryParameters: {'code': inv.code}).toString();
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          key: const Key('coach-invite-dialog'),
          title: Text(s.invite),
          content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(s.inviteReady),
            const SizedBox(height: 12),
            SelectableText(link, key: const Key('coach-invite-link')),
          ]),
          actions: [
            TextButton(
              onPressed: () {
                Clipboard.setData(ClipboardData(text: link));
                Navigator.of(ctx).pop();
                ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(s.copied)));
              },
              child: Text(s.copyLink),
            ),
          ],
        ),
      );
    } on CoachException catch (e) {
      if (mounted) setState(() => _error = e.code);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.strings;
    final d = _data;
    final auth = widget.auth;
    final Widget body;
    if (auth != null && !auth.signedIn) {
      body = CoachSignIn(auth: auth, strings: s);
    } else if (_error != null && d == null) {
      body = Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(s.unavailable, key: const Key('coach-unavailable'), textAlign: TextAlign.center)));
    } else if (d == null) {
      body = const Center(child: CircularProgressIndicator());
    } else if (!d.isCoach) {
      body = ListView(padding: const EdgeInsets.all(20), children: [
        TextField(key: const Key('coach-name'), controller: _name, decoration: InputDecoration(labelText: s.yourName), maxLength: 120),
        const SizedBox(height: 12),
        FilledButton(
          key: const Key('coach-save-profile'),
          onPressed: () async {
            if (_name.text.trim().isEmpty) return;
            await widget.client.saveProfile(_name.text);
            await _load();
          },
          child: Text(s.saveProfile),
        ),
      ]);
    } else if (d.students.isEmpty) {
      body = Center(child: Text(s.noStudents, key: const Key('coach-no-students'), textAlign: TextAlign.center));
    } else {
      body = RefreshIndicator(
        onRefresh: _load,
        child: ListView(key: const Key('coach-students'), padding: const EdgeInsets.all(12), children: [
          for (final st in d.students)
            Card(
              child: ListTile(
                key: Key('coach-student-${st.connectionId}'),
                title: Text(st.name),
                subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  for (final a in st.apps)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text.rich(TextSpan(children: [
                        TextSpan(text: '${s.appNames[a.appId] ?? a.appId}  ', style: const TextStyle(fontWeight: FontWeight.w600)),
                        TextSpan(text: [
                          s.eventsCount.replaceAll('{n}', '${a.events}'),
                          if (a.lastAt != null) s.lastAt.replaceAll('{date}', _date(a.lastAt)),
                        ].join(' · ')),
                      ])),
                    ),
                ]),
                onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(
                    builder: (_) => StudentDetailScreen(
                        client: widget.client, student: st, strings: s, frame: widget.frame, eventTitle: widget.eventTitle,
                        metricsLine: widget.metricsLine))),
              ),
            ),
        ]),
      );
    }
    return widget.frame(context, s.teacherTitle, body, [
      if ((d?.isCoach ?? false) && (auth == null || auth.signedIn))
        CoachBarAction(key: const Key('coach-invite'), icon: Icons.person_add_alt_1, label: s.invite, onPressed: _invite),
      if (auth != null && auth.signedIn)
        CoachBarAction(key: const Key('coach-sign-out'), icon: Icons.logout, label: s.signOut, onPressed: auth.signOut, primary: false),
    ]);
  }
}

/// Тренировки одного ученика по каждому приложению, где он дал согласие.
class StudentDetailScreen extends StatefulWidget {
  const StudentDetailScreen({super.key, required this.client, required this.student, this.strings = CoachStrings.en, this.frame = defaultCoachFrame,
      this.eventTitle = defaultEventTitle, this.metricsLine = coachMetricsLine});
  final CoachEventTitle eventTitle;
  final CoachMetricsLine metricsLine;
  final CoachClient client;
  final CoachLink student;
  final CoachStrings strings;
  final CoachFrame frame;

  @override
  State<StudentDetailScreen> createState() => _StudentDetailScreenState();
}

class _StudentDetailScreenState extends State<StudentDetailScreen> {
  final _events = <String, List<CoachEventView>>{};

  @override
  void initState() {
    super.initState();
    for (final a in widget.student.apps) {
      widget.client.studentEvents(connectionId: widget.student.connectionId, app: a.appId).then((ev) {
        if (mounted) setState(() => _events[a.appId] = ev);
      }, onError: (_) {});
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.strings;
    return widget.frame(
      context,
      widget.student.name,
      ListView(padding: const EdgeInsets.all(12), children: [
        for (final a in widget.student.apps) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 12, 4, 4),
            child: Text(s.appNames[a.appId] ?? a.appId, style: Theme.of(context).textTheme.titleMedium),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 0, 4, 4),
            child: Text(s.sharedScopes, style: Theme.of(context).textTheme.labelMedium),
          ),
          Wrap(spacing: 6, runSpacing: 4, children: [
            for (final sc in a.scopes)
              Chip(avatar: const Icon(Icons.visibility_outlined, size: 16), label: Text(s.scope(sc)), visualDensity: VisualDensity.compact),
          ]),
          if ((_events[a.appId] ?? const []).isEmpty)
            Padding(padding: const EdgeInsets.all(8), child: Text(s.noTrainings))
          else
            for (final e in _events[a.appId]!)
              ListTile(
                key: Key('coach-event-${e.id}'),
                dense: true,
                title: Text([if (e.kind == 'warmup') s.warmup, widget.eventTitle(e)].join(' · ')),
                subtitle: Text([
                  e.occurredAt != null ? _date(e.occurredAt) : '${_date(e.receivedAt)} (${s.timeUnknown})',
                  if (widget.metricsLine(e, s).isNotEmpty) widget.metricsLine(e, s),
                ].join('\n')),
              ),
        ],
      ]),
      const [],
    );
  }
}

/// Ученик открыл ссылку-приглашение: кто приглашает, что будет видно (галочки областей), явное согласие.
class AcceptInviteScreen extends StatefulWidget {
  const AcceptInviteScreen({super.key, required this.client, required this.code, this.studentName = '',
      this.strings = CoachStrings.en, this.frame = defaultCoachFrame, this.onDone, this.auth, this.scopes = coachScopes});
  final CoachClient client;
  final CoachAuth? auth;

  /// Какие области есть у приложения (у Smart Alarm нет «ошибок»). completion — всегда.
  final List<String> scopes;
  final String code, studentName;
  final CoachStrings strings;
  final CoachFrame frame;
  final ValueChanged<String>? onDone;

  @override
  State<AcceptInviteScreen> createState() => _AcceptInviteScreenState();
}

class _AcceptInviteScreenState extends State<AcceptInviteScreen> {
  InvitePreview? _preview;
  String? _error;
  // По умолчанию преподаватель видит тренировки (history): без неё, пока нет заданий, он не видит ничего.
  late final _scopes = <String>{'completion', 'metrics', 'history'}.where(widget.scopes.contains).toSet();
  bool _consent = false;
  late final _name = TextEditingController(text: widget.studentName);

  @override
  void dispose() {
    widget.auth?.removeListener(_onAuth);
    _name.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _name.addListener(() => setState(() {}));
    widget.auth?.addListener(_onAuth);
    _loadPreview();
  }

  void _onAuth() {
    if (!mounted) return;
    setState(() { _preview = null; _error = null; });
    _loadPreview();
  }

  void _loadPreview() {
    if (widget.auth != null && !widget.auth!.signedIn) return;
    widget.client.previewInvite(widget.code).then((p) {
      if (mounted) setState(() => _preview = p);
    }, onError: (Object e) {
      if (mounted) setState(() => _error = e is CoachException ? e.code : 'coach_unavailable');
    });
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.strings;
    final p = _preview;
    final auth = widget.auth;
    final body = auth != null && !auth.signedIn
        ? CoachSignIn(auth: auth, strings: s)
        : _error != null
        ? Center(child: Text(s.unavailable, key: const Key('coach-invite-unavailable'), textAlign: TextAlign.center))
        : p == null
            ? const Center(child: CircularProgressIndicator())
            : ListView(padding: const EdgeInsets.all(16), children: [
                Text(p.coachName, key: const Key('coach-invite-coach'), style: Theme.of(context).textTheme.headlineSmall),
                Text(s.appNames[p.appId] ?? p.appId),
                const SizedBox(height: 16),
                TextField(key: const Key('coach-student-name'), controller: _name, maxLength: 120,
                    decoration: InputDecoration(labelText: s.studentName)),
                for (final sc in widget.scopes)
                  CheckboxListTile(
                    key: Key('coach-scope-$sc'),
                    value: _scopes.contains(sc) || sc == 'completion',
                    onChanged: sc == 'completion' ? null : (v) => setState(() => v == true ? _scopes.add(sc) : _scopes.remove(sc)),
                    title: Text(s.scope(sc)),
                  ),
                const Divider(),
                CheckboxListTile(
                  key: const Key('coach-consent'),
                  value: _consent,
                  onChanged: (v) => setState(() => _consent = v == true),
                  title: Text(s.consentText),
                ),
                const SizedBox(height: 12),
                FilledButton(
                  key: const Key('coach-accept'),
                  onPressed: _consent && _name.text.trim().isNotEmpty
                      ? () async {
                          final id = await widget.client.acceptInvite(code: widget.code, studentName: _name.text, scopes: _scopes.toList(), consent: true);
                          widget.onDone?.call(id);
                          if (context.mounted) Navigator.of(context).maybePop();
                        }
                      : null,
                  child: Text(s.acceptButton),
                ),
              ]);
    return widget.frame(context, s.acceptTitle, body, const []);
  }
}

/// Ученик: мои преподаватели, что каждому видно по приложениям, отозвать / отключиться.
class MyCoachesScreen extends StatefulWidget {
  const MyCoachesScreen({super.key, required this.client, this.strings = CoachStrings.en, this.frame = defaultCoachFrame, this.auth});
  final CoachClient client;
  final CoachAuth? auth;
  final CoachStrings strings;
  final CoachFrame frame;

  @override
  State<MyCoachesScreen> createState() => _MyCoachesScreenState();
}

class _MyCoachesScreenState extends State<MyCoachesScreen> {
  CoachDashboard? _data;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    widget.auth?.addListener(_onAuth);
    _load();
  }

  void _onAuth() {
    if (!mounted) return;
    setState(() => _data = null);
    _load();
  }

  @override
  void dispose() {
    widget.auth?.removeListener(_onAuth);
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final d = await widget.client.dashboard();
      if (mounted) setState(() { _data = d; _failed = false; });
    } on CoachException {
      if (mounted) setState(() => _failed = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.strings;
    final d = _data;
    final auth = widget.auth;
    final body = auth != null && !auth.signedIn
        ? CoachSignIn(auth: auth, strings: s)
        : _failed
        ? Center(child: Text(s.unavailable, textAlign: TextAlign.center))
        : d == null
            ? const Center(child: CircularProgressIndicator())
            : d.coaches.isEmpty
                ? Center(child: Text(s.noCoaches, key: const Key('coach-no-coaches')))
                : ListView(padding: const EdgeInsets.all(12), children: [
                    for (final c in d.coaches)
                      Card(
                        key: Key('coach-link-${c.connectionId}'),
                        child: Padding(
                          padding: const EdgeInsets.all(12),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(c.name, style: Theme.of(context).textTheme.titleMedium),
                            for (final a in c.apps)
                              Padding(
                                padding: const EdgeInsets.only(top: 8),
                                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                  Row(children: [
                                    Expanded(child: Text(s.appNames[a.appId] ?? a.appId, style: Theme.of(context).textTheme.titleSmall)),
                                    TextButton(
                                      key: Key('coach-revoke-${c.connectionId}-${a.appId}'),
                                      onPressed: () async {
                                        await widget.client.revokeConsent(connectionId: c.connectionId, app: a.appId);
                                        await _load();
                                      },
                                      child: Text(s.revoke),
                                    ),
                                  ]),
                                  Text('${s.sharedScopes}: ${a.scopes.map(s.scope).join(' · ')}'),
                                ]),
                              ),
                            Align(
                              alignment: Alignment.centerRight,
                              child: TextButton(
                                key: Key('coach-disconnect-${c.connectionId}'),
                                onPressed: () async {
                                  await widget.client.disconnect(c.connectionId);
                                  await _load();
                                },
                                child: Text(s.disconnect),
                              ),
                            ),
                          ]),
                        ),
                      ),
                  ]);
    return widget.frame(context, s.studentTitle, body, const []);
  }
}

/// Панель входа — общая для всех экранов кабинета. Google (если доступен) и ссылка на почту.
class CoachSignIn extends StatefulWidget {
  const CoachSignIn({super.key, required this.auth, required this.strings});
  final CoachAuth auth;
  final CoachStrings strings;

  @override
  State<CoachSignIn> createState() => _CoachSignInState();
}

class _CoachSignInState extends State<CoachSignIn> {
  final _email = TextEditingController();
  bool _busy = false, _sent = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() f, {bool sent = false}) async {
    setState(() { _busy = true; _error = null; });
    try {
      await f();
      if (mounted) setState(() => _sent = sent);
    } on Object {
      if (mounted) setState(() => _error = widget.strings.signInFailed);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.strings;
    final valid = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(_email.text.trim());
    return ListView(key: const Key('coach-sign-in'), padding: const EdgeInsets.all(20), children: [
      Text(s.signInTitle, style: Theme.of(context).textTheme.headlineSmall),
      const SizedBox(height: 8),
      Text(s.signInHint),
      const SizedBox(height: 20),
      if (widget.auth.appleAvailable) ...[
        SizedBox(
          height: 48,
          child: SignInWithAppleButton(
            key: const Key('coach-apple'),
            text: s.signInApple,
            style: Theme.of(context).brightness == Brightness.dark ? SignInWithAppleButtonStyle.white : SignInWithAppleButtonStyle.black,
            onPressed: _busy ? () {} : () => _run(widget.auth.signInWithApple),
          ),
        ),
        const SizedBox(height: 12),
      ],
      if (widget.auth.googleAvailable) ...[
        FilledButton.icon(
          key: const Key('coach-google'),
          onPressed: _busy ? null : () => _run(widget.auth.signInWithGoogle),
          icon: const Icon(Icons.login),
          label: Text(s.signInGoogle),
        ),
        const SizedBox(height: 20),
      ],
      TextField(
        key: const Key('coach-email'),
        controller: _email,
        keyboardType: TextInputType.emailAddress,
        autocorrect: false,
        decoration: InputDecoration(labelText: s.emailLabel),
        onChanged: (_) => setState(() {}),
      ),
      const SizedBox(height: 8),
      OutlinedButton(
        key: const Key('coach-send-link'),
        onPressed: _busy || !valid ? null : () => _run(() => widget.auth.sendEmailLink(_email.text.trim()), sent: true),
        child: Text(s.sendLink),
      ),
      if (_sent) Padding(padding: const EdgeInsets.only(top: 12), child: Text(s.linkSent, key: const Key('coach-link-sent'))),
      if (_error != null)
        Padding(
          padding: const EdgeInsets.only(top: 12),
          child: Text(_error!, key: const Key('coach-sign-in-error'), style: TextStyle(color: Theme.of(context).colorScheme.error)),
        ),
    ]);
  }
}
