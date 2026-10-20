import 'asset_json.dart';
import 'collection_model.dart' show hexOf;
import 'home_inputs.dart' show dailyChallenge, homeProfileOf;
import 'l10n.dart';
import 'profiles.dart';
import 'sessions.dart' show jsTruthy;
import 'shared_state.dart';
import 'stats_model.dart' show activeProfileOf;
import 'web_theme.dart';

/// 🔴 МОДЕЛЬ «ЗНАКОМСТВА» НА DART (задача d6a60b02, вариант Б).
///
/// Повторяет модель `/onboarding` из `app/onboarding.tsx`: ПОДБОР (три вопроса → три игры «под себя»,
/// список игр знакомства) и ОБУЧЕНИЕ (`?tutorial=1`: слайды, точки, «Дальше»). Подбор `pickGames` — чистая
/// функция от трёх ответов, поэтому едет таблицей на все 27 сочетаний (`assets/onboarding.json`, проба
/// `flutter-onboarding-asset-fresh`), а не вторым счётом весов. Шаг обучения и ответы подбора держит экран;
/// «занято» рождает действие страницы (переход, отметка «пройдено») — оно приходит поверх
/// (`withOnboardingPageEvents`). Сверка — эталоны `onboarding-dart-model.test.tsx` (`test/onboarding_model_test.dart`).
class OnboardingData {
  OnboardingData({required this.j, required this.profilesJson, required this.games});

  /// `assets/onboarding.json`.
  final Map<String, Object?> j;

  /// `assets/profiles.json` — состав профиля (зарядка) и число игр.
  final Map<String, Object?> profilesJson;

  /// Записи `assets/catalog.json` в порядке `GAMES` — ротация вызова дня.
  final List<Map<String, Object?>> games;

  List<Map<String, Object?>> rows(String k) => [for (final x in (j[k]! as List)) (x as Map).cast<String, Object?>()];
  bool isRtl(String language) => (j['rtl']! as List).contains(language.split('-').first.toLowerCase());

  static OnboardingData? _cache;
  static Future<OnboardingData> load() async {
    if (_cache case final c?) return c;
    final catalog = await loadJsonAsset('assets/catalog.json');
    return _cache = OnboardingData(
      j: await loadJsonAsset('assets/onboarding.json'),
      profilesJson: await loadJsonAsset('assets/profiles.json'),
      games: [for (final g in (catalog['games']! as List)) (g as Map).cast<String, Object?>()],
    );
  }
}

Map<String, Object?> _map(Object? v) => v is Map ? v.cast<String, Object?>() : const {};

/// Слайды обучения. Слайд уведомлений веб показывает только вне веба (`Platform.OS !== 'web'`); под
/// оболочкой страница — веб, и его нет. [notifications] — показывать ли.
List<Map<String, Object?>> onboardingSlides(OnboardingData d, {required bool notifications}) => [
  for (final s in d.rows('slides'))
    if (notifications || s['kind'] != 'notifications') s,
];

/// Модель «Знакомства» — та же, что у веба. [tutorial] — `?tutorial=1`; [step] — слайд обучения; [quiz] —
/// ответы подбора по осям (`mood`, `time`, `taste` → 0…2); [wall] — местное «сейчас» (вызов дня).
Map<String, Object?> onboardingModelFrom(
  SharedState state,
  OnboardingData d, {
  required Profiles profiles,
  required String language,
  required bool tutorial,
  required bool notifications,
  required int step,
  required Map<String, int> quiz,
  required DateTime wall,
}) {
  final p = activeProfileOf(profiles, state);
  final rtl = d.isRtl(language);
  final cards = _map(d.j['cards']);
  Map<String, Object?> card(Object? id) {
    final g = _map(cards[id]);
    final name = L.t(g['nameKey']! as String), skill = L.t(g['skillKey']! as String);
    return {
      'id': g['id'],
      'name': name,
      'skill': skill,
      'desc': L.t(g['descKey']! as String),
      'a11y': '$name. $skill',
      'gradient': g['gradient'],
      'icon': g['icon'],
      'thumb': g['thumb'],
    };
  }

  if (!tutorial) {
    // `hasPickedOnboarding`: подбор этим профилем пройден — страница уводит на Главную, экран ждёт.
    if (state.get('psygames_onboarding_picked_${p.id}') == '1') {
      return {'v': 1, 'mode': 'loading', 'primary': hexOf(WebTheme.accent(state, profile: p.id).toARGB32())};
    }
    final axes = d.rows('quiz');
    final done = axes.every((q) => quiz.containsKey(q['axis']));
    final pick = done ? _map(_map(d.j['picks'])[axes.map((q) => quiz[q['axis']]).join()]) : null;
    final label = pick == null ? null : _map(d.j['profileLabels'])[pick['profileId']];
    return {
      'v': 1,
      'mode': 'picker',
      'busy': false,
      'exit': L.t('skip'),
      'heading': {'emoji': '🎮', 'title': L.t('onbPickGameTitle'), 'body': L.t('onbPickGameBody')},
      'quiz': {
        'title': '🎯 ${L.t('onbQuizTitle')}',
        'questions': [
          for (final q in axes)
            {
              'axis': q['axis'],
              'q': L.t(q['qKey']! as String),
              'opts': [
                for (final (i, optKey) in (q['opts']! as List).indexed) {'label': L.t(optKey as String), 'on': quiz[q['axis']] == i},
              ],
            },
        ],
        'yours': pick == null
            ? null
            : {
                'title': L.t('onbQuizYours'),
                'cards': [for (final id in (pick['games']! as List)) card(id)],
                'profile': label is String ? L.t('onbQuizProfile').replaceFirst('{p}', label) : null,
              },
      },
      'or': L.t('onbQuizOr'),
      'cards': [for (final id in (d.j['pickerGames']! as List)) card(id)],
      'hint': L.t('onbPickGameHint'),
    };
  }

  final slides = onboardingSlides(d, notifications: notifications);
  final at = step.clamp(0, slides.length - 1);
  final slide = slides[at];
  final isLast = at == slides.length - 1;
  final isNotif = slide['kind'] == 'notifications', isFinal = slide['kind'] == 'final';
  // `!!profile?.warmup_enabled` — профиль с наложенным составом (`зарядка_включена`).
  final canWarmup = jsTruthy(homeProfileOf(p, state, d.profilesJson).warmupEnabled);
  final count = _map(d.profilesJson['flags'])['PUBLIC_GAME_COUNT'];
  String? finalHint;
  if (isFinal) {
    final today = dailyChallenge(d.games, wall).game;
    finalHint = canWarmup ? L.t('onbWarmupReady') : '🎲 ${L.t('today')}: ${L.t(today['nameKey']! as String)}';
  }
  return {
    'v': 1,
    'mode': 'tutorial',
    'busy': false,
    'rtl': rtl,
    'counter': '${at + 1} / ${slides.length}',
    'skip': !isLast ? L.t('skip') : null,
    'slide': {
      'emoji': slide['emoji'],
      'gradient': slide['gradient'],
      'title': L.t(slide['titleKey']! as String),
      'body': L.t(slide['bodyKey']! as String).replaceFirst('{n}', '$count'),
      'finalHint': finalHint,
    },
    'dots': {'count': slides.length, 'active': at},
    'main': {
      'label': isNotif
          ? L.t('onbEnableReminders')
          : isFinal
          ? (canWarmup ? L.t('onbStartFirstWarmup') : L.t('onbPlayDailyChallenge'))
          : L.t('onbNext'),
      'icon': isFinal ? 'play' : (rtl ? 'arrow-back' : 'arrow-forward'),
    },
    'secondary': isNotif
        ? L.t('notNow')
        : isFinal
        ? L.t('justLookAround')
        : null,
  };
}

/// Нажатия страницы поверх своей модели: «занято» (переход и отметка «пройдено» идут) рождает только
/// действие веба. Остальное своё.
Map<String, Object?> withOnboardingPageEvents(Map<String, Object?> own, Map<String, Object?>? page) {
  if (page == null || page['mode'] != own['mode'] || !page.containsKey('busy')) return own;
  return {...own, 'busy': page['busy']};
}

/// Шаг обучения и ответы подбора, которые показывает страница, — экран берёт их, когда её модель
/// сменилась: так шаг не расходится, если нажатие до страницы не дошло. `null` — модели нет.
({int? step, Map<String, int>? quiz}) onboardingPageState(Map<String, Object?>? page) {
  if (page == null) return (step: null, quiz: null);
  if (page['mode'] == 'tutorial') {
    final a = _map(page['dots'])['active'];
    return (step: a is num ? a.toInt() : null, quiz: null);
  }
  if (page['mode'] == 'picker') {
    final out = <String, int>{};
    for (final q in (_map(page['quiz'])['questions'] as List? ?? const [])) {
      final m = _map(q);
      for (final (i, o) in ((m['opts'] as List?) ?? const []).indexed) {
        if (_map(o)['on'] == true) out['${m['axis']}'] = i;
      }
    }
    return (step: null, quiz: out);
  }
  return (step: null, quiz: null);
}
