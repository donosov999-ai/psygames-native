import 'dart:convert';
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;

import 'design_template.dart';
import 'aurora_glass.dart';
import 'feedback_fab.dart';
import 'game_colors.dart';
import 'l10n.dart';
import 'web_theme.dart';
import 'chrome_art.dart';
import 'pilot_liquid_surface.dart';

/// НИЖНЯЯ ПОЛОСА — У ОБОЛОЧКИ FLUTTER (задача 5136754e, решение Дениса 07.10.2026).
///
/// 📍 До этого полосу рисовала страница (`frontend/src/components/BottomTabBar.tsx`), а нативные
/// экраны ложились ПОВЕРХ WebView — и вместе со страницей закрывали её полосу. Нативная вкладка
/// «Игры» (99628ecf) обязана стоять С полосой, значит хозяином вкладок становится оболочка.
///
/// Правила — не копия: пять вкладок, значки, подписи и адреса без полосы оболочка читает из
/// выгрузки `tabBar.ts` (`assets/tabs.json`, сторож `flutter-tabs-asset-fresh.test.ts`).
/// Рисунок — перенос веб-полосы: стекло 0,72 с размытием 24, волосяная кромка сверху, высота 58 +
/// низ безопасной зоны, значок 22 и подпись 11/600, активная — акцентом профиля или надетым в
/// магазине ([WebTheme.accent]), невыбранная — `textSecondary`.
///
/// «Аврора» (лист 01 v2, LAYOUT_CORRECTIONS §2): та же пятёрка с подписями, но сплошная панель
/// цвета фона шаблона с кромкой `border`, активная — оранжевым «Авроры» (`GameColors.aurora.highlight`,
/// как пауза — решение Дениса 29.10 15:03), невыбранная — `textSecondary` шаблона. Classic не меняется.
class TabDef {
  const TabDef({required this.route, required this.icon, required this.labelKey});
  final String route;

  /// Имя значка Ionicons веба.
  final String icon;
  final String labelKey;
}

class NativeTabs {
  NativeTabs._();

  static List<TabDef> tabs = const [];
  static List<String> noBar = const [];
  static double height = 58;

  /// Вкладки, которые рисует оболочка сама; остальные — страница в WebView.
  static const native = {'/', '/games', '/statistics', '/pet'};

  static Future<void> load() async {
    final b = await rootBundle.load('assets/tabs.json');
    use(jsonDecode(utf8.decode(b.buffer.asUint8List(b.offsetInBytes, b.lengthInBytes))) as Map<String, dynamic>);
  }

  static void use(Map<String, dynamic> j) {
    height = (j['height'] as num?)?.toDouble() ?? 58;
    tabs = [
      for (final t in (j['tabs'] as List).cast<Map<String, dynamic>>())
        TabDef(route: t['route'] as String, icon: t['icon'] as String, labelKey: t['labelKey'] as String),
    ];
    noBar = (j['noBar'] as List).cast<String>();
    FabRules.use(j['fab'] as Map<String, dynamic>?);
  }

  /// `tabBarVisible` веба.
  static bool barVisible(String path) => tabs.isNotEmpty && !noBar.any(path.startsWith);

  /// `activeTab` веба: `/` — только сам корень; длинный адрес проверяется раньше короткого;
  /// вне вкладок — ни одна (врать подсветкой хуже, чем не подсвечивать).
  static String? activeTab(String path) {
    if (path == '/' || path.isEmpty) return '/';
    final found = tabs.where((t) => t.route != '/' && (path == t.route || path.startsWith('${t.route}/'))).toList()
      ..sort((a, b) => b.route.length.compareTo(a.route.length));
    return found.isEmpty ? null : found.first.route;
  }
}

/// Значки вкладок веба (Ionicons) → Material.
const _tabIcons = <String, IconData>{
  'home': Icons.home_rounded,
  'game-controller': Icons.sports_esports_rounded,
  'flash': Icons.bolt_rounded,
  'stats-chart': Icons.bar_chart_rounded,
  'paw': Icons.pets_rounded,
};

const _lightNavAssets = <String, String>{
  'home': 'home',
  'game-controller': 'games',
  'flash': 'warmup',
  'stats-chart': 'progress',
  'paw': 'pet',
};

class NativeTabBar extends StatelessWidget {
  const NativeTabBar({super.key, required this.active, required this.onTap, required this.accent});

  /// Маршрут подсвеченной вкладки; `null` — ни одной.
  final String? active;
  final ValueChanged<String> onTap;
  final Color accent;
  static const auroraExtraHeight = 12.0;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dark = theme.brightness == Brightness.dark;
    final bottom = MediaQuery.paddingOf(context).bottom;
    if (theme.extension<UiTemplateTheme>()?.template == UiTemplate.aurora) {
      // «Аврора»: сплошная панель фона шаблона, кромка `border`, активная — оранжевым.
      return Container(
        key: const ValueKey('native-tab-bar'),
        height: NativeTabs.height + auroraExtraHeight + bottom,
        padding: EdgeInsets.only(bottom: bottom),
        // The artwork already has an edge; a BoxDecoration border adds implicit
        // layout padding and clips large accessibility text in the fixed bar.
        decoration: BoxDecoration(
          image: ChromeArt.footer(dark),
        ),
        child: PilotLiquidSurface(child: _row(GameColors.aurora(theme.brightness).highlight, auroraToken('textSecondary', dark: dark)!, underline: true, dark: dark)),
      );
    }
    final idle = WebTheme.of(context).textSecondary; // BottomTabBar.tsx: невыбранная — textSecondary
    return ClipRect(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
        child: Container(
          key: const ValueKey('native-tab-bar'),
          height: NativeTabs.height + bottom,
          padding: EdgeInsets.only(bottom: bottom),
          decoration: BoxDecoration(
            color: dark ? const Color(0xB81C1C1E) : const Color(0xB8FFFFFF),
            border: Border(
                top: BorderSide(color: dark ? const Color(0x1FFFFFFF) : const Color(0x1A000000), width: 0.5)),
          ),
          child: _row(accent, idle),
        ),
      ),
    );
  }

  /// Пять вкладок — одна разметка на Classic и «Аврору»: значок 22, подпись 11/600, вся высота
  /// вкладки нажимается. [on] — цвет активной, [idle] — невыбранной. [underline] — полоса под
  /// активной вкладкой, как на рефе главной 30.10 («Аврора»); у остальных место под неё пустое,
  /// чтобы вкладки не прыгали.
  Widget _row(Color on, Color idle, {bool underline = false, bool dark = false}) => Row(children: [
            for (final t in NativeTabs.tabs)
              Expanded(
                child: Semantics(
                  button: true,
                  selected: active == t.route,
                  label: L.t(t.labelKey),
                  child: InkWell(
                    key: ValueKey('native-tab-${t.route}'),
                    // ⚠️ Вся высота вкладки нажимается, а не только значок (веб: порог 48 из
                    // tap-target-audit, подпись входит в цель).
                    onTap: active == t.route ? null : () => onTap(t.route),
                    child: SizedBox(
                      height: NativeTabs.height + (underline ? auroraExtraHeight : 0),
                      child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                        if (underline && _lightNavAssets.containsKey(t.icon))
                          Image.asset(
                            'assets/aurora_game_chrome/home_nav_extraction_trial/${dark ? 'dark_' : ''}${_lightNavAssets[t.icon]}.png',
                            width: 32, height: 32, fit: BoxFit.contain,
                            excludeFromSemantics: true,
                            errorBuilder: (_, _, _) => Icon(_tabIcons[t.icon], size: 22, color: active == t.route ? on : idle),
                          )
                        else if (underline)
                          Container(
                            width: 32, height: 32,
                            decoration: AuroraGlass.ring(dark),
                            child: Icon(_tabIcons[t.icon] ?? Icons.circle_outlined,
                                size: 21, color: active == t.route ? on : idle),
                          )
                        else
                          Icon(_tabIcons[t.icon] ?? Icons.circle_outlined,
                              size: 22, color: active == t.route ? on : idle),
                        const SizedBox(height: 2),
                        Text(L.t(t.labelKey),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                                fontSize: 11,
                                height: 1.2,
                                fontWeight: FontWeight.w600,
                                color: active == t.route ? on : idle)),
                        if (underline) ...[
                          const SizedBox(height: 1),
                          Container(
                            key: active == t.route ? const ValueKey('native-tab-underline') : null,
                            width: 24,
                            height: 3,
                            decoration: BoxDecoration(
                              color: active == t.route ? on : on.withValues(alpha: 0),
                              borderRadius: BorderRadius.circular(2),
                            ),
                          ),
                        ],
                      ]),
                    ),
                  ),
                ),
              ),
          ]);

}
