import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'aux_action.dart';
import 'game_preset.dart';
import 'hub_screen.dart' show HubCardTap, HubScreen;
import 'l10n.dart';
import 'profiles.dart';
import 'shared_state.dart';

/// Режим набора: игра (маршрут) и подпись плашки.
class SuiteMode {
  const SuiteMode(this.route, this.labelKey);
  final String route;
  final String labelKey;
}

/// Набор игр — ЯРЛЫК НАД МАРШРУТАМИ (веб `frontend/src/constants/gameSuites.ts`): в развилке одна
/// карточка, а на экране настройки плашки переключают маршрут. Каждая игра живёт там, где жила,
/// со своей справкой, лестницей и ссылками.
class GameSuite {
  const GameSuite({required this.id, required this.titleKey, required this.modes});

  final String id;

  /// Подпись над плашками — так её и задумал веб (поле `titleKey` набора).
  final String titleKey;
  final List<SuiteMode> modes;

  factory GameSuite.fromJson(Map<String, dynamic> j) => GameSuite(
        id: j['id'] as String,
        titleKey: j['titleKey'] as String,
        modes: [
          for (final m in (j['modes'] as List).cast<Map<String, dynamic>>())
            SuiteMode(m['route'] as String, m['labelKey'] as String),
        ],
      );
}

/// 🔴 НАБОРЫ В НАТИВЕ. Замер 02.10.2026: нативные развилки наборов не знали — у каждого набора одна
/// карточка на первый режим, а переключателя не было ни в одном экране. 11 игр не открывались из
/// развилок вовсе: Корси и «Наоборот», Simon, Choice RT, ANT, go/no-go, стоп-сигнал, Iowa, BART,
/// эмоциональный Струп, переключение задач. Данные — выгрузка веба (`flutter/tools/embed-suites.mjs`
/// → `assets/game_suites.json`), второй копии в Dart нет.
class GameSuites {
  GameSuites._();

  static List<GameSuite>? _all;

  static Future<List<GameSuite>> load() async {
    final cached = _all;
    if (cached != null) return cached;
    try {
      // Байтами, а не `loadString`: у него порог 50 КБ и кэш, вешающий пробы (урок 30.09).
      final b = await rootBundle.load('assets/game_suites.json');
      final j = jsonDecode(utf8.decode(b.buffer.asUint8List(b.offsetInBytes, b.lengthInBytes)))
          as Map<String, dynamic>;
      return _all = [
        for (final s in (j['suites'] as List).cast<Map<String, dynamic>>()) GameSuite.fromJson(s),
      ];
    } catch (_) {
      // Ассет не прочитался — переключателя не будет, но экран откроется.
      return _all = const [];
    }
  }

  /// Набор, в который входит маршрут; не входит — переключателя нет.
  static GameSuite? of(String route, List<GameSuite> all) {
    for (final s in all) {
      if (s.modes.any((m) => m.route == route)) return s;
    }
    return null;
  }

  /// 🔴 ТОЛЬКО ОТКРЫТОЕ ПРОФИЛЮ — как веб-`GameSuiteSwitch`. Правило профиля считает веб той же
  /// функцией, что и карточки развилок (`hubVisibility.ts`, поле `suites`), и кладёт в
  /// [HubScreen.visibleKey]. Нет данных для этого профиля — пусто: показать детям «Корси», закрытый
  /// их профилем, хуже, чем не показать переключатель (замер 02.10: у kids в «Позициях» одна «Матрица»).
  static List<SuiteMode> openModes(SharedState state, GameSuite suite) {
    final raw = state.get(HubScreen.visibleKey);
    if (raw != null && raw.isNotEmpty) {
      try {
        final o = jsonDecode(raw) as Map<String, dynamic>;
        if (o['profile'] == state.activeProfile) {
          final open = ((o['suites'] as Map<String, dynamic>?)?[suite.id] as List?)?.cast<String>().toSet();
          if (open != null) return [for (final m in suite.modes) if (open.contains(m.route)) m];
        }
      } catch (_) {
        // Битая запись — считаем по профилю, как без неё.
      }
    }
    return _openByProfile(state, suite);
  }

  /// 🔴 ЗАПАСНОЙ ПУТЬ — ПО СПИСКУ ИГР ПРОФИЛЯ. Список веба (`visibleKey`) пишет веб-половина; без неё
  /// (открыли игру до развилки, профиль сменили, веб не запускался) плашек не было вовсе, и девять игр
  /// «Конфликта внимания» не открывались ни откуда (отчёт 13.11: BART не найти). Профиль известен —
  /// берём режимы из его `allowed_games` (`null` — вся библиотека); неизвестен — ничего не показываем,
  /// как и прежде: закрытый профилем режим хуже, чем отсутствие переключателя.
  static List<SuiteMode> _openByProfile(SharedState state, GameSuite suite) {
    final profile = Profiles.current.byId(state.activeProfile);
    if (profile == null) return const [];
    final games = profile.games;
    if (games == null) return suite.modes;
    final allowed = games.toSet();
    return [for (final m in suite.modes) if (allowed.contains(m.route.split('/').last.replaceAll('-', '_'))) m];
  }
}

/// ПЛАШКИ «РЕЖИМ» НАБОРА — на экране настройки игры, под шапкой (веб `GameSuiteSwitch`).
///
/// Ставится одной строкой в фазу настройки: маршрут вне наборов, шаг зарядки или меньше двух
/// открытых режимов — не рисуется ничего. Переход — `pop(HubCardTap(маршрут))`: оболочка закрывает
/// этот экран и сразу открывает выбранный (`HybridApp._openNative`). Это замена маршрута, как
/// `router.replace` в вебе: «назад» ведёт в развилку, а не по всем тычкам в плашки.
class SuiteSwitch extends StatefulWidget {
  const SuiteSwitch({super.key, required this.route, required this.state});

  /// Маршрут этого экрана.
  final String route;
  final SharedState state;

  @override
  State<SuiteSwitch> createState() => _SuiteSwitchState();
}

class _SuiteSwitchState extends State<SuiteSwitch> {
  List<GameSuite>? _all;

  @override
  void initState() {
    super.initState();
    GameSuites.load().then((v) {
      if (mounted) setState(() => _all = v);
    });
  }

  @override
  Widget build(BuildContext context) {
    final all = _all;
    if (all == null || GamePreset.isPreset) return const SizedBox.shrink();
    final suite = GameSuites.of(widget.route, all);
    if (suite == null) return const SizedBox.shrink();
    final open = GameSuites.openModes(widget.state, suite);
    if (open.length < 2) return const SizedBox.shrink();
    return Padding(
      key: Key('suite-switch-${suite.id}'),
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          // «Игра», а не название набора: на настройке рядом идёт своя строка «Режим» (Уровни / Свободно),
          // и два выбора под одним словом путались (Денис 13.11, настройки PRL: выбора PRL · Iowa · BART не нашёл).
          Text(L.t('suiteGameLabel'), key: const Key('suite-game-label'), style: Theme.of(context).textTheme.labelLarge),
          const SizedBox(height: 6),
          Wrap(
            alignment: WrapAlignment.center,
            spacing: 8,
            runSpacing: 4,
            children: [
              for (final m in open)
                ChoiceChip(
                  key: Key('suite-mode-${m.route}'),
                  label: Text(L.t(m.labelKey)),
                  selected: m.route == widget.route,
                  onSelected: (_) {
                    if (m.route != widget.route) Navigator.of(context).pop(HubCardTap(m.route, replace: true));
                  },
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// ПУНКТ «РЕЖИМ» В РЯДУ ЗНАЧКОВ — для игр набора БЕЗ экрана настройки («Собери сумму»: партия
/// начинается сразу). Плашкам [SuiteSwitch] негде встать, поэтому режимы набора открываются листом,
/// как режимы «Анаграмм» (`anagrams/mode_switch.dart`). Переход тот же — закрыть экран с
/// [HubCardTap] (замена маршрута). Не набор, шаг зарядки или открыт один режим — значка нет.
class SuiteModeAction extends StatefulWidget {
  const SuiteModeAction({super.key, required this.route, required this.state});

  /// Маршрут этого экрана.
  final String route;
  final SharedState state;

  @override
  State<SuiteModeAction> createState() => _SuiteModeActionState();
}

class _SuiteModeActionState extends State<SuiteModeAction> {
  List<SuiteMode>? _open;

  @override
  void initState() {
    super.initState();
    GameSuites.load().then((all) {
      if (!mounted) return;
      final suite = GameSuites.of(widget.route, all);
      setState(() => _open = suite == null ? const [] : GameSuites.openModes(widget.state, suite));
    });
  }

  Future<void> _pick(List<SuiteMode> open) async {
    final picked = await showModalBottomSheet<SuiteMode>(
      context: context,
      showDragHandle: true,
      builder: (sheet) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Text(L.t('mode'), style: Theme.of(sheet).textTheme.titleMedium),
            ),
            for (final m in open)
              ListTile(
                key: Key('suite-mode-${m.route}'),
                title: Text(L.t(m.labelKey)),
                selected: m.route == widget.route,
                trailing: m.route == widget.route ? const Icon(Icons.check) : null,
                onTap: () => Navigator.of(sheet).pop(m),
              ),
          ],
        ),
      ),
    );
    if (picked == null || picked.route == widget.route || !mounted) return;
    Navigator.of(context).pop(HubCardTap(picked.route, replace: true));
  }

  @override
  Widget build(BuildContext context) {
    final open = _open;
    if (open == null || open.length < 2 || GamePreset.isPreset) return const SizedBox.shrink();
    return AuxAction(
      key: const Key('suite-mode-action'),
      icon: Icons.dashboard_outlined,
      label: L.t('mode'),
      onPressed: () => _pick(open),
    );
  }
}
