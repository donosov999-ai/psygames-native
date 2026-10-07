import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/painting.dart';

/// ГЛАВНЫЕ ЭКРАНЫ ПО МОДЕЛИ ОТ ВЕБА (`frontend/src/services/hostScreens.ts`, задачи 7c88c0b8 и др.).
///
/// Тот же приём, что у экранов зарядки ([WarmupUi]): веб-экран стоит под оболочкой, считает всё сам и
/// отдаёт готовую модель (`{op:'screenUi', route, model}`) — тексты на языке человека, числа,
/// цвета строками CSS, картинки адресами сборки. Оболочка рисует; нажатия, меняющие данные, уходят
/// обратно: `window.__psyScreenUi['<адрес>'].<действие>(…)`. Второй копии расчётов на Dart нет.
class ScreenUi {
  ScreenUi._();

  /// Адреса, чьи экраны рисует оболочка по модели. Веб узнаёт их из `window.__psyHostScreens`.
  /// `#…` — не адрес, а окно экрана (переключатель профилей живёт на Главной).
  static const routes = {'/', '#switcher', '/statistics', '/streak-calendar', '/assessment-result', '/onboarding', '/sources', '/collection', '/achievements', '/leagues', '/friends'};

  static final _models = <String, ValueNotifier<Map<String, Object?>?>>{};

  /// Последняя модель экрана; `null` — страница ещё не прислала.
  static ValueNotifier<Map<String, Object?>?> model(String route) =>
      _models.putIfAbsent(route, () => ValueNotifier<Map<String, Object?>?>(null));

  /// Как звать страницу; ставит оболочка (`hybrid_app.dart`), пробы — свою.
  static Future<void> Function(String js)? run;

  /// Сообщение страницы. true — наше.
  static bool accept(Object? m) {
    if (m is! Map || m['op'] != 'screenUi') return false;
    final route = m['route'];
    final value = m['model'];
    if (route is String && value is Map) model(route).value = Map<String, Object?>.from(value);
    return true;
  }

  /// Действие экрана страницы. Нет страницы или действия — молча ничего.
  static Future<void> act(String route, String action, [List<Object?> args = const []]) async {
    final call = run;
    if (call == null) return;
    final r = jsonEncode(route);
    final a = args.map(jsonEncode).join(',');
    await call(
      'window.__psyScreenUi && window.__psyScreenUi[$r] && window.__psyScreenUi[$r].$action && '
      'window.__psyScreenUi[$r].$action($a);',
    );
  }

  @visibleForTesting
  static void reset() {
    for (final n in _models.values) {
      n.value = null;
    }
    run = null;
  }
}

/// Цвет строкой CSS, как его отдаёт веб: `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb(…)`, `rgba(…)`,
/// `transparent`. Не разобрали — [fallback].
Color cssColor(Object? v, [Color fallback = const Color(0x00000000)]) {
  if (v is! String) return fallback;
  final s = v.trim().toLowerCase();
  if (s == 'transparent') return const Color(0x00000000);
  if (s.startsWith('#')) {
    var h = s.substring(1);
    if (h.length == 3 || h.length == 4) h = h.split('').map((c) => '$c$c').join();
    final n = int.tryParse(h, radix: 16);
    if (n == null) return fallback;
    if (h.length == 6) return Color(0xFF000000 | n);
    if (h.length == 8) return Color(((n & 0xFF) << 24) | (n >> 8));
    return fallback;
  }
  final m = RegExp(r'^rgba?\(([^)]*)\)$').firstMatch(s);
  if (m != null) {
    final p = m.group(1)!.split(',').map((x) => x.trim()).toList();
    if (p.length < 3) return fallback;
    int ch(String x) => (double.tryParse(x) ?? 0).round().clamp(0, 255);
    final a = p.length > 3 ? (double.tryParse(p[3]) ?? 1).clamp(0.0, 1.0) : 1.0;
    return Color.fromARGB((a * 255).round(), ch(p[0]), ch(p[1]), ch(p[2]));
  }
  return fallback;
}
