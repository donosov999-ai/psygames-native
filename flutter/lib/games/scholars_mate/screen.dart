import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';

import '../../shell/game_preset.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/session_report.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import '../chess_common/board.dart';
import 'check.dart';
import 'deck.dart';
import 'game.dart';
import 'ladder.dart';
import 'motifs.dart';
import 'run.dart';

/// Поток — десять минут подряд, без границ подхода (просьба Дениса 05.09.2026).
const int scholarsFlowMs = 10 * 60 * 1000;

/// Сколько последних медиан ступени хранится для «обычно».
const int scholarsRecentRuns = 5;

/// Секунды как в вебе: до десятой, половина вверх («1050 мс» → «1.1»).
String scholarsSeconds(int ms) => ((ms / 100).round() / 10).toStringAsFixed(1);

/// Клетка экрана (0 — левая верхняя) для поля «e4» при данной ориентации.
int scholarsSquareIndex(String square, {required bool whiteBottom}) {
  final file = square.codeUnitAt(0) - 97;
  final rank = int.parse(square.substring(1));
  return whiteBottom ? (8 - rank) * 8 + file : (rank - 1) * 8 + (7 - file);
}

/// Обратно: имя поля для клетки экрана.
String scholarsSquareName(int index, {required bool whiteBottom}) {
  final row = index ~/ 8;
  final col = index % 8;
  return whiteBottom
      ? '${String.fromCharCode(97 + col)}${8 - row}'
      : '${String.fromCharCode(97 + 7 - col)}${row + 1}';
}

/// Фигуры из FEN по клеткам экрана.
Map<int, BoardPiece> scholarsPieces(String fen, {required bool whiteBottom}) {
  final out = <int, BoardPiece>{};
  final rows = fen.split(' ').first.split('/');
  for (var r = 0; r < 8 && r < rows.length; r++) {
    var c = 0;
    for (final ch in rows[r].split('')) {
      final gap = int.tryParse(ch);
      if (gap != null) {
        c += gap;
        continue;
      }
      final name = '${String.fromCharCode(97 + c)}${8 - r}';
      out[scholarsSquareIndex(name, whiteBottom: whiteBottom)] = BoardPiece(
        ch.toLowerCase(),
        white: ch.toUpperCase() == ch,
      );
      c++;
    }
  }
  return out;
}

/// ЭКРАН «ДЕТСКОГО МАТА» на общем каркасе.
///
/// Тонкий по устройству, как «Доска в уме»: подход целиком — в `game.dart` и
/// закрыт пробами без пикселей; здесь настройка, показ, касания и итог.
///
/// 🔴 ИГРОВЫЕ ЧАСЫ СТОЯТ, ПОКА ИГРА НЕ НА ЭКРАНЕ. Каркас открывает паузу,
/// правила и разбор отдельными экранами поверх партии и игре об этом не говорит,
/// а в вебе замер скорости идёт по игровым часам, которые пауза останавливает.
/// Поэтому часы — секундомер, который тик останавливает, как только маршрут
/// партии перестал быть верхним. Иначе ответ «за две секунды» после минуты в
/// паузе засчитался бы промахом по времени.
class ScholarsMateScreen extends StatefulWidget {
  const ScholarsMateScreen({
    super.key,
    required this.state,
    this.corpus,
    this.clock,
    this.seed,
  });

  final SharedState state;

  /// Пробы подают корпус сами: ассет весит 7 МБ, и loadString такого размера
  /// под поддельными часами проб не завершается никогда.
  final ScholarsCorpus? corpus;

  /// Пробы: поддельные игровые часы, мс.
  final int Function()? clock;

  /// Пробы: повторимая колода.
  final int? seed;

  @override
  State<ScholarsMateScreen> createState() => _ScholarsMateScreenState();
}

enum _Phase { config, playing, done }

class _ScholarsMateScreenState extends State<ScholarsMateScreen> {
  late final LevelLadder _ladder = LevelLadder(
    gameId: 'scholars_mate',
    store: SharedLevelStore(widget.state),
    maxLevel: scholarsLevels,
  );
  final Stopwatch _watch = Stopwatch();
  Timer? _ticker;
  ScholarsCorpus? _corpus;
  String? _error;
  _Phase _phase = _Phase.config;

  /// Режим: `levels`, `mix`, `sacrifice` или `motif:<узор>`.
  String _mode = 'levels';
  bool _flow = false;
  ScholarsRun? _run;
  int _runLevel = 1;
  ScholarsResult? _last;
  bool _passed = false;
  int _starts = 0;

  /// Сырые часы: поддельные в пробах, секундомер в приложении.
  int _raw() => widget.clock?.call() ?? _watch.elapsedMilliseconds;

  /// Сколько партия простояла под паузой, правилами или разбором.
  int _pausedTotal = 0;
  int? _pausedSince;

  /// Игровые часы: сырое время минус всё, что партия была не на экране. Пауза
  /// учитывается одинаково для обоих источников — так её держит и проба.
  int _now() {
    final since = _pausedSince;
    return _raw() - _pausedTotal - (since == null ? 0 : _raw() - since);
  }

  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    try {
      await _ladder.load();
      final corpus = widget.corpus ?? await ScholarsCorpus.load();
      if (!mounted) return;
      setState(() => _corpus = corpus);
      if (GamePreset.autostart) _start();
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = "${L.t('scholarsMate')}: $e");
    }
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  ScholarsKind? get _only =>
      _mode == 'sacrifice' ? ScholarsKind.sacrifice : null;
  String? get _motif => _mode.startsWith('motif:') ? _mode.substring(6) : null;
  bool get _mix => _mode == 'mix';

  void _start() {
    final corpus = _corpus;
    if (corpus == null) return;
    final level = _ladder.level;
    final seed =
        widget.seed ?? DateTime.now().millisecondsSinceEpoch % 100000 + _starts;
    _starts++;
    final List<ScholarsPuzzle> deck;
    if (_mix) {
      deck = buildMixedMotifDeck(
        corpus,
        level,
        seed: seed,
        count: _flow ? 200 : null,
      );
    } else if (_motif != null) {
      deck = buildNamedDeck(
        corpus,
        _motif!,
        level,
        seed: seed,
        count: _flow ? 200 : null,
      );
    } else if (_flow) {
      deck = buildFlowDeck(corpus, level, seed, scholarsFlowMs, only: _only);
    } else {
      deck = buildDeck(corpus, level, seed: seed, only: _only);
    }
    if (deck.isEmpty) return;
    _watch
      ..reset()
      ..start();
    _pausedTotal = 0;
    _pausedSince = null;
    setState(() {
      _run = ScholarsRun(
        level: level,
        deck: deck,
        now: _now,
        flowMs: _flow ? scholarsFlowMs : null,
      );
      _runLevel = level;
      _phase = _Phase.playing;
    });
    _ticker?.cancel();
    _ticker = Timer.periodic(const Duration(milliseconds: 100), (_) => _tick());
  }

  void _tick() {
    if (!mounted) return;
    final onTop = ModalRoute.of(context)?.isCurrent ?? true;
    if (!onTop) {
      _pausedSince ??= _raw();
      return;
    }
    final since = _pausedSince;
    if (since != null) {
      _pausedTotal += _raw() - since;
      _pausedSince = null;
    }
    final run = _run;
    if (run == null) return;
    run.tick();
    if (run.finished) {
      _ticker?.cancel();
      _complete(run.result!);
      return;
    }
    setState(() {});
  }

  Future<void> _complete(ScholarsResult r) async {
    final level = _runLevel;
    if (!r.touched) {
      // Подход без единого касания не считается вовсе: назад в настройку.
      setState(() => _phase = _Phase.config);
      return;
    }
    final passed = r.accuracy >= levelThreshold(level, r.total);
    final mode = _motif != null
        ? 'motif:$_motif'
        : _only == ScholarsKind.sacrifice
        ? 'sacrifice'
        : _flow
        ? 'flow10'
        : '${levelParams(level).seconds}s';
    final seconds = (r.attempts.fold<int>(0, (s, a) => s + a.ms) / 1000)
        .round();
    final details = <String, Object?>{
      'level': level,
      'accuracy': r.accuracy,
      'median_ms': r.medianMs,
      'median_full_ms': r.medianFullMs,
      'best_ms': r.bestMs,
      'streak': r.streak,
      'kinds': levelParams(level).kinds.map((k) => k.name).join('+'),
    };
    // 🔴 «ОБЫЧНО» — ПО ПОСЛЕДНИМ ПЯТИ ПОДХОДАМ СТУПЕНИ, в том же ключе, что пишет
    // веб: одна медиана гуляет ±25 % (замер веба), и без сравнения человек не
    // видит, быстрее ли он стал.
    if (r.solved > 0 && r.medianMs > 0) {
      final recent = [..._recent(level), r.medianMs];
      final kept = recent.sublist(max(0, recent.length - scholarsRecentRuns));
      await widget.state.set(_recentKey(level), jsonEncode(kept));
    }
    setState(() {
      _last = r;
      _passed = passed;
      _phase = _Phase.done;
    });
    if (_flow) {
      // 🔴 В ПОТОКЕ СТУПЕНЬ ДВИЖЕТСЯ ПО МЕДИАНЕ — той же шкалой, что звёзды.
      final step = GamePreset.isPreset
          ? StepMove.stay
          : stepByMedian(r.medianMs, level);
      if (step == StepMove.up) {
        await _ladder.win(
          score: r.solved,
          timeSeconds: seconds,
          errors: r.total - r.solved,
          mode: mode,
          details: details,
        );
      } else if (step == StepMove.down) {
        await _ladder.fail(
          score: r.solved,
          timeSeconds: seconds,
          errors: r.total - r.solved,
          mode: mode,
        );
      } else {
        await SessionReport.send(
          gameType: 'scholars_mate',
          score: r.solved,
          timeSeconds: seconds,
          errors: r.total - r.solved,
          mode: mode,
          difficulty: '$level',
          details: details,
        );
      }
    } else if (passed) {
      await _ladder.win(
        score: r.solved,
        timeSeconds: seconds,
        errors: r.total - r.solved,
        mode: mode,
        details: details,
      );
    } else {
      await _ladder.fail(
        score: r.solved,
        timeSeconds: seconds,
        errors: r.total - r.solved,
        mode: mode,
      );
    }
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final corpus = _corpus;
    if (corpus == null) {
      return Scaffold(
        body: Center(
          child: _error == null
              ? const CircularProgressIndicator()
              : Text(_error!),
        ),
      );
    }
    final run = _run;
    final playing = _phase == _Phase.playing && run != null;
    return GameShell(
      title: L.t('scholarsMate'),
      hud: [
        if (!GamePreset.isPreset)
          HudItem(
            label: L.t('label_level_short'),
            value: '${playing ? _runLevel : _ladder.level}',
            icon: Icons.flag_outlined,
          ),
        if (playing)
          HudItem(
            label: L.t('hud_correct'),
            value:
                '${run.attempts.where((a) => a.correct).length}/${run.attempts.length}',
            icon: Icons.check_circle_outline,
          ),
      ],
      field: (context, h) => switch (_phase) {
        _Phase.config => _config(corpus),
        _Phase.playing => run == null ? const SizedBox.shrink() : _play(run, h),
        _Phase.done => _result(),
      },
      pauseActions: [
        if (playing)
          PauseAction(
            label: L.t('restart'),
            icon: Icons.refresh,
            onPressed: _start,
          ),
      ],
    );
  }

  String _recentKey(int level) => 'psygames_scholars_medians_$level';

  List<int> _recent(int level) {
    final raw = widget.state.get(_recentKey(level));
    if (raw == null) return const [];
    try {
      return [for (final v in jsonDecode(raw) as List) (v as num).round()];
    } catch (_) {
      return const [];
    }
  }

  /// «Медиана 1.2 с · за 4 подходов 1.4 с»; меньше трёх подходов — без «обычно».
  String _speedLine(ScholarsResult r) {
    final mine =
        '${L.t('scholarsMedian')} ${scholarsSeconds(r.medianMs)} ${L.t('secShort')}';
    final recent = _recent(_runLevel);
    if (recent.length < 3) return mine;
    final usual = medianMs(recent);
    return '$mine · ${L.f('scholarsUsually', {'n': '${recent.length}'})} '
        '${scholarsSeconds(usual)} ${L.t('secShort')}';
  }

  /// Позиций в наборе режима. У лестницы — все пять видов, как в вебе.
  int _bank(ScholarsCorpus c) {
    if (_mix) return c.mixedCount;
    if (_motif != null) return c.namedCount(_motif!);
    if (_only != null) return c.of(_only!).length;
    return ScholarsKind.values.fold(0, (s, k) => s + c.of(k).length);
  }

  Widget _config(ScholarsCorpus c) {
    final kinds = kindsOfMode(
      _ladder.level,
      only: _only,
      motif: _motif,
      mix: _mix,
    );
    final labels = <String>[];
    for (final k in kinds) {
      final text = L.t(kindLabelKey[k]!);
      if (!labels.contains(text)) labels.add(text);
    }
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            L.t('scholarsMateDesc'),
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            key: const Key('sm-mode'),
            initialValue: _mode,
            isExpanded: true,
            decoration: InputDecoration(
              labelText: L.t('mode'),
              border: const OutlineInputBorder(),
            ),
            items: [
              DropdownMenuItem(value: 'levels', child: Text(L.t('modeLevels'))),
              DropdownMenuItem(
                value: 'mix',
                child: Text(
                  '${L.t('mixedMode')} · ${c.mixedCount}',
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              DropdownMenuItem(
                value: 'sacrifice',
                child: Text(
                  '${L.t('scholarsSacrificeMode')} · ${c.of(ScholarsKind.sacrifice).length}',
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              for (final m in c.namedMotifs)
                DropdownMenuItem(
                  value: 'motif:$m',
                  child: Text(
                    '${L.t(motifKey[m] ?? m)} · ${c.namedCount(m)}',
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
            ],
            onChanged: (v) => setState(() => _mode = v ?? 'levels'),
          ),
          SwitchListTile(
            key: const Key('sm-flow'),
            contentPadding: EdgeInsets.zero,
            value: _flow,
            title: Text(L.t('scholarsFlow')),
            subtitle: Text(L.t('scholarsFlowHint')),
            onChanged: (v) => setState(() => _flow = v),
          ),
          Text(labels.join(' · '), key: const Key('sm-kinds')),
          // Узор, который открывается на этой ступени, — только на лестнице:
          // в режимах отработки узор выбран руками.
          if (_mode == 'levels' && newMotifAt(_ladder.level) != null)
            Text(
              '${L.t('scholarsNewMotif')}: ${L.t(motifKey[newMotifAt(_ladder.level)!] ?? '')}',
              key: const Key('sm-new-motif'),
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          const SizedBox(height: 4),
          Text(
            L.f('scholarsBank', {'n': '${_bank(c)}'}),
            key: const Key('sm-bank'),
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 16),
          FilledButton(
            key: const Key('sm-start'),
            onPressed: _start,
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(52),
            ),
            child: Text(L.t('start')),
          ),
        ],
      ),
    );
  }

  Widget _play(ScholarsRun run, double fieldHeight) {
    final scheme = Theme.of(context).colorScheme;
    final p = run.puzzle;
    final real = L.t(kindLabelKey[p.kind]!);
    final question = run.kindHidden ? '?' : real;
    final white = run.whiteBottom;
    final left = run.secondsLeft;
    final threat = p.kind == ScholarsKind.threat;
    final verdict = run.verdict;
    String verdictText() {
      if (verdict == null) return ' ';
      final prefix = run.kindHidden ? '$real · ' : '';
      if (verdict.ok) return '$prefix✓';
      final best = verdict.best == null
          ? ''
          : threat
          ? '${L.t('scholarsBest')} ${L.t(verdict.best == 'yes' ? 'scholarsYes' : 'scholarsNo')}'
          : '${L.t('scholarsBest')} ${verdict.best}';
      final punished = verdict.refutation == null
          ? ''
          : ' · ${verdict.refutation}#';
      return '$prefix✕ $best$punished';
    }

    return LayoutBuilder(
      builder: (context, box) {
        // Сторона доски — от высоты поля каркаса числом, за вычетом строк
        // вопроса, времени, подсказки и вердикта; и не шире поля.
        final side = min(
          box.maxWidth - 16,
          fieldHeight - 190,
        ).clamp(120.0, 520.0);
        return Column(
          children: [
            Text(
              question,
              key: const Key('sm-question'),
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
            ),
            // В миксе имя узора до ответа скрыто, но место занято всегда —
            // иначе доска прыгала бы на каждой позиции.
            if (p.motif != null)
              Text(
                _mix && verdict == null
                    ? ' '
                    : L.t(motifKey[p.motif] ?? p.motif!),
                key: const Key('sm-motif'),
                style: Theme.of(context).textTheme.bodySmall,
              ),
            const SizedBox(height: 6),
            SizedBox(
              width: side,
              child: LinearProgressIndicator(
                key: const Key('sm-time'),
                value: (left / run.seconds).clamp(0.0, 1.0),
                minHeight: 8,
                color: left < run.seconds * 0.25
                    ? scheme.error
                    : scheme.primary,
              ),
            ),
            Text(
              '${left.toStringAsFixed(1)} ${L.t('secShort')} · '
              '${run.flowMs != null ? run.flowLeft : '${run.step + 1}/${run.deck.length}'}',
              key: const Key('sm-count'),
            ),
            const SizedBox(height: 6),
            ChessBoardView(
              pieces: scholarsPieces(run.fen, whiteBottom: white),
              side: side,
              keyPrefix: 'sm',
              onTapSquare: threat
                  ? null
                  : (i) => setState(
                      () => run.tap(scholarsSquareName(i, whiteBottom: white)),
                    ),
              selected: run.selected == null
                  ? null
                  : scholarsSquareIndex(run.selected!, whiteBottom: white),
              targets: {
                for (final t in run.targets)
                  scholarsSquareIndex(t, whiteBottom: white),
              },
              hinted: run.hintSquare == null
                  ? null
                  : scholarsSquareIndex(run.hintSquare!, whiteBottom: white),
            ),
            const SizedBox(height: 8),
            if (verdict == null && !threat && left <= run.seconds / 2)
              run.hintSquare != null
                  ? Text(L.t('hintUsed'), key: const Key('sm-hint-used'))
                  : OutlinedButton(
                      key: const Key('sm-hint'),
                      onPressed: () => setState(run.takeHint),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(110, 48),
                      ),
                      child: Text('${L.t('btn_hint')} −1⭐'),
                    ),
            if (threat)
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  OutlinedButton(
                    key: const Key('sm-yes'),
                    onPressed: () => setState(() => run.answerThreat(true)),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size(110, 48),
                    ),
                    child: Text(L.t('scholarsYes')),
                  ),
                  const SizedBox(width: 12),
                  OutlinedButton(
                    key: const Key('sm-no'),
                    onPressed: () => setState(() => run.answerThreat(false)),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size(110, 48),
                    ),
                    child: Text(L.t('scholarsNo')),
                  ),
                ],
              ),
            Text(
              verdictText(),
              key: const Key('sm-verdict'),
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: verdict == null
                    ? null
                    : verdict.ok
                    ? Colors.green.shade700
                    : scheme.error,
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _result() {
    final r = _last;
    if (r == null) return const SizedBox.shrink();
    final stars = r.solved > 0 ? runStars(r.medianMs, _runLevel, r.hints) : 1;
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            '★' * stars + '☆' * (3 - stars),
            key: const Key('sm-stars'),
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 36, color: Color(0xFFE0A800)),
          ),
          const SizedBox(height: 8),
          // 🔴 ГЛАВНАЯ ЦИФРА — МЕДИАНА ВРЕМЕНИ ВЕРНОГО ОТВЕТА, а не доля решённых.
          Text(
            _speedLine(r),
            key: const Key('sm-median'),
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
          ),
          Text(
            '${L.t('hud_correct')}: ${r.solved}/${r.total}',
            key: const Key('sm-solved'),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),
          FilledButton(
            key: const Key('sm-next'),
            onPressed: _start,
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(52),
            ),
            child: Text(
              _passed && !_flow && !GamePreset.isPreset
                  ? '${L.t('nextLabel')} · ${L.t('label_level_short')} ${_ladder.level}'
                  : L.t('restart'),
            ),
          ),
          const SizedBox(height: 8),
          OutlinedButton(
            key: const Key('sm-menu'),
            onPressed: () => setState(() => _phase = _Phase.config),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(48),
            ),
            child: Text(L.t('mode')),
          ),
        ],
      ),
    );
  }
}
