/// Экраны кабинета — одни на 4 приложения. Рамку (шапку, нижний ряд, фон) даёт приложение через [CoachFrame]:
/// в PsyGames это общий каркас игр, у остальных — их собственный. Пакет рисует только содержимое.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'client.dart';
import 'model.dart';
import 'strings.dart';

/// Рамка экрана приложения: заголовок + содержимое (+ кнопки нижнего ряда, если есть).
typedef CoachFrame = Widget Function(BuildContext context, String title, Widget body, List<CoachBarAction> actions);

class CoachBarAction {
  const CoachBarAction({required this.icon, required this.label, required this.onPressed, this.key});
  final IconData icon;
  final String label;
  final VoidCallback onPressed;
  final Key? key;
}

/// Рамка по умолчанию — простой Scaffold (для проб и приложений без своего каркаса).
Widget defaultCoachFrame(BuildContext context, String title, Widget body, List<CoachBarAction> actions) => Scaffold(
      appBar: AppBar(title: Text(title)),
      body: SafeArea(child: body),
      bottomNavigationBar: actions.isEmpty
          ? null
          : SafeArea(
              child: Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
                for (final a in actions) TextButton.icon(key: a.key, onPressed: a.onPressed, icon: Icon(a.icon), label: Text(a.label)),
              ]),
            ),
    );

String _date(DateTime? d) => d == null ? '' : '${d.toLocal().day.toString().padLeft(2, '0')}.${d.toLocal().month.toString().padLeft(2, '0')} '
    '${d.toLocal().hour.toString().padLeft(2, '0')}:${d.toLocal().minute.toString().padLeft(2, '0')}';

/// Кабинет преподавателя: профиль, ученики по всем приложениям, приглашение в текущее приложение.
class TeacherCabinetScreen extends StatefulWidget {
  const TeacherCabinetScreen({super.key, required this.client, this.strings = CoachStrings.en, this.frame = defaultCoachFrame});
  final CoachClient client;
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
    _load();
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _load() async {
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
    final Widget body;
    if (_error != null && d == null) {
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
                subtitle: Wrap(spacing: 6, runSpacing: 4, children: [
                  for (final a in st.apps)
                    Chip(label: Text('${s.appNames[a.appId] ?? a.appId} · ${a.events}${a.lastAt != null ? ' · ${_date(a.lastAt)}' : ''}')),
                ]),
                onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(
                    builder: (_) => StudentDetailScreen(client: widget.client, student: st, strings: s, frame: widget.frame))),
              ),
            ),
        ]),
      );
    }
    return widget.frame(context, s.teacherTitle, body, [
      if (d?.isCoach ?? false) CoachBarAction(key: const Key('coach-invite'), icon: Icons.person_add_alt_1, label: s.invite, onPressed: _invite),
    ]);
  }
}

/// Тренировки одного ученика по каждому приложению, где он дал согласие.
class StudentDetailScreen extends StatefulWidget {
  const StudentDetailScreen({super.key, required this.client, required this.student, this.strings = CoachStrings.en, this.frame = defaultCoachFrame});
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
          Wrap(spacing: 6, children: [for (final sc in a.scopes) Chip(label: Text(s.scope(sc)))]),
          if ((_events[a.appId] ?? const []).isEmpty)
            Padding(padding: const EdgeInsets.all(8), child: Text(s.noTrainings))
          else
            for (final e in _events[a.appId]!)
              ListTile(
                key: Key('coach-event-${e.id}'),
                dense: true,
                title: Text([e.mode ?? e.kind, if (e.exerciseRef != null) e.exerciseRef].join(' · ')),
                subtitle: Text([
                  e.occurredAt != null ? _date(e.occurredAt) : '${_date(e.receivedAt)} (${s.timeUnknown})',
                  if (e.metrics != null && e.metrics!.isNotEmpty) e.metrics!.entries.map((m) => '${m.key}: ${m.value}').join(', '),
                  if (e.errors == null) '${s.scopeErrors}: ${s.hiddenByStudent}',
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
  const AcceptInviteScreen({super.key, required this.client, required this.code, required this.studentName,
      this.strings = CoachStrings.en, this.frame = defaultCoachFrame, this.onDone});
  final CoachClient client;
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
  final _scopes = <String>{'completion', 'metrics'};
  bool _consent = false;

  @override
  void initState() {
    super.initState();
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
    final body = _error != null
        ? Center(child: Text(s.unavailable, key: const Key('coach-invite-unavailable'), textAlign: TextAlign.center))
        : p == null
            ? const Center(child: CircularProgressIndicator())
            : ListView(padding: const EdgeInsets.all(16), children: [
                Text(p.coachName, key: const Key('coach-invite-coach'), style: Theme.of(context).textTheme.headlineSmall),
                Text(s.appNames[p.appId] ?? p.appId),
                const SizedBox(height: 16),
                for (final sc in coachScopes)
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
                  onPressed: _consent
                      ? () async {
                          final id = await widget.client.acceptInvite(code: widget.code, studentName: widget.studentName, scopes: _scopes.toList(), consent: true);
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
  const MyCoachesScreen({super.key, required this.client, this.strings = CoachStrings.en, this.frame = defaultCoachFrame});
  final CoachClient client;
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
    _load();
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
    final body = _failed
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
                              ListTile(
                                contentPadding: EdgeInsets.zero,
                                title: Text(s.appNames[a.appId] ?? a.appId),
                                subtitle: Text(a.scopes.map(s.scope).join(', ')),
                                trailing: TextButton(
                                  key: Key('coach-revoke-${c.connectionId}-${a.appId}'),
                                  onPressed: () async {
                                    await widget.client.revokeConsent(connectionId: c.connectionId, app: a.appId);
                                    await _load();
                                  },
                                  child: Text(s.revoke),
                                ),
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
