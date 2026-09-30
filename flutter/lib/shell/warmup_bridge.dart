import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';

import 'hybrid_app.dart';

/// Выполнить JS в странице и вернуть результат — [HybridApp.runJs] или подставной в пробе.
typedef JsRunner = Future<Object?> Function(String js);

/// ЗАРЯДКА РАЗДЕЛА НАД НАТИВНОЙ РАЗВИЛКОЙ — через мост к веб-карточке.
///
/// 🔴 ЗАЧЕМ МОСТ, А НЕ ПЕРЕНОС. Серия зарядки живёт в вебе (`WarmupContext`):
/// переход шага, пропуск, итог серии, статистика зарядок. Перенести карточку
/// значило бы завести вторую копию состава серии, и первая же правка развела бы
/// их. Поэтому развилка рисуется нативно, а над списком стоит шапка, которая
/// БЕРЁТ у веб-карточки подписи и число подходов (`__psyWarmups[имя].info()`) и
/// зовёт ТОТ ЖЕ запуск (`start(минут)`). Страница уходит на первый шаг — хост
/// сам снимает развилку (`routeAction`), как при любом переходе зарядки.
///
/// ⚠️ Карточка монтируется в странице чуть позже, чем открывается развилка, а
/// уровни приезжают из хранилища ещё позже. Поэтому шапка спрашивает несколько
/// раз, пока карточка не ответит готовностью.
class WarmupBridgeHeader extends StatefulWidget {
  const WarmupBridgeHeader({super.key, required this.bridgeId, required this.accent, this.run, this.pollEvery});

  /// Имя моста — `bridgeId` веб-карточки: `words`, `languages`.
  final String bridgeId;
  final Color accent;

  /// Выполнитель JS. Пусто — берётся хост гибрида ([HybridApp.runJs]).
  final JsRunner? run;
  final Duration? pollEvery;

  @override
  State<WarmupBridgeHeader> createState() => _WarmupBridgeHeaderState();
}

class _WarmupBridgeHeaderState extends State<WarmupBridgeHeader> {
  Map<String, dynamic>? _info;
  int _minutes = 10;
  Timer? _poll;
  int _tries = 0;
  bool _starting = false;

  JsRunner? get _run => widget.run ?? HybridApp.runJs;

  String get _ref => "(window.__psyWarmups||{})['${widget.bridgeId}']";

  @override
  void initState() {
    super.initState();
    _ask();
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  /// Ответ страницы: WebKit отдаёт строку как есть, Android — ещё раз в кавычках.
  static Object? _decode(Object? raw) {
    Object? v = raw;
    for (var i = 0; i < 2 && v is String; i += 1) {
      try {
        v = jsonDecode(v);
      } catch (_) {
        return null;
      }
    }
    return v;
  }

  Future<void> _ask() async {
    final run = _run;
    if (run == null) return;
    Object? got;
    try {
      got = _decode(await run('JSON.stringify($_ref.info ? $_ref.info() : null)'));
    } catch (_) {
      got = null;
    }
    if (!mounted) return;
    if (got is Map<String, dynamic>) setState(() => _info = got as Map<String, dynamic>);
    final ready = _info?['ready'] == true;
    _tries += 1;
    if (!ready && _tries < 25) {
      _poll = Timer(widget.pollEvery ?? const Duration(milliseconds: 200), _ask);
    }
  }

  Future<void> _start() async {
    final run = _run;
    if (run == null || _starting) return;
    setState(() => _starting = true);
    Object? ok;
    try {
      ok = _decode(await run('JSON.stringify($_ref.start ? $_ref.start($_minutes) : false)'));
    } catch (_) {
      ok = false;
    }
    // Запустилось — страница уйдёт на первый шаг, и развилку снимет хост.
    // Не запустилось — кнопка снова доступна, а шапка переспрашивает готовность.
    if (!mounted) return;
    setState(() => _starting = false);
    if (ok != true) {
      _tries = 0;
      unawaited(_ask());
    }
  }

  @override
  Widget build(BuildContext context) {
    final info = _info;
    if (info == null) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    final options = [for (final o in (info['options'] as List? ?? const [])) o as Map<String, dynamic>];
    final chosen = options.where((o) => o['min'] == _minutes).firstOrNull;
    final names = [for (final n in (chosen?['names'] as List? ?? const [])) '$n'];
    final sub = '${info['sub'] ?? ''}';
    final ready = info['ready'] == true && ((chosen?['count'] as num?) ?? 0) > 0;
    return Card(
      key: Key('warmup-bridge-${widget.bridgeId}'),
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Icon(Icons.flash_on, color: widget.accent, size: 20),
            const SizedBox(width: 8),
            Expanded(
              child: Text('${info['title'] ?? ''}', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
            ),
          ]),
          const SizedBox(height: 6),
          Text('${info['desc'] ?? ''}', style: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant)),
          if (sub.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(sub, style: TextStyle(fontSize: 13, color: widget.accent, fontWeight: FontWeight.w700)),
          ],
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final o in options)
              ChoiceChip(
                key: Key('warmup-min-${o['min']}'),
                selected: o['min'] == _minutes,
                onSelected: (_) => setState(() => _minutes = (o['min'] as num).toInt()),
                label: Text('${o['label']} · ≈ ${o['min']} ${info['unit'] ?? ''}'),
              ),
          ]),
          if (names.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(names.join(' · '), style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
          ],
          const SizedBox(height: 10),
          SizedBox(
            height: 48,
            child: FilledButton.icon(
              key: Key('warmup-start-${widget.bridgeId}'),
              style: FilledButton.styleFrom(backgroundColor: widget.accent, foregroundColor: Colors.white),
              onPressed: ready && !_starting ? _start : null,
              icon: const Icon(Icons.play_arrow),
              label: Text('${info['startLabel'] ?? ''}'),
            ),
          ),
        ]),
      ),
    );
  }
}
