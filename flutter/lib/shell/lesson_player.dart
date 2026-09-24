library;

import 'dart:async';

import 'package:flutter/material.dart';

import 'l10n.dart';
import 'lesson.dart';

/// ПЛЕЕР РАЗБОРА — ОДИН НА ВСЕ ИГРЫ.
///
/// 🔴 ПОЧЕМУ ДОСКУ РИСУЕТ НЕ ОН. Игр сто тринадцать, и досок у них столько же.
/// Плеер знает только про ШАГИ: сколько их, какой сейчас, что написано и куда
/// смотреть. Саму доску рисует та игра, что шаги породила, — она отдаёт сюда
/// [board], и это единственное, что раздел пишет у себя (десяток строк на
/// семейство игр, а не на игру).
///
/// Поведение снято с уже работающего веб-плеера
/// (`frontend/src/components/LessonPlayer.tsx`), включая длительность шага: она
/// считается по длине текста, а не задаётся числом, — короткую подпись человек
/// читает быстрее длинной, и ждать поровну заставлять незачем.
class LessonPlayerScreen extends StatefulWidget {
  const LessonPlayerScreen({
    super.key,
    required this.title,
    required this.steps,
    required this.board,
    this.onNewBoard,
  });

  /// Название игры — человек должен видеть, что разбирают.
  final String title;
  final List<LessonStep> steps;

  /// Доска с раскрытыми шагами: `shown` — сколько шагов уже показано.
  final Widget Function(BuildContext context, double side, int shown) board;

  /// «Новая доска» — если игра умеет раздать заново прямо отсюда.
  final VoidCallback? onNewBoard;

  @override
  State<LessonPlayerScreen> createState() => _LessonPlayerScreenState();
}

class _LessonPlayerScreenState extends State<LessonPlayerScreen> {
  int _index = 0;
  bool _playing = true;
  Timer? _timer;

  /// Длительность шага — та же формула, что в вебе (`длительностьШага`).
  static Duration _hold(String text) {
    final ms = (1200 + (text.length / 15) * 1000).clamp(2600, 9000).round();
    return Duration(milliseconds: ms);
  }

  @override
  void initState() {
    super.initState();
    _arm();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _arm() {
    _timer?.cancel();
    if (!_playing || _index >= widget.steps.length) return;
    _timer = Timer(_hold(_text(_index)), () {
      if (mounted) _go(_index + 1);
    });
  }

  void _go(int to) {
    setState(() {
      _index = to.clamp(0, widget.steps.length);
      if (_index >= widget.steps.length) _playing = false;
    });
    _arm();
  }

  String _text(int i) {
    if (i >= widget.steps.length) return L.t('teachNewBoard');
    final key = widget.steps[i].techniqueKey;
    // Приёма назвать нечем — говорим только про ход. Это честнее, чем придумать
    // объяснение: разбор показывает, ЧТО поставить, а «почему» приходит отдельным
    // слоем (словарь приёмов), и до него у части игр очередь ещё не дошла.
    return key == null ? L.t('puzzleNextStep') : L.t(key);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final total = widget.steps.length;
    final done = _index >= total;
    return Scaffold(
      appBar: AppBar(
        title: Text('${L.t('teachTitle')} · ${widget.title}'),
        leading: IconButton(
          key: const Key('lesson-close'),
          icon: const Icon(Icons.close),
          tooltip: L.t('close'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, c) {
            // Доска — самый крупный квадрат между шапкой и низом, но не больше
            // 55 % высоты: иначе текст шага и кнопки уедут за край.
            final side = (c.maxWidth - 24).clamp(0.0, c.maxHeight * 0.55);
            return Column(
              children: [
                const SizedBox(height: 8),
                SizedBox(
                  width: side,
                  height: side,
                  child: widget.board(context, side, _index),
                ),
                const SizedBox(height: 12),
                Text(
                  L.t('teachStepOf')
                      .replaceFirst('{i}', '${(_index + 1).clamp(1, total)}')
                      .replaceFirst('{n}', '$total'),
                  key: const Key('lesson-counter'),
                  style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13),
                ),
                const SizedBox(height: 6),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Text(
                    _text(_index),
                    key: const Key('lesson-text'),
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
                  ),
                ),
                const Spacer(),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    IconButton(
                      key: const Key('lesson-prev'),
                      iconSize: 32,
                      tooltip: L.t('back'),
                      onPressed: _index == 0 ? null : () => _go(_index - 1),
                      icon: const Icon(Icons.skip_previous),
                    ),
                    const SizedBox(width: 8),
                    FilledButton.icon(
                      key: const Key('lesson-play'),
                      onPressed: done
                          ? null
                          : () {
                              setState(() => _playing = !_playing);
                              _arm();
                            },
                      icon: Icon(_playing ? Icons.pause : Icons.play_arrow),
                      label: Text(_playing ? L.t('teachPause') : L.t('teachPlay')),
                    ),
                    const SizedBox(width: 8),
                    IconButton(
                      key: const Key('lesson-next'),
                      iconSize: 32,
                      tooltip: L.t('puzzleNextStep'),
                      onPressed: done ? null : () => _go(_index + 1),
                      icon: const Icon(Icons.skip_next),
                    ),
                  ],
                ),
                if (widget.onNewBoard != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 4, bottom: 10),
                    child: TextButton.icon(
                      key: const Key('lesson-new-board'),
                      onPressed: () {
                        Navigator.of(context).maybePop();
                        widget.onNewBoard!();
                      },
                      icon: const Icon(Icons.refresh),
                      label: Text(L.t('teachNewBoard')),
                    ),
                  )
                else
                  const SizedBox(height: 14),
              ],
            );
          },
        ),
      ),
    );
  }
}
