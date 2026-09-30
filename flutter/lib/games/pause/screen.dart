// «Пауза / Зарядка» на Flutter — хаб телесных практик.
//
// 🔴 ОТКУДА. Веб-экран `frontend/app/games/pause.tsx` — тонкий переходник: планировщик,
// картинки и ход практики он берёт у страницы зарядки «Умного будильника»
// (`public/warmup`), а сам сохраняет итог. Здесь то же разделение, но нативно:
// ядро — `practices.dart` (сверено с живым TS, `test/pause_core_test.dart`), сцена —
// `stage.dart` (взята у Flutter-будильника), экран — этот файл.
//
// 🔴 НИЧЕГО НЕ БЛОКИРУЕМ. Предупреждения и «нужен опыт» показываются, но старт не
// держат: план строится с `advisory: true` (решение Дениса 24.09.2026 — «он
// запускает и смотрит, а не ты блокируешь»). Галочку «я прочитал» код не ставит и
// не требует.
//
// 🔴 ИТОГ — В ТОТ ЖЕ `saveSession`, ЧТО У ВЕБА, С ТЕМИ ЖЕ ПОЛЯМИ: `game_type: pause`,
// минуты в `score`, обстановка в `difficulty`, наборы в `details.sets`. На этой записи
// стоят статистика и шаг зарядки. Выход посреди практики не записывается — как в вебе.
//
// ⚠️ Подписи: 16 строк ядра (`PAUSE_STRINGS`) знают русский и английский, остальные
// языки получают английский — это известный долг ядра, тот же, что у веб-экрана
// (гейт `pause-i18n-debt`). Названия наборов, программ, шагов и предупреждений
// приходят из каталога на двенадцати языках. Всё прочее — через `L.t`.
import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';

import '../../shell/aux_action.dart';
import '../../shell/game_preset.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/session_report.dart';
import '../../shell/shared_state.dart';
import 'practices.dart';
import 'stage.dart';

/// Каталог практик из ассета. Пробы подают свой — из файла, без `rootBundle`.
Future<Practices> loadPauseCatalog([AssetBundle? bundle]) async =>
    Practices(jsonDecode(await (bundle ?? rootBundle).loadString('assets/pause/practices.json')) as Json);

/// Контексты — в порядке веб-экрана; `desk-visible` — обстановка по умолчанию там же.
const pauseContexts = ['desk-visible', 'desk-invisible', 'home'];
/// Подписи контекстов — в том же порядке. Списком `*Keys`, а не картой: так их видит
/// `flutter/tools/embed-l10n.mjs` и кладёт в словарь сборки.
const pauseContextKeys = ['pauseCtxDeskVisible', 'pauseCtxDeskInvisible', 'pauseCtxHome'];

/// Длительности на выбор, минуты. Пресет может задать свою в секундах (`sec`).
const pauseMinutes = [1, 3, 5, 10];

/// Шаг зарядки без своей длительности идёт полторы минуты — столько же, сколько
/// закладывает на «Паузу» состав зарядки (`est_duration_sec: 90`).
const pausePresetSeconds = 90;

class PauseScreen extends StatefulWidget {
  const PauseScreen({super.key, required this.state, this.engine, this.clock});

  final SharedState state;

  /// Каталог, если его уже загрузили (пробы). Иначе — из ассета.
  final Practices? engine;

  /// Часы в миллисекундах, монотонные. Пробы двигают время сами.
  final int Function()? clock;

  @override
  State<PauseScreen> createState() => PauseScreenState();
}

enum PausePhase { loading, config, playing, done }

class PauseScreenState extends State<PauseScreen> with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  Practices? _engine;
  PausePhase phase = PausePhase.loading;
  String _context = 'desk-visible';
  String _mode = 'solo';
  final List<String> _sets = [];
  final Map<String, String> _programOf = {};
  int _minutes = 3;
  int? _presetSeconds;
  Json? _session;
  late final Ticker _ticker = createTicker((_) => _tick());
  final Stopwatch _watch = Stopwatch()..start();

  int get _now => widget.clock?.call() ?? _watch.elapsedMilliseconds;
  String get _locale => L.locales.contains(L.locale) ? L.locale : 'en';
  String get _masteryKey => '${SharedState.prefix}pause_solo_${widget.state.activeProfile}';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final given = widget.engine;
    if (given != null) {
      _apply(given);
      if (_autostartWanted) WidgetsBinding.instance.addPostFrameCallback((_) => mounted ? start() : null);
    } else {
      unawaited(loadPauseCatalog().then((engine) {
        if (!mounted) return;
        setState(() => _apply(engine));
        if (_autostartWanted) start();
      }));
    }
  }

  bool get _autostartWanted => GamePreset.autostart && _sets.isNotEmpty;

  void _apply(Practices engine) {
    _engine = engine;
    final ctx = GamePreset.str('context', 'desk-visible');
    final mode = GamePreset.str('mode', 'solo');
    _context = pauseContexts.contains(ctx) ? ctx : 'desk-visible';
    _mode = ['solo', 'parallel', 'charge'].contains(mode) ? mode : 'solo';
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
    final s = _session;
    if (s == null) return;
    if (!current && s['phase'] == 'running') {
      _session = sessionAction(s, 'pause', _now);
      _coveredPause = true;
      _syncTicker();
    } else if (current && _coveredPause && s['phase'] == 'paused') {
      _session = sessionAction(s, 'resume', _now);
      _coveredPause = false;
      _syncTicker();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed && _session?['phase'] == 'running') act('pause');
  }

  /// Правка выбора из панели настройки: `setState` защищён и снаружи не зовётся.
  void edit(VoidCallback change) => setState(change);

  List<Json> _available() =>
      (_engine?.catalog ?? const <Json>[]).where((s) => (s['contexts'] as List).contains(_context)).toList();

  String ps(String key) {
    final strings = _engine!.data['strings'] as Map;
    final own = (strings[_locale == 'ru' ? 'ru' : 'en'] as Map)[key];
    return '${own ?? (strings['en'] as Map)[key] ?? key}';
  }

  String _text(Object? value) => value == null ? '' : localText(value, _locale);

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

  Json _request() => {
        'mode': _sets.length > 1 && _mode == 'solo' ? 'charge' : _mode,
        'selections': _selections(),
        'durationMs': (_presetSeconds ?? _minutes * 60) * 1000,
        'locale': _locale,
        'guideMode': 'visual',
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
    if (engine == null || _sets.isEmpty) return const ['INVALID_SELECTION_COUNT'];
    try {
      final plan = engine.plan(_request());
      setState(() {
        _session = sessionAction(newSession(plan), 'start', _now);
        phase = PausePhase.playing;
      });
      if (!_ticker.isActive) _ticker.start();
      return const [];
    } on PlanFailure catch (e) {
      return e.codes;
    }
  }

  void _tick() {
    final s = _session;
    if (s == null || s['phase'] != 'running') return;
    final next = sessionAction(s, 'tick', _now);
    setState(() => _session = next);
    if (next['phase'] == 'completed') _complete(next);
  }

  void act(String action) {
    final s = _session;
    if (s == null) return;
    final next = sessionAction(s, action, _now);
    setState(() => _session = next);
    _syncTicker();
    if (next['phase'] == 'completed') _complete(next);
  }

  /// Кадры нужны, только пока практика идёт: на паузе телефону незачем
  /// перерисовывать неподвижную сцену шестьдесят раз в секунду.
  void _syncTicker() {
    final running = _session?['phase'] == 'running';
    if (running && !_ticker.isActive) _ticker.start();
    if (!running && _ticker.isActive) _ticker.stop();
  }

  void _complete(Json s) {
    _ticker.stop();
    final Json result = s['result'];
    final Json plan = s['plan'];
    final done = List<String>.from(result['completedSetIds']);
    final mastery = _mastery();
    for (final id in done) {
      mastery[id] = (mastery[id] ?? 0) + 1;
    }
    unawaited(widget.state.set(_masteryKey, jsonEncode(mastery)));
    final int duration = result['durationMs'];
    unawaited(SessionReport.send(
      gameType: 'pause',
      score: (duration / 60000).round(),
      timeSeconds: (duration / 1000).round(),
      mode: plan['mode'] as String?,
      difficulty: plan['context'] as String? ?? _context,
      details: {'sets': done, 'interrupted': result['interruptedCount'], 'plan_id': plan['id']},
    ));
    setState(() => phase = PausePhase.done);
  }

  void _again() {
    _ticker.stop();
    setState(() {
      _session = null;
      _presetSeconds = null;
      phase = PausePhase.config;
    });
  }

  Future<void> _back() async {
    final nav = Navigator.of(context);
    final running = phase == PausePhase.playing && _session?['phase'] == 'running';
    if (phase != PausePhase.playing) {
      await nav.maybePop();
      return;
    }
    if (running) act('pause');
    final leave = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        content: Text(ps('exit')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(ps('resume'))),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(ps('exit'))),
        ],
      ),
    );
    if (!mounted) return;
    if (leave == true) {
      _ticker.stop();
      await nav.maybePop();
    } else if (running) {
      act('resume');
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _ticker.dispose();
    super.dispose();
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
    final title = L.t('pause');
    return GameShell(
      title: title,
      onBack: _back,
      hud: [
        if (s != null)
          HudItem(
            label: L.t('time'),
            value: '${_clock(s['elapsedMs'] as int)} / ${_clock(s['plan']['durationMs'] as int)}',
            icon: Icons.timer_outlined,
          ),
      ],
      field: (context, h) => switch (phase) {
        PausePhase.loading => const Center(child: CircularProgressIndicator()),
        PausePhase.config => _Config(screen: this, height: h),
        PausePhase.playing => _Playing(engine: engine, session: s!, frame: frame!, progressLabel: ps('progress')),
        PausePhase.done => _Done(screen: this, session: s!),
      },
      // «Начать» — в липком низу: панель длинная, и кнопка под ней уезжала за край
      // телефона (поймала проба нажатиями на 390×844).
      toolbar: phase == PausePhase.config ? _StartBar(screen: this) : null,
      auxRow: phase == PausePhase.playing && s != null
          ? AuxBar(children: [
              if (s['phase'] == 'running')
                AuxAction(key: const Key('pause-pause'), icon: Icons.pause, label: ps('pause'), onPressed: () => act('pause'))
              else
                AuxAction(key: const Key('pause-resume'), icon: Icons.play_arrow, label: ps('resume'), onPressed: () => act('resume')),
              AuxAction(key: const Key('pause-skip'), icon: Icons.skip_next, label: L.t('skip'), onPressed: () => act('skip')),
              AuxAction(key: const Key('pause-extend'), icon: Icons.more_time, label: L.t('pauseExtend'), onPressed: () => act('extend')),
              AuxAction(key: const Key('pause-restart'), icon: Icons.replay, label: ps('restart'), onPressed: _again),
            ])
          : null,
    );
  }
}

class _Config extends StatelessWidget {
  const _Config({required this.screen, required this.height});

  final PauseScreenState screen;
  final double height;

  @override
  Widget build(BuildContext context) {
    final st = screen;
    final engine = st._engine!;
    final available = st._available();
    final chosen = st._sets.where((id) => available.any((s) => s['id'] == id)).toList();
    final theme = Theme.of(context);
    final program = chosen.length == 1 ? engine.program(chosen.first, st._programOf[chosen.first]) : null;
    final warnings = engine.requiredWarnings(st._selections());
    final parallel = st._mode == 'parallel';
    return SizedBox(
      height: height,
      child: SingleChildScrollView(
        key: const Key('pause-config'),
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(st.ps('ready'), style: theme.textTheme.titleMedium),
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final c in pauseContexts)
              ChoiceChip(
                key: Key('pause-context-$c'),
                label: Text(L.t(pauseContextKeys[pauseContexts.indexOf(c)])),
                selected: st._context == c,
                onSelected: (_) => st.edit(() {
                  st._context = c;
                  st._sets.removeWhere((id) => !st._available().any((s) => s['id'] == id));
                  if (st._sets.isEmpty && st._available().isNotEmpty) st._sets.add(st._available().first['id']);
                }),
              ),
          ]),
          const SizedBox(height: 12),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final m in ['solo', 'parallel'])
              ChoiceChip(
                key: Key('pause-mode-$m'),
                label: Text(st.ps(m)),
                selected: (st._mode == 'parallel') == (m == 'parallel'),
                onSelected: (_) => st.edit(() {
                  st._mode = m;
                  if (m == 'solo' && st._sets.length > 1) st._sets.removeRange(1, st._sets.length);
                }),
              ),
          ]),
          const SizedBox(height: 12),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final set in available)
              FilterChip(
                key: Key('pause-set-${set['id']}'),
                label: Text(st._text(set['title'])),
                selected: chosen.contains(set['id']),
                onSelected: (on) => st.edit(() {
                  final id = set['id'] as String;
                  if (!parallel) {
                    st._sets
                      ..clear()
                      ..add(id);
                  } else if (on) {
                    if (!st._sets.contains(id)) st._sets.add(id);
                  } else {
                    st._sets.remove(id);
                  }
                }),
              ),
          ]),
          const SizedBox(height: 12),
          Text(L.t('duration'), style: theme.textTheme.labelLarge),
          const SizedBox(height: 6),
          Wrap(spacing: 8, children: [
            for (final m in pauseMinutes)
              ChoiceChip(
                key: Key('pause-minutes-$m'),
                label: Text('$m′'),
                selected: st._presetSeconds == null && st._minutes == m,
                onSelected: (_) => st.edit(() {
                  st._minutes = m;
                  st._presetSeconds = null;
                }),
              ),
          ]),
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
            Text(st.ps('warnings'), style: theme.textTheme.labelLarge),
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

class _StartBar extends StatelessWidget {
  const _StartBar({required this.screen});

  final PauseScreenState screen;

  @override
  Widget build(BuildContext context) {
    final st = screen;
    final chosen = st._sets.where((id) => st._available().any((s) => s['id'] == id)).length;
    final ready = chosen > 0 && (st._mode != 'parallel' || chosen >= 2);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      child: FilledButton.icon(
        key: const Key('pause-start'),
        onPressed: ready ? st.start : null,
        icon: const Icon(Icons.play_arrow),
        label: Text(st.ps('start')),
      ),
    );
  }
}

class _Playing extends StatelessWidget {
  const _Playing({required this.engine, required this.session, required this.frame, required this.progressLabel});

  final Practices engine;
  final Json session;
  final Json frame;
  final String progressLabel;

  @override
  Widget build(BuildContext context) {
    final cues = objects(frame['cues']);
    final theme = Theme.of(context);
    return Column(
      key: const Key('pause-playing'),
      children: [
        for (final c in cues)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
            child: Column(children: [
              Text('${c['title']}', style: theme.textTheme.titleMedium, textAlign: TextAlign.center),
              Text('${c['cue']}', style: theme.textTheme.bodyMedium, textAlign: TextAlign.center, maxLines: 3),
            ]),
          ),
        Expanded(
          child: PracticeStage(engine: engine, cues: cues, elapsed: session['elapsedMs'] as int),
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

  @override
  Widget build(BuildContext context) {
    final st = screen;
    final engine = st._engine!;
    final Json result = session['result'];
    final int duration = result['durationMs'];
    final sets = List<String>.from(result['completedSetIds']);
    final theme = Theme.of(context);
    return ListView(
      key: const Key('pause-done'),
      padding: const EdgeInsets.all(16),
      children: [
        Text(st.ps('completed'), style: theme.textTheme.headlineSmall, textAlign: TextAlign.center),
        const SizedBox(height: 12),
        // Две равные колонки: подпись на длинном языке переносится, а не выталкивает соседа.
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(child: _Metric(label: L.t('pauseMinutesDone'), value: '${(duration / 60000).round()}', icon: Icons.timer_outlined)),
          Expanded(child: _Metric(label: L.t('pauseSetsDone'), value: '${sets.length}', icon: Icons.self_improvement)),
        ]),
        const SizedBox(height: 12),
        for (final id in sets) Text('✓ ${st._text(engine.set(id)['title'])}', textAlign: TextAlign.center),
        const SizedBox(height: 8),
        Text(st.ps('completionOnly'), style: theme.textTheme.bodySmall, textAlign: TextAlign.center),
        const SizedBox(height: 16),
        FilledButton.icon(
          key: const Key('pause-again'),
          onPressed: st._again,
          icon: const Icon(Icons.replay),
          label: Text(L.t('retry')),
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          key: const Key('pause-home'),
          onPressed: () => Navigator.of(context).maybePop(),
          icon: const Icon(Icons.home_outlined),
          label: Text(L.t('goHome')),
        ),
      ],
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({required this.label, required this.value, required this.icon});

  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(children: [
      Icon(icon),
      Text(value, style: theme.textTheme.headlineMedium),
      Text(label, style: theme.textTheme.bodySmall, textAlign: TextAlign.center),
    ]);
  }
}
