import 'dart:async';

import 'package:flutter/services.dart';

import 'practices.dart';

/// 🔴 ВИБРОСОПРОВОЖДЕНИЕ ПРАКТИК «ПАУЗЫ» — перенос из «Умного будильника»
/// (smart-alarm-flutter/lib/core/practice_haptics.dart, тот же движок практик).
///
/// Денис, 01.10.2026: «виброотклик… дребезжание при Кегеле на удержании» и «вынеси
/// нормально в настройки всех приложений». Кегель вибрирует мягко ВСЁ удержание
/// (шаги `*-squeeze`), на отдыхе — тишина; остальные практики — короткий сигнал
/// смены шага. Выключатель один — «Вибрация» в настройках (`appHapticOn`).
///
/// Один конечный эффект на шаг, не вызов на кадр: смена шага → один `play`,
/// пауза, уход экрана и выключатель → `stop`.
class PausePracticeHaptics {
  PausePracticeHaptics(this._enabled);

  static const channel = MethodChannel('pro.psygames/practiceHaptics');

  /// Те же умолчания, что у будильника. В PsyGames выбора по видам нет —
  /// только общий выключатель.
  static const modes = <String, String>{
    'kegel': 'hold',
    'breathing': 'phases',
    'muscles': 'phases',
    'eyes': 'phases',
    'mobility': 'phases',
    'meditation': 'phases',
    'voice': 'phases',
  };

  /// В параллельном занятии вибрирует одна практика. Настройки «ведущей» в
  /// PsyGames нет, поэтому ведёт Кегель: ради его удержания вибрацию и просили.
  static const leader = 'kegel';

  /// 🔴 Сила ОЩУТИМАЯ. Денис, 01.10.2026: «вибрации нет нихуя». 0,25 из 1,0 при
  /// резкости 0,15 (и потолок 0,6 в iOS) — едва различимый гул Taptic Engine, в руке
  /// его не слышно. Нативные стороны теперь пускают до 1,0.
  static const strength = .8;

  final bool Function() _enabled;
  String? _key;
  String? _last;
  bool _disposed = false;

  static String category(Json step) {
    final set = step['setId'], program = step['programId'];
    if (program == 'breath-awareness' || (set == 'relaxation' && program != 'pmr-groups')) {
      return 'meditation';
    }
    return switch (set) {
      'pelvic-floor' => 'kegel',
      'breathing' => 'breathing',
      'relaxation' || 'isometrics' => 'muscles',
      'eye-gym' => 'eyes',
      'mobility' || 'postures' || 'feldenkrais' => 'mobility',
      'face-speech' => 'voice',
      _ => '',
    };
  }

  static bool owns(Json plan, int elapsed, String candidate) {
    final kinds = objects(plan['timeline'])
        .where((s) => elapsed >= s['startMs'] && elapsed < s['endMs'])
        .map(category)
        .where((s) => s.isNotEmpty)
        .toSet();
    if (!kinds.contains(candidate)) return false;
    return kinds.length == 1 || candidate == leader;
  }

  void update(Json plan, int elapsedMs) {
    if (_disposed) return;
    final step = objects(plan['timeline'])
        .where((s) => elapsedMs >= s['startMs'] && elapsedMs < s['endMs'])
        .where((s) => owns(plan, elapsedMs, category(s)))
        .firstOrNull;
    if (step == null) {
      _last = null;
      if (_key != null) stop();
      return;
    }
    final kind = category(step);
    _last = kind;
    final on = _enabled();
    final key = '${plan['id']}/${step['setId']}/${step['programId']}/${step['stepId']}/${step['startMs']}/$on';
    if (_key == key) return;
    stop();
    _key = key;
    final mode = modes[kind] ?? 'off';
    if (!on || mode == 'off') return;
    final id = '${step['stepId']}';
    final squeeze = id.endsWith('squeeze');
    final pelvic = kind == 'kegel';
    // Отдых Кегеля в режиме удержания молчит.
    if (pelvic && mode == 'hold' && !squeeze) return;
    if (kind == 'breathing' && id.startsWith('hold')) return;
    final beginning = !objects(plan['timeline']).any((s) => category(s) == kind && s['startMs'] < step['startMs']);
    if ((kind == 'meditation' || kind == 'voice') && !beginning) return;
    final out = id.contains('exhale') || id.endsWith('-out');
    if (kind == 'breathing' && !(out || id.contains('inhale') || id.endsWith('-in'))) return;
    final release = id.contains('release') || id == 'rest' || id == 'neutral';
    final continuous = pelvic && mode == 'hold' && squeeze;
    final remaining = (step['endMs'] as int) - elapsedMs;
    unawaited(_send('play', {
      'durationMs': continuous ? remaining.clamp(1, 30000) : 60,
      'strength': strength,
      'continuous': continuous,
      'count': out || release ? 2 : 1,
    }));
  }

  /// Конец занятия: у спокойных практик — двойной сигнал «готово».
  void complete() {
    final last = _last;
    stop();
    if (_disposed || !_enabled() || last == null) return;
    if (['eyes', 'meditation', 'mobility', 'voice'].contains(last)) {
      unawaited(_send('play', {'durationMs': 60, 'strength': strength, 'continuous': false, 'count': 2}));
    }
  }

  void stop() {
    _key = null;
    unawaited(_send('stop'));
  }

  void dispose() {
    stop();
    _disposed = true;
  }

  Future<void> _send(String method, [Json? arguments]) async {
    try {
      await channel.invokeMethod<void>(method, arguments);
    } on MissingPluginException {
      // Веб и платформы без моторчика — только экран.
    } on PlatformException {
      // Вибрация не имеет права прервать упражнение.
    }
  }
}
