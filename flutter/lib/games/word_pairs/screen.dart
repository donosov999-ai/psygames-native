/// «ПАРЫ СЛОВ» НА ОБЩЕМ КАРКАСЕ.
///
/// Круг: показ пар с обратным отсчётом → соединение вразнобой → итог.
///
/// 🔴 ПРАВЫЙ СТОЛБЕЦ ПЕРЕМЕШАН, И ЭТО САМО ЗАДАНИЕ. Оставь его в порядке
/// показа — и пары читались бы построчно, без памяти вовсе.
///
/// ⚠️ ВРЕМЯ ОГРАНИЧИВАЕТ ТОЛЬКО ПОКАЗ. Соединение временем не ограничено:
/// ошибки и так штрафуются, а торопить на этапе, где человек вспоминает, —
/// значит мерить скорость пальца вместо памяти.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;

import '../../shell/aux_action.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'model.dart';

class WordPairsScreen extends StatefulWidget {
  const WordPairsScreen({super.key, required this.state, this.content, this.mode = 'random'});

  final SharedState state;

  /// Подставляется пробой: она не ходит в ассеты.
  final WordPairsContent? content;
  final String mode;

  @override
  State<WordPairsScreen> createState() => _WordPairsScreenState();
}

class _WordPairsScreenState extends State<WordPairsScreen> {
  late LevelLadder _ladder;
  WordPairsContent? _content;
  WordPairsSession? _session;

  /// Открыто для пробы: ей нужно знать, какая пара где, чтобы соединять верно.
  WordPairsSession? get session => _session;
  bool _booting = true;
  int _leftMs = 0;
  Timer? _timer;

  /// Ключ запаса невиданного: свой у каждого режима — иначе игра в один режим
  /// выедала бы материал другого.
  String get _poolKey => 'word_pairs_${widget.mode}_${L.locale}';

  @override
  void initState() {
    super.initState();
    _ladder = LevelLadder(gameId: 'word_pairs', store: SharedLevelStore(widget.state), maxLevel: 15);
    _boot();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _boot() async {
    final content = widget.content ??
        WordPairsContent.fromJsonStrings(
          await rootBundle.loadString('assets/word-pairs.json'),
          await rootBundle.loadString('assets/vocab/translation-vocab.json'),
        );
    await _ladder.load();
    if (!mounted) return;
    setState(() {
      _content = content;
      _booting = false;
    });
  }

  /// Запас лежит в общем хранилище каркаса — там же, где его видит веб-половина.
  List<String> _readSeen() =>
      widget.state.get(_poolKey)?.split('\u0001').where((x) => x.isNotEmpty).toList() ?? const [];

  Future<void> _writeSeen(List<String> seen) => widget.state.set(_poolKey, seen.join('\u0001'));

  Future<void> _start() async {
    final c = _content;
    if (c == null) return;
    final built = WordPairsSession.build(
      content: c,
      locale: L.locale,
      targetLocale: L.locale == 'en' ? 'es' : 'en',
      mode: widget.mode,
      level: _ladder.level,
      seen: _readSeen(),
    );
    await _writeSeen(built.seen);
    if (!mounted) return;
    setState(() {
      _session = built.session;
      _leftMs = built.session.memorizeMs;
    });
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(milliseconds: 200), (t) {
      final s = _session;
      if (!mounted || s == null || s.phase != WordPairsPhase.memorize) {
        t.cancel();
        return;
      }
      setState(() => _leftMs -= 200);
      if (_leftMs <= 0) {
        t.cancel();
        setState(s.startMatching);
      }
    });
  }

  Future<void> _finish(WordPairsSession s) async {
    if (s.passed) {
      await _ladder.win(score: s.score, errors: s.errors, mode: widget.mode);
    } else {
      await _ladder.fail(score: s.score, errors: s.errors, mode: widget.mode);
    }
    if (mounted) setState(() {});
  }

  void _tap(void Function(WordPairsSession s) action) {
    final s = _session;
    if (s == null) return;
    setState(() => action(s));
    if (s.phase == WordPairsPhase.result) _finish(s);
  }

  @override
  Widget build(BuildContext context) {
    final c = _content;
    if (_booting || c == null) {
      return GameShell(
        title: L.t('wordPairs'),
        field: (context, h) => const Center(child: CircularProgressIndicator()),
      );
    }
    final s = _session;
    return GameShell(
      title: L.t('wordPairs'),
      hud: [
        HudItem(label: L.t('level'), value: '${_ladder.level}', icon: Icons.flag_outlined),
        HudItem(
          label: L.t('label_found'),
          value: s == null ? '0' : '${s.matched.length}/${s.pairs.length}',
          icon: Icons.link,
        ),
        HudItem(
          label: s?.phase == WordPairsPhase.memorize ? L.t('timeLeftLabel') : L.t('errors'),
          value: s == null
              ? '—'
              : s.phase == WordPairsPhase.memorize
                  ? '${(_leftMs / 1000).ceil()}'
                  : '${s.errors}',
          icon: Icons.timer_outlined,
        ),
      ],
      field: (context, h) => _field(context, s, h),
      auxRow: AuxBar(children: [
        AuxAction(icon: Icons.refresh, label: L.t('restart'), onPressed: _start),
      ]),
      toolbar: _toolbar(s),
      pauseActions: [
        PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: _start),
      ],
    );
  }

  Widget _field(BuildContext context, WordPairsSession? s, double h) {
    final scheme = Theme.of(context).colorScheme;
    if (s == null) {
      return _Pad(
        height: h,
        child: Center(child: Text(L.t('desc_word_pairs_rules'), textAlign: TextAlign.center)),
      );
    }
    if (s.phase == WordPairsPhase.memorize) {
      return _Pad(
        height: h,
        child: Column(children: [
          Text(L.t('label_memorize_word_pairs'), style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          Expanded(
            child: ListView.separated(
              itemCount: s.pairs.length,
              separatorBuilder: (_, _) => const SizedBox(height: 6),
              itemBuilder: (context, i) => Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: scheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                  Flexible(child: Text(s.pairs[i].left, style: const TextStyle(fontWeight: FontWeight.w600))),
                  const Icon(Icons.arrow_forward, size: 16),
                  Flexible(child: Text(s.pairs[i].right, textAlign: TextAlign.right)),
                ]),
              ),
            ),
          ),
        ]),
      );
    }
    if (s.phase == WordPairsPhase.result) {
      return _Pad(
        height: h,
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(s.passed ? Icons.emoji_events_outlined : Icons.replay_outlined,
              size: 44, color: s.passed ? scheme.primary : scheme.onSurfaceVariant),
          const SizedBox(height: 10),
          Text(s.passed ? L.f('levelDone', {'n': '${s.level}'}) : L.t('retry'),
              style: Theme.of(context).textTheme.titleLarge, textAlign: TextAlign.center),
          const SizedBox(height: 8),
          Text('${L.t('errors')}: ${s.errors}'),
          Text('${L.t('score')}: ${s.score}', style: const TextStyle(fontWeight: FontWeight.w700)),
        ]),
      );
    }
    // Соединение: слева — показанные слова, справа — те же пары вразнобой.
    return _Pad(
      height: h,
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(
          child: ListView(children: [
            for (final p in s.pairs)
              _Word(
                key: ValueKey('wp-left-${p.id}'),
                text: p.left,
                done: s.matched.contains(p.id),
                selected: s.selectedLeft == p.id,
                onTap: () => _tap((x) => x.tapLeft(p.id)),
              ),
          ]),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: ListView(children: [
            for (final word in s.right)
              _Word(
                key: ValueKey('wp-right-$word'),
                text: word,
                done: s.pairs.any((p) => p.right == word && s.matched.contains(p.id)),
                selected: s.selectedRight == word,
                onTap: () => _tap((x) => x.tapRight(word)),
              ),
          ]),
        ),
      ]),
    );
  }

  Widget? _toolbar(WordPairsSession? s) {
    Widget bar(Widget child) => Padding(padding: const EdgeInsets.fromLTRB(12, 8, 12, 12), child: child);
    if (s == null) {
      return bar(FilledButton.icon(
        key: const ValueKey('wp-start'),
        onPressed: _start,
        icon: const Icon(Icons.play_arrow),
        label: Text(L.t('start')),
      ));
    }
    if (s.phase == WordPairsPhase.memorize) {
      // Кнопка рядом с таймером: запомнил раньше — не жди.
      return bar(FilledButton.icon(
        key: const ValueKey('wp-check'),
        onPressed: () {
          _timer?.cancel();
          setState(s.startMatching);
        },
        icon: const Icon(Icons.check_circle_outline),
        label: Text(L.t('check')),
      ));
    }
    if (s.phase == WordPairsPhase.result) {
      return bar(FilledButton.icon(
        key: const ValueKey('wp-again'),
        onPressed: _start,
        icon: const Icon(Icons.arrow_forward),
        label: Text(s.passed ? L.t('nextLabel') : L.t('retry')),
      ));
    }
    return null;
  }
}

class _Word extends StatelessWidget {
  const _Word({super.key, required this.text, required this.done, required this.selected, required this.onTap});

  final String text;
  final bool done;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: InkWell(
        onTap: done ? null : onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: 48),
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          decoration: BoxDecoration(
            color: done ? scheme.primaryContainer : scheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: selected ? scheme.primary : Colors.transparent,
              width: selected ? 2 : 0,
            ),
          ),
          child: Text(
            text,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontWeight: FontWeight.w600,
              decoration: done ? TextDecoration.lineThrough : null,
              color: done ? scheme.onPrimaryContainer : scheme.onSurface,
            ),
          ),
        ),
      ),
    );
  }
}

class _Pad extends StatelessWidget {
  const _Pad({required this.height, required this.child});

  final double height;
  final Widget child;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: height.isFinite ? height : null,
        child: Padding(padding: const EdgeInsets.all(12), child: child),
      );
}
