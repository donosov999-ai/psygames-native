import 'package:flutter/material.dart';
import 'shared_state.dart';

/// Shared with the WebView; an explicit choice always wins over the profile.
ThemeMode appThemeMode(SharedState state) {
  switch (state.get('psygames_theme_override')) {
    case 'light': return ThemeMode.light;
    case 'dark': return ThemeMode.dark;
    case 'system': return ThemeMode.system;
    default:
      return const {'execs', 'drivers', 'chess', 'odv999', 'whatsnew'}
          .contains(state.activeProfile) ? ThemeMode.dark : ThemeMode.light;
  }
}
