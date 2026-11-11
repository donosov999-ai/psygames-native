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

import 'app_look.dart';
import 'aurora_glass.dart';
import 'chrome_art.dart';
import 'cloud_runtime.dart';
import 'crystal_palette.dart';
import 'game_colors.dart';
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

  /// Растёт после каждой отправленной партии: карточка заданий перечитывает прогресс.
  final results = ValueNotifier<int>(0);
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
      final r = await client.submit(event);
      if (r.stored) results.value++;
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

  /// Игры каталога как шаги урока: `ref` = код партии (sessionType, иначе id), маршрут — чтобы шаг открывал игру.
  static List<({String ref, String nameKey, String skillKey, String route})> _games = const [];
  static Future<void> loadGameNames() async {
    if (_gameNames != null) return;
    try {
      final d = jsonDecode(await rootBundle.loadString('assets/catalog.json')) as Map;
      final games = (d['games'] as List).cast<Map>();
      _gameNames = {
        for (final g in games) ...{
          if (g['sessionType'] is String) g['sessionType'] as String: g['nameKey'] as String,
          g['id'] as String: g['nameKey'] as String,
        },
      };
      _games = [
        for (final g in games)
          if (g['nameKey'] is String && g['route'] is String)
            (
              ref: (g['sessionType'] ?? g['id']) as String,
              nameKey: g['nameKey'] as String,
              skillKey: g['skillKey'] is String ? g['skillKey'] as String : '',
              route: g['route'] as String,
            ),
      ];
    } on Object {
      _gameNames = const {};
      _games = const [];
    }
  }

  /// Каталог шагов на языке приложения.
  static CoachStepCatalog stepCatalog() => CoachStepCatalog([
        for (final g in _games)
          CoachStepKind(
            appId: 'psygames',
            ref: g.ref,
            title: L.has(g.nameKey) ? L.t(g.nameKey) : g.ref,
            group: g.skillKey.isNotEmpty && L.has(g.skillKey) ? L.t(g.skillKey) : '',
          ),
      ]);

  static String? routeFor(String ref) {
    for (final g in _games) {
      if (g.ref == ref) return g.route;
    }
    return null;
  }

  /// Подписи v2 (группы, уроки, задания, отчёты): русский — для ru, остальные — английский.
  static CoachV2Strings get v2Strings => L.locale == 'ru' ? CoachV2Strings.ru : CoachV2Strings.en;

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
        builder: (_) => TeacherCabinetV2(
            client: client, catalog: stepCatalog(), strings: strings, v2: v2Strings, frame: psyCoachFrame, auth: auth, lang: L.locale)));
  }

  /// Карточка «Задания от преподавателя» для главной. Без входа или без заданий — пустое место.
  /// [onOpen] — переход по маршруту игры, как у плиток главной.
  Widget studentCard({required ValueChanged<String> onOpen}) => FutureBuilder<void>(
        future: loadGameNames(),
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) return const SizedBox.shrink();
          final panel = Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: StudentAssignmentsPanel(
              key: const ValueKey('home-coach-tasks'),
              client: client,
              catalog: stepCatalog(),
              auth: auth,
              strings: v2Strings,
              refresh: results,
              onStart: (task, i) {
                final route = routeFor(task.lesson.steps[i].kind.ref);
                if (route != null) onOpen(route);
              },
            ),
          );
          return ChromeArt.aurora(context) ? CoachSkinScope(skin: psyCoachSkin, child: panel) : panel;
        },
      );

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
/// Рамка кабинета в PsyGames. В «Авроре» — та же шапка, стекло и кнопки, что у настроек
/// (вариант А, Денис 11.11: код кабинета общий, «одежда» — приложения); в классике — Material.
Widget psyCoachFrame(BuildContext context, String title, Widget body, List<CoachBarAction> actions) => Directionality(
      textDirection: L.locale == 'ar' ? TextDirection.rtl : TextDirection.ltr,
      child: ChromeArt.aurora(context) ? _auroraCoachFrame(context, title, body, actions) : _classicCoachFrame(title, body, actions),
    );

Widget _classicCoachFrame(String title, Widget body, List<CoachBarAction> actions) => Scaffold(
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
    );

/// Карточка кабинета в «Авроре» — панель вкладок (`assets/aurora_tab_panels`), как в настройках.
const psyCoachSkin = CoachSkin(panel: _auroraCoachPanel, progressColor: _auroraProgress);

/// «В процессе» — золото кромки «Авроры»: не путается с розовым «Просрочили».
Color? _auroraProgress(BuildContext context, CoachProgress p) =>
    p == CoachProgress.inProgress ? ChromePalette.of(Theme.of(context).brightness == Brightness.dark).gold : null;

Widget _auroraCoachPanel(BuildContext context, Widget child) => Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: ChromeArt.panel(context, square: true),
      child: Material(type: MaterialType.transparency, child: child),
    );

Widget _auroraCoachFrame(BuildContext context, String title, Widget body, List<CoachBarAction> actions) {
  final dark = Theme.of(context).brightness == Brightness.dark;
  final chrome = ChromePalette.of(dark);
  final ink = CrystalPalette.of(context)?.foreground ?? AppLook.token('text', dark: dark);
  final navigator = Navigator.of(context);
  Widget primary(CoachBarAction a) => Expanded(
        child: DecoratedBox(
          decoration: AuroraGlass.primary(dark),
          child: Material(
            type: MaterialType.transparency,
            child: InkWell(
              key: a.key,
              borderRadius: BorderRadius.circular(18),
              onTap: a.onPressed,
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 52),
                child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Icon(a.icon, color: chrome.onPrimary, size: 22),
                  const SizedBox(width: 8),
                  Flexible(
                    child: Text(a.label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: chrome.onPrimary, fontSize: 16, fontWeight: FontWeight.w700)),
                  ),
                ]),
              ),
            ),
          ),
        ),
      );
  return Scaffold(
    backgroundColor: Theme.of(context).scaffoldBackgroundColor,
    body: SafeArea(
      bottom: false,
      child: Column(children: [
        Container(
          key: const Key('coach-aurora-header'),
          constraints: const BoxConstraints(minHeight: 88),
          margin: const EdgeInsets.symmetric(horizontal: 4),
          padding: const EdgeInsetsDirectional.fromSTEB(12, 14, 12, 14),
          decoration: BoxDecoration(image: ChromeArt.header(dark, context: context)),
          child: Row(children: [
            if (navigator.canPop()) ...[
              IconButton(
                key: const Key('coach-back'),
                tooltip: L.t('a11yBack'),
                onPressed: () => navigator.maybePop(),
                constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
                padding: EdgeInsets.zero,
                icon: Container(
                  width: 44,
                  height: 44,
                  decoration: AuroraGlass.ring(dark),
                  child: Icon(Icons.arrow_back, color: ink, size: 23),
                ),
              ),
              const SizedBox(width: 12),
            ],
            Expanded(
              child: Text(title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: ink, fontSize: 26, height: 1.15, fontWeight: FontWeight.w700)),
            ),
          ]),
        ),
        Expanded(
          child: Align(
            alignment: Alignment.topCenter,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 600),
              child: CoachSkinScope(skin: psyCoachSkin, child: body),
            ),
          ),
        ),
      ]),
    ),
    bottomNavigationBar: actions.isEmpty
        ? null
        : SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 10),
              child: Row(children: [
                for (final a in actions)
                  if (a.primary)
                    primary(a)
                  else
                    TextButton(
                      key: a.key,
                      onPressed: a.onPressed,
                      child: Text(a.label, style: TextStyle(color: AppLook.token('textSecondary', dark: dark), fontWeight: FontWeight.w600)),
                    ),
              ]),
            ),
          ),
  );
}

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
