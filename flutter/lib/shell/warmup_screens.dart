import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// 🔴 ВЫБОР ЗАРЯДКИ И ИТОГ — НАТИВНЫЕ ЭКРАНЫ (задача 748c3f5f).
///
/// Решение Дениса 01.10.2026: «всё, что не на Flutter, — переводить», «зачем вебом
/// скреплять переходы — это лишний глюк». После PR #98 серия из нативных игр шла без
/// веба, но начиналась и кончалась веб-экранами — `/warmup-picker` и
/// `/warmup-complete`, — а перед непереехавшей игрой и при «время вышло» показывала
/// веб-мост `/warmup-bridge`.
///
/// Считает за этими экранами по-прежнему веб: составы (`services/warmup.ts`),
/// профиль, история, серия дней, разбор по навыкам, токены и напоминания —
/// общие с остальным приложением, и вторая копия на Dart разошлась бы с первой
/// молча. Веб-экран под нами невидим и присылает готовую модель
/// (`frontend/src/services/warmupUi.ts`: тексты уже на языке человека, числа
/// посчитаны); здесь она рисуется, а нажатия уходят обратно в его же действия
/// (`window.__psyWarmupUi.<экран>.<действие>`).
class WarmupUi {
  /// Последняя модель экрана выбора.
  static final picker = ValueNotifier<Map<String, Object?>?>(null);

  /// Последняя модель итога.
  static final complete = ValueNotifier<Map<String, Object?>?>(null);

  /// Последняя модель веб-моста (перед веб-игрой и когда вышло время).
  static final bridge = ValueNotifier<Map<String, Object?>?>(null);

  /// Как звать страницу; ставит оболочка (`hybrid_app.dart`), пробы — свою.
  static Future<void> Function(String js)? run;

  /// Сообщение страницы `{op:'warmupUi', screen, model}`. true — наше.
  static bool accept(Object? m) {
    if (m is! Map || m['op'] != 'warmupUi') return false;
    final model = m['model'];
    if (model is! Map) return true;
    final value = Map<String, Object?>.from(model);
    switch (m['screen']) {
      case 'picker':
        picker.value = value;
      case 'complete':
        complete.value = value;
      case 'bridge':
        bridge.value = value;
    }
    return true;
  }

  /// Действие экрана страницы. Нет страницы или действия — молча ничего.
  static Future<void> act(String screen, String action, [List<Object?> args = const []]) async {
    final call = run;
    if (call == null) return;
    final a = args.map(jsonEncode).join(',');
    await call(
      'window.__psyWarmupUi && window.__psyWarmupUi.$screen && '
      'window.__psyWarmupUi.$screen.$action && window.__psyWarmupUi.$screen.$action($a);',
    );
  }
}

Color _hex(Object? v, [Color fallback = const Color(0xFFF59E0B)]) {
  if (v is! String || !v.startsWith('#')) return fallback;
  final s = v.substring(1);
  final n = int.tryParse(s.length == 6 ? 'FF$s' : s, radix: 16);
  return n == null ? fallback : Color(n);
}

String _s(Object? v) => v is String ? v : '';

List<Map<String, Object?>> _list(Object? v) =>
    v is List ? [for (final e in v) if (e is Map) Map<String, Object?>.from(e)] : const [];

/// Значки веба (Ionicons) — их ближайшие соседи в Material.
const _icons = <String, IconData>{
  'sunny-outline': Icons.wb_sunny_outlined,
  'partly-sunny-outline': Icons.wb_cloudy_outlined,
  'moon-outline': Icons.nightlight_outlined,
  'bed-outline': Icons.bed_outlined,
  'analytics-outline': Icons.analytics_outlined,
  'trending-up-outline': Icons.trending_up,
  'grid-outline': Icons.grid_view,
  'text-outline': Icons.text_fields,
  'apps-outline': Icons.apps,
  'flash-outline': Icons.flash_on_outlined,
};

IconData _icon(Object? name) => _icons[name] ?? Icons.bolt;

/// Модели ещё нет: страница не успела прислать — просим повторить и ждём.
class _Waiting extends StatelessWidget {
  const _Waiting();

  @override
  Widget build(BuildContext context) => const Scaffold(
        body: Center(child: CircularProgressIndicator(key: Key('warmup-ui-waiting'))),
      );
}

/// Выбор зарядки (`/warmup-picker`) — рисунок по модели страницы.
class WarmupPickerScreen extends StatefulWidget {
  const WarmupPickerScreen({super.key});

  @override
  State<WarmupPickerScreen> createState() => _WarmupPickerScreenState();
}

class _WarmupPickerScreenState extends State<WarmupPickerScreen> {
  @override
  void initState() {
    super.initState();
    // Страница могла прислать модель раньше, чем открылся экран, — просим ещё раз.
    unawaited(WarmupUi.act('picker', 'post'));
  }

  Future<void> _help(Map<String, Object?> help) => showDialog<void>(
        context: context,
        builder: (c) => AlertDialog(
          key: const Key('warmup-picker-help'),
          title: Text(_s(help['title']), textAlign: TextAlign.center),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final r in _list(help['rows']))
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(_icon(r['icon']), size: 18, color: _hex(r['tint'])),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(_s(r['name']), style: const TextStyle(fontWeight: FontWeight.w800)),
                              Text(_s(r['desc']), style: Theme.of(c).textTheme.bodySmall),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: 6),
                Text(_s(help['hint']), style: Theme.of(c).textTheme.bodySmall?.copyWith(fontStyle: FontStyle.italic)),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(c).pop(), child: Text(_s(help['gotIt']))),
          ],
        ),
      );

  Widget _chips(Map<String, Object?> card, String field, String action) {
    final tints = card['tint'] is List ? card['tint'] as List : const [];
    final tint = _hex(tints.isNotEmpty ? tints.first : null);
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(top: 7),
      child: Wrap(
        spacing: 6,
        runSpacing: 6,
        children: [
          for (final d in _list(card[field]))
            Semantics(
              selected: d['selected'] == true,
              button: true,
              child: InkWell(
                key: Key('warmup-$field-${card['key']}-${d['value']}'),
                borderRadius: BorderRadius.circular(22),
                onTap: () => WarmupUi.act('picker', action, [card['key'], d['value']]),
                // По ширине надписи: `alignment` растянул бы чип на всю строку (кадр 01.10).
                child: Container(
                  constraints: const BoxConstraints(minHeight: 44),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    color: d['selected'] == true ? tint : Colors.transparent,
                    border: Border.all(color: d['selected'] == true ? tint : scheme.outlineVariant, width: 1.5),
                    borderRadius: BorderRadius.circular(22),
                  ),
                  child: Text(
                    _s(d['label']),
                    style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w800,
                      color: d['selected'] == true ? Colors.white : scheme.onSurface,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _card(Map<String, Object?> c) {
    final scheme = Theme.of(context).colorScheme;
    final tints = c['tint'] is List ? (c['tint'] as List) : const [];
    final tint = _hex(tints.isNotEmpty ? tints[0] : null);
    final noteTint = _hex(tints.length > 1 ? tints[1] : null, tint);
    final on = c['on'] == true;
    final off = c['off'] == true;
    final steps = c['steps'] is List ? [for (final s in c['steps'] as List) '$s'] : const <String>[];
    return Opacity(
      opacity: off ? 0.45 : 1,
      child: Semantics(
        selected: on,
        button: true,
        child: InkWell(
          key: Key('warmup-card-${c['key']}'),
          borderRadius: BorderRadius.circular(16),
          onTap: off ? null : () => WarmupUi.act('picker', 'pick', [c['key']]),
          child: Container(
            padding: const EdgeInsets.all(13),
            decoration: BoxDecoration(
              color: scheme.surfaceContainerLow,
              border: Border.all(color: on ? tint : scheme.outlineVariant, width: on ? 2 : 1),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(color: tint.withValues(alpha: .13), borderRadius: BorderRadius.circular(13)),
                  child: Icon(_icon(c['icon']), color: tint),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(_s(c['title']), style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800)),
                      Text(_s(c['desc']), style: TextStyle(fontSize: 12.5, color: scheme.onSurfaceVariant)),
                      Padding(
                        padding: const EdgeInsets.only(top: 1),
                        child: Text(_s(c['meta']),
                            style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: scheme.onSurfaceVariant)),
                      ),
                      if (c['note'] is String)
                        Padding(
                          padding: const EdgeInsets.only(top: 3),
                          child: Text(_s(c['note']),
                              style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: noteTint)),
                        ),
                      if (c['durs'] is List) _chips(c, 'durs', 'dur'),
                      if (c['ownLens'] is List) _chips(c, 'ownLens', 'ownLen'),
                      if (steps.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 7),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              for (final line in steps)
                                Text(line,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(fontSize: 11.5, color: scheme.onSurfaceVariant)),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
                if (on) Padding(padding: const EdgeInsets.only(left: 6), child: Icon(Icons.check_circle, color: tint)),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _head(Object? h) {
    if (h is! Map) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 18, bottom: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(_s(h['title']), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
          Text(_s(h['note']), style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant)),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<Map<String, Object?>?>(
        valueListenable: WarmupUi.picker,
        builder: (context, m, _) {
          if (m == null) return const _Waiting();
          final scheme = Theme.of(context).colorScheme;
          final start = m['start'] is Map ? Map<String, Object?>.from(m['start'] as Map) : const <String, Object?>{};
          final help = m['help'] is Map ? Map<String, Object?>.from(m['help'] as Map) : const <String, Object?>{};
          final disabled = start['disabled'] == true;
          return PopScope(
            canPop: false,
            // «Назад» — как у страницы (`goBackOrHome`): страница уйдёт, экран снимет оболочка.
            onPopInvokedWithResult: (didPop, _) {
              if (!didPop) unawaited(WarmupUi.act('picker', 'back'));
            },
            child: Scaffold(
              key: const Key('warmup-picker'),
              appBar: AppBar(
                leading: IconButton(
                  tooltip: _s(m['back']),
                  icon: const Icon(Icons.arrow_back),
                  onPressed: () => WarmupUi.act('picker', 'back'),
                ),
                title: Text(_s(m['title']), style: const TextStyle(fontWeight: FontWeight.w800)),
                centerTitle: true,
              ),
              body: Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(24, 0, 24, 10),
                    child: Text(_s(m['hint']),
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 12.5, color: scheme.onSurfaceVariant)),
                  ),
                  Expanded(
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(14, 0, 14, 16),
                      children: [
                        for (final c in _list(m['slots'])) Padding(padding: const EdgeInsets.only(bottom: 10), child: _card(c)),
                        _head(m['seriesHead']),
                        for (final c in _list(m['series'])) Padding(padding: const EdgeInsets.only(bottom: 10), child: _card(c)),
                        _head(m['ownHead']),
                        for (final c in _list(m['own'])) Padding(padding: const EdgeInsets.only(bottom: 10), child: _card(c)),
                      ],
                    ),
                  ),
                  // Нижняя панель — как у страницы: слева справка, справа запуск.
                  SafeArea(
                    top: false,
                    child: Container(
                      padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
                      decoration: BoxDecoration(border: Border(top: BorderSide(color: scheme.outlineVariant))),
                      child: Row(
                        children: [
                          OutlinedButton.icon(
                            key: const Key('warmup-picker-help-btn'),
                            style: OutlinedButton.styleFrom(minimumSize: const Size(0, 48)),
                            onPressed: () => _help(help),
                            icon: const Icon(Icons.help_outline, size: 18),
                            label: Text(_s(help['label'])),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: FilledButton.icon(
                              key: const Key('warmup-picker-start'),
                              style: FilledButton.styleFrom(
                                minimumSize: const Size(0, 48),
                                backgroundColor: _hex(start['tint']),
                                foregroundColor: Colors.white,
                              ),
                              onPressed: disabled ? null : () => WarmupUi.act('picker', 'launch'),
                              icon: const Icon(Icons.play_arrow),
                              label: Text(_s(start['label']), style: const TextStyle(fontWeight: FontWeight.w800)),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      );
}

/// Итог зарядки (`/warmup-complete`) — рисунок по модели страницы.
class WarmupCompleteScreen extends StatefulWidget {
  const WarmupCompleteScreen({super.key});

  @override
  State<WarmupCompleteScreen> createState() => _WarmupCompleteScreenState();
}

class _WarmupCompleteScreenState extends State<WarmupCompleteScreen> {
  bool _breakdownOpen = false;

  @override
  void initState() {
    super.initState();
    unawaited(WarmupUi.act('complete', 'post'));
  }

  Widget _box(Widget child, {Color? border}) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(14),
        border: border == null ? null : Border(left: BorderSide(color: border, width: 4)),
      ),
      child: child,
    );
  }

  List<Widget> _body(Map<String, Object?> m) {
    final scheme = Theme.of(context).colorScheme;
    final hero = m['hero'] is Map ? Map<String, Object?>.from(m['hero'] as Map) : const <String, Object?>{};
    final done = m['completed'] == true;
    final heroColors = done ? const [Color(0xFFFBBF24), Color(0xFFF59E0B)] : const [Color(0xFF94A3B8), Color(0xFF64748B)];
    final onHero = done ? Colors.black : Colors.white;
    final out = <Widget>[
      Container(
        key: const Key('warmup-complete-hero'),
        padding: const EdgeInsets.all(22),
        decoration: BoxDecoration(
          gradient: LinearGradient(colors: heroColors, begin: Alignment.topLeft, end: Alignment.bottomRight),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          children: [
            // Значок, а не эмодзи страницы: символы во Flutter бывают пустыми квадратами.
            Icon(done ? Icons.celebration : Icons.pause_circle_outline, size: 44, color: onHero),
            Text(_s(hero['title']),
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, letterSpacing: 2, color: onHero)),
            Text(_s(hero['sub']), style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: onHero.withValues(alpha: .8))),
            if (hero['personalBest'] is String)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(Icons.emoji_events, size: 16, color: onHero),
                  const SizedBox(width: 6),
                  Text(_s(hero['personalBest']), style: TextStyle(fontWeight: FontWeight.w800, color: onHero)),
                ]),
              ),
          ],
        ),
      ),
      Padding(
        padding: const EdgeInsets.only(left: 4, top: 6),
        child: Text(_s(m['resultsTitle']), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
      ),
      for (final r in _list(m['rows']))
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: scheme.surfaceContainerLow, borderRadius: BorderRadius.circular(10)),
          child: Row(children: [
            Container(width: 4, height: 36, decoration: BoxDecoration(color: _hex(r['color']), borderRadius: BorderRadius.circular(2))),
            const SizedBox(width: 10),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(_s(r['name']), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                Wrap(spacing: 12, children: [
                  if (r['score'] is String)
                    Text(_s(r['score']),
                        style: TextStyle(
                            fontWeight: FontWeight.w700,
                            color: r['negative'] == true ? const Color(0xFFF43F5E) : const Color(0xFF22C55E))),
                  Text(_s(r['time']), style: TextStyle(fontWeight: FontWeight.w700, color: scheme.onSurfaceVariant)),
                  // Ошибки — значком и числом: знак «✗» во Flutter рисуется пустым квадратом (кадр 01.10).
                  if (r['errors'] is num && (r['errors'] as num) > 0)
                    Row(mainAxisSize: MainAxisSize.min, children: [
                      const Icon(Icons.close, size: 14, color: Color(0xFFF43F5E)),
                      Text('${r['errors']}', style: const TextStyle(fontWeight: FontWeight.w700, color: Color(0xFFF43F5E))),
                    ]),
                ]),
              ]),
            ),
            const Icon(Icons.check_circle, color: Color(0xFF22C55E)),
          ]),
        ),
      if (m['skipped'] is String)
        Text(_s(m['skipped']), textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
    ];
    final b = m['breakdown'];
    if (b is Map) {
      out.add(_box(Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        InkWell(
          key: const Key('warmup-complete-breakdown'),
          onTap: () => setState(() => _breakdownOpen = !_breakdownOpen),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 44),
            child: Row(children: [
              Expanded(child: Text(_s(b['title']), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800))),
              Icon(_breakdownOpen ? Icons.expand_less : Icons.expand_more, color: scheme.onSurfaceVariant),
            ]),
          ),
        ),
        Text(_s(b['lead']), style: TextStyle(color: scheme.onSurfaceVariant)),
        if (_breakdownOpen) ...[
          const SizedBox(height: 10),
          for (final r in _list(b['rows']))
            Row(children: [
              Expanded(child: Text(_s(r['skill']), maxLines: 1, overflow: TextOverflow.ellipsis)),
              Text(_s(r['delta']),
                  style: TextStyle(
                      fontWeight: FontWeight.w800,
                      color: r['up'] == true ? const Color(0xFF22C55E) : const Color(0xFFF43F5E))),
            ]),
          for (final h in (b['hints'] is List ? b['hints'] as List : const []))
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text('$h', style: TextStyle(fontSize: 12.5, color: scheme.onSurfaceVariant)),
            ),
        ],
      ])));
    }
    final t = m['total'];
    if (t is Map) {
      out.add(_box(Column(children: [
        Text(_s(t['label']), style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: scheme.onSurfaceVariant)),
        Text(_s(t['value']),
            key: const Key('warmup-complete-total'),
            style: const TextStyle(fontSize: 42, fontWeight: FontWeight.w900, color: Color(0xFFFBBF24))),
        if (t['compare'] is String)
          Text(_s(t['compare']), style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
        if (t['combo'] is String)
          Container(
            margin: const EdgeInsets.only(top: 10),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(color: const Color(0xFFFBBF24), borderRadius: BorderRadius.circular(12)),
            child: Text(_s(t['combo']), style: const TextStyle(color: Colors.black, fontWeight: FontWeight.w800)),
          ),
      ])));
    }
    final s = m['streak'];
    if (s is Map) {
      out.add(Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: [Color(0xFF22C55E), Color(0xFF0D9488)]),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(children: [
          const Icon(Icons.local_fire_department, size: 36, color: Colors.white),
          const SizedBox(width: 14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(_s(s['value']), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Colors.white)),
              Text(_s(s['label']), style: const TextStyle(fontSize: 12, color: Colors.white70)),
            ]),
          ),
        ]),
      ));
    }
    final v = m['verdict'];
    if (v is Map) {
      final tone = v['tone'] == 'up'
          ? const Color(0xFF22C55E)
          : v['tone'] == 'down'
              ? const Color(0xFFF43F5E)
              : const Color(0xFFFBBF24);
      out.add(_box(
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(_s(v['title']),
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 1, color: scheme.onSurfaceVariant)),
          Text(_s(v['msg']), style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
        ]),
        border: tone,
      ));
    }
    final rem = m['reminder'];
    if (rem is Map) {
      out.add(_box(Column(children: [
        if (rem['kind'] == 'ask') const Icon(Icons.notifications_active, size: 32, color: Color(0xFF8B5CF6)),
        Text(_s(rem['title']),
            textAlign: TextAlign.center,
            style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: rem['kind'] == 'done' ? const Color(0xFF22C55E) : null)),
        if (rem['kind'] == 'ask') ...[
          Text(_s(rem['body']), textAlign: TextAlign.center, style: TextStyle(color: scheme.onSurfaceVariant)),
          const SizedBox(height: 8),
          FilledButton.icon(
            key: const Key('warmup-complete-remind'),
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48), backgroundColor: const Color(0xFF8B5CF6)),
            onPressed: () => WarmupUi.act('complete', 'remindEnable'),
            icon: const Icon(Icons.notifications),
            label: Text(_s(rem['enable'])),
          ),
          TextButton(onPressed: () => WarmupUi.act('complete', 'remindLater'), child: Text(_s(rem['later']))),
        ],
      ])));
    }
    return out;
  }

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<Map<String, Object?>?>(
        valueListenable: WarmupUi.complete,
        builder: (context, m, _) {
          if (m == null) return const _Waiting();
          final scheme = Theme.of(context).colorScheme;
          return PopScope(
            canPop: false,
            // Системное «назад» с итога — на главную, как кнопка: назад в сыгранную игру не ведёт.
            onPopInvokedWithResult: (didPop, _) {
              if (!didPop) unawaited(WarmupUi.act('complete', 'home'));
            },
            child: Scaffold(
              key: const Key('warmup-complete'),
              body: SafeArea(
                child: Column(children: [
                  Expanded(
                    child: m['empty'] == true
                        ? Center(child: Text(_s(m['emptyText'])))
                        : ListView(
                            padding: const EdgeInsets.all(20),
                            children: [
                              for (final w in _body(m)) Padding(padding: const EdgeInsets.only(bottom: 12), child: w),
                            ],
                          ),
                  ),
                  // «Ещё раз» и «На главную» — закреплены внизу (отчёты 1e47d75d, fef9d101).
                  Container(
                    key: const Key('warmup-complete-actions'),
                    padding: const EdgeInsets.fromLTRB(20, 10, 20, 10),
                    decoration: BoxDecoration(border: Border(top: BorderSide(color: scheme.outlineVariant))),
                    child: Row(children: [
                      if (m['again'] is String) ...[
                        Expanded(
                          child: FilledButton.icon(
                            key: const Key('warmup-complete-again'),
                            style: FilledButton.styleFrom(
                              minimumSize: const Size(0, 48),
                              backgroundColor: const Color(0xFFFBBF24),
                              foregroundColor: Colors.black,
                            ),
                            onPressed: () => WarmupUi.act('complete', 'again'),
                            icon: const Icon(Icons.refresh),
                            label: Text(_s(m['again']), style: const TextStyle(fontWeight: FontWeight.w800)),
                          ),
                        ),
                        const SizedBox(width: 10),
                      ],
                      Expanded(
                        child: OutlinedButton(
                          key: const Key('warmup-complete-home'),
                          style: OutlinedButton.styleFrom(minimumSize: const Size(0, 48)),
                          onPressed: () => WarmupUi.act('complete', 'home'),
                          child: Text(_s(m['home']), style: const TextStyle(fontWeight: FontWeight.w800)),
                        ),
                      ),
                    ]),
                  ),
                ]),
              ),
            ),
          );
        },
      );
}

/// Значки игр — та же карта, что у развилок (`assets/game_icons/index.json`, #90).
class _GameIcons {
  static Map<String, dynamic>? _index;

  static Future<Map<String, dynamic>> load() async {
    final have = _index;
    if (have != null) return have;
    try {
      // Байтами, как развилки: `loadString` от 50 КБ уходит в compute и вешает пробы.
      final b = await rootBundle.load('assets/game_icons/index.json');
      return _index = jsonDecode(utf8.decode(b.buffer.asUint8List(b.offsetInBytes, b.lengthInBytes))) as Map<String, dynamic>;
    } catch (_) {
      return _index = const {};
    }
  }

  static String? file(Map<String, dynamic> index, Object? nameKey, Object? route) =>
      ((index['byNameKey'] as Map?)?[nameKey] ?? (index['byRoute'] as Map?)?[route]) as String?;
}

/// Веб-мост зарядки (`/warmup-bridge`) — рисунок по модели страницы.
///
/// Между двумя нативными шагами мост свой (`warmup_step_bridge.dart`, #98); этот —
/// там, где ведёт страница: перед непереехавшей игрой и когда время зарядки вышло
/// («доиграть / закончить»). Отсчёт, «взвод» кнопок через 800 мс и сам переход к
/// игре — у страницы; здесь только рисунок и нажатия.
class WarmupBridgeScreen extends StatefulWidget {
  const WarmupBridgeScreen({super.key});

  @override
  State<WarmupBridgeScreen> createState() => _WarmupBridgeScreenState();
}

class _WarmupBridgeScreenState extends State<WarmupBridgeScreen> {
  Map<String, dynamic> _icons = const {};

  @override
  void initState() {
    super.initState();
    unawaited(WarmupUi.act('bridge', 'post'));
    unawaited(_GameIcons.load().then((i) {
      if (mounted) setState(() => _icons = i);
    }));
  }

  Widget _done(Map<String, Object?> d) {
    final scheme = Theme.of(context).colorScheme;
    final skipped = d['skipped'] == true;
    return Container(
      key: const Key('warmup-bridge-web-done'),
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: scheme.surfaceContainerLow, borderRadius: BorderRadius.circular(14)),
      child: Column(children: [
        Text(_s(d['label']).toUpperCase(),
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 1.2, color: scheme.onSurfaceVariant)),
        const SizedBox(height: 6),
        Icon(skipped ? Icons.skip_next : Icons.check_circle,
            size: 48, color: skipped ? scheme.onSurfaceVariant : const Color(0xFF22C55E)),
        Text(_s(d['title']), textAlign: TextAlign.center, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
        Wrap(spacing: 12, children: [
          if (d['score'] is String)
            Text(_s(d['score']),
                style: TextStyle(
                    fontWeight: FontWeight.w700,
                    color: d['negative'] == true ? const Color(0xFFF43F5E) : const Color(0xFF22C55E))),
          if (d['time'] is String)
            Text(_s(d['time']), style: TextStyle(fontWeight: FontWeight.w700, color: scheme.onSurfaceVariant)),
          if (d['errors'] is num)
            Row(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.close, size: 14, color: Color(0xFFF43F5E)),
              Text('${d['errors']}', style: const TextStyle(fontWeight: FontWeight.w700, color: Color(0xFFF43F5E))),
            ]),
        ]),
      ]),
    );
  }

  Widget _next(Map<String, Object?> n) {
    final g = n['gradient'] is List ? [for (final c in n['gradient'] as List) _hex(c)] : const <Color>[];
    final colors = g.length >= 2 ? g.sublist(0, 2) : const [Color(0xFF6366F1), Color(0xFF8B5CF6)];
    final file = _GameIcons.file(_icons, n['nameKey'], n['route']);
    return Container(
      key: const Key('warmup-bridge-web-next'),
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: colors, begin: Alignment.topLeft, end: Alignment.bottomRight),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(children: [
        Text(_s(n['label']),
            style: const TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 2)),
        const SizedBox(height: 8),
        if (file != null)
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Image.asset('assets/game_icons/$file', width: 64, height: 64, fit: BoxFit.cover),
          )
        else
          const Icon(Icons.sports_esports, size: 56, color: Colors.white),
        const SizedBox(height: 8),
        Text(_s(n['title']),
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800)),
        Text(_s(n['skill']), style: const TextStyle(color: Colors.white70, fontSize: 13)),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<Map<String, Object?>?>(
        valueListenable: WarmupUi.bridge,
        builder: (context, m, _) {
          if (m == null) return const _Waiting();
          final scheme = Theme.of(context).colorScheme;
          final evening = m['evening'] == true;
          final accent = evening ? const Color(0xFF818CF8) : const Color(0xFFFBBF24);
          final progress = m['progress'] is num ? (m['progress'] as num).toDouble().clamp(0.0, 1.0) : 0.0;
          final ask = m['ask'];
          return PopScope(
            canPop: false,
            // Системное «назад» не уводит молча: тот же вопрос, что у «Остановить».
            onPopInvokedWithResult: (didPop, _) {
              if (!didPop) unawaited(WarmupUi.act('bridge', 'stopAsk'));
            },
            child: Scaffold(
              key: const Key('warmup-bridge-web'),
              body: SafeArea(
                child: Column(children: [
                  Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(children: [
                      Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                        Icon(evening ? Icons.nightlight_round : Icons.bolt, size: 16, color: accent),
                        const SizedBox(width: 4),
                        Text(_s(m['hud']), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: accent)),
                      ]),
                      const SizedBox(height: 8),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(2),
                        child: LinearProgressIndicator(
                          value: progress,
                          minHeight: 4,
                          color: accent,
                          backgroundColor: scheme.surfaceContainerHighest,
                        ),
                      ),
                    ]),
                  ),
                  Expanded(
                    child: Center(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.all(20),
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 520),
                          child: Column(children: [
                            if (m['done'] is Map) _done(Map<String, Object?>.from(m['done'] as Map)),
                            const SizedBox(height: 18),
                            if (m['next'] is Map) _next(Map<String, Object?>.from(m['next'] as Map)),
                            const SizedBox(height: 18),
                            Text(ask is Map ? _s(ask['text']) : _s(m['countdown']),
                                key: const Key('warmup-bridge-web-countdown'),
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w700,
                                    color: ask is Map ? scheme.onSurface : accent)),
                            const SizedBox(height: 12),
                            if (ask is Map) ...[
                              // Безопасный ответ первым и залитым — как в вопросе о выходе из игры.
                              FilledButton(
                                key: const Key('warmup-bridge-web-keep'),
                                style: FilledButton.styleFrom(
                                  minimumSize: const Size(double.infinity, 52),
                                  backgroundColor: const Color(0xFFFBBF24),
                                  foregroundColor: Colors.black,
                                ),
                                onPressed: () => WarmupUi.act('bridge', 'keep'),
                                child: Text(_s(ask['keep']), style: const TextStyle(fontWeight: FontWeight.w900)),
                              ),
                              const SizedBox(height: 12),
                              OutlinedButton.icon(
                                key: const Key('warmup-bridge-web-stop-yes'),
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: const Color(0xFFF43F5E),
                                  side: const BorderSide(color: Color(0xFFF43F5E)),
                                  minimumSize: const Size(0, 48),
                                ),
                                onPressed: () => WarmupUi.act('bridge', 'stopConfirm'),
                                icon: const Icon(Icons.stop),
                                label: Text(_s(ask['stop'])),
                              ),
                            ] else ...[
                              FilledButton(
                                key: const Key('warmup-bridge-web-start'),
                                style: FilledButton.styleFrom(
                                  minimumSize: const Size(double.infinity, 52),
                                  backgroundColor: const Color(0xFFFBBF24),
                                  foregroundColor: Colors.black,
                                ),
                                onPressed: () => WarmupUi.act('bridge', 'start'),
                                child: Text(_s(m['primary']), style: const TextStyle(fontWeight: FontWeight.w900)),
                              ),
                              const SizedBox(height: 12),
                              // Ряд не шире экрана: «Пропустить: <имя>» сжимается, «Остановить» — нет.
                              Row(children: [
                                Expanded(
                                  child: OutlinedButton.icon(
                                    key: const Key('warmup-bridge-web-skip'),
                                    style: OutlinedButton.styleFrom(minimumSize: const Size(0, 48)),
                                    onPressed: () => WarmupUi.act('bridge', 'skip'),
                                    icon: const Icon(Icons.skip_next, size: 18),
                                    label: Text(_s(m['skip']), maxLines: 2, overflow: TextOverflow.ellipsis),
                                  ),
                                ),
                                const SizedBox(width: 12),
                                OutlinedButton.icon(
                                  key: const Key('warmup-bridge-web-stop'),
                                  style: OutlinedButton.styleFrom(
                                    foregroundColor: const Color(0xFFF43F5E),
                                    side: const BorderSide(color: Color(0xFFF43F5E)),
                                    minimumSize: const Size(0, 48),
                                  ),
                                  onPressed: () => WarmupUi.act('bridge', 'stopAsk'),
                                  icon: const Icon(Icons.stop, size: 18),
                                  label: Text(_s(m['stop'])),
                                ),
                              ]),
                            ],
                          ]),
                        ),
                      ),
                    ),
                  ),
                ]),
              ),
            ),
          );
        },
      );
}
