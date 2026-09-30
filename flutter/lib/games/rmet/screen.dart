/// «ПРОЧТИ ЭМОЦИЮ» НА ОБЩЕМ КАРКАСЕ.
///
/// Снимок глаз в поле, четыре слова — в ряду под полем: цель нажатия стоит на
/// одном месте от пункта к пункту, как у всего раздела.
///
/// ⚠️ РАЗБОР ПОКАЗЫВАЕТСЯ И ПРИ ВЕРНОМ ОТВЕТЕ. Узнать «мимо» мало: человек
/// должен увидеть, КАКОЕ слово было верным, иначе следующий такой же взгляд он
/// прочтёт так же неверно.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;

import '../../shell/aux_action.dart';
import '../../shell/demo_lesson.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart';
import '../../shell/shared_level_store.dart';
import '../../shell/shared_state.dart';
import 'model.dart';

class RmetScreen extends StatefulWidget {
  const RmetScreen({super.key, required this.state, this.content, this.trials = 18});

  final SharedState state;

  /// Подставляется пробой: она не ходит в ассеты.
  final RmetContent? content;
  final int trials;

  @override
  State<RmetScreen> createState() => _RmetScreenState();
}

class _RmetScreenState extends State<RmetScreen> {
  late LevelLadder _runs;
  RmetContent? _content;
  RmetSession? _session;
  bool _booting = true;
  int _shownAt = 0;

  int get _now => DateTime.now().millisecondsSinceEpoch;

  /// Язык материала: у упражнения свои слова только на двух языках, и
  /// подставлять третий нельзя — ответ перестал бы совпадать с вариантами.
  String get _locale => L.locale == 'ru' ? 'ru' : 'en';

  @override
  void initState() {
    super.initState();
    // Уровня у игры нет намеренно: материал один и тот же, и только поэтому
    // результаты сопоставимы между собой. Считаем ПРОХОЖДЕНИЯ.
    _runs = LevelLadder(gameId: 'rmet', store: SharedLevelStore(widget.state));
    _boot();
  }

  Future<void> _boot() async {
    final content =
        widget.content ?? RmetContent.fromJsonString(await rootBundle.loadString('assets/rmet.json'));
    await _runs.load();
    if (!mounted) return;
    setState(() {
      _content = content;
      _booting = false;
    });
  }

  void _start() {
    final c = _content;
    if (c == null) return;
    setState(() {
      _session = RmetSession.start(c, _locale, widget.trials);
      _shownAt = _now;
    });
  }

  void _answer(String choice) {
    final s = _session;
    if (s == null || s.feedback != null) return;
    setState(() => s.answer(choice, _now - _shownAt));
  }

  Future<void> _next() async {
    final s = _session;
    if (s == null) return;
    setState(() {
      s.next();
      _shownAt = _now;
    });
    if (s.finished) {
      final m = s.metrics;
      final seconds = (m.meanRtMs * m.total / 1000).round();
      if (m.passed) {
        await _runs.win(score: (m.accuracy * 100).round(), timeSeconds: seconds, errors: m.errors);
      } else {
        await _runs.fail(score: (m.accuracy * 100).round(), timeSeconds: seconds, errors: m.errors);
      }
      if (mounted) setState(() {});
    }
  }

  /// 🔴 КАРТОЧКИ БЕЗ ОТВЕТА — И ЭТО НЕ ПРОПУСК. Верного хода на ОТДЕЛЬНОЙ пробе
  /// здесь нет: выигрывает стратегия. Подписать карточке «верно: так» значило бы
  /// соврать — человек сделает так и проиграет на следующем шаге.
  List<DemoTrial> _demoTrials() => [
        DemoTrial(text: '', rule: L.t('teachRmetEyes')),
      ];

  @override
  Widget build(BuildContext context) {
    final c = _content;
    if (_booting || c == null) {
      return GameShell(
        title: L.t('rmet'),
        field: (context, h) => const Center(child: CircularProgressIndicator()),
      );
    }
    final s = _session;
    return GameShell(
      title: L.t('rmet'),
      onLesson: () => openDemoLesson(context, title: L.t('rmet'), trials: _demoTrials()),
      hud: [
        HudItem(label: L.t('score'), value: '${s?.hits ?? 0}', icon: Icons.check_circle_outline),
        HudItem(
          label: L.t('level'),
          value: s == null ? '0/${widget.trials}' : '${s.round + 1}/${s.items.length}',
          icon: Icons.visibility_outlined,
        ),
      ],
      field: (context, h) => _field(context, c, s, h),
      auxRow: AuxBar(children: [
        AuxAction(icon: Icons.refresh, label: L.t('restart'), onPressed: _start),
      ]),
      toolbar: _toolbar(context, s),
      pauseActions: [
        PauseAction(label: L.t('restart'), icon: Icons.refresh, onPressed: _start),
      ],
    );
  }

  Widget _field(BuildContext context, RmetContent c, RmetSession? s, double h) {
    final scheme = Theme.of(context).colorScheme;
    if (s == null) {
      return _Pad(
        height: h,
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Text(L.t('rmetDesc'), textAlign: TextAlign.center),
        ]),
      );
    }
    if (s.finished) {
      final m = s.metrics;
      return _Pad(
        height: h,
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(m.passed ? Icons.emoji_events_outlined : Icons.replay_outlined,
              size: 44, color: m.passed ? scheme.primary : scheme.onSurfaceVariant),
          const SizedBox(height: 10),
          Text('${m.hits}/${m.total}', style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: 6),
          Text('${(m.accuracy * 100).round()}%', style: Theme.of(context).textTheme.titleLarge),
          if (m.meanRtMs > 0) Text('${(m.meanRtMs / 1000).toStringAsFixed(1)} s'),
        ]),
      );
    }
    final file = s.currentFile;
    final side = (h.isFinite ? h : 400).clamp(220, 560) * 0.46;
    return _Pad(
      height: h,
      child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
        if (file != null)
          ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: Image.asset(
              'assets/rmet/$file',
              width: side * 1.6,
              height: side,
              fit: BoxFit.cover,
              // ⚠️ Снимок не доехал — показываем знак эмоции, а не пустое место:
              // пустой экран человек читает как поломку игры, а не картинки.
              errorBuilder: (context, error, stack) =>
                  Text(s.current.emoji, style: const TextStyle(fontSize: 64)),
            ),
          )
        else
          Text(s.current.emoji, style: const TextStyle(fontSize: 64)),
        const SizedBox(height: 10),
        Text(s.current.hintFor(s.locale),
            textAlign: TextAlign.center, style: TextStyle(color: scheme.onSurfaceVariant)),
        if (s.feedback != null) ...[
          const SizedBox(height: 10),
          /*
           * 🔴 РАЗБОР НАЗЫВАЕТ ОБА СЛОВА, А НЕ ТОЛЬКО ВЕРНОЕ. Варианты на время
           * разбора уходят (иначе ряд занял бы три строки и выдавил снимок), и
           * человек уже не видит, что именно выбрал. «Верно: доверчивый» без
           * «вы выбрали: задумчивый» не учит ничему: непонятно, чем они
           * различаются во взгляде.
           */
          if (!s.feedback!.correct)
            Text(
              s.feedback!.chosen,
              key: const ValueKey('rmet-chosen'),
              style: TextStyle(fontSize: 16, color: scheme.error, decoration: TextDecoration.lineThrough),
            ),
          Text(
            s.current.correctFor(s.locale),
            key: const ValueKey('rmet-correct'),
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: s.feedback!.correct ? scheme.primary : scheme.error,
            ),
          ),
        ],
      ]),
    );
  }

  Widget? _toolbar(BuildContext context, RmetSession? s) {
    Widget bar(List<Widget> children) => Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
          child: Wrap(spacing: 8, runSpacing: 8, alignment: WrapAlignment.center, children: children),
        );
    if (s == null) {
      return bar([
        FilledButton.icon(
          key: const ValueKey('rmet-start'),
          onPressed: _start,
          icon: const Icon(Icons.play_arrow),
          label: Text(L.t('start')),
        ),
      ]);
    }
    if (s.finished) {
      return bar([
        FilledButton.icon(
          key: const ValueKey('rmet-again'),
          onPressed: _start,
          icon: const Icon(Icons.refresh),
          label: Text(L.t('retry')),
        ),
      ]);
    }
    if (s.feedback != null) {
      return bar([
        FilledButton.icon(
          key: const ValueKey('rmet-next'),
          onPressed: _next,
          icon: const Icon(Icons.arrow_forward),
          label: Text(L.t('nextLabel')),
        ),
      ]);
    }
    return bar([
      for (final option in s.options)
        SizedBox(
          width: 160,
          child: OutlinedButton(
            key: ValueKey('rmet-option-$option'),
            onPressed: () => _answer(option),
            child: Text(option, textAlign: TextAlign.center),
          ),
        ),
    ]);
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
