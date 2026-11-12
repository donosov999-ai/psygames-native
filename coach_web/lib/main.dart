// Веб-кабинет преподавателя (teach.asiapps.pro): те же экраны пакета ecosystem_coach, что в приложениях,
// для работы с компьютера. Вход — Google или ссылка на почту, возврат на /auth/callback этого же сайта.
// Сверху — выбор приложения (PsyGames, Chess & Go, Smart Alarm, TypeFree, Fudao): от него зависят
// приглашения, уроки и шаблоны. Аккаунт один на все приложения.
import 'dart:async';
import 'dart:convert';

import 'package:ecosystem_account/ecosystem_account.dart';
import 'package:ecosystem_coach/ecosystem_coach.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:web/web.dart' as web;

const _url = 'https://iuvvheeocobhiothfgei.supabase.co';
// Публикуемый ключ — публичный по устройству Supabase (доступ решают права в базе), не секрет.
const _key = 'sb_publishable_A2vJ5DjemTZIKrKX6XGqvQ_WaiuAkk1';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final origin = Uri.base.origin;
  final account = EcosystemAccount(appId: 'psygames', url: _url, publishableKey: _key, callback: Uri.parse('$origin/auth/callback'));
  final auth = AccountCoachAuth(
    account,
    openUrl: (u) => launchUrl(u, webOnlyWindowName: '_self'),
    googleAvailable: true,
    appleAvailable: false,
  );
  final here = Uri.base;
  if (here.path == '/auth/callback') {
    try {
      await auth.complete(here.replace(fragment: ''));
    } on Object {
      // кривая или старая ссылка — просто панель входа
    }
    web.window.history.replaceState(null, '', '/');
  } else {
    await auth.restore();
  }
  final catalogs = await _loadCatalogs();
  runApp(CoachWebApp(account: account, auth: auth, catalogs: catalogs));
}

typedef StepCatalogs = Map<String, List<Map<String, Object?>>>;

Future<StepCatalogs> _loadCatalogs() async {
  try {
    final d = jsonDecode(await rootBundle.loadString('assets/catalogs.json')) as Map;
    return {for (final e in d.entries) '${e.key}': [for (final x in e.value as List) (x as Map).cast<String, Object?>()]};
  } on Object {
    return {};
  }
}

String _pick(Object? m, String lang) {
  if (m is! Map || m.isEmpty) return '';
  // Нет ни нужного языка, ни английского (тексты библиотеки TypeFree) — любое имеющееся название.
  return '${m[lang] ?? m['en'] ?? m.values.first}';
}

class CoachWebApp extends StatefulWidget {
  const CoachWebApp({super.key, required this.account, required this.auth, required this.catalogs});
  final EcosystemAccount account;
  final AccountCoachAuth auth;
  final StepCatalogs catalogs;

  @override
  State<CoachWebApp> createState() => _CoachWebAppState();
}

class _CoachWebAppState extends State<CoachWebApp> {
  static const _apps = ['psygames', 'abstract-hub', 'smart-alarm', 'typerighting', 'fudao'];
  String _app = 'psygames';

  String get _lang {
    final code = WidgetsBinding.instance.platformDispatcher.locale.languageCode;
    return const {'ru', 'en', 'es', 'de', 'fr', 'it', 'pt', 'ar', 'hi', 'ja', 'ko', 'zh'}.contains(code) ? code : 'en';
  }

  CoachStepCatalog _catalog(String app) => CoachStepCatalog([
        for (final k in widget.catalogs[app] ?? const <Map<String, Object?>>[])
          CoachStepKind(
            appId: app,
            ref: '${k['ref']}',
            title: _pick(k['title'], _lang),
            group: _pick(k['group'], _lang),
            maxLevel: k['max_level'] is num ? (k['max_level'] as num).toInt() : 0,
            unit: k['unit'] == 'minutes' ? CoachStepUnit.minutes : CoachStepUnit.times,
          ),
      ]);

  Widget _frame(BuildContext context, String title, Widget body, List<CoachBarAction> actions) {
    final s = _lang == 'ru' ? CoachStrings.ru : CoachStrings.en;
    final root = !Navigator.of(context).canPop();
    return Directionality(
      textDirection: _lang == 'ar' ? TextDirection.rtl : TextDirection.ltr,
      child: Scaffold(
        appBar: AppBar(
          title: Text(title),
          actions: [
            if (root)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: DropdownButton<String>(
                  key: const Key('web-app-picker'),
                  value: _app,
                  underline: const SizedBox.shrink(),
                  items: [for (final a in _apps) DropdownMenuItem(value: a, child: Text(s.appNames[a] ?? a))],
                  onChanged: (v) => setState(() => _app = v ?? _app),
                ),
              ),
          ],
        ),
        body: SafeArea(
          child: Align(
            alignment: Alignment.topCenter,
            child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 880), child: body),
          ),
        ),
        bottomNavigationBar: actions.isEmpty
            ? null
            : SafeArea(
                child: Align(
                  heightFactor: 1,
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 880),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                      child: Row(children: [
                        for (final a in actions)
                          if (a.primary)
                            Expanded(child: FilledButton.icon(key: a.key, onPressed: a.onPressed, icon: Icon(a.icon), label: Text(a.label)))
                          else
                            TextButton(key: a.key, onPressed: a.onPressed, child: Text(a.label)),
                      ]),
                    ),
                  ),
                ),
              ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final strings = _lang == 'ru' ? CoachStrings.ru : CoachStrings.en;
    return MaterialApp(
      title: 'Teacher cabinet',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorSchemeSeed: const Color(0xFF5B4BDB), useMaterial3: true),
      darkTheme: ThemeData(colorSchemeSeed: const Color(0xFF5B4BDB), brightness: Brightness.dark, useMaterial3: true),
      home: TeacherCabinetV2(
        key: ValueKey(_app),
        client: CoachClient(AccountCoachTransport(widget.account), appId: _app),
        catalog: _catalog(_app),
        auth: widget.auth,
        strings: strings,
        v2: CoachV2Strings.forLocale(_lang),
        frame: _frame,
        lang: _lang,
      ),
    );
  }
}
