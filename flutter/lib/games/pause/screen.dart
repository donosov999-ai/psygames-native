// «Пауза / Зарядка» на Flutter — хаб телесных практик.
//
// 🔴 ОТКУДА. Веб-экран `frontend/app/games/pause.tsx` — тонкий переходник: планировщик,
// картинки и ход практики он берёт у страницы зарядки «Умного будильника»
// (`public/warmup`), а сам сохраняет итог. Здесь то же разделение, но нативно:
// ядро — `practices.dart` (сверено с живым TS, `test/pause_core_test.dart`), сцена —
// `stage.dart` (взята у Flutter-будильника), экран — этот файл.
//
// 🔴 ПАРИТЕТ С ПЛАНИРОВЩИКОМ СТРАНИЦЫ, А НЕ «ПОХОЖЕ». Режимы — отдельно, параллельно,
// маршрут; длительности — 1, 2, 5, 8 минут; подсказка — экран, звук или оба; обстановка —
// за столом, незаметно, дома. Подписи — словарём САМОЙ страницы (`assets/pause/copy.json`,
// 12 языков): человек видит те же слова, что в вебе. Перехват адреса включён только
// потому, что режимы перенесены все (правило доски переезда, урок «Анаграмм»).
//
// 🔴 НИЧЕГО НЕ БЛОКИРУЕМ. Предупреждения, «нужен опыт», «освоено отдельно» — советы:
// план строится с `advisory: true` (решение Дениса 24.09.2026 — «он запускает и смотрит,
// а не ты блокируешь»). Галочку «я прочитал» код не ставит и не требует.
//
// 🔴 ИТОГ — В ТОТ ЖЕ `saveSession`, ЧТО У ВЕБА, С ТЕМИ ЖЕ ПОЛЯМИ: `game_type: pause`,
// минуты в `score`, обстановка в `difficulty`, наборы в `details.sets`. На этой записи
// стоят статистика и шаг зарядки. Выход посреди практики не записывается — как в вебе.
import 'dart:async';
import 'dart:math' as math;
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';
import 'package:practice_kit/practice_kit.dart';

import '../../shell/app_haptics.dart';
import '../../shell/audio_host.dart' show appSoundOn;
import '../../shell/aux_action.dart';
import '../../shell/chrome_art.dart';
import '../../shell/game_preset.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/session_report.dart';
import '../../shell/sessions.dart' show readSessions;
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import '../../shell/voice.dart';
import '../../shell/voice_system.dart';
import 'breath_cues.dart';
import 'breathing.dart';
import 'eye_gym.dart';
import '../sudoku/level_map.dart' show levelStarsOf, saveLevelStars;
import 'pause_extras.dart';
import 'practice_haptics.dart';

/// Каталог практик из ассета. Пробы подают свой — из файла, без `rootBundle`.
Future<Practices> loadPauseCatalog([AssetBundle? bundle]) async =>
    Practices(jsonDecode(await (bundle ?? rootBundle).loadString(practiceCatalogAsset)) as Json);

/// Словарь страницы зарядки: `{язык: {ключ: строка}}`.
Future<Json> loadPauseCopy([AssetBundle? bundle]) async =>
    jsonDecode(await (bundle ?? rootBundle).loadString('assets/pause/copy.json')) as Json;

/// Обстановка → ключ подписи в словаре страницы. Порядок — как на странице.
const pauseContexts = {'desk-visible': 'desk', 'desk-invisible': 'discreet', 'home': 'home'};

/// Режимы: значение ядра → ключ подписи.
const pauseModes = {'solo': 'solo', 'parallel': 'parallel', 'charge': 'route'};

/// Подсказка: значение ядра → ключ подписи.
const pauseGuides = {'visual': 'visual', 'audio': 'audio', 'both': 'both'};

/// Длительности на выбор, минуты — ровно как у страницы (`dur1`, `dur2`, `dur5`, `dur8`).
const pauseMinutes = [1, 2, 5, 8];

/// Шаг зарядки без своей длительности идёт полторы минуты — столько же, сколько
/// закладывает на «Паузу» состав зарядки (`est_duration_sec: 90`).
const pausePresetSeconds = 90;

/// Чем открыт экран: сама «Пауза» или слитые в неё «Дыхание» (`/games/breathing`)
/// и «Гимнастика для глаз» (`/games/eye-gym`).
enum PauseFlavor { hub, breathing, eyeGym }

class PauseScreen extends StatefulWidget {
  const PauseScreen({
    super.key,
    required this.state,
    this.flavor = PauseFlavor.hub,
    this.engine,
    this.copy,
    this.clock,
    this.voice,
    this.breathSound,
    this.today,
  });

  final SharedState state;
  final PauseFlavor flavor;

  /// Сегодняшняя дата для серии дней дыхания. Пробы подают свою.
  final DateTime Function()? today;

  /// Каталог и словарь, если их уже загрузили (пробы). Иначе — из ассетов.
  final Practices? engine;
  final Json? copy;

  /// Часы в миллисекундах, монотонные. Пробы двигают время сами.
  final int Function()? clock;

  /// Голос подсказки. Пробы подают свой, чтобы слышать, что прозвучало.
  final VoiceLayer? voice;

  /// Тоны смены фазы «Дыхания». Пробы подают свои, чтобы слышать, что прозвучало.
  final BreathSound? breathSound;

  @override
  State<PauseScreen> createState() => PauseScreenState();
}

enum PausePhase { loading, config, playing, done }

class PauseScreenState extends State<PauseScreen> with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  Practices? _engine;
  Json _copy = const {};
  PausePhase phase = PausePhase.loading;
  String _context = 'desk-visible';
  String _mode = 'solo';
  String _guide = 'visual';
  final List<String> _sets = [];
  final Map<String, String> _programOf = {};
  int _minutes = 2;
  int? _presetSeconds;
  Json? _session;
  String _spoken = '';
  late final Ticker _ticker = createTicker((_) => _tick());
  /// Вибрация — через выключатель «Вибрация» настроек (`app_haptics.dart`).
  late final AppHaptics _buzz = AppHaptics(widget.state);
  late final PausePracticeHaptics _haptics = PausePracticeHaptics(() => appHapticOn(widget.state));

  /// Сигналы фаз «Дыхания» — тон и вибрация на вдох, задержку и выдох, как в вебе
  /// (задача b9964dff). Звук — по тумблеру «Звук», вибрация — по тумблеру «Вибрация».
  late final BreathCues _breathCues = BreathCues(
    soundOn: () => appSoundOn(widget.state),
    hapticOn: () => appHapticOn(widget.state),
    sound: widget.breathSound,
  );
  final Stopwatch _watch = Stopwatch()..start();
  // Режим «Дыхание»: формат веба, отсчёт перед первым вдохом, Вим Хоф.
  bool get _breath => widget.flavor == PauseFlavor.breathing;
  BreathTech _tech = breathTechs.first;
  String _breathFormat = 'cycles';
  int _breathCycles = 6;
  int _breathMinutes = 3;
  bool _dim = false;
  int? _leadUntil;
  WimHofRun? _wim;
  bool _wimWarning = false;
  late final BreathLedger _ledger = BreathLedger(widget.state);

  /*
   * 🔴 ОБЩАЯ ЛЕСТНИЦА У «ДЫХАНИЯ» И «ГИМНАСТИКИ ДЛЯ ГЛАЗ» (задача c345a8f1, правило Дениса 12.11:
   * «все функции — у всех 131 игр»). В вебе у обеих была карта уровней (`LevelProgressMap`,
   * `usePersistentLevel('breathing' | 'eye_gym')`); на Flutter свои счётчики шли мимо LevelLadder —
   * в паузе не было ни карты, ни «проще / сложнее», ни звёзд. Ключи те же, что у веба и прежних
   * счётчиков (`psygames_breathing_level_<профиль>`, `psygames_eye_gym_level|best_<профиль>`), —
   * накопленное не теряется.
   * «Глаза и дыхание» (свободная сборка) — решение Дениса 12.11: уровень = пройденные сеансы
   * (`psygames_pause_level_<профиль>`); у кого ключа ещё нет, стартовый уровень — из уже записанных
   * партий `pause`, чтобы накопленное не обнулилось.
   */
  LevelLadder? _ladder;

  /// Лестница двигает уровень только в обычной игре: шаг зарядки и пресет считают подход по-своему,
  /// как веб (гимнастика в зарядке поднимает уровень фактом завершения, проба pause_eye_gym_test).
  LevelLadder? get _playLadder => GamePreset.isPreset || GamePreset.isWarmup ? null : _ladder;

  // Режим «Гимнастика для глаз»: лестница 15 уровней или свободная игра, как в вебе.
  bool get _eyes => widget.flavor == PauseFlavor.eyeGym;
  bool _eyeByLevel = true;
  String _eyeMode = 'full';

  /// 🔴 СТЕРЕОКАРТИНКИ (задача a72e77a1, решение Дениса): необязательная оптическая
  /// головоломка свободного режима — в уровни, зарядку, счёт и статистику не входит.
  /// Портретная картинка во весь экран; «ответ / дальше / готово» — в меню паузы.
  bool _stereo = false;
  int _stereoIdx = 0;
  bool _stereoShown = false;
  static const stereograms = [('circle', 'shape_circle'), ('heart', 'eyeStereoHeart'), ('star', 'shape_star')];

  /// Сколько секунд подхода прошло — для проб («меню паузы держит подход»).
  @visibleForTesting
  double get debugEyeElapsed => _eye?.elapsed ?? 0;

  double _eyeScale = 1;
  double _eyeSpeed = 1;
  int _eyePicked = 1;
  EyeGymRun? _eye;
  int _eyeStep = -1;
  String get _eyeLevelKey => SharedState.levelKey('eye_gym', widget.state.activeProfile);
  String get _eyeBestKey => '${SharedState.prefix}eye_gym_best_${widget.state.activeProfile}';

  /// Достигнутый уровень и лучший — по ключам веба (`usePersistentLevel('eye_gym')`).
  int get eyeLevel => clampEyeLevel(int.tryParse(widget.state.get(_eyeLevelKey) ?? '') ?? 1);
  int get eyeBest => math.max(eyeLevel, clampEyeLevel(int.tryParse(widget.state.get(_eyeBestKey) ?? '') ?? 1));
  /// Голос — по тумблеру «Звук» приложения и тихому шагу зарядки (задача 25b1d933): раньше
  /// он слушал только тихий пресет и говорил при выключенном звуке.
  late final VoiceLayer _voice = widget.voice ??
      VoiceLayer(backend: SystemVoiceBackend(), soundOn: () => appSoundOn(widget.state) && !GamePreset.isCalm);

  int get _now => widget.clock?.call() ?? _watch.elapsedMilliseconds;
  String get _locale => L.locales.contains(L.locale) ? L.locale : 'en';
  String get _masteryKey => '${SharedState.prefix}pause_solo_${widget.state.activeProfile}';

  late final SessionLaunch _sessionLaunch;

  @override
  void initState() {
    super.initState();
    _sessionLaunch = SessionLaunch.capture();
    WidgetsBinding.instance.addObserver(this);
    final store = SharedLevelStore(widget.state);
    final ladder = _ladder = LevelLadder(
      gameId: _eyes ? 'eye_gym' : (_breath ? 'breathing' : 'pause'),
      store: store,
      maxLevel: _eyes ? eyeMaxLevel : 999,
      lastLevel: _eyes ? eyeMaxLevel : null,
    );
    unawaited(() async {
      if (!_eyes && !_breath && await store.readInt('pause.level') == null) {
        final played = readSessions(widget.state, const {}).where((x) => x['game_type'] == 'pause').length;
        if (played > 0) {
          await store.writeInt('pause.level', played + 1);
          await store.writeInt('pause.best', played + 1);
        }
      }
      await ladder.load();
      if (mounted) setState(() {});
    }());
    final given = widget.engine;
    if (given != null) {
      _apply(given, widget.copy ?? const {});
      if (_autostartWanted) WidgetsBinding.instance.addPostFrameCallback((_) => mounted ? start() : null);
    } else {
      unawaited(Future.wait([loadPauseCatalog(), loadPauseCopy()]).then((loaded) {
        if (!mounted) return;
        setState(() => _apply(loaded[0] as Practices, loaded[1] as Json));
        if (_autostartWanted) start();
      }));
    }
  }

  bool get _autostartWanted => GamePreset.autostart && (_eyes || _sets.isNotEmpty);

  void _apply(Practices engine, Json copy) {
    _engine = engine;
    _copy = copy;
    if (_eyes) {
      // Пресет (зарядка, вызов дня) — всегда по уровню: там человек не настраивает,
      // ему выдают нагрузку по его текущему уровню (так в вебе).
      _eyeByLevel = true;
      _eyePicked = eyeLevel;
      phase = PausePhase.config;
      return;
    }
    if (_breath) {
      // Шаг зарядки задаёт технику (`settings.tech`) и ночной вид (`dim=1`) — как в вебе.
      _tech = breathTechFor(GamePreset.str('tech', 'box'));
      _dim = GamePreset.flag('dim');
      _context = 'desk-visible';
      _mode = 'solo';
      _guide = pauseGuides.containsKey(GamePreset.str('guide')) ? GamePreset.str('guide') : 'visual';
      _sets
        ..clear()
        ..add('breathing');
      _programOf['breathing'] = _tech.program;
      phase = PausePhase.config;
      return;
    }
    final ctx = GamePreset.str('context', 'desk-visible');
    final mode = GamePreset.str('mode', 'solo');
    final guide = GamePreset.str('guide', 'visual');
    _context = pauseContexts.containsKey(ctx) ? ctx : 'desk-visible';
    _mode = pauseModes.containsKey(mode) ? mode : 'solo';
    _guide = pauseGuides.containsKey(guide) ? guide : 'visual';
    // ?set=breathing — дверь из карточки «Дыхание» и шаги зарядки. Опечатка в
    // чужой ссылке не должна оставлять пустой выбор и мёртвую кнопку.
    final asked = GamePreset.str('set');
    final available = _available();
    if (asked.isNotEmpty && engine.catalog.any((s) => s['id'] == asked)) {
      _sets.add(asked);
    } else if (available.isNotEmpty) {
      _sets.add((available.firstWhere((s) => s['defaultEnabled'] == true, orElse: () => available.first))['id']);
    }
    final seconds = GamePreset.num('sec', 0);
    _presetSeconds = seconds > 0 ? seconds : (GamePreset.autostart ? pausePresetSeconds : null);
    phase = PausePhase.config;
  }

  /*
   * 🔴 ПЕРЕКРЫЛИ ЭКРАН — ПРАКТИКА СТОИТ. Кнопка паузы в шапке каркаса открывает
   * свой экран поверх игры и о сессии ничего не знает, а время здесь считается
   * по часам, а не по кадрам: без этого «пауза» в шапке молча съедала минуты.
   * Вернулись — продолжаем сами: человек нажал «Продолжить» на том экране.
   * Ушли из приложения — тоже стоим, но продолжает только сам человек.
   */
  bool _coveredPause = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final current = ModalRoute.of(context)?.isCurrent ?? true;
    final eye = _eye;
    if (eye != null && !eye.done) {
      if (!current && !eye.paused) {
        eye.pause(_now);
        _coveredPause = true;
        _syncTicker();
      } else if (current && _coveredPause) {
        eye.resume(_now);
        _coveredPause = false;
        _syncTicker();
      }
      return;
    }
    final wim = _wim;
    if (wim != null && !wim.done) {
      if (!current && !wim.paused) {
        wim.pause(_now);
        _coveredPause = true;
        _syncTicker();
      } else if (current && _coveredPause) {
        wim.resume(_now);
        _coveredPause = false;
        _syncTicker();
      }
      return;
    }
    final s = _session;
    if (s == null) return;
    // Отсчёт перед началом тоже стоит под меню: своей кнопки паузы для него больше нет.
    if (!current && s['phase'] == 'ready' && _leadUntil != null) {
      _leadLeft = _leadUntil! - _now;
      _leadUntil = null;
      _coveredPause = true;
      _syncTicker();
      return;
    } else if (current && _coveredPause && _leadLeft != null) {
      _leadUntil = _now + _leadLeft!;
      _leadLeft = null;
      _coveredPause = false;
      _syncTicker();
      return;
    }
    if (!current && s['phase'] == 'running') {
      _session = sessionAction(s, 'pause', _now);
      _coveredPause = true;
      _syncTicker();
      // Как у `act('pause')`: под меню голос не досказывает шаг.
      unawaited(_voice.cancel());
    } else if (current && _coveredPause && s['phase'] == 'paused') {
      _session = sessionAction(s, 'resume', _now);
      _coveredPause = false;
      _syncTicker();
      _speak();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) return;
    if (_eye != null && !_eye!.done && !_eye!.paused) {
      act('pause');
    } else if (_wim != null && !_wim!.done && !_wim!.paused) {
      act('pause');
    } else if (_session?['phase'] == 'running') {
      act('pause');
    }
  }

  /// Правка выбора из панели настройки: `setState` защищён и снаружи не зовётся.
  /// Любая правка настроек гасит строку о замене: она про последний выбор, не про прошлые.
  void edit(VoidCallback change) => setState(() {
        replaced = null;
        change();
      });

  List<Json> _available() =>
      (_engine?.catalog ?? const <Json>[]).where((s) => (s['contexts'] as List).contains(_context)).toList();

  /// Подписи «Паузы» на всех 12 языках (задача 33d07902). Строки ядра (`PAUSE_STRINGS`)
  /// есть только по-русски и по-английски — на остальных десяти языках кнопки «Начать»,
  /// «Продолжить», «Заново» шли по-английски. Теперь — общий словарь приложения и словарь
  /// страницы зарядки, где эти подписи переведены; ядро — только запасной путь.
  String ps(String key) => switch (key) {
        'start' => L.t('start'),
        'restart' => L.t('restart'),
        'progress' => L.t('progress'),
        'resume' => pc('resume'),
        'completed' => L.t('pausePracticeComplete'),
        'ready' => L.t('pauseSetupTitle'),
        'experiencedOnly' => L.t('pauseExperiencedOnly'),
        _ => _coreString(key),
      };

  String _coreString(String key) {
    final strings = _engine!.data['strings'] as Map;
    final own = (strings[_locale == 'ru' ? 'ru' : 'en'] as Map)[key];
    return '${own ?? (strings['en'] as Map)[key] ?? key}';
  }

  /// Строка страницы зарядки: свой язык, иначе английский — как фолбэчит сама страница.
  String pc(String key) => '${(_copy[_locale] as Map?)?[key] ?? (_copy['en'] as Map?)?[key] ?? key}';

  String _text(Object? value) => value == null ? '' : localText(value, _locale);

  /// «занимает: дыхание» — что держит практика в параллели (задача f5dfd582).
  String resourcesLine(String setId) {
    final data = _engine!.data['resources'] as Map?;
    if (data == null) return '';
    final labels = data['labels'] as Map;
    final names = _engine!.resources(setId, _programOf[setId]).map((r) => _text(labels[r])).join(', ');
    return names.isEmpty ? '' : '${_text(data['uses'])}: $names';
  }

  /// Развилка «либо-либо»: в параллели новая практика ЗАМЕНЯЕТ выбранные, что делят
  /// с ней ресурс, — кнопка запуска не гаснет (решение Дениса 24.09: приложение
  /// блокировать не вправе). В маршруте замены нет: он разводит их по блокам сам.
  void addToParallel(String id) {
    final candidate = <String, dynamic>{'setId': id, 'programId': _programOf[id]};
    List<String> shared(String other) => _engine!
        .resourceConflict(<String, dynamic>{'setId': other, 'programId': _programOf[other]}, candidate);
    final gone = [for (final other in _sets) if (other != id && shared(other).isNotEmpty) other];
    final what = {for (final other in gone) ...shared(other)};
    _sets.removeWhere(gone.contains);
    if (!_sets.contains(id)) _sets.add(id);
    final data = _engine!.data['resources'] as Map?;
    if (gone.isEmpty || data == null) return;
    // Молча снятая галочка читается как сбой: говорим, что чем заменено и почему.
    // Собрано из уже переведённых частей (названия наборов, «занимает», ресурсы) —
    // новых строк словаря не нужно.
    String title(String setId) => _text(_engine!.set(setId)['title']);
    final names = what.map((r) => _text((data['labels'] as Map)[r] ?? r)).join(', ');
    replaced = '${gone.map(title).join(', ')} → ${title(id)} · ${_text(data['uses'])}: $names';
  }

  /// Что вытеснил последний выбор в параллели (задача f5dfd582).
  String? replaced;

  Map<String, int> _mastery() {
    try {
      final raw = widget.state.get(_masteryKey);
      if (raw == null) return {};
      return (jsonDecode(raw) as Map).map((k, v) => MapEntry('$k', (v as num).toInt()));
    } catch (_) {
      return {};
    }
  }

  List<Json> _selections() => [
        for (final id in _sets) {'setId': id, if (_programOf[id] != null) 'programId': _programOf[id]},
      ];

  /// Сколько наборов нужно выбрать для режима — как считает ядро.
  bool get selectionReady {
    // У гимнастики наборов «Паузы» нет: подход собирается из уровня или ручных настроек.
    if (_eyes) return true;
    final n = _sets.where((id) => _available().any((s) => s['id'] == id)).length;
    return switch (_mode) { 'parallel' => n >= 2, 'charge' => n >= 1, _ => n == 1 };
  }

  int get _durationMs {
    if (_breath) {
      return breathDurationMs(
        steps: objects(_engine!.program('breathing', _tech.program)['steps']),
        format: _breathFormat,
        cycles: _breathCycles,
        minutes: _breathMinutes,
      );
    }
    return (_presetSeconds ?? _minutes * 60) * 1000;
  }

  Json _request() => {
        'mode': _mode,
        'selections': _selections(),
        'durationMs': _durationMs,
        'locale': _locale,
        'guideMode': _guide,
        'context': _context,
        'acknowledgedWarnings': const <String>[],
        'confirmedPriorExperience': const <String>[],
        'allowExperimental': true,
        'soloCompletions': _mastery(),
        'advisory': true,
      };

  /// Начать практику. Возвращает коды, если план не собрался (неверное число
  /// наборов для режима и т. п.) — советы ядра старт не держат.
  List<String> start() {
    final engine = _engine;
    if (_eyes) {
      startEyes();
      return const [];
    }
    if (engine == null || _sets.isEmpty) return const ['INVALID_SELECTION_COUNT'];
    if (_breath && _tech.web == 'wimhof') {
      // Сначала безопасность: у веба перед Вимом Хофом свой экран предупреждения,
      // и начинает его сам человек кнопкой «Понимаю».
      setState(() => _wimWarning = true);
      return const [];
    }
    try {
      final plan = engine.plan(_request());
      setState(() {
        if (_breath) {
          // Три секунды «устройся поудобнее» — первый вдох не уходит в никуда.
          _session = newSession(plan);
          _leadUntil = _now + 3000;
        } else {
          _session = sessionAction(newSession(plan), 'start', _now);
        }
        _spoken = '';
        phase = PausePhase.playing;
      });
      _breathCues.reset();
      _syncTicker();
      _speak();
      return const [];
    } on PlanFailure catch (e) {
      return e.codes;
    }
  }

  /// Гимнастика: подход по уровню или по ручным настройкам.
  void startEyes() {
    if (!_eyeByLevel && _eyeMode == 'stereo') {
      setState(() {
        _stereo = true;
        _stereoIdx = 0;
        _stereoShown = false;
        phase = PausePhase.playing;
      });
      unawaited(_buzz.selection());
      return;
    }
    // Выбор уровня — через лестницу: ниже достигнутого — переигровка на подход, достигнутое не опускается.
    if (_eyeByLevel) unawaited(_playLadder?.pick(_eyePicked));
    final cfg = eyeGymLevel(_eyePicked);
    final steps = _eyeByLevel ? eyeSteps('full', cfg.scale) : eyeSteps(_eyeMode, _eyeScale);
    setState(() {
      _eye = EyeGymRun(
        steps: steps,
        level: _eyePicked,
        byLevel: _eyeByLevel,
        speed: _eyeByLevel ? cfg.speed : _eyeSpeed,
        now: _now,
      );
      _eyeStep = 0;
      phase = PausePhase.playing;
    });
    // Отклик вместо взгляда на экран (отчёт тестировщицы 05.09): глаза заняты точкой.
    unawaited(_buzz.medium());
    _syncTicker();
  }

  /// Вим Хоф: предупреждение прочитано — раунды пошли.
  void startWim() {
    setState(() {
      _wimWarning = false;
      _wim = WimHofRun(_now);
      phase = PausePhase.playing;
    });
    _breathCues.reset();
    _syncTicker();
  }

  /// Задержка Вима Хофа кончается касанием человека.
  void releaseWimHold() {
    final w = _wim;
    if (w == null) return;
    setState(() => w.release(_now));
  }

  void _tick() {
    final e = _eye;
    if (e != null) {
      setState(() => e.tick(_now));
      final idx = e.position.index;
      if (idx != _eyeStep && !e.done) {
        _eyeStep = idx;
        unawaited(_buzz.selection());
      }
      if (e.done) _completeEye(e);
      return;
    }
    final w = _wim;
    if (w != null) {
      setState(() => w.tick(_now));
      if (w.stage == 'breaths' && _breathCues.wimBreath(w.round, w.breath)) unawaited(_buzz.medium());
      if (w.done) _completeWim(w);
      return;
    }
    final lead = _leadUntil;
    if (lead != null && _session?['phase'] == 'ready') {
      if (_now < lead) {
        _breathCues.lead(((lead - _now) / 1000).ceil());
        setState(() {});
        return;
      }
      setState(() {
        _session = sessionAction(_session!, 'start', lead);
        _leadUntil = null;
      });
      _speak();
    }
    final s = _session;
    if (s == null || s['phase'] != 'running') return;
    final next = sessionAction(s, 'tick', _now);
    setState(() => _session = next);
    if (next['phase'] == 'completed') {
      _complete(next);
    } else {
      // «Дыхание» подаёт фазы своими сигналами (тон + вибрация веба); общее
      // вибросопровождение практик тут молчит, иначе на вдох вибрировало бы дважды.
      if (_breath) {
        _breathCues.update(next['plan'], next['elapsedMs'] as int);
      } else {
        _haptics.update(next['plan'], next['elapsedMs'] as int);
      }
      _speak();
    }
  }

  /// Подсказка голосом: сменился шаг — назвать его и что делать. Как у страницы:
  /// «Только экран» молчит, «Только звук» и «Экран + звук» говорят.
  void _speak() {
    final s = _session;
    if (s == null || s['plan']['guideMode'] == 'visual' || s['phase'] != 'running') return;
    final cues = objects(_engine!.frame(s['plan'], s['elapsedMs'] as int)['cues']);
    final key = cues.map((c) => '${c['setId']}/${c['stepId']}').join('|');
    if (key == _spoken || cues.isEmpty) return;
    _spoken = key;
    unawaited(_voice.speak(cues.map((c) => '${c['title']}. ${c['cue']}').join('. '), _locale));
  }

  void act(String action) {
    final e = _eye;
    if (e != null) {
      setState(() => action == 'pause' ? e.pause(_now) : (action == 'resume' ? e.resume(_now) : null));
      _syncTicker();
      return;
    }
    final w = _wim;
    if (w != null) {
      setState(() => action == 'pause' ? w.pause(_now) : (action == 'resume' ? w.resume(_now) : null));
      _syncTicker();
      return;
    }
    final s = _session;
    if (s == null) return;
    if (s['phase'] == 'ready') {
      // Пауза во время отсчёта — отсчёт стоит; продолжили — досчитываем остаток.
      if (action == 'pause' && _leadUntil != null) {
        setState(() {
          _leadLeft = _leadUntil! - _now;
          _leadUntil = null;
        });
      } else if (action == 'resume' && _leadLeft != null) {
        setState(() {
          _leadUntil = _now + _leadLeft!;
          _leadLeft = null;
        });
      }
      _syncTicker();
      return;
    }
    final next = sessionAction(s, action, _now);
    setState(() => _session = next);
    _syncTicker();
    if (next['phase'] == 'completed') {
      _complete(next);
    } else if (action == 'pause') {
      unawaited(_voice.cancel());
    } else {
      _speak();
    }
  }

  /// Кадры нужны, только пока практика идёт: на паузе телефону незачем
  /// перерисовывать неподвижную сцену шестьдесят раз в секунду.
  int? _leadLeft;

  void _syncTicker() {
    final e = _eye;
    final w = _wim;
    final running = e != null
        ? !e.done && !e.paused
        : w != null
        ? !w.done && !w.paused
        : (_session?['phase'] == 'running' || (_session?['phase'] == 'ready' && _leadUntil != null));
    if (running && !_ticker.isActive) _ticker.start();
    if (!running && _ticker.isActive) _ticker.stop();
    // Пауза, уход в фон, конец — вибрация удержания не доигрывает сама.
    if (!running) _haptics.stop();
  }

  void _complete(Json s) {
    _ticker.stop();
    _haptics.complete();
    unawaited(_voice.cancel());
    final Json result = s['result'];
    final Json plan = s['plan'];
    if (_breath) {
      _completeBreath((result['durationMs'] as int) / 1000, _tech.web);
      return;
    }
    final done = List<String>.from(result['completedSetIds']);
    final mastery = _mastery();
    for (final id in done) {
      mastery[id] = (mastery[id] ?? 0) + 1;
    }
    unawaited(widget.state.set(_masteryKey, jsonEncode(mastery)));
    // Сеанс — ступень лестницы «Глаз и дыхания» (уровень = пройденные сеансы, Денис 12.11).
    unawaited(_playLadder?.win(report: false, errors: 0));
    final int duration = result['durationMs'];
    unawaited(SessionReport.send(
      launch: _sessionLaunch,
      gameType: 'pause',
      score: (duration / 60000).round(),
      timeSeconds: (duration / 1000).round(),
      mode: plan['mode'] as String?,
      difficulty: plan['context'] as String? ?? _context,
      details: {'sets': done, 'interrupted': result['interruptedCount'], 'plan_id': plan['id']},
    ));
    setState(() => phase = PausePhase.done);
  }

  /// Подход дыхания завершён: партия под прежним `breathing` с полями веба,
  /// счётчик подходов вперёд, серия дней — как у веб-экрана.
  void _completeBreath(double seconds, String technique) {
    final ladder = _playLadder;
    final run = ladder?.level ?? _ledger.run;
    _lastRun = run;
    final today = widget.today?.call() ?? DateTime.now(); // wall-clock: день серии
    if (ladder != null) {
      // Подход — ступень общей лестницы (партию пишет отчёт ниже, лестница — уровень и звёзды).
      unawaited(ladder.win(report: false, errors: 0));
      unawaited(_ledger.bumpStreak(today));
    } else {
      unawaited(_ledger.complete(today));
      // Без лестницы звёзды подхода — общая запись с вебом (`levelStars.ts`): их показывает тропинка.
      unawaited(saveLevelStars(widget.state, 'breathing', run, 3));
    }
    _breathCues.play(BreathCue.win);
    _eyeRest = EyeRestTracker.tick();
    final wim = technique == 'wimhof';
    unawaited(SessionReport.send(
      launch: _sessionLaunch,
      gameType: 'breathing',
      score: seconds.round(),
      timeSeconds: seconds.round(),
      difficulty: technique,
      // ⚠️ У Вима Хофа в вебе сюда попадал формат циклов (длина «цикла» 1 с) — число
      // без смысла. Здесь — раунды и настоящая длительность.
      mode: wim ? '${WimHofRun.rounds}rounds' : (_breathFormat == 'cycles' ? '${_breathCycles}cyc' : '${_breathMinutes}min'),
      errors: 0,
      details: {
        'technique': technique,
        'format': wim ? 'rounds' : _breathFormat,
        'dur': seconds.round(),
        'level': run,
      },
    ));
    setState(() => phase = PausePhase.done);
  }

  /// Подход гимнастики завершён: уровень вперёд (провалить её нельзя — засчитан
  /// фактом завершения, и в шаге зарядки тоже, как в вебе), партия под прежним `eye_gym`.
  void _completeEye(EyeGymRun e) {
    _ticker.stop();
    unawaited(_buzz.heavy());
    final done = e.level;
    final ladder = _playLadder;
    if (e.byLevel && ladder != null) {
      // Лестница: на достигнутом — следующая ступень и лучший; переигровка — звёзды, уровень на месте.
      unawaited(ladder.win(report: false, errors: 0));
    } else if (e.byLevel && done < eyeMaxLevel && done + 1 > eyeLevel) {
      // «Лучший» — до записи уровня: после неё он читается уже от нового уровня.
      final best = eyeBest;
      unawaited(widget.state.set(_eyeLevelKey, '${done + 1}'));
      if (done + 1 > best) unawaited(widget.state.set(_eyeBestKey, '${done + 1}'));
    }
    if (e.byLevel) unawaited(saveLevelStars(widget.state, 'eye_gym', done, 3));
    _breathCues.play(BreathCue.win);
    _eyeRest = EyeRestTracker.tick();
    final scale = e.byLevel ? eyeGymLevel(done).scale : _eyeScale;
    unawaited(SessionReport.send(
      launch: _sessionLaunch,
      gameType: 'eye_gym',
      score: e.totalSec,
      timeSeconds: e.totalSec,
      difficulty: scale > 1 ? '5min' : '3min',
      mode: '${e.steps.length}steps',
      errors: 0,
      // Уровень — только по лестнице: свободная партия на медленных настройках
      // занижала бы достигнутое при восстановлении из истории (как в вебе).
      details: e.byLevel
          ? {'duration_sec': e.totalSec, 'steps': e.steps.length, 'level': done}
          : {'duration_sec': e.totalSec, 'steps': e.steps.length},
    ));
    setState(() => phase = PausePhase.done);
  }

  void _completeWim(WimHofRun w) {
    _ticker.stop();
    _completeBreath(w.activeMs / 1000, 'wimhof');
  }

  /// Номер только что завершённого подхода дыхания — для итога (счётчик уже ушёл вперёд).
  int? _lastRun;

  /// Эта практика — десятая подряд: на итоге предлагаем передышку для глаз ([EyeRestTracker]).
  bool _eyeRest = false;

  /// 4-7-8 непривычен — «хочу поровну»: сразу на квадрат, к настройкам (веб `brSwitchToBox`).
  void switchToBox() {
    _tech = breathTechFor('box');
    _programOf['breathing'] = _tech.program;
    _again();
  }

  /// Уровень, выбранный на карте или пунктом «проще / сложнее»: подход начинается заново на нём.
  Future<void> _playLevel(int level) async {
    final ladder = _ladder;
    if (ladder == null || !mounted) return;
    await ladder.pick(level);
    if (!mounted) return;
    _again();
    if (_eyes) {
      setState(() {
        _eyeByLevel = true;
        _eyePicked = clampEyeLevel(level);
      });
    }
  }

  void _again() {
    _ticker.stop();
    unawaited(_voice.cancel());
    setState(() {
      _session = null;
      _eye = null;
      _eyePicked = eyeLevel;
      _wim = null;
      _leadUntil = null;
      _leadLeft = null;
      _presetSeconds = null;
      phase = PausePhase.config;
    });
  }

  void stereoReveal() => setState(() => _stereoShown = true);

  void stereoNext() => setState(() {
        _stereoIdx = (_stereoIdx + 1) % stereograms.length;
        _stereoShown = false;
      });

  void stereoFinish() => setState(() {
        _stereo = false;
        _stereoShown = false;
        phase = PausePhase.config;
      });

  Future<void> _back() async {
    final nav = Navigator.of(context);
    // Стереокартинки — не партия: уход из них возвращает к настройкам, без вопроса.
    if (_stereo) {
      stereoFinish();
      return;
    }
    final running = phase == PausePhase.playing &&
        (_eye != null
            ? !_eye!.paused && !_eye!.done
            : _wim != null
                ? !_wim!.paused && !_wim!.done
                : _session?['phase'] == 'running' || _leadUntil != null);
    if (phase != PausePhase.playing) {
      await nav.maybePop();
      return;
    }
    if (running) act('pause');
    final leave = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        content: Text(pc('finishWithoutRecord')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(ps('resume'))),
          FilledButton(
            key: const Key('pause-leave'),
            onPressed: () => Navigator.pop(context, true),
            child: Text(pc('finishWithoutRecord')),
          ),
        ],
      ),
    );
    if (!mounted) return;
    if (leave == true) {
      _ticker.stop();
      unawaited(_voice.cancel());
      await nav.maybePop();
    } else if (running) {
      act('resume');
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _ticker.dispose();
    _haptics.dispose();
    unawaited(_breathCues.dispose());
    unawaited(_voice.cancel());
    super.dispose();
  }

  /// 🔴 ПОДСКАЗКИ 4-7-8 ПО ХОДУ ПОДХОДА (задача d4e4b2d8, веб `breathing.tsx` v1.164, отчёт Вали
  /// «выдох слишком длинный»): первые 6 с — совет приглушить экран перед сном; с 6-й по 16-ю —
  /// «так и задумано: длинный выдох замедляет пульс» и выход на симметричный квадрат одним нажатием.
  Widget? _calmHint(int elapsedMs) {
    final sec = elapsedMs / 1000;
    if (sec < 6) return Text(L.t('brDimHint'), key: const Key('pause-breath-dim-hint'), textAlign: TextAlign.center);
    if (sec >= 16) return null;
    return Column(mainAxisSize: MainAxisSize.min, children: [
      Text(L.t('brLongExhaleWhy'), key: const Key('pause-breath-why'), textAlign: TextAlign.center),
      const SizedBox(height: 6),
      OutlinedButton(key: const Key('pause-breath-to-box'), onPressed: switchToBox, child: Text(L.t('brSwitchToBox'))),
    ]);
  }

  /// Номер идущего цикла дыхания: прошедшее время на длину цикла программы.
  int _cycleNow(Json s) {
    final steps = objects(_engine!.program('breathing', _tech.program)['steps']);
    final cycle = steps.fold<int>(0, (sum, st) => sum + (st['durationMs'] as int));
    if (cycle <= 0) return 1;
    return ((s['elapsedMs'] as int) ~/ cycle + 1).clamp(1, _breathCycles);
  }

  String _clock(int ms) {
    final s = (ms / 1000).floor();
    return '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final engine = _engine;
    if (engine == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final s = _session;
    final frame = s == null ? null : engine.frame(s['plan'], s['elapsedMs'] as int);
    final wim = _wim;
    final eye = _eye;
    final lead = s != null && s['phase'] == 'ready'
        ? (((_leadUntil != null ? _leadUntil! - _now : (_leadLeft ?? 0)) / 1000).ceil()).clamp(1, 3)
        : null;
    final shell = GameShell(
      title: _eyes ? L.t('eyeGym') : (_breath ? L.t('breathing') : L.t('pause')),
      onBack: _back,
      // Карта уровней и «проще / сложнее» каркаса раздают уровень сюда: подход заново на выбранном.
      playLevel: _ladder == null ? null : _playLevel,
      hud: [
        if (eye != null) ...[
          HudItem(label: L.t('hud_step'), value: '${eye.position.index + 1}/${eye.steps.length}', icon: Icons.format_list_numbered),
          HudItem(label: L.t('timeLeftLabel'), value: '${eye.remainSec}${L.t('secShort')}', icon: Icons.timer_outlined),
        ],
        // «Цикл n/N» — как у веба (`hud_cycle`): сколько кругов осталось, видно без счёта в уме.
        if (s != null && _breath && _breathFormat == 'cycles' && wim == null)
          HudItem(
            label: L.t('hud_cycle'),
            value: '${_cycleNow(s)}/$_breathCycles',
            icon: Icons.loop,
          ),
        if (s != null)
          HudItem(
            label: L.t('time'),
            value: '${_clock(s['elapsedMs'] as int)} / ${_clock(s['plan']['durationMs'] as int)}',
            icon: Icons.timer_outlined,
          ),
      ],
      field: (context, h) => switch (phase) {
        PausePhase.loading => const Center(child: CircularProgressIndicator()),
        PausePhase.config => _eyes
            ? _EyeConfig(screen: this, height: h)
            : _breath
                ? _BreathConfig(screen: this, height: h)
                : _Config(screen: this, height: h),
        PausePhase.playing => _stereo
            ? _StereoView(screen: this)
            : eye != null
            ? EyeGymStage(run: eye, height: h, sideClear: GameShell.fieldOnlyPauseClear)
            : wim != null
            ? _WimView(screen: this, run: wim)
            : _Playing(
                engine: engine,
                session: s!,
                frame: frame!,
                progressLabel: ps('progress'),
                lead: lead,
                leadLabel: L.t('brGetReady'),
                seconds: L.t('secShort'),
                locale: _locale,
                onEyeHit: () => _haptics.hit(s['plan'], s['elapsedMs'] as int),
                hint: lead == null && _breath && _tech.web == 'calm478' ? _calmHint(s['elapsedMs'] as int) : null,
              ),
        // У Вима Хофа сессии ядра нет — итог берётся из его раундов.
        PausePhase.done => _Done(screen: this, session: s ?? const <String, dynamic>{}),
      },
      // «Начать» — в липком низу: панель длинная, и кнопка под ней уезжала за край
      // телефона (поймала проба нажатиями на 390×844).
      toolbar: phase == PausePhase.config
          ? Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              child: _wimWarning
                  // «Понимаю» и «Назад» — как у веба: передумавший уходит к технике, а не из игры.
                  ? Row(children: [
                      OutlinedButton(
                        key: const Key('pause-wim-back'),
                        onPressed: () => edit(() => _wimWarning = false),
                        child: Text(L.t('back')),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: FilledButton.icon(
                          key: const Key('pause-wim-agree'),
                          onPressed: startWim,
                          icon: const Icon(Icons.check),
                          label: Text(L.t('brWimAgree')),
                        ),
                      ),
                    ])
                  : FilledButton.icon(
                      key: const Key('pause-start'),
                      onPressed: selectionReady ? start : null,
                      icon: const Icon(Icons.play_arrow),
                      label: Text(ps('start')),
                    ),
            )
          : null,
      // 🔴 СВОЕЙ «ПАУЗЫ» НЕТ: пауза одна — жёлтая кнопка каркаса, её меню общее для всех игр
      // (Денис 04.11: «кнопка пауза и её меню — везде общее»; CHATS_RULES.md §1в). Под меню
      // подход стоит сам (`_coveredPause`). «Продолжить» здесь — только когда подход встал без
      // меню: приложение уходило в фон. Ключ свой: `pause-resume` — «Продолжить» меню каркаса.
      auxRow: phase == PausePhase.playing && (wim != null || eye != null)
          ? AuxBar(children: [
              if (wim?.paused ?? eye!.paused)
                AuxAction(key: const Key('pause-practice-resume'), icon: Icons.play_arrow, label: ps('resume'), onPressed: () => act('resume')),
              AuxAction(inPause: true, key: const Key('pause-restart'), icon: Icons.replay, label: ps('restart'), onPressed: _again),
            ])
          : phase == PausePhase.playing && s != null
          ? AuxBar(children: [
              if (!(s['phase'] == 'running' || _leadUntil != null))
                AuxAction(key: const Key('pause-practice-resume'), icon: Icons.play_arrow, label: ps('resume'), onPressed: () => act('resume')),
              AuxAction(key: const Key('pause-skip'), icon: Icons.skip_next, label: pc('skipStepBtn'), onPressed: () => act('skip')),
              AuxAction(key: const Key('pause-extend'), icon: Icons.more_time, label: pc('extend30'), onPressed: () => act('extend')),
              AuxAction(inPause: true, key: const Key('pause-restart'), icon: Icons.replay, label: ps('restart'), onPressed: _again),
            ])
          : null,
      // 🔴 Подход гимнастики и стереокартинки — ТОЛЬКО ПОЛЕ (решение Дениса, задача
      // a72e77a1): видна одна жёлтая круглая кнопка паузы, остальное — в её меню.
      // Меню паузы — страница поверх: подход встаёт сам (`_coveredPause` выше).
      fieldOnly: phase == PausePhase.playing && (eye != null || _stereo),
      pauseActions: [
        if (_stereo) ...[
          PauseAction(
            label: _stereoShown
                ? '${L.t('eyeStereoAnswer')}: ${L.t(stereograms[_stereoIdx].$2)}'
                : L.t('eyeStereoReveal'),
            icon: Icons.visibility_outlined,
            onPressed: stereoReveal,
          ),
          PauseAction(label: L.t('eyeStereoNext'), icon: Icons.arrow_forward, onPressed: stereoNext),
          PauseAction(label: L.t('storyDone'), icon: Icons.check, onPressed: stereoFinish),
        ] else if (eye != null)
          PauseAction(label: ps('restart'), icon: Icons.replay, onPressed: _again),
        // Смена техники посреди подхода (задача 7caec33c): из меню паузы каркаса, а не нажатием на шапку —
        // у `HudItem`/заголовка `GameShell` нет нажатия, и править общий слой ради одной игры нельзя.
        // `_again` ничего не пишет (ни партии, ни серии, ни звёзд): подход просто не засчитан, как при
        // `switchToBox`; на экране настроек уже есть выбор техники. Название нынешней — в подписи.
        if (_breath && phase == PausePhase.playing)
          PauseAction(
            label: '${L.t('brChangeTech')} · ${L.t(_tech.nameKey)}',
            icon: Icons.swap_horiz,
            onPressed: _again,
          ),
      ],
    );
    // Ночной шаг зарядки («Не спится», `dim=1`): яркий экран в три часа ночи
    // работает против задачи — как у веба, приглушаем.
    // В «Авроре» — её же тёмная тема (роли и плашки остаются), в Classic — прежняя бирюзовая.
    if (!_dim) return shell;
    if (ChromeArt.aurora(context)) {
      final t = Theme.of(context);
      return Theme(data: t.copyWith(brightness: Brightness.dark, colorScheme: t.colorScheme.copyWith(brightness: Brightness.dark)), child: shell);
    }
    return Theme(data: ThemeData(brightness: Brightness.dark, colorSchemeSeed: const Color(0xff4ca1af)), child: shell);
  }
}

/// Стереокартинка во весь экран: портрет, обрезка краёв узора (`cover`), фигура в центре
/// остаётся. Ответ — после «Ответ» в меню паузы, плашкой внизу. Не партия: ни очков, ни уровня.
class _StereoView extends StatelessWidget {
  const _StereoView({required this.screen});

  final PauseScreenState screen;

  @override
  Widget build(BuildContext context) {
    final st = screen;
    final (file, nameKey) = PauseScreenState.stereograms[st._stereoIdx];
    return Stack(key: const Key('pause-eye-stereo'), fit: StackFit.expand, children: [
      Image.asset('assets/eye_stereograms/$file.png', fit: BoxFit.cover, semanticLabel: L.t('eyeModeStereo')),
      Positioned(
        left: 16,
        right: GameShell.fieldOnlyPauseClear,
        top: 12,
        child: Text(
          '${st._stereoIdx + 1}/${PauseScreenState.stereograms.length} · ${L.t('eyeStereoInstruction')}',
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, shadows: [Shadow(blurRadius: 4)]),
        ),
      ),
      if (st._stereoShown)
        Positioned(
          left: 16,
          right: 16,
          bottom: 16,
          child: Container(
            key: const Key('pause-eye-stereo-answer'),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(color: Colors.black.withValues(alpha: .7), borderRadius: BorderRadius.circular(12)),
            child: Text('${L.t('eyeStereoAnswer')}: ${L.t(nameKey)}',
                textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
          ),
        ),
    ]);
  }
}

class _BreathConfig extends StatelessWidget {
  const _BreathConfig({required this.screen, required this.height});

  final PauseScreenState screen;
  final double height;

  String _rhythm(Practices engine, BreathTech t) {
    if (t.web == 'wimhof') return '';
    final steps = objects(engine.program('breathing', t.program)['steps']);
    return steps.map((s) {
      final sec = (s['durationMs'] as int) / 1000;
      return sec == sec.roundToDouble() ? '${sec.round()}' : sec.toStringAsFixed(1);
    }).join('-');
  }

  @override
  Widget build(BuildContext context) {
    final st = screen;
    final engine = st._engine!;
    final theme = Theme.of(context);
    final label = theme.textTheme.labelLarge;
    if (st._wimWarning) {
      return SizedBox(
        height: height,
        child: SingleChildScrollView(
          key: const Key('pause-wim-warning'),
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(L.t('brWimWarnTitle'), style: theme.textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(L.t('brWimWarnBody'), style: theme.textTheme.bodyMedium),
          ]),
        ),
      );
    }
    final cycles = st._breathFormat == 'cycles';
    return SizedBox(
      height: height,
      child: SingleChildScrollView(
        key: const Key('pause-config'),
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const PauseAbout(descriptionKey: 'breathingIntroDesc', benefits: breathBenefits),
          const SizedBox(height: 12),
          Text(L.t('brTechniqueLabel'), style: label),
          // Раскрытый список — название, ритм и описание каждой техники (как у веба «с припиской»,
          // задача 7caec33c); закрытый — одной строкой.
          DropdownButton<String>(
            key: const Key('pause-breath-tech'),
            isExpanded: true,
            itemHeight: null,
            value: st._tech.web,
            selectedItemBuilder: (context) => [
              for (final t in breathTechs)
                Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: Text([L.t(t.nameKey), _rhythm(engine, t)].where((x) => x.isNotEmpty).join(' · '),
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                ),
            ],
            items: [
              for (final t in breathTechs)
                DropdownMenuItem(
                  value: t.web,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                      Text([L.t(t.nameKey), _rhythm(engine, t)].where((x) => x.isNotEmpty).join(' · '),
                          style: const TextStyle(fontWeight: FontWeight.w700)),
                      Text(L.t(t.descKey), key: Key('pause-breath-tech-desc-${t.web}'), style: theme.textTheme.bodySmall),
                    ]),
                  ),
                ),
            ],
            onChanged: (web) => st.edit(() {
              st._tech = breathTechFor(web!);
              st._programOf['breathing'] = st._tech.program;
            }),
          ),
          Text(L.t(st._tech.descKey), style: theme.textTheme.bodySmall),
          if (st._tech.web != 'wimhof') ...[
            const SizedBox(height: 12),
            Text(L.t('brFormatLabel'), style: label),
            const SizedBox(height: 6),
            Wrap(spacing: 8, children: [
              ChoiceChip(
                key: const Key('pause-breath-cycles'),
                label: Text(L.t('brByCycles')),
                selected: cycles,
                onSelected: (_) => st.edit(() => st._breathFormat = 'cycles'),
              ),
              ChoiceChip(
                key: const Key('pause-breath-time'),
                label: Text(L.t('brByTime')),
                selected: !cycles,
                onSelected: (_) => st.edit(() => st._breathFormat = 'time'),
              ),
            ]),
            const SizedBox(height: 8),
            Wrap(spacing: 8, children: [
              for (final n in cycles ? breathCycleOptions : breathMinuteOptions)
                ChoiceChip(
                  key: Key('pause-breath-${cycles ? 'n' : 'm'}$n'),
                  label: Text('$n ${cycles ? L.t('brCyclesUnit') : L.t('unitMin')}'),
                  selected: cycles ? st._breathCycles == n : st._breathMinutes == n,
                  onSelected: (_) => st.edit(() => cycles ? st._breathCycles = n : st._breathMinutes = n),
                ),
            ]),
            const SizedBox(height: 12),
            Text(st.pc('guide'), style: label),
            const SizedBox(height: 6),
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final e in pauseGuides.entries)
                ChoiceChip(
                  key: Key('pause-guide-${e.key}'),
                  label: Text(st.pc(e.value)),
                  selected: st._guide == e.key,
                  onSelected: (_) => st.edit(() => st._guide = e.key),
                ),
            ]),
          ],
          const SizedBox(height: 16),
          // Тропинка подходов (задача 936e3a5e): веб `LevelProgressMap countsRuns` — путь из
          // подходов, не ступеней сложности, поэтому узлы не нажимаются.
          PauseLevelTrail(
            keyPrefix: 'pause-breath-trail',
            title: L.f('levelOfMax', {'n': '${st._ledger.run}', 'max': '${math.max(15, st._ledger.run)}'}),
            last: math.max(15, st._ledger.run),
            best: st._ledger.run,
            current: st._ledger.run,
            stars: levelStarsOf(st.widget.state, 'breathing'),
          ),
        ]),
      ),
    );
  }
}

class _EyeConfig extends StatelessWidget {
  const _EyeConfig({required this.screen, required this.height});

  final PauseScreenState screen;
  final double height;

  @override
  Widget build(BuildContext context) {
    final st = screen;
    final theme = Theme.of(context);
    final label = theme.textTheme.labelLarge;
    Widget chips<T>(String group, List<(T, String)> options, T selected, void Function(T) pick) => Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final (v, key) in options)
              ChoiceChip(
                key: Key('pause-eye-$group-$v'),
                label: Text(L.t(key)),
                selected: selected == v,
                onSelected: (_) => st.edit(() => pick(v)),
              ),
          ],
        );
    return SizedBox(
      height: height,
      child: SingleChildScrollView(
        key: const Key('pause-config'),
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const PauseAbout(descriptionKey: 'eyeGymIntroDesc', benefits: eyeBenefits),
          const SizedBox(height: 12),
          chips<bool>('road', const [(true, 'sudokuModeLevels'), (false, 'sudokuModeFree')], st._eyeByLevel,
              (v) => st._eyeByLevel = v),
          const SizedBox(height: 12),
          if (st._eyeByLevel)
            // Тропинка уровней (задача af5c3ae9, веб `LevelProgressMap` с `onPickLevel`): весь путь
            // до 15-го, пройденные нажимаются и переигрываются, дальше лучшего — замок, звёзды — общие с вебом.
            PauseLevelTrail(
              keyPrefix: 'pause-eye-level',
              title: L.f('levelOfMax', {'n': '${st._eyePicked}', 'max': '$eyeMaxLevel'}),
              last: eyeMaxLevel,
              best: st.eyeBest,
              current: st._eyePicked,
              stars: levelStarsOf(st.widget.state, 'eye_gym'),
              nodeLabel: (n) => '${eyeGymLevelMinutes(n)}′',
              onPick: (n) => st.edit(() => st._eyePicked = n),
            )
          else ...[
            Text(L.t('mode'), style: label),
            const SizedBox(height: 6),
            chips<String>('mode', const [('full', 'eyeModeFull'), ('pursuit', 'eyeModePursuit'), ('focus', 'eyeModeFocus'), ('relax', 'eyeModeRelax'), ('stereo', 'eyeModeStereo')],
                st._eyeMode, (v) => st._eyeMode = v),
            const SizedBox(height: 12),
            // Стереокартинки — не подход: длительности и скорости у них нет.
            if (st._eyeMode == 'stereo') ...[
              Text(L.t('eyeStereoOptional'), key: const Key('pause-eye-stereo-note'), style: theme.textTheme.bodySmall),
              const SizedBox(height: 6),
              Text(L.t('eyeStereoComfort'), style: theme.textTheme.bodySmall),
            ] else ...[
              Text(L.t('duration'), style: label),
              const SizedBox(height: 6),
              chips<double>('scale', const [(0.4, 'eye1min'), (1.0, 'eye3min'), (1.7, 'eye5min')], st._eyeScale, (v) => st._eyeScale = v),
              const SizedBox(height: 12),
              Text(L.t('eyeSpeedLabel'), style: label),
              const SizedBox(height: 6),
              chips<double>('speed', const [(0.7, 'eyeSlow'), (1.0, 'eyeNorm'), (1.4, 'eyeFast')], st._eyeSpeed, (v) => st._eyeSpeed = v),
            ],
          ],
          const SizedBox(height: 16),
          Text(L.t('eyeDisclaimer'), style: theme.textTheme.bodySmall),
        ]),
      ),
    );
  }
}

/// Раунды Вима Хофа: вдохи идут счётом, задержку заканчивает касание.
class _WimView extends StatelessWidget {
  const _WimView({required this.screen, required this.run});

  final PauseScreenState screen;
  final WimHofRun run;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final sec = L.t('secShort');
    final (title, big, hint) = switch (run.stage) {
      'breaths' => (L.t('brWimBreathe'), '${run.breath}/${WimHofRun.breaths}', L.t('brWimBreatheHint')),
      'hold' => (L.t('brWimHold'), '${run.holdMs ~/ 1000}$sec', L.t('brWimHoldHint')),
      _ => (L.t('brWimRecover'), '${(run.recoverLeftMs / 1000).ceil()}$sec', ''),
    };
    return Column(
      key: const Key('pause-wim'),
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Text('${L.t('round')} ${run.round}/${WimHofRun.rounds}', style: theme.textTheme.titleMedium),
        ),
        Expanded(
          child: Center(
            // Кнопка для читалки экрана (задача 9e046132, веб `accessibilityRole="button"`):
            // незрячий человек иначе не находит, чем закончить задержку.
            child: Semantics(
              container: true,
              excludeSemantics: true,
              button: run.stage == 'hold',
              label: [title, big, hint].where((x) => x.isNotEmpty).join('. '),
              onTap: run.stage == 'hold' ? screen.releaseWimHold : null,
              child: GestureDetector(
              key: const Key('pause-wim-box'),
              onTap: run.stage == 'hold' ? screen.releaseWimHold : null,
              child: Container(
                width: 260,
                height: 260,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(color: theme.colorScheme.outline, width: 2),
                ),
                child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Text(title, style: theme.textTheme.titleMedium, textAlign: TextAlign.center),
                  Text(big, key: const Key('pause-wim-count'), style: theme.textTheme.displaySmall),
                  if (hint.isNotEmpty) Text(hint, style: theme.textTheme.bodySmall, textAlign: TextAlign.center),
                ]),
              ),
            ),
            ),
          ),
        ),
      ],
    );
  }
}

class _Config extends StatelessWidget {
  const _Config({required this.screen, required this.height});

  final PauseScreenState screen;
  final double height;

  Widget _chips(String group, Map<String, String> options, String selected, void Function(String) pick) => Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final e in options.entries)
            ChoiceChip(
              key: Key('pause-$group-${e.key}'),
              label: Text(screen.pc(e.value)),
              selected: selected == e.key,
              onSelected: (_) => pick(e.key),
            ),
        ],
      );

  @override
  Widget build(BuildContext context) {
    final st = screen;
    final engine = st._engine!;
    final available = st._available();
    final chosen = st._sets.where((id) => available.any((s) => s['id'] == id)).toList();
    final theme = Theme.of(context);
    final program = st._mode == 'solo' && chosen.length == 1 ? engine.program(chosen.first, st._programOf[chosen.first]) : null;
    final warnings = engine.requiredWarnings(st._selections());
    final label = theme.textTheme.labelLarge;
    return SizedBox(
      height: height,
      child: SingleChildScrollView(
        key: const Key('pause-config'),
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(st.ps('ready'), style: theme.textTheme.titleMedium),
          const SizedBox(height: 8),
          Text(st.pc('context'), style: label),
          const SizedBox(height: 6),
          _chips('context', pauseContexts, st._context, (c) => st.edit(() {
                st._context = c;
                st._sets.removeWhere((id) => !st._available().any((s) => s['id'] == id));
                if (st._sets.isEmpty && st._available().isNotEmpty) st._sets.add(st._available().first['id']);
              })),
          const SizedBox(height: 12),
          Text(st.pc('mode'), style: label),
          const SizedBox(height: 6),
          _chips('mode', pauseModes, st._mode, (m) => st.edit(() {
                st._mode = m;
                if (m == 'solo' && st._sets.length > 1) st._sets.removeRange(1, st._sets.length);
              })),
          const SizedBox(height: 12),
          Text(st.pc('choosePractices'), style: label),
          const SizedBox(height: 6),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final set in available)
              FilterChip(
                key: Key('pause-set-${set['id']}'),
                label: Text(st._text(set['title'])),
                selected: chosen.contains(set['id']),
                onSelected: (on) => st.edit(() {
                  final id = set['id'] as String;
                  if (st._mode == 'solo') {
                    st._sets
                      ..clear()
                      ..add(id);
                  } else if (on) {
                    if (st._mode == 'parallel') {
                      st.addToParallel(id);
                    } else if (!st._sets.contains(id)) {
                      st._sets.add(id);
                    }
                  } else {
                    st._sets.remove(id);
                  }
                }),
              ),
          ]),
          if (st._mode != 'solo')
            for (final id in chosen)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  '${st._text(engine.set(id)['title'])} — ${st.resourcesLine(id)}',
                  key: Key('pause-uses-$id'),
                  style: theme.textTheme.bodySmall,
                ),
              ),
          if (st.replaced != null)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                st.replaced!,
                key: const Key('pause-replaced'),
                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.primary),
              ),
            ),
          const SizedBox(height: 12),
          Text(st.pc('duration'), style: label),
          const SizedBox(height: 6),
          Wrap(spacing: 8, children: [
            for (final m in pauseMinutes)
              ChoiceChip(
                key: Key('pause-minutes-$m'),
                label: Text(st.pc('dur$m')),
                selected: st._presetSeconds == null && st._minutes == m,
                onSelected: (_) => st.edit(() {
                  st._minutes = m;
                  st._presetSeconds = null;
                }),
              ),
          ]),
          const SizedBox(height: 12),
          Text(st.pc('guide'), style: label),
          const SizedBox(height: 6),
          _chips('guide', pauseGuides, st._guide, (g) => st.edit(() => st._guide = g)),
          if (program != null) ...[
            const SizedBox(height: 12),
            DropdownButton<String>(
              key: const Key('pause-program'),
              isExpanded: true,
              value: program['id'] as String,
              items: [
                for (final p in objects(engine.set(chosen.first)['programs'])
                    .where((p) => ((p['contexts'] ?? engine.set(chosen.first)['contexts']) as List).contains(st._context)))
                  DropdownMenuItem(value: p['id'] as String, child: Text(st._text(p['title']))),
              ],
              onChanged: (id) => st.edit(() => st._programOf[chosen.first] = id!),
            ),
            if (program['description'] != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(st._text(program['description']), style: theme.textTheme.bodyMedium),
              ),
            if (program['requiresPriorExperience'] == true)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(st.ps('experiencedOnly'), style: theme.textTheme.bodySmall),
              ),
          ],
          if (warnings.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text(L.t('pauseWarningsTitle'), style: label),
            for (final id in warnings)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text('· ${st._text(engine.warnings[id])}', style: theme.textTheme.bodySmall),
              ),
          ],
        ]),
      ),
    );
  }
}

class _Playing extends StatelessWidget {
  const _Playing({
    required this.engine,
    required this.session,
    required this.frame,
    required this.progressLabel,
    this.lead,
    this.leadLabel = '',
    this.seconds = 's',
    this.locale = 'en',
    this.onEyeHit,
    this.hint,
  });

  /// Подсказка под сценой (4-7-8 у «Дыхания»).
  final Widget? hint;

  final Practices engine;
  final Json session;
  final Json frame;
  final String progressLabel;

  /// Подпись секунд в отсчёте шага («8 с»).
  final String seconds;
  final String locale;
  final VoidCallback? onEyeHit;

  /// Секунд до первого вдоха (отсчёт «устройся поудобнее»); `null` — практика идёт.
  final int? lead;
  final String leadLabel;

  @override
  Widget build(BuildContext context) {
    final cues = objects(frame['cues']);
    final theme = Theme.of(context);
    if (lead != null) {
      return Center(
        key: const Key('pause-lead'),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(leadLabel, style: theme.textTheme.titleMedium),
          Text('$lead', style: theme.textTheme.displayMedium),
        ]),
      );
    }
    final elapsed = session['elapsedMs'] as int;
    return Column(
      key: const Key('pause-playing'),
      children: [
        // 🔴 ЧТО ДЕЛАТЬ СЕЙЧАС И СКОЛЬКО ЕЩЁ — панель пакета practice_kit, та же,
        // что в «Умном будильнике». Денис 01.10.2026: «по животу непонятно, когда
        // держать, когда отпускать; текстов нет». Здесь было мелкое «название +
        // текст» без отсчёта. Высота постоянная — сцена под ней не двигается.
        StepNowPanel(cues: cues, plan: session['plan'], elapsedMs: elapsed, unit: seconds),
        Expanded(
          child: PracticeStage(
            engine: engine,
            cues: cues,
            elapsed: elapsed,
            running: session['phase'] == 'running',
            locale: locale,
            onEyeHit: onEyeHit,
          ),
        ),
        if (hint != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
            child: DefaultTextStyle.merge(
              style: theme.textTheme.bodySmall!.copyWith(color: theme.colorScheme.onSurfaceVariant),
              child: hint!,
            ),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
          child: Semantics(
            label: progressLabel,
            child: LinearProgressIndicator(value: (frame['progress'] as num).toDouble()),
          ),
        ),
      ],
    );
  }
}

class _Done extends StatelessWidget {
  const _Done({required this.screen, required this.session});

  final PauseScreenState screen;
  final Json session;

  String _mmss(int secs) => '${secs ~/ 60}:${(secs % 60).toString().padLeft(2, '0')}';

  /// Строки под итогом дыхания и глаз (задача b9517e77): «День n из m» цели-серии и, на каждой десятой
  /// практике подряд, передышка для глаз — то, что веб показывал в `LevelCleared`.
  List<String> _extraLines(PauseScreenState st) {
    final goal = streakGoalLine(st.widget.state, st.widget.today?.call() ?? DateTime.now()); // wall-clock: календарный день серии
    return [
      ?goal,
      if (st._eyeRest) ...[L.t('eyeBreakTitle'), L.t('eyeBreakHint')],
    ];
  }

  @override
  Widget build(BuildContext context) {
    final st = screen;
    final engine = st._engine!;
    void home() => Navigator.of(context).maybePop();
    // 🔴 ИТОГ — ОБЩИМ ЭКРАНОМ (задача b9517e77): у веба это был `LevelCleared` — три звезды,
    // уровень, серия, звук победы. Здесь был голый «Готово». В «Авроре» — лист 15
    // (`GameResultPanel`), в Classic — та же раскладка.
    if (st._eyes && st._eye != null) {
      final e = st._eye!;
      return PauseResult(
        title: L.t('pausePracticeComplete'),
        subtitle: L.t('eyeGym'),
        stats: [
          if (e.byLevel)
            PauseResultStat(Icons.trending_up, L.f('levelOfMax', {'n': '${e.level}', 'max': '$eyeMaxLevel'}),
                '${e.level} → ${st.eyeLevel}', key: const Key('pause-eye-level')),
          PauseResultStat(Icons.timer_outlined, L.t('time'), _mmss(e.totalSec)),
        ],
        lines: _extraLines(st),
        onAgain: st._again,
        onHome: home,
      );
    }
    if (st._breath) {
      final wim = st._wim;
      final ms = wim != null ? wim.activeMs : (session['result']['durationMs'] as int);
      final run = st._lastRun ?? st._ledger.run;
      final streak = st._ledger.streakDays;
      return PauseResult(
        title: L.t('brDoneTitle'),
        subtitle: L.t(st._tech.nameKey),
        stats: [
          PauseResultStat(Icons.flag_outlined, L.f('levelOfMax', {'n': '$run', 'max': '${math.max(15, run)}'}), '$run',
              key: const Key('pause-breath-run')),
          PauseResultStat(Icons.timer_outlined, L.t('time'), _mmss((ms / 1000).round())),
          if (streak > 0)
            PauseResultStat(Icons.local_fire_department, L.t('streakLabel'), '🔥$streak', key: const Key('pause-breath-streak')),
        ],
        lines: _extraLines(st),
        onAgain: st._again,
        onHome: home,
      );
    }
    final Json result = session['result'];
    final int duration = result['durationMs'];
    final sets = List<String>.from(result['completedSetIds']);
    return PauseResult(
      title: st.ps('completed'),
      stats: [
        PauseResultStat(Icons.timer_outlined, st.pc('summaryMin'), '${(duration / 60000).round()}'),
        PauseResultStat(Icons.self_improvement, st.pc('catalogItems').replaceAll('{count}', '').trim(), '${sets.length}'),
      ],
      lines: [
        for (final id in sets) '✓ ${st._text(engine.set(id)['title'])}',
        st.pc('completionPrivacy'),
      ],
      onAgain: st._again,
      onHome: home,
    );
  }
}
