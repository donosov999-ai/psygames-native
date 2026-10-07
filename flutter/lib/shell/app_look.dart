library;

import 'dart:convert';
import 'dart:ui' show PlatformDispatcher;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'shared_state.dart';

/// 🔴 ВИД ПРИЛОЖЕНИЯ — ТЕМ ЖЕ ПРАВИЛОМ, ЧТО У ВЕБА (задача eae0879c).
///
/// Веб (`frontend/src/contexts/ThemeContext.tsx`) решает так: базу светлоты и акцент задаёт
/// ПРОФИЛЬ (`PROFILE_THEME`), ручной выбор `psygames_theme_override` перебивает только
/// светлоту, надетый в магазине акцент (`psygames_cosmetics_equipped_<профиль>`) — только
/// акцент. Профиля нет в таблице — тёмная и `#0A84FF`.
///
/// ⚠️ Было до 01.10.2026: `MaterialApp` без `themeMode` — нативные экраны шли за темой
/// ТЕЛЕФОНА, а не за выбором человека. Переключатель «Тёмная тема» в настройках менял
/// только веб-половину. Данные — выгрузка `flutter/tools/embed-look.mjs` → `assets/look.json`.
class AppLook {
  AppLook._();

  static Map<String, dynamic> _data = const {};

  /// Режим для `MaterialApp.themeMode`. До загрузки — система, как было.
  static final mode = ValueNotifier<ThemeMode>(ThemeMode.system);

  /// Акцент текущего профиля (или надетый). Экраны оболочки красят им кнопки и тумблеры.
  static final accent = ValueNotifier<Color>(const Color(0xFF0A84FF));

  static const overrideKey = '${SharedState.prefix}theme_override';
  static String equippedKey(String profile) => '${SharedState.prefix}cosmetics_equipped_$profile';

  /// Ключи, от которых зависит вид: их смена в вебе или в настройках пересчитывает тему.
  static bool affects(String key) =>
      key == overrideKey || key == '${SharedState.prefix}active_profile' || key.startsWith('${SharedState.prefix}cosmetics_equipped_');

  static Future<void> load(SharedState state, {AssetBundle? bundle}) async {
    try {
      final raw = await (bundle ?? rootBundle).loadString('assets/look.json');
      _data = (jsonDecode(raw) as Map).cast<String, dynamic>();
    } catch (_) {
      _data = const {};
    }
    refresh(state);
  }

  /// Только для проб.
  @visibleForTesting
  static void useForTest(Map<String, dynamic> data) => _data = data;

  static Map<String, dynamic> _profile(String id) =>
      ((_data['profiles'] as Map?)?[id] as Map?)?.cast<String, dynamic>() ?? const {'mood': 'dark', 'accent': '#0A84FF'};

  /// Тёмная ли тема сейчас: ручной выбор, иначе профиль.
  static bool isDark(SharedState s) {
    final o = s.get(overrideKey);
    if (o == 'dark' || o == 'light') return o == 'dark';
    // «Системная» (с 2.56.12, как `appThemeMode` в app_theme.dart) — яркость телефона.
    if (o == 'system') return PlatformDispatcher.instance.platformBrightness == Brightness.dark;
    return _profile(s.activeProfile)['mood'] != 'light';
  }

  /// Акцент: надетый в магазине, иначе профильный.
  static Color accentOf(SharedState s) {
    final p = s.activeProfile;
    String? hex;
    try {
      final eq = jsonDecode(s.get(equippedKey(p)) ?? '{}') as Map;
      final id = eq['accent'];
      if (id is String) hex = (_data['accents'] as Map?)?[id] as String?;
    } catch (_) {}
    return hexColor(hex ?? _profile(p)['accent'] as String?) ?? const Color(0xFF0A84FF);
  }

  static void refresh(SharedState s) {
    mode.value = isDark(s) ? ThemeMode.dark : ThemeMode.light;
    accent.value = accentOf(s);
  }

  /// Цвет токена веба (`background`, `surface`, `card`, `text`, `textSecondary`, `border`…).
  static Color token(String name, {required bool dark}) =>
      hexColor((_data[dark ? 'dark' : 'light'] as Map?)?[name] as String?) ?? (dark ? Colors.white : Colors.black);

  static Color? hexColor(String? v) {
    if (v == null || !v.startsWith('#')) return null;
    final s = v.substring(1);
    final n = int.tryParse(s.length == 6 ? 'FF$s' : s, radix: 16);
    return n == null ? null : Color(n);
  }
}
