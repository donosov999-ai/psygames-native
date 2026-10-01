import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'l10n.dart';

/// 🔴 МОСТ МЕЖДУ ДВУМЯ НАТИВНЫМИ ШАГАМИ ЗАРЯДКИ — НАТИВНЫЙ.
///
/// Решение Дениса 01.10.2026: «зачем вебом скреплять переходы между двумя
/// упражнениями? это лишний глюк». До этого после нативной партии страница ждала
/// 2 с, уходила на свой мост `/warmup-bridge`, отсчитывала ещё 5 с и только потом
/// просила оболочку открыть следующую нативную игру — три перехода и пара «закрыть
/// старый / открыть новый» экран, на которой уже теряли настройки шага (PR #58).
///
/// Учёт зарядки (состав, номер шага, итоги, история) остаётся у веба
/// (`frontend/src/services/hostWarmup.ts`): он присылает `warmupStepDone`, а этот
/// экран показывает «дальше: …» и отвечает выбором человека. Слова — те же ключи,
/// что у веб-моста, на всех языках словаря.
enum WarmupBridgeChoice { go, skip, stop }

/// Сообщение веба `warmupStepDone`.
class WarmupStepDone {
  const WarmupStepDone({
    required this.fromIdx,
    required this.total,
    required this.evening,
    required this.nextUrl,
    required this.nextTitle,
    this.afterNextTitle,
    this.score = 0,
    this.seconds = 0,
  });

  /// Номер сыгранного шага, с нуля.
  final int fromIdx;
  final int total;
  final bool evening;
  final String nextUrl;
  final String nextTitle;

  /// Что откроется после «Пропустить»; нет — пропуск ведёт на итог зарядки.
  final String? afterNextTitle;

  /// Что сыграно — как на карточке веб-моста.
  final num score;
  final num seconds;

  static WarmupStepDone? fromJson(Map<String, Object?> m) {
    final next = m['next'];
    final from = m['fromIdx'];
    final total = m['total'];
    if (next is! Map || from is! num || total is! num) return null;
    final url = next['url'];
    if (url is! String || url.isEmpty) return null;
    final after = m['afterNext'];
    final played = m['played'];
    return WarmupStepDone(
      fromIdx: from.toInt(),
      total: total.toInt(),
      evening: m['evening'] == true,
      nextUrl: url,
      nextTitle: '${next['title'] ?? ''}',
      afterNextTitle: after is Map ? '${after['title'] ?? ''}' : null,
      score: played is Map && played['score'] is num ? played['score'] as num : 0,
      seconds: played is Map && played['time_seconds'] is num ? played['time_seconds'] as num : 0,
    );
  }
}

class WarmupStepBridge extends StatefulWidget {
  const WarmupStepBridge({super.key, required this.done, this.seconds});

  final WarmupStepDone done;

  /// Отсчёт до старта. Пусто — как у веб-моста: 5 с, вечером 8.
  final int? seconds;

  @override
  State<WarmupStepBridge> createState() => _WarmupStepBridgeState();
}

class _WarmupStepBridgeState extends State<WarmupStepBridge> {
  late int _left = widget.seconds ?? (widget.done.evening ? 8 : 5);
  Timer? _tick;
  bool _asking = false;
  bool _closed = false;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      // Пока висит вопрос «остановить?», отсчёт стоит — как у веб-моста: иначе он
      // уйдёт на следующую игру ПОД вопросом.
      if (_asking || !mounted) return;
      setState(() => _left -= 1);
      if (_left <= 0) _close(WarmupBridgeChoice.go);
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  void _close(WarmupBridgeChoice c) {
    if (_closed || !mounted) return;
    _closed = true;
    _tick?.cancel();
    Navigator.of(context).pop(c);
  }

  Future<void> _askStop() async {
    setState(() => _asking = true);
    final d = widget.done;
    final stop = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        content: Text(
          L.t('warmupStopAsk').replaceAll('{n}', '${d.fromIdx + 1}').replaceAll('{m}', '${d.total}'),
        ),
        actions: [
          FilledButton(
            key: const Key('warmup-bridge-keep'),
            onPressed: () => Navigator.of(c).pop(false),
            child: Text(L.t('warmupStopKeep')),
          ),
          TextButton(
            key: const Key('warmup-bridge-stop-yes'),
            onPressed: () => Navigator.of(c).pop(true),
            child: Text(L.t('stopComplex')),
          ),
        ],
      ),
    );
    if (!mounted) return;
    if (stop == true) {
      _close(WarmupBridgeChoice.stop);
    } else {
      setState(() => _asking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.done;
    final scheme = Theme.of(context).colorScheme;
    final accent = d.evening ? const Color(0xFF7C3AED) : const Color(0xFFF59E0B);
    final played = d.fromIdx + 1;
    return PopScope(
      // Системное «назад» не уводит молча: тот же вопрос, что у кнопки «Остановить».
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && !_asking) _askStop();
      },
      child: Scaffold(
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  '${d.evening ? '🌙 ${L.t('complexEvening')}' : '⚡ ${L.t('complexWarmup')}'} · $played/${d.total}',
                  key: const Key('warmup-bridge-hud'),
                  textAlign: TextAlign.center,
                  style: TextStyle(color: accent, fontWeight: FontWeight.w800, letterSpacing: 1),
                ),
                const SizedBox(height: 8),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: d.total == 0 ? 0 : played / d.total,
                    minHeight: 6,
                    color: accent,
                    backgroundColor: scheme.surfaceContainerHighest,
                  ),
                ),
                const Spacer(),
                Text(
                  '${L.t('bridgeJustPlayed')} · $played/${d.total}',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: scheme.onSurfaceVariant, fontWeight: FontWeight.w700),
                ),
                if (d.seconds > 0) ...[
                  const SizedBox(height: 6),
                  Text(
                    '${d.score >= 0 ? '+' : ''}${d.score} · ${d.seconds.toStringAsFixed(1)}${L.t('secShort')}',
                    key: const Key('warmup-bridge-played'),
                    textAlign: TextAlign.center,
                    style: TextStyle(color: d.score < 0 ? scheme.error : const Color(0xFF22C55E), fontWeight: FontWeight.w700),
                  ),
                ],
                const SizedBox(height: 24),
                Card(
                  color: accent,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 16),
                    child: Column(children: [
                      Text('${L.t('onbNext')}:', style: const TextStyle(color: Colors.white70, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 10),
                      Text(
                        d.nextTitle,
                        key: const Key('warmup-bridge-next'),
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w800),
                      ),
                    ]),
                  ),
                ),
                const SizedBox(height: 20),
                Text(
                  L.t('startingInN').replaceAll('{n}', '${_left < 0 ? 0 : _left}'),
                  key: const Key('warmup-bridge-countdown'),
                  textAlign: TextAlign.center,
                  style: TextStyle(color: accent, fontSize: 16, fontWeight: FontWeight.w700),
                ),
                const Spacer(),
                SizedBox(
                  height: 52,
                  child: FilledButton(
                    key: const Key('warmup-bridge-go'),
                    style: FilledButton.styleFrom(backgroundColor: accent, foregroundColor: Colors.white),
                    onPressed: () => _close(WarmupBridgeChoice.go),
                    child: Text(L.t('ctaStartNow'), style: const TextStyle(fontWeight: FontWeight.w800)),
                  ),
                ),
                const SizedBox(height: 10),
                Row(children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      key: const Key('warmup-bridge-skip'),
                      onPressed: () => _close(WarmupBridgeChoice.skip),
                      icon: const Icon(Icons.skip_next),
                      label: Text('${L.t('skipGameNamed')} ${d.nextTitle}', maxLines: 1, overflow: TextOverflow.ellipsis),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton.icon(
                      key: const Key('warmup-bridge-stop'),
                      style: OutlinedButton.styleFrom(foregroundColor: scheme.error),
                      onPressed: _asking ? null : _askStop,
                      icon: const Icon(Icons.stop),
                      label: Text(L.t('stopComplex'), maxLines: 1, overflow: TextOverflow.ellipsis),
                    ),
                  ),
                ]),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Где человек в серии — ответ веба `__psyWarmupHost.info()`.
class WarmupStepInfo {
  const WarmupStepInfo({required this.idx, required this.total, required this.title, this.evening = false});

  /// Номер ТЕКУЩЕГО шага, с нуля.
  final int idx;
  final int total;
  final String title;
  final bool evening;

  static WarmupStepInfo? fromJson(Object? m) {
    if (m is! Map || m['active'] != true) return null;
    final idx = m['idx'];
    final total = m['total'];
    if (idx is! num || total is! num) return null;
    return WarmupStepInfo(idx: idx.toInt(), total: total.toInt(), title: '${m['title'] ?? ''}', evening: m['evening'] == true);
  }
}

/// 🔴 ПОЛОСКА СЕРИИ В НАТИВНОМ ШАГЕ — «ГДЕ Я» И ⏭ (задача 63bccf96).
///
/// Веб рисует её в своём каркасе (`GameShell`: `warmup-position` «N/M» и
/// `warmup-skip-step` ⏭ с вопросом «Пропустить: <игра>?»), а нативный экран лежит
/// ПОВЕРХ страницы — и в нативном шаге не было ни номера, ни пропуска. Отчёт
/// игрока 08.09: «Я 7 таблиц решил, сколько ещё?». Оболочка оборачивает экран шага
/// этой рамкой сама: каркас игры (`GameShell`) не трогается, и рамка одна на все
/// нативные игры. Пропуск ведёт туда же, куда веб-⏭ (`skipCurrent`).
class WarmupStepFrame extends StatelessWidget {
  const WarmupStepFrame({super.key, required this.info, required this.onSkip, required this.child});

  /// Пусто, пока веб не ответил: полоска уже стоит, номер приходит следом —
  /// чтобы экран игры не прыгал вниз через мгновение после открытия.
  final ValueListenable<WarmupStepInfo?> info;
  final VoidCallback onSkip;
  final Widget child;

  Future<void> _askSkip(BuildContext context, WarmupStepInfo? i) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(L.t('skipStep'), key: const Key('skip-step-title')),
        content: Text('${L.t('skipGameNamed')} ${i?.title ?? ''}?', key: const Key('skip-step-body')),
        actions: [
          // Безопасный ответ первым и залитым — как в веб-каркасе.
          FilledButton(
            key: const Key('skip-step-stay'),
            onPressed: () => Navigator.of(c).pop(false),
            child: Text(L.t('btn_cancel')),
          ),
          TextButton(
            key: const Key('skip-step-confirm'),
            onPressed: () => Navigator.of(c).pop(true),
            child: Text(L.t('skipStep')),
          ),
        ],
      ),
    );
    if (yes == true) onSkip();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.surface,
      child: Column(children: [
        SafeArea(
          bottom: false,
          child: ValueListenableBuilder<WarmupStepInfo?>(
            valueListenable: info,
            builder: (context, i, _) {
              final accent = i?.evening == true ? const Color(0xFF7C3AED) : const Color(0xFFF59E0B);
              final pos = i == null || i.total < 2 ? '' : ' · ${(i.idx + 1).clamp(1, i.total)}/${i.total}';
              return SizedBox(
                height: 36,
                child: Row(children: [
                  const SizedBox(width: 16),
                  Expanded(
                    child: Text(
                      '${i?.evening == true ? '🌙 ${L.t('complexEvening')}' : '⚡ ${L.t('complexWarmup')}'}$pos',
                      key: const Key('warmup-position'),
                      semanticsLabel: i == null ? null : '${L.t('unitGames')}: ${i.idx + 1}/${i.total}',
                      style: TextStyle(color: accent, fontWeight: FontWeight.w800, letterSpacing: 0.5),
                    ),
                  ),
                  IconButton(
                    key: const Key('warmup-skip-step'),
                    tooltip: L.t('skipStep'),
                    visualDensity: VisualDensity.compact,
                    onPressed: () => _askSkip(context, i),
                    icon: Icon(Icons.skip_next, color: accent),
                  ),
                  const SizedBox(width: 4),
                ]),
              );
            },
          ),
        ),
        // Верхний отступ съеден полоской — экрану игры его второй раз не нужно.
        Expanded(child: MediaQuery.removePadding(context: context, removeTop: true, child: child)),
      ]),
    );
  }
}
