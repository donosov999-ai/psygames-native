import 'dart:async';

import 'package:flutter/services.dart';

import 'practices.dart';

/// One finite native effect per timeline step, never one call per frame.
/// No timers can restart an effect after pause/dispose.
class PracticeHaptics {
  /// Один канал на оба приложения — его обслуживает нативная часть пакета.
  static const channel = MethodChannel('pro.psygames.practice_kit/haptics');
  String? _key;
  bool _disposed = false;
  String? _lastCategory;
  static String category(Json step) {
    final set = step['setId'], program = step['programId'];
    if (program == 'breath-awareness' ||
        (set == 'relaxation' && program != 'pmr-groups')) {
      return 'meditation';
    }
    return switch (set) {
      'pelvic-floor' => 'kegel',
      'abdomen' => 'abdomen',
      'face-massage' => 'massage',
      'breathing' => 'breathing',
      'relaxation' || 'isometrics' => 'muscles',
      'eye-gym' => program == 'catch-overlap' ? 'eyeHit' : 'eyes',
      'mobility' || 'postures' || 'feldenkrais' => 'mobility',
      'face-speech' => 'voice',
      _ => '',
    };
  }

  /// 🔴 Вибрация включена с первого запуска. Денис, 01.10.2026: «виброотклик
  /// не вижу нигде — дребезжание при Кегеле на удержании». До этого каждый вид
  /// стоял на 'off', пока его не включат в карточке в самом низу каталога
  /// конструктора, и вибрации не было ни у кого.
  static const defaults = <String, String>{
    'kegel': 'hold',
    // «Живот» — как Кегель: гудит, пока держите, тишина, пока отпускаете.
    'abdomen': 'hold',
    'massage': 'phases',
    'breathing': 'phases',
    'muscles': 'phases',
    'eyes': 'phases',
    'eyeHit': 'phases',
    'mobility': 'phases',
    'meditation': 'phases',
    'voice': 'phases',
  };

  /// 🔴 Сила по умолчанию — ОЩУТИМАЯ. Денис, 01.10.2026, сборка 0.4.3 (29): «вибрации
  /// нет нихуя». Включено было, но слало 0,25 из 1,0 при резкости 0,15 — на Taptic
  /// Engine iPhone это едва различимый гул, в руке его не слышно. Шкала теперь 0,1–1,0,
  /// по умолчанию 0,8. Ключ настройки новый (`intensity`, прежде `strength` по шкале
  /// 0,1–0,6): старое слабое значение не переносится, всем достаётся 0,8.
  static const defaultStrength = .8;
  static const maxStrength = 1.0;

  static double strengthOf(Json config) {
    final s = config['practiceHaptics'] as Map? ?? const {};
    return ((s['intensity'] as num?) ?? defaultStrength).toDouble().clamp(
      .1,
      maxStrength,
    );
  }

  /// Наборы, где шаги делятся на «держать» и «отпустить».
  ///
  /// 🔴 Денис, 01.10.2026 (вибрация в Кегеле заработала): «по животу вообще
  /// непонятно, когда держать, когда отпускать». У «Живота» вибрации не было
  /// совсем — набор не попадал ни в одну категорию.
  static const holdKinds = {'kegel', 'abdomen'};

  /// Шаг напряжения (держать), а не отпускания/отдыха.
  static bool isTension(String kind, String stepId) {
    if (kind == 'kegel') return stepId.endsWith('squeeze');
    if (kind == 'abdomen') {
      return !RegExp(r'release|finish|recover|rest').hasMatch(stepId);
    }
    return false;
  }

  static String modeOf(Json config, String category) {
    final s = config['practiceHaptics'] as Map? ?? const {};
    return (s[category] as String?) ?? defaults[category] ?? 'off';
  }

  static bool enabled(Json config, String category) {
    final s = config['practiceHaptics'] as Map? ?? const {};
    return s['enabled'] != false && modeOf(config, category) != 'off';
  }

  /// Кто ведёт вибрацию в параллельном занятии, если человек не выбрал сам.
  ///
  /// 🔴 Денис, 01.10.2026, на 0.4.3 (32): «вибрация не работает». Без явной
  /// «ведущей» параллельное занятие молчало ЦЕЛИКОМ (проба держала это как
  /// правило), а «ведущую» надо было найти в настройках. Кегель с дыханием и
  /// глазами — ровно его занятие. Теперь без выбора ведёт первый по этому списку:
  /// Кегель — ради удержания вибрацию и просили.
  static const leaderOrder = [
    'kegel',
    'abdomen',
    'breathing',
    'muscles',
    'massage',
    'eyes',
    'eyeHit',
    'mobility',
    'meditation',
    'voice',
  ];

  static bool owns(Json plan, int elapsed, Json config, String candidate) {
    final categories = objects(plan['timeline'])
        .where((s) => elapsed >= s['startMs'] && elapsed < s['endMs'])
        .map(category)
        .where((s) => s.isNotEmpty)
        .toSet();
    if (!categories.contains(candidate)) return false;
    if (categories.length == 1) return true;
    final chosen = (config['practiceHaptics'] as Map?)?['leader'] as String?;
    // Явный выбор человека держится: выбранная, но неактивная — молчание.
    if (chosen != null && chosen.isNotEmpty) return chosen == candidate;
    return leaderOrder.firstWhere(categories.contains, orElse: () => '') == candidate;
  }

  /// Последние вызовы вибрации — едут в отчёт об ошибке (`diagnostics`): жалоба
  /// «вибрации нет» без них неразбираема — не видно, ушёл ли сигнал вообще.
  static final recent = <Json>[];

  static void _remember(Json entry) {
    recent.add({...entry, 'atMs': DateTime.now().millisecondsSinceEpoch});
    if (recent.length > 12) recent.removeAt(0);
  }

  /// Настройки вибрации, возможности устройства и последние вызовы — для отчёта.
  static Future<Json> diagnostics(Json config) async => {
    'settings': config['practiceHaptics'],
    'device': await capabilities(),
    'recent': List<Json>.from(recent),
  };

  void event(Json config, String category, {int count = 1}) {
    if (_disposed || !enabled(config, category)) return;
    unawaited(
      _send('play', {
        'durationMs': 60,
        'continuous': false,
        'count': count,
        'strength': strengthOf(config),
      }),
    );
  }

  void complete(Json config) {
    final last = _lastCategory;
    stop();
    if (['eyes', 'meditation', 'mobility', 'voice'].contains(last)) {
      event(config, last!, count: 2);
    }
  }

  static Future<Map<String, dynamic>> capabilities() async {
    try {
      return Map<String, dynamic>.from(
        await channel.invokeMapMethod<String, dynamic>('capabilities') ?? {},
      );
    } on MissingPluginException {
      return {};
    } on PlatformException {
      return {};
    }
  }

  Future<void> _send(String method, [Json? arguments]) async {
    final entry = <String, dynamic>{'m': method, ...?arguments};
    try {
      await channel.invokeMethod<void>(method, arguments);
      if (method == 'play') _remember({...entry, 'ok': true});
    } on MissingPluginException {
      // Desktop, web and unsupported devices remain visual-only.
      if (method == 'play') _remember({...entry, 'ok': 'no-plugin'});
    } on PlatformException catch (e) {
      // Haptics must never interrupt an exercise.
      if (method == 'play') _remember({...entry, 'ok': 'error:${e.code}'});
    }
  }

  void stop() {
    _key = null;
    unawaited(_send('stop'));
  }

  void dispose() {
    _disposed = true;
    stop();
  }

  void preview(String mode, double strength) {
    if (_disposed) return;
    stop();
    if (mode != 'off') {
      unawaited(
        _send('play', {
          'durationMs': mode == 'hold' ? 1000 : 60,
          'strength': strength.clamp(.1, maxStrength),
          'continuous': mode == 'hold',
        }),
      );
    }
  }

  void update(Json plan, int elapsedMs, Json config) {
    if (_disposed) return;
    final settings = config['practiceHaptics'] as Map? ?? const {};
    final active = objects(plan['timeline'])
        .where((s) => elapsedMs >= s['startMs'] && elapsedMs < s['endMs']);
    final step = active
        .where((s) => owns(plan, elapsedMs, config, category(s)))
        .firstOrNull;
    if (step == null) {
      _lastCategory = null;
      if (_key != null) stop();
      return;
    }
    final kind = category(step);
    _lastCategory = kind;
    // Наборы «держать — отпустить»: в режиме удержания гудят ВСЁ напряжение.
    final pelvic = holdKinds.contains(kind);
    final mode = modeOf(config, kind);
    final strength = strengthOf(config);
    final key =
        '${plan['id']}/${step['setId']}/${step['programId']}/'
        '${step['stepId']}/${step['startMs']}/$mode/$strength/'
        '${settings['enabled']}/${settings['meditationSteps']}/${settings['leader']}';
    if (_key == key) return;
    stop();
    _key = key;
    final squeeze = isTension(kind, '${step['stepId']}');
    // Relaxation is always silent in hold mode. Phase mode has a brief cue.
    if (!enabled(config, kind) || (pelvic && mode == 'hold' && !squeeze)) {
      return;
    }
    if (kind == 'eyeHit') return; // Only a validated hit may trigger feedback.
    final id = '${step['stepId']}';
    if (kind == 'breathing' && id.startsWith('hold')) return;
    final beginning = !objects(plan['timeline'])
        .any((s) => category(s) == kind && s['startMs'] < step['startMs']);
    if ((kind == 'meditation' && settings['meditationSteps'] != true ||
            kind == 'voice') &&
        !beginning) {
      return;
    }
    final out = id.contains('exhale') || id.endsWith('-out');
    if (kind == 'breathing' &&
        !(out || id.contains('inhale') || id.endsWith('-in'))) {
      return;
    }
    final release = id.contains('release') || id == 'rest' || id == 'neutral';
    final continuous = pelvic && mode == 'hold' && squeeze;
    final remaining = (step['endMs'] as int) - elapsedMs;
    unawaited(
      _send('play', {
        'durationMs': continuous ? remaining.clamp(1, 30000) : 60,
        'strength': strength,
        'continuous': continuous,
        'count': out || release ? 2 : 1,
      }),
    );
  }
}
