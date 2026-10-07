library;

import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'game_clock.dart';
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
    this.newBoardLabel,
  });

  /// Название игры — человек должен видеть, что разбирают.
  final String title;
  final List<LessonStep> steps;

  /// Доска с раскрытыми шагами: `shown` — сколько шагов уже показано.
  final Widget Function(BuildContext context, double side, int shown) board;

  /// «Новая доска» — если игра умеет раздать заново прямо отсюда.
  final VoidCallback? onNewBoard;
  final String? newBoardLabel;

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

  /// Разбор открыт ПОВЕРХ партии: пока он на экране, часы партии стоят (задача 430d1299).
  /// Свой таймер плеера — обычный `Timer`: он листает шаги разбора, а не партию.
  VoidCallback? _releaseGame;

  @override
  void initState() {
    super.initState();
    _releaseGame = holdGame();
    _arm();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _releaseGame?.call();
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
    final ready = widget.steps[i].text;
    if (ready != null) return ready;
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
            /*
             * 🔴 ДОСКА УСТУПАЕТ МЕСТО ТЕКСТУ ПРИЁМА, А ТЕКСТ ПРОКРУЧИВАЕТСЯ.
             * Замер раздела «Объём памяти» 30.09.2026 на 375×667 (iPhone SE), ru:
             * столбец переполнялся у 4 игр из 6 проверенных — Корси на 96 px (на
             * 360×640 на 108), «Цифры» на 72, «Матрица» и «Объём пространства» на 24.
             * Тексты при этом обычные — медиана по 55 ключам teach* 129 знаков ru,
             * 151 de, — а на узком экране это 6–7 строк. Плеер был рассчитан только
             * на высокий экран: доска 55 % высоты, под ней текст без прокрутки и
             * кнопки, которые он выталкивал за край.
             * Теперь доска не больше 55 % высоты и оставляет тексту ~6 строк, но не
             * меньше 40 % высоты — доска и есть разбор. Текст в своей прокрутке,
             * кнопки прибиты к низу.
             */
            const chrome = 150.0;    // счётчик шага, ряд кнопок, «Новая доска», отступы
            const textRoom = 150.0;  // ~6 строк шрифтом 17
            final h = c.maxHeight;
            final byHeight = math.max(h * 0.4, math.min(h * 0.55, h - chrome - textRoom));
            final side = (c.maxWidth - 24).clamp(0.0, byHeight);
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
                Expanded(
                  // Ключ по номеру шага: новый шаг начинается с начала текста, а не
                  // с того места, куда человек прокрутил предыдущий.
                  child: SingleChildScrollView(
                    key: ValueKey<int>(_index),
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    child: Text(
                      _text(_index),
                      key: const Key('lesson-text'),
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
                    ),
                  ),
                ),
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
                    // Подпись ужимается, а не выталкивает «следующий шаг» за край:
                    // «Mettre en pause» на 320 px и при крупном системном шрифте
                    // ряду не помещалась — переполнение вправо до 70 px (проба
                    // lesson_player_small_screens_test.dart).
                    Flexible(
                      child: FilledButton.icon(
                        key: const Key('lesson-play'),
                        onPressed: done
                            ? null
                            : () {
                                setState(() => _playing = !_playing);
                                _arm();
                              },
                        icon: Icon(_playing ? Icons.pause : Icons.play_arrow),
                        label: FittedBox(
                          fit: BoxFit.scaleDown,
                          child: Text(_playing ? L.t('teachPause') : L.t('teachPlay')),
                        ),
                      ),
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
                      label: Text(widget.newBoardLabel ?? L.t('teachNewBoard')),
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
