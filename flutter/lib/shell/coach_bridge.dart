// Кабинет преподавателя в PsyGames (contract ecosystem.coach/2, эпик 892cd2c3).
//
// Включается флагом сборки PSY_COACH (сервер — personal-nzt, миграция ecosystem_coach_v2 применена 11.11.2026).
// Вход свой: Google или ссылка на почту; при облачном пилоте — тот же аккаунт пилота.
// 🔴 Google — на всех платформах, включая iPhone (решение Дениса 11.11.2026). Перед подачей в App Store — вход Apple (4.8).
//
// Что делает мост:
//   · превращает отчёт партии ([SessionReport]) в событие кабинета и отправляет его — без согласия
//     ученика сервер ничего не пишет, это не ошибка; сбой сети игру не трогает;
//   · открывает экраны пакета `ecosystem_coach` в рамке подстраниц настроек приложения;
//   · принимает ссылку-приглашение `com.psygames.app://coach/invite?code=…`.
import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:ecosystem_account/ecosystem_account.dart';
import 'package:ecosystem_coach/ecosystem_coach.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'package:url_launcher/url_launcher.dart';

import 'cloud_runtime.dart';
import 'l10n.dart';
import 'session_report.dart';
import 'shared_state.dart';

class PsyGamesCoach {
  PsyGamesCoach(this.client, {this.auth, DateTime Function()? clock, String Function()? newId})
      : _clock = clock ?? DateTime.now,
        _newId = newId ?? _uuid;

  static const enabled = bool.fromEnvironment('PSY_COACH');
  static const _url = String.fromEnvironment('PSY_SUPABASE_URL', defaultValue: 'https://iuvvheeocobhiothfgei.supabase.co');
  // Публикуемый ключ — публичный по устройству Supabase (доступ решают права в базе), не секрет.
  static const _key = String.fromEnvironment('PSY_SUPABASE_PUBLISHABLE_KEY',
      defaultValue: 'sb_publishable_A2vJ5DjemTZIKrKX6XGqvQ_WaiuAkk1');
  static const signedInKey = 'psygames_coach_signed_in';

  /// Кабинет приложения; null — выключен флагом.
  static PsyGamesCoach? instance;

  /// Собрать кабинет. [account] — аккаунт облачного пилота, если он есть (тогда сессию поднимает пилот).
  static PsyGamesCoach? fromEnvironment(SharedState state, {EcosystemAccount? account}) {
    if (!enabled) return null;
    final shared = account != null;
    final acc = account ??
        EcosystemAccount(
          appId: 'psygames',
          url: _url,
          publishableKey: _key,
          callback: Uri.parse(PsyGamesCloudRuntime.callback),
          vault: PsyGamesAccountVault(),
        );
    final auth = AccountCoachAuth(
      acc,
      openUrl: (u) => launchUrl(u, mode: LaunchMode.externalApplication),
      // 🔴 Решение Дениса 11.11.2026: вход через Google — на ВСЕХ платформах, включая iPhone. Не прятать.
      googleAvailable: true,
      onSignedIn: () => state.set(signedInKey, '1'),
      onSignedOut: () => state.remove(signedInKey),
    );
    // Сессию поднимаем, только если человек уже входил: до первого входа кабинет в сеть не ходит.
    if (!shared && state.get(signedInKey) == '1') unawaited(auth.restore());
    return PsyGamesCoach(CoachClient(AccountCoachTransport(acc), appId: 'psygames'), auth: auth)..observe();
  }

  final CoachClient client;
  final AccountCoachAuth? auth;
  final DateTime Function() _clock;
  final String Function() _newId;

  /// Подписаться на отчёты партий. Один подписчик — последний установленный.
  void observe() => SessionReport.observer = submitSession;

  void dispose() {
    if (SessionReport.observer == submitSession) SessionReport.observer = null;
  }

  /// Отчёт партии → событие кабинета. Ошибки глотаются: кабинет не имеет права ломать игру.
  Future<void> submitSession(Map<String, Object?> body) async {
    final event = coachEventFromSession(body, now: _clock(), newId: _newId);
    if (event == null) return;
    try {
      await client.submit(event);
    } on Object {
      // нет входа / нет сети / нет согласия — партия уже сохранена локально, этого достаточно
    }
  }

  /// Подписи — из словаря приложения (12 языков, ключи coach*; ключи буквально — их вырезает embed-l10n).
  CoachStrings get strings => CoachStrings(
        teacherTitle: L.t('coachTeacherTitle'),
        studentTitle: L.t('coachStudentTitle'),
        yourName: L.t('coachYourName'),
        studentName: L.t('coachStudentName'),
        saveProfile: L.t('coachSaveProfile'),
        noStudents: L.t('coachNoStudents'),
        invite: L.t('coachInvite'),
        inviteReady: L.t('coachInviteReady'),
        copyLink: L.t('coachCopyLink'),
        copied: L.t('coachCopied'),
        trainings: L.t('coachTrainings'),
        noTrainings: L.t('coachNoTrainings'),
        timeUnknown: L.t('coachTimeUnknown'),
        hiddenByStudent: L.t('coachHiddenByStudent'),
        myCoaches: L.t('coachStudentTitle'),
        noCoaches: L.t('coachNoCoaches'),
        acceptTitle: L.t('coachAcceptTitle'),
        acceptButton: L.t('coachAcceptButton'),
        consentText: L.t('coachConsentText'),
        scopeCompletion: L.t('coachScopeCompletion'),
        scopeMetrics: L.t('coachScopeMetrics'),
        scopeErrors: L.t('coachScopeErrors'),
        scopeHistory: L.t('coachScopeHistory'),
        revoke: L.t('coachRevoke'),
        disconnect: L.t('coachDisconnect'),
        unavailable: L.t('coachUnavailable'),
        appNames: CoachStrings.en.appNames,
        signInTitle: L.t('coachSignInTitle'),
        signInHint: L.t('coachSignInHint'),
        signInGoogle: L.t('coachSignInGoogle'),
        signInApple: L.t('coachSignInApple'),
        emailLabel: L.t('coachEmailLabel'),
        sendLink: L.t('coachSendLink'),
        linkSent: L.t('coachLinkSent'),
        signOut: L.t('coachSignOut'),
        signInFailed: L.t('coachSignInFailed'),
        sharedScopes: L.t('coachSharedScopes'),
        eventsCount: L.t('petTrainingsDone'),
        lastAt: L.t('coachLastAt'),
        metricScore: L.t('score'),
        metricTime: L.t('time'),
        metricLevel: L.t('level'),
        metricErrors: L.t('errors'),
        warmup: L.t('warmupPickerTitle'),
      );

  /// Код партии → ключ названия игры из каталога приложения (`assets/catalog.json`).
  static Map<String, String>? _gameNames;
  static Future<void> loadGameNames() async {
    if (_gameNames != null) return;
    try {
      final d = jsonDecode(await rootBundle.loadString('assets/catalog.json')) as Map;
      _gameNames = {
        for (final g in (d['games'] as List).cast<Map>()) ...{
          if (g['sessionType'] is String) g['sessionType'] as String: g['nameKey'] as String,
          g['id'] as String: g['nameKey'] as String,
        },
      };
    } on Object {
      _gameNames = const {};
    }
  }

  /// Название тренировки: игры PsyGames — по каталогу на языке приложения; чужие приложения — как пришло.
  static String eventTitle(CoachEventView e) {
    final names = _gameNames ?? const <String, String>{};
    final key = e.appId == 'psygames' ? names[e.mode] : null;
    return key != null && L.has(key) ? L.t(key) : defaultEventTitle(e);
  }

  Future<void> openTeacher(BuildContext context) async {
    await loadGameNames();
    if (!context.mounted) return;
    await Navigator.of(context).push<void>(MaterialPageRoute(
        builder: (_) => TeacherCabinetScreen(client: client, strings: strings, frame: psyCoachFrame, auth: auth, eventTitle: eventTitle)));
  }

  Future<void> openMyCoaches(BuildContext context) => Navigator.of(context).push<void>(MaterialPageRoute(
      builder: (_) => MyCoachesScreen(client: client, strings: strings, frame: psyCoachFrame, auth: auth)));

  /// Входящая ссылка: возврат после входа (`auth/callback`) или приглашение (`coach/invite`).
  Future<bool> handleLink(NavigatorState? navigator, Uri uri) async {
    if (uri.scheme != 'com.psygames.app') return false;
    if (uri.host == 'auth') {
      try {
        return await auth?.complete(uri) ?? false;
      } on Object {
        return false;
      }
    }
    return navigator != null && openInvite(navigator, uri);
  }

  /// Ссылка-приглашение. Чужая форма → false, ссылка не наша.
  bool openInvite(NavigatorState navigator, Uri uri) {
    final link = CoachInviteLink.parse(uri, appId: 'psygames');
    if (link == null) return false;
    unawaited(navigator.push<void>(MaterialPageRoute(
        builder: (_) => AcceptInviteScreen(client: client, code: link.code, strings: strings, frame: psyCoachFrame, auth: auth))));
    return true;
  }

  static String _uuid() {
    final r = Random.secure();
    final b = List<int>.generate(16, (_) => r.nextInt(256));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    final h = b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
    return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
  }
}

/// Проекция отчёта партии: только то, что нужно преподавателю. Детали партии (поля доски,
/// хозяин зарядки и т. п.) наружу не уходят.
CoachEvent? coachEventFromSession(Map<String, Object?> body, {required DateTime now, required String Function() newId}) {
  final game = body['game_type'];
  if (game is! String || game.isEmpty) return null;
  final id = body['id'];
  final difficulty = body['difficulty'];
  final details = body['details'];
  final ladderLevel = details is Map ? details['ladderLevel'] : null;
  final errors = body['errors'];
  return CoachEvent(
    eventId: id is String && id.isNotEmpty ? id : newId(),
    kind: details is Map && details['warmup_owner'] != null ? 'warmup' : 'game',
    mode: game.length > 60 ? game.substring(0, 60) : game,
    exerciseRef: difficulty is String && difficulty.isNotEmpty ? '$game:$difficulty' : null,
    occurredAt: now.toUtc(),
    metrics: {
      if (body['score'] is num) 'score': body['score'],
      if (body['time_seconds'] is num) 'time_seconds': body['time_seconds'],
      if (ladderLevel is num && ladderLevel > 0) 'level': ladderLevel,
    },
    errors: {if (errors is num) 'count': errors},
  );
}

/// Рамка подстраниц настроек — та же, что у «Облака» и «Палитры кристаллов»: системная шапка с «назад»,
/// направление письма по языку. Кнопки экрана — в нижнем ряду.
Widget psyCoachFrame(BuildContext context, String title, Widget body, List<CoachBarAction> actions) => Directionality(
      textDirection: L.locale == 'ar' ? TextDirection.rtl : TextDirection.ltr,
      child: Scaffold(
        appBar: AppBar(title: Text(title)),
        body: SafeArea(child: body),
        bottomNavigationBar: actions.isEmpty
            ? null
            : SafeArea(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Row(children: [
                    for (final a in actions)
                      if (a.primary)
                        Expanded(
                          child: FilledButton.icon(key: a.key, onPressed: a.onPressed, icon: Icon(a.icon), label: Text(a.label)),
                        )
                      else
                        TextButton(key: a.key, onPressed: a.onPressed, child: Text(a.label)),
                  ]),
                ),
              ),
      ),
    );

/// Приём ссылок, когда облачного пилота нет (у пилота свой приёмник — [CloudLinkHost]).
class CoachLinkHost extends StatefulWidget {
  const CoachLinkHost({super.key, required this.coach, required this.links, required this.navigatorKey, required this.child});
  final PsyGamesCoach coach;
  final Stream<Uri> links;
  final GlobalKey<NavigatorState> navigatorKey;
  final Widget child;

  @override
  State<CoachLinkHost> createState() => _CoachLinkHostState();
}

class _CoachLinkHostState extends State<CoachLinkHost> {
  StreamSubscription<Uri>? _sub;

  @override
  void initState() {
    super.initState();
    _sub = widget.links.listen((u) => unawaited(widget.coach.handleLink(widget.navigatorKey.currentState, u)),
        onError: (Object _) {});
  }

  @override
  void dispose() {
    unawaited(_sub?.cancel());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
