import 'package:flutter/services.dart';

import 'shared_state.dart';

/// ВИБРАЦИЯ ПРИЛОЖЕНИЯ — один выключатель на веб и нативные экраны.
///
/// Тумблер «Вибрация» в настройках веба (`frontend/app/settings.tsx`,
/// `frontend/src/services/feedback.ts`) пишет `psygames_haptic_enabled`, по
/// умолчанию включено. Общая память возит ключ в нативную половину, но до
/// 01.10.2026 его здесь не читал никто: нативная «Пауза» вибрировала при
/// выключенном тумблере. Решение Дениса 01.10.2026: «вынеси нормально в
/// настройки всех приложений, где это актуально».
///
/// 🔴 Любая вибрация нативного экрана идёт отсюда. Голый `HapticFeedback.` во
/// `flutter/lib` ловит проба `haptics_setting_test.dart`.
const hapticKey = '${SharedState.prefix}haptic_enabled';

bool appHapticOn(SharedState s) {
  final v = s.get(hapticKey);
  return v == null || v == 'true';
}

class AppHaptics {
  AppHaptics(this._state);

  final SharedState _state;

  bool get on => appHapticOn(_state);

  Future<void> selection() => on ? HapticFeedback.selectionClick() : Future.value();
  Future<void> medium() => on ? HapticFeedback.mediumImpact() : Future.value();
  Future<void> heavy() => on ? HapticFeedback.heavyImpact() : Future.value();

  // 📳 ОТКЛИК ХОДА В ИГРАХ — ТРИ СОБЫТИЯ, ОДНО ОЩУЩЕНИЕ НА КАЖДОЕ (задача 792432f8).
  //
  // Денис 08.10.2026: «в матрице памяти виброотклик хорошо зашёл — надо раскатывать где уместно».
  // Образец — «Матрица памяти»: верное нажатие — лёгкий щелчок, собранный раунд — толчок сильнее,
  // ошибка или проигранный раунд — тяжёлый. Игры зовут эти три, а не толчок по вкусу: так одно и то же
  // событие ощущается одинаково во всём приложении. Тумблер «Вибрация» глушит их, как и остальное.

  /// Ход принят: верная клетка, верный ответ, найденный предмет.
  Future<void> hit() => selection();

  /// Раунд или уровень собран.
  Future<void> win() => medium();

  /// Ошибка: неверная клетка или ответ, проигранный раунд.
  Future<void> miss() => heavy();
}
