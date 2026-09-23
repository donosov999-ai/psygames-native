/// «ЛИЦА И ИМЕНА» НА ОБЩЕМ КАРКАСЕ.
///
/// Круг тот же, что в вебе, и порядок фаз менять нельзя — он и есть задание:
/// изучение → помеха счётом → узнать лицо → вспомнить имя → вспомнить факт.
/// Помеха между показом и вопросом стоит не для разнообразия: без неё имя
/// держится проговариванием, и меряется не память, а повтор про себя.
///
/// 🔴 ОТВЕТ ЖИВЁТ В РЯДУ ПОД ПОЛЕМ. Канон раздела: цель нажатия стоит на одном
/// месте от вопроса к вопросу, палец не ищет её заново. Лица — исключение по
/// природе: их надо ВИДЕТЬ, и они остаются в поле.
///
/// ⚠️ ВЫСОТА ПОЛЯ БЕРЁТСЯ У КАРКАСА ЧИСЛОМ. Ровно на этом веб-версия и
/// ошибалась: портрет считался от окна, нижний ряд уезжал под край, и замер
/// 23.09.2026 показал переполнение 174 px на 360×640.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;

import '../../shell/aux_action.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'face_painter.dart';
import 'model.dart';

class FacesNamesScreen extends StatefulWidget {
  const FacesNamesScreen({super.key, required this.state, this.library});

  final SharedState state;

  /// Подставляется пробой: она не грузит ассеты и не ждёт сети.
  final FacesNamesLibrary? library;

  @override
  State<FacesNamesScreen> createState() => _FacesNamesScreenState();
}

class _FacesNamesScreenState extends State<FacesNamesScreen> {
  late LevelLadder _ladder;
  FacesNamesLibrary? _lib;
  FacesNamesSession? _session;
  bool _booting = true;

  int get _now => DateTime.now().millisecondsSinceEpoch;

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'faces_names', store: SharedLevelStore(widget.state), maxLevel: facesNamesLevels);
    _boot();
  }

  Future<void> _boot() async {
    final lib = widget.library ??
        FacesNamesLibrary.fromJsonString(await rootBundle.loadString('assets/faces-names.json'));
    await _ladder.load();
    if (!mounted) return;
    setState(() {
      _lib = lib;
      _booting = false;
      _newRound();
    });
  }

  void _newRound() {
    final lib = _lib;
    if (lib == null) return;
    _session = FacesNamesSession.create(lib, 'faces-names-${_ladder.level}', _ladder.level);
  }

  Future<void> _finish(FacesNamesMetrics m) async {
    final seconds = (m.durationMs / 1000).round();
    if (m.passed) {
      await _ladder.win(score: m.score, timeSeconds: seconds, errors: m.errors, mode: 'level');
    } else {
      await _ladder.fail(score: m.score, timeSeconds: seconds, errors: m.errors, mode: 'level');
    }
    if (mounted) setState(() {});
  }

  void _step(void Function(FacesNamesSession s) action) {
    final s = _session;
    if (s == null) return;
    setState(() => action(s));
    final r = s.result;
    if (s.phase == FacesNamesPhase.result && r != null) _finish(r);
  }

  String _name(Person p) {
    final script = p.script(L.locale);
    return script == null ? p.name : '${p.name} · $script';
  }

  @override
  Widget build(BuildContext context) {
    final s = _session;
    final lib = _lib;
    if (_booting || s == null || lib == null) {
      return GameShell(
        title: _lib?.s(L.locale, 'title') ?? '',
        field: (context, h) => const Center(child: CircularProgressIndicator()),
      );
    }
    final phase = s.phase;
    return GameShell(
      title: lib.s(L.locale, 'title'),
      hud: [
        HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(
          label: lib.s(L.locale, _phaseKey(phase)),
          value: _hudRightValue(s),
          icon: Icons.checklist_outlined,
        ),
      ],
      field: (context, h) => _field(context, s, lib, h),
      auxRow: AuxBar(children: [
        AuxAction(
          icon: Icons.refresh,
          label: lib.s(L.locale, 'restart'),
          onPressed: () => setState(() => s.restart(_now)),
        ),
      ]),
      toolbar: _toolbar(context, s, lib),
      pauseActions: [
        PauseAction(
          label: lib.s(L.locale, 'restart'),
          icon: Icons.refresh,
          onPressed: () => setState(() => s.restart(_now)),
        ),
      ],
    );
  }

  /// Название текущей фазы — ключом словаря игры, а не словом в коде.
  String _phaseKey(FacesNamesPhase phase) {
    switch (phase) {
      case FacesNamesPhase.study:
        return 'study';
      case FacesNamesPhase.interference:
        return 'interference';
      case FacesNamesPhase.nameRecall:
        return 'nameRecall';
      case FacesNamesPhase.factRecall:
        return 'factRecall';
      default:
        return 'recognition';
    }
  }

  String _hudRightValue(FacesNamesSession s) {
    if (s.phase == FacesNamesPhase.study) {
      return '${s.studyIndex + 1}/${s.puzzle.studiedPersonIds.length}';
    }
    if (s.phase == FacesNamesPhase.interference) {
      return '${s.interferenceIndex + 1}/${s.puzzle.interferencePrompts.length}';
    }
    return '${s.answers.length}/${s.puzzle.trials.length}';
  }

  Widget _field(BuildContext context, FacesNamesSession s, FacesNamesLibrary lib, double height) {
    final scheme = Theme.of(context).colorScheme;
    switch (s.phase) {
      case FacesNamesPhase.rules:
        return _Centered(
          height: height,
          children: [
            Text(lib.s(L.locale, 'rulesTitle'), style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(lib.s(L.locale, 'rulesBody'), textAlign: TextAlign.center),
            const SizedBox(height: 6),
            Text(lib.s(L.locale, 'rulesRecall'),
                textAlign: TextAlign.center, style: TextStyle(color: scheme.onSurfaceVariant)),
          ],
        );
      case FacesNamesPhase.study:
        final p = s.currentStudied;
        if (p == null) return const SizedBox.shrink();
        return _Centered(
          height: height,
          children: [
            SyntheticFaceView(
              face: p.face,
              size: _faceSize(height),
              label: lib.portrait(L.locale, p.id),
            ),
            const SizedBox(height: 12),
            Text(_name(p), style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 6),
            Text(lib.factText(L.locale, p.factId), style: TextStyle(color: scheme.onSurfaceVariant)),
            const SizedBox(height: 4),
            Text(
              lib.fill(lib.s(L.locale, 'studyProgress'), {
                'current': s.studyIndex + 1,
                'total': s.puzzle.studiedPersonIds.length,
              }),
              style: TextStyle(color: scheme.onSurfaceVariant),
            ),
          ],
        );
      case FacesNamesPhase.interference:
        final q = s.currentPrompt;
        if (q == null) return const SizedBox.shrink();
        return _Centered(
          height: height,
          children: [
            Text(lib.s(L.locale, 'interferenceBody'),
                textAlign: TextAlign.center, style: TextStyle(color: scheme.onSurfaceVariant)),
            const SizedBox(height: 10),
            Text('${q.left} + ${q.right}',
                style: const TextStyle(fontSize: 44, fontWeight: FontWeight.w800)),
          ],
        );
      case FacesNamesPhase.recognition:
        final trial = s.currentTrial;
        if (trial == null) return const SizedBox.shrink();
        final faces = [for (final id in trial.recognitionPersonIds) s.puzzle.person(id)!];
        return _Centered(
          height: height,
          children: [
            Text(lib.s(L.locale, 'recognitionPrompt'), textAlign: TextAlign.center),
            const SizedBox(height: 10),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              alignment: WrapAlignment.center,
              children: [
                for (final p in faces)
                  InkWell(
                    key: ValueKey('face-${p.id}'),
                    onTap: () => _step((x) => x.selectRecognizedFace(p.id)),
                    child: SyntheticFaceView(
                      face: p.face,
                      size: _optionFaceSize(height, faces.length),
                      label: lib.portrait(L.locale, p.id),
                    ),
                  ),
              ],
            ),
          ],
        );
      case FacesNamesPhase.nameRecall:
      case FacesNamesPhase.factRecall:
        final trial = s.currentTrial;
        final target = trial == null ? null : s.puzzle.person(trial.targetPersonId);
        if (target == null) return const SizedBox.shrink();
        return _Centered(
          height: height,
          children: [
            SyntheticFaceView(
              face: target.face,
              size: _faceSize(height) * 0.8,
              label: lib.portrait(L.locale, target.id),
            ),
            const SizedBox(height: 10),
            Text(
              lib.s(L.locale, s.phase == FacesNamesPhase.nameRecall ? 'namePrompt' : 'factPrompt'),
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            if (s.phase == FacesNamesPhase.factRecall) ...[
              const SizedBox(height: 6),
              Text(_name(target), style: TextStyle(color: scheme.onSurfaceVariant)),
            ],
          ],
        );
      case FacesNamesPhase.result:
        final m = s.result!;
        return _Centered(
          height: height,
          children: [
            Icon(m.passed ? Icons.emoji_events_outlined : Icons.replay_outlined,
                size: 48, color: m.passed ? scheme.primary : scheme.onSurfaceVariant),
            const SizedBox(height: 10),
            Text(
              m.passed ? L.f('levelDone', {'n': '${m.level}'}) : L.t('retry'),
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 10),
            Text('${lib.s(L.locale, 'recognition')}: ${m.faceRecognitionCorrect}/${m.faceRecognitionTotal}'),
            Text('${lib.s(L.locale, 'nameRecall')}: ${m.nameRecallCorrect}/${m.nameRecallTotal}'),
            if (m.factRecallTotal > 0)
              Text('${lib.s(L.locale, 'factRecall')}: ${m.factRecallCorrect}/${m.factRecallTotal}'),
            Text('${L.t('score')}: ${m.score}', style: const TextStyle(fontWeight: FontWeight.w700)),
          ],
        );
      default:
        return const SizedBox.shrink();
    }
  }

  /// Портрет считается от ВЫСОТЫ ПОЛЯ, которую дал каркас, и зажат по краям:
  /// мельче 120 лицо перестаёт различаться, крупнее 200 вытесняет подписи.
  double _faceSize(double height) => height.isFinite ? height.clamp(220, 520) * 0.42 : 180;

  double _optionFaceSize(double height, int count) {
    final base = _faceSize(height);
    return count <= 2 ? base * 0.8 : base * 0.62;
  }

  Widget? _toolbar(BuildContext context, FacesNamesSession s, FacesNamesLibrary lib) {
    switch (s.phase) {
      case FacesNamesPhase.rules:
        return _Bar(children: [
          FilledButton.icon(
            key: const ValueKey('fn-start'),
            onPressed: () => setState(() => s.start(_now)),
            icon: const Icon(Icons.play_arrow),
            label: Text(lib.s(L.locale, 'start')),
          ),
        ]);
      case FacesNamesPhase.study:
        final last = s.studyIndex + 1 >= s.puzzle.studiedPersonIds.length;
        return _Bar(children: [
          FilledButton.icon(
            key: const ValueKey('fn-next'),
            onPressed: () => setState(s.advanceStudy),
            icon: Icon(last ? Icons.check : Icons.arrow_forward),
            label: Text(lib.s(L.locale, last ? 'interference' : 'nextPerson')),
          ),
        ]);
      case FacesNamesPhase.interference:
        final q = s.currentPrompt;
        if (q == null) return null;
        return _Bar(children: [
          for (final option in q.options)
            OutlinedButton(
              key: ValueKey('sum-$option'),
              onPressed: () => _step((x) => x.answerInterference(option)),
              child: Text('$option', style: const TextStyle(fontSize: 20)),
            ),
        ]);
      case FacesNamesPhase.nameRecall:
        final trial = s.currentTrial;
        if (trial == null) return null;
        return _Bar(children: [
          for (final id in trial.namePersonIds)
            OutlinedButton(
              key: ValueKey('name-$id'),
              onPressed: () => _step((x) => x.selectRecalledName(id, _now)),
              child: Text(_name(s.puzzle.person(id)!)),
            ),
        ]);
      case FacesNamesPhase.factRecall:
        final trial = s.currentTrial;
        if (trial == null) return null;
        return _Bar(children: [
          for (final id in trial.factIds)
            OutlinedButton(
              key: ValueKey('fact-$id'),
              onPressed: () => _step((x) => x.selectRecalledFact(id, _now)),
              child: Text(lib.factText(L.locale, id)),
            ),
        ]);
      case FacesNamesPhase.result:
        return _Bar(children: [
          FilledButton.icon(
            key: const ValueKey('fn-again'),
            onPressed: () => setState(_newRound),
            icon: const Icon(Icons.arrow_forward),
            label: Text(s.result!.passed ? L.t('nextLabel') : L.t('retry')),
          ),
        ]);
      default:
        return null;
    }
  }
}

/// Поле по центру внутри высоты, которую дал каркас. Прокрутка включается
/// только при переполнении — прибитое содержимое не должно ездить под пальцем.
class _Centered extends StatelessWidget {
  const _Centered({required this.height, required this.children});

  final double height;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: height.isFinite ? height : null,
        child: SingleChildScrollView(
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: height.isFinite ? height : 0),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.center,
                children: children,
              ),
            ),
          ),
        ),
      );
}

/// Ряд ответа: переносится сам, кнопки не мельче 48 по высоте.
class _Bar extends StatelessWidget {
  const _Bar({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        child: Wrap(
          spacing: 8,
          runSpacing: 8,
          alignment: WrapAlignment.center,
          children: children,
        ),
      );
}
