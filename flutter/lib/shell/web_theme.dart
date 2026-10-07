import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;

import 'shared_state.dart';

/// ПАЛИТРА ВЕБА ДЛЯ ГЛАВНЫХ ЭКРАНОВ, КОТОРЫЕ РИСУЕТ ОБОЛОЧКА (задачи 5136754e, 99628ecf).
///
/// 📍 Замер 07.10.2026, парные кадры веб/Flutter вкладки «Игры»: на цветах семени Material активная
/// вкладка nzt48 вышла индиго вместо фиолетового `#a855f7`, фон — лавандовым вместо `#F5F5F7`.
/// Правило Дениса 4e679f41: перенос — технология, не новый рисунок. Поэтому цвета берутся у веба:
/// `ThemeContext.tsx` (фон, поверхность, текст, акцент профиля) и `cosmetics.ts` (надетый в
/// магазине акцент главнее профильного) — выгрузкой `assets/web_theme.json`, сторож
/// `flutter-web-theme-asset-fresh.test.ts`. Светлота — та же, что у всего приложения
/// (`appThemeMode`), поэтому палитра выбирается по яркости темы.
class WebColors {
  const WebColors({
    required this.background,
    required this.surface,
    required this.card,
    required this.text,
    required this.textSecondary,
    required this.border,
  });

  final Color background;
  final Color surface;
  final Color card;
  final Color text;
  final Color textSecondary;
  final Color border;

  static Color hex(String s) => Color(0xFF000000 | int.parse(s.substring(1), radix: 16));

  static WebColors fromJson(Map<String, dynamic> j) => WebColors(
        background: hex(j['background'] as String),
        surface: hex(j['surface'] as String),
        card: hex(j['card'] as String),
        text: hex(j['text'] as String),
        textSecondary: hex(j['textSecondary'] as String),
        border: hex(j['border'] as String),
      );
}

class WebTheme {
  WebTheme._();

  // До загрузки — значения веба на 07.10, чтобы первый кадр не мигнул чужим цветом.
  static WebColors light = const WebColors(
    background: Color(0xFFF5F5F7),
    surface: Color(0xFFFFFFFF),
    card: Color(0xFFFFFFFF),
    text: Color(0xFF1C1C1E),
    textSecondary: Color(0xFF6E6E73),
    border: Color(0xFFE5E5EA),
  );
  static WebColors dark = const WebColors(
    background: Color(0xFF000000),
    surface: Color(0xFF1C1C1E),
    card: Color(0xFF2C2C2E),
    text: Color(0xFFFFFFFF),
    textSecondary: Color(0xFF8E8E93),
    border: Color(0xFF38383A),
  );
  static Map<String, String> profileAccents = const {};
  static String fallbackAccent = '#0A84FF';
  static Map<String, String> cosmeticAccents = const {};
  static String equippedKey = 'psygames_cosmetics_equipped_{profile}';
  static bool loaded = false;

  static Future<void> load() async {
    final b = await rootBundle.load('assets/web_theme.json');
    use(jsonDecode(utf8.decode(b.buffer.asUint8List(b.offsetInBytes, b.lengthInBytes))) as Map<String, dynamic>);
  }

  static void use(Map<String, dynamic> j) {
    light = WebColors.fromJson(j['light'] as Map<String, dynamic>);
    dark = WebColors.fromJson(j['dark'] as Map<String, dynamic>);
    profileAccents = {
      for (final e in (j['profiles'] as Map<String, dynamic>).entries)
        e.key: (e.value as Map<String, dynamic>)['accent'] as String,
    };
    fallbackAccent = (j['fallback'] as Map<String, dynamic>)['accent'] as String;
    cosmeticAccents = (j['cosmeticAccents'] as Map<String, dynamic>).cast<String, String>();
    equippedKey = j['equippedKey'] as String;
    loaded = true;
  }

  static WebColors of(BuildContext context) => Theme.of(context).brightness == Brightness.dark ? dark : light;

  /// `colors.primary` веба: надетый акцент (`getEquippedAccent`) → акцент профиля → запасной.
  static Color accent(SharedState state) {
    final profile = state.activeProfile;
    final raw = state.get(equippedKey.replaceAll('{profile}', profile));
    if (raw != null && raw.isNotEmpty) {
      try {
        final id = (jsonDecode(raw) as Map<String, dynamic>)['accent'];
        final c = id is String ? cosmeticAccents[id] : null;
        if (c != null) return WebColors.hex(c);
      } catch (_) {/* битая запись — как у веба: профильный */}
    }
    return WebColors.hex(profileAccents[profile] ?? fallbackAccent);
  }

  /// УМОЛЧАНИЯ ТЕКСТА ВЕБА для экранов, которые рисует оболочка.
  ///
  /// 📍 Пара кадров 07.10.2026: нативный текст выходил шире веба на ту же строку — «Ещё ⭐135 — и
  /// новая фигурка · собрано 0/12» переносился на вторую строку, и вся лента Главной съезжала вниз.
  /// Причина — умолчания Material 3: межбуквенный 0,25 и межстрочный 1,43; у React Native — 0 и
  /// «normal» (метрики шрифта). Здесь ставятся умолчания веба: размер 14, цвет `text`, межбуквенный
  /// 0, межстрочный — по шрифту. Явные стили экранов поверх них работают как раньше.
  static Widget textDefaults(BuildContext context, Widget child) {
    final base = Theme.of(context).textTheme.bodyMedium;
    return DefaultTextStyle(
      style: TextStyle(
        fontFamily: base?.fontFamily,
        fontFamilyFallback: base?.fontFamilyFallback,
        fontSize: 14,
        letterSpacing: 0,
        color: of(context).text,
      ),
      child: child,
    );
  }

  /// Текст поля: размер у веба не задан — берётся 14 по умолчанию React Native, цвет `text`.
  /// ⚠️ Через тему, а не голым TextStyle: голый затирает семейство шрифта темы (кадр 07.10 —
  /// значение фильтра квадратами).
  static TextStyle fieldText(BuildContext context) =>
      (Theme.of(context).textTheme.bodyMedium ?? const TextStyle()).copyWith(color: of(context).text, fontSize: 14, height: 1.4);

  /// Поле ввода веба (`HomeCatalogSearch.tsx`): высота от 48, поле 14, рамка 1 цвета
  /// `textSecondary`, скругление 12, фон `surface`.
  static InputDecoration field(BuildContext context, {String? hint, Widget? suffix}) {
    final c = of(context);
    final edge = OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: BorderSide(color: c.textSecondary),
    );
    return InputDecoration(
      hintText: hint,
      hintStyle: fieldText(context).copyWith(color: c.textSecondary),
      filled: true,
      fillColor: c.surface,
      isDense: true,
      constraints: const BoxConstraints(minHeight: 48),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: edge,
      enabledBorder: edge,
      focusedBorder: edge,
      suffixIcon: suffix,
    );
  }
}
