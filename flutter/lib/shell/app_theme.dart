import 'package:flutter/material.dart';

import 'shared_state.dart';
import 'app_look.dart';
import 'design_template.dart';

/// Тема Classic — одна на приложение и на игры, ещё не перенесённые на «Аврору»
/// ([AuroraGameScope]). Две копии разошлись бы при первой правке.
ThemeData classicShellTheme(Brightness brightness) => ThemeData(
  colorSchemeSeed: const Color(0xFF7F7FD5),
  brightness: brightness,
  useMaterial3: true,
);

/// Classic is unchanged. Aurora reuses the equipped/profile accent, not a new
/// universal orange that would erase the identity of the selected profile.
ThemeData appShellTheme(
  SharedState state, {
  Brightness brightness = Brightness.light,
}) {
  final template = parseUiTemplate(state.get(uiTemplateKey));
  var base = classicShellTheme(brightness);
  if (template == UiTemplate.aurora) {
    base = base.copyWith(
      colorScheme: base.colorScheme.copyWith(primary: AppLook.accentOf(state)),
    );
  }
  return applyUiTemplate(base, template);
}

/// Shared with the WebView; an explicit choice always wins over the profile.
ThemeMode appThemeMode(SharedState state) {
  switch (state.get('psygames_theme_override')) {
    case 'light':
      return ThemeMode.light;
    case 'dark':
      return ThemeMode.dark;
    case 'system':
      return ThemeMode.system;
    default:
      return const {
            'execs',
            'drivers',
            'chess',
            'odv999',
            'whatsnew',
          }.contains(state.activeProfile)
          ? ThemeMode.dark
          : ThemeMode.light;
  }
}
